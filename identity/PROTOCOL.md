# prism/identity/4

A Prism id is stitch's Prism id ([afflom/stitch](https://github.com/afflom/stitch),
`src/prism-id.js` and `docs/prism-id.md`). It is pinned by commit in
[stitch.lock](stitch.lock) and copied, with the stitch modules it imports and
the model decisions they call, into [prism-id.mjs](prism-id.mjs) by
[stitch-sync.mjs](stitch-sync.mjs). This file says how the frame uses it.
Stitch's documents are the contract for the id itself, and every
authorization decision is taken by its `Stitch.PrismId` model. When stitch's
Prism model is refined, re-pin:

```sh
node identity/stitch-sync.mjs <stitch commit>   # writes prism-id.mjs and stitch.lock
npm run test:identity                           # the lock matches, every check refuses, the flow signs in
```

prism/identity/4 replaces identity/3 (a Prism id page at id.uor.foundation
and a registry mailbox) and identity/1 and /2 (passkeys). Nothing here runs
on a server of Prism's own. A session has the same shape as in identity/3.

## Parties

| Party | Where | Holds |
| --- | --- | --- |
| Frame | `<prism-frame>` in every Prism app | This origin's device of the id (keys, keyring and log, in IndexedDB `prism-id`), and this app's session key with the id's signed session (IndexedDB `prism-identity`). It checks every signature itself. |
| stitch's relay | The frame's `PRISM_RELAY` (`https://ntfy.sh`), with stitch's relay framing, through Prism id's `createRelayBus` | Messages under names hashed from secrets only holders know: sealed sync messages (`prism-sync:` topics) and link requests and answers (`prism-rendezvous:` topics). It holds them for the warm lifetime (30 minutes). |

A page's `connect-src` must name the relay and its `wss:` origin. The page
build reads `PRISM_RELAY` from the live frame. A page that does not admit the
relay keeps the id on its device: creating, signing in and recovery work, but
linking and sync do not.

## The session, made without asking

There is no sign-in. On the visitor's first touch of the page (or reach for
the icon), the frame makes this origin's device and a new id if it has none,
then this app's session if it has none or it expired:

1. The frame takes in the sync messages the relay holds for every boundary
   key it has, and the id's public log, so a device removed elsewhere stops
   here (`canSign` is false: it drops the session, forgets the device and
   makes a new id). It checks this once per page load even with a session.
2. It makes a non-extractable P-256 session key and signs
   `signAction(device, "prism/session/1", {sessionKey, expires}, {audience: location.origin})`.
   `expires` is 7 days away; the most allowed is 8.
3. It checks the result with `verifySession`, as anyone the app shows a
   signature to does: the log resolves for the envelope's prism id, the
   signer is an active device, the audience is this origin, the action is
   fresh (`Stitch.PrismId.actionFresh`, `actionAllowed`). Only then does it
   keep the session.

A kept session is `{app, envelope, records}`. `frame.sign(bytes)` signs with
the session key and returns the signature with it. Anyone can check it later
with `verifySession(session, {fresh: 0})`, as of its signing and bounded by
its expiry.

## A new id

`createPrism`, then `createRecovery(session, {threshold: 1, guardians: [{paper: true}]})`.
The recovery kit is `{kind: "prism/recovery-kit/1", prism, share, records}`,
with the paper share and the log. It waits in this origin's `prism-id` store
(key `kit`) until the visitor saves it from the panel, as JSON.

## Linking

Stitch's out-of-band link, over the relay:

1. Signed-in device: `createLinkOffer`. The panel shows the `prism-link:`
   URI and its QR code (`linkQr`), and subscribes to `rendezvousTopic(secret)`.
2. New device: `parseLinkUri`, a new device, then `requestLink`, published on
   the rendezvous topic. It shows `linkCode(secret, device)`.
3. The person types those six digits into the first device, which calls
   `acceptLinkRequest` with them as `confirmCode` and publishes the answer.
   A wrong code is refused and the offer stays usable until it expires.
4. New device: `completeLink`, then its session. The id it made on its own is dropped.

## Recovery

From a kit: `recoverPrism({prism, records, shares: [share], device, rotateRecovery: {threshold: 1, guardians: [{paper: true}]}})`
binds this browser's new device and revokes every other device. It replaces
the recovery device, so the new kit retires the old one. The frame then takes
in what the relay holds. A used kit's recovery device is retired, and its
retirement kept none of what this replay signed, so this device cannot sign
(or the two retirements fork the log, which resolves for no one): the kit was
already used and is refused, before anything is kept or published. A device
checks its own log with `heardLog(..., {own: true})`, which refuses a second
retirement of a retired recovery device (stitch's `admitRecords`), so a fork
heard on the relay never reaches it.

## Devices

The panel lists the id's active devices from its log and removes one with
`revokeDevice`, which rotates the private boundary key. It then shares the
log under every key it holds, so devices that have not taken up the rotation
still hear it.

## Apps hear removals

Every time a device shares (after creating, linking, removing or
recovering), it also publishes the id's public log with `publishLog`, on a
topic derived from the prism id alone. `verifySession` passes the relay to
`verifyAction` (`{bus}`), which merges what that topic holds (`heardLog`), so
a session from a device removed elsewhere is refused even when that device
never synced. Making the session and recovery check the same merged log.

## Not yet (stitch's to define, its docs/prism-id.md "Open")

- Whoever holds a used kit can still sign a second retirement and publish it.
  It cannot act as the person, but apps that hear it act for neither side;
  telling the two apart needs stitch's witnessed time.
- The relay holds messages for 30 minutes, so an app hears a removal only
  within 30 minutes of the last publish. A session signed before a removal
  lasts until it expires (at most 8 days).
