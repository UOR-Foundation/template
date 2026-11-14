import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./app.mjs", import.meta.url), "utf8");
const workerSource = await readFile(new URL("./guest-worker.mjs", import.meta.url), "utf8");
const flush = async () => { for (let i = 0; i < 10; i++) await new Promise(setImmediate); };
const identities = { verified: true, archiveFingerprint: "exact-test-fingerprint" };
const application = (overrides = {}) => ({
  identities,
  dispatch: async (request) => request,
  acceptance: async () => ({ total: 2, passed: 1, failed: [{ index: 1 }] }),
  ...overrides,
});
const failure = (code) => Object.assign(new Error(code), { code });

async function workerHarness(load) {
  const replies = [];
  let receive = () => {};
  const self = { postMessage: (reply) => {
    const cloned = structuredClone(reply);
    replies.push(cloned);
    receive(cloned);
  } };
  const context = vm.createContext({ self });
  const module = new vm.SourceTextModule(workerSource, { context });
  await module.link(async (specifier) => {
    assert.equal(specifier, "./worker-runtime/browser.mjs", "use the packaged locked full archive loader");
    return new vm.SyntheticModule(["load"], function () { this.setExport("load", load); }, { context });
  });
  await module.evaluate();
  return { replies, send: (data) => self.onmessage({ data }), listen: (fn) => { receive = fn; } };
}

// Execute the complete, unmodified production modules. Only browser APIs and
// the imported runtime are doubles; no production function is reconstructed.
async function startPage({ mode = "working", load = async () => application(), workspace = false } = {}) {
  const events = [];
  const elements = new Map();
  const element = (id) => {
    if (id === "input" && !workspace) return null;
    if (!elements.has(id)) elements.set(id, {
      textContent: id === "app-data" ? '{"card":true}' : "",
      attrs: {}, value: "", placeholder: "request", children: [], listeners: {},
      style: { setProperty() {} }, focus() {},
      addEventListener(kind, fn) { this.listeners[kind] = fn; },
      querySelectorAll() { return []; },
      append(...children) { this.children.push(...children); },
      prepend(child) { this.children.unshift(child); },
      setAttribute(name, value) { this.attrs[name] = value; },
    });
    return elements.get(id);
  };
  let runner;
  let client;
  let terminated = false;
  const actual = await workerHarness(async (url) => {
    events.push(`worker-load:${url}`);
    return load(url);
  });
  class Worker {
    constructor(url, options) {
      events.push("worker-created");
      assert.equal(url, "./guest-worker.mjs");
      assert.equal(options.type, "module");
      if (mode === "constructor") throw new Error("unavailable");
      client = this;
      actual.listen((reply) => { if (!terminated) this.onmessage({ data: reply }); });
    }
    postMessage(data) {
      if (mode === "post") throw new Error("transport failure");
      queueMicrotask(() => {
        if (mode === "startup") this.onerror({ preventDefault() {} });
        else actual.send(structuredClone(data));
      });
    }
    terminate() { terminated = true; }
  }
  const context = vm.createContext({
    TextEncoder, TextDecoder, URL, console,
    document: { getElementById: element, createElement: (tag) => element(`created-${tag}-${elements.size}`), documentElement: {}, baseURI: "https://example.test/app/" },
    navigator: { onLine: true }, location: { hash: "", search: "" },
    customElements: { get: () => true }, addEventListener() {},
    performance: { getEntriesByName: () => [{}] },
    requestAnimationFrame: (fn) => queueMicrotask(fn),
    clearTimeout() {},
    setTimeout: (fn, delay) => { if (delay !== 900) queueMicrotask(fn); return 1; },
    ...(mode === "absent" ? {} : { Worker }),
  });
  const page = new vm.SourceTextModule(source, {
    context,
    importModuleDynamically: async (specifier) => {
      events.push(`main-import:${specifier}`);
      let exports;
      if (specifier === "./vendor/prism-code/src/browser.mjs") exports = { load };
      else if (specifier === "./card.mjs") exports = { default: ({ app }) => { runner = app; } };
      else throw new Error(`unexpected import ${specifier}`);
      const module = new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context });
      await module.link(() => { throw new Error("unexpected import"); });
      await module.evaluate();
      return module;
    },
  });
  await page.link(() => { throw new Error("unexpected static import"); });
  await page.evaluate();
  await flush();
  return { events, elements, runner, client, actual, terminated: () => terminated };
}

for (const mode of ["absent", "constructor", "startup", "post"]) {
  test(`FR-01: ${mode} worker retains fully verified fallback`, async () => {
    let loads = 0;
    const page = await startPage({ mode, load: async (url) => {
      assert.equal(url, "https://example.test/app/app.holo");
      loads++;
      return application();
    } });
    assert.ok(page.events.includes("main-import:./vendor/prism-code/src/browser.mjs"));
    assert.equal(loads, 1);
    assert.equal(page.elements.get("frame").attrs.verdict, "good");
    assert.equal(page.elements.get("frame").attrs.examples, "1/2");
  });
}

