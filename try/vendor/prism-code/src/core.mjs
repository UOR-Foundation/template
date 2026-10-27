/**
 * The Core-Wasm guest (`SPEC.md` §7): an import-free wasm32 module exporting
 * `memory`, `holo_alloc(i32) -> i32` and `holo_run(i32, i32) -> i64`. The i64
 * packs `offset << 32 | length` of the response in guest memory. The guest
 * allocator never frees, so every request gets a fresh instance. This is the
 * loop PrismPM's own acceptance driver (`text_cli/acceptance.mjs`) runs.
 */
import { fail } from './errors.mjs';

export const CORE_CONTRACT = 'hologram:guest/core-wasm@1';
const REQUIRED_EXPORTS = ['memory', 'holo_alloc', 'holo_run'];

export async function compileGuest(wasmBytes) {
  let module;
  try {
    module = await WebAssembly.compile(wasmBytes);
  } catch (error) {
    fail('core.compile', `guest does not compile: ${error.message}`);
  }
  const declaredImports = WebAssembly.Module.imports(module);
  if (declaredImports.length !== 0) {
    fail('core.imports', `guest declares ${declaredImports.length} imports; the Core-Wasm contract allows none`, declaredImports);
  }
  const exportNames = WebAssembly.Module.exports(module).map((e) => e.name).sort();
  const expected = [...REQUIRED_EXPORTS].sort();
  if (exportNames.length !== expected.length || exportNames.some((n, i) => n !== expected[i])) {
    fail('core.exports', `guest exports ${JSON.stringify(exportNames)}, expected ${JSON.stringify(expected)}`);
  }
  return module;
}

/**
 * Run one request on a fresh instance of the compiled guest and return a copy
 * of the response bytes.
 */
export function runGuest(module, request, limits = {}) {
  if (!(request instanceof Uint8Array)) fail('core.request', 'request must be a Uint8Array');
  if (limits.guestAllocation !== undefined && request.length > limits.guestAllocation) {
    fail('core.allocation', `request of ${request.length} bytes exceeds the guest allocation maximum ${limits.guestAllocation}`);
  }
  const { exports } = new WebAssembly.Instance(module, {});
  const at = exports.holo_alloc(request.length) >>> 0;
  new Uint8Array(exports.memory.buffer, at, request.length).set(request);
  const packed = BigInt.asUintN(64, exports.holo_run(at, request.length));
  const offset = Number(packed >> 32n);
  const length = Number(packed & 0xffffffffn);
  if (offset + length > exports.memory.buffer.byteLength) {
    fail('core.response', `guest response ${offset}+${length} lies outside its memory`);
  }
  return new Uint8Array(exports.memory.buffer.slice(offset, offset + length));
}

function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Replay acceptance vectors through `dispatch`; byte comparison, no decoding. */
export async function runAcceptance(vectors, dispatch) {
  const failed = [];
  let index = 0;
  for (const vector of vectors) {
    let actual;
    try {
      actual = await dispatch(vector.request);
    } catch (error) {
      failed.push({ index, request: vector.request, expected: vector.response, error });
      index++;
      continue;
    }
    if (!equalBytes(actual, vector.response)) {
      failed.push({ index, request: vector.request, expected: vector.response, actual });
    }
    index++;
  }
  return { total: vectors.length, passed: vectors.length - failed.length, failed };
}
