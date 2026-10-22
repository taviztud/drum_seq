# drum_seq

Secuenciador de batería para el navegador, con **samples reales de cajas de ritmo clásicas**:
Roland TR-808, TR-909, TR-606, TR-707 y CR-8000, Linn LM-1, LinnDrum LM-2, Oberheim DMX y E-mu SP-12.

## Características

- **9 máquinas clásicas** sampleadas del hardware original, con 10 voces cada una: kick, snare, tom grave y agudo,
  rimshot, clap, cowbell, hi-hat cerrado y abierto, y platillo. Si la máquina original no tenía un sonido, su fila
  aparece tachada.
- **Fila de acento** como en la TR-808: los pasos acentuados suenan más fuerte en todas las voces.
- **Choke de hi-hats**: el hi-hat cerrado corta al abierto, y cada voz corta su propia cola al volver a sonar
  (una voz por canal, como el hardware).
- **Swing** estilo MPC (50 % recto, 66 % tresillo, 75 % shuffle).
- **Por voz:** nivel, afinación (±12 semitonos), decay y tono (filtro), además de mute y solo.
- **4 patrones (A–D)**. Si cambias de patrón mientras suena, el cambio entra al empezar el compás siguiente.
- **De 8 a 32 pasos.** Al cambiar la longitud se conserva lo ya programado.
- **Presets:** Electro, House, Boom bap, Breakbeat y Bossa.
- **Tempo:** de 40 a 300 BPM, con tap tempo.
- **Guardado automático** en el navegador. Los samples quedan en caché y funcionan sin conexión después de la
  primera carga (solo en HTTPS).
- **Teclado:** Espacio inicia y detiene la reproducción, las flechas recorren la grilla y Espacio o Enter activan
  un paso. Haz clic en el nombre de una voz para escucharla y editar su sonido.

## Uso

La app usa módulos JavaScript, así que necesita un servidor (no funciona abriendo `index.html` con doble clic):

```bash
npm start            # o: python3 -m http.server 8000
```

Luego abre <http://localhost:8000>. No hay que instalar nada ni compilar.

Para publicarla gratis en GitHub Pages: en el repositorio, ve a **Settings → Pages → Deploy from a branch**,
elige `main` y la carpeta `/ (root)`.

Los samples se descargan de `smpldsnds.github.io` la primera vez que eliges cada máquina, así que esa primera
carga necesita conexión a internet.

## Estructura

| Archivo | Qué hace |
|---|---|
| `index.html`, `style.css` | Interfaz |
| `src/main.js` | Estado, grilla y controles |
| `src/engine.js` | Audio: carga de kits y reproducción con reloj de muestra exacta |
| `src/pattern.js` | Lógica pura: patrones, choke, swing, presets y validación |
| `src/kits.js` | Librería de máquinas: qué sample usa cada voz |
| `vendor/smplr-1.1.0.mjs` | [smplr](https://github.com/danigb/smplr) (MIT), incluido en el repo para no depender de un CDN |
| `test/` | Tests de la lógica (`npm test`, usa el runner integrado de Node 18+) |

Para añadir una máquina, agrega una entrada en `src/kits.js`. Hay unas 210 disponibles en la colección
DrumAbuse de smplr.

## Créditos

- Motor de samples y secuenciador: [smplr](https://github.com/danigb/smplr) de danigb.
- Samples: [smpldsnds/drum-machines](https://github.com/smpldsnds/drum-machines) (dominio público) y la colección
  [Synth Abuse](https://www.youtube.com/@synthabuse) (packs Drum Abuse).

Desarrollado por Gustavo Astudillo.
