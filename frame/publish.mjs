#!/usr/bin/env node
// Publishes the canonical frame. Bakes frame/frame.css and the brand's tokens
// (site/brand/hologram-warm.css, pinned by brand.lock) into frame/frame.mjs,
// names the result by its SHA-256, and writes the pointer every app follows:
//
//   <out>/<sha256>/prism-frame.mjs   immutable: the frame, by its content
//   <out>/current.json               the pointer: { spec, sha256, module, source }
//
// try-page.yml runs it on every push to main into the template's Pages site,
// so the frame at https://uor-foundation.github.io/template/frame/ is always
// main's, and every Prism app picks it up on its next load.
//   node frame/publish.mjs <out-dir> [<source commit>]
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const [out = "frame-out", commit = process.env.GITHUB_SHA ?? null] = process.argv.slice(2);

const read = (path) => readFile(join(root, path), "utf8");
const minify = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]+/gm, "").replace(/\n{2,}/g, "\n").trim();

let module = await read("frame/frame.mjs");
for (const [mark, text] of [['"/*CSS*/"', minify(await read("frame/frame.css"))], ['"/*BRAND*/"', minify(await read("site/brand/hologram-warm.css"))]]) {
  if (!module.includes(mark)) throw new Error(`frame/frame.mjs has no ${mark}`);
  module = module.replace(mark, JSON.stringify(text));
}
const bytes = Buffer.from(module, "utf8");
const sha256 = createHash("sha256").update(bytes).digest("hex");
await mkdir(join(out, sha256), { recursive: true });
await writeFile(join(out, sha256, "prism-frame.mjs"), bytes);
const pointer = { spec: "prism/frame/1", sha256, module: `${sha256}/prism-frame.mjs`, source: { repository: "UOR-Foundation/template", commit } };
await writeFile(join(out, "current.json"), JSON.stringify(pointer, null, 2) + "\n");
console.log(`frame: ${sha256} (${bytes.length} bytes) -> ${out}/current.json`);
