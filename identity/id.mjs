// The Prism sign-in page (prism/identity/3, identity/PROTOCOL.md), on
// https://id.uor.foundation. It holds this browser's device of the visitor's
// Prism id: stitch's Prism id (afflom/stitch, pinned in identity/stitch.lock),
// whose device keys are non-extractable WebCrypto keys made here, with no
// prompt, no password and no passkey. Every app's frame opens this page as a
// small window, so the device lives in this origin's own storage and is the
// same for every app; the window asks once, the visitor continues, and the
// page signs a session for that app (Prism id's signAction) and closes. The
// frame checks the signature against the log itself (verifyAction), so this
// page can fail to help, never lie.
//
// A lost device never loses the id: a new id's first step is a recovery code
// (stitch's recovery device, sealed in an escrow only the code opens). On any
// browser, the code links that browser's own device to the same id. The
// escrow and the devices' sync messages sit in the registry's Prism mailbox,
// addressed by names only holders can derive; the registry reads none of it.

import * as Prism from "./prism-id.mjs";

const REGISTRY = document.querySelector('meta[name="prism-registry"]').content.replace(/\/$/, "");
const SPEC = "prism/identity/3";
// The action a session is: this device lets an app's session key act for the
// id, on that app's origin, until it expires.
const ACTION = "prism/session/1";
const WEEK = 8 * 24 * 60 * 60 * 1000;
const $ = (id) => document.getElementById(id);
const short = (id) => `${id.slice(0, 15)}…${id.slice(-4)}`;

const params = new URLSearchParams(location.hash.slice(1));
if (params.get("theme") === "dark") document.documentElement.classList.add("dark");
const peer = window.opener;

// ---------------------------------------------------------------- this browser's device

// IndexedDB keeps CryptoKeys as they are: a non-extractable key stays one.
function db(mode, work) {
  return new Promise((done, fail) => {
    const open = indexedDB.open("prism-id", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("prism");
    open.onerror = () => fail(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction("prism", mode);
      const request = work(tx.objectStore("prism"));
      tx.oncomplete = () => (open.result.close(), done(request?.result));
      tx.onerror = () => (open.result.close(), fail(tx.error));
    };
  });
}
async function load() {
  const saved = await db("readonly", (s) => s.get("self")).catch(() => null);
  if (!saved) return null;
  return { prism: saved.prism, device: saved.device, keyring: saved.keyring, log: await Prism.logFromRecords(saved.records) };
}
const save = (session) => db("readwrite", (s) => s.put({ prism: session.prism, device: session.device, keyring: session.keyring, records: [...session.log.values()] }, "self"));
const forget = () => db("readwrite", (s) => s.delete("self"));

// ---------------------------------------------------------------- the registry's mailbox

// POST /prism/topic/<name> keeps a message; GET returns the newest. A name is
// derived from a secret (a recovery code, a boundary key), so only holders
// find it, and every message is sealed, so the registry reads nothing.
class Unreachable extends Error {}
async function post(topic, bytes) {
  const response = await fetch(`${REGISTRY}/prism/topic/${topic}`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: bytes }).catch(() => null);
  if (!response?.ok) throw new Unreachable(`The registry did not keep it (${response?.status ?? "unreachable"}).`);
}
async function messages(topic) {
  const response = await fetch(`${REGISTRY}/prism/topic/${topic}`, { cache: "no-store" }).catch(() => null);
  if (response?.status === 404) return [];
  if (!response?.ok) throw new Unreachable("Prism ids are unreachable right now. Try again soon.");
  const { messages = [] } = await response.json();
  return messages.map((text) => Prism.fromBase64Url(text));
}
const bus = { publish: (topic, bytes) => post(topic, bytes) };

// Share this device's log with the id's other devices, under every boundary
// key it holds, so a device that has not seen a rotation yet still hears.
async function share(session) {
  for (const keyId of session.keyring.keys()) await Prism.publishSync(session, bus, { keyId }).catch(() => {});
}
// Take in what the other devices shared. A message that does not open or
// resolve is someone else's or stale: it is skipped, never trusted.
async function pull(session) {
  for (const keyId of [...session.keyring.keys()]) {
    const topic = await Prism.syncTopic(session, keyId);
    for (const bytes of await messages(topic).catch(() => [])) {
      try {
        session = await Prism.receiveSync(session, bytes);
      } catch (error) {
        if (!(error instanceof Prism.PrismIdError) && !(error instanceof DOMException) && !(error instanceof SyntaxError)) throw error;
      }
    }
  }
  return session;
}

