// The Rust acceptance suite calls this fixed, complete invocation. Successful
// process exit alone also accepts test.skip/test.todo and name-filtered suites.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const result = spawnSync(process.execPath, [
  "--test", "--test-reporter=tap",
  fileURLToPath(new URL("./sw.test.mjs", import.meta.url)),
], { encoding: "utf8" });
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
assert.ifError(result.error);
assert.equal(result.status, 0, "FR-02 service worker regression failed");
for (const [name, count] of Object.entries({ tests: 5, pass: 5, fail: 0, cancelled: 0, skipped: 0, todo: 0 })) {
  const values = [...result.stdout.matchAll(new RegExp(`^# ${name} (\\d+)$`, "gm"))];
  assert.equal(values.length, 1, `FR-02 requires one ${name} summary`);
  assert.equal(Number(values[0][1]), count, `FR-02 incomplete ${name} count`);
}
