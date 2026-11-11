"""Incorpora al catálogo (data/fabrics.json) los ensayos que entrega el laboratorio.

Entrada preferida: el Excel «Sauleda-Datos-Laboratorio.xlsx» (tools/build_lab_template.py)
tal como lo devuelve el laboratorio. Se leen:
  · hoja «Colores»: Ts, Rs, Tv, Rv, Rs int., Tuv, apertura (en %), emisividades (0-1),
    laboratorio, nº informe y fecha — una fila por referencia de color.
  · hoja «Familias»: gramaje, espesor, ancho, fuego, garantía y certificados, si cambian.
También vale un CSV (separador ; o ,, coma o punto decimal) con las columnas
  Referencia · Ts · Rs · Tv · Rv · ε cara sol · ε otra cara · Apertura % · Laboratorio · nº informe · Fecha
en % o en tanto por uno (se detecta solo).

Uso:
  python3 tools/import_lab.py Sauleda-Datos-Laboratorio.xlsx            # muestra los cambios, no escribe
  python3 tools/import_lab.py Sauleda-Datos-Laboratorio.xlsx --escribir # actualiza data/fabrics.json

Cada color actualizado pasa a source = "ensayo" y deja de marcarse como estimado.
Las filas sin Ts, Rs y Tv se ignoran (ensayo pendiente), igual que la fila EJEMPLO.
Las referencias o familias que no están en el catálogo se listan para darlas de alta.
"""
import csv, datetime, json, pathlib, sys, unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
CATALOG = ROOT / "data" / "fabrics.json"


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return "".join(ch for ch in s if ch.isalnum())


# Cabeceras normalizadas → clave. Incluye las del Excel y las del CSV antiguo.
COLS = {
    "family": ["idfamilia"],
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

FAM_COLS = {
    "id": "idfamilia", "gsm": "gramajegm2", "thickness_mm": "espesormm", "roll_cm": "anchoderollocm",
    "fire": "reaccionalfuegonormayclase", "warranty_y": "garantiaanos", "certs": "certificados",
}


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
    # «Ts (%)» → «ts», «ε cara ext. (0-1)» → «ecaraext01»
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
    from openpyxl import load_workbook
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


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    path = sys.argv[1]
    write = "--escribir" in sys.argv
    colors, fams, in_pct = read_xlsx(path) if path.lower().endswith((".xlsx", ".xlsm")) else read_csv(path)

    cat = json.loads(CATALOG.read_text())
    by_ref = {c["ref"]: c for f in cat["families"] for c in f["colors"]}
    by_fam = {f["id"]: f for f in cat["families"]}
    done, new_refs, errors = [], [], []

    for row in colors:
        ref = as_text(row.get("ref"))
        if not ref or ref.upper().startswith("EJEMPLO"):
            continue
        try:
            vals = {k: num(row.get(k)) for k in PCT + ("emisFront", "emisBack")}
        except ValueError:
            errors.append(f"{ref}: hay valores no numéricos")
            continue
        if None in (vals["Ts"], vals["Rs"], vals["Tv"]):
            continue                                       # ensayo pendiente
        pct = in_pct if in_pct is not None else max(vals["Ts"], vals["Rs"], vals["Tv"]) > 1
        if pct:
            for k in PCT:
                if vals[k] is not None:
                    vals[k] = round(vals[k] / 100, 4)
        Ts, Rs, Tv = vals["Ts"], vals["Rs"], vals["Tv"]
        if not all(0 <= v <= 1 for v in (Ts, Rs, Tv)) or Ts + Rs > 1:
            errors.append(f"{ref}: valores fuera de rango (Ts {Ts}, Rs {Rs}, Tv {Tv})")
            continue
        lab, report = as_text(row.get("lab")), as_text(row.get("report"))
        if not report and "·" in lab:                      # CSV antiguo: «Laboratorio · nº informe»
            lab, _, report = (s.strip() for s in lab.partition("·"))
        if ref not in by_ref:
            new_refs.append(f"{ref} ({as_text(row.get('family')) or '¿familia?'} · {as_text(row.get('name'))})")
            continue
        solar = {"Ts": Ts, "Rs": Rs, "Tv": Tv, "source": "ensayo",
                 "lab": lab, "report": report, "date": as_text(row.get("date"))}
        for k in ("Rv", "RsBack", "Tuv", "openness", "emisFront", "emisBack"):
            if vals[k] is not None:
                solar[k] = vals[k]
        if as_text(row.get("notes")):
            solar["notes"] = as_text(row["notes"])
        old = by_ref[ref]["solar"]
        done.append(f"{ref}: Ts {old['Ts']}→{Ts} · Rs {old['Rs']}→{Rs} · Tv {old['Tv']}→{Tv}")
        by_ref[ref]["solar"] = solar

    fam_changes, new_fams = [], []
    for fr in fams:
        fid = as_text(fr["id"])
        if fid not in by_fam:
            new_fams.append(fid)
            continue
        f = by_fam[fid]
        upd = {}
        for k in ("gsm", "thickness_mm", "warranty_y", "roll_cm"):
            try:
                v = num(fr.get(k))
            except ValueError:
                continue
            if v is None:
                continue
            key, v = ("roll_mm", round(v * 10)) if k == "roll_cm" else (k, int(v) if v.is_integer() else v)
            if v != f.get(key):
                upd[key] = v
        fire = as_text(fr.get("fire"))
        if fire and fire != f.get("fire"):
            upd["fire"] = fire
        certs = [c.strip() for c in as_text(fr.get("certs")).split(",") if c.strip()]
        if certs and certs != f.get("certs"):
            upd["certs"] = certs
        if upd:
            fam_changes.append(f"{fid}: " + " · ".join(f"{k} {f.get(k)}→{v}" for k, v in upd.items()))
            f.update(upd)

    print(f"{len(done)} colores con ensayo:", *done, sep="\n  ")
    if fam_changes:
        print("Familias corregidas:", *fam_changes, sep="\n  ")
    if new_refs:
        print("Colores nuevos, no están en el catálogo (darlos de alta en data/fabrics.json):",
              *new_refs, sep="\n  ")
    if new_fams:
        print("Familias nuevas, no están en el catálogo:", ", ".join(new_fams))
    if errors:
        print("Filas con error (no se tocan):", *errors, sep="\n  ")
    pend = sum(1 for f in cat["families"] for c in f["colors"] if c["solar"].get("source") != "ensayo")
    print(f"Quedan {pend} colores del catálogo sin ensayo.")
    if write and (done or fam_changes):
        CATALOG.write_text(json.dumps(cat, ensure_ascii=False, indent=1))
        print(f"Escrito {CATALOG}")
    elif done or fam_changes:
        print("Prueba sin escribir. Añade --escribir para guardar.")


if __name__ == "__main__":
    main()
