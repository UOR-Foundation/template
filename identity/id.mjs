// The Prism sign-in page (prism/identity/1, identity/PROTOCOL.md). It runs
// the WebAuthn ceremony on the identity origin and hands the result to the
// app that asked. It verifies nothing for the app: the frame checks every
// signature itself, so this page can only fail to help, never lie.
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
  ["signin", "add"].includes(r.mode) &&
  /^[\w-]{43}$/.test(r.nonce) &&
  /^[\w-]{87}$/.test(r.sessionKey) &&
  Number.isSafeInteger(r.expires) &&
  r.expires > Date.now() &&
  r.expires <= Date.now() + WEEK &&
  (r.mode === "signin" || (/^[\w-]{43}$/.test(r.account) && /^[\w-]+$/.test(r.credential)));

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
function paint() {
  const label = request.mode === "add" ? "Add device" : fresh ? "Create account" : `Continue with ${device ?? "a passkey"}`;
  $("go-label").textContent = label;
  $("fresh").hidden = !fresh || request.mode === "add";
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

// A new passkey. A first one starts an account; another joins the account
// whose passkey signs the binding.
async function create() {
  const { challenge } = await registry("/passkey/challenge", {});
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
      excludeCredentials: adding ? [{ type: "public-key", id: unb64u(request.credential) }] : [],
      hints: adding ? ["hybrid"] : [],
      attestation: "none",
      timeout: 120000,
    },
  });
  const r = credential.response;
  const spki = r.getPublicKey();
  const body = {
    spki: b64u(spki),
    alg: r.getPublicKeyAlgorithm(),
    credential: b64u(credential.rawId),
    clientDataJSON: b64u(r.clientDataJSON),
    authenticatorData: b64u(r.getAuthenticatorData()),
    attestationObject: b64u(r.attestationObject),
    transports: r.getTransports?.() ?? [],
    binding: null,
  };
  if (adding) {
    const key = b64u(await crypto.subtle.digest("SHA-256", spki));
    const bound = await sign(`prism/identity/bind/1\n${request.account}\n${key}`, [request.credential]);
    body.binding = { account: request.account, ...bound };
  }
  const record = await registry("/passkey/register", body);
  if (adding) return send({ type: "added", record });
  // A new account: the passkey now signs the app's session. Creating a
  // passkey signs nothing a reader could check, so this is a second prompt.
  await session([body.credential]);
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
    fail(error instanceof RegistryError ? error.message : "That did not work. Try again.");
  } finally {
    busy(false);
  }
}

$("go").addEventListener("click", () => run(() => (request.mode === "add" || fresh ? create() : session(remembered ? [remembered] : []))));
$("again").addEventListener("click", () => {
  fresh = false;
  paint();
  run(() => session());
});

if (!window.PublicKeyCredential) {
  fail("This browser can't use passkeys.");
} else {
  send({ type: "ready" });
}
