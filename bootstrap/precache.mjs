#!/usr/bin/env node
// Writes site/precache.json: every file the page serves, with its SHA-256, and
// a version that is the hash of that list, so a new deploy is a new service
// worker and an unchanged deploy is not. Run after pages.yml assembles site/
// (the holo and the vendored runtime are only there then).
//   node bootstrap/precache.mjs site
import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const site = process.argv[2] ?? "site";
const skip = new Set(["precache.json", "sw.js", "page.template.html", "app.json"]);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir)) {
    const path = join(dir, entry);
    if ((await stat(path)).isDirectory()) out.push(...(await walk(path)));
    else out.push(path);
  }
  return out;
}

const files = [];
for (const path of (await walk(site)).sort()) {
  const rel = relative(site, path).split("\\").join("/");
  if (skip.has(rel) || rel.endsWith(".txt") || rel.endsWith(".d.ts") || rel.endsWith(".md") || rel.includes("fixtures/")) continue;
  if (/vendor\/prism-code\/src\/(node|docker)\.mjs$/.test(rel)) continue;
  const bytes = await readFile(path);
  const eager = rel.startsWith("icons/") || rel === "manifest.webmanifest";
  files.push({ path: "./" + rel, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, ...(eager ? { eager } : {}) });
}
const version = createHash("sha256").update(JSON.stringify(files.map((f) => [f.path, f.sha256]))).digest("hex").slice(0, 16);
await writeFile(join(site, "precache.json"), JSON.stringify({ version, files }, null, 2) + "\n");
const total = files.reduce((n, f) => n + f.bytes, 0);
console.log(`precache: ${files.length} files, ${total} bytes, version ${version}`);
