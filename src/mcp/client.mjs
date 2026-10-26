import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { KarmenError } from "../errors.mjs";

const PROTOCOL_VERSION = "2024-11-05";
const DEFAULT_TIMEOUT_MS = 60_000;

function frameMessage(obj) {
  const body = Buffer.from(JSON.stringify(obj), "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8"), body]);
}

/**
 * Minimal MCP stdio JSON-RPC client (Content-Length framing).
 * Public Path B sidecar — does not touch the Koder kernel.
 */
export class McpClient extends EventEmitter {
  #child = null;
  #buffer = Buffer.alloc(0);
  #nextId = 1;
  #pending = new Map();
  #tools = [];
  #closed = false;
  #stderr = "";

  constructor({ id, command, args = [], env = {}, cwd, timeoutMs = DEFAULT_TIMEOUT_MS, spawnImpl = spawn } = {}) {
    super();
    this.id = id || "mcp";
    this.command = command;
    this.args = args;
    this.env = env;
    this.cwd = cwd;
    this.timeoutMs = timeoutMs;
    this.spawnImpl = spawnImpl;
  }

  get tools() {
    return this.#tools;
  }

  get running() {
    return Boolean(this.#child && !this.#closed);
  }

  async start() {
    if (this.#child) return this;
    if (!this.command) throw new KarmenError("mcp.noCommand", { id: this.id });
    this.#closed = false;
    this.#stderr = "";
    this.#child = this.spawnImpl(this.command, this.args, {
      cwd: this.cwd,
      env: { ...process.env, ...this.env },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.#child.on("error", (error) => {
      this.emit("error", error);
      this.#failAll(error);
    });
    this.#child.on("exit", (code, signal) => {
      this.#closed = true;
      const err = new Error(`MCP server ${this.id} exited (code=${code}, signal=${signal})${this.#stderr ? `: ${this.#stderr.trim().slice(0, 400)}` : ""}`);
      this.#failAll(err);
      this.emit("exit", { code, signal });
      this.#child = null;
    });
    this.#child.stdout.on("data", (chunk) => this.#onData(chunk));
    this.#child.stderr.on("data", (chunk) => {
      this.#stderr += chunk.toString();
      if (this.#stderr.length > 8_000) this.#stderr = this.#stderr.slice(-4_000);
    });

    await this.#request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "karmenbot", version: "0.1.1" },
    });
    await this.#notify("notifications/initialized", {});
    await this.refreshTools();
    return this;
  }

  async refreshTools() {
    const result = await this.#request("tools/list", {});
    this.#tools = Array.isArray(result?.tools) ? result.tools : [];
    return this.#tools;
  }

  async listTools() {
    if (!this.running) await this.start();
    return this.refreshTools();
  }

  async callTool(name, args = {}, { timeoutMs } = {}) {
    if (!this.running) await this.start();
    return this.#request("tools/call", { name, arguments: args ?? {} }, timeoutMs);
  }

  async dispose() {
    this.#closed = true;
    for (const [, pending] of this.#pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`MCP server ${this.id} disposed`));
    }
    this.#pending.clear();
    const child = this.#child;
    this.#child = null;
    if (!child) return;
    try {
      child.stdin?.end();
    } catch { /* ignore */ }
    const soft = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    const timed = new Promise((resolve) => setTimeout(resolve, 1500));
    await Promise.race([soft, timed]);
    if (!child.killed) {
      try {
        child.kill("SIGKILL");
      } catch { /* ignore */ }
    }
  }

  #failAll(error) {
    for (const [, pending] of this.#pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  #onData(chunk) {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    while (true) {
      const headerEnd = this.#buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) {
        // Also accept newline-delimited JSON (some servers).
        const nl = this.#buffer.indexOf("\n");
        if (nl < 0) return;
        const line = this.#buffer.slice(0, nl).toString("utf8").trim();
        this.#buffer = this.#buffer.slice(nl + 1);
        if (!line || line.startsWith("Content-Length:")) continue;
        try {
          this.#handleMessage(JSON.parse(line));
        } catch {
          /* ignore partial */
        }
        continue;
      }
      const header = this.#buffer.slice(0, headerEnd).toString("utf8");
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        this.#buffer = this.#buffer.slice(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      const total = headerEnd + 4 + length;
      if (this.#buffer.length < total) return;
      const body = this.#buffer.slice(headerEnd + 4, total).toString("utf8");
      this.#buffer = this.#buffer.slice(total);
      try {
        this.#handleMessage(JSON.parse(body));
      } catch (error) {
        this.emit("error", error);
      }
    }
  }

  #handleMessage(message) {
    if (message.id !== undefined && this.#pending.has(message.id)) {
      const pending = this.#pending.get(message.id);
      this.#pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        pending.reject(Object.assign(new Error(message.error.message || "MCP error"), { code: message.error.code, data: message.error.data }));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (message.method) this.emit("notification", message);
  }

  #request(method, params, timeoutMs = this.timeoutMs) {
    if (!this.#child?.stdin) return Promise.reject(new Error(`MCP server ${this.id} is not running`));
    const id = this.#nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`MCP ${method} timed out after ${timeoutMs}ms (${this.id})`));
      }, timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      try {
        this.#child.stdin.write(frameMessage(payload));
      } catch (error) {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(error);
      }
    });
  }

  async #notify(method, params) {
    if (!this.#child?.stdin) return;
    const payload = { jsonrpc: "2.0", method, params };
    this.#child.stdin.write(frameMessage(payload));
  }
}

/** Test helper: in-memory fake that speaks the same call surface. */
export function createMockClient({ id = "mock", tools = [], callImpl } = {}) {
  const state = { tools: tools.slice(), calls: [] };
  return {
    id,
    get tools() {
      return state.tools;
    },
    get running() {
      return true;
    },
    async start() {
      return this;
    },
    async listTools() {
      return state.tools;
    },
    async refreshTools() {
      return state.tools;
    },
    async callTool(name, args = {}) {
      state.calls.push({ name, args });
      if (callImpl) return callImpl(name, args);
      return { content: [{ type: "text", text: `ok:${name}` }] };
    },
    async dispose() {},
    _state: state,
  };
}
