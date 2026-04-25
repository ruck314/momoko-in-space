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
   *   decorations[]     – visual-only elements { type, x, y, ... }
   *   spawns.player     – { x, y }
   *   spawns.enemies[]  – { type: 'alien' | 'ufo', x, y, pattern?, dir?, species? }
   *   spawns.npcs[]     – { type: 'oliver' | 'kittycorn' | 'bob' | 'crab'
   *                              | 'lila' | 'migword' | 'rocket' | 'houseDoor'
   *                              | 'moonMouse', x, y, houseId?, mouseId? }
   *   spawns.pickups[]  – { type: 'heart' (star gem), x, y }
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

    /* Background UFO that drifts across the sky. */
    bgUfo: { y: 110, speed: 0.4, dir: 1 },

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

      /* Neon street lamps lining the path */
      { type: 'lampPost', x: 200, y: 440, color: '#44ffff' },
      { type: 'lampPost', x: 600, y: 440, color: '#ff66cc' },
      { type: 'lampPost', x: 1100, y: 440, color: '#44ffff' },
      { type: 'lampPost', x: 1700, y: 440, color: '#ffd24a' },
      { type: 'lampPost', x: 2300, y: 440, color: '#ff66cc' },
      { type: 'lampPost', x: 2900, y: 440, color: '#44ffff' },
      { type: 'lampPost', x: 3500, y: 440, color: '#ffd24a' },
      { type: 'lampPost', x: 4100, y: 440, color: '#44ffff' },

      /* Cafe and shop storefronts — drawn before their signs so the holo
         billboard layers cleanly on top. */
      { type: 'cafeBuilding', x: 1500, y: 440 },
      { type: 'shopBuilding', x: 2700, y: 440 },

      /* Holographic neon signs */
      { type: 'neonSign', x: 480, y: 440, text: 'WELCOME', color: '#44ffff' },
      { type: 'neonSign', x: 1500, y: 440, text: 'CAFE', color: '#ff66cc' },
      { type: 'neonSign', x: 2700, y: 440, text: 'SHOP', color: '#ffd24a' },
      { type: 'neonSign', x: 3800, y: 440, text: 'LAUNCH', color: '#44ff88' },

      /* Tech panels embedded in the surface */
      { type: 'techPanel', x: 350, y: 440 },
      { type: 'techPanel', x: 1200, y: 440 },
      { type: 'techPanel', x: 2100, y: 440 },
      { type: 'techPanel', x: 3300, y: 440 },
      { type: 'techPanel', x: 4400, y: 440 },

      /* Robot statues — mascots dotted around town */
      { type: 'robotStatue', x: 750, y: 440 },
      { type: 'robotStatue', x: 2500, y: 440 },
      { type: 'robotStatue', x: 4000, y: 440 },

      /* Crystals glinting on the surface */
      { type: 'crystal', x: 350, y: 432, variant: 0 },
      { type: 'crystal', x: 1200, y: 432, variant: 1 },
      { type: 'crystal', x: 2300, y: 432, variant: 2 },
      { type: 'crystal', x: 3400, y: 432, variant: 0 },

      /* Satellites */
      { type: 'satellite', x: 900, y: 200 },
      { type: 'satellite', x: 2150, y: 160 },
      { type: 'satellite', x: 3700, y: 170 },

      /* Small ringed planets in the foreground */
      { type: 'planetRing', x: 1600, y: 90, r: 14, color: '#ff99cc' },
      { type: 'planetRing', x: 3000, y: 80, r: 18, color: '#66ddff' },

      /* Big house silhouettes (painted behind the house doors) */
      { type: 'houseDecor', x: 280, y: 440, color: '#cc66aa', roofColor: '#ff88cc' }, /* Momoko's house */
      { type: 'houseDecor', x: 1020, y: 440, color: '#6688cc', roofColor: '#88aaff' }, /* Lila's house */

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
        { type: 'oliver', x: 700, y: 380 },
        /* Lila — Momoko's next-door neighbor with the star-gem quest */
        { type: 'lila', x: 1080, y: 400 },
        { type: 'kittycorn', x: 2150, y: 380 },
        { type: 'bob', x: 3200, y: 380 },
        /* Star gem hunter crabs become friendly space puppies */
        { type: 'crab', x: 380, y: 426 },
        { type: 'crab', x: 1280, y: 426 },
        { type: 'crab', x: 2380, y: 426 },
        { type: 'crab', x: 3380, y: 426 },
        /* Momoko's house door (home) */
        { type: 'houseDoor', x: 256, y: 388, houseId: 'heroHome' },
        /* Lila's house door */
        { type: 'houseDoor', x: 996, y: 388, houseId: 'lilaHouse' },
        /* Rocket pad */
        { type: 'rocket', x: 4470, y: 290 },
      ],

      pickups: [
        /* Star gems — Lila's quest collectibles, scattered around the town */
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

    /* Background UFO that drifts across the sky. */
    bgUfo: { y: 80, speed: 0.5, dir: -1 },

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

      /* Mouse hidey-holes (small mound markers near each mouse) */
      { type: 'mouseHole', x: 320, y: 432 },
      { type: 'mouseHole', x: 1080, y: 432 },
      { type: 'mouseHole', x: 2280, y: 432 },

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
        /* MigWord lives in the cheese cottage and gives the find-the-friends quest */
        { type: 'migword', x: 1680, y: 380 },
        { type: 'houseDoor', x: 1632, y: 388, houseId: 'migwordCottage' },
        /* Three moon mice scattered around — must be greeted to count for the quest */
        { type: 'moonMouse', x: 320, y: 410, mouseId: 'pip', color: '#dddddd' },
        { type: 'moonMouse', x: 1080, y: 410, mouseId: 'sprout', color: '#ffcc88' },
        { type: 'moonMouse', x: 2280, y: 410, mouseId: 'tilly', color: '#bbaaff' },
        /* Return rocket */
        { type: 'rocket', x: 2870, y: 290 },
      ],

      pickups: [
        /* A couple of star gems on the moon for the home-quest */
        { type: 'heart', x: 600, y: 220 },
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
