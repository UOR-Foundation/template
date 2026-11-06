// Runs the holo's guest off the page's main thread. A request that takes a
// second on a slow phone (a chess reply, a long search) never blocks a tap or
// a paint. The page loads and verifies the holo itself and sends this worker
// the guest bytes of that same verified archive; the worker only compiles and
// runs them with the runtime's own guest loop, one fresh instance per request.
import { compileGuest, runGuest, runAcceptance } from "./vendor/prism-code/src/core.mjs";

let guest = null;
let limits = {};

const describe = (error) => error?.code ?? error?.message ?? String(error);

self.onmessage = async ({ data }) => {
  const { id, kind } = data;
  try {
    if (kind === "init") {
      guest = await compileGuest(data.wasm);
      limits = data.limits;
      self.postMessage({ id, ok: true });
    } else if (kind === "dispatch") {
      self.postMessage({ id, ok: true, value: runGuest(guest, data.request, limits) });
    } else if (kind === "acceptance") {
      const result = await runAcceptance(data.vectors, async (request) => runGuest(guest, request, limits));
      self.postMessage({ id, ok: true, value: { total: result.total, passed: result.passed } });
    }
  } catch (error) {
    self.postMessage({ id, ok: false, error: describe(error) });
  }
};
