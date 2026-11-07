#!/usr/bin/env node
// Publishes the canonical frame. Bakes frame/frame.css and the brand's tokens
// (site/brand/hologram-warm.css, pinned by brand.lock) into frame/frame.mjs,
// minifies it with Terser (the exact version package-lock.json pins, so the
// same source always gives the same bytes), names the result by its SHA-256,
// and writes the pointer every app follows:
//
//   <out>/<sha256>/prism-frame.mjs   immutable: the frame, by its content
//   <out>/current.json               the pointer: { spec, sha256, module, source }
//   <out>/backdrops/<id>.jpg         the immersive photos, and <id>-thumb.jpg
//
// try-page.yml runs it on every push to main into the template's Pages site,
// so the frame at https://uor-foundation.github.io/template/frame/ is always
// main's, and every Prism app picks it up on its next load.
//   node frame/publish.mjs <out-dir> [<source commit>]
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { minify as terser } from "terser";

const root = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const [out = "frame-out", commit = process.env.GITHUB_SHA ?? null] = process.argv.slice(2);

const read = (path) => readFile(join(root, path), "utf8");
const minify = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]+/gm, "").replace(/\n{2,}/g, "\n").trim();

let module = await read("frame/frame.mjs");
for (const [mark, text] of [['"/*CSS*/"', minify(await read("frame/frame.css"))], ['"/*BRAND*/"', minify(await read("site/brand/hologram-warm.css"))]]) {
  if (!module.includes(mark)) throw new Error(`frame/frame.mjs has no ${mark}`);
  module = module.replace(mark, JSON.stringify(text));
}
// Every Prism app runs these bytes, so they ship minified: comments and
// whitespace are Lighthouse's unminified-javascript failure, and the frame
// is the largest script an app page loads.
const minified = await terser(module, { module: true, compress: { passes: 2 }, mangle: true, format: { comments: false } });
if (!minified.code) throw new Error("terser produced nothing");
const bytes = Buffer.from(minified.code, "utf8");
const sha256 = createHash("sha256").update(bytes).digest("hex");
await mkdir(join(out, sha256), { recursive: true });
await writeFile(join(out, sha256, "prism-frame.mjs"), bytes);
// The immersive photos, beside the frame: every app page may fetch from the
// frame's host (its connect-src names it), so the frame can draw them on a
// page whose img-src allows only its own files and data:. A photo the frame
// names and the repository lacks fails the publish.
await mkdir(join(out, "backdrops"), { recursive: true });
for (const [, id] of module.matchAll(/\bid: "([\w-]+)",\s*\n\s*image: "https:\/\/images\.unsplash\.com\//g)) {
  for (const file of [`${id}.jpg`, `${id}-thumb.jpg`]) {
    await copyFile(join(root, "frame/backdrops", file), join(out, "backdrops", file));
  }
}
const pointer = { spec: "prism/frame/1", sha256, module: `${sha256}/prism-frame.mjs`, source: { repository: "UOR-Foundation/template", commit } };
await writeFile(join(out, "current.json"), JSON.stringify(pointer, null, 2) + "\n");
console.log(`frame: ${sha256} (${bytes.length} bytes) -> ${out}/current.json`);
