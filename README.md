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

Lo **común** a los tres módulos está en `js/core/`:
- `catalog.js` y `data/fabrics.json`: catálogo único de tejidos.
- `project.js`: proyecto compartido (nombre, cliente y ubicación); la ubicación fija el
  clima de Solar y la latitud y longitud de Velas.
- `i18n.js` y `strings.js`: textos en español e inglés.

## Catálogo único y datos de laboratorio

`data/fabrics.json` es la **fuente de verdad**. Cada color lleva `solar.source`:

- `"estimado"`: provisional. Hoy lo son **todos**: los Commercial se han estimado por la
  luminancia del color, y los acrílicos y screens son genéricos de mercado.
- `"ensayo"`: dato de laboratorio, con laboratorio, número de informe y fecha.

Mientras quede algún color estimado, la aplicación muestra un aviso arriba y marca esos
valores como «estimado».

Para cargar los ensayos, el laboratorio rellena la plantilla de la «Ficha de datos solares
por artículo», se exporta a CSV y:

```bash
python3 tools/import_lab.py ensayos.csv             # muestra los cambios, no escribe
python3 tools/import_lab.py ensayos.csv --escribir  # actualiza data/fabrics.json
```

Si se añaden artículos nuevos (por ejemplo los acrílicos reales de toldo), se dan de alta en
`data/fabrics.json` con la misma forma. Los genéricos (`"generic": true`) deben desaparecer
cuando haya artículos reales que los sustituyan. `tools/build_catalog.mjs` solo sirvió para
generar la primera versión a partir de Shade Studio.

## Enviar como un solo fichero

```bash
python3 tools/build_single.py   # → dist/Sauleda-Studio.html (~2 MB)
```

## Pendiente

- **Datos reales de laboratorio**. Hasta entonces no se publica ninguna cifra.
- **Unidades imperiales y dólares** para Sauleda USA. Hoy el inglés usa sistema métrico y €.
- **Velas en inglés**: el módulo sigue solo en español.
- **Clima de cualquier ubicación**: hoy solo hay 18 ciudades. Hace falta un pequeño
  servicio que consulte PVGIS/NSRDB.
- **Exportaciones para arquitectos**: memoria justificativa, formato CTE (g_gl;sh;wi),
  propiedades BIM y textos de pliego.
- **Publicación** en un subdominio (por ejemplo studio.sauleda.com) e integración en las webs.
