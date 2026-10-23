#!/usr/bin/env python3
"""Gera os ícones PNG do totem Espetos Aero (visual Frutiger Aero).

Uso:  python3 scripts/gen_icons.py
Sai em: icons/ (192, 512, maskable 512, apple-touch 180)
"""
import math
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")
SS = 4  # supersampling para bordas suaves


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def sky_grass(size):
    """Céu azul -> colina verde, com brilho solar no topo."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    sky_top, sky_bottom = (11, 111, 205), (140, 230, 255)
    grass_top, grass_bottom = (140, 227, 74), (11, 95, 25)
    for y in range(size):
        for x in range(size):
            # diagonal suave
            t = (y / size + (x / size) * 0.25) / 1.25
            if t < 0.62:
                c = lerp(sky_top, sky_bottom, t / 0.62)
            else:
                c = lerp(grass_top, grass_bottom, (t - 0.62) / 0.38)
            # halo solar no canto superior direito
            d = math.hypot((x - size * 0.86) / (size * 0.62), (y - size * 0.06) / (size * 0.62))
            c = lerp((255, 255, 235), c, min(1.0, d))
            px[x, y] = c
    return img


def skewer(d, size, lw=None):
    """Espeto diagonal: palito + 4 cubos com brilho."""
    lw = lw or size * 0.055
    cx = cy = size / 2
    ang = math.radians(-45)
    ux, uy = math.cos(ang), math.sin(ang)
    half = size * 0.34

    # palito
    x0, y0 = cx - ux * half, cy - uy * half
    x1, y1 = cx + ux * half * 1.18, cy + uy * half * 1.18
    d.line([(x0, y0), (x1, y1)], fill=(120, 72, 30), width=int(lw))
    d.ellipse([x1 - lw / 1.4, y1 - lw / 1.4, x1 + lw / 1.4, y1 + lw / 1.4], fill=(150, 96, 44))

    # cubos
    colors = [(255, 150, 46), (236, 88, 42), (255, 196, 74), (122, 206, 74)]
    n = len(colors)
    side = size * 0.155
    for i, col in enumerate(colors):
        f = (i + 0.5) / n * 0.92 - 0.34          # posição ao longo do palito
        px, py = cx + ux * half * f * 2, cy + uy * half * f * 2
        box = [px - side, py - side, px + side, py + side]
        d.rounded_rectangle(box, radius=side * 0.42, fill=col,
                            outline=tuple(max(0, c - 70) for c in col), width=max(1, int(lw / 3)))
        # brilho superior (gloss)
        d.rounded_rectangle([px - side * 0.72, py - side * 0.80, px + side * 0.20, py - side * 0.18],
                            radius=side * 0.30, fill=(255, 255, 255))


def build(size, maskable=False):
    big = size * SS
    base = sky_grass(big // 2).resize((big, big), Image.BICUBIC)
    img = base.convert("RGBA")

    # camada de vidro fosco (Aero glass)
    glass = Image.new("RGBA", (big, big), (255, 255, 255, 0))
    gd = ImageDraw.Draw(glass)
    inset = int(big * (0.0 if maskable else 0.13))
    r = int(big * (0.0 if maskable else 0.22))
    gd.rounded_rectangle([inset, inset, big - inset, big - inset], radius=r,
                         fill=(255, 255, 255, 46))
    gd.rounded_rectangle([inset, inset, big - inset, big - inset], radius=r,
                         outline=(255, 255, 255, 150), width=int(big * 0.012))
    img = Image.alpha_composite(img, glass)

    d = ImageDraw.Draw(img)
    skewer(d, big, lw=big * 0.045)

    # reflexo + faísca
    flare = Image.new("RGBA", (big, big), (255, 255, 255, 0))
    fd = ImageDraw.Draw(flare)
    fd.ellipse([big * 0.58, big * 0.06, big * 0.86, big * 0.34], fill=(255, 255, 255, 70))
    img = Image.alpha_composite(img, flare)

    out = img.resize((size, size), Image.LANCZOS)
    if maskable:
        return out.convert("RGB")

    # arredonda cantos (ícone normal)
    mask = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size * 4 - 1, size * 4 - 1], radius=int(size * 4 * 0.22), fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    out.putalpha(mask)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    build(192).save(os.path.join(OUT, "icon-192.png"))
    build(512).save(os.path.join(OUT, "icon-512.png"))
    build(512, maskable=True).convert("RGB").save(os.path.join(OUT, "icon-maskable-512.png"))
    build(180).save(os.path.join(OUT, "apple-touch-icon.png"))
    print("Ícones gerados em", OUT)


if __name__ == "__main__":
    main()
