// Prism ids: the frame's checks, each refused case failing closed, and the
// whole flow in Chromium: a new id, a session on an app, a lost device
// brought back with a recovery code, the same id on another app.
//   node --test identity/test.mjs
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { IdentityError, verifySession } from "../frame/panels.mjs";
import * as Prism from "./prism-id.mjs";
import { start } from "./dev.mjs";

const APP = "https://app.example";
const DAY = 864e5;
const key = () => Buffer.from(crypto.getRandomValues(new Uint8Array(65))).toString("base64url");

// A session as the Prism id page signs one.
async function session(signer, { app = APP, action = "prism/session/1", expires = Date.now() + DAY, now = Date.now(), sessionKey = key() } = {}) {
  const envelope = await Prism.signAction(signer, action, { sessionKey, expires }, { now, audience: app });
  return { app, envelope, records: [...signer.log.values()] };
}
const refuses = (code) => (error) => error instanceof IdentityError && error.code === code;

describe("the frame's checks", () => {
  test("a new id's session verifies and names the id", async () => {
    const id = await Prism.createPrism();
    const who = await verifySession(await session(id));
    assert.equal(who.account, id.prism);
    assert.equal(who.key, id.device.id);
    assert.match(who.account, /^sha256:[0-9a-f]{64}$/);
  });

  test("a session for another app is refused", async () => {
    const id = await Prism.createPrism();
    const s = await session(id, { app: "https://other.example" });
    await assert.rejects(verifySession({ ...s, app: APP }), refuses("signature"));
  });

  test("a changed session key or expiry breaks the signature", async () => {
    const id = await Prism.createPrism();
    const s = await session(id);
    const swapped = structuredClone(s);
    swapped.envelope.body.payload.sessionKey = key();
    await assert.rejects(verifySession(swapped), refuses("signature"));
    const longer = structuredClone(s);
    longer.envelope.body.payload.expires += DAY;
    await assert.rejects(verifySession(longer), refuses("signature"));
  });

  test("an expired, overlong or stale session is refused", async () => {
    const id = await Prism.createPrism();
    await assert.rejects(verifySession(await session(id, { expires: Date.now() - 1 })), refuses("expired"));
    await assert.rejects(verifySession(await session(id, { expires: Date.now() + 9 * DAY })), refuses("expired"));
    await assert.rejects(verifySession(await session(id, { now: Date.now() - 5 * 60000 })), refuses("signature"));
  });

  test("a kept session checks later, as of its signing", async () => {
    const id = await Prism.createPrism();
    const s = await session(id, { now: Date.now() - 3 * DAY });
    await assert.rejects(verifySession(s), refuses("signature"));
    assert.equal((await verifySession(s, { fresh: 0 })).account, id.prism);
  });

  test("an action that is not a session is refused", async () => {
    const id = await Prism.createPrism();
    await assert.rejects(verifySession(await session(id, { action: "prism/pay/1" })), refuses("action"));
  });

  test("a device removed from the id signs no session", async () => {
    const id = await Prism.createPrism();
    const made = await Prism.createRecovery(id, { now: Date.now() });
    const phone = await Prism.recoverOnto(made.code, made.escrow, await Prism.createDevice(), { now: Date.now() });
    const removed = await Prism.revokeDevice(phone, id.device.id);
    const s = await session(made.session);
    assert.equal((await verifySession(s)).account, id.prism);
    await assert.rejects(verifySession({ ...s, records: [...removed.log.values()] }), refuses("signature"));
  });

  test("a device of another id cannot sign for this one", async () => {
    const id = await Prism.createPrism();
    const other = await Prism.createPrism();
    const s = await session(other);
    s.envelope.body.prism = id.prism;
    await assert.rejects(verifySession({ ...s, records: [...id.log.values(), ...other.log.values()] }), refuses("signature"));
    await assert.rejects(verifySession({ ...(await session(other)), records: [...id.log.values()] }), refuses("log"));
  });
});

