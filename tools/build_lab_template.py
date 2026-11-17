"""Genera el Excel que rellena el laboratorio con los datos solares de cada artículo.

Uso:
  python3 tools/build_lab_template.py   # → plantillas/Sauleda-Datos-Laboratorio.xlsx

Lleva ya puestas las familias y referencias de color del catálogo (data/fabrics.json),
así que hay que regenerarlo si se añaden artículos. El laboratorio lo devuelve relleno y
se carga con:  python3 tools/import_lab.py Sauleda-Datos-Laboratorio.xlsx [--escribir]

Las cabeceras de la hoja «Colores» y «Familias» son las que lee import_lab.py: si se
cambian aquí, hay que cambiarlas también allí (COLS_XLSX / FAM_XLSX).
"""
import datetime, json, pathlib

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = pathlib.Path(__file__).resolve().parent.parent
CAT = json.loads((ROOT / "data" / "fabrics.json").read_text())
OUT = ROOT / "plantillas" / "Sauleda-Datos-Laboratorio.xlsx"

F = "Arial"
RED = "E11F1C"
FILL_IN = PatternFill("solid", fgColor="FFF2CC")      # amarillo: lo rellena el laboratorio
FILL_GIVEN = PatternFill("solid", fgColor="EDEDED")   # gris: ya lo ponemos nosotros
FILL_CALC = PatternFill("solid", fgColor="E2EFDA")    # verde: cálculo automático
FILL_HEAD = PatternFill("solid", fgColor="2C2C2C")
FILL_EX = PatternFill("solid", fgColor="DDEBF7")      # azul claro: fila de ejemplo
thin = Side(style="thin", color="BFBFBF")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
WRAP = Alignment(wrap_text=True, vertical="top")
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)

FAMILIES = [f for f in CAT["families"] if not f.get("generic")]
EXTRA_COLOR_ROWS = 60      # filas vacías para artículos nuevos (acrílicos de toldo, etc.)
EXTRA_FAMILY_ROWS = 15


def font(**kw):
    return Font(name=F, size=kw.pop("size", 10), **kw)


def title(ws, text, sub):
    ws["A1"] = text
    ws["A1"].font = font(size=15, bold=True, color=RED)
    ws["A2"] = sub
    ws["A2"].font = font(size=10, italic=True, color="595959")


def header(ws, row, cols):
    for i, (name, width, note) in enumerate(cols, 1):
        c = ws.cell(row, i, name)
        c.font = font(bold=True, color="FFFFFF")
        c.fill = FILL_HEAD
        c.alignment = CENTER
        c.border = BOX
        if note:
            c.comment = Comment(note, "Sauleda Studio", width=320, height=140)
        ws.column_dimensions[get_column_letter(i)].width = width
    ws.row_dimensions[row].height = 48


# --------------------------------------------------------------------------- libro
wb = Workbook()

# ============================== Instrucciones ==============================
ws = wb.active
ws.title = "Instrucciones"
ws.sheet_view.showGridLines = False
ws.column_dimensions["A"].width = 26
ws.column_dimensions["B"].width = 16
ws.column_dimensions["C"].width = 30
ws.column_dimensions["D"].width = 14
ws.column_dimensions["E"].width = 60
title(ws, "Sauleda · Datos de laboratorio para protección solar",
      f"Plantilla generada el {datetime.date.today():%d/%m/%Y} desde el catálogo de Sauleda Studio")

r = 4
def para(text, bold=False, size=10, color="2C2C2C", h=None):
    global r
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=5)
    c = ws.cell(r, 1, text)
    c.font = font(bold=bold, size=size, color=color)
    c.alignment = WRAP
    if h:
        ws.row_dimensions[r].height = h
    r += 1

