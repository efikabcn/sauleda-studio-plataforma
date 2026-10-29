"""Descarga años climáticos tipo (TMY) de PVGIS (JRC, Comisión Europea) y los deja
compactados en data/clima/<id>.json + data/clima/index.json.

Uso:  python3 tools/build_climate.py
Formato de salida (8760 horas, año no bisiesto, hora UTC):
  T   temperatura exterior en décimas de °C
  ghi irradiancia global horizontal W/m²
  dni irradiancia directa normal W/m²
  dhi irradiancia difusa horizontal W/m²
"""
import json, pathlib, subprocess, time

CITIES = [
    ("barcelona", "Barcelona", 41.39, 2.17), ("madrid", "Madrid", 40.42, -3.70),
    ("valencia", "Valencia", 39.47, -0.38), ("sevilla", "Sevilla", 37.39, -5.98),
    ("malaga", "Málaga", 36.72, -4.42), ("murcia", "Murcia", 37.98, -1.13),
    ("palma", "Palma", 39.57, 2.65), ("zaragoza", "Zaragoza", 41.65, -0.88),
    ("bilbao", "Bilbao", 43.26, -2.93), ("coruna", "A Coruña", 43.36, -8.41),
    ("valladolid", "Valladolid", 41.65, -4.72), ("laspalmas", "Las Palmas de G.C.", 28.12, -15.43),
    ("lisboa", "Lisboa", 38.72, -9.14), ("paris", "París", 48.86, 2.35),
    ("milan", "Milán", 45.46, 9.19), ("munich", "Múnich", 48.14, 11.58),
    ("atenas", "Atenas", 37.98, 23.73), ("miami", "Miami", 25.76, -80.19),
]
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "clima"
OUT.mkdir(parents=True, exist_ok=True)
index = []
for cid, name, lat, lon in CITIES:
    url = f"https://re.jrc.ec.europa.eu/api/v5_2/tmy?lat={lat}&lon={lon}&outputformat=json"
    # curl en vez de urllib: el Python de python.org en macOS no trae certificados raíz.
    d = json.loads(subprocess.run(["curl", "-sf", "-m", "120", url],
                                  check=True, capture_output=True).stdout)
    h = d["outputs"]["tmy_hourly"]
    assert len(h) == 8760, (cid, len(h))
    rec = {
        "id": cid, "name": name, "lat": lat, "lon": lon,
        "source": "PVGIS 5.2 TMY (JRC)",
        "T": [round(x["T2m"] * 10) for x in h],
        "ghi": [round(x["G(h)"]) for x in h],
        "dni": [round(x["Gb(n)"]) for x in h],
        "dhi": [round(x["Gd(h)"]) for x in h],
    }
    (OUT / f"{cid}.json").write_text(json.dumps(rec, separators=(",", ":")))
    index.append({"id": cid, "name": name, "lat": lat, "lon": lon})
    print("ok", cid)
    time.sleep(1)
(OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1))
