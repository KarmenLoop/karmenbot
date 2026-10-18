// Small network helpers shared by the platform adapters: Node 22's global
// fetch and WebSocket only.

export const BACKOFF_MS = [2000, 5000, 10000, 30000, 60000];

export function backoff(attempt) {
  return BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
}

export function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export class PlatformError extends Error {
  constructor(message, { status = 0, code = "", fatal = false } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fatal = fatal;
  }
}

// With `anyStatus`, an error status still returns its JSON body (OAuth device
// flows answer "authorization_pending" with HTTP 400).
export async function requestJson(fetchImpl, url, { method = "GET", headers = {}, body, form, timeoutMs = 20000, signal, anyStatus = false } = {}) {
  const limit = AbortSignal.timeout(timeoutMs);
  const init = { method, headers: { ...headers }, signal: signal ? AbortSignal.any([signal, limit]) : limit };
  if (form) {
    init.headers["content-type"] = "application/x-www-form-urlencoded";
    init.body = new URLSearchParams(form).toString();
  } else if (body !== undefined) {
    init.headers["content-type"] ??= "application/json";
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  const response = await fetchImpl(url, init);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = null;
  }
  if (!response.ok && !(anyStatus && json)) throw new PlatformError(`HTTP ${response.status} ${new URL(url).pathname}`, { status: response.status, fatal: response.status === 401 || response.status === 403 });
  if (json === null) throw new PlatformError(`invalid JSON from ${new URL(url).pathname}`);
  return json;
}

// Resolves once open; messages arrive through onMessage. Binary frames come as
// Uint8Array. Messages and the close event are delivered after the caller's
// own `.then` on the returned promise has run, so a server that talks right
// after the handshake never meets an adapter without its connection object.
export function openSocket(url, { WebSocketImpl = globalThis.WebSocket, timeoutMs = 20000, onMessage, onClose, onError } = {}) {
  let ready;
  const opened = new Promise((resolve, reject) => {
    const socket = new WebSocketImpl(url);
    socket.binaryType = "arraybuffer";
    const timer = setTimeout(() => {
      socket.close();
      reject(new PlatformError("websocket connect timeout"));
    }, timeoutMs);
    let tail = Promise.resolve();
    const later = (fn) => {
      tail = tail.then(() => ready).then(fn, () => {});
    };
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      resolve({
        socket,
        send(data) {
          socket.send(typeof data === "string" || data instanceof Uint8Array ? data : JSON.stringify(data));
        },
        close(code = 1000) {
          try {
            socket.close(code);
          } catch {
            // Already closed.
          }
        },
      });
    }, { once: true });
    // A handler that throws drops this connection; the reconnect loop takes over.
    socket.addEventListener("message", (event) => {
      const data = typeof event.data === "string" ? event.data : new Uint8Array(event.data);
      later(() => {
        try {
          onMessage?.(data);
        } catch (error) {
          onError?.(error);
          socket.close(1011);
        }
      });
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new PlatformError("websocket error"));
    }, { once: true });
    socket.addEventListener("close", (event) => {
      clearTimeout(timer);
      later(() => onClose?.(event.code, event.reason));
    }, { once: true });
  });
  ready = opened.then(() => new Promise((resolve) => setImmediate(resolve)));
  return opened;
}

// Run `connect` until stopped, waiting between attempts; `connect` resolves
// when its connection ends. A fatal error (bad credentials) stops the loop.
export async function keepAlive(connect, { signal, log = () => {} }) {
  let attempt = 0;
  while (!signal.aborted) {
    const started = Date.now();
    try {
      await connect();
    } catch (error) {
      if (error?.fatal) {
        log("error", error.message);
        throw error;
      }
      log("warn", error?.message || String(error));
    }
    if (signal.aborted) return;
    if (Date.now() - started > 60_000) attempt = 0;
    await sleep(backoff(attempt), signal);
    attempt += 1;
  }
}
