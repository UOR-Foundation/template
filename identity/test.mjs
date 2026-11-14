// Prism accounts: the frame's checks, each refused case failing closed, and
// the whole flow in Chromium with a virtual passkey authenticator.
//   node --test identity/test.mjs
import assert from "node:assert/strict";
import { webcrypto as crypto } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { IdentityError, acceptRecord, originsOf, verifySession, verifySigned } from "../frame/panels.mjs";
import { start } from "./dev.mjs";

const enc = new TextEncoder();
const b64u = (bytes) => Buffer.from(bytes).toString("base64url");
const sha = async (bytes) => new Uint8Array(await crypto.subtle.digest("SHA-256", typeof bytes === "string" ? enc.encode(bytes) : bytes));
const ACCOUNTS = "https://id.uor.foundation";
const ORIGINS = originsOf(ACCOUNTS);

// WebCrypto's r||s as WebAuthn's DER.
function der(raw) {
  const int = (bytes) => {
    let b = [...bytes];
    while (b.length > 1 && b[0] === 0) b.shift();
    if (b[0] & 0x80) b.unshift(0);
    return [0x02, b.length, ...b];
  };
  const body = [...int(raw.slice(0, 32)), ...int(raw.slice(32))];
  return new Uint8Array([0x30, body.length, ...body]);
}

async function passkey() {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", keys.publicKey));
  const key = b64u(await sha(spki));
  return { keys, spki: b64u(spki), key, credential: b64u(crypto.getRandomValues(new Uint8Array(16))) };
}

async function assertion(pk, message, { origin = ACCOUNTS, rp = "id.uor.foundation", flags = 0x05, type = "webauthn.get" } = {}) {
  const clientDataJSON = enc.encode(JSON.stringify({ type, challenge: b64u(await sha(message)), origin, crossOrigin: true }));
  const authenticatorData = new Uint8Array([...(await sha(rp)), flags, 0, 0, 0, 0]);
  const raw = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pk.keys.privateKey, new Uint8Array([...authenticatorData, ...(await sha(clientDataJSON))])));
  return { credential: pk.credential, clientDataJSON: b64u(clientDataJSON), authenticatorData: b64u(authenticatorData), signature: b64u(der(raw)) };
}

const recordOf = (pk, account = pk.key, binding = null) => ({ spec: "prism/identity/key/1", key: pk.key, account, credential: pk.credential, alg: -7, spki: pk.spki, origin: ACCOUNTS, created: 0, binding });

async function session(pk, records, overrides = {}) {
  const s = { app: "https://app.example", nonce: b64u(crypto.getRandomValues(new Uint8Array(32))), sessionKey: "k", expires: Date.now() + 60000, records, ...overrides };
  s.assertion = await assertion(pk, `prism/identity/session/1\n${s.app}\n${s.nonce}\n${s.sessionKey}\n${s.expires}`, overrides.signing);
  delete s.signing;
  return s;
}

const refuses = (code) => (error) => error instanceof IdentityError && error.code === code;

