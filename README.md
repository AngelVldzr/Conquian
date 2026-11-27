# 🃏 Conquián con los cuates

Juego de Conquián en línea con baraja española (40 cartas), vista en primera persona y apuestas con monedas de juego. Se juega de 2 a 4 personas.

## Reglas que programamos

- Se reparten **8 cartas** a cada jugador (2 o 3 en la mesa).
- Al inicio, cada quien **le pasa 1 carta al jugador de su derecha**.
- En tu turno volteas una carta del mazo. Puedes usarla en una jugada nueva con cartas de tu mano, o acomodarla en **cualquier jugada de la mesa**, incluso la de otro para complicarle el juego.
- En tu turno también puedes **bajar jugadas que ya traes en la mano** (sin la carta volteada) o acomodar cartas de tu mano en cualquier jugada.
- Si la usas, tiras una carta de tu mano. La carta que tiras se le ofrece a los demás.
- Si nadie la usa, se va a la **pila de descartes**.
- **Jugadas válidas:**
  - **Tercia o cuarta:** cartas del mismo número.
  - **Corrida:** 3 o más cartas seguidas del mismo palo. El 7 se une con la sota (6‑7‑10 sí vale).
- **Recorte:** puedes tomar cartas de TUS jugadas para armar otra, siempre que lo que quede siga siendo tercia o corrida. Ejemplo: tienes abajo 1-1-1-1 y 2-2-2-2 y sale el 3 de oros. Tomas el 1 y el 2 de oros y armas 1-2-3 de oros; te quedan dos tercias y llegas a 9 cartas.
- **Echar:** si la carta que salió entra en la jugada de OTRO (por ejemplo, tiene 3-4-5 de oros y sale el 6 de oros), se la puedes echar. La carta queda en su jugada y él tiene que **pagar** (tirar una carta). Lo que pague se le ofrece primero al jugador de SU derecha, aunque ya haya pasado.
- **Pagar echando:** cuando te toca pagar, si la carta que vas a tirar le entra a la jugada de otro, se la puedes echar (las cartas naranjas). Él tiene que pagar después.
- Fuera de eso, las cartas de tu mano solo se acomodan en tus propias jugadas.
- **Regla opcional (callejera):** al crear la mesa se puede activar. Si alguien baja tercia de 1 o de 12, todos votan; si **todos** aceptan, cada quien pone otra apuesta al bote.
- **Gana quien junta 9 cartas en la mesa** y se lleva el bote.
- Si alguien ya tiene sus 8 en la mesa y le **echas** la carta que le falta, junta 9 y **gana él** (es la suerte). Si bajas todo al pagar sin juntar 9, ya no pagas y esperas tu carta.
- **Ganar sin pagar:** si ya traes en la mano la jugada que te falta, la puedes bajar en cualquier momento de tu turno (antes de voltear, al decidir o cuando te toca pagar). Si con eso juntas tus 9 cartas, ganas sin tirar ninguna. El botón **🏆 Bajar y ganar** aparece solo.
- Si se acaba el mazo, es empate y el bote se acumula.
- **4º jugador:** espera sin cartas. Cuando se juntan 8 descartes, esas son su mano y entra a jugar normal. Cada mano rota quién espera.
- Las cartas con borde naranja en una jugada son las que acomodó otro jugador.

## Detalles de la vista

- **Escenas de foto real:** el sitio de taxis, el mercado y la cantina son fotos. La mesa es la de la foto (huacales, mesa de plástico o paño verde), ya sin las cartas que traía.
- **Tus amigos son los jugadores de la foto:** cada quien se sienta en un lugar de la foto. Si sube su selfie, su cara se pone encima de la del jugador. Con 4 jugadores, el tercer rival se sienta un poco más atrás, entre los dos.
- **Baraja clásica:** las 40 cartas salen de la foto "Spanish deck Fournier" (Wikimedia Commons), enderezadas, sin las marcas del fabricante y con el número grande en las esquinas (`public/baraja/`). Para regenerarlas: `python herramientas/preparar_baraja.py foto.jpg`.
- **Monedas de $10** (anillo dorado, centro plateado) apiladas en el bote; se dibujan con `herramientas/hacer_moneda.py`.
- **Movimiento:** al repartir vuelan las cartas a cada jugador; todos ponen su apuesta y las monedas caen al montón del bote; las cartas vuelan del mazo, de la mano de los rivales y de la tuya a la mesa; el que gana recoge las monedas.
- **Tu mano real:** tus cartas salen de tu mano; el pulgar va enfrente de las cartas y los dedos detrás (`public/manos/`). Puedes arrastrar cartas para reacomodarlas.
- **Celular y PC:** en celular la foto ocupa todo el ancho. En PC la foto va al centro, con los lados desenfocados y los botones a los costados.

## Cómo se juega en la pantalla

- **Bajar de una vez:** si traes una tercia o corrida completa en la mano, aparece el botón **⬇️ Bajar mi corrida/tercia**.
- **Bandeja de jugadas:** en tu turno aparece una bandeja. Arrastra o toca cartas para meterlas.
  - Cuando sale una carta para ti, ya viene puesta en tu bandeja; si no la quieres, tócala para sacarla.
  - Presiona **Bajar jugada**. Si no es tercia ni corrida, las cartas regresan a tu mano.
