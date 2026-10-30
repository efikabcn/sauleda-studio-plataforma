# Integrar Sauleda Studio en las webs · Embedding Sauleda Studio in the websites

> **ES — Importante:** no poner Studio en páginas públicas mientras aparezca el aviso
> «Datos solares estimados». Ese aviso desaparece solo cuando todos los tejidos tienen
> ensayo de laboratorio cargado (`tools/import_lab.py`). Hasta entonces, usarlo solo en
> páginas de prueba o internas.
>
> **EN — Important:** do not place Studio on public pages while the "Estimated solar data"
> banner is shown. It disappears only when every fabric has laboratory test data loaded.
> Until then, use it only on test or internal pages.

The examples use the current test host. When Studio moves to its final address (for
example `https://studio.sauleda.com`), only the host part changes.

```
HOST = https://efikabcn.github.io/sauleda-studio-plataforma
```

## 1. Market settings in the URL

| Parameter | Effect |
| --- | --- |
| `?market=us` | English, imperial units (ft, °F, Btu), US dollars, US cities first, Miami by default |
| `?market=es` | Spanish, metric, euros, Barcelona by default |
| `?lang=en` / `?lang=es` | Language only |
| `?units=imperial` / `?units=metric` | Units only |

Visitors can still change language and units from the Studio header.

## 2. Full tool on a page (iframe)

Paste this into an HTML block, for example a "Custom HTML" block in WordPress:

```html
<iframe src="HOST/?market=us#/tejidos"
        title="Sauleda Studio"
        style="width:100%;height:860px;border:0;border-radius:10px"
        loading="lazy" allow="fullscreen"></iframe>
```

Start on another module by changing the part after `#`:

| Start on | Address |
| --- | --- |
| Fabric catalog and data sheets | `HOST/?market=us#/tejidos` |
| Solar and energy calculator | `HOST/?market=us#/solar` |
| Shade sail designer | `HOST/?market=us#/velas` |

## 3. "Calculate with this fabric" button on product pages

Each Sauleda color reference opens directly:

```html
<a href="HOST/?market=us#/solar?tejido=7915" target="_blank" rel="noopener">Calculate with this fabric</a>
<a href="HOST/?market=us#/tejidos?ref=7915" target="_blank" rel="noopener">Solar data sheet</a>
<a href="HOST/?market=us#/velas?tejido=7915" target="_blank" rel="noopener">Design a shade sail</a>
```

Replace `7915` with the color reference shown on the product page.

## 4. Test page

`embed-demo.html` simulates a Sauleda USA page with Studio embedded:
`HOST/embed-demo.html`.

## Notes for the web team

- Studio is static files only (HTML, CSS, JS, JSON). It can be hosted on any web server or
  CDN. It needs no database and no server-side code.
- The **Shade sails** module loads three.js from `cdn.jsdelivr.net`. The **Fabrics** and
  **Solar** modules work without third-party requests.
- Studio stores the visitor's last inputs in the browser (`localStorage`) and sends nothing
  to any server. Contact or lead forms, when they are added, will need consent text.