describe("the frame's checks", () => {
  test("a first passkey's session verifies and names its account", async () => {
    const pk = await passkey();
    const who = await verifySession(await session(pk, [recordOf(pk)]), ORIGINS);
    assert.equal(who.account, pk.key);
  });

  test("a session signed for another request is refused", async () => {
    const pk = await passkey();
    const s = await session(pk, [recordOf(pk)]);
    s.nonce = b64u(crypto.getRandomValues(new Uint8Array(32)));
    await assert.rejects(verifySession(s, ORIGINS), refuses("challenge"));
  });

  test("a signature made on another site is refused", async () => {
    const pk = await passkey();
    await assert.rejects(verifySession(await session(pk, [recordOf(pk)], { signing: { origin: "https://evil.example" } }), ORIGINS), refuses("origin"));
  });

  test("a passkey of another rpId is refused", async () => {
    const pk = await passkey();
    await assert.rejects(verifySession(await session(pk, [recordOf(pk)], { signing: { rp: "uor.foundation" } }), ORIGINS), refuses("rp"));
  });

  test("a device that did not verify its user is refused", async () => {
    const pk = await passkey();
    await assert.rejects(verifySession(await session(pk, [recordOf(pk)], { signing: { flags: 0x01 } }), ORIGINS), refuses("flags"));
  });

  test("a registration ceremony is not a sign-in", async () => {
    const pk = await passkey();
    await assert.rejects(verifySession(await session(pk, [recordOf(pk)], { signing: { type: "webauthn.create" } }), ORIGINS), refuses("type"));
  });

  test("a signature by another key is refused", async () => {
    const pk = await passkey();
    const other = await passkey();
    const s = await session({ ...other, credential: pk.credential }, [recordOf(pk)]);
    await assert.rejects(verifySession(s, ORIGINS), refuses("signature"));
  });

  test("a record whose name is not its key's hash is refused", async () => {
    const pk = await passkey();
    const other = await passkey();
    const forged = { ...recordOf(pk), spki: other.spki };
    await assert.rejects(verifySession(await session(pk, [forged]), ORIGINS), refuses("key"));
  });

  test("an expired session is refused", async () => {
    const pk = await passkey();
    const s = await session(pk, [recordOf(pk)]);
    await assert.rejects(verifySession(s, ORIGINS, s.expires + 1), refuses("expired"));
  });

  test("a second device bound by the account's passkey signs for the account", async () => {
    const first = await passkey();
    const second = await passkey();
    const binding = await assertion(first, `prism/identity/bind/1\n${first.key}\n${second.key}`);
    const records = [recordOf(second, first.key, binding), recordOf(first)];
    const who = await verifySession(await session(second, records), ORIGINS);
    assert.equal(who.account, first.key);
  });

  test("a key bound by another account cannot join it", async () => {
    const victim = await passkey();
    const attacker = await passkey();
    const mine = await passkey();
    const binding = await assertion(attacker, `prism/identity/bind/1\n${victim.key}\n${mine.key}`);
    const records = [recordOf(mine, victim.key, binding), recordOf(attacker)];
    await assert.rejects(acceptRecord(mine.credential, records, ORIGINS), refuses("binding"));
  });

  test("a binding signed for another key is refused", async () => {
    const first = await passkey();
    const second = await passkey();
    const binding = await assertion(first, `prism/identity/bind/1\n${first.key}\nsomeone-else`);
    await assert.rejects(acceptRecord(second.credential, [recordOf(second, first.key, binding), recordOf(first)], ORIGINS), refuses("challenge"));
  });

  test("an account's first key may not carry a binding", async () => {
    const pk = await passkey();
    await assert.rejects(verifySigned(recordOf(pk), await assertion(pk, "m"), "other", ORIGINS), refuses("challenge"));
    await assert.rejects(acceptRecord(pk.credential, [recordOf(pk, pk.key, await assertion(pk, "m"))], ORIGINS), refuses("binding"));
  });
});

