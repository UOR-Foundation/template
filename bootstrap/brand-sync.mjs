#!/usr/bin/env node
// The brand wiring. Every token and font the page uses comes from
// Hologram-Technologies/hologram-brand-kit at the commit brand.lock pins, and
// nothing in site/brand or site/fonts is edited by hand.
//
//   node bootstrap/brand-sync.mjs --check          verify the served files against brand.lock (the gate)
//   node bootstrap/brand-sync.mjs --sync           fetch the copied files at the pinned commit and verify
//   node bootstrap/brand-sync.mjs --pin <commit>   move the pin: fetch at <commit>, rewrite every hash
//
// Fonts are derived, not copied: bootstrap/brand-fonts.py subsets the kit's
// fonts and writes their hashes into the lock. --check verifies the subsets;
// --sync and --pin fetch the sources into .brand-src/ for that script.
// Plain Node, no dependencies.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const root = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const lockPath = join(root, "brand.lock");
const srcDir = join(root, ".brand-src");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function read(path) {
  try {
    return await readFile(join(root, path));
  } catch {
    return null;
  }
}

async function fetchRaw(lock, from) {
  const url = lock.source.raw + from;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function save(path, bytes) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), bytes);
}

function fail(message) {
  console.error(`brand-sync: ${message}`);
  process.exitCode = 1;
}

async function check(lock) {
  let ok = true;
  for (const file of lock.copied) {
    const bytes = await read(file.to);
    if (!bytes) { fail(`${file.to} is missing`); ok = false; continue; }
    const got = sha256(bytes);
    if (got !== file.sha256) { fail(`${file.to} is ${got}, brand.lock says ${file.sha256} (from ${file.from})`); ok = false; }
  }
  for (const font of lock.fonts.files) {
    const bytes = await read(font.to);
    if (!bytes) { fail(`${font.to} is missing`); ok = false; continue; }
    const got = sha256(bytes);
    if (got !== font.sha256) { fail(`${font.to} is ${got}, brand.lock says ${font.sha256} (subset of ${font.from})`); ok = false; }
  }
  if (ok) console.log(`brand-sync: ${lock.copied.length} copied files and ${lock.fonts.files.length} fonts match brand.lock (${lock.source.repository}@${lock.source.commit.slice(0, 12)})`);
  return ok;
}

async function sync(lock, { pin = false } = {}) {
  for (const file of lock.copied) {
    const bytes = await fetchRaw(lock, file.from);
    const got = sha256(bytes);
    if (pin) file.sha256 = got;
    else if (got !== file.sha256) { fail(`${file.from} at the pinned commit is ${got}, brand.lock says ${file.sha256}`); continue; }
    await save(file.to, bytes);
    console.log(`brand-sync: ${file.from} -> ${file.to}`);
  }
  for (const item of lock.provenance) {
    const got = sha256(await fetchRaw(lock, item.from));
    if (pin) item.sha256 = got;
    else if (got !== item.sha256) fail(`${item.from} at the pinned commit is ${got}, brand.lock says ${item.sha256}`);
  }
  for (const font of lock.fonts.files) {
    const bytes = await fetchRaw(lock, font.from);
    const got = sha256(bytes);
    if (pin) font.source_sha256 = got;
    else if (got !== font.source_sha256) { fail(`${font.from} at the pinned commit is ${got}, brand.lock says ${font.source_sha256}`); continue; }
    await save(join(".brand-src", font.from), bytes);
    console.log(`brand-sync: ${font.from} -> .brand-src/ (source for brand-fonts.py)`);
  }
  for (const item of lock.sources ?? []) {
    const bytes = await fetchRaw(lock, item.from);
    const got = sha256(bytes);
    if (pin || item.sha256 === "PENDING") item.sha256 = got;
    else if (got !== item.sha256) { fail(`${item.from} at the pinned commit is ${got}, brand.lock says ${item.sha256}`); continue; }
    await save(join(".brand-src", item.from), bytes);
    console.log(`brand-sync: ${item.from} -> .brand-src/ (source, not served)`);
  }
  if (pin || (lock.sources ?? []).some((s) => s.sha256 !== "PENDING") && process.argv.includes("--write-lock")) {
    await writeFile(lockPath, JSON.stringify(lock, null, 2) + "\n");
    console.log(`brand-sync: pinned ${lock.source.repository}@${lock.source.commit}; now run bootstrap/brand-fonts.py`);
  }
}

const lock = JSON.parse(await readFile(lockPath, "utf8"));
const [mode, arg] = process.argv.slice(2);
if (mode === "--check") {
  if (!(await check(lock))) process.exitCode = 1;
} else if (mode === "--sync") {
  await sync(lock);
} else if (mode === "--pin" && /^[0-9a-f]{40}$/.test(arg ?? "")) {
  lock.source.commit = arg;
  lock.source.raw = `https://raw.githubusercontent.com/${lock.source.repository}/${arg}/`;
  await sync(lock, { pin: true });
} else {
  fail("usage: brand-sync.mjs --check | --sync | --pin <40-hex commit>");
}
