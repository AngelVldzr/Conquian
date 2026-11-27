"""
Convierte una foto de referencia (vertical, ~684x1024, dos jugadores sentados a una mesa)
en un escenario del juego:

  public/escenarios/<nombre>/escena.jpg   foto con la mesa LIMPIA (sin cartas, mano ni vaso)
  public/escenarios/<nombre>/lados.jpg    versión desenfocada para rellenar los lados en pantallas anchas
  public/escenarios/<nombre>/jugadorN.png cada jugador recortado (con sus cartas) en PNG transparente
  public/escenarios/<nombre>/datos.json   dónde está la mesa y dónde está la cara de cada jugador

Uso:
  pip install rembg onnxruntime opencv-contrib-python scipy pillow
  python3 herramientas/preparar_escena.py foto.png taxis 615 madera
     615    = altura (pixeles) donde empieza la mesa en la foto
     madera = tipo de mesa: madera | plastico | fieltro
"""
import sys, os, json
import numpy as np, cv2
from PIL import Image, ImageFilter
from scipy import ndimage as nd
from rembg import remove, new_session

foto, nombre, y_mesa, tipo = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
# Opcional: CARAS="x,y,ancho,alto;x,y,ancho,alto" si la detección automática no atina
caras_manual = [list(map(int, c.split(','))) for c in os.environ['CARAS'].split(';')] if os.environ.get('CARAS') else None
carpeta = sys.argv[5] if len(sys.argv) > 5 else os.path.join(os.path.dirname(__file__), '..', 'public', 'escenarios', nombre)
os.makedirs(carpeta, exist_ok=True)

img = Image.open(foto).convert('RGB')
W, H = img.size
rgb = np.array(img).astype(int)
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
v = rgb.max(axis=2)
sat = v - rgb.min(axis=2)
yy, xx = np.mgrid[0:H, 0:W]
mesa = yy >= y_mesa

# ---------- 1. Personas ----------
alfa = np.array(remove(img, session=new_session('u2net_human_seg'), only_mask=True)).astype(float) / 255
persona = alfa > 0.43
lab, n = nd.label(persona)
tam = nd.sum(persona, lab, range(1, n + 1))
jugadores_ids = []
for i, t in enumerate(tam, 1):
    ys, xs = np.where(lab == i)
    if t > 8000 and ys.min() < y_mesa - 100:
        jugadores_ids.append((xs.mean(), i))
jugadores_ids = [i for _, i in sorted(jugadores_ids)][:2]
print('jugadores encontrados:', len(jugadores_ids))

