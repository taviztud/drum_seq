import { SCENES, MAX_SONG_LENGTH, createScene, copyScene, resizeScene } from '../project.js';
import { STEP_OPTIONS } from '../pattern.js';
import { NOTE_NAMES } from '../bass.js';
import { SCALE_NAMES, transposeLine } from '../generate.js';

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const rootName = (n) => NOTE_NAMES[((n % 12) + 12) % 12];

export function createSongView(root, app) {
  root.classList.add('console', 'song');
  root.innerHTML = `
    <header class="plate-head"><h2 class="logo">Song</h2></header>
    <section class="panel">
      <h3>Key</h3>
      <p class="hint">Random, Mutate and the example lines follow the key. Changing the root moves every line with it.</p>
      <div class="row">
        <label class="field">Root <select data-root>${NOTE_NAMES.slice(0, 12).map((n, i) => `<option value="${i}">${n}</option>`).join('')}</select></label>
        <label class="field">Scale <select data-scale>${Object.entries(SCALE_NAMES).map(([id, name]) => `<option value="${id}">${name}</option>`).join('')}</select></label>
      </div>
    </section>
    <section class="panel">
      <div class="row between">
        <h3 id="song-title">Arrangement</h3>
        <label class="switch"><input type="checkbox" data-songmode><span>Play the song</span></label>
      </div>
      <p class="hint">Each block is one bar of a scene. Tap a block to change its scene or transpose it, like the 303's track mode; hold it to remove it.</p>
      <ol class="chain" aria-labelledby="song-title"></ol>
      <div class="bar-edit" hidden>
        <div class="field"><span class="field-label" id="bar-label">Bar <span data-bar-num></span></span>
          <div class="seg" role="group" aria-labelledby="bar-label">${SCENES.map((s, i) => `<button type="button" data-bar-scene="${i}">${s}</button>`).join('')}</div>
        </div>
        <div class="length-row"><span class="field-label" id="tr-label">Transpose</span>
          <button type="button" data-tr="-1" aria-label="Down a semitone">−</button>
          <output aria-labelledby="tr-label"></output>
          <button type="button" data-tr="1" aria-label="Up a semitone">+</button>
        </div>
      </div>
      <div class="row add-row" role="group" aria-label="Add a bar">
        ${SCENES.map((s, i) => `<button type="button" data-add="${i}">+ ${s}</button>`).join('')}
        <button type="button" data-clear-song>Clear</button>
      </div>
    </section>
    <section class="panel">
      <h3>Scene <span class="scene-name"></span></h3>
      <div class="row">
        <label class="field">Length
          <select data-steps>${STEP_OPTIONS.map((n) => `<option value="${n}">${n} steps</option>`).join('')}</select>
        </label>
        <div class="field"><span class="field-label" id="copy-label">Copy to</span>
          <div class="seg" role="group" aria-labelledby="copy-label">${SCENES.map((s, i) => `<button type="button" data-copy="${i}">${s}</button>`).join('')}</div>
        </div>
        <button type="button" data-clear-scene>Clear scene</button>
      </div>
    </section>
    <section class="panel">
      <h3>Export</h3>
      <p class="hint">Renders a WAV file of the mix, with the delay tail.</p>
      <div class="row">
        <button type="button" class="primary" data-export="loop">4 bars of this scene</button>
        <button type="button" class="primary" data-export="song">The song</button>
      </div>
      <p class="export-status" role="status"></p>
    </section>
    <footer class="credits">
      <p>Bass voices: <a href="https://github.com/RobinSchmidt/Open303">Open303</a> by Robin Schmidt (MIT), ported to Web Audio.
      Drum samples from <a href="https://github.com/smpldsnds">smpldsnds</a> and the <a href="https://www.youtube.com/@synthabuse">Synth Abuse</a> collection,
      Keys: Mellotron tapes from the <a href="https://archive.org/details/mellotron-archive-cd-rom-nki-wav.-7z">Mellotron Archive</a>,
      electric pianos by Greg Sullivan (<a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a>) and the TX81Z from
      <a href="https://github.com/sgossner/VCSL">VCSL</a> (CC0), via smpldsnds.
      Played with <a href="https://github.com/danigb/smplr">smplr</a>. Type: Archivo (OFL).</p>
      <p>By Gustavo Astudillo. <a href="https://github.com/taviztud/drum_seq">Source code on GitHub</a>.</p>
    </footer>`;

  const chain = root.querySelector('.chain');
  const songMode = root.querySelector('[data-songmode]');
  const exportStatus = root.querySelector('.export-status');
  const barEdit = root.querySelector('.bar-edit');
  let bar = null; // the selected bar of the song

  function render() {
    const p = app.project;
    songMode.checked = p.songMode;
    if (bar !== null && bar >= p.song.length) bar = null;
    chain.replaceChildren(...p.song.map(({ scene, tr }, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `block s${scene}`;
      b.classList.toggle('selected', i === bar);
      b.ariaPressed = String(i === bar);
      b.dataset.index = i;
      b.innerHTML = `${SCENES[scene]}${tr ? `<small>${signed(tr)}</small>` : ''}`;
      b.setAttribute('aria-label', `Bar ${i + 1}: scene ${SCENES[scene]}${tr ? `, transposed ${signed(tr)}` : ''}`);
      li.append(b);
      return li;
    }));
    if (!p.song.length) chain.innerHTML = '<li class="empty">No bars yet. Add one below.</li>';
    for (const b of root.querySelectorAll('[data-add]')) b.disabled = p.song.length >= MAX_SONG_LENGTH;
    barEdit.hidden = bar === null;
    if (bar !== null) {
      const { scene, tr } = p.song[bar];
      root.querySelector('[data-bar-num]').textContent = bar + 1;
      for (const b of root.querySelectorAll('[data-bar-scene]')) b.ariaPressed = String(Number(b.dataset.barScene) === scene);
      barEdit.querySelector('output').textContent = `${signed(tr)} · ${rootName(p.key.root + tr)}`;
    }
    root.querySelector('[data-root]').value = p.key.root;
    root.querySelector('[data-scale]').value = p.key.scale;
    root.querySelector('.scene-name').textContent = SCENES[app.sceneIndex()];
    root.querySelector('[data-steps]').value = app.scene().steps;
    for (const b of root.querySelectorAll('[data-copy]')) b.disabled = Number(b.dataset.copy) === app.sceneIndex();
    root.querySelector('[data-export="song"]').disabled = !p.song.length;
  }

  songMode.addEventListener('change', () => { app.project.songMode = songMode.checked; app.changed('song'); });
  root.querySelector('.add-row').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.add) app.project.song.push({ scene: Number(b.dataset.add), tr: 0 });
    else app.project.song = [];
    app.changed('song');
    render();
  });

  // Tap cycles the scene of a bar; a long press removes it.
  let timer = null;
  let removed = false;
  chain.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.block');
    if (!b) return;
    removed = false;
    timer = setTimeout(() => {
      app.project.song.splice(Number(b.dataset.index), 1);
      bar = null;
      removed = true;
      app.haptic(20);
      app.changed('song');
      render();
    }, 550);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) chain.addEventListener(type, () => clearTimeout(timer));
  chain.addEventListener('click', (e) => {
    const b = e.target.closest('.block');
    if (!b || removed) { removed = false; return; } // the long press already removed it
    bar = Number(b.dataset.index) === bar ? null : Number(b.dataset.index);
    render();
  });
  barEdit.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || bar === null) return;
    const entry = app.project.song[bar];
    if (b.dataset.barScene) entry.scene = Number(b.dataset.barScene);
    else entry.tr = Math.min(12, Math.max(-12, entry.tr + Number(b.dataset.tr)));
    app.changed('song');
    render();
  });
  root.querySelector('[data-scale]').addEventListener('change', (e) => { app.project.key.scale = e.target.value; app.changed('song'); });
  // A new root moves every line by the shortest way (at most a tritone), so the music changes key.
  root.querySelector('[data-root]').addEventListener('change', (e) => {
    const key = app.project.key;
    const shift = ((((Number(e.target.value) - key.root) % 12) + 18) % 12) - 6;
    key.root = Number(e.target.value);
    for (const scene of app.project.scenes) {
      scene.bass = scene.bass.map((line) => transposeLine(line, shift));
      scene.synth = transposeLine(scene.synth, shift);
      scene.keys = transposeLine(scene.keys, shift);
    }
    app.changed('structure');
  });
  chain.addEventListener('keydown', (e) => {
    const b = e.target.closest('.block');
    if (!b || (e.key !== 'Delete' && e.key !== 'Backspace')) return;
    app.project.song.splice(Number(b.dataset.index), 1);
    bar = null;
    app.changed('song');
    render();
  });

  root.querySelector('[data-steps]').addEventListener('change', (e) => {
    const i = app.sceneIndex();
    app.project.scenes[i] = resizeScene(app.project.scenes[i], Number(e.target.value));
    app.changed('structure');
  });
  root.querySelector('.seg[aria-labelledby="copy-label"]').addEventListener('click', (e) => {
    const to = e.target.closest('[data-copy]')?.dataset.copy;
    if (to === undefined) return;
    app.project.scenes[Number(to)] = copyScene(app.scene());
    app.changed('structure');
    app.toast(`Scene ${SCENES[app.sceneIndex()]} copied to ${SCENES[to]}`);
  });
  root.querySelector('[data-clear-scene]').addEventListener('click', () => {
    const i = app.sceneIndex();
    app.project.scenes[i] = createScene(app.scene().steps);
    app.changed('structure');
    app.toast(`Scene ${SCENES[i]} cleared`);
  });

  root.querySelector('.panel:has([data-export])').addEventListener('click', async (e) => {
    const kind = e.target.closest('[data-export]')?.dataset.export;
    if (!kind || !app.rack) return;
    const buttons = root.querySelectorAll('[data-export]');
    buttons.forEach((b) => (b.disabled = true));
    try {
      const wav = await app.rack.exportWav(kind === 'song' ? { song: true } : { bars: 4 }, (msg) => (exportStatus.textContent = msg));
      const name = `drum_seq-${kind}-${app.project.bpm}bpm.wav`;
      const file = new File([wav], name, { type: 'audio/wav' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name }).catch(() => {});
      } else {
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: name });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      }
      exportStatus.textContent = `Exported ${name} (${(wav.size / 1e6).toFixed(1)} MB).`;
    } catch (error) {
      console.error(error);
      exportStatus.textContent = `Export failed: ${error.message}`;
    } finally {
      buttons.forEach((b) => (b.disabled = false));
      render();
    }
  });

  return {
    id: 'song',
    render,
    rebuild: render,
    position(songIndex) {
      [...chain.querySelectorAll('.block')].forEach((b, i) => b.classList.toggle('now', app.project.songMode && i === songIndex));
    },
  };
}
