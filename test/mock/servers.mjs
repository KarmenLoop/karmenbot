import crypto from "node:crypto";
import http from "node:http";

// Local stand-ins for platform and model APIs. Everything binds to 127.0.0.1.

export async function httpServer(handler) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", async () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body = raw;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        if ((req.headers["content-type"] || "").includes("form")) body = Object.fromEntries(new URLSearchParams(raw));
      }
      const url = new URL(req.url, "http://127.0.0.1");
      const entry = { method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers: req.headers, body, raw };
      requests.push(entry);
      try {
        const reply = await handler(entry, res);
        if (reply === undefined || res.writableEnded) return;
        // { status: <number>, json } sets the HTTP status; any other object is the JSON body itself.
        const wrapped = reply && typeof reply.status === "number" && "json" in reply;
        res.writeHead(wrapped ? reply.status : 200, { "content-type": "application/json" }).end(JSON.stringify(wrapped ? reply.json : reply));
      } catch (error) {
        res.writeHead(500).end(String(error));
      }
    });
  });
  // Upgraded sockets leave the HTTP server's bookkeeping, so track them here.
  const upgraded = new Set();
  server.on("upgrade", (req, socket) => {
    upgraded.add(socket);
    socket.on("close", () => upgraded.delete(socket));
    server.emit("ws", req, socket);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}`,
    port,
    requests,
    server,
    close: () => new Promise((resolve) => {
      for (const socket of upgraded) socket.destroy();
      server.closeAllConnections?.();
      server.close(resolve);
    }),
  };
}

// Minimal RFC 6455 server side: handshake, masked client frames, text and binary.
export function acceptWebSocket(server, onConnection) {
  server.server.on("ws", (req, socket) => {
    const key = req.headers["sec-websocket-key"];
    const accept = crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const received = [];
    const listeners = [];
    let buffer = Buffer.alloc(0);
    let closed = false;
    const frame = (opcode, payload) => {
      const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
      let header;
      if (data.length < 126) header = Buffer.from([0x80 | opcode, data.length]);
      else if (data.length < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x80 | opcode;
        header[1] = 126;
        header.writeUInt16BE(data.length, 2);
      } else {
        header = Buffer.alloc(10);
        header[0] = 0x80 | opcode;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(data.length), 2);
      }
      if (!closed) socket.write(Buffer.concat([header, data]));
    };
    const conn = {
      received,
      sendText: (value) => frame(0x1, typeof value === "string" ? value : JSON.stringify(value)),
      sendBinary: (bytes) => frame(0x2, Buffer.from(bytes)),
      close(code = 1000) {
        const payload = Buffer.alloc(2);
        payload.writeUInt16BE(code);
        frame(0x8, payload);
        closed = true;
        socket.end();
      },
      next(predicate = () => true, timeout = 3000) {
        const found = received.find(predicate);
        if (found) return Promise.resolve(found);
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("no matching websocket message")), timeout);
          listeners.push((message) => {
            if (!predicate(message)) return false;
            clearTimeout(timer);
            resolve(message);
            return true;
          });
        });
      },
    };
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        if (buffer.length < 2) return;
        const opcode = buffer[0] & 0x0f;
        let length = buffer[1] & 0x7f;
        let offset = 2;
        if (length === 126) {
          if (buffer.length < 4) return;
          length = buffer.readUInt16BE(2);
          offset = 4;
        } else if (length === 127) {
          if (buffer.length < 10) return;
          length = Number(buffer.readBigUInt64BE(2));
          offset = 10;
        }
        const masked = (buffer[1] & 0x80) !== 0;
        const total = offset + (masked ? 4 : 0) + length;
        if (buffer.length < total) return;
        const mask = masked ? buffer.subarray(offset, offset + 4) : null;
        const payload = Buffer.from(buffer.subarray(offset + (masked ? 4 : 0), total));
        if (mask) for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
        buffer = buffer.subarray(total);
        if (opcode === 0x8) {
          if (!closed) {
            closed = true;
            socket.end();
          }
          return;
        }
        if (opcode === 0x9) {
          frame(0xa, payload);
          continue;
        }
        const message = opcode === 0x1 ? { text: payload.toString("utf8"), json: (() => { try { return JSON.parse(payload.toString("utf8")); } catch { return null; } })() } : { binary: new Uint8Array(payload) };
        received.push(message);
        for (let i = listeners.length - 1; i >= 0; i -= 1) if (listeners[i](message)) listeners.splice(i, 1);
      }
    });
    socket.on("error", () => {});
    onConnection(conn, req);
  });
}

// OpenAI-compatible chat completions. `script(request)` returns { text, toolCalls, delay }.
export async function openAiServer(script) {
  return httpServer(async (req, res) => {
    if (req.path.endsWith("/chat/completions")) {
      const { text = "", toolCalls = [], delay = 0, usage = { prompt_tokens: 10, completion_tokens: 5 } } = await script(req.body, req);
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (!req.body.stream) {
        return { choices: [{ message: { role: "assistant", content: text, tool_calls: toolCalls.map((call, i) => ({ id: call.id || `call_${i}`, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } })) }, finish_reason: "stop" }], usage };
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      const send = (value) => res.write(`data: ${JSON.stringify(value)}\n\n`);
      for (const piece of text.match(/[\s\S]{1,8}/g) || []) send({ choices: [{ index: 0, delta: { content: piece } }] });
      toolCalls.forEach((call, i) => send({ choices: [{ index: 0, delta: { tool_calls: [{ index: i, id: call.id || `call_${i}`, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } }] } }] }));
      send({ choices: [{ index: 0, delta: {}, finish_reason: toolCalls.length ? "tool_calls" : "stop" }], usage });
      res.end("data: [DONE]\n\n");
      return undefined;
    }
    return { status: 404, json: { error: "not found" } };
  });
}