describe("the flow in Chromium", () => {
  let browser;
  let page;
  let running;
  let recoveryCode = null;
  let firstId = null;

  before(async () => {
    running = await start({ idPort: 8792, appPort: 8793 });
    const { chromium } = await import("playwright");
    browser = await chromium.launch();
    page = await (await browser.newContext()).newPage();
    await page.goto(running.app);
  });

  after(async () => {
    await browser?.close();
    await running?.close();
  });

  const account = (p) => p.locator("prism-frame").evaluate((frame) => frame.account);
  const openWindow = async (p, button = "#account-window") => {
    const [popup] = await Promise.all([p.waitForEvent("popup"), p.locator(button).click()]);
    await popup.waitForLoadState();
    return popup;
  };

  test("the icon sits after full screen and starts signed out", async () => {
    const order = await page.locator("prism-frame").evaluate((frame) => [...frame.shadowRoot.querySelector(".end").querySelectorAll("button")].map((b) => b.id));
    assert.deepEqual(order.slice(-2), ["fullscreen", "account"]);
    assert.equal(await page.locator("#account").getAttribute("aria-label"), "Sign in");
    assert.equal(await account(page), null);
  });

  test("a new Prism id: no prompt, a recovery code, then signed in", async () => {
    await page.locator("#account").click();
    assert.equal(await page.locator("#account-title").textContent(), "Sign in");
    const popup = await openWindow(page);
    await popup.locator("#title", { hasText: "Sign in to 127.0.0.1:8793" }).waitFor({ timeout: 10000 });
    await popup.locator("#create").click();
    await popup.locator("#kit-code").waitFor({ timeout: 10000 });
    recoveryCode = await popup.locator("#kit-code").textContent();
    assert.match(recoveryCode, /^([0-9A-HJKMNP-TV-Z]{4} ){13}[0-9A-HJKMNP-TV-Z]{4}$/);
    assert.equal(await popup.locator("#kit-kept").isHidden(), true);
    await Promise.all([popup.waitForEvent("close"), popup.locator("#kit-done").click()]);
    await page.locator("#account.signed-in").waitFor({ timeout: 10000 });
    firstId = (await account(page)).id;
    assert.match(firstId, /^sha256:[0-9a-f]{64}$/);
    assert.equal(await page.locator("#account").getAttribute("aria-label"), "Prism account");
    // The escrow and the devices' sync are in the mailbox, every one sealed.
    assert.ok(running.topics.size >= 2);
    for (const [, messages] of running.topics) {
      for (const m of messages) assert.ok(["prism/sealed/1", "prism/recovery-escrow/1"].includes(JSON.parse(Buffer.from(m, "base64url")).kind));
    }
  });

  test("the session survives a reload and signs for the id", async () => {
    await page.reload();
    await page.locator("#account.signed-in").waitFor({ timeout: 10000 });
    const checked = await page.evaluate(async () => {
      const frame = document.querySelector("prism-frame");
      const data = new TextEncoder().encode("hello");
      const { signature, delegation } = await frame.sign(data);
      const raw = Uint8Array.from(atob(delegation.envelope.body.payload.sessionKey.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
      const key = await crypto.subtle.importKey("raw", raw, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      const sig = Uint8Array.from(atob(signature.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
      return { delegation, id: frame.account.id, valid: await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sig, data) };
    });
    assert.equal(checked.valid, true);
    assert.equal(checked.delegation.app, new URL(running.app).origin);
    assert.equal((await verifySession(checked.delegation, { fresh: 0 })).account, checked.id);
  });

  test("sign out, then sign in again: one click in the window, same id", async () => {
    await page.locator("#account").click();
    await page.locator("#account-out").click();
    await page.locator("#account:not(.signed-in)").waitFor({ timeout: 10000 });
    await page.locator("#account").click();
    const popup = await openWindow(page);
    await popup.locator("#id").waitFor({ timeout: 10000 });
    await Promise.all([popup.waitForEvent("close"), popup.locator("#continue").click()]);
    await page.locator("#account.signed-in").waitFor({ timeout: 10000 });
    assert.equal((await account(page)).id, firstId);
  });

  test("the session key and the device keys cannot be read out by script", async () => {
    const appKey = await page.evaluate(
      () =>
        new Promise((done) => {
          const open = indexedDB.open("prism-identity");
          open.onsuccess = () => {
            const get = open.result.transaction("session").objectStore("session").get("current");
            get.onsuccess = () => done(get.result.privateKey.extractable);
          };
        }),
    );
    assert.equal(appKey, false);
    const idPage = await page.context().newPage();
    await idPage.goto(`${running.accounts}/`);
    const device = await idPage.evaluate(
      () =>
        new Promise((done) => {
          const open = indexedDB.open("prism-id");
          open.onsuccess = () => {
            const get = open.result.transaction("prism").objectStore("prism").get("self");
            get.onsuccess = () => done([get.result.device.signingKey.extractable, get.result.device.agreementKey.extractable]);
          };
        }),
    );
    assert.deepEqual(device, [false, false]);
    await idPage.close();
  });

  test("a lost device: the recovery code brings the same id to a new browser", async () => {
    const fresh = await (await browser.newContext()).newPage();
    await fresh.goto(running.app);
    await fresh.locator("#account").click();
    const popup = await openWindow(fresh);
    await popup.locator("#use-code").click();
    await popup.locator("#code").fill("0000 0000");
    await popup.locator("#recover-go").click();
    await popup.locator("#error", { hasText: "56 letters" }).waitFor({ timeout: 10000 });
    await popup.locator("#code").fill(recoveryCode.toLowerCase());
    await Promise.all([popup.waitForEvent("close"), popup.locator("#recover-go").click()]);
    await fresh.locator("#account.signed-in").waitFor({ timeout: 10000 });
    assert.equal((await account(fresh)).id, firstId);
    // That browser makes its own new code; the old one keeps working.
    await fresh.locator("#account").click();
    const again = await openWindow(fresh, "#account-recovery");
    await again.locator("#make-code").click();
    await again.locator("#kit-code").waitFor({ timeout: 10000 });
    assert.notEqual(await again.locator("#kit-code").textContent(), recoveryCode);
    await Promise.all([again.waitForEvent("close"), again.locator("#kit-done").click()]);
    await fresh.locator("#account-panel:not(:popover-open)").waitFor({ timeout: 10000 });
    await fresh.context().close();
  });

  test("a recovery file brings the id back with no registry copy", async () => {
    const owner = await (await browser.newContext({ acceptDownloads: true })).newPage();
    await owner.goto(`${running.accounts}/`);
    await owner.locator("#create").click();
    await owner.locator("#kit-code").waitFor({ timeout: 10000 });
    const [download] = await Promise.all([owner.waitForEvent("download"), owner.locator("#kit-save").click()]);
    const path = await download.path();
    const id = await owner.evaluate(() => document.getElementById("kit-code").textContent);
    await owner.locator("#kit-done").click();
    await owner.locator("#id").waitFor({ timeout: 10000 });
    const prism = await owner.locator("#id").getAttribute("title");
    running.topics.clear();
    const other = await (await browser.newContext()).newPage();
    await other.goto(`${running.accounts}/`);
    await other.locator("#use-code").click();
    await other.locator("#code").fill(id);
    await other.locator("#recover-go").click();
    await other.locator("#error", { hasText: "recovery file" }).waitFor({ timeout: 10000 });
    await other.locator("#code").fill("");
    await other.locator("#code-file").setInputFiles(path);
    await other.locator("#code").evaluate((input) => input.value).then((value) => assert.equal(value, id));
    await other.locator("#recover-go").click();
    await other.locator("#id").waitFor({ timeout: 10000 });
    assert.equal(await other.locator("#id").getAttribute("title"), prism);
    await owner.context().close();
    await other.context().close();
  });
});