def buscar_cara(m):
    """La cabeza es lo más alto de la silueta; termina donde los hombros la ensanchan."""
    filas = np.where(m.any(axis=1))[0]
    y0 = filas[0]
    anchos = []
    for y in range(y0, min(y0 + 260, filas[-1])):
        xs = np.where(m[y])[0]
        anchos.append((y, xs.min(), xs.max()))
    base = np.median([a[2] - a[1] for a in anchos[10:60]])
    fin = next((a for a in anchos[60:] if (a[2] - a[1]) > base * 1.45), anchos[-1])
    cabeza = [a for a in anchos if a[0] < fin[0] - 6]
    x0 = int(np.median([a[1] for a in cabeza[len(cabeza) // 3:]]))
    x1 = int(np.median([a[2] for a in cabeza[len(cabeza) // 3:]]))
    alto = fin[0] - y0
    return [x0 + 2, int(y0 + alto * 0.2), x1 - x0 - 4, int(alto * 0.78)]

dorso = (b > r + 4) & (b > 70)                 # reverso azulado de las cartas
orilla = (v > 175) & (sat < 45)                # orilla blanca de las cartas
jugadores = []
todos = np.zeros((H, W), bool)
for k, i in enumerate(jugadores_ids):
    m = lab == i
    ys, xs = np.where(m)
    # las cartas que sostiene: entre sus manos, arriba de la mesa
    zona = (yy > y_mesa - 170) & (yy < y_mesa + 10) & (xx > xs.min()) & (xx < xs.max())
    cand = nd.binary_opening((dorso | orilla) & zona & ~m, iterations=1)
    lc, nc = nd.label(cand)
    cerca = nd.binary_dilation(m, iterations=8)
    cartas = np.zeros_like(m)
    for j in range(1, nc + 1):
        cj = lc == j
        if cj.sum() > 120 and (cj & cerca).any():
            cartas |= cj
    if cartas.any():
        pts = np.column_stack(np.where(cartas))[:, ::-1].astype(np.int32)
        casco = np.zeros((H, W), np.uint8)
        cv2.fillPoly(casco, [cv2.convexHull(pts)], 1)
        cartas = casco.astype(bool)
    figura = nd.binary_fill_holes(nd.binary_closing(m | cartas, iterations=2))
    figura &= yy <= y_mesa + 90                     # de la mesa para abajo ya no es el jugador
    todos |= figura
    ys, xs = np.where(figura)
    caja = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
    a = np.clip(np.maximum(alfa * m, cartas.astype(float)), 0, 1)
    a = np.array(Image.fromarray((a * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.6)))
    Image.fromarray(np.dstack([rgb.astype('uint8'), a]), 'RGBA').crop(caja).save(f'{carpeta}/jugador{k}.png')
    jugadores.append({'caja': caja, 'cara': caras_manual[k] if caras_manual else buscar_cara(m & (xx >= caja[0]) & (xx <= caja[2]))})
    print('jugador', k, jugadores[-1])

# ---------- 2. Qué hay que quitar de la mesa ----------
protegido = nd.binary_dilation(todos, iterations=4)
otras = persona & mesa & ~protegido            # la mano que sostenía cartas en primer plano
if tipo == 'madera':
    objeto = (v > 198) & (sat < 48) | (r - b > 88) & (sat > 85) | (r - g > 55) & (r > 110) | dorso
elif tipo == 'fieltro':
    verde = (g > r + 8) & (g >= b)
    # el paño: la zona verde completa (con los huecos de las cartas); la madera de alrededor se queda
    pano = nd.binary_closing(verde & mesa, iterations=6)
    lp, npn = nd.label(pano); tp = nd.sum(pano, lp, range(1, npn + 1))
    pano = lp == (np.argmax(tp) + 1)
    pts = np.column_stack(np.where(pano))[:, ::-1].astype(np.int32)
    casco = np.zeros((H, W), np.uint8); cv2.fillPoly(casco, [cv2.convexHull(pts)], 1)
    pano = casco.astype(bool) & nd.binary_dilation(pano, iterations=30)
    objeto = pano & ~verde & (v > 60)
else:  # plastico: mesa blanca, las cartas también son blancas -> se toma lo impreso y se cierra
    objeto = (sat > 38) | (v < 150) | dorso
# El abanico de la foto (abajo al centro): siempre se quita; en el juego ahí va TU mano
abanico_foto = np.zeros((H, W), np.uint8)
cv2.fillPoly(abanico_foto, [np.array([[178, 905], [245, 752], [478, 760], [482, H], [228, H]], np.int32)], 1)
objeto = (objeto | otras | abanico_foto.astype(bool)) & mesa & ~protegido
objeto = nd.binary_closing(objeto, iterations=9 if tipo == 'plastico' else 3)
objeto = nd.binary_fill_holes(objeto)
lo, no = nd.label(objeto)
to = nd.sum(objeto, lo, range(1, no + 1))
objeto = np.isin(lo, [i + 1 for i, t in enumerate(to) if t > 30])
objeto = nd.binary_dilation(objeto, iterations=6 if tipo == 'plastico' else 5) & ~protegido & mesa

# ---------- 3. Rellenar con textura de la misma mesa ----------
y0 = y_mesa + 6
zona = np.array(img)[y0:].copy()
mascara = (255 - objeto[y0:] * 255).astype(np.uint8)       # xphoto: 0 = hueco
limpia = np.zeros_like(zona)
cv2.xphoto.inpaint(zona, mascara, limpia, cv2.xphoto.INPAINT_SHIFTMAP)
# costuras suaves
suave = cv2.GaussianBlur(limpia, (0, 0), 1.1)
borde = nd.binary_dilation(objeto[y0:], iterations=2) & ~nd.binary_erosion(objeto[y0:], iterations=2)
limpia[borde] = suave[borde]
plato = np.array(img).copy()
plato[y0:] = limpia
# Mesas lisas (fieltro / plástico): se vuelve a pintar la superficie completa con
# la luz original de la foto + textura fina, así no quedan manchas de las cartas.
if tipo in ('fieltro', 'plastico'):
    if tipo == 'fieltro':
        superficie_color = (g > r + 8) & (g >= b) & (v > 40)
    else:
        superficie_color = (v > 175) & (sat < 30)
    sup = nd.binary_closing(superficie_color & mesa, iterations=8)
    ls, ns = nd.label(sup); ts = nd.sum(sup, ls, range(1, ns + 1))
    sup = ls == (np.argmax(ts) + 1)
    pts = np.column_stack(np.where(sup))[:, ::-1].astype(np.int32)
    casco = np.zeros((H, W), np.uint8); cv2.fillPoly(casco, [cv2.convexHull(pts)], 1)
    region = casco.astype(bool) & mesa & ~protegido
    if tipo == 'plastico':
        region &= yy < y_mesa + 340          # la orilla de enfrente de la mesa se queda
    # en plástico las cartas también son blancas: sirven para medir la luz
    limpio_px = superficie_color & region & (~objeto if tipo == 'fieltro' else True)
    if tipo == 'plastico':
        plato = np.array(img).copy()      # se parte de la foto original (sin relleno de textura)
    base = rgb.astype(float) * limpio_px[..., None]
    def luz_con(sigma):
        peso = cv2.GaussianBlur(limpio_px.astype(float), (0, 0), sigma)[..., None]
        return cv2.GaussianBlur(base, (0, 0), sigma) / (peso + 1e-6), peso
    luz, peso = luz_con(22)
    luz_lejos, _ = luz_con(80)
    luz = np.where(peso > 0.15, luz, luz_lejos)
    rng = np.random.default_rng(3)
    ruido = cv2.GaussianBlur(rng.normal(0, 7 if tipo == 'fieltro' else 3, (H, W)), (0, 0), 0.8)[..., None]
    nueva = np.clip(luz + ruido, 0, 255)
    alfa_r = cv2.GaussianBlur(region.astype(float), (0, 0), 2)[..., None]
    plato = (plato * (1 - alfa_r) + nueva * alfa_r).astype(np.uint8)
    if tipo == 'plastico':   # lo que queda del abanico de la foto (tapado después por tu mano)
        resto = (abanico_foto.astype(bool) | objeto) & ~region
        plato = cv2.inpaint(plato, nd.binary_dilation(resto, iterations=3).astype(np.uint8) * 255, 7, cv2.INPAINT_TELEA)

Image.fromarray(plato).save(f'{carpeta}/escena.jpg', quality=90)
Image.fromarray(plato).resize((W // 6, H // 6)).filter(ImageFilter.GaussianBlur(3)).save(f'{carpeta}/lados.jpg', quality=80)
json.dump({'nombre': nombre.replace('-', ' ').capitalize(), 'orden': 9, 'luzCara': 'brightness(.95)',
           'ancho': W, 'alto': H, 'yMesa': y_mesa, 'mesa': tipo, 'jugadores': jugadores},
          open(f'{carpeta}/datos.json', 'w'), indent=1)
print('listo ->', carpeta)
