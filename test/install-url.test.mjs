import assert from "node:assert/strict";
import test from "node:test";
import { installSkillFromUrl } from "../src/skills/install-url.mjs";

test("install from URL rejects non-https", async () => {
  await assert.rejects(
    () => installSkillFromUrl("http://example.com/x.zip", { force: true }),
    /https/i,
  );
});

test("install from URL fails when archive has no skill.json", async () => {
  const fakeZip = Buffer.from("PK\x05\x06" + "\x00".repeat(18));
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => fakeZip.buffer.slice(fakeZip.byteOffset, fakeZip.byteOffset + fakeZip.byteLength),
  });
  await assert.rejects(
    () => installSkillFromUrl("https://example.com/empty.zip", { force: true, fetchImpl }),
    /unzip|skill\.json|extract|zipfile|empty|SKILL_URL/i,
  );
});
