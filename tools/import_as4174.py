"""Datos de sombra y UV de los tejidos de velas (AS 4174:2018), copiados de las fichas de GALE Pacific.

En velas no se usan Ts/Rs/Tv (EN 410 / EN 14500 son para ventanas y fachadas). Lo que se muestra
al cliente es lo que da la ficha según AS 4174: factor de cobertura, factor de sombra, transmisión
UV-visible, transmisión y bloqueo UVR, UVE y categoría de protección.

Fuentes (entregadas por Gemma Capella, GALE Pacific, nov-2026):
  · Commercial 95: «2024-10-GP-Comm95-ProductProfile-Spanish-v19.pdf» (Rev.19 10/24)
  · Commercial NinetyFive 340 FR: «GALECommercial-Commercial-NinetyFive340FR-ProductProfiles-Spanish-Rev4.pdf» (Rev.4 11/25)

Uso:  python3 tools/import_as4174.py            # muestra los cambios
      python3 tools/import_as4174.py --escribir # actualiza data/fabrics.json

Los colores del catálogo cuyo nombre no está en la ficha se listan y quedan «pendiente de ficha».
"""
import json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CATALOG = ROOT / "data" / "fabrics.json"

# color: (factor cobertura, factor sombra, UV-Vis trans %, UVR trans %, UVR bloqueo %, UVE %, categoría)
C95 = {
    "Aquamarine": (95, 89.5, 10.5, 4.9, 95.1, 95, "Most Effective"),
    "Aquatic Blue": (92, 85.6, 14.4, 8.9, 91.1, 91, "Very Effective"),
    "Black": (94, 94.6, 5.4, 5.2, 94.8, 93, "Very Effective"),
    "Blue Bird": (95, 91.2, 8.8, 4.7, 95.3, 95, "Most Effective"),
    "Bright Green": (92, 88.6, 11.4, 7.5, 92.5, 91, "Very Effective"),
    "Brunswick Green": (94, 93.8, 6.2, 5.3, 94.7, 93, "Very Effective"),
    "Charcoal": (93, 93.1, 6.9, 6.6, 93.4, 91, "Very Effective"),
    "Cherry Red": (91, 78.4, 21.6, 8.8, 91.2, 91, "Very Effective"),
    "Deep Ochre": (94, 92.8, 7.2, 5.4, 94.6, 93, "Very Effective"),
    "Driftwood": (95, 90.0, 10.0, 5.1, 94.9, 94, "Very Effective"),
    "Desert Sand": (94, 86.1, 13.9, 6.2, 93.8, 93, "Very Effective"),
    "Gun Metal": (93, 91.4, 8.6, 6.8, 93.2, 92, "Very Effective"),
    "Natural": (93, 76.2, 23.8, 6.9, 93.1, 92, "Very Effective"),
    "Navy Blue": (94, 93.6, 6.4, 5.6, 94.4, 93, "Very Effective"),
    "Orange": (93, 80.6, 19.4, 6.0, 94.0, 93, "Very Effective"),
    "Rivergum Green": (93, 88.7, 11.3, 7.1, 92.9, 92, "Very Effective"),
    "Sky Blue": (92, 89.0, 11.0, 7.8, 92.2, 91, "Very Effective"),
    "Steel Grey": (94, 90.9, 9.1, 5.7, 94.3, 93, "Very Effective"),
    "Stone": (94, 89.3, 10.7, 5.7, 94.3, 94, "Very Effective"),
    "Turquoise": (92, 86.0, 14.0, 8.5, 91.5, 91, "Very Effective"),
    "White": (93, 73.9, 26.1, 7.1, 92.9, 92, "Very Effective"),
    "Yellow": (95, 77.6, 22.4, 4.5, 95.5, 94, "Very Effective"),
}
C95FR = {
    "Aquamarine": (93, 87.3, 12.7, 6.7, 93.3, 92, "Very Effective"),
    "Aquatic Blue": (92, 88.1, 11.9, 8.5, 91.5, 91, "Very Effective"),
    "Black": (95, 94.8, 5.2, 5.0, 95.0, 94, "Very Effective"),
    "Blue Bird": (94, 90.4, 9.6, 5.8, 94.2, 93, "Very Effective"),
    "Bright Green": (90, 87.3, 12.7, 9.0, 91.0, 90, "Effective"),
    "Brunswick Green": (93, 92.9, 7.1, 6.4, 93.6, 92, "Very Effective"),
    "Charcoal": (93, 93.6, 6.4, 6.1, 93.9, 92, "Very Effective"),
    "Cherry Red": (90, 80.0, 20.0, 10.0, 90.0, 90, "Effective"),
    "Deep Ochre": (91, 90.5, 9.5, 8.3, 91.7, 90, "Effective"),
    "Driftwood": (95, 89.0, 11.0, 5.4, 94.6, 94, "Very Effective"),
    "Desert Sand": (93, 86.1, 13.9, 6.6, 93.4, 92, "Very Effective"),
    "Gun Metal": (96, 94.5, 5.5, 3.5, 96.5, 96, "Most Effective"),
    "Natural": (94, 78.3, 21.7, 6.5, 93.5, 92, "Very Effective"),
    "Navy Blue": (94, 93.1, 6.9, 6.2, 93.8, 93, "Very Effective"),
    "Orange": (92, 80.8, 19.2, 7.6, 92.4, 91, "Very Effective"),
    "Rivergum Green": (94, 89.7, 10.3, 6.0, 94.0, 93, "Very Effective"),
    "Sky Blue": (94, 91.3, 8.7, 6.0, 94.0, 93, "Very Effective"),
    "Steel Grey": (92, 89.7, 10.3, 7.6, 92.4, 91, "Very Effective"),
    "Stone": (92, 80.3, 19.7, 8.1, 91.9, 91, "Very Effective"),
    "Turquoise": (94, 89.5, 10.5, 6.6, 93.4, 93, "Very Effective"),
    "White": (95, 76.5, 23.5, 5.4, 94.6, 94, "Very Effective"),
    "Yellow": (93, 77.5, 22.5, 6.8, 93.2, 92, "Very Effective"),
}

