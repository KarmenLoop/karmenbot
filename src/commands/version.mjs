import { OFFICIAL } from "../official.mjs";
import { VERSION } from "../version.mjs";

export async function run(ctx) {
  ctx.stdout.write(`karmenbot ${VERSION}\n${OFFICIAL.site}\n${OFFICIAL.updates}\n${OFFICIAL.download}\ninfo@karmenloop.com\n`);
  return 0;
}
