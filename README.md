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
- **Rhythm Composer**: 15 cajas de ritmos sampleadas del hardware original, con 10 sonidos más la fila de acento:
  - Analógicas y primeras digitales: TR-808, CR-8000, TR-606, TR-909, TR-707, Linn LM-1, LinnDrum LM-2, Oberheim DMX.
  - La era de los samplers: E-mu Drumulator, Oberheim DX, Linn 9000, Sequential DrumTraks, E-mu SP-12, Yamaha RX5
    y Korg DDD-1.
  - **Character** (en las de la era de los samplers): los mismos sonidos grabados de cinco maneras: Dry, Punch
    (comprimido), Room (con sala), 8-bit y Dirt (distorsionado).
  - Se edita como en las TR: eliges un sonido y sus 16 pasos se encienden y apagan. Una vista general
    muestra todas las pistas.
  - Por sonido: Level, Tune, Decay, Tone, Mute y Solo. El hi-hat cerrado corta al abierto.
  - Random arma un groove de house, breakbeat o electro (bombo en el 1, caja o clap en el 2 y el 4), y Mutate lo
    varía sin perder esa base.
- **Mixer**: por máquina, fader, medidor LED, Pan, envíos a Delay y Reverb, Drive (saturación, en bajo, synth y keys), Mute y Solo.
  En el máster: volumen, compresor, reverb, delay sincronizado al tempo (de 1/16 a 1/4 con puntillo) con feedback, swing estilo
  MPC y un limitador de seguridad.
- **Song**: 4 escenas (A–D), cada una con su batería, su línea de bajo, su línea de synth y la de keys, de 8 a 32 pasos.
  - Encadenas escenas en una canción y la reproduces en modo canción.
  - Si cambias de escena mientras suena, el cambio entra al empezar el siguiente compás, como en el hardware.
  - Exporta 4 compases o la canción completa a WAV. En el móvil abre el menú de compartir.

## Generación musical

- **Tonalidad:** en Song eliges tónica y escala (menor, mayor, dórica, frigia, mixolidia o menor armónica).
  Random, Mutate y las líneas de ejemplo la siguen. Cambiar la tónica mueve todas las líneas a la nueva tonalidad.
- **Random** en Bass, Synth, Keys y Drums, con densidad Few, Some o Many:
  - El ritmo se reparte de forma euclidiana, así cada línea tiene siempre la misma cantidad de notas.
  - Se arma un motivo de 8 pasos que se repite con variaciones (A A′ A A″).
  - Las notas avanzan por grados de la escala y la línea termina en la tónica o la quinta del acorde.
  - En Keys, Random elige una progresión conocida (i–VI–III–VII, I–V–vi–IV…) con acordes diatónicos.
- **Una sola armonía:** en los tiempos fuertes, el bajo y el synth tocan notas del acorde que está sonando en Keys.
- **Mutate** (en todas las máquinas): cambia 2 o 3 pasos de la línea actual, sin perder la idea.
- **Transposición por compás:** en Song, cada compás puede llevar su transposición (−12 a +12), como el Track Mode
  del TB-303. Así, con una sola escena, sale una progresión completa. La batería no se transpone.

## Para componer

- **Encender y apagar máquinas:** cada máquina tiene su botón On/Off. Apagada no suena, no gasta CPU en su
  secuencia y no descarga sus samples (útil con datos móviles); su LED se apaga en la barra de abajo.
- **Parameter Locks:** con *Lock knobs*, las perillas guardan valores propios del paso elegido (por ejemplo, un
  Cutoff más abierto solo en el paso 5), como en las Elektron. En Drums se hace con *Edit steps*. Un punto
  amarillo en el paso indica que tiene valores propios.
- **Chance:** cada paso puede sonar el 100, 75, 50 o 25 % de las veces, para patrones menos mecánicos (anillo en
  el paso). La exportación usa siempre la misma secuencia de azar, así un WAV se puede repetir.
