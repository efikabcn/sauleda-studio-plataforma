# Sauleda Studio (prototipo)

Plataforma web de proyecto para arquitectos, confeccionadores y clientes. Une en una sola
aplicación las dos herramientas anteriores:

- **Solar Studio**: `/Users/uge/sauleda-solar`, publicado en efikabcn.github.io/sauleda-solar-studio.
- **Shade Studio**: `/Users/uge/velacad`.

Las dos se dejan intactas. La propuesta completa (arquitectura, fases y certificaciones) está
en el documento «Sauleda Studio — plataforma de proyecto para arquitectos y clientes».

## Arrancar

```bash
python3 -m http.server 5182 --directory /Users/uge/sauleda-studio
```
Abrir <http://localhost:5182>. Sin build ni dependencias. El módulo Velas descarga three.js
de un CDN; Tejidos y Solar funcionan sin conexión.

## Módulos y enlaces directos

| Ruta | Qué hace |
| --- | --- |
| `#/tejidos?ref=7168` | Catálogo, ficha técnica de cada color (Ts, Rs, Tv, gtot y clase EN 14501 con los vidrios de referencia) y comparador de hasta 4 colores |
| `#/solar?tejido=7168&b=7911` | Ventana + tejido: gtot (EN ISO 52022-1), simulación horaria anual, ahorro, confort e informe PDF |
| `#/velas?tejido=7915` | Diseño, fotomontaje, patronaje y DXF de velas; ahora muestra también la radiación bloqueada según el catálogo |

Estos enlaces son los que pondrán las fichas de producto de sauleda.com y de Sauleda USA
(botón «Calcular con este tejido»).

## App de velas independiente (Shade Studio)

La app de velas que se regala a los confeccionadores sale del mismo código, sin los
módulos Tejidos y Solar:

- **Enlace:** `…/velas/` (por ejemplo `…/velas/?market=us` o `…/velas/#/velas?tejido=7915`),
  equivalente a `?app=velas`.
- **Fichero único para enviar:** `python3 tools/build_single.py --velas` →
  `dist/Sauleda-Shade-Studio.html` (~0,3 MB). Necesita internet para el visor 3D (three.js).

Cualquier mejora en el módulo Velas de Studio llega también a la app independiente. La versión
antigua de `/Users/uge/velacad` queda solo como histórico.

## Mercados, idiomas y unidades

Todo está en español e inglés. El **mercado** se elige en la URL, para que cada web
incruste su versión:

- `?market=us`: inglés, unidades imperiales (ft, °F, Btu, SEER2/HSPF2, oz/yd², lbf), dólares,
  ciudades de EE. UU. primero y Miami por defecto.
- `?market=es`: español, métrico, euros y Barcelona.

El visitante puede cambiar idioma y unidades en la cabecera. Internamente todo se calcula
en SI (`js/core/units.js` convierte solo lo que se muestra). Hay **30 ciudades** con clima
horario PVGIS: 17 europeas y 13 de EE. UU.

Para incrustarlo en las webs están `INTEGRACION-WEB.md` (iframe, botones por referencia,
instrucciones para el equipo web) y `embed-demo.html` (página de prueba).
Mientras quede algún dato estimado, **no se pone en páginas públicas**.

Lo **común** a los tres módulos está en `js/core/`:
- `catalog.js` y `data/fabrics.json`: catálogo único de tejidos.
- `project.js`: proyecto compartido (nombre, cliente y ubicación); la ubicación fija el
  clima de Solar y la latitud y longitud de Velas.
- `i18n.js` y `strings.js`: textos en español e inglés.

## Catálogo único y datos de laboratorio

`data/fabrics.json` es la **fuente de verdad**. Cada color lleva `solar.source`:

- `"estimado"`: provisional. Los Commercial (velas) se estimaron por la luminancia del color y
  el acrílico de toldo es genérico de mercado. Si llega un valor suelto medido (p. ej. la Rs
  ASTM C1549 de los Commercial 95), se guarda y se anota en `measured`, pero sigue estimado.
- `"ficha"`: valores de la ficha técnica de Sauleda, sin informe de laboratorio. Si la ficha no
  trae Tv, se estima como Ts × 0,8 y se anota en `est: ["Tv"]`.
- `"ensayo"`: dato de laboratorio, con laboratorio, número de informe y fecha.

