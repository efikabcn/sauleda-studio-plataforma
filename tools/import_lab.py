"""Incorpora al catálogo (data/fabrics.json) los datos que entrega el laboratorio.

Entrada preferida: el Excel «Sauleda-Datos-Laboratorio.xlsx» (tools/build_lab_template.py)
tal como lo devuelve el laboratorio. Se leen:
  · hoja «Colores»: Ts, Rs, Tv, Rv, Rs int., Tuv, apertura (en %), emisividades (0-1),
    laboratorio, nº informe y fecha — una fila por referencia de color.
  · hoja «Familias»: gramaje, espesor, ancho, fuego, garantía y certificados; y las
    familias nuevas que haya añadido el laboratorio.
También vale un CSV (separador ; o ,, coma o punto decimal) con las columnas
  Referencia · Ts · Rs · Tv · Rv · ε cara sol · ε otra cara · Apertura % · Laboratorio · nº informe · Fecha
en % o en tanto por uno (se detecta solo).

Uso:
  python3 tools/import_lab.py Sauleda-Datos-Laboratorio.xlsx            # muestra los cambios, no escribe
  python3 tools/import_lab.py Sauleda-Datos-Laboratorio.xlsx --escribir # actualiza data/fabrics.json

Origen de cada color (solar.source):
  · "ensayo": Ts, Rs y Tv con laboratorio y nº de informe.
  · "ficha":  Ts y Rs sin informe (valores de la ficha técnica de Sauleda). Si falta Tv, se
              estima a partir de Ts y se marca en solar.est = ["Tv"].
  · "estimado": lo que ya había. Si llega solo algún valor suelto (p. ej. Rs), se guarda y se
              anota en solar.measured, pero el color sigue como estimado.
Las familias y colores nuevos con Ts y Rs se dan de alta (color de muestra aproximado por el
nombre). Los que no traen datos se listan como pendientes. La fila EJEMPLO se ignora.
Las referencias repetidas con los mismos valores (mismo color en otro ancho) se guardan como
alias del primer color (color.alt).
"""
import csv, datetime, json, pathlib, re, statistics, sys, unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
CATALOG = ROOT / "data" / "fabrics.json"


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return "".join(ch for ch in s if ch.isalnum())


# Cabeceras normalizadas → clave. Incluye las del Excel y las del CSV antiguo.
COLS = {
    "family": ["idfamilia"],
    "article": ["articulo"],
    "ref": ["referencia", "ref"],
    "name": ["nombrecolor"],
    "Ts": ["ts"],
    "Rs": ["rs", "rscaraext"],
    "Tv": ["tv"],
    "Rv": ["rv", "rvcaraext"],
    "RsBack": ["rscaraint"],
    "Tuv": ["tuv"],
    "openness": ["aperturacf", "apertura", "aperturapct"],
    "emisFront": ["caraext01", "ecaraext01", "carasol", "ecarasol", "ecaradesol", "emisividadcarasol"],
    "emisBack": ["caraint01", "ecaraint01", "otracara", "eotracara", "emisividadotracara"],
    "lab": ["laboratorio", "laboratorioninforme", "laboratorionoinforme"],
    "report": ["ninforme", "noinforme", "informe"],
    "date": ["fechaensayo", "fecha"],
    "notes": ["observaciones"],
}
PCT = ("Ts", "Rs", "Tv", "Rv", "RsBack", "Tuv", "openness")
EXTRA = ("Rv", "RsBack", "Tuv", "openness", "emisFront", "emisBack")

FAM_COLS = {
    "id": "idfamilia", "name": "nombrecomercial", "use": "usoprincipal", "material": "composicion",
    "construction": "construccion", "gsm": "gramajegm2", "thickness_mm": "espesormm",
    "roll_cm": "anchoderollocm", "fire": "reaccionalfuegonormayclase",
    "lightfast": "solidezalaluzescalaazul", "warranty_y": "garantiaanos", "certs": "certificados",
    "notes": "observaciones",
}

# Uso principal (texto libre del laboratorio) → usos de la aplicación.
USES = {"velas": ["velas"], "toldo": ["toldo"], "toldos": ["toldo"]}
USE_DEFAULT = ["screen"]          # cortinas enrollables, zip, cortinas outdoor…

