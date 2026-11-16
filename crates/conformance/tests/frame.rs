//! Executes the production frame regressions under Node.

use std::path::PathBuf;
use std::process::Command;

/// Runs a Node regression from the repository root and fails with its output unless it passes.
fn node(id: &str, args: &[&str]) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let result = Command::new("node")
        .args(args)
        .current_dir(root)
        .output()
        .expect("Node runs");
    let (out, err) = (
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr),
    );
    assert!(
        result.status.success(),
        "{id}: {out}
{err}"
    );
}

/// `FR-01`: With a working worker, the page loads and verifies the archive only in that worker before using its identities or guest
#[test]
fn frame_fr_01() {
    node("FR-01", &["site/worker-gate.mjs"]);
}

/// `FR-02`: A returning browser whose worker kept an earlier deploy serves this deploy from the navigation that brings its page
#[test]
fn frame_fr_02() {
    node("FR-02", &["site/sw-gate.mjs"]);
}

/// `FR-03`: A first visit's bytes are counted once the page has started, the frame's and the app's each within its own budget
#[test]
fn frame_fr_03() {
    node("FR-03", &["bootstrap/weight-gate.mjs"]);
}

/// `FR-04`: An app's workspace key opens only on a device of the Prism ID that made it, follows the ID when it joins or is recovered, and stays locked on a removed device
///
/// The decisions run here; the frame's panel carries them across two apps in Chromium in
/// `identity/test.mjs` (try-page.yml).
#[test]
fn frame_fr_04() {
    node("FR-04", &["--input-type=module", "-e", WORKSPACE]);
}

/// `FR-05`: An app's pages on every device of one Prism ID meet on a relay topic only those devices derive, per app, with every message sealed to the ID, and a removed device is left behind
///
/// The same Node run as FR-04, whose linked devices it uses; two pages of one app in Chromium in
/// `identity/test.mjs`.
#[test]
fn frame_fr_05() {
    node("FR-05", &["--input-type=module", "-e", WORKSPACE]);
}

const WORKSPACE: &str = r#"
import assert from "node:assert/strict";
import * as Prism from "./identity/prism-id.mjs";
import { appTopic, carryWorkspace, openWorkspace } from "./frame/panels.mjs";
const id = await Prism.createPrism();
const made = await openWorkspace(Prism, id, null);
assert.equal(made.key.length, 32);
const again = await openWorkspace(Prism, id, made.record);
assert.deepEqual([again.key, again.record], [made.key, null]);
const other = await Prism.createPrism();
await assert.rejects(openWorkspace(Prism, other, made.record), { code: "removed" });
assert.notDeepEqual((await openWorkspace(Prism, other, null)).key, made.key);
const carried = await carryWorkspace(Prism, made.record, id, other);
assert.deepEqual((await openWorkspace(Prism, other, carried)).key, made.key);
assert.equal(await carryWorkspace(Prism, made.record, other, id), null);
const { uri, pending } = await Prism.createLinkOffer(id, { now: Date.now() });
const offer = Prism.parseLinkUri(uri);
const device = await Prism.createDevice();
const accepted = await Prism.acceptLinkRequest(id, pending, await Prism.requestLink(device, offer), { now: Date.now(), confirmCode: await Prism.linkCode(offer.secret, device.record) });
const second = await Prism.completeLink(device, offer, accepted.response);
const app = "https://app.example", topic = await appTopic(Prism, accepted.session, app);
assert.match(topic, /^prism-app:[0-9a-f]{64}$/);
assert.equal(await appTopic(Prism, second, app), topic, "FR-05: the id's two devices meet");
assert.notEqual(await appTopic(Prism, accepted.session, "https://other.example"), topic, "FR-05: one topic per app");
assert.notEqual(await appTopic(Prism, other, app), topic, "FR-05: another id meets elsewhere");
assert.deepEqual(await Prism.openPrivate(second, (await Prism.sealPrivate(accepted.session, { offer: 1 })).sealed), { offer: 1 });
const kept = await Prism.revokeDevice(accepted.session, second.device.id);
assert.notEqual(await appTopic(Prism, kept, app), await appTopic(Prism, second, app), "FR-05: a removed device is left behind");
const rotated = await openWorkspace(Prism, kept, made.record);
assert.deepEqual(rotated.key, made.key);
await assert.rejects(openWorkspace(Prism, second, rotated.record));
"#;
