# drum_seq

Un estudio de bolsillo con máquinas vintage, pensado para el móvil: una **línea de bajo estilo TB-303**, un
**sintetizador analógico** (mono tipo Minimoog o poly tipo Juno/Jupiter), **teclados sampleados** (Mellotron y pianos
eléctricos) y una **caja de ritmos con samples reales** de las máquinas clásicas, con mixer, efectos, modo canción y
exportación a WAV.
Es la idea de ReBirth, en el navegador.

## Las máquinas

- **Bass Line**: emulación del TB-303 con el motor de [Open303](https://github.com/RobinSchmidt/Open303)
  portado a Web Audio (AudioWorklet). Filtro resonante, accent y slide auténticos, sobremuestreo 4×.
  - Perillas: Tune, Cutoff, Reso, Env mod, Decay, Accent y onda Saw o Square.
  - Programación como en el original: tocas un paso y luego su nota en el teclado, y el cursor avanza solo.
    Por paso: octava (Down, Mid o Up), Accent, Slide o Rest.
  - Utilidades: Random (generador de líneas acid), desplazar pasos, líneas de ejemplo y borrar.
- **Synth**: analógico virtual propio (AudioWorklet): dos osciladores PolyBLEP con detune, filtro ladder de 4 polos
  estilo Moog y envolventes.
  - Modo **Mono** (Minimoog): sub-oscilador, legato y glide. Modo **Poly** (Juno-106, Jupiter-8): 6 voces y
    chorus Juno I o II.
  - Perillas: Wave, Detune, Cutoff, Emphasis, Contour, Attack, Release y Glide. Presets: Mini lead, Mini bass,
    Juno pad, Juno strings, Jupiter brass y Poly stab.
- **Keys**: capas con samples reales: Mellotron (violines, coro, flauta, metales), Wurlitzer EP200, Yamaha CP80,
  Hohner Pianet T y el piano FM del Yamaha TX81Z.
- **Synth y Keys** se programan igual que el bajo, y además cada paso puede ser un acorde (Maj, Min, 7, m7, Sus)
  y durar de 1 a 16 pasos.
- **Rhythm Composer**: 9 cajas de ritmos sampleadas del hardware original (TR-808, TR-909, TR-606, TR-707,
  CR-8000, Linn LM-1, LinnDrum LM-2, Oberheim DMX y E-mu SP-12), con 10 sonidos más la fila de acento.
  - Se edita como en las TR: eliges un sonido y sus 16 pasos se encienden y apagan. Una vista general
    muestra todas las pistas.
  - Por sonido: Level, Tune, Decay, Tone, Mute y Solo. El hi-hat cerrado corta al abierto.
- **Mixer**: por máquina, fader, medidor LED, Pan, envíos a Delay y Reverb, Drive (en el bajo), Mute y Solo.
  En el máster: volumen, compresor, reverb, delay sincronizado al tempo (de 1/16 a 1/4 con puntillo) con feedback, swing estilo
  MPC y un limitador de seguridad.
- **Song**: 4 escenas (A–D), cada una con su batería, su línea de bajo, su línea de synth y la de keys, de 8 a 32 pasos.
  - Encadenas escenas en una canción y la reproduces en modo canción.
  - Si cambias de escena mientras suena, el cambio entra al empezar el siguiente compás, como en el hardware.
  - Exporta 4 compases o la canción completa a WAV. En el móvil abre el menú de compartir.

## Generación musical

- **Tonalidad:** en Song eliges tónica y escala (menor, mayor, dórica, frigia, mixolidia o menor armónica).
  Random, Mutate y las líneas de ejemplo la siguen. Cambiar la tónica mueve todas las líneas a la nueva tonalidad.
- **Random** en Bass, Synth y Keys, con densidad Few, Some o Many:
  - El ritmo se reparte de forma euclidiana, así cada línea tiene siempre la misma cantidad de notas.
  - Se arma un motivo de 8 pasos que se repite con variaciones (A A′ A A″).
  - Las notas avanzan por grados de la escala y la línea termina en la tónica o la quinta del acorde.
  - En Keys, Random elige una progresión conocida (i–VI–III–VII, I–V–vi–IV…) con acordes diatónicos.
- **Una sola armonía:** en los tiempos fuertes, el bajo y el synth tocan notas del acorde que está sonando en Keys.
- **Mutate:** cambia 2 o 3 pasos de la línea actual, sin perder la idea.
- **Transposición por compás:** en Song, cada compás puede llevar su transposición (−12 a +12), como el Track Mode
  del TB-303. Así, con una sola escena, sale una progresión completa. La batería no se transpone.

## Para componer

- **Deshacer y rehacer** (↶ ↷ o Ctrl/⌘+Z): cada cambio queda en el historial; un giro de perilla cuenta como uno.
- **Proyectos** (en Song): varios proyectos con nombre, nuevo, duplicar y borrar. **Guardar archivo** y **Abrir archivo**
  (`.drumseq.json`) para respaldarlos o pasarlos a otro equipo.
- **Grabar en vivo** (Rec): con la reproducción en marcha, lo que tocas en el teclado o en los sonidos de batería
  queda en el paso que suena, cuantizado a semicorcheas.
- **Exportar por pistas**: con "As stems", cada máquina sale en su propio WAV (con su delay y reverb, sin el compresor
  general) para terminar el tema en un DAW.

## Pensado para el móvil

- Una máquina por pantalla y la barra de máquinas abajo, al alcance del pulgar.
- Botones de al menos 44 px, perillas que se arrastran con el dedo (doble toque para volver al valor inicial)
  y vibración al tocar en Android.
- **Tempo:** arrastra la pantalla LED, usa − y + (mantener para repetir) o Tap.
- **Pantalla y sonido:** la pantalla no se apaga mientras suena, y en iOS se oye aunque el interruptor de
  silencio esté activado.
- **Como app:** se instala en la pantalla de inicio y funciona sin conexión, porque los samples quedan en caché
  tras la primera carga.
- **Aspecto de equipo real:** chasis de acero gastado con tornillos, aluminio cepillado en el bajo, madera de nogal en el
  Synth y el Keys, display LED de 7 segmentos. Todas las texturas se dibujan con filtros SVG, sin descargar imágenes.
- **Accesible:** todo se maneja con teclado y lector de pantalla. La barra espaciadora inicia y detiene.

## Uso

Usa módulos JavaScript y un AudioWorklet, así que necesita un servidor (no funciona con doble clic en `index.html`):

```bash
npm start            # o: python3 -m http.server 8000
```

Luego abre <http://localhost:8000>. No hay que instalar dependencias ni compilar.

Para publicarla en GitHub Pages: **Settings → Pages → Deploy from a branch**, elige la rama y la carpeta `/ (root)`.

La primera vez que eliges cada caja de ritmos o sonido de Keys, sus samples se descargan de `smpldsnds.github.io`.

## Estructura

| Archivo | Qué hace |
|---|---|
| `index.html`, `style.css` | Interfaz |
| `src/main.js` | Estado, transporte, escenas, pestañas y sincronía de la pantalla con el audio |
| `src/rack.js` | Audio: grafo del rack, mixer, efectos, carga de kits y exportación offline |
| `src/plan.js` | Convierte el proyecto en eventos con tiempo exacto (lo usan la reproducción y la exportación) |
| `src/project.js` | Modelo del proyecto, validación de lo guardado y migración desde la versión anterior |
| `src/bass.js` | Pasos de las máquinas de notas: gate, slide, acordes, duración y presets |
| `src/generate.js` | Escalas, Random, Mutate, progresiones y cambios de tonalidad |
| `src/pattern.js`, `src/kits.js` | Patrones de batería, choke, swing y la librería de máquinas |
| `src/worklets/open303-processor.js` | El motor del 303 (port de Open303) |
| `src/worklets/va-processor.js` | El motor del Synth (analógico virtual) |
| `src/ui/` | Pantallas y la perilla |
| `vendor/` | [smplr](https://github.com/danigb/smplr) 1.1.0 (MIT) y las tipografías Archivo y DSEG7 (OFL) |
| `test/` | Tests (`npm test`, runner integrado de Node 18+) |

## Créditos

- Motor del 303: [Open303](https://github.com/RobinSchmidt/Open303) de Robin Schmidt (MIT).
- Samples de batería: [smpldsnds/drum-machines](https://github.com/smpldsnds/drum-machines) (dominio público) y la
  colección [Synth Abuse](https://www.youtube.com/@synthabuse).
- Keys: cintas del Mellotron del [Mellotron Archive](https://archive.org/details/mellotron-archive-cd-rom-nki-wav.-7z)
  (licencia no declarada), pianos eléctricos de Greg Sullivan
  ([CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)) y el TX81Z de [VCSL](https://github.com/sgossner/VCSL)
  (CC0), preparados por [smpldsnds](https://github.com/smpldsnds).
- Todo se reproduce con [smplr](https://github.com/danigb/smplr).
- Tipografías: [Archivo](https://github.com/Omnibus-Type/Archivo) y [DSEG](https://github.com/keshikan/DSEG) de keshikan (SIL Open Font License).

Desarrollado por Gustavo Astudillo.
