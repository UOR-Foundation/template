// The published model (bootstrap/model.mjs) and the frame's "Open in IDE",
// without a browser. The browser half is try-page.yml's fixture page.
//   node --test bootstrap/model.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOLO_APP_SCHEMA, MODEL_LISTING_SCHEMA, modelFiles, publishModel } from "./model.mjs";
import { shell } from "../frame/frame.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const ID = "ab".repeat(32);
const holo = new TextEncoder().encode("the holo, as served");
// BLAKE3 of those bytes, from the reference implementation's test of the vendored module.
const { blake3Hex } = await import(new URL("../try/vendor/prism-code/src/blake3.mjs", import.meta.url));

async function project(files) {
  const dir = await mkdtemp(join(tmpdir(), "prism-model-"));
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(dir, path, ".."), { recursive: true });
    await writeFile(join(dir, path), text);
  }
  return dir;
}
const walk = async (dir, rel = "") => (await Promise.all((await readdir(join(dir, rel), { withFileTypes: true })).map((e) => (e.isDirectory() ? walk(dir, `${rel}${e.name}/`) : [rel + e.name])))).flat().sort();

test("the model is published as LexLean reads it, with a listing and a record that names the holo and the model", async () => {
  const app = await project({
    "lexlean.toml": 'entrypoints = ["src/App.lex.tex"]\n',
    "src/App.lex.tex": "model\n",
    "src/Foundation/Bytes.lex.tex": "bytes\n",
    "lake-manifest.json": "{}\n",
    // Left out: not read by a check, or not the author's to publish.
    "session.json": '{"folder":"/home/someone"}\n',
    "NOTES.md": "notes\n",
    "build.log": "log\n",
    ".prism/build/x.holo": "built\n",
    "target/debug/x": "built\n",
    "node_modules/x/index.js": "dependency\n",
  });
  const site = await mkdtemp(join(tmpdir(), "prism-site-"));
  // A model published by an earlier build is replaced whole, not added to.
  await mkdir(join(site, "model"), { recursive: true });
  await writeFile(join(site, "model", "stale.lex.tex"), "from an earlier build\n");
  try {
    const made = await publishModel({ site, app, holo, semanticId: ID, name: "An app" });
    const files = ["lake-manifest.json", "lexlean.toml", "src/App.lex.tex", "src/Foundation/Bytes.lex.tex"];
    assert.deepEqual(await walk(join(site, "model")), [...files, "project.json"].sort());
    assert.deepEqual(JSON.parse(await readFile(join(site, "model", "project.json"), "utf8")), { schema: MODEL_LISTING_SCHEMA, files, entry: "src/App.lex.tex", semanticId: ID });
    const label = `blake3:${blake3Hex(holo)}`;
    assert.deepEqual(JSON.parse(await readFile(join(site, "app.holo.json"), "utf8")), { schema: HOLO_APP_SCHEMA, name: "An app", holo: label, bytes: holo.length, semanticId: ID });
    assert.deepEqual(made, { files: 4, entry: "src/App.lex.tex", holo: label, semanticId: ID });
    assert.equal(await readFile(join(site, "model", "src/App.lex.tex"), "utf8"), "model\n");
  } finally {
    await rm(app, { recursive: true, force: true });
    await rm(site, { recursive: true, force: true });
  }
});

test("nothing is published when the holo names no model, or the checkout holds none", async () => {
  const app = await project({ "lexlean.toml": 'entrypoints = ["src/App.lex.tex"]\n', "src/App.lex.tex": "model\n" });
  const bare = await project({ "lexlean.toml": 'entrypoints = ["src/Missing.lex.tex"]\n' });
  const site = await mkdtemp(join(tmpdir(), "prism-site-"));
  try {
    for (const semanticId of [undefined, null, "", "AB".repeat(32), "ab".repeat(31), `sha256:${ID}`]) {
      await assert.rejects(publishModel({ site, app, holo, semanticId, name: "An app" }), /names no model identity/, String(semanticId));
    }
    await assert.rejects(publishModel({ site, app: bare, holo, semanticId: ID, name: "An app" }), /names no entrypoint/);
    await assert.rejects(modelFiles(join(bare, "absent")));
    assert.deepEqual(await readdir(site), []);
  } finally {
    for (const dir of [app, bare, site]) await rm(dir, { recursive: true, force: true });
  }
});

test("this repository's own model is one LexLean can be handed", async () => {
  const { files, entry } = await modelFiles(join(root, "app"));
  assert.ok(files.has("lexlean.toml") && files.has(entry));
  assert.ok([...files.keys()].every((path) => !path.startsWith(".") && !path.includes("/.") && !/\.(md|log)$/.test(path)));
});

// ---- The frame's control. ----
const BASE = "https://example.github.io/app/";
const link = (attributes) => /<a id="ide"[^>]*>/.exec(shell({ name: "An app", ...attributes }, BASE).html)[0];

test("Open in IDE shows only for an address a page may safely link to", () => {
  const audit = "https://uor-foundation.github.io/prismpm/audit/?app=https%3A%2F%2Fexample.github.io%2Fapp%2F";
  const shown = link({ ide: audit });
  assert.ok(!/ hidden /.test(shown), shown);
  assert.ok(shown.includes(`href="${audit.replace(/&/g, "&amp;")}"`), shown);
  assert.ok(shown.includes('rel="noopener"') && shown.includes('target="_blank"'));
  // The page's own origin, by a relative address.
  assert.ok(link({ ide: "audit/" }).includes('href="https://example.github.io/app/audit/"'));
  // Absent, empty, or an address a browser would run or send in the clear: no control, and no address in the page.
  for (const ide of [undefined, "", "javascript:alert(1)", "data:text/html,x", "http://example.org/audit/", "//[", "file:///etc/passwd"]) {
    const hidden = link(ide === undefined ? {} : { ide });
    assert.ok(/ hidden /.test(hidden), `${ide}: ${hidden}`);
    assert.ok(hidden.includes('href=""'), `${ide}: ${hidden}`);
  }
});

test("an address cannot leave its attribute", () => {
  const html = shell({ name: "An app", ide: 'https://example.org/"><script>alert(1)</script>' }, BASE).html;
  assert.ok(!html.includes("<script>"));
});
