#!/usr/bin/env python3
"""Generate the Jarvis app icon at every size electron-builder needs.

Run with:  python3 tools/generate-icon.py
Requires Pillow (pip install pillow).
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "build")
ICONS_DIR = os.path.join(OUT_DIR, "icons")
SIZES = [16, 24, 32, 48, 64, 96, 128, 256, 512]
S = 4  # supersampling factor

CYAN = (87, 215, 255)
BG = (7, 9, 13)
WHITE = (224, 246, 255)


def find_font(size):
    candidates = [
        "/usr/share/fonts/truetype/ubuntu/Ubuntu-L.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Light.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def draw_icon(size):
    px = size * S
    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # rounded-square dark background
    m = int(px * 0.05)
    d.rounded_rectangle([m, m, px - m, px - m], radius=int(px * 0.23), fill=BG + (255,))

    cx = cy = px / 2
    R = px * 0.32

    # faint baseline circle
    d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=CYAN + (55,), width=max(1, int(px * 0.004)))

    # segmented outer ring: 48 dashes, brighter every 4th
    for i in range(48):
        a = (i / 48) * 2 * math.pi - math.pi / 2
        major = i % 4 == 0
        span = 4.2 if major else 2.2
        width = max(1, int(px * (0.012 if major else 0.007)))
        color = CYAN + (255,) if major else CYAN + (170,)
        d.arc(
            [cx - R, cy - R, cx + R, cy + R],
            start=math.degrees(a) - span / 2,
            end=math.degrees(a) + span / 2,
            fill=color,
            width=width,
        )

    # thin inner ring
    Ri = px * 0.235
    d.ellipse([cx - Ri, cy - Ri, cx + Ri, cy + Ri], outline=CYAN + (120,), width=max(1, int(px * 0.003)))

    # stylized "J" with glow
    font = find_font(int(px * 0.30))
    glow = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.text((cx, cy - px * 0.015), "J", font=font, fill=CYAN + (255,), anchor="mm")
    glow = glow.filter(ImageFilter.GaussianBlur(px * 0.018))
    img.alpha_composite(glow)
    d = ImageDraw.Draw(img)
    d.text((cx, cy - px * 0.015), "J", font=font, fill=WHITE + (255,), anchor="mm")

    return img.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(ICONS_DIR, exist_ok=True)
    for s in SIZES:
        icon = draw_icon(s)
        icon.save(os.path.join(ICONS_DIR, f"{s}x{s}.png"))
        if s == 512:
            icon.save(os.path.join(OUT_DIR, "icon.png"))
    print("Wrote icons to", os.path.abspath(OUT_DIR))


if __name__ == "__main__":
    main()
