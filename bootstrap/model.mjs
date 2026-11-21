// Publishes the app's model beside its page, so anyone the page reaches can
// open, check and prove the model the holo was built from, in a browser, from
// the app's own address (Prism IDE; the frame's "Open in IDE" leads there).
//
// Written into the site:
//   model/<path>          every file LexLean reads to check the model (app/)
//   model/project.json    the listing, prism/model-listing/1:
//                         { schema, files, entry, semanticId }
//   app.holo.json         the record, prism/holo-app/1:
//                         { schema, name, holo, bytes, semanticId }
// `holo` is the BLAKE3 label of the whole holo file as served; `semanticId` is
// the identity LexLean gave the model, taken from the holo's own provenance,
// never from the checkout. Prism IDE fetches the holo and the model, derives
// both again in the tab, and says the model is the app's only when both are
// what this record names. So the record is a claim to be checked, not a proof.
//
// The formats are prism-code's (sdk/npm/prism-code/src/journey/model-files.mjs
// and ide/edit/holo-match.mjs in UOR-Foundation/prismpm), written here as that
// repository writes them. Left out of model/, because a check does not read
// them or because they are not the author's to publish: names that start with
// a dot, target/ and node_modules/, notes (.md), logs (.log), and every .json
// but lake-manifest.json.
//   import { publishModel } from "./model.mjs"
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const MODEL_LISTING_SCHEMA = "prism/model-listing/1";
export const HOLO_APP_SCHEMA = "prism/holo-app/1";
const SKIPPED = new Set(["target", "node_modules"]);

/** `{ files: Map<path, bytes>, entry }` for the LexLean project in `dir`. Throws when lexlean.toml names no entrypoint. */
export async function modelFiles(dir) {
  const files = new Map();
  const visit = async (at, rel) => {
    const entries = (await readdir(at, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) {
        if (!SKIPPED.has(entry.name)) await visit(join(at, entry.name), `${rel}${entry.name}/`);
      } else if (entry.isFile() && (!/\.(md|json|log)$/.test(entry.name) || entry.name === "lake-manifest.json")) {
        files.set(rel + entry.name, await readFile(join(at, entry.name)));
      }
    }
  };
  await visit(dir, "");
  const entry = /entrypoints\s*=\s*\[\s*"([^"]+)"/.exec(new TextDecoder().decode(files.get("lexlean.toml") ?? new Uint8Array()))?.[1];
  if (!entry || !files.has(entry)) throw new Error("app/lexlean.toml names no entrypoint that is in the project");
  return { files: new Map([...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))), entry };
}

/**
 * Write the model and its record into `site`. `holo` is the holo's bytes as the site serves them and `semanticId`
 * the identity its provenance names. Resolves `{ files, entry, holo, semanticId }`. Throws, having written
 * nothing, when the holo names no model identity or `app` holds no LexLean project.
 */
export async function publishModel({ site, app, holo, semanticId, name }) {
  if (typeof semanticId !== "string" || !/^[0-9a-f]{64}$/.test(semanticId)) throw new Error("the holo names no model identity");
  const model = await modelFiles(app);
  const { blake3Hex } = await import(new URL("../try/vendor/prism-code/src/blake3.mjs", import.meta.url));
  const label = `blake3:${blake3Hex(holo)}`;
  await rm(join(site, "model"), { recursive: true, force: true });
  for (const [path, bytes] of model.files) {
    await mkdir(dirname(join(site, "model", path)), { recursive: true });
    await writeFile(join(site, "model", path), bytes);
  }
  await writeFile(join(site, "model", "project.json"), `${JSON.stringify({ schema: MODEL_LISTING_SCHEMA, files: [...model.files.keys()], entry: model.entry, semanticId })}\n`);
  await writeFile(join(site, "app.holo.json"), `${JSON.stringify({ schema: HOLO_APP_SCHEMA, name, holo: label, bytes: holo.length, semanticId })}\n`);
  return { files: model.files.size, entry: model.entry, holo: label, semanticId };
}
