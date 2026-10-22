import { SCENES, MAX_SONG_LENGTH, createScene, copyScene, resizeScene } from '../project.js';
import { STEP_OPTIONS } from '../pattern.js';

export function createSongView(root, app) {
  root.classList.add('console', 'song');
  root.innerHTML = `
    <header class="plate-head"><h2 class="logo">Song</h2></header>
    <section class="panel">
      <div class="row between">
        <h3 id="song-title">Arrangement</h3>
        <label class="switch"><input type="checkbox" data-songmode><span>Play the song</span></label>
      </div>
      <p class="hint">Each block is one bar of a scene. Tap a block to change its scene; hold it to remove it.</p>
      <ol class="chain" aria-labelledby="song-title"></ol>
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

  function render() {
    const p = app.project;
    songMode.checked = p.songMode;
    chain.replaceChildren(...p.song.map((scene, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `block s${scene}`;
      b.dataset.index = i;
      b.textContent = SCENES[scene];
      b.setAttribute('aria-label', `Bar ${i + 1}: scene ${SCENES[scene]}`);
      li.append(b);
      return li;
    }));
    if (!p.song.length) chain.innerHTML = '<li class="empty">No bars yet. Add one below.</li>';
    for (const b of root.querySelectorAll('[data-add]')) b.disabled = p.song.length >= MAX_SONG_LENGTH;
    root.querySelector('.scene-name').textContent = SCENES[app.sceneIndex()];
    root.querySelector('[data-steps]').value = app.scene().steps;
    for (const b of root.querySelectorAll('[data-copy]')) b.disabled = Number(b.dataset.copy) === app.sceneIndex();
    root.querySelector('[data-export="song"]').disabled = !p.song.length;
  }

  songMode.addEventListener('change', () => { app.project.songMode = songMode.checked; app.changed('song'); });
  root.querySelector('.add-row').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.add) app.project.song.push(Number(b.dataset.add));
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
    const i = Number(b.dataset.index);
    app.project.song[i] = (app.project.song[i] + 1) % SCENES.length;
    app.changed('song');
    render();
  });
  chain.addEventListener('keydown', (e) => {
    const b = e.target.closest('.block');
    if (!b || (e.key !== 'Delete' && e.key !== 'Backspace')) return;
    app.project.song.splice(Number(b.dataset.index), 1);
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
