# -*- coding: utf-8 -*-
"""把测试截图压成 README 用的 JPEG，并准备打赏码占位素材。"""
from PIL import Image
import os

os.makedirs("docs/images", exist_ok=True)

jobs = [
    (".e2e-out/desktop.png", "docs/images/screenshot-desktop.jpg", 1440),
    (".e2e-out/desktop-dark.png", "docs/images/screenshot-desktop-dark.jpg", 1440),
    (".e2e-out/mobile.png", "docs/images/screenshot-mobile.jpg", 520),
    (".layout-out/share-modal.png", "docs/images/share-modal.jpg", 900),
]

for src, dst, width in jobs:
    if not os.path.exists(src):
        print("MISS", src)
        continue
    im = Image.open(src).convert("RGB")
    if im.width > width:
        h = round(im.height * width / im.width)
        im = im.resize((width, h), Image.LANCZOS)
    if im.height > 3000:
        im = im.crop((0, 0, im.width, 3000))
    im.save(dst, "JPEG", quality=86, optimize=True, progressive=True)
    print(dst, im.size, os.path.getsize(dst))

src = "../absurd-startup-lab/assets/sponsor-qr.jpg"
if os.path.exists(src):
    im = Image.open(src).convert("RGB").resize((520, 520), Image.LANCZOS)
    im.save("docs/images/donate.jpg", "JPEG", quality=92, optimize=True)
    print("donate.jpg", im.size, os.path.getsize("docs/images/donate.jpg"))
else:
    print("MISS donate source")
