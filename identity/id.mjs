// The Prism sign-in page (prism/identity/2, identity/PROTOCOL.md). It runs
// the WebAuthn ceremony on the identity origin and hands the result to the
// app that asked. It verifies nothing for the app: the frame checks every
// signature itself, so this page can only fail to help, never lie.
//
// It also makes and reads recovery codes. A new account's first key is a
// recovery key (Ed25519) made here; the device's passkey joins it by a
// signature from that key, so the account never depended on the device.
// The code is the recovery key's private half: shown once, never stored,
// never sent. With it, any device signs in again by joining its own passkey.
//
// It runs in the frame's account panel as an iframe. Where a browser refuses
// a passkey ceremony inside an iframe, it opens itself as a popup, and the
// popup reports back through it. The app's origin is always the one the
// browser gives the message, never one the message claims.

const REGISTRY = document.querySelector('meta[name="prism-registry"]').content.replace(/\/$/, "");
const RP = location.hostname;
const SPEC = "prism/identity/1";
const WEEK = 8 * 24 * 60 * 60 * 1000;

const enc = new TextEncoder();
const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
// A key's name: its κ, the UORC address of its DER SubjectPublicKeyInfo.
const keyId = async (spki) => `sha256:${hex(await crypto.subtle.digest("SHA-256", spki))}`;
const ID = /^(sha256:[0-9a-f]{64}|[\w-]{43})$/;
const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (text) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const sha256 = async (text) => new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
const $ = (id) => document.getElementById(id);

