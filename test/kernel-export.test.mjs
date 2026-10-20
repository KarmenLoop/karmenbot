import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { kernelPrints } from "../scripts/export-github.mjs";

test("export fingerprints distinguish closed runtime code from CLI glue and notices", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kb-export-scope-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = "firstClosedOperation();\nsecondClosedOperation();\nthirdClosedOperation();\n";
  const glue = "firstPublicOperation();\nsecondPublicOperation();\nthirdPublicOperation();\n";
  for (const [relative, body] of [
    ["vendor/koder-desktop/harness/tools.mjs", source],
    ["vendor/koder-cli/src/turn.mjs", glue],
    ["vendor/koder-desktop/LICENSE", glue],
  ]) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
  const prints = kernelPrints(root);
  assert.ok(prints.runs.has(source.trim()));
  assert.ok(!prints.runs.has(glue.trim()));
});
