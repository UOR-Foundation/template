// Registers this app in the Prism registry, the source of the Prism index
// every app's address bar and Holo Search read. bootstrap/page.mjs calls it
// at the end of a GitHub Actions build, so every app that takes the template's
// page files registers on each deploy, with no workflow of its own to change.
//
// The holo the build just made is pushed to <registry>/prism/<owner>/<name>
// by prism-code (at one version, through npx: nothing to install), and its
// fingerprint is recorded against the app's live page. The run proves which
// repository it is with the OIDC token GitHub mints for it: no secret, and a
// run may write only its own repository's name. The index lists the app once
// its live page serves a holo it registered and that holo verifies.
//
//   node bootstrap/register.mjs site     the same, by hand (needs an OIDC token)
//
// The registry is DEFAULT_REGISTRY, or PRISM_REGISTRY, or app.json's
// "registry"; with none, nothing is registered. "index": false in app.json
// opts out. Nothing here ever fails a build: page.mjs reports a refusal and
// goes on. Outside GitHub Actions it only says what it would do, unless
// PRISM_REGISTRY_TOKEN names a token (a test against a local gateway).
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The Prism registry every app registers with. Empty until it is served.
const DEFAULT_REGISTRY = "";
const PRISM_CODE = "prism-code@0.5.0";

const say = (text) => console.log(`register: ${text}`);
const repoOf = (link) => (String(link ?? "").match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/) ?? [])[1] ?? "";

// The OIDC token: from the run, for the registry's audience.
async function oidcToken() {
  if (process.env.PRISM_REGISTRY_TOKEN) return process.env.PRISM_REGISTRY_TOKEN;
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const bearer = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !bearer) return null;
  const response = await fetch(`${url}&audience=${encodeURIComponent(process.env.PRISM_REGISTRY_AUDIENCE || "prism-registry")}`, { headers: { authorization: `bearer ${bearer}` } });
  if (!response.ok) throw new Error(`GitHub gave no OIDC token (${response.status}); does the job have id-token: write?`);
  return (await response.json()).value;
}

// prism-code push, with the token in a Docker config only it reads, removed after.
async function push(holo, reference, host, token, plainHttp) {
  const config = await mkdtemp(join(process.env.RUNNER_TEMP || tmpdir(), "prism-registry-"));
  try {
    const auth = Buffer.from(`oidc:${token}`).toString("base64");
    await writeFile(join(config, "config.json"), JSON.stringify({ auths: { [host]: { auth } } }), { mode: 0o600 });
    const args = ["--yes", PRISM_CODE, "push", holo, reference, "--json", ...(plainHttp ? ["--plain-http"] : [])];
    const out = await new Promise((done, fail) => {
      const child = spawn("npx", args, { env: { ...process.env, DOCKER_CONFIG: config }, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
      child.on("error", fail);
      child.on("close", (code) => (code === 0 ? done(stdout) : fail(new Error(`prism-code push exited ${code}: ${stderr.trim().split("\n").slice(-2).join(" ")}`))));
    });
    return JSON.parse(out.slice(out.indexOf("{")));
  } finally {
    await rm(config, { recursive: true, force: true });
  }
}

export async function register(site = "site") {
  const meta = JSON.parse(await readFile(join(site, "app.json"), "utf8"));
  const host = process.env.PRISM_REGISTRY || meta.registry || DEFAULT_REGISTRY;
  if (!host) return say("no Prism registry is named yet; not registered");
  if (meta.index === false) return say('app.json says "index": false; not registered');
  const repository = repoOf(meta.repository);
  if (!repository) throw new Error(`app.json's repository (${meta.repository}) is not a GitHub repository link`);
  const building = process.env.GITHUB_REPOSITORY;
  if (building && building.toLowerCase() !== repository.toLowerCase()) throw new Error(`app.json names ${repository}, but this run builds ${building}`);
  const live = new URL(meta.live).href;
  const holo = resolve(site, "app.holo");
  const plainHttp = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const reference = `${host}/prism/${repository.toLowerCase()}:latest`;

  const token = await oidcToken();
  if (!token) return say(`would push ${holo} to ${reference} and register ${live}; no OIDC token here, so nothing is sent`);

  const result = await push(holo, reference, host, token, plainHttp);
  // The archive fingerprint, as BLAKE3 hex (the push reports it with its algorithm).
  const fingerprint = String(result.fingerprint).replace(/^blake3:/, "");
  say(`pushed ${result.reference} (fingerprint ${fingerprint.slice(0, 12)}…)`);

  const response = await fetch(`${plainHttp ? "http" : "https"}://${host}/prism/register`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ fingerprint, live, name: meta.name }),
  });
  if (!response.ok) throw new Error(`the registry refused the registration (${response.status}): ${await response.text()}`);
  const entry = await response.json();
  say(`registered ${live} as ${entry.reference} (registration ${entry.sequence})`);
  return entry;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await register(process.argv[2] ?? "site");
