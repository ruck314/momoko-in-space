/* entities.js – all game characters, enemies, projectiles, particles */
(function () {
  'use strict';
  window.Game = window.Game || {};

  var W = 800, H = 480;

  /* ========== SPRITE CACHE ========== */
  var spriteCache = {};
  function getCachedSprite(key, w, h, drawFn) {
    if (spriteCache[key]) return spriteCache[key];
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var cx = c.getContext('2d');
    drawFn(cx);
    spriteCache[key] = c;
    return c;
  }

  /* Flip a sprite horizontally */
  function flipSprite(key, src) {
    if (spriteCache[key]) return spriteCache[key];
    var c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    var cx = c.getContext('2d');
    cx.translate(c.width, 0);
    cx.scale(-1, 1);
    cx.drawImage(src, 0, 0);
    spriteCache[key] = c;
    return c;
  }

  /* ========== MOMOKO (Player) ========== */
  function Momoko(x, y) {
    this.x = x;
    this.y = y;
    this.w = 28;
    this.h = 34;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1; /* 1=right, -1=left */
    this.animFrame = 0;
    this.animTimer = 0;
    this.shootCooldown = 0;
    /* Animation rig: walk cycle, springs, blinks, dust (momoko.js). */
    this.rig = Game.momoko ? Game.momoko.createRig() : null;
    this.env = null;
  }

  Momoko.SWIM_FORCE = 0.45;
  Momoko.MAX_VEL = 3.2;
  Momoko.GRAVITY = 0.12;
  Momoko.FRICTION = 0.94;
  Momoko.SHOOT_CD = 12;

  Momoko.prototype.update = function (keys, level) {
    /* Turbo (input.js): holding left/right ramps her walking push and top
       speed up to 2x; the float (up/down) and gravity stay as they are. */
    var tb = Game.input.turboStep('out', false);
    this.turboEase = tb.ease;
    if (tb.t === 300) Game.audio.play('whoosh');
    /* Swimming */
    if (keys.left) { this.vx -= Momoko.SWIM_FORCE * tb.mul; this.facing = -1; }
    if (keys.right) { this.vx += Momoko.SWIM_FORCE * tb.mul; this.facing = 1; }
    if (keys.up) this.vy -= Momoko.SWIM_FORCE;
    if (keys.down) this.vy += Momoko.SWIM_FORCE;

    /* Gravity (gentle sinking) */
    this.vy += Momoko.GRAVITY;

    /* Friction */
    this.vx *= Momoko.FRICTION;
    this.vy *= Momoko.FRICTION;

    /* Clamp velocity; a bounce crater's launch (boost) lifts the cap
       for a moment and fades back to the normal float speed. Turbo
       stretches the cap sideways only; after a release it eases back
       (tb.ease) while friction slows her. */
    var vmax = Momoko.MAX_VEL + (this.boost || 0);
    if (this.boost) this.boost = Math.max(0, this.boost - 0.12);
    var hx = this.vx / tb.ease;
    var speed = Math.sqrt(hx * hx + this.vy * this.vy);
    if (speed > vmax) {
      this.vx = (this.vx / speed) * vmax;
      this.vy = (this.vy / speed) * vmax;
    }

    /* Apply velocity */
    this.x += this.vx;
    this.y += this.vy;

    /* World bounds */
    if (this.x < 0) { this.x = 0; this.vx = 0; }
    if (this.x + this.w > level.width) { this.x = level.width - this.w; this.vx = 0; }
    if (this.y + this.h > level.floorY) { this.y = level.floorY - this.h; this.vy = 0; }

    /* Shoot cooldown */
    if (this.shootCooldown > 0) this.shootCooldown--;

    /* Animation */
    this.animTimer++;
    if (this.animTimer > 6) { this.animTimer = 0; this.animFrame = (this.animFrame + 1) % 4; }
    /* The pet's wag and paw phase: runs on (animTimer wraps every 7
       frames, which made its tail and legs snap back) and quickens with
       her speed. */
    this.petT = (this.petT || 0) + 0.45 + Math.min(2, Math.abs(this.vx) / Momoko.MAX_VEL) * 0.9;
    this.petSwing = petSwingStep(this.petSwing, this.facing, 1 / 60);
    if (this.rig) {
      if (!this.env || this.envLevel !== level) {
        this.envLevel = level;
        this.env = {
          sky: level.bgMid || '#1a0b3d', ground: level.floorColorB || '#4a2a8a',
          key: level.keyLight || '#ffc4e8', glow: level.horizonGlow || '#a04ad8',
        };
        this.dustCol = level.floorColorB ? mixDust(level.floorColorB) : '#d8ccf4';
      }
      this.rig.update(1 / 60, this.x + this.w / 2, this.y + this.h, {
        grounded: this.y + this.h >= level.floorY - 0.5, facing: this.facing, dust: true, vmax: 192, arrive: true,
        turbo: tb.ease - 1,
      });
    }
  };

  /* Pet swing: instead of mirroring flat when she turns, the pet swings
     round behind her on a shallow ellipse. th runs 0 (behind her left,
     she faces right) to PI (behind her right); sin(th) is its depth.
     The same timing and depth constants are used in every Momoko game. */
  var PET_SWING_T = 0.3, PET_SWING_SHRINK = 0.18, PET_SWING_LIFT = 3, PET_SWING_NARROW = 0.5;
  function petSwingStep(S, facing, dt) {
    var to = facing > 0 ? 0 : Math.PI;
    if (!S) return { th: to, from: to, to: to, u: 1 };
    if (S.to !== to) { S.from = S.th; S.to = to; S.u = 0; }
    if (S.u < 1) {
      S.u = Math.min(1, S.u + dt / PET_SWING_T);
      S.th = S.from + (S.to - S.from) * S.u * S.u * (3 - 2 * S.u);
    }
    return S;
  }

  /* Pale regolith tint for the dust puffs from the level's ground. */
  function mixDust(hex) {
    var n = parseInt(hex.slice(1), 16);
    var r = ((n >> 16) & 255) * 0.35 + 255 * 0.65, g = ((n >> 8) & 255) * 0.35 + 240 * 0.65, b = (n & 255) * 0.35 + 255 * 0.65;
    return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);
  }

  /* A little reaction (cheer / wave) on top of whatever she is doing. */
  Momoko.prototype.react = function (kind) { if (this.rig) this.rig.doReact(kind); };
  /* Dust from her footfalls, drawn behind her in world space. */
  Momoko.prototype.drawFx = function (c, camX, camY) {
    if (this.rig && Game.momoko) Game.momoko.drawDust(c, this.rig, camX, camY, this.dustCol);
  };

  Momoko.prototype.shoot = function () {
    if (this.shootCooldown > 0) return null;
    this.shootCooldown = Momoko.SHOOT_CD;
    Game.audio.play('bubble');
    return new Bubble(
      this.x + (this.facing === 1 ? this.w : -8),
      this.y + this.h / 2 - 4,
      this.facing
    );
  };

  /* ---- Shared color helpers (hoisted so sub-painters can share) ---- */
  function hexShade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.max(0, ((n >> 16) & 255) - amt);
    var g = Math.max(0, ((n >> 8) & 255) - amt);
    var b = Math.max(0, (n & 255) - amt);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function hexTint(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.min(255, ((n >> 16) & 255) + amt);
    var g = Math.min(255, ((n >> 8) & 255) + amt);
    var b = Math.min(255, (n & 255) + amt);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /* Five-point star fill centered at (cx, cy) with outer radius r. */
  function fillStar(c, cx, cy, r) {
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var ang = -Math.PI / 2 + i * Math.PI / 5;
      var rr = i % 2 === 0 ? r : r * 0.4;
      var px = cx + Math.cos(ang) * rr;
      var py = cy + Math.sin(ang) * rr;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
    c.fill();
  }

  /* Shared Momoko sprite painter -- gameplay, interiors, customize
     preview, title, intro and the beach cutscene all paint her through
     this so she looks the same everywhere. The painter itself lives in
     momoko.js. opts (optional): { mirror, t, vx, vy } -- callers that
     flip the canvas pass mirror so her key light stays on the world's
     upper left. */
  function drawMomokoSprite(c, sx, sy, cust, frame, opts) {
    var o = opts || {};
    Game.momoko.paint(c, sx, sy, cust, { rig: o.rig, pose: o.pose, mirror: o.mirror, env: o.env });
  }

  /* Pet-dog companion (the field is still called `crab`). `variant`
     picks the pup: three smooth coats, a fluffy poodle, a husky, a robot
     pup and a star pup, or 'none'. Everything gets Momoko's cel shading;
     pass mirror when the canvas is flipped so the light stays on the
     upper left. The pup faces left with its paws on py + 5.5. */
  var PETS = ['none', 'red', 'blue', 'gold', 'fluffy', 'husky', 'robo', 'star'];
  var PET_COATS = {
    red:    { body: '#9a6238', accent: '#5e3a1c', muzzle: '#e6bc8c', collar: '#e8305c' },
    blue:   { body: '#f2f0f6', accent: '#3e3440', muzzle: '#ffffff', collar: '#3a8ae8' },
    gold:   { body: '#f2c05c', accent: '#b0702a', muzzle: '#fde8b8', collar: '#e8305c' },
    fluffy: { body: '#fff4fa', accent: '#ffc0da', muzzle: '#ffffff', collar: '#ff7ab0' },
    husky:  { body: '#8a96b4', accent: '#566080', muzzle: '#ffffff', collar: '#38b8d0' },
    robo:   { body: '#c4cee8', accent: '#7a84a8', muzzle: '#e6eeff', collar: '#ff5a8a' },
    star:   { body: '#c8a8f4', accent: '#8a5ad8', muzzle: '#f4e6ff', collar: '#ffd24a' },
  };
  var PET_INK = '#2a1a22', PET_GOLD = '#ffd24a';
  /* The pup's wag-and-trot loop is cut into PET_FRAMES poses, each
     painted once per coat, light side and device scale and then blitted,
     so it costs one drawImage a frame. PET_BOX is the window around
     (px, py) a pose is painted in. */
  var PET_FRAMES = 48, PET_BOX = [-15, -14, 31, 21];
  var petCache = {}, petCacheN = 0;
  function drawCrabPet(c, px, py, variant, frame, mirror) {
    if (variant === 'spotted') variant = 'blue';
    else if (variant === 'golden') variant = 'gold';
    var coat = PET_COATS[variant];
    if (!coat) return;
    var m = c.getTransform();
    var s = Math.sqrt(m.c * m.c + m.d * m.d);
    s = Math.min(24, Math.pow(2, Math.ceil(Math.log(Math.max(s, 0.5)) / Math.LN2 * 4) / 4));
    var idx = Math.round((frame || 0) * 0.1 / (Math.PI * 2) * PET_FRAMES) % PET_FRAMES;
    var key = variant + (mirror ? 'm' : '') + '@' + s + '#' + idx;
    var cv = petCache[key];
    if (!cv) {
      if (petCacheN >= 480) { petCache = {}; petCacheN = 0; }
      cv = document.createElement('canvas');
      cv.width = Math.ceil(PET_BOX[2] * s);
      cv.height = Math.ceil(PET_BOX[3] * s);
      var g = cv.getContext('2d');
      g.setTransform(s, 0, 0, s, -PET_BOX[0] * s, -PET_BOX[1] * s);
      /* a size up from its old 19x11 box, standing on the same paws */
      g.translate(0, 5.5);
      g.scale(1.15, 1.15);
      g.translate(0, -5.5);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      var S = Game.momoko.shader(g, mirror);
      var u = idx / PET_FRAMES * Math.PI * 2;
      if (variant === 'robo') drawRoboPup(g, S, coat, u);
      else drawFurPup(g, S, variant, coat, u);
      S.done();
      petCache[key] = cv;
      petCacheN++;
    }
    c.drawImage(cv, px + PET_BOX[0], py + PET_BOX[1], cv.width / s, cv.height / s);
  }

  function petDot(c, x, y, r, col) {
    c.fillStyle = col;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
  function petLeg(c, S, x, sw, col, paw, far) {
    S.shape(S.limb(x, 1.4, x + sw, 4.5, 1.35, 1.05), col, { d: 0.7, lw: 0.42, rim: !far });
    S.shape(S.ellipse(x + sw - 0.45, 5.0, 1.5, 0.78), paw, { d: 0.4, lw: 0.38, rim: false });
  }

  /* u is the phase of the loop, 0 to 2 pi. */
  function drawFurPup(c, S, kind, coat, u) {
    var body = coat.body, acc = coat.accent, mz = coat.muzzle, TAU = Math.PI * 2;
    var fluffy = kind === 'fluffy', husky = kind === 'husky', star = kind === 'star';
    var wag = Math.sin(u * 2) * 0.8, step = Math.sin(u * 3) * 0.9;
    var far = S.shade(body), paw = husky || kind === 'red' ? mz : fluffy ? acc : body;

    /* tail */
    if (fluffy) {
      S.shape(S.lock(5.0, -1.4, 6.6, -3.6 + wag, 7.4 + wag, -5.0, 0.9), body, { d: 0.4, lw: 0.4 });
      S.shape(S.cloud(7.8 + wag * 1.2, -6.2 + wag * 0.5, 1.2, 1.2, 6, 1.0), body, { d: 0.7, lw: 0.42 });
    } else if (husky) {
      S.shape(S.lock(4.8, -1.2, 10.6, -4.6 + wag, 5.6 + wag * 0.8, -7.4, 2.4), body, { d: 0.8, lw: 0.45 });
      /* white tip */
      c.save();
      c.beginPath(); c.arc(5.6 + wag * 0.8, -7.4, 3.0, 0, TAU); c.clip();
      S.shape(S.lock(4.8, -1.2, 10.6, -4.6 + wag, 5.6 + wag * 0.8, -7.4, 2.4), mz, { d: 0.6, lw: 0.45 });
      c.restore();
    } else {
      S.shape(S.lock(5.2, -0.9, 8.8, -2.2 + wag * 1.5, 9.6, -6.2 + wag * 2, 1.35), star ? acc : body, { d: 0.6, lw: 0.45 });
      if (star) {
        S.shape(S.star(9.7, -6.6 + wag * 2, 1.7, 0.5), PET_GOLD, { d: 0.5, lw: 0.36, rim: false });
        var k = u / TAU;
        c.fillStyle = 'rgba(255, 255, 255, ' + (1 - k).toFixed(3) + ')';
        c.beginPath(); c.arc(11.6 + k * 1.6, -4.6 + k * 2.2, 0.45 * (1 - k) + 0.1, 0, TAU); c.fill();
        c.beginPath(); c.arc(8.0 + k * 1.2, -8.6 + k * 1.4, 0.4 * (1 - k) + 0.1, 0, TAU); c.fill();
      }
    }

    petLeg(c, S, -3.1, -step, far, S.shade(paw), true);
    petLeg(c, S, 3.4, step, far, S.shade(paw), true);

    /* body */
    if (fluffy) S.shape(S.cloud(0, -0.2, 5.2, 3.2, 11, 1.55), body, { d: 1.4, lw: 0.5 });
    else S.shape(S.ellipse(0, 0, 6.3, 4.1), body, { d: 1.4, lw: 0.5 });
    if (husky) S.shape(S.ellipse(-0.8, 2.0, 4.6, 1.9), mz, { d: 0.5, lw: 0, rim: false, soft: true });
    if (kind === 'blue') {
      petDot(c, 1.3, -1.7, 1.45, acc);
      petDot(c, 3.8, 0.9, 1.0, acc);
      petDot(c, -1.2, 1.4, 0.75, acc);
    } else if (star) {
      S.shape(S.star(2.2, -0.4, 1.5, 0.5), PET_GOLD, { d: 0.4, lw: 0.32, rim: false });
      petDot(c, -0.6, -2.2, 0.26, '#ffffff');
      petDot(c, 4.4, 1.4, 0.22, '#ffffff');
      petDot(c, 0.2, 1.8, 0.22, '#ffffff');
    } else if (fluffy) {
      c.strokeStyle = 'rgba(230, 150, 190, 0.6)';
      c.lineWidth = 0.28;
      c.beginPath();
      c.moveTo(1.6, -1.2); c.arc(0.8, -1.2, 0.8, 0, Math.PI * 1.3);
      c.moveTo(3.6, 1.0); c.arc(2.8, 1.0, 0.8, 0, Math.PI * 1.3);
      c.moveTo(-0.6, 1.4); c.arc(-1.4, 1.4, 0.8, 0, Math.PI * 1.3);
      c.stroke();
    }
    /* chest bib */
    if (!fluffy) S.shape(S.ellipse(-4.3, 1.4, 1.9, 2.0), mz, { d: 0.5, lw: 0, rim: false, soft: true });

    petLeg(c, S, -1.7, step, husky ? mz : body, paw, false);
    petLeg(c, S, 4.4, -step, body, paw, false);
    if (fluffy) {
      /* pom cuffs */
      S.shape(S.cloud(-1.9 + step * 0.7, 3.6, 0.9, 0.7, 5, 0.75), body, { d: 0.4, lw: 0.36, rim: false });
      S.shape(S.cloud(4.2 - step * 0.7, 3.6, 0.9, 0.7, 5, 0.75), body, { d: 0.4, lw: 0.36, rim: false });
    }

    /* collar: a band wrapping the neck where it meets the chest, painted
       before the head so the jaw and ear tuck over its top; the tag
       hangs from it at the throat */
    c.beginPath();
    c.moveTo(-1.9, -3.7);
    c.quadraticCurveTo(-1.6, 0.2, -4.9, 2.6);
    c.strokeStyle = PET_INK;
    c.lineWidth = 2.0;
    c.stroke();
    c.strokeStyle = coat.collar;
    c.lineWidth = 1.3;
    c.stroke();
    S.shape(S.ellipse(-5.1, 3.5, 0.85, 0.85), PET_GOLD, { d: 0.3, lw: 0.3, rim: false });

    /* far ear */
    if (husky) {
      S.shape(function () { c.moveTo(-8.6, -4.6); c.quadraticCurveTo(-8.6, -8.0, -7.6, -8.9); c.quadraticCurveTo(-6.2, -7.4, -5.8, -5.4); c.closePath(); },
        acc, { d: 0.5, lw: 0.42 });
    }

    /* head */
    if (fluffy) S.shape(S.cloud(-5.6, -2.3, 2.9, 2.9, 9, 1.35), body, { d: 1.2, lw: 0.5 });
    else S.shape(S.ellipse(-5.6, -2.3, 3.8, 3.8), body, { d: 1.2, lw: 0.5 });
    if (husky) {
      /* white mask over the cheeks and brow spots */
      S.shape(S.ellipse(-6.3, -0.9, 3.0, 2.2), mz, { d: 0.5, lw: 0, rim: false, soft: true });
      petDot(c, -6.6, -4.7, 0.62, mz);
    } else if (kind === 'red') {
      petDot(c, -6.5, -4.7, 0.55, mz);
    } else if (star) {
      S.shape(S.star(-5.3, -5.0, 1.25, 0.5), PET_GOLD, { d: 0.4, lw: 0.3, rim: false });
    }
    S.shape(S.ellipse(-7.9, -1.1, 2.35, 1.8), mz, { d: 0.7, lw: 0.4 });

    /* near ear */
    if (husky) {
      S.shape(function () { c.moveTo(-5.2, -5.2); c.quadraticCurveTo(-4.6, -8.4, -3.2, -9.2); c.quadraticCurveTo(-2.2, -7.4, -2.4, -4.6); c.closePath(); },
        body, { d: 0.6, lw: 0.45 });
      c.fillStyle = '#ffb0cc';
      c.beginPath(); c.moveTo(-4.3, -5.6); c.quadraticCurveTo(-3.9, -7.6, -3.2, -8.2); c.quadraticCurveTo(-2.8, -7.0, -3.0, -5.4); c.closePath(); c.fill();
    } else if (fluffy) {
      S.shape(S.cloud(-3.0, -1.6, 1.0, 1.9, 7, 1.0), acc, { d: 0.7, lw: 0.42 });
      /* topknot and bow */
      S.shape(S.cloud(-5.6, -5.9, 1.3, 0.9, 6, 0.95), body, { d: 0.6, lw: 0.42 });
      S.shape(S.ellipse(-6.5, -5.2, 0.95, 0.7, -0.4), coat.collar, { d: 0.3, lw: 0.3, rim: false });
      S.shape(S.ellipse(-4.9, -5.2, 0.95, 0.7, 0.4), coat.collar, { d: 0.3, lw: 0.3, rim: false });
      petDot(c, -5.7, -5.2, 0.42, '#ffffff');
    } else {
      S.shape(S.ellipse(-3.2, -2.5, 1.5, 3.0, 0.3), acc, { d: 0.7, lw: 0.42 });
    }

    /* face: nose, smile and tongue, a bright eye, a blush */
    c.fillStyle = PET_INK;
    c.beginPath(); c.ellipse(-9.75, -1.75, 1.0, 0.8, 0, 0, TAU); c.fill();
    petDot(c, -10.0, -2.0, 0.26, 'rgba(255, 255, 255, 0.85)');
    c.fillStyle = '#ff7aa0';
    c.beginPath(); c.ellipse(-8.3, 0.25, 0.62, 0.8, -0.2, 0, TAU); c.fill();
    c.strokeStyle = PET_INK;
    c.lineWidth = 0.32;
    c.beginPath(); c.moveTo(-9.7, -0.9); c.quadraticCurveTo(-8.9, 0.1, -7.5, -0.4); c.stroke();
    petDot(c, -6.2, -3.2, 1.0, PET_INK);
    if (husky) { petDot(c, -6.2, -3.2, 0.78, '#4ac8ff'); petDot(c, -6.2, -3.2, 0.42, PET_INK); }
    petDot(c, -6.5, -3.55, 0.34, '#ffffff');
    c.fillStyle = 'rgba(255, 120, 160, 0.45)';
    c.beginPath(); c.ellipse(-5.0, -1.3, 0.95, 0.55, 0, 0, TAU); c.fill();
  }

  function drawRoboPup(c, S, coat, u) {
    var metal = coat.body, dark = coat.accent, TAU = Math.PI * 2;
    var wag = Math.sin(u * 2) * 0.8, step = Math.sin(u * 3) * 0.9;
    var pulse = 0.65 + 0.35 * Math.sin(u);
    /* aerial tail with a beacon */
    c.strokeStyle = PET_INK; c.lineWidth = 1.0;
    c.beginPath(); c.moveTo(5.2, -1.6); c.quadraticCurveTo(7.6, -2.8, 8.6, -6.0 + wag); c.stroke();
    c.strokeStyle = metal; c.lineWidth = 0.5;
    c.stroke();
    petDot(c, 8.6, -6.2 + wag, 1.9, 'rgba(255, 90, 138, ' + (0.35 * pulse).toFixed(3) + ')');
    S.shape(S.ellipse(8.6, -6.2 + wag, 0.95, 0.95), '#ff5a8a', { d: 0.4, lw: 0.34, rim: false });
    /* far legs */
    var leg = function (x, sw, col, far) {
      S.shape(S.limb(x, 1.6, x + sw, 4.2, 0.95, 0.8), col, { d: 0.5, lw: 0.4, rim: !far });
      S.shape(S.ellipse(x + sw, 4.75, 1.15, 0.9), '#4a5478', { d: 0.4, lw: 0.38, rim: false });
    };
    leg(-3.1, -step, dark, true);
    leg(3.4, step, dark, true);
    /* hull */
    S.shape(S.rect(-5.8, -3.6, 11.6, 6.8, 2.6), metal, { d: 1.3, lw: 0.5 });
    c.strokeStyle = S.shade(metal);
    c.lineWidth = 0.3;
    c.beginPath(); c.moveTo(1.6, -3.4); c.lineTo(1.6, 3.0); c.stroke();
    petDot(c, 4.6, -2.3, 0.3, '#ffffff');
    petDot(c, 4.6, 1.9, 0.3, '#ffffff');
    /* chest light */
    petDot(c, 0.0, -0.2, 2.2, 'rgba(90, 230, 255, ' + (0.3 * pulse).toFixed(3) + ')');
    S.shape(S.ellipse(0.0, -0.2, 1.3, 1.3), '#2a3458', { d: 0.3, lw: 0.34, rim: false });
    petDot(c, 0.0, -0.2, 0.85, '#7af0ff');
    petDot(c, -0.25, -0.45, 0.3, '#ffffff');
    leg(-1.7, step, metal, false);
    leg(4.4, -step, metal, false);
    /* collar ring round the neck, under the head, with its tag */
    S.shape(S.rect(-4.5, -3.6, 1.5, 6.8, 0.2), coat.collar, { d: 0.3, lw: 0.3, rim: false, hi: false });
    S.shape(S.ellipse(-3.75, 3.8, 0.8, 0.8), PET_GOLD, { d: 0.3, lw: 0.3, rim: false });
    /* neck joint, head, visor */
    S.shape(S.rect(-5.4, -3.0, 1.8, 2.6, 0.5), dark, { d: 0.3, lw: 0.36, rim: false });
    /* dish ear */
    S.shape(function () { c.moveTo(-3.6, -5.4); c.lineTo(-1.9, -8.4); c.lineTo(-1.5, -4.6); c.closePath(); }, dark, { d: 0.4, lw: 0.4 });
    S.shape(S.rect(-9.8, -6.3, 7.6, 5.8, 2.0), metal, { d: 1.2, lw: 0.5 });
    S.shape(S.rect(-9.3, -5.3, 5.6, 2.5, 1.1), '#1e2440', { d: 0.4, lw: 0.36, rim: false, hi: false });
    c.fillStyle = '#7af0ff';
    c.beginPath(); c.ellipse(-7.3, -4.05, 1.05, 0.8, 0, 0, TAU); c.fill();
    petDot(c, -7.6, -4.3, 0.3, '#ffffff');
    c.fillStyle = 'rgba(122, 240, 255, 0.5)';
    c.beginPath(); c.ellipse(-5.0, -4.05, 0.5, 0.4, 0, 0, TAU); c.fill();
    /* snout with a pink nose and a speaker grille */
    S.shape(S.rect(-10.9, -2.9, 2.6, 2.0, 0.7), coat.muzzle, { d: 0.4, lw: 0.4 });
    petDot(c, -10.5, -2.4, 0.45, '#ff5a8a');
    c.strokeStyle = dark; c.lineWidth = 0.26;
    c.beginPath(); c.moveTo(-7.6, -1.9); c.lineTo(-4.6, -1.9); c.moveTo(-7.6, -1.3); c.lineTo(-4.6, -1.3); c.stroke();
    /* antenna */
    c.strokeStyle = PET_INK; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(-6.2, -6.2); c.lineTo(-6.2 + wag * 0.3, -8.4); c.stroke();
    petDot(c, -6.2 + wag * 0.3, -8.8, 1.5, 'rgba(255, 220, 90, ' + (0.4 * pulse).toFixed(3) + ')');
    S.shape(S.ellipse(-6.2 + wag * 0.3, -8.8, 0.75, 0.75), PET_GOLD, { d: 0.3, lw: 0.32, rim: false });
  }

  /* Gameplay draw: the figure is painted a size up from her 28x34
     collision box, pivoting on her feet, so she reads at play scale
     while every collision stays exactly as it was. Lean, squash, hop
     and the turn come from her rig. */
  Momoko.HERO_SCALE = 1.25;
  Momoko.prototype.draw = function (c, camX, camY) {
    /* Not snapped to whole pixels: her render-blended position glides. */
    var sx = this.x - camX;
    var sy = this.y - camY;
    var cust = window.Game.customization || {};
    var k = Momoko.HERO_SCALE;
    var pose = this.rig ? this.rig.pose : null;
    var face = pose ? pose.face : this.facing;

    /* Pet trails at foot level on the side away from her facing. When she
       turns it swings round behind her (see petSwingStep): it shrinks and
       rises as it goes deeper, narrows toward a front view and swaps its
       facing at the far point, where she hides it. The pup painter faces
       left, so it is flipped while it trails on her left, facing her. */
    if (cust.crab && cust.crab !== 'none') {
      var ps = this.petSwing || { th: this.facing > 0 ? 0 : Math.PI };
      var pco = Math.cos(ps.th), pz = Math.sin(ps.th), pd = 1 - PET_SWING_SHRINK * pz, pm = pco < 0 ? 1 : -1;
      c.save();
      c.translate(sx + this.w / 2 - (this.w / 2 + 12) * pco, sy + 37.5 - PET_SWING_LIFT * pz);
      c.scale(pm * (PET_SWING_NARROW + (1 - PET_SWING_NARROW) * Math.abs(pco)) * pd, pd);
      drawCrabPet(c, 0, -5.5, cust.crab, this.petT || 0, pm === -1);
      c.restore();
    }
    c.save();
    c.translate(sx + this.w / 2, sy + this.h);
    c.scale(k * (pose ? pose.sx : this.facing), k);
    drawMomokoSprite(c, -this.w / 2, -this.h, cust, 0, {
      rig: this.rig, mirror: face === -1, env: this.env,
    });
    c.restore();
  };


  /* Floss-dance Momoko (pause and victory screens) -- the same hero
     figure as drawMomokoSprite in the floss pose; phase is in radians. */
  function drawMomokoFloss(c, sx, sy, cust, phase) {
    Game.momoko.floss(c, sx, sy, cust, phase);
  }

  /* ========== BUBBLE (Projectile) ========== */
  function Bubble(x, y, dir) {
    this.x = x;
    this.y = y;
    this.r = 6;
    this.dir = dir;
    this.speed = 5;
    this.life = 90; /* frames */
    this.active = true;
    this.hue = Math.random() * 360;
    this.wobble = Math.random() * Math.PI * 2;
  }

  Bubble.prototype.update = function () {
    this.x += this.speed * this.dir;
    this.wobble += 0.15;
    this.y += Math.sin(this.wobble) * 0.8;
    this.hue = (this.hue + 5) % 360;
    this.life--;
    if (this.life <= 0) this.active = false;
  };

  /* Re-themed as Sparkle — a 4-point twinkling star with a colour cycle. */
  Bubble.prototype.draw = function (c, camX, camY) {
    if (!this.active) return;
    var sx = this.x - camX;
    var sy = this.y - camY;
    c.save();
    c.globalAlpha = 0.95;
    var col = 'hsl(' + this.hue + ',95%,70%)';
    c.fillStyle = col;
    var r = this.r;
    /* 4-point star */
    c.beginPath();
    c.moveTo(sx, sy - r);
    c.lineTo(sx + r * 0.35, sy - r * 0.35);
    c.lineTo(sx + r, sy);
    c.lineTo(sx + r * 0.35, sy + r * 0.35);
    c.lineTo(sx, sy + r);
    c.lineTo(sx - r * 0.35, sy + r * 0.35);
    c.lineTo(sx - r, sy);
    c.lineTo(sx - r * 0.35, sy - r * 0.35);
    c.closePath();
    c.fill();
    /* Bright core */
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(sx, sy, r * 0.35, 0, Math.PI * 2);
    c.fill();
    /* Soft halo */
    c.globalAlpha = 0.35;
    c.fillStyle = col;
    c.beginPath();
    c.arc(sx, sy, r * 1.6, 0, Math.PI * 2);
    c.fill();
    c.restore();
  };

  /* ========== FISH (Enemy) ========== */
  /* species: 'tropical' (default reef-fish-shaped friendly star), 'swordfish'
     (long/fast variant), 'blowfish' (round/slow, 2 HP), 'clownfish' (orange
     stripes). Appearance, size, hp, and speed vary per species so levels
     can mix them for visual and gameplay variety. */
  function Fish(x, y, pattern, dir, species) {
    this.spawnX = x;
    this.spawnY = y;
    this.x = x;
    this.y = y;
    this.species = species || 'tropical';
    this.pattern = pattern || 'sine';
    this.dir = dir || -1;
    this.timer = Math.random() * 100;
    this.active = true;
    this.flash = 0;

    if (this.species === 'swordfish') {
      this.w = 36; this.h = 14;
      this.hp = 2;
      this.speed = 1.8;
      this.color = '#3a5a78';
    } else if (this.species === 'blowfish') {
      this.w = 26; this.h = 24;
      this.hp = 2;
      this.speed = 0.7;
      this.color = '#d9b24a';
    } else if (this.species === 'clownfish') {
      this.w = 24; this.h = 16;
      this.hp = 1;
      this.speed = 1.4;
      this.color = '#ff7a22';
    } else {
      /* tropical */
      this.w = 24; this.h = 16;
      this.hp = 1;
      this.speed = 1.2;
      this.color = ['#ee4444', '#44bb44', '#4488ee', '#eeaa22'][Math.floor(Math.random() * 4)];
    }
  }

  Fish.prototype.update = function () {
    if (!this.active) return;
    this.timer++;
    if (this.flash > 0) this.flash--;

    if (this.pattern === 'sine') {
      this.x += this.speed * this.dir;
      this.y = this.spawnY + Math.sin(this.timer * 0.04) * 40;
    } else {
      this.x += this.speed * this.dir;
    }

    /* Reverse if too far from spawn */
    if (Math.abs(this.x - this.spawnX) > 150) {
      this.dir *= -1;
    }
  };

  /* Comfortable RPG — aliens are friendly. Sparkle makes them twirl. */
  Fish.prototype.delight = function () {
    this.flash = 6;
    this.delighted = 60;
    Game.audio.play('pickup');
    return false;
  };

  Fish.prototype.draw = function (c, camX, camY) {
    if (!this.active) return;
    var sx = Math.round(this.x - camX);
    var sy = Math.round(this.y - camY);

    c.save();
    if (this.dir === 1) {
      c.translate(sx + this.w / 2, 0);
      c.scale(-1, 1);
      sx = -this.w / 2;
    }

    if (this.flash > 0 && this.flash % 2 === 0) { c.restore(); return; }

    if (this.species === 'swordfish') drawSwordfish(c, sx, sy, this.color, this.timer);
    else if (this.species === 'blowfish') drawBlowfish(c, sx, sy, this.color, this.timer);
    else if (this.species === 'clownfish') drawClownfish(c, sx, sy, this.timer);
    else drawTropicalFish(c, sx, sy, this.color);

    c.restore();
  };

  /* ---- Friendly space creatures (replaced fish renderings) ---- */

  /* Tropical → "Starlet": a smiling 5-point star with eyes. */
  function drawTropicalFish(c, sx, sy, color) {
    var cx = sx + 12, cy = sy + 8;
    /* Glow halo */
    c.fillStyle = 'rgba(255,255,255,0.15)';
    c.beginPath(); c.arc(cx, cy, 14, 0, Math.PI * 2); c.fill();
    /* Star body */
    c.fillStyle = color;
    fillStar(c, cx, cy, 10);
    /* Lighter inner star */
    c.fillStyle = hexTint(color, 50);
    fillStar(c, cx, cy, 5.5);
    /* Eyes */
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(cx - 2.5, cy, 1.6, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(cx + 2.5, cy, 1.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#1a0c14';
    c.beginPath(); c.arc(cx - 2.3, cy + 0.3, 0.8, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(cx + 2.7, cy + 0.3, 0.8, 0, Math.PI * 2); c.fill();
    /* Smile */
    c.strokeStyle = '#1a0c14';
    c.lineWidth = 0.8;
    c.beginPath();
    c.arc(cx, cy + 2, 1.6, 0.2, Math.PI - 0.2);
    c.stroke();
  }

  /* Swordfish → "Comet": a glowing rock with a long sparkly tail. */
  function drawSwordfish(c, sx, sy, color, timer) {
    var hx = sx + 26, hy = sy + 7;
    /* Tail flames trailing behind */
    c.save();
    var tailFlick = Math.sin(timer * 0.18) * 0.6;
    var grd = c.createLinearGradient(sx - 12, hy, hx, hy);
    grd.addColorStop(0, 'rgba(120,200,255,0)');
    grd.addColorStop(0.4, 'rgba(120,200,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0.9)');
    c.fillStyle = grd;
    c.beginPath();
    c.moveTo(hx, hy - 5);
    c.quadraticCurveTo(sx + 5, hy - 3 + tailFlick, sx - 12, hy);
    c.quadraticCurveTo(sx + 5, hy + 3 + tailFlick, hx, hy + 5);
    c.closePath();
    c.fill();
    /* Spark dots in trail */
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(sx + 6, hy - 1 + tailFlick, 0.9, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 16, hy + 1, 0.7, 0, Math.PI * 2); c.fill();
    c.restore();
    /* Comet head */
    c.fillStyle = '#cccccc';
    c.beginPath(); c.arc(hx, hy, 6.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffe4a0';
    c.beginPath(); c.arc(hx - 1.5, hy - 1.5, 4.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(hx - 2, hy - 2, 1.8, 0, Math.PI * 2); c.fill();
    /* Smile + tiny eyes */
    c.fillStyle = '#1a0c14';
    c.beginPath(); c.arc(hx - 1, hy, 0.7, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(hx + 2, hy, 0.7, 0, Math.PI * 2); c.fill();
  }

  /* Blowfish → "Pufflon": round purple alien with bouncing antenna spikes. */
  function drawBlowfish(c, sx, sy, color, timer) {
    var puff = 1 + Math.sin(timer * 0.06) * 0.08;
    var cx = sx + 13, cy = sy + 12;
    var r = 10 * puff;
    /* Antenna spokes with glowing tips */
    c.strokeStyle = '#bb88ff';
    c.lineWidth = 1.2;
    for (var i = 0; i < 8; i++) {
      var a = (i / 8) * Math.PI * 2 + timer * 0.01;
      var x1 = cx + Math.cos(a) * r;
      var y1 = cy + Math.sin(a) * r;
      var x2 = cx + Math.cos(a) * (r + 5);
      var y2 = cy + Math.sin(a) * (r + 5);
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
      c.fillStyle = '#fff4a8';
      c.beginPath(); c.arc(x2, y2, 1.1, 0, Math.PI * 2); c.fill();
    }
    /* Body */
    c.fillStyle = '#9966dd';
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#bb88ee';
    c.beginPath(); c.arc(cx - 2, cy - 2, r * 0.7, 0, Math.PI * 2); c.fill();
    /* Big alien eyes */
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(cx - 3, cy - 1, 2.6, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(cx + 3, cy - 1, 2.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#220033';
    c.beginPath(); c.arc(cx - 3, cy - 0.5, 1.3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(cx + 3, cy - 0.5, 1.3, 0, Math.PI * 2); c.fill();
    /* Smile */
    c.strokeStyle = '#3a1a4f';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(cx, cy + 3, 2.2, 0.2, Math.PI - 0.2);
    c.stroke();
  }

  /* Clownfish → "Sparklette": glowing teardrop alien sprite. */
  function drawClownfish(c, sx, sy, timer) {
    var cx = sx + 12, cy = sy + 8;
    var bob = Math.sin(timer * 0.08) * 1.2;
    /* Glow halo */
    c.fillStyle = 'rgba(120,255,220,0.25)';
    c.beginPath(); c.arc(cx, cy + bob, 11, 0, Math.PI * 2); c.fill();
    /* Body — teardrop */
    c.fillStyle = '#44ddcc';
    c.beginPath();
    c.moveTo(cx, cy - 9 + bob);
    c.bezierCurveTo(cx + 9, cy - 4 + bob, cx + 9, cy + 7 + bob, cx, cy + 8 + bob);
    c.bezierCurveTo(cx - 9, cy + 7 + bob, cx - 9, cy - 4 + bob, cx, cy - 9 + bob);
    c.closePath();
    c.fill();
    /* Light core */
    c.fillStyle = '#aaffee';
    c.beginPath(); c.ellipse(cx, cy + bob, 5, 7, 0, 0, Math.PI * 2); c.fill();
    /* Sparkle ring */
    c.fillStyle = '#ffffff';
    fillStar(c, cx + 5, cy - 4 + bob, 1.5);
    fillStar(c, cx - 5, cy + 3 + bob, 1.2);
    /* Eyes */
    c.fillStyle = '#003344';
    c.beginPath(); c.arc(cx - 1.6, cy - 1 + bob, 0.9, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(cx + 1.6, cy - 1 + bob, 0.9, 0, Math.PI * 2); c.fill();
    /* Smile */
    c.strokeStyle = '#003344';
    c.lineWidth = 0.6;
    c.beginPath();
    c.arc(cx, cy + 1 + bob, 1.4, 0.2, Math.PI - 0.2);
    c.stroke();
  }

  /* Glass space helmet for the explorer NPCs: a faint tinted dome, a
     rim and a curved glint, drawn over the head it encloses. */
  function drawBubbleHelmet(c, cx, cy, r) {
    c.save();
    c.fillStyle = 'rgba(170, 220, 255, 0.18)';
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(220, 240, 255, 0.85)';
    c.lineWidth = Math.max(0.8, r * 0.09);
    c.stroke();
    c.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    c.lineWidth = Math.max(0.7, r * 0.12);
    c.lineCap = 'round';
    c.beginPath(); c.arc(cx, cy, r * 0.72, Math.PI * 1.08, Math.PI * 1.42); c.stroke();
    c.fillStyle = 'rgba(255, 255, 255, 0.85)';
    c.beginPath(); c.arc(cx + r * 0.42, cy - r * 0.5, r * 0.08, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  /* Fills a rounded rectangle (path helper, no native roundRect). */
  function fillRRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
    c.fill();
  }

  /* Short flickering thruster flame pointing along (dx, dy). */
  function drawThrustFlame(c, x, y, dx, dy, len, w, t) {
    var f = len * (0.8 + 0.2 * Math.sin(t * 0.6) + 0.1 * Math.sin(t * 1.7));
    var nx = -dy, ny = dx;
    c.save();
    c.fillStyle = 'rgba(255, 140, 60, 0.85)';
    c.beginPath();
    c.moveTo(x + nx * w, y + ny * w);
    c.quadraticCurveTo(x + dx * f * 0.6 + nx * w, y + dy * f * 0.6 + ny * w, x + dx * f, y + dy * f);
    c.quadraticCurveTo(x + dx * f * 0.6 - nx * w, y + dy * f * 0.6 - ny * w, x - nx * w, y - ny * w);
    c.closePath(); c.fill();
    c.fillStyle = 'rgba(255, 240, 160, 0.95)';
    c.beginPath();
    c.moveTo(x + nx * w * 0.5, y + ny * w * 0.5);
    c.quadraticCurveTo(x + dx * f * 0.35, y + dy * f * 0.35, x + dx * f * 0.55, y + dy * f * 0.55);
    c.quadraticCurveTo(x + dx * f * 0.35, y + dy * f * 0.35, x - nx * w * 0.5, y - ny * w * 0.5);
    c.closePath(); c.fill();
    c.restore();
  }

  /* ========== OLIVER (NPC - Astronaut Otter) ========== */
  function Oliver(x, y) {
    this.x = x;
    this.y = y;
    this.w = 28;
    this.h = 20;
    this.spawnX = x;
    this.spawnY = y;
    this.timer = 0;
    this.talking = false;
    this.talkTimer = 0;
    this.currentJoke = '';
    this.interacted = false;
  }

  Oliver.prototype.update = function () {
    this.timer++;
    this.x = this.spawnX + Math.sin(this.timer * 0.02) * 40;
    this.y = this.spawnY + Math.cos(this.timer * 0.03) * 20;
    if (this.talking) {
      this.talkTimer--;
      if (this.talkTimer <= 0) this.talking = false;
    }
  };

  Oliver.prototype.interact = function () {
    this.talking = true;
    this.talkTimer = 540;
    this.currentJoke = Game.i18n.getJoke();
  };

  Oliver.prototype.draw = function (c, camX, camY) {
    var sx = Math.round(this.x - camX);
    var sy = Math.round(this.y - camY);
    var FUR = '#8a5a30', FUR_D = '#5e3a1a', CREAM = '#dcbc8c', INK = '#2a1a10';
    var SUIT = '#f4f6ff', SUIT_D = '#aab2d4', TRIM = '#ff8a3a';

    c.save();
    c.lineCap = 'round';
    /* Jetpack on his back, its thruster puffing behind him */
    drawThrustFlame(c, sx + 28, sy + 5, 1, 0.15, 9, 2.2, this.timer);
    c.fillStyle = '#8a90b0';
    fillRRect(c, sx + 13, sy + 0.5, 15, 6, 2);
    c.fillStyle = '#c4c8e0';
    fillRRect(c, sx + 14, sy + 1.2, 13, 2, 1);
    c.fillStyle = '#5a6080';
    fillRRect(c, sx + 26.5, sy + 2.5, 2.5, 4, 0.8);

    /* Body — white space suit on his long otter frame, lit from above */
    var bg = c.createLinearGradient(0, sy + 3, 0, sy + 20);
    bg.addColorStop(0, SUIT); bg.addColorStop(1, SUIT_D);
    c.fillStyle = bg;
    c.beginPath(); c.ellipse(sx + 16, sy + 12, 13, 7.5, -0.1, 0, Math.PI * 2); c.fill();
    /* Orange suit stripe and a chest control panel with blinking lights */
    c.strokeStyle = TRIM; c.lineWidth = 1.6;
    c.beginPath(); c.ellipse(sx + 16, sy + 12, 12.4, 6.8, -0.1, 0.35, 1.25); c.stroke();
    c.fillStyle = '#3a4a78';
    fillRRect(c, sx + 11, sy + 12, 7, 4, 1);
    var blink = Math.floor(this.timer / 20) % 3;
    c.fillStyle = blink === 0 ? '#7af0ff' : '#2a6a8a';
    c.beginPath(); c.arc(sx + 13, sy + 14, 0.9, 0, Math.PI * 2); c.fill();
    c.fillStyle = blink === 1 ? '#ffd24a' : '#7a6a2a';
    c.beginPath(); c.arc(sx + 16, sy + 14, 0.9, 0, Math.PI * 2); c.fill();
    /* Moon boot tucked under the rump */
    c.fillStyle = '#8a90b0';
    c.beginPath(); c.ellipse(sx + 25, sy + 17.5, 3.6, 2.0, 0.5, 0, Math.PI * 2); c.fill();
    /* Helmet neck ring */
    c.fillStyle = '#c4c8e0';
    c.beginPath(); c.ellipse(sx + 8.5, sy + 11, 2.2, 5.5, 0.35, 0, Math.PI * 2); c.fill();

    /* Head — round with small ears set wide */
    c.fillStyle = FUR;
    c.beginPath(); c.arc(sx + 6, sy + 7, 7, 0, Math.PI * 2); c.fill();
    c.fillStyle = FUR_D;
    c.beginPath(); c.arc(sx + 1.5, sy + 2, 2.2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 11, sy + 2, 2.2, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#c98a7a';
    c.beginPath(); c.arc(sx + 1.5, sy + 2, 1, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 11, sy + 2, 1, 0, Math.PI * 2); c.fill();
    /* Pale muzzle with big otter nose */
    c.fillStyle = CREAM;
    c.beginPath(); c.ellipse(sx + 6, sy + 9.5, 4.6, 3.4, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = INK;
    c.beginPath(); c.ellipse(sx + 6, sy + 8.2, 1.8, 1.3, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = FUR_D; c.lineWidth = 0.7;
    c.beginPath();
    c.moveTo(sx + 6, sy + 9.5); c.lineTo(sx + 6, sy + 10.4);
    c.moveTo(sx + 4.2, sy + 11); c.quadraticCurveTo(sx + 6, sy + 12.4, sx + 7.8, sy + 11);
    c.stroke();
    /* Eyes */
    c.fillStyle = INK;
    c.beginPath(); c.arc(sx + 3.2, sy + 6, 1.6, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 8.8, sy + 6, 1.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(sx + 2.7, sy + 5.4, 0.6, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 8.3, sy + 5.4, 0.6, 0, Math.PI * 2); c.fill();
    /* Whiskers */
    c.strokeStyle = '#f0e0c0'; c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(sx + 2, sy + 9); c.lineTo(sx - 4, sy + 8);
    c.moveTo(sx + 2, sy + 10); c.lineTo(sx - 4, sy + 11.5);
    c.moveTo(sx + 10, sy + 9); c.lineTo(sx + 16, sy + 8);
    c.moveTo(sx + 10, sy + 10); c.lineTo(sx + 16, sy + 11.5);
    c.stroke();
    /* Gloved paws resting on the chest panel */
    c.fillStyle = SUIT_D;
    c.beginPath(); c.ellipse(sx + 11.5, sy + 17, 2.4, 1.8, 0.4, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(sx + 17.5, sy + 17.5, 2.4, 1.8, -0.4, 0, Math.PI * 2); c.fill();
    /* Bubble helmet round his head */
    drawBubbleHelmet(c, sx + 6, sy + 6.5, 9.5);
    c.restore();
  };

  /* ========== KITTY CORN (NPC - Astronaut Cat-Unicorn) ========== */
  function KittyCorn(x, y) {
    this.x = x;
    this.y = y;
    this.w = 24;
    this.h = 28;
    this.spawnX = x;
    this.spawnY = y;
    this.timer = 0;
    this.talking = false;
    this.talkTimer = 0;
    this.currentText = '';
    this.interacted = false;
  }

  KittyCorn.prototype.update = function () {
    this.timer++;
    this.x = this.spawnX + Math.sin(this.timer * 0.025) * 30;
    this.y = this.spawnY + Math.cos(this.timer * 0.035) * 15;
    if (this.talking) {
      this.talkTimer--;
      if (this.talkTimer <= 0) this.talking = false;
    }
  };

  KittyCorn.prototype.interact = function () {
    this.talking = true;
    this.talkTimer = 540;
    if (!this.interacted) {
      this.currentText = Game.i18n.t('kittyGreet');
      this.interacted = true;
    } else {
      this.currentText = Game.i18n.t('kittyHint');
    }
  };

  KittyCorn.prototype.draw = function (c, camX, camY) {
    var sx = Math.round(this.x - camX);
    var sy = Math.round(this.y - camY);

    c.save();

    /* Twin jetpack tanks peeking past her shoulders, flames below */
    drawThrustFlame(c, sx + 3.5, sy + 24, 0, 1, 8, 1.8, this.timer);
    drawThrustFlame(c, sx + 20.5, sy + 24, 0, 1, 8, 1.8, this.timer + 7);
    c.fillStyle = '#ff6699';
    fillRRect(c, sx + 1, sy + 11, 5, 13, 2.2);
    fillRRect(c, sx + 18, sy + 11, 5, 13, 2.2);
    c.fillStyle = '#ffb3cc';
    fillRRect(c, sx + 2, sy + 12, 1.6, 10, 0.8);
    fillRRect(c, sx + 19, sy + 12, 1.6, 10, 0.8);

    /* Legs with moon boots, kicking gently as she floats */
    var kick = Math.sin(this.timer * 0.08) * 1.2;
    c.fillStyle = '#f4f6ff';
    fillRRect(c, sx + 7.5, sy + 18, 4, 7 + kick, 1.8);
    fillRRect(c, sx + 12.5, sy + 18, 4, 7 - kick, 1.8);
    c.fillStyle = '#9a78e8';
    fillRRect(c, sx + 7, sy + 23.5 + kick, 5, 3, 1.4);
    fillRRect(c, sx + 12, sy + 23.5 - kick, 5, 3, 1.4);

    /* Space suit body with a star badge */
    var sg = c.createLinearGradient(0, sy + 10, 0, sy + 22);
    sg.addColorStop(0, '#f4f6ff'); sg.addColorStop(1, '#b8c0dc');
    c.fillStyle = sg;
    c.beginPath();
    c.ellipse(sx + 12, sy + 16, 7.5, 6.5, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ff6699';
    fillRRect(c, sx + 5, sy + 17, 14, 1.6, 0.8);
    c.fillStyle = '#ffd24a';
    fillStar(c, sx + 12, sy + 14.5, 2.2);
    /* Helmet neck ring */
    c.fillStyle = '#c4c8e0';
    c.beginPath();
    c.ellipse(sx + 12, sy + 12, 7.5, 2, 0, 0, Math.PI * 2);
    c.fill();

    /* Head */
    c.fillStyle = '#ff9944';
    c.beginPath();
    c.arc(sx + 12, sy + 6, 8, 0, Math.PI * 2);
    c.fill();

    /* Ears */
    c.fillStyle = '#ff8833';
    c.beginPath();
    c.moveTo(sx + 5, sy + 0); c.lineTo(sx + 3, sy - 6); c.lineTo(sx + 9, sy + 0);
    c.closePath(); c.fill();
    c.beginPath();
    c.moveTo(sx + 15, sy + 0); c.lineTo(sx + 21, sy - 6); c.lineTo(sx + 19, sy + 0);
    c.closePath(); c.fill();
    /* Inner ears */
    c.fillStyle = '#ffaacc';
    c.beginPath();
    c.moveTo(sx + 6, sy + 0); c.lineTo(sx + 5, sy - 3); c.lineTo(sx + 8, sy + 0);
    c.closePath(); c.fill();
    c.beginPath();
    c.moveTo(sx + 16, sy + 0); c.lineTo(sx + 19, sy - 3); c.lineTo(sx + 18, sy + 0);
    c.closePath(); c.fill();

    /* Horn – bezier cone with spiral stripe */
    c.fillStyle = '#ff6699';
    c.beginPath();
    c.moveTo(sx + 12, sy - 8);
    c.bezierCurveTo(sx + 10, sy - 4, sx + 9, sy - 2, sx + 10, sy - 1);
    c.lineTo(sx + 14, sy - 1);
    c.bezierCurveTo(sx + 15, sy - 2, sx + 14, sy - 4, sx + 12, sy - 8);
    c.closePath();
    c.fill();
    c.strokeStyle = '#ffcc55';
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(sx + 11.5, sy - 5); c.lineTo(sx + 12.5, sy - 4);
    c.moveTo(sx + 11, sy - 3); c.lineTo(sx + 13, sy - 2);
    c.stroke();

    /* Eyes */
    c.fillStyle = '#000000';
    c.beginPath(); c.arc(sx + 9, sy + 5, 2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 15, sy + 5, 2, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(sx + 9, sy + 4, 0.8, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 15, sy + 4, 0.8, 0, Math.PI * 2); c.fill();

    /* Mouth – smile arc */
    c.strokeStyle = '#cc5566';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(sx + 12, sy + 7, 3, 0.2, Math.PI - 0.2);
    c.stroke();

    /* Whiskers */
    c.strokeStyle = '#cc7722';
    c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(sx + 5, sy + 6); c.lineTo(sx - 1, sy + 5);
    c.moveTo(sx + 5, sy + 8); c.lineTo(sx - 1, sy + 9);
    c.moveTo(sx + 19, sy + 6); c.lineTo(sx + 25, sy + 5);
    c.moveTo(sx + 19, sy + 8); c.lineTo(sx + 25, sy + 9);
    c.stroke();

    /* Bubble helmet over her head, horn and all */
    drawBubbleHelmet(c, sx + 12, sy + 2.5, 12.5);

    c.restore();
  };

  /* ========== BOB (NPC - Explorer Spaceship) ========== */
  function Bob(x, y) {
    this.x = x;
    this.y = y;
    this.w = 60;
    this.h = 32;
    this.spawnX = x;
    this.spawnY = y;
    this.timer = 0;
    this.talking = false;
    this.talkTimer = 0;
    this.currentText = '';
  }

  Bob.prototype.update = function () {
    this.timer++;
    this.x = this.spawnX + Math.sin(this.timer * 0.01) * 20;
    this.y = this.spawnY + Math.cos(this.timer * 0.015) * 10;
    if (this.talking) {
      this.talkTimer--;
      if (this.talkTimer <= 0) this.talking = false;
    }
  };

  Bob.prototype.interact = function () {
    this.talking = true;
    this.talkTimer = 540;
    this.currentText = Game.i18n.t('bobGreet') + '\n' + Game.i18n.getFact();
  };

  Bob.prototype.draw = function (c, camX, camY) {
    var sx = Math.round(this.x - camX);
    var sy = Math.round(this.y - camY);

    var t = this.timer;

    c.save();
    c.lineCap = 'round';

    /* Main thruster flame out of the stern */
    drawThrustFlame(c, sx + 60, sy + 18, 1, 0, 14, 4, t);

    /* Solar panel wing on a strut above the hull */
    c.strokeStyle = '#8a90b0'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(sx + 42, sy + 6); c.lineTo(sx + 42, sy - 1); c.stroke();
    c.fillStyle = '#2a4a9a';
    fillRRect(c, sx + 33, sy - 7, 18, 6, 1);
    c.strokeStyle = '#6a9aff'; c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(sx + 39, sy - 7); c.lineTo(sx + 39, sy - 1);
    c.moveTo(sx + 45, sy - 7); c.lineTo(sx + 45, sy - 1);
    c.moveTo(sx + 33, sy - 4); c.lineTo(sx + 51, sy - 4);
    c.stroke();

    /* Dish antenna with a blinking beacon */
    c.strokeStyle = '#8a90b0'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(sx + 22, sy + 6); c.lineTo(sx + 20, sy - 1); c.stroke();
    c.fillStyle = '#d8dcf0';
    c.beginPath();
    c.ellipse(sx + 19, sy - 3, 6, 2.6, -0.5, 0, Math.PI);
    c.fill();
    c.strokeStyle = '#8a90b0'; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(sx + 19, sy - 3); c.lineTo(sx + 16, sy - 8); c.stroke();
    var beacon = Math.sin(t * 0.12) > 0;
    c.fillStyle = beacon ? '#ff5a5a' : '#7a2a2a';
    c.beginPath(); c.arc(sx + 16, sy - 8.5, 1.4, 0, Math.PI * 2); c.fill();
    if (beacon) {
      c.fillStyle = 'rgba(255, 90, 90, 0.3)';
      c.beginPath(); c.arc(sx + 16, sy - 8.5, 3.5, 0, Math.PI * 2); c.fill();
    }

    /* Tail fins (behind the hull) */
    c.fillStyle = '#e8504a';
    c.beginPath();
    c.moveTo(sx + 44, sy + 8); c.lineTo(sx + 56, sy + 1); c.lineTo(sx + 56, sy + 10); c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(sx + 44, sy + 28); c.lineTo(sx + 56, sy + 35); c.lineTo(sx + 56, sy + 26); c.closePath();
    c.fill();

    /* Engine nozzle */
    c.fillStyle = '#6a7090';
    c.beginPath();
    c.moveTo(sx + 52, sy + 12); c.lineTo(sx + 61, sy + 10);
    c.lineTo(sx + 61, sy + 26); c.lineTo(sx + 52, sy + 24);
    c.closePath(); c.fill();

    /* Hull: a white capsule with a pointed nose, lit from above */
    var hg = c.createLinearGradient(0, sy + 4, 0, sy + 32);
    hg.addColorStop(0, '#ffffff'); hg.addColorStop(1, '#a8b0d0');
    c.fillStyle = hg;
    c.beginPath();
    c.moveTo(sx + 14, sy + 5);
    c.lineTo(sx + 50, sy + 5);
    c.quadraticCurveTo(sx + 56, sy + 5, sx + 56, sy + 11);
    c.lineTo(sx + 56, sy + 25);
    c.quadraticCurveTo(sx + 56, sy + 31, sx + 50, sy + 31);
    c.lineTo(sx + 14, sy + 31);
    c.quadraticCurveTo(sx - 2, sy + 28, sx - 2, sy + 18);
    c.quadraticCurveTo(sx - 2, sy + 8, sx + 14, sy + 5);
    c.closePath();
    c.fill();

    /* Red nose cap */
    c.save();
    c.clip();
    c.fillStyle = '#e8504a';
    c.fillRect(sx - 2, sy + 4, 9, 28);
    /* Yellow mission stripe (Bob's colours) */
    c.fillStyle = '#ffcc33';
    c.fillRect(sx, sy + 23, 56, 3);
    c.restore();

    /* Portholes */
    var ports = [17, 30, 43];
    for (var pi = 0; pi < ports.length; pi++) {
      c.fillStyle = '#88ddff';
      c.beginPath(); c.arc(sx + ports[pi], sy + 15, 4.6, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#7a84a8';
      c.lineWidth = 1.5;
      c.stroke();
      c.fillStyle = 'rgba(255, 255, 255, 0.7)';
      c.beginPath(); c.arc(sx + ports[pi] - 1.6, sy + 13.4, 1.1, 0, Math.PI * 2); c.fill();
    }

    /* Bob waving from the middle porthole */
    c.fillStyle = '#ffddbb';
    c.beginPath(); c.arc(sx + 30, sy + 15.5, 3, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#333';
    c.beginPath(); c.arc(sx + 29, sy + 14.8, 0.8, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 31.5, sy + 14.8, 0.8, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#a05a4a'; c.lineWidth = 0.6;
    c.beginPath(); c.arc(sx + 30.2, sy + 16.2, 1.3, 0.2, Math.PI - 0.2); c.stroke();

    c.restore();
  };

  /* ========== WOLFE (NPC - Dog on Beach) ========== */
  function Wolfe(x, y, patrolWidth) {
    this.x = x;
    this.y = y;
    this.w = 30;
    this.h = 22;
    this.patrolX = x;
    this.patrolWidth = patrolWidth || 400;
    this.dir = 1;
    this.speed = 2;
    this.timer = 0;
    this.legPhase = 0;
  }

  Wolfe.prototype.update = function () {
    this.timer++;
    this.legPhase += 0.15;
    this.x += this.speed * this.dir;
    if (this.x > this.patrolX + this.patrolWidth) this.dir = -1;
    if (this.x < this.patrolX) this.dir = 1;
  };

  Wolfe.prototype.draw = function (c, camX, camY) {
    var sx = Math.round(this.x - camX);
    var sy = Math.round(this.y - camY);
    var legOff = Math.sin(this.legPhase) * 4;

    c.save();
    if (this.dir === -1) {
      c.translate(sx + this.w / 2, 0);
      c.scale(-1, 1);
      sx = -this.w / 2;
    }

    /* Body */
    c.fillStyle = '#cc9933';
    c.beginPath();
    c.ellipse(sx + 15, sy + 10, 14, 8, 0, 0, Math.PI * 2);
    c.fill();

    /* Head */
    c.fillStyle = '#cc9933';
    c.beginPath();
    c.arc(sx + 4, sy + 5, 7, 0, Math.PI * 2);
    c.fill();

    /* Ear */
    c.fillStyle = '#aa7722';
    c.beginPath();
    c.moveTo(sx + 0, sy + 0);
    c.quadraticCurveTo(sx - 2, sy - 4, sx - 3, sy - 5);
    c.quadraticCurveTo(sx + 1, sy - 2, sx + 4, sy + 0);
    c.closePath();
    c.fill();

    /* Eye */
    c.fillStyle = '#333';
    c.beginPath(); c.arc(sx + 3, sy + 4, 1.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(sx + 3, sy + 3.5, 0.5, 0, Math.PI * 2); c.fill();

    /* Nose */
    c.fillStyle = '#333';
    c.beginPath(); c.arc(sx - 1, sy + 6, 1.5, 0, Math.PI * 2); c.fill();

    /* Tongue (panting) – rounded end */
    if (Math.sin(this.timer * 0.1) > 0) {
      c.fillStyle = '#ff8899';
      c.beginPath();
      c.moveTo(sx - 1, sy + 7);
      c.lineTo(sx + 2, sy + 7);
      c.quadraticCurveTo(sx + 2, sy + 11, sx + 0.5, sy + 11);
      c.quadraticCurveTo(sx - 1, sy + 11, sx - 1, sy + 7);
      c.closePath();
      c.fill();
    }

    /* Legs – tapered with rounded paws */
    c.fillStyle = '#cc9933';
    var legs = [
      { x: sx + 6, off: legOff },
      { x: sx + 12, off: -legOff },
      { x: sx + 20, off: -legOff },
      { x: sx + 26, off: legOff }
    ];
    for (var li = 0; li < legs.length; li++) {
      var lg = legs[li];
      c.beginPath();
      c.moveTo(lg.x, sy + 16);
      c.lineTo(lg.x + 4, sy + 16);
      c.lineTo(lg.x + 3.5, sy + 21 + lg.off);
      c.quadraticCurveTo(lg.x + 2, sy + 23 + lg.off, lg.x + 0.5, sy + 21 + lg.off);
      c.closePath();
      c.fill();
    }

    /* Tail */
    c.fillStyle = '#cc9933';
    var tailWag = Math.sin(this.timer * 0.15) * 5;
    c.beginPath();
    c.moveTo(sx + 28, sy + 6);
    c.quadraticCurveTo(sx + 34, sy + 2 + tailWag, sx + 32, sy - 2 + tailWag);
    c.lineTo(sx + 30, sy + 0 + tailWag);
    c.quadraticCurveTo(sx + 31, sy + 4, sx + 28, sy + 8);
    c.closePath();
    c.fill();

    /* Collar – curved */
    c.strokeStyle = '#cc3333';
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(sx + 4, sy + 9, 6, 0.2, Math.PI - 0.2);
    c.stroke();

    c.restore();
  };

  /* ========== ASTRO PUP (NPC – friendly joke-teller; the type is
     still called `crab`) ==========
     A pet-dog pup in a glass space helmet, trotting a short patrol.
     Each one takes the next coat in ASTRO_PUP_COATS. */
  var ASTRO_PUP_COATS = ['gold', 'husky', 'star', 'blue', 'red', 'fluffy'];
  var astroPupCount = 0;
  function Crab(x, y) {
    this.coat = ASTRO_PUP_COATS[astroPupCount++ % ASTRO_PUP_COATS.length];
    this.x = x;
    this.y = y;
    this.w = 22;
    this.h = 14;
    this.spawnX = x;
    this.spawnY = y;
    this.timer = Math.random() * 100;
    this.dir = Math.random() > 0.5 ? 1 : -1;
    this.petT = 0;
    this.talking = false;
    this.talkTimer = 0;
    this.currentJoke = '';
  }

  Crab.prototype.update = function () {
    this.timer++;
    this.petT += this.talking ? 0.45 : 0.9;
    /* Trot along a short patrol, turning round at each end. */
    var range = 36;
    var off = this.x - this.spawnX;
    if (off > range) this.dir = -1;
    else if (off < -range) this.dir = 1;
    if (!this.talking) this.x += 0.3 * this.dir;
    /* Tiny low-gravity bob */
    this.y = this.spawnY + Math.sin(this.timer * 0.06) * 0.6;
    if (this.talking) {
      this.talkTimer--;
      if (this.talkTimer <= 0) this.talking = false;
    }
  };

  Crab.prototype.interact = function () {
    this.talking = true;
    this.talkTimer = 540;
    this.currentJoke = Game.i18n.getCrabJoke();
  };

  Crab.prototype.draw = function (c, camX, camY) {
    var sx = Math.round(this.x - camX);
    var sy = Math.round(this.y - camY);
    /* The pup painter faces left; flip the canvas when trotting right
       and tell it so, keeping the light on the upper left. */
    var mirror = this.dir === 1;
    var px = sx + this.w / 2, py = sy + 8.5;

    c.save();
    if (mirror) {
      c.translate(px, 0);
      c.scale(-1, 1);
      px = 0;
    }
    drawCrabPet(c, px, py, this.coat, this.petT, mirror);
    /* Glass space helmet round the head and muzzle */
    drawBubbleHelmet(c, px - 8.0, py - 4.3, 8.2);
    c.restore();
  };

  /* ========== HEART PICKUP ========== */
  function HeartPickup(x, y) {
    this.x = x;
    this.y = y;
    this.w = 16;
    this.h = 16;
    this.spawnY = y;
    this.timer = 0;
    this.active = true;
  }

  HeartPickup.prototype.update = function () {
    this.timer++;
    this.y = this.spawnY + Math.sin(this.timer * 0.05) * 6;
  };

  /* Re-themed as StarGem — a cut gem with a twinkle core. */
  HeartPickup.prototype.draw = function (c, camX, camY) {
    if (!this.active) return;
    var sx = this.x - camX + 8;
    var sy = this.y - camY + 8;
    var pulse = 1 + Math.sin(this.timer * 0.08) * 0.15;
    var spin = Math.sin(this.timer * 0.04) * 0.3;

    c.save();
    c.translate(sx, sy);
    c.rotate(spin);
    c.scale(pulse, pulse);
    /* Gem body — diamond facets */
    c.fillStyle = '#ff66cc';
    c.beginPath();
    c.moveTo(0, -7);
    c.lineTo(6, -2);
    c.lineTo(4, 7);
    c.lineTo(-4, 7);
    c.lineTo(-6, -2);
    c.closePath();
    c.fill();
    /* Facet highlight */
    c.fillStyle = '#ffaae0';
    c.beginPath();
    c.moveTo(0, -7);
    c.lineTo(6, -2);
    c.lineTo(0, 0);
    c.closePath();
    c.fill();
    /* Bright sparkle center */
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(-1, -3, 1.3, 0, Math.PI * 2);
    c.fill();
    /* Outer glow */
    c.globalAlpha = 0.45;
    c.strokeStyle = '#ff99dd';
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(0, -11);
    c.lineTo(0, 11);
    c.moveTo(-9, 0);
    c.lineTo(9, 0);
    c.stroke();
    c.restore();
  };

  /* ========== PARTICLE ========== */
  function Particle(x, y, vx, vy, color, life, size) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.life = life || 30;
    this.maxLife = this.life;
    this.size = size || 3;
    this.active = true;
  }

  Particle.prototype.update = function () {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.02;
    this.vx *= 0.98;
    this.life--;
    if (this.life <= 0) this.active = false;
  };

  Particle.prototype.draw = function (c, camX, camY) {
    if (!this.active) return;
    var alpha = this.life / this.maxLife;
    c.save();
    c.globalAlpha = alpha;
    c.fillStyle = this.color;
    var s = this.size * alpha;
    c.beginPath();
    c.arc(this.x - camX, this.y - camY, s / 2, 0, Math.PI * 2);
    c.fill();
    c.restore();
  };

  /* Spawn a burst of particles */
  function spawnBurst(x, y, count, colors) {
    var particles = [];
    for (var i = 0; i < count; i++) {
      var angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      var speed = 1 + Math.random() * 2;
      var color = colors[Math.floor(Math.random() * colors.length)];
      particles.push(new Particle(
        x, y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        color, 30 + Math.random() * 20, 2 + Math.random() * 3
      ));
    }
    return particles;
  }

  /* ========== AMBIENT BUBBLE ========== */
  function AmbientBubble(x, y, colors) {
    this.x = x;
    this.colors = colors || null;
    this.y = y;
    this.r = 1 + Math.random() * 3;
    this.speed = 0.3 + Math.random() * 0.5;
    this.wobbleSpeed = 0.01 + Math.random() * 0.03;
    this.wobbleAmp = 10 + Math.random() * 20;
    this.phase = Math.random() * Math.PI * 2;
    this.alpha = 0.2 + Math.random() * 0.3;
  }

  AmbientBubble.prototype.update = function (levelHeight) {
    this.phase += this.wobbleSpeed;
    this.y -= this.speed;
    if (this.y < -10) this.y = levelHeight + 10;
  };

  /* Re-themed as AmbientSparkle — cosmic dust drifting upward. A level
     can tint it with dustColors (the cheese moon's float up as golden
     crumbs). */
  var AMBIENT_COLORS = ['#ff99dd', '#ccddff'];
  AmbientBubble.prototype.draw = function (c, camX, camY) {
    var sx = this.x - camX + Math.sin(this.phase) * this.wobbleAmp;
    var sy = this.y - camY;
    c.save();
    c.globalAlpha = this.alpha * 0.85;
    var cols = this.colors || AMBIENT_COLORS;
    c.fillStyle = this.phase > Math.PI ? cols[0] : cols[1];
    c.beginPath();
    c.arc(sx, sy, this.r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ffffff';
    c.globalAlpha = this.alpha;
    c.beginPath();
    c.arc(sx, sy, this.r * 0.4, 0, Math.PI * 2);
    c.fill();
    c.restore();
  };

  /* ========== ROCKET SHIP (interactable — opens travel menu) ========== */
  /* Towering rocket — drawn at 8× the original 90×150 sprite (so 720×1200).
     The visual base stays anchored to the original spawn position so the
     player can still walk up to it; the top now towers off-screen into the
     sky. Internally the draw routine still uses the original 90×150 layout
     coordinates and a canvas transform handles the 8× scale. */
  function RocketShip(x, y) {
    this.x = x;
    this.y = y;
    this.w = 720;
    this.h = 1200;
    this.talking = false;
    this.timer = 0;
  }

  RocketShip.prototype.update = function () {
    this.timer++;
  };

  RocketShip.prototype.interact = function () {
    /* engine.js reads keys.up/jp.up and calls onRocketInteract directly,
       so this stub just ensures the NPC loop doesn't freak out. */
  };

  RocketShip.prototype.draw = function (c, camX, camY) {
    /* Anchor in screen-space matches the original (pre-scale) top-left. */
    var ax = Math.round(this.x - camX);
    var ay = Math.round(this.y - camY);
    c.save();
    /* Translate so the visual base + horizontal center stay where they were
       on the original 90×150 sprite, then scale 8×. The shift is
       (-(8-1)*w/2, -(8-1)*h) = (-315, -1050) for w=90, h=150. */
    c.translate(ax - 315, ay - 1050);
    c.scale(8, 8);
    var sx = 0;
    var sy = 0;
    var cx = sx + 45; /* horizontal centerline */
    /* Outer drop shadow on the pad */
    c.save();
    c.fillStyle = '#0a0220';
    c.globalAlpha = 0.22;
    c.beginPath();
    c.ellipse(cx + 4, sy + 150, 62, 8, 0, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 0.4;
    c.beginPath();
    c.ellipse(cx + 2, sy + 150, 48, 5.5, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();

    /* Everything below is in sprite units, so a 0.35 line is ~3px on
       screen — a soft ink outline matching the rest of the town. */
    var INK = '#2a1450';
    c.lineJoin = 'round';
    c.lineWidth = 0.35;
    c.strokeStyle = INK;
    function tankGrad(x0, x1) {
      var g = c.createLinearGradient(sx + x0, sy, sx + x1, sy);
      /* Lit from the upper left: pale rim, bright band, violet shadow */
      g.addColorStop(0, '#b8c2d8');
      g.addColorStop(0.3, '#f4f7fc');
      g.addColorStop(0.6, '#b4b8d6');
      g.addColorStop(1, '#55527e');
      return g;
    }

    /* ----- Boosters (left & right strap-on tanks) ----- */
    /* Left booster */
    c.fillStyle = tankGrad(4, 16);
    c.beginPath();
    c.moveTo(sx + 8, sy + 60);
    c.lineTo(sx + 4, sy + 70);
    c.lineTo(sx + 4, sy + 130);
    c.lineTo(sx + 16, sy + 130);
    c.lineTo(sx + 16, sy + 60);
    c.closePath();
    c.fill();
    c.stroke();
    /* Right booster */
    c.fillStyle = tankGrad(74, 86);
    c.beginPath();
    c.moveTo(sx + 74, sy + 60);
    c.lineTo(sx + 74, sy + 130);
    c.lineTo(sx + 86, sy + 130);
    c.lineTo(sx + 86, sy + 70);
    c.lineTo(sx + 82, sy + 60);
    c.closePath();
    c.fill();
    c.stroke();
    /* Booster bands */
    c.fillStyle = '#ff66cc';
    c.fillRect(sx + 4, sy + 96, 12, 3);
    c.fillRect(sx + 74, sy + 96, 12, 3);
    c.strokeRect(sx + 4, sy + 96, 12, 3);
    c.strokeRect(sx + 74, sy + 96, 12, 3);
    /* Booster nose cones */
    c.fillStyle = '#ff66cc';
    c.beginPath();
    c.moveTo(sx + 4, sy + 70); c.quadraticCurveTo(sx + 5, sy + 56, sx + 10, sy + 50);
    c.quadraticCurveTo(sx + 15, sy + 56, sx + 16, sy + 70);
    c.closePath(); c.fill(); c.stroke();
    c.beginPath();
    c.moveTo(sx + 74, sy + 70); c.quadraticCurveTo(sx + 75, sy + 56, sx + 80, sy + 50);
    c.quadraticCurveTo(sx + 85, sy + 56, sx + 86, sy + 70);
    c.closePath(); c.fill(); c.stroke();
    /* Cone highlights */
    c.fillStyle = 'rgba(255, 255, 255, 0.35)';
    c.beginPath(); c.ellipse(sx + 8, sy + 61, 1.2, 5, 0.15, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(sx + 78, sy + 61, 1.2, 5, 0.15, 0, Math.PI * 2); c.fill();

    /* ----- Main body ----- */
    var mGrad = c.createLinearGradient(sx + 24, sy, sx + 66, sy);
    /* Cylinder lit from the upper left: a pale rim, the bright band a
       quarter of the way across, falling to a violet shadow side with a
       little pink bounce from the fin on the far edge */
    mGrad.addColorStop(0, '#c4cee2');
    mGrad.addColorStop(0.06, '#aab4cc');
    mGrad.addColorStop(0.27, '#ffffff');
    mGrad.addColorStop(0.5, '#dfe3f2');
    mGrad.addColorStop(0.8, '#8a8cbc');
    mGrad.addColorStop(0.95, '#5c5a90');
    mGrad.addColorStop(1, '#8a6aa8');
    c.fillStyle = mGrad;
    c.beginPath();
    c.moveTo(cx, sy + 0);                 /* tip */
    c.quadraticCurveTo(sx + 64, sy + 18, sx + 66, sy + 40);
    c.lineTo(sx + 66, sy + 130);
    c.lineTo(sx + 24, sy + 130);
    c.lineTo(sx + 24, sy + 40);
    c.quadraticCurveTo(sx + 26, sy + 18, cx, sy + 0);
    c.closePath();
    c.fill();
    c.stroke();
    /* Vertical panel seams (the cockpit window covers their middle) */
    c.fillStyle = 'rgba(40, 30, 90, 0.22)';
    c.fillRect(sx + 38, sy + 41, 0.3, 89);
    c.fillRect(sx + 54, sy + 41, 0.3, 89);
    c.fillStyle = 'rgba(255, 255, 255, 0.5)';
    c.fillRect(sx + 38.3, sy + 41, 0.25, 89);
    /* Long specular streak down the lit side, fading at both ends */
    var spec = c.createLinearGradient(0, sy + 44, 0, sy + 128);
    spec.addColorStop(0, 'rgba(255, 255, 255, 0)');
    spec.addColorStop(0.15, 'rgba(255, 255, 255, 0.85)');
    spec.addColorStop(0.7, 'rgba(255, 255, 255, 0.5)');
    spec.addColorStop(1, 'rgba(255, 255, 255, 0)');
    c.fillStyle = spec;
    c.fillRect(sx + 31.5, sy + 44, 1.6, 84);
    /* Rim light along the sunward edge */
    c.fillStyle = 'rgba(255, 255, 255, 0.9)';
    c.fillRect(sx + 24.3, sy + 41, 0.6, 89);

    /* Nose cone — pink with stripes */
    var nGrad = c.createLinearGradient(sx + 24, sy, sx + 66, sy);
    nGrad.addColorStop(0, '#e84a8a');
    nGrad.addColorStop(0.28, '#ff9cc8');
    nGrad.addColorStop(0.6, '#e03c80');
    nGrad.addColorStop(1, '#8e1648');
    c.fillStyle = nGrad;
    c.beginPath();
    c.moveTo(cx, sy + 0);
    c.quadraticCurveTo(sx + 64, sy + 18, sx + 66, sy + 40);
    c.lineTo(sx + 24, sy + 40);
    c.quadraticCurveTo(sx + 26, sy + 18, cx, sy + 0);
    c.closePath();
    c.fill();
    c.stroke();
    /* Shadow the cone casts onto the hull below it */
    var coneAO = c.createLinearGradient(0, sy + 40, 0, sy + 50);
    coneAO.addColorStop(0, 'rgba(40, 30, 90, 0.38)');
    coneAO.addColorStop(1, 'rgba(40, 30, 90, 0)');
    c.fillStyle = coneAO;
    c.fillRect(sx + 24.2, sy + 40.2, 41.6, 10);
    /* Glint on the lit shoulder of the cone */
    c.fillStyle = 'rgba(255, 255, 255, 0.45)';
    c.beginPath(); c.ellipse(sx + 35, sy + 19, 1.6, 9, 0.42, 0, Math.PI * 2); c.fill();
    /* Cone stripe */
    c.fillStyle = '#ffd24a';
    c.beginPath();
    c.moveTo(sx + 30, sy + 26);
    c.lineTo(sx + 60, sy + 26);
    c.lineTo(sx + 58, sy + 32);
    c.lineTo(sx + 32, sy + 32);
    c.closePath();
    c.fill();
    /* Tip beacon */
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(cx, sy + 4, 3, 0, Math.PI * 2); c.fill();
    var beacon = (Math.sin(this.timer * 0.18) + 1) * 0.5;
    c.globalAlpha = 0.6 + beacon * 0.4;
    c.fillStyle = '#ff4466';
    c.beginPath(); c.arc(cx, sy + 4, 2, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;

    /* Body horizontal bands (riveted plates) */
    var bandYs = [55, 80, 105];
    for (var ib = 0; ib < bandYs.length; ib++) {
      /* Recessed seam: dark groove with a lit lip under it */
      c.fillStyle = 'rgba(40, 30, 90, 0.32)';
      c.fillRect(sx + 24.2, sy + bandYs[ib] - 0.35, 41.6, 0.7);
      c.fillStyle = 'rgba(255, 255, 255, 0.55)';
      c.fillRect(sx + 24.2, sy + bandYs[ib] + 0.35, 30, 0.3);
    }
    /* Rivets */
    c.fillStyle = '#7a8896';
    for (var ir = 0; ir < bandYs.length; ir++) {
      for (var jr = 0; jr < 5; jr++) {
        c.beginPath();
        c.arc(sx + 28 + jr * 9, sy + bandYs[ir], 0.7, 0, Math.PI * 2);
        c.fill();
      }
    }

    /* Big circular cockpit window */
    c.fillStyle = '#001a33';
    c.beginPath(); c.arc(cx, sy + 64, 14, 0, Math.PI * 2); c.fill();
    var glass = c.createRadialGradient(cx - 4, sy + 59, 1, cx, sy + 64, 12);
    glass.addColorStop(0, '#c8f6ff');
    glass.addColorStop(0.45, '#44ccff');
    glass.addColorStop(1, '#1670c0');
    c.fillStyle = glass;
    c.beginPath(); c.arc(cx, sy + 64, 11, 0, Math.PI * 2); c.fill();
    /* Bezel: lit on the sunward arc, in shadow on the far one */
    c.lineWidth = 0.9;
    c.strokeStyle = 'rgba(190, 220, 255, 0.85)';
    c.beginPath(); c.arc(cx, sy + 64, 12.6, Math.PI * 0.85, Math.PI * 1.6); c.stroke();
    c.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    c.beginPath(); c.arc(cx, sy + 64, 12.6, Math.PI * 1.9, Math.PI * 2.6); c.stroke();
    /* Window cross frame */
    c.strokeStyle = '#001a33';
    c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(cx - 11, sy + 64); c.lineTo(cx + 11, sy + 64); c.stroke();
    c.beginPath(); c.moveTo(cx, sy + 53); c.lineTo(cx, sy + 75); c.stroke();
    /* Reflection */
    c.fillStyle = '#ffffff';
    c.globalAlpha = 0.85;
    c.beginPath(); c.ellipse(cx - 5, sy + 59.5, 1.8, 4.6, 0.7, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 0.6;
    c.beginPath(); c.arc(cx + 5, sy + 68, 1.6, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;

    /* Smaller portholes below the cockpit */
    for (var ph = 0; ph < 3; ph++) {
      var phy = sy + 92 + ph * 12;
      c.fillStyle = '#001a33';
      c.beginPath(); c.arc(cx, phy, 4, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#44ccff';
      c.beginPath(); c.arc(cx, phy, 3, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255, 255, 255, 0.8)';
      c.beginPath(); c.arc(cx - 1, phy - 1, 0.8, 0, Math.PI * 2); c.fill();
    }

    /* "MOMOKO" mission badge below the window */
    c.fillStyle = '#ffd24a';
    c.fillRect(sx + 32, sy + 84, 26, 4);
    c.fillStyle = '#ff66cc';
    c.font = 'bold 4.5px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'center';
    c.fillText('MOMOKO', cx, sy + 87.5);

    /* Side antennae sweeping out */
    c.strokeStyle = '#ddddee';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(sx + 24, sy + 50);
    c.lineTo(sx + 14, sy + 36);
    c.stroke();
    c.beginPath();
    c.moveTo(sx + 66, sy + 50);
    c.lineTo(sx + 76, sy + 36);
    c.stroke();
    c.fillStyle = '#44ffff';
    c.beginPath(); c.arc(sx + 14, sy + 36, 1.6, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 76, sy + 36, 1.6, 0, Math.PI * 2); c.fill();

    /* Big fins at the base */
    c.strokeStyle = INK;
    c.lineWidth = 0.35;
    /* Sunward fin bright, far fin in shadow */
    var finL = c.createLinearGradient(sx + 6, sy + 110, sx + 24, sy + 144);
    finL.addColorStop(0, '#ff9ae0');
    finL.addColorStop(1, '#f050b8');
    c.fillStyle = finL;
    c.beginPath();
    c.moveTo(sx + 24, sy + 110);
    c.quadraticCurveTo(sx + 8, sy + 128, sx + 6, sy + 144);
    c.lineTo(sx + 24, sy + 144);
    c.closePath();
    c.fill();
    c.stroke();
    var finR = c.createLinearGradient(sx + 66, sy + 110, sx + 84, sy + 144);
    finR.addColorStop(0, '#e04cae');
    finR.addColorStop(1, '#8e2478');
    c.fillStyle = finR;
    c.beginPath();
    c.moveTo(sx + 66, sy + 110);
    c.quadraticCurveTo(sx + 82, sy + 128, sx + 84, sy + 144);
    c.lineTo(sx + 66, sy + 144);
    c.closePath();
    c.fill();
    c.stroke();
    /* Fin highlights */
    c.fillStyle = '#ffc0ec';
    c.beginPath();
    c.moveTo(sx + 24, sy + 116);
    c.lineTo(sx + 14, sy + 140);
    c.lineTo(sx + 22, sy + 140);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(255, 153, 221, 0.4)';
    c.beginPath();
    c.moveTo(sx + 66, sy + 116);
    c.lineTo(sx + 76, sy + 140);
    c.lineTo(sx + 68, sy + 140);
    c.closePath();
    c.fill();

    /* ----- Triple thrusters at the very base ----- */
    function nozzle(nx, ny, nw, nh) {
      var g = c.createLinearGradient(nx - nw / 2, 0, nx + nw / 2, 0);
      g.addColorStop(0, '#2c2c3c');
      g.addColorStop(0.4, '#7a7a90');
      g.addColorStop(1, '#25253a');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(nx - nw * 0.3, ny);
      c.lineTo(nx + nw * 0.3, ny);
      c.quadraticCurveTo(nx + nw * 0.35, ny + nh * 0.6, nx + nw / 2, ny + nh);
      c.lineTo(nx - nw / 2, ny + nh);
      c.quadraticCurveTo(nx - nw * 0.35, ny + nh * 0.6, nx - nw * 0.3, ny);
      c.closePath();
      c.fill();
      c.stroke();
    }
    nozzle(sx + 32, sy + 130, 9, 20);
    nozzle(sx + 45, sy + 130, 10, 20);
    nozzle(sx + 58, sy + 130, 9, 20);
    /* Booster thrusters */
    nozzle(sx + 10, sy + 130, 9, 14);
    nozzle(sx + 80, sy + 130, 9, 14);

    /* Exhaust flicker — animated yellow/red puffs from each thruster */
    var flick = Math.sin(this.timer * 0.3) * 2 + 4;
    var flick2 = Math.cos(this.timer * 0.27) * 2 + 4;
    function plume(thx, thy, sz, alt) {
      /* Hot core fading out through yellow and orange */
      var pg = c.createRadialGradient(thx, thy + sz * 0.6, 0, thx, thy + sz, sz * 1.7);
      pg.addColorStop(0, 'rgba(255, 255, 240, 1)');
      pg.addColorStop(0.3, 'rgba(255, 226, 110, 0.95)');
      pg.addColorStop(0.6, 'rgba(255, 130, 60, 0.55)');
      pg.addColorStop(1, 'rgba(255, 80, 80, 0)');
      c.fillStyle = pg;
      c.beginPath(); c.arc(thx, thy + sz, sz * 1.7, 0, Math.PI * 2); c.fill();
    }
    plume(sx + 32, sy + 150, flick * 0.7);
    plume(sx + 45, sy + 150, flick);
    plume(sx + 58, sy + 150, flick2 * 0.7);
    plume(sx + 10, sy + 144, flick2 * 0.6);
    plume(sx + 80, sy + 144, flick * 0.6);
    c.restore();
  };

  /* ========== HOUSE DOOR (interactable — enters house interior) ========== */
  function HouseDoor(x, y, houseId, painted) {
    this.x = x;
    this.y = y;
    this.w = 48;
    this.h = 52;
    this.houseId = houseId || 'heroHome';
    /* The moon village's buildings paint their own doors; their entry
       zone only adds the warm glow and bobbing heart cue ('shop' fronts
       also get the OPEN tag). */
    this.painted = painted || null;
    this.talking = false;
    this.timer = 0;
  }

  HouseDoor.prototype.update = function () { this.timer++; };
  HouseDoor.prototype.interact = function () { /* handled by engine */ };

  HouseDoor.prototype.draw = function (c, camX, camY) {
    var sx = Math.round(this.x - camX);
    var sy = Math.round(this.y - camY);
    if (this.painted) { CafeDoor.prototype.drawCue.call(this, c, sx, sy, this.painted === 'shop'); return; }
    /* Door step */
    c.fillStyle = '#4a3a5e';
    c.fillRect(sx - 4, sy + 50, 56, 4);
    c.fillStyle = '#7a6a92';
    c.fillRect(sx - 4, sy + 50, 56, 1.5);
    /* Frame and lintel */
    c.fillStyle = '#3a2412';
    c.fillRect(sx, sy, 48, 52);
    c.fillStyle = '#5a3a22';
    c.fillRect(sx - 3, sy - 4, 54, 6);
    c.fillStyle = '#7a5232';
    c.fillRect(sx - 3, sy - 4, 54, 1.5);
    /* Door panel — lit from the porch lamp above */
    var dg = c.createLinearGradient(0, sy, 0, sy + 50);
    dg.addColorStop(0, '#a07040');
    dg.addColorStop(1, '#774a28');
    c.fillStyle = dg;
    c.fillRect(sx + 4, sy + 4, 40, 46);
    /* Raised panels */
    c.strokeStyle = '#5a3a22';
    c.lineWidth = 1.2;
    c.strokeRect(sx + 8.5, sy + 8.5, 13, 15);
    c.strokeRect(sx + 26.5, sy + 8.5, 13, 15);
    c.strokeRect(sx + 8.5, sy + 28.5, 13, 17);
    c.strokeRect(sx + 26.5, sy + 28.5, 13, 17);
    c.strokeStyle = 'rgba(255, 226, 170, 0.28)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(sx + 9.5, sy + 23); c.lineTo(sx + 9.5, sy + 9.5); c.lineTo(sx + 21, sy + 9.5);
    c.moveTo(sx + 27.5, sy + 23); c.lineTo(sx + 27.5, sy + 9.5); c.lineTo(sx + 39, sy + 9.5);
    c.stroke();
    /* Handle */
    c.fillStyle = '#ffd24a';
    c.beginPath();
    c.arc(sx + 38, sy + 28, 2.6, 0, Math.PI * 2);
    c.fill();
    /* Porch lamp: warm glow over the lintel so the entrance reads at 1x */
    var flick = 0.85 + Math.sin(this.timer * 0.05) * 0.08;
    c.save();
    var lg = c.createRadialGradient(sx + 24, sy - 6, 2, sx + 24, sy - 6, 34);
    lg.addColorStop(0, 'rgba(255, 220, 140, ' + (0.45 * flick) + ')');
    lg.addColorStop(1, 'rgba(255, 220, 140, 0)');
    c.fillStyle = lg;
    c.fillRect(sx - 12, sy - 40, 72, 60);
    c.restore();
    c.fillStyle = '#3a3a4a';
    c.fillRect(sx + 20, sy - 14, 8, 3);
    c.fillStyle = '#ffe9a0';
    c.beginPath(); c.arc(sx + 24, sy - 9, 2.6, 0, Math.PI * 2); c.fill();
    /* Welcome heart sign above */
    c.fillStyle = '#ff66cc';
    var hcx = sx + 24, hcy = sy - 20;
    c.beginPath();
    c.arc(hcx - 2, hcy - 1, 2, 0, Math.PI * 2);
    c.arc(hcx + 2, hcy - 1, 2, 0, Math.PI * 2);
    c.moveTo(hcx - 3.6, hcy);
    c.lineTo(hcx, hcy + 3.5);
    c.lineTo(hcx + 3.6, hcy);
    c.closePath();
    c.fill();
  };

  /* ========== CAFE DOOR (interactable — opens the comfy cafe cutscene) ==========
     The Cosmic Café storefront is drawn by the cafeBuilding decoration; this
     entity is a small clickable zone in front of the painted door so the
     engine can detect player proximity and trigger the cutscene. We draw a
     soft glow + bobbing heart prompt over the painted door so the player
     can tell it's interactive. */
  function CafeDoor(x, y) {
    this.x = x;
    this.y = y;
    this.w = 48;
    this.h = 52;
    this.talking = false;
    this.timer = 0;
  }

  CafeDoor.prototype.update = function () { this.timer++; };
  CafeDoor.prototype.interact = function () { /* handled by engine */ };

  CafeDoor.prototype.draw = function (c, camX, camY) {
    this.drawCue(c, Math.round(this.x - camX), Math.round(this.y - camY), true);
  };

  /* Glow + bobbing heart over a painted door (and the OPEN tag on shop
     fronts). Shared with HouseDoor's painted variant. */
  CafeDoor.prototype.drawCue = function (c, sx, sy, openTag) {
    /* Soft warm glow at the doorway (subtle, since the building art owns
       the door visuals). */
    c.save();
    c.globalAlpha = 0.4 + Math.sin(this.timer * 0.06) * 0.1;
    var glow = c.createRadialGradient(sx + 24, sy + 30, 4, sx + 24, sy + 30, 36);
    glow.addColorStop(0, 'rgba(255,210,138,0.75)');
    glow.addColorStop(1, 'rgba(255,210,138,0)');
    c.fillStyle = glow;
    c.beginPath(); c.arc(sx + 24, sy + 30, 36, 0, Math.PI * 2); c.fill();
    c.restore();
    /* Bobbing heart prompt above */
    var bob = Math.sin(this.timer * 0.08) * 2;
    c.fillStyle = '#ff66cc';
    var hcx = sx + 24, hcy = sy - 12 + bob;
    c.beginPath();
    c.arc(hcx - 2.4, hcy - 1, 2.4, 0, Math.PI * 2);
    c.arc(hcx + 2.4, hcy - 1, 2.4, 0, Math.PI * 2);
    c.moveTo(hcx - 4.4, hcy);
    c.lineTo(hcx, hcy + 4.4);
    c.lineTo(hcx + 4.4, hcy);
    c.closePath();
    c.fill();
    if (!openTag) return;
    /* Tiny "OPEN" tag */
    c.fillStyle = '#ffd24a';
    c.font = 'bold 8px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'center';
    c.fillText('OPEN', sx + 24, sy - 22 + bob * 0.5);
    c.textAlign = 'left';
  };

  /* ========== SHOP DOOR (Star Bazaar — opens the shop interior) ==========
     Same pattern as CafeDoor: invisible-but-cued zone in front of the
     painted shop double-doors. */
  function ShopDoor(x, y) {
    this.x = x;
    this.y = y;
    this.w = 48;
    this.h = 52;
    this.talking = false;
    this.timer = 0;
  }
  ShopDoor.prototype.update = function () { this.timer++; };
  ShopDoor.prototype.interact = function () { /* handled by engine */ };
  ShopDoor.prototype.draw = function (c, camX, camY) {
    var sx = Math.round(this.x - camX);
    var sy = Math.round(this.y - camY);
    /* Soft warm glow at the doorway */
    c.save();
    c.globalAlpha = 0.4 + Math.sin(this.timer * 0.06) * 0.1;
    var glow = c.createRadialGradient(sx + 24, sy + 30, 4, sx + 24, sy + 30, 36);
    glow.addColorStop(0, 'rgba(255,232,140,0.75)');
    glow.addColorStop(1, 'rgba(255,232,140,0)');
    c.fillStyle = glow;
    c.beginPath(); c.arc(sx + 24, sy + 30, 36, 0, Math.PI * 2); c.fill();
    c.restore();
    /* Bobbing star prompt above */
    var bob = Math.sin(this.timer * 0.08) * 2;
    c.fillStyle = '#ffd24a';
    var hcx = sx + 24, hcy = sy - 12 + bob;
    c.beginPath();
    c.moveTo(hcx, hcy - 4);
    c.lineTo(hcx + 1.4, hcy - 1.2);
    c.lineTo(hcx + 4.4, hcy - 0.8);
    c.lineTo(hcx + 2, hcy + 1.2);
    c.lineTo(hcx + 3, hcy + 4);
    c.lineTo(hcx, hcy + 2.4);
    c.lineTo(hcx - 3, hcy + 4);
    c.lineTo(hcx - 2, hcy + 1.2);
    c.lineTo(hcx - 4.4, hcy - 0.8);
    c.lineTo(hcx - 1.4, hcy - 1.2);
    c.closePath();
    c.fill();
    /* Tiny "SHOP" tag */
    c.fillStyle = '#44ffff';
    c.font = 'bold 8px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'center';
    c.fillText('SHOP', sx + 24, sy - 22 + bob * 0.5);
    c.textAlign = 'left';
  };

  /* ========== LILA (friendly neighbor NPC) ========== */
  function Lila(x, y) {
    this.x = x;
    this.y = y;
    this.w = 26;
    this.h = 34;
    this.timer = 0;
    this.talking = false;
    this.talkTimer = 0;
    this.currentText = '';
  }

  Lila.prototype.update = function () {
    this.timer++;
    if (this.talkTimer > 0) {
      this.talkTimer--;
      if (this.talkTimer <= 0) this.talking = false;
    }
  };

  Lila.prototype.interact = function () {
    this.talking = true;
    this.talkTimer = 280;
    /* Pick text based on quest state */
    var q = Game.quests && Game.quests.lila;
    if (q === 'done') {
      this.currentText = Game.i18n.t('lilaThanks');
    } else {
      this.currentText = Game.i18n.t('lilaGreet');
    }
  };

  Lila.prototype.draw = function (c, camX, camY) {
    var sx = Math.round(this.x - camX);
    var sy = Math.round(this.y - camY);
    var bob = Math.sin(this.timer * 0.05) * 1;
    /* Body — space suit in teal */
    c.fillStyle = '#33aaaa';
    c.fillRect(sx + 6, sy + 14 + bob, 14, 16);
    /* Head */
    c.fillStyle = '#ffccaa';
    c.beginPath();
    c.arc(sx + 13, sy + 10 + bob, 7, 0, Math.PI * 2);
    c.fill();
    /* Hair — short bob, purple */
    c.fillStyle = '#8844cc';
    c.beginPath();
    c.arc(sx + 13, sy + 7 + bob, 7, Math.PI, Math.PI * 2);
    c.fill();
    c.fillRect(sx + 6, sy + 7 + bob, 14, 5);
    /* Eyes */
    c.fillStyle = '#000000';
    c.beginPath(); c.arc(sx + 10, sy + 10 + bob, 0.9, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 16, sy + 10 + bob, 0.9, 0, Math.PI * 2); c.fill();
    /* Smile */
    c.strokeStyle = '#993333';
    c.lineWidth = 0.8;
    c.beginPath();
    c.arc(sx + 13, sy + 12 + bob, 1.8, 0.1, Math.PI - 0.1);
    c.stroke();
    /* Helmet ring */
    c.strokeStyle = '#44ffff';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(sx + 13, sy + 10 + bob, 8.5, 0, Math.PI * 2);
    c.stroke();
    /* Legs */
    c.fillStyle = '#225577';
    c.fillRect(sx + 8, sy + 30 + bob, 4, 4);
    c.fillRect(sx + 14, sy + 30 + bob, 4, 4);
  };

  /* ========== MIGWORD (cheese-moon resident NPC) ========== */
  function MigWord(x, y) {
    this.x = x;
    this.y = y;
    this.w = 28;
    this.h = 34;
    this.timer = 0;
    this.talking = false;
    this.talkTimer = 0;
    this.currentText = '';
  }

  MigWord.prototype.update = function () {
    this.timer++;
    if (this.talkTimer > 0) {
      this.talkTimer--;
      if (this.talkTimer <= 0) this.talking = false;
    }
  };

  MigWord.prototype.interact = function () {
    this.talking = true;
    this.talkTimer = 300;
    var q = Game.quests && Game.quests.migword;
    if (q === 'done') {
      this.currentText = Game.i18n.t('migwordThanks');
    } else {
      this.currentText = Game.i18n.t('migwordGreet');
    }
  };

  MigWord.prototype.draw = function (c, camX, camY) {
    var sx = Math.round(this.x - camX);
    var sy = Math.round(this.y - camY);
    var bob = Math.sin(this.timer * 0.04) * 1.3;
    /* Round cheese-y body */
    c.fillStyle = '#ffcc66';
    c.beginPath();
    c.ellipse(sx + 14, sy + 20 + bob, 13, 12, 0, 0, Math.PI * 2);
    c.fill();
    /* Cheese holes */
    c.fillStyle = '#cc9933';
    c.beginPath(); c.arc(sx + 9, sy + 18 + bob, 1.5, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 18, sy + 22 + bob, 1.2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 14, sy + 26 + bob, 1, 0, Math.PI * 2); c.fill();
    /* Eyes */
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(sx + 10, sy + 15 + bob, 2.5, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 18, sy + 15 + bob, 2.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#000000';
    c.beginPath(); c.arc(sx + 10, sy + 15 + bob, 1.2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 18, sy + 15 + bob, 1.2, 0, Math.PI * 2); c.fill();
    /* Cheerful smile */
    c.strokeStyle = '#663300';
    c.lineWidth = 1.3;
    c.beginPath();
    c.arc(sx + 14, sy + 19 + bob, 3.5, 0.3, Math.PI - 0.3);
    c.stroke();
    /* Tiny antenna */
    c.strokeStyle = '#aa7700';
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(sx + 14, sy + 8 + bob);
    c.lineTo(sx + 14, sy + 4 + bob);
    c.stroke();
    c.fillStyle = '#44ffff';
    c.beginPath();
    c.arc(sx + 14, sy + 3.5 + bob, 1.3, 0, Math.PI * 2);
    c.fill();
  };

  /* ========== MOON MOUSE (greet-the-friend NPC for MigWord's quest) ========== */
  /* `mouseId` and `color` are passed in so each spawn is visually distinct
     and the engine can dedupe quest progress per-mouse. */
  function MoonMouse(x, y, mouseId, color) {
    this.x = x;
    this.y = y;
    this.w = 22;
    this.h = 18;
    this.spawnX = x;
    this.spawnY = y;
    this.mouseId = mouseId || 'pip';
    this.color = color || '#dddddd';
    this.timer = Math.random() * 100;
    this.talking = false;
    this.talkTimer = 0;
    this.currentText = '';
    this.greeted = false;
  }

  MoonMouse.prototype.update = function () {
    this.timer++;
    /* Tiny scurry — drift left/right around spawn */
    this.x = this.spawnX + Math.sin(this.timer * 0.04) * 12;
    if (this.talkTimer > 0) {
      this.talkTimer--;
      if (this.talkTimer <= 0) this.talking = false;
    }
  };

  MoonMouse.prototype.interact = function () {
    this.talking = true;
    this.talkTimer = 240;
    /* After hello, every visit gets a cheesy joke. */
    var key = this.greeted ? 'moonJoke' + (Math.floor(Math.random() * 6) + 1) : 'mouseGreet_' + this.mouseId;
    this.currentText = Game.i18n.t(key);
    /* Fall back to a generic line if the mouse-specific key isn't defined. */
    if (this.currentText === key) this.currentText = Game.i18n.t('mouseGreet');
    this.greeted = true;
    Game.audio.play('pickup');
  };

  MoonMouse.prototype.draw = function (c, camX, camY) {
    var sx = Math.round(this.x - camX);
    var sy = Math.round(this.y - camY);
    var bob = Math.sin(this.timer * 0.06) * 1;
    /* Body */
    c.fillStyle = this.color;
    c.beginPath();
    c.ellipse(sx + 11, sy + 12 + bob, 9, 6, 0, 0, Math.PI * 2);
    c.fill();
    /* Head */
    c.beginPath();
    c.arc(sx + 4, sy + 9 + bob, 5, 0, Math.PI * 2);
    c.fill();
    /* Big round ears */
    c.fillStyle = hexShade(this.color, 30);
    c.beginPath(); c.arc(sx + 1, sy + 4 + bob, 3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 7, sy + 4 + bob, 3, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffaacc';
    c.beginPath(); c.arc(sx + 1, sy + 4 + bob, 1.6, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 7, sy + 4 + bob, 1.6, 0, Math.PI * 2); c.fill();
    /* Eye */
    c.fillStyle = '#1a0c14';
    c.beginPath(); c.arc(sx + 3, sy + 9 + bob, 1, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(sx + 2.6, sy + 8.6 + bob, 0.4, 0, Math.PI * 2); c.fill();
    /* Pink nose */
    c.fillStyle = '#ff66aa';
    c.beginPath(); c.arc(sx - 1, sy + 10 + bob, 0.7, 0, Math.PI * 2); c.fill();
    /* Whiskers */
    c.strokeStyle = '#888';
    c.lineWidth = 0.4;
    c.beginPath();
    c.moveTo(sx - 1, sy + 11 + bob); c.lineTo(sx - 5, sy + 10 + bob);
    c.moveTo(sx - 1, sy + 11.5 + bob); c.lineTo(sx - 5, sy + 12 + bob);
    c.stroke();
    /* Tail */
    c.strokeStyle = hexShade(this.color, 40);
    c.lineWidth = 1.4;
    c.lineCap = 'round';
    var wag = Math.sin(this.timer * 0.12) * 2;
    c.beginPath();
    c.moveTo(sx + 19, sy + 12 + bob);
    c.quadraticCurveTo(sx + 24, sy + 10 + wag + bob, sx + 26, sy + 6 + wag + bob);
    c.stroke();
    /* Party hat once Chef Brie's cheese cake is baked */
    if (Game.quests && Game.quests.brie === 'done') {
      var hatC = this.mouseId === 'sprout' ? '#44ddff' : (this.mouseId === 'tilly' ? '#ffd24a' : '#ff66cc');
      c.fillStyle = hatC;
      c.beginPath();
      c.moveTo(sx + 0.5, sy + 4.5 + bob); c.lineTo(sx + 7.5, sy + 4.5 + bob); c.lineTo(sx + 4.5, sy - 5 + bob);
      c.closePath();
      c.fill();
      c.fillStyle = '#ffffff';
      c.fillRect(sx + 2.2, sy + 1 + bob, 4, 1);
      c.beginPath(); c.arc(sx + 4.5, sy - 5.5 + bob, 1.3, 0, Math.PI * 2); c.fill();
    }
    /* If greeted, show a little heart over their head */
    if (this.greeted) {
      var hcx = sx + 10, hcy = sy - 3 + bob + Math.sin(this.timer * 0.1) * 0.6;
      c.fillStyle = '#ff4488';
      c.beginPath();
      c.arc(hcx - 1.4, hcy - 0.6, 1.4, 0, Math.PI * 2);
      c.arc(hcx + 1.4, hcy - 0.6, 1.4, 0, Math.PI * 2);
      c.moveTo(hcx - 2.6, hcy);
      c.lineTo(hcx, hcy + 2.4);
      c.lineTo(hcx + 2.6, hcy);
      c.closePath();
      c.fill();
    }
  };

  /* ========== CHEF BRIE (moon-mouse baker, golden-crumb quest) ========== */
  function ChefMouse(x, y) {
    this.x = x;
    this.y = y;
    this.w = 30;
    this.h = 36;
    this.timer = Math.random() * 100;
    this.talking = false;
    this.talkTimer = 0;
    this.currentText = '';
  }

  ChefMouse.prototype.update = function () {
    this.timer++;
    if (this.talkTimer > 0) {
      this.talkTimer--;
      if (this.talkTimer <= 0) this.talking = false;
    }
  };

  /* The engine moves the quest along before calling this, so the line
     always matches the state she is in now. */
  ChefMouse.prototype.interact = function (key) {
    this.talking = true;
    this.talkTimer = 320;
    this.currentText = Game.i18n.t(key);
  };

  ChefMouse.prototype.draw = function (c, camX, camY) {
    var sx = Math.round(this.x - camX);
    var sy = Math.round(this.y - camY);
    var t = this.timer;
    var bob = Math.sin(t * 0.05) * 1.1;
    var FUR = '#f2e2c8', FUR_D = '#c9b090', INK = '#3a2414';
    var blink = (t % 220) < 7;
    var y0 = sy + bob;
    c.save();
    c.lineJoin = 'round';
    c.lineCap = 'round';
    /* Tail curling up behind her */
    c.strokeStyle = FUR_D;
    c.lineWidth = 1.8;
    var wag = Math.sin(t * 0.08) * 2.5;
    c.beginPath();
    c.moveTo(sx + 23, y0 + 31);
    c.quadraticCurveTo(sx + 33, y0 + 30 + wag * 0.4, sx + 32, y0 + 21 + wag);
    c.stroke();
    /* Feet */
    c.fillStyle = '#ffb0c4';
    c.beginPath(); c.ellipse(sx + 10, sy + 35, 4, 1.8, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(sx + 20, sy + 35, 4, 1.8, 0, 0, Math.PI * 2); c.fill();
    /* Body with a soft belly shadow */
    c.fillStyle = FUR;
    c.strokeStyle = INK;
    c.lineWidth = 1;
    c.beginPath(); c.ellipse(sx + 15, y0 + 26, 10, 9, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    /* Apron with a little cheese wedge on the pocket */
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(sx + 9, y0 + 20);
    c.lineTo(sx + 21, y0 + 20);
    c.quadraticCurveTo(sx + 23, y0 + 33, sx + 15, y0 + 34);
    c.quadraticCurveTo(sx + 7, y0 + 33, sx + 9, y0 + 20);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(58, 36, 20, 0.45)';
    c.stroke();
    c.fillStyle = '#ffd24a';
    c.beginPath(); c.moveTo(sx + 12, y0 + 29); c.lineTo(sx + 18, y0 + 29); c.lineTo(sx + 17, y0 + 25); c.closePath(); c.fill();
    c.fillStyle = '#c88a2a';
    c.beginPath(); c.arc(sx + 15.5, y0 + 27.6, 0.7, 0, Math.PI * 2); c.fill();
    /* Red neckerchief */
    c.fillStyle = '#e8445a';
    c.beginPath(); c.moveTo(sx + 9, y0 + 19); c.lineTo(sx + 21, y0 + 19); c.lineTo(sx + 15, y0 + 23.5); c.closePath(); c.fill();
    /* Arms: the right one stirs a wooden spoon, faster while she talks */
    var stir = Math.sin(t * (this.talking ? 0.22 : 0.07)) * (this.talking ? 0.5 : 0.25);
    c.fillStyle = FUR;
    c.strokeStyle = INK;
    c.beginPath(); c.ellipse(sx + 6, y0 + 25, 2.4, 3.6, 0.3, 0, Math.PI * 2); c.fill(); c.stroke();
    c.save();
    c.translate(sx + 24, y0 + 23);
    c.rotate(-0.5 + stir);
    c.strokeStyle = '#a8642a';
    c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -11); c.stroke();
    c.fillStyle = '#c47c38';
    c.beginPath(); c.ellipse(0, -12.5, 2, 2.8, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = FUR;
    c.strokeStyle = INK;
    c.lineWidth = 1;
    c.beginPath(); c.ellipse(0, 0, 2.4, 3, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.restore();
    /* Ears out to the sides, pink inside */
    var earT = Math.sin(t * 0.03) * 0.08;
    c.fillStyle = FUR;
    c.beginPath(); c.ellipse(sx + 6, y0 + 9, 5, 5.4, -0.3 - earT, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.ellipse(sx + 24, y0 + 9, 5, 5.4, 0.3 + earT, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#ffb0c4';
    c.beginPath(); c.ellipse(sx + 6.4, y0 + 9.4, 3, 3.4, -0.3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(sx + 23.6, y0 + 9.4, 3, 3.4, 0.3, 0, Math.PI * 2); c.fill();
    /* Head */
    c.fillStyle = FUR;
    c.beginPath(); c.ellipse(sx + 15, y0 + 13, 8.5, 7.6, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255, 255, 255, 0.55)';
    c.beginPath(); c.ellipse(sx + 12, y0 + 10, 3.2, 1.6, -0.4, 0, Math.PI * 2); c.fill();
    /* Chef's hat: band and three puffs */
    c.fillStyle = '#ffffff';
    c.strokeStyle = INK;
    c.beginPath();
    c.arc(sx + 11, y0 + 1, 4.2, 0, Math.PI * 2);
    c.arc(sx + 15, y0 - 1.5, 4.8, 0, Math.PI * 2);
    c.arc(sx + 19, y0 + 1, 4.2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ffffff';
    c.fillRect(sx + 9, y0 + 2, 12, 4.5);
    c.strokeRect(sx + 9, y0 + 2, 12, 4.5);
    c.fillStyle = 'rgba(180, 170, 200, 0.45)';
    c.fillRect(sx + 9.5, y0 + 5, 11, 1.2);
    /* Eyes (blinking), rosy cheeks, nose, smile, whiskers */
    c.fillStyle = INK;
    if (blink) {
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(sx + 10.4, y0 + 13); c.lineTo(sx + 13, y0 + 13); c.moveTo(sx + 17, y0 + 13); c.lineTo(sx + 19.6, y0 + 13); c.stroke();
    } else {
      c.beginPath(); c.ellipse(sx + 11.8, y0 + 12.6, 1.5, 2, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(sx + 18.2, y0 + 12.6, 1.5, 2, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(sx + 11.3, y0 + 11.8, 0.6, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(sx + 17.7, y0 + 11.8, 0.6, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = 'rgba(255, 120, 150, 0.4)';
    c.beginPath(); c.ellipse(sx + 9.4, y0 + 16, 1.8, 1.1, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(sx + 20.6, y0 + 16, 1.8, 1.1, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ff6a9a';
    c.beginPath(); c.arc(sx + 15, y0 + 15.4, 1.2, 0, Math.PI * 2); c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 0.8;
    c.beginPath(); c.arc(sx + 15, y0 + 16, 2, 0.35, Math.PI - 0.35); c.stroke();
    c.strokeStyle = 'rgba(58, 36, 20, 0.5)';
    c.lineWidth = 0.5;
    var tw = Math.sin(t * 0.11) * 0.5;
    c.beginPath();
    c.moveTo(sx + 11, y0 + 15.6); c.lineTo(sx + 5.5, y0 + 14.6 + tw);
    c.moveTo(sx + 11, y0 + 16.4); c.lineTo(sx + 5.5, y0 + 17 + tw);
    c.moveTo(sx + 19, y0 + 15.6); c.lineTo(sx + 24.5, y0 + 14.6 - tw);
    c.moveTo(sx + 19, y0 + 16.4); c.lineTo(sx + 24.5, y0 + 17 - tw);
    c.stroke();
    c.restore();
  };

  /* ========== TELESCOPE (look at the home planet) ========== */
  function Telescope(x, y) {
    this.x = x;
    this.y = y;
    this.w = 34;
    this.h = 50;
    this.talking = false;
    this.timer = 0;
  }

  Telescope.prototype.update = function () { this.timer++; };
  Telescope.prototype.interact = function () { /* handled by engine */ };

  Telescope.prototype.draw = function (c, camX, camY) {
    var sx = Math.round(this.x - camX);
    var sy = Math.round(this.y - camY);
    var INK = '#3a2414';
    c.save();
    c.lineCap = 'round';
    /* Tripod */
    c.strokeStyle = INK;
    c.lineWidth = 3.4;
    c.beginPath();
    c.moveTo(sx + 17, sy + 27); c.lineTo(sx + 5, sy + 50);
    c.moveTo(sx + 17, sy + 27); c.lineTo(sx + 29, sy + 50);
    c.moveTo(sx + 17, sy + 27); c.lineTo(sx + 18, sy + 50);
    c.stroke();
    c.strokeStyle = '#8a5a30';
    c.lineWidth = 2;
    c.stroke();
    c.strokeStyle = '#c08850';
    c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(sx + 16, sy + 28); c.lineTo(sx + 4.6, sy + 49); c.stroke();
    /* Brass tube pointing up at the sky */
    c.translate(sx + 17, sy + 24);
    c.rotate(-0.62 + Math.sin(this.timer * 0.01) * 0.03);
    var tg = c.createLinearGradient(0, -5, 0, 5);
    tg.addColorStop(0, '#fff0b0');
    tg.addColorStop(0.35, '#e8b048');
    tg.addColorStop(1, '#8a5418');
    c.fillStyle = tg;
    c.strokeStyle = INK;
    c.lineWidth = 1.1;
    c.beginPath();
    c.moveTo(-12, -3.2); c.lineTo(20, -5); c.lineTo(20, 5); c.lineTo(-12, 3.2); c.closePath();
    c.fill(); c.stroke();
    /* Bands, the dew cap and the eyepiece */
    c.fillStyle = '#a86820';
    c.fillRect(-2, -4, 2.2, 8);
    c.fillRect(9, -4.6, 2.2, 9.2);
    c.fillStyle = '#ff66cc';
    c.beginPath(); c.rect(20, -6, 5, 12); c.fill(); c.stroke();
    c.fillStyle = '#5a3a20';
    c.beginPath(); c.rect(-16, -2, 4, 4); c.fill(); c.stroke();
    /* Lens glint */
    var gl = 0.5 + Math.sin(this.timer * 0.06) * 0.5;
    c.fillStyle = 'rgba(180, 240, 255, ' + (0.5 + gl * 0.5).toFixed(2) + ')';
    c.beginPath(); c.ellipse(25.5, 0, 1.4, 5, 0, 0, Math.PI * 2); c.fill();
    c.restore();
    /* Mount */
    c.fillStyle = '#5a3a20';
    c.beginPath(); c.arc(sx + 17, sy + 26, 3, 0, Math.PI * 2); c.fill();
    /* A twinkle off the lens now and then */
    var tp = (this.timer % 150) / 150;
    if (tp < 0.25) {
      var k = Math.sin(tp / 0.25 * Math.PI);
      c.fillStyle = 'rgba(255, 255, 255, ' + (0.9 * k).toFixed(2) + ')';
      fillStar(c, sx + 37, sy + 6, 2 + k * 3);
    }
  };

  /* ========== GOLDEN CHEESE CRUMB (Chef Brie's quest pickup) ========== */
  function CrumbPickup(x, y, id) {
    HeartPickup.call(this, x, y);
    this.crumbId = id;
    this.timer = Math.random() * 100;
  }
  CrumbPickup.prototype.update = HeartPickup.prototype.update;

  CrumbPickup.prototype.draw = function (c, camX, camY) {
    if (!this.active) return;
    var sx = this.x - camX + 8;
    var sy = this.y - camY + 8;
    var t = this.timer;
    c.save();
    c.translate(sx, sy);
    c.rotate(Math.sin(t * 0.04) * 0.25);
    /* Little wedge of golden cheese */
    c.fillStyle = '#ffc93a';
    c.strokeStyle = '#8a5418';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(-7, 5); c.lineTo(7, 5); c.lineTo(5, -5); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#fff2a0';
    c.beginPath(); c.moveTo(5, -5); c.lineTo(7, 5); c.lineTo(8.6, 3.4); c.lineTo(6.4, -5.6); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#c88a2a';
    c.beginPath(); c.arc(-1.5, 2, 1.4, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(3.2, -0.6, 1, 0, Math.PI * 2); c.fill();
    c.restore();
    /* Twinkle so it reads as something to grab */
    var k = 0.5 + 0.5 * Math.sin(t * 0.09);
    c.fillStyle = 'rgba(255, 255, 230, ' + (0.4 + k * 0.6).toFixed(2) + ')';
    fillStar(c, sx - 6, sy - 7, 1.6 + k * 2);
  };

  /* ========== EXPORTS ========== */
  window.Game.entities = {
    Momoko: Momoko,
    Bubble: Bubble,
    Fish: Fish,
    Oliver: Oliver,
    KittyCorn: KittyCorn,
    Bob: Bob,
    Crab: Crab,
    Wolfe: Wolfe,
    Lila: Lila,
    MigWord: MigWord,
    MoonMouse: MoonMouse,
    ChefMouse: ChefMouse,
    Telescope: Telescope,
    CrumbPickup: CrumbPickup,
    RocketShip: RocketShip,
    HouseDoor: HouseDoor,
    CafeDoor: CafeDoor,
    ShopDoor: ShopDoor,
    HeartPickup: HeartPickup,
    Particle: Particle,
    AmbientBubble: AmbientBubble,
    spawnBurst: spawnBurst,
    drawMomokoSprite: drawMomokoSprite,
    drawMomokoFloss: drawMomokoFloss,
    drawCrabPet: drawCrabPet,
    PETS: PETS,
  };
})();
