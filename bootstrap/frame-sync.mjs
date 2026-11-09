#!/usr/bin/env node
// The frame: the one page every Prism app opens in. Its top bar, share panel,
// omnibox, social card, renderer and gates are the same bytes in every app,
// pinned by frame.lock the way brand.lock pins the brand. An app edits
// site/app.json and nothing in the frame; a drifted copy fails the gate.
//
//   node bootstrap/frame-sync.mjs --check          verify the frame files against frame.lock (the gate; no network)
//   node bootstrap/frame-sync.mjs --pin <commit>   take the frame from UOR-Foundation/template at <commit>:
//                                                  read its frame.lock, fetch every file it lists, refuse any
//                                                  whose bytes differ from that lock, write them, record the pin
//   node bootstrap/frame-sync.mjs --lock           UOR-Foundation/template only (by GITHUB_REPOSITORY or the
//                                                  origin remote): rewrite frame.lock from the files on disk
//
// In the template, frame.lock has no source: the template is the source.
// In an app, it names the template commit the frame came from. A repository
// just created from the template inherits the template's lock, which
// passes until the frame changes; --pin moves it to a newer frame.
// Plain Node, no dependencies.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const root = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const lockPath = join(root, "frame.lock");
const TEMPLATE = "UOR-Foundation/template";
const SPEC = "prism/frame-lock/1";

// Every file of the frame. A lock must list exactly these, so dropping one
// from the lock cannot take it out of the gate.
const FRAME = [
  "bootstrap/frame-sync.mjs",
  "bootstrap/icons.py",
  "bootstrap/og.py",
  "bootstrap/page.mjs",
  "bootstrap/precache.mjs",
  "bootstrap/register.mjs",
  "bootstrap/screens.mjs",
  "lighthouserc.json",
  "site/app.mjs",
  "site/guest-worker.mjs",
  "site/page.template.html",
  "site/prism-page.css",
  "site/spec.css",
  "site/spec.mjs",
  "site/sw.js",
  "site/theme.js",
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function fail(message) {
  console.error(`frame-sync: ${message}`);
  process.exitCode = 1;
}

async function read(path) {
  try {
    return await readFile(join(root, path));
  } catch {
    return null;
  }
}

function listed(lock) {
  const paths = (lock.files ?? []).map((file) => file.path).sort();
  return lock.spec === SPEC && paths.join("\n") === [...FRAME].sort().join("\n");
}

async function check(lock) {
  if (!listed(lock)) {
    fail(`frame.lock must be ${SPEC} and list exactly: ${FRAME.join(", ")}`);
    return false;
  }
  let ok = true;
  for (const file of lock.files) {
    const bytes = await read(file.path);
    if (!bytes) { fail(`${file.path} is missing`); ok = false; continue; }
    const got = sha256(bytes);
    if (got !== file.sha256) {
      fail(`${file.path} is ${got}, frame.lock says ${file.sha256}: the frame is not edited by hand; take a new one with --pin`);
      ok = false;
    }
  }
  const from = lock.source ? `${lock.source.repository}@${lock.source.commit.slice(0, 12)}` : "this template";
  if (ok) console.log(`frame-sync: ${lock.files.length} frame files match frame.lock (${from})`);
  return ok;
}

async function fetchAt(commit, path) {
  const url = `https://raw.githubusercontent.com/${TEMPLATE}/${commit}/${path}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function pin(commit) {
  const theirs = JSON.parse(new TextDecoder().decode(await fetchAt(commit, "frame.lock")));
  if (!listed(theirs)) throw new Error(`frame.lock at ${commit} is not a ${SPEC} lock of this frame`);
  const files = [];
  for (const file of theirs.files) {
    const bytes = await fetchAt(commit, file.path);
    const got = sha256(bytes);
    if (got !== file.sha256) throw new Error(`${file.path} at ${commit} is ${got}, its frame.lock says ${file.sha256}`);
    files.push({ path: file.path, sha256: got, bytes });
  }
  // Nothing is written until every file has been fetched and matched.
  for (const file of files) {
    await mkdir(dirname(join(root, file.path)), { recursive: true });
    await writeFile(join(root, file.path), file.bytes);
    console.log(`frame-sync: ${file.path} from ${TEMPLATE}@${commit.slice(0, 12)}`);
  }
  const lock = {
    spec: SPEC,
    source: { repository: TEMPLATE, commit, raw: `https://raw.githubusercontent.com/${TEMPLATE}/${commit}/` },
    files: files.map(({ path, sha256: hash }) => ({ path, sha256: hash })),
  };
  await writeFile(lockPath, JSON.stringify(lock, null, 2) + "\n");
  console.log(`frame-sync: pinned ${TEMPLATE}@${commit}; render the page with node bootstrap/page.mjs site`);
}

// The repository this checkout is: GitHub Actions says so; otherwise the
// origin remote does. Null when neither answers.
function repository() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], { cwd: root, encoding: "utf8" }).trim();
    return url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/i)?.[1] ?? null;
  } catch {
    return null;
  }
}

async function relock() {
  // Only the template writes the lock. An app takes its page from the template
  // with --pin and never blesses its own copy, including an app just created
  // from the template, whose lock has no source yet.
  const here = repository();
  if (here?.toLowerCase() !== TEMPLATE.toLowerCase()) {
    throw new Error(`--lock runs only in ${TEMPLATE}; this is ${here ?? "a repository that cannot be identified"}: take the page with --pin <template commit>`);
  }
  const current = await read("frame.lock");
  if (current && JSON.parse(new TextDecoder().decode(current)).source) {
    throw new Error("frame.lock names a template commit: this is an app; take a new frame with --pin");
  }
  const files = [];
  for (const path of [...FRAME].sort()) {
    const bytes = await read(path);
    if (!bytes) throw new Error(`${path} is missing`);
    files.push({ path, sha256: sha256(bytes) });
  }
  await writeFile(lockPath, JSON.stringify({ spec: SPEC, files }, null, 2) + "\n");
  console.log(`frame-sync: frame.lock rewritten from ${files.length} files on disk`);
}

const [mode, arg] = process.argv.slice(2);
try {
  if (mode === "--check") {
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    if (!(await check(lock))) process.exitCode = 1;
  } else if (mode === "--pin" && /^[0-9a-f]{40}$/.test(arg ?? "")) {
    await pin(arg);
  } else if (mode === "--lock") {
    await relock();
  } else {
    fail("usage: frame-sync.mjs --check | --pin <40-hex template commit> | --lock");
  }
} catch (error) {
  fail(error.message);
}
