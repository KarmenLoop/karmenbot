import fs from "node:fs";
import path from "node:path";

const WORKFLOW = `name: karmenbot
on:
  pull_request:
  issue_comment:
    types: [created]
jobs:
  review:
    if: github.event_name == 'pull_request' || (github.event.issue.pull_request && startsWith(github.event.comment.body, '/karmenbot'))
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Review
        env:
          KARMENBOT_MODEL: \${{ vars.KARMENBOT_MODEL }}
          KARMENBOT_BASE_URL: \${{ vars.KARMENBOT_BASE_URL }}
          KARMENBOT_API_KEY: \${{ secrets.KARMENBOT_API_KEY }}
        run: |
          npx --yes node@22 --version
          karmenbot review --base origin/\${{ github.base_ref }}
`;

export async function run(ctx) {
  const action = ctx.args[0] || "init";
  if (action !== "init") {
    ctx.stderr.write("karmenbot ci init\n");
    return 2;
  }
  const file = path.join(ctx.workspace, ".github", "workflows", "karmenbot.yml");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && !ctx.opts.yes) {
    ctx.stderr.write(`${file} already exists\n`);
    return 1;
  }
  fs.writeFileSync(file, WORKFLOW);
  ctx.stdout.write(`${file}\n`);
  return 0;
}