// ---------------------------------------------------------------- recovery codes

// A recovery file: the code and its escrow, for when the registry cannot be
// reached. It is as secret as the code.
const fileText = (code, escrow, prism) =>
  `Prism id recovery code\n\n${code}\n\nPrism id ${prism}\n\nOn any device: open the person icon in a Prism app (or https://id.uor.foundation), choose "Use a recovery code" and enter this code, or choose this file.\nAnyone holding it can add a device to your Prism id. Keep it offline.\n\nescrow ${JSON.stringify(escrow)}\n`;

async function makeCode(session) {
  const made = await Prism.createRecovery(session, { now: Date.now() });
  const kept = await post(made.escrow.locator, Prism.canonicalBytes(made.escrow)).then(() => true, () => false);
  await save(made.session);
  await share(made.session);
  return { ...made, kept };
}

// The escrows a code may open: the one in a recovery file, or those in its mailbox.
async function escrowsFor(code, file) {
  if (file) return [file.escrow];
  const locator = await Prism.recoveryLocator(await Prism.decodeCode(code));
  return (await messages(locator)).map((bytes) => {
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return null;
    }
  });
}

async function recover(code, file) {
  await Prism.decodeCode(code);
  let opened = null;
  let escrow = null;
  for (const candidate of await escrowsFor(code, file)) {
    try {
      opened = await Prism.openRecovery(code, candidate);
      escrow = candidate;
      break;
    } catch (error) {
      if (!(error instanceof Prism.PrismIdError)) throw error;
    }
  }
  if (!opened) throw new Prism.PrismIdError("escrow", file ? "That file does not open with that code." : "No Prism id has that recovery code here. If you saved a recovery file, choose it.");
  const synced = await pull(opened);
  const device = await Prism.createDevice({ deviceClass: "browser", protection: "software" });
  const joined = await Prism.recoverOnto(code, escrow, device, { now: Date.now(), log: synced.log }).catch((error) => {
    if (error instanceof Prism.PrismIdError && error.code === "unauthorized") throw new Prism.PrismIdError("unauthorized", "That recovery code was removed from its Prism id.");
    throw error;
  });
  await save(joined);
  await share(joined);
  return joined;
}

// ---------------------------------------------------------------- the request

// Who asked (the browser says) and the app's session to sign.
let request = null;
let app = null;
const valid = (r) =>
  r?.type === `${SPEC}/request` &&
  ["signin", "recovery"].includes(r.mode) &&
  /^[\w-]{87}$/.test(r.sessionKey) &&
  Number.isSafeInteger(r.expires) &&
  r.expires > Date.now() &&
  r.expires <= Date.now() + WEEK;

// Results go only to the app that asked; "ready" carries nothing.
const send = (message) => peer?.postMessage({ ...message, type: `${SPEC}/${message.type}` }, message.type === "ready" ? "*" : app);

addEventListener("message", (event) => {
  if (!peer || event.source !== peer || !valid(event.data)) return;
  if (!/^https?:\/\/[^/]+$/.test(event.origin)) return;
  request = event.data;
  app = event.origin;
  paint();
});

// ---------------------------------------------------------------- the page

let held = null;
// The recovery code on screen, and what "I saved it" does next.
let kit = null;
let view = "loading";

function paint() {
  const asking = Boolean(request);
  const host = app ? new URL(app).host : "";
  for (const id of ["none", "held", "recover", "kit", "removed"]) $(id).hidden = view !== id;
  $("title").textContent = {
    loading: "Prism id",
    none: asking ? `Sign in to ${host}` : "Prism id",
    held: asking && request.mode === "signin" ? `Sign in to ${host}` : "Your Prism id",
    recover: "Use a recovery code",
    kit: "Your recovery code",
    removed: "This device was removed",
  }[view];
  if (held) {
    $("id").textContent = short(held.prism);
    $("id").title = held.prism;
  }
  $("continue").hidden = !(asking && request.mode === "signin");
  $("make-code").hidden = asking && request.mode === "signin";
  $("make-code").classList.toggle("primary", asking && request.mode === "recovery");
}

