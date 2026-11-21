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
   *                       (cheeseDeli / iceCreamParlour / mouseFamilyHome
   *                        are the moon village's enterable buildings)
   *   spawns.player     – { x, y }
   *   spawns.enemies[]  – { type: 'alien', x, y, pattern?, dir?, species? }
   *   spawns.npcs[]     – { type: 'oliver' | 'kittycorn' | 'bob' | 'crab'
   *                              | 'lila' | 'migword' | 'rocket' | 'houseDoor'
   *                              | 'cafeDoor' | 'shopDoor' | 'moonMouse'
   *                              | 'chefMouse' | 'telescope',
   *                              x, y, houseId?, mouseId?, painted? }
   *                       (painted: 'shop' | 'home' — the building art
   *                        draws the door, so the houseDoor only shows its
   *                        glowing cue, plus an OPEN tag on shops)
   *   spawns.pickups[]  – { type: 'heart' (star gem) | 'crumb' (golden
   *                         cheese crumb, with a unique id), x, y }
   *   bgTop/Mid/Bottom  – background gradient stops
   *   showRings         – true on hero's ringed home planet
   *   keyLight          – colour of the sun (rim light, lit ground)
   *   horizonGlow       – colour of the glow along the horizon
   *   nebula[]          – colours of the nebula clouds in the sky
   *   dustColors[]      – optional pair of colours for the drifting dust
   */

  /* ========== LEVEL 1 — HERO'S RINGED HOME PLANET ========== */
  var LEVEL_1 = {
    name: "Hero's Planet Town",
    width: 2900,
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
    floorColorB: '#4a2a8a',

    /* Lighting: sun colour, glow along the horizon, nebula palette */
    keyLight: '#ffc4e8',
    horizonGlow: '#a04ad8',
    nebula: ['#ff4fb8', '#7a5cff', '#35c8ff', '#b04ac8'],

    showRings: true,

    /* Background UFO that drifts across the sky. */
    bgUfo: { y: 110, speed: 0.4, dir: 1 },

    /* Layout, left to right: Momoko's house, Lila's house, the Cosmic
       Café, the Star Bazaar and the launch pad, each about one screen
       apart so a walk between neighbours is a few seconds. */
    decorations: [
      /* Antennas dotting the town skyline */
      { type: 'antenna', x: 60, y: 440, h: 70 },
      { type: 'antenna', x: 500, y: 440, h: 80 },
      { type: 'antenna', x: 870, y: 440, h: 65 },
      { type: 'antenna', x: 1270, y: 440, h: 55 },

      /* Neon street lamps lining the path */
      { type: 'lampPost', x: 200, y: 440, color: '#44ffff' },
      { type: 'lampPost', x: 590, y: 440, color: '#ff66cc' },
      { type: 'lampPost', x: 1000, y: 440, color: '#44ffff' },
      { type: 'lampPost', x: 1420, y: 440, color: '#ffd24a' },
      { type: 'lampPost', x: 1830, y: 440, color: '#ff66cc' },
      { type: 'lampPost', x: 2090, y: 440, color: '#44ffff' },

      /* Cafe and shop storefronts — drawn before their signs so the holo
         billboard layers cleanly on top. */
      { type: 'cafeBuilding', x: 1100, y: 440 },
      { type: 'shopBuilding', x: 1600, y: 440 },

      /* Holographic neon signs (cafe/shop signs are mounted on their
         buildings via the rooftopSign decoration so they don't cover the
         storefronts). */
      { type: 'neonSign', x: 440, y: 440, text: 'WELCOME', color: '#44ffff' },
      { type: 'rooftopSign', x: 1100, y: 440, text: 'CAFE', color: '#ff66cc' },
      { type: 'rooftopSign', x: 1600, y: 440, text: 'SHOP', color: '#ffd24a' },
      { type: 'neonSign', x: 2040, y: 440, text: 'LAUNCH', color: '#44ff88' },

      /* Tech panels embedded in the surface */
      { type: 'techPanel', x: 350, y: 440 },
      { type: 'techPanel', x: 1210, y: 440 },
      { type: 'techPanel', x: 1710, y: 440 },
      { type: 'techPanel', x: 2350, y: 440 },

      /* Robot statues — mascots dotted around town */
      { type: 'robotStatue', x: 130, y: 440 },
      { type: 'robotStatue', x: 820, y: 440 },
      { type: 'robotStatue', x: 1470, y: 440 },

      /* Crystals glinting on the surface */
      { type: 'crystal', x: 350, y: 432, variant: 0 },
      { type: 'crystal', x: 1230, y: 432, variant: 1 },
      { type: 'crystal', x: 1730, y: 432, variant: 2 },
      { type: 'crystal', x: 2110, y: 432, variant: 0 },

      /* Satellites */
      { type: 'satellite', x: 640, y: 200 },
      { type: 'satellite', x: 1370, y: 160 },
      { type: 'satellite', x: 2140, y: 170 },

      /* Small ringed planets in the foreground */
      { type: 'planetRing', x: 1140, y: 90, r: 14, color: '#ff99cc' },
      { type: 'planetRing', x: 1820, y: 80, r: 18, color: '#66ddff' },

      /* Big house silhouettes (painted behind the house doors) */
      { type: 'houseDecor', x: 280, y: 440, color: '#cc66aa', roofColor: '#ff88cc' }, /* Momoko's house */
      { type: 'houseDecor', x: 700, y: 440, color: '#6688cc', roofColor: '#88aaff' }, /* Lila's house */

      /* Rocket pad base (ship is drawn by the RocketShip NPC) */
      { type: 'rocketPad', x: 2450, y: 440 },
    ],

    spawns: {
      player: { x: 60, y: 240 },

      enemies: [
        /* Friendly aliens floating around town */
        { type: 'alien', x: 400, y: 200, pattern: 'sine', dir: -1, species: 'tropical' },
        { type: 'alien', x: 470, y: 300, pattern: 'sine', dir: -1, species: 'clownfish' },
        { type: 'alien', x: 600, y: 180, pattern: 'sine', dir: 1, species: 'clownfish' },
        { type: 'alien', x: 690, y: 250, pattern: 'linear', dir: -1, species: 'tropical' },
        { type: 'alien', x: 850, y: 150, pattern: 'sine', dir: -1, species: 'tropical' },
        { type: 'alien', x: 1110, y: 280, pattern: 'sine', dir: 1, species: 'clownfish' },
        { type: 'alien', x: 1270, y: 160, pattern: 'linear', dir: -1, species: 'swordfish' },
        { type: 'alien', x: 1450, y: 220, pattern: 'sine', dir: -1, species: 'blowfish' },
        { type: 'alien', x: 1540, y: 200, pattern: 'linear', dir: 1, species: 'swordfish' },
        { type: 'alien', x: 1780, y: 180, pattern: 'sine', dir: -1, species: 'clownfish' },
        { type: 'alien', x: 1880, y: 300, pattern: 'sine', dir: 1, species: 'blowfish' },
        { type: 'alien', x: 2060, y: 220, pattern: 'linear', dir: -1, species: 'swordfish' },
        { type: 'alien', x: 2160, y: 280, pattern: 'sine', dir: 1, species: 'tropical' },
      ],

      npcs: [
        { type: 'oliver', x: 920, y: 300 },
        /* Lila — Momoko's next-door neighbor with the star-gem quest */
        { type: 'lila', x: 760, y: 400 },
        { type: 'kittycorn', x: 1330, y: 380 },
        { type: 'bob', x: 1910, y: 380 },
        /* Star gem hunter crabs become friendly space puppies (each
           well clear of the doors) */
        { type: 'crab', x: 380, y: 426 },
        { type: 'crab', x: 960, y: 426 },
        { type: 'crab', x: 1780, y: 426 },
        { type: 'crab', x: 560, y: 426 },
        /* Momoko's house door (home) */
        { type: 'houseDoor', x: 256, y: 388, houseId: 'heroHome' },
        /* Lila's house door */
        { type: 'houseDoor', x: 676, y: 388, houseId: 'lilaHouse' },
        /* Cosmic Café door — opens the cafe cutscene */
        { type: 'cafeDoor', x: 1122, y: 388 },
        /* Star Bazaar (shop) door — buy items + deliver to houses */
        { type: 'shopDoor', x: 1630, y: 388 },
        /* Rocket pad */
        { type: 'rocket', x: 2420, y: 290 },
      ],

      pickups: [
        /* Star gems — Lila's quest collectibles, scattered around the town */
        { type: 'heart', x: 560, y: 180 },
        { type: 'heart', x: 1060, y: 280 },
        { type: 'heart', x: 1420, y: 200 },
        { type: 'heart', x: 1890, y: 260 },
        { type: 'heart', x: 2230, y: 200 },
      ],
    },
  };

  /* ========== LEVEL 2 — CHEESE MOON ========== */
  var LEVEL_2 = {
    name: 'Cheese Moon',
    music: 'moon',      /* variant of the 'bgm' type in songs.js */
    width: 3810,
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

    keyLight: '#ffd27a',
    horizonGlow: '#e0783a',
    nebula: ['#ff8a3a', '#ffd24a', '#d84a8a', '#8a4ae0'],
    /* Drifting dust becomes floating golden cheese crumbs */
    dustColors: ['#ffd24a', '#fff0b8'],

    showRings: false,

    /* Background UFO that drifts across the sky. */
    bgUfo: { y: 80, speed: 0.5, dir: -1 },

    /* Layout, left to right: landing field and Pip, the bounce craters,
       Sprout, the big cheese arch, MigWord's cottage, the mouse village
       (Gouda's cheese deli, Chef Brie's bakery, the Moon Scoops ice-cream
       parlour and the Whisker family home between the cheese-wheel
       houses), Tilly, a second arch, the telescope (home is in the sky
       above it) and the return rocket. */
    decorations: [
      /* Sky (parallax 0.15): a big and a small cheese moon, and the
         hero's ringed home planet that the telescope looks at */
      { type: 'cheeseMoonBg', x: 620, y: 130, r: 110 },
      { type: 'cheeseMoonBg', x: 330, y: 56, r: 36 },
      { type: 'homePlanetBg', x: 1010, y: 96, r: 30 },

      /* Cheese-hole craters on the surface */
      { type: 'cheeseCrater', x: 140, y: 432, r: 14 },
      { type: 'cheeseCrater', x: 220, y: 434, r: 8 },
      { type: 'cheeseCrater', x: 390, y: 434, r: 7 },
      { type: 'cheeseCrater', x: 580, y: 434, r: 9 },
      { type: 'cheeseCrater', x: 700, y: 432, r: 14 },
      { type: 'cheeseCrater', x: 870, y: 434, r: 8 },
      { type: 'cheeseCrater', x: 1100, y: 432, r: 10 },
      { type: 'cheeseCrater', x: 1440, y: 434, r: 9 },
      { type: 'cheeseCrater', x: 2770, y: 434, r: 9 },
      { type: 'cheeseCrater', x: 2880, y: 432, r: 14 },
      { type: 'cheeseCrater', x: 3070, y: 434, r: 7 },
      { type: 'cheeseCrater', x: 3255, y: 432, r: 12 },

      /* Big holey cheese arches you can float through */
      { type: 'cheeseArch', x: 970, y: 440, size: 1 },
      { type: 'cheeseArch', x: 2990, y: 440, size: 0.8 },

      /* Towering cheese wedges */
      { type: 'cheeseWedge', x: 240, y: 440, size: 1.0 },
      { type: 'cheeseWedge', x: 720, y: 440, size: 1.4 },
      { type: 'cheeseWedge', x: 1390, y: 440, size: 1.6 },
      { type: 'cheeseWedge', x: 2740, y: 440, size: 1.2 },
      { type: 'cheeseWedge', x: 3290, y: 440, size: 1.0 },

      /* Cheese-fondue palm trees */
      { type: 'cheeseTree', x: 100, y: 440 },
      { type: 'cheeseTree', x: 560, y: 440 },
      { type: 'cheeseTree', x: 850, y: 440 },
      { type: 'cheeseTree', x: 2660, y: 440 },
      { type: 'cheeseTree', x: 3215, y: 440 },

      /* Cheese chunks on the ground */
      { type: 'cheeseChunk', x: 405, y: 432 },
      { type: 'cheeseChunk', x: 680, y: 432 },
      { type: 'cheeseChunk', x: 1130, y: 432 },
      { type: 'cheeseChunk', x: 2165, y: 432 },
      { type: 'cheeseChunk', x: 3135, y: 432 },

      /* Melted cheese drips off the surface ledge */
      { type: 'cheeseDrip', x: 350, y: 440 },
      { type: 'cheeseDrip', x: 800, y: 440 },
      { type: 'cheeseDrip', x: 1300, y: 440 },
      { type: 'cheeseDrip', x: 2600, y: 440 },
      { type: 'cheeseDrip', x: 3200, y: 440 },

      /* Welcome / cottage signs */
      { type: 'cheeseSign', x: 200, y: 440, text: 'CHEESE' },
      { type: 'cheeseSign', x: 1110, y: 440, text: 'COTTAGE' },
      { type: 'cheeseSign', x: 3370, y: 440, text: 'PAD' },

      /* MigWord's cheese cottage silhouette */
      { type: 'houseDecor', x: 1250, y: 440, color: '#ddbb44', roofColor: '#ff9933' },

      /* Mouse village: cheese-wheel houses, bunting, warm lamps, Chef
         Brie's bakery stall and the three shops/homes you can go into */
      { type: 'bunting', x: 1520, y: 440, x2: 1640, h: 90 },
      { type: 'bunting', x: 1740, y: 440, x2: 2100, h: 96 },
      { type: 'bunting', x: 2300, y: 440, x2: 2380, h: 84 },
      { type: 'mouseHouse', x: 1520, y: 440, door: '#ff66cc' },
      { type: 'lampPost', x: 1600, y: 440, color: '#ffd24a' },
      { type: 'cheeseDeli', x: 1690, y: 440 },
      { type: 'cheeseStall', x: 1920, y: 440 },
      { type: 'mouseHouse', x: 2100, y: 440, door: '#44bbff', small: true },
      { type: 'lampPost', x: 2170, y: 440, color: '#ffb066' },
      { type: 'iceCreamParlour', x: 2250, y: 440 },
      { type: 'mouseHouse', x: 2380, y: 440, door: '#88dd66' },
      { type: 'mouseFamilyHome', x: 2530, y: 440 },

      /* Mouse hidey-holes (small mound markers near each mouse) */
      { type: 'mouseHole', x: 300, y: 432 },
      { type: 'mouseHole', x: 800, y: 432 },
      { type: 'mouseHole', x: 2660, y: 432 },

      /* A couple antennas for signal from home */
      { type: 'antenna', x: 480, y: 440, h: 60 },
      { type: 'antenna', x: 3090, y: 440, h: 70 },

      /* Crystals */
      { type: 'crystal', x: 670, y: 432, variant: 2 },
      { type: 'crystal', x: 1040, y: 432, variant: 0 },
      { type: 'crystal', x: 3110, y: 432, variant: 1 },

      /* Bouncy cheese craters: stand on one and BOING */
      { type: 'cheeseBounce', x: 440, y: 440 },
      { type: 'cheeseBounce', x: 620, y: 440 },
      { type: 'cheeseBounce', x: 2830, y: 440 },

      /* Shy crater critters that peek out and duck when Momoko comes near */
      { type: 'craterPeeker', x: 520, y: 440, color: '#c8a8ff' },
      { type: 'craterPeeker', x: 1150, y: 440, color: '#9fe8c8' },
      { type: 'craterPeeker', x: 2920, y: 440, color: '#ffb0c8' },
      { type: 'craterPeeker', x: 3240, y: 440, color: '#a8d8ff' },

      /* Return rocket pad */
      { type: 'rocketPad', x: 3630, y: 440 },
    ],

    spawns: {
      player: { x: 60, y: 240 },

      enemies: [
        /* A lighter sprinkling of friendly aliens */
        { type: 'alien', x: 400, y: 200, pattern: 'sine', dir: 1, species: 'tropical' },
        { type: 'alien', x: 760, y: 240, pattern: 'linear', dir: -1, species: 'tropical' },
        { type: 'alien', x: 1060, y: 180, pattern: 'sine', dir: 1, species: 'clownfish' },
        { type: 'alien', x: 1960, y: 200, pattern: 'sine', dir: -1, species: 'blowfish' },
        { type: 'alien', x: 2990, y: 190, pattern: 'sine', dir: 1, species: 'clownfish' },
      ],

      npcs: [
        /* MigWord lives in the cheese cottage and gives the find-the-friends quest */
        { type: 'migword', x: 1280, y: 380 },
        { type: 'houseDoor', x: 1232, y: 388, houseId: 'migwordCottage' },
        /* Village doors: the buildings paint their own doors, so these
           are just the glowing entry zones (each 200+ px from the next) */
        { type: 'houseDoor', x: 1698, y: 388, houseId: 'cheeseDeli', painted: 'shop' },
        { type: 'houseDoor', x: 2226, y: 388, houseId: 'iceCreamParlour', painted: 'shop' },
        { type: 'houseDoor', x: 2506, y: 388, houseId: 'mouseFamilyHome', painted: 'home' },
        /* Three moon mice scattered around — must be greeted to count for the quest */
        { type: 'moonMouse', x: 300, y: 410, mouseId: 'pip', color: '#dddddd' },
        { type: 'moonMouse', x: 800, y: 410, mouseId: 'sprout', color: '#ffcc88' },
        { type: 'moonMouse', x: 2660, y: 410, mouseId: 'tilly', color: '#bbaaff' },
        /* Chef Brie at her bakery stall — the golden-crumb quest */
        { type: 'chefMouse', x: 1840, y: 402 },
        /* Telescope on the hill, pointed at home */
        { type: 'telescope', x: 3170, y: 390 },
        /* Return rocket */
        { type: 'rocket', x: 3600, y: 290 },
      ],

      pickups: [
        /* A couple of star gems on the moon for the home-quest */
        { type: 'heart', x: 560, y: 220 },
        { type: 'heart', x: 1350, y: 200 },
        /* Chef Brie's golden crumbs: only out while her quest runs */
        { type: 'crumb', id: 'c1', x: 612, y: 170 },
        { type: 'crumb', id: 'c2', x: 962, y: 380 },
        { type: 'crumb', id: 'c3', x: 1276, y: 250 },
        { type: 'crumb', id: 'c4', x: 2372, y: 318 },
        { type: 'crumb', id: 'c5', x: 3162, y: 300 },
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
