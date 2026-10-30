"""Descarga años climáticos tipo (TMY) de PVGIS (JRC, Comisión Europea) y los deja
compactados en data/clima/<id>.json + data/clima/index.json.

Uso:  python3 tools/build_climate.py            # descarga solo las ciudades que falten
      python3 tools/build_climate.py --todas    # vuelve a descargarlas todas
Formato de salida (8760 horas, año no bisiesto, hora UTC):
  T   temperatura exterior en décimas de °C
  ghi irradiancia global horizontal W/m²
  dni irradiancia directa normal W/m²
  dhi irradiancia difusa horizontal W/m²
"""
import json, pathlib, subprocess, sys, time

CITIES = [
    # id, nombre, lat, lon, país (ISO 3166)
    ("barcelona", "Barcelona", 41.39, 2.17, "ES"), ("madrid", "Madrid", 40.42, -3.70, "ES"),
    ("valencia", "Valencia", 39.47, -0.38, "ES"), ("sevilla", "Sevilla", 37.39, -5.98, "ES"),
    ("malaga", "Málaga", 36.72, -4.42, "ES"), ("murcia", "Murcia", 37.98, -1.13, "ES"),
    ("palma", "Palma", 39.57, 2.65, "ES"), ("zaragoza", "Zaragoza", 41.65, -0.88, "ES"),
    ("bilbao", "Bilbao", 43.26, -2.93, "ES"), ("coruna", "A Coruña", 43.36, -8.41, "ES"),
    ("valladolid", "Valladolid", 41.65, -4.72, "ES"), ("laspalmas", "Las Palmas de G.C.", 28.12, -15.43, "ES"),
    ("lisboa", "Lisboa", 38.72, -9.14, "PT"), ("paris", "París", 48.86, 2.35, "FR"),
    ("milan", "Milán", 45.46, 9.19, "IT"), ("munich", "Múnich", 48.14, 11.58, "DE"),
    ("atenas", "Atenas", 37.98, 23.73, "GR"),
    ("miami", "Miami, FL", 25.76, -80.19, "US"), ("orlando", "Orlando, FL", 28.54, -81.38, "US"),
    ("tampa", "Tampa, FL", 27.95, -82.46, "US"), ("atlanta", "Atlanta, GA", 33.75, -84.39, "US"),
    ("newyork", "New York, NY", 40.71, -74.01, "US"), ("washington", "Washington, DC", 38.91, -77.04, "US"),
    ("chicago", "Chicago, IL", 41.88, -87.63, "US"), ("houston", "Houston, TX", 29.76, -95.37, "US"),
    ("dallas", "Dallas, TX", 32.78, -96.80, "US"), ("phoenix", "Phoenix, AZ", 33.45, -112.07, "US"),
    ("lasvegas", "Las Vegas, NV", 36.17, -115.14, "US"), ("losangeles", "Los Angeles, CA", 34.05, -118.24, "US"),
    ("sandiego", "San Diego, CA", 32.72, -117.16, "US"),
]
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "clima"
OUT.mkdir(parents=True, exist_ok=True)
index = []
for cid, name, lat, lon, country in CITIES:
    index.append({"id": cid, "name": name, "lat": lat, "lon": lon, "country": country})
    if (OUT / f"{cid}.json").exists() and "--todas" not in sys.argv:
        continue
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
    print("ok", cid)
    time.sleep(1)
(OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1))
