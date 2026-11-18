"""Color de muestra real (hex) de los tejidos de velas a partir de las fotos de GALE Pacific.

Las fotos las envió Gemma Capella (GALE) en nov-2026: muestras planas de Commercial 95 y Heavy 430
y fotos de rollo de DualShade (una cara por fuera y la otra por dentro). El color se saca del
centro de la muestra, descartando brillos y sombras; en DualShade, la cara A se toma del tejido
plano de abajo a la derecha. La cara B no se toma de la foto (la franja de arriba sale desenfocada
y quemada, y el borde del rollo mezcla las dos caras): se mantiene el hex2 del catálogo hasta tener
una foto de cada cara.

Uso:  python3 tools/colors_from_photos.py ~/Downloads            # muestra los cambios
      python3 tools/colors_from_photos.py ~/Downloads --escribir # actualiza data/fabrics.json
      (añade --muestra salida.png para ver una lámina con foto y color sacado)
"""
import json, pathlib, re, sys
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
CATALOG = ROOT / "data" / "fabrics.json"

# Nombre en el fichero → nombre en el catálogo (por familia).
C95_NAMES = {
    "orange": "Orange", "royal purple": "Royal Purple", "bluebird": "Bluebird", "driftwood": "Driftwood",
    "aquamarine": "Aquamarine", "stone": "Stone", "yellow": "Yellow", "white": "White",
    "turquoise": "Turquoise", "aquatic blue": "Aquatic", "steel grey": "Steel", "sky blue": "Sky", "rivergum": "Rivergum",
    "navy blue": "Navy", "natural": "Natural", "gun metal": "Metal", "desert sand": "Sand",
    "deep ochre": "Ochre", "cherry red": "Red", "charcoal": "Charcoal", "cayenne": "Cayenne",
    "brunswick green": "Green", "black": "Black", "bright green": "Bright Green",
}
HEAVY_NAMES = {"white": "White", "natural": "Natural", "desert sand": "Desert Sand", "steel grey": "Steel Grey"}
DUAL_NAMES = {"topaz": "Topaz", "sunburst": "Sunburst", "macaw": "Macaw", "citrus": "Citrus",
              "chameleon": "Chamaleon", "capri": "Capri", "goldrush": "Gold Rush", "cobblestone": "Cobblestone",
              "amazonia": "Amazonia", "santorini": "Santorini", "maldives": "Maldives", "savanna": "Savanna"}


def region_color(img, box):
    """Color medio de una zona (fracciones x0,y0,x1,y1), sin el 15 % más claro ni el 10 % más oscuro."""
    w, h = img.size
    crop = img.crop((int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h)))
    crop.thumbnail((200, 200))
    px = list(crop.get_flattened_data()) if hasattr(crop, "get_flattened_data") else list(crop.getdata())
    px.sort(key=lambda p: 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2])
    n = len(px)
    mid = px[int(n * 0.10): int(n * 0.85)] or px
    r, g, b = (round(sum(p[i] for p in mid) / len(mid)) for i in range(3))
    return f"#{r:02X}{g:02X}{b:02X}"


def classify(path):
    """(familia, nombre de color en el catálogo) a partir del nombre del fichero, o None."""
    s = path.stem.lower().replace("_", " ")
    if s.startswith("dualfab"):
        for k, v in DUAL_NAMES.items():
            if k in s.replace(" ", ""):
                return "dualshade350", v
        return None
    fam = "heavy430" if "heavy 430" in s else "comercial95"
    names = HEAVY_NAMES if fam == "heavy430" else C95_NAMES
    s = re.sub(r"[-(].*$", "", s.replace("swatch", "").replace(" copy", "")).strip()
    for k in sorted(names, key=len, reverse=True):          # «bright green» antes que «green»
        if s.endswith(k) or s == k:
            return fam, names[k]
    return None


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    folder = pathlib.Path(sys.argv[1]).expanduser()
    write = "--escribir" in sys.argv
    sheet = sys.argv[sys.argv.index("--muestra") + 1] if "--muestra" in sys.argv else None
    cat = json.loads(CATALOG.read_text())
    fams = {f["id"]: f for f in cat["families"]}
    found, seen, thumbs = [], set(), []
    for path in sorted(folder.iterdir()):
        if path.suffix.lower() not in (".jpg", ".jpeg", ".png"):
            continue
        hit = classify(path)
        if not hit or hit in seen:
            continue
        fam, name = hit
        color = next((c for c in fams[fam]["colors"] if c["name"] == name), None)
        if not color:
            continue
        seen.add(hit)
        img = Image.open(path).convert("RGB")
        if fam == "dualshade350":
            a, b = region_color(img, (0.78, 0.70, 0.97, 0.95)), None
        else:
            a, b = region_color(img, (0.2, 0.2, 0.8, 0.8)), None
        found.append((fam, name, color, a, b, path.name))
        thumbs.append((img, a, b))

    for fam, name, color, a, b, fname in found:
        old = color["hex"] + (f"/{color.get('hex2')}" if b else "")
        print(f"{fam:13} {name:14} {old:17} → {a}{'/' + b if b else ''}   ({fname})")
        color["hex"] = a
        if b:
            color["hex2"] = b
        color["hexSource"] = "foto GALE Pacific (nov-2026)"
    # Commercial 95 FR: mismos colores que el 95
    c95 = {c["name"]: c for c in fams["comercial95"]["colors"] if c.get("hexSource")}
    for c in fams["comercial95fr"]["colors"]:
        if c["name"] in c95:
            c["hex"], c["hexSource"] = c95[c["name"]]["hex"], c95[c["name"]]["hexSource"]
    missing = [f"{f['name']} · {c['name']}" for fid in ("comercial95", "heavy430", "dualshade350")
               for f in [fams[fid]] for c in f["colors"] if not c.get("hexSource")]
    print("Sin foto:", ", ".join(missing) or "ninguno")

    if sheet:
        W = 220
        out = Image.new("RGB", (W * 3, W * len(thumbs)), "white")
        for i, (img, a, b) in enumerate(thumbs):
            t = img.copy(); t.thumbnail((W, W)); out.paste(t, (0, i * W))
            out.paste(Image.new("RGB", (W, W), a), (W, i * W))
            if b:
                out.paste(Image.new("RGB", (W, W), b), (2 * W, i * W))
        out.save(sheet)
        print("Lámina:", sheet)
    if write:
        CATALOG.write_text(json.dumps(cat, ensure_ascii=False, indent=1))
        print(f"Escrito {CATALOG}")


if __name__ == "__main__":
    main()
