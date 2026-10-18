import crypto from "node:crypto";
import http from "node:http";
import { PlatformError, requestJson } from "../net.mjs";

// WhatsApp Business Cloud API. Meta delivers messages to a webhook, so this
// needs a public HTTPS URL (a tunnel to the local port works). Personal
// WhatsApp (WhatsApp Web) needs the Baileys stack and is not supported here.
export function createWhatsapp({ settings = {}, secrets = {}, fetchImpl = globalThis.fetch }) {
  const graph = (settings.graphBase || "https://graph.facebook.com").replace(/\/+$/, "");
  const version = settings.apiVersion || "v20.0";
  const port = Number(settings.port || 8787);
  const host = settings.host || "127.0.0.1";
  const route = settings.path || "/whatsapp/webhook";
  let server = null;

  function verifySignature(raw, header) {
    if (!secrets.appSecret) return true;
    const expected = `sha256=${crypto.createHmac("sha256", secrets.appSecret).update(raw).digest("hex")}`;
    const given = String(header || "");
    return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  }

  return {
    name: "whatsapp",
    limit: 4096,
    get port() {
      return server?.address()?.port || port;
    },
    async start({ signal, onMessage, log }) {
      if (!secrets.accessToken || !secrets.phoneNumberId || !secrets.verifyToken) throw new PlatformError("WhatsApp access token, phone number ID and verify token are required", { fatal: true });
      server = http.createServer((req, res) => {
        const url = new URL(req.url, "http://local");
        if (url.pathname !== route) {
          res.writeHead(404).end();
          return;
        }
        if (req.method === "GET") {
          const token = url.searchParams.get("hub.verify_token") || "";
          const ok = url.searchParams.get("hub.mode") === "subscribe" && token.length === secrets.verifyToken.length
            && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secrets.verifyToken));
          res.writeHead(ok ? 200 : 403, { "content-type": "text/plain" }).end(ok ? url.searchParams.get("hub.challenge") || "" : "forbidden");
          return;
        }
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => {
          const raw = Buffer.concat(chunks);
          if (!verifySignature(raw, req.headers["x-hub-signature-256"])) {
            res.writeHead(401).end();
            return;
          }
          res.writeHead(200).end("ok");
          let body;
          try {
            body = JSON.parse(raw.toString("utf8"));
          } catch {
            return;
          }
          if (body.object !== "whatsapp_business_account") return;
          for (const entry of body.entry || []) {
            for (const change of entry.changes || []) {
              if (change.field !== "messages") continue;
              const names = Object.fromEntries((change.value?.contacts || []).map((contact) => [contact.wa_id, contact.profile?.name || ""]));
              for (const message of change.value?.messages || []) {
                if (message.type !== "text") continue;
                onMessage({ chatId: message.from, userId: message.from, userName: names[message.from] || "", text: message.text?.body || "", isGroup: false, mentioned: true, messageId: message.id, reply: {} });
              }
            }
          }
        });
      });
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, resolve);
      });
      log("info", `webhook listening on http://${host}:${server.address().port}${route}`);
      await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
      await new Promise((resolve) => server.close(resolve));
    },
    async send(chatId, text) {
      await requestJson(fetchImpl, `${graph}/${version}/${secrets.phoneNumberId}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${secrets.accessToken}` },
        body: { messaging_product: "whatsapp", recipient_type: "individual", to: chatId, type: "text", text: { body: text, preview_url: false } },
      });
    },
    async stop() {},
  };
}
