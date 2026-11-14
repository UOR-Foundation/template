// Planted defects for the input-addressed holo cache: every way a cached holo
// could be wrong must be refused before it replaces a build.
//
//   node --test ci/kappa-cache.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { kappa } from "../try/vendor/prism-code/src/index.mjs";
import { MEDIA, attested, checkBlob, holoLayer, inputKappa, verify } from "./kappa-cache.mjs";

const fixture = readFileSync(new URL("../try/vendor/prism-code/fixtures/Calculator.holo", import.meta.url));

function workspace(files) {
  const dir = mkdtempSync(join(tmpdir(), "kappa-cache-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  for (const [path, text] of Object.entries(files)) writeFileSync(join(dir, path), text);
  execFileSync("git", ["add", "-A"], { cwd: dir });
  return dir;
}
const track = (dir) => execFileSync("git", ["add", "-A"], { cwd: dir });

test("the input kappa is a function of the tracked input bytes and their paths", () => {
  const dir = workspace({ "a.lex.tex": "model\n", "prismpm.lock": "{}\n" });
  try {
    const inputs = ["a.lex.tex", "prismpm.lock"];
    const first = inputKappa(inputs, dir).kappa;
    assert.equal(inputKappa(inputs, dir).kappa, first, "the same bytes give the same kappa");
    writeFileSync(join(dir, "untracked.txt"), "noise\n");
    assert.equal(inputKappa(inputs, dir).kappa, first, "an untracked file is not an input");

    writeFileSync(join(dir, "a.lex.tex"), "modeL\n");
    track(dir);
    const edited = inputKappa(inputs, dir).kappa;
    assert.notEqual(edited, first, "one changed byte changes the kappa");

    writeFileSync(join(dir, "a.lex.tex"), "model\n");
    renameSync(join(dir, "a.lex.tex"), join(dir, "b.lex.tex"));
    track(dir);
    assert.notEqual(inputKappa(["b.lex.tex", "prismpm.lock"], dir).kappa, first, "a renamed file changes the kappa");

    assert.throws(() => inputKappa(["missing"], dir), /no tracked files/, "no inputs is refused, not hashed as empty");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a genuine holo verifies and replays every vector", async () => {
  const checked = await verify(fixture);
  assert.ok(checked.vectors > 0);
  assert.equal(checked.fingerprint, fixture.subarray(fixture.length - 32).toString("hex"));
});

test("a holo with one byte flipped is refused by its self-fingerprint", async () => {
  const bad = Buffer.from(fixture);
  bad[Math.floor(bad.length / 2)] ^= 1;
  await assert.rejects(verify(bad), /self-fingerprint fails/);
});

// The fingerprint is a checksum: a holo altered and fingerprinted again can
// still load and replay every example. This is the defect that makes signed
// provenance, not verify, the binding a hit requires.
test("a holo altered and fingerprinted again can pass verify, so verify alone binds nothing", async () => {
  const body = Buffer.from(fixture.subarray(0, fixture.length - 32));
  body[Math.floor(body.length / 2)] ^= 1;
  const forged = Buffer.concat([body, Buffer.from(kappa(body).slice("blake3:".length), "hex")]);
  const checked = await verify(forged);
  assert.notEqual(checked.fingerprint, fixture.subarray(fixture.length - 32).toString("hex"));
});

test("a hit requires provenance signed by the storing repository's pages workflow on main", () => {
  const calls = [];
  attested("app.holo", "owner/app", (command, args) => calls.push([command, ...args]));
  assert.deepEqual(calls, [[
    "gh", "attestation", "verify", "app.holo", "--repo", "owner/app",
    "--signer-workflow", "owner/app/.github/workflows/pages.yml", "--source-ref", "refs/heads/main",
  ]]);
  const unsigned = () => {
    const error = new Error("exit 1");
    error.stderr = Buffer.from("Error: HTTP 404: Not Found\n");
    throw error;
  };
  assert.throws(() => attested("app.holo", "owner/app", unsigned), /exit 1/);
});

test("a truncated holo is refused", async () => {
  await assert.rejects(verify(fixture.subarray(0, 40)), /too short/);
  await assert.rejects(verify(fixture.subarray(0, fixture.length - 1)));
});

test("a manifest for another kappa, or without a holo, is refused", () => {
  const k = `blake3:${"a".repeat(64)}`;
  const layer = { mediaType: MEDIA, digest: "sha256:0", size: 1 };
  assert.equal(holoLayer({ annotations: { "uor.prism.input-kappa": k }, layers: [layer] }, k), layer);
  assert.throws(() => holoLayer({ annotations: { "uor.prism.input-kappa": `blake3:${"b".repeat(64)}` }, layers: [layer] }, k), /recorded input kappa differs/);
  assert.throws(() => holoLayer({ annotations: {}, layers: [layer] }, k), /recorded input kappa differs/);
  assert.throws(() => holoLayer({ annotations: { "uor.prism.input-kappa": k }, layers: [{ ...layer, mediaType: "x" }] }, k), /no holo layer/);
});

test("bytes that differ from the manifest's digest are refused", () => {
  const digest = `sha256:${createHash("sha256").update(fixture).digest("hex")}`;
  checkBlob(fixture, { digest });
  const other = Buffer.from(fixture);
  other[0] ^= 1;
  assert.throws(() => checkBlob(other, { digest }), /blob digest differs/);
});