- **Pintar pasos:** en Drums, deslizar el dedo de lado sobre los pasos los enciende o apaga de una pasada.

- **Deshacer y rehacer** (↶ ↷ o Ctrl/⌘+Z): cada cambio queda en el historial; un giro de perilla cuenta como uno.
- **Proyectos** (en Song): varios proyectos con nombre, nuevo, duplicar y borrar. **Guardar archivo** y **Abrir archivo**
  (`.drumseq.json`) para respaldarlos o pasarlos a otro equipo.
- **Grabar en vivo** (Rec): con la reproducción en marcha, lo que tocas en el teclado o en los sonidos de batería
  queda en el paso que suena, cuantizado a semicorcheas.
- **Exportar por pistas**: con "As stems", cada máquina sale en su propio WAV (con su delay y reverb, sin el compresor
  general) para terminar el tema en un DAW. Antes de exportar se calcula el tamaño y se avisa si es demasiado
  grande para el dispositivo.

## Pensado para el móvil

- Una máquina por pantalla y la barra de máquinas abajo, al alcance del pulgar.
- Botones de al menos 44 px, perillas que se arrastran con el dedo (doble toque para volver al valor inicial)
  y vibración al tocar en Android.
- **Tempo:** arrastra la pantalla LED, usa − y + (mantener para repetir) o Tap.
- **Pantalla y sonido:** la pantalla no se apaga mientras suena, y en iOS se oye aunque el interruptor de
  silencio esté activado.
- **Como app:** se instala en la pantalla de inicio y funciona sin conexión, porque los samples quedan en caché
  tras la primera carga.
- **Aspecto de equipo real:** chasis de acero con tornillos, aluminio cepillado en el bajo, madera de nogal en el
  Synth y el Keys, teclas marfil y display LED de 7 segmentos.
- **Accesible:** todo se maneja con teclado y lector de pantalla. La barra espaciadora inicia y detiene.

## Cómo está construida

Una aplicación web sin frameworks ni paso de compilación: módulos ES que el navegador carga tal cual, y todo el
sonido generado en el propio dispositivo con la **Web Audio API**.