function busy(on) {
  $("card").classList.toggle("busy", on);
  if (on) $("error").hidden = true;
}
function fail(words) {
  $("error").textContent = words;
  $("error").hidden = false;
}
async function run(task) {
  busy(true);
  try {
    await task();
  } catch (error) {
    fail(error instanceof Prism.PrismIdError || error instanceof Unreachable ? sentence(error.message) : "That did not work. Try again.");
  } finally {
    busy(false);
  }
}
const sentence = (text) => (text ? text[0].toUpperCase() + text.slice(1) + (/[.!?]$/.test(text) ? "" : ".") : text);

function show(next) {
  view = next;
  paint();
}

async function showKit(made, next) {
  kit = { ...made, next };
  $("kit-code").textContent = made.code;
  $("kit-kept").hidden = made.kept;
  show("kit");
  $("kit-copy").focus();
}

// Sign the app's session: first take in what the other devices shared, so a
// device removed elsewhere stops here.
async function signIn() {
  held = await pull(held);
  await save(held);
  if (!(await Prism.canSign(held.prism, held.log, held.device.id))) {
    await forget();
    held = null;
    return show("removed");
  }
  const { sessionKey, expires } = request;
  const envelope = await Prism.signAction(held, ACTION, { sessionKey, expires }, { now: Date.now(), audience: app });
  send({ type: "session", envelope, records: [...held.log.values()] });
  setTimeout(() => window.close(), 50);
}

// After a new id or a recovery: sign in, if an app asked; otherwise show the id.
const after = () => (request?.mode === "signin" ? signIn() : request?.mode === "recovery" ? (send({ type: "recovery" }), setTimeout(() => window.close(), 50)) : show("held"));

$("create").addEventListener("click", () =>
  run(async () => {
    const made = await makeCode(await Prism.createPrism({ deviceClass: "browser", protection: "software" }));
    held = made.session;
    await showKit(made, after);
  }),
);
$("continue").addEventListener("click", () => run(signIn));
$("make-code").addEventListener("click", () =>
  run(async () => {
    const made = await makeCode(await pull(held));
    held = made.session;
    await showKit(made, after);
  }),
);
for (const id of ["use-code", "removed-code"]) $(id).addEventListener("click", () => (show("recover"), $("code").focus()));
$("recover-back").addEventListener("click", () => show(held ? "held" : "none"));

let file = null;
$("code-file").addEventListener("change", async () => {
  const text = await $("code-file").files[0]?.text();
  const code = /(([0-9A-Z]{4} ){13}[0-9A-Z]{4})/.exec(text ?? "")?.[1];
  const escrow = /^escrow (.+)$/m.exec(text ?? "")?.[1];
  try {
    file = { escrow: JSON.parse(escrow) };
    if (code) $("code").value = code;
  } catch {
    file = null;
    fail("That is not a recovery file.");
  }
});
const recoverNow = () =>
  run(async () => {
    held = await recover($("code").value, file);
    $("code").value = "";
    file = null;
    await after();
  });
$("recover-go").addEventListener("click", recoverNow);
$("code").addEventListener("keydown", (event) => event.key === "Enter" && recoverNow());

$("kit-copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(kit.code);
    $("kit-copy").textContent = "Copied";
  } catch {
    getSelection().selectAllChildren($("kit-code"));
    $("kit-copy").textContent = "Selected";
  }
  setTimeout(() => ($("kit-copy").textContent = "Copy"), 1600);
});
$("kit-save").addEventListener("click", () => {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([fileText(kit.code, kit.escrow, kit.session.prism)], { type: "text/plain" }));
  link.download = "prism-id-recovery.txt";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});
$("kit-done").addEventListener("click", () => {
  const { next } = kit;
  kit = null;
  $("kit-code").textContent = "";
  run(next);
});
$("copy-id").addEventListener("click", () => navigator.clipboard?.writeText(held?.prism ?? "").catch(() => {}));

if (!globalThis.indexedDB || !crypto?.subtle) {
  fail("This browser can't keep a Prism id.");
} else {
  held = await load();
  show(held ? "held" : "none");
  send({ type: "ready", modes: ["signin", "recovery"] });
}
