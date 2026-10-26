import { KarmenError } from "../errors.mjs";
import { loadSecrets, saveSecret, secretsFile } from "../home.mjs";
import { createPrompter } from "../prompt.mjs";

/** Groups we expose in the vault CLI (never print raw secret values). */
export const VAULT_GROUPS = ["models", "platforms", "mcp", "voice"];

export function listVaultKeys(env = process.env) {
  const all = loadSecrets(env);
  const keys = [];
  for (const group of VAULT_GROUPS) {
    const bucket = all[group];
    if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) continue;
    for (const id of Object.keys(bucket)) {
      const value = bucket[id];
      if (value === undefined || value === null) continue;
      if (typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length) continue;
      keys.push(`${group}.${id}`);
    }
  }
  return keys.sort();
}

export function hasVaultKey(group, id, env = process.env) {
  if (!VAULT_GROUPS.includes(group)) return false;
  const bucket = loadSecrets(env)[group];
  if (!bucket || typeof bucket !== "object") return false;
  if (!Object.prototype.hasOwnProperty.call(bucket, id)) return false;
  const value = bucket[id];
  if (value === undefined || value === null) return false;
  if (typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length) return false;
  return true;
}

export function unsetVaultKey(group, id, env = process.env) {
  if (!VAULT_GROUPS.includes(group)) return false;
  if (!hasVaultKey(group, id, env)) return false;
  saveSecret(group, id, null, env);
  return true;
}

const pick = (ctx, zh, en) => (ctx.t.lang === "en" ? en : zh);

export async function run(ctx) {
  const [action = "list", group, id] = ctx.args;
  const en = ctx.t.lang === "en";

  if (action === "list" || action === "ls") {
    const keys = listVaultKeys(ctx.env);
    if (!keys.length) {
      ctx.stdout.write(`${pick(ctx, "密钥库为空。用 karmenbot setup / connect 写入；从不打印明文。", "Vault is empty. Write keys via setup / connect; values are never printed.")}\n`);
      return 0;
    }
    ctx.stdout.write(`${pick(ctx, `密钥条目（仅名称，文件 ${secretsFile(ctx.env)}）：`, `Vault keys (names only; file ${secretsFile(ctx.env)}):`)}\n`);
    for (const key of keys) ctx.stdout.write(`  ${key}\n`);
    return 0;
  }

  if (action === "has") {
    if (!group || !id) throw new KarmenError("err.failed", { message: en ? "Usage: vault has <group> <id>" : "用法：vault has <分组> <id>" });
    if (!VAULT_GROUPS.includes(group)) {
      ctx.stdout.write(`${pick(ctx, `未知分组：${group}（可用 ${VAULT_GROUPS.join(", ")}）`, `Unknown group: ${group} (use ${VAULT_GROUPS.join(", ")})`)}\n`);
      return 1;
    }
    const ok = hasVaultKey(group, id, ctx.env);
    ctx.stdout.write(`${group}.${id} ${ok ? (en ? "set" : "已配置") : (en ? "unset" : "未配置")}\n`);
    return ok ? 0 : 1;
  }

  if (action === "unset" || action === "remove" || action === "rm") {
    if (!group || !id) throw new KarmenError("err.failed", { message: en ? "Usage: vault unset <group> <id> [--yes]" : "用法：vault unset <分组> <id> [--yes]" });
    if (!VAULT_GROUPS.includes(group)) throw new KarmenError("err.failed", { message: en ? `Unknown group: ${group}` : `未知分组：${group}` });
    if (!hasVaultKey(group, id, ctx.env)) {
      ctx.stdout.write(`${pick(ctx, `没有 ${group}.${id}`, `No ${group}.${id}`)}\n`);
      return 1;
    }
    let ok = Boolean(ctx.opts.yes);
    if (!ok) {
      if (!ctx.stdin.isTTY && !(ctx.io?.answers)) {
        throw new KarmenError("err.failed", { message: en ? "Refusing unset without --yes in a non-interactive shell." : "非交互环境请加 --yes 再 unset。" });
      }
      const prompter = createPrompter({ input: ctx.stdin, output: ctx.stdout, answers: ctx.io?.answers });
      try {
        ok = await prompter.confirm(pick(ctx, `删除 ${group}.${id}？[y/N] `, `Remove ${group}.${id}? [y/N] `), false);
      } finally {
        prompter.close();
      }
    }
    if (!ok) {
      ctx.stdout.write(`${pick(ctx, "已取消。", "Cancelled.")}\n`);
      return 1;
    }
    unsetVaultKey(group, id, ctx.env);
    ctx.stdout.write(`${pick(ctx, `已删除 ${group}.${id}`, `Removed ${group}.${id}`)}\n`);
    return 0;
  }

  if (action === "get") {
    throw new KarmenError("err.failed", {
      message: en
        ? "vault get is disabled (secrets must not print to stdout). Use vault list / vault has."
        : "不提供 vault get（禁止把密钥打到终端）。请用 vault list / vault has。",
    });
  }

  if (action === "set") {
    throw new KarmenError("err.failed", {
      message: en
        ? "vault set is not provided here. Write secrets via karmenbot setup / connect / model add (or edit secrets.json yourself)."
        : "不提供 vault set。请用 karmenbot setup / connect / model add 写入（或自行编辑 secrets.json）。",
    });
  }

  throw new KarmenError("err.unknownCommand", { name: `vault ${action}` });
}