Primera entrega del laboratorio (17-nov-2026): 9 familias de screen (73 colores, más 15
referencias repetidas guardadas como `alt`) con datos de ficha, y la Rs de 16 colores de
Commercial 95. Siguen pendientes Ts/Tv de todas las velas (Commercial 95, FR, Heavy 430,
DualShade 350 y G325) y los acrílicos de toldo. Las familias nuevas guardan en `labId` el ID
que usa el laboratorio en el Excel.

Mientras quede algún color estimado, la aplicación muestra un aviso arriba y marca esos
valores como «estimado».

El laboratorio rellena el Excel `plantillas/Sauleda-Datos-Laboratorio.xlsx`: una fila por
referencia de color en «Colores» y una por artículo en «Familias». Lleva instrucciones, normas,
comprobaciones automáticas y las referencias del catálogo ya puestas. Si se añaden artículos,
se regenera con `python3 tools/build_lab_template.py`. El Excel devuelto se carga tal cual
(también acepta el CSV antiguo):

```bash
python3 tools/import_lab.py Sauleda-Datos-Laboratorio.xlsx             # muestra los cambios, no escribe
python3 tools/import_lab.py Sauleda-Datos-Laboratorio.xlsx --escribir  # actualiza data/fabrics.json
```

Si se añaden artículos nuevos (por ejemplo los acrílicos reales de toldo), se dan de alta en
`data/fabrics.json` con la misma forma. Los genéricos (`"generic": true`) deben desaparecer
cuando haya artículos reales que los sustituyan. `tools/build_catalog.mjs` solo sirvió para
generar la primera versión a partir de Shade Studio.

## Enviar como un solo fichero

```bash
python3 tools/build_single.py   # → dist/Sauleda-Studio.html (~3,5 MB)
```

## Velas: criterios de taller (revisión de experta, nov-2026)

- **Medidas comprobadas**: además de los lados y las diagonales desde A, se piden las diagonales
  desde B. Si no cuadran (tolerancia 25 mm o 0,5 %), no se calcula; si faltan, se ve la vela pero
  el plano de corte sale marcado «no válido» y no se exportan DXF de corte ni CSV. Cada cambio de
  medida recalcula solo. En cuadriláteros el aviso es simétrico: «si AC es correcta, BD debería medir X;
  si BD es correcta, AC debería medir Y».
  Botón «Hoja de medidas para el instalador» con el esquema A, B, C…
- **Compensación** por defecto urdimbre 4 % / trama 2 % (referencia del sector); **pretensado al
  marcar**: sin pretensar o pretensado (clavado), que dibuja la urdimbre a ~3 % (como Sombrasail). La
  trama no se descuenta. Ante la duda, mejor quedarse corto (revisión de Gemma, 18-nov-2026).
- **Curvatura de borde** automática según la longitud del lado (3–5 % hasta 5 m, 8 % a 10–12 m).
- **Paños** según el ancho del rollo solamente (el punto de HDPE absorbe la doble curvatura).
- **Costuras: estrategia única**, no la elige el taller: centradas y perpendiculares al lado más largo;
  en hypar (desnivel ≥ 10 % del lado más largo), siguiendo la torsión. «Mínimo consumo» se quitó
  porque deja costuras en diagonal que estiran.
- Sin cálculo de viento; postes verticales o con la cabeza 10° hacia fuera.
- Resultados y ficha de color: **AS 4174:2018** de las fichas de GALE Pacific (factor de sombra,
  bloqueo UVR, cobertura, UVE), cargados con `python3 tools/import_as4174.py --escribir`. Ts/Rs/Tv
  (EN 410/14500) no se aplican a velas, así que las velas ya no aparecen en Solar. Hay datos de
  Commercial 95 y 95 FR; faltan Heavy 430, DualShade 350, Royal Purple y Cayenne. «Green» = Brunswick
  Green y «Metal» = Gun Metal están supuestos por el nombre.
- **Antes de comercializarlo** hay que validar los patrones con un patronista o un despacho de
  arquitectura textil, contra velas reales.

## Pendiente

- **Datos reales de laboratorio**. Hasta entonces no se publica ninguna cifra.
- **Velas en unidades imperiales completas**: la entrada de medidas ya va en pulgadas y el
  viento en mph, pero el informe, las tablas y el CSV/DXF siguen en milímetros.
- **Clima de cualquier ubicación**: hoy hay 30 ciudades. Hace falta un pequeño servicio
  que consulte PVGIS/NSRDB.
- **Exportaciones para arquitectos**: memoria justificativa, formato CTE (g_gl;sh;wi),
  propiedades BIM y textos de pliego.
- **Publicación** en un subdominio (por ejemplo studio.sauleda.com) e integración en las webs.
