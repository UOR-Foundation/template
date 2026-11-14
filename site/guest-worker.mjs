// The locked runtime owns archive verification, compilation and execution.
// Keep the verified application here; only identities and request results
// cross the boundary. No parsed archive or guest bytes are trusted from the UI.
import { load } from "./worker-runtime/browser.mjs";

let app = null;
let started = false;
const refuse = (code) => { throw Object.assign(new Error(code), { code }); };
const describe = (error) => error?.code ?? error?.message ?? String(error);

self.onmessage = async ({ data }) => {
  const { id, kind } = data;
  try {
    if (kind === "init") {
      if (started) refuse("frame.worker.initialized");
      started = true;
      app = await load(data.source);
      self.postMessage({ id, ok: true, value: app.identities });
    } else {
      if (!app) refuse("frame.worker.not-ready");
      if (!app.identities.verified) refuse("frame.worker.not-verified");
      if (kind === "dispatch") {
        self.postMessage({ id, ok: true, value: await app.dispatch(data.request) });
      } else if (kind === "acceptance") {
        const result = await app.acceptance();
        self.postMessage({ id, ok: true, value: {
          total: result.total, passed: result.passed,
          failed: (result.failed ?? []).map(({ index }) => ({ index })),
        } });
      } else {
        refuse("frame.worker.request");
      }
    }
  } catch (error) {
    self.postMessage({ id, ok: false, error: describe(error), code: error?.code });
  }
};
