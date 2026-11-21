/* engine.js – game loop, state machine, camera, collision, rendering */
(function () {
  'use strict';
  window.Game = window.Game || {};

  var W = 800, H = 480;
  /* On touch devices we pad the canvas around the 800×480 game viewport
     so thumbs never cover the playfield and the canvas can match the
     screen's aspect ratio (so it scales up to fill the display).

     Horizontal strips: D-pad on the left, BUBBLE on the right. The left
     strip is wider so the D-pad has breathing room on narrow iPhones.

     Vertical bezels: when the screen is taller-aspect than the base
     canvas (iPads, ChromeOS tablets), extra space is split equally above
     and below the game viewport so the canvas can be scaled up to use
     the full screen height instead of being letterboxed.

     GAME_X / GAME_Y are the offsets where the game viewport begins
     inside the canvas; the render loop translates by them so game code
     keeps using logical 0..W, 0..H coordinates. */
  var TOUCH_LEFT_W = 260;
  var TOUCH_RIGHT_W = 200;
  var CANVAS_W = W;
  var CANVAS_H = H;
  var GAME_X = 0;
  var GAME_Y = 0;
  /* Version stamp shown on the title screen and pause menu. Bump manually
     at release time and tag the matching git release (`git tag vX.Y.Z`)
     so the in-game stamp lines up with the git tag for debugging. */
  Game.VERSION = 'v2.19.0';
  Game.BUILD = '';
  var canvas, ctx;

  /* ---- Game state ---- */
  var State = {
    TITLE: 'title',
    CUSTOMIZE: 'customize',
    INTRO: 'intro',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAME_OVER: 'gameOver',
    VICTORY: 'victory',
    BEACH: 'beach',
    TRAVEL_MENU: 'travelMenu',
    ROCKET_ANIM: 'rocketAnim',
    HOUSE_INTERIOR: 'houseInterior',
    CAFE_INTERIOR: 'cafeInterior',
    SHOP_INTERIOR: 'shopInterior',
    TELESCOPE: 'telescope',
  };
  var state = State.TITLE;
  var prevState = null;

  /* ---- Customization defaults ----
     Split across two concerns: tintable colors (hair/suit/skin/flipper) and
     swappable variants (hairStyle/outfit/shoes/crab/food). Variants are
     strings that the sprite painter branches on; 'none' means skip. */
  Game.customization = {
    hair: '#e06088',
    suit: '#e06088',
    skin: '#ffddbb',
    flipper: '#ff99cc',
    hairStyle: 'twinTails',
    outfit: 'frillyDress',
    shoes: 'maryJane',
    crab: 'none',
    food: 'none',
    helmet: 'bubble',
    gear: 'none',
  };

  /* Quest state – persisted in localStorage. */
  function freshQuests() {
    return {
      lila: 'notStarted',      /* 'notStarted' | 'inProgress' | 'done' */
      migword: 'notStarted',
      brie: 'notStarted',      /* Chef Brie's golden crumbs (cheese moon) */
      progress: { gems: 0, cheese: 0, crumbs: {} },
    };
  }
  Game.quests = freshQuests();

  /* Shop delivery state – items the hero has purchased and is carrying.
     Each entry: { type: <furniture-type> }. Cleared (deposited) when
     she enters a houseDoor. */
  Game.shop = {
    cart: [],
    MAX: 4,
  };

  /* ---- Camera ---- */
  var camera = { x: 0, y: 0 };

  /* ---- Level & entities ---- */
  var level = null;
  var player = null;
  var bubbles = [];
  var enemies = [];
  var npcs = []; /* { entity, type } */
  var pickups = [];
  var particles = [];
  var ambientBubbles = [];
  var wolfe = null;
  var npcCooldowns = {};
  /* Rings-view cutscene trigger arming. Fires when the player floats above
     the scene's upper-sky line, re-arms after they descend back below. */
  var beachReady = true;
  /* Current zone index for multi-planet travel (0 = hero's planet, 1 = moon). */
  var currentZone = 0;
  /* Rocket travel animation timer & destination. */
  var rocketAnimTimer = 0;
  var rocketTarget = 0;
  /* House interior state. */
  var currentHouseId = null;
  /* Bounce craters on this level, and when the telescope view opened
     (the tap that opened it must not also close it). */
  var bouncers = [];
  var telescopeAt = 0;

  /* Door and rocket transitions: the state still switches at once, but
     the screen irises shut on the old scene around Momoko and opens on
     the new one around her, and she gives a little arrival hop as it
     opens. Purely visual; about half a second in all. */
  var IRIS_CLOSE = 0.2, IRIS_OPEN = 0.32;
  var renderedState = null, iris = null, irisCv = null, heroAt = { x: 0, y: 0 };
  var IRIS_STATES = {};
  IRIS_STATES[State.HOUSE_INTERIOR] = 1; IRIS_STATES[State.CAFE_INTERIOR] = 1; IRIS_STATES[State.SHOP_INTERIOR] = 1;
  IRIS_STATES[State.TELESCOPE] = 1;
  function irisPair(a, b) {
    return (a === State.PLAYING && IRIS_STATES[b]) || (IRIS_STATES[a] && b === State.PLAYING) ||
           (a === State.TRAVEL_MENU && b === State.ROCKET_ANIM) || (a === State.ROCKET_ANIM && b === State.PLAYING);
  }
  /* Where Momoko is on the canvas in the state just drawn. */
  function heroOnCanvas(out) {
    var p = null;
    if ((state === State.PLAYING || state === State.TRAVEL_MENU) && player) {
      p = { x: player.x - camera.x + player.w / 2, y: player.y - camera.y + player.h / 2 - 6 };
    } else if ((state === State.HOUSE_INTERIOR || state === State.CAFE_INTERIOR) && Game.ui.heroPos) {
      p = Game.ui.heroPos();
      p = { x: p.x, y: p.y - 34 };
    }
    out.x = GAME_X + (p ? p.x : W / 2);
    out.y = GAME_Y + (p ? p.y : H / 2);
  }
  function startIris() {
    if (!irisCv || irisCv.width !== canvas.width || irisCv.height !== canvas.height) irisCv = offscreen(canvas.width, canvas.height);
    var g = irisCv.getContext('2d');
    g.clearRect(0, 0, irisCv.width, irisCv.height);
    g.drawImage(canvas, 0, 0);
    iris = { t0: performance.now(), x: heroAt.x, y: heroAt.y, opened: false };
  }
  function drawIris() {
    var t = (performance.now() - iris.t0) / 1000;
    var R = Math.sqrt(CANVAS_W * CANVAS_W + CANVAS_H * CANVAS_H), k, cx, cy;
    if (t < IRIS_CLOSE) {
      ctx.drawImage(irisCv, 0, 0, CANVAS_W, CANVAS_H);
      k = t / IRIS_CLOSE; k = 1 - k * k;
      cx = iris.x; cy = iris.y;
    } else if (t < IRIS_CLOSE + IRIS_OPEN) {
      if (!iris.opened) {
        iris.opened = true;
        if (state === State.PLAYING && player && player.react) player.react('arrive');
        else if (Game.ui.heroArrive) Game.ui.heroArrive();
      }
      k = (t - IRIS_CLOSE) / IRIS_OPEN; k = 1 - (1 - k) * (1 - k) * (1 - k);
      cx = heroAt.x; cy = heroAt.y;
    } else { iris = null; return; }
    var r = 6 + (R - 6) * k;
    ctx.save();
    ctx.fillStyle = '#0c0424';
    ctx.beginPath();
    ctx.rect(0, 0, CANVAS_W, CANVAS_H);
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(255, 196, 236, 0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /* Dialogue message queued during the playing-state render; drawn in
     canvas-space after the game viewport is painted so it can live in
     the bottom bezel instead of covering gameplay. */
  var pendingDialogue = null;

  /* ---- Background parallax layers ---- */
  var bgLayers = [];
  var bgFishSchools = [];
  var currentMotes = [];
  /* World-space x of the background UFO. Persisted across frames so the UFO
     glides smoothly. Reset whenever a level loads. */
  var bgUfoX = 0;
  /* Surface detail laid out once per level: craters, dust drifts,
     footprints, pebbles, critters and glowing crystals along the ground. */
  var groundDetails = [];
  var GROUND_CRYSTAL_COLORS = ['#88ddff', '#ff66cc', '#ffd24a'];

  /* Soft radial glow discs, rendered once per colour/radius and blitted
     so the per-frame ground pass never builds gradients in a loop. */
  var glowSprites = {};
  function glowSprite(color, r) {
    var key = color + r;
    if (glowSprites[key]) return glowSprites[key];
    var cv = document.createElement('canvas');
    cv.width = cv.height = r * 2;
    var g = cv.getContext('2d');
    var rg = g.createRadialGradient(r, r, 0, r, r, r);
    rg.addColorStop(0, hexA(color, 0.55));
    rg.addColorStop(0.5, hexA(color, 0.18));
    rg.addColorStop(1, hexA(color, 0));
    g.fillStyle = rg;
    g.fillRect(0, 0, r * 2, r * 2);
    glowSprites[key] = cv;
    return cv;
  }

  /* Height of the dusty surface crust relative to level.floorY at a
     world x -- the same wave the ground fill is drawn with, so shadows
     and details sit exactly on the visible rim. */
  function surfaceUndulation(worldX) {
    return Math.sin(worldX * 0.008) * 6 + Math.sin(worldX * 0.02) * 3 + Math.sin(worldX * 0.05) * 1.5;
  }

  /* Soft contact shadow under a character, fading and shrinking as she
     floats higher so it reads as cast onto the ground. */
  function drawGroundShadow(e) {
    var wx = e.x + e.w / 2;
    var ground = level.floorY + surfaceUndulation(wx) + 2;
    var lift = ground - (e.y + e.h);
    if (lift < -8 || lift > 240) return;
    if (lift < 0) lift = 0;
    var k = 1 - lift / 240;
    ctx.fillStyle = 'rgba(6, 2, 20, ' + (0.4 * k * k).toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(wx - camera.x, ground - camera.y + 1, e.w * (0.5 + 0.12 * k), 2.5 + 2 * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /* '#rrggbb' -> 'rgba(r, g, b, a)' */
  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ', ' + a + ')';
  }

  /* Blend two '#rrggbb' colours; t = 0 gives a, 1 gives b. */
  function mixHex(a, b, t) {
    var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    var r = Math.round((x >> 16) + ((y >> 16) - (x >> 16)) * t);
    var g = Math.round(((x >> 8) & 255) + (((y >> 8) & 255) - ((x >> 8) & 255)) * t);
    var bl = Math.round((x & 255) + ((y & 255) - (x & 255)) * t);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }

  /* ---- Render layers and post effects ----
     The scene is lit from the upper left by the level's sun. The static
     parts of the sky (gradient, horizon glow, sun, nebula, star dust,
     planet rings) are painted once per level into offscreen canvases and
     blitted, and the effects below work from cached sprites, gradients
     and canvases. Each effect can be switched off through
     Game.FX; with `auto` set the game loop switches them off by itself
     when frames stay slow (see gameLoop). */
  Game.FX = { bloom: true, grade: true, vignette: true, rim: true, auto: true };
  var DPR = 1;

  function offscreen(w, h) {
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w));
    cv.height = Math.max(1, Math.round(h));
    return cv;
  }

  /* Small deterministic generator so cached layers look the same on
     every visit. */
  function lcg(seed) {
    return function () {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
  }

  var NEB_W = 1200;
  var skyCv = null, nebCv = null, ringCv = null, skyKey = '';
  var RING_W = 1000, RING_H = 300;

  function buildSky() {
    var s = Math.min(2, DPR);
    var key = level.name + '@' + s;
    if (key === skyKey) return;
    skyKey = key;
    var glow = level.horizonGlow || mixHex(level.bgBottom, '#ffffff', 0.35);
    var sunC = level.keyLight || '#ffffff';
    var rnd = lcg(977 + level.width);
    var i;

    /* Screen-fixed sky: gradient, glow rising from the horizon, sun. */
    skyCv = offscreen(W * s, H * s);
    var g = skyCv.getContext('2d');
    g.scale(s, s);
    var grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, level.bgTop);
    grad.addColorStop(0.5, level.bgMid);
    grad.addColorStop(1, level.bgBottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    var hz = g.createLinearGradient(0, level.floorY - 300, 0, level.floorY);
    hz.addColorStop(0, hexA(glow, 0));
    hz.addColorStop(0.55, hexA(glow, 0.16));
    hz.addColorStop(1, hexA(glow, 0.58));
    g.fillStyle = hz;
    g.fillRect(0, level.floorY - 300, W, 300);
    var sun = level.sun || { x: 92, y: 96 };
    g.globalCompositeOperation = 'lighter';
    var sg = g.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, 300);
    sg.addColorStop(0, hexA(sunC, 0.5));
    sg.addColorStop(0.12, hexA(sunC, 0.24));
    sg.addColorStop(0.45, hexA(sunC, 0.07));
    sg.addColorStop(1, hexA(sunC, 0));
    g.fillStyle = sg;
    g.fillRect(0, 0, W, H);
    /* Flare spikes */
    g.translate(sun.x, sun.y);
    for (i = 0; i < 4; i++) {
      var len = i % 2 ? 46 : 78;
      var fg = g.createLinearGradient(-len, 0, len, 0);
      fg.addColorStop(0, hexA(sunC, 0));
      fg.addColorStop(0.5, hexA(sunC, 0.5));
      fg.addColorStop(1, hexA(sunC, 0));
      g.fillStyle = fg;
      g.beginPath();
      g.ellipse(0, 0, len, 1.6, 0, 0, Math.PI * 2);
      g.fill();
      g.rotate(Math.PI / 4);
    }
    g.setTransform(s, 0, 0, s, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = mixHex(sunC, '#ffffff', 0.75);
    g.beginPath();
    g.arc(sun.x, sun.y, 9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(sun.x, sun.y, 6, 0, Math.PI * 2);
    g.fill();

    /* Wrapping nebula tile: glowing clouds strung along a wavy band,
       dark dust lanes, and a dense field of faint static stars. */
    nebCv = offscreen(NEB_W * s, H * s);
    var n = nebCv.getContext('2d');
    n.scale(s, s);
    Game.ui.paintNebula(n, NEB_W, H, level.floorY - 40,
      level.nebula || ['#ff4fb8', '#7a5cff', '#35c8ff', '#b04ac8'], rnd);

    /* The home planet's own rings, seen from its surface: a broad arc of
       fine bands with a dark gap, fading out toward both ends. */
    ringCv = null;
    if (level.showRings) {
      ringCv = offscreen(RING_W * s, RING_H * s);
      var r = ringCv.getContext('2d');
      r.scale(s, s);
      r.translate(RING_W / 2, 150);
      r.rotate(-0.2);
      var ringCols = ['#ffd24a', '#ffb0d8', '#fff0c0', '#c8a0ff', '#ffd24a', '#ff9ad0'];
      for (i = 0; i < 26; i++) {
        var f = i / 25;
        /* Gap two thirds of the way out, soft inner and outer edges */
        var a = (f > 0.62 && f < 0.7) ? 0.04 : 0.16 + 0.34 * Math.sin(f * Math.PI) * (0.6 + rnd() * 0.4);
        r.strokeStyle = hexA(ringCols[i % ringCols.length], a);
        r.lineWidth = 2.6;
        r.beginPath();
        r.ellipse(0, 0, 330 + f * 140, 34 + f * 24, 0, Math.PI * 1.02, Math.PI * 1.98);
        r.stroke();
      }
      r.setTransform(1, 0, 0, 1, 0, 0);
      r.globalCompositeOperation = 'destination-in';
      var fade = r.createLinearGradient(0, 0, RING_W * s, 0);
      fade.addColorStop(0, 'rgba(0, 0, 0, 0)');
      fade.addColorStop(0.3, 'rgba(0, 0, 0, 1)');
      fade.addColorStop(0.75, 'rgba(0, 0, 0, 1)');
      fade.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
      r.fillStyle = fade;
      r.fillRect(0, 0, RING_W * s, RING_H * s);
    }
  }

  /* Regolith: a wrapping strip of surface material laid over the ground
     fill -- dust grain, half-buried stones lit from the upper left with
     short shadows to the lower right, and small craters whose far inner
     wall catches the sun. Features grow toward the bottom of the strip,
     which is nearer the viewer. Painted once per level and blitted. */
  var REGO_W = 840, REGO_H = 56, REGO_TOP = 10;
  var regoCv = null, regoKey = '';
  function buildRegolith() {
    var s = Math.min(2, DPR);
    var key = level.name + '@' + s;
    if (key === regoKey) return;
    regoKey = key;
    regoCv = offscreen(REGO_W * s, REGO_H * s);
    var g = regoCv.getContext('2d');
    g.scale(s, s);
    var A = level.floorColorA || '#2d1a4a', B = level.floorColorB || '#4a2a8a';
    var lightC = mixHex(level.keyLight || '#ffffff', '#ffffff', 0.5);
    var lit = mixHex(B, lightC, 0.55), dark = mixHex(A, '#05010f', 0.55);
    var rnd = lcg(4242 + level.width);
    var i, k, x, y, n;
    /* each feature is drawn at x and, near an edge, x +/- REGO_W so the
       strip wraps without a seam */
    function wrap(x, r, fn) {
      fn(x);
      if (x < r) fn(x + REGO_W);
      if (x > REGO_W - r) fn(x - REGO_W);
    }
    /* grain */
    for (i = 0; i < 2600; i++) {
      x = rnd() * REGO_W;
      y = REGO_TOP + Math.pow(rnd(), 0.8) * (REGO_H - REGO_TOP);
      var depth = (y - REGO_TOP) / (REGO_H - REGO_TOP);
      g.globalAlpha = 0.1 + rnd() * 0.22;
      g.fillStyle = rnd() < 0.5 ? lit : dark;
      var gs = 0.5 + depth * 0.9 * rnd();
      g.fillRect(x, y, gs, gs * 0.7);
    }
    g.globalAlpha = 1;
    /* faint strata streaks */
    for (i = 0; i < 18; i++) {
      x = rnd() * REGO_W; y = REGO_TOP + 4 + rnd() * (REGO_H - REGO_TOP - 6);
      var len = 30 + rnd() * 80;
      g.strokeStyle = hexA(rnd() < 0.5 ? lit : dark, 0.12);
      g.lineWidth = 0.8;
      (function (x0, y0, L) {
        wrap(x0, L, function (xx) {
          g.beginPath(); g.moveTo(xx, y0); g.quadraticCurveTo(xx + L / 2, y0 + (rnd() - 0.5) * 2, xx + L, y0); g.stroke();
        });
      })(x, y, len);
    }
    /* craters */
    n = 16;
    for (i = 0; i < n; i++) {
      x = (i + rnd() * 0.8) * REGO_W / n;
      y = REGO_TOP + 6 + rnd() * (REGO_H - REGO_TOP - 12);
      var dk = (y - REGO_TOP) / (REGO_H - REGO_TOP);
      var r = (2.5 + rnd() * 6) * (0.6 + dk * 0.8);
      (function (cx, cy, cr) {
        wrap(cx, cr + 2, function (xx) {
          var ry = cr * 0.36;
          /* raised rim: lit on the upper left, shadowed lower right */
          g.fillStyle = hexA(lit, 0.55);
          g.beginPath(); g.ellipse(xx - 0.6, cy - 0.6, cr + 1.4, ry + 1, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = hexA(dark, 0.45);
          g.beginPath(); g.ellipse(xx + 0.8, cy + 0.7, cr + 1.2, ry + 0.9, 0, 0, Math.PI * 2); g.fill();
          /* bowl in shadow */
          g.fillStyle = mixHex(A, '#05010f', 0.4);
          g.beginPath(); g.ellipse(xx, cy, cr, ry, 0, 0, Math.PI * 2); g.fill();
          /* far (lower right) inner wall catching the sun */
          g.save();
          g.beginPath(); g.ellipse(xx, cy, cr, ry, 0, 0, Math.PI * 2); g.clip();
          g.fillStyle = hexA(lit, 0.7);
          g.beginPath(); g.ellipse(xx + cr * 0.35, cy + ry * 0.45, cr * 0.85, ry * 0.75, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = mixHex(A, '#05010f', 0.4);
          g.beginPath(); g.ellipse(xx - cr * 0.1, cy - ry * 0.05, cr * 0.8, ry * 0.7, 0, 0, Math.PI * 2); g.fill();
          g.restore();
        });
      })(x, y, r);
    }
    /* half-buried stones */
    for (i = 0; i < 70; i++) {
      x = rnd() * REGO_W;
      y = REGO_TOP + 3 + Math.pow(rnd(), 0.7) * (REGO_H - REGO_TOP - 5);
      var dd = (y - REGO_TOP) / (REGO_H - REGO_TOP);
      var sr = (0.8 + rnd() * 2.2) * (0.5 + dd);
      (function (cx, cy, rr) {
        wrap(cx, rr * 3, function (xx) {
          g.fillStyle = hexA('#05010f', 0.35);
          g.beginPath(); g.ellipse(xx + rr * 0.9, cy + rr * 0.35, rr * 1.3, rr * 0.4, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = mixHex(B, '#05010f', 0.35);
          g.beginPath(); g.ellipse(xx, cy, rr, rr * 0.62, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = lit;
          g.beginPath(); g.ellipse(xx - rr * 0.3, cy - rr * 0.25, rr * 0.55, rr * 0.3, -0.3, 0, Math.PI * 2); g.fill();
        });
      })(x, y, sr);
    }
  }

  /* Foreground: soft dark boulders and crystal clusters along the bottom
     edge, nearer than the walking line and scrolling faster than it, so
     the frame has a front layer. Sprites are blurred once at build time
     with a shadow offset (works where canvas filters do not). */
  var fgSprites = [], fgItems = [], fgKey = '';
  function buildForeground() {
    var s = Math.min(2, DPR);
    var key = level.name + '@' + s;
    if (key === fgKey) return;
    fgKey = key;
    var rnd = lcg(733 + level.width);
    var rockC = mixHex(level.floorColorA || '#2d1a4a', '#05010f', 0.55);
    var rimC = mixHex(level.keyLight || '#ffffff', level.floorColorB || '#4a2a8a', 0.5);
    fgSprites = [];
    for (var v = 0; v < 3; v++) {
      var w = 120 + v * 30, h = 46;
      var cv = offscreen(w * s, h * s);
      var g = cv.getContext('2d');
      g.scale(s, s);
      g.shadowColor = rockC;
      g.shadowBlur = 3 * s;
      g.shadowOffsetX = 1000 * s;
      g.fillStyle = '#000';
      g.translate(-1000, 0);
      g.beginPath();
      g.moveTo(8, h);
      var bumps = 3 + v;
      for (var b = 0; b <= bumps; b++) {
        var bx = 8 + (w - 16) * b / bumps;
        var by = h - 14 - rnd() * 18 - (b > 0 && b < bumps ? 6 : 0);
        g.quadraticCurveTo(bx - (w - 16) / bumps / 2, by - 8 * rnd(), bx, by);
      }
      g.lineTo(w - 8, h);
      g.closePath();
      g.fill();
      /* a crystal cluster on the middle variant */
      if (v === 1) {
        g.fillStyle = '#000';
        g.beginPath(); g.moveTo(60, h - 20); g.lineTo(66, h - 42); g.lineTo(72, h - 20); g.fill();
        g.beginPath(); g.moveTo(70, h - 20); g.lineTo(80, h - 36); g.lineTo(82, h - 18); g.fill();
      }
      g.setTransform(s, 0, 0, s, 0, 0);
      g.shadowColor = 'rgba(0,0,0,0)';
      /* faint rim of sky light along the tops */
      g.globalCompositeOperation = 'source-atop';
      var rg = g.createLinearGradient(0, 0, 0, h);
      rg.addColorStop(0, hexA(rimC, 0.5));
      rg.addColorStop(0.5, hexA(rimC, 0));
      g.fillStyle = rg;
      g.fillRect(0, 0, w, h);
      fgSprites.push(cv);
    }
    fgItems = [];
    var span = level.width * FG_PAR + W;
    for (var x = 60 + rnd() * 200; x < span; x += 340 + rnd() * 420) {
      fgItems.push({ x: x, v: Math.floor(rnd() * 3), flip: rnd() < 0.5, dy: rnd() * 8 });
    }
  }
  var FG_PAR = 1.35;
  function drawForeground() {
    var s = Math.min(2, DPR);
    for (var i = 0; i < fgItems.length; i++) {
      var it = fgItems[i];
      var cv = fgSprites[it.v];
      var w = cv.width / s, h = cv.height / s;
      var x = it.x - camera.x * FG_PAR;
      if (x + w < 0 || x > W) continue;
      var y = H - h + 14 + it.dy;
      if (it.flip) {
        ctx.save();
        ctx.translate(x + w, y);
        ctx.scale(-1, 1);
        ctx.drawImage(cv, 0, 0, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(cv, x, y, w, h);
      }
    }
  }

  /* Each background planet is painted once (halo, shaded sphere,
     terminator, atmosphere) into its own sprite. */
  function planetSprite(item) {
    var s = Math.min(2, DPR);
    if (item.sprite && item.spriteS === s) return item.sprite;
    var pr = item.w / 2, R = pr * 1.9;
    var cv = offscreen(R * 2 * s, R * 2 * s);
    var g = cv.getContext('2d');
    g.scale(s, s);
    g.globalAlpha = item.far ? 0.3 : 0.75;
    g.drawImage(glowSprite(mixHex(item.color, '#ffffff', 0.3), 48), 0, 0, R * 2, R * 2);
    g.globalAlpha = item.far ? 0.5 : 1;
    var key = level.keyLight || '#ffffff';
    Game.ui.drawShadedPlanet(g, R, R, pr,
      mixHex(item.color, key, 0.5), mixHex(item.color, '#120830', 0.55),
      item.blobSeed > 70 ? hexA(mixHex(item.color, '#ffffff', 0.6), 0.8) : null);
    item.sprite = cv;
    item.spriteS = s;
    item.spriteR = R;
    return cv;
  }

  /* Bloom: additive halos blitted from one cached sprite per colour over
     everything that emits light. Reading the frame back and blurring it
     costs a full-frame scaled blit; this costs only the lit area. */
  function bloomHalo(x, y, r, color, a, squash) {
    var ry = r * (squash || 1);
    ctx.globalAlpha = a;
    ctx.drawImage(glowSprite(color, 32), x - r, y - ry, r * 2, ry * 2);
  }

  var WINDOW_GLOWS = ['#ffd24a', '#44ffff', '#ff88cc'];
  function drawBloom() {
    if (!Game.FX.bloom) return;
    var now = Date.now(), i;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < level.decorations.length; i++) {
      var d = level.decorations[i];
      var dx = d.x - camera.x;
      if (dx < -140 || dx > W + 140) continue;
      var dy = d.y - camera.y;
      if (d.type === 'lampPost') {
        var lc = d.color || '#44ffff';
        bloomHalo(dx, dy - 80, 56, lc, 0.55 + Math.sin(now * 0.003 + d.x * 0.01) * 0.1);
        bloomHalo(dx, dy - 80, 14, '#ffffff', 0.7);
        /* Cone of light down the pole onto the ground */
        bloomHalo(dx, dy - 36, 60, lc, 0.16, 0.9);
      } else if (d.type === 'houseDecor') {
        for (var w = 0; w < 3; w++) bloomHalo(dx - 29 + w * 28, dy - 61, 26, WINDOW_GLOWS[w], 0.5);
        bloomHalo(dx, dy - 136, 12, '#44ffff', 0.8);
        bloomHalo(dx, dy - 4, 70, '#44ffff', 0.22, 0.16);
      } else if (d.type === 'neonSign') {
        bloomHalo(dx, dy - 78, 74, d.color || '#44ffff', 0.4, 0.6);
      } else if (d.type === 'rooftopSign') {
        bloomHalo(dx, dy - 147, 70, d.color || '#44ffff', 0.45, 0.5);
      } else if (d.type === 'cafeBuilding' || d.type === 'shopBuilding') {
        bloomHalo(dx - 10, dy - 40, 84, d.type === 'cafeBuilding' ? '#ffb0a0' : '#ffe08a', 0.3, 0.6);
      } else if (d.type === 'crystal') {
        bloomHalo(dx, dy - 6, 20, GROUND_CRYSTAL_COLORS[(d.variant || 0) % 3], 0.6);
      } else if (d.type === 'antenna') {
        bloomHalo(dx, dy - (d.h || 80), 10, '#ff4466', 0.45 + Math.sin(now * 0.004 + d.x) * 0.3);
      } else if (d.type === 'mouseHouse') {
        var hk = d.small ? 0.8 : 1;
        bloomHalo(dx - 19 * hk, dy - 42 * hk, 22 * hk, '#ffcf6a', 0.5);
        bloomHalo(dx + 20 * hk, dy - 40 * hk, 17 * hk, '#ffcf6a', 0.42);
      } else if (d.type === 'cheeseStall') {
        bloomHalo(dx + 76, dy - 6, 36, '#ff8a2a', 0.42 + Math.sin(now * 0.013) * 0.06);
        if (Game.quests && Game.quests.brie === 'done') bloomHalo(dx, dy - 78, 26, '#ffd24a', 0.5);
      }
    }
    for (i = 0; i < pickups.length; i++) {
      var pk = pickups[i];
      if (!pk.active) continue;
      if (pk.crumbId) {
        if (crumbOut(pk)) bloomHalo(pk.x - camera.x + 8, pk.y - camera.y + 8, 24, '#ffd24a', 0.7);
        continue;
      }
      bloomHalo(pk.x - camera.x + 8, pk.y - camera.y + 8, 22, '#ff66cc', 0.6);
    }
    ctx.restore();
  }

  /* Finish for the rect (x, y, w, h) in game coordinates: a colour grade
     (a warm wash where the sun is, cool in the far corner) and a
     vignette, rendered together once at device resolution so each frame
     pays for a single unscaled blit. Blend-mode gradient fills cost
     several times more. Callers clip where the bezel must stay dark. */
  var finishCv = null, finishKey = '';
  function postFX(x, y, w, h) {
    var fx = Game.FX;
    if (!fx.grade && !fx.vignette) return;
    var key = w + 'x' + h + '@' + DPR + fx.grade + fx.vignette;
    if (key !== finishKey) {
      finishKey = key;
      if (!finishCv || finishCv.width !== Math.round(w * DPR) || finishCv.height !== Math.round(h * DPR)) {
        finishCv = offscreen(w * DPR, h * DPR);
      }
      var g = finishCv.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, finishCv.width, finishCv.height);
      g.scale(finishCv.width, finishCv.height);
      if (fx.grade) {
        var lg = g.createLinearGradient(0, 0, 1, 1);
        lg.addColorStop(0, 'rgba(255, 176, 150, 0.16)');
        lg.addColorStop(0.45, 'rgba(255, 176, 150, 0)');
        lg.addColorStop(0.6, 'rgba(40, 70, 190, 0)');
        lg.addColorStop(1, 'rgba(40, 70, 190, 0.2)');
        g.fillStyle = lg;
        g.fillRect(0, 0, 1, 1);
      }
      if (fx.vignette) {
        var rg = g.createRadialGradient(0.5, 0.5, 0.25, 0.5, 0.5, 0.8);
        rg.addColorStop(0, 'rgba(8, 3, 26, 0)');
        rg.addColorStop(0.6, 'rgba(8, 3, 26, 0.16)');
        rg.addColorStop(1, 'rgba(8, 3, 26, 0.6)');
        g.fillStyle = rg;
        g.fillRect(0, 0, 1, 1);
      }
    }
    ctx.drawImage(finishCv, x, y, w, h);
  }

  /* Character lighting: the sprite is painted to a scratch canvas and
     given a rim of sunlight along its upper-left edge (the sprite minus
     a copy of itself nudged away from the light). Only the sprite's own
     box is touched, so the cost follows the size of the character. */
  var LIT_PAD = 24, LIT_W = 112, LIT_H = 84;
  /* The player's box gets a wider margin: her hops, tails, cape and
     balloon reach well past her collision box. */
  var HERO_PAD = 44, HERO_LIT_W = 28 + HERO_PAD * 2, HERO_LIT_H = 34 + HERO_PAD * 2;
  var LIT_TYPES = { oliver: 1, kittycorn: 1, bob: 1, crab: 1, lila: 1, migword: 1, moonMouse: 1, chefMouse: 1 };
  var litCv = null, litCtx = null, rimCv = null, rimCtx = null, outCv = null, outCtx = null, litKey = '';
  var lampCv = null, lampCtx = null;
  /* Street lamps and neon signs also light whoever walks past: a wash of
     their colour and a rim on the side that faces them, fading out over
     LAMP_REACH px. */
  var LAMP_REACH = 120;
  function nearestLamp(x) {
    var best = null, bd = LAMP_REACH;
    for (var i = 0; i < level.decorations.length; i++) {
      var d = level.decorations[i];
      if (d.type !== 'lampPost' && d.type !== 'neonSign') continue;
      var dd = Math.abs(d.x - x);
      if (dd < bd) { bd = dd; best = d; }
    }
    if (!best) return null;
    var k = 1 - bd / LAMP_REACH;
    return { color: best.color || '#44ffff', side: best.x < x ? -1 : 1, k: k * k };
  }
  function drawLit(e) {
    if (!Game.FX.rim) { e.draw(ctx, camera.x, camera.y); return; }
    var key = DPR + level.name;
    if (key !== litKey) {
      litKey = key;
      var LW = Math.max(LIT_W, HERO_LIT_W), LH = Math.max(LIT_H, HERO_LIT_H);
      litCv = offscreen(LW * DPR, LH * DPR);
      rimCv = offscreen(LW * DPR, LH * DPR);
      litCtx = litCv.getContext('2d');
      rimCtx = rimCv.getContext('2d');
      litCtx.scale(DPR, DPR);
      rimCtx.fillStyle = mixHex(level.keyLight || '#ffffff', '#ffffff', 0.55);
      outCv = offscreen(LW * DPR, LH * DPR);
      outCtx = outCv.getContext('2d');
      outCtx.fillStyle = '#2a0c52';
      lampCv = offscreen(LW * DPR, LH * DPR);
      lampCtx = lampCv.getContext('2d');
    }
    var pad = e === player ? HERO_PAD : LIT_PAD;
    /* Momoko is placed to the sub-pixel so her blended position glides;
       the NPCs stay snapped to whole pixels. */
    var sx = e.x - camera.x, sy = e.y - camera.y;
    if (e === player) { sx -= pad; sy -= pad; }
    else { sx = Math.round(sx) - pad; sy = Math.round(sy) - pad; }
    var w = e.w + pad * 2, h = e.h + pad * 2;
    /* Backlight so the character separates from the scenery */
    if (Game.FX.bloom) {
      ctx.globalCompositeOperation = 'lighter';
      bloomHalo(sx + w / 2, sy + h / 2, Math.max(e.w, e.h) * 1.15, level.keyLight || '#ffffff', e === player ? 0.5 : 0.32);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    var pw = w * DPR, ph = h * DPR;
    litCtx.clearRect(0, 0, w, h);
    e.draw(litCtx, e.x - pad, e.y - pad);
    rimCtx.clearRect(0, 0, pw, ph);
    rimCtx.globalCompositeOperation = 'source-over';
    rimCtx.drawImage(litCv, 0, 0, pw, ph, 0, 0, pw, ph);
    rimCtx.globalCompositeOperation = 'destination-out';
    rimCtx.drawImage(litCv, 0, 0, pw, ph, 1.5 * DPR, 1.6 * DPR, pw, ph);
    rimCtx.globalCompositeOperation = 'source-in';
    rimCtx.fillRect(0, 0, pw, ph);
    /* The player also gets a dark violet outline (her silhouette nudged
       four ways) so she holds her edge against the pink house fronts. */
    if (e === player) {
      var o = 1.3 * DPR;
      outCtx.clearRect(0, 0, pw, ph);
      outCtx.globalCompositeOperation = 'source-over';
      outCtx.drawImage(litCv, 0, 0, pw, ph, -o, 0, pw, ph);
      outCtx.drawImage(litCv, 0, 0, pw, ph, o, 0, pw, ph);
      outCtx.drawImage(litCv, 0, 0, pw, ph, 0, -o, pw, ph);
      outCtx.drawImage(litCv, 0, 0, pw, ph, 0, o, pw, ph);
      outCtx.globalCompositeOperation = 'source-in';
      outCtx.fillRect(0, 0, pw, ph);
      ctx.globalAlpha = 0.8;
      ctx.drawImage(outCv, 0, 0, pw, ph, sx, sy, w, h);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(litCv, 0, 0, pw, ph, sx, sy, w, h);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(rimCv, 0, 0, pw, ph, sx, sy, w, h);
    ctx.globalAlpha = 1;
    var lamp = nearestLamp(e.x + e.w / 2);
    if (lamp && lamp.k > 0.02) {
      lampCtx.globalCompositeOperation = 'copy';
      lampCtx.drawImage(litCv, 0, 0, pw, ph, 0, 0, pw, ph);
      lampCtx.globalCompositeOperation = 'source-in';
      lampCtx.fillStyle = lamp.color;
      lampCtx.fillRect(0, 0, pw, ph);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = lamp.k * 0.2;
      ctx.drawImage(lampCv, 0, 0, pw, ph, sx, sy, w, h);
      /* keep only the edge facing the lamp */
      lampCtx.globalCompositeOperation = 'destination-out';
      lampCtx.drawImage(litCv, 0, 0, pw, ph, -lamp.side * 1.8 * DPR, 1.2 * DPR, pw, ph);
      ctx.globalAlpha = Math.min(1, lamp.k * 1.3);
      ctx.drawImage(lampCv, 0, 0, pw, ph, sx, sy, w, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function initBgLayers() {
    bgLayers = [];
    buildSky();
    buildRegolith();
    buildForeground();

    /* Far layer – a few big, faint planets that barely move, so the mid
       planets read as nearer and the sky gets a second depth step. */
    var farLayer = [];
    var bgColorsFar = level && level.bgLayer1 ? level.bgLayer1 : ['#4a2878', '#5a2888', '#3a1868'];
    for (var fp = 0; fp < 4; fp++) {
      farLayer.push({
        x: fp * 1300 + 200 + Math.random() * 300,
        y: 40 + Math.random() * 70,
        w: 50 + Math.random() * 40,
        h: 60,
        color: bgColorsFar[fp % bgColorsFar.length],
        blobSeed: Math.random() * 100,
        isPlanet: true,
        far: true,
      });
    }
    bgLayers.push({ items: farLayer, parallax: 0.06 });

    /* Layer 1 – mid-distance planets & moons */
    var layer1 = [];
    var bgColors1 = level && level.bgLayer1 ? level.bgLayer1 : ['#4a2878', '#5a2888', '#3a1868'];
    for (var j = 0; j < 12; j++) {
      layer1.push({
        x: j * 460 + Math.random() * 80,
        y: 80 + Math.random() * 180,
        w: 40 + Math.random() * 60,
        h: 40 + Math.random() * 60,
        color: bgColors1[Math.floor(Math.random() * bgColors1.length)],
        blobSeed: Math.random() * 100,
        isPlanet: true,
      });
    }
    bgLayers.push({ items: layer1, parallax: 0.3 });

    /* Layer 2 – closer asteroid silhouettes */
    var layer2 = [];
    var bgColors2 = level && level.bgLayer2 ? level.bgLayer2 : ['#2d1a4a', '#321d52', '#28154a'];
    for (var k = 0; k < 20; k++) {
      layer2.push({
        x: k * 280 + Math.random() * 120,
        y: 340 + Math.random() * 60,
        w: 40 + Math.random() * 60,
        h: 25 + Math.random() * 35,
        color: bgColors2[Math.floor(Math.random() * bgColors2.length)],
        blobSeed: Math.random() * 100,
      });
    }
    bgLayers.push({ items: layer2, parallax: 0.5 });

    /* Background UFO trails (tiny lights in formation — replaces fish schools) */
    bgFishSchools = [];
    for (var fs = 0; fs < 3; fs++) {
      var school = { x: Math.random() * (level ? level.width : 5600), y: 80 + Math.random() * 140, speed: 0.15 + Math.random() * 0.3, dir: Math.random() > 0.5 ? 1 : -1, fish: [] };
      var count = 4 + Math.floor(Math.random() * 3);
      for (var fi = 0; fi < count; fi++) {
        school.fish.push({ ox: fi * 14 - count * 7, oy: Math.random() * 10 - 5, phase: Math.random() * Math.PI * 2 });
      }
      bgFishSchools.push(school);
    }

    /* Ground details, spaced along the whole level with a fixed seed so
       the surface looks the same every visit. */
    groundDetails = [];
    var lw = level ? level.width : 5600;
    var gSeed = 1234 + lw;
    var gx = 40;
    while (gx < lw) {
      gSeed = (gSeed * 1103515245 + 12345) & 0x7fffffff;
      var roll = gSeed % 100;
      var kind = roll < 34 ? 'crater' : roll < 52 ? 'dust' : roll < 64 ? 'prints'
               : roll < 80 ? 'pebbles' : roll < 88 ? 'critter' : 'crystal';
      gSeed = (gSeed * 1103515245 + 12345) & 0x7fffffff;
      var off = 9 + gSeed % 20;
      gSeed = (gSeed * 1103515245 + 12345) & 0x7fffffff;
      var r = 4 + gSeed % 8;
      groundDetails.push({
        x: gx, kind: kind,
        off: (kind === 'crystal' || kind === 'critter') ? 3 : off,
        r: kind === 'dust' ? r * 2.2 : r,
        color: GROUND_CRYSTAL_COLORS[gSeed % 3],
      });
      gSeed = (gSeed * 1103515245 + 12345) & 0x7fffffff;
      gx += 44 + gSeed % 64;
    }

    /* Twinkling stars – dense field, per-star twinkle phase */
    currentMotes = [];
    for (var cm = 0; cm < 80; cm++) {
      currentMotes.push({
        x: Math.random() * W,
        y: Math.random() * H * 0.75, /* upper 3/4 of screen */
        speed: 0, /* stars don't drift — they twinkle in place */
        alpha: 0.4 + Math.random() * 0.5,
        size: 0.6 + Math.random() * 1.4,
        twinkle: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.02 + Math.random() * 0.04,
        color: cm % 13 === 0 ? '#44ffff' : (cm % 17 === 0 ? '#ff66cc' : '#ffffff'),
      });
    }
  }

  /* ---- Ambient bubbles ---- */
  function initAmbientBubbles() {
    ambientBubbles = [];
    for (var i = 0; i < 70; i++) {
      ambientBubbles.push(new Game.entities.AmbientBubble(
        Math.random() * (level ? level.width : W),
        Math.random() * H,
        level && level.dustColors
      ));
    }
  }

  /* ---- Level loading ---- */
  function loadLevel(index) {
    level = Game.levels.get(index);
    if (!level) return;

    /* Player */
    var sp = level.spawns.player;
    player = new Game.entities.Momoko(sp.x, sp.y);

    /* Enemies – friendly aliens (Fish class). */
    enemies = [];
    for (var i = 0; i < level.spawns.enemies.length; i++) {
      var e = level.spawns.enemies[i];
      if (e.type === 'fish' || e.type === 'alien') {
        enemies.push(new Game.entities.Fish(e.x, e.y, e.pattern, e.dir, e.species));
      }
    }

    /* NPCs */
    npcs = [];
    npcCooldowns = {};
    for (var n = 0; n < level.spawns.npcs.length; n++) {
      var nd = level.spawns.npcs[n];
      var npcEntity;
      if (nd.type === 'oliver') npcEntity = new Game.entities.Oliver(nd.x, nd.y);
      else if (nd.type === 'kittycorn') npcEntity = new Game.entities.KittyCorn(nd.x, nd.y);
      else if (nd.type === 'bob') npcEntity = new Game.entities.Bob(nd.x, nd.y);
      else if (nd.type === 'crab') npcEntity = new Game.entities.Crab(nd.x, nd.y);
      else if (nd.type === 'lila' && Game.entities.Lila) npcEntity = new Game.entities.Lila(nd.x, nd.y);
      else if (nd.type === 'migword' && Game.entities.MigWord) npcEntity = new Game.entities.MigWord(nd.x, nd.y);
      else if (nd.type === 'moonMouse' && Game.entities.MoonMouse) npcEntity = new Game.entities.MoonMouse(nd.x, nd.y, nd.mouseId, nd.color);
      else if (nd.type === 'chefMouse') npcEntity = new Game.entities.ChefMouse(nd.x, nd.y);
      else if (nd.type === 'telescope') npcEntity = new Game.entities.Telescope(nd.x, nd.y);
      else if (nd.type === 'rocket' && Game.entities.RocketShip) npcEntity = new Game.entities.RocketShip(nd.x, nd.y);
      else if (nd.type === 'houseDoor' && Game.entities.HouseDoor) npcEntity = new Game.entities.HouseDoor(nd.x, nd.y, nd.houseId, nd.painted);
      else if (nd.type === 'cafeDoor' && Game.entities.CafeDoor) npcEntity = new Game.entities.CafeDoor(nd.x, nd.y);
      else if (nd.type === 'shopDoor' && Game.entities.ShopDoor) npcEntity = new Game.entities.ShopDoor(nd.x, nd.y);
      if (npcEntity) npcs.push({ entity: npcEntity, type: nd.type, data: nd });
    }

    /* Pickups – star gems for Lila's quest. */
    pickups = [];
    for (var p = 0; p < level.spawns.pickups.length; p++) {
      var pd = level.spawns.pickups[p];
      if (pd.type === 'crumb') pickups.push(new Game.entities.CrumbPickup(pd.x, pd.y, pd.id));
      else pickups.push(new Game.entities.HeartPickup(pd.x, pd.y));
    }

    /* Wolfe */
    if (level.wolfe) {
      wolfe = new Game.entities.Wolfe(level.wolfe.x, level.wolfe.y, level.wolfe.patrolWidth);
    } else {
      wolfe = null;
    }

    /* Bubbles & particles */
    bubbles = [];
    particles = [];

    bouncers = level.decorations.filter(function (d) { return d.type === 'cheeseBounce'; });

    initBgLayers();
    initAmbientBubbles();
    bgUfoX = (level && level.bgUfo && level.bgUfo.dir === -1) ? level.width : -100;
  }

  /* Friendly background UFO — saucer with a glowing dome and running lights. */
  function drawBgUfo(c, sx, sy) {
    c.save();
    /* Glow halo */
    var glow = c.createRadialGradient(sx, sy + 4, 6, sx, sy + 4, 60);
    glow.addColorStop(0, 'rgba(180,255,255,0.35)');
    glow.addColorStop(1, 'rgba(180,255,255,0)');
    c.fillStyle = glow;
    c.beginPath();
    c.arc(sx, sy + 4, 60, 0, Math.PI * 2);
    c.fill();
    /* Saucer disc */
    c.fillStyle = '#bbcdd8';
    c.beginPath();
    c.ellipse(sx, sy + 6, 36, 8, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#7d8896';
    c.beginPath();
    c.ellipse(sx, sy + 9, 30, 4, 0, 0, Math.PI * 2);
    c.fill();
    /* Dome */
    c.fillStyle = '#88ddee';
    c.beginPath();
    c.ellipse(sx, sy + 4, 16, 11, 0, Math.PI, 0);
    c.fill();
    /* Dome shine */
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.beginPath();
    c.ellipse(sx - 5, sy - 2, 5, 2.4, -0.4, 0, Math.PI * 2);
    c.fill();
    /* Running lights */
    var t = Date.now() * 0.005;
    var lightCols = ['#ff66cc', '#ffd24a', '#44ffff', '#44ff88'];
    for (var rl = 0; rl < 5; rl++) {
      var lx = sx - 24 + rl * 12;
      var on = (Math.sin(t + rl) + 1) * 0.5;
      c.globalAlpha = 0.6 + on * 0.4;
      c.fillStyle = lightCols[rl % lightCols.length];
      c.beginPath();
      c.arc(lx, sy + 9, 1.8, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    /* Tractor beam — soft wedge below */
    var beam = c.createLinearGradient(sx, sy + 10, sx, sy + 60);
    beam.addColorStop(0, 'rgba(180,255,255,0.35)');
    beam.addColorStop(1, 'rgba(180,255,255,0)');
    c.fillStyle = beam;
    c.beginPath();
    c.moveTo(sx - 8, sy + 11);
    c.lineTo(sx + 8, sy + 11);
    c.lineTo(sx + 22, sy + 60);
    c.lineTo(sx - 22, sy + 60);
    c.closePath();
    c.fill();
    c.restore();
  }

  /* If both quests have completed, drop into VICTORY after a short beat. */
  function checkVictory() {
    if (!Game.quests) return;
    if (Game.quests.lila === 'done' &&
        Game.quests.migword === 'done' &&
        state === State.PLAYING) {
      setTimeout(function () {
        if (state === State.PLAYING) {
          state = State.VICTORY;
          Game.audio.stopMusic();
          Game.audio.play('victory');
        }
      }, 800);
    }
  }

  /* Chef Brie's golden crumbs are out while her quest runs, until
     each one is picked up. */
  function crumbCount() {
    var got = Game.quests.progress.crumbs || {}, n = 0;
    for (var k in got) if (got[k]) n++;
    return n;
  }
  function crumbOut(p) {
    return Game.quests.brie === 'inProgress' && !(Game.quests.progress.crumbs || {})[p.crumbId];
  }

  function closeTelescope() {
    Game.audio.play('select');
    state = State.PLAYING;
  }

  /* ---- Collision helpers ---- */
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function circleRect(cx, cy, cr, rx, ry, rw, rh) {
    var nearX = Math.max(rx, Math.min(cx, rx + rw));
    var nearY = Math.max(ry, Math.min(cy, ry + rh));
    var dx = cx - nearX;
    var dy = cy - nearY;
    return (dx * dx + dy * dy) < (cr * cr);
  }

  /* ---- Update ---- */
  function update() {
    Game.input.update();
    var keys = Game.input.keys;
    var jp = Game.input.justPressed;

    switch (state) {
      case State.TITLE:
        /* Title animation handled by ui.js */
        break;

      case State.CUSTOMIZE:
        /* Customization screen handled by ui.js */
        break;

      case State.INTRO:
        /* Intro backstory handled by ui.js */
        break;

      case State.PLAYING:
        if (jp.pause) { prevState = State.PLAYING; state = State.PAUSED; return; }

        /* Player */
        player.update(keys, level);

        /* Bounce craters: landing on (or standing on) one boings her up
           well past her normal float speed. */
        for (var bo = 0; bo < bouncers.length; bo++) {
          var bc = bouncers[bo];
          if (bc.cool > 0) bc.cool--;
          bc.squish = (bc.squish || 0) * 0.9;
          if (!(bc.cool > 0) && Math.abs(player.x + player.w / 2 - bc.x) < 26 &&
              player.y + player.h >= level.floorY - 3 && player.vy >= -0.5) {
            player.vy = -9;
            player.boost = 6;
            bc.squish = 1;
            bc.cool = 24;
            particles = particles.concat(
              Game.entities.spawnBurst(bc.x, level.floorY - 4, 7, ['#ffd24a', '#fff0b8', '#ffb238'])
            );
            if (player.react) player.react('cheer');
            Game.audio.play('boing');
          }
        }

        /* Bubbles (still ticked so any in-flight effects fade out
           cleanly; the action button no longer spawns new ones — it
           is now the universal "interact" trigger handled below). */
        for (var bi = bubbles.length - 1; bi >= 0; bi--) {
          bubbles[bi].update();
          if (!bubbles[bi].active) bubbles.splice(bi, 1);
        }

        /* Enemies */
        for (var ei = 0; ei < enemies.length; ei++) {
          enemies[ei].update();
        }

        /* NPCs */
        for (var ni = 0; ni < npcs.length; ni++) {
          npcs[ni].entity.update();
        }

        /* Pickups */
        for (var pi = 0; pi < pickups.length; pi++) {
          pickups[pi].update();
        }

        /* Wolfe */
        if (wolfe) wolfe.update();

        /* Ambient bubbles */
        for (var ab = 0; ab < ambientBubbles.length; ab++) {
          ambientBubbles[ab].update(level.height);
        }

        /* Particles */
        for (var pa = particles.length - 1; pa >= 0; pa--) {
          particles[pa].update();
          if (!particles[pa].active) particles.splice(pa, 1);
        }

        /* ---- Collisions ---- */

        /* Sparkle vs friendly aliens — aliens twirl happily, no defeat */
        for (var bei = bubbles.length - 1; bei >= 0; bei--) {
          var bub = bubbles[bei];
          if (!bub.active) continue;
          for (var ej = 0; ej < enemies.length; ej++) {
            var en = enemies[ej];
            if (!en.active) continue;
            if (circleRect(bub.x, bub.y, bub.r, en.x, en.y, en.w, en.h)) {
              bub.active = false;
              if (typeof en.delight === 'function') {
                en.delight();
              }
              var heartColors = ['#ff88cc', '#ffd24a', '#44ffff'];
              particles = particles.concat(
                Game.entities.spawnBurst(bub.x, bub.y, 5, heartColors)
              );
              Game.audio.play('pickup');
              break;
            }
          }
        }

        /* Aliens don't hurt Momoko anymore — skipped.
           This is a "comfortable RPG" for a 7-year-old. */

        /* Player vs pickups — exploration only, all pickups are star gems
           that count for Lila's quest. */
        for (var pk = 0; pk < pickups.length; pk++) {
          var pick = pickups[pk];
          if (!pick.active) continue;
          /* Golden crumbs count for Chef Brie and stay picked up. */
          if (pick.crumbId) {
            if (crumbOut(pick) && aabb(player, pick)) {
              pick.active = false;
              Game.quests.progress.crumbs[pick.crumbId] = true;
              savePersistent();
              particles = particles.concat(
                Game.entities.spawnBurst(pick.x + 8, pick.y + 8, 8, ['#ffd24a', '#fff0b8', '#ff9a3a'])
              );
              if (player.react) player.react('cheer');
              Game.audio.play('pickup');
            }
            continue;
          }
          if (aabb(player, pick)) {
            pick.active = false;
            if (Game.quests && Game.quests.lila === 'inProgress') {
              Game.quests.progress.gems = (Game.quests.progress.gems || 0) + 1;
              if (Game.quests.progress.gems >= 5) {
                Game.quests.lila = 'done';
              }
              savePersistent();
            }
            var hColors = ['#44ffff', '#ff66cc', '#ffd24a'];
            particles = particles.concat(
              Game.entities.spawnBurst(pick.x + 8, pick.y + 8, 8, hColors)
            );
            if (player.react) player.react('cheer');
            Game.audio.play('pickup');
            checkVictory();
          }
        }

        /* Player vs NPCs – trigger dialogue (or rocket/house interaction) */
        for (var nc = 0; nc < npcs.length; nc++) {
          var npc = npcs[nc].entity;
          var npcType = npcs[nc].type;
          var npcData = npcs[nc].data || {};
          /* Each house door keeps its own cooldown, so stepping out of
             one door never blocks the next one along the street (the
             village doors are only a couple of seconds apart). */
          var cdKey = npcType === 'houseDoor' ? 'houseDoor:' + npcData.houseId : npcType;
          var dist = Math.sqrt(
            Math.pow(player.x - npc.x, 2) + Math.pow(player.y - npc.y, 2)
          );
          if (dist < 80 && !npc.talking && (!npcCooldowns[cdKey] || npcCooldowns[cdKey] <= 0)) {
            /* Universal "interact" trigger: action button (Sparkle on
               touch, Space/Z on keyboard) or Up. */
            var interact = jp.up || keys.up || jp.action;
            /* Rocket – open travel menu. */
            if (npcType === 'rocket') {
              if (interact) {
                onRocketInteract();
                npcCooldowns[npcType] = 300;
              }
            } else if (npcType === 'houseDoor') {
              if (interact) {
                var hid = npcData.houseId || 'heroHome';
                /* Deliver any carried shop items into this house's
                   furniture state, scattered across the floor (the moon
                   village rooms have no furniture, so the cart waits). */
                if (Game.shop && Game.shop.cart && Game.shop.cart.length > 0 &&
                    !(Game.ui.isMoonRoom && Game.ui.isMoonRoom(hid))) {
                  depositCartIntoHouse(hid);
                }
                enterHouse(hid);
                npcCooldowns[cdKey] = 150;
              }
            } else if (npcType === 'cafeDoor') {
              if (interact) {
                enterCafe();
                npcCooldowns[npcType] = 300;
              }
            } else if (npcType === 'shopDoor') {
              if (interact) {
                enterShop();
                npcCooldowns[npcType] = 300;
              }
            } else if (npcType === 'lila') {
              if (npc.interact) npc.interact();
              if (player.react) player.react('wave');
              /* Start quest on first contact */
              if (Game.quests && Game.quests.lila === 'notStarted') {
                Game.quests.lila = 'inProgress';
                Game.quests.progress.gems = Game.quests.progress.gems || 0;
                savePersistent();
              }
              npcCooldowns[npcType] = 300;
            } else if (npcType === 'migword') {
              if (npc.interact) npc.interact();
              if (player.react) player.react('wave');
              if (Game.quests && Game.quests.migword === 'notStarted') {
                Game.quests.migword = 'inProgress';
                Game.quests.progress.cheese = Game.quests.progress.cheese || 0;
                Game.quests.progress.miceMet = Game.quests.progress.miceMet || {};
                savePersistent();
              }
              npcCooldowns[npcType] = 300;
            } else if (npcType === 'telescope') {
              if (interact) {
                state = State.TELESCOPE;
                telescopeAt = performance.now();
                Game.audio.play('select');
                npcCooldowns[npcType] = 300;
              }
            } else if (npcType === 'chefMouse') {
              /* Chef Brie: asks for 5 golden crumbs, bakes the moon cheese
                 cake when Momoko brings them all back. */
              var bq = Game.quests, line;
              if (bq.brie === 'done') {
                line = 'brieThanks';
              } else if (bq.brie === 'inProgress' && crumbCount() >= 5) {
                bq.brie = 'done';
                line = 'brieBake';
                savePersistent();
                particles = particles.concat(
                  Game.entities.spawnBurst(npc.x + 80, npc.y - 20, 18, ['#ff66cc', '#ffd24a', '#44ddff', '#88dd66'])
                );
                Game.audio.play('victory');
              } else {
                line = bq.brie === 'inProgress' ? 'brieMore' : 'brieGreet';
                if (bq.brie !== 'inProgress') {
                  bq.brie = 'inProgress';
                  savePersistent();
                }
              }
              npc.interact(line);
              if (player.react) player.react(line === 'brieBake' ? 'cheer' : 'wave');
              npcCooldowns[npcType] = 360;
            } else if (npcType === 'moonMouse') {
              if (npc.interact) npc.interact();
              if (player.react) player.react('wave');
              /* Greeting a moon mouse advances MigWord's quest, but only
                 once per unique mouse. */
              var mid = npcData.mouseId;
              if (mid && Game.quests && Game.quests.migword === 'inProgress') {
                Game.quests.progress.miceMet = Game.quests.progress.miceMet || {};
                if (!Game.quests.progress.miceMet[mid]) {
                  Game.quests.progress.miceMet[mid] = true;
                  Game.quests.progress.cheese = (Game.quests.progress.cheese || 0) + 1;
                  if (Game.quests.progress.cheese >= 3) {
                    Game.quests.migword = 'done';
                  }
                  savePersistent();
                  checkVictory();
                }
              }
              npcCooldowns[npcType] = 240;
            } else {
              if (npc.interact) npc.interact();
              if (player.react) player.react('wave');
              npcCooldowns[npcType] = 300;
            }
          }
          if (npcCooldowns[cdKey] > 0) npcCooldowns[cdKey]--;
        }

        /* Rings-view cutscene disabled in Momoko in Space — the town is open
           sky; no ocean surface to break. */

        /* Camera follow; it tightens with her turbo so she trails the
           centre by about as much at 2x as at walking speed. */
        var targetCamX = player.x - W / 2 + player.w / 2;
        var targetCamY = player.y - H / 2 + player.h / 2;
        var camK = 0.08 * (player.turboEase || 1);
        camera.x += (targetCamX - camera.x) * camK;
        camera.y += (targetCamY - camera.y) * camK;
        /* Clamp camera */
        if (camera.x < 0) camera.x = 0;
        if (camera.x > level.width - W) camera.x = level.width - W;
        camera.y = Math.max(0, Math.min(camera.y, level.height - H));
        /* For this game, clamp y to keep the view mostly stable */
        camera.y = 0; /* Single-screen height */

        break;

      case State.PAUSED:
        if (jp.pause) { state = State.PLAYING; }
        break;

      case State.GAME_OVER:
        break;

      case State.VICTORY:
        /* Particles still update for fireworks */
        break;

      case State.BEACH:
        if (wolfe) wolfe.update();
        if (Game.ui.updateBeach) Game.ui.updateBeach(keys, jp);
        break;

      case State.TRAVEL_MENU:
        if (jp.pause) { state = State.PLAYING; }
        if (Game.ui.updateTravelMenu) Game.ui.updateTravelMenu(keys, jp);
        break;

      case State.ROCKET_ANIM:
        rocketAnimTimer++;
        /* ~2 seconds at 60fps */
        if (rocketAnimTimer > 120) {
          enterZone(rocketTarget);
        }
        break;

      case State.HOUSE_INTERIOR:
        if (jp.pause) { exitHouse(); }
        if (Game.ui.updateHouseInterior) Game.ui.updateHouseInterior(keys, jp, currentHouseId);
        break;

      case State.CAFE_INTERIOR:
        if (jp.pause) { exitCafe(); }
        if (Game.ui.updateCafeInterior) Game.ui.updateCafeInterior(keys, jp);
        break;

      case State.SHOP_INTERIOR:
        if (jp.pause) { exitShop(); }
        if (Game.ui.updateShopInterior) Game.ui.updateShopInterior(keys, jp);
        break;

      case State.TELESCOPE:
        if (jp.action || jp.pause) closeTelescope();
        break;
    }
  }

  /* ---- Render ---- */
  /* Runs fn with drawing clipped to the game viewport. The overlay
     states (pause, game over) widen the view to the whole canvas on
     tablets so their scrim covers the bezel too; the frozen scene under
     the menu still has to stay inside the 800x480 window. */
  function drawClipped(fn) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    fn();
    ctx.restore();
  }

  function render() {
    if (state !== renderedState) {
      if (renderedState !== null && irisPair(renderedState, state)) startIris();
      renderedState = state;
    }
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    /* Paint side-strip backgrounds first so they sit underneath the pause
       button (which is drawn last, in canvas space). The game viewport in
       the middle is fully overwritten by the state renderer below, so it
       doesn't matter that we paint across it here. */
    /* Menu screens and the rocket flight have no touch controls, so on
       a tablet they paint their own starfield across the whole canvas
       instead of sitting in a dark frame. Gameplay keeps the bezel so the D-pad has a quiet
       backdrop. */
    var fullBleed = Game.input.isTouch() && (
      state === State.TITLE || state === State.CUSTOMIZE ||
      state === State.INTRO || state === State.VICTORY ||
      state === State.ROCKET_ANIM || state === State.TELESCOPE);
    /* Pause and game-over dim the whole screen, bezel included, so the
       menu floats over the frozen game instead of a bright island. */
    var dimAll = Game.input.isTouch() && (
      state === State.PAUSED || state === State.GAME_OVER || state === State.TRAVEL_MENU);
    if (Game.input.isTouch() && !fullBleed) {
      Game.input.drawTouchStrip(ctx, false);
    }

    /* Translate so all game / menu rendering keeps using logical 0..W,
       0..H coordinates regardless of the side / top / bottom padding. */
    ctx.save();
    if (GAME_X || GAME_Y) ctx.translate(GAME_X, GAME_Y);
    if (fullBleed || dimAll) {
      Game.ui.setView(-GAME_X, -GAME_Y, CANVAS_W, CANVAS_H);
    } else {
      Game.ui.setView(0, 0, W, H);
      /* Keep the world inside the viewport so it can't bleed into the
         touch bezels. */
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();
    }
    if (Game.ui.beginFrame) Game.ui.beginFrame();

    switch (state) {
      case State.TITLE:
        Game.ui.drawTitleScreen(ctx);
        break;

      case State.CUSTOMIZE:
        Game.ui.drawCustomizeScreen(ctx);
        break;

      case State.INTRO:
        Game.ui.drawIntroScreen(ctx);
        break;

      case State.PLAYING:
        renderGame();
        if (Game.ui.drawQuestHUD) Game.ui.drawQuestHUD(ctx);
        if (Game.ui.drawVersionStamp) Game.ui.drawVersionStamp(ctx);
        /* Dialogue is deferred to canvas-space after the restore so it
           can live in the bottom bezel instead of covering gameplay. */
        pendingDialogue = null;
        for (var nd = 0; nd < npcs.length; nd++) {
          var npc = npcs[nd].entity;
          if (npc.talking) {
            var name = npcs[nd].type;
            var speakerName;
            if (name === 'oliver') speakerName = 'Oliver';
            else if (name === 'kittycorn') speakerName = 'Kitty Corn';
            else if (name === 'bob') speakerName = 'Bob';
            else if (name === 'crab') speakerName = Game.i18n.t('crabName');
            else if (name === 'lila') speakerName = 'Lila';
            else if (name === 'migword') speakerName = 'MigWord';
            else if (name === 'moonMouse') speakerName = Game.i18n.t('mouseName');
            else if (name === 'chefMouse') speakerName = Game.i18n.t('brieName');
            else speakerName = name;
            var text = npc.currentJoke || npc.currentText || '';
            pendingDialogue = { speaker: speakerName, text: text, entity: npc };
          }
        }
        break;

      case State.TRAVEL_MENU:
        drawClipped(renderGame);
        if (Game.ui.drawTravelMenu) Game.ui.drawTravelMenu(ctx);
        break;

      case State.ROCKET_ANIM:
        if (Game.ui.drawRocketAnim) Game.ui.drawRocketAnim(ctx, rocketAnimTimer, rocketTarget);
        break;

      case State.HOUSE_INTERIOR:
        if (Game.ui.drawHouseInterior) Game.ui.drawHouseInterior(ctx, currentHouseId, player);
        break;

      case State.CAFE_INTERIOR:
        if (Game.ui.drawCafeInterior) Game.ui.drawCafeInterior(ctx);
        break;

      case State.SHOP_INTERIOR:
        if (Game.ui.drawShopInterior) Game.ui.drawShopInterior(ctx);
        break;

      case State.TELESCOPE:
        if (Game.ui.drawTelescopeView) Game.ui.drawTelescopeView(ctx);
        break;

      case State.PAUSED:
        drawClipped(renderGame);
        Game.ui.drawPauseMenu(ctx);
        break;

      case State.GAME_OVER:
        drawClipped(renderGame);
        Game.ui.drawGameOver(ctx);
        break;

      case State.VICTORY:
        Game.ui.drawVictory(ctx);
        break;

      case State.BEACH:
        Game.ui.drawBeachCutscene(ctx, wolfe);
        break;
    }

    ctx.restore();

    updateChrome();

    /* Canvas-space overlays sit outside the game viewport so they can
       use the bezel area. */
    if (Game.input.isTouch() && (state === State.PLAYING || state === State.PAUSED)) {
      /* QR code in the upper-right bezel inviting another player to scan.
         Sized to fit between the pause button (top) and the BUBBLE
         action button (middle) even on a short iPhone canvas. */
      var rightCx = CANVAS_W - Game.TOUCH_RIGHT_W / 2;
      var qrSize = Math.min(Game.TOUCH_RIGHT_W - 16, 110);
      var qrCy = 62 + qrSize / 2;
      if (qrSize >= 60 && Game.ui.drawQRCode) {
        Game.ui.drawQRCode(ctx, rightCx, qrCy, qrSize);
      }
    }
    if (Game.input.isTouch() && (
        state === State.PLAYING ||
        state === State.BEACH ||
        state === State.HOUSE_INTERIOR ||
        state === State.CAFE_INTERIOR ||
        state === State.SHOP_INTERIOR)) {
      Game.input.drawTouchButtons(ctx);
    }

    /* Dialogue – drawn in canvas-space so it lives in the bottom bezel. */
    if (state === State.PLAYING && pendingDialogue && Game.ui.drawDialogue) {
      Game.ui.drawDialogue(
        ctx,
        pendingDialogue.speaker,
        pendingDialogue.text,
        CANVAS_W, CANVAS_H, GAME_X, GAME_Y,
        pendingDialogue.entity
      );
    }

    heroOnCanvas(heroAt);
    if (iris) drawIris();
  }

  /* DOM bits that track the game state: the Game Center link only shows
     where it can't cover play, and the cursor turns into a pointer over
     anything clickable. */
  var linkEl = null, lastLinkShown = null, lastCursor = null;
  function updateChrome() {
    if (!linkEl) linkEl = document.getElementById('game-center-link');
    var show = state === State.TITLE || state === State.PAUSED;
    if (linkEl && show !== lastLinkShown) {
      linkEl.classList.toggle('hidden', !show);
      lastLinkShown = show;
    }
    var cursor = Game.ui.isHot && Game.ui.isHot() ? 'pointer' : 'default';
    if (cursor !== lastCursor) { canvas.style.cursor = cursor; lastCursor = cursor; }
  }

  function renderGame() {
    if (!level) return;

    /* Sky: cached gradient + horizon glow + sun, then the nebula and
       star-dust tile drifting slowly behind everything. */
    ctx.drawImage(skyCv, 0, 0, W, H);
    var nebX = -Math.round((camera.x * 0.05) % NEB_W * DPR) / DPR;
    ctx.drawImage(nebCv, nebX, 0, NEB_W, H);
    if (nebX + NEB_W < W) ctx.drawImage(nebCv, nebX + NEB_W, 0, NEB_W, H);

    /* Twinkling stars (in screen-space so they stay still while camera scrolls) */
    ctx.save();
    for (var mi = 0; mi < currentMotes.length; mi++) {
      var mote = currentMotes[mi];
      mote.twinkle += mote.twinkleSpeed;
      var pulse = 0.5 + 0.5 * Math.sin(mote.twinkle);
      ctx.globalAlpha = mote.alpha * (0.4 + pulse * 0.6);
      ctx.fillStyle = mote.color || '#ffffff';
      ctx.beginPath();
      ctx.arc(mote.x, mote.y, mote.size * (0.6 + pulse * 0.4), 0, Math.PI * 2);
      ctx.fill();
      /* Plus-cross sparkle and a halo for brighter stars */
      if (mote.size > 1.6) {
        if (Game.FX.bloom) {
          ctx.globalAlpha = mote.alpha * pulse * 0.8;
          ctx.drawImage(glowSprite(mote.color || '#ffffff', 32), mote.x - 9, mote.y - 9, 18, 18);
        }
        ctx.globalAlpha = mote.alpha * pulse * 0.7;
        ctx.strokeStyle = mote.color || '#ffffff';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(mote.x - mote.size * 2.5, mote.y);
        ctx.lineTo(mote.x + mote.size * 2.5, mote.y);
        ctx.moveTo(mote.x, mote.y - mote.size * 2.5);
        ctx.lineTo(mote.x, mote.y + mote.size * 2.5);
        ctx.stroke();
      }
    }
    ctx.restore();

    /* The home planet's rings arcing across the sky */
    if (ringCv) {
      ctx.drawImage(ringCv, W * 0.8 - camera.x * 0.08 - RING_W / 2, -90, RING_W, RING_H);
    }

    /* Parallax background – distant planets and drifting asteroids */
    var hazeC = level.horizonGlow || mixHex(level.bgBottom, '#ffffff', 0.35);
    for (var li = 0; li < bgLayers.length; li++) {
      var layer = bgLayers[li];
      for (var it = 0; it < layer.items.length; it++) {
        var item = layer.items[it];
        var bx = item.x - camera.x * layer.parallax;
        if (bx + item.w * 2 > 0 && bx - item.w < W) {
          if (item.isPlanet) {
            /* Cached sprite: halo, lit sphere, terminator, atmosphere */
            var pcv = planetSprite(item), pR = item.spriteR, pr = item.w / 2;
            ctx.drawImage(pcv, bx + pr - pR, item.y - pR, pR * 2, pR * 2);
          } else {
            /* Floating rock: sunlit crown, shadowed belly, rim light on
               the upper-left shoulder, hazed toward the horizon colour. */
            var cx = bx + item.w / 2;
            var hw = item.w / 2;
            var hh = item.h / 2;
            var seed = item.blobSeed || 0;
            var rockC = mixHex(item.color, hazeC, 0.3);
            ctx.beginPath();
            ctx.moveTo(cx - hw, item.y);
            ctx.bezierCurveTo(
              cx - hw, item.y - hh - Math.sin(seed) * 8,
              cx - hw * 0.3, item.y - hh - Math.cos(seed * 2) * 12,
              cx, item.y - hh
            );
            ctx.bezierCurveTo(
              cx + hw * 0.3, item.y - hh - Math.sin(seed * 3) * 10,
              cx + hw, item.y - hh - Math.cos(seed) * 6,
              cx + hw, item.y
            );
            ctx.bezierCurveTo(
              cx + hw * 0.7, item.y + hh * 0.75,
              cx - hw * 0.2, item.y + hh * (0.9 + Math.sin(seed * 5) * 0.3),
              cx - hw, item.y
            );
            ctx.closePath();
            var rg = ctx.createLinearGradient(cx - hw * 0.5, item.y - hh - 12, cx + hw * 0.3, item.y + hh * 0.8);
            rg.addColorStop(0, mixHex(rockC, '#ffffff', 0.3));
            rg.addColorStop(0.45, rockC);
            rg.addColorStop(1, mixHex(rockC, '#0a0420', 0.6));
            ctx.fillStyle = rg;
            ctx.fill();
            ctx.strokeStyle = hexA(mixHex(rockC, '#ffffff', 0.65), 0.55);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(cx - hw, item.y);
            ctx.bezierCurveTo(
              cx - hw, item.y - hh - Math.sin(seed) * 8,
              cx - hw * 0.3, item.y - hh - Math.cos(seed * 2) * 12,
              cx, item.y - hh
            );
            ctx.stroke();
          }
        }
      }
    }

    /* Background drifting UFO — large hero-friendly one floating across the sky */
    if (level.bgUfo) {
      var bgU = level.bgUfo;
      bgUfoX += bgU.speed * (bgU.dir || 1);
      var ufoSpan = level.width + 240;
      if (bgUfoX > ufoSpan) bgUfoX = -120;
      if (bgUfoX < -120) bgUfoX = ufoSpan;
      var ufoSx = bgUfoX - camera.x * 0.35;
      var ufoSy = bgU.y + Math.sin(Date.now() * 0.001) * 6;
      drawBgUfo(ctx, ufoSx, ufoSy);
    }

    /* Distant UFO trails (tiny running lights in formation) */
    ctx.save();
    ctx.globalAlpha = 0.55;
    var now = Date.now();
    for (var fsi = 0; fsi < bgFishSchools.length; fsi++) {
      var school = bgFishSchools[fsi];
      school.x += school.speed * school.dir;
      if (school.x > (level ? level.width : 5600) + 100) school.x = -100;
      if (school.x < -100) school.x = (level ? level.width : 5600) + 100;
      var schX = school.x - camera.x * 0.4;
      for (var sfi = 0; sfi < school.fish.length; sfi++) {
        var sf = school.fish[sfi];
        var fx = schX + sf.ox + Math.sin(now * 0.001 + sf.phase) * 2;
        var fy = school.y + sf.oy + Math.cos(now * 0.0012 + sf.phase) * 1.5;
        if (fx > -10 && fx < W + 10) {
          ctx.fillStyle = sfi % 2 === 0 ? '#44ffff' : '#ff66cc';
          ctx.beginPath();
          ctx.arc(fx, fy, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();

    /* Ambient bubbles (behind everything) */
    for (var ab = 0; ab < ambientBubbles.length; ab++) {
      ambientBubbles[ab].draw(ctx, camera.x * 0.6, 0);
    }

    /* Distant crater ridges: two bands of rolling hills behind the town
       that scroll slower than the ground, plus a haze band where they
       meet the sky, so the horizon has depth instead of a hard edge. */
    var floorBase = level.floorY - camera.y;
    var floorColorA = level.floorColorA || '#2d1a0a';
    var floorColorB = level.floorColorB || '#3d2b12';
    var lightC = mixHex(level.keyLight || '#ffffff', '#ffffff', 0.5);
    /* Three bands with atmospheric perspective: the farthest is pale and
       close to the horizon glow, the nearest dark and close to the ground
       colour; each is lit along its crest. */
    var ridgeMix = [0.42, 0.66, 0.88];
    var ridgePar = [0.1, 0.18, 0.32];
    for (var rg = 0; rg < 3; rg++) {
      var rpx = camera.x * ridgePar[rg];
      var ridgeC = mixHex(hazeC, mixHex(floorColorA, '#0a0420', 0.25), ridgeMix[rg]);
      var ridgeTop = 0;
      ctx.beginPath();
      ctx.moveTo(0, floorBase + 20);
      for (var rx0 = 0; rx0 <= W; rx0 += 8) {
        var rwx = rx0 + rpx;
        var rh = rg === 0
          ? 52 + Math.sin(rwx * 0.007 + 4) * 20 + Math.sin(rwx * 0.019) * 9 + Math.sin(rwx * 0.047 + 2) * 3
          : rg === 1
          ? 28 + Math.sin(rwx * 0.011) * 12 + Math.sin(rwx * 0.027 + 1.3) * 6 + Math.sin(rwx * 0.061) * 2
          : 14 + Math.sin(rwx * 0.016 + 2) * 8 + Math.sin(rwx * 0.043) * 4;
        if (rh > ridgeTop) ridgeTop = rh;
        ctx.lineTo(rx0, floorBase - rh);
      }
      ctx.lineTo(W, floorBase + 20);
      ctx.closePath();
      var ridgeG = ctx.createLinearGradient(0, floorBase - ridgeTop, 0, floorBase + 10);
      ridgeG.addColorStop(0, mixHex(ridgeC, '#ffffff', 0.1));
      ridgeG.addColorStop(1, mixHex(ridgeC, hazeC, 0.35));
      ctx.fillStyle = ridgeG;
      ctx.fill();
      ctx.strokeStyle = hexA(mixHex(ridgeC, '#ffffff', 0.55), 0.4);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    /* Decorations */
    renderDecorations();

    /* Asteroid/moon surface – undulating contour */
    ctx.fillStyle = floorColorA;
    ctx.beginPath();
    ctx.moveTo(0, H + 10);
    for (var fx = 0; fx <= W; fx += 4) {
      var worldX = fx + camera.x;
      var undulation = Math.sin(worldX * 0.008) * 6 + Math.sin(worldX * 0.02) * 3;
      ctx.lineTo(fx, floorBase + undulation);
    }
    ctx.lineTo(W, H + 10);
    ctx.closePath();
    ctx.fill();
    /* Dust layer, sunlit along the top and falling into shadow below */
    var dustG = ctx.createLinearGradient(0, floorBase - 8, 0, H);
    dustG.addColorStop(0, mixHex(floorColorB, lightC, 0.42));
    dustG.addColorStop(0.5, mixHex(floorColorB, lightC, 0.1));
    dustG.addColorStop(1, floorColorA);
    ctx.fillStyle = dustG;
    ctx.beginPath();
    ctx.moveTo(0, H + 10);
    for (var sx = 0; sx <= W; sx += 4) {
      var swx = sx + camera.x;
      var ripple = Math.sin(swx * 0.008) * 6 + Math.sin(swx * 0.02) * 3 + Math.sin(swx * 0.05) * 1.5;
      ctx.lineTo(sx, floorBase + ripple + 2);
    }
    ctx.lineTo(W, H + 10);
    ctx.closePath();
    ctx.fill();
    /* Surface detail: a pale dusty crust along the rim, a few shallow
       craters and hairline cracks, and the regolith darkening with depth
       so the ground reads as a moon surface instead of a flat band. */
    ctx.save();
    ctx.strokeStyle = mixHex(floorColorB, lightC, 0.55);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var cx0 = 0; cx0 <= W; cx0 += 4) {
      var cwx = cx0 + camera.x;
      var crim = Math.sin(cwx * 0.008) * 6 + Math.sin(cwx * 0.02) * 3 + Math.sin(cwx * 0.05) * 1.5;
      if (cx0 === 0) ctx.moveTo(cx0, floorBase + crim + 2.5);
      else ctx.lineTo(cx0, floorBase + crim + 2.5);
    }
    ctx.stroke();
    var depthGrad = ctx.createLinearGradient(0, floorBase + 14, 0, H);
    depthGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    depthGrad.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
    ctx.fillStyle = depthGrad;
    ctx.fillRect(0, floorBase + 14, W, H - floorBase - 14);
    /* Regolith material, clipped to the surface contour */
    if (regoCv) {
      ctx.beginPath();
      ctx.moveTo(0, H + 10);
      for (var rgx = 0; rgx <= W; rgx += 8) ctx.lineTo(rgx, floorBase + surfaceUndulation(rgx + camera.x) + 2);
      ctx.lineTo(W, H + 10);
      ctx.closePath();
      ctx.clip();
      var rgo = -(((camera.x % REGO_W) + REGO_W) % REGO_W);
      ctx.drawImage(regoCv, rgo, floorBase - REGO_TOP, REGO_W, REGO_H);
      ctx.drawImage(regoCv, rgo + REGO_W, floorBase - REGO_TOP, REGO_W, REGO_H);
    }
    ctx.restore();
    /* Ground detail pass */
    ctx.save();
    for (var gd = 0; gd < groundDetails.length; gd++) {
      var det = groundDetails[gd];
      var gsx = det.x - camera.x;
      if (gsx < -30 || gsx > W + 30) continue;
      var gsy = floorBase + surfaceUndulation(det.x) + det.off;
      if (det.kind === 'crater') {
        /* Bowl in shadow, far wall catching light, soft rim */
        var crr = det.r;
        ctx.fillStyle = mixHex(floorColorA, '#000000', 0.42);
        ctx.beginPath();
        ctx.ellipse(gsx, gsy, crr, crr * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = mixHex(floorColorB, '#000000', 0.1);
        ctx.beginPath();
        ctx.ellipse(gsx, gsy + crr * 0.12, crr * 0.7, crr * 0.24, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = mixHex(floorColorB, '#ffffff', 0.32);
        ctx.beginPath();
        ctx.ellipse(gsx, gsy - 0.8, crr, crr * 0.42, 0, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(gsx, gsy + 0.8, crr, crr * 0.42, 0, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      } else if (det.kind === 'dust') {
        ctx.fillStyle = hexA(mixHex(floorColorB, '#ffffff', 0.3), 0.13);
        ctx.beginPath();
        ctx.ellipse(gsx, gsy, det.r, det.r * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (det.kind === 'prints') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
        for (var fpi = 0; fpi < 4; fpi++) {
          ctx.beginPath();
          ctx.ellipse(gsx + fpi * 7, gsy + (fpi % 2 ? 2.2 : -1), 2.2, 1.3, 0.25, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (det.kind === 'pebbles') {
        ctx.fillStyle = mixHex(floorColorB, '#ffffff', 0.38);
        ctx.beginPath();
        ctx.arc(gsx, gsy, 1.3, 0, Math.PI * 2);
        ctx.arc(gsx + 5, gsy + 2, 0.9, 0, Math.PI * 2);
        ctx.arc(gsx - 4, gsy + 1.5, 1, 0, Math.PI * 2);
        ctx.fill();
      } else if (det.kind === 'critter') {
        /* Tardigrade alien — little plump critter */
        ctx.fillStyle = '#aaccff';
        ctx.beginPath();
        ctx.ellipse(gsx, gsy - 1, 3.5, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#222244';
        ctx.beginPath();
        ctx.arc(gsx - 1.2, gsy - 1, 0.6, 0, Math.PI * 2);
        ctx.arc(gsx + 1.2, gsy - 1, 0.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        /* Glowing crystal shards with a cached halo */
        var cc = det.color;
        ctx.globalAlpha = 0.55 + Math.sin(Date.now() * 0.003 + det.x) * 0.2;
        ctx.drawImage(glowSprite(cc, 18), gsx - 18, gsy - 20);
        ctx.globalAlpha = 1;
        ctx.fillStyle = mixHex(cc, '#000000', 0.25);
        ctx.beginPath();
        ctx.moveTo(gsx - 5, gsy + 1); ctx.lineTo(gsx - 3.5, gsy - 7); ctx.lineTo(gsx - 1, gsy + 1);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = cc;
        ctx.beginPath();
        ctx.moveTo(gsx - 1.5, gsy + 1); ctx.lineTo(gsx + 1.5, gsy - 12); ctx.lineTo(gsx + 4.5, gsy + 1);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.moveTo(gsx + 0.5, gsy); ctx.lineTo(gsx + 1.5, gsy - 10); ctx.lineTo(gsx + 2.2, gsy);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();

    /* Light spilling onto the ground from windows, lamps and signs, and
       contact shadows under poles -- drawn after the ground so they sit
       on top of the surface. */
    ctx.save();
    for (var gl = 0; gl < level.decorations.length; gl++) {
      var ld = level.decorations[gl];
      var ldx = ld.x - camera.x;
      if (ldx < -120 || ldx > W + 120) continue;
      var ldy = floorBase + surfaceUndulation(ld.x) + 3;
      if (ld.type === 'houseDecor') {
        ctx.fillStyle = 'rgba(6, 2, 20, 0.28)';
        ctx.beginPath();
        ctx.ellipse(ldx, ldy, 64, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        var spill = ['#ffd24a', '#44ffff', '#ff88cc'];
        for (var sw = 0; sw < 3; sw++) {
          ctx.fillStyle = hexA(spill[sw], 0.22);
          ctx.beginPath();
          ctx.ellipse(ldx - 29 + sw * 28, ldy + 2, 17, 3.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(255, 220, 140, 0.26)';
        ctx.beginPath();
        ctx.ellipse(ldx - 24, ldy + 3, 30, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (ld.type === 'lampPost') {
        /* Pool of lamp light on the regolith: a wide soft fall-off and a
           hot core under the lamp, added onto the ground */
        var lpc = ld.color || '#44ffff';
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.9;
        ctx.drawImage(glowSprite(lpc, 32), ldx - 95, ldy - 12, 190, 34);
        ctx.globalAlpha = 0.85;
        ctx.drawImage(glowSprite(lpc, 32), ldx - 34, ldy - 5, 68, 14);
        ctx.globalAlpha = 0.35;
        ctx.drawImage(glowSprite('#ffffff', 32), ldx - 14, ldy - 2, 28, 7);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(6, 2, 20, 0.35)';
        ctx.beginPath();
        ctx.ellipse(ldx, ldy, 5, 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (ld.type === 'neonSign' || ld.type === 'antenna' || ld.type === 'robotStatue') {
        ctx.fillStyle = 'rgba(6, 2, 20, 0.35)';
        ctx.beginPath();
        ctx.ellipse(ldx, ldy, ld.type === 'robotStatue' ? 16 : 6, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        if (ld.type === 'neonSign') {
          ctx.fillStyle = hexA(ld.color || '#44ffff', 0.2);
          ctx.beginPath();
          ctx.ellipse(ldx, ldy + 2, 34, 4, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (ld.type === 'cafeBuilding' || ld.type === 'shopBuilding') {
        ctx.fillStyle = 'rgba(6, 2, 20, 0.3)';
        ctx.beginPath();
        ctx.ellipse(ldx, ldy, 78, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ld.type === 'cafeBuilding' ? 'rgba(255, 200, 120, 0.16)' : 'rgba(255, 220, 90, 0.14)';
        ctx.beginPath();
        ctx.ellipse(ldx - 20, ldy + 2, 44, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (ld.type === 'cheeseDeli' || ld.type === 'iceCreamParlour' || ld.type === 'mouseFamilyHome') {
        ctx.fillStyle = 'rgba(6, 2, 20, 0.28)';
        ctx.beginPath();
        ctx.ellipse(ldx + 4, ldy, ld.type === 'mouseFamilyHome' ? 54 : 64, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        /* Warm light from the door and the shop window */
        ctx.fillStyle = 'rgba(255, 190, 90, 0.22)';
        ctx.beginPath();
        ctx.ellipse(ld.type === 'cheeseDeli' ? ldx - 8 : ldx, ldy + 3, ld.type === 'cheeseDeli' ? 52 : 30, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (ld.type === 'cheeseArch' || ld.type === 'mouseHouse' || ld.type === 'cheeseStall') {
        var lsk = ld.type === 'cheeseArch' ? 100 * (ld.size || 1) : (ld.type === 'cheeseStall' ? 64 : 40 * (ld.small ? 0.8 : 1));
        ctx.fillStyle = 'rgba(6, 2, 20, 0.28)';
        ctx.beginPath();
        ctx.ellipse(ldx + 4, ldy, lsk, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        if (ld.type !== 'cheeseArch') {
          ctx.fillStyle = 'rgba(255, 190, 90, 0.2)';
          ctx.beginPath();
          ctx.ellipse(ld.type === 'cheeseStall' ? ldx + 76 : ldx - 12, ldy + 3, 28, 4.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();

    renderGroundDecor(floorBase);

    drawBloom();

    /* (No collision platforms — Momoko floats freely through open space.) */

    /* Pickups */
    for (var pk = 0; pk < pickups.length; pk++) {
      if (pickups[pk].crumbId && !crumbOut(pickups[pk])) continue;
      pickups[pk].draw(ctx, camera.x, camera.y);
    }

    /* Ground shadows for everyone standing or floating over the surface */
    for (var sh = 0; sh < npcs.length; sh++) {
      var sht = npcs[sh].type;
      if (sht === 'rocket' || sht === 'houseDoor' || sht === 'cafeDoor' || sht === 'shopDoor') continue;
      drawGroundShadow(npcs[sh].entity);
    }
    if (player) drawGroundShadow(player);

    /* NPCs */
    for (var nc = 0; nc < npcs.length; nc++) {
      if (LIT_TYPES[npcs[nc].type]) drawLit(npcs[nc].entity);
      else npcs[nc].entity.draw(ctx, camera.x, camera.y);
      /* Interaction indicator */
      var npc = npcs[nc].entity;
      if (!npc.talking && !PROMPT_KEYS[npcs[nc].type]) {
        var ndist = Math.sqrt(
          Math.pow(player.x - npc.x, 2) + Math.pow(player.y - npc.y, 2)
        );
        if (ndist < 80) {
          /* Draw "!" indicator */
          var ix = npc.x - camera.x + npc.w / 2;
          var iy = npc.y - camera.y - 14;
          ctx.fillStyle = '#ffcc33';
          ctx.font = 'bold 14px "M PLUS Rounded 1c", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('!', ix, iy + Math.sin(Date.now() * 0.005) * 3);
        }
      }
    }

    /* Bob submarine (drawn by npc loop above) */

    /* Enemies */
    for (var ei = 0; ei < enemies.length; ei++) {
      enemies[ei].draw(ctx, camera.x, camera.y);
    }

    /* Player bubbles */
    for (var bi = 0; bi < bubbles.length; bi++) {
      bubbles[bi].draw(ctx, camera.x, camera.y);
    }

    /* Player (her footfall dust sits behind her) */
    if (player && player.drawFx) player.drawFx(ctx, camera.x, camera.y);
    if (player) drawLit(player);

    /* Shop-cart carry overlay — bobbing item icons floating above Momoko's
       head while she walks her purchases home. */
    if (player && Game.shop && Game.shop.cart && Game.shop.cart.length > 0 && Game.ui && Game.ui.drawCarryOverlay) {
      Game.ui.drawCarryOverlay(ctx, player, camera.x, camera.y);
    }

    drawInteractPrompt();

    /* Wolfe (visible near surface) */
    if (wolfe && camera.y <= 20) {
      wolfe.draw(ctx, camera.x, camera.y);
    }

    /* Particles */
    for (var pa = 0; pa < particles.length; pa++) {
      particles[pa].draw(ctx, camera.x, camera.y);
    }

    drawForeground();

    /* Colour grade and vignette over the finished scene */
    postFX(0, 0, W, H);
  }

  /* ---- House sprite ----
     Painted once per colour pair at device resolution: panelled walls
     with bevelled seams, rivets and grain, ambient occlusion under the
     eaves and along the ground, deep window recesses with glowing glass
     and sills, and a dome of ribbed panels with a sky-lit rim. */
  var HOUSE_SPR_X = 72, HOUSE_SPR_Y = 146, HOUSE_SPR_W = 144, HOUSE_SPR_H = 156;
  var houseSprites = {};
  function houseSprite(hc, rc) {
    var s = Math.min(2, DPR);
    var key = hc + rc + s;
    if (houseSprites[key]) return houseSprites[key];
    var cv = offscreen(HOUSE_SPR_W * s, HOUSE_SPR_H * s);
    var g = cv.getContext('2d');
    g.scale(s, s);
    g.translate(HOUSE_SPR_X, HOUSE_SPR_Y);
    paintHouse(g, hc, rc);
    houseSprites[key] = cv;
    return cv;
  }

  function paintHouse(g, hc, rc) {
    var INK = '#2a1450';
    var rnd = lcg(parseInt(hc.slice(1), 16) & 0xffff);
    var i, x, y;
    /* Contact shadow */
    g.fillStyle = 'rgba(0, 0, 0, 0.3)';
    g.beginPath(); g.ellipse(0, 1, 64, 6, 0, 0, Math.PI * 2); g.fill();
    /* Wall, lit from the upper left */
    var wg = g.createLinearGradient(-50, 0, 50, 0);
    wg.addColorStop(0, mixHex(hc, '#ffffff', 0.2));
    wg.addColorStop(0.55, hc);
    wg.addColorStop(1, mixHex(hc, '#1a0838', 0.35));
    g.fillStyle = wg;
    g.fillRect(-50, -90, 100, 90);
    g.save();
    g.beginPath(); g.rect(-50, -90, 100, 90); g.clip();
    /* Panel courses: a dark groove with a lit lip under it, staggered
       vertical seams, a rivet at each joint */
    for (y = -79, i = 0; y < 0; y += 11, i++) {
      g.fillStyle = 'rgba(30, 6, 60, 0.28)';
      g.fillRect(-50, y, 100, 1);
      g.fillStyle = 'rgba(255, 255, 255, 0.14)';
      g.fillRect(-50, y + 1, 100, 0.8);
      for (x = -50 + (i % 2 ? 12 : 25); x < 50; x += 26) {
        g.fillStyle = 'rgba(30, 6, 60, 0.22)';
        g.fillRect(x, y - 11, 0.9, 11);
        g.fillStyle = 'rgba(255, 255, 255, 0.1)';
        g.fillRect(x + 0.9, y - 11, 0.6, 11);
        g.fillStyle = 'rgba(255, 255, 255, 0.35)';
        g.fillRect(x - 2.4, y - 2.2, 1, 1);
      }
    }
    /* Grain */
    for (i = 0; i < 260; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255, 255, 255, 0.06)' : 'rgba(20, 0, 40, 0.08)';
      g.fillRect(-50 + rnd() * 100, -90 + rnd() * 90, 1 + rnd() * 2, 0.7);
    }
    /* Occlusion under the eaves and along the ground */
    var ao = g.createLinearGradient(0, -90, 0, -74);
    ao.addColorStop(0, 'rgba(20, 0, 40, 0.45)');
    ao.addColorStop(1, 'rgba(20, 0, 40, 0)');
    g.fillStyle = ao;
    g.fillRect(-50, -90, 100, 16);
    var ag = g.createLinearGradient(0, -16, 0, 0);
    ag.addColorStop(0, 'rgba(20, 0, 40, 0)');
    ag.addColorStop(1, 'rgba(20, 0, 40, 0.35)');
    g.fillStyle = ag;
    g.fillRect(-50, -16, 100, 16);
    /* Shadowed side wall and a lit corner bevel */
    g.fillStyle = 'rgba(10, 0, 30, 0.2)';
    g.fillRect(35, -90, 15, 90);
    g.fillStyle = 'rgba(255, 255, 255, 0.28)';
    g.fillRect(-50, -90, 1.6, 90);
    g.fillStyle = 'rgba(255, 255, 255, 0.12)';
    g.fillRect(34, -90, 1, 90);
    g.restore();
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.strokeRect(-50, -90, 100, 90);

    /* Windows: light spill on the wall, a deep frame, glowing glass with
       a hot centre, muntins and a lit sill casting a shadow */
    var winColors = ['#ffd24a', '#44ffff', '#ff88cc'];
    for (i = 0; i < 3; i++) {
      var wx = -38 + i * 28, wy = -70, wc = winColors[i];
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.5;
      g.drawImage(glowSprite(wc, 32), wx - 12, wy - 12, 42, 42);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = mixHex(hc, '#1a0838', 0.55);
      g.fillRect(wx - 2.5, wy - 2.5, 23, 23);
      g.fillStyle = mixHex(hc, '#ffffff', 0.35);
      g.fillRect(wx - 2.5, wy - 2.5, 23, 1.2);
      g.fillRect(wx - 2.5, wy - 2.5, 1.2, 23);
      var gg = g.createRadialGradient(wx + 7, wy + 7, 1, wx + 9, wy + 9, 14);
      gg.addColorStop(0, mixHex(wc, '#ffffff', 0.7));
      gg.addColorStop(0.5, wc);
      gg.addColorStop(1, mixHex(wc, '#1a0838', 0.35));
      g.fillStyle = gg;
      g.fillRect(wx, wy, 18, 18);
      /* inner shadow at the top of the recess */
      g.fillStyle = 'rgba(20, 0, 40, 0.35)';
      g.fillRect(wx, wy, 18, 2.5);
      g.fillStyle = '#221133';
      g.fillRect(wx + 8, wy, 2, 18);
      g.fillRect(wx, wy + 8, 18, 2);
      /* glass glint */
      g.fillStyle = 'rgba(255, 255, 255, 0.45)';
      g.beginPath(); g.moveTo(wx + 1, wy + 7); g.lineTo(wx + 7, wy + 1); g.lineTo(wx + 8, wy + 1); g.lineTo(wx + 1, wy + 8); g.fill();
      /* sill */
      g.fillStyle = mixHex(rc, '#ffffff', 0.3);
      g.fillRect(wx - 4, wy + 20.5, 26, 2.2);
      g.fillStyle = 'rgba(20, 0, 40, 0.3)';
      g.fillRect(wx - 3, wy + 22.7, 24, 2);
    }

    /* Roof: dome of ribbed panels */
    var rG = g.createRadialGradient(-22, -110, 4, 0, -92, 62);
    rG.addColorStop(0, mixHex(rc, '#ffffff', 0.4));
    rG.addColorStop(0.55, rc);
    rG.addColorStop(1, mixHex(rc, '#1a0838', 0.35));
    g.fillStyle = rG;
    g.beginPath(); g.ellipse(0, -90, 56, 26, 0, Math.PI, 0); g.closePath(); g.fill();
    g.save();
    g.clip();
    g.lineWidth = 0.8;
    for (i = 1; i < 4; i++) {
      g.strokeStyle = 'rgba(30, 6, 60, 0.25)';
      g.beginPath(); g.ellipse(0, -90, 56 * i / 4, 26, 0, Math.PI, 0); g.stroke();
      g.strokeStyle = 'rgba(30, 6, 60, 0.18)';
      g.beginPath(); g.ellipse(0, -90, 56, 26 * i / 4 + 2, 0, Math.PI, 0); g.stroke();
    }
    /* sky rim along the lit shoulder */
    g.strokeStyle = 'rgba(255, 230, 250, 0.55)';
    g.lineWidth = 2;
    g.beginPath(); g.ellipse(0, -89, 54.5, 24.5, 0, Math.PI * 1.05, Math.PI * 1.45); g.stroke();
    g.restore();
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.beginPath(); g.ellipse(0, -90, 56, 26, 0, Math.PI, 0); g.closePath(); g.stroke();
    g.fillStyle = 'rgba(255, 255, 255, 0.32)';
    g.beginPath(); g.ellipse(-22, -104, 14, 5, -0.35, 0, Math.PI * 2); g.fill();
    /* Trim ring under the dome, bevelled */
    g.fillStyle = mixHex(rc, '#1a0838', 0.3);
    g.fillRect(-56, -92, 112, 5);
    g.fillStyle = 'rgba(255, 255, 255, 0.3)';
    g.fillRect(-56, -92, 112, 1);
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.strokeRect(-56, -92, 112, 5);
    /* Antenna */
    g.strokeStyle = '#ddddee';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -116); g.lineTo(0, -134); g.stroke();
    g.fillStyle = '#44ffff';
    g.beginPath(); g.arc(0, -136, 3, 0, Math.PI * 2); g.fill();
    /* Chimney, shaded */
    var cg = g.createLinearGradient(28, 0, 39, 0);
    cg.addColorStop(0, mixHex(hc, '#000000', 0.12));
    cg.addColorStop(1, mixHex(hc, '#1a0838', 0.45));
    g.fillStyle = cg;
    g.fillRect(28, -126, 11, 22);
    g.fillStyle = mixHex(rc, '#000000', 0.2);
    g.fillRect(26, -129, 15, 4);
    g.fillStyle = 'rgba(255, 255, 255, 0.3)';
    g.fillRect(26, -129, 15, 1);
    /* Glowing trim along the base */
    g.fillStyle = '#44ffff';
    g.fillRect(-50, -6, 100, 2);
    /* Door recess, frame posts and awning */
    g.fillStyle = 'rgba(0, 0, 0, 0.38)';
    g.fillRect(-26, -50, 52, 50);
    g.fillStyle = mixHex(hc, '#ffffff', 0.35);
    g.fillRect(-31, -54, 5, 54);
    g.fillRect(26, -54, 5, 54);
    g.fillStyle = 'rgba(20, 0, 40, 0.3)';
    g.fillRect(29, -54, 2, 54);
    g.fillRect(-28, -54, 2, 54);
    g.fillStyle = mixHex(hc, '#000000', 0.3);
    g.fillRect(-31, -54, 62, 2);
    g.fillStyle = mixHex(rc, '#ffffff', 0.15);
    g.beginPath();
    g.moveTo(-36, -54); g.lineTo(36, -54); g.lineTo(30, -62); g.lineTo(-30, -62);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255, 255, 255, 0.3)';
    g.fillRect(-30, -62, 60, 1.5);
    g.fillStyle = 'rgba(0, 0, 0, 0.25)';
    g.fillRect(-36, -54, 72, 3);
  }

  /* ---- Cheese-moon landmark sprites ----
     The arches, mouse houses and bakery stall are static, so each is
     painted once at device resolution (like the houses) and blitted;
     only smoke, oven fire, the cake and the bunting move per frame. */
  var decoSprites = {};
  function decoSprite(key, w, h, ox, oy, paint) {
    var s = Math.min(2, DPR);
    var k = key + '@' + s;
    var spr = decoSprites[k];
    if (!spr) {
      var cv = offscreen(w * s, h * s), g = cv.getContext('2d');
      g.scale(s, s);
      g.translate(ox, oy);
      g.lineJoin = 'round';
      g.lineCap = 'round';
      paint(g);
      spr = decoSprites[k] = { cv: cv, w: w, h: h, ox: ox, oy: oy };
    }
    return spr;
  }
  function blitDeco(spr, x, y, k) {
    ctx.drawImage(spr.cv, x - spr.ox * k, y - spr.oy * k, spr.w * k, spr.h * k);
  }

  /* A cheese hole: shadowed upper lip, sunlit lower lip. */
  function cheeseHole(g, x, y, r) {
    g.fillStyle = '#a86820';
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7a4818';
    g.beginPath();
    g.arc(x, y, r, Math.PI * 0.9, Math.PI * 1.9);
    g.arc(x + r * 0.25, y + r * 0.3, r, Math.PI * 1.75, Math.PI * 1.05, true);
    g.fill();
    g.strokeStyle = 'rgba(255, 244, 170, 0.75)';
    g.lineWidth = 1;
    g.beginPath(); g.arc(x, y, r, Math.PI * 0.05, Math.PI * 0.75); g.stroke();
  }

  /* Smooth closed blob through the given points (midpoint quadratics). */
  function blobPath(g, pts) {
    var n = pts.length;
    g.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
    for (var i = 0; i < n; i++) {
      var a = pts[i], b = pts[(i + 1) % n];
      g.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
    g.closePath();
  }

  var ARCH_OUT = [[-98, 8], [-102, -40], [-90, -96], [-60, -128], [-18, -142], [26, -136], [66, -120], [94, -84], [102, -30], [98, 8]];
  function archPath(g, ox, oy) {
    g.beginPath();
    var pts = [];
    for (var i = 0; i < ARCH_OUT.length; i++) pts.push([ARCH_OUT[i][0] + ox, ARCH_OUT[i][1] + oy]);
    blobPath(g, pts);
    /* The opening: straight jambs and a round top */
    g.moveTo(-44 + ox, 10 + oy);
    g.lineTo(-44 + ox, -56 + oy);
    g.arc(ox, -56 + oy, 44, Math.PI, 0);
    g.lineTo(44 + ox, 10 + oy);
    g.closePath();
  }
  function paintCheeseArch(g) {
    /* Back face nudged down-right gives the arch its thickness; it
       shows through the opening as the shaded inner wall. */
    archPath(g, 9, 3);
    g.fillStyle = '#a8641c';
    g.fill('evenodd');
    archPath(g, 0, 0);
    var fg = g.createLinearGradient(-80, -140, 90, 10);
    fg.addColorStop(0, '#fff09a');
    fg.addColorStop(0.45, '#ffd04a');
    fg.addColorStop(1, '#d8902a');
    g.fillStyle = fg;
    g.fill('evenodd');
    g.strokeStyle = '#7a4818';
    g.lineWidth = 2;
    g.stroke();
    /* Sunlit rind along the upper-left crown */
    g.save();
    g.strokeStyle = 'rgba(255, 252, 220, 0.8)';
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(-97, -30);
    g.quadraticCurveTo(-96, -80, -72, -114);
    g.quadraticCurveTo(-44, -140, 4, -139);
    g.stroke();
    g.restore();
    var holes = [[-72, -28, 9], [-62, -84, 7], [-30, -112, 9], [14, -120, 6], [52, -98, 9], [76, -56, 7], [72, -14, 5], [-82, -62, 4], [-64, -4, 3.5], [34, -128, 3]];
    for (var i = 0; i < holes.length; i++) cheeseHole(g, holes[i][0], holes[i][1], holes[i][2]);
    /* Melted drip hanging from the top of the opening */
    g.fillStyle = '#ffc23a';
    g.beginPath();
    g.moveTo(4, -101); g.quadraticCurveTo(8, -88, 10, -86); g.quadraticCurveTo(13, -88, 16, -100);
    g.closePath();
    g.fill();
    g.beginPath(); g.arc(10, -83, 2.6, 0, Math.PI * 2); g.fill();
  }

  function paintMouseHouse(g, door) {
    var INK = '#6a3a10';
    /* Depth, then the wheel face with its rind */
    g.fillStyle = '#b8761e';
    g.beginPath(); g.arc(6, -32, 36, 0, Math.PI * 2); g.fill();
    var wg = g.createRadialGradient(-14, -50, 4, 0, -34, 38);
    wg.addColorStop(0, '#fff0a0');
    wg.addColorStop(0.6, '#ffd04a');
    wg.addColorStop(1, '#d8902a');
    g.fillStyle = wg;
    g.beginPath(); g.arc(0, -34, 36, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#c47a22';
    g.lineWidth = 5;
    g.beginPath(); g.arc(0, -34, 33, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = INK;
    g.lineWidth = 1.6;
    g.beginPath(); g.arc(0, -34, 36, 0, Math.PI * 2); g.stroke();
    cheeseHole(g, 18, -16, 3.4);
    cheeseHole(g, -24, -18, 2.6);
    cheeseHole(g, 8, -50, 2.4);
    /* Wedge roof with holes, sunlit front edge */
    g.fillStyle = '#e09a2a';
    g.beginPath(); g.moveTo(-40, -58); g.lineTo(40, -58); g.lineTo(44, -62); g.lineTo(-2, -98); g.closePath(); g.fill();
    g.fillStyle = '#ffd860';
    g.beginPath(); g.moveTo(-40, -58); g.lineTo(40, -58); g.lineTo(-4, -96); g.closePath(); g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(-40, -58); g.lineTo(40, -58); g.lineTo(44, -62); g.lineTo(-2, -98); g.lineTo(-4, -96); g.closePath(); g.stroke();
    g.strokeStyle = 'rgba(255, 252, 220, 0.85)';
    g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(-37, -60); g.lineTo(-5, -93); g.stroke();
    cheeseHole(g, -8, -72, 3);
    cheeseHole(g, 10, -66, 2.2);
    /* Thimble chimney */
    g.fillStyle = '#9aa0b8';
    g.fillRect(16, -92, 8, 14);
    g.fillStyle = '#c8cee0';
    g.fillRect(15, -94, 10, 3);
    g.strokeStyle = INK;
    g.lineWidth = 1;
    g.strokeRect(16, -92, 8, 14);
    /* Round windows, warm inside */
    var wins = [[-19, -42, 6.5], [20, -40, 5]];
    for (var i = 0; i < wins.length; i++) {
      var wx = wins[i][0], wy = wins[i][1], wr = wins[i][2];
      var lg = g.createRadialGradient(wx - 1, wy - 1, 0, wx, wy, wr);
      lg.addColorStop(0, '#fff6c8');
      lg.addColorStop(1, '#ffb84a');
      g.fillStyle = lg;
      g.beginPath(); g.arc(wx, wy, wr, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#8a4a18';
      g.lineWidth = 1.6;
      g.stroke();
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(wx - wr, wy); g.lineTo(wx + wr, wy); g.moveTo(wx, wy - wr); g.lineTo(wx, wy + wr); g.stroke();
    }
    /* Round-topped door with a gold knob and a step */
    g.fillStyle = door;
    g.beginPath(); g.moveTo(-10, 2); g.lineTo(-10, -22); g.arc(0, -22, 10, Math.PI, 0); g.lineTo(10, 2); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0, 0, 0, 0.18)';
    g.fillRect(2, -24, 8, 26);
    g.strokeStyle = INK;
    g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(-10, 2); g.lineTo(-10, -22); g.arc(0, -22, 10, Math.PI, 0); g.lineTo(10, 2); g.stroke();
    g.fillStyle = '#ffe27a';
    g.beginPath(); g.arc(5, -10, 1.6, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8a5a30';
    g.fillRect(-13, 0, 26, 3);
    /* Flower pot by the door */
    g.fillStyle = '#c8643a';
    g.fillRect(-24, -6, 7, 6);
    g.fillStyle = '#5ac85a';
    g.beginPath(); g.arc(-20.5, -8, 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ff88cc';
    g.beginPath(); g.arc(-21.5, -10, 1.6, 0, Math.PI * 2); g.arc(-18.5, -8.5, 1.4, 0, Math.PI * 2); g.fill();
  }

  function paintCheeseStall(g) {
    var INK = '#4a2410';
    /* Brick oven on the right */
    g.fillStyle = '#b8583a';
    g.beginPath(); g.moveTo(52, 2); g.arc(76, 2, 24, Math.PI, 0); g.closePath(); g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 1.5;
    g.stroke();
    g.strokeStyle = 'rgba(80, 30, 16, 0.5)';
    g.lineWidth = 0.8;
    for (var br = 0; br < 3; br++) {
      g.beginPath(); g.arc(76, 2, 8 + br * 6, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    }
    g.fillStyle = '#2a120a';
    g.beginPath(); g.moveTo(66, 2); g.lineTo(66, -8); g.arc(76, -8, 10, Math.PI, 0); g.lineTo(86, 2); g.closePath(); g.fill();
    g.fillStyle = '#8a8ea8';
    g.fillRect(84, -38, 6, 18);
    g.fillStyle = '#b8bcd0';
    g.fillRect(83, -40, 8, 3);
    /* Posts */
    g.fillStyle = '#8a4a20';
    g.fillRect(-48, -88, 5, 88);
    g.fillRect(43, -88, 5, 88);
    g.fillStyle = 'rgba(255, 220, 170, 0.4)';
    g.fillRect(-48, -88, 1.5, 88);
    /* Counter: planks, a lit top board */
    var cg = g.createLinearGradient(0, -36, 0, 0);
    cg.addColorStop(0, '#c4803e');
    cg.addColorStop(1, '#7a4420');
    g.fillStyle = cg;
    g.fillRect(-50, -36, 100, 36);
    g.strokeStyle = 'rgba(60, 24, 8, 0.45)';
    g.lineWidth = 1;
    for (var pl = -30; pl < 50; pl += 20) { g.beginPath(); g.moveTo(pl, -34); g.lineTo(pl, 0); g.stroke(); }
    g.fillStyle = '#e0a868';
    g.fillRect(-54, -40, 108, 6);
    g.strokeStyle = INK;
    g.lineWidth = 1.4;
    g.strokeRect(-54, -40, 108, 6);
    g.strokeRect(-50, -34, 100, 34);
    /* Cheese wedge emblem on the counter front */
    g.fillStyle = '#ffd24a';
    g.beginPath(); g.moveTo(-10, -8); g.lineTo(12, -8); g.lineTo(8, -26); g.closePath(); g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = '#c88a2a';
    g.beginPath(); g.arc(3, -14, 2, 0, Math.PI * 2); g.arc(7, -20, 1.3, 0, Math.PI * 2); g.fill();
    /* Wares on the counter: cheese wheels and a wedge */
    var wh = [[-36, -46, 7], [-24, -46, 6]];
    for (var w = 0; w < wh.length; w++) {
      g.fillStyle = '#ffcf48';
      g.beginPath(); g.ellipse(wh[w][0], wh[w][1], wh[w][2], wh[w][2] * 0.85, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#a8641c';
      g.lineWidth = 1.4;
      g.stroke();
      g.fillStyle = '#fff0a0';
      g.beginPath(); g.ellipse(wh[w][0] - 2, wh[w][1] - 2, wh[w][2] * 0.4, wh[w][2] * 0.25, -0.4, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#ffd860';
    g.beginPath(); g.moveTo(24, -40); g.lineTo(40, -40); g.lineTo(38, -52); g.closePath(); g.fill();
    g.strokeStyle = '#a8641c';
    g.stroke();
    /* Striped scalloped awning and its roof board */
    var AW_T = -100, AW_B = -80;
    for (var st = 0; st < 8; st++) {
      var x0 = -58 + st * 14.5;
      g.fillStyle = st % 2 ? '#fff4d8' : '#ffc23a';
      g.beginPath();
      g.moveTo(x0, AW_T);
      g.lineTo(x0 + 14.5, AW_T);
      g.lineTo(x0 + 14.5, AW_B);
      g.arc(x0 + 7.25, AW_B, 7.25, 0, Math.PI);
      g.closePath();
      g.fill();
    }
    g.fillStyle = 'rgba(120, 50, 10, 0.18)';
    g.fillRect(-58, AW_B - 6, 116, 6);
    g.strokeStyle = INK;
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(-58, AW_T);
    for (var sc = 0; sc < 8; sc++) g.arc(-58 + sc * 14.5 + 7.25, AW_B, 7.25, Math.PI, 0, true);
    g.lineTo(58, AW_T);
    g.stroke();
    g.fillStyle = '#e8445a';
    g.fillRect(-61, AW_T - 7, 122, 7);
    g.strokeRect(-61, AW_T - 7, 122, 7);
    g.fillStyle = 'rgba(255, 255, 255, 0.35)';
    g.fillRect(-60, AW_T - 6, 120, 2);
    /* Round plaque with a little cake on it */
    g.fillStyle = '#fff4d8';
    g.beginPath(); g.arc(0, AW_T - 18, 13, 0, Math.PI * 2); g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 1.4;
    g.stroke();
    g.fillStyle = '#ffd24a';
    g.fillRect(-7, AW_T - 18, 14, 7);
    g.fillStyle = '#ff88bb';
    g.fillRect(-5, AW_T - 24, 10, 6);
    g.fillStyle = '#e8344a';
    g.beginPath(); g.arc(0, AW_T - 26, 2, 0, Math.PI * 2); g.fill();
  }

  /* ---- Moon village shops and homes you can go into ----
     Each paints its own door at the spot its houseDoor zone covers
     (deli: x + 32, parlour and family home: x). */
  function archDoor(g, cx, w, h, fill, ink) {
    g.fillStyle = fill;
    g.beginPath(); g.moveTo(cx - w / 2, 0); g.lineTo(cx - w / 2, -h + w / 2); g.arc(cx, -h + w / 2, w / 2, Math.PI, 0); g.lineTo(cx + w / 2, 0); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0, 0, 0, 0.16)';
    g.fillRect(cx + 1, -h + w / 2 - 2, w / 2 - 1, h - w / 2 + 2);
    g.strokeStyle = ink;
    g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(cx - w / 2, 0); g.lineTo(cx - w / 2, -h + w / 2); g.arc(cx, -h + w / 2, w / 2, Math.PI, 0); g.lineTo(cx + w / 2, 0); g.stroke();
    g.fillStyle = '#ffe27a';
    g.beginPath(); g.arc(cx + w / 2 - 5, -h * 0.45, 1.8, 0, Math.PI * 2); g.fill();
  }
  function warmWindow(g, x, y, r, ink) {
    var lg = g.createRadialGradient(x - 1, y - 1, 0, x, y, r);
    lg.addColorStop(0, '#fff6c8');
    lg.addColorStop(1, '#ffb84a');
    g.fillStyle = lg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = ink;
    g.lineWidth = 1.6;
    g.stroke();
  }

  /* Gouda's Cheese Deli: a block of swiss with a wedge roof, a striped
     mint awning over the cheese window and a hanging wedge sign. */
  function paintCheeseDeli(g) {
    var INK = '#5a3010';
    /* Side face for depth, then the front block */
    g.fillStyle = '#b8761e';
    g.fillRect(-56, -92, 120, 92);
    var bg = g.createLinearGradient(-60, -96, 50, 0);
    bg.addColorStop(0, '#fff09a');
    bg.addColorStop(0.5, '#ffd04a');
    bg.addColorStop(1, '#dc962c');
    g.fillStyle = bg;
    g.fillRect(-60, -96, 116, 96);
    g.strokeStyle = INK;
    g.lineWidth = 1.6;
    g.strokeRect(-60, -96, 116, 96);
    cheeseHole(g, -48, -84, 3.2);
    cheeseHole(g, 44, -82, 4);
    cheeseHole(g, -50, -12, 2.6);
    cheeseHole(g, 14, -86, 2.2);
    /* Wedge roof with a sunlit edge */
    g.fillStyle = '#e09a2a';
    g.beginPath(); g.moveTo(-66, -96); g.lineTo(62, -96); g.lineTo(66, -100); g.lineTo(-18, -134); g.closePath(); g.fill();
    g.fillStyle = '#ffd860';
    g.beginPath(); g.moveTo(-66, -96); g.lineTo(62, -96); g.lineTo(-20, -131); g.closePath(); g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(-66, -96); g.lineTo(62, -96); g.lineTo(66, -100); g.lineTo(-18, -134); g.lineTo(-20, -131); g.closePath(); g.stroke();
    g.strokeStyle = 'rgba(255, 252, 220, 0.85)';
    g.beginPath(); g.moveTo(-62, -98); g.lineTo(-21, -128); g.stroke();
    cheeseHole(g, -14, -110, 3);
    cheeseHole(g, 18, -104, 2.2);
    /* Display window with shelves of cheese */
    g.fillStyle = '#5a2e14';
    g.fillRect(-52, -66, 58, 46);
    var wg = g.createLinearGradient(0, -64, 0, -22);
    wg.addColorStop(0, '#fff4cc');
    wg.addColorStop(1, '#ffc768');
    g.fillStyle = wg;
    g.fillRect(-49, -63, 52, 40);
    g.fillStyle = '#9a5a2a';
    g.fillRect(-49, -45, 52, 2.5);
    g.fillRect(-49, -26, 52, 2.5);
    var wheels = [[-41, -51, 6, '#ffcf48'], [-28, -50, 5, '#ffb03a'], [-15, -51, 6, '#fff0b0'], [-3, -50, 4.5, '#ffcf48'],
                  [-40, -31, 5, '#fff0b0'], [-26, -32, 6, '#ffcf48'], [-11, -31, 5, '#ffb03a']];
    for (var i = 0; i < wheels.length; i++) {
      var w = wheels[i];
      g.fillStyle = w[3];
      g.beginPath(); g.ellipse(w[0], w[1], w[2], w[2] * 0.8, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#a8641c';
      g.lineWidth = 1;
      g.stroke();
    }
    g.fillStyle = '#ffd860';
    g.beginPath(); g.moveTo(-2, -28); g.lineTo(2, -38); g.lineTo(2, -28); g.closePath(); g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 1.6;
    g.strokeRect(-52, -66, 58, 46);
    g.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(-44, -60); g.lineTo(-36, -60); g.moveTo(-44, -56); g.lineTo(-40, -56); g.stroke();
    /* Flower box under the window */
    g.fillStyle = '#8a4a20';
    g.fillRect(-54, -20, 62, 6);
    g.strokeStyle = INK;
    g.lineWidth = 1;
    g.strokeRect(-54, -20, 62, 6);
    var fl = ['#ff66cc', '#44ddff', '#ffd24a', '#ff66cc', '#88dd66'];
    for (var f = 0; f < 5; f++) {
      g.fillStyle = '#5ac85a';
      g.beginPath(); g.arc(-48 + f * 12.5, -22, 3, 0, Math.PI * 2); g.fill();
      g.fillStyle = fl[f];
      g.beginPath(); g.arc(-47 + f * 12.5, -23.5, 1.8, 0, Math.PI * 2); g.fill();
    }
    /* Striped scalloped awning over window and door */
    var AT = -82, AB = -70, n = 8, sw = 118 / n;
    for (var st = 0; st < n; st++) {
      var x0 = -62 + st * sw;
      g.fillStyle = st % 2 ? '#fff4d8' : '#5ec8a0';
      g.beginPath(); g.moveTo(x0, AT); g.lineTo(x0 + sw, AT); g.lineTo(x0 + sw, AB); g.arc(x0 + sw / 2, AB, sw / 2, 0, Math.PI); g.closePath(); g.fill();
    }
    g.strokeStyle = INK;
    g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(-62, AT);
    for (var sc = 0; sc < n; sc++) g.arc(-62 + sc * sw + sw / 2, AB, sw / 2, Math.PI, 0, true);
    g.lineTo(56, AT); g.stroke();
    g.fillStyle = '#2e8a6a';
    g.fillRect(-64, AT - 5, 122, 5);
    g.strokeRect(-64, AT - 5, 122, 5);
    /* Mint door with a little window */
    archDoor(g, 32, 24, 50, '#5ec8a0', INK);
    g.fillStyle = '#fff4cc';
    g.beginPath(); g.arc(32, -36, 5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = '#8a5a30';
    g.fillRect(18, 0, 28, 3);
    /* Bracket for the hanging sign (the sign itself sways, drawn live) */
    g.strokeStyle = '#6a4a2a';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(56, -60); g.lineTo(72, -60); g.stroke();
  }
  /* Wedge sign under the deli's bracket. */
  function drawDeliSign(x, y, t) {
    ctx.save();
    ctx.translate(x + 68, y - 60);
    ctx.rotate(Math.sin(t * 0.0018) * 0.12);
    ctx.strokeStyle = '#6a4a2a';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-5, 5); ctx.moveTo(5, 0); ctx.lineTo(5, 5); ctx.stroke();
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath(); ctx.moveTo(-12, 5); ctx.lineTo(12, 5); ctx.lineTo(0, 26); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#5a3010';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#c88a2a';
    ctx.beginPath(); ctx.arc(-3, 10, 1.6, 0, Math.PI * 2); ctx.arc(4, 13, 1.2, 0, Math.PI * 2); ctx.arc(0, 19, 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* Moon Scoops: pastel parlour under a strawberry-scoop dome with a
     cherry on top, a round sundae window and a candy-striped door. */
  function paintIceCreamParlour(g) {
    var INK = '#5a2440';
    /* Walls: mint with a pink skirting */
    var wg = g.createLinearGradient(-54, -72, 40, 0);
    wg.addColorStop(0, '#d8fff0');
    wg.addColorStop(1, '#8edcc0');
    g.fillStyle = '#5aa890';
    g.fillRect(-50, -70, 106, 70);
    g.fillStyle = wg;
    g.fillRect(-54, -72, 106, 72);
    g.fillStyle = '#ff9ac8';
    g.fillRect(-54, -10, 106, 10);
    g.strokeStyle = INK;
    g.lineWidth = 1.6;
    g.strokeRect(-54, -72, 106, 72);
    /* Polka dots on the wall */
    g.fillStyle = 'rgba(255, 255, 255, 0.6)';
    for (var d = 0; d < 9; d++) {
      g.beginPath(); g.arc(-46 + (d * 23) % 100, -62 + (d * 17) % 46, 1.8, 0, Math.PI * 2); g.fill();
    }
    /* Strawberry-scoop dome with a dripping rim */
    g.fillStyle = '#d45a8c';
    g.beginPath(); g.ellipse(4, -70, 62, 52, 0, Math.PI, 0); g.fill();
    var dg = g.createRadialGradient(-20, -108, 4, 0, -76, 64);
    dg.addColorStop(0, '#ffe0ee');
    dg.addColorStop(0.5, '#ff9ac8');
    dg.addColorStop(1, '#e8609a');
    g.fillStyle = dg;
    g.beginPath(); g.ellipse(0, -72, 60, 50, 0, Math.PI, 0); g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 1.6;
    g.beginPath(); g.ellipse(0, -72, 60, 50, 0, Math.PI, 0); g.stroke();
    /* Drips hanging over the wall top */
    g.fillStyle = '#ff9ac8';
    g.beginPath();
    g.moveTo(-60, -72);
    var drips = [[-48, 9], [-30, 5], [-14, 12], [4, 6], [22, 10], [40, 5], [54, 8]];
    for (var i = 0; i < drips.length; i++) {
      var dx = drips[i][0], dl = drips[i][1];
      g.lineTo(dx - 5, -72);
      g.quadraticCurveTo(dx - 5, -72 + dl, dx, -72 + dl);
      g.quadraticCurveTo(dx + 5, -72 + dl, dx + 5, -72);
    }
    g.lineTo(60, -72);
    g.closePath();
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 1.2;
    g.stroke();
    /* Sprinkles on the dome */
    var spr = ['#ffd24a', '#44ddff', '#88dd66', '#ffffff', '#7a5cff'];
    var sprPos = [[-44, -84], [-34, -98], [-18, -90], [-6, -110], [-2, -86], [10, -100], [20, -88], [28, -108],
                  [36, -94], [46, -82], [-26, -80], [14, -78], [-40, -76], [32, -78], [0, -96], [-14, -104]];
    for (var s = 0; s < sprPos.length; s++) {
      g.save(); g.translate(sprPos[s][0], sprPos[s][1]); g.rotate(s * 1.3);
      g.fillStyle = spr[s % spr.length];
      g.fillRect(-2.2, -0.8, 4.4, 1.6);
      g.restore();
    }
    g.fillStyle = 'rgba(255, 255, 255, 0.55)';
    g.beginPath(); g.ellipse(-26, -104, 12, 5, -0.5, 0, Math.PI * 2); g.fill();
    /* Cherry on top */
    g.strokeStyle = '#3a7a2a';
    g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(2, -128); g.quadraticCurveTo(6, -138, 12, -140); g.stroke();
    g.fillStyle = '#e8344a';
    g.beginPath(); g.arc(1, -126, 6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 1.2;
    g.stroke();
    g.fillStyle = 'rgba(255, 255, 255, 0.7)';
    g.beginPath(); g.arc(-1, -128, 1.8, 0, Math.PI * 2); g.fill();
    /* Round window with a sundae inside */
    g.fillStyle = '#fff8e0';
    g.beginPath(); g.arc(-32, -38, 14, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e8a050';
    g.beginPath(); g.moveTo(-38, -36); g.lineTo(-26, -36); g.lineTo(-32, -25); g.closePath(); g.fill();
    g.fillStyle = '#ff9ac8';
    g.beginPath(); g.arc(-34, -40, 4.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#9fe8c8';
    g.beginPath(); g.arc(-29.5, -41, 4.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff0b0';
    g.beginPath(); g.arc(-32, -45.5, 4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#e8609a';
    g.lineWidth = 3;
    g.beginPath(); g.arc(-32, -38, 14, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = INK;
    g.lineWidth = 1.2;
    g.beginPath(); g.arc(-32, -38, 15.5, 0, Math.PI * 2); g.stroke();
    /* Candy-striped awning over the door */
    for (var st = 0; st < 4; st++) {
      g.fillStyle = st % 2 ? '#ffffff' : '#ff66aa';
      g.beginPath(); g.moveTo(-18 + st * 9, -60); g.lineTo(-9 + st * 9, -60); g.lineTo(-9 + st * 9, -54); g.arc(-13.5 + st * 9, -54, 4.5, 0, Math.PI); g.closePath(); g.fill();
    }
    g.strokeStyle = INK;
    g.lineWidth = 1;
    g.strokeRect(-18, -60, 36, 6);
    /* Glass door, mint frame */
    archDoor(g, 0, 22, 48, '#ffd8ea', INK);
    g.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(-6, -34); g.lineTo(-2, -40); g.moveTo(-6, -27); g.lineTo(0, -35); g.stroke();
    g.fillStyle = '#8a5a30';
    g.fillRect(-14, 0, 28, 3);
    /* Waffle-cone board out front */
    g.fillStyle = '#8a5a30';
    g.beginPath(); g.moveTo(34, 0); g.lineTo(40, -26); g.lineTo(52, -26); g.lineTo(58, 0); g.closePath(); g.fill();
    g.fillStyle = '#fff4d8';
    g.fillRect(38, -24, 16, 18);
    g.fillStyle = '#e8a050';
    g.beginPath(); g.moveTo(42, -15); g.lineTo(50, -15); g.lineTo(46, -8); g.closePath(); g.fill();
    g.fillStyle = '#ff9ac8';
    g.beginPath(); g.arc(46, -17, 4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 1;
    g.strokeRect(38, -24, 16, 18);
  }

  /* The Whisker family home: two cheese wheels stacked up, a wedge roof,
     window boxes, a washing line of tiny socks and a big round door. */
  function paintMouseFamilyHome(g) {
    var INK = '#6a3a10';
    function wheel(cx, cy, r) {
      g.fillStyle = '#b8761e';
      g.beginPath(); g.arc(cx + 6, cy + 2, r, 0, Math.PI * 2); g.fill();
      var wg = g.createRadialGradient(cx - r * 0.4, cy - r * 0.5, 4, cx, cy, r + 2);
      wg.addColorStop(0, '#fff0a0');
      wg.addColorStop(0.6, '#ffd04a');
      wg.addColorStop(1, '#d8902a');
      g.fillStyle = wg;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#c47a22';
      g.lineWidth = 5;
      g.beginPath(); g.arc(cx, cy, r - 3, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = INK;
      g.lineWidth = 1.6;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    }
    /* Washing line from the top wheel to a pole */
    g.fillStyle = '#8a5a30';
    g.fillRect(56, -88, 3, 88);
    g.strokeStyle = 'rgba(70, 40, 20, 0.8)';
    g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(30, -104); g.quadraticCurveTo(44, -90, 57, -86); g.stroke();
    var socks = [[38, -96, '#ff66cc'], [45, -92, '#44ddff'], [52, -88, '#88dd66']];
    for (var k = 0; k < socks.length; k++) {
      g.fillStyle = socks[k][2];
      g.fillRect(socks[k][0] - 1.5, socks[k][1], 3, 6);
      g.fillRect(socks[k][0] - 1.5, socks[k][1] + 4.5, 5, 2.5);
    }
    wheel(0, -46, 46);
    wheel(4, -118, 31);
    cheeseHole(g, 26, -24, 3.6);
    cheeseHole(g, -32, -60, 2.8);
    cheeseHole(g, 30, -66, 2.4);
    cheeseHole(g, -14, -124, 2.2);
    /* Wedge roof and thimble chimney */
    g.fillStyle = '#9aa0b8';
    g.fillRect(18, -170, 9, 16);
    g.fillStyle = '#c8cee0';
    g.fillRect(17, -172, 11, 3);
    g.strokeStyle = INK;
    g.lineWidth = 1;
    g.strokeRect(18, -170, 9, 16);
    g.fillStyle = '#e09a2a';
    g.beginPath(); g.moveTo(-32, -140); g.lineTo(38, -140); g.lineTo(42, -144); g.lineTo(2, -178); g.closePath(); g.fill();
    g.fillStyle = '#ffd860';
    g.beginPath(); g.moveTo(-32, -140); g.lineTo(38, -140); g.lineTo(0, -176); g.closePath(); g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(-32, -140); g.lineTo(38, -140); g.lineTo(42, -144); g.lineTo(2, -178); g.lineTo(0, -176); g.closePath(); g.stroke();
    g.strokeStyle = 'rgba(255, 252, 220, 0.85)';
    g.beginPath(); g.moveTo(-29, -142); g.lineTo(-1, -172); g.stroke();
    cheeseHole(g, 4, -152, 2.6);
    /* Windows with pink curtains and window boxes */
    var wins = [[-24, -56, 9], [24, -50, 8], [6, -118, 9]];
    for (var i = 0; i < wins.length; i++) {
      var wx = wins[i][0], wy = wins[i][1], wr = wins[i][2];
      warmWindow(g, wx, wy, wr, '#8a4a18');
      g.fillStyle = 'rgba(255, 120, 180, 0.8)';
      g.beginPath(); g.moveTo(wx - wr + 1, wy - wr * 0.6); g.quadraticCurveTo(wx - wr * 0.2, wy - wr * 0.6, wx - wr * 0.5, wy + wr * 0.6); g.lineTo(wx - wr + 1, wy + wr * 0.4); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(wx + wr - 1, wy - wr * 0.6); g.quadraticCurveTo(wx + wr * 0.2, wy - wr * 0.6, wx + wr * 0.5, wy + wr * 0.6); g.lineTo(wx + wr - 1, wy + wr * 0.4); g.closePath(); g.fill();
      g.fillStyle = '#8a4a20';
      g.fillRect(wx - wr - 1, wy + wr - 1, wr * 2 + 2, 4);
      g.fillStyle = '#5ac85a';
      g.beginPath(); g.arc(wx - wr * 0.5, wy + wr - 2, 2.4, 0, Math.PI * 2); g.arc(wx + wr * 0.5, wy + wr - 2, 2.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = i % 2 ? '#ffd24a' : '#ff88cc';
      g.beginPath(); g.arc(wx - wr * 0.5, wy + wr - 3.5, 1.4, 0, Math.PI * 2); g.arc(wx + wr * 0.5, wy + wr - 3.5, 1.4, 0, Math.PI * 2); g.fill();
    }
    /* Big round family door with a heart window and a doormat */
    archDoor(g, 0, 28, 40, '#ff88bb', INK);
    g.fillStyle = '#fff0f6';
    var hx = 0, hy = -26;
    g.beginPath();
    g.arc(hx - 2.2, hy - 1, 2.4, 0, Math.PI * 2);
    g.arc(hx + 2.2, hy - 1, 2.4, 0, Math.PI * 2);
    g.moveTo(hx - 4.4, hy); g.lineTo(hx, hy + 4.6); g.lineTo(hx + 4.4, hy);
    g.closePath(); g.fill();
    g.fillStyle = '#8a5a30';
    g.fillRect(-18, 0, 36, 3);
    g.fillStyle = '#c84a6a';
    g.fillRect(-12, -2, 24, 2.5);
    /* Heart mailbox on a post */
    g.fillStyle = '#8a5a30';
    g.fillRect(-52, -22, 3, 22);
    g.fillStyle = '#ff66aa';
    g.fillRect(-58, -32, 15, 10);
    g.strokeStyle = INK;
    g.lineWidth = 1;
    g.strokeRect(-58, -32, 15, 10);
    g.fillStyle = '#ffffff';
    g.fillRect(-55, -29, 9, 1.4);
  }

  /* Moon Cheese Cake on Brie's counter once her quest is done, with
     flickering candles. */
  function drawCheeseCake(x, y, t) {
    var tiers = [[30, 12, '#ffd24a'], [22, 11, '#ffe27a'], [14, 10, '#fff0a8']];
    var ty = y;
    ctx.save();
    ctx.strokeStyle = '#8a5418';
    ctx.lineWidth = 1.2;
    for (var i = 0; i < tiers.length; i++) {
      var tw = tiers[i][0], th = tiers[i][1];
      ctx.fillStyle = tiers[i][2];
      ctx.fillRect(x - tw / 2, ty - th, tw, th);
      ctx.strokeRect(x - tw / 2, ty - th, tw, th);
      /* Pink icing drips along the top of each tier */
      ctx.fillStyle = '#ff9ac8';
      ctx.fillRect(x - tw / 2, ty - th, tw, 2.5);
      for (var dpI = 0; dpI < tw / 5; dpI++) {
        ctx.beginPath(); ctx.arc(x - tw / 2 + 2.5 + dpI * 5, ty - th + 2.5, 1.4 + (dpI % 2) * 0.6, 0, Math.PI); ctx.fill();
      }
      ctx.fillStyle = '#c88a2a';
      ctx.beginPath(); ctx.arc(x - tw / 4, ty - th / 2 + 1, 1.3, 0, Math.PI * 2); ctx.arc(x + tw / 5, ty - th / 2 + 2, 1, 0, Math.PI * 2); ctx.fill();
      ty -= th;
    }
    for (var cd = -1; cd <= 1; cd++) {
      var cx = x + cd * 4;
      ctx.fillStyle = cd ? '#44ddff' : '#ff66cc';
      ctx.fillRect(cx - 0.8, ty - 6, 1.6, 6);
      var fl = 1 + Math.sin(t * 0.02 + cd * 2) * 0.25;
      ctx.fillStyle = '#ffb030';
      ctx.beginPath(); ctx.ellipse(cx, ty - 8, 1.4 * fl, 2.4 * fl, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff6c0';
      ctx.beginPath(); ctx.ellipse(cx, ty - 7.6, 0.6, 1.1, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  var BUNTING_COLS = ['#ff66cc', '#ffd24a', '#44ddff', '#88dd66'];
  function drawBunting(d, dx, dy, t, party) {
    var span = d.x2 - d.x, top = dy - (d.h || 90), sag = 26;
    ctx.save();
    ctx.strokeStyle = 'rgba(70, 40, 20, 0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dx, top);
    ctx.quadraticCurveTo(dx + span / 2, top + sag * 2, dx + span, top);
    ctx.stroke();
    var n = Math.floor(span / 22);
    for (var i = 1; i < n; i++) {
      var u = i / n;
      var fx = dx + span * u;
      if (fx < -10 || fx > W + 10) continue;
      var fy = top + sag * 2 * 2 * u * (1 - u);
      var sw = Math.sin(t * (party ? 0.006 : 0.002) + i * 0.9) * (party ? 0.35 : 0.15);
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(sw);
      ctx.fillStyle = BUNTING_COLS[i % 4];
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.lineTo(0, 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(0, 0); ctx.lineTo(-1.5, 6); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (party) {
        var on = 0.5 + 0.5 * Math.sin(t * 0.005 + i * 1.7);
        ctx.globalAlpha = 0.5 + on * 0.5;
        ctx.drawImage(glowSprite(BUNTING_COLS[(i + 2) % 4], 12), fx + 11 - 8, fy - 7, 16, 16);
        ctx.fillStyle = '#fffbe0';
        ctx.beginPath(); ctx.arc(fx + 11, fy + 1, 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  /* Bounce craters and crater critters sit on the ground, so they draw
     after the surface instead of behind it with the other scenery. */
  function renderGroundDecor(floorBase) {
    var t = Date.now();
    for (var i = 0; i < level.decorations.length; i++) {
      var d = level.decorations[i];
      if (d.type !== 'cheeseBounce' && d.type !== 'craterPeeker') continue;
      var dx = d.x - camera.x;
      if (dx < -60 || dx > W + 60) continue;
      var gy = floorBase + surfaceUndulation(d.x) + 2;
      if (d.type === 'cheeseBounce') {
        var sq = d.squish || 0;
        var rx = 30 * (1 + sq * 0.08);
        ctx.fillStyle = '#b8761e';
        ctx.beginPath(); ctx.ellipse(dx, gy, rx, 9, 0, 0, Math.PI * 2); ctx.fill();
        var mg = ctx.createLinearGradient(0, gy - 6, 0, gy + 6);
        mg.addColorStop(0, '#fff0a0');
        mg.addColorStop(1, '#ffae30');
        ctx.fillStyle = mg;
        ctx.beginPath(); ctx.ellipse(dx, gy + sq * 3.5, rx - 6, 5.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.beginPath(); ctx.ellipse(dx - 8, gy - 1.5 + sq * 3, 7, 1.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#7a4818';
        ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.ellipse(dx, gy, rx, 9, 0, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 244, 190, 0.8)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(dx, gy, rx, 9, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        /* Rising chevrons hint that it springs */
        ctx.strokeStyle = '#fff4c0';
        ctx.lineWidth = 2;
        for (var cv = 0; cv < 2; cv++) {
          var ph = ((t * 0.0012) + cv * 0.5) % 1;
          ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.75;
          var cy = gy - 12 - ph * 16;
          ctx.beginPath(); ctx.moveTo(dx - 5, cy + 3); ctx.lineTo(dx, cy - 1); ctx.lineTo(dx + 5, cy + 3); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else {
        /* Peeks out of its hole and ducks when Momoko comes close; now
           and then it pops down by itself, then back up. */
        var near = player && Math.abs(player.x + player.w / 2 - d.x) < 110 && player.y + player.h > level.floorY - 140;
        var nap = ((t * 0.001 + d.x * 0.013) % 9) < 1.2;
        d.peek = (d.peek || 0) + (((near || nap) ? 0 : 1) - (d.peek || 0)) * 0.08;
        ctx.fillStyle = '#3a1a08';
        ctx.beginPath(); ctx.ellipse(dx, gy, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
        if (d.peek > 0.03) {
          var hy = gy + 9 - d.peek * 13;
          ctx.save();
          ctx.beginPath(); ctx.rect(dx - 14, gy - 30, 28, 30); ctx.clip();
          ctx.fillStyle = d.color || '#c8a8ff';
          ctx.beginPath(); ctx.ellipse(dx, hy, 8, 7.5, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(40, 16, 60, 0.6)';
          ctx.lineWidth = 1;
          ctx.stroke();
          /* Little tuft */
          ctx.strokeStyle = d.color || '#c8a8ff';
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(dx, hy - 7); ctx.quadraticCurveTo(dx + 2, hy - 12, dx + 4, hy - 11); ctx.stroke();
          var look = player ? Math.max(-1.2, Math.min(1.2, (player.x - d.x) * 0.01)) : 0;
          var blink = ((t * 0.001 + d.x) % 3.3) < 0.13;
          for (var ey = -1; ey <= 1; ey += 2) {
            var ex = dx + ey * 3.4;
            if (blink) {
              ctx.strokeStyle = '#2a1030';
              ctx.lineWidth = 1;
              ctx.beginPath(); ctx.moveTo(ex - 2, hy - 1); ctx.lineTo(ex + 2, hy - 1); ctx.stroke();
            } else {
              ctx.fillStyle = '#ffffff';
              ctx.beginPath(); ctx.ellipse(ex, hy - 1, 2.6, 3, 0, 0, Math.PI * 2); ctx.fill();
              ctx.fillStyle = '#2a1030';
              ctx.beginPath(); ctx.arc(ex + look, hy - 0.6, 1.4, 0, Math.PI * 2); ctx.fill();
              ctx.fillStyle = '#ffffff';
              ctx.beginPath(); ctx.arc(ex + look - 0.5, hy - 1.3, 0.5, 0, Math.PI * 2); ctx.fill();
            }
          }
          ctx.restore();
        }
        /* Front lip of the hole over its body */
        ctx.strokeStyle = 'rgba(255, 236, 170, 0.7)';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.ellipse(dx, gy, 12, 4, 0, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke();
      }
    }
  }

  function renderDecorations() {
    if (!level) return;
    var party = Game.quests && Game.quests.brie === 'done';
    for (var i = 0; i < level.decorations.length; i++) {
      var d = level.decorations[i];
      /* Sky bodies scroll with the far parallax; everything else sits on
         the ground. Wide pieces (arches, bunting) cull on their span. */
      var sky = d.type === 'cheeseMoonBg' || d.type === 'homePlanetBg';
      var dx = d.x - camera.x * (sky ? 0.15 : 1);
      var cull = sky ? (d.r || 90) * 1.7 : 130;
      if (dx + (d.x2 ? d.x2 - d.x : 0) < -cull || dx > W + cull) continue;
      var dy = d.y - camera.y;

      if (d.type === 'antenna') {
        /* Radio tower silhouette with blinking top light */
        var th = d.h || 80;
        ctx.strokeStyle = '#7d8896';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(dx, dy);
        ctx.lineTo(dx, dy - th);
        ctx.stroke();
        /* Cross beams */
        ctx.lineWidth = 1;
        for (var an = 1; an <= 4; an++) {
          var ay = dy - (th * an / 5);
          var aw = 3 + (4 - an) * 2;
          ctx.beginPath();
          ctx.moveTo(dx - aw, ay);
          ctx.lineTo(dx + aw, ay);
          ctx.stroke();
        }
        /* Blink tip */
        var blink = (Math.sin(Date.now() * 0.004 + d.x * 0.01) > 0) ? '#ff3344' : '#661122';
        ctx.fillStyle = blink;
        ctx.beginPath();
        ctx.arc(dx, dy - th - 2, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.type === 'satellite') {
        /* Satellite dish on a tripod */
        ctx.fillStyle = '#556677';
        ctx.fillRect(dx - 1, dy - 8, 2, 8);
        ctx.beginPath();
        ctx.moveTo(dx - 6, dy);
        ctx.lineTo(dx - 2, dy - 10);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(dx + 6, dy);
        ctx.lineTo(dx + 2, dy - 10);
        ctx.stroke();
        /* Dish */
        ctx.fillStyle = '#99aabb';
        ctx.beginPath();
        ctx.arc(dx, dy - 12, 7, Math.PI * 0.1, Math.PI * 0.9, true);
        ctx.fill();
        ctx.fillStyle = '#ffd24a';
        ctx.beginPath();
        ctx.arc(dx, dy - 13, 1.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.type === 'crystal') {
        /* Glowing crystal cluster */
        var cColors = ['#88ddff', '#ff66cc', '#ffd24a'];
        var baseC = cColors[(d.variant || 0) % cColors.length];
        ctx.fillStyle = baseC;
        ctx.beginPath();
        ctx.moveTo(dx, dy);
        ctx.lineTo(dx - 4, dy - 2);
        ctx.lineTo(dx - 2, dy - 10);
        ctx.lineTo(dx + 2, dy - 10);
        ctx.lineTo(dx + 4, dy - 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.moveTo(dx - 1, dy - 2);
        ctx.lineTo(dx - 1, dy - 9);
        ctx.lineTo(dx + 1, dy - 9);
        ctx.closePath();
        ctx.fill();
      } else if (d.type === 'planetRing') {
        /* Small ringed planet in foreground */
        Game.ui.drawShadedPlanet(ctx, dx, dy, d.r || 18,
          mixHex(d.color || '#cc88ff', '#ffffff', 0.45), mixHex(d.color || '#cc88ff', '#1a0840', 0.55), '#ffd24a');
      } else if (d.type === 'rocketPad') {
        /* Static pad — the actual Rocket NPC draws the ship */
        ctx.fillStyle = '#4a4a5a';
        ctx.fillRect(dx - 30, dy - 4, 60, 6);
        ctx.fillStyle = '#66667a';
        ctx.fillRect(dx - 28, dy - 5, 56, 2);
        /* Warning stripes */
        ctx.fillStyle = '#ffd24a';
        for (var rsv = 0; rsv < 4; rsv++) {
          ctx.fillRect(dx - 26 + rsv * 14, dy - 4, 6, 1.5);
        }
      } else if (d.type === 'houseDecor') {
        /* Sci-fi cottage behind the door: the static house is a cached
           sprite; only the chimney smoke moves. */
        ctx.drawImage(houseSprite(d.color || '#8866aa', d.roofColor || '#cc4488'),
          dx - HOUSE_SPR_X, dy - HOUSE_SPR_Y, HOUSE_SPR_W, HOUSE_SPR_H);
        var smT = Date.now() * 0.0012 + d.x;
        for (var sm = 0; sm < 3; sm++) {
          var smP = (smT + sm * 0.33) % 1;
          ctx.fillStyle = 'rgba(230, 220, 255, ' + (0.32 * (1 - smP)).toFixed(2) + ')';
          ctx.beginPath();
          ctx.arc(dx + 33 + Math.sin(smP * 6 + sm) * 4, dy - 134 - smP * 26, 2.5 + smP * 4, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (d.type === 'cafeBuilding') {
        /* COSMIC CAFÉ — pink storefront, striped awning, big window with
           espresso machine + tiny patron, drifting steam. */
        var cbT = Date.now() * 0.003;
        /* Building body — deep magenta with vertical wall gradient */
        var cbBody = ctx.createLinearGradient(dx, dy - 130, dx, dy);
        cbBody.addColorStop(0, '#d8438a');
        cbBody.addColorStop(0.55, '#a82c6e');
        cbBody.addColorStop(1, '#5a1842');
        ctx.fillStyle = cbBody;
        ctx.fillRect(dx - 70, dy - 130, 140, 130);
        /* Outer trim */
        ctx.strokeStyle = '#ffe9f4';
        ctx.lineWidth = 2;
        ctx.strokeRect(dx - 70, dy - 130, 140, 130);
        /* Tile-band trim along the bottom */
        ctx.fillStyle = '#2a0a1a';
        ctx.fillRect(dx - 70, dy - 14, 140, 14);
        for (var cbi = 0; cbi < 7; cbi++) {
          ctx.fillStyle = (cbi % 2) ? '#ffd24a' : '#44ffff';
          ctx.fillRect(dx - 68 + cbi * 20, dy - 11, 16, 8);
        }
        /* Striped awning — pink + cream stripes, scalloped bottom */
        var awY = dy - 100;
        for (var aw = 0; aw < 7; aw++) {
          ctx.fillStyle = (aw % 2) ? '#ffe9f4' : '#ff66aa';
          ctx.fillRect(dx - 70 + aw * 20, awY, 20, 18);
        }
        ctx.fillStyle = '#ff4488';
        ctx.fillRect(dx - 72, awY - 4, 144, 6);
        /* Scalloped fringe */
        ctx.fillStyle = '#ff66aa';
        for (var sc = 0; sc < 7; sc++) {
          ctx.beginPath();
          ctx.arc(dx - 60 + sc * 20, awY + 18, 6, 0, Math.PI);
          ctx.fill();
        }
        /* Cursive "Café" label across the awning */
        ctx.save();
        ctx.fillStyle = '#3a0a22';
        ctx.font = 'bold italic 16px "Brush Script MT", cursive';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Café', dx, awY + 9);
        ctx.restore();
        /* Big front window — warm interior glow */
        var winX = dx - 55, winY = dy - 78, winW = 70, winH = 50;
        var winGrad = ctx.createLinearGradient(winX, winY, winX, winY + winH);
        winGrad.addColorStop(0, '#ffd28a');
        winGrad.addColorStop(1, '#d97a3a');
        ctx.fillStyle = winGrad;
        ctx.fillRect(winX, winY, winW, winH);
        /* Window frame */
        ctx.strokeStyle = '#3a1a2a';
        ctx.lineWidth = 2;
        ctx.strokeRect(winX, winY, winW, winH);
        ctx.beginPath();
        ctx.moveTo(winX + winW / 2, winY); ctx.lineTo(winX + winW / 2, winY + winH);
        ctx.moveTo(winX, winY + winH / 2); ctx.lineTo(winX + winW, winY + winH / 2);
        ctx.stroke();
        /* Espresso machine on the counter inside (left pane) */
        ctx.fillStyle = '#d8d8e0';
        ctx.fillRect(winX + 6, winY + 22, 22, 16);
        ctx.fillStyle = '#7a8896';
        ctx.fillRect(winX + 8, winY + 36, 18, 4);
        ctx.fillStyle = '#3a2a44';
        ctx.fillRect(winX + 12, winY + 40, 10, 5);
        /* Tiny patron silhouette in the right pane */
        ctx.fillStyle = '#3a1a2a';
        ctx.beginPath(); ctx.arc(winX + 52, winY + 28, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(winX + 48, winY + 32, 8, 12);
        /* Steam puff — drifts up animated */
        ctx.save();
        ctx.globalAlpha = 0.5 + Math.sin(cbT) * 0.2;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(winX + 19, winY + 14 - (cbT * 6 % 16), 3, 0, Math.PI * 2);
        ctx.arc(winX + 22, winY + 10 - (cbT * 6 % 16), 2.4, 0, Math.PI * 2);
        ctx.arc(winX + 17, winY + 9 - (cbT * 6 % 16), 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        /* Cafe door (right side) — heart cutout window */
        ctx.fillStyle = '#7a2454';
        ctx.fillRect(dx + 22, dy - 56, 28, 56);
        ctx.strokeStyle = '#ffd24a';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(dx + 22, dy - 56, 28, 56);
        ctx.fillStyle = '#ffd24a';
        var hX = dx + 36, hY = dy - 38;
        ctx.beginPath();
        ctx.arc(hX - 2.5, hY - 2, 2.5, 0, Math.PI * 2);
        ctx.arc(hX + 2.5, hY - 2, 2.5, 0, Math.PI * 2);
        ctx.moveTo(hX - 4.5, hY); ctx.lineTo(hX, hY + 5); ctx.lineTo(hX + 4.5, hY);
        ctx.closePath();
        ctx.fill();
        /* Door knob */
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath(); ctx.arc(dx + 27, dy - 28, 1.6, 0, Math.PI * 2); ctx.fill();
        /* Outdoor table + chair on the patio */
        var tbx = dx - 90;
        ctx.fillStyle = '#3a2a44';
        ctx.fillRect(tbx - 1.5, dy - 18, 3, 18);
        ctx.fillStyle = '#ffe9f4';
        ctx.beginPath();
        ctx.ellipse(tbx, dy - 18, 11, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        /* Mug on the table */
        ctx.fillStyle = '#ffd24a';
        ctx.fillRect(tbx - 3, dy - 26, 6, 6);
        ctx.strokeStyle = '#ffd24a';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(tbx + 5, dy - 23, 2.5, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
        /* Steam from the mug */
        ctx.save();
        ctx.globalAlpha = 0.6 + Math.sin(cbT * 1.2) * 0.2;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(tbx, dy - 30 - (cbT * 4 % 6), 1.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(tbx + 2, dy - 33 - (cbT * 4 % 6), 1.1, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        /* Chair next to it */
        ctx.fillStyle = '#ff66aa';
        ctx.fillRect(tbx + 12, dy - 14, 7, 14);
        ctx.fillRect(tbx + 12, dy - 22, 2, 10);
        /* Chalkboard menu hung beside the door */
        ctx.fillStyle = '#1a2a1a';
        ctx.fillRect(dx + 50, dy - 70, 18, 26);
        ctx.strokeStyle = '#88553a';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(dx + 50, dy - 70, 18, 26);
        ctx.fillStyle = '#ffe9f4';
        ctx.font = '5px "M PLUS Rounded 1c", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('MENU', dx + 59, dy - 62);
        ctx.fillStyle = '#ffd24a';
        ctx.fillRect(dx + 53, dy - 58, 12, 1);
        ctx.fillRect(dx + 53, dy - 54, 10, 1);
        ctx.fillRect(dx + 53, dy - 50, 11, 1);
        ctx.textAlign = 'left';
      } else if (d.type === 'shopBuilding') {
        /* SPACE BAZAAR — gold/teal storefront, big display window with
           merchandise, glowing OPEN sign, retro double doors. */
        var sbT = Date.now() * 0.004;
        /* Body */
        var sbBody = ctx.createLinearGradient(dx, dy - 130, dx, dy);
        sbBody.addColorStop(0, '#3aa8c4');
        sbBody.addColorStop(0.6, '#247088');
        sbBody.addColorStop(1, '#0e3a4a');
        ctx.fillStyle = sbBody;
        ctx.fillRect(dx - 75, dy - 130, 150, 130);
        ctx.strokeStyle = '#cdeaf4';
        ctx.lineWidth = 2;
        ctx.strokeRect(dx - 75, dy - 130, 150, 130);
        /* Stepped roofline (deco-style) */
        ctx.fillStyle = '#ffd24a';
        ctx.fillRect(dx - 75, dy - 130, 150, 8);
        ctx.fillStyle = '#ffaa22';
        ctx.fillRect(dx - 60, dy - 138, 120, 8);
        ctx.fillStyle = '#ffd24a';
        ctx.fillRect(dx - 35, dy - 146, 70, 8);
        /* Roof antenna with blinker */
        ctx.strokeStyle = '#cdeaf4';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(dx, dy - 146); ctx.lineTo(dx, dy - 162);
        ctx.stroke();
        ctx.fillStyle = (Math.sin(sbT * 4) > 0) ? '#ff4466' : '#660022';
        ctx.beginPath(); ctx.arc(dx, dy - 164, 2.6, 0, Math.PI * 2); ctx.fill();
        /* "BAZAAR" name plate above window */
        ctx.fillStyle = '#0a1a22';
        ctx.fillRect(dx - 60, dy - 116, 120, 18);
        ctx.fillStyle = '#ffd24a';
        ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★ BAZAAR ★', dx, dy - 107);
        ctx.textBaseline = 'alphabetic';
        /* Big display window with shelves */
        var swX = dx - 64, swY = dy - 92, swW = 92, swH = 60;
        var swGrad = ctx.createLinearGradient(swX, swY, swX, swY + swH);
        swGrad.addColorStop(0, '#cdeaf4');
        swGrad.addColorStop(1, '#6aaec0');
        ctx.fillStyle = swGrad;
        ctx.fillRect(swX, swY, swW, swH);
        ctx.strokeStyle = '#0a1a22';
        ctx.lineWidth = 2;
        ctx.strokeRect(swX, swY, swW, swH);
        /* Shelves (3 rows) */
        ctx.fillStyle = '#a87a3a';
        ctx.fillRect(swX + 2, swY + 18, swW - 4, 2);
        ctx.fillRect(swX + 2, swY + 38, swW - 4, 2);
        /* Merchandise — top shelf: potions */
        var pot = ['#ff66aa', '#44ff88', '#ffd24a', '#cc88ff'];
        for (var pp = 0; pp < 4; pp++) {
          var px = swX + 8 + pp * 21;
          ctx.fillStyle = pot[pp];
          ctx.fillRect(px, swY + 8, 6, 10);
          ctx.fillStyle = '#3a2a44';
          ctx.fillRect(px + 1, swY + 6, 4, 3);
        }
        /* Middle shelf: hat, helmet, ring, gem */
        ctx.fillStyle = '#5a3a8a';
        ctx.beginPath();
        ctx.moveTo(swX + 8, swY + 38);
        ctx.lineTo(swX + 14, swY + 24);
        ctx.lineTo(swX + 20, swY + 38);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffd24a';
        ctx.fillRect(swX + 6, swY + 36, 16, 2);
        /* Helmet */
        ctx.fillStyle = '#aabbcc';
        ctx.beginPath();
        ctx.arc(swX + 32, swY + 33, 6, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#44ffff';
        ctx.fillRect(swX + 28, swY + 30, 8, 2);
        /* Ring */
        ctx.strokeStyle = '#ffd24a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(swX + 50, swY + 32, 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ff66cc';
        ctx.beginPath();
        ctx.arc(swX + 50, swY + 28, 1.6, 0, Math.PI * 2);
        ctx.fill();
        /* Gem (shimmery) */
        var gemA = 0.6 + Math.sin(sbT * 2) * 0.4;
        ctx.save();
        ctx.globalAlpha = gemA;
        ctx.fillStyle = '#44ffff';
        ctx.beginPath();
        ctx.moveTo(swX + 70, swY + 28);
        ctx.lineTo(swX + 75, swY + 32);
        ctx.lineTo(swX + 70, swY + 38);
        ctx.lineTo(swX + 65, swY + 32);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        /* Bottom shelf: stack of books, scroll, boots */
        ctx.fillStyle = '#cc4466';
        ctx.fillRect(swX + 6, swY + 46, 14, 4);
        ctx.fillStyle = '#4488cc';
        ctx.fillRect(swX + 6, swY + 50, 14, 4);
        ctx.fillStyle = '#44aa66';
        ctx.fillRect(swX + 6, swY + 54, 14, 4);
        /* Scroll */
        ctx.fillStyle = '#ffe9c8';
        ctx.fillRect(swX + 28, swY + 50, 14, 8);
        ctx.fillStyle = '#aa6622';
        ctx.fillRect(swX + 28, swY + 50, 2, 8);
        ctx.fillRect(swX + 40, swY + 50, 2, 8);
        /* Boots */
        ctx.fillStyle = '#5a3a22';
        ctx.fillRect(swX + 56, swY + 50, 6, 8);
        ctx.fillRect(swX + 64, swY + 50, 6, 8);
        ctx.fillRect(swX + 60, swY + 56, 14, 2);
        /* Window mullion cross */
        ctx.strokeStyle = '#0a1a22';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(swX + swW / 2, swY); ctx.lineTo(swX + swW / 2, swY + swH);
        ctx.stroke();
        /* OPEN sign — flickers */
        var openOn = (Math.sin(sbT * 3 + d.x * 0.01) > -0.6);
        ctx.save();
        ctx.globalAlpha = openOn ? 1 : 0.35;
        ctx.fillStyle = '#1a0a14';
        ctx.fillRect(swX + 8, swY - 12, 28, 12);
        ctx.fillStyle = '#ff4466';
        ctx.font = 'bold 9px "M PLUS Rounded 1c", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('OPEN', swX + 22, swY - 6);
        ctx.restore();
        ctx.textBaseline = 'alphabetic';
        /* Display-window glow halo */
        ctx.save();
        ctx.globalAlpha = 0.18 + Math.sin(sbT) * 0.04;
        var halo = ctx.createRadialGradient(dx, swY + swH / 2, 4, dx, swY + swH / 2, 90);
        halo.addColorStop(0, '#ffd24a');
        halo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(swX - 20, swY - 20, swW + 40, swH + 40);
        ctx.restore();
        /* Double doors on the right */
        var sdX = dx + 30;
        ctx.fillStyle = '#1a0a14';
        ctx.fillRect(sdX, dy - 56, 38, 56);
        ctx.fillStyle = '#7a3344';
        ctx.fillRect(sdX + 1, dy - 55, 17, 54);
        ctx.fillRect(sdX + 20, dy - 55, 17, 54);
        ctx.strokeStyle = '#ffd24a';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(sdX + 1, dy - 55, 17, 54);
        ctx.strokeRect(sdX + 20, dy - 55, 17, 54);
        /* Door porthole windows */
        ctx.fillStyle = '#cdeaf4';
        ctx.beginPath(); ctx.arc(sdX + 9.5, dy - 42, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(sdX + 28.5, dy - 42, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#0a1a22';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(sdX + 9.5, dy - 42, 3.5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(sdX + 28.5, dy - 42, 3.5, 0, Math.PI * 2); ctx.stroke();
        /* Door knobs (center pull-handles) */
        ctx.fillStyle = '#ffd24a';
        ctx.beginPath(); ctx.arc(sdX + 16, dy - 26, 1.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(sdX + 22, dy - 26, 1.4, 0, Math.PI * 2); ctx.fill();
        /* Welcome mat */
        ctx.fillStyle = '#ff66aa';
        ctx.fillRect(sdX - 2, dy - 4, 42, 4);
        ctx.fillStyle = '#ffe9f4';
        ctx.fillRect(sdX, dy - 3, 38, 1);
        /* Sandwich-board sign on the sidewalk */
        ctx.fillStyle = '#3a2a44';
        ctx.fillRect(dx - 92, dy - 24, 12, 24);
        ctx.fillStyle = '#ffd24a';
        ctx.fillRect(dx - 90, dy - 22, 8, 2);
        ctx.fillRect(dx - 90, dy - 18, 8, 2);
        ctx.fillRect(dx - 90, dy - 14, 8, 2);
        ctx.fillRect(dx - 90, dy - 10, 6, 2);
        /* Tiny barrel beside it */
        ctx.fillStyle = '#7a4a22';
        ctx.fillRect(dx - 110, dy - 18, 14, 18);
        ctx.strokeStyle = '#ffd24a';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(dx - 110, dy - 14); ctx.lineTo(dx - 96, dy - 14); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(dx - 110, dy - 8); ctx.lineTo(dx - 96, dy - 8); ctx.stroke();
      } else if (d.type === 'lampPost') {
        /* Tall thin pole with a glowing neon lamp on top */
        var lpC = d.color || '#44ffff';
        /* Round pole: shadowed body, a sunlit strip on the left and a
           strip of its own lamp light down the right */
        ctx.fillStyle = '#4a5064';
        ctx.fillRect(dx - 1.6, dy - 80, 3.2, 80);
        ctx.fillStyle = '#b8c2d4';
        ctx.fillRect(dx - 1.2, dy - 80, 1, 80);
        ctx.fillStyle = hexA(lpC, 0.55);
        ctx.fillRect(dx + 0.7, dy - 78, 0.7, 40);
        /* Base plinth */
        ctx.fillStyle = '#3a3e52';
        ctx.fillRect(dx - 4, dy - 6, 8, 6);
        ctx.fillStyle = '#9aa4ba';
        ctx.fillRect(dx - 4, dy - 6, 8, 1);
        ctx.fillRect(dx - 4, dy - 6, 1, 6);
        /* Lamp head */
        ctx.fillStyle = '#3a3a4a';
        ctx.beginPath();
        ctx.ellipse(dx, dy - 84, 8, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#8a90a8';
        ctx.beginPath();
        ctx.ellipse(dx - 2, dy - 87, 4, 1.6, -0.2, 0, Math.PI * 2);
        ctx.fill();
        /* Glow */
        ctx.save();
        ctx.globalAlpha = 0.4 + Math.sin(Date.now() * 0.003 + d.x * 0.01) * 0.1;
        var lpGrd = ctx.createRadialGradient(dx, dy - 80, 2, dx, dy - 80, 28);
        lpGrd.addColorStop(0, lpC);
        lpGrd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lpGrd;
        ctx.beginPath();
        ctx.arc(dx, dy - 80, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        /* Bulb */
        ctx.fillStyle = lpC;
        ctx.beginPath();
        ctx.arc(dx, dy - 80, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(dx - 0.8, dy - 81, 1.4, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.type === 'neonSign') {
        /* Holographic billboard on a stand */
        var nsC = d.color || '#44ffff';
        var nsTxt = d.text || 'SHOP';
        /* Pole and foot plate */
        ctx.fillStyle = '#556677';
        ctx.fillRect(dx - 1.2, dy - 60, 2.4, 60);
        ctx.fillStyle = '#7d8896';
        ctx.fillRect(dx - 1.2, dy - 60, 0.8, 60);
        ctx.fillStyle = '#3a3a4a';
        ctx.fillRect(dx - 7, dy - 3, 14, 3);
        /* Halo behind the board */
        ctx.save();
        ctx.globalAlpha = 0.5 + Math.sin(Date.now() * 0.004 + d.x * 0.01) * 0.08;
        ctx.drawImage(glowSprite(nsC, 60), dx - 60, dy - 138);
        ctx.restore();
        /* Frame with a bevelled edge */
        ctx.fillStyle = '#0e0e1c';
        ctx.fillRect(dx - 38, dy - 98, 76, 40);
        ctx.fillStyle = '#1a1a2a';
        ctx.fillRect(dx - 36, dy - 96, 72, 36);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(dx - 36, dy - 96, 72, 10);
        ctx.strokeStyle = nsC;
        ctx.lineWidth = 2;
        ctx.strokeRect(dx - 36, dy - 96, 72, 36);
        ctx.fillStyle = nsC;
        ctx.fillRect(dx - 2, dy - 62, 4, 4);
        /* Flicker */
        ctx.save();
        ctx.globalAlpha = 0.85 + Math.sin(Date.now() * 0.012 + d.x * 0.03) * 0.15;
        ctx.fillStyle = nsC;
        ctx.font = 'bold 14px "M PLUS Rounded 1c", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(nsTxt, dx, dy - 78);
        ctx.restore();
        ctx.textBaseline = 'alphabetic';
      } else if (d.type === 'rooftopSign') {
        /* Compact neon sign mounted on the rooftop of the cafe/shop building
           — sits above the awning so it doesn't obscure the storefront. */
        var rsC = d.color || '#44ffff';
        var rsTxt = d.text || 'SHOP';
        var rsY = dy - 158;
        ctx.fillStyle = '#1a1a2a';
        ctx.fillRect(dx - 38, rsY, 76, 22);
        ctx.strokeStyle = rsC;
        ctx.lineWidth = 2;
        ctx.strokeRect(dx - 38, rsY, 76, 22);
        ctx.save();
        ctx.globalAlpha = 0.85 + Math.sin(Date.now() * 0.012 + d.x * 0.03) * 0.15;
        ctx.fillStyle = rsC;
        ctx.font = 'bold 13px "M PLUS Rounded 1c", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(rsTxt, dx, rsY + 11);
        ctx.restore();
        /* Soft halo */
        ctx.save();
        var rsHalo = ctx.createRadialGradient(dx, rsY + 11, 4, dx, rsY + 11, 60);
        rsHalo.addColorStop(0, rsC);
        rsHalo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.18 + Math.sin(Date.now() * 0.004 + d.x * 0.01) * 0.05;
        ctx.fillStyle = rsHalo;
        ctx.fillRect(dx - 60, rsY - 14, 120, 50);
        ctx.restore();
        ctx.textBaseline = 'alphabetic';
      } else if (d.type === 'techPanel') {
        /* Embedded ground panel with pulsing lights */
        ctx.fillStyle = '#1a1a2a';
        ctx.fillRect(dx - 18, dy - 4, 36, 6);
        ctx.fillStyle = '#3a3a4a';
        ctx.fillRect(dx - 17, dy - 3, 34, 4);
        /* Pulse lights */
        var pulse = (Math.sin(Date.now() * 0.005 + d.x * 0.02) + 1) * 0.5;
        var lightCols = ['#44ff88', '#44ffff', '#ff66cc'];
        for (var tpl = 0; tpl < 3; tpl++) {
          ctx.fillStyle = lightCols[tpl];
          ctx.globalAlpha = 0.5 + pulse * 0.5;
          ctx.beginPath();
          ctx.arc(dx - 12 + tpl * 12, dy - 1, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (d.type === 'robotStatue') {
        /* Cute mascot robot statue on a small pedestal */
        /* Pedestal, lit from the left */
        ctx.fillStyle = '#445566';
        ctx.fillRect(dx - 12, dy - 8, 24, 8);
        ctx.fillStyle = '#2e3a46';
        ctx.fillRect(dx + 4, dy - 8, 8, 8);
        ctx.fillStyle = '#5a6a78';
        ctx.fillRect(dx - 14, dy - 10, 28, 3);
        ctx.fillStyle = '#8899aa';
        ctx.fillRect(dx - 14, dy - 10, 28, 1);
        /* Body with a shaded right side and a chest panel */
        ctx.fillStyle = '#aabbcc';
        ctx.fillRect(dx - 8, dy - 26, 16, 18);
        ctx.fillStyle = '#7d8fa0';
        ctx.fillRect(dx + 4, dy - 26, 4, 18);
        ctx.fillStyle = '#c8d6e0';
        ctx.fillRect(dx - 8, dy - 26, 2, 18);
        ctx.fillStyle = '#5a6a78';
        ctx.fillRect(dx - 5, dy - 23, 8, 3);
        /* Head */
        ctx.fillStyle = '#ccdde8';
        ctx.fillRect(dx - 7, dy - 38, 14, 12);
        ctx.fillStyle = '#9fb1c0';
        ctx.fillRect(dx + 4, dy - 38, 3, 12);
        ctx.fillStyle = '#e8f2f8';
        ctx.fillRect(dx - 7, dy - 38, 14, 1.5);
        /* Antenna */
        ctx.strokeStyle = '#ccdde8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(dx, dy - 38);
        ctx.lineTo(dx, dy - 44);
        ctx.stroke();
        ctx.fillStyle = '#ff66cc';
        ctx.beginPath();
        ctx.arc(dx, dy - 45, 1.5, 0, Math.PI * 2);
        ctx.fill();
        /* Eyes */
        ctx.fillStyle = '#44ffff';
        ctx.fillRect(dx - 4, dy - 34, 2.5, 2.5);
        ctx.fillRect(dx + 1.5, dy - 34, 2.5, 2.5);
        /* Mouth speaker grill */
        ctx.fillStyle = '#222';
        ctx.fillRect(dx - 3, dy - 30, 6, 1.5);
        /* Chest light */
        ctx.fillStyle = '#ffd24a';
        ctx.beginPath();
        ctx.arc(dx, dy - 18, 1.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.type === 'mouseHole') {
        /* Little mound + dark hole entrance — visual hint near a moon mouse */
        ctx.fillStyle = '#7a5418';
        ctx.beginPath();
        ctx.ellipse(dx, dy + 4, 18, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a0a08';
        ctx.beginPath();
        ctx.ellipse(dx, dy + 1, 6, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        /* Cheese crumbs around */
        ctx.fillStyle = '#ffcc44';
        ctx.beginPath(); ctx.arc(dx - 9, dy + 6, 0.8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(dx + 11, dy + 5, 0.7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(dx + 5, dy + 8, 0.6, 0, Math.PI * 2); ctx.fill();
      } else if (d.type === 'cheeseCrater') {
        /* Cheese-hole crater — yellow pocked moon surface */
        ctx.fillStyle = '#b98a28';
        ctx.beginPath();
        ctx.arc(dx, dy, d.r || 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#8a6220';
        ctx.beginPath();
        ctx.arc(dx - 2, dy - 2, (d.r || 14) * 0.6, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.type === 'cheeseWedge') {
        /* Big triangular cheese wedge sticking up from the surface, with
           characteristic round holes. */
        var wR = d.size || 1;
        ctx.save();
        ctx.translate(dx, dy);
        ctx.scale(wR, wR);
        var wG = ctx.createLinearGradient(0, -36, 0, 0);
        wG.addColorStop(0, '#ffd64a');
        wG.addColorStop(1, '#c8862a');
        ctx.fillStyle = wG;
        ctx.beginPath();
        ctx.moveTo(-30, 0);
        ctx.lineTo(30, 0);
        ctx.lineTo(20, -34);
        ctx.lineTo(-20, -34);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#7a4818';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        /* Front-face highlight */
        ctx.fillStyle = '#ffe98a';
        ctx.beginPath();
        ctx.moveTo(-26, -2);
        ctx.lineTo(26, -2);
        ctx.lineTo(18, -32);
        ctx.lineTo(-18, -32);
        ctx.closePath();
        ctx.fill();
        /* Holes */
        ctx.fillStyle = '#a86820';
        var holes = [[-12, -10, 3], [6, -16, 4], [-4, -22, 2.4], [10, -8, 2], [-8, -28, 1.8]];
        for (var hwI = 0; hwI < holes.length; hwI++) {
          ctx.beginPath();
          ctx.arc(holes[hwI][0], holes[hwI][1], holes[hwI][2], 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#5a2a10';
        for (var hwJ = 0; hwJ < holes.length; hwJ++) {
          ctx.beginPath();
          ctx.arc(holes[hwJ][0] - 0.6, holes[hwJ][1] - 0.6, holes[hwJ][2] * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      } else if (d.type === 'cheeseChunk') {
        /* Small cube of cheese on the ground */
        ctx.fillStyle = '#ffd64a';
        ctx.fillRect(dx - 9, dy - 12, 18, 12);
        ctx.fillStyle = '#ffe98a';
        ctx.fillRect(dx - 9, dy - 12, 18, 2);
        ctx.fillStyle = '#a86820';
        ctx.fillRect(dx - 9, dy - 1, 18, 1);
        /* Holes */
        ctx.fillStyle = '#a86820';
        ctx.beginPath(); ctx.arc(dx - 4, dy - 7, 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(dx + 3, dy - 4, 1.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(dx + 5, dy - 9, 1, 0, Math.PI * 2); ctx.fill();
      } else if (d.type === 'cheeseDrip') {
        /* Patch of melted cheese with droplets dripping off the ledge */
        ctx.fillStyle = '#ffaa22';
        ctx.beginPath();
        ctx.moveTo(dx - 18, dy);
        ctx.bezierCurveTo(dx - 18, dy + 14, dx - 6, dy + 16, dx, dy + 14);
        ctx.bezierCurveTo(dx + 6, dy + 18, dx + 16, dy + 12, dx + 18, dy);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffd24a';
        ctx.beginPath();
        ctx.moveTo(dx - 14, dy + 1);
        ctx.bezierCurveTo(dx - 14, dy + 9, dx - 4, dy + 11, dx, dy + 10);
        ctx.bezierCurveTo(dx + 4, dy + 12, dx + 12, dy + 8, dx + 14, dy + 1);
        ctx.closePath();
        ctx.fill();
        /* Drips dangling */
        ctx.fillStyle = '#ffaa22';
        ctx.beginPath(); ctx.arc(dx - 10, dy + 18, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(dx + 8, dy + 16, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(dx, dy + 22, 2, 0, Math.PI * 2); ctx.fill();
      } else if (d.type === 'cheeseTree') {
        /* Stylised cheese-fondue palm tree — yellow trunk with wedge fronds */
        ctx.fillStyle = '#a86820';
        ctx.fillRect(dx - 3, dy - 36, 6, 36);
        ctx.fillStyle = '#7a4818';
        ctx.fillRect(dx - 3, dy - 36, 1.4, 36);
        /* Cheese frond crown */
        var crown = [[-14, -36, -24, -42], [14, -36, 24, -42], [-8, -42, -14, -52], [8, -42, 14, -52], [0, -44, 0, -56]];
        ctx.fillStyle = '#ffd64a';
        ctx.strokeStyle = '#a86820';
        ctx.lineWidth = 1;
        for (var ct = 0; ct < crown.length; ct++) {
          var p = crown[ct];
          ctx.beginPath();
          ctx.moveTo(dx + p[0] - 3, dy + p[1]);
          ctx.lineTo(dx + p[2], dy + p[3]);
          ctx.lineTo(dx + p[0] + 3, dy + p[1]);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        /* Cheese-coconuts */
        ctx.fillStyle = '#ffaa22';
        ctx.beginPath(); ctx.arc(dx - 5, dy - 38, 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(dx + 5, dy - 38, 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#a86820';
        ctx.beginPath(); ctx.arc(dx - 5, dy - 38, 0.7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(dx + 5, dy - 38, 0.7, 0, Math.PI * 2); ctx.fill();
      } else if (d.type === 'cheeseSign') {
        /* Wooden sign with a cheese-wedge logo */
        ctx.fillStyle = '#3a2010';
        ctx.fillRect(dx - 1.6, dy - 32, 3.2, 32);
        ctx.fillStyle = '#a86820';
        /* Board is wide enough that the text sits beside the logo
           rather than on top of it. */
        ctx.fillRect(dx - 32, dy - 56, 64, 24);
        ctx.fillStyle = '#7a4818';
        ctx.fillRect(dx - 32, dy - 56, 64, 1.5);
        ctx.fillRect(dx - 32, dy - 33.5, 64, 1.5);
        /* Cheese wedge logo */
        ctx.fillStyle = '#ffd64a';
        ctx.beginPath();
        ctx.moveTo(dx - 27, dy - 38);
        ctx.lineTo(dx - 17, dy - 50);
        ctx.lineTo(dx - 13, dy - 38);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#a86820';
        ctx.beginPath(); ctx.arc(dx - 21, dy - 42, 0.9, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(dx - 17, dy - 45, 0.7, 0, Math.PI * 2); ctx.fill();
        /* Sign text, shrunk to fit the space right of the logo */
        var signText = d.text || 'CHEESE';
        var signSize = 10;
        do {
          ctx.font = 'bold ' + signSize + 'px "M PLUS Rounded 1c", sans-serif';
        } while (ctx.measureText(signText).width > 40 && --signSize > 6);
        ctx.fillStyle = '#ffe9c8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(signText, dx + 8, dy - 44);
        ctx.textBaseline = 'alphabetic';
      } else if (d.type === 'homePlanetBg') {
        /* Momoko's ringed home planet, far off in the moon's sky */
        ctx.drawImage(glowSprite('#ff88cc', 32), dx - d.r * 2.2, dy - d.r * 2.2, d.r * 4.4, d.r * 4.4);
        if (Game.ui.drawShadedPlanet) Game.ui.drawShadedPlanet(ctx, dx, dy, d.r, '#ffc0e4', '#8a2a80', '#ffd24a');
      } else if (d.type === 'cheeseArch') {
        blitDeco(decoSprite('arch', 230, 172, 112, 160, paintCheeseArch), dx, dy, d.size || 1);
      } else if (d.type === 'mouseHouse') {
        var mk = d.small ? 0.8 : 1;
        blitDeco(decoSprite('mouse' + d.door, 112, 128, 50, 116, function (g) { paintMouseHouse(g, d.door); }), dx, dy, mk);
        var mT = Date.now() * 0.0011 + d.x;
        for (var ms = 0; ms < 3; ms++) {
          var mP = (mT + ms * 0.33) % 1;
          ctx.fillStyle = 'rgba(255, 244, 220, ' + (0.36 * (1 - mP)).toFixed(2) + ')';
          ctx.beginPath();
          ctx.arc(dx + (20 + Math.sin(mP * 6 + ms) * 3) * mk, dy - (96 + mP * 22) * mk, (2 + mP * 3.5) * mk, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (d.type === 'cheeseStall') {
        blitDeco(decoSprite('stall', 200, 152, 70, 140, paintCheeseStall), dx, dy, 1);
        /* Oven fire */
        var ofl = 0.75 + Math.sin(Date.now() * 0.013) * 0.12 + Math.sin(Date.now() * 0.031) * 0.08;
        ctx.fillStyle = 'rgba(255, 140, 40, ' + ofl.toFixed(2) + ')';
        ctx.beginPath(); ctx.ellipse(dx + 76, dy - 2, 7, 6 * ofl, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = 'rgba(255, 230, 120, ' + ofl.toFixed(2) + ')';
        ctx.beginPath(); ctx.ellipse(dx + 76, dy - 1, 3.5, 3.5 * ofl, 0, Math.PI, 0); ctx.fill();
        if (party) {
          drawCheeseCake(dx, dy - 40, Date.now() * 0.06);
          /* Confetti drifting down around the bakery */
          var cT = Date.now() * 0.001;
          for (var cf = 0; cf < 14; cf++) {
            var cfp = (cT * (0.25 + (cf % 5) * 0.04) + cf * 0.37) % 1;
            var cfx = dx - 70 + ((cf * 53) % 160) + Math.sin(cT * 2 + cf) * 6;
            var cfy = dy - 150 + cfp * 150;
            ctx.fillStyle = BUNTING_COLS[cf % 4];
            ctx.globalAlpha = Math.min(1, (1 - cfp) * 3);
            ctx.save();
            ctx.translate(cfx, cfy);
            ctx.rotate(cT * 3 + cf);
            ctx.fillRect(-2, -1, 4, 2);
            ctx.restore();
          }
          ctx.globalAlpha = 1;
        }
      } else if (d.type === 'cheeseDeli') {
        blitDeco(decoSprite('deli', 140, 142, 68, 138, paintCheeseDeli), dx, dy, 1);
        drawDeliSign(dx, dy, Date.now());
      } else if (d.type === 'iceCreamParlour') {
        blitDeco(decoSprite('parlour', 130, 150, 64, 146, paintIceCreamParlour), dx, dy, 1);
        /* Twinkle on the cherry */
        var tw = 0.5 + 0.5 * Math.sin(Date.now() * 0.004);
        ctx.globalAlpha = tw;
        ctx.drawImage(glowSprite('#ffffff', 12), dx - 9, dy - 137, 14, 14);
        ctx.globalAlpha = 1;
      } else if (d.type === 'mouseFamilyHome') {
        blitDeco(decoSprite('family', 126, 186, 62, 182, paintMouseFamilyHome), dx, dy, 1);
        var fT = Date.now() * 0.0011 + d.x;
        for (var fs = 0; fs < 3; fs++) {
          var fP = (fT + fs * 0.33) % 1;
          ctx.fillStyle = 'rgba(255, 244, 220, ' + (0.36 * (1 - fP)).toFixed(2) + ')';
          ctx.beginPath();
          ctx.arc(dx + 22 + Math.sin(fP * 6 + fs) * 3, dy - 176 - fP * 22, 2 + fP * 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (d.type === 'bunting') {
        drawBunting(d, dx, dy, Date.now(), party);
      } else if (d.type === 'cheeseMoonBg') {
        /* Big cheese moon in the parallax sky */
        ctx.save();
        var cmX = dx;
        var cmR = d.r || 90;
        /* Warm halo, then a sphere lit from the sun's side */
        ctx.drawImage(glowSprite('#ffd64a', 48), cmX - cmR * 1.7, dy - cmR * 1.7, cmR * 3.4, cmR * 3.4);
        var cmG = ctx.createRadialGradient(cmX - cmR * 0.4, dy - cmR * 0.45, cmR * 0.1, cmX, dy, cmR);
        cmG.addColorStop(0, '#fff3a8');
        cmG.addColorStop(0.55, '#ffd64a');
        cmG.addColorStop(1, '#e09a2a');
        ctx.fillStyle = cmG;
        ctx.beginPath();
        ctx.arc(cmX, dy, cmR, 0, Math.PI * 2);
        ctx.fill();
        /* Terminator: the far side falls into warm shadow */
        ctx.save();
        ctx.clip();
        var cmS = ctx.createRadialGradient(cmX - cmR * 0.35, dy - cmR * 0.35, cmR * 0.75, cmX - cmR * 0.35, dy - cmR * 0.35, cmR * 1.5);
        cmS.addColorStop(0, 'rgba(122, 56, 24, 0)');
        cmS.addColorStop(1, 'rgba(122, 56, 24, 0.6)');
        ctx.fillStyle = cmS;
        ctx.fillRect(cmX - cmR, dy - cmR, cmR * 2, cmR * 2);
        ctx.restore();
        ctx.strokeStyle = 'rgba(255, 250, 210, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cmX, dy, cmR - 0.8, Math.PI * 0.85, Math.PI * 1.65);
        ctx.stroke();
        /* Holes */
        var moonHoles = [[-30, -20, 8], [10, 30, 6], [-20, 18, 5], [25, -10, 7], [0, -38, 4]];
        var mhS = cmR / 90;
        for (var mh = 0; mh < moonHoles.length; mh++) {
          var mhx = cmX + moonHoles[mh][0] * mhS, mhy = dy + moonHoles[mh][1] * mhS, mhr = moonHoles[mh][2] * mhS;
          ctx.fillStyle = '#a86820';
          ctx.beginPath();
          ctx.arc(mhx, mhy, mhr, 0, Math.PI * 2);
          ctx.fill();
          /* Shadowed upper lip, lit lower lip */
          ctx.fillStyle = '#7a4818';
          ctx.beginPath();
          ctx.arc(mhx, mhy, mhr, Math.PI * 0.9, Math.PI * 1.9);
          ctx.arc(mhx + mhr * 0.25, mhy + mhr * 0.3, mhr, Math.PI * 1.75, Math.PI * 1.05, true);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 244, 170, 0.7)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(mhx, mhy, mhr, Math.PI * 0.05, Math.PI * 0.75);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  /* ---- Click handling ---- */
  function onClick(e) {
    var pos = Game.input.getClickPos(e);
    var mx = pos.x, my = pos.y;

    switch (state) {
      case State.TITLE:
        /* First click on the title bootstraps Web Audio (browsers block
           autoplay) so the menu music can start. */
        Game.audio.init();
        Game.audio.resume();
        if (Game.audio.currentMusic() !== 'title') Game.audio.startMusic('title');
        var action = Game.ui.handleTitleClick(mx, my);
        if (action === 'play') state = State.CUSTOMIZE;
        break;

      case State.CUSTOMIZE:
        var cAction = Game.ui.handleCustomizeClick(mx, my);
        if (cAction === 'start') { resetRun(); state = State.INTRO; }
        break;

      case State.INTRO:
        var iAction = Game.ui.handleIntroClick(mx, my);
        if (iAction === 'start') startGame();
        break;

      case State.PAUSED:
        var pAction = Game.ui.handlePauseClick(mx, my);
        if (pAction === 'resume') state = State.PLAYING;
        else if (pAction === 'quit') { Game.audio.startMusic('title'); state = State.TITLE; }
        break;

      case State.GAME_OVER:
        var gAction = Game.ui.handleGameOverClick(mx, my);
        if (gAction === 'retry') startGame();
        break;

      case State.TRAVEL_MENU:
        if (Game.ui.handleTravelMenuClick) {
          var tvResult = Game.ui.handleTravelMenuClick(mx, my);
          if (tvResult === 'cancel') {
            state = State.PLAYING;
          } else if (tvResult && typeof tvResult.zone === 'number') {
            rocketTarget = tvResult.zone;
            rocketAnimTimer = 0;
            state = State.ROCKET_ANIM;
            Game.audio.play('victory');
          }
        }
        break;

      case State.HOUSE_INTERIOR:
        if (Game.ui.handleHouseInteriorClick) {
          var hiResult = Game.ui.handleHouseInteriorClick(mx, my, currentHouseId);
          if (hiResult === 'exit') {
            exitHouse();
          }
        }
        break;

      case State.CAFE_INTERIOR:
        if (Game.ui.handleCafeInteriorClick) {
          var ciResult = Game.ui.handleCafeInteriorClick(mx, my);
          if (ciResult === 'exit') exitCafe();
        }
        break;

      case State.TELESCOPE:
        if (performance.now() - telescopeAt > 400) closeTelescope();
        break;

      case State.SHOP_INTERIOR:
        if (Game.ui.handleShopInteriorClick) {
          var siResult = Game.ui.handleShopInteriorClick(mx, my);
          if (siResult === 'exit') exitShop();
        }
        break;

      case State.VICTORY:
        var vAction = Game.ui.handleVictoryClick(mx, my);
        if (vAction === 'restart') { Game.audio.startMusic('title'); state = State.TITLE; }
        break;

      case State.BEACH:
        var bAction = Game.ui.handleBeachClick(mx, my);
        if (bAction === 'dive') {
          state = State.PLAYING;
          player.y = level.waterSurface + 20;
          player.vy = 1;
        }
        break;
    }
  }

  /* ---- Interact prompt ----
     Doors and the rocket don't talk, so instead of the "!" they get a
     labelled bubble over Momoko's head saying what Space / TALK will do.
     The range matches the interact check in update(). */
  var PROMPT_KEYS = { houseDoor: 'promptEnter', cafeDoor: 'promptEnter',
                      shopDoor: 'promptEnter', rocket: 'promptBoard', telescope: 'promptLook' };

  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawInteractPrompt() {
    if (!player) return;
    var key = null;
    for (var i = 0; i < npcs.length; i++) {
      var k = PROMPT_KEYS[npcs[i].type];
      if (!k) continue;
      var e = npcs[i].entity;
      var dx = player.x - e.x, dy = player.y - e.y;
      if (dx * dx + dy * dy < 80 * 80) { key = k; break; }
      /* The boarding hatch is up in the air: hint when she's standing
         underneath it on the ground. */
      if (npcs[i].type === 'rocket' && Math.abs(dx) < 160 && dy > 0) key = 'promptFlyUp';
    }
    if (!key) return;
    var label = (key === 'promptFlyUp' ? '\u2191 ' : '') + Game.i18n.t(key);
    var bob = Math.sin(Date.now() * 0.006) * 2;
    var lift = (Game.shop && Game.shop.cart && Game.shop.cart.length > 0) ? 26 : 0;
    var bx = Math.round(player.x - camera.x + player.w / 2);
    var by = Math.round(player.y - camera.y - 27 - lift + bob);
    ctx.save();
    ctx.font = 'bold 13px "M PLUS Rounded 1c", sans-serif';
    var tw = ctx.measureText(label).width;
    var pw = tw + 20, ph = 24;
    var px = Math.max(4, Math.min(W - pw - 4, bx - pw / 2));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    rrect(px, by - ph + 2, pw, ph, 12); ctx.fill();
    ctx.fillStyle = '#fff8e8';
    ctx.strokeStyle = '#2a1450';
    ctx.lineWidth = 2;
    rrect(px, by - ph, pw, ph, 12);
    ctx.fill();
    ctx.stroke();
    /* Tail pointing down at Momoko */
    ctx.beginPath();
    ctx.moveTo(bx - 5, by - 1); ctx.lineTo(bx, by + 6); ctx.lineTo(bx + 5, by - 1);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(bx - 5, by); ctx.lineTo(bx, by + 6); ctx.lineTo(bx + 5, by);
    ctx.stroke();
    ctx.fillStyle = '#2a1450';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, px + pw / 2, by - ph / 2 + 1);
    ctx.restore();
  }

  /* ---- Start game ---- */
  function startGame() {
    currentZone = 0;
    loadLevel(currentZone);
    camera = { x: 0, y: 0 };
    Game.audio.init();
    Game.audio.resume();
    beachReady = true;
    Game.audio.startMusic('bgm', level.music);
    state = State.PLAYING;
  }

  /* ---- Zone switching (rocket travel) ---- */
  function enterZone(zoneIndex) {
    currentZone = zoneIndex;
    loadLevel(currentZone);
    camera = { x: 0, y: 0 };
    beachReady = true;
    Game.audio.startMusic('bgm', level.music);
    state = State.PLAYING;
  }

  function onRocketInteract() {
    state = State.TRAVEL_MENU;
  }

  /* ---- House interior ---- */
  function enterHouse(id) {
    currentHouseId = id;
    if (Game.ui.startHouseInterior) Game.ui.startHouseInterior(id);
    Game.audio.startMusic('bgm', 'indoor');
    state = State.HOUSE_INTERIOR;
  }

  function exitHouse() {
    currentHouseId = null;
    Game.audio.startMusic('bgm', level.music);
    state = State.PLAYING;
  }

  /* ---- Cafe cutscene ---- */
  function enterCafe() {
    if (Game.ui.startCafeCutscene) Game.ui.startCafeCutscene();
    Game.audio.startMusic('bgm', 'indoor');
    state = State.CAFE_INTERIOR;
  }

  function exitCafe() {
    Game.audio.startMusic('bgm', level.music);
    state = State.PLAYING;
  }

  /* ---- Shop ---- */
  function enterShop() {
    if (Game.ui.startShopInterior) Game.ui.startShopInterior();
    Game.audio.startMusic('bgm', 'indoor');
    state = State.SHOP_INTERIOR;
  }

  function exitShop() {
    Game.audio.startMusic('bgm', level.music);
    state = State.PLAYING;
  }

  /* When the hero enters a houseDoor with a non-empty shopping cart,
     deposit each item into that house's furniture state at scattered
     positions along the floor area. Then clear the cart. */
  function depositCartIntoHouse(houseId) {
    if (!Game.shop || !Game.shop.cart || Game.shop.cart.length === 0) return;
    var raw = null;
    try { raw = localStorage.getItem('momoko-space-furniture'); } catch (e) {}
    var furn = {};
    try { furn = raw ? JSON.parse(raw) : {}; } catch (e) { furn = {}; }
    if (!furn[houseId]) furn[houseId] = [];
    /* Floor placement bounds — match HOUSE_FLOOR_* in ui.js. */
    var FX_LEFT = 60, FX_RIGHT = 680, FY_TOP = 220, FY_BOTTOM = 440;
    for (var ci = 0; ci < Game.shop.cart.length; ci++) {
      var ix = FX_LEFT + Math.floor(Math.random() * (FX_RIGHT - FX_LEFT));
      var iy = FY_TOP + Math.floor(Math.random() * (FY_BOTTOM - FY_TOP));
      furn[houseId].push({ type: Game.shop.cart[ci].type, x: ix, y: iy });
    }
    try { localStorage.setItem('momoko-space-furniture', JSON.stringify(furn)); } catch (e) {}
    Game.shop.cart = [];
    if (Game.audio && Game.audio.play) Game.audio.play('victory');
  }

  /* Start on the customize screen begins a new game: every quest and
     counter (gems, mice met, golden crumbs, the cake party) goes back to
     zero, in memory and in storage, and anything still in the shopping
     cart is dropped. Her look, the furnished houses and the settings
     stay. */
  function resetRun() {
    Game.quests = freshQuests();
    Game.shop.cart = [];
    savePersistent();
  }

  /* ---- Persistence ---- */
  function savePersistent() {
    try {
      localStorage.setItem('momoko-space-customization', JSON.stringify(Game.customization));
      if (Game.quests) {
        localStorage.setItem('momoko-space-quests', JSON.stringify(Game.quests));
      }
    } catch (e) { /* storage may be disabled */ }
  }

  function loadPersistent() {
    try {
      var cs = localStorage.getItem('momoko-space-customization');
      if (cs) {
        var parsed = JSON.parse(cs);
        for (var k in parsed) { Game.customization[k] = parsed[k]; }
        /* Saves from older builds lack the newer fields, and a value this
           build does not know falls back to the default look. */
        if (Game.momoko && Game.momoko.readCust) {
          var clean = Game.momoko.readCust(Game.customization);
          for (var ck in clean) Game.customization[ck] = clean[ck];
        }
        if (['none', 'red', 'blue', 'gold'].indexOf(Game.customization.crab) < 0) Game.customization.crab = 'none';
      }
      var qs = localStorage.getItem('momoko-space-quests');
      if (qs) {
        Game.quests = JSON.parse(qs);
        /* Saves from before the cheese-moon bakery lack Brie's quest. */
        if (!Game.quests.brie) Game.quests.brie = 'notStarted';
        Game.quests.progress = Game.quests.progress || {};
        if (!Game.quests.progress.crumbs) Game.quests.progress.crumbs = {};
      }
    } catch (e) { /* corrupted storage – ignore */ }
  }

  /* ---- Game loop ---- */
  var lastTime = 0;
  var accumulator = 0;
  var FIXED_DT = 1000 / 60;
  var prevPlayer = null, prevCam = null, prevPX = 0, prevPY = 0, prevCX = 0, prevCY = 0;
  Game.renderAlpha = 1;
  var frameEma = 16, slowFrames = 0;

  function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    var delta = timestamp - lastTime;
    lastTime = timestamp;

    /* Adaptive quality: when frames stay slow (smoothed rAF interval
       above 28 ms for about two seconds) drop the costliest effect still
       on, then the next, until the game keeps up. Long gaps are a
       backgrounded tab, not a slow device, and are ignored. */
    if (Game.FX.auto && delta > 0 && delta < 100) {
      frameEma += (delta - frameEma) * 0.05;
      if (frameEma > 28) {
        if (++slowFrames > 120) {
          var fx = Game.FX;
          if (fx.rim) fx.rim = false;
          else if (fx.bloom) fx.bloom = false;
          else { fx.grade = false; fx.vignette = false; }
          slowFrames = 0;
          frameEma = 16;
        }
      } else {
        slowFrames = 0;
      }
    }

    /* Cap delta to avoid spiral of death */
    if (delta > 100) delta = 100;

    accumulator += delta;
    while (accumulator >= FIXED_DT) {
      /* Where Momoko and the camera were before this step, so the frame
         drawn between two steps can sit part way between them. */
      prevPlayer = player; prevCam = camera;
      if (player) { prevPX = player.x; prevPY = player.y; }
      prevCX = camera.x; prevCY = camera.y;
      update();
      accumulator -= FIXED_DT;
    }

    /* Render interpolation: the game steps at a fixed 60 Hz, but rAF
       runs at 120 Hz on ProMotion iPads and jitters at 60, so drawing
       the latest step as-is repeats or skips a step now and then and
       her walk and the scroll judder. Draw her and the camera blended
       between the last two steps (not across a teleport or a level
       change), then put the real values back. */
    var alpha = accumulator / FIXED_DT;
    Game.renderAlpha = alpha;
    var blend = player && player === prevPlayer && camera === prevCam &&
      Math.abs(player.x - prevPX) < 48 && Math.abs(player.y - prevPY) < 48;
    var curPX = 0, curPY = 0, curCX = camera.x, curCY = camera.y;
    if (blend) {
      curPX = player.x; curPY = player.y;
      player.x = prevPX + (curPX - prevPX) * alpha;
      player.y = prevPY + (curPY - prevPY) * alpha;
      camera.x = prevCX + (curCX - prevCX) * alpha;
      camera.y = prevCY + (curCY - prevCY) * alpha;
    }
    try {
      render();
    } finally {
      if (blend) {
        player.x = curPX; player.y = curPY;
        camera.x = curCX; camera.y = curCY;
      }
    }
    requestAnimationFrame(gameLoop);
  }

  /* Compute canvas dimensions to match the current viewport's aspect ratio.
     Always centers the 800×480 game viewport. Adds horizontal strips for
     touch controls (asymmetric — wider D-pad side) and additional top /
     bottom bezel padding when the screen is taller-aspect than the base
     canvas (iPads etc.) so the canvas can scale up to fill the display
     instead of being letterboxed in dead space. */
  function computeCanvasLayout() {
    var sW = window.innerWidth || W;
    var sH = window.innerHeight || H;
    var screenAspect = sW / sH;
    var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    if (isTouch) {
      var lStrip = TOUCH_LEFT_W;
      var rStrip = TOUCH_RIGHT_W;
      var baseW = W + lStrip + rStrip;     /* 1260 */
      var baseH = H;                        /* 480 */
      var baseAspect = baseW / baseH;       /* 2.625 */

      if (screenAspect < baseAspect * 0.98) {
        /* Tall-aspect screen (iPad, tablet) — extend canvas vertically so
           it matches screen aspect. Bezel splits above/below the game. */
        CANVAS_W = baseW;
        CANVAS_H = Math.round(baseW / screenAspect);
        /* Cap so we don't go wildly tall on edge-case displays. */
        CANVAS_H = Math.min(CANVAS_H, baseH * 4);
        GAME_X = lStrip;
        GAME_Y = Math.floor((CANVAS_H - H) / 2);
      } else if (screenAspect > baseAspect * 1.05) {
        /* Ultra-wide screen — extend horizontal strips equally. */
        CANVAS_W = Math.round(baseH * screenAspect);
        CANVAS_H = baseH;
        var extraW = CANVAS_W - baseW;
        GAME_X = lStrip + Math.floor(extraW / 2);
        GAME_Y = 0;
      } else {
        CANVAS_W = baseW;
        CANVAS_H = baseH;
        GAME_X = lStrip;
        GAME_Y = 0;
      }
      /* Publish to input.js so touch-strip layout / click mapping match. */
      Game.TOUCH_LEFT_W = GAME_X;
      Game.TOUCH_RIGHT_W = CANVAS_W - GAME_X - W;
      Game.GAME_Y = GAME_Y;
    } else {
      CANVAS_W = W;
      CANVAS_H = H;
      GAME_X = 0;
      GAME_Y = 0;
      Game.TOUCH_LEFT_W = 0;
      Game.TOUCH_RIGHT_W = 0;
      Game.GAME_Y = 0;
    }
  }

  /* Resize the backing store to match logical canvas dimensions × DPR so
     rendering stays crisp on retina displays. Cap DPR at 3× to keep the
     backing-store memory sane on pathological screens. The 2D context's
     base transform is scaled by dpr so all game code keeps drawing in
     logical CANVAS_W × CANVAS_H coordinates. */
  function resizeBackingStore() {
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    DPR = dpr;
    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }

  /* ---- Init ---- */
  function init() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');

    computeCanvasLayout();
    resizeBackingStore();

    /* Load saved customization + quest progress */
    loadPersistent();

    /* Input */
    Game.input.init(canvas);

    /* Audio init on first interaction */
    Game.audio.init();

    /* Click handler for menus */
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('touchend', function (e) {
      /* Prevent double-fire on touch devices */
      if (state !== State.PLAYING) {
        onClick(e);
      }
    });

    /* Handle resize – recompute layout (in case orientation / DPR / size
       changed), re-allocate the backing store, then scale-to-fit via CSS. */
    function resize() {
      computeCanvasLayout();
      resizeBackingStore();
      var container = canvas.parentElement;
      var cw = container.clientWidth;
      var ch = container.clientHeight;
      var scale = Math.min(cw / CANVAS_W, ch / CANVAS_H);
      canvas.style.width = Math.floor(CANVAS_W * scale) + 'px';
      canvas.style.height = Math.floor(CANVAS_H * scale) + 'px';
      Game.input.refreshLayout();
    }
    window.addEventListener('resize', resize);
    /* iOS Safari fires orientationchange separately from resize on some
       devices – listen for both so the layout actually re-fits. */
    window.addEventListener('orientationchange', resize);
    resize();

    /* Prevent default touch behavior on canvas */
    canvas.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });

    /* Start */
    requestAnimationFrame(gameLoop);
  }

  /* ---- Export ---- */
  window.Game.engine = {
    init: init,
    State: State,
    onRocketInteract: onRocketInteract,
    enterHouse: enterHouse,
    exitHouse: exitHouse,
    savePersistent: savePersistent,
    getCurrentZone: function () { return currentZone; },
    /* Debug/QA hook: the live player entity while playing. */
    getPlayer: function () { return player; },
    getState: function () { return state; },
    getHouse: function () { return currentHouseId; },
  };

  /* Auto-init when DOM is ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
