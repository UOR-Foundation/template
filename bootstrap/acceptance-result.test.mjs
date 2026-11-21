import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { acceptanceSummary } from "../site/acceptance-result.mjs";

const here = new URL("../site/guest-worker.mjs", import.meta.url);

async function runWorker(result) {
  const source = await readFile(here, "utf8");
  const withoutImport = source.replace(
    /^import \{ compileGuest, runGuest, runAcceptance \} from "\.\/vendor\/prism-code\/src\/core\.mjs";\n/m,
    "",
  );
  assert.notEqual(withoutImport, source, "exercise the exact source import, not a stub module");
  const messages = [];
  const worker = { postMessage: (value) => messages.push(value) };
  vm.runInNewContext(withoutImport, {
    self: worker,
    compileGuest: async () => "guest",
    runGuest: () => new Uint8Array([42]),
    runAcceptance: async () => result,
  });
  await worker.onmessage({ data: { kind: "init", id: 0, wasm: [], limits: {} } });
  await worker.onmessage({ data: { kind: "acceptance", id: 1, vectors: [1, 2, 3] } });
  return messages.at(-1);
}

test("worker preserves failing vector identities but not raw vector contents", async () => {
  const workerMessage = await runWorker({
    total: 3, passed: 2,
    failed: [{ index: 1, request: new Uint8Array([7]), expected: new Uint8Array([8]), error: new Error("refused") }],
  });
  assert.equal(workerMessage.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(workerMessage.value)), {
    total: 3, passed: 2, failed: [{ index: 1 }],
  });
  assert.deepEqual(acceptanceSummary(workerMessage.value, 3), {
    total: 3, passed: 2, failed: [1],
  });
});

test("worker preserves a zero-failures result", async () => {
  const result = await runWorker({ total: 3, passed: 3, failed: [] });
  assert.equal(result.ok, true);
  assert.deepEqual(acceptanceSummary(result.value, 3), { total: 3, passed: 3, failed: [] });
});

test("worker reports malformed result as an error, not a success", async () => {
  const result = await runWorker({ total: 3, passed: 2 });
  assert.equal(result.ok, false);
});

test("missing, duplicated and out-of-range failures refuse", () => {
  const cases = [
    { total: 3, passed: 2 },
    { total: 3, passed: 3, failed: [{ index: 0 }] },
    { total: 3, passed: 1, failed: [{ index: 2 }, { index: 2 }] },
    { total: 3, passed: 2, failed: [{ index: -1 }] },
    { total: 3, passed: 2, failed: [{ index: 3 }] },
    { total: 3, passed: 2, failed: [{ index: "1" }] },
    { total: 3, passed: 2, failed: [null] },
    { total: 4, passed: 3, failed: [{ index: 1 }] },
    { total: 3, passed: -1, failed: [{ index: 0 }] },
  ];
  for (const fixture of cases) assert.throws(() => acceptanceSummary(fixture, 3));
});

test("fully declared negative result identifies every failing vector", () => {
  assert.deepEqual(acceptanceSummary({ total: 3, passed: 0,
    failed: [{ index: 0 }, { index: 1 }, { index: 2 }] }, 3), {
    total: 3, passed: 0, failed: [0, 1, 2],
  });
});

test("spec view marks the correct failing row, not all green", async () => {
  const { apply } = await import("../site/spec.mjs");
  const nodes = new Map();
  for (const id of ["ex-sum", "ck-ex", "ck-ex-dot", "vt-0", "vt-1", "vt-2"]) {
    nodes.set(id, { className: "", textContent: "", innerHTML: "" });
  }
  const prior = globalThis.document;
  globalThis.document = { getElementById: (id) => nodes.get(id) ?? null };
  try {
    apply({ result: acceptanceSummary({ total: 3, passed: 2, failed: [{ index: 1 }] }, 3) });
    assert.match(nodes.get("vt-0").className, /good/);
    assert.match(nodes.get("vt-1").className, /bad/);
    assert.match(nodes.get("vt-2").className, /good/);
    assert.equal(nodes.get("ex-sum").textContent, "2 of 3 hold");
    assert.match(nodes.get("ck-ex-dot").className, /bad/);
  } finally {
    globalThis.document = prior;
  }
});
