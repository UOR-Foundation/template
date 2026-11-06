"""The app's social card: the 1200 x 630 image every platform shows when the
page's link is shared. The brand's warm dark ground, the mark, the app's name
and purpose, and the promise the page keeps: proved in Lean, verified in the
visitor's browser.

    python -I bootstrap/og.py            # name, purpose and live URL from site/app.json

Writes site/og.png. Needs Pillow; the fonts are the page's own subsets in
site/fonts, so nothing else is fetched. Run it again whenever app.json's
name, purpose or live URL changes; bootstrap/page.mjs refuses to render a
page without it."""
import json, os, sys
from urllib.parse import urlparse

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, "site/fonts")
OUT = os.path.join(ROOT, "site/og.png")

# The dark tokens from site/brand/hologram-warm.css.
GROUND = (0x15, 0x13, 0x12)       # --background
INK = (0xF6, 0xF5, 0xF4)          # --foreground
MUTED = (0xA6, 0xA4, 0xA2)        # --muted-foreground
SUBTLE = (0x76, 0x74, 0x72)       # --muted-foreground-subtle
LINE = (0x2E, 0x2B, 0x29)         # a hairline on the ground
BRAND = (0xE9, 0x3B, 0x01)        # --brand
SUCCESS = (0x5F, 0xD1, 0x8B)      # --success

W, H, PAD = 1200, 630, 80
S = 2                              # drawn at twice the size, then reduced: smooth edges


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, f"{name}.woff2"), size * S)


def wrap(draw, text, face, width, lines):
    """Greedy word wrap into at most `lines` lines; the last one ends in "..."
    when the text does not fit."""
    words, out = text.split(), []
    while words and len(out) < lines:
        line = words.pop(0)
        while words and draw.textlength(f"{line} {words[0]}", font=face) <= width:
            line += " " + words.pop(0)
        out.append(line)
    if words:
        last = out[-1]
        while last and draw.textlength(last + "...", font=face) > width:
            last = last.rsplit(" ", 1)[0] if " " in last else last[:-1]
        out[-1] = last.rstrip(" ,;:.") + "..."
    return out


def shield(draw, x, y, size, colour):
    """The shield badge from the top bar: a tinted body, its outline, a tick."""
    k = size / 24 * S
    p = lambda px, py: (x * S + px * k, y * S + py * k)
    body = [p(12, 3), p(20, 6), p(20, 12), p(19.4, 15), p(17.6, 17.8), p(15, 20), p(12, 21),
            p(9, 20), p(6.4, 17.8), p(4.6, 15), p(4, 12), p(4, 6)]
    tint = tuple(round(g + (c - g) * 0.16) for g, c in zip(GROUND, colour))
    draw.polygon(body, fill=tint)
    draw.line(body + [body[0]], fill=colour, width=round(2 * k), joint="curve")
    draw.line([p(8.5, 12), p(11, 14.5), p(15.5, 9.5)], fill=colour, width=round(2 * k), joint="curve")


def card(name, purpose, live):
    im = Image.new("RGB", (W * S, H * S), GROUND)
    d = ImageDraw.Draw(im)

    # The mark: the brand dot and "Prism", top left, as in the top bar.
    mark = font("Archivo-SemiBold", 34)
    r = 11 * S
    cy = (PAD + 20) * S
    d.ellipse((PAD * S, cy - r, PAD * S + 2 * r, cy + r), fill=BRAND)
    d.text((PAD * S + 2 * r + 16 * S, cy), "Prism", font=mark, fill=INK, anchor="lm")

    # The name, as large as two lines allow, then the purpose.
    width = (W - 2 * PAD) * S
    for size in (84, 76, 68, 60):
        title = font("Archivo-SemiBold", size)
        lines = wrap(d, name, title, width, 2)
        if " ".join(lines) == name:
            break
    y = 196 * S
    for line in lines:
        d.text((PAD * S, y), line, font=title, fill=INK, anchor="lt")
        y += round(size * 1.12) * S
    body = font("Geist-Regular", 32)
    y += 18 * S
    for line in wrap(d, purpose, body, width, 3 if len(lines) == 1 else 2):
        d.text((PAD * S, y), line, font=body, fill=MUTED, anchor="lt")
        y += 46 * S

    # The footer: what the page proves, and where it lives.
    fy = H - PAD - 24
    d.line((PAD * S, (fy - 34) * S, (W - PAD) * S, (fy - 34) * S), fill=LINE, width=S)
    shield(d, PAD, fy - 16, 32, SUCCESS)
    promise, said = font("Geist-Medium", 26), "Proved in Lean. Verified in your browser."
    d.text(((PAD + 46) * S, fy * S), said, font=promise, fill=INK, anchor="lm")
    # Where it lives, when it fits beside the promise; every platform prints
    # the link under the card anyway.
    host, mono = urlparse(live), font("GeistMono-Regular", 24)
    where = (host.netloc + host.path).rstrip("/")
    room = (W - 2 * PAD - 46 - 32) * S - d.textlength(said, font=promise)
    if d.textlength(where, font=mono) <= room:
        d.text(((W - PAD) * S, fy * S), where, font=mono, fill=SUBTLE, anchor="rm")

    return im.resize((W, H), Image.LANCZOS)


def main():
    meta = json.load(open(os.path.join(ROOT, "site/app.json"), encoding="utf-8"))
    card(meta["name"], meta["purpose"], meta["live"]).save(OUT, optimize=True)
    print(f"og: site/og.png {W}x{H}, {os.path.getsize(OUT)} bytes, for {meta['name']}")


if __name__ == "__main__":
    main()
