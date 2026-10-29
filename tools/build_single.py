"""Genera dist/Sauleda-Studio.html: la aplicación entera en un único fichero (CSS,
imágenes, módulos JS, catálogo y climas embebidos) para enviarla y abrirla con doble clic.

Uso:  python3 tools/build_single.py
Los módulos se cargan con un import map de URLs data:, así que hace falta un navegador
actual (Chrome/Edge 89+, Safari 16.4+, Firefox 108+). El módulo Velas necesita internet
para descargar three.js; Tejidos y Solar funcionan sin conexión.
"""
import base64, json, pathlib, posixpath, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "dist" / "Sauleda-Studio.html"
IMPORT_RE = re.compile(r"""(from\s+|import\s*\(\s*)(['"])(\.{1,2}/[^'"]+)\2""")


def data_uri(data, mime):
    return f"data:{mime};base64," + base64.b64encode(data).decode()


images = {f"assets/{p.name}": data_uri(p.read_bytes(), "image/png") for p in (ROOT / "assets").glob("*.png")}


def module_src(rel):
    """Código del módulo js/<rel> con sus imports relativos cambiados a '@/<ruta>'."""
    src = (ROOT / "js" / rel).read_text()
    base = posixpath.dirname(rel)
    src = IMPORT_RE.sub(lambda m: f"{m.group(1)}'@/{posixpath.normpath(posixpath.join(base, m.group(3)))}'", src)
    for path, uri in images.items():
        src = src.replace(f"'{path}'", f"'{uri}'")
    return src


html = (ROOT / "index.html").read_text()
html = re.sub(r'<link rel="stylesheet" href="(css/[^"]+)">',
              lambda m: "<style>\n" + (ROOT / m.group(1)).read_text() + "</style>", html)
for path, uri in images.items():
    html = html.replace(path, uri)

embed = {"data/fabrics.json": json.loads((ROOT / "data" / "fabrics.json").read_text())}
embed.update({f"data/clima/{f.name}": json.loads(f.read_text()) for f in sorted((ROOT / "data" / "clima").glob("*.json"))})

mods = sorted(str(p.relative_to(ROOT / "js")) for p in (ROOT / "js").rglob("*.js") if p.name != "app.js" or p.parent != ROOT / "js")
imap = json.loads(re.search(r'<script type="importmap">(.*?)</script>', html, re.S).group(1))
imap["imports"].update({f"@/{m}": "data:text/javascript;base64," + base64.b64encode(module_src(m).encode()).decode() for m in mods})
html = re.sub(r'<script type="importmap">.*?</script>', lambda _: '<script type="importmap">' + json.dumps(imap) + "</script>", html, flags=re.S)

head = "<script>window.__EMBED = " + json.dumps(embed, separators=(",", ":"), ensure_ascii=False) + ";</script>\n"
html = html.replace("</head>", head + "</head>")
html = html.replace('<script type="module" src="js/app.js"></script>',
                    "<script type=\"module\">\n" + module_src("app.js").replace("</script", "<\\/script") + "</script>")

OUT.parent.mkdir(exist_ok=True)
OUT.write_text(html)
print(OUT, f"{OUT.stat().st_size / 1e6:.1f} MB")
