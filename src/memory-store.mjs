import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { karmenHome } from "./home.mjs";

function fileFor(workspace, session, env) {
  const id = crypto.createHash("sha256").update(path.resolve(workspace)).digest("hex").slice(0, 16);
  return path.join(karmenHome(env), "memory", id, `${session || "default"}.json`);
}

function empty() {
  return { messages: [], notes: [] };
}

export function openMemory(workspace, env, session = "default") {
  const file = fileFor(workspace, session, env);
  const read = () => {
    try {
      const value = JSON.parse(fs.readFileSync(file, "utf8"));
      return value && typeof value === "object" ? { messages: value.messages || [], notes: value.notes || [] } : empty();
    } catch {
      return empty();
    }
  };
  const write = (data) => {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  };
  return { file, session, read, write };
}
