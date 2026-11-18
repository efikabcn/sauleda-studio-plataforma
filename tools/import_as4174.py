"""Datos de sombra y UV de los tejidos de velas (AS 4174:2018), copiados de las fichas de GALE Pacific.

En velas no se usan Ts/Rs/Tv (EN 410 / EN 14500 son para ventanas y fachadas). Lo que se muestra
al cliente es lo que da la ficha según AS 4174: factor de cobertura, factor de sombra, transmisión
UV-visible, transmisión y bloqueo UVR, UVE y categoría de protección.

Fuentes (entregadas por Gemma Capella, GALE Pacific, nov-2026):
  · Commercial 95: «2024-10-GP-Comm95-ProductProfile-Spanish-v19.pdf» (Rev.19 10/24)
    y, para Royal Purple, Cayenne y Cedar: «Commercial 95 - Product Profile Rev.16 - May 19 (Spanish).pdf»
  · Commercial NinetyFive FR: «GALE Commercial - Product Profile - Commercial NinetyFive FR - 16-3-27.pdf» (2026)
  · Commercial Heavy 430: «2024-11-GP-CommHeavy430-ProductProfile-Spanish-v3.pdf» (Rev.3 11/24)
  · Commercial DualShade 350: «2024-11-GP-DualShade-ProductProfile-Spanish-v1.pdf» (Rev.1 11/24)
Equivalencias de nombre (Green = Brunswick Green, Metal = Gun Metal) confirmadas por GALE.
Heavy 430: Sauleda solo tiene en stock White, Natural, Desert Sand y Steel Grey (el resto, 2-3 meses).

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
# Colores que no salen en la ficha Rev.19 (se retiraron y volvieron en 2025): ficha Rev.16 (05/2019).
C95_2019 = {
    "Royal Purple": (91, 87.7, 12.3, 8.9, 91.1, 91, "Very Effective"),
    "Cayenne": (92, 85.3, 14.7, 7.6, 92.4, 91, "Very Effective"),
    "Cedar": (93, 87.3, 12.7, 6.4, 93.6, 93, "Very Effective"),
}
# Commercial NinetyFive FR, Product Profile 2026 (sustituye a la Rev.4; añade Cayenne y Royal Purple).
C95FR = {
    "Aquamarine": (93, 87.3, 12.7, 6.7, 93.3, 92, "Very Effective"),
    "Aquatic Blue": (92, 88.1, 11.9, 8.5, 91.5, 91, "Very Effective"),
    "Black": (95, 94.8, 5.2, 5.0, 95.0, 94, "Very Effective"),
    "Blue Bird": (94, 90.4, 9.6, 5.8, 94.2, 93, "Very Effective"),
    "Bright Green": (90, 87.3, 12.7, 9.0, 91.0, 90, "Effective"),
    "Brunswick Green": (93, 92.9, 7.1, 6.4, 93.6, 92, "Very Effective"),
    "Cayenne": (93, 87.3, 12.7, 6.7, 93.3, 92, "Very Effective"),
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
    "Royal Purple": (91, 87.9, 12.1, 8.6, 91.4, 90, "Effective"),
    "Sky Blue": (94, 91.3, 8.7, 6.0, 94.0, 93, "Very Effective"),
    "Steel Grey": (92, 89.7, 10.3, 7.6, 92.4, 91, "Very Effective"),
    "Stone": (92, 80.3, 19.7, 8.1, 91.9, 91, "Very Effective"),
    "Turquoise": (94, 89.5, 10.5, 6.6, 93.4, 93, "Very Effective"),
    "White": (95, 76.5, 23.5, 5.4, 94.6, 94, "Very Effective"),
    "Yellow": (93, 77.5, 22.5, 6.8, 93.2, 92, "Very Effective"),
}

HEAVY430 = {
    "Aquatic Blue": (87, 85.5, 14.5, 12.7, 87.3, 87, "Effective"),
    "Black": (86, 86.4, 13.6, 13.6, 86.4, 86, "Effective"),
    "Bright Green": (86, 85.2, 14.8, 13.2, 86.8, 86, "Effective"),
    "Brunswick Green": (86, 86.7, 13.3, 13.2, 86.8, 86, "Effective"),
    "Charcoal": (87, 87.5, 12.5, 12.4, 87.6, 87, "Effective"),
    "Deep Ochre": (87, 87.0, 13.0, 12.7, 87.3, 86, "Effective"),
    "Desert Sand": (85, 79.0, 21.0, 14.1, 85.9, 85, "Effective"),
    "Emerald": (86, 84.7, 15.3, 13.3, 86.7, 86, "Effective"),
    "Natural": (88, 73.9, 26.1, 12.1, 87.9, 87, "Effective"),
    "Navy Blue": (87, 86.8, 13.2, 12.5, 87.5, 87, "Effective"),
    "Orange": (86, 75.9, 24.1, 13.2, 86.8, 86, "Effective"),
    "Red": (87, 76.0, 24.0, 12.6, 87.4, 87, "Effective"),
    "Royal Purple": (86, 85.0, 15.0, 13.5, 86.5, 86, "Effective"),
    "Steel Grey": (86, 85.5, 14.5, 13.5, 86.5, 86, "Effective"),
    "White": (86, 69.0, 31.0, 13.4, 86.6, 86, "Effective"),
    "Yellow": (86, 70.3, 29.7, 13.9, 86.1, 85, "Effective"),
}
DUAL350 = {
    "Amazonia": (92, 91.1, 8.9, 7.6, 92.4, 91, "Very Effective"),
    "Capri": (92, 83.9, 16.1, 7.9, 92.1, 91, "Very Effective"),
    "Chameleon": (90, 86.4, 13.6, 9.7, 90.3, 91, "Very Effective"),
    "Citrus": (91, 87.0, 13.0, 8.1, 91.9, 91, "Very Effective"),
    "Cobblestone": (93, 90.3, 9.7, 6.4, 93.6, 93, "Very Effective"),
    "Gold Rush": (91, 88.3, 11.7, 8.5, 91.5, 90, "Effective"),
    "Macaw": (92, 83.3, 16.7, 9.3, 90.7, 90, "Effective"),
    "Maldives": (91, 88.4, 11.6, 9.1, 90.9, 90, "Effective"),
    "Santorini": (93, 83.3, 16.7, 7.8, 92.2, 92, "Very Effective"),
    "Savanna": (92, 80.1, 19.9, 7.7, 92.3, 91, "Very Effective"),
    "Sunburst": (91, 75.2, 24.8, 9.4, 90.6, 91, "Very Effective"),
    "Topaz": (92, 85.8, 14.2, 9.4, 90.6, 90, "Effective"),
}

# Nombre en el catálogo Sauleda → nombre en la ficha de GALE.
# (*) = equivalencia supuesta por el nombre; confirmar con Sauleda/GALE.
NAMES = {
    "Sand": "Desert Sand", "Ochre": "Deep Ochre", "Bluebird": "Blue Bird", "Sky": "Sky Blue",
    "Aquatic": "Aquatic Blue", "Navy": "Navy Blue", "Red": "Cherry Red", "Rivergum": "Rivergum Green",
    "Steel": "Steel Grey",
    "Green": "Brunswick Green",   # confirmado por Gemma (GALE), 19-nov-2026
    "Metal": "Gun Metal",         # confirmado por Gemma (GALE), 19-nov-2026
    "Chamaleon": "Chameleon",
}
ASSUMED = set()

DOC_C95 = "GALE Pacific · Commercial 95 · ficha de producto Rev.19 (10/2024)"
DOC_C95_2019 = "GALE Pacific · Commercial 95 · product profile Rev.16 (05/2019)"
SHEETS = {
    "comercial95": ({**{k: (v, DOC_C95) for k, v in C95.items()}, **{k: (v, DOC_C95_2019) for k, v in C95_2019.items()}}, None),
    "comercial95fr": (C95FR, "GALE Pacific · Commercial NinetyFive FR · product profile 2026"),
    "heavy430": (HEAVY430, "GALE Pacific · Commercial Heavy 430 · ficha técnica Rev.3 (11/2024)"),
    "dualshade350": (DUAL350, "GALE Pacific · Commercial DualShade 350 · ficha técnica Rev.1 (11/2024)"),
}
# Colores de Sauleda que faltaban en el catálogo (aparecen en el Excel del laboratorio).
NEW_COLORS = {
    "comercial95": [{"ref": "7917", "name": "Cedar", "hex": "#7A5A44"}],
    "comercial95fr": [{"ref": "FR77224", "name": "Driftwood", "hex": None}],
}
FAMILY_UPDATES = {
    "comercial95fr": {
        "fire": "Ignífugo · Euroclase EN 13501-1 B-s1,d0 · DIN 4102-1 B1 · NFPA 701 (métodos 1 y 2) · CSFM 1237.1 · ASTM E84 clase A · NF P92-507 M1 · UNE-EN 15619 T2",
        "en.fire": "Flame retardant · Euroclass EN 13501-1 B-s1,d0 · DIN 4102-1 B1 · NFPA 701 (methods 1 and 2) · CSFM 1237.1 · ASTM E84 class A · NF P92-507 M1 · UNE-EN 15619 T2",
        "mech": {"tensile": {"warp": 590, "weft": 2000}, "tear": {"warp": 189, "weft": 295},
                 "burst": {"warp": 940, "weft": 2100}, "burstPressure": 1994},
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
        have = {c["ref"] for c in f["colors"]}
        for nc in NEW_COLORS.get(f["id"], []):
            if nc["ref"] not in have:
                hexv = nc["hex"] or next((c["hex"] for g in cat["families"] for c in g["colors"] if c["name"] == nc["name"]), "#B5B5B5")
                f["colors"].append({"ref": nc["ref"], "name": nc["name"], "hex": hexv, "solar": {}})
        for c in f["colors"]:
            key = NAMES.get(c["name"], c["name"])
            old = c.get("solar", {})
            keep = {k: old[k] for k in ("Rs", "measured", "measuredNote") if k in old and "Rs" in old.get("measured", [])}
            if key not in table:
                c["solar"] = {"source": "pendiente", **keep}
                missing.append(f"{c['ref']} {c['name']}")
                continue
            row = table[key]
            (cov, shade, uvvis, uvt, uvb, uve, catg), cdoc = (row if doc is None else (row, doc))
            c["solar"] = {
                "source": "ficha", "std": "AS 4174:2018", "doc": cdoc, "sheetName": key,
                "cover": round(cov / 100, 4), "openness": round(1 - cov / 100, 4), "shade": round(shade / 100, 4),
                "uvVisTrans": round(uvvis / 100, 4), "uvTrans": round(uvt / 100, 4), "uvBlock": round(uvb / 100, 4),
                "uve": round(uve / 100, 4), "category": catg, **keep,
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