### Audio
- **AudioWorklet** para los sintetizadores, con el DSP escrito en JavaScript y ejecutado en el hilo de audio:
  - `open303-processor.js`: port del motor C++ de [Open303](https://github.com/RobinSchmidt/Open303), con su filtro
    TB-303, envolventes, accent, slide y sobremuestreo.
  - `va-processor.js`: analógico virtual con osciladores **PolyBLEP** (sin aliasing), filtro **ladder de 4 polos
    TPT/ZDF** con saturación (carácter Moog), envolventes ADSR, glide y 6 voces con robo de la más antigua.
  - Los parámetros se recalculan cada 8 muestras (control rate) y el hilo de audio no reserva memoria al tocar.
- **[smplr](https://github.com/danigb/smplr)** para los instrumentos sampleados: cajas de ritmos (`DrumMachine`,
  `DrumAbuse`), `Mellotron` y `ElectricPiano`. Las muestras quedan en **CacheStorage** y funcionan sin conexión.
- **Nodos nativos** para la mezcla: `GainNode`, `StereoPannerNode` y `WaveShaperNode` (drive con sobremuestreo 4×)
  por canal; `DelayNode` con feedback filtrado (delay de cinta); `ConvolverNode` con un impulso de reverb generado en
  código; chorus estilo Juno con dos `DelayNode` modulados por un `OscillatorNode`; `DynamicsCompressorNode` como
  compresor y limitador, y `AnalyserNode` para los medidores.
- **Sincronía exacta:** `plan.js` es una función pura que convierte el proyecto en eventos con tiempo de audio.
  - En vivo, un secuenciador planifica 400 ms por delante y entrega cada nota al instante a Web Audio o a los
    worklets, así un móvil ocupado no atrasa el ritmo.
  - La pantalla se dibuja con `requestAnimationFrame`, compensando la latencia de salida (Bluetooth).
- **Exportación:** el mismo plan se renderiza en un `OfflineAudioContext` (más rápido que en tiempo real) y se
  guarda como WAV de 16 bits, la mezcla completa o por pistas.

### Interfaz
- HTML semántico y CSS moderno: custom properties, grid, `:has()`, la tipografía variable **Archivo** (eje de ancho)
  y **DSEG7** para el display.
- Los materiales (grano, aluminio cepillado, nogal) son **filtros SVG `feTurbulence`** en data URIs: el navegador los
  dibuja una vez y no se descarga ninguna imagen.
- Perillas, pads y teclado con **Pointer Events**, navegables con teclado y anunciados a lectores de pantalla.

### Plataforma (PWA)
- `manifest.webmanifest` y un **service worker** (`sw.js`) para instalarla y abrirla sin conexión.
- **Screen Wake Lock** para que la pantalla no se apague mientras suena, y `navigator.audioSession` para que en iOS
  se oiga con el interruptor de silencio.
- `navigator.share` para mandar los WAV y los proyectos a otras apps.
- Proyectos, historial y preferencias en `localStorage`; todo lo que entra (guardado o archivo) pasa por
  `normalizeProject`, que valida cada campo.

### Calidad
- **Tests** con el runner nativo de Node (`node --test`, sin dependencias): planificador, modelo, generadores
  musicales y el DSP de ambos worklets (afinación, glide, polifonía, estabilidad y rendimiento).
- Revisión en navegador con **Playwright** en tamaños de iPhone, incluida una prueba de carga que bloquea el hilo
  principal y verifica que ninguna nota llegue tarde.
- **GitHub Actions** corre los tests en cada push y pull request.

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
| `src/pattern.js`, `src/kits.js` | Patrones de batería, choke, swing, la librería de máquinas y sus Character |
| `src/worklets/open303-processor.js` | El motor del 303 (port de Open303) |
| `src/worklets/va-processor.js` | El motor del Synth (analógico virtual) |
| `src/ui/` | Pantallas y la perilla |
| `vendor/` | [smplr](https://github.com/danigb/smplr) 1.1.0 (MIT) y las tipografías Archivo y DSEG7 (OFL) |
| `test/` | Tests (`npm test`, runner integrado de Node 18+) |

## Créditos

- Motor del 303: [Open303](https://github.com/RobinSchmidt/Open303) de Robin Schmidt (MIT).
- Samples de batería: [smpldsnds/drum-machines](https://github.com/smpldsnds/drum-machines) (dominio público) y la
  colección [Synth Abuse](https://www.youtube.com/@synthabuse) (también los Character de las máquinas de la era de
  los samplers).
- Keys:
  - Mellotron: [smpldsnds/archiveorg-mellotron](https://github.com/smpldsnds/archiveorg-mellotron), hecho a partir
    del CD-ROM [Mellotron Archive](https://archive.org/details/mellotron-archive-cd-rom-nki-wav.-7z) de Internet
    Archive (licencia no declarada).
  - Pianos eléctricos de Greg Sullivan:
    [sfzinstruments/GregSullivan.E-Pianos](https://github.com/sfzinstruments/GregSullivan.E-Pianos)
    ([CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)), servidos por
    [smpldsnds](https://github.com/smpldsnds/sfzinstruments-greg-sullivan-e-pianos).
  - TX81Z: [VCSL](https://github.com/sgossner/VCSL) (CC0), servido por
    [smpldsnds](https://github.com/smpldsnds/sgossner-vcsl).
- Todo se reproduce con [smplr](https://github.com/danigb/smplr).
- Tipografías: [Archivo](https://github.com/Omnibus-Type/Archivo) y [DSEG](https://github.com/keshikan/DSEG) de keshikan (SIL Open Font License).

El detalle de cada componente y su licencia está en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Licencia

El código de drum_seq se publica bajo licencia [MIT](LICENSE). Los motores, tipografías y sonidos de terceros
conservan sus propias licencias.

Desarrollado por Gustavo Astudillo.