const alone = window.parent === window;
const popup = alone && Boolean(window.opener) && /(^#|&)popup(&|$)/.test(location.hash);
const peer = alone ? window.opener : window.parent;
const params = new URLSearchParams(location.hash.slice(1));
if (params.get("theme") === "dark") document.documentElement.classList.add("dark");
if (alone) document.documentElement.classList.add("alone");

// The request: who asked (the browser says) and what the app's session will be.
let request = null;
let app = null;
// A popup opened by this page's own iframe answers that iframe, which relays.
let relayed = false;

const valid = (r) =>
  r?.type === `${SPEC}/request` &&
  ["signin", "add", "recovery"].includes(r.mode) &&
  /^[\w-]{43}$/.test(r.nonce) &&
  /^[\w-]{87}$/.test(r.sessionKey) &&
  Number.isSafeInteger(r.expires) &&
  r.expires > Date.now() &&
  r.expires <= Date.now() + WEEK &&
  (r.mode === "signin" || (ID.test(r.account) && /^[\w-]+$/.test(r.credential)));

// Results go only to the app that asked; "ready" carries nothing and goes to whoever opened the page.
const send = (message) => peer?.postMessage({ ...message, type: `${SPEC}/${message.type}` }, message.type === "ready" ? "*" : relayed ? location.origin : app);

addEventListener("message", (event) => {
  if (event.source !== peer) return;
  const data = event.data;
  if (!valid(data)) return;
  // A popup this page's iframe opened takes the app's origin from that
  // iframe, which took it from the browser. Anyone else is the app.
  relayed = popup && event.origin === location.origin;
  const asking = relayed ? data.app : event.origin;
  if (typeof asking !== "string" || !/^https?:\/\/[^/]+$/.test(asking)) return;
  request = data;
  app = asking;
  paint();
});

// The popup's result, relayed by the iframe that opened it.
let child = null;
addEventListener("message", (event) => {
  if (!child || event.source !== child || event.origin !== location.origin) return;
  const type = String(event.data?.type ?? "");
  if (!type.startsWith(`${SPEC}/`) || type.endsWith("/ready") || type.endsWith("/size")) return;
  peer.postMessage(event.data, app);
  child.close();
});

// The passkey this device last signed in with: a hint, not a secret (a
// credential ID names a key, it proves nothing). With it the browser asks
// for that one passkey and skips its chooser. It is never taken as proof
// that the device has no other: a remembered passkey that does not answer
// is forgotten and the next tap asks for any, so a missing hint can never
// send someone with an account to Create account. Inside an app's panel the
// browser keeps this per app; in the sign-in window, for every app.
const HINT = "prism-identity/last-credential";
let remembered = null;
try {
  const saved = localStorage.getItem(HINT);
  remembered = /^[\w-]{16,}$/.test(saved ?? "") ? saved : null;
} catch {
  // No storage (a private window, blocked site data): every sign-in asks for any passkey.
}
function remember(credential) {
  remembered = credential;
  try {
    if (credential) localStorage.setItem(HINT, credential);
    else localStorage.removeItem(HINT);
  } catch {
    // Not kept; the next sign-in shows the chooser.
  }
}

// The device's own authenticator, by name, on the button itself, so the
// visitor knows what is about to ask. Named only where one is set up;
// elsewhere the browser offers a phone or a security key: "a passkey".
const DEVICE = (() => {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "Face ID or Touch ID";
  if (/Android/.test(ua)) return "your screen lock";
  if (/Windows NT/.test(ua)) return "Windows Hello";
  if (/Macintosh/.test(ua)) return "Touch ID";
  return null;
})();
let device = null;
if (DEVICE && window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) {
  PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then((available) => {
    device = available ? DEVICE : null;
    if (request) paint();
  }, () => {});
}

// One button. Continue asks the device for its Prism passkey (the one it
// last used, when it remembers one); a device with none (the browser will
// not say so before asking) turns the same button into Create account.
// Adding a device is the same button, relabelled.
let fresh = false;
// The recovery code being shown, and what "I saved it" does next.
let kit = null;
function paint() {
  const label = { add: "Add device", recovery: "Make a recovery code" }[request.mode] ?? (fresh ? "Create account" : `Continue with ${device ?? "a passkey"}`);
  $("go-label").textContent = label;
  $("fresh").hidden = !fresh || request.mode !== "signin";
  $("lost").hidden = request.mode !== "signin" || !$("recover").hidden || Boolean(kit);
  $("go").hidden = Boolean(kit) || !$("recover").hidden;
  $("go").disabled = false;
  size();
}

function size() {
  if (!alone && app) send({ type: "size", height: Math.ceil(document.documentElement.getBoundingClientRect().height) });
}
new ResizeObserver(size).observe(document.body);

function busy(on) {
  $("card").classList.toggle("busy", on);
  if (on && device) $("go-label").textContent = `Waiting for ${device}…`;
  else if (!on) paint();
  if (!alone && app) send({ type: "busy", on });
  if (on) $("error").hidden = true;
}

function fail(words) {
  $("error").textContent = words;
  $("error").hidden = false;
  size();
}

class RegistryError extends Error {}

async function registry(path, body) {
  const response = await fetch(`${REGISTRY}${path}`, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => {
    throw new RegistryError("Accounts are unreachable right now. Try again soon.");
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new RegistryError(data.message || `The registry answered ${response.status}.`);
  return data;
}

// The record of a credential, and for a bound key every key of its account:
// the frame checks the binding chain, so all of it travels with the
// signature. A key bound before its binder was revoked stays valid, so the
// account's list (which keeps revoked records) is what the chain is read
// from. The passkey that signed must itself be live: the registry answers
// 410 for a revoked one.
async function chain(credential) {
  const record = await registry(`/passkey/credential/${credential}`);
  if (!record.binding) return [record];
  const { keys = [] } = await registry(`/passkey/account/${record.account}`);
  return [record, ...keys.filter((key) => key.credential !== credential)];
}

function assertion(credential) {
  const r = credential.response;
  return { credential: b64u(credential.rawId), clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.authenticatorData), signature: b64u(r.signature) };
}

async function sign(message, allow) {
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: await sha256(message),
      rpId: RP,
      userVerification: "required",
      timeout: 120000,
      allowCredentials: allow.map((id) => ({ type: "public-key", id: unb64u(id) })),
    },
  });
  return assertion(credential);
}

async function session(allow = []) {
  const { nonce, sessionKey, expires } = request;
  const signed = await sign(`prism/identity/session/1\n${app}\n${nonce}\n${sessionKey}\n${expires}`, allow);
  const records = await chain(signed.credential);
  remember(signed.credential);
  send({ type: "session", assertion: signed, records });
}

// Recovery codes. The code is the recovery key's 32-byte Ed25519 seed and
// three check bytes (the start of its SHA-256), in Crockford base32: 56
// characters, read in groups of four. The check bytes catch a mistyped code
// before anything is asked of the registry.
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const PKCS8_ED25519 = Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]);

async function encodeCode(seed) {
  const bytes = [...seed, ...new Uint8Array(await crypto.subtle.digest("SHA-256", seed)).slice(0, 3)];
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  const chars = bits.match(/.{5}/g).map((five) => CROCKFORD[parseInt(five, 2)]);
  return chars.join("").match(/.{4}/g).join(" ");
}

class CodeError extends Error {}