para("Para qué sirven estos datos", bold=True, size=12, color=RED)
para("Con ellos calculamos, para cada tejido y color, el factor solar total gtot (vidrio + tejido) "
     "según EN ISO 52022-1, la clase de confort EN 14501 y el ahorro de climatización que muestran "
     "las fichas técnicas y la herramienta Sauleda Studio para arquitectos. Hoy esos valores son "
     "estimados; con este Excel pasan a ser datos de ensayo.", h=58)
r += 1
para("Cómo está ordenado", bold=True, size=12, color=RED)
para("• Hoja «Colores»: UNA FILA POR REFERENCIA DE COLOR. Los valores ópticos (Ts, Rs, Tv…) cambian "
     "con el color, así que se miden y se anotan color a color. Es la hoja importante.", h=32)
para("• Hoja «Familias»: UNA FILA POR ARTÍCULO/FAMILIA (Commercial 95, Heavy 430…). Datos que no "
     "cambian con el color: composición, gramaje, espesor, fuego, garantía. Ya hemos puesto lo que "
     "tenemos; solo hay que confirmarlo o corregirlo.", h=45)
para("• Artículos que falten (sobre todo los ACRÍLICOS DE TOLDO, que hoy no están en la herramienta): "
     "añadirlos en las filas vacías del final de cada hoja, con el mismo ID de familia en las dos hojas.", h=32)
para("• Hoja «Listas»: valores auxiliares. No hace falta tocarla.")
r += 1
para("Leyenda de colores de las celdas", bold=True, size=12, color=RED)
for fill, txt in [(FILL_IN, "Amarillo: lo rellena el laboratorio."),
                  (FILL_GIVEN, "Gris: ya lo hemos puesto nosotros. No modificar (salvo para corregir un error)."),
                  (FILL_CALC, "Verde: se calcula solo. Sirve para comprobar que los valores tienen sentido."),
                  (FILL_EX, "Azul: fila de EJEMPLO con valores inventados. Se puede dejar; no se importa.")]:
    ws.cell(r, 1).fill = fill
    ws.cell(r, 1).border = BOX
    ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=5)
    ws.cell(r, 2, txt).font = font()
    r += 1
r += 1
para("Qué hay que medir (hoja «Colores»)", bold=True, size=12, color=RED)
meas_head = r
for i, h in enumerate(["Magnitud", "Símbolo", "Norma / método", "¿Obligatorio?", "Notas"], 1):
    c = ws.cell(r, i, h)
    c.font = font(bold=True, color="FFFFFF"); c.fill = FILL_HEAD; c.border = BOX; c.alignment = CENTER
r += 1
MEAS = [
    ("Transmitancia solar", "Ts", "EN 14500 / EN 410 (300–2500 nm)", "Sí",
     "Normal-hemisférica. Espectrofotómetro con esfera integradora."),
    ("Reflectancia solar, cara exterior", "Rs", "EN 14500 / EN 410", "Sí",
     "Cara que da al sol (la cara vista desde la calle)."),
    ("Transmitancia luminosa", "Tv", "EN 410 (380–780 nm, D65)", "Sí",
     "Luz natural que pasa; da la clase visual y el riesgo de deslumbramiento."),
    ("Reflectancia luminosa, cara exterior", "Rv", "EN 410", "Recomendado", ""),
    ("Reflectancia solar, cara interior", "Rs int.", "EN 14500 / EN 410", "Si es bicolor o va por dentro",
     "Necesaria para estores/cortinas interiores y para tejidos con caras distintas."),
    ("Transmitancia UV", "Tuv", "EN 410 (280–380 nm)", "Opcional", "Protección UV de personas y mobiliario."),
    ("Factor de apertura", "Cf", "EN 14500 (τv,n-n)", "Sí (screens y microperforados)",
     "Porcentaje de huecos. En tejidos cerrados (acrílico) poner 0."),
    ("Emisividad cara exterior / interior", "ε", "EN 12898", "Opcional",
     "Solo para el cálculo detallado EN ISO 52022-3 (lo que usa ESBO)."),
]
for row in MEAS:
    for i, v in enumerate(row, 1):
        c = ws.cell(r, i, v); c.font = font(); c.alignment = WRAP; c.border = BOX
    ws.row_dimensions[r].height = 30
    r += 1
