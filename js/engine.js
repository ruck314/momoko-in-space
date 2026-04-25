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
  Game.VERSION = 'v2.0.0';
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
  };

  /* Quest state – persisted in localStorage. */
  Game.quests = {
    lila: 'notStarted',      /* 'notStarted' | 'inProgress' | 'done' */
    migword: 'notStarted',
    progress: { gems: 0, cheese: 0 },
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

  function initBgLayers() {
    bgLayers = [];
    /* Layer 0 – distant nebula clouds (soft violet/magenta blobs) */
    var layer0 = [];
    var bgColors0 = level && level.bgLayer0 ? level.bgLayer0 : ['#3a1860', '#2a1050', '#4a1a70'];
    for (var i = 0; i < 30; i++) {
      layer0.push({
        x: i * 200 + Math.random() * 100,
        y: 120 + Math.random() * 200,
        w: 120 + Math.random() * 180,
        h: 60 + Math.random() * 80,
        color: bgColors0[Math.floor(Math.random() * bgColors0.length)],
        blobSeed: Math.random() * 100,
      });
    }
    bgLayers.push({ items: layer0, parallax: 0.15 });

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
        Math.random() * H
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

    /* Enemies – aliens & UFOs (reusing Fish / Octopus classes for now). */
    enemies = [];
    for (var i = 0; i < level.spawns.enemies.length; i++) {
      var e = level.spawns.enemies[i];
      if (e.type === 'fish' || e.type === 'alien') {
        enemies.push(new Game.entities.Fish(e.x, e.y, e.pattern, e.dir, e.species));
      } else if (e.type === 'octopus' || e.type === 'ufo') {
        enemies.push(new Game.entities.Octopus(e.x, e.y));
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
      else if (nd.type === 'rocket' && Game.entities.RocketShip) npcEntity = new Game.entities.RocketShip(nd.x, nd.y);
      else if (nd.type === 'houseDoor' && Game.entities.HouseDoor) npcEntity = new Game.entities.HouseDoor(nd.x, nd.y, nd.houseId);
      if (npcEntity) npcs.push({ entity: npcEntity, type: nd.type, data: nd });
    }

    /* Pickups – star gems for Lila's quest. */
    pickups = [];
    for (var p = 0; p < level.spawns.pickups.length; p++) {
      var pd = level.spawns.pickups[p];
      pickups.push(new Game.entities.HeartPickup(pd.x, pd.y));
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

        /* Shoot */
        if (keys.action && player.shootCooldown <= 0) {
          var b = player.shoot();
          if (b) bubbles.push(b);
        }

        /* Bubbles */
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
            Game.audio.play('pickup');
            checkVictory();
          }
        }

        /* Player vs NPCs – trigger dialogue (or rocket/house interaction) */
        for (var nc = 0; nc < npcs.length; nc++) {
          var npc = npcs[nc].entity;
          var npcType = npcs[nc].type;
          var npcData = npcs[nc].data || {};
          var dist = Math.sqrt(
            Math.pow(player.x - npc.x, 2) + Math.pow(player.y - npc.y, 2)
          );
          if (dist < 80 && !npc.talking && (!npcCooldowns[npcType] || npcCooldowns[npcType] <= 0)) {
            /* Rocket – open travel menu. */
            if (npcType === 'rocket') {
              if (jp.up || keys.up) {
                onRocketInteract();
                npcCooldowns[npcType] = 300;
              }
            } else if (npcType === 'houseDoor') {
              if (jp.up || keys.up) {
                enterHouse(npcData.houseId || 'heroHome');
                npcCooldowns[npcType] = 300;
              }
            } else if (npcType === 'lila') {
              if (npc.interact) npc.interact();
              /* Start quest on first contact */
              if (Game.quests && Game.quests.lila === 'notStarted') {
                Game.quests.lila = 'inProgress';
                Game.quests.progress.gems = Game.quests.progress.gems || 0;
                savePersistent();
              }
              npcCooldowns[npcType] = 300;
            } else if (npcType === 'migword') {
              if (npc.interact) npc.interact();
              if (Game.quests && Game.quests.migword === 'notStarted') {
                Game.quests.migword = 'inProgress';
                Game.quests.progress.cheese = Game.quests.progress.cheese || 0;
                Game.quests.progress.miceMet = Game.quests.progress.miceMet || {};
                savePersistent();
              }
              npcCooldowns[npcType] = 300;
            } else if (npcType === 'moonMouse') {
              if (npc.interact) npc.interact();
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
              npcCooldowns[npcType] = 300;
            }
          }
          if (npcCooldowns[npcType] > 0) npcCooldowns[npcType]--;
        }

        /* Rings-view cutscene disabled in Momoko in Space — the town is open
           sky; no ocean surface to break. */

        /* Camera follow */
        var targetCamX = player.x - W / 2 + player.w / 2;
        var targetCamY = player.y - H / 2 + player.h / 2;
        camera.x += (targetCamX - camera.x) * 0.08;
        camera.y += (targetCamY - camera.y) * 0.08;
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
    }
  }

  /* ---- Render ---- */
  function render() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    /* Paint side-strip backgrounds first so they sit underneath the pause
       button (which is drawn last, in canvas space). The game viewport in
       the middle is fully overwritten by the state renderer below, so it
       doesn't matter that we paint across it here. */
    if (Game.input.isTouch()) {
      Game.input.drawTouchStrip(ctx, false);
    }

    /* Translate so all game / menu rendering keeps using logical 0..W,
       0..H coordinates regardless of the side / top / bottom padding. */
    ctx.save();
    if (GAME_X || GAME_Y) ctx.translate(GAME_X, GAME_Y);

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
            else speakerName = name;
            var text = npc.currentJoke || npc.currentText || '';
            pendingDialogue = { speaker: speakerName, text: text };
          }
        }
        break;

      case State.TRAVEL_MENU:
        renderGame();
        if (Game.ui.drawTravelMenu) Game.ui.drawTravelMenu(ctx);
        break;

      case State.ROCKET_ANIM:
        if (Game.ui.drawRocketAnim) Game.ui.drawRocketAnim(ctx, rocketAnimTimer, rocketTarget);
        break;

      case State.HOUSE_INTERIOR:
        if (Game.ui.drawHouseInterior) Game.ui.drawHouseInterior(ctx, currentHouseId, player);
        break;

      case State.PAUSED:
        renderGame();
        Game.ui.drawPauseMenu(ctx);
        break;

      case State.GAME_OVER:
        renderGame();
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
    if (Game.input.isTouch() && (state === State.PLAYING || state === State.BEACH)) {
      Game.input.drawTouchButtons(ctx);
    }

    /* Dialogue – drawn in canvas-space so it lives in the bottom bezel. */
    if (state === State.PLAYING && pendingDialogue && Game.ui.drawDialogue) {
      Game.ui.drawDialogue(
        ctx,
        pendingDialogue.speaker,
        pendingDialogue.text,
        CANVAS_W, CANVAS_H, GAME_X, GAME_Y
      );
    }
  }

  function renderGame() {
    if (!level) return;

    /* Background gradient */
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, level.bgTop);
    grad.addColorStop(0.5, level.bgMid);
    grad.addColorStop(1, level.bgBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    /* Distant planet rings arcing across the sky (home planet only) */
    if (level.showRings) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = 3;
      var ringCx = W * 0.8 - camera.x * 0.08;
      var ringCy = 60;
      for (var ri = 0; ri < 3; ri++) {
        ctx.beginPath();
        ctx.ellipse(ringCx, ringCy, 420 - ri * 40, 40 - ri * 8, -0.2, Math.PI * 1.05, Math.PI * 1.95);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* Parallax background – nebula blobs, distant planets, asteroid silhouettes */
    for (var li = 0; li < bgLayers.length; li++) {
      var layer = bgLayers[li];
      ctx.save();
      ctx.globalAlpha = li === 0 ? 0.35 : 0.55;
      for (var it = 0; it < layer.items.length; it++) {
        var item = layer.items[it];
        var bx = item.x - camera.x * layer.parallax;
        if (bx + item.w > 0 && bx < W) {
          ctx.fillStyle = item.color;
          if (item.isPlanet) {
            /* Round planet with a lighter crescent highlight */
            var pcx = bx + item.w / 2;
            var pcy = item.y;
            ctx.beginPath();
            ctx.arc(pcx, pcy, item.w / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.save();
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(pcx - item.w * 0.15, pcy - item.w * 0.15, item.w / 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          } else {
            ctx.beginPath();
            var cx = bx + item.w / 2;
            var hw = item.w / 2;
            var hh = item.h / 2;
            var seed = item.blobSeed || 0;
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
            ctx.closePath();
            ctx.fill();
          }
        }
      }
      ctx.restore();
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

    /* Decorations */
    renderDecorations();

    /* Asteroid/moon surface – undulating contour */
    var floorBase = level.floorY - camera.y;
    var floorColorA = level.floorColorA || '#2d1a0a';
    var floorColorB = level.floorColorB || '#3d2b12';
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
    /* Dust layer */
    ctx.fillStyle = floorColorB;
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
    /* Star pebbles on the surface — tiny white specks that read as glinting crystal */
    ctx.save();
    var pebbleSeed = 42;
    for (var pb = 0; pb < 20; pb++) {
      pebbleSeed = (pebbleSeed * 1103515245 + 12345) & 0x7fffffff;
      var pbx = (pebbleSeed % 800);
      var worldPbx = pbx + Math.floor(camera.x / 800) * 800;
      var screenPbx = worldPbx - camera.x;
      if (screenPbx < -10 || screenPbx > W + 10) { screenPbx += 800; worldPbx += 800; }
      if (screenPbx < -10 || screenPbx > W + 10) continue;
      var pby = floorBase + Math.sin(worldPbx * 0.008) * 6 + 4;
      if (pb < 3) {
        /* Tardigrade alien — little plump critter */
        ctx.fillStyle = '#aaccff';
        ctx.beginPath();
        ctx.ellipse(screenPbx, pby - 1, 3.5, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#222244';
        ctx.beginPath();
        ctx.arc(screenPbx - 1.2, pby - 1, 0.6, 0, Math.PI * 2);
        ctx.arc(screenPbx + 1.2, pby - 1, 0.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = pb % 2 === 0 ? '#e8dfff' : '#ffd24a';
        ctx.beginPath();
        ctx.arc(screenPbx, pby, 0.8 + (pb % 2) * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    /* (No collision platforms — Momoko floats freely through open space.) */

    /* Pickups */
    for (var pk = 0; pk < pickups.length; pk++) {
      pickups[pk].draw(ctx, camera.x, camera.y);
    }

    /* NPCs */
    for (var nc = 0; nc < npcs.length; nc++) {
      npcs[nc].entity.draw(ctx, camera.x, camera.y);
      /* Interaction indicator */
      var npc = npcs[nc].entity;
      if (!npc.talking) {
        var ndist = Math.sqrt(
          Math.pow(player.x - npc.x, 2) + Math.pow(player.y - npc.y, 2)
        );
        if (ndist < 80) {
          /* Draw "!" indicator */
          var ix = npc.x - camera.x + npc.w / 2;
          var iy = npc.y - camera.y - 14;
          ctx.fillStyle = '#ffcc33';
          ctx.font = 'bold 14px monospace';
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

    /* Player */
    if (player) player.draw(ctx, camera.x, camera.y);

    /* Wolfe (visible near surface) */
    if (wolfe && camera.y <= 20) {
      wolfe.draw(ctx, camera.x, camera.y);
    }

    /* Particles */
    for (var pa = 0; pa < particles.length; pa++) {
      particles[pa].draw(ctx, camera.x, camera.y);
    }

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
      /* Plus-cross sparkle for brighter stars */
      if (mote.size > 1.6) {
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

    /* Space vignette – subtle deep-purple darkening at edges */
    var fogGrad = ctx.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, W * 0.7);
    fogGrad.addColorStop(0, 'rgba(10, 4, 32, 0)');
    fogGrad.addColorStop(1, 'rgba(10, 4, 32, 0.3)');
    ctx.fillStyle = fogGrad;
    ctx.fillRect(0, 0, W, H);
  }

  function renderDecorations() {
    if (!level) return;
    for (var i = 0; i < level.decorations.length; i++) {
      var d = level.decorations[i];
      var dx = d.x - camera.x;
      if (dx < -100 || dx > W + 100) continue;
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
        ctx.fillStyle = d.color || '#cc88ff';
        ctx.beginPath();
        ctx.arc(dx, dy, d.r || 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffd24a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(dx, dy, (d.r || 18) + 8, 4, -0.3, 0, Math.PI * 2);
        ctx.stroke();
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
        /* Big sci-fi house silhouette behind the door */
        var hc = d.color || '#8866aa';
        var rc = d.roofColor || '#cc4488';
        /* Body */
        ctx.fillStyle = hc;
        ctx.fillRect(dx - 50, dy - 90, 100, 90);
        /* Side trim shading */
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(dx + 35, dy - 90, 15, 90);
        /* Roof — dome plus trim ring */
        ctx.fillStyle = rc;
        ctx.beginPath();
        ctx.ellipse(dx, dy - 90, 56, 26, 0, Math.PI, 0);
        ctx.fill();
        /* Roof antenna */
        ctx.strokeStyle = '#ddddee';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(dx, dy - 116);
        ctx.lineTo(dx, dy - 134);
        ctx.stroke();
        ctx.fillStyle = '#44ffff';
        ctx.beginPath();
        ctx.arc(dx, dy - 136, 3, 0, Math.PI * 2);
        ctx.fill();
        /* Glowing windows — three across */
        var winColors = ['#ffd24a', '#44ffff', '#ff88cc'];
        for (var hwn = 0; hwn < 3; hwn++) {
          ctx.fillStyle = winColors[hwn];
          ctx.fillRect(dx - 38 + hwn * 28, dy - 70, 18, 18);
          /* Cross frames */
          ctx.fillStyle = '#221133';
          ctx.fillRect(dx - 38 + hwn * 28 + 8, dy - 70, 2, 18);
          ctx.fillRect(dx - 38 + hwn * 28, dy - 62, 18, 2);
        }
        /* Glowing trim along the base */
        ctx.fillStyle = '#44ffff';
        ctx.fillRect(dx - 50, dy - 6, 100, 2);
        /* Door arch outline above the actual door entity */
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(dx - 26, dy - 50, 52, 50);
      } else if (d.type === 'lampPost') {
        /* Tall thin pole with a glowing neon lamp on top */
        var lpC = d.color || '#44ffff';
        ctx.fillStyle = '#7d8896';
        ctx.fillRect(dx - 1.5, dy - 80, 3, 80);
        /* Lamp head */
        ctx.fillStyle = '#3a3a4a';
        ctx.beginPath();
        ctx.ellipse(dx, dy - 84, 8, 6, 0, 0, Math.PI * 2);
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
        /* Pole */
        ctx.fillStyle = '#556677';
        ctx.fillRect(dx - 1.2, dy - 60, 2.4, 60);
        /* Frame */
        ctx.fillStyle = '#1a1a2a';
        ctx.fillRect(dx - 36, dy - 96, 72, 36);
        ctx.strokeStyle = nsC;
        ctx.lineWidth = 2;
        ctx.strokeRect(dx - 36, dy - 96, 72, 36);
        /* Flicker */
        ctx.save();
        ctx.globalAlpha = 0.85 + Math.sin(Date.now() * 0.012 + d.x * 0.03) * 0.15;
        ctx.fillStyle = nsC;
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(nsTxt, dx, dy - 78);
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
        /* Pedestal */
        ctx.fillStyle = '#445566';
        ctx.fillRect(dx - 12, dy - 8, 24, 8);
        ctx.fillStyle = '#5a6a78';
        ctx.fillRect(dx - 14, dy - 10, 28, 3);
        /* Body */
        ctx.fillStyle = '#aabbcc';
        ctx.fillRect(dx - 8, dy - 26, 16, 18);
        /* Head */
        ctx.fillStyle = '#ccdde8';
        ctx.fillRect(dx - 7, dy - 38, 14, 12);
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
        if (cAction === 'start') state = State.INTRO;
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

  /* ---- Start game ---- */
  function startGame() {
    currentZone = 0;
    loadLevel(currentZone);
    camera = { x: 0, y: 0 };
    Game.audio.init();
    Game.audio.resume();
    beachReady = true;
    Game.audio.startMusic('bgm');
    state = State.PLAYING;
  }

  /* ---- Zone switching (rocket travel) ---- */
  function enterZone(zoneIndex) {
    currentZone = zoneIndex;
    loadLevel(currentZone);
    camera = { x: 0, y: 0 };
    beachReady = true;
    state = State.PLAYING;
  }

  function onRocketInteract() {
    state = State.TRAVEL_MENU;
  }

  /* ---- House interior ---- */
  function enterHouse(id) {
    currentHouseId = id;
    state = State.HOUSE_INTERIOR;
  }

  function exitHouse() {
    currentHouseId = null;
    state = State.PLAYING;
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
      }
      var qs = localStorage.getItem('momoko-space-quests');
      if (qs) {
        Game.quests = JSON.parse(qs);
      }
    } catch (e) { /* corrupted storage – ignore */ }
  }

  /* ---- Game loop ---- */
  var lastTime = 0;
  var accumulator = 0;
  var FIXED_DT = 1000 / 60;

  function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    var delta = timestamp - lastTime;
    lastTime = timestamp;

    /* Cap delta to avoid spiral of death */
    if (delta > 100) delta = 100;

    accumulator += delta;
    while (accumulator >= FIXED_DT) {
      update();
      accumulator -= FIXED_DT;
    }

    render();
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
  };

  /* Auto-init when DOM is ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