# Color de muestra aproximado por el nombre (solo para pintar la muestra en pantalla).
HEX = {
    "superwhite": "#F7F7F5", "white": "#EFEFEC", "optik": "#F2F1EC", "coton": "#ECE7DC",
    "cream": "#EDE3CC", "marfil": "#EAE0C8", "beige": "#D8C7A6", "sand": "#CDBB97",
    "pearl": "#C9C4B8", "stone": "#A9A196", "claritystone": "#A9A196", "silver": "#B7B8B6",
    "alu": "#A8ABAD", "metal": "#8E9093", "metalwhite": "#E4E4E0", "metalwhitegrey": "#C9CACA",
    "metalwhitelinen": "#DCD4C4", "grey": "#9A9C9E", "iron": "#5E5F60", "mineral": "#4B4D4F",
    "grafito": "#3D3E40", "anthracite": "#33353A", "antracite": "#33353A", "bronze": "#5B4A3A",
    "chocolat": "#4A3528", "black": "#1E1E1F", "whitepearl": "#E6E3DA", "whitesand": "#E3DACA",
}
BICOLOR = {"whiteblack": ("#EFEFEC", "#1E1E1F")}

# Traducción mínima de las composiciones y usos de la ficha.
EN_WORDS = [("fibra de vidrio", "fibreglass"), ("poliéster", "polyester"), ("Cortinas enrollables", "Roller blinds"),
            ("Cortinas outdoor", "Outdoor blinds"), ("Zip", "Zip screens")]


def to_en(s):
    for a, b in EN_WORDS:
        s = s.replace(a, b)
    return s


