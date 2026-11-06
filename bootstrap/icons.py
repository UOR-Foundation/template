"""The app's icons, from the brand: the warm dark ground, the app's initial in
Archivo SemiBold, and the brand dot. No logo.

    python -I bootstrap/icons.py            # the name from site/app.json

Writes site/icons/icon-192.png, icon-512.png, maskable-512.png (the initial
inside the 80 percent safe zone) and apple-touch-icon.png (180). Needs Pillow
and the Archivo source from `node bootstrap/brand-sync.mjs --sync`."""
import hashlib, os, sys

from PIL import Image, ImageDraw, ImageFont, PngImagePlugin

# The stamp: a SHA-256 of what this image was drawn from, this script's own
# bytes included, written into the PNG. bootstrap/page.mjs recomputes it from
# app.json and refuses an image drawn for another app, another name, purpose
# or live URL, or by an older script: a new app cannot ship the template's.
STAMP_KEY = "prism-drawn-for"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, ".brand-src/brand/fonts/otf/Archivo-Variable.ttf")
OUT = os.path.join(ROOT, "site/icons")
GROUND = (0x15, 0x13, 0x12)       # color.background, dark
INK = (0xF6, 0xF5, 0xF4)          # color.foreground, dark
BRAND = (0xE9, 0x3B, 0x01)        # color.brand


def icon(size, initial, maskable=False):
    scale = 4
    s = size * scale
    im = Image.new("RGB", (s, s), GROUND)
    d = ImageDraw.Draw(im)
    # The maskable icon keeps everything inside the 80 percent safe zone.
    glyph = int(s * (0.46 if maskable else 0.56))
    font = ImageFont.truetype(FONT, glyph)
    try:
        font.set_variation_by_axes([600])
    except Exception:
        pass
    box = d.textbbox((0, 0), initial, font=font, anchor="ls")
    w = box[2] - box[0]
    x = (s - w) / 2 - box[0]
    y = s / 2 + (box[3] - box[1]) / 2 - box[3] * 0 - (box[3])  # baseline so the glyph box is centred
    d.text((x, y + (box[3] - box[1]) / 2), initial, font=font, fill=INK, anchor="ls")
    r = s * (0.055 if maskable else 0.07)
    cx = x + w + r * 0.9
    cy = y + (box[3] - box[1]) / 2 - r * 0.2
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=BRAND)
    return im.resize((size, size), Image.LANCZOS)


def stamp(*parts):
    """The fingerprint page.mjs recomputes: the parts joined by newlines, hashed."""
    drawer = hashlib.sha256(open(os.path.abspath(__file__), "rb").read()).hexdigest()
    info = PngImagePlugin.PngInfo()
    info.add_text(STAMP_KEY, hashlib.sha256("\n".join([*parts, drawer]).encode("utf-8")).hexdigest())
    return info


def main(name):
    initial = next((c for c in name if c.isalnum()), "P").upper()
    os.makedirs(OUT, exist_ok=True)
    icon(192, initial).save(os.path.join(OUT, "icon-192.png"), optimize=True, pnginfo=stamp("icons", name))
    icon(512, initial).save(os.path.join(OUT, "icon-512.png"), optimize=True, pnginfo=stamp("icons", name))
    icon(512, initial, maskable=True).save(os.path.join(OUT, "maskable-512.png"), optimize=True, pnginfo=stamp("icons", name))
    icon(180, initial).save(os.path.join(OUT, "apple-touch-icon.png"), optimize=True, pnginfo=stamp("icons", name))
    for f in sorted(os.listdir(OUT)):
        print(f"icons: {f} {os.path.getsize(os.path.join(OUT, f))} bytes")


if __name__ == "__main__":
    import json
    name = sys.argv[1] if len(sys.argv) > 1 else json.load(open(os.path.join(ROOT, "site/app.json"), encoding="utf-8"))["name"]
    main(name)
