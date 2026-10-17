#!/usr/bin/env python3
"""Erzeugt unabhängige Referenzdaten für die Tests (Ostersonntage 1990-2100).

Die Daten stammen aus python-dateutil (eigene Implementierung des Osteralgorithmus), NICHT aus
dem JavaScript-Code der App. So prüft der Test die App gegen eine unabhängige Quelle.
Aufruf:  python3 tools/make-fixtures.py
"""
import json, pathlib
from dateutil.easter import easter, EASTER_WESTERN

out = {str(y): easter(y, EASTER_WESTERN).isoformat() for y in range(1990, 2101)}
path = pathlib.Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "easter-1990-2100.json"
path.write_text(json.dumps(out, indent=1), encoding="utf-8")
print("geschrieben:", path, len(out), "Jahre")