async function decodeCode(text) {
  const clean = String(text).toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
  if (!/^[0-9A-HJKMNP-TV-Z]{56}$/.test(clean)) throw new CodeError("A recovery code is 56 letters and digits.");
  const bits = [...clean].map((c) => CROCKFORD.indexOf(c).toString(2).padStart(5, "0")).join("");
  const bytes = Uint8Array.from(bits.match(/.{8}/g), (byte) => parseInt(byte, 2));
  const seed = bytes.slice(0, 32);
  const check = new Uint8Array(await crypto.subtle.digest("SHA-256", seed)).slice(0, 3);
  if (check.some((b, i) => b !== bytes[32 + i])) throw new CodeError("That code has a typo. Check it and try again.");
  return seed;
}

// A recovery key from its seed: the signing key, its SPKI, its κ and its
// credential (the raw public key, which finds its record).
async function recoveryKey(seed) {
  const pkcs8 = new Uint8Array([...PKCS8_ED25519, ...seed]);
  const extractable = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, true, ["sign"]);
  const { x } = await crypto.subtle.exportKey("jwk", extractable);
  const publicKey = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x }, { name: "Ed25519" }, true, ["verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", publicKey));
  const privateKey = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, ["sign"]);
  return { privateKey, spki, key: await keyId(spki), credential: x };
}

const newRecoveryKey = async () => {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  return { seed, ...(await recoveryKey(seed)) };
};

// A recovery key's signature: Ed25519 over the protocol message itself.
async function signRecovery(recovery, message) {
  return { credential: recovery.credential, signature: b64u(await crypto.subtle.sign({ name: "Ed25519" }, recovery.privateKey, enc.encode(message))) };
}

// Show the code until the visitor says it is saved; then `next` runs.
async function showKit(recovery, account, next) {
  kit = { next, code: await encodeCode(recovery.seed), account };
  recovery.seed.fill(0);
  $("kit-code").textContent = kit.code;
  $("kit").hidden = false;
  paint();
  $("kit-copy").focus();
}

// A new passkey for this device, made after `challenge`.
async function newPasskey(challenge, exclude) {
  const platform = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.().catch(() => false);
  const adding = request.mode === "add";
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: unb64u(challenge),
      rp: { id: RP, name: "Prism" },
      user: { id: crypto.getRandomValues(new Uint8Array(32)), name: "Prism account", displayName: "Prism account" },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        residentKey: "required",
        requireResidentKey: true,
        userVerification: "required",
        ...(platform && !adding ? { authenticatorAttachment: "platform" } : {}),
      },
      excludeCredentials: exclude ? [{ type: "public-key", id: unb64u(exclude) }] : [],
      hints: adding ? ["hybrid"] : [],
      attestation: "none",
      timeout: 120000,
    },
  });
  const r = credential.response;
  const spki = r.getPublicKey();
  return {
    spki: b64u(spki),
    alg: r.getPublicKeyAlgorithm(),
    credential: b64u(credential.rawId),
    clientDataJSON: b64u(r.clientDataJSON),
    authenticatorData: b64u(r.getAuthenticatorData()),
    attestationObject: b64u(r.attestationObject),
    transports: r.getTransports?.() ?? [],
    binding: null,
    key: await keyId(spki),
  };
}

// Register `passkey` into `account`, bound by `binding` (made over its key).
async function join(passkey, account, binding) {
  const { key, ...body } = passkey;
  return registry("/passkey/register", { ...body, binding: { account, ...binding } });
}

// A new passkey. Another device joins the account whose passkey signs the
// binding. A first one starts an account whose first key is a new recovery
// key, which binds the passkey with no prompt: the visitor saves the code,
// then the passkey signs the app's session (creating a passkey signs nothing
// a reader could check, so that is a second prompt).
async function create() {
  const { challenge } = await registry("/passkey/challenge", {});
  if (request.mode === "add") {
    const passkey = await newPasskey(challenge, request.credential);
    const bound = await sign(`prism/identity/bind/1\n${request.account}\n${passkey.key}`, [request.credential]);
    const record = await join(passkey, request.account, bound);
    return send({ type: "added", record });
  }
  const passkey = await newPasskey(challenge, null);
  const recovery = await newRecoveryKey();
  const { account } = await registry("/passkey/recovery", { spki: b64u(recovery.spki) });
  await join(passkey, account, await signRecovery(recovery, `prism/identity/bind/1\n${account}\n${passkey.key}`));
  remember(passkey.credential);
  await showKit(recovery, account, () => session([passkey.credential]));
}

