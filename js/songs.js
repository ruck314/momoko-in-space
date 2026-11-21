/* songs.js – Momoko in Space music, played by music.js.

   title   "Starlight Waltz": a cosy 3/4 in D major. Theremin melody
           over a sung choir, Rhodes on the off-beats and bell arpeggios
           that join for the middle and the return. A B A', 24 bars.
   bgm     "Moon-Town Stroll": an easy shuffle in F major for walking the
           home planet. Marimba tune with kalimba replies, a flute verse,
           a theremin counter-line, walking upright bass. A A' B A''.
   moon    the same stroll re-dressed for the Cheese Moon: kalimba and
           clarinet, bouncier bass, woodblocks, a touch quicker.
   indoor  the same stroll, softer, for houses, the café and the shop:
           music box, flute and brushes.
   The three strolls share one score (STROLL) so a door or a rocket trip
   changes the colour, not the tune. */
(function () {
  'use strict';
  window.Game = window.Game || {};

  /* ---------- title: Starlight Waltz ---------- */
  var title = {
    bpm: 116, beatsPerBar: 3, level: 1,
    reverb: { size: 2.8 }, delay: { beats: 1.5, feedback: 0.3 },
    tracks: {
      lead:  { inst: 'theremin', vol: 0.62, pan: 0.05, rev: 0.45, dly: 0.2, vib: 24 },
      bells: { inst: 'bell', vol: 0.16, auto: 'arp', pattern: 'up', rate: 0.5, octave: 5, gate: 0.9, rev: 0.5, pan: 0.3 },
      keys:  { inst: 'epiano', vol: 0.34, auto: 'stab', rhythm: '....x...x...', octave: 4, gate: 0.7, rev: 0.3, pan: -0.2 },
      pad:   { inst: 'choir', vol: 0.4, auto: 'pad', octave: 4, rev: 0.5 },
      bass:  { inst: 'bass', vol: 0.5, auto: 'bass', rhythm: 'x...........', octave: 3, gate: 0.85 },
      drums: { vol: 0.42, rev: 0.2 }
    },
    grooves: {
      soft:  { shaker: '....o...o...', tri: 'x.......................' },
      pulse: { kick: 'o...........', shaker: '..o.x.o.x.o.', tri: 'x.......................' }
    },
    sections: {
      A: {
        chords: 'Dmaj7:3 Bm7:3 Gmaj7:3 A7sus4:3 Dmaj7:3 F#m7:3 Gmaj7:3 Gm6:3',
        drums: 'soft', bells: false,
        lead: 'F#5:2 A5:1 | D6:2 C#6:0.5 B5:0.5 | B5:2 A5:0.5 G5:0.5 | A5:3 | ' +
              'F#5:1 A5:1 C#6:1 | E6:1.5 C#6:0.5 A5:1 | B5:1.5 A5:0.5 G5:1 | Bb5:2 G5:1'
      },
      B: {
        chords: 'Em7:3 A7:3 F#m7:3 B7:3 Em7:3 Gm6:3 D/A:3 A7sus4:3',
        drums: 'pulse', fill: { shaker: '..o.o.o.o.oo', tri: '........x...' },
        lead: 'E5:1 G5:1 B5:1 | C#6:2 B5:0.5 A5:0.5 | A5:2 F#5:1 | B5:2 A5:1 | ' +
              'G5:1.5 F#5:0.5 E5:1 | G5:2 Bb5:1 | A5:2 F#5:1 | E5:2 G5:1'
      },
      A2: {
        chords: 'Dmaj7:3 Bm7:3 Gmaj7:3 A7sus4:3 Dmaj7:3 F#m7:3 Gm6:3 A7:3',
        drums: 'pulse', fill: { tri: '........x...' },
        lead: 'F#5:2 A5:1 | D6:2 C#6:0.5 B5:0.5 | B5:2 A5:0.5 G5:0.5 | A5:3 | ' +
              'F#5:1 A5:1 C#6:1 | E6:1.5 C#6:0.5 A5:1 | Bb5:1.5 A5:0.5 G5:1 | A5:1 G5:1 E5:1'
      }
    },
    form: 'A B A2'
  };

  /* ---------- the stroll score, shared by bgm / moon / indoor ---------- */
  var LEAD_A = 'C5:1 A4:0.5 C5:0.5 F5:1.5 E5:0.5 | D5:1 F5:1 A5:2 | G5:1.5 F5:0.5 D5:1 Bb4:1 | E5:1.5 D5:0.5 C5:1 r:1 | ' +
               'C5:1 A4:0.5 C5:0.5 E5:1.5 G5:0.5 | F#5:1 A5:1 D6:1 C6:1 | ';
  var COUNTER = 'A4:4 | F4:4 | Bb4:4 | Bb4:4 | A4:4 | F#4:4 | G4:2 Bb4:2 | ';
  var STROLL = {
    A: {
      chords: 'Fadd9:4 Dm7:4 Gm7:4 C7:4 Am7:4 D7:4 Gm7:4 C7sus4:4',
      drums: 'light', arp: false,
      lead: LEAD_A + 'Bb5:1.5 A5:0.5 G5:1 F5:1 | G5:2 r:2',
      answer: 'r:15 G5:0.5 Bb5:0.5 r:14 F5:0.5 G5 Bb5 C6'
    },
    A2: {
      chords: 'Fadd9:4 Dm7:4 Gm7:4 C7:4 Am7:4 D7:4 Gm7:2 C7:2 Fadd9:4',
      drums: 'full', arp: false, fill: { tom: '..........x.x.x.' },
      lead: LEAD_A + 'Bb5:1.5 A5:0.5 G5:1 E5:1 | F5:3 r:1',
      answer: 'r:15 G5:0.5 Bb5:0.5 r:15 A5:0.5 C6:0.5',
      ther: COUNTER + 'A4:4'
    },
    B: {
      chords: 'Bbmaj7:4 C7:4 Am7:4 Dm7:4 Gm7:4 Bbm6:4 F/C:4 C7sus4:2 C7:2',
      drums: 'full', fill: { tom: '........x...x.x.', tri: '............x...' },
      flute: 'D5:2 F5:1 A5:1 | G5:3 E5:1 | A5:2 G5:1 E5:1 | F5:3 r:1 | ' +
             'Bb5:2 G5:1 D5:1 | F5:2 Db5:1 Bb4:1 | C5:1 F5:1 A5:2 | G5:2 r:2',
      answer: 'r:4 r:3 C6:0.5 Bb5:0.5 r:4 r:1 A5:0.5 C6:0.5 D6:1 C6:1 ' +
              'r:4 r:3 Db6:0.5 Bb5:0.5 r:4 r:2 E5:0.5 G5 Bb5 C6'
    },
    A3: {
      chords: 'Fadd9:4 Dm7:4 Gm7:4 C7:4 Am7:4 D7:4 Gm7:2 C7:2 Fadd9:2 C7:2',
      drums: 'full',
      lead: LEAD_A + 'Bb5:1.5 A5:0.5 G5:1 E5:1 | F5:2 r:2',
      answer: 'r:15 G5:0.5 Bb5:0.5 r:16',
      ther: COUNTER + 'A4:2 Bb4:2'
    }
  };

  function stroll(bpm, swing, level, tracks, grooves) {
    return { bpm: bpm, swing: swing, level: level, reverb: { size: 2.2 }, delay: { beats: 0.75, feedback: 0.28 },
             tracks: tracks, grooves: grooves, sections: STROLL, form: 'A A2 B A3' };
  }

  var bgm = stroll(104, 0.15, 0.92, {
    lead:   { inst: 'marimba', vol: 0.72, pan: 0.1, rev: 0.25, dly: 0.15 },
    flute:  { inst: 'flute', vol: 0.62, pan: -0.05, rev: 0.3, dly: 0.2 },
    answer: { inst: 'kalimba', vol: 0.48, pan: 0.35, rev: 0.35, dly: 0.25 },
    ther:   { inst: 'theremin', vol: 0.34, pan: -0.3, rev: 0.45 },
    keys:   { inst: 'epiano', vol: 0.32, auto: 'stab', rhythm: '..x...x...x...x.', octave: 4, gate: 0.5, pan: -0.2, rev: 0.2 },
    pad:    { inst: 'pad', vol: 0.2, auto: 'pad', octave: 4, rev: 0.4 },
    arp:    { inst: 'bell', vol: 0.14, auto: 'arp', pattern: 'updown', rate: 0.5, octave: 5, rev: 0.45, pan: 0.25 },
    bass:   { inst: 'upright', vol: 0.85, auto: 'bass', style: 'walk', rhythm: 'x...x...x...x...', octave: 3 },
    drums:  { vol: 0.42, rev: 0.1 }
  }, {
    light: { kick: 'x.......o.......', shaker: '..o...o...o...o.' },
    full:  { kick: 'x.......o.......', rim: '....x.......x...', hat: 'o.x.o.x.o.x.o.x.' }
  });

  var moon = stroll(110, 0.2, 1, {
    lead:   { inst: 'kalimba', vol: 0.72, pan: 0.1, rev: 0.3, dly: 0.2 },
    flute:  { inst: 'reed', vol: 0.55, pan: -0.05, rev: 0.3, dly: 0.15 },
    answer: { inst: 'marimba', vol: 0.5, pan: 0.35, rev: 0.3, dly: 0.2 },
    ther:   { inst: 'theremin', vol: 0.36, pan: -0.3, rev: 0.5, vib: 34 },
    keys:   { inst: 'pluck', vol: 0.34, auto: 'stab', rhythm: '..x...x...x...x.', octave: 4, gate: 0.5, pan: -0.2, rev: 0.2 },
    pad:    { inst: 'choir', vol: 0.3, auto: 'pad', octave: 4, rev: 0.5 },
    arp:    { inst: 'musicbox', vol: 0.16, auto: 'arp', pattern: 'up', rate: 0.5, octave: 5, rev: 0.45, pan: 0.25 },
    bass:   { inst: 'bass', vol: 0.62, auto: 'bass', style: 'oct', rhythm: 'x...x...x...x...', octave: 3, gate: 0.6 },
    drums:  { vol: 0.42, rev: 0.12 }
  }, {
    light: { block: 'x.....x...x.....', shaker: '..o...o...o...o.' },
    full:  { kick: 'x.......o.......', clap: '....x.......x...', block: '......x.......x.', hat: 'o.x.o.x.o.x.o.x.' }
  });

  var indoor = stroll(92, 0.12, 1, {
    lead:   { inst: 'musicbox', vol: 0.75, pan: 0.1, rev: 0.35, dly: 0.12 },
    flute:  { inst: 'flute', vol: 0.55, pan: -0.05, rev: 0.35, dly: 0.15 },
    answer: { inst: 'bell', vol: 0.3, pan: 0.35, rev: 0.4, dly: 0.2 },
    keys:   { inst: 'epiano', vol: 0.34, auto: 'stab', rhythm: 'x.....x...x.....', octave: 4, gate: 0.8, pan: -0.2, rev: 0.3 },
    pad:    { inst: 'strings', vol: 0.42, auto: 'pad', octave: 4, rev: 0.45 },
    bass:   { inst: 'upright', vol: 0.8, auto: 'bass', style: 'root5', rhythm: 'x.......x.......', octave: 3 },
    drums:  { vol: 0.32, rev: 0.15 }
  }, {
    light: { brush: '....o.......o...' },
    full:  { brush: '....x.......x...', shaker: '..o...o...o...o.' }
  });

  window.Game.songs = { title: title, bgm: bgm, moon: moon, indoor: indoor };
})();
