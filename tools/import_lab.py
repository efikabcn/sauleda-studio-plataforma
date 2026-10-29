"""Incorpora al catálogo (data/fabrics.json) los ensayos que entrega el laboratorio.

Entrada: la plantilla de la «Ficha de datos solares por artículo» exportada a CSV
(separador ; o , — Excel en español usa ; y coma decimal; se aceptan los dos).
Columnas que se leen (el orden da igual, las mayúsculas y tildes también):
  Referencia · Ts · Rs · Tv · Rv · ε cara sol · ε otra cara · Apertura % ·
  Laboratorio · nº informe · Fecha ensayo

Uso:
  python3 tools/import_lab.py ensayos.csv            # muestra los cambios, no escribe
  python3 tools/import_lab.py ensayos.csv --escribir # actualiza data/fabrics.json

Cada color actualizado pasa a source = "ensayo" y deja de marcarse como estimado.
Las referencias que no están en el catálogo se listan y no se tocan.
"""
import csv, json, pathlib, sys, unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
CATALOG = ROOT / "data" / "fabrics.json"


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return "".join(ch for ch in s if ch.isalnum())


COLS = {
    "ref": ["referencia", "ref"],
    "Ts": ["ts"], "Rs": ["rs"], "Tv": ["tv"], "Rv": ["rv"],
    "emisFront": ["carasol", "caradesol", "ecaradesol", "caradsol", "ecarasol", "emisividadcarasol"],
    "emisBack": ["otracara", "eotracara", "emisividadotracara"],
    "openness": ["apertura", "apertura%", "aperturapct"],
    "lab": ["laboratorioninforme", "laboratorio", "laboratorionoinforme"],
    "date": ["fechaensayo", "fecha"],
}


def num(v):
    v = (v or "").strip().replace(",", ".")
    return float(v) if v else None


def read_rows(path):
    raw = pathlib.Path(path).read_text(encoding="utf-8-sig")
    dialect = csv.Sniffer().sniff(raw.splitlines()[0], delimiters=";,\t")
    rows = list(csv.reader(raw.splitlines(), dialect))
    head = [norm(h) for h in rows[0]]
    idx = {}
    for key, names in COLS.items():
        for i, h in enumerate(head):
            if h in names or any(h.endswith(n) for n in names if len(n) > 4):
                idx.setdefault(key, i)
    missing = [k for k in ("ref", "Ts", "Rs", "Tv") if k not in idx]
    if missing:
        sys.exit(f"Faltan columnas obligatorias: {', '.join(missing)}. Cabecera leída: {rows[0]}")
    for r in rows[1:]:
        if not any(c.strip() for c in r):
            continue
        get = lambda k: r[idx[k]].strip() if k in idx and idx[k] < len(r) else ""
        yield {k: get(k) for k in idx}


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    write = "--escribir" in sys.argv
    cat = json.loads(CATALOG.read_text())
    by_ref = {c["ref"]: c for f in cat["families"] for c in f["colors"]}
    done, unknown, errors = [], [], []
    for row in read_rows(sys.argv[1]):
        ref = row["ref"]
        if not ref:
            continue
        if ref not in by_ref:
            unknown.append(ref)
            continue
        try:
            Ts, Rs, Tv = num(row["Ts"]), num(row["Rs"]), num(row["Tv"])
        except ValueError:
            errors.append(f"{ref}: Ts/Rs/Tv no numéricos")
            continue
        if None in (Ts, Rs, Tv):
            continue                                  # fila sin ensayo todavía
        if not all(0 <= v <= 1 for v in (Ts, Rs, Tv)) or Ts + Rs > 1:
            errors.append(f"{ref}: valores fuera de rango (Ts {Ts}, Rs {Rs}, Tv {Tv})")
            continue
        lab, _, report = row.get("lab", "").partition("·")
        solar = {"Ts": Ts, "Rs": Rs, "Tv": Tv, "source": "ensayo",
                 "lab": lab.strip(), "report": report.strip(), "date": row.get("date", "")}
        for k in ("Rv", "emisFront", "emisBack", "openness"):
            if row.get(k):
                solar[k] = num(row[k])
        old = by_ref[ref]["solar"]
        done.append(f"{ref}: Ts {old['Ts']}→{Ts} · Rs {old['Rs']}→{Rs} · Tv {old['Tv']}→{Tv}")
        by_ref[ref]["solar"] = solar
    print(f"{len(done)} colores con ensayo:", *done, sep="\n  ")
    if unknown:
        print("No están en el catálogo (no se tocan):", ", ".join(unknown))
    if errors:
        print("Filas con error (no se tocan):", *errors, sep="\n  ")
    if write and done:
        CATALOG.write_text(json.dumps(cat, ensure_ascii=False, indent=1))
        print(f"Escrito {CATALOG}")
    elif done:
        print("Prueba sin escribir. Añade --escribir para guardar.")


if __name__ == "__main__":
    main()