r += 1
para("Cómo anotarlo", bold=True, size=12, color=RED)
for t in [
    "• Ts, Rs, Tv, Rv, Tuv y apertura en PORCENTAJE (0–100), con un decimal. Sin escribir el signo %. "
    "Ejemplo: 7,5 (no 0,075). La emisividad, en tanto por uno (0–1).",
    "• Muestra nueva, sin envejecer. Recomendado: valor medio de al menos 3 probetas por color.",
    "• Cada fila debe llevar laboratorio, nº de informe y fecha. Si el ensayo es interno (no acreditado), "
    "indicarlo en «Observaciones»: lo usaremos como provisional.",
    "• Para poder decir «ensayado» ante arquitectos y en ES-SDA (base de datos europea de ES-SO), el "
    "laboratorio debe estar acreditado ENAC (ISO 17025) para EN 14500 / EN 410.",
    "• La columna «Comprobación» avisa si falta algo o si Ts + Rs supera 100. Debe quedar en «OK».",
    "• No cambiar el nombre de las hojas ni de las columnas: el fichero se importa automáticamente.",
]:
    para(t, h=32)
r += 1
para("Al terminar", bold=True, size=12, color=RED)
para("Guardar como Excel (.xlsx) y devolverlo tal cual. Se puede enviar por partes (por ejemplo, una "
     "familia cada vez): solo se cargan las filas que tienen Ts, Rs y Tv.", h=32)

# ================================ Listas ==================================
wl = wb.create_sheet("Listas")
title(wl, "Valores auxiliares", "No hace falta tocar esta hoja.")
wl.column_dimensions["A"].width = 44
wl.column_dimensions["B"].width = 12
wl.column_dimensions["D"].width = 18
wl.column_dimensions["E"].width = 34
wl["A4"] = "Vidrio de referencia C (EN 14501) para la comprobación de gtot"
wl["A4"].font = font(bold=True)
rows = [("Factor solar del vidrio g", 0.59), ("U del vidrio (W/m²K)", 1.2),
        ("G1 exterior (W/m²K)", 5), ("G2 exterior (W/m²K)", 10)]
for i, (k, v) in enumerate(rows, 5):
    wl.cell(i, 1, k).font = font()
    c = wl.cell(i, 2, v); c.font = font(color="0000FF"); c.border = BOX
wl.cell(9, 1, "G = 1 / (1/G1 + 1/G2 + 1/U)").font = font()
c = wl.cell(9, 2, "=1/(1/B7+1/B8+1/B6)"); c.font = font(); c.number_format = "0.000"; c.border = BOX
wl.cell(10, 1, "Fuente: EN 14501 (vidrio C: doble bajo emisivo con argón) y EN ISO 52022-1, "
               "método simplificado para protección exterior.").font = font(italic=True, size=9, color="595959")
wl["D4"] = "ID familia"; wl["E4"] = "Nombre"
for c in (wl["D4"], wl["E4"]):
    c.font = font(bold=True)
for i, f in enumerate(FAMILIES, 5):
    wl.cell(i, 4, f.get("labId", f["id"])).font = font()
    wl.cell(i, 5, f["name"]).font = font()
FAM_LIST = f"=Listas!$D$5:$D${4 + len(FAMILIES) + EXTRA_FAMILY_ROWS}"
# Las familias nuevas que se añadan en «Familias» se reflejan aquí para el desplegable.
for k in range(EXTRA_FAMILY_ROWS):
    rr = 5 + len(FAMILIES) + k
    src = 5 + len(FAMILIES) + k          # misma fila de datos en «Familias»
    wl.cell(rr, 4, f'=IF(Familias!A{src}="","",Familias!A{src})').font = font()
    wl.cell(rr, 5, f'=IF(Familias!B{src}="","",Familias!B{src})').font = font()

