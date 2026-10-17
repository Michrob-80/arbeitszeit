#!/usr/bin/env python3
"""Erzeugt die App-Symbole (Stechuhr-Zifferblatt) in icons/. Aufruf: python3 tools/make-icons.py"""
import math, pathlib
from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).resolve().parent.parent / "icons"
OUT.mkdir(exist_ok=True)
NAVY, GOLD, PAPER = (22, 36, 58), (244, 192, 32), (241, 243, 238)

def draw(size, safe):
    S = 4
    n = size * S
    im = Image.new("RGB", (n, n), NAVY)
    d = ImageDraw.Draw(im)
    cx = cy = n / 2
    r = n * safe / 2
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=PAPER)
    for i in range(12):
        a = math.radians(i * 30 - 90)
        r1, r2 = r * (0.80 if i % 3 else 0.74), r * 0.90
        w = int(n * (0.012 if i % 3 else 0.022))
        d.line([cx + r1 * math.cos(a), cy + r1 * math.sin(a), cx + r2 * math.cos(a), cy + r2 * math.sin(a)], fill=NAVY, width=w)
    def hand(angle_deg, length, width, color):
        a = math.radians(angle_deg - 90)
        d.line([cx, cy, cx + r * length * math.cos(a), cy + r * length * math.sin(a)], fill=color, width=int(n * width))
    hand(0, 0.62, 0.028, NAVY)
    hand(0, 0, 0, NAVY)
    hand(-60, 0.62, 0.0, NAVY)
    # Stunden- und Minutenzeiger: 8:00 Uhr (Arbeitsbeginn / Soll 8 h)
    hand(240, 0.46, 0.04, NAVY)
    hand(0, 0.70, 0.026, GOLD)
    rr = n * 0.04
    d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=GOLD)
    return im.resize((size, size), Image.LANCZOS)

draw(192, 0.78).save(OUT / "icon-192.png")
draw(512, 0.78).save(OUT / "icon-512.png")
draw(512, 0.60).save(OUT / "icon-maskable-512.png")
draw(180, 0.82).save(OUT / "apple-touch-icon.png")
draw(32, 0.92).save(OUT / "favicon-32.png")
print("Symbole geschrieben:", sorted(p.name for p in OUT.iterdir()))
