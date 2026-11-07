// Registers this app's address with the Prism registry: the canonical kappa
// registry, which indexes every Prism app by its self-verifying address and
// which every app's address bar and Holo Search read. bootstrap/page.mjs
// calls it at the end of a GitHub Actions build, so every app that takes the
// template's page files registers on each deploy, with no workflow of its own
// to change.
//
// Only the address is sent: the holo's fingerprint (its last 32 bytes, the
// BLAKE3 of the rest) and the live page that serves it. The bytes stay on the
// app's own site. The run proves which repository it is with the OIDC token
// GitHub mints for it: no secret, and a run registers only its own
// repository. The registry's indexer then fetches the live holo, checks it has
// that fingerprint, verifies it and replays every example; only then is its
// address stored in kappa and listed.
//
//   node bootstrap/register.mjs site     the same, by hand (needs an OIDC token)
//
// The registry is PRISM_REGISTRY, or app.json's "registry", or
// DEFAULT_REGISTRY. "index": false in app.json opts out. Nothing here ever
// fails a build: page.mjs reports a refusal and goes on. Outside GitHub
// Actions it only says what it would do, unless PRISM_REGISTRY_TOKEN names a
// token (a test against a local gateway).
import { open, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The Prism registry: the canonical kappa registry's public face.
export const DEFAULT_REGISTRY = "registry.uor.foundation";

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

// A holo's fingerprint: its footer, the last 32 bytes.
async function fingerprintOf(path) {
  const file = await open(path);
  try {
    const { size } = await file.stat();
    if (size < 64) throw new Error(`${path} is too short to be a holo`);
    const footer = Buffer.alloc(32);
    await file.read(footer, 0, 32, size - 32);
    return footer.toString("hex");
  } finally {
    await file.close();
  }
}

export async function register(site = "site") {
  const meta = JSON.parse(await readFile(join(site, "app.json"), "utf8"));
  const host = process.env.PRISM_REGISTRY || meta.registry || DEFAULT_REGISTRY;
  if (meta.index === false) return say('app.json says "index": false; not registered');
  const repository = repoOf(meta.repository);
  if (!repository) throw new Error(`app.json's repository (${meta.repository}) is not a GitHub repository link`);
  const building = process.env.GITHUB_REPOSITORY;
  if (building && building.toLowerCase() !== repository.toLowerCase()) throw new Error(`app.json names ${repository}, but this run builds ${building}`);
  const live = new URL(meta.live).href;
  const fingerprint = await fingerprintOf(resolve(site, "app.holo"));
  const plainHttp = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);

  const token = await oidcToken();
  if (!token) return say(`would register ${live} as blake3:${fingerprint.slice(0, 12)}… with ${host}; no OIDC token here, so nothing is sent`);

  const response = await fetch(`${plainHttp ? "http" : "https"}://${host}/prism/register`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ fingerprint, live, name: meta.name }),
    signal: AbortSignal.timeout(30e3),
  });
  if (!response.ok) throw new Error(`the registry refused the registration (${response.status}): ${await response.text()}`);
  const entry = await response.json();
  say(`registered ${live} as ${entry.address} (registration ${entry.sequence}); listed once the indexer verifies it`);
  return entry;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await register(process.argv[2] ?? "site");
