import { addFact, listFacts, removeFact, searchFacts, clearProfile } from "./profile.mjs";
import { appendJournal, searchJournal, clearJournal, listJournalDays } from "./journal.mjs";
import { loadConfig } from "../home.mjs";

/**
 * Thin mem0-shaped client. Default backend is local (keyword over profile + journal).
 * Remote mem0 is OFF by default and refuses unless config.memory.remote === true
 * and a baseUrl is set — we do not vendor or depend on the mem0 npm package.
 *
 * API shape inspired by mem0 (Apache-2.0); local implementation only.
 */
export function memoryConfig(env = process.env) {
  const raw = loadConfig(env).memory || {};
  return {
    backend: raw.backend === "mem0" ? "mem0" : "local",
    remote: raw.remote === true,
    remoteBaseUrl: typeof raw.remoteBaseUrl === "string" ? raw.remoteBaseUrl : "",
    injectTopK: Number.isFinite(raw.injectTopK) ? Math.max(1, Math.min(20, raw.injectTopK)) : 6,
    enabled: raw.enabled !== false,
  };
}

export function createMem0Client({ env = process.env } = {}) {
  const cfg = () => memoryConfig(env);

  async function ensureLocal() {
    const conf = cfg();
    if (conf.backend === "mem0" && conf.remote) {
      if (!conf.remoteBaseUrl) {
        throw Object.assign(new Error("memory.remote is on but memory.remoteBaseUrl is empty"), { code: "MEMORY_REMOTE_UNCONFIGURED" });
      }
      throw Object.assign(new Error("Remote mem0 backend is not enabled in this build; set memory.remote=false or use local"), { code: "MEMORY_REMOTE_DISABLED" });
    }
  }

  return {
    get config() {
      return cfg();
    },

    async add(text, { layer = "profile", key = null, tags = [] } = {}) {
      await ensureLocal();
      if (layer === "journal") return { layer: "journal", entry: appendJournal(text, env, { tags }) };
      return { layer: "profile", fact: addFact(text, env, { key }) };
    },

    async search(query, { limit } = {}) {
      await ensureLocal();
      const top = limit || cfg().injectTopK;
      const facts = searchFacts(query, env, { limit: top }).map((fact) => ({
        id: fact.id,
        layer: "profile",
        text: fact.text,
        key: fact.key,
        at: fact.at,
        score: 1,
      }));
      const journal = searchJournal(query, env, { limit: top }).map((entry) => ({
        id: entry.id,
        layer: "journal",
        text: entry.text,
        day: entry.day,
        at: entry.at,
        score: entry.score,
      }));
      return [...facts, ...journal]
        .sort((a, b) => (b.score - a.score) || (b.at - a.at))
        .slice(0, top);
    },

    async update(id, text, { layer = "profile" } = {}) {
      await ensureLocal();
      if (layer !== "profile") throw Object.assign(new Error("only profile facts support update"), { code: "MEMORY_UPDATE_LAYER" });
      if (!removeFact(id, env)) throw Object.assign(new Error("fact not found"), { code: "MEMORY_NOT_FOUND" });
      return addFact(text, env);
    },

    async list({ layer = "all" } = {}) {
      await ensureLocal();
      if (layer === "profile") return listFacts(env).map((fact) => ({ ...fact, layer: "profile" }));
      if (layer === "journal") {
        const days = listJournalDays(env).slice(-14);
        const { readJournalDay } = await import("./journal.mjs");
        return days.flatMap((day) => readJournalDay(day, env).map((entry) => ({ ...entry, day, layer: "journal" })));
      }
      return this.list({ layer: "profile" });
    },

    async clear({ layer = "all" } = {}) {
      await ensureLocal();
      if (layer === "profile" || layer === "all") clearProfile(env);
      if (layer === "journal" || layer === "all") clearJournal(env);
    },
  };
}
