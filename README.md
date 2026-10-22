# drum_seq

Un estudio de bolsillo con máquinas vintage, pensado para el móvil: **dos líneas de bajo estilo TB-303** y una
**caja de ritmos con samples reales** de las máquinas clásicas, con mixer, efectos, modo canción y exportación a WAV.
Es la idea de ReBirth, en el navegador.

## Las máquinas

- **Bass Line 1 y 2**: emulación del TB-303 con el motor de [Open303](https://github.com/RobinSchmidt/Open303)
  portado a Web Audio (AudioWorklet). Filtro resonante, accent y slide auténticos, sobremuestreo 4×.
  - Perillas: Tune, Cutoff, Reso, Env mod, Decay, Accent y onda Saw o Square.
  - Programación como en el original: tocas un paso y luego su nota en el teclado, y el cursor avanza solo.
    Por paso: octava (Down, Mid o Up), Accent, Slide o Rest.
  - Utilidades: Random (generador de líneas acid), desplazar pasos, líneas de ejemplo y borrar.
- **Rhythm Composer**: 9 cajas de ritmos sampleadas del hardware original (TR-808, TR-909, TR-606, TR-707,
  CR-8000, Linn LM-1, LinnDrum LM-2, Oberheim DMX y E-mu SP-12), con 10 sonidos más la fila de acento.
  - Se edita como en las TR: eliges un sonido y sus 16 pasos se encienden y apagan. Una vista general
    muestra todas las pistas.
  - Por sonido: Level, Tune, Decay, Tone, Mute y Solo. El hi-hat cerrado corta al abierto.
- **Mixer**: por máquina, fader, medidor LED, Pan, envío al Delay, Drive (en los bajos), Mute y Solo.
  En el máster: volumen, compresor, delay sincronizado al tempo (de 1/16 a 3/8) con feedback, swing estilo
  MPC y un limitador de seguridad.
- **Song**: 4 escenas (A–D), cada una con su patrón de batería y sus dos líneas de bajo, de 8 a 32 pasos.
  - Encadenas escenas en una canción y la reproduces en modo canción.
  - Si cambias de escena mientras suena, el cambio entra al empezar el siguiente compás, como en el hardware.
  - Exporta 4 compases o la canción completa a WAV. En el móvil abre el menú de compartir.

## Pensado para el móvil

- Una máquina por pantalla y la barra de máquinas abajo, al alcance del pulgar.
- Botones de al menos 44 px, perillas que se arrastran con el dedo (doble toque para volver al valor inicial)
  y vibración al tocar en Android.
- **Tempo:** arrastra la pantalla LED, usa − y + (mantener para repetir) o Tap.
- **Pantalla y sonido:** la pantalla no se apaga mientras suena, y en iOS se oye aunque el interruptor de
  silencio esté activado.
- **Como app:** se instala en la pantalla de inicio y funciona sin conexión, porque los samples quedan en caché
  tras la primera carga.
- **Accesible:** todo se maneja con teclado y lector de pantalla. La barra espaciadora inicia y detiene.

## Uso

Usa módulos JavaScript y un AudioWorklet, así que necesita un servidor (no funciona con doble clic en `index.html`):

```bash
npm start            # o: python3 -m http.server 8000
```

Luego abre <http://localhost:8000>. No hay que instalar dependencias ni compilar.

Para publicarla en GitHub Pages: **Settings → Pages → Deploy from a branch**, elige la rama y la carpeta `/ (root)`.

La primera vez que eliges cada caja de ritmos, sus samples se descargan de `smpldsnds.github.io`.

## Estructura

| Archivo | Qué hace |
|---|---|
| `index.html`, `style.css` | Interfaz |
| `src/main.js` | Estado, transporte, escenas, pestañas y sincronía de la pantalla con el audio |
| `src/rack.js` | Audio: grafo del rack, mixer, efectos, carga de kits y exportación offline |
| `src/plan.js` | Convierte el proyecto en eventos con tiempo exacto (lo usan la reproducción y la exportación) |
| `src/project.js` | Modelo del proyecto, validación de lo guardado y migración desde la versión anterior |
| `src/bass.js` | Pasos del 303: gate, slide, presets y generador aleatorio |
| `src/pattern.js`, `src/kits.js` | Patrones de batería, choke, swing y la librería de máquinas |
| `src/worklets/open303-processor.js` | El motor del 303 (port de Open303) |
| `src/ui/` | Pantallas y la perilla |
| `vendor/` | [smplr](https://github.com/danigb/smplr) 1.1.0 (MIT) y la tipografía Archivo (OFL) |
| `test/` | Tests (`npm test`, runner integrado de Node 18+) |

## Créditos

- Motor del 303: [Open303](https://github.com/RobinSchmidt/Open303) de Robin Schmidt (MIT).
- Samples: [smpldsnds/drum-machines](https://github.com/smpldsnds/drum-machines) (dominio público) y la colección
  [Synth Abuse](https://www.youtube.com/@synthabuse), reproducidos con [smplr](https://github.com/danigb/smplr).
- Tipografía: [Archivo](https://github.com/Omnibus-Type/Archivo) (SIL Open Font License).

Desarrollado por Gustavo Astudillo.
