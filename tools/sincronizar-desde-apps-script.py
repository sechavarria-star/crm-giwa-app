#!/usr/bin/env python3
"""
Sincroniza las piezas compartidas del CRM viejo (Apps Script) con la app nueva.

Mientras dure la transición, el diseño se sigue tocando en `_Estilos.html` del
Apps Script. Este script lo convierte a los archivos de la app nueva, así las
dos versiones se ven igual. Al terminar la fase 3, los archivos de la app nueva
pasan a ser la única fuente y este script se borra.

    python3 tools/sincronizar-desde-apps-script.py "<carpeta CODE CRM>"

Genera (pisa) estos archivos — no editarlos a mano mientras se use este script:
    css/estilos.css   ← los <style> de _Estilos.html
    js/base.js        ← el <script> de _Estilos.html (set, fmt, ff, velo…)
    js/iconos.js      ← el <script> de _Iconos.html (ico, _ICO)
    js/dialogo.js     ← _Dialogo.html: el markup se inyecta al cargar + su <script>
    js/calculos.js    ← el <script> de _Calculos.html (fechas, mTotal, sum… · sin plata nueva)
    js/estados.js     ← el <script> de _Estados.html (canon, colores, activo/detenido…)
"""
import os, re, sys, json

def bloques(html, tag):
    return re.findall(r'<%s[^>]*>(.*?)</%s>' % (tag, tag), html, re.S | re.I)

def leer(carpeta, nombre):
    with open(os.path.join(carpeta, nombre), encoding='utf-8') as f:
        return f.read()

def escribir(raiz, rel, texto, origen):
    cab = ('/* GENERADO por tools/sincronizar-desde-apps-script.py desde %s.\n'
           '   No editar a mano mientras dure la transición: se pisa. */\n') % origen
    ruta = os.path.join(raiz, rel)
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, 'w', encoding='utf-8') as f:
        f.write(cab + texto.strip() + '\n')
    print('  %-16s %7d bytes' % (rel, len(texto)))

def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    est = leer(src, '_Estilos.html')
    escribir(raiz, 'css/estilos.css', '\n\n'.join(bloques(est, 'style')), '_Estilos.html')
    escribir(raiz, 'js/base.js', '\n\n'.join(bloques(est, 'script')), '_Estilos.html')

    ico = leer(src, '_Iconos.html')
    escribir(raiz, 'js/iconos.js', '\n\n'.join(bloques(ico, 'script')), '_Iconos.html')

    dlg = leer(src, '_Dialogo.html')
    sin_coment = re.sub(r'<!--.*?-->', '', dlg, flags=re.S)
    markup = re.sub(r'<script[^>]*>.*?</script>', '', sin_coment, flags=re.S | re.I).strip()
    js = ('(function(){var d=document.createElement("div");d.innerHTML=%s;'
          'while(d.firstChild)document.body.appendChild(d.firstChild);})();\n\n' % json.dumps(markup))
    js += '\n\n'.join(bloques(dlg, 'script'))
    escribir(raiz, 'js/dialogo.js', js, '_Dialogo.html')

    for nombre, rel in (('_Calculos.html', 'js/calculos.js'), ('_Estados.html', 'js/estados.js')):
        escribir(raiz, rel, '\n\n'.join(bloques(leer(src, nombre), 'script')), nombre)

if __name__ == '__main__':
    main()
