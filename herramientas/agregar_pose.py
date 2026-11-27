"""
Agrega una pose (otra foto del MISMO lugar donde un jugador hace algo) a un escenario.

  python3 herramientas/agregar_pose.py foto.jpg <escenario> <jugador> <pose>
     <jugador> 0 = el de la izquierda de la foto, 1 = el de la derecha
     <pose>    baja = pone cartas en la mesa · gana = festeja

Qué hace:
  1. Alinea la foto nueva con la original (las IA a veces la mueven unos pixeles).
  2. Guarda la parte de arriba de la foto (fondo + jugador) para que no se vea
     el jugador original detrás, y el jugador recortado (con su brazo sobre la mesa).
  3. Busca dónde quedó su cara, para poner encima la selfie de tu amigo.
"""
import sys, os, json
import numpy as np, cv2
from PIL import Image, ImageFilter
from scipy import ndimage as nd
from rembg import remove, new_session

foto, nombre, k, pose = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
carpeta = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'escenarios', nombre)
datos = json.load(open(f'{carpeta}/datos.json'))
W, H, ym = datos['ancho'], datos['alto'], datos['yMesa']
base = cv2.imread(f'{carpeta}/escena.jpg')
nueva = cv2.resize(cv2.imread(foto), (W, H), interpolation=cv2.INTER_AREA)

# ---------- 1. Alinear con la foto original (solo con el fondo, arriba de la mesa) ----------
def gris(a): return cv2.cvtColor(a, cv2.COLOR_BGR2GRAY)
orb = cv2.ORB_create(5000)
zona = np.zeros((H, W), np.uint8); zona[:ym - 40] = 255
for j in datos['jugadores']:                     # los jugadores se mueven: no sirven para alinear
    x0, y0, x1, y1 = j['caja']; zona[y0:y1, x0:x1] = 0
k1, d1 = orb.detectAndCompute(gris(base), zona)
k2, d2 = orb.detectAndCompute(gris(nueva), zona)
M = None
if d1 is not None and d2 is not None:
    pares = sorted(cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(d2, d1), key=lambda m: m.distance)[:600]
    if len(pares) > 20:
        a = np.float32([k2[m.queryIdx].pt for m in pares]); b = np.float32([k1[m.trainIdx].pt for m in pares])
        M, ok = cv2.estimateAffinePartial2D(a, b, method=cv2.RANSAC, ransacReprojThreshold=3)
if M is not None:
    nueva = cv2.warpAffine(nueva, M, (W, H), borderMode=cv2.BORDER_REPLICATE)
    print('alineada: escala %.3f, mueve %.1f,%.1f px' % (np.hypot(M[0, 0], M[1, 0]), M[0, 2], M[1, 2]))
else:
    print('no se pudo alinear; se usa tal cual')

rgb = cv2.cvtColor(nueva, cv2.COLOR_BGR2RGB)
img = Image.fromarray(rgb)
yy, xx = np.mgrid[0:H, 0:W]

# ---------- 2. Recortar al jugador ----------
alfa = np.array(remove(img, session=new_session('u2net_human_seg'), only_mask=True)).astype(float) / 255
lab, n = nd.label(alfa > 0.43)
c0 = datos['jugadores'][k]['caja']
mejor = max(range(1, n + 1), key=lambda i: (lab[c0[1]:c0[3], c0[0]:c0[2]] == i).sum())
m = (lab == mejor) & (yy <= ym + 130)
# si se pegó con el otro jugador, se le quita la silueta del otro (de su recorte original)
otro = datos['jugadores'][1 - k]['caja']
sil = np.zeros((H, W), bool)
a_otro = np.array(Image.open(f'{carpeta}/jugador{1 - k}.png'))[..., 3] > 110
sil[otro[1]:otro[3], otro[0]:otro[2]] = a_otro
m &= ~nd.binary_dilation(sil, iterations=6)
lab2, n2 = nd.label(m)
if n2 > 1:
    m = lab2 == (np.argmax(nd.sum(m, lab2, range(1, n2 + 1))) + 1)
m = nd.binary_fill_holes(nd.binary_closing(m, iterations=2))
# abajo de la orilla de la mesa solo se queda el brazo (no pedazos de mesa blanca)
v = rgb.max(axis=2).astype(int); sat = v - rgb.min(axis=2).astype(int)
m &= ~((yy > ym - 5) & (v > 195) & (sat < 40))
lab3, n3 = nd.label(m)
if n3 > 1:
    m = lab3 == (np.argmax(nd.sum(m, lab3, range(1, n3 + 1))) + 1)
ys, xs = np.where(m)
caja = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
a = np.array(Image.fromarray((np.clip(alfa * m, 0, 1) * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.6)))
Image.fromarray(np.dstack([rgb, a]), 'RGBA').crop(caja).save(f'{carpeta}/jugador{k}-{pose}.png')

# Fondo: la foto completa de arriba hasta un poco abajo de la orilla de la mesa
alto_fondo = min(H, max(c0[3], ym + 40) + 20)
Image.fromarray(rgb[:alto_fondo]).save(f'{carpeta}/fondo{k}-{pose}.jpg', quality=84)

# ---------- 3. La cara ----------
# detector de caras de OpenCV (viene en herramientas/modelos/)
_modelo = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'modelos', 'haarcascade_frontalface_default.xml')
haar = cv2.CascadeClassifier(_modelo if os.path.exists(_modelo) else cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
cara_orig = datos['jugadores'][k]['cara']
cx0, cy0 = cara_orig[0] + cara_orig[2] / 2, cara_orig[1] + cara_orig[3] / 2
def cara_en(imagen, caja_persona):
    # la cara más cercana a donde estaba (las caras no se mueven mucho entre poses)
    x0, y0, x1, y1 = caja_persona
    caras = haar.detectMultiScale(gris(imagen), 1.06, 5, minSize=(45, 45))
    caras = [c for c in caras if x0 <= c[0] + c[2] / 2 <= x1
             and np.hypot(c[0] + c[2] / 2 - cx0, c[1] + c[3] / 2 - cy0) < 110
             and 0.55 < c[2] / cara_orig[2] < 1.8]
    return min(caras, key=lambda c: np.hypot(c[0] + c[2] / 2 - cx0, c[1] + c[3] / 2 - cy0)) if len(caras) else None
h0 = cara_en(base, c0)
h1 = cara_en(nueva, caja)
if h0 is not None and h1 is not None:
    # misma relación entre "lo que detecta OpenCV" y "la cara del juego" que en la foto original
    s = h1[2] / h0[2]
    cara = [int(h1[0] + (cara_orig[0] - h0[0]) * s), int(h1[1] + (cara_orig[1] - h0[1]) * s), int(cara_orig[2] * s), int(cara_orig[3] * s)]
    print('cara encontrada', cara)
else:
    cara = cara_orig
    print('no encontré la cara; uso la de la foto original')

j = datos['jugadores'][k]
j.pop('baja', None)
j.setdefault('poses', {})[pose] = {'caja': caja, 'cara': cara, 'fondo': f'fondo{k}-{pose}.jpg', 'altoFondo': alto_fondo}
json.dump(datos, open(f'{carpeta}/datos.json', 'w'), indent=1)
print('pose guardada:', nombre, k, pose, caja)