# =============================== Familias =================================
wf = wb.create_sheet("Familias", 1)
title(wf, "Familias / artículos — una fila por artículo",
      "Datos que no dependen del color. Gris = lo que ya tenemos: confirmar o corregir. Amarillo = rellenar.")
FCOLS = [
    ("ID familia", 16, "Código interno corto. Para artículos nuevos, inventar uno sin espacios (p. ej. acril-orchestra) "
                       "y usar el mismo en la hoja Colores."),
    ("Nombre comercial", 26, None),
    ("Uso principal", 18, "Toldo, vela, screen, estor interior, náutica…"),
    ("Composición", 28, "Fibra y tratamiento (p. ej. 100 % acrílico tintado en masa, teflonado)."),
    ("Construcción", 20, "Tejido de calada, punto, recubierto…"),
    ("Gramaje (g/m²)", 11, None),
    ("Espesor (mm)", 10, None),
    ("Ancho de rollo (cm)", 11, None),
    ("Reacción al fuego (norma y clase)", 26, "p. ej. EN 13501-1 B-s1,d0 / NFPA 701 / M1."),
    ("Solidez a la luz (escala azul)", 12, "ISO 105-B02, 1–8."),
    ("Garantía (años)", 10, None),
    ("Certificados", 26, "Oeko-Tex, Greenguard, EPD… separados por comas."),
    ("Laboratorio / nº informe", 24, "De donde salen gramaje, espesor y fuego."),
    ("Confirmado (Sí/No)", 11, "Poner «Sí» cuando el laboratorio haya revisado toda la fila."),
    ("Observaciones", 34, None),
]
HF = 4
header(wf, HF, FCOLS)
GIVEN_F = {1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12}
for i, f in enumerate(FAMILIES):
    rr = HF + 1 + i
    vals = [f.get("labId", f["id"]), f["name"], ", ".join(f.get("uses", [])), f.get("material"), f.get("construction"),
            f.get("gsm"), f.get("thickness_mm"), (f.get("roll_mm") or 0) / 10 or None, f.get("fire"),
            None, f.get("warranty_y"), ", ".join(f.get("certs", [])), None, None, None]
    for j, v in enumerate(vals, 1):
        c = wf.cell(rr, j, v)
        c.font = font(); c.border = BOX; c.alignment = WRAP
        c.fill = FILL_GIVEN if (j in GIVEN_F and v not in (None, "")) else FILL_IN
for k in range(EXTRA_FAMILY_ROWS):
    rr = HF + 1 + len(FAMILIES) + k
    for j in range(1, len(FCOLS) + 1):
        c = wf.cell(rr, j); c.fill = FILL_IN; c.border = BOX; c.font = font()
dv = DataValidation(type="list", formula1='"Sí,No"', allow_blank=True)
wf.add_data_validation(dv)
dv.add(f"N{HF + 1}:N{HF + len(FAMILIES) + EXTRA_FAMILY_ROWS}")
wf.freeze_panes = wf.cell(HF + 1, 3)

# ================================ Colores =================================
wc = wb.create_sheet("Colores", 1)
title(wc, "Colores — una fila por referencia de color",
      "Valores en %, con un decimal (7,5 = 7,5 %). Pasar el ratón por la cabecera para ver la norma de cada columna.")