- **Acomodar:** arrastra una carta directo sobre una jugada de la mesa (tuya o de otro). Si no entra, regresa volando.
- **Tirar:** toca la carta y **Tirar**, o arrástrala a los descartes.
- **Aviso de turno:** un letrero que late te dice cuándo te toca voltear, decidir o pagar, y al pagar sale "✅ Ya pagaste". En el cambio inicial sale "✅ Ya elegiste" y la carta dice para quién es.
- **Marcador:** cuántas cartas llevas en la mesa de las 9 (y las de cada rival).
- **Jugadas de cada quien:** las de cada rival salen en un cuadro arriba de su nombre; las tuyas, en la mesa entre el mazo y los descartes ("Tus jugadas").
- **Chat:** en celular, el botón 💬 de arriba abre el chat (con frases rápidas como "🏁 ¿Cerramos?"); el número rojo son los mensajes sin leer. En PC el chat está siempre a la derecha. Cuando alguien escribe, le sale un globito arriba de la cabeza unos segundos. Los mensajes solo los ve la mesa y se borran cuando se cierra.
- **Pistas doradas:** las cartas de tu mano que pueden formar o completar una jugada brillan.
- **Ordenar (celular y PC):** el botón junto a tu mano acomoda tus cartas: el 1er toque **por palo**, el 2º **por posibles jugadas** (primero tercias y corridas completas, luego las que casi lo son).
- **Menú ☰** (en celular solo el ícono): escenario, cambiar tu cara e historial de la mano.

## Créditos y cuentas al final

- Al entrar, **cada quien escribe con cuánto entra** (1 crédito = $1; hay atajos de $50 a $1000).
- En el menú ☰, el anfitrión tiene **🏁 Cerrar mesa y hacer cuentas**:
  - Si hay una mano en juego, se anula y el bote de los empates se regresa a quien lo puso.
  - Sale una tabla con cuánto ganó o perdió cada quien, y **quién le paga a quién** con el mínimo de pagos (ej. "Pedro le paga a Juan 40 créditos = $40").
  - Con **📋 Copiar / compartir** mandas las cuentas por WhatsApp.
- El juego **no mueve dinero**: solo hace la cuenta. Si se quieren pagar, es entre ustedes.

## 1. Qué instalar

1. **Node.js LTS** → https://nodejs.org
2. **VS Code** y **Git** (ya los tienes).

## 2. Probarlo en tu compu

```bash
cd conquian
npm install      # descarga express y socket.io
npm start        # arranca el servidor
```

Abre `http://localhost:3000` en **varias pestañas o navegadores** para simular a varios jugadores.

Si quieres revisar que las reglas no se traban, corre `npm test`. Juega 3,000 manos con bots.

## 3. Publicarlo en internet con HTTPS (Render, gratis)

1. **Sube el proyecto a GitHub** (desde la carpeta del juego, en PowerShell):
   ```powershell
   git init
   git add .
   git commit -m "Conquián"
   git branch -M main
   git remote add origin https://github.com/AngelVldzr/conquian.git
   git push -u origin main
   ```
   (Antes, crea el repositorio vacío `conquian` en github.com.)
2. Entra a **https://render.com** → *New* → **Blueprint** → elige tu repositorio. Render lee el archivo `render.yaml` y configura todo solo: `npm install`, `npm start` y `NODE_ENV=production`.
3. En 2 o 3 minutos te da una dirección como **`https://conquian.onrender.com`**. Ya viene con **HTTPS** (candado), y así la cámara para las selfies funciona en el celular.
4. Cada vez que hagas `git push`, Render vuelve a publicar solo.

> El plan gratis "se duerme" tras ~15 min sin uso; la primera visita tarda ~50 s en despertar.
> ¿Dominio propio? Agrégalo en Render (*Settings → Custom Domain*) y en la variable `ALLOWED_ORIGINS`.

## 4. Agregar un escenario nuevo

Necesitas una foto **vertical** (como las de referencia, ~684×1024) con **dos personas sentadas a una mesa** y la mesa al frente. Las cartas que haya en la mesa se borran solas.

```bash
pip install rembg onnxruntime opencv-contrib-python scipy pillow
python herramientas/preparar_escena.py mi-foto.png patio 610 madera
```

- `patio`: nombre de la carpeta del escenario. Se crea en `public/escenarios/patio/`.
- `610`: altura en píxeles donde empieza la mesa en la foto.
- `madera`: tipo de mesa. Puede ser `madera`, `plastico` o `fieltro`.
- Si la cara no queda bien ubicada, pásala a mano. Cada cara va como `x,y,ancho,alto`, y las dos se separan con `;`:
  `CARAS="122,300,102,108;518,300,90,104" python herramientas/preparar_escena.py ...`

En `datos.json` de esa carpeta puedes cambiar el `nombre` que sale en el menú.

**Poses (movimiento de los jugadores):** con otra foto del mismo lugar donde un jugador hace algo:

```bash
python herramientas/agregar_pose.py foto.jpg taxis 1 gana
```

- `taxis`: el escenario.
- `1`: el jugador (`0` el de la izquierda, `1` el de la derecha).
- `gana` (festeja cuando gana) o `baja` (pone cartas en la mesa).

La herramienta alinea la foto con la original, recorta al jugador y ubica su cara para la selfie. Ya vienen las 12 poses de los tres escenarios.

## Estructura

```
server.js                     → servidor, salas, monedas y bote
game/conquian.js              → reglas del juego (el "crupier")
public/index.html             → la página
public/app.js                 → vista en primera persona, arrastrar y clics
public/cartas.js              → baraja española dibujada en vector
public/escenarios.js          → escenarios y gente que pasa
public/escenarios/<lugar>/    → foto, jugadores recortados y datos de cada lugar
public/manos/                 → tu mano y tu pulgar (fotos recortadas)
herramientas/preparar_escena.py → convierte una foto en escenario
test/simular.js               → pruebas con bots
```

## Seguridad

Lee `SEGURIDAD.md`: qué protege la app y cómo mantenerla segura.
