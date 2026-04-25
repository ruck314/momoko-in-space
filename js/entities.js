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

  /* Shared Momoko sprite painter – called by gameplay draw and the
     customize-screen preview so both stay visually in sync.

     Precure-inspired design:
       – oversized round head with huge sparkle eyes (star-shaped catch-
         light in each pupil) and rosy blush patches
       – a peach tiara (gold band + peach gem + green leaf) crowning her
         hair, a nod to her "Peach Princess" title from the intro
       – hair with bow accents at the pigtail roots, plus alternate
         styles (long braids, twin buns with ribbon tails)
       – swappable outfits (frilly dress, sailor swimsuit, one-piece,
         classic t-shirt) and shoes (mary-jane, sneaker, flipper)
       – optional held food in the left hand (ice-cream, onigiri, donut)

     Crab companion lives outside this painter so it can follow the
     player in world space – see drawCrabPet. */
  function drawMomokoSprite(c, sx, sy, cust, frame) {
    var hairC = (cust && cust.hair) || '#e06088';
    var suitC = (cust && cust.suit) || '#e06088';
    var skinC = (cust && cust.skin) || '#ffddbb';
    var shoeC = (cust && cust.flipper) || '#ff99cc';
    var hairStyle = (cust && cust.hairStyle) || 'twinTails';
    var outfit = (cust && cust.outfit) || 'frillyDress';
    var shoeStyle = (cust && cust.shoes) || 'maryJane';
    var food = (cust && cust.food) || 'none';
    var f = frame || 0;
    var kick = Math.sin(f * 1.5) * 2;

    var hairShade = hexShade(hairC, 40);
    var suitShade = hexShade(suitC, 35);
    var suitLight = hexTint(suitC, 40);

    /* ---------- Legs / tights ---------- */
    /* Under the frilly dress she wears light tights; other outfits show
       dark leggings/pants so her silhouette still reads against any
       background. */
    c.fillStyle = outfit === 'frillyDress' || outfit === 'sailorDress'
      ? '#ffe8ee' : '#3a2a18';
    c.fillRect(sx + 9, sy + 25, 4, 7);
    c.fillRect(sx + 15, sy + 25, 4, 7);

    /* ---------- Shoes ---------- */
    function drawShoe(cx, cy) {
      if (shoeStyle === 'flipper') {
        c.fillStyle = shoeC;
        c.beginPath();
        c.ellipse(cx, cy, 3.2, 1.7, 0, 0, Math.PI * 2);
        c.fill();
      } else if (shoeStyle === 'sneaker') {
        c.fillStyle = shoeC;
        c.fillRect(cx - 3, cy - 1.6, 6, 2.4);
        c.fillStyle = '#ffffff';
        c.fillRect(cx - 3, cy + 0.4, 6, 0.9);
        c.fillStyle = hexShade(shoeC, 50);
        c.fillRect(cx - 3, cy + 1.1, 6, 0.5);
      } else {
        /* maryJane (default) */
        c.fillStyle = shoeC;
        c.beginPath();
        c.ellipse(cx, cy + 0.2, 3.2, 1.9, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = hexShade(shoeC, 30);
        c.lineWidth = 0.8;
        c.beginPath();
        c.moveTo(cx - 2.2, cy - 0.6);
        c.lineTo(cx + 2.2, cy - 0.6);
        c.stroke();
        c.fillStyle = '#fff4aa';
        c.beginPath();
        c.arc(cx, cy - 0.6, 0.55, 0, Math.PI * 2);
        c.fill();
      }
    }
    drawShoe(sx + 11, sy + 33 + kick * 0.3);
    drawShoe(sx + 17, sy + 33 - kick * 0.3);

    /* ---------- Back hair mass ---------- */
    c.fillStyle = hairShade;
    c.beginPath();
    c.moveTo(sx + 3, sy + 9);
    c.bezierCurveTo(sx - 1, sy + 20, sx + 1, sy + 27, sx + 5, sy + 30);
    c.lineTo(sx + 23, sy + 30);
    c.bezierCurveTo(sx + 27, sy + 27, sx + 29, sy + 20, sx + 25, sy + 9);
    c.closePath();
    c.fill();

    /* ---------- Hairstyle variant ---------- */
    if (hairStyle === 'longBraids') {
      /* Braided pigtails – stacked lozenges form a zigzag down each side */
      for (var side = 0; side < 2; side++) {
        var bx = side === 0 ? sx + 2 : sx + 26;
        c.fillStyle = hairC;
        for (var b = 0; b < 5; b++) {
          var by = sy + 10 + b * 5;
          var off = b % 2 === 0 ? -0.8 : 0.8;
          c.beginPath();
          c.ellipse(bx + off, by, 2.6, 2.9, 0, 0, Math.PI * 2);
          c.fill();
        }
        /* Ribbon tie at the end */
        c.fillStyle = suitC;
        c.beginPath();
        c.ellipse(bx, sy + 35, 1.8, 1, 0, 0, Math.PI * 2);
        c.fill();
      }
    } else if (hairStyle === 'buns') {
      /* Twin buns on top, no long pigtails */
      c.fillStyle = hairC;
      c.beginPath(); c.arc(sx + 5, sy + 3, 4.2, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(sx + 23, sy + 3, 4.2, 0, Math.PI * 2); c.fill();
      /* Bun highlight swirls */
      c.strokeStyle = hairShade;
      c.lineWidth = 0.6;
      c.beginPath(); c.arc(sx + 5, sy + 3, 2.2, 0, Math.PI * 1.5); c.stroke();
      c.beginPath(); c.arc(sx + 23, sy + 3, 2.2, 0, Math.PI * 1.5); c.stroke();
      /* Ribbon tails hanging beside the head */
      c.fillStyle = suitC;
      c.beginPath();
      c.moveTo(sx + 4, sy + 6);
      c.quadraticCurveTo(sx + 0, sy + 14, sx + 2, sy + 24);
      c.lineTo(sx + 5, sy + 24);
      c.quadraticCurveTo(sx + 5, sy + 14, sx + 7, sy + 6);
      c.closePath();
      c.fill();
      c.beginPath();
      c.moveTo(sx + 24, sy + 6);
      c.quadraticCurveTo(sx + 28, sy + 14, sx + 26, sy + 24);
      c.lineTo(sx + 23, sy + 24);
      c.quadraticCurveTo(sx + 23, sy + 14, sx + 21, sy + 6);
      c.closePath();
      c.fill();
    } else {
      /* twinTails (default) with bow accents at the roots */
      c.fillStyle = hairC;
      c.beginPath();
      c.moveTo(sx + 3, sy + 10);
      c.bezierCurveTo(sx - 3, sy + 18, sx - 2, sy + 26, sx + 1, sy + 30);
      c.bezierCurveTo(sx - 2, sy + 28, sx - 4, sy + 24, sx - 1, sy + 20);
      c.bezierCurveTo(sx + 1, sy + 16, sx + 2, sy + 12, sx + 5, sy + 11);
      c.closePath();
      c.fill();
      c.beginPath();
      c.moveTo(sx + 25, sy + 10);
      c.bezierCurveTo(sx + 31, sy + 18, sx + 30, sy + 26, sx + 27, sy + 30);
      c.bezierCurveTo(sx + 30, sy + 28, sx + 32, sy + 24, sx + 29, sy + 20);
      c.bezierCurveTo(sx + 27, sy + 16, sx + 26, sy + 12, sx + 23, sy + 11);
      c.closePath();
      c.fill();
      /* Ribbon bows */
      function drawBow(bx, by) {
        c.fillStyle = suitC;
        c.beginPath(); c.ellipse(bx - 1.6, by, 1.6, 1.9, -0.3, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.ellipse(bx + 1.6, by, 1.6, 1.9, 0.3, 0, Math.PI * 2); c.fill();
        c.fillStyle = suitShade;
        c.beginPath(); c.arc(bx, by, 0.75, 0, Math.PI * 2); c.fill();
      }
      drawBow(sx + 4, sy + 11);
      drawBow(sx + 24, sy + 11);
    }

    /* ---------- Hair dome + face + bangs ---------- */
    c.fillStyle = hairC;
    c.beginPath();
    c.ellipse(sx + 14, sy + 6, 12, 7, 0, Math.PI, 0);
    c.fill();

    c.fillStyle = skinC;
    c.beginPath();
    c.ellipse(sx + 14, sy + 12, 8, 7.5, 0, 0, Math.PI * 2);
    c.fill();

    c.fillStyle = hairC;
    c.beginPath();
    c.moveTo(sx + 6, sy + 7);
    c.quadraticCurveTo(sx + 10, sy + 12, sx + 14, sy + 10);
    c.quadraticCurveTo(sx + 18, sy + 12, sx + 22, sy + 7);
    c.quadraticCurveTo(sx + 21, sy + 4, sx + 14, sy + 3);
    c.quadraticCurveTo(sx + 7, sy + 4, sx + 6, sy + 7);
    c.closePath();
    c.fill();
    c.beginPath(); c.ellipse(sx + 6, sy + 14, 2.2, 5, 0.15, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(sx + 22, sy + 14, 2.2, 5, -0.15, 0, Math.PI * 2); c.fill();

    /* (Peach tiara removed — Momoko now wears just her bubble helmet.) */

    /* ---------- Eyes ---------- */
    /* White sclera */
    c.fillStyle = '#ffffff';
    c.beginPath(); c.ellipse(sx + 10.3, sy + 13, 2.9, 3.6, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(sx + 17.7, sy + 13, 2.9, 3.6, 0, 0, Math.PI * 2); c.fill();
    /* Iris */
    c.fillStyle = '#6e3a4a';
    c.beginPath(); c.ellipse(sx + 10.3, sy + 13.3, 2.3, 3.0, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(sx + 17.7, sy + 13.3, 2.3, 3.0, 0, 0, Math.PI * 2); c.fill();
    /* Inner iris glow */
    c.fillStyle = '#b0606e';
    c.beginPath(); c.arc(sx + 10.3, sy + 13.6, 1.3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 17.7, sy + 13.6, 1.3, 0, Math.PI * 2); c.fill();
    /* Pupil */
    c.fillStyle = '#1a0c14';
    c.beginPath(); c.arc(sx + 10.3, sy + 13.9, 0.7, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 17.7, sy + 13.9, 0.7, 0, Math.PI * 2); c.fill();
    /* Star sparkle highlight */
    c.fillStyle = '#ffffff';
    fillStar(c, sx + 11, sy + 12, 1.2);
    fillStar(c, sx + 18.4, sy + 12, 1.2);
    /* Secondary round highlight */
    c.beginPath(); c.arc(sx + 9.5, sy + 14.3, 0.5, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 16.9, sy + 14.3, 0.5, 0, Math.PI * 2); c.fill();

    /* Eyelashes – upper arc + outer flicks */
    c.strokeStyle = '#1a0c14';
    c.lineWidth = 0.9;
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(sx + 7.8, sy + 10.8); c.quadraticCurveTo(sx + 10.3, sy + 9.3, sx + 12.9, sy + 10.8); c.stroke();
    c.beginPath(); c.moveTo(sx + 15.1, sy + 10.8); c.quadraticCurveTo(sx + 17.7, sy + 9.3, sx + 20.2, sy + 10.8); c.stroke();
    c.lineWidth = 0.7;
    c.beginPath(); c.moveTo(sx + 7.8, sy + 10.8); c.lineTo(sx + 6.9, sy + 10.0); c.stroke();
    c.beginPath(); c.moveTo(sx + 20.2, sy + 10.8); c.lineTo(sx + 21.1, sy + 10.0); c.stroke();

    /* ---------- Blush + mouth ---------- */
    c.fillStyle = 'rgba(255,160,190,0.78)';
    c.beginPath(); c.ellipse(sx + 7.5, sy + 15.9, 2.2, 1.3, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(sx + 20.5, sy + 15.9, 2.2, 1.3, 0, 0, Math.PI * 2); c.fill();

    c.strokeStyle = '#b24a5a';
    c.lineWidth = 0.95;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(sx + 14, sy + 17, 1.3, 0.2, Math.PI - 0.2);
    c.stroke();

    /* ---------- Neck ---------- */
    c.fillStyle = skinC;
    c.fillRect(sx + 12, sy + 18.5, 4, 1.5);

    /* ---------- Outfit ---------- */
    if (outfit === 'frillyDress' || outfit === 'sailorDress' || outfit === 'starDress') {
      /* Bodice */
      c.fillStyle = suitC;
      c.beginPath();
      c.moveTo(sx + 7, sy + 21);
      c.quadraticCurveTo(sx + 10, sy + 19.5, sx + 14, sy + 20.2);
      c.quadraticCurveTo(sx + 18, sy + 19.5, sx + 21, sy + 21);
      c.lineTo(sx + 20, sy + 25);
      c.lineTo(sx + 8, sy + 25);
      c.closePath();
      c.fill();
      if (outfit === 'frillyDress') {
        /* Lace collar + heart gem */
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.moveTo(sx + 10, sy + 20);
        c.quadraticCurveTo(sx + 14, sy + 22, sx + 18, sy + 20);
        c.lineTo(sx + 17.5, sy + 21);
        c.quadraticCurveTo(sx + 14, sy + 23, sx + 10.5, sy + 21);
        c.closePath();
        c.fill();
        var hcx = sx + 14, hcy = sy + 22.6;
        c.fillStyle = '#ff5577';
        c.beginPath();
        c.arc(hcx - 0.6, hcy - 0.3, 0.65, 0, Math.PI * 2);
        c.arc(hcx + 0.6, hcy - 0.3, 0.65, 0, Math.PI * 2);
        c.moveTo(hcx - 1.15, hcy);
        c.lineTo(hcx, hcy + 1.3);
        c.lineTo(hcx + 1.15, hcy);
        c.closePath();
        c.fill();
      } else if (outfit === 'sailorDress') {
        /* Sailor-dress collar */
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.moveTo(sx + 9, sy + 20.5);
        c.lineTo(sx + 14, sy + 23.5);
        c.lineTo(sx + 19, sy + 20.5);
        c.lineTo(sx + 17, sy + 20.5);
        c.lineTo(sx + 14, sy + 22.2);
        c.lineTo(sx + 11, sy + 20.5);
        c.closePath();
        c.fill();
        c.strokeStyle = suitShade;
        c.lineWidth = 0.5;
        c.beginPath();
        c.moveTo(sx + 10, sy + 21);
        c.lineTo(sx + 14, sy + 23);
        c.lineTo(sx + 18, sy + 21);
        c.stroke();
      } else {
        /* Star dress – gold bow at the chest and a wide star in place of
           a collar. Bodice stays the suit color for tintability. */
        c.fillStyle = '#ffd24a';
        c.beginPath();
        c.ellipse(sx + 12.4, sy + 21.2, 1.5, 1.2, -0.3, 0, Math.PI * 2); c.fill();
        c.beginPath();
        c.ellipse(sx + 15.6, sy + 21.2, 1.5, 1.2, 0.3, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#c88a1a';
        c.beginPath(); c.arc(sx + 14, sy + 21.2, 0.7, 0, Math.PI * 2); c.fill();
        /* Gold star medallion below the bow */
        c.fillStyle = '#fff4a8';
        fillStar(c, sx + 14, sy + 23.5, 1.4);
      }
      /* Flared skirt */
      c.fillStyle = suitC;
      c.beginPath();
      c.moveTo(sx + 8, sy + 25);
      c.lineTo(sx + 5, sy + 30);
      c.lineTo(sx + 23, sy + 30);
      c.lineTo(sx + 20, sy + 25);
      c.closePath();
      c.fill();
      /* Hem decoration: scalloped for frilly/sailor, star-sprinkled for
         starDress */
      if (outfit === 'starDress') {
        c.fillStyle = '#ffd24a';
        fillStar(c, sx +  7, sy + 28.5, 0.9);
        fillStar(c, sx + 11, sy + 29.4, 0.8);
        fillStar(c, sx + 15, sy + 28.2, 0.9);
        fillStar(c, sx + 19, sy + 29.3, 0.8);
        /* Silver trim along the hem */
        c.strokeStyle = '#ffffff';
        c.lineWidth = 0.7;
        c.beginPath();
        c.moveTo(sx + 5, sy + 30);
        c.lineTo(sx + 23, sy + 30);
        c.stroke();
      } else {
        c.fillStyle = '#ffffff';
        for (var s = 0; s < 5; s++) {
          var scx = sx + 6 + s * 4;
          c.beginPath(); c.arc(scx, sy + 30.5, 1.3, Math.PI, 0); c.fill();
        }
      }
      /* Skirt shading wedge */
      c.fillStyle = suitShade;
      c.beginPath();
      c.moveTo(sx + 14, sy + 25);
      c.lineTo(sx + 14, sy + 30);
      c.lineTo(sx + 18, sy + 30);
      c.lineTo(sx + 17, sy + 25);
      c.closePath();
      c.fill();
    } else if (outfit === 'frillyBikini') {
      /* "Sparkle Astro Suit" — bulky pink space suit with a glittering chest panel. */
      /* Oxygen tank backpack */
      c.fillStyle = hexShade(suitC, 50);
      c.fillRect(sx + 6, sy + 20.5, 1.8, 9);
      c.fillRect(sx + 20.2, sy + 20.5, 1.8, 9);
      /* Suit torso */
      c.fillStyle = suitC;
      c.fillRect(sx + 7, sy + 20.5, 14, 10);
      /* Belt */
      c.fillStyle = hexShade(suitC, 60);
      c.fillRect(sx + 7, sy + 26.5, 14, 1.6);
      /* Glittery chest panel */
      c.fillStyle = suitLight;
      c.fillRect(sx + 10, sy + 21.5, 8, 4.5);
      c.fillStyle = '#fff4a8';
      fillStar(c, sx + 12, sy + 23.5, 1);
      fillStar(c, sx + 16, sy + 23.5, 1);
      fillStar(c, sx + 14, sy + 25.5, 0.9);
      /* Gold collar ring */
      c.fillStyle = '#ffd24a';
      c.fillRect(sx + 9, sy + 19.8, 10, 1.2);
      /* Suit shoulder seams */
      c.strokeStyle = hexShade(suitC, 60);
      c.lineWidth = 0.6;
      c.beginPath(); c.moveTo(sx + 9, sy + 20.5); c.lineTo(sx + 9, sy + 30); c.stroke();
      c.beginPath(); c.moveTo(sx + 19, sy + 20.5); c.lineTo(sx + 19, sy + 30); c.stroke();
    } else if (outfit === 'sailorSwimsuit') {
      /* "Cadet Astro" — boxy cadet space suit with a chest control panel. */
      /* Backpack */
      c.fillStyle = hexShade(suitC, 50);
      c.fillRect(sx + 6, sy + 20.5, 2, 10);
      c.fillRect(sx + 20, sy + 20.5, 2, 10);
      /* Torso */
      c.fillStyle = suitC;
      c.fillRect(sx + 8, sy + 20.5, 12, 10);
      /* Sailor collar */
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(sx + 9, sy + 20.5);
      c.lineTo(sx + 14, sy + 23.5);
      c.lineTo(sx + 19, sy + 20.5);
      c.closePath();
      c.fill();
      /* Chest control panel */
      c.fillStyle = '#222238';
      c.fillRect(sx + 11, sy + 24, 6, 3.5);
      /* Indicator lights */
      c.fillStyle = '#44ff88';
      c.fillRect(sx + 12, sy + 24.7, 1.2, 1.2);
      c.fillStyle = '#ff4466';
      c.fillRect(sx + 14, sy + 24.7, 1.2, 1.2);
      c.fillStyle = '#ffd24a';
      c.fillRect(sx + 16, sy + 24.7, 1.2, 1.2);
      /* Belt */
      c.fillStyle = hexShade(suitC, 60);
      c.fillRect(sx + 8, sy + 28.2, 12, 1.4);
      /* Belt buckle */
      c.fillStyle = '#ffd24a';
      c.fillRect(sx + 13, sy + 28, 2, 1.8);
    } else if (outfit === 'onePiece') {
      /* "Sleek Jumpsuit" — fitted astronaut jumpsuit with reflective stripes. */
      c.fillStyle = suitC;
      c.beginPath();
      c.moveTo(sx + 8.5, sy + 20.2);
      c.quadraticCurveTo(sx + 14, sy + 19, sx + 19.5, sy + 20.2);
      c.lineTo(sx + 19.5, sy + 30);
      c.lineTo(sx + 8.5, sy + 30);
      c.closePath();
      c.fill();
      /* Reflective shoulder stripes */
      c.fillStyle = '#cce4ff';
      c.fillRect(sx + 9, sy + 20.4, 10, 0.7);
      c.fillRect(sx + 9, sy + 22.0, 10, 0.5);
      /* Center zipper */
      c.strokeStyle = hexShade(suitC, 80);
      c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(sx + 14, sy + 20); c.lineTo(sx + 14, sy + 30); c.stroke();
      /* Mission patch on chest — gold star */
      c.fillStyle = '#ffd24a';
      c.beginPath(); c.arc(sx + 11.5, sy + 24, 1.6, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff4a8';
      fillStar(c, sx + 11.5, sy + 24, 1.2);
      /* Glove cuffs (white) */
      c.fillStyle = '#ffffff';
      c.fillRect(sx + 8.5, sy + 28.5, 2, 1.5);
      c.fillRect(sx + 17.5, sy + 28.5, 2, 1.5);
      /* Belt */
      c.fillStyle = hexShade(suitC, 60);
      c.fillRect(sx + 8.5, sy + 26.6, 11, 1);
    } else {
      /* Classic t-shirt */
      c.fillStyle = suitC;
      c.beginPath();
      c.moveTo(sx + 7, sy + 21);
      c.quadraticCurveTo(sx + 10, sy + 19.5, sx + 14, sy + 20.2);
      c.quadraticCurveTo(sx + 18, sy + 19.5, sx + 21, sy + 21);
      c.lineTo(sx + 21, sy + 26);
      c.lineTo(sx + 7, sy + 26);
      c.closePath();
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.2)';
      c.beginPath();
      c.moveTo(sx + 12, sy + 20);
      c.quadraticCurveTo(sx + 14, sy + 21.5, sx + 16, sy + 20);
      c.lineTo(sx + 16, sy + 20.5);
      c.quadraticCurveTo(sx + 14, sy + 22, sx + 12, sy + 20.5);
      c.closePath();
      c.fill();
    }

    /* ---------- Arms ---------- */
    c.fillStyle = skinC;
    c.beginPath();
    c.ellipse(sx + 5.5, sy + 24, 1.7, 2.8, 0.1, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(sx + 23, sy + 23, 2.3, 1.9, -0.2, 0, Math.PI * 2);
    c.fill();

    /* ---------- Magical-girl bubble wand ----------
       Pink handle with a gold band + heart detail, then a gold shaft
       tipped with a yellow star gem so it reads as a precure wand at
       a glance rather than a weapon. Extends past the sprite's 28px
       footprint which is fine – her hit-box is unchanged. */
    /* Handle */
    c.fillStyle = '#ff99cc';
    c.beginPath();
    c.ellipse(sx + 26.4, sy + 23, 2.2, 2.6, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = hexShade('#ff99cc', 30);
    c.beginPath();
    c.ellipse(sx + 26.4, sy + 24.5, 1.6, 0.9, 0, 0, Math.PI * 2);
    c.fill();
    /* Gold band around the grip */
    c.fillStyle = '#ffd24a';
    c.fillRect(sx + 27.7, sy + 21.8, 1.3, 2.4);
    /* Tiny heart on handle */
    c.fillStyle = '#ff3366';
    var hhx = sx + 26.3, hhy = sy + 23.2;
    c.beginPath();
    c.arc(hhx - 0.45, hhy - 0.3, 0.45, 0, Math.PI * 2);
    c.arc(hhx + 0.45, hhy - 0.3, 0.45, 0, Math.PI * 2);
    c.moveTo(hhx - 0.85, hhy);
    c.lineTo(hhx, hhy + 0.9);
    c.lineTo(hhx + 0.85, hhy);
    c.closePath();
    c.fill();
    /* Gold shaft */
    c.strokeStyle = '#ffd24a';
    c.lineWidth = 1.3;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(sx + 29, sy + 23);
    c.lineTo(sx + 33.5, sy + 23);
    c.stroke();
    /* Star gem at the tip */
    c.fillStyle = '#ffffff';
    fillStar(c, sx + 35, sy + 23, 2.2);
    c.fillStyle = '#ffe066';
    fillStar(c, sx + 35, sy + 23, 1.6);
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(sx + 35.4, sy + 22.3, 0.5, 0, Math.PI * 2); c.fill();
    /* Sparkle dots around the tip */
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.beginPath(); c.arc(sx + 37.2, sy + 21.5, 0.4, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 37.5, sy + 24.4, 0.3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 33.5, sy + 21.2, 0.3, 0, Math.PI * 2); c.fill();

    /* ---------- Held food (left hand) ---------- */
    if (food !== 'none') {
      var fx = sx + 4, fy = sy + 22;
      if (food === 'iceCream') {
        c.fillStyle = '#e0b070';
        c.beginPath();
        c.moveTo(fx - 1.5, fy + 2);
        c.lineTo(fx + 1.5, fy + 2);
        c.lineTo(fx, fy + 6);
        c.closePath();
        c.fill();
        c.strokeStyle = '#9a7048';
        c.lineWidth = 0.5;
        c.beginPath(); c.moveTo(fx - 1, fy + 2.5); c.lineTo(fx + 0.8, fy + 5); c.stroke();
        c.fillStyle = '#ffc8d4';
        c.beginPath(); c.arc(fx, fy + 1, 2.2, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#ff3355';
        c.beginPath(); c.arc(fx, fy - 1.3, 0.7, 0, Math.PI * 2); c.fill();
      } else if (food === 'onigiri') {
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.moveTo(fx, fy - 1.5);
        c.lineTo(fx - 2.4, fy + 2.5);
        c.lineTo(fx + 2.4, fy + 2.5);
        c.closePath();
        c.fill();
        c.fillStyle = '#2a3a2a';
        c.fillRect(fx - 2, fy + 1, 4, 1.4);
        c.fillStyle = 'rgba(255,160,180,0.6)';
        c.beginPath(); c.arc(fx - 0.9, fy + 0.5, 0.4, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(fx + 0.9, fy + 0.5, 0.4, 0, Math.PI * 2); c.fill();
      } else if (food === 'donut') {
        c.fillStyle = '#c88858';
        c.beginPath(); c.arc(fx, fy + 1, 2.3, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#ff99cc';
        c.beginPath(); c.arc(fx, fy + 1, 2.1, Math.PI + 0.3, -0.3, false); c.fill();
        c.fillStyle = '#ffe4b0';
        c.beginPath(); c.arc(fx, fy + 1, 0.75, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#ffff66'; c.fillRect(fx - 1, fy - 0.2, 0.4, 0.4);
        c.fillStyle = '#66ddff'; c.fillRect(fx + 0.8, fy, 0.4, 0.4);
        c.fillStyle = '#ff66aa'; c.fillRect(fx - 0.2, fy + 0.5, 0.4, 0.4);
      } else if (food === 'crepe') {
        /* Rolled cream crepe – beige cone wrap with pink cream peeking */
        c.fillStyle = '#f2d8a4';
        c.beginPath();
        c.moveTo(fx - 2, fy - 2);
        c.lineTo(fx + 2, fy - 2);
        c.lineTo(fx, fy + 4);
        c.closePath();
        c.fill();
        /* Cream */
        c.fillStyle = '#ffdceb';
        c.beginPath(); c.arc(fx, fy - 1.8, 1.4, Math.PI, 0); c.fill();
        /* Berry */
        c.fillStyle = '#dd3355';
        c.beginPath(); c.arc(fx - 0.6, fy - 2.2, 0.55, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#2a5d2a';
        c.fillRect(fx - 0.8, fy - 2.7, 0.4, 0.4);
      } else if (food === 'taiyaki') {
        /* Fish-shaped pastry */
        c.fillStyle = '#cc8844';
        c.beginPath();
        c.ellipse(fx, fy + 1, 3, 1.8, 0, 0, Math.PI * 2);
        c.fill();
        /* Tail fin */
        c.beginPath();
        c.moveTo(fx + 2.5, fy + 1);
        c.lineTo(fx + 4, fy - 0.5);
        c.lineTo(fx + 4, fy + 2.5);
        c.closePath();
        c.fill();
        /* Side highlight */
        c.fillStyle = '#e0a868';
        c.beginPath(); c.ellipse(fx - 0.5, fy + 0.3, 1.6, 0.5, 0, 0, Math.PI * 2); c.fill();
        /* Eye */
        c.fillStyle = '#1a0c14';
        c.beginPath(); c.arc(fx - 1.8, fy + 0.5, 0.3, 0, Math.PI * 2); c.fill();
        /* Scale line */
        c.strokeStyle = '#8a5520';
        c.lineWidth = 0.3;
        c.beginPath();
        c.moveTo(fx - 1, fy + 0.2); c.lineTo(fx + 1.5, fy + 0.2);
        c.stroke();
      } else if (food === 'parfait') {
        /* Glass with stacked layers, cream swirl on top */
        /* Glass cup */
        c.strokeStyle = 'rgba(255,255,255,0.6)';
        c.lineWidth = 0.4;
        c.strokeRect(fx - 1.6, fy - 1.5, 3.2, 5);
        /* Chocolate layer (bottom) */
        c.fillStyle = '#6b3a1a';
        c.fillRect(fx - 1.4, fy + 2, 2.8, 1.3);
        /* Cream layer */
        c.fillStyle = '#fff4dc';
        c.fillRect(fx - 1.4, fy + 0.7, 2.8, 1.3);
        /* Strawberry layer */
        c.fillStyle = '#ff6688';
        c.fillRect(fx - 1.4, fy - 0.6, 2.8, 1.3);
        /* Whipped cream swirl */
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(fx, fy - 1.8, 1.3, Math.PI, 0); c.fill();
        c.beginPath(); c.arc(fx - 0.5, fy - 2.3, 0.7, Math.PI, 0); c.fill();
        c.beginPath(); c.arc(fx + 0.3, fy - 2.6, 0.5, Math.PI, 0); c.fill();
        /* Cherry */
        c.fillStyle = '#dd2244';
        c.beginPath(); c.arc(fx + 0.6, fy - 2.9, 0.5, 0, Math.PI * 2); c.fill();
      } else if (food === 'macaron') {
        /* Two pastel shells with a cream filling */
        c.fillStyle = '#ffbadb';
        c.beginPath();
        c.ellipse(fx, fy - 0.8, 2.4, 1.1, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#ffffff';
        c.fillRect(fx - 2.4, fy - 0.1, 4.8, 0.9);
        c.fillStyle = '#ff9ac2';
        c.beginPath();
        c.ellipse(fx, fy + 1.3, 2.4, 1.1, 0, 0, Math.PI * 2);
        c.fill();
        /* Top sheen */
        c.fillStyle = 'rgba(255,255,255,0.5)';
        c.beginPath();
        c.ellipse(fx - 0.8, fy - 1, 1, 0.3, 0, 0, Math.PI * 2);
        c.fill();
      } else if (food === 'strawberry') {
        /* Red cone with leafy cap and seed dots */
        c.fillStyle = '#e8344a';
        c.beginPath();
        c.moveTo(fx - 2, fy - 1);
        c.quadraticCurveTo(fx, fy + 4, fx + 2, fy - 1);
        c.closePath();
        c.fill();
        /* Seeds */
        c.fillStyle = '#fff4a8';
        c.beginPath(); c.arc(fx - 0.8, fy + 0.5, 0.25, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(fx + 0.6, fy + 0.3, 0.25, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(fx, fy + 1.6, 0.25, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(fx - 1.1, fy + 1.9, 0.25, 0, Math.PI * 2); c.fill();
        /* Green cap */
        c.fillStyle = '#3caf3c';
        c.beginPath();
        c.moveTo(fx - 2.2, fy - 1);
        c.lineTo(fx - 0.6, fy - 1.8);
        c.lineTo(fx + 0.6, fy - 1.8);
        c.lineTo(fx + 2.2, fy - 1);
        c.lineTo(fx, fy - 0.2);
        c.closePath();
        c.fill();
      }
    }

    /* ---------- Space helmet overlay ---------- */
    /* Translucent bubble helmet with a cyan rim and faint shine.
       Drawn on top of everything so it reads clearly. */
    var hx = sx + 14;
    var hy = sy + 7;
    c.save();
    /* Rim ring */
    c.strokeStyle = '#44ffff';
    c.lineWidth = 1.2;
    c.globalAlpha = 0.9;
    c.beginPath();
    c.arc(hx, hy, 11, 0, Math.PI * 2);
    c.stroke();
    /* Helmet fill */
    c.globalAlpha = 0.15;
    c.fillStyle = '#aaddff';
    c.beginPath();
    c.arc(hx, hy, 11, 0, Math.PI * 2);
    c.fill();
    /* Shine highlight */
    c.globalAlpha = 0.45;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.ellipse(hx - 3, hy - 4, 3, 1.5, -0.5, 0, Math.PI * 2);
    c.fill();
    c.restore();

    /* ---------- Glove cuffs ---------- */
    c.fillStyle = '#44ffff';
    c.fillRect(sx + 1, sy + 18, 4, 1.5);
    c.fillRect(sx + 23, sy + 18, 4, 1.5);
  }

  /* Pet-dog companion — re-themed from crab. `variant` picks the coat
     palette (brown/blue/gold remapped to brown/spotted/golden) or 'none'. */
  function drawCrabPet(c, px, py, variant, frame) {
    if (!variant || variant === 'none') return;
    var body, accent;
    if (variant === 'blue' || variant === 'spotted') {
      body = '#dddddd'; accent = '#553322';
    } else if (variant === 'gold' || variant === 'golden') {
      body = '#ffcc66'; accent = '#aa6622';
    } else {
      /* red → brown */
      body = '#8a5a32'; accent = '#5a3818';
    }
    var wobble = Math.sin((frame || 0) * 0.2) * 0.8;
    /* Body — plump ellipse */
    c.fillStyle = body;
    c.beginPath();
    c.ellipse(px, py, 6, 4, 0, 0, Math.PI * 2);
    c.fill();
    /* Head */
    c.beginPath();
    c.arc(px - 5, py - 1, 3, 0, Math.PI * 2);
    c.fill();
    /* Ear */
    c.fillStyle = accent;
    c.beginPath();
    c.moveTo(px - 6, py - 3.5);
    c.lineTo(px - 4.5, py - 4.6);
    c.lineTo(px - 4, py - 3);
    c.closePath();
    c.fill();
    /* Spots for 'spotted' coat */
    if (variant === 'blue' || variant === 'spotted') {
      c.fillStyle = '#443322';
      c.beginPath(); c.arc(px + 1, py - 1, 0.9, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(px + 3, py + 1, 0.8, 0, Math.PI * 2); c.fill();
    }
    /* Snout */
    c.fillStyle = accent;
    c.beginPath(); c.arc(px - 7, py, 0.8, 0, Math.PI * 2); c.fill();
    /* Eye */
    c.fillStyle = '#000000';
    c.beginPath(); c.arc(px - 5.5, py - 1.4, 0.5, 0, Math.PI * 2); c.fill();
    /* Tail (wagging) */
    c.strokeStyle = body;
    c.lineWidth = 1.8;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(px + 5, py - 1);
    c.lineTo(px + 8, py - 2 + wobble * 2);
    c.stroke();
    /* Legs */
    c.strokeStyle = accent;
    c.lineWidth = 0.9;
    c.beginPath();
    c.moveTo(px - 3, py + 3); c.lineTo(px - 3, py + 4.8);
    c.moveTo(px - 1, py + 3); c.lineTo(px - 1, py + 4.8);
    c.moveTo(px + 1, py + 3); c.lineTo(px + 1, py + 4.8);
    c.moveTo(px + 3, py + 3); c.lineTo(px + 3, py + 4.8);
    c.stroke();
  }

  Momoko.prototype.draw = function (c, camX, camY) {
    var sx = Math.round(this.x - camX);
    var sy = Math.round(this.y - camY);
    var cust = window.Game.customization || {};

    c.save();
    if (this.facing === -1) {
      c.translate(sx + this.w / 2, 0);
      c.scale(-1, 1);
      sx = -this.w / 2;
    }
    drawMomokoSprite(c, sx, sy, cust, this.animFrame);
    /* Crab pet trails at foot level; drawn inside the flip transform so
       it stays on the side opposite the facing direction (i.e. behind
       her as she swims). */
    if (cust.crab && cust.crab !== 'none') {
      drawCrabPet(c, sx - 8, sy + 32, cust.crab, this.animTimer);
    }
    c.restore();
  };

  /* Floss-dance Momoko – arms swing rigid across the body while the hips
     tilt the opposite direction on each beat. Phase is in radians so the
     caller can drive it off a timer. Drawn at the same 28×34 footprint
     so it drops into the existing sprite slot. */
  function drawMomokoFloss(c, sx, sy, cust, phase) {
    var hairC = (cust && cust.hair) || '#e06088';
    var shirtC = (cust && cust.suit) || '#3366aa';
    var skinC = (cust && cust.skin) || '#ffddbb';
    var shoeC = (cust && cust.flipper) || '#33bb77';
    /* Soft-clamped sigmoid (tanh of a boosted sine) gives smooth in-
       between frames while still "holding" near ±1 at each beat, so
       the pose reads as floss instead of a lazy hula. `beat` is used
       in the drawing math where it treats the value as a scalar
       displacement – any value in [-1, 1] is fine. */
    var beat = Math.tanh(Math.sin(phase) * 3.2);
    /* Secondary bob that never zeroes out, for subtle motion during
       the "hold" portion of each beat. */
    var ease = Math.sin(phase * 2) * 0.3;
    var hipShift = beat * 2;
    var bodyTilt = beat * 0.08;

    c.save();
    c.translate(sx + 14, sy + 22);
    c.rotate(bodyTilt);
    c.translate(-14, -22);

    /* Pants – shifted by hip motion */
    c.fillStyle = '#3a2a18';
    c.fillRect(9 + hipShift, 25, 4, 7);
    c.fillRect(15 + hipShift, 25, 4, 7);

    /* Shoes */
    c.fillStyle = shoeC;
    c.beginPath();
    c.ellipse(11 + hipShift, 33, 3, 1.6, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(17 + hipShift, 33, 3, 1.6, 0, 0, Math.PI * 2);
    c.fill();

    /* Back hair – swings opposite to hips for floss feel */
    function darken(hex, amt) {
      var n = parseInt(hex.slice(1), 16);
      var r = Math.max(0, ((n >> 16) & 255) - amt);
      var g = Math.max(0, ((n >> 8) & 255) - amt);
      var b = Math.max(0, (n & 255) - amt);
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    }
    c.fillStyle = darken(hairC, 40);
    c.beginPath();
    c.moveTo(3 - beat, 9);
    c.bezierCurveTo(-1 - beat, 20, 1 - beat, 27, 5 - beat, 30);
    c.lineTo(23 - beat, 30);
    c.bezierCurveTo(27 - beat, 27, 29 - beat, 20, 25 - beat, 9);
    c.closePath();
    c.fill();

    /* Pigtails swinging */
    c.fillStyle = hairC;
    c.beginPath();
    c.moveTo(3 - beat, 10);
    c.bezierCurveTo(-3 - beat * 2, 18, -2 - beat * 2, 26, 1 - beat * 2, 30);
    c.bezierCurveTo(-2 - beat * 2, 28, -4 - beat * 2, 24, -1 - beat * 2, 20);
    c.bezierCurveTo(1 - beat, 16, 2 - beat, 12, 5 - beat, 11);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(25 - beat, 10);
    c.bezierCurveTo(31 - beat * 2, 18, 30 - beat * 2, 26, 27 - beat * 2, 30);
    c.bezierCurveTo(30 - beat * 2, 28, 32 - beat * 2, 24, 29 - beat * 2, 20);
    c.bezierCurveTo(27 - beat, 16, 26 - beat, 12, 23 - beat, 11);
    c.closePath();
    c.fill();

    /* Crown / bangs */
    c.fillStyle = hairC;
    c.beginPath();
    c.ellipse(14, 6, 12, 7, 0, Math.PI, 0);
    c.fill();

    /* Face */
    c.fillStyle = skinC;
    c.beginPath();
    c.ellipse(14, 12, 8, 7.5, 0, 0, Math.PI * 2);
    c.fill();

    /* Front bangs */
    c.fillStyle = hairC;
    c.beginPath();
    c.moveTo(6, 7);
    c.quadraticCurveTo(10, 12, 14, 10);
    c.quadraticCurveTo(18, 12, 22, 7);
    c.quadraticCurveTo(21, 4, 14, 3);
    c.quadraticCurveTo(7, 4, 6, 7);
    c.closePath();
    c.fill();
    c.beginPath();
    c.ellipse(6, 14, 2.2, 5, 0.15, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(22, 14, 2.2, 5, -0.15, 0, Math.PI * 2);
    c.fill();

    /* Peach tiara – matches drawMomokoSprite so the pause pose reads as
       the same character. */
    c.strokeStyle = '#ffd24a';
    c.lineWidth = 1.3;
    c.beginPath();
    c.arc(14, 8, 6.5, Math.PI + 0.55, -0.55);
    c.stroke();
    c.fillStyle = '#fff4a8';
    c.beginPath(); c.arc(9.2, 4.6, 0.7, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(18.8, 4.6, 0.7, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffb8a0';
    c.beginPath(); c.arc(13.4, 2.9, 1.9, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(14.6, 2.9, 1.9, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ff9a82';
    c.beginPath(); c.arc(14.5, 3.5, 1.2, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#5cbd5c';
    c.beginPath();
    c.ellipse(12.5, 0.8, 1.1, 0.55, -0.6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.beginPath(); c.arc(13.1, 2.3, 0.55, 0, Math.PI * 2); c.fill();

    /* Eyes – closed & happy (floss joy!) */
    c.strokeStyle = '#2a1a12';
    c.lineWidth = 1;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(10.5, 13, 1.8, Math.PI + 0.2, -0.2, false);
    c.stroke();
    c.beginPath();
    c.arc(17.5, 13, 1.8, Math.PI + 0.2, -0.2, false);
    c.stroke();

    /* Blush */
    c.fillStyle = 'rgba(255,170,195,0.65)';
    c.beginPath(); c.arc(8, 15.5, 1.6, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(20, 15.5, 1.6, 0, Math.PI * 2); c.fill();

    /* Big grinning mouth */
    c.fillStyle = '#b24a5a';
    c.beginPath();
    c.arc(14, 16.5, 2, 0, Math.PI);
    c.fill();
    c.fillStyle = '#ffffff';
    c.fillRect(12.5, 16.4, 3, 0.9);

    /* Neck */
    c.fillStyle = skinC;
    c.fillRect(12, 18.5, 4, 1.5);

    /* Shirt */
    c.fillStyle = shirtC;
    c.beginPath();
    c.moveTo(7, 21);
    c.quadraticCurveTo(10, 19.5, 14, 20.2);
    c.quadraticCurveTo(18, 19.5, 21, 21);
    c.lineTo(21, 26);
    c.lineTo(7, 26);
    c.closePath();
    c.fill();

    /* Floss arms: both swing to the same side (the hallmark of the move).
       When beat=+1, both arms cross to the right side of the body; when
       beat=-1, to the left. Arms drawn as stubby stick-figure segments
       with skin-tone hands. */
    c.strokeStyle = skinC;
    c.lineWidth = 3;
    c.lineCap = 'round';
    var armDir = -beat; /* opposite to hips */
    /* Top arm – goes across the front of the body */
    c.beginPath();
    c.moveTo(14 - armDir * 4, 22);
    c.lineTo(14 + armDir * 9, 21 + ease);
    c.stroke();
    /* Bottom arm – goes across behind the body (lower) */
    c.beginPath();
    c.moveTo(14 + armDir * 4, 23);
    c.lineTo(14 - armDir * 9, 26 - ease);
    c.stroke();
    /* Hands */
    c.fillStyle = skinC;
    c.beginPath(); c.arc(14 + armDir * 10, 21 + ease, 1.8, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(14 - armDir * 10, 26 - ease, 1.8, 0, Math.PI * 2); c.fill();

    c.restore();
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
  /* species: 'tropical' (default, fast-swimming reef fish), 'swordfish'
     (long/fast with a bill), 'blowfish' (round/slow, spiky, 2 HP),
     'clownfish' (orange with white stripes), 'angelfish' (tall/thin with
     trailing fins). Appearance, size, hp, and speed vary per species so
     levels can mix them for visual and gameplay variety. */
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
    } else if (this.species === 'angelfish') {
      this.w = 22; this.h = 22;
      this.hp = 1;
      this.speed = 1.0;
      this.color = '#f2d36b';
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
    else if (this.species === 'angelfish') drawAngelfish(c, sx, sy, this.color, this.timer);
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

  /* Angelfish → "Jellybot": jellyfish-style space alien with glowing tendrils. */
  function drawAngelfish(c, sx, sy, color, timer) {
    var cx = sx + 11, cy = sy + 9;
    var sway = Math.sin(timer * 0.07);
    /* Tendrils */
    c.strokeStyle = '#ff88ee';
    c.lineCap = 'round';
    for (var t = 0; t < 5; t++) {
      var tx = cx - 6 + t * 3;
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(tx, cy + 4);
      c.bezierCurveTo(
        tx + sway * 1.5, cy + 10,
        tx - sway * 1.5, cy + 16,
        tx + sway * 2, cy + 22
      );
      c.stroke();
    }
    /* Bell — domed top */
    c.fillStyle = '#cc66ff';
    c.beginPath();
    c.ellipse(cx, cy, 11, 8, 0, Math.PI, 0);
    c.fill();
    c.fillRect(cx - 11, cy, 22, 3);
    /* Bell highlights */
    c.fillStyle = '#ee99ff';
    c.beginPath();
    c.ellipse(cx - 3, cy - 3, 5, 3, 0, Math.PI, 0);
    c.fill();
    /* Glow dots along the rim */
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(cx - 8, cy + 2, 0.9, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(cx,     cy + 3, 0.9, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(cx + 8, cy + 2, 0.9, 0, Math.PI * 2); c.fill();
    /* Eyes */
    c.fillStyle = '#220044';
    c.beginPath(); c.arc(cx - 3, cy - 3, 1, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(cx + 3, cy - 3, 1, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(cx - 2.6, cy - 3.4, 0.4, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(cx + 3.4, cy - 3.4, 0.4, 0, Math.PI * 2); c.fill();
  }

  /* ========== OCTOPUS (Enemy) ========== */
  function Octopus(x, y) {
    this.spawnX = x;
    this.spawnY = y;
    this.x = x;
    this.y = y;
    this.w = 30;
    this.h = 30;
    this.hp = 2;
    this.maxHp = 2;
    this.speed = 0.5;
    this.timer = Math.random() * 200;
    this.active = true;
    this.flash = 0;
    this.tentaclePhase = 0;
  }

  Octopus.prototype.update = function () {
    if (!this.active) return;
    this.timer++;
    this.tentaclePhase += 0.08;
    if (this.flash > 0) this.flash--;

    /* Hover movement */
    this.x = this.spawnX + Math.sin(this.timer * 0.02) * 30;
    this.y = this.spawnY + Math.cos(this.timer * 0.025) * 20;
  };

  /* Floating UFO — comfortable RPG behavior, sparkle makes it twinkle. */
  Octopus.prototype.delight = function () {
    this.flash = 8;
    this.delighted = 60;
    Game.audio.play('pickup');
    return false;
  };

  Octopus.prototype.draw = function (c, camX, camY) {
    if (!this.active) return;
    if (this.flash > 0 && this.flash % 2 === 0) return;
    var sx = Math.round(this.x - camX);
    var sy = Math.round(this.y - camY);
    var tp = this.tentaclePhase;

    /* Tentacles – wavy bezier curves */
    c.strokeStyle = '#9944cc';
    c.lineCap = 'round';
    for (var i = 0; i < 8; i++) {
      var tx = sx + 3 + i * 3.5;
      var wave1 = Math.sin(tp + i * 0.8) * 6;
      var wave2 = Math.cos(tp + i * 0.5) * 4;
      c.lineWidth = 3.5 - i * 0.2;
      c.beginPath();
      c.moveTo(tx, sy + 20);
      c.bezierCurveTo(tx + wave1, sy + 26, tx - wave2, sy + 30, tx + wave1 * 0.5, sy + 34);
      c.stroke();
    }

    /* Head */
    c.fillStyle = '#aa55dd';
    c.beginPath();
    c.ellipse(sx + 15, sy + 12, 15, 12, 0, 0, Math.PI * 2);
    c.fill();

    /* Spots */
    c.fillStyle = '#cc77ee';
    c.beginPath(); c.arc(sx + 8, sy + 8, 3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 20, sy + 10, 2, 0, Math.PI * 2); c.fill();

    /* Eyes – round with pupils */
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(sx + 10, sy + 13, 4, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 20, sy + 13, 4, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#220033';
    c.beginPath(); c.arc(sx + 10, sy + 14, 2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 20, sy + 14, 2, 0, Math.PI * 2); c.fill();

    /* Angry eyebrows – arcs */
    c.strokeStyle = '#220033';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(sx + 10, sy + 11, 5, Math.PI + 0.3, Math.PI * 2 - 0.3);
    c.stroke();
    c.beginPath();
    c.arc(sx + 20, sy + 11, 5, Math.PI + 0.3, Math.PI * 2 - 0.3);
    c.stroke();
  };
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

    c.save();
    /* Body */
    c.fillStyle = '#996633';
    c.beginPath();
    c.ellipse(sx + 14, sy + 12, 14, 10, 0, 0, Math.PI * 2);
    c.fill();

    /* Belly */
    c.fillStyle = '#ccaa77';
    c.beginPath();
    c.ellipse(sx + 14, sy + 14, 8, 6, 0, 0, Math.PI * 2);
    c.fill();

    /* Head */
    c.fillStyle = '#996633';
    c.beginPath();
    c.arc(sx + 6, sy + 5, 8, 0, Math.PI * 2);
    c.fill();

    /* Ears */
    c.fillStyle = '#885522';
    c.beginPath(); c.arc(sx + 1, sy + 0, 3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 11, sy + 0, 3, 0, Math.PI * 2); c.fill();

    /* Eyes */
    c.fillStyle = '#000000';
    c.beginPath(); c.arc(sx + 4, sy + 5, 2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 9, sy + 5, 2, 0, Math.PI * 2); c.fill();
    /* Highlights */
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(sx + 4, sy + 4, 0.8, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(sx + 9, sy + 4, 0.8, 0, Math.PI * 2); c.fill();

    /* Nose */
    c.fillStyle = '#333333';
    c.beginPath(); c.arc(sx + 6, sy + 7, 1.5, 0, Math.PI * 2); c.fill();

    /* Whiskers */
    c.strokeStyle = '#664422';
    c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(sx + 0, sy + 6); c.lineTo(sx - 5, sy + 5);
    c.moveTo(sx + 0, sy + 8); c.lineTo(sx - 5, sy + 9);
    c.moveTo(sx + 12, sy + 6); c.lineTo(sx + 17, sy + 5);
    c.moveTo(sx + 12, sy + 8); c.lineTo(sx + 17, sy + 9);
    c.stroke();

    /* Tail – tapered bezier */
    c.fillStyle = '#885522';
    var tailWag = Math.sin(this.timer * 0.1) * 3;
    c.beginPath();
    c.moveTo(sx + 24, sy + 10);
    c.quadraticCurveTo(sx + 30, sy + 8 + tailWag, sx + 33, sy + 6 + tailWag);
    c.quadraticCurveTo(sx + 31, sy + 12 + tailWag, sx + 28, sy + 13);
    c.closePath();
    c.fill();

    /* Paws – rounded */
    c.fillStyle = '#885522';
    c.beginPath();
    c.ellipse(sx + 6, sy + 20, 3, 2.5, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(sx + 20, sy + 20, 3, 2.5, 0, 0, Math.PI * 2);
    c.fill();

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

    /* Body shell */
    c.fillStyle = '#d8442f';
    c.beginPath();
    c.ellipse(sx + 11, sy + 7, 10, 6, 0, 0, Math.PI * 2);
    c.fill();
    /* Shell highlight */
    c.fillStyle = '#f1735c';
    c.beginPath();
    c.ellipse(sx + 9, sy + 5, 6, 2.4, 0, 0, Math.PI * 2);
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
  /* Towering rocket — much taller than Momoko (her sprite is 34px high; the
     rocket is 150px so the player can stand at its base and see the cone
     filling the sky). */
  function RocketShip(x, y) {
    this.x = x;
    this.y = y;
    this.w = 90;
    this.h = 150;
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
    var sx = Math.round(this.x - camX);
    var sy = Math.round(this.y - camY);
    var cx = sx + 45; /* horizontal centerline */
    /* Outer drop shadow on the pad */
    c.save();
    c.globalAlpha = 0.35;
    c.fillStyle = '#000';
    c.beginPath();
    c.ellipse(cx, sy + 150, 50, 6, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();

    /* ----- Boosters (left & right strap-on tanks) ----- */
    var bGrad = c.createLinearGradient(sx, sy, sx + this.w, sy);
    bGrad.addColorStop(0, '#7a8896');
    bGrad.addColorStop(0.5, '#cdd8e2');
    bGrad.addColorStop(1, '#7a8896');
    c.fillStyle = bGrad;
    /* Left booster */
    c.beginPath();
    c.moveTo(sx + 8, sy + 60);
    c.lineTo(sx + 4, sy + 70);
    c.lineTo(sx + 4, sy + 130);
    c.lineTo(sx + 16, sy + 130);
    c.lineTo(sx + 16, sy + 60);
    c.closePath();
    c.fill();
    /* Right booster */
    c.beginPath();
    c.moveTo(sx + 74, sy + 60);
    c.lineTo(sx + 74, sy + 130);
    c.lineTo(sx + 86, sy + 130);
    c.lineTo(sx + 86, sy + 70);
    c.lineTo(sx + 82, sy + 60);
    c.closePath();
    c.fill();
    /* Booster nose cones */
    c.fillStyle = '#ff66cc';
    c.beginPath();
    c.moveTo(sx + 4, sy + 70); c.lineTo(sx + 10, sy + 50); c.lineTo(sx + 16, sy + 70);
    c.closePath(); c.fill();
    c.beginPath();
    c.moveTo(sx + 74, sy + 70); c.lineTo(sx + 80, sy + 50); c.lineTo(sx + 86, sy + 70);
    c.closePath(); c.fill();

    /* ----- Main body ----- */
    var mGrad = c.createLinearGradient(sx + 24, sy, sx + 66, sy);
    mGrad.addColorStop(0, '#aab5c2');
    mGrad.addColorStop(0.5, '#ffffff');
    mGrad.addColorStop(1, '#aab5c2');
    c.fillStyle = mGrad;
    c.beginPath();
    c.moveTo(cx, sy + 0);                 /* tip */
    c.lineTo(sx + 66, sy + 40);
    c.lineTo(sx + 66, sy + 130);
    c.lineTo(sx + 24, sy + 130);
    c.lineTo(sx + 24, sy + 40);
    c.closePath();
    c.fill();

    /* Nose cone — pink with stripes */
    c.fillStyle = '#ff4488';
    c.beginPath();
    c.moveTo(cx, sy + 0);
    c.lineTo(sx + 66, sy + 40);
    c.lineTo(sx + 24, sy + 40);
    c.closePath();
    c.fill();
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
    c.strokeStyle = 'rgba(0,0,0,0.18)';
    c.lineWidth = 1;
    var bandYs = [55, 80, 105];
    for (var ib = 0; ib < bandYs.length; ib++) {
      c.beginPath();
      c.moveTo(sx + 24, sy + bandYs[ib]);
      c.lineTo(sx + 66, sy + bandYs[ib]);
      c.stroke();
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
    c.fillStyle = '#44ccff';
    c.beginPath(); c.arc(cx, sy + 64, 11, 0, Math.PI * 2); c.fill();
    /* Window cross frame */
    c.strokeStyle = '#001a33';
    c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(cx - 11, sy + 64); c.lineTo(cx + 11, sy + 64); c.stroke();
    c.beginPath(); c.moveTo(cx, sy + 53); c.lineTo(cx, sy + 75); c.stroke();
    /* Reflection */
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(cx - 4, sy + 60, 3, 0, Math.PI * 2); c.fill();
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
    }

    /* "MOMOKO" mission badge below the window */
    c.fillStyle = '#ffd24a';
    c.fillRect(sx + 32, sy + 84, 26, 4);
    c.fillStyle = '#ff66cc';
    c.font = 'bold 4.5px monospace';
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
    c.fillStyle = '#ff66cc';
    c.beginPath();
    c.moveTo(sx + 24, sy + 110);
    c.lineTo(sx + 6, sy + 144);
    c.lineTo(sx + 24, sy + 144);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(sx + 66, sy + 110);
    c.lineTo(sx + 84, sy + 144);
    c.lineTo(sx + 66, sy + 144);
    c.closePath();
    c.fill();
    /* Fin highlights */
    c.fillStyle = '#ff99dd';
    c.beginPath();
    c.moveTo(sx + 24, sy + 116);
    c.lineTo(sx + 14, sy + 140);
    c.lineTo(sx + 22, sy + 140);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(sx + 66, sy + 116);
    c.lineTo(sx + 76, sy + 140);
    c.lineTo(sx + 68, sy + 140);
    c.closePath();
    c.fill();

    /* ----- Triple thrusters at the very base ----- */
    c.fillStyle = '#3a3a4a';
    c.fillRect(sx + 28, sy + 134, 8, 16);
    c.fillRect(sx + 41, sy + 134, 8, 16);
    c.fillRect(sx + 54, sy + 134, 8, 16);
    /* Booster thrusters */
    c.fillRect(sx + 6, sy + 130, 8, 14);
    c.fillRect(sx + 76, sy + 130, 8, 14);

    /* Exhaust flicker — animated yellow/red puffs from each thruster */
    var flick = Math.sin(this.timer * 0.3) * 2 + 4;
    var flick2 = Math.cos(this.timer * 0.27) * 2 + 4;
    function plume(thx, thy, sz, alt) {
      c.fillStyle = '#fff4a8';
      c.beginPath(); c.arc(thx, thy + sz, sz, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffd24a';
      c.beginPath(); c.arc(thx, thy + sz, sz * 0.7, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ff6644';
      c.beginPath(); c.arc(thx, thy + sz - 1, sz * 0.4, 0, Math.PI * 2); c.fill();
    }
    plume(sx + 32, sy + 150, flick * 0.7);
    plume(sx + 45, sy + 150, flick);
    plume(sx + 58, sy + 150, flick2 * 0.7);
    plume(sx + 10, sy + 144, flick2 * 0.6);
    plume(sx + 80, sy + 144, flick * 0.6);
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
    /* Door frame */
    c.fillStyle = '#3a2412';
    c.fillRect(sx, sy, 48, 52);
    /* Door panel */
    c.fillStyle = '#8a5a32';
    c.fillRect(sx + 4, sy + 4, 40, 46);
    /* Door grain */
    c.strokeStyle = '#5a3a22';
    c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(sx + 24, sy + 6); c.lineTo(sx + 24, sy + 48); c.stroke();
    c.beginPath(); c.moveTo(sx + 8, sy + 26); c.lineTo(sx + 40, sy + 26); c.stroke();
    /* Handle */
    c.fillStyle = '#ffd24a';
    c.beginPath();
    c.arc(sx + 38, sy + 28, 2.6, 0, Math.PI * 2);
    c.fill();
    /* Welcome heart sign above */
    c.fillStyle = '#ff66cc';
    var hcx = sx + 24, hcy = sy - 8;
    c.beginPath();
    c.arc(hcx - 2, hcy - 1, 2, 0, Math.PI * 2);
    c.arc(hcx + 2, hcy - 1, 2, 0, Math.PI * 2);
    c.moveTo(hcx - 3.6, hcy);
    c.lineTo(hcx, hcy + 3.5);
    c.lineTo(hcx + 3.6, hcy);
    c.closePath();
    c.fill();
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
    Octopus: Octopus,
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
    HeartPickup: HeartPickup,
    Particle: Particle,
    AmbientBubble: AmbientBubble,
    spawnBurst: spawnBurst,
    drawMomokoSprite: drawMomokoSprite,
    drawMomokoFloss: drawMomokoFloss,
    drawCrabPet: drawCrabPet,
  };
})();
