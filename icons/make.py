# Генерация иконок PWA: тёмный фон, голубой круг, белая галочка.
from PIL import Image, ImageDraw

BG = (30, 43, 54)      # --surface
ACC = (35, 165, 238)   # --accent

def icon(size, maskable=False):
    S = size * 4
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if maskable:
        d.rectangle([0, 0, S, S], fill=BG)
        r = S * 0.30
    else:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.22, fill=BG)
        r = S * 0.34
    cx = cy = S / 2
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ACC)
    w = int(S * 0.075)
    pts = [(cx - r * 0.45, cy + r * 0.02), (cx - r * 0.12, cy + r * 0.36), (cx + r * 0.5, cy - r * 0.36)]
    d.line(pts, fill=(255, 255, 255), width=w, joint='curve')
    for p in pts:
        d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=(255, 255, 255))
    return im.resize((size, size), Image.LANCZOS)

icon(192).save('icons/icon-192.png')
icon(512).save('icons/icon-512.png')
icon(512, maskable=True).save('icons/icon-maskable-512.png')
apple = icon(180, maskable=True)
apple.save('icons/apple-touch-icon.png')
print('icons ok')