// A recovery code for a signed-in account: the passkey binds a new recovery
// key. Older codes keep working until a device revokes them.
async function makeRecovery() {
  const recovery = await newRecoveryKey();
  const binding = await sign(`prism/identity/bind/1\n${request.account}\n${recovery.key}`, [request.credential]);
  const { key } = await registry("/passkey/recovery", { account: request.account, spki: b64u(recovery.spki), binding });
  await showKit(recovery, request.account, () => send({ type: "recovery", key }));
}

// Sign in with a recovery code: this device's new passkey joins the code's
// account, then signs the app's session.
async function recover(text) {
  const recovery = await recoveryKey(await decodeCode(text));
  const record = await registry(`/passkey/credential/${recovery.credential}`).catch((error) => {
    throw new RegistryError(/revoked/i.test(error.message) ? "That recovery code was replaced. Use the newest one." : /no key/i.test(error.message) ? "No account has that recovery code." : error.message);
  });
  const { challenge } = await registry("/passkey/challenge", {});
  const passkey = await newPasskey(challenge, null);
  await join(passkey, record.account, await signRecovery(recovery, `prism/identity/bind/1\n${record.account}\n${passkey.key}`));
  remember(passkey.credential);
  $("code").value = "";
  $("recover").hidden = true;
  await session([passkey.credential]);
}

// A browser that will not run a ceremony in an iframe runs it in a popup.
function overflow() {
  child = open(`${location.pathname}#popup${document.documentElement.classList.contains("dark") ? "&theme=dark" : ""}`, "prism-identity", "popup,width=420,height=360");
  if (!child) return fail("Allow pop-ups, then try again.");
  const relay = (event) => {
    if (event.source !== child || event.data?.type !== `${SPEC}/ready`) return;
    removeEventListener("message", relay);
    child.postMessage({ ...request, app }, location.origin);
  };
  addEventListener("message", relay);
}

async function run(task) {
  if (!request) return;
  busy(true);
  try {
    await task();
  } catch (error) {
    // No passkey, or the visitor closed the prompt: the browser does not say
    // which. Either way, offer a new account, one tap away, and keep sign-in
    // a tap away too. Nothing else to read.
    if ((error?.name === "NotAllowedError" || error?.name === "AbortError") && (kit || !$("recover").hidden || request.mode === "recovery")) {
      // A prompt closed during recovery or while a code is shown: nothing
      // to infer about this device's passkeys. The same tap tries again.
      return fail("That did not finish. Try again.");
    }
    if (error?.name === "NotAllowedError" || error?.name === "AbortError") {
      // The remembered passkey did not answer (removed, or the prompt was
      // closed): forget it, and the next tap asks for any passkey.
      if (request.mode === "signin" && !fresh && remembered) {
        remember(null);
        paint();
        return;
      }
      if (request.mode === "signin" && !fresh) {
        fresh = true;
        paint();
      }
      return;
    }
    if (error?.name === "SecurityError" && !alone) return overflow();
    if (error?.name === "InvalidStateError") return fail("This device is already added.");
    fail(error instanceof RegistryError || error instanceof CodeError ? error.message : "That did not work. Try again.");
  } finally {
    busy(false);
  }
}

$("go").addEventListener("click", () => run(() => (request.mode === "recovery" ? makeRecovery() : request.mode === "add" || fresh ? create() : session(remembered ? [remembered] : []))));
$("use-code").addEventListener("click", () => {
  $("recover").hidden = false;
  paint();
  $("code").focus();
});
$("recover-go").addEventListener("click", () => run(() => recover($("code").value)));
$("code").addEventListener("keydown", (event) => {
  if (event.key === "Enter") run(() => recover($("code").value));
});
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
  const text = `Prism account recovery code\n\n${kit.code}\n\nAccount ${kit.account}\n\nOn any device: open the person icon in a Prism app, choose "Lost your device? Use a recovery code" and enter this code.\nAnyone holding it can add a device to your account. Keep it offline.\n`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  link.download = "prism-recovery-code.txt";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});
$("kit-done").addEventListener("click", () => {
  const { next } = kit;
  kit = null;
  $("kit").hidden = true;
  $("kit-code").textContent = "";
  paint();
  run(next);
});
$("again").addEventListener("click", () => {
  fresh = false;
  paint();
  run(() => session());
});

if (!window.PublicKeyCredential) {
  fail("This browser can't use passkeys.");
} else {
  send({ type: "ready", modes: ["signin", "add", "recovery"] });
}
