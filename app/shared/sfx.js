// Salty Schooner sound — lifted from the sound-effect manager in app/index.html
// (v28) rather than rewritten, since that build is the one that has actually been
// played. Two changes only:
//
//   1. Asset paths are absolute ("/assets/...") — the multiplayer screens live at
//      /tv and /play, so hot-seat's relative "assets/..." would 404 there.
//   2. Exposed as Sfx.play(name) instead of only listening for a DOM event. The
//      'salty-sound-cue' listener is kept too, so cue-emitting code copied from
//      the hot-seat build keeps working unchanged.
//
// Two kinds of cue: FILE cues are real recordings in /assets; SYNTH cues are
// generated with the Web Audio API. An unknown cue name stays silent rather than
// throwing.
//
// Browsers block audio until the user has interacted with the page. Both callers
// satisfy that before any cue fires: /tv has its "Show Game" button, /play is
// driven entirely by taps.
const Sfx = (() => {
  const SFX_VOLUME = 0.55;
  let enabled = true;

  // 'place' cycles three flourishes so repeated card plays don't feel identical.
  // Those clips run ~2.6s and cards land often, so a new place-cue cuts off the
  // previous one instead of stacking into noise.
  const FILE_CUES = {
    place:               ['/assets/sfx-place-1.mp3', '/assets/sfx-place-2.mp3', '/assets/sfx-place-3.mp3'],
    discard:             ['/assets/sfx-discard.mp3'],     // captain's bell — a discard ends the turn
    'jailbreak-trigger': ['/assets/sfx-jailbreak.mp3'],   // drums
    taunt:               ['/assets/sfx-taunt.mp3']        // the spiteful laugh
  };

  const fileClips = {};
  const cueCursor = {};
  let lastPlaceClip = null;
  const haveAudio = typeof Audio !== 'undefined';

  if (haveAudio) {
    Object.entries(FILE_CUES).forEach(([cue, paths]) => {
      fileClips[cue] = paths.map(p => { const a = new Audio(p); a.preload = 'auto'; a.volume = SFX_VOLUME; return a; });
    });
  }

  function playFileCue(cue) {
    const clips = fileClips[cue];
    if (!clips || !clips.length) return;
    cueCursor[cue] = (cueCursor[cue] == null) ? 0 : (cueCursor[cue] + 1) % clips.length;
    if (cue === 'place') {
      if (lastPlaceClip) { try { lastPlaceClip.pause(); lastPlaceClip.currentTime = 0; } catch (e) {} }
      const clip = clips[cueCursor[cue]];
      lastPlaceClip = clip;
      try { clip.currentTime = 0; } catch (e) {}
      clip.volume = SFX_VOLUME;
      const attempt = clip.play();
      if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {});
      return;
    }
    // Rare one-shots: clone so overlaps are fine.
    const base = clips[cueCursor[cue]];
    const clip = base.cloneNode ? base.cloneNode(true) : new Audio(base.src);
    clip.volume = SFX_VOLUME;
    const attempt = clip.play();
    if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {});
  }

  let audioCtx = null;
  function getCtx() {
    if (!audioCtx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) audioCtx = new AC(); }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  }
  function tone(ctx, { freq = 440, type = 'sine', start = 0, dur = 0.1, vol = 0.3, glideTo = null }) {
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol * SFX_VOLUME, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  const SYNTH = {
    select:   ctx => tone(ctx, { freq: 880, type: 'triangle', dur: 0.06, vol: 0.4, glideTo: 1200 }),
    deselect: ctx => tone(ctx, { freq: 520, type: 'triangle', dur: 0.07, vol: 0.36, glideTo: 360 }),
    illegal:  ctx => { tone(ctx, { freq: 150, type: 'square', dur: 0.14, vol: 0.32 }); tone(ctx, { freq: 118, type: 'square', start: 0.09, dur: 0.15, vol: 0.3 }); },
    ui:       ctx => tone(ctx, { freq: 660, type: 'sine', dur: 0.04, vol: 0.28 }),
    // Rising riser under the Brig build-up, cut off as the splash bursts in.
    'jailbreak-buildup': ctx => {
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(60, t0);
      osc.frequency.exponentialRampToValueAtTime(280, t0 + 1.05);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.3 * SFX_VOLUME, t0 + 0.95);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0); osc.stop(t0 + 1.25);
    },
    'jailbreak-success': ctx => [523, 659, 784, 1047].forEach((f, i) => tone(ctx, { freq: f, type: 'triangle', start: i * 0.09, dur: 0.24, vol: 0.4 })),
    'jailbreak-failure': ctx => { [440, 349, 262].forEach((f, i) => tone(ctx, { freq: f, type: 'sawtooth', start: i * 0.13, dur: 0.3, vol: 0.34 })); tone(ctx, { freq: 88, type: 'sine', dur: 0.55, vol: 0.3 }); }
  };

  function play(name) {
    if (!enabled || !name) return;
    if (fileClips[name]) return playFileCue(name);
    if (SYNTH[name]) { const ctx = getCtx(); if (ctx) { try { SYNTH[name](ctx); } catch (e) {} } }
    // unknown cue -> silence
  }

  document.addEventListener('salty-sound-cue', e => {
    const name = e && e.detail && e.detail.name;
    if (name) play(name);
  });

  return {
    play,
    setEnabled(v) { enabled = !!v; },
    isEnabled() { return enabled; }
  };
})();
