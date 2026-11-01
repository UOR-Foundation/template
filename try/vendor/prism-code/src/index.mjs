/**
 * prism-code — the JavaScript runtime for Prism SDK (PrismPM) applications.
 *
 * `load(source)` opens what PrismPM generates, a Hologram v4 `.holo` archive or
 * the six-file browser closure, verifies its identities, and returns an
 * application object whose `dispatch(bytes)` runs the modeled guest and whose
 * `acceptance()` replays the modeled vectors. Nothing here compiles, proves or
 * produces an artifact; those stay in the SDK image.
 */
import { parseArchive, resolveArchive, asBytes } from './archive.mjs';
import { decodeHoloview } from './view.mjs';
import { compileGuest, runGuest, runAcceptance } from './core.mjs';
import { verifyClosure, closureDispatch, initializeGlue } from './closure.mjs';
import { PrismCodeError, fail } from './errors.mjs';
import * as canonical from './canonical/index.js';

export { PrismCodeError } from './errors.mjs';
export { parseArchive, resolveArchive, canonicalJson } from './archive.mjs';
export { decodeHoloview, encodeHoloview } from './view.mjs';
export { compileGuest, runGuest, runAcceptance } from './core.mjs';
export { verifyClosure, closureDispatch, initializeGlue } from './closure.mjs';
export { blake3, blake3Hex, kappa } from './blake3.mjs';

const decoder = new TextDecoder('utf-8', { fatal: true });

function isNode() {
  return typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
}

function limitsOf(application) {
  return {
    request: application.request_maximum,
    response: application.response_maximum,
    guestAllocation: application.guest_allocation_maximum,
  };
}

function vectorsOf(application) {
  const list = Array.isArray(application.acceptance_vectors) ? application.acceptance_vectors : [];
  return list.map((v) => ({ request: Uint8Array.from(v.request), response: Uint8Array.from(v.response) }));
}

function profileOf(modelDocument) {
  return modelDocument.application?.profile ?? modelDocument.schema ?? null;
}

function evidenceOf(provenance) {
  return {
    leanManifestSha256: provenance.lean_manifest_sha256 ?? null,
    lcnfManifestSha256: provenance.lcnf_manifest_sha256 ?? null,
    lexleanCommit: provenance.lexlean_commit ?? null,
    lean4ProdCommit: provenance.lean4_prod_commit ?? null,
    hologramLiveCommit: provenance.hologram_live_commit ?? null,
    uorHologramCommit: provenance.uor_hologram_commit ?? null,
    generatedCoreSha256: provenance.generated_core_sha256 ?? null,
    compilerSemanticsId: provenance.compiler_semantics_id ?? null,
    stdlibSemanticsId: provenance.stdlib_semantics_id ?? null,
  };
}

/** Open a `.holo` archive from bytes. */
export async function loadArchive(source) {
  const parsed = parseArchive(asBytes(source));
  const resolved = resolveArchive(parsed);
  const { modelDocument, provenance, directory } = resolved;
  const application = modelDocument.application ?? fail('archive.model', 'model document has no application');
  const module = await compileGuest(resolved.guest.content);
  const limits = limitsOf(application);
  const vectors = vectorsOf(application);
  const view = decodeHoloview(resolved.view.content);
  let metadata = null;
  if (parsed.metadata) {
    try {
      metadata = JSON.parse(parsed.metadata.text);
    } catch {
      metadata = parsed.metadata.text;
    }
  }
  const dispatch = async (request) => runGuest(module, asBytes(request), limits);
  return Object.freeze({
    kind: 'holo',
    name: application.name ?? provenance.cargo_name ?? null,
    model: modelDocument,
    profile: profileOf(modelDocument),
    limits,
    vectors,
    provenance: { model: provenance, browser: null },
    directory,
    metadata,
    identities: resolved.identities,
    evidence: evidenceOf(provenance),
    view,
    archive: parsed,
    dispatch,
    acceptance: () => runAcceptance(vectors, dispatch),
  });
}

/**
 * Open a six-file closure. `files` maps file names to bytes; `importGlue(name)`
 * imports the wasm-bindgen glue module by file name (a file URL in Node, a
 * URL in browsers). `model` is optional and only needed to dispatch through a
 * numeric-profile closure, whose wire format lives in the model document.
 */
export async function loadClosure(files, importGlue, { model = null } = {}) {
  const { stem, glueName, wasmName, provenance, verification } = await verifyClosure(files);
  const glue = initializeGlue(await importGlue(glueName), files.get(wasmName));
  const modelDocument = model ? (model instanceof Uint8Array ? JSON.parse(decoder.decode(model)) : model) : null;
  const application = modelDocument?.application ?? null;
  const limits = application ? limitsOf(application) : null;
  const vectors = application ? vectorsOf(application) : [];
  const profile = modelDocument ? profileOf(modelDocument) : typeof glue.invoke_bytes === 'function' ? 'text' : 'numeric';
  const dispatch = closureDispatch(glue, { profile, model: modelDocument, limits });
  const view = { entry: 'index.html', files };
  return Object.freeze({
    kind: 'closure',
    name: stem,
    model: modelDocument,
    profile,
    limits,
    vectors,
    provenance: { model: null, browser: provenance },
    directory: null,
    metadata: null,
    identities: { ...verification, stem, glueName, wasmName },
    evidence: {
      modelId: provenance.model_id ?? null,
      viewModelId: provenance.view_model_id ?? null,
      generatedCoreSha256: provenance.generated_core_sha256 ?? null,
    },
    view,
    dispatch: async (request) => dispatch(asBytes(request)),
    acceptance: () => runAcceptance(vectors, (r) => dispatch(r)),
  });
}

/**
 * Open an application from bytes, a path (Node) or a URL. Bytes and `.holo`
 * paths or URLs open an archive; a directory path or a URL ending in `/`
 * opens a closure.
 */
export async function load(source, options = {}) {
  if (source instanceof Uint8Array || source instanceof ArrayBuffer || ArrayBuffer.isView(source)) {
    return loadArchive(source);
  }
  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    return loadArchive(new Uint8Array(await source.arrayBuffer()));
  }
  if (typeof source === 'string' || source instanceof URL) {
    if (isNode()) {
      const node = await import('./node.mjs');
      return node.fromFile(source, options);
    }
    const browser = await import('./browser.mjs');
    return browser.load(source, options);
  }
  fail('load.source', 'load() takes bytes, a Blob, a path or a URL');
}

// 0.1.0 compatibility: the canonicalization API stays at `prism-code/canonical`.
// These top-level re-exports are deprecated and will be removed in 0.3.0.
let warned = false;
function deprecated(name, fn) {
  return function deprecatedCanonical(...args) {
    if (!warned) {
      warned = true;
      const message = `prism-code: top-level ${name}() is deprecated; import it from 'prism-code/canonical'`;
      if (isNode() && typeof process.emitWarning === 'function') process.emitWarning(message, 'DeprecationWarning');
      else if (typeof console !== 'undefined') console.warn(message);
    }
    return fn(...args);
  };
}
/** @deprecated import from 'prism-code/canonical' */
export const canonicalize = deprecated('canonicalize', canonical.canonicalize);
/** @deprecated import from 'prism-code/canonical' */
export const codeHash = deprecated('codeHash', canonical.codeHash);
/** @deprecated import from 'prism-code/canonical' */
export const describe = deprecated('describe', canonical.describe);
/** @deprecated import from 'prism-code/canonical' */
export const differs = deprecated('differs', canonical.differs);
