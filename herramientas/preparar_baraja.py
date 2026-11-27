"""
Recorta una foto de la baraja española completa (40 cartas en 4 filas: oros, espadas, copas, bastos;
cada fila del 1 al 7 y sota, caballo, rey) sobre un fondo verde, y genera public/baraja/<palo>-<n>.jpg.
Uso:  python3 herramientas/preparar_baraja.py foto_baraja.jpg
Endereza cada carta, quita las marcas del fabricante y pone el número grande en las esquinas.
(Si tu foto es otra, revisa las zonas de TEXTOS: están pensadas para la baraja Fournier.)
"""
import numpy as np, cv2, sys
from PIL import Image, ImageDraw, ImageFilter
import os; F=sys.argv[1]; os.makedirs('crudas', exist_ok=True)
img=cv2.imread(F); H,W=img.shape[:2]
hsv=cv2.cvtColor(img,cv2.COLOR_BGR2HSV)
verde=((hsv[...,0]>50)&(hsv[...,0]<100)&(hsv[...,1]>60)).astype(np.uint8)
carta=((1-verde)*255).astype(np.uint8)
carta=cv2.morphologyEx(carta,cv2.MORPH_OPEN,np.ones((5,5),np.uint8))
carta=cv2.morphologyEx(carta,cv2.MORPH_CLOSE,np.ones((9,9),np.uint8))
# rellenar huecos interiores
cs,_=cv2.findContours(carta,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
lleno=np.zeros_like(carta); cv2.drawContours(lleno,cs,-1,255,-1)
E=15
er=cv2.erode(lleno,np.ones((2*E+1,2*E+1),np.uint8))
cs,_=cv2.findContours(er,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
rects=[]
for c in cs:
    if cv2.contourArea(c)<15000: continue
    (cx,cy),(w,h),ang=cv2.minAreaRect(c)
    rects.append(((cx,cy),(w+2*E,h+2*E),ang))
print('cartas',len(rects))
if len(rects)!=40:
    for r in rects: print([round(v) for v in (*r[0],*r[1],r[2])])
    sys.exit()
rects.sort(key=lambda r:r[0][1])
filas=[sorted(rects[i*10:(i+1)*10],key=lambda r:r[0][0]) for i in range(4)]
palos=['oros','espadas','copas','bastos']; nums=[1,2,3,4,5,6,7,10,11,12]
OW,OH=360,560
for p,fila in zip(palos,filas):
    for n,r in zip(nums,fila):
        box=cv2.boxPoints(r)
        # ordenar esquinas: arriba-izq, arriba-der, abajo-der, abajo-izq (carta vertical)
        s=box.sum(1); d=np.diff(box,axis=1).ravel()
        tl=box[np.argmin(s)]; br=box[np.argmax(s)]; tr=box[np.argmin(d)]; bl=box[np.argmax(d)]
        src=np.float32([tl,tr,br,bl]); dst=np.float32([[0,0],[OW,0],[OW,OH],[0,OH]])
        M=cv2.getPerspectiveTransform(src,dst)
        out=cv2.warpPerspective(img,M,(OW,OH),flags=cv2.INTER_CUBIC,borderMode=cv2.BORDER_REPLICATE)
        cv2.imwrite(f'crudas/{p}-{n}.png',out)
print('ok')
from PIL import Image, ImageDraw, ImageFont
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'baraja')
P=['oros','espadas','copas','bastos']; N=[1,2,3,4,5,6,7,10,11,12]
W,H=360,560
PAPEL=np.array([247,246,241],float)
FUENTE=ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf',52)
FUENTE2=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerifCondensed-Bold.ttf',40)

# Marcas de Fournier que se borran (texto sobre papel): carta -> [(x0,y0,x1,y1, modo)]
# modo 'todo' = todo lo que no sea papel; 'gris' = solo tinta gris (hay dibujo cerca)
TEXTOS = {
  'oros-4': [(55, 205, 305, 338, 'todo')],
  'espadas-2': [(150, 128, 222, 372, 'todo'), (165, 360, 205, 394, 'todo')],
  'espadas-4': [(80, 248, 272, 302, 'todo')],
  'espadas-5': [(108, 26, 258, 114, 'todo'), (138, 446, 228, 484, 'todo')],
  'copas-4': [(48, 228, 312, 316, 'todo')],
  'bastos-2': [(148, 165, 202, 395, 'gris')],
}

def leer(n):
    return np.array(Image.open(f'crudas/{n}.png').convert('RGB')).astype(float)

def balance(a):
    # el papel: claro y sin color
    sat = a.max(2) - a.min(2)
    papel = (a.mean(2) > 150) & (sat < 40)
    papel[:40] = False; papel[-40:] = False; papel[:, :30] = False; papel[:, -30:] = False
    med = np.median(a[papel], axis=0)
    return np.clip(a * (PAPEL / med), 0, 255)

def borrar(a, rect, modo):
    x0, y0, x1, y1 = rect
    zona = a[y0:y1, x0:x1]
    dist = np.sqrt(((zona - PAPEL) ** 2).sum(2))
    sat = zona.max(2) - zona.min(2)
    m = dist > 14
    if modo == 'gris':
        r, g, b = zona[..., 0], zona[..., 1], zona[..., 2]
        m &= (sat < 80) & ~(g > r + 12) & ~(r > g + 45)
    m = cv2.dilate(m.astype(np.uint8), np.ones((5, 5), np.uint8))
    mascara = np.zeros(a.shape[:2], np.uint8)
    mascara[y0:y1, x0:x1] = m * 255
    return cv2.inpaint(np.clip(a, 0, 255).astype(np.uint8), mascara, 4, cv2.INPAINT_TELEA).astype(float)

def borrar_esquinas(a):
    # el número original (chiquito) de las dos esquinas
    for (x0, y0, x1, y1) in [(4, 4, 34, 48), (W - 34, H - 48, W - 4, H - 4), (W - 100, H - 108, W - 27, H - 58), (27, 58, 100, 108)]:
        zona = a[y0:y1, x0:x1]
        m = (np.sqrt(((zona - PAPEL) ** 2).sum(2)) > 30).astype(np.uint8)
        mascara = np.zeros(a.shape[:2], np.uint8); mascara[y0:y1, x0:x1] = cv2.dilate(m, np.ones((3, 3), np.uint8)) * 255
        a = cv2.inpaint(np.clip(a, 0, 255).astype(np.uint8), mascara, 3, cv2.INPAINT_TELEA).astype(float)
    return a

def as_de_oros():
    # Sin la marca de Fournier: un oro grande, tomado del 2 de oros
    a = balance(leer('oros-2'))
    moneda = a[65:265, 80:280].copy()        # la moneda de arriba
    lienzo = a.copy()
    lienzo[34:526, 34:326] = PAPEL           # se vacía el centro (el marco se queda)
    m = np.zeros(moneda.shape[:2], np.uint8)
    cv2.circle(m, (100, 100), 90, 255, -1)
    m = cv2.GaussianBlur(m, (5, 5), 0)
    esc = 1.62
    mg = cv2.resize(moneda, None, fx=esc, fy=esc, interpolation=cv2.INTER_CUBIC)
    mm = cv2.resize(m, None, fx=esc, fy=esc, interpolation=cv2.INTER_CUBIC)[..., None] / 255.0
    h, w = mm.shape[:2]
    y0, x0 = H // 2 - h // 2, W // 2 - w // 2
    lienzo[y0:y0 + h, x0:x0 + w] = lienzo[y0:y0 + h, x0:x0 + w] * (1 - mm) + mg * mm
    return lienzo

def indice(img, num):
    # número grande y claro en las dos esquinas (como las barajas de casino)
    d = ImageDraw.Draw(img)
    txt = str(num)
    f = FUENTE if num < 10 else FUENTE2
    caja = d.textbbox((0, 0), txt, font=f)
    tw, th = caja[2] - caja[0], caja[3] - caja[1]
    for girar in (False, True):
        capa = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        dc = ImageDraw.Draw(capa)
        pw, ph = (70, 72) if num < 10 else (86, 74)
        dc.rounded_rectangle((0, 0, pw, ph), radius=14, fill=tuple(int(v) for v in PAPEL) + (255,))
        dc.text(((pw - tw) / 2 - caja[0], (ph - th) / 2 - caja[1] - 1), txt, font=f, fill=(25, 25, 30, 255))
        if girar: capa = capa.rotate(180)
        img.alpha_composite(capa)
    return img

def esquinas_redondas(img):
    # fuera de las esquinas redondas se pinta papel (en el juego CSS también las redondea)
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, W - 1, H - 1), radius=24, fill=255)
    fondo = Image.new('RGBA', (W, H), tuple(int(v) for v in PAPEL) + (255,))
    return Image.composite(img, fondo, m)

for p in P:
    for n in N:
        nombre = f'{p}-{n}'
        a = as_de_oros() if nombre == 'oros-1' else balance(leer(nombre))
        for (*rect, modo) in TEXTOS.get(nombre, []):
            a = borrar(a, rect, modo)
        a = borrar_esquinas(a)
        # se recortan 3 px de orilla (restos del fieltro) y se vuelve al tamaño
        a = cv2.resize(a[3:-3, 3:-3], (W, H), interpolation=cv2.INTER_CUBIC)
        img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert('RGBA')
        img = indice(img, n)
        img = esquinas_redondas(img).convert('RGB')
        img.save(f'{OUT}/{nombre}.jpg', quality=88, optimize=True)
print('listo')
