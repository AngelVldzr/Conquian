"""Dibuja la moneda de $10 (anillo dorado, centro plateado) vista de lado: public/img/moneda.png"""
import os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

E = 4                      # se dibuja 4 veces más grande y se reduce (bordes suaves)
W, RY, GROSOR = 200 * E, 64 * E, 17 * E          # ancho, alto de la elipse de la cara, grosor del canto
H = RY + GROSOR + 4 * E
img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
yy, xx = np.mgrid[0:H, 0:W].astype(float)
cx, rx, ry = W / 2, W / 2 - 2 * E, RY / 2

def elipse(cy, rx_, ry_):
    return ((xx - cx) / rx_) ** 2 + ((yy - cy) / ry_) ** 2 <= 1

# ---- canto (cilindro): luz de izquierda a derecha + estrías ----
cara_y = ry + E
canto = np.zeros((H, W), bool)
for k in range(GROSOR + 1):
    canto |= elipse(cara_y + k, rx, ry)
t = np.clip((xx - (cx - rx)) / (2 * rx), 0, 1)                       # 0 izquierda … 1 derecha
luz = 0.55 + 0.6 * np.exp(-((t - 0.32) / 0.22) ** 2) - 0.25 * t      # brillo
ang = np.arccos(np.clip((xx - cx) / rx, -1, 1))
estrias = 0.88 + 0.12 * np.sign(np.sin(ang * 70))                    # canto estriado
oro_canto = np.stack([212 * luz * estrias, 158 * luz * estrias, 52 * luz * estrias], -1)
rgba = np.zeros((H, W, 4))
rgba[canto, :3] = oro_canto[canto]
# separación con la moneda de abajo: orilla inferior oscura y un filo claro arriba del canto
abajo = canto & ~elipse(cara_y + GROSOR - 2.2 * E, rx, ry)
rgba[abajo, :3] *= 0.35
arriba = canto & elipse(cara_y + 2.2 * E, rx, ry) & ~elipse(cara_y, rx, ry)
rgba[arriba, :3] = np.clip(rgba[arriba, :3] * 1.25, 0, 255)
rgba[canto, 3] = 255

# ---- cara de arriba: anillo dorado + centro plateado ----
cara = elipse(cara_y, rx, ry)
r = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cara_y) / ry) ** 2)      # 0 centro … 1 orilla
brillo = 1 + 0.35 * np.exp(-(((xx - cx + rx * .35) / (rx * .55)) ** 2 + ((yy - cara_y + ry * .4) / (ry * .7)) ** 2)) - 0.18 * (xx - cx) / rx
oro = np.stack([236, 186, 70], 0)[None, None, :] * brillo[..., None]
plata = np.stack([206, 208, 204], 0)[None, None, :] * brillo[..., None]
color = np.where((r < 0.6)[..., None], plata, oro)
# bordes en relieve: orilla exterior, línea entre anillo y centro
for r0, fuerza in ((0.94, 0.75), (0.6, 0.7), (0.56, 1.15)):
    banda = np.abs(r - r0) < 0.025
    color[banda] *= fuerza
# puntitos del anillo (como las letras del anillo)
for i in range(36):
    a = i / 36 * 2 * math.pi
    px, py = cx + math.cos(a) * rx * 0.77, cara_y + math.sin(a) * ry * 0.77
    m = ((xx - px) / (rx * .025)) ** 2 + ((yy - py) / (ry * .045)) ** 2 <= 1
    color[m] *= 0.78
# piedra del sol estilizada en el centro (anillos y rayos)
for r0 in (0.42, 0.25, 0.1):
    color[np.abs(r - r0) < 0.018] *= 0.8
for i in range(16):
    a = i / 16 * 2 * math.pi
    for s in np.linspace(0.27, 0.4, 6):
        px, py = cx + math.cos(a) * rx * s, cara_y + math.sin(a) * ry * s
        color[((xx - px) / (rx * .012)) ** 2 + ((yy - py) / (ry * .02)) ** 2 <= 1] *= 0.82
rgba[cara, :3] = np.clip(color[cara], 0, 255)
rgba[cara, 3] = 255
# borde oscuro donde se junta cara y canto
filo = cara & ~elipse(cara_y, rx - 2.5 * E, ry - 2.5 * E) & (yy > cara_y)
rgba[filo, :3] *= 0.7

im = Image.fromarray(rgba.astype('uint8'), 'RGBA').resize((W // E, H // E), Image.LANCZOS)
salida = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'img', 'moneda.png')
im.save(salida, optimize=True)
print('moneda', im.size, '-> grosor en %:', round(GROSOR / E / (W / E) * 100, 2), 'del ancho')