CCOLS = [
    ("ID familia", 15, "Igual que en la hoja Familias. Desplegable."),
    ("Artículo", 22, None),
    ("Referencia", 11, "Código de color tal cual aparece en el muestrario/catálogo."),
    ("Nombre color", 18, None),
    ("Ts (%)", 8, "Transmitancia solar normal-hemisférica. EN 14500 / EN 410, 300–2500 nm."),
    ("Rs cara ext. (%)", 9, "Reflectancia solar de la cara exterior (la que da al sol). EN 14500 / EN 410."),
    ("Tv (%)", 8, "Transmitancia luminosa. EN 410, 380–780 nm, iluminante D65."),
    ("Rv cara ext. (%)", 9, "Reflectancia luminosa de la cara exterior. EN 410. Recomendado."),
    ("Rs cara int. (%)", 9, "Reflectancia solar de la cara interior. Obligatoria si el tejido es bicolor o se usa por dentro."),
    ("Tuv (%)", 8, "Transmitancia UV, 280–380 nm. Opcional."),
    ("Apertura Cf (%)", 9, "Factor de apertura (EN 14500). 0 en tejidos cerrados."),
    ("ε cara ext. (0-1)", 9, "Emisividad. EN 12898. Opcional."),
    ("ε cara int. (0-1)", 9, "Emisividad. EN 12898. Opcional."),
    ("Laboratorio", 20, "Nombre del laboratorio y si está acreditado ENAC."),
    ("Nº informe", 14, None),
    ("Fecha ensayo", 12, "dd/mm/aaaa"),
    ("Observaciones", 28, None),
    ("As (%) calc.", 9, "Absortancia solar = 100 − Ts − Rs. Se calcula sola."),
    ("gtot vidrio C (calc.)", 10, "Factor solar total con protección exterior y vidrio de referencia C "
                                  "(EN ISO 52022-1 simplificado). Solo orientativo para comprobar."),
    ("Clase EN 14501 (calc.)", 10, "Confort térmico: 0 efecto muy pequeño … 4 muy bueno."),
    ("Comprobación", 26, "Debe quedar en «OK»."),
]
HC = 4
header(wc, HC, CCOLS)
L = "Listas!$B$5"; G = "Listas!$B$9"; G1 = "Listas!$B$7"; G2 = "Listas!$B$8"


def color_row(rr, vals, fill_given, example=False):
    for j in range(1, len(CCOLS) + 1):
        c = wc.cell(rr, j)
        c.font = font(italic=example, color="1F4E79" if example else "000000")
        c.border = BOX
    for j, v in enumerate(vals, 1):
        if v is not None:
            wc.cell(rr, j, v)
    for j in range(1, 5):
        wc.cell(rr, j).fill = FILL_EX if example else (FILL_GIVEN if fill_given else FILL_IN)
    for j in range(5, 18):
        wc.cell(rr, j).fill = FILL_EX if example else FILL_IN
    for j in range(5, 12):
        wc.cell(rr, j).number_format = "0.0"
    for j in (12, 13):
        wc.cell(rr, j).number_format = "0.00"
    wc.cell(rr, 16).number_format = "dd/mm/yyyy"
    # Cálculos de comprobación (verde)
    E, Fc, Gc, N, O = (f"{x}{rr}" for x in "EFGNO")
    wc.cell(rr, 18, f'=IF(OR({E}="",{Fc}=""),"",100-{E}-{Fc})').number_format = "0.0"
    wc.cell(rr, 19, f'=IF(R{rr}="","",{E}/100*{L}+R{rr}/100*{G}/{G2}+{E}/100*(1-{L})*{G}/{G1})').number_format = "0.00"
    wc.cell(rr, 20, f'=IF(S{rr}="","",IF(S{rr}>=0.5,0,IF(S{rr}>=0.35,1,IF(S{rr}>=0.15,2,IF(S{rr}>=0.1,3,4)))))')
    wc.cell(rr, 21, (
        f'=IF(COUNT({E}:{Gc})=0,IF(C{rr}="","","Pendiente"),'
        f'IF(COUNT({E}:{Gc})<3,"Faltan Ts, Rs o Tv",'
        f'IF(OR({E}<0,{Fc}<0,{Gc}<0,{E}>100,{Fc}>100,{Gc}>100),"Valor fuera de 0-100",'
        f'IF({E}+{Fc}>100,"Revisar: Ts + Rs > 100",'
        f'IF(AND({E}<=1,{Fc}<=1,{Gc}<=1),"¿En tanto por uno? Usar %",'
        f'IF(OR(C{rr}="",A{rr}=""),"Falta familia o referencia",'
        f'IF(OR({N}="",O{rr}=""),"Falta laboratorio o nº informe","OK")))))))'))
    for j in (18, 19, 20, 21):
        c = wc.cell(rr, j)
        c.fill = FILL_CALC
        c.alignment = Alignment(horizontal="center")


