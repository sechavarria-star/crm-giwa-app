#!/usr/bin/env python3
"""Pone ?v=<fecha y hora> en cada css/js de index.html (27/10/2026).

El navegador guarda los archivos y, sin esto, después de publicar seguía
mostrando la versión vieja. Correrlo antes de cada commit que se publica:
    python3 tools/versionar.py
"""
import re, time, pathlib

p = pathlib.Path(__file__).resolve().parent.parent / 'index.html'
v = time.strftime('%Y%m%d%H%M')
s = re.sub(r'((?:href|src)="(?:css|js)/[^"?]+\.(?:css|js))(?:\?v=\w+)?"', r'\1?v=' + v + '"', p.read_text())
p.write_text(s)
print('index.html → v=' + v)
