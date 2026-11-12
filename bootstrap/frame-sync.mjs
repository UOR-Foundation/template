#!/usr/bin/env node
// The frame: the one page every Prism app opens in. Its top bar, share panel,
// omnibox, social card, renderer and gates are the same bytes in every app,
// pinned by frame.lock the way brand.lock pins the brand. An app edits
// site/app.json and nothing in the frame; a drifted copy fails the gate.
//
//   node bootstrap/frame-sync.mjs --check          verify the frame files against frame.lock (the gate; no network)
//   node bootstrap/frame-sync.mjs --pin <commit>   take the frame from UOR-Foundation/template at <commit>:
//                                                  read its frame.lock, fetch every file it lists, refuse any
//                                                  whose bytes differ from that lock, write them, record the pin.
//                                                  The files a frame has are the target's: its frame-sync.mjs,
//                                                  matched to its lock, names them, so a newer frame may add one
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
// Where --pin reads the template. PRISM_TEMPLATE_RAW names another host that
// serves the same tree, for a test or a mirror; every file is still matched
// to the lock it serves, and the pin records where it came from.
const RAW = (process.env.PRISM_TEMPLATE_RAW ?? `https://raw.githubusercontent.com/${TEMPLATE}`).replace(/\/$/, "");

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
  "bootstrap/worker-runtime.mjs",
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
  const url = `${RAW}/${commit}/${path}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

// The files of a frame, as its frame-sync.mjs names them: read as text from
// the FRAME list, never run.
function frameOf(source) {
  const list = source.match(/^const FRAME = \[([\s\S]*?)\];/m)?.[1];
  return list ? [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]) : null;
}
// A frame file is a page file or a page gate: under bootstrap/ or site/, or
// lighthouserc.json, and never outside the repository.
const framePath = (path) => /^(?:(?:bootstrap|site)\/[\w.-]+(?:\/[\w.-]+)*|lighthouserc\.json)$/.test(path) && !path.split("/").includes("..");

// The target is judged by its own frame, not this one: a newer template may
// add a frame file this script has never heard of. Its frame-sync.mjs must be
// in its lock and match it byte for byte; the FRAME list in those bytes is the
// list the lock must name exactly, as --check holds a lock to this one's.
async function frameAt(commit, theirs) {
  if (theirs.spec !== SPEC) throw new Error(`frame.lock at ${commit} is not a ${SPEC} lock`);
  const self = (theirs.files ?? []).find((file) => file.path === "bootstrap/frame-sync.mjs");
  if (!self) throw new Error(`frame.lock at ${commit} does not list bootstrap/frame-sync.mjs, so it names no frame`);
  const script = await fetchAt(commit, self.path);
  if (sha256(script) !== self.sha256) throw new Error(`bootstrap/frame-sync.mjs at ${commit} is ${sha256(script)}, its frame.lock says ${self.sha256}`);
  const frame = frameOf(new TextDecoder().decode(script));
  if (!frame?.includes("bootstrap/frame-sync.mjs")) throw new Error(`bootstrap/frame-sync.mjs at ${commit} names no frame`);
  const bad = frame.filter((path) => !framePath(path));
  if (bad.length) throw new Error(`the frame at ${commit} names files outside the page: ${bad.join(", ")}`);
  const paths = theirs.files.map((file) => file.path).sort();
  if (paths.join("\n") !== [...frame].sort().join("\n")) {
    throw new Error(`frame.lock at ${commit} lists ${paths.join(", ")}, but its frame is ${frame.join(", ")}`);
  }
  return frame;
}

async function pin(commit) {
  const theirs = JSON.parse(new TextDecoder().decode(await fetchAt(commit, "frame.lock")));
  const frame = await frameAt(commit, theirs);
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
  // A file this frame had and the target's does not stays on disk, out of the
  // gate; say so, so it can be removed.
  for (const path of FRAME.filter((path) => !frame.includes(path))) {
    console.log(`frame-sync: ${path} is no longer part of the frame at ${commit.slice(0, 12)}; it is left in place, unchecked`);
  }
  const lock = {
    spec: SPEC,
    source: { repository: TEMPLATE, commit, raw: `${RAW}/${commit}/` },
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