def num(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    return float(str(v).strip().replace("%", "").replace(",", "."))


def as_text(v):
    if isinstance(v, (datetime.date, datetime.datetime)):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip() if v is not None else ""


def index_header(head):
    # «Ts (%)» → «ts», «ε cara ext. (0-1)» → «caraext01»
    head = [norm(h) for h in head]
    idx = {}
    for key, names in COLS.items():
        for i, h in enumerate(head):
            if h in names:
                idx.setdefault(key, i)
    return idx


def rows_from_table(table, where):
    """table = lista de filas; la cabecera es la fila que contiene «Referencia»."""
    for hrow, row in enumerate(table):
        if "referencia" in [norm(c) for c in row]:
            break
    else:
        sys.exit(f"No encuentro la cabecera con «Referencia» en {where}.")
    idx = index_header(table[hrow])
    missing = [k for k in ("ref", "Ts", "Rs", "Tv") if k not in idx]
    if missing:
        sys.exit(f"Faltan columnas obligatorias en {where}: {', '.join(missing)}.")
    for r in table[hrow + 1:]:
        yield {k: (r[i] if i < len(r) else None) for k, i in idx.items()}


def read_xlsx(path):
    import warnings
    from openpyxl import load_workbook
    warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")
    wb = load_workbook(path, data_only=True, read_only=True)
    if "Colores" not in wb.sheetnames:
        sys.exit("El Excel no tiene la hoja «Colores».")
    colors = list(rows_from_table([list(r) for r in wb["Colores"].iter_rows(values_only=True)], "«Colores»"))
    fams = []
    if "Familias" in wb.sheetnames:
        table = [list(r) for r in wb["Familias"].iter_rows(values_only=True)]
        for h, row in enumerate(table):
            head = [norm(c) for c in row]
            if "idfamilia" in head:
                pos = {k: head.index(n) for k, n in FAM_COLS.items() if n in head}
                fams = [{k: r[i] for k, i in pos.items()} for r in table[h + 1:] if r[pos["id"]]]
                break
    return colors, fams, True          # en el Excel los porcentajes van siempre en %


def read_csv(path):
    raw = pathlib.Path(path).read_text(encoding="utf-8-sig").splitlines()
    dialect = csv.Sniffer().sniff(raw[0], delimiters=";,\t")
    return list(rows_from_table(list(csv.reader(raw, dialect)), path)), [], None


def fam_values(fr):
    """Campos de catálogo a partir de una fila de «Familias»."""
    out = {}
    for k in ("gsm", "thickness_mm", "warranty_y", "roll_cm"):
        try:
            v = num(fr.get(k))
        except ValueError:
            continue
        if v is None:
            continue
        key, v = ("roll_mm", round(v * 10)) if k == "roll_cm" else (k, int(v) if v.is_integer() else v)
        out[key] = v
    for k in ("material", "construction", "fire", "lightfast"):
        if as_text(fr.get(k)) and norm(fr.get(k)) != "notiene":
            out[k] = as_text(fr[k])
    certs = [c.strip() for c in as_text(fr.get("certs")).split(",") if c.strip() and norm(c) != "notiene"]
    if certs:
        out["certs"] = certs
    return out


def new_family(fid, fr, article):
    use = as_text((fr or {}).get("use"))
    vals = fam_values(fr or {})
    name = as_text((fr or {}).get("name")) or article or fid
    slug = re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower())
    slug = re.sub(r"^sauleda-", "", slug).strip("-")                # id limpio para la URL (#/tejidos?familia=…)
    f = {"id": slug, "labId": fid, "name": name, "name_en": name, "range": "Sauleda Screen" if "screen" in norm(name) else name,
         "uses": USES.get(norm(use), USE_DEFAULT), **vals, "colors": []}
    if use:
        f["useLabel"] = use
    en = {k: to_en(vals[k]) for k in ("material", "fire") if k in vals}
    if use:
        en["useLabel"] = to_en(use)
    if en:
        f["en"] = en
    if as_text((fr or {}).get("notes")):
        f["notes"] = as_text(fr["notes"])
    return f


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    path = sys.argv[1]
    write = "--escribir" in sys.argv
    colors, fams, in_pct = read_xlsx(path) if path.lower().endswith((".xlsx", ".xlsm")) else read_csv(path)

    cat = json.loads(CATALOG.read_text())
    by_ref = {c["ref"]: c for f in cat["families"] for c in f["colors"]}
    by_ref.update({a: c for f in cat["families"] for c in f["colors"] for a in c.get("alt", [])})
    by_fam = {f["id"]: f for f in cat["families"]}
    by_fam.update({f["labId"]: f for f in cat["families"] if f.get("labId")})   # ID que usa el laboratorio
    fam_rows = {as_text(fr["id"]): fr for fr in fams}
    tested, sheet, partial, created, aliases, pending, errors = [], [], [], [], [], [], []
    new_fams = []

    # 1) Leer y normalizar todas las filas
    parsed = []
    for row in colors:
        ref = as_text(row.get("ref"))
        if not ref or ref.upper().startswith("EJEMPLO"):
            continue
        try:
            vals = {k: num(row.get(k)) for k in PCT + ("emisFront", "emisBack")}
        except ValueError:
            errors.append(f"{ref}: hay valores no numéricos")
            continue
        main3 = [vals[k] for k in ("Ts", "Rs", "Tv") if vals[k] is not None]
        if not main3:
            pending.append(f"{ref} ({as_text(row.get('family'))} · {as_text(row.get('name'))})")
            continue
        pct = in_pct if in_pct is not None else max(main3) > 1
        if pct:
            for k in PCT:
                if vals[k] is not None:
                    vals[k] = round(vals[k] / 100, 4)
        bad = [k for k in PCT if vals[k] is not None and not 0 <= vals[k] <= 1]
        if bad or (vals["Ts"] is not None and vals["Rs"] is not None and vals["Ts"] + vals["Rs"] > 1):
            errors.append(f"{ref}: valores fuera de rango ({', '.join(f'{k} {vals[k]}' for k in PCT if vals[k] is not None)})")
            continue
        parsed.append((ref, row, vals))

    # Relación Tv/Ts de los screens que traen las dos (para estimar Tv cuando falta)
    ratios = [v["Tv"] / v["Ts"] for _, _, v in parsed if v["Ts"] and v["Tv"] is not None]
    tv_ratio = round(statistics.median(ratios), 3) if ratios else 0.8

    # 2) Aplicar
    seen = {}                                            # (familia, nombre, valores) → color
    for ref, row, vals in parsed:
        Ts, Rs, Tv = vals["Ts"], vals["Rs"], vals["Tv"]
        lab, report = as_text(row.get("lab")), as_text(row.get("report"))
        if not report and "·" in lab:                    # CSV antiguo: «Laboratorio · nº informe»
            lab, _, report = (s.strip() for s in lab.partition("·"))
        notes = as_text(row.get("notes"))
        fid, cname = as_text(row.get("family")), as_text(row.get("name"))

        if Ts is None or Rs is None:                     # valores sueltos (p. ej. solo Rs)
            if ref not in by_ref:
                pending.append(f"{ref} ({fid} · {cname}): solo valores sueltos y no está en el catálogo")
                continue
            s = by_ref[ref]["solar"]
            new = {k: vals[k] for k in ("Ts", "Rs", "Tv") + EXTRA if vals[k] is not None}
            if s.get("source") == "estimado" and s["Ts"] + new.get("Rs", s["Rs"]) > 1:
                errors.append(f"{ref}: la Rs medida {new['Rs']} no cuadra con la Ts estimada {s['Ts']}")
                continue
            partial.append(f"{ref} {cname}: " + " · ".join(f"{k} {s.get(k)}→{v}" for k, v in new.items()))
            s.update(new)
            s["measured"] = sorted(set(s.get("measured", [])) | set(new))
            if notes:
                s["measuredNote"] = notes
            continue

        est = []
        if Tv is None:
            Tv = round(min(Ts * tv_ratio, Ts), 3)
            est.append("Tv")
        source = "ensayo" if (lab and report and not est) else "ficha"
        solar = {"Ts": Ts, "Rs": Rs, "Tv": Tv, "source": source}
        if source == "ensayo":
            solar.update(lab=lab, report=report, date=as_text(row.get("date")))
        if est:
            solar["est"] = est
        for k in EXTRA:
            if vals[k] is not None:
                solar[k] = vals[k]
        if notes:
            solar["notes"] = notes

        key = (fid, norm(cname), tuple(sorted(solar.items(), key=lambda kv: kv[0]).__repr__()))
        if ref not in by_ref and key in seen:            # mismo color, otra referencia (otro ancho)
            first = seen[key]
            first.setdefault("alt", []).append(ref)
            aliases.append(f"{ref} = {first['ref']} ({cname})")
            continue

        if ref in by_ref:
            old = by_ref[ref]["solar"]
            (tested if source == "ensayo" else sheet).append(
                f"{ref}: Ts {old['Ts']}→{Ts} · Rs {old['Rs']}→{Rs} · Tv {old['Tv']}→{Tv}{' (Tv estimada)' if est else ''}")
            by_ref[ref]["solar"] = solar
            seen[key] = by_ref[ref]
            continue

        if fid not in by_fam:
            f = new_family(fid, fam_rows.get(fid), as_text(row.get("article")))
            cat["families"].append(f)
            by_fam[fid] = f
            new_fams.append(f"{fid} → {f['id']} · {f['name']} ({', '.join(f['uses'])})")
        hex1, hex2 = BICOLOR.get(norm(cname), (HEX.get(norm(cname), "#B5B5B5"), None))
        color = {"ref": ref, "name": cname.strip(), "hex": hex1, "solar": solar}
        if hex2:
            color["hex2"] = hex2
        by_fam[fid]["colors"].append(color)
        by_ref[ref] = color
        seen[key] = color
        created.append(f"{ref} {cname.strip()} ({fid}){' · Tv estimada' if est else ''}")

    # 3) Datos de familia de las que ya existían
    fam_changes = []
    for fid, fr in fam_rows.items():
        f = by_fam.get(fid)
        if not f or any(s.startswith(fid + " ") for s in new_fams):
            continue
        # En las familias originales (con textos en inglés revisados a mano) los textos no se tocan;
        # en las que dio de alta el laboratorio (labId), sí.
        texts = ("material", "construction", "lightfast")
        upd = {k: v for k, v in fam_values(fr).items()
               if (f.get("labId") or k not in texts) and v != f.get(k)}
        if f.get("labId"):
            note = as_text(fr.get("notes"))
            if note != f.get("notes", ""):
                upd["notes"] = note
        if upd:
            fam_changes.append(f"{fid}: " + " · ".join(f"{k} {f.get(k)}→{v}" for k, v in upd.items()))
            f.update(upd)
            if not f.get("notes"):
                f.pop("notes", None)
            if f.get("labId"):
                f.setdefault("en", {}).update({k: to_en(f[k]) for k in ("material", "fire") if f.get(k)})
                if f.get("construction"):
                    f["en"]["construction"] = f["construction"].replace("Monofilamento", "Monofilament")
    empty = [fid for fid in fam_rows if fid not in by_fam]

    # 4) Los genéricos se retiran cuando hay artículos reales del mismo uso
    removed = []
    for use in ("screen", "toldo"):
        real = any(use in f["uses"] and f["colors"] for f in cat["families"] if not f.get("generic"))
        for g in [f for f in cat["families"] if f.get("generic") and use in f["uses"]]:
            if real:
                cat["families"].remove(g)
                removed.append(g["id"])

    out = lambda title, items: items and print(f"{title} ({len(items)}):", *items, sep="\n  ")
    out("Colores con ensayo de laboratorio", tested)
    out("Colores con datos de ficha técnica (sin nº de informe)", sheet)
    out("Familias nuevas", new_fams)
    out("Colores nuevos dados de alta", created)
    out("Referencias repetidas guardadas como alias", aliases)
    out("Valores sueltos (el color sigue estimado)", partial)
    out("Familias corregidas", fam_changes)
    out("Sin datos todavía (pendientes)", pending)
    if empty:
        print("Familias sin colores con datos (no se dan de alta):", ", ".join(empty))
    if removed:
        print("Genéricos retirados:", ", ".join(removed))
    out("Filas con error (no se tocan)", errors)
    print(f"Tv estimada como Ts × {tv_ratio} (mediana de {len(ratios)} colores que traen Ts y Tv).")
    allc = [c for f in cat["families"] for c in f["colors"]]
    cnt = lambda s: sum(1 for c in allc if c["solar"].get("source") == s)
    print(f"Catálogo: {cnt('ensayo')} con ensayo · {cnt('ficha')} con ficha técnica · {cnt('estimado')} estimados.")
    changed = tested or sheet or created or partial or fam_changes or removed or aliases
    if write and changed:
        cat["version"] = datetime.date.today().isoformat()
        CATALOG.write_text(json.dumps(cat, ensure_ascii=False, indent=1))
        print(f"Escrito {CATALOG}")
    elif changed:
        print("Prueba sin escribir. Añade --escribir para guardar.")


if __name__ == "__main__":
    main()
