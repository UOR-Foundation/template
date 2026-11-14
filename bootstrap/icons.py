"""The app's icons: the Hologram logomark, the brand kit's 70 dots, on the
brand's warm dark ground. Every Prism app opens with it, as its favicon, its
home-screen icon and its install icon, until it draws its own.

    python -I bootstrap/icons.py            # the name from site/app.json

Writes site/icons/icon-192.png, icon-512.png, maskable-512.png (the mark
inside the 80 percent safe zone), apple-touch-icon.png (180) and
site/favicon.svg, the mark as a vector that follows the browser's colour
scheme. Needs Pillow; nothing is fetched."""
import hashlib, os, sys

from PIL import Image, ImageDraw, PngImagePlugin

# The stamp: a SHA-256 of what this image was drawn from, this script's own
# bytes included, written into the PNG. bootstrap/page.mjs recomputes it from
# app.json and refuses an image drawn for another app or by an older script.
STAMP_KEY = "prism-drawn-for"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "site/icons")
FAVICON = os.path.join(ROOT, "site/favicon.svg")
GROUND = (0x15, 0x13, 0x12)       # color.background, dark
INK = (0xF6, 0xF5, 0xF4)          # color.foreground, dark
LIGHT_INK = "#302b28"             # color.foreground, light

# The Hologram logomark, exactly: every dot (cx, cy, r) of
# brand/logos/svg/logomark/Hologram_Logomark_White.svg in
# Hologram-Technologies/hologram-brand-kit at the commit brand.lock pins
# (that file's SHA-256 is 1e7b6204374f9b4c77da87da6a169073d91f2cdaf792a7653a70902ddd3f0566),
# drawn in its viewBox -104 -104 208 208.
DOTS = (
    (0.20, -97.39, 2.61), (-22.86, -86.55, 2.71), (22.54, -86.32, 2.81), (-0.03, -76.01, 2.71),
    (45.26, -75.92, 7.80), (-45.82, -75.86, 2.61), (68.34, -65.13, 7.70), (-68.83, -65.00, 2.61),
    (-22.91, -64.90, 2.61), (22.71, -64.88, 2.51), (91.24, -54.34, 2.61), (-45.94, -54.25, 7.83),
    (-91.17, -54.19, 2.71), (-0.03, -54.19, 2.71), (45.35, -54.19, 7.80), (-22.86, -43.64, 2.71),
    (22.71, -43.49, 2.51), (68.29, -43.47, 7.73), (-68.60, -43.37, 7.73), (-45.85, -32.63, 7.77),
    (45.36, -32.60, 7.80), (-91.26, -32.55, 2.71), (0.10, -32.51, 2.61), (91.24, -32.51, 2.61),
    (68.22, -21.95, 7.83), (22.67, -21.84, 7.87), (-22.86, -21.82, 2.71), (-68.57, -21.80, 7.80),
    (45.45, -11.06, 7.73), (-0.19, -11.04, 7.87), (91.35, -11.01, 2.81), (-91.54, -10.97, 2.51),
    (-45.87, -10.87, 7.73), (22.71, -0.27, 8.06), (-22.89, -0.21, 7.90), (68.28, -0.15, 7.87),
    (-68.62, -0.11, 8.00), (-0.06, 10.98, 7.87), (45.54, 11.00, 7.83), (-45.85, 11.02, 7.77),
    (-91.26, 11.10, 2.71), (91.24, 11.13, 2.61), (22.71, 21.64, 2.71), (-68.74, 21.66, 7.87),
    (-22.86, 21.67, 7.87), (68.28, 21.67, 7.87), (-91.54, 32.46, 2.61), (0.15, 32.46, 2.71),
    (-45.72, 32.50, 7.73), (45.54, 32.59, 7.83), (91.35, 32.63, 2.81), (-23.01, 43.23, 2.61),
    (68.25, 43.31, 7.83), (-68.71, 43.34, 7.83), (22.71, 43.37, 2.90), (91.39, 53.92, 2.71),
    (45.48, 53.95, 7.87), (-45.86, 53.97, 7.80), (-91.34, 53.99, 2.61), (0.20, 54.09, 2.61),
    (-68.57, 64.90, 7.80), (-22.86, 64.92, 2.71), (68.28, 64.92, 2.71), (22.54, 65.15, 2.81),
    (-45.88, 75.56, 7.80), (0.10, 75.62, 2.61), (45.32, 75.62, 2.61), (22.53, 86.47, 2.71),
    (-22.86, 86.75, 2.71), (-0.03, 97.29, 2.71),
)
VIEW = 208


def icon(size, maskable=False):
    scale = 4
    s = size * scale
    im = Image.new("RGB", (s, s), GROUND)
    d = ImageDraw.Draw(im)
    # The mark spans 72 percent of the icon; the maskable one keeps it inside
    # the 80 percent safe zone, at 58.
    span = s * (0.58 if maskable else 0.72)
    k = span / VIEW
    for cx, cy, r in DOTS:
        x, y, rr = s / 2 + cx * k, s / 2 + cy * k, r * k
        d.ellipse((x - rr, y - rr, x + rr, y + rr), fill=INK)
    return im.resize((size, size), Image.LANCZOS)


def favicon():
    """The mark as a vector, warm white on a dark browser, warm black on a light one."""
    dots = "".join(f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r:.2f}"/>' for cx, cy, r in DOTS)
    ink = "#%02x%02x%02x" % INK
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-104 -104 208 208" role="img" aria-label="Hologram">'
        f"<style>circle{{fill:{ink}}}@media (prefers-color-scheme:light){{circle{{fill:{LIGHT_INK}}}}}</style>"
        f"<g>{dots}</g></svg>\n"
    )


def stamp(*parts):
    """The fingerprint page.mjs recomputes: the parts joined by newlines, hashed."""
    drawer = hashlib.sha256(open(os.path.abspath(__file__), "rb").read()).hexdigest()
    info = PngImagePlugin.PngInfo()
    info.add_text(STAMP_KEY, hashlib.sha256("\n".join([*parts, drawer]).encode("utf-8")).hexdigest())
    return info


def palette(image):
    # The mark is two colours and their antialiased edge: 8 colours keep it
    # identical to the eye and make each PNG about a sixth of its RGB size, so
    # the icon a page links stays inside its Lighthouse budget.
    return image.convert("RGBA").quantize(8, method=Image.Quantize.FASTOCTREE)


def main(name):
    os.makedirs(OUT, exist_ok=True)
    palette(icon(192)).save(os.path.join(OUT, "icon-192.png"), optimize=True, pnginfo=stamp("icons", name))
    palette(icon(512)).save(os.path.join(OUT, "icon-512.png"), optimize=True, pnginfo=stamp("icons", name))
    palette(icon(512, maskable=True)).save(os.path.join(OUT, "maskable-512.png"), optimize=True, pnginfo=stamp("icons", name))
    palette(icon(180)).save(os.path.join(OUT, "apple-touch-icon.png"), optimize=True, pnginfo=stamp("icons", name))
    with open(FAVICON, "w", encoding="utf-8", newline="\n") as out:
        out.write(favicon())
    for f in sorted(os.listdir(OUT)):
        print(f"icons: {f} {os.path.getsize(os.path.join(OUT, f))} bytes")
    print(f"icons: favicon.svg {os.path.getsize(FAVICON)} bytes")


if __name__ == "__main__":
    import json
    name = sys.argv[1] if len(sys.argv) > 1 else json.load(open(os.path.join(ROOT, "site/app.json"), encoding="utf-8"))["name"]
    main(name)
