#!/usr/bin/env python3 -I
"""Makes the fourth guide screenshot (the Edit sheet with the Done button outlined) from the user's own second screenshot.

    python3 -I mac/tools/make_step4.py          →  mac/Resources/Guide/step4-done.png

Step 2's screenshot shows the Edit sheet with the "+" outlined in red; step 4 needs the same sheet with "Done" outlined instead.
So: paint the red ring around "+" out (every ring pixel takes the average of the nearest non-ring pixels around it), find the blue
Done button, and draw the same red ring around it. The image is then compressed like the other three (pngquant + optipng).
It shows the sheet as it is BEFORE the keyboard is added (the left list has no Finglish yet); swap in a real screenshot if you prefer.
"""
import os, subprocess
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
GUIDE = os.path.join(HERE, '..', 'Resources', 'Guide')
im = Image.open(os.path.join(GUIDE, 'step2-plus.png')).convert('RGBA')
a = np.array(im).astype(int); H, W = a.shape[:2]
r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]

# 1. the red ring around "+" (bottom-left): find it, then paint it out
red = (r > 170) & (g < 130) & (b < 120) & (al > 200)
red[: int(H * 0.6), :] = False                                  # nothing red above (the traffic lights are grey in a sheet)
ring_color = tuple(int(v) for v in np.median(a[red][:, :3], axis=0))
ys, xs = np.nonzero(red)
mask = np.zeros((H, W), bool)
for dy in range(-2, 3):                                         # grow the mask: the ring's anti-aliased fringe goes too
    for dx in range(-2, 3):
        mask[np.clip(ys + dy, 0, H - 1), np.clip(xs + dx, 0, W - 1)] = True
out = a.copy()
for y, x in zip(*np.nonzero(mask)):
    for rad in range(3, 12):                                    # average of the nearest pixels that are not part of the ring
        y0, y1, x0, x1 = max(0, y - rad), min(H, y + rad + 1), max(0, x - rad), min(W, x + rad + 1)
        win = ~mask[y0:y1, x0:x1]
        if win.sum() >= 6:
            out[y, x] = a[y0:y1, x0:x1][win].mean(axis=0).astype(int); break

# 2. the blue Done button (bottom-right) and a ring of the same colour and thickness around it
blue = (b > 170) & (r < 110) & (g > 80) & (g < 200) & (al > 200)
blue[: int(H * 0.77), :] = False; blue[:, : int(W * 0.7)] = False
by, bx = np.nonzero(blue)
pad, thick, scale = 6, 4, 4
box = (bx.min() - pad, by.min() - pad, bx.max() + pad, by.max() + pad)
layer = Image.new('RGBA', (W * scale, H * scale), (0, 0, 0, 0))   # drawn 4× larger, then shrunk: smooth edges
ImageDraw.Draw(layer).rounded_rectangle([v * scale for v in box], radius=14 * scale, outline=ring_color + (255,), width=thick * scale)
layer = layer.resize((W, H), Image.LANCZOS)
result = Image.alpha_composite(Image.fromarray(out.astype('uint8'), 'RGBA'), layer)

dst = os.path.join(GUIDE, 'step4-done.png')
result.save(dst)
subprocess.run(['pngquant', '--quality', '75-95', '--speed', '1', '--strip', '--force', '--output', dst, dst], check=True)
subprocess.run(['optipng', '-quiet', '-o5', dst], check=True)
print('wrote', dst, os.path.getsize(dst) // 1024, 'KB; ring colour', ring_color, '; Done button at', box)