test("FR-01: working worker owns load, identities, dispatch and acceptance", async () => {
  let loads = 0;
  let replays = 0;
  const page = await startPage({ load: async (url) => {
    assert.equal(url, "https://example.test/app/app.holo");
    loads++;
    return application({ acceptance: async () => { replays++; return { total: 2, passed: 1, failed: [{ index: 1 }] }; } });
  } });
  assert.equal(loads, 1);
  assert.equal(replays, 1);
  assert.deepEqual(page.events.filter((event) => event.includes("main-import:") && event.includes("prism-code/")), []);
  assert.equal(page.elements.get("frame").attrs.fingerprint, identities.archiveFingerprint);
  assert.equal(page.elements.get("frame").attrs.verdict, "good");
  const request = new Uint8Array([1, 2, 3]);
  assert.deepEqual(await page.runner.dispatch(request), request);
  assert.deepEqual(await page.runner.dispatch(request), request);
  const result = await page.runner.acceptance();
  assert.deepEqual(result.failed, [{ index: 1 }]);
  assert.equal(replays, 2);
});

test("FR-01: archive rejection is final, never main-thread fallback", async () => {
  const page = await startPage({ load: async () => { throw failure("archive.fingerprint"); } });
  assert.equal(page.actual.replies[0].code, "archive.fingerprint");
  assert.equal(page.actual.replies[0].ok, false);
  assert.equal(page.elements.get("frame").attrs.verdict, "bad");
  assert.equal(page.runner, null);
  assert.ok(page.terminated());
  assert.ok(!page.events.some((event) => event.startsWith("main-import:") && event.includes("prism-code/")));
});

test("FR-01: unverified identities cannot enable the page or guest", async () => {
  const page = await startPage({ load: async () => application({ identities: { ...identities, verified: false } }) });
  assert.equal(page.runner, null);
  assert.equal(page.elements.get("frame").attrs.verdict, "bad");
  assert.equal(page.elements.get("frame").attrs.examples, "error");
  await page.actual.send({ id: 99, kind: "dispatch", request: new Uint8Array() });
  assert.equal(page.actual.replies.at(-1).code, "frame.worker.not-verified");
});

test("FR-01: worker protocol refuses premature, repeated and unknown requests", async () => {
  let finish;
  const worker = await workerHarness(() => new Promise((resolve) => { finish = resolve; }));
  await worker.send({ id: 0, kind: "dispatch" });
  assert.equal(worker.replies.at(-1).code, "frame.worker.not-ready");
  const init = worker.send({ id: 1, kind: "init", source: "https://example.test/app.holo" });
  await worker.send({ id: 2, kind: "acceptance" });
  assert.equal(worker.replies.at(-1).code, "frame.worker.not-ready");
  await worker.send({ id: 3, kind: "init" });
  assert.equal(worker.replies.at(-1).code, "frame.worker.initialized");
  finish(application());
  await init;
  await worker.send({ id: 4, kind: "unknown" });
  assert.equal(worker.replies.at(-1).code, "frame.worker.request");
});

test("FR-01: dispatch and acceptance preserve runtime refusal codes", async () => {
  const page = await startPage({ load: async () => application({
    dispatch: async () => { throw failure("guest.request-size"); },
    acceptance: async () => { throw failure("acceptance.mismatch"); },
  }) });
  assert.equal(page.elements.get("frame").attrs.examples, "error");
  await assert.rejects(page.runner.dispatch(new Uint8Array()), { code: "guest.request-size" });
  await assert.rejects(page.runner.acceptance(), { code: "acceptance.mismatch" });
});

for (const kind of ["error", "messageerror", "malformed", "unknown-id"]) {
  test(`FR-01: ${kind} fails pending and future calls without fallback`, async () => {
    const page = await startPage({ load: async () => application({ dispatch: () => new Promise(() => {}) }) });
    const first = assert.rejects(page.runner.dispatch(new Uint8Array()), { code: "frame.worker" });
    const second = assert.rejects(page.runner.dispatch(new Uint8Array()), { code: "frame.worker" });
    if (kind === "error") page.client.onerror({ preventDefault() {} });
    if (kind === "messageerror") page.client.onmessageerror();
    if (kind === "malformed") page.client.onmessage({ data: { id: 2 } });
    if (kind === "unknown-id") page.client.onmessage({ data: { id: -1, ok: true } });
    await Promise.all([first, second]);
    await assert.rejects(page.runner.acceptance(), { code: "frame.worker" });
    assert.ok(page.terminated());
    assert.ok(!page.events.some((event) => event.startsWith("main-import:") && event.includes("prism-code/")));
  });
}


test("FR-01: UI keeps newest answer and Enter history across worker replies", async () => {
  const pending = new Map();
  const page = await startPage({ workspace: true, load: async () => application({
    dispatch: (request) => new Promise((resolve) => pending.set(new TextDecoder().decode(request), resolve)),
  }) });
  const input = page.elements.get("input");
  const out = page.elements.get("out");
  input.value = "first";
  input.listeners.input();
  input.value = "second";
  input.listeners.input();
  await flush();
  pending.get("second")(new TextEncoder().encode("latest"));
  await flush();
  pending.get("first")(new TextEncoder().encode("stale"));
  await flush();
  assert.equal(out.textContent, "Latest");
  input.value = "saved";
  input.listeners.keydown({ key: "Enter" });
  await flush();
  pending.get("saved")(new TextEncoder().encode("kept"));
  await flush();
  assert.equal(out.textContent, "Kept");
  assert.equal(page.elements.get("hist").children.length, 1);
  input.value = "";
  input.listeners.input();
  assert.equal(out.textContent, "—");
  input.value = "hex:zz";
  input.listeners.input();
  await flush();
  assert.equal(out.textContent, "Invalid request");
});
