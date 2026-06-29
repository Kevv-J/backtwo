#!/usr/bin/env python3
"""Generate og.png (1200x630) — the social-share card for backtwo.

Dark #0b1020 background. Left 60%: stacked back/two wordmark, cyan over violet.
Right 40%: three mono rows describing the tool. Bottom-right: muted byline.
No Pokémon assets — abstract geometry only.

Fonts fetched from Google Fonts on first run, cached under data/og_fonts/.
"""
from __future__ import annotations

from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
FONT_DIR = ROOT / "data" / "og_fonts"
OUT = ROOT / "og.png"

FONTS = {
    "rajdhani-600": "https://github.com/google/fonts/raw/main/ofl/rajdhani/Rajdhani-SemiBold.ttf",
    "rajdhani-700": "https://github.com/google/fonts/raw/main/ofl/rajdhani/Rajdhani-Bold.ttf",
    "jetbrains-500": "https://github.com/google/fonts/raw/main/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf",
}

W, H = 1200, 630
BG = (11, 16, 32)
CYAN = (34, 211, 238)
VIOLET = (167, 139, 250)
MUTED = (122, 128, 149)
DIM = (138, 145, 171)


def _font_path(name: str, url: str) -> Path:
    FONT_DIR.mkdir(parents=True, exist_ok=True)
    p = FONT_DIR / f"{name}.ttf"
    if not p.exists():
        print(f"  fetching {name}...", flush=True)
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        p.write_bytes(r.content)
    return p


def main() -> int:
    print("Building og.png ...", flush=True)
    raj_600 = ImageFont.truetype(str(_font_path("rajdhani-600", FONTS["rajdhani-600"])), 280)
    raj_700 = ImageFont.truetype(str(_font_path("rajdhani-700", FONTS["rajdhani-700"])), 280)
    mono_med = ImageFont.truetype(str(_font_path("jetbrains-500", FONTS["jetbrains-500"])), 30)
    mono_small = ImageFont.truetype(str(_font_path("jetbrains-500", FONTS["jetbrains-500"])), 18)

    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Subtle diagonal cyan/violet glow strip across the upper-right
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    for i in range(80):
        a = int(8 * (1 - i / 80))
        glow_draw.line([(W - 400 + i, 0), (W + i, 280)], fill=(34, 211, 238, a), width=2)
        glow_draw.line([(W - 200 + i, 0), (W + i, 480)], fill=(167, 139, 250, a), width=2)
    img.paste(glow, (0, 0), glow)

    # Wordmark — stacked, tight leading, left side
    pad_l = 70
    y_top = 70
    draw.text((pad_l, y_top), "back", font=raj_600, fill=CYAN)
    draw.text((pad_l, y_top + 215), "two", font=raj_700, fill=VIOLET)

    # Right column — three mono rows
    rx = 750
    ry = 180
    line_h = 52
    rows = [
        "1,400+ teams",
        "Gen-9 damage calc",
        "VGC doubles only",
    ]
    for i, line in enumerate(rows):
        draw.ellipse((rx - 26, ry + i * line_h + 14, rx - 14, ry + i * line_h + 26),
                     fill=CYAN if i == 0 else VIOLET if i == 1 else MUTED)
        draw.text((rx, ry + i * line_h), line, font=mono_med, fill=(221, 225, 239))

    # Bottom byline — right aligned, single line
    by = H - 40
    tag = "read the back two — built by @Kevv-J · kevv-j.github.io/backtwo"
    bbox = draw.textbbox((0, 0), tag, font=mono_small)
    draw.text((W - 70 - (bbox[2] - bbox[0]), by), tag, font=mono_small, fill=DIM)

    img.save(OUT, "PNG", optimize=True)
    print(f"Wrote {OUT} ({OUT.stat().st_size // 1024} KB)", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
