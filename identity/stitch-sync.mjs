#!/usr/bin/env node
// Prism id comes from stitch (afflom/stitch), pinned by commit: the frame and
// the sign-in page model their identity on stitch's prototype and follow it
// as stitch's Prism model is refined. Stitch is not a Foundry component yet,
// so nothing here edits it: this script copies it.
//
// identity/prism-id.mjs is generated, one self-contained module: stitch's
// src/prism-id.js with the part of its generated model it calls (every
// Stitch.PrismId decision and what those call, and the model's evaluator).
// The whole model is 1.2 MB; the part Prism id uses is a few KB, so the
// frame can carry it. identity/stitch.lock names the commit and the hash of
// every input and of the output.
//
//   node identity/stitch-sync.mjs <commit>          fetch that commit, write both
//   node identity/stitch-sync.mjs <commit> <dir>    read a local stitch checkout at it
//   node identity/stitch-sync.mjs --check           the output is the one the lock names
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const LOCK = join(root, "identity/stitch.lock");
const OUT = join(root, "identity/prism-id.mjs");
const REPOSITORY = "afflom/stitch";
const SOURCES = ["src/prism-id.js", "src/layer1-uor/generated-model.js"];
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

const [first, dir] = process.argv.slice(2);
if (first === "--check") {
  const lock = JSON.parse(await readFile(LOCK, "utf8"));
  const actual = sha256(await readFile(OUT));
  if (actual !== lock.output.sha256) {
    console.error(`identity/prism-id.mjs is ${actual}, but identity/stitch.lock names ${lock.output.sha256}. Run node identity/stitch-sync.mjs ${lock.commit}.`);
    process.exit(1);
  }
  console.log(`prism id: stitch ${lock.commit.slice(0, 12)}, output matches the lock`);
  process.exit(0);
}
if (!/^[0-9a-f]{40}$/.test(first ?? "")) {
  console.error("usage: node identity/stitch-sync.mjs <40-hex stitch commit> [<local stitch checkout>] | --check");
  process.exit(2);
}
const commit = first;

async function source(path) {
  if (dir) return execFileSync("git", ["-C", dir, "show", `${commit}:${path}`], { encoding: "utf8", maxBuffer: 64 << 20 });
  const response = await fetch(`https://raw.githubusercontent.com/${REPOSITORY}/${commit}/${path}`);
  if (!response.ok) throw new Error(`${REPOSITORY}@${commit}:${path} answered ${response.status}`);
  return response.text();
}
const [prismId, generated] = await Promise.all(SOURCES.map(source));

// The generated model: `const definitions = {...};`, `const types = {...};`
// (both JSON), then the digests and sources, then the evaluator from
// `const qualify` to `export const model=`.
const lines = generated.split("\n");
const block = (head) => {
  const start = lines.indexOf(`const ${head} = {`);
  const end = lines.indexOf("};", start);
  if (start < 0 || end < 0) throw new Error(`the generated model has no ${head} block`);
  return JSON.parse(lines.slice(start, end + 1).join("\n").replace(`const ${head} = `, "").replace(/;$/, ""));
};
const definitions = block("definitions");
const types = block("types");
const evalStart = lines.findIndex((line) => line.startsWith("const qualify = "));
const evalEnd = lines.findIndex((line) => line.startsWith("export const model="));
if (evalStart < 0 || evalEnd < evalStart) throw new Error("the generated model's evaluator moved");
const evaluator = lines.slice(evalStart, evalEnd + 1).join("\n").replace("export const model=", "const model=");

// Every decision prism-id.js calls, and everything those call.
const qualify = (module, name) => (name.includes("::") ? name.replace("::", ".") : `${module}.${name}`);
const used = new Set();
const visit = (id) => {
  if (used.has(id)) return;
  const definition = definitions[id] ?? (() => { throw new Error(`prism-id.js calls ${id}, which the model lacks`); })();
  used.add(id);
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.k === "call") visit(qualify(definition.module, node.name));
    for (const value of Object.values(node)) walk(value);
  };
  walk(definition.body);
};
for (const [, id] of prismId.matchAll(/model\['([\w.]+)'\]/g)) visit(id);
const usedTypes = new Set();
const typeOf = (module, type) => {
  if (!type || ["Nat", "Bool", "Bytes", "String"].includes(type.kind)) return;
  if (type.kind === "List") return typeOf(module, type.element);
  const id = qualify(module, type.kind);
  if (!types[id]) throw new Error(`the model lacks type ${id}`);
  usedTypes.add(id);
};
for (const id of used) {
  definitions[id].params.forEach((p) => typeOf(definitions[id].module, p.type));
  typeOf(definitions[id].module, definitions[id].result);
}
const pick = (all, ids) => Object.fromEntries([...ids].sort().map((id) => [id, all[id]]));

const IMPORT = "import { model } from './layer1-uor/generated-model.js';";
if (!prismId.includes(IMPORT)) throw new Error("src/prism-id.js no longer imports the model as expected");
const output = `// GENERATED by identity/stitch-sync.mjs from ${REPOSITORY}@${commit}. DO NOT EDIT.
// src/prism-id.js with the ${used.size} model decisions it calls
// (src/layer1-uor/generated-model.js); identity/stitch.lock pins both.
// Change Prism id in stitch, then run node identity/stitch-sync.mjs <commit>.
const definitions = ${JSON.stringify(pick(definitions, used))};
const types = ${JSON.stringify(pick(types, usedTypes))};
${evaluator}

${prismId.replace(IMPORT, "")}`;
await writeFile(OUT, output);
const lock = {
  repository: REPOSITORY,
  commit,
  sources: Object.fromEntries(SOURCES.map((path, i) => [path, sha256([prismId, generated][i])])),
  decisions: [...used].sort(),
  output: { path: "identity/prism-id.mjs", sha256: sha256(output) },
};
await writeFile(LOCK, JSON.stringify(lock, null, 2) + "\n");
console.log(`prism id: stitch ${commit.slice(0, 12)}, ${used.size} decisions, ${output.length} bytes -> identity/prism-id.mjs`);