# Nombre en el catálogo Sauleda → nombre en la ficha de GALE.
# (*) = equivalencia supuesta por el nombre; confirmar con Sauleda/GALE.
NAMES = {
    "Sand": "Desert Sand", "Ochre": "Deep Ochre", "Bluebird": "Blue Bird", "Sky": "Sky Blue",
    "Aquatic": "Aquatic Blue", "Navy": "Navy Blue", "Red": "Cherry Red", "Rivergum": "Rivergum Green",
    "Steel": "Steel Grey",
    "Green": "Brunswick Green",   # (*)
    "Metal": "Gun Metal",         # (*)
}
ASSUMED = {"Green", "Metal"}

SHEETS = {
    "comercial95": (C95, "GALE Pacific · Commercial 95 · ficha de producto Rev.19 (10/2024)"),
    "comercial95fr": (C95FR, "GALE Pacific · Commercial NinetyFive 340 FR · ficha técnica Rev.4 (11/2025)"),
}
FAMILY_UPDATES = {
    "comercial95fr": {
        "fire": "Ignífugo · NFPA 701 (partes 1 y 2), CSFM 1237.1 · Euroclase EN 13501-1 B-s1,d0 · UNE-EN 15619 T2",
        "en.fire": "Flame retardant · NFPA 701 (parts 1 and 2), CSFM 1237.1 · Euroclass EN 13501-1 B-s1,d0 · UNE-EN 15619 T2",
    },
}


def main():
    write = "--escribir" in sys.argv
    cat = json.loads(CATALOG.read_text())
    done, missing, assumed = [], [], []
    for f in cat["families"]:
        if f["id"] not in SHEETS:
            if "velas" in f.get("uses", []):          # velas sin ficha todavía: sin Ts/Rs/Tv estimados
                for c in f["colors"]:
                    if c.get("solar", {}).get("source") != "ficha":
                        c["solar"] = {"source": "pendiente"}
                        missing.append(f"{c['ref']} {c['name']} ({f['name']})")
            continue
        table, doc = SHEETS[f["id"]]
        for c in f["colors"]:
            key = NAMES.get(c["name"], c["name"])
            old = c.get("solar", {})
            keep = {k: old[k] for k in ("Rs", "measured", "measuredNote") if k in old and "Rs" in old.get("measured", [])}
            if key not in table:
                c["solar"] = {"source": "pendiente", **keep}
                missing.append(f"{c['ref']} {c['name']}")
                continue
            cov, shade, uvvis, uvt, uvb, uve, catg = table[key]
            c["solar"] = {
                "source": "ficha", "std": "AS 4174:2018", "doc": doc, "sheetName": key,
                "cover": cov / 100, "openness": round(1 - cov / 100, 3), "shade": shade / 100,
                "uvVisTrans": uvvis / 100, "uvTrans": uvt / 100, "uvBlock": uvb / 100,
                "uve": uve / 100, "category": catg, **keep,
            }
            if c["name"] in ASSUMED:
                c["solar"]["nameAssumed"] = True
                assumed.append(f"{c['ref']} {c['name']} = «{key}»")
            done.append(f"{c['ref']} {c['name']}: sombra {shade} % · UV {uvb} % · cobertura {cov} %")
        for k, v in FAMILY_UPDATES.get(f["id"], {}).items():
            if k.startswith("en."):
                f.setdefault("en", {})[k[3:]] = v
            else:
                f[k] = v
    print(f"Colores con datos AS 4174 ({len(done)}):", *done, sep="\n  ")
    print(f"Equivalencias de nombre supuestas ({len(assumed)}):", *assumed, sep="\n  ")
    print(f"No están en la ficha ({len(missing)}):", *missing, sep="\n  ")
    if write:
        CATALOG.write_text(json.dumps(cat, ensure_ascii=False, indent=1))
        print(f"Escrito {CATALOG}")


if __name__ == "__main__":
    main()
