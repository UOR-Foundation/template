# Prism ids

The person icon at the right end of every Prism app's bar. One click opens a
small Prism id window; one more, and the visitor is signed in. There is no
password and no passkey prompt: the browser makes its own key, which never
leaves it. One Prism id signs in to every Prism app, Foundry included.
[PROTOCOL.md](PROTOCOL.md) is the contract; the id itself is stitch's Prism
id, pinned in [stitch.lock](stitch.lock).

## Losing a device never loses the id

Creating a Prism id shows its recovery code once, before the first sign-in.
On any browser, **Use a recovery code** brings the same id there. A signed-in
visitor can make a fresh code from the panel at any time (**Recovery code**),
and every code keeps working until a device removes it. **Download** saves a
recovery file holding the code and its sealed escrow, which recovers even
when the registry cannot be reached.

## Why a window, and why this domain

A Prism id's device lives in `id.uor.foundation`'s storage. Inside another
site's iframe a browser partitions that storage per site, which would give
every app a different device, so the page runs as its own window, where its
storage is the same for every app. The origin serves this one page and
nothing else.

## Who is trusted with what

| Part | If it were hostile, it could | It could not |
| --- | --- | --- |
| Registry mailbox | Withhold an escrow or sync message | Read one, or forge one: names are derived from secrets, messages are sealed, and every record is signed and checked by the reader |
| Prism id page | Refuse to help | Sign for an app without the visitor continuing in its window, which names the app |
| Another app | Ask the visitor to sign in to *it* | Use that session elsewhere: a session names the app origin it was signed for |
| Script on the app's own page | Use the session while the page is open | Copy the session key out: it is a non-extractable WebCrypto key |

## Run it

```sh
npm ci && npx playwright install chromium
npm run test:identity        # the stitch copy matches its lock, every refused check, then the flow in Chromium
node identity/dev.mjs        # the Prism id page on localhost:8790, a demo app on 127.0.0.1:8791
```

`dev.mjs` stands in for the registry's mailbox with an in-memory one; the
frame's checks are the real ones.

## Follow stitch

```sh
node identity/stitch-sync.mjs <stitch commit>    # fetches that commit; add a local checkout path to read it instead
```

It rewrites `prism-id.mjs` and `stitch.lock`. Copy `frame/` and `identity/`
to Foundry and prism-devrel byte for byte, as with any frame change.

## Deploy

1. Deploy the registry's `/prism/topic/` routes (UOR-Foundation/kappa-registry).
2. `node identity/publish.mjs out` writes the page with every file it loads
   pinned by hash, and `current.json` naming the page by its SHA-256. Serve
   `out/` as static files at `https://id.uor.foundation`, HTTPS only, with
   HSTS. Do not set `Cross-Origin-Opener-Policy: same-origin`: the app needs
   the window's `opener`.

Ship the page before the frame: the frame opens the page's window. The page
works before the registry routes do (sign-in needs no registry; a new
recovery code then asks the visitor to download its recovery file).
