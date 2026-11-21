/* audio.js – Web Audio API sound effects; music plays through music.js */
(function () {
  'use strict';
  window.Game = window.Game || {};

  var ctx = null;
  var masterGain = null;
  var musicGain = null;
  var sfxGain = null;
  var currentMusic = null;
  var muted = false;
  var initialized = false;

  function init() {
    if (initialized) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.5;
      masterGain.connect(ctx.destination);

      musicGain = ctx.createGain();
      musicGain.gain.value = 0.35;
      musicGain.connect(masterGain);

      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.6;
      sfxGain.connect(masterGain);

      if (Game.music) player = Game.music.createPlayer(ctx, musicGain);
      initialized = true;
    } catch (e) { /* Web Audio not available */ }
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  /* ---- helpers ---- */
  function playNote(freq, type, duration, gain, dest, startTime) {
    if (!ctx) return;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain || 0.3, startTime || ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, (startTime || ctx.currentTime) + duration);
    osc.connect(g);
    g.connect(dest || sfxGain);
    osc.start(startTime || ctx.currentTime);
    osc.stop((startTime || ctx.currentTime) + duration);
  }

  function noise(duration, dest, startTime) {
    if (!ctx) return;
    var bufferSize = ctx.sampleRate * duration;
    var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource();
    src.buffer = buffer;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.15, startTime || ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, (startTime || ctx.currentTime) + duration);
    src.connect(g);
    g.connect(dest || sfxGain);
    src.start(startTime || ctx.currentTime);
  }

  /* ---- SFX ---- */
  function bubble() {
    if (!ctx) return;
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.08);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.15);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(g);
    g.connect(sfxGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  function enemyHit() {
    if (!ctx) return;
    var t = ctx.currentTime;
    playNote(500, 'square', 0.06, 0.3, sfxGain, t);
    playNote(700, 'square', 0.06, 0.3, sfxGain, t + 0.06);
    playNote(900, 'square', 0.08, 0.2, sfxGain, t + 0.12);
  }

  function enemyDefeat() {
    if (!ctx) return;
    var t = ctx.currentTime;
    playNote(400, 'square', 0.05, 0.3, sfxGain, t);
    playNote(600, 'square', 0.05, 0.3, sfxGain, t + 0.05);
    playNote(800, 'square', 0.05, 0.3, sfxGain, t + 0.1);
    playNote(1000, 'triangle', 0.1, 0.25, sfxGain, t + 0.15);
  }

  function damage() {
    if (!ctx) return;
    var t = ctx.currentTime;
    playNote(300, 'sawtooth', 0.08, 0.3, sfxGain, t);
    playNote(200, 'sawtooth', 0.1, 0.3, sfxGain, t + 0.08);
    noise(0.1, sfxGain, t + 0.05);
  }

  function pickup() {
    if (!ctx) return;
    var t = ctx.currentTime;
    playNote(880, 'triangle', 0.08, 0.25, sfxGain, t);
    playNote(1100, 'triangle', 0.08, 0.25, sfxGain, t + 0.08);
    playNote(1320, 'triangle', 0.12, 0.2, sfxGain, t + 0.16);
  }

  function menuSelect() {
    if (!ctx) return;
    playNote(660, 'square', 0.06, 0.15, sfxGain);
  }

  /* Bell arpeggio over a soft marimba echo, landing on an E-piano
     chord with a triangle sparkle. */
  function victoryJingle() {
    if (!ctx || !Game.music) return;
    var t = ctx.currentTime + 0.02;
    var notes = ['C5', 'D5', 'E5', 'G5', 'E5', 'G5', 'C6'];
    var dur = [0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.4];
    var time = t;
    for (var i = 0; i < notes.length; i++) {
      Game.music.voice(ctx, sfxGain, 'bell', notes[i], time, dur[i], 0.9);
      Game.music.voice(ctx, sfxGain, 'marimba', notes[i].replace(/\d/, function (o) { return o - 1; }), time, dur[i], 0.55);
      time += dur[i];
    }
    var end = t + 0.9;
    ['C4', 'E4', 'G4', 'A4'].forEach(function (n) { Game.music.voice(ctx, sfxGain, 'epiano', n, end, 0.5, 0.6); });
    Game.music.voice(ctx, sfxGain, 'bass', 'C3', end, 0.5, 0.7);
    Game.music.drum(ctx, sfxGain, 'tri', end, 0.8);
  }

  function gameOverSfx() {
    if (!ctx) return;
    var t = ctx.currentTime;
    playNote(400, 'sawtooth', 0.2, 0.3, sfxGain, t);
    playNote(350, 'sawtooth', 0.2, 0.3, sfxGain, t + 0.2);
    playNote(300, 'sawtooth', 0.2, 0.3, sfxGain, t + 0.4);
    playNote(200, 'sawtooth', 0.5, 0.3, sfxGain, t + 0.6);
  }

  /* ---- Music (Game.music player, songs in songs.js) ----
     A type ('title', 'bgm') may come in a variant ('moon', 'indoor')
     named after its song; currentMusic() reports the type. */
  var player = null;
  var currentSong = null;

  function startMusic(type, variant) {
    if (!ctx || muted || !player || !Game.songs) { stopMusic(); return; }
    var name = variant && Game.songs[variant] ? variant : type;
    var song = Game.songs[name];
    if (!song) { stopMusic(); return; }
    if (currentMusic === type && currentSong === name) return;
    player.play(song, { name: name });
    currentMusic = type;
    currentSong = name;
  }

  function stopMusic() {
    if (player) player.stop(0.4);
    currentMusic = null;
    currentSong = null;
  }

  function toggleMute() {
    muted = !muted;
    if (masterGain) masterGain.gain.value = muted ? 0 : 0.5;
    if (muted) stopMusic();
  }

  window.Game.audio = {
    init: init,
    resume: resume,
    play: function (name) {
      if (muted || !ctx) return;
      resume();
      switch (name) {
        case 'bubble': bubble(); break;
        case 'enemyHit': enemyHit(); break;
        case 'enemyDefeat': enemyDefeat(); break;
        case 'damage': damage(); break;
        case 'pickup': pickup(); break;
        case 'select': menuSelect(); break;
        case 'victory': victoryJingle(); break;
        case 'gameOver': gameOverSfx(); break;
      }
    },
    startMusic: function (type, variant) {
      resume();
      startMusic(type, variant);
    },
    stopMusic: stopMusic,
    toggleMute: toggleMute,
    isMuted: function () { return muted; },
    currentMusic: function () { return currentMusic; },
  };
})();
