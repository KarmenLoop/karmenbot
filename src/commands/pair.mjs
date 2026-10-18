import { KarmenError } from "../errors.mjs";
import { CODE_TTL_MS, createPairing } from "../gateway/pairing.mjs";
import { PLATFORMS, platformName } from "../gateway/platforms/index.mjs";

export async function run(ctx) {
  const { args, env, stdout } = ctx;
  const zh = ctx.t.lang !== "en";
  const pairing = createPairing({ env });
  const action = args[0] || "list";
  const names = Object.keys(PLATFORMS);
  if (action === "list" || action === "ls") {
    let any = false;
    for (const entry of pairing.list(names)) {
      const approved = Object.entries(entry.approved);
      if (!approved.length && !entry.pending.length) continue;
      any = true;
      stdout.write(`${PLATFORMS[entry.platform][zh ? "zh" : "en"]}\n`);
      for (const [id, info] of approved) stdout.write(`  ✓ ${id}${info.name ? ` (${info.name})` : ""}\n`);
      for (const item of entry.pending) stdout.write(`  … ${item.code}  ${item.userId}${item.name ? ` (${item.name})` : ""}  ${zh ? "剩" : "expires in"} ${Math.max(0, Math.round((CODE_TTL_MS - (Date.now() - item.at)) / 60000))} ${zh ? "分钟" : "min"}\n`);
    }
    if (!any) stdout.write(zh ? "还没有配对过任何账号。\n" : "No paired accounts yet.\n");
    return 0;
  }
  if (action === "approve") {
    if (!args[1]) throw new KarmenError("err.flagValue", { flag: "pair approve <code>" });
    const done = pairing.approveCode(args[1], names);
    if (!done) {
      stdout.write(zh ? "没有找到这个配对码，或已经过期。\n" : "No such pairing code, or it expired.\n");
      return 1;
    }
    stdout.write(zh ? `已授权 ${PLATFORMS[done.platform].zh} 账号 ${done.userId}${done.name ? `（${done.name}）` : ""}。\n` : `Authorized ${PLATFORMS[done.platform].en} account ${done.userId}.\n`);
    return 0;
  }
  if (action === "revoke") {
    const platform = platformName(args[1]);
    if (!platform || !args[2]) throw new KarmenError("err.flagValue", { flag: "pair revoke <platform> <account>" });
    const ok = pairing.revoke(platform, args[2]);
    stdout.write(ok ? (zh ? "已取消授权。\n" : "Revoked.\n") : (zh ? "这个账号没有授权记录。\n" : "That account was not authorized.\n"));
    return ok ? 0 : 1;
  }
  throw new KarmenError("err.unknownCommand", { name: `pair ${action}` });
}
