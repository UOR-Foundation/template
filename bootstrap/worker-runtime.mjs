// Module workers have no document import map. Package the locked runtime with
// the same explicit crypto adapter the page already selects. These are module
// address changes only: no archive parser, verifier or guest loop is replaced.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";

const MODULES = ["browser.mjs", "index.mjs", "archive.mjs", "view.mjs", "core.mjs", "closure.mjs", "errors.mjs", "canonical/index.js", "blake3.mjs", "sha256.mjs"];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const refusal = (message) => Object.assign(new Error(`frame.worker.bundle: ${message}`), { code: "frame.worker.bundle" });

export async function prepareWorkerRuntime(site, vendor) {
  const output = join(site, "worker-runtime");
  const files = [];
  // Validate the whole graph before writing anything. Unknown imports are a
  // dependency change to review, never permission to fall back to the UI thread.
  for (const path of MODULES) {
    const source = `prism-code/src/${path}`;
    const before = await readFile(join(vendor, source), "utf8");
    let after = before;
    if (path === "canonical/index.js") {
      const alias = "from 'node:crypto'";
      if (before.split(alias).length !== 2) throw refusal("the canonical crypto import changed");
      after = before.replace(alias, "from '../node-crypto-shim.mjs'");
    }
    // The locked package uses one-line static imports. Validate those edges;
    // lazy Node/closure loaders retain their original code and are not linked
    // by browser.loadArchive. The real module-link test checks this inventory.
    const imports = [...after.matchAll(/^\s*(?:import\s+(?:[^;\n]*?\s+from\s+)?|export\s+[^;\n]*?\s+from\s+)(["'])([^"']+)\1/gm)];
    for (const [, , specifier] of imports) {
      if (!specifier.startsWith(".")) throw refusal(`unregistered import ${specifier} in ${path}`);
      const target = posix.normalize(posix.join(posix.dirname(path), specifier));
      if (!MODULES.includes(target) && target !== "node-crypto-shim.mjs") throw refusal(`import ${specifier} in ${path} is outside the locked runtime`);
    }
    files.push({ path, source, before, after });
  }
  const shim = await readFile(join(vendor, "node-crypto-shim.mjs"), "utf8");
  files.push({ path: "node-crypto-shim.mjs", source: "node-crypto-shim.mjs", before: shim, after: shim });
  for (const file of files) {
    await mkdir(dirname(join(output, file.path)), { recursive: true });
    await writeFile(join(output, file.path), file.after);
  }
  const receipt = { schema: "prism/worker-runtime-packaging/1", files: files.map(({ path, source, before, after }) => ({ path, source, source_sha256: digest(before), output_sha256: digest(after) })) };
  await writeFile(join(output, "packaging.json"), JSON.stringify(receipt, null, 2) + "\n");
  return output;
}
