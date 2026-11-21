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
    /* Swimming */
    if (keys.left) { this.vx -= Momoko.SWIM_FORCE; this.facing = -1; }
    if (keys.right) { this.vx += Momoko.SWIM_FORCE; this.facing = 1; }
    if (keys.up) this.vy -= Momoko.SWIM_FORCE;
    if (keys.down) this.vy += Momoko.SWIM_FORCE;

    /* Gravity (gentle sinking) */
    this.vy += Momoko.GRAVITY;

    /* Friction */
    this.vx *= Momoko.FRICTION;
    this.vy *= Momoko.FRICTION;

    /* Clamp velocity */
    var speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed > Momoko.MAX_VEL) {
      this.vx = (this.vx / speed) * Momoko.MAX_VEL;
      this.vy = (this.vy / speed) * Momoko.MAX_VEL;
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
    this.petT = (this.petT || 0) + 0.45 + Math.min(1, Math.abs(this.vx) / Momoko.MAX_VEL) * 0.9;
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
      });
    }
  };

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

  /* Pet-dog companion — re-themed from crab. `variant` picks the coat
     palette (brown/blue/gold remapped to brown/spotted/golden) or 'none'.
     Body, head, ear and muzzle get Momoko's cel shading; pass mirror
     when the canvas is flipped so the light stays on the upper left. */
  function drawCrabPet(c, px, py, variant, frame, mirror) {
    if (!variant || variant === 'none') return;
    var body, accent, muzzle;
    if (variant === 'blue' || variant === 'spotted') {
      body = '#e6e6e6'; accent = '#4a3a30'; muzzle = '#ffffff';
    } else if (variant === 'gold' || variant === 'golden') {
      body = '#f0bf5a'; accent = '#a86a22'; muzzle = '#fbe6b4';
    } else {
      /* red -> brown */
      body = '#8a5a32'; accent = '#5a3818'; muzzle = '#c9a070';
    }
    var t = frame || 0;
    var wobble = Math.sin(t * 0.2) * 0.8;
    var step = Math.sin(t * 0.3) * 1;
    c.save();
    c.lineCap = 'round';
    /* Tail (wagging) */
    c.strokeStyle = body;
    c.lineWidth = 1.8;
    c.beginPath();
    c.moveTo(px + 5, py - 1);
    c.quadraticCurveTo(px + 8, py - 3 + wobble * 2, px + 9, py - 5 + wobble * 2);
    c.stroke();
    /* Far legs */
    c.strokeStyle = accent;
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(px - 3, py + 2.5); c.lineTo(px - 3.5 - step, py + 5.5);
    c.moveTo(px + 3, py + 2.5); c.lineTo(px + 3.5 + step, py + 5.5);
    c.stroke();
    var S = Game.momoko.shader(c, mirror);
    /* Body — plump ellipse */
    S.shape(S.ellipse(px, py, 6.2, 4), body, { d: 1.4, lw: 0.5 });
    /* Near legs with paws */
    c.strokeStyle = body;
    c.lineWidth = 1.8;
    c.beginPath();
    c.moveTo(px - 2, py + 2.5); c.lineTo(px - 1.5 + step, py + 5.5);
    c.moveTo(px + 4, py + 2.5); c.lineTo(px + 4.5 - step, py + 5.5);
    c.stroke();
    /* Spots for 'spotted' coat */
    if (variant === 'blue' || variant === 'spotted') {
      c.fillStyle = '#443322';
      c.beginPath(); c.arc(px + 1, py - 1.5, 1.3, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(px + 3.5, py + 1, 0.9, 0, Math.PI * 2); c.fill();
    }
    /* Head, muzzle, floppy ear */
    S.shape(S.ellipse(px - 5.5, py - 2, 3.6, 3.6), body, { d: 1.2, lw: 0.5 });
    S.shape(S.ellipse(px - 7.5, py - 0.8, 2.2, 1.7), muzzle, { d: 0.7, lw: 0.4 });
    S.shape(S.ellipse(px - 3.2, py - 2.6, 1.3, 2.6, 0.3), accent, { d: 0.7, lw: 0.4 });
    S.done();
    /* Nose + eye */
    c.fillStyle = '#1a1a1a';
    c.beginPath(); c.ellipse(px - 9.2, py - 1.4, 1, 0.8, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(px - 6.2, py - 3, 0.75, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(px - 6.5, py - 3.3, 0.3, 0, Math.PI * 2); c.fill();
    /* Collar */
    c.strokeStyle = '#d23a5a';
    c.lineWidth = 1.1;
    c.beginPath(); c.arc(px - 5, py - 0.5, 2.8, 0.5, Math.PI - 0.6); c.stroke();
    c.restore();
  }

  /* Gameplay draw: the figure is painted a size up from her 28x34
     collision box, pivoting on her feet, so she reads at play scale
     while every collision stays exactly as it was. Lean, squash, hop
     and the turn come from her rig. */
  Momoko.HERO_SCALE = 1.25;
  Momoko.prototype.draw = function (c, camX, camY) {
    var sx = Math.round(this.x - camX);
    var sy = Math.round(this.y - camY);
    var cust = window.Game.customization || {};
    var k = Momoko.HERO_SCALE;
    var pose = this.rig ? this.rig.pose : null;
    var face = pose ? pose.face : this.facing;

    /* Pet trails at foot level on the side away from her facing. */
    if (cust.crab && cust.crab !== 'none') {
      c.save();
      c.translate(sx + this.w / 2, 0);
      c.scale(this.facing, 1);
      drawCrabPet(c, -this.w / 2 - 12, sy + 32, cust.crab, this.petT || 0, this.facing === -1);
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

  /* ========== OLIVER (NPC - Otter) ========== */
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
    var wag = Math.sin(this.timer * 0.1) * 3;

    c.save();
    /* Tail — thick at the rump, tapering as it drifts behind */
    c.lineCap = 'round';
    c.strokeStyle = FUR_D; c.lineWidth = 5;
    c.beginPath();
    c.moveTo(sx + 24, sy + 12);
    c.quadraticCurveTo(sx + 31, sy + 11 + wag, sx + 35, sy + 7 + wag);
    c.stroke();
    c.strokeStyle = FUR; c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(sx + 30, sy + 10.5 + wag * 0.8);
    c.lineTo(sx + 35, sy + 7 + wag);
    c.stroke();

    /* Body — long sleek otter torpedo, lit from above */
    var bg = c.createLinearGradient(0, sy + 3, 0, sy + 20);
    bg.addColorStop(0, FUR); bg.addColorStop(1, FUR_D);
    c.fillStyle = bg;
    c.beginPath(); c.ellipse(sx + 16, sy + 12, 13, 7.5, -0.1, 0, Math.PI * 2); c.fill();
    /* Pale belly */
    c.fillStyle = CREAM;
    c.beginPath(); c.ellipse(sx + 15, sy + 14.5, 8.5, 4, -0.1, 0, Math.PI * 2); c.fill();
    /* Webbed hind foot tucked under the rump */
    c.fillStyle = FUR_D;
    c.beginPath(); c.ellipse(sx + 25, sy + 17.5, 3.6, 1.8, 0.5, 0, Math.PI * 2); c.fill();

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
    /* Paws clasped on the chest */
    c.fillStyle = FUR_D;
    c.beginPath(); c.ellipse(sx + 11.5, sy + 13, 2.4, 1.8, 0.4, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(sx + 15.5, sy + 13.5, 2.4, 1.8, -0.4, 0, Math.PI * 2); c.fill();
    c.restore();
  };

  /* ========== KITTY CORN (NPC - Cat Mermaid) ========== */
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

    /* Mermaid tail – smooth bezier */
    c.fillStyle = '#33ccaa';
    var tailWave = Math.sin(this.timer * 0.08) * 4;
    c.beginPath();
    c.moveTo(sx + 6, sy + 16);
    c.lineTo(sx + 18, sy + 16);
    c.bezierCurveTo(sx + 18, sy + 20, sx + 16 + tailWave, sy + 24, sx + 20, sy + 28);
    c.lineTo(sx + 4, sy + 28);
    c.bezierCurveTo(sx + 8 - tailWave, sy + 24, sx + 6, sy + 20, sx + 6, sy + 16);
    c.closePath();
    c.fill();
    /* Tail fin */
    c.fillStyle = '#22aa88';
    c.beginPath();
    c.moveTo(sx + 12, sy + 27);
    c.quadraticCurveTo(sx + 2, sy + 30, sx + 0, sy + 32);
    c.quadraticCurveTo(sx + 6, sy + 29, sx + 12, sy + 27);
    c.fill();
    c.beginPath();
    c.moveTo(sx + 12, sy + 27);
    c.quadraticCurveTo(sx + 22, sy + 30, sx + 24, sy + 32);
    c.quadraticCurveTo(sx + 18, sy + 29, sx + 12, sy + 27);
    c.fill();

    /* Body – ellipse */
    c.fillStyle = '#ff9944';
    c.beginPath();
    c.ellipse(sx + 12, sy + 14, 7, 5, 0, 0, Math.PI * 2);
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

    c.restore();
  };

  /* ========== BOB (NPC - Submarine) ========== */
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
    this.propPhase = 0;
  }

  Bob.prototype.update = function () {
    this.timer++;
    this.propPhase += 0.2;
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

    c.save();

    /* Hull */
    c.fillStyle = '#ffcc33';
    c.beginPath();
    c.ellipse(sx + 28, sy + 18, 28, 14, 0, 0, Math.PI * 2);
    c.fill();

    /* Red stripe */
    c.fillStyle = '#cc3333';
    c.beginPath();
    c.ellipse(sx + 28, sy + 18, 26, 3, 0, 0, Math.PI * 2);
    c.fill();

    /* Cabin / tower – rounded */
    c.fillStyle = '#ddaa22';
    c.beginPath();
    c.moveTo(sx + 20, sy + 12);
    c.quadraticCurveTo(sx + 20, sy + 2, sx + 28, sy + 2);
    c.quadraticCurveTo(sx + 36, sy + 2, sx + 36, sy + 12);
    c.closePath();
    c.fill();

    /* Periscope – rounded ends */
    c.fillStyle = '#999999';
    c.beginPath();
    c.moveTo(sx + 27, sy - 8);
    c.quadraticCurveTo(sx + 28, sy - 10, sx + 30, sy - 10);
    c.lineTo(sx + 32, sy - 10);
    c.quadraticCurveTo(sx + 34, sy - 10, sx + 32, sy - 8);
    c.lineTo(sx + 30, sy - 8);
    c.lineTo(sx + 30, sy + 0);
    c.lineTo(sx + 27, sy + 0);
    c.closePath();
    c.fill();

    /* Windows */
    c.fillStyle = '#88ddff';
    c.beginPath(); c.arc(sx + 14, sy + 14, 5, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 28, sy + 14, 5, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 42, sy + 14, 5, 0, Math.PI * 2); c.fill();
    /* Window rims */
    c.strokeStyle = '#aa8822';
    c.lineWidth = 1.5;
    c.beginPath(); c.arc(sx + 14, sy + 14, 5, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(sx + 28, sy + 14, 5, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(sx + 42, sy + 14, 5, 0, Math.PI * 2); c.stroke();

    /* Face in middle window */
    c.fillStyle = '#ffddbb';
    c.beginPath(); c.arc(sx + 28, sy + 14, 3, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#333';
    c.beginPath(); c.arc(sx + 27, sy + 13, 0.8, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 30, sy + 13, 0.8, 0, Math.PI * 2); c.fill();

    /* Propeller */
    c.fillStyle = '#888888';
    c.save();
    c.translate(sx + 56, sy + 18);
    c.rotate(this.propPhase);
    c.beginPath();
    c.ellipse(0, -5, 2, 5, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(0, 5, 2, 5, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.fillStyle = '#666666';
    c.beginPath(); c.arc(sx + 56, sy + 18, 3, 0, Math.PI * 2); c.fill();

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

  /* ========== CRAB (NPC – friendly joke-teller) ========== */
  function Crab(x, y) {
    this.x = x;
    this.y = y;
    this.w = 22;
    this.h = 14;
    this.spawnX = x;
    this.spawnY = y;
    this.timer = Math.random() * 100;
    this.dir = Math.random() > 0.5 ? 1 : -1;
    this.legPhase = 0;
    this.talking = false;
    this.talkTimer = 0;
    this.currentJoke = '';
  }

  Crab.prototype.update = function () {
    this.timer++;
    this.legPhase += 0.18;
    /* Sidestep along a short patrol; flip when you reach the ends so the
       claws lead the walk – feels more crab-like than smooth oscillation. */
    var range = 36;
    var off = this.x - this.spawnX;
    if (off > range) this.dir = -1;
    else if (off < -range) this.dir = 1;
    if (!this.talking) this.x += 0.3 * this.dir;
    /* Tiny sand-bob */
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
    var leg = Math.sin(this.legPhase) * 2;

    c.save();
    if (this.dir === -1) {
      c.translate(sx + this.w / 2, 0);
      c.scale(-1, 1);
      sx = -this.w / 2;
    }

    /* Legs (behind body) – three pairs, alternating sway */
    c.strokeStyle = '#9a2418';
    c.lineWidth = 1.5;
    c.lineCap = 'round';
    for (var lg = 0; lg < 3; lg++) {
      var lx = sx + 6 + lg * 4;
      var lOff = (lg % 2 === 0 ? leg : -leg);
      /* Left side leg */
      c.beginPath();
      c.moveTo(lx - 1, sy + 8);
      c.lineTo(lx - 4, sy + 13 + lOff);
      c.stroke();
      /* Right side leg */
      c.beginPath();
      c.moveTo(lx + 1, sy + 8);
      c.lineTo(lx + 4, sy + 13 - lOff);
      c.stroke();
    }

    /* Body shell, cel-shaded in the hero's light */
    var S = Game.momoko.shader(c, this.dir === -1);
    S.shape(S.ellipse(sx + 11, sy + 7, 10, 6), '#d8442f', { d: 2, lw: 0.7 });
    S.done();
    /* Shell gloss */
    c.fillStyle = 'rgba(255, 190, 170, 0.75)';
    c.beginPath();
    c.ellipse(sx + 8.5, sy + 4.4, 4.5, 1.6, -0.15, 0, Math.PI * 2);
    c.fill();
    /* Shell speckles */
    c.fillStyle = '#7a1a10';
    c.beginPath(); c.arc(sx + 7,  sy + 8, 0.8, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 13, sy + 9, 0.8, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 15, sy + 6, 0.7, 0, Math.PI * 2); c.fill();

    /* Claws – pinched ovals on each side */
    var clawWiggle = this.talking ? Math.sin(this.timer * 0.4) * 0.6 : 0;
    c.fillStyle = '#d8442f';
    c.save();
    c.translate(sx + 1, sy + 6);
    c.rotate(-0.4 + clawWiggle);
    c.beginPath(); c.ellipse(0, 0, 4, 2.6, 0, 0, Math.PI * 2); c.fill();
    /* Pincer notch */
    c.fillStyle = '#7a1a10';
    c.beginPath(); c.moveTo(-3.2, 0); c.lineTo(-1.5, -0.6); c.lineTo(-1.5, 0.6); c.closePath(); c.fill();
    c.restore();
    c.fillStyle = '#d8442f';
    c.save();
    c.translate(sx + 21, sy + 6);
    c.rotate(0.4 - clawWiggle);
    c.beginPath(); c.ellipse(0, 0, 4, 2.6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#7a1a10';
    c.beginPath(); c.moveTo(3.2, 0); c.lineTo(1.5, -0.6); c.lineTo(1.5, 0.6); c.closePath(); c.fill();
    c.restore();

    /* Eye stalks */
    c.strokeStyle = '#7a1a10';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(sx + 8, sy + 3); c.lineTo(sx + 7, sy);
    c.stroke();
    c.beginPath();
    c.moveTo(sx + 14, sy + 3); c.lineTo(sx + 15, sy);
    c.stroke();
    /* Eyes */
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(sx + 7, sy, 1.6, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 15, sy, 1.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#1a1a1a';
    c.beginPath(); c.arc(sx + 7, sy, 0.8, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 15, sy, 0.8, 0, Math.PI * 2); c.fill();

    /* Friendly smile */
    c.strokeStyle = '#7a1a10';
    c.lineWidth = 0.8;
    c.beginPath();
    c.arc(sx + 11, sy + 7, 2, 0.2, Math.PI - 0.2);
    c.stroke();

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
  function AmbientBubble(x, y) {
    this.x = x;
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

  /* Re-themed as AmbientSparkle — cosmic dust drifting upward. */
  AmbientBubble.prototype.draw = function (c, camX, camY) {
    var sx = this.x - camX + Math.sin(this.phase) * this.wobbleAmp;
    var sy = this.y - camY;
    c.save();
    c.globalAlpha = this.alpha * 0.85;
    c.fillStyle = this.phase > Math.PI ? '#ff99dd' : '#ccddff';
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
  function HouseDoor(x, y, houseId) {
    this.x = x;
    this.y = y;
    this.w = 48;
    this.h = 52;
    this.houseId = houseId || 'heroHome';
    this.talking = false;
    this.timer = 0;
  }

  HouseDoor.prototype.update = function () { this.timer++; };
  HouseDoor.prototype.interact = function () { /* handled by engine */ };

  HouseDoor.prototype.draw = function (c, camX, camY) {
    var sx = Math.round(this.x - camX);
    var sy = Math.round(this.y - camY);
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
    var sx = Math.round(this.x - camX);
    var sy = Math.round(this.y - camY);
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
    var key = this.greeted ? 'mouseAgain' : 'mouseGreet_' + this.mouseId;
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
  };
})();