rr = HC + 1
color_row(rr, ["comercial95", "Commercial 95", "EJEMPLO", "Charcoal (ejemplo)", 7.5, 6.0, 5.5, 4.8, 6.0,
               4.0, 5.0, 0.86, 0.86, "Lab. ejemplo (ENAC nº 000/LE000)", "INF-2026-0001",
               datetime.date(2026, 11, 20), "Fila de ejemplo con valores inventados: no se importa"],
          True, example=True)
first_data = rr + 1
for f in FAMILIES:
    for col in f["colors"]:
        rr += 1
        color_row(rr, [f.get("labId", f["id"]), f["name"], col["ref"], col["name"]], True)
for k in range(EXTRA_COLOR_ROWS):
    rr += 1
    color_row(rr, [None, f'=IFERROR(INDEX(Listas!$E:$E,MATCH(A{rr},Listas!$D:$D,0)),"")'], False)
last = rr
wc.freeze_panes = wc.cell(HC + 1, 5)
wc.auto_filter.ref = f"A{HC}:U{last}"

dvf = DataValidation(type="list", formula1=FAM_LIST, allow_blank=True,
                     error="Usar un ID de la hoja Familias (o añadirlo allí primero).", showErrorMessage=True)
dvp = DataValidation(type="decimal", operator="between", formula1="0", formula2="100", allow_blank=True,
                     error="Valor en %, entre 0 y 100 (p. ej. 7,5).", showErrorMessage=True)
dve = DataValidation(type="decimal", operator="between", formula1="0", formula2="1", allow_blank=True,
                     error="Emisividad entre 0 y 1.", showErrorMessage=True)
dvd = DataValidation(type="date", operator="greaterThan", formula1="36526", allow_blank=True,
                     error="Fecha dd/mm/aaaa.", showErrorMessage=True)
for d in (dvf, dvp, dve, dvd):
    wc.add_data_validation(d)
dvf.add(f"A{first_data + sum(len(f['colors']) for f in FAMILIES)}:A{last}")
dvp.add(f"E{HC + 1}:K{last}")
dve.add(f"L{HC + 1}:M{last}")
dvd.add(f"P{HC + 1}:P{last}")

ok_fill = PatternFill("solid", fgColor="C6EFCE")
warn_fill = PatternFill("solid", fgColor="FCE4D6")
rng = f"U{HC + 1}:U{last}"
wc.conditional_formatting.add(rng, FormulaRule(formula=[f'U{HC + 1}="OK"'], fill=ok_fill,
                                               font=Font(name=F, color="006100", bold=True)))
wc.conditional_formatting.add(rng, FormulaRule(
    formula=[f'AND(U{HC + 1}<>"OK",U{HC + 1}<>"Pendiente",U{HC + 1}<>"")'],
    fill=warn_fill, font=Font(name=F, color="9C3900", bold=True)))

wb.move_sheet("Listas", offset=10)
for s in wb.worksheets:
    s.sheet_properties.tabColor = {"Instrucciones": RED, "Colores": "FFC000",
                                   "Familias": "FFC000", "Listas": "A6A6A6"}[s.title]
wb.calculation.fullCalcOnLoad = True   # Excel calcula las fórmulas al abrir
OUT.parent.mkdir(exist_ok=True)
wb.save(OUT)
n = sum(len(f["colors"]) for f in FAMILIES)
print(f"Escrito {OUT} — {len(FAMILIES)} familias, {n} colores, "
      f"{EXTRA_COLOR_ROWS} filas libres para artículos nuevos")
