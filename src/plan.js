// Turns the project into timed events, one 16th step at a time. Pure: used by live playback
// and by the offline WAV export, so both play exactly the same thing.
import { VOICES, gateSteps, gateSeconds, swingOffset } from './pattern.js';
import { noteStep } from './bass.js';

export const VELOCITY = { normal: 96, accent: 127 };

// The note machines: where each reads its line in a scene, its lowest key, and whether it plays chords.
export const NOTE_TRACKS = {
  bass1: { line: (scene) => scene.bass[0], base: 36, poly: () => false },
  synth: { line: (scene) => scene.synth, base: 48, poly: (project) => project.synth.mode === 'poly' },
  keys: { line: (scene) => scene.keys, base: 48, poly: () => true },
};
const noTracks = (value) => Object.fromEntries(Object.keys(NOTE_TRACKS).map((id) => [id, value()]));

// Where playback is: scene, step inside it, place in the song, its transpose, and notes held by a slide.
export const startCursor = () => ({ pos: -1, scene: -1, songIndex: -1, tr: 0, held: noTracks(() => null) });

/**
 * Move to the next step. A new bar picks its scene: the next song entry in song mode,
 * otherwise the queued scene (if any), as pattern changes on the hardware wait for the bar end.
 */
export function advance(project, cursor, queuedScene = null) {
  const steps = cursor.scene >= 0 ? project.scenes[cursor.scene].steps : 0;
  const barStart = cursor.pos < 0 || cursor.pos + 1 >= steps;
  const next = { ...cursor, held: { ...cursor.held }, barStart };
  if (!barStart) {
    next.pos = cursor.pos + 1;
    return next;
  }
  next.pos = 0;
  if (project.songMode && project.song.length) {
    next.songIndex = (cursor.songIndex + 1) % project.song.length;
    ({ scene: next.scene, tr: next.tr } = project.song[next.songIndex]);
  } else {
    next.scene = queuedScene ?? (cursor.scene >= 0 ? cursor.scene : project.scene);
    next.tr = 0;
  }
  return next;
}

/**
 * Events for the step the cursor points at. `time` is when the step starts (before swing).
 * Returns drum hits, note events per note machine, and the updated held keys.
 */
export function stepEvents(project, cursor, time, stepSec) {
  const scene = project.scenes[cursor.scene];
  const step = cursor.pos;
  const offset = swingOffset(project.swing, stepSec);
  const at = time + (step % 2 ? offset : 0);

  const pattern = { steps: scene.steps, rows: scene.drums };
  const voices = project.drums.voices;
  const soloing = VOICES.some((v) => voices[v.id].solo);
  const plays = (id) => !voices[id].mute && (!soloing || voices[id].solo);
  const drums = [];
  for (const { id } of VOICES) {
    if (!scene.drums[id][step] || !plays(id)) continue;
    const gate = gateSeconds(gateSteps(pattern, id, step, plays), step, stepSec, offset);
    drums.push({ voice: id, time: at, accent: scene.drums.ac[step], gate });
  }

  const held = {};
  const notes = {};
  for (const [id, track] of Object.entries(NOTE_TRACKS)) {
    const result = noteStep(track.line(scene), step, cursor.held[id], { base: track.base + cursor.tr, poly: track.poly(project) });
    held[id] = result.held;
    notes[id] = result.events.map(({ at: steps, ...e }) => ({ ...e, time: at + steps * stepSec }));
  }
  return { drums, notes, held };
}

// Every event of a whole render: `bars` repeats of the current scene, or the song once.
export function planRender(project, { song = false, bars = 4 } = {}) {
  const p = { ...project, songMode: song };
  const sceneList = song ? project.song.map((e) => e.scene) : Array(bars).fill(project.scene);
  const totalSteps = sceneList.reduce((sum, s) => sum + project.scenes[s].steps, 0);
  const stepSec = 60 / project.bpm / 4;
  const forced = song ? null : project.scene;
  let cursor = startCursor();
  const drums = [];
  const notes = noTracks(() => []);
  for (let i = 0; i < totalSteps; i++) {
    cursor = advance(p, cursor, forced);
    const ev = stepEvents(p, cursor, i * stepSec, stepSec);
    cursor.held = ev.held;
    drums.push(...ev.drums);
    for (const id in notes) notes[id].push(...ev.notes[id]);
  }
  // Release anything still held by a slide at the very end.
  for (const [id, key] of Object.entries(cursor.held)) if (key !== null) notes[id].push({ kind: 'off', key, time: totalSteps * stepSec });
  return { drums, notes, duration: totalSteps * stepSec };
}

// Live recording: the step a tap at `now` belongs to. Past the middle of the playing step it goes to the next.
export const recordStep = ({ pos, time }, now, stepSec, steps) => (pos + (now - time > stepSec / 2 ? 1 : 0)) % steps;
