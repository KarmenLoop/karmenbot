import { checkUpdate, identityText, OFFICIAL } from "../official.mjs";
import { VERSION } from "../version.mjs";

// `karmenbot update` (官网 / 关于): who makes it, where the official site is,
// and whether the official download lists a different version.
export async function run(ctx) {
  const { stdout, env } = ctx;
  const lang = ctx.t.lang === "en" ? "en" : "zh";
  stdout.write(`${identityText(lang)}\n\n`);
  stdout.write(lang === "en" ? `This copy: ${VERSION}\n` : `当前版本：${VERSION}\n`);
  const result = await checkUpdate({ env, fetchImpl: ctx.io.fetchImpl });
  if (!result.ok) {
    stdout.write(lang === "en"
      ? `Could not read ${result.base}/latest.json (${result.message}). Open ${OFFICIAL.updates} to check by hand.\n`
      : `没有读到 ${result.base}/latest.json（${result.message}）。请打开 ${OFFICIAL.updates} 查看更新。\n`);
    return 0;
  }
  stdout.write(result.newer
    ? (lang === "en" ? `The official site lists ${result.latest}. Notes: ${OFFICIAL.updates}\n` : `官网记录的版本是 ${result.latest}。更新说明：${OFFICIAL.updates}\n`)
    : (lang === "en" ? `The official site lists the same version.\n` : `官网记录的就是这个版本。\n`));
  return 0;
}