describe("the flow in Chromium, with a virtual passkey", () => {
  let browser;
  let page;
  let running;
  let cdp;
  let authenticator;
  // A Windows browser, whichever system runs the tests, so the page names its authenticator.
  const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

  before(async () => {
    running = await start({ idPort: 8792, appPort: 8793 });
    const { chromium } = await import("playwright");
    // One renderer for the page and its sign-in iframe, so one virtual
    // authenticator serves both.
    browser = await chromium.launch({ args: ["--disable-site-isolation-trials", "--disable-features=IsolateOrigins,site-per-process"] });
    page = await browser.newPage({ userAgent: WINDOWS });
    cdp = await page.context().newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    ({ authenticatorId: authenticator } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
    }));
    await page.goto(running.app);
  });

  after(async () => {
    await browser?.close();
    await running?.close();
  });

  const signIn = page2 => page2.locator("prism-frame").evaluate((frame) => frame.account);
  const ceremony = () => page.frameLocator("prism-frame >> iframe");

  test("the icon sits after full screen and starts signed out", async () => {
    const order = await page.locator("prism-frame").evaluate((frame) => [...frame.shadowRoot.querySelector(".end").querySelectorAll("button")].map((b) => b.id));
    assert.deepEqual(order.slice(-2), ["fullscreen", "account"]);
    assert.equal(await page.locator("#account").getAttribute("aria-label"), "Sign in");
    assert.equal(await signIn(page), null);
  });

  test("a click the bar is redrawn under still opens the panel", async () => {
    // An app sets the frame's attributes as it loads, and each redraws the
    // bar; a click whose panel was still loading must open the new one.
    await page.locator("prism-frame").evaluate((frame) => {
      frame.shadowRoot.querySelector("#account").click();
      frame.setAttribute("purpose", "Redrawn while the panel loads.");
    });
    await page.locator("#account-panel:popover-open").waitFor({ timeout: 10000 });
    await page.keyboard.press("Escape");
    await page.locator("#account-panel:not(:popover-open)").waitFor({ timeout: 10000 });
  });

  test("creating an account signs in, verified in the page", async () => {
    await page.locator("#account").click();
    // A centred dialog titled for what it does, its one button naming the
    // device's own authenticator.
    assert.equal(await page.locator("#account-title").textContent(), "Sign in");
    await ceremony().locator("#go-label", { hasText: "Continue with Windows Hello" }).waitFor({ timeout: 10000 });
    const box = await page.locator("#account-panel").boundingBox();
    const view = page.viewportSize();
    assert.ok(Math.abs(box.x + box.width / 2 - view.width / 2) <= 1, "the dialog is centred");
    // One button: a device with no passkey turns Sign in into Create account.
    await ceremony().locator("#go:enabled").click();
    await ceremony().locator("#go-label", { hasText: "Create account" }).waitFor({ timeout: 10000 });
    await ceremony().locator("#go:enabled").click();
    await page.locator("#account.signed-in").waitFor({ timeout: 10000 });
    const account = await signIn(page);
    assert.match(account.id, /^[\w-]{43}$/);
    assert.equal(running.records.size, 1);
    assert.equal(await page.locator("#account").getAttribute("aria-label"), "Prism account");
  });

  test("the session survives a reload and signs for the account", async () => {
    await page.reload();
    await page.locator("#account.signed-in").waitFor({ timeout: 10000 });
    const checked = await page.evaluate(async () => {
      const frame = document.querySelector("prism-frame");
      const { verifySession, originsOf } = await import("/panels.mjs");
      const data = new TextEncoder().encode("hello");
      const { signature, delegation } = await frame.sign(data);
      const who = await verifySession(delegation, originsOf(frame.getAttribute("accounts")));
      const raw = Uint8Array.from(atob(delegation.sessionKey.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
      const key = await crypto.subtle.importKey("raw", raw, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      const sig = Uint8Array.from(atob(signature.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
      return { same: who.account === frame.account.id, valid: await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sig, data), app: delegation.app };
    });
    assert.deepEqual(checked, { same: true, valid: true, app: new URL(running.app).origin });
  });

  test("sign out, then sign in again with the same passkey", async () => {
    const before = (await signIn(page)).id;
    await page.locator("#account").click();
    await page.locator("#account-out").click();
    await page.locator("#account:not(.signed-in)").waitFor({ timeout: 10000 });
    assert.equal(await signIn(page), null);
    await page.locator("#account").click();
    // This device signed in before: the page asks for that passkey only, no chooser.
    await ceremony().locator("#go-label", { hasText: "Continue with Windows Hello" }).waitFor({ timeout: 10000 });
    await ceremony().locator("#go:enabled").click();
    await page.locator("#account.signed-in").waitFor({ timeout: 10000 });
    assert.equal((await signIn(page)).id, before);
  });

  test("a page whose policy will not frame the sign-in page signs in through a window", async () => {
    const strict = await (await browser.newContext()).newPage();
    await strict.goto(new URL("strict", running.app).href);
    await strict.locator("#account").click();
    await strict.locator("#account-window:visible").waitFor({ timeout: 10000 });
    const [popup] = await Promise.all([strict.waitForEvent("popup"), strict.locator("#account-window").click()]);
    const cdp = await strict.context().newCDPSession(popup);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
    });
    await popup.locator("#go:enabled").click();
    await popup.locator("#go-label", { hasText: "Create account" }).waitFor({ timeout: 10000 });
    await popup.locator("#go:enabled").click();
    await strict.locator("#account.signed-in").waitFor({ timeout: 10000 });
    assert.match((await signIn(strict)).id, /^[\w-]{43}$/);
    await strict.close();
  });

  test("the session key cannot be read out by script", async () => {
    const extractable = await page.evaluate(
      () =>
        new Promise((done) => {
          const open = indexedDB.open("prism-identity");
          open.onsuccess = () => {
            const get = open.result.transaction("session").objectStore("session").get("current");
            get.onsuccess = () => done(get.result.privateKey.extractable);
          };
        }),
    );
    assert.equal(extractable, false);
  });

  test("a remembered passkey that is gone asks for any passkey, never straight to a new account", async () => {
    await page.locator("#account").click();
    await page.locator("#account-out").click();
    await page.locator("#account:not(.signed-in)").waitFor({ timeout: 10000 });
    await cdp.send("WebAuthn.clearCredentials", { authenticatorId: authenticator });
    await page.locator("#account").click();
    await ceremony().locator("#go-label", { hasText: "Continue with Windows Hello" }).waitFor({ timeout: 10000 });
    await ceremony().locator("#go:enabled").click();
    // The remembered passkey did not answer: forget it and keep Continue,
    // which next looks for any passkey. Only that failing says this device has none.
    await ceremony().locator("#card:not(.busy)").waitFor({ timeout: 10000 });
    assert.equal(await ceremony().locator("#go-label").textContent(), "Continue with Windows Hello");
    await ceremony().locator("#go:enabled").click();
    await ceremony().locator("#go-label", { hasText: "Create account" }).waitFor({ timeout: 10000 });
  });
});
