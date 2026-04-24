/* levels.js – level data (separate from engine code) */
(function () {
  'use strict';
  window.Game = window.Game || {};

  /*
   * Level data format:
   *   name              – display string
   *   width / height    – world dimensions in pixels
   *   waterSurface      – legacy upper-sky y coord (kept for field parity)
   *   floorY            – y coord of planet/moon surface
   *   platforms[]       – solid blocks { x, y, w, h, color? }
   *   decorations[]     – visual-only elements { type, x, y, ... }
   *   spawns.player     – { x, y }
   *   spawns.enemies[]  – { type: 'alien' | 'ufo', x, y, pattern?, dir?, species? }
   *   spawns.npcs[]     – { type: 'oliver' | 'kittycorn' | 'bob' | 'crab'
   *                              | 'lila' | 'migword' | 'rocket' | 'houseDoor', x, y, houseId? }
   *   spawns.pickups[]  – { type: 'heart' (star gem) | 'cheese', x, y }
   *   bgTop/Mid/Bottom  – background gradient stops
   *   showRings         – true on hero's ringed home planet
   */

  /* ========== LEVEL 1 — HERO'S RINGED HOME PLANET ========== */
  var LEVEL_1 = {
    name: "Hero's Planet Town",
    width: 5600,
    height: 480,
    waterSurface: 60,
    floorY: 440,

    /* Space gradient — deep purples */
    bgTop: '#0a0420',
    bgMid: '#1a0b3d',
    bgBottom: '#2a1458',

    bgLayer0: ['#3a1860', '#2a1050', '#4a1a70'],
    bgLayer1: ['#6a3aa0', '#8844cc', '#4a2878'],
    bgLayer2: ['#2d1a4a', '#321d52', '#28154a'],

    floorColorA: '#2d1a4a',
    floorColorB: '#42247a',

    showRings: true,

    platforms: [
      /* Starting area — floating rock platforms */
      { x: 180, y: 360, w: 80, h: 80 },
      { x: 320, y: 300, w: 48, h: 140 },
      { x: 440, y: 340, w: 64, h: 100 },

      /* Section 2 */
      { x: 750, y: 200, w: 48, h: 80 },
      { x: 750, y: 360, w: 100, h: 80 },
      { x: 900, y: 280, w: 48, h: 160 },
      { x: 1050, y: 320, w: 80, h: 120 },
      { x: 1150, y: 180, w: 48, h: 100 },

      /* Section 3 — denser */
      { x: 1500, y: 160, w: 64, h: 48 },
      { x: 1600, y: 260, w: 48, h: 180 },
      { x: 1700, y: 350, w: 100, h: 90 },
      { x: 1850, y: 200, w: 48, h: 80 },
      { x: 1950, y: 300, w: 64, h: 48 },
      { x: 2050, y: 160, w: 80, h: 48 },

      /* Section 4 — passage */
      { x: 2500, y: 140, w: 200, h: 32 },
      { x: 2500, y: 340, w: 200, h: 32 },
      { x: 2800, y: 200, w: 48, h: 64 },
      { x: 2900, y: 320, w: 80, h: 120 },
      { x: 3050, y: 240, w: 48, h: 48 },
      { x: 3150, y: 360, w: 64, h: 80 },

      /* Section 5 — open sky approach to the rocket pad */
      { x: 3500, y: 350, w: 120, h: 90 },
      { x: 3700, y: 180, w: 48, h: 48 },
      { x: 4200, y: 390, w: 400, h: 50 },
      { x: 4700, y: 390, w: 400, h: 50 },
    ],

    decorations: [
      /* Antennas dotting the town skyline */
      { type: 'antenna', x: 60, y: 440, h: 70 },
      { type: 'antenna', x: 400, y: 440, h: 80 },
      { type: 'antenna', x: 860, y: 440, h: 65 },
      { type: 'antenna', x: 1300, y: 440, h: 55 },
      { type: 'antenna', x: 1800, y: 440, h: 70 },
      { type: 'antenna', x: 2400, y: 440, h: 75 },
      { type: 'antenna', x: 3000, y: 440, h: 80 },
      { type: 'antenna', x: 3600, y: 440, h: 70 },

      /* Alien flora (re-themed coral) */
      { type: 'alienFlora', x: 250, y: 425, variant: 0 },
      { type: 'alienFlora', x: 620, y: 420, variant: 1 },
      { type: 'alienFlora', x: 980, y: 430, variant: 2 },
      { type: 'alienFlora', x: 1400, y: 425, variant: 0 },
      { type: 'alienFlora', x: 1750, y: 420, variant: 1 },
      { type: 'alienFlora', x: 2200, y: 430, variant: 2 },
      { type: 'alienFlora', x: 2600, y: 425, variant: 0 },
      { type: 'alienFlora', x: 3100, y: 420, variant: 1 },
      { type: 'alienFlora', x: 3800, y: 430, variant: 2 },

      /* Crystals glinting on the surface */
      { type: 'crystal', x: 350, y: 432, variant: 0 },
      { type: 'crystal', x: 1200, y: 432, variant: 1 },
      { type: 'crystal', x: 2300, y: 432, variant: 2 },
      { type: 'crystal', x: 3400, y: 432, variant: 0 },

      /* Bioluminescent space vines */
      { type: 'spaceVine', x: 120, y: 440, h: 130 },
      { type: 'spaceVine', x: 500, y: 440, h: 110 },
      { type: 'spaceVine', x: 950, y: 440, h: 120 },
      { type: 'spaceVine', x: 1350, y: 440, h: 150 },
      { type: 'spaceVine', x: 2050, y: 440, h: 130 },
      { type: 'spaceVine', x: 2650, y: 440, h: 140 },

      /* Satellites */
      { type: 'satellite', x: 900, y: 200 },
      { type: 'satellite', x: 2150, y: 160 },
      { type: 'satellite', x: 3700, y: 170 },

      /* Small ringed planets in the foreground */
      { type: 'planetRing', x: 1600, y: 90, r: 14, color: '#ff99cc' },
      { type: 'planetRing', x: 3000, y: 80, r: 18, color: '#66ddff' },

      /* House silhouettes (painted behind the house doors) */
      { type: 'houseDecor', x: 260, y: 440, color: '#cc66aa', roofColor: '#ff88cc' }, /* Momoko's house */
      { type: 'houseDecor', x: 1000, y: 440, color: '#6688cc', roofColor: '#88aaff' }, /* Lila's house */

      /* Rocket pad base (ship is drawn by the RocketShip NPC) */
      { type: 'rocketPad', x: 4500, y: 440 },
    ],

    spawns: {
      player: { x: 60, y: 240 },

      enemies: [
        /* Friendly aliens floating around town */
        { type: 'alien', x: 500, y: 200, pattern: 'sine', dir: -1, species: 'tropical' },
        { type: 'alien', x: 600, y: 300, pattern: 'sine', dir: -1, species: 'clownfish' },
        { type: 'alien', x: 820, y: 180, pattern: 'sine', dir: 1, species: 'clownfish' },
        { type: 'alien', x: 1000, y: 250, pattern: 'linear', dir: -1, species: 'angelfish' },
        { type: 'alien', x: 1200, y: 150, pattern: 'sine', dir: -1, species: 'tropical' },
        { type: 'alien', x: 1550, y: 280, pattern: 'sine', dir: 1, species: 'angelfish' },
        { type: 'ufo',   x: 1680, y: 200, pattern: 'hover' },
        { type: 'alien', x: 1900, y: 160, pattern: 'linear', dir: -1, species: 'swordfish' },
        { type: 'ufo',   x: 2000, y: 320, pattern: 'hover' },
        { type: 'alien', x: 2350, y: 220, pattern: 'sine', dir: -1, species: 'blowfish' },
        { type: 'alien', x: 2550, y: 200, pattern: 'linear', dir: 1, species: 'swordfish' },
        { type: 'ufo',   x: 2750, y: 240, pattern: 'hover' },
        { type: 'alien', x: 2950, y: 180, pattern: 'sine', dir: -1, species: 'clownfish' },
        { type: 'alien', x: 3100, y: 300, pattern: 'sine', dir: 1, species: 'blowfish' },
        { type: 'ufo',   x: 3200, y: 200, pattern: 'hover' },
        { type: 'alien', x: 3500, y: 220, pattern: 'linear', dir: -1, species: 'swordfish' },
        { type: 'alien', x: 3650, y: 280, pattern: 'sine', dir: 1, species: 'angelfish' },
      ],

      npcs: [
        { type: 'oliver', x: 700, y: 240 },
        /* Lila — Momoko's next-door neighbor with the star-gem quest */
        { type: 'lila', x: 1050, y: 380 },
        { type: 'kittycorn', x: 2150, y: 220 },
        { type: 'bob', x: 3200, y: 300 },
        /* Star gem hunter crabs become friendly space puppies — keep as 'crab' type
           for joke dispensers but visual is the re-skinned pet-dog sprite */
        { type: 'crab', x: 380, y: 426 },
        { type: 'crab', x: 1280, y: 426 },
        { type: 'crab', x: 2380, y: 426 },
        { type: 'crab', x: 3380, y: 426 },
        /* Momoko's house door (home) */
        { type: 'houseDoor', x: 280, y: 410, houseId: 'heroHome' },
        /* Lila's house door */
        { type: 'houseDoor', x: 1020, y: 410, houseId: 'lilaHouse' },
        /* Rocket pad */
        { type: 'rocket', x: 4500, y: 390 },
      ],

      pickups: [
        /* Star gems — Lila's quest collectibles, also heal 1 HP */
        { type: 'heart', x: 700, y: 180 },
        { type: 'heart', x: 1450, y: 280 },
        { type: 'heart', x: 2250, y: 200 },
        { type: 'heart', x: 3100, y: 260 },
        { type: 'heart', x: 3950, y: 200 },
      ],
    },
  };

  /* ========== LEVEL 2 — CHEESE MOON ========== */
  var LEVEL_2 = {
    name: 'Cheese Moon',
    width: 3200,
    height: 480,
    waterSurface: 60,
    floorY: 440,

    /* Warm yellow/orange palette for the cheesy moon */
    bgTop: '#1a0a28',
    bgMid: '#2a1628',
    bgBottom: '#4a2820',

    bgLayer0: ['#4a2820', '#5a3010', '#3a1818'],
    bgLayer1: ['#b98a28', '#cc9a38', '#8a6220'],
    bgLayer2: ['#5a3010', '#6a4018', '#4a2810'],

    floorColorA: '#8a6220',
    floorColorB: '#b98a28',

    showRings: false,

    platforms: [
      /* Floating cheese chunks */
      { x: 200, y: 360, w: 90, h: 80 },
      { x: 400, y: 300, w: 60, h: 140 },
      { x: 600, y: 340, w: 80, h: 100 },
      { x: 900, y: 260, w: 60, h: 180 },
      { x: 1100, y: 320, w: 90, h: 120 },
      { x: 1350, y: 200, w: 60, h: 80 },
      { x: 1550, y: 340, w: 100, h: 100 },
      { x: 1800, y: 280, w: 60, h: 160 },
      { x: 2050, y: 360, w: 80, h: 80 },
      { x: 2300, y: 320, w: 90, h: 120 },
      { x: 2700, y: 390, w: 400, h: 50 },
    ],

    decorations: [
      /* Cheese-hole craters on the surface */
      { type: 'cheeseCrater', x: 140, y: 432, r: 14 },
      { type: 'cheeseCrater', x: 340, y: 432, r: 10 },
      { type: 'cheeseCrater', x: 540, y: 432, r: 16 },
      { type: 'cheeseCrater', x: 760, y: 432, r: 12 },
      { type: 'cheeseCrater', x: 980, y: 432, r: 14 },
      { type: 'cheeseCrater', x: 1240, y: 432, r: 18 },
      { type: 'cheeseCrater', x: 1480, y: 432, r: 10 },
      { type: 'cheeseCrater', x: 1700, y: 432, r: 16 },
      { type: 'cheeseCrater', x: 1920, y: 432, r: 12 },
      { type: 'cheeseCrater', x: 2180, y: 432, r: 14 },
      { type: 'cheeseCrater', x: 2450, y: 432, r: 18 },

      /* MigWord's cheese cottage silhouette */
      { type: 'houseDecor', x: 1650, y: 440, color: '#ddbb44', roofColor: '#ff9933' },

      /* A couple antennas for signal from home */
      { type: 'antenna', x: 500, y: 440, h: 60 },
      { type: 'antenna', x: 2200, y: 440, h: 70 },

      /* Crystals */
      { type: 'crystal', x: 800, y: 432, variant: 2 },
      { type: 'crystal', x: 1400, y: 432, variant: 0 },
      { type: 'crystal', x: 2600, y: 432, variant: 1 },

      /* Return rocket pad */
      { type: 'rocketPad', x: 2900, y: 440 },
    ],

    spawns: {
      player: { x: 60, y: 240 },

      enemies: [
        /* A lighter sprinkling of friendly aliens */
        { type: 'alien', x: 420, y: 200, pattern: 'sine', dir: 1, species: 'tropical' },
        { type: 'ufo',   x: 700, y: 160, pattern: 'hover' },
        { type: 'alien', x: 1000, y: 240, pattern: 'linear', dir: -1, species: 'angelfish' },
        { type: 'alien', x: 1400, y: 180, pattern: 'sine', dir: 1, species: 'clownfish' },
        { type: 'ufo',   x: 1900, y: 220, pattern: 'hover' },
        { type: 'alien', x: 2300, y: 200, pattern: 'sine', dir: -1, species: 'blowfish' },
      ],

      npcs: [
        /* MigWord lives in the cheese cottage and gives the cheese quest */
        { type: 'migword', x: 1680, y: 380 },
        { type: 'houseDoor', x: 1660, y: 410, houseId: 'migwordCottage' },
        /* Return rocket */
        { type: 'rocket', x: 2900, y: 390 },
      ],

      pickups: [
        /* Cheese wheels — MigWord's quest collectibles */
        { type: 'cheese', x: 450, y: 280 },
        { type: 'cheese', x: 1150, y: 280 },
        { type: 'cheese', x: 2350, y: 280 },
        /* A heal-only star gem for good measure */
        { type: 'heart', x: 1800, y: 200 },
      ],
    },
  };

  window.Game.levels = {
    data: [LEVEL_1, LEVEL_2],
    get: function (index) {
      return this.data[index] || null;
    },
    count: function () {
      return this.data.length;
    }
  };
})();
