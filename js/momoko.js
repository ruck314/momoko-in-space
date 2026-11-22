/* momoko.js – the hero painter and her animation rig.

   Momoko is painted in a 28×34 box (feet at the bottom edge, helmet
   centred over the head) so every caller can keep placing her the way
   it always has. Each shape gets the same cel treatment: a warm
   terminator band and a cool core on the side away from the key light,
   a lit edge toward it, a thin cyan rim of sky light along the shadow
   edge, and an outline in a deep shade of its own hue. The key light
   comes from the upper left in the world; callers that mirror the
   canvas pass opts.mirror so the light stays put when she turns.

   She is built as a cut-out puppet: the rigid pieces (legs, upper arms,
   forearms, hands, torso, skirt, face, eyes, fringe, helmet collar,
   back gear) are each painted once into a bitmap at the device scale
   they are shown at, and every frame only moves those bitmaps about
   their joints. The things that bend (twin tails, braids, ponytails,
   ribbons, cape, scarf, antenna, balloon string) and the glass of the
   helmet are drawn live from a pose.

   The pose comes from a Rig: feed it her feet position each step and it
   works out velocity and acceleration, runs a low-gravity bounding walk
   cycle (contact / passing / up, long hang time, arms against legs),
   spring-damper secondary motion on hair and cloth, idle breathing,
   blinks and glances, a turn transition, start / stop anticipation,
   landing squash, reactions (cheer, wave, arrive) and regolith dust
   puffs on her footfalls. */
(function () {
  'use strict';
  window.Game = window.Game || {};

  var c = null;     /* context being painted */
  var LX = -1;      /* x direction toward the key light, in local space */
  var TAU = Math.PI * 2;

  /* ---------- Colour helpers ---------- */
  function norm(h) {
    if (typeof h !== 'string' || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})/.test(h)) return null;
    if (h.length === 4) return '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    return h.slice(0, 7).toLowerCase();
  }
  function rgb(h) { var n = parseInt(h.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hex(r, g, b) {
    return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);
  }
  function mix(a, b, k) {
    var x = rgb(a), y = rgb(b);
    return hex(x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k);
  }
  function rgba(h, a) { var p = rgb(h); return 'rgba(' + p[0] + ', ' + p[1] + ', ' + p[2] + ', ' + a + ')'; }

  /* Outline colour: the fill's own hue taken deep and dark, pulled a
     third of the way toward the house violet so every line belongs to
     one family. Greys and whites get the house violet itself. */
  var HOUSE_INK = [52, 20, 84];
  var inkMemo = {};
  function inkColor(fill) {
    var hit = inkMemo[fill];
    if (hit) return hit;
    var p = rgb(fill), r = p[0] / 255, g = p[1] / 255, b = p[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var l = (max + min) / 2, d = max - min;
    var s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    var out;
    if (s < 0.16) {
      out = hex(HOUSE_INK[0], HOUSE_INK[1], HOUSE_INK[2]);
    } else {
      var h;
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
      var l2 = Math.min(0.24, l * 0.48), s2 = Math.min(1, s * 0.8 + 0.2);
      var cc = (1 - Math.abs(2 * l2 - 1)) * s2, x = cc * (1 - Math.abs((h / 60) % 2 - 1)), m = l2 - cc / 2;
      var q = h < 60 ? [cc, x, 0] : h < 120 ? [x, cc, 0] : h < 180 ? [0, cc, x]
            : h < 240 ? [0, x, cc] : h < 300 ? [x, 0, cc] : [cc, 0, x];
      out = hex((q[0] + m) * 255 * 0.68 + HOUSE_INK[0] * 0.32,
                (q[1] + m) * 255 * 0.68 + HOUSE_INK[1] * 0.32,
                (q[2] + m) * 255 * 0.68 + HOUSE_INK[2] * 0.32);
    }
    inkMemo[fill] = out;
    return out;
  }

  /* Per-colour palette: lit edge, warm terminator, cool core, ink.
     Skin (warm) shadows run toward blood red, cloth and hair toward
     magenta, and the core of every shadow toward the night-sky violet. */
  var palMemo = {};
  function pal(col, warm) {
    var k = col + (warm ? 'w' : 'c');
    var p = palMemo[k];
    if (p) return p;
    p = {
      hi: mix(col, '#fff4f8', 0.42),
      s1: mix(mix(col, '#000000', 0.14), warm ? '#e8506a' : '#c03c8c', warm ? 0.22 : 0.14),
      s2: mix(mix(col, '#000000', 0.32), '#2a1c6c', 0.3),
      ink: inkColor(col),
    };
    palMemo[k] = p;
    return p;
  }
  var RIM = '#9fe8ff';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function smooth(e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }

  /* ---------- Shading primitives ----------
     Path builders only add sub-paths; callers own beginPath. */
  function band(path, dx, dy, col, a) {
    var ga = c.globalAlpha;
    c.beginPath();
    c.rect(-60, -60, 150, 160);
    c.translate(dx, dy);
    path();
    c.translate(-dx, -dy);
    c.fillStyle = col;
    if (a !== undefined) c.globalAlpha = ga * a;
    c.fill('evenodd');
    c.globalAlpha = ga;
  }

  /* Fill `path` with `col` and cel-shade it. o.d sets the band width,
     o.warm picks skin shadows, o.lw the outline width (0 = none). */
  function shape(path, col, o) {
    o = o || {};
    var p = pal(col, o.warm);
    var d = o.d || 1.4;
    c.beginPath(); path();
    c.fillStyle = col;
    c.fill();
    c.save();
    c.beginPath(); path();
    c.clip();
    band(path, LX * d * 0.8, -d * 0.7, p.s1);
    if (!o.soft) band(path, LX * d * 0.32, -d * 0.28, p.s2, 0.85);
    if (o.hi !== false) band(path, -LX * d * 0.38, d * 0.34, p.hi, 0.7);
    if (o.rim !== false) band(path, LX * 0.5, -0.18, RIM, 0.5);
    c.restore();
    var lw = o.lw === undefined ? 0.55 : o.lw;
    if (lw) {
      c.beginPath(); path();
      c.strokeStyle = p.ink;
      c.lineWidth = lw;
      c.lineJoin = 'round';
      c.stroke();
    }
  }

  /* Cheaper two-tone cel fill for the pieces redrawn every frame (hair
     locks, ribbons): the shadow colour, then the lit colour shifted
     toward the light, clipped to the shape, a thin sky rim, the ink. */
  function fastShape(path, col, d, lw) {
    var p = pal(col, false);
    c.beginPath(); path();
    c.fillStyle = p.s1;
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = RIM;
    c.globalAlpha *= 0.55;
    c.translate(-LX * 0.45, 0.15);
    c.beginPath(); path(); c.fill();
    c.globalAlpha /= 0.55;
    c.translate(LX * 0.45 + LX * d * 0.75, -0.15 - d * 0.6);
    c.fillStyle = col;
    c.beginPath(); path(); c.fill();
    c.restore();
    c.beginPath(); path();
    c.strokeStyle = p.ink;
    c.lineWidth = lw || 0.5;
    c.stroke();
  }

  function ellipsePath(x, y, rx, ry, rot) {
    return function () { c.moveTo(x + rx * Math.cos(rot || 0), y + rx * Math.sin(rot || 0)); c.ellipse(x, y, rx, ry, rot || 0, 0, TAU); };
  }
  function circlePath(x, y, r) { return ellipsePath(x, y, r, r, 0); }

  /* Capsule from (x0,y0) to (x1,y1), w0/w1 half-widths at the ends. */
  function limbPath(x0, y0, x1, y1, w0, w1) {
    return function () {
      var dx = x1 - x0, dy = y1 - y0, L = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / L, ny = dx / L, a = Math.atan2(dy, dx);
      c.moveTo(x0 + nx * w0, y0 + ny * w0);
      c.lineTo(x1 + nx * w1, y1 + ny * w1);
      c.arc(x1, y1, w1, a + Math.PI / 2, a - Math.PI / 2, true);
      c.lineTo(x0 - nx * w0, y0 - ny * w0);
      c.arc(x0, y0, w0, a - Math.PI / 2, a + Math.PI / 2, true);
      c.closePath();
    };
  }

  /* Tapered lock of hair along a quadratic curve, root half-width w. */
  function lockPath(x0, y0, cx, cy, x1, y1, w) {
    return function () {
      var N = 9, i, L = [], R = [];
      for (i = 0; i <= N; i++) {
        var t = i / N, u = 1 - t;
        var px = u * u * x0 + 2 * u * t * cx + t * t * x1;
        var py = u * u * y0 + 2 * u * t * cy + t * t * y1;
        var tx = 2 * u * (cx - x0) + 2 * t * (x1 - cx);
        var ty = 2 * u * (cy - y0) + 2 * t * (y1 - cy);
        var tl = Math.sqrt(tx * tx + ty * ty) || 1;
        /* full near the root, swelling a little, then to a point */
        var ww = w * Math.pow(1 - t, 0.75) * (1 + 0.25 * Math.sin(t * Math.PI)) + 0.08;
        L.push([px - ty / tl * ww, py + tx / tl * ww]);
        R.push([px + ty / tl * ww, py - tx / tl * ww]);
      }
      c.moveTo(L[0][0], L[0][1]);
      for (i = 1; i <= N; i++) c.lineTo(L[i][0], L[i][1]);
      for (i = N; i >= 0; i--) c.lineTo(R[i][0], R[i][1]);
      c.closePath();
    };
  }
  /* A light streak down the lit side of a lock. */
  function lockShine(x0, y0, cx, cy, x1, y1, col, t0, t1, off) {
    c.beginPath();
    for (var i = 0; i <= 6; i++) {
      var t = t0 + (t1 - t0) * i / 6, u = 1 - t;
      var px = u * u * x0 + 2 * u * t * cx + t * t * x1 + LX * off * (1 - t);
      var py = u * u * y0 + 2 * u * t * cy + t * t * y1;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.strokeStyle = col;
    c.lineWidth = 0.45;
    c.lineCap = 'round';
    c.stroke();
  }

  function starPath(cx, cy, r, inner) {
    return function () {
      for (var i = 0; i < 10; i++) {
        var ang = -Math.PI / 2 + i * Math.PI / 5;
        var rr = i % 2 === 0 ? r : r * (inner || 0.42);
        if (i === 0) c.moveTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
        else c.lineTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
      }
      c.closePath();
    };
  }
  function fillStar(cx, cy, r) {
    c.beginPath();
    starPath(cx, cy, r)();
    c.fill();
  }
  /* Four-point twinkle. */
  function twinkle(x, y, r, col) {
    c.fillStyle = col || '#ffffff';
    c.beginPath();
    c.moveTo(x, y - r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.quadraticCurveTo(x, y, x, y + r);
    c.quadraticCurveTo(x, y, x - r, y);
    c.quadraticCurveTo(x, y, x, y - r);
    c.fill();
  }

  function roundRectPath(x, y, w, h, r) {
    return function () {
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    };
  }

  /* Scalloped outline of n round lobes on an ellipse: fluff, curls,
     cloud. Each lobe runs between the points where it meets its
     neighbours, so the outline never doubles back on itself. */
  function cloudPath(cx, cy, rx, ry, n, lobe) {
    return function () {
      var i, C = [], Q = [];
      for (i = 0; i < n; i++) {
        var a = i / n * TAU - Math.PI / 2;
        C.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
      }
      for (i = 0; i < n; i++) {
        var A = C[i], B = C[(i + 1) % n];
        var mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
        var dx = B[0] - A[0], dy = B[1] - A[1], d = Math.sqrt(dx * dx + dy * dy) || 1;
        var h = Math.sqrt(Math.max(0, lobe * lobe - d * d / 4));
        /* the outer of the two crossing points: the one away from the centre */
        var nx = dy / d, ny = -dx / d;
        if ((mx + nx - cx) * (mx + nx - cx) + (my + ny - cy) * (my + ny - cy) <
            (mx - nx - cx) * (mx - nx - cx) + (my - ny - cy) * (my - ny - cy)) { nx = -nx; ny = -ny; }
        Q.push([mx + nx * h, my + ny * h]);
      }
      c.moveTo(Q[n - 1][0], Q[n - 1][1]);
      for (i = 0; i < n; i++) {
        var P0 = Q[(i + n - 1) % n], P1 = Q[i];
        c.arc(C[i][0], C[i][1], lobe, Math.atan2(P0[1] - C[i][1], P0[0] - C[i][0]), Math.atan2(P1[1] - C[i][1], P1[0] - C[i][0]));
      }
      c.closePath();
    };
  }

  /* ---------- Variants ---------- */
  var HAIR_STYLES = ['twinTails', 'longBraids', 'buns', 'ponytail', 'bob', 'sideTail',
                     'ringlets', 'longHair', 'pixie', 'puffs'];
  var OUTFITS = ['frillyDress', 'sailorDress', 'starDress', 'galaxyDress', 'tutu', 'gown', 'yukata', 'snowDress',
                 'sailorSwimsuit', 'onePiece', 'frillyBikini', 'puffySuit', 'pilot', 'mech', 'kitty', 'rainbow',
                 'tshirt'];
  var SHOES = ['maryJane', 'sneaker', 'flipper', 'rocketBoots', 'starBoots',
               'springBoots', 'bunnySlippers', 'rollerSkates', 'wingBoots'];
  var HELMETS = ['bubble', 'catEars', 'antenna', 'visor', 'bunnyEars', 'planetRing', 'crown', 'propeller', 'bigBow'];
  var GEAR = ['none', 'jetpack', 'bunnyPack', 'starCape', 'scarf', 'starBadge',
              'wings', 'backBow', 'satchel', 'hoverRing'];
  var HELD = ['none', 'iceCream', 'onigiri', 'donut', 'crepe', 'taiyaki', 'parfait', 'macaron',
              'strawberry', 'starWand', 'balloon', 'lollipop', 'dango', 'cottonCandy', 'starFlag',
              'lantern', 'plushie'];
  var FACES = ['none', 'glasses', 'starShades', 'freckles', 'heartCheeks', 'starPaint'];
  function pick(v, list, def) { return list.indexOf(v) >= 0 ? v : def; }

  var DRESSES = { frillyDress: 1, sailorDress: 1, starDress: 1, galaxyDress: 1, tutu: 1, gown: 1, yukata: 1, snowDress: 1 };
  var SUITS = { frillyBikini: 1, sailorSwimsuit: 1, onePiece: 1, puffySuit: 1, pilot: 1, mech: 1, kitty: 1, rainbow: 1 };
  function isDress(o) { return DRESSES[o] === 1; }
  function isSuit(o) { return SUITS[o] === 1; }

  /* Saved customisations from older builds (or hand-edited storage) may
     miss fields or carry values this build does not know; each falls
     back to the default look. */
  var EYES_DEFAULT = '#9a3c68', GLASS_DEFAULT = '#5ee8ff';
  function readCust(cust) {
    cust = cust || {};
    return {
      hair: norm(cust.hair) || '#e06088',
      suit: norm(cust.suit) || '#e06088',
      skin: norm(cust.skin) || '#ffddbb',
      flipper: norm(cust.flipper) || '#ff99cc',
      eyes: norm(cust.eyes) || EYES_DEFAULT,
      glass: norm(cust.glass) || GLASS_DEFAULT,
      hairStyle: pick(cust.hairStyle, HAIR_STYLES, 'twinTails'),
      outfit: pick(cust.outfit, OUTFITS, 'frillyDress'),
      shoes: pick(cust.shoes, SHOES, 'maryJane'),
      food: pick(cust.food, HELD, 'none'),
      helmet: pick(cust.helmet, HELMETS, 'bubble'),
      gear: pick(cust.gear, GEAR, 'none'),
      face: pick(cust.face, FACES, 'none'),
    };
  }
  function custKey(cu) {
    return cu.hair + cu.suit + cu.skin + cu.flipper + cu.eyes + cu.glass + cu.hairStyle + cu.outfit + cu.shoes +
           cu.food + cu.helmet + cu.gear + cu.face + LX;
  }

  /* ---------- Helmet ---------- */
  var HX = 14, HY = 8, HR = 11.4;

  /* The glass and its metal fittings take their colour from the glass
     tint she picked: GT is set for the look being painted. */
  var gtMemo = {}, GT = null;
  function glassTones(g) {
    var t = gtMemo[g];
    if (t) return t;
    t = gtMemo[g] = {
      rim: g,
      hi: mix(g, '#ffffff', 0.88),
      mid: mix(g, '#ffffff', 0.25),
      lo: mix(g, '#102050', 0.7),
      ink: mix(g, '#102050', 0.85),
      deep: mix(g, '#0a3a78', 0.5),
      body: mix(g, '#ffffff', 0.45),
    };
    return t;
  }

  function helmetBack() {
    c.beginPath();
    c.arc(HX, HY, HR, 0, TAU);
    c.fillStyle = rgba(GT.body, 0.1);
    c.fill();
  }

  function helmetCollar() {
    var path = ellipsePath(14, 20.3, 6.9, 1.35);
    c.beginPath(); path();
    var g = c.createLinearGradient(0, 18.9, 0, 21.7);
    g.addColorStop(0, GT.hi);
    g.addColorStop(0.45, GT.mid);
    g.addColorStop(1, GT.lo);
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = GT.ink;
    c.lineWidth = 0.45;
    c.stroke();
    /* machined groove and status lights on the ring */
    c.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    c.lineWidth = 0.25;
    c.beginPath(); c.ellipse(14, 19.9, 6.0, 0.7, 0, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    c.fillStyle = '#44ffff';
    c.beginPath(); c.arc(9.4, 20.6, 0.55, 0, TAU); c.fill();
    c.fillStyle = '#ff66cc';
    c.beginPath(); c.arc(18.6, 20.6, 0.55, 0, TAU); c.fill();
  }

  /* Where hair leaves the bubble it passes through a little sealed
     port, so tails outside the glass read as part of the suit. */
  function port(x, y, ang) {
    c.save();
    c.translate(x, y);
    c.rotate(ang);
    c.beginPath(); c.ellipse(0, 0, 1.75, 0.8, 0, 0, TAU);
    var g = c.createLinearGradient(0, -0.8, 0, 0.8);
    g.addColorStop(0, GT.hi);
    g.addColorStop(0.5, GT.mid);
    g.addColorStop(1, GT.lo);
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = GT.ink;
    c.lineWidth = 0.3;
    c.stroke();
    c.fillStyle = 'rgba(255, 255, 255, 0.85)';
    c.beginPath(); c.ellipse(-0.5, -0.3, 0.55, 0.22, 0, 0, TAU); c.fill();
    c.restore();
  }
  function hairPorts(style) {
    if (style === 'twinTails' || style === 'longBraids' || style === 'ringlets' || style === 'puffs') {
      port(14 - 10.6, 12.4, -1.2);
      port(14 + 10.6, 12.4, 1.2);
    } else if (style === 'ponytail') {
      port(14.4, HY - HR + 0.15, 0.05);
    } else if (style === 'sideTail') {
      port(24.7, 11.2, 1.1);
    }
  }

  /* A blown-glass ear: tinted body, a pink inner, a bright rim on the
     lit side and a specular streak. `path` and `inner` add sub-paths. */
  function glassEar(path, inner) {
    c.beginPath(); path();
    var g = c.createLinearGradient(0, -5, 0, 2);
    g.addColorStop(0, rgba(GT.hi, 0.7));
    g.addColorStop(1, rgba(GT.rim, 0.34));
    c.fillStyle = g;
    c.fill();
    c.beginPath(); inner();
    var ig = c.createLinearGradient(0, -4, 0, 1.5);
    ig.addColorStop(0, 'rgba(255, 196, 228, 0.9)');
    ig.addColorStop(1, 'rgba(255, 110, 180, 0.55)');
    c.fillStyle = ig;
    c.fill();
    c.beginPath(); path();
    c.strokeStyle = GT.ink;
    c.lineWidth = 1.05;
    c.stroke();
    c.strokeStyle = GT.rim;
    c.lineWidth = 0.6;
    c.stroke();
  }
  function catEars(back) {
    for (var side = -1; side <= 1; side += 2) {
      c.save();
      c.translate(14 + side * 7.4, HY - 8.2);
      c.rotate(side * 0.42);
      var ear = function () {
        c.moveTo(-3.1, 1.9);
        c.quadraticCurveTo(-2.0, -3.2, 0, -5.0);
        c.quadraticCurveTo(2.0, -3.2, 3.1, 1.9);
      };
      if (back) {
        c.beginPath(); ear(); c.closePath();
        c.fillStyle = rgba(GT.body, 0.24);
        c.fill();
      } else {
        glassEar(ear, function () {
          c.moveTo(-1.6, 1.4);
          c.quadraticCurveTo(-1.0, -1.9, 0, -3.1);
          c.quadraticCurveTo(1.0, -1.9, 1.6, 1.4);
          c.closePath();
        });
        c.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        c.lineWidth = 0.4;
        c.beginPath(); c.moveTo(LX * 2.0, 0.2); c.quadraticCurveTo(LX * 1.3, -2.6, LX * 0.3, -4.0); c.stroke();
      }
      c.restore();
    }
  }
  /* Tall glass bunny ears that sway on the antenna spring. */
  function bunnyTopEars(P) {
    var ax = P.ant ? P.ant.x : 0, ay = P.ant ? P.ant.y : 0;
    for (var side = -1; side <= 1; side += 2) {
      c.save();
      c.translate(14 + side * 4.6, HY - HR + 1.0);
      c.rotate(side * 0.2 + ax * 0.045);
      var bend = ax * 0.5 + (side > 0 ? 1.1 : 0), tipY = -10.6 + ay * 0.4 + (side > 0 ? 1.6 : 0);
      var ear = function () {
        c.moveTo(-2.1, 0.6);
        c.bezierCurveTo(-3.3, -4.4, -2.2 + bend, tipY + 0.6, bend, tipY);
        c.bezierCurveTo(2.2 + bend, tipY + 0.6, 3.3, -4.4, 2.1, 0.6);
      };
      glassEar(ear, function () {
        c.moveTo(-0.9, -0.4);
        c.bezierCurveTo(-1.7, -4.2, -1.0 + bend, tipY + 2.2, bend, tipY + 1.8);
        c.bezierCurveTo(1.0 + bend, tipY + 2.2, 1.7, -4.2, 0.9, -0.4);
        c.closePath();
      });
      c.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      c.lineWidth = 0.4;
      c.beginPath(); c.moveTo(LX * 1.7, -1.4); c.quadraticCurveTo(LX * 2.1, -5.4, LX * 0.9 + bend, tipY + 1.6); c.stroke();
      c.restore();
    }
  }

  /* Antenna on the crown: a springy stalk with a glowing star bead. */
  function antenna(P, t) {
    var ax = P.ant ? P.ant.x : 0, ay = P.ant ? P.ant.y : 0;
    var bx = 14, by = HY - HR + 0.2;
    var tx = bx + ax * 1.2, ty = by - 6.6 + ay * 0.5;
    c.strokeStyle = GT.ink;
    c.lineWidth = 0.95;
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx + ax * 0.2, by - 3.6, tx, ty); c.stroke();
    c.strokeStyle = GT.hi;
    c.lineWidth = 0.4;
    c.beginPath(); c.moveTo(bx - 0.15, by); c.quadraticCurveTo(bx + ax * 0.2 - 0.2, by - 3.6, tx - 0.15, ty); c.stroke();
    /* base cap */
    shape(ellipsePath(bx, by + 0.2, 1.6, 0.8), GT.mid, { d: 0.5, lw: 0.3, rim: false });
    /* glow + bead */
    var pulse = 0.75 + 0.25 * Math.sin(t * 4.2);
    var g = c.createRadialGradient(tx, ty, 0.2, tx, ty, 4.2);
    g.addColorStop(0, 'rgba(255, 236, 140, ' + (0.6 * pulse).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255, 200, 80, 0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(tx, ty, 4.2, 0, TAU); c.fill();
    shape(starPath(tx, ty, 2.0, 0.5), '#ffd24a', { d: 0.6, lw: 0.35 });
    c.fillStyle = 'rgba(255, 255, 255, 0.9)';
    c.beginPath(); c.arc(tx - 0.5, ty - 0.6, 0.35, 0, TAU); c.fill();
  }

  /* Gold: a polished band of light, a dark core under it, warm ink. */
  var GOLD = '#ffd24a', GOLD_HI = '#fff6c8', GOLD_LO = '#c8861a';
  function gold(path, o) {
    o = o || {};
    shape(path, GOLD, { d: o.d || 0.7, lw: o.lw === undefined ? 0.4 : o.lw, rim: false });
  }
  /* A cut gem at (x, y): facets, a hot spot and a dark girdle. */
  function gem(x, y, r, col) {
    var p = pal(col, false);
    c.beginPath();
    c.moveTo(x, y - r); c.lineTo(x + r * 0.86, y - r * 0.2); c.lineTo(x + r * 0.55, y + r * 0.85);
    c.lineTo(x - r * 0.55, y + r * 0.85); c.lineTo(x - r * 0.86, y - r * 0.2);
    c.closePath();
    c.fillStyle = col;
    c.fill();
    c.fillStyle = p.s2;
    c.beginPath();
    c.moveTo(x, y + r * 0.1); c.lineTo(x + r * 0.55, y + r * 0.85); c.lineTo(x - r * 0.55, y + r * 0.85);
    c.closePath(); c.fill();
    c.fillStyle = p.hi;
    c.beginPath();
    c.moveTo(x, y - r); c.lineTo(x, y + r * 0.1); c.lineTo(x + LX * r * 0.86, y - r * 0.2);
    c.closePath(); c.fill();
    c.strokeStyle = p.ink;
    c.lineWidth = 0.25;
    c.beginPath();
    c.moveTo(x, y - r); c.lineTo(x + r * 0.86, y - r * 0.2); c.lineTo(x + r * 0.55, y + r * 0.85);
    c.lineTo(x - r * 0.55, y + r * 0.85); c.lineTo(x - r * 0.86, y - r * 0.2);
    c.closePath(); c.stroke();
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(x + LX * r * 0.32, y - r * 0.38, r * 0.2, 0, TAU); c.fill();
  }

  /* Little crown perched on the dome, a touch askew. */
  function crownTop() {
    c.save();
    c.translate(14.6, HY - HR + 0.9);
    c.rotate(0.1);
    /* velvet cushion peeking inside */
    shape(function () { c.moveTo(-3.2, -1.2); c.quadraticCurveTo(0, -4.6, 3.2, -1.2); c.closePath(); },
      '#d8306a', { d: 0.6, lw: 0.3, rim: false });
    gold(function () {
      c.moveTo(-4.1, 0.5);
      c.lineTo(-4.7, -4.3); c.lineTo(-2.5, -2.3);
      c.lineTo(-1.3, -5.6); c.lineTo(0, -6.3); c.lineTo(1.3, -5.6);
      c.lineTo(2.5, -2.3); c.lineTo(4.7, -4.3);
      c.lineTo(4.1, 0.5);
      c.quadraticCurveTo(0, 1.6, -4.1, 0.5);
      c.closePath();
    }, { d: 0.9, lw: 0.45 });
    /* band: a dark groove under a bright lip */
    c.strokeStyle = GOLD_LO;
    c.lineWidth = 0.4;
    c.beginPath(); c.moveTo(-4.0, -0.9); c.quadraticCurveTo(0, 0.2, 4.0, -0.9); c.stroke();
    c.strokeStyle = GOLD_HI;
    c.lineWidth = 0.35;
    c.beginPath(); c.moveTo(-3.9, -0.3); c.quadraticCurveTo(0, 0.8, 3.9, -0.3); c.stroke();
    c.beginPath(); c.moveTo(LX * 4.2, -3.6); c.lineTo(LX * 3.8, -0.4); c.stroke();
    /* pearls on the points, gems on the band */
    var tips = [[-4.7, -4.5], [0, -6.6], [4.7, -4.5]];
    for (var i = 0; i < 3; i++) {
      shape(circlePath(tips[i][0], tips[i][1], 0.8), '#fff4fa', { d: 0.35, lw: 0.28, rim: false });
    }
    gem(0, -2.5, 1.35, '#ff4a8a');
    gem(-2.9, -0.9, 0.8, '#4ac8ff');
    gem(2.9, -0.9, 0.8, '#4ac8ff');
    c.restore();
  }

  /* One half of the planet ring round the top of the dome; the back
     half goes behind the glass, the front half across it. */
  var RING_Y = 0.6;
  function planetRingHalf(front) {
    var a0 = front ? 0 : Math.PI, a1 = front ? Math.PI : TAU;
    var half = function (ro, ri, yo, yi) {
      return function () {
        c.moveTo(ro * Math.cos(a0), yo * Math.sin(a0));
        c.ellipse(0, 0, ro, yo, 0, a0, a1);
        c.ellipse(0, 0, ri, yi, 0, a1, a0, true);
        c.closePath();
      };
    };
    c.save();
    c.translate(14, RING_Y);
    c.rotate(-0.2);
    if (!front) c.globalAlpha *= 0.82;
    shape(half(15.2, 9.6, 4.3, 2.0), '#ffc978', { d: 0.9, lw: 0.45, rim: false });
    shape(half(13.6, 12.3, 3.55, 2.95), '#ff8fb8', { d: 0.4, lw: 0, hi: false, rim: false });
    shape(half(11.5, 10.6, 2.75, 2.35), '#fff0b8', { d: 0.3, lw: 0, hi: false, rim: false });
    if (front) {
      /* a streak of light sliding round the band */
      c.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      c.lineWidth = 0.4;
      c.beginPath(); c.ellipse(0, 0, 14.4, 3.95, 0, Math.PI * 0.62, Math.PI * 0.86); c.stroke();
      twinkle(-11.6, 2.2, 1.3, '#ffffff');
      twinkle(9.4, 2.9, 0.8, '#fff8d0');
    }
    c.restore();
  }

  /* Propeller beanie: a two-tone cap on the crown and a spinning prop. */
  function propCap(suitC) {
    var by = HY - HR + 0.5;
    var alt = mix(suitC, '#ffffff', 0.62);
    var cap = function () {
      c.moveTo(14 - 5.6, by + 0.9);
      c.bezierCurveTo(14 - 5.2, by - 4.6, 14 + 5.2, by - 4.6, 14 + 5.6, by + 0.9);
      c.quadraticCurveTo(14, by + 2.3, 14 - 5.6, by + 0.9);
      c.closePath();
    };
    shape(cap, suitC, { d: 1.0, lw: 0.45 });
    c.save();
    c.beginPath(); cap(); c.clip();
    c.fillStyle = alt;
    c.beginPath();
    c.moveTo(14 - 2.0, by + 3); c.quadraticCurveTo(14 - 2.4, by - 2.2, 14, by - 3.6);
    c.quadraticCurveTo(14 + 2.4, by - 2.2, 14 + 2.0, by + 3);
    c.closePath(); c.fill();
    c.strokeStyle = pal(suitC, false).s2;
    c.lineWidth = 0.28;
    c.beginPath();
    c.moveTo(14 - 2.0, by + 3); c.quadraticCurveTo(14 - 2.4, by - 2.2, 14, by - 3.6);
    c.quadraticCurveTo(14 + 2.4, by - 2.2, 14 + 2.0, by + 3);
    c.stroke();
    c.fillStyle = 'rgba(255, 255, 255, 0.5)';
    c.beginPath(); c.ellipse(14 + LX * 3.0, by - 1.7, 1.3, 0.6, LX * 0.7, 0, TAU); c.fill();
    c.restore();
    /* brim band and the button the prop sits on */
    c.strokeStyle = pal(suitC, false).s2;
    c.lineWidth = 0.5;
    c.beginPath(); c.moveTo(14 - 5.4, by + 0.4); c.quadraticCurveTo(14, by + 1.8, 14 + 5.4, by + 0.4); c.stroke();
    gold(circlePath(14, by - 3.6, 0.95), { d: 0.4, lw: 0.3 });
  }
  function propBlades(t, spin) {
    var by = HY - HR - 3.9;
    c.strokeStyle = '#5a6488';
    c.lineWidth = 0.7;
    c.beginPath(); c.moveTo(14, by + 0.4); c.lineTo(14, by - 1.5); c.stroke();
    var a = t * (7 + spin * 16);
    var w = Math.cos(a), blur = clamp(spin, 0, 1);
    var cols = ['#ff5a8a', '#4ac8ff'];
    for (var i = 0; i < 2; i++) {
      var dir = i ? -1 : 1, len = 5.2 * dir * w;
      if (Math.abs(len) < 0.5) len = 0.5 * dir;
      c.globalAlpha *= 1 - blur * 0.35;
      shape(function () {
        c.moveTo(14, by - 1.5);
        c.quadraticCurveTo(14 + len * 0.5, by - 3.2, 14 + len, by - 1.9);
        c.quadraticCurveTo(14 + len * 0.5, by - 0.5, 14, by - 1.5);
        c.closePath();
      }, cols[(i + (w < 0 ? 1 : 0)) % 2], { d: 0.5, lw: 0.35, rim: false });
      c.globalAlpha /= 1 - blur * 0.35;
    }
    gold(circlePath(14, by - 1.5, 0.7), { d: 0.3, lw: 0.3 });
  }

  /* A big ribbon bow on the dome: loops and knot rigid, tails live. */
  function bigBowLoops(suitC) {
    var p = pal(suitC, false);
    var by = HY - HR - 0.6;
    for (var side = -1; side <= 1; side += 2) {
      var loop = (function (sd) {
        return function () {
          c.moveTo(14, by);
          c.bezierCurveTo(14 + sd * 2.2, by - 5.4, 14 + sd * 8.6, by - 5.0, 14 + sd * 8.0, by - 0.6);
          c.bezierCurveTo(14 + sd * 7.6, by + 2.6, 14 + sd * 2.6, by + 1.6, 14, by);
          c.closePath();
        };
      })(side);
      shape(loop, suitC, { d: 1.1, lw: 0.45 });
      /* folds gathering into the knot, a shine on the swell */
      c.strokeStyle = p.s2;
      c.lineWidth = 0.32;
      c.beginPath();
      c.moveTo(14 + side * 1.2, by - 0.6); c.quadraticCurveTo(14 + side * 3.6, by - 2.4, 14 + side * 5.4, by - 2.6);
      c.moveTo(14 + side * 1.2, by + 0.3); c.quadraticCurveTo(14 + side * 3.4, by + 0.6, 14 + side * 5.0, by + 0.5);
      c.stroke();
      c.fillStyle = 'rgba(255, 255, 255, 0.55)';
      c.beginPath(); c.ellipse(14 + side * 5.2 + LX * 1.0, by - 3.3, 1.5, 0.55, side * -0.35, 0, TAU); c.fill();
    }
    shape(roundRectPath(14 - 1.5, by - 1.7, 3.0, 3.2, 1.1), p.s1, { d: 0.5, lw: 0.4, rim: false });
    c.strokeStyle = p.hi;
    c.lineWidth = 0.35;
    c.beginPath(); c.moveTo(14 + LX * 0.7, by - 1.0); c.lineTo(14 + LX * 0.7, by + 0.6); c.stroke();
  }
  function bigBowTails(suitC, P) {
    var ax = P.ant ? P.ant.x : 0, ay = P.ant ? P.ant.y : 0;
    var by = HY - HR - 0.2;
    for (var side = -1; side <= 1; side += 2) {
      var x0 = 14 + side * 1.0, x1 = 14 + side * 5.6 + ax * 0.9, y1 = by + 6.4 + ay * 0.5;
      fastShape(lockPath(x0, by, 14 + side * 4.4 + ax * 0.4, by + 1.4, x1, y1, 1.3), pal(suitC, false).s1, 0.6, 0.4);
    }
  }

  var DEFAULT_ENV = { sky: '#6a4ab8', ground: '#4a2a8a', key: '#ffc4e8', glow: '#a04ad8' };

  /* The glass. Refraction first (a magnified copy of what is behind the
     rim, clipped to the thick edge), then the scene reflected in the
     dome (sky above, a bowed horizon with its lights sliding past as she
     walks, the ground below), Fresnel thickening, the key-light window
     and glints that ride with her motion, and the rim. */
  function helmetFront(cu, P, env, refr) {
    var face = P.face || 1;
    c.save();
    c.beginPath(); c.arc(HX, HY, HR, 0, TAU); c.clip();
    /* refraction through the thick edge of the dome */
    if (refr) {
      c.save();
      c.beginPath(); c.arc(HX, HY, HR, 0, TAU); c.arc(HX, HY, HR - 1.9, 0, TAU, true); c.clip('evenodd');
      c.translate(HX, HY); c.scale(1.075, 1.06); c.translate(-HX, -HY);
      c.globalAlpha = 0.55;
      for (var i = 0; i < refr.length; i++) { if (refr[i]) blitAt(refr[i][0], refr[i][1], refr[i][2]); }
      c.restore();
    }
    /* The scene reflected in the dome. A convex mirror shows it most
       toward the edge, so it lives in a ring and leaves her face clear:
       sky above, a bowed horizon whose lights slide past as she walks,
       the ground below. */
    c.save();
    c.beginPath();
    c.arc(HX, HY, HR, 0, TAU);
    c.ellipse(HX - LX * 0.6, HY + 0.8, HR * 0.7, HR * 0.74, 0, 0, TAU, true);
    c.clip('evenodd');
    var sg = c.createLinearGradient(0, HY - HR, 0, HY + 2);
    sg.addColorStop(0, rgba(env.sky, 0.32));
    sg.addColorStop(1, rgba(env.sky, 0));
    c.fillStyle = sg;
    c.fillRect(HX - HR, HY - HR, HR * 2, HR + 2);
    var hy0 = HY + 2.6 - (P.lean || 0) * 4, hyc = HY + 6.2 - (P.lean || 0) * 4;
    c.beginPath();
    c.moveTo(HX - HR, hy0);
    c.quadraticCurveTo(HX, hyc, HX + HR, hy0);
    c.lineTo(HX + HR, HY + HR);
    c.lineTo(HX - HR, HY + HR);
    c.closePath();
    c.fillStyle = rgba(env.ground, 0.3);
    c.fill();
    c.beginPath();
    c.moveTo(HX - HR, hy0);
    c.quadraticCurveTo(HX, hyc, HX + HR, hy0);
    c.strokeStyle = rgba(env.glow, 0.55);
    c.lineWidth = 0.5;
    c.stroke();
    /* lights on the horizon slide across the dome as she moves */
    var scroll = -(P.refl || 0) * 0.011 * face;
    for (var k = 0; k < 6; k++) {
      var u = ((k * 1.07 + scroll) % 3.1 + 3.1) % 3.1 - 1.55;
      var lx = HX + HR * 0.96 * Math.sin(u);
      var tt = (lx - (HX - HR)) / (2 * HR);
      var ly = (1 - tt) * (1 - tt) * hy0 + 2 * (1 - tt) * tt * hyc + tt * tt * hy0 - 0.2;
      c.globalAlpha = 0.25 + Math.abs(Math.sin(u)) * 0.7;
      c.fillStyle = k % 2 ? '#7ff6ff' : env.key;
      c.beginPath(); c.ellipse(lx, ly, 0.2 + 0.35 * Math.cos(u), 0.3, 0, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
    c.restore();
    /* sun visor: gold glass across the brow */
    if (cu.helmet === 'visor') {
      c.beginPath();
      c.moveTo(HX - HR, HY - 1.0);
      c.quadraticCurveTo(HX, HY + 1.6, HX + HR, HY - 1.0);
      c.lineTo(HX + HR, HY - HR);
      c.lineTo(HX - HR, HY - HR);
      c.closePath();
      var vg = c.createLinearGradient(0, HY - HR, 0, HY + 1);
      vg.addColorStop(0, 'rgba(255, 200, 100, 0.62)');
      vg.addColorStop(0.55, 'rgba(255, 160, 80, 0.36)');
      vg.addColorStop(1, 'rgba(255, 120, 160, 0.2)');
      c.fillStyle = vg;
      c.fill();
      c.beginPath();
      c.moveTo(HX - HR, HY - 1.0);
      c.quadraticCurveTo(HX, HY + 1.6, HX + HR, HY - 1.0);
      c.strokeStyle = '#ffe9a8';
      c.lineWidth = 0.6;
      c.stroke();
      /* mirror streaks across the gold */
      c.fillStyle = 'rgba(255, 250, 220, 0.5)';
      c.beginPath();
      c.moveTo(HX - 6.5, HY - HR + 1.5); c.lineTo(HX - 3.6, HY - HR + 1.0); c.lineTo(HX - 6.8, HY - 0.6); c.lineTo(HX - 9.0, HY - 1.6);
      c.closePath();
      c.fill();
      c.strokeStyle = 'rgba(120, 50, 20, 0.6)';
      c.lineWidth = 0.3;
      c.beginPath();
      c.moveTo(HX - HR, HY - 0.4);
      c.quadraticCurveTo(HX, HY + 2.2, HX + HR, HY - 0.4);
      c.stroke();
    }
    c.restore();

    c.save();
    c.translate(HX, HY);
    /* Fresnel: the glass thickens toward the edge */
    var fg = c.createRadialGradient(LX * 1.5, -1.5, HR * 0.55, 0, 0, HR);
    fg.addColorStop(0, rgba(GT.body, 0));
    fg.addColorStop(0.75, rgba(GT.body, 0.08));
    fg.addColorStop(1, rgba(GT.body, 0.36));
    c.fillStyle = fg;
    c.beginPath(); c.arc(0, 0, HR, 0, TAU); c.fill();
    if (LX > 0) c.scale(-1, 1);
    /* Window highlight: a curved slab of sky light on the lit shoulder;
       it slides a little against her motion and bob. */
    c.rotate(P.glint || 0);
    var wg = c.createLinearGradient(-HR, -HR, -HR * 0.2, -HR * 0.2);
    wg.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
    wg.addColorStop(1, 'rgba(255, 255, 255, 0.22)');
    c.fillStyle = wg;
    c.beginPath();
    c.arc(0, 0, HR - 1.2, Math.PI * 1.06, Math.PI * 1.42);
    c.arc(0, 0, HR - 3.0, Math.PI * 1.40, Math.PI * 1.10, true);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(255, 255, 255, 0.92)';
    c.beginPath(); c.ellipse(-3.2, -8.0, 1.1, 0.7, -0.5, 0, TAU); c.fill();
    /* specular star that twinkles as she moves */
    var tw = 0.55 + 0.45 * Math.sin((P.time || 0) * 2.6 + (P.refl || 0) * 0.05);
    twinkle(-5.9, -6.4, 1.1 + tw * 0.9, 'rgba(255, 255, 255, ' + (0.5 + tw * 0.45).toFixed(3) + ')');
    /* thin secondary streak on the far side */
    c.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    c.lineWidth = 0.4;
    c.beginPath(); c.arc(0, 0, HR - 1.1, Math.PI * 1.62, Math.PI * 1.78); c.stroke();
    /* Warm bounce from the ground on the far lower edge */
    c.fillStyle = 'rgba(255, 176, 224, 0.3)';
    c.beginPath();
    c.arc(0, 0, HR - 1.0, Math.PI * 0.08, Math.PI * 0.42);
    c.arc(0, 0, HR - 2.2, Math.PI * 0.40, Math.PI * 0.10, true);
    c.closePath();
    c.fill();
    c.restore();
    /* Rim: bright on the lit side, deep teal on the shadow side */
    var rg = c.createLinearGradient(HX + LX * HR, HY - HR, HX - LX * HR, HY + HR);
    rg.addColorStop(0, GT.hi);
    rg.addColorStop(0.5, GT.rim);
    rg.addColorStop(1, GT.deep);
    c.strokeStyle = rg;
    c.lineWidth = 0.8;
    c.beginPath(); c.arc(HX, HY, HR, 0, TAU); c.stroke();
    c.strokeStyle = rgba(GT.ink, 0.55);
    c.lineWidth = 0.35;
    c.beginPath(); c.arc(HX, HY, HR + 0.55, 0, TAU); c.stroke();
  }

  /* ---------- Hair ---------- */
  /* The fringe and crown as one mass: side locks framing the cheeks and
     a row of pointed clumps across the forehead. */
  function frontHairPath() {
    c.moveTo(5.3, 17.8);
    c.quadraticCurveTo(3.3, 12.2, 4.1, 7.6);
    c.bezierCurveTo(5.1, 1.6, 9.5, -0.9, 14, -0.9);
    c.bezierCurveTo(18.5, -0.9, 22.9, 1.6, 23.9, 7.6);
    c.quadraticCurveTo(24.7, 12.2, 22.7, 17.8);
    c.quadraticCurveTo(21.7, 13.2, 21.2, 9.9);
    c.quadraticCurveTo(20.5, 8.6, 19.5, 10.3);
    c.quadraticCurveTo(18.9, 8.3, 17.9, 7.2);
    c.quadraticCurveTo(17.4, 8.9, 16.0, 10.6);
    c.quadraticCurveTo(15.2, 8.4, 14.4, 6.9);
    c.quadraticCurveTo(13.8, 8.8, 12.3, 10.8);
    c.quadraticCurveTo(11.6, 8.6, 10.8, 7.3);
    c.quadraticCurveTo(10.2, 9.0, 8.7, 10.3);
    c.quadraticCurveTo(7.6, 9.0, 6.8, 9.9);
    c.quadraticCurveTo(6.3, 13.2, 5.3, 17.8);
    c.closePath();
  }

  /* Blunt princess cut: a straight fringe above the eyes and squared
     side locks to the jaw. */
  function himeFringePath() {
    c.moveTo(4.9, 17.6);
    c.quadraticCurveTo(3.3, 12.2, 4.1, 7.6);
    c.bezierCurveTo(5.1, 1.6, 9.5, -0.9, 14, -0.9);
    c.bezierCurveTo(18.5, -0.9, 22.9, 1.6, 23.9, 7.6);
    c.quadraticCurveTo(24.7, 12.2, 23.1, 17.6);
    c.lineTo(20.5, 17.9);
    c.quadraticCurveTo(21.3, 14, 20.9, 9.5);
    c.lineTo(18.3, 9.8); c.lineTo(18.0, 9.1); c.lineTo(17.7, 9.8);
    c.lineTo(14.3, 10.0); c.lineTo(14.0, 9.3); c.lineTo(13.7, 10.0);
    c.lineTo(10.3, 9.8); c.lineTo(10.0, 9.1); c.lineTo(9.7, 9.8);
    c.lineTo(7.1, 9.5);
    c.quadraticCurveTo(6.7, 14, 7.5, 17.9);
    c.closePath();
  }
  /* Pixie cut: short at the sides, the fringe swept across the brow
     from a parting on her left. */
  function sweptFringePath() {
    c.moveTo(5.9, 15.4);
    c.quadraticCurveTo(3.4, 11.6, 4.1, 7.6);
    c.bezierCurveTo(5.1, 1.6, 9.5, -0.9, 14, -0.9);
    c.bezierCurveTo(18.5, -0.9, 22.9, 1.6, 23.9, 7.6);
    c.quadraticCurveTo(24.6, 11.6, 22.1, 15.4);
    c.quadraticCurveTo(21.9, 12.6, 21.3, 9.9);
    c.quadraticCurveTo(20.7, 8.0, 19.4, 9.6);
    c.quadraticCurveTo(18.3, 6.4, 14.3, 10.4);
    c.quadraticCurveTo(14.2, 7.6, 12.4, 7.2);
    c.quadraticCurveTo(8.6, 7.6, 6.8, 11.6);
    c.quadraticCurveTo(6.5, 13.6, 5.9, 15.4);
    c.closePath();
  }
  /* Curls: a scalloped fringe and coiled side locks. */
  function curlyFringePath() {
    var PI = Math.PI;
    c.moveTo(5.2, 16.6);
    c.quadraticCurveTo(3.3, 12.2, 4.1, 7.6);
    c.bezierCurveTo(5.1, 1.6, 9.5, -0.9, 14, -0.9);
    c.bezierCurveTo(18.5, -0.9, 22.9, 1.6, 23.9, 7.6);
    c.quadraticCurveTo(24.7, 12.2, 22.8, 16.6);
    c.lineTo(21.2, 16.8);
    c.arc(21.2, 15.2, 1.6, PI * 0.5, PI * 1.4);
    c.arc(21.0, 12.2, 1.6, PI * 0.5, PI * 1.5);
    for (var bx = 19.6; bx > 8; bx -= 2.8) c.arc(bx, 8.7, 1.5, 0, PI);
    c.arc(7.0, 12.2, 1.6, -PI * 0.5, PI * 0.5);
    c.arc(6.8, 15.2, 1.6, -PI * 0.4, PI * 0.5);
    c.closePath();
  }
  function fringeOf(style) {
    return style === 'longHair' ? himeFringePath : style === 'pixie' ? sweptFringePath
         : style === 'puffs' ? curlyFringePath : frontHairPath;
  }

  function hairGloss(hairC, style) {
    var p = pal(hairC, false);
    c.save();
    c.beginPath(); fringeOf(style)(); c.clip();
    var gx = 14 + LX * 1.1, gy = 7.6, rr = 7.4;
    c.fillStyle = p.hi;
    c.globalAlpha *= 0.8;
    c.beginPath();
    c.arc(gx, gy, rr, Math.PI * 1.16, Math.PI * 1.84);
    var n = 8;
    for (var i = n; i >= 0; i--) {
      var a = Math.PI * 1.84 - Math.PI * 0.68 * (i / n);
      var dip = (i % 2 === 0) ? 2.1 : 0.9;
      c.lineTo(gx + Math.cos(a) * (rr - dip), gy + Math.sin(a) * (rr - dip));
    }
    c.closePath();
    c.fill();
    /* a whiter angel-ring core */
    c.globalAlpha = 0.45;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(gx, gy, rr - 0.4, Math.PI * 1.3, Math.PI * 1.55);
    c.arc(gx, gy, rr - 1.3, Math.PI * 1.55, Math.PI * 1.3, true);
    c.closePath();
    c.fill();
    c.restore();
    /* strand lines from the crown into the fringe */
    c.strokeStyle = p.s2;
    c.lineWidth = 0.32;
    c.lineCap = 'round';
    c.beginPath();
    if (style === 'longHair') {
      c.moveTo(10.0, 2.4); c.quadraticCurveTo(9.6, 6, 10.0, 9.0);
      c.moveTo(14.0, 2.0); c.lineTo(14.0, 9.2);
      c.moveTo(18.0, 2.4); c.quadraticCurveTo(18.4, 6, 18.0, 9.0);
      c.moveTo(12.0, 4.6); c.lineTo(12.0, 9.4);
      c.moveTo(16.0, 4.6); c.lineTo(16.0, 9.4);
      c.moveTo(6.0, 7.0); c.quadraticCurveTo(5.4, 12, 6.2, 17.2);
      c.moveTo(22.0, 7.0); c.quadraticCurveTo(22.6, 12, 21.8, 17.2);
    } else if (style === 'pixie') {
      c.moveTo(19.6, 2.6); c.quadraticCurveTo(17.6, 5.4, 14.6, 9.4);
      c.moveTo(18.0, 1.4); c.quadraticCurveTo(12.6, 3.6, 9.4, 8.4);
      c.moveTo(15.0, 0.4); c.quadraticCurveTo(9.4, 2.6, 7.2, 9.6);
      c.moveTo(21.4, 4.6); c.quadraticCurveTo(21.2, 6.6, 19.8, 8.8);
      c.moveTo(22.4, 7.6); c.quadraticCurveTo(22.8, 11, 22.0, 14.2);
    } else if (style === 'puffs') {
      for (var bx = 19.6; bx > 8; bx -= 2.8) { c.moveTo(bx + 0.9, 8.2); c.arc(bx, 8.4, 0.9, 0, Math.PI * 0.9); }
      c.moveTo(11.0, 2.0); c.arc(10.2, 2.6, 1.0, -0.6, 1.8);
      c.moveTo(17.2, 3.0); c.arc(16.4, 3.6, 1.0, -0.6, 1.8);
      c.moveTo(7.4, 6.0); c.arc(6.6, 6.6, 1.0, -0.6, 1.8);
      c.moveTo(21.8, 6.0); c.arc(21.0, 6.6, 1.0, -0.6, 1.8);
      c.moveTo(6.4, 12.4); c.arc(6.4, 12.4, 0.8, 0, Math.PI * 1.3);
      c.moveTo(21.6, 12.4); c.arc(21.6, 12.4, 0.8, 0, Math.PI * 1.3);
    } else {
      c.moveTo(13.2, 0.6); c.quadraticCurveTo(10.6, 3.5, 10.6, 7.0);
      c.moveTo(15.0, 0.6); c.quadraticCurveTo(17.6, 3.5, 17.7, 6.9);
      c.moveTo(14.2, 2.6); c.lineTo(14.4, 6.4);
      c.moveTo(7.2, 6.0); c.quadraticCurveTo(5.6, 10, 5.9, 14.5);
      c.moveTo(20.8, 6.0); c.quadraticCurveTo(22.4, 10, 22.1, 14.5);
    }
    c.stroke();
  }

  function napePath(bot) {
    return function () {
      c.moveTo(4.4, 9);
      c.bezierCurveTo(3.2, 14.5, 4.6, bot - 1.5, 7.4, bot);
      c.lineTo(20.6, bot);
      c.bezierCurveTo(23.4, bot - 1.5, 24.8, 14.5, 23.6, 9);
      c.closePath();
    };
  }

  /* A chin-length bob that lives wholly inside the bubble: a rounded
     mass with the ends curling in under the jaw. */
  function bobBackPath() {
    c.moveTo(4.0, 8.4);
    c.bezierCurveTo(2.6, 13.4, 3.2, 17.6, 5.4, 19.0);
    c.quadraticCurveTo(7.4, 19.9, 8.4, 18.4);
    c.lineTo(19.6, 18.4);
    c.quadraticCurveTo(20.6, 19.9, 22.6, 19.0);
    c.bezierCurveTo(24.8, 17.6, 25.4, 13.4, 24.0, 8.4);
    c.closePath();
  }

  function bow(bx, by, suitC, s) {
    s = s || 1;
    shape(ellipsePath(bx - 1.7 * s, by, 1.75 * s, 1.35 * s, -0.35), suitC, { d: 0.7, lw: 0.4 });
    shape(ellipsePath(bx + 1.7 * s, by, 1.75 * s, 1.35 * s, 0.35), suitC, { d: 0.7, lw: 0.4 });
    shape(circlePath(bx, by, 0.8 * s), pal(suitC, false).s1, { d: 0.4, lw: 0.35, rim: false });
    c.fillStyle = 'rgba(255, 255, 255, 0.55)';
    c.beginPath(); c.ellipse(bx - 1.9 * s, by - 0.5 * s, 0.6 * s, 0.3 * s, -0.35, 0, TAU); c.fill();
  }

  /* Twin tails: three locks per side; H = spring offsets (mid, tip). */
  function twinTails(hairC, H) {
    var p = pal(hairC, false);
    for (var side = -1; side <= 1; side += 2) {
      var spread = side * Math.max(0, -H.ty) * 0.32;
      var locks = [
        [9.2, 11.2, 14.4, 18.2, 12.0, 27.6, 2.1, 0.8],
        [10.6, 10.4, 18.6, 15.2, 16.6, 25.4, 1.7, 1.15],
        [9.9, 10.0, 17.8, 17.0, 13.6, 30.8, 3.2, 1.0],
      ];
      for (var i = 0; i < locks.length; i++) {
        var L = locks[i], w = L[7];
        var x0 = 14 + side * L[0], y0 = L[1];
        var cx = 14 + side * L[2] + H.mx * w + spread, cy = L[3] + H.my * w;
        var x1 = 14 + side * L[4] + H.tx * w + spread * 2.2, y1 = L[5] + H.ty * w;
        fastShape(lockPath(x0, y0, cx, cy, x1, y1, L[6]), i === 0 ? p.s1 : hairC, 1.1);
        if (i === 2) lockShine(x0, y0, cx, cy, x1, y1, p.hi, 0.12, 0.55, 0.9);
      }
    }
  }

  function braids(hairC, suitC, H, bead) {
    for (var side = -1; side <= 1; side += 2) {
      var x0 = 14 + side * 10.2, y0 = 10.2, ex = 0, ey = 0;
      for (var b = 0; b < 6; b++) {
        var k = b / 5;
        var ox = H.mx * 2 * k * (1 - k) + H.tx * k * k, oy = H.my * 2 * k * (1 - k) + H.ty * k * k;
        var bx = x0 + side * (1.4 * Math.sin(k * 2.2)) + (b % 2 ? 0.6 : -0.6) * side + ox;
        var by = y0 + b * 4.1 + oy;
        c.save();
        c.translate(bx, by);
        c.rotate((b % 2 ? 0.35 : -0.35) * side - ox * 0.06);
        blit(bead);
        c.restore();
        ex = bx; ey = by;
      }
      /* ribbon tie at the end */
      ey += 2.3;
      shape(ellipsePath(ex - 1.1, ey, 1.3, 0.9, -0.4), suitC, { d: 0.6, lw: 0.4 });
      shape(ellipsePath(ex + 1.1, ey, 1.3, 0.9, 0.4), suitC, { d: 0.6, lw: 0.4 });
    }
  }
  function braidBead(hairC) {
    var p = pal(hairC, false);
    shape(ellipsePath(0, 0, 2.25, 2.6, 0), hairC, { d: 1.0, lw: 0.45 });
    c.strokeStyle = p.s2;
    c.lineWidth = 0.3;
    c.beginPath();
    c.moveTo(-1.2, 1.2); c.quadraticCurveTo(0, 0.4, 1.2, 1.6);
    c.stroke();
    c.strokeStyle = p.hi;
    c.lineWidth = 0.35;
    c.beginPath(); c.arc(0, 0, 1.6, Math.PI * 1.1, Math.PI * 1.5); c.stroke();
  }

  function bunsPart(hairC) {
    var hp = pal(hairC, false);
    for (var side = -1; side <= 1; side += 2) {
      var bx = 14 + side * 8.4, by = 2.6;
      shape(circlePath(bx, by, 4.1), hairC, { d: 1.6, lw: 0.5 });
      c.strokeStyle = hp.s1;
      c.lineWidth = 0.4;
      c.beginPath(); c.arc(bx + 0.3, by + 0.3, 2.2, Math.PI * 0.1, Math.PI * 1.45); c.stroke();
      c.strokeStyle = hp.s2;
      c.lineWidth = 0.3;
      c.beginPath(); c.arc(bx - 0.2, by + 0.2, 3.2, Math.PI * 0.2, Math.PI * 0.9); c.stroke();
      c.fillStyle = 'rgba(255, 255, 255, 0.55)';
      c.beginPath(); c.ellipse(bx + LX * 1.6, by - 1.9, 1.1, 0.6, LX * 0.5, 0, TAU); c.fill();
    }
  }
  /* ribbon tails falling from the buns */
  function bunRibbons(suitC, H) {
    var p = pal(suitC, false);
    for (var side = -1; side <= 1; side += 2) {
      var rx0 = 14 + side * 8.6, rx1 = 14 + side * 12.2 + H.tx * 0.9;
      var cx = 14 + side * 13.2 + H.mx * 0.9, cy = 13 + H.my;
      fastShape(lockPath(rx0, 5.5, cx, cy, rx1, 24 + H.ty * 0.9, 1.4), suitC, 0.8, 0.45);
      lockShine(rx0, 5.5, cx, cy, rx1, 24 + H.ty * 0.9, p.hi, 0.1, 0.5, 0.5);
    }
  }

  /* One high ponytail leaving a port on the crown: it fountains up in
     the low gravity and falls away behind her. */
  function ponytail(hairC, suitC, H) {
    var p = pal(hairC, false);
    var x0 = 14.4, y0 = HY - HR + 0.4;
    var locks = [
      [x0 - 0.4, -12.0, -0.5, 12.0, 2.7, 1.0, 0],
      [x0 - 1.4, -9.5, 3.4, 8.0, 1.9, 0.8, 1],
      [x0 + 1.2, -10.5, 1.4, 15.0, 1.6, 1.15, 0],
    ];
    for (var i = 0; i < locks.length; i++) {
      var L = locks[i], w = L[5];
      var cx = L[0] - 6.5 + H.mx * w, cy = L[1] + H.my * w * 0.8;
      var x1 = L[2] + H.tx * w, y1 = L[3] + H.ty * w;
      fastShape(lockPath(x0, y0, cx, cy, x1, y1, L[4]), L[6] ? p.s1 : hairC, 1.1);
      if (i === 0) lockShine(x0, y0, cx, cy, x1, y1, p.hi, 0.08, 0.45, 0.8);
    }
    /* scrunchie on the port */
    shape(ellipsePath(x0, y0 - 0.6, 2.2, 1.3), suitC, { d: 0.7, lw: 0.4 });
    c.strokeStyle = pal(suitC, false).s1;
    c.lineWidth = 0.3;
    c.beginPath();
    c.moveTo(x0 - 1.2, y0 - 1.6); c.lineTo(x0 - 0.9, y0 + 0.4);
    c.moveTo(x0 + 0.3, y0 - 1.8); c.lineTo(x0 + 0.4, y0 + 0.6);
    c.moveTo(x0 + 1.4, y0 - 1.5); c.lineTo(x0 + 1.2, y0 + 0.4);
    c.stroke();
  }

  /* A single side tail out of the port on her right. */
  function sideTail(hairC, H) {
    var p = pal(hairC, false);
    var locks = [
      [23.2, 10.6, 30.4, 15.0, 25.2, 29.6, 3.1, 1.0, 0],
      [23.6, 10.0, 31.2, 13.2, 28.6, 25.6, 1.9, 1.2, 1],
      [22.8, 11.0, 28.6, 17.6, 23.6, 27.0, 1.7, 0.85, 1],
    ];
    for (var i = 0; i < locks.length; i++) {
      var L = locks[i], w = L[7];
      var cx = L[2] + H.mx * w, cy = L[3] + H.my * w;
      var x1 = L[4] + H.tx * w, y1 = L[5] + H.ty * w;
      fastShape(lockPath(L[0], L[1], cx, cy, x1, y1, L[6]), L[8] ? p.s1 : hairC, 1.1);
      if (i === 0) lockShine(L[0], L[1], cx, cy, x1, y1, p.hi, 0.1, 0.5, 0.9);
    }
  }

  /* Ringlets: a drill curl from each port, wide at the top and winding
     down to a point; each turn is one cached coil. */
  function ringlets(H, coil) {
    for (var side = -1; side <= 1; side += 2) {
      var x0 = 14 + side * 11.0, y0 = 11.6;
      for (var b = 5; b >= 0; b--) {
        var k = b / 5, sc = 1 - k * 0.52;
        var ox = H.mx * 2 * k * (1 - k) + H.tx * k * k, oy = H.my * 2 * k * (1 - k) + H.ty * k * k;
        c.save();
        c.translate(x0 + side * 1.6 * Math.sin(k * 2.0) + ox, y0 + b * 3.05 - k * k * 1.6 + oy);
        c.rotate(side * 0.3 - ox * 0.05);
        c.scale(side * sc, sc);
        blit(coil);
        c.restore();
      }
    }
  }
  function ringletCoil(hairC) {
    var p = pal(hairC, false);
    shape(ellipsePath(0, 0, 3.3, 2.1, 0), hairC, { d: 1.0, lw: 0.45 });
    /* the turn of the curl: a dark seam low on the coil, a gloss above */
    c.strokeStyle = p.s2;
    c.lineWidth = 0.34;
    c.beginPath(); c.moveTo(-2.9, 0.5); c.quadraticCurveTo(0, 2.0, 3.0, -0.2); c.stroke();
    c.strokeStyle = p.hi;
    c.lineWidth = 0.45;
    c.beginPath(); c.moveTo(-2.2, -0.9); c.quadraticCurveTo(-0.4, -1.7, 1.4, -1.2); c.stroke();
  }

  /* Long straight hair: a curtain down her back to the knees, drawn
     behind the body so it shows at her flanks; the hem follows the tail
     springs. */
  function longBack(hairC, H) {
    var p = pal(hairC, false);
    var mx = H.mx * 0.7, my = H.my * 0.5, tx = H.tx * 0.8, ty = H.ty * 0.6;
    var hem = 31.4 + ty;
    var path = function () {
      c.moveTo(6.6, 18.2);
      c.bezierCurveTo(3.8 + mx * 0.4, 21.5, 2.6 + mx, 26.5 + my, 3.4 + tx, hem);
      c.lineTo(5.6 + tx, hem + 1.3);
      c.lineTo(7.6 + tx, hem + 0.2);
      c.lineTo(9.8 + tx, hem + 1.2);
      c.lineTo(12.0 + tx, hem + 0.3);
      c.lineTo(14.0 + tx, hem + 1.2);
      c.lineTo(16.0 + tx, hem + 0.3);
      c.lineTo(18.2 + tx, hem + 1.2);
      c.lineTo(20.4 + tx, hem + 0.2);
      c.lineTo(22.4 + tx, hem + 1.3);
      c.lineTo(24.6 + tx, hem);
      c.bezierCurveTo(25.4 + mx, 26.5 + my, 24.2 + mx * 0.4, 21.5, 21.4, 18.2);
      c.closePath();
    };
    fastShape(path, p.s1, 1.2, 0.5);
    /* long strands and a sheen down each flank */
    c.strokeStyle = p.s2;
    c.lineWidth = 0.3;
    c.beginPath();
    for (var side = -1; side <= 1; side += 2) {
      c.moveTo(14 + side * 8.4, 20.5); c.quadraticCurveTo(14 + side * 9.6 + mx, 26 + my, 14 + side * 8.6 + tx, hem);
      c.moveTo(14 + side * 9.4, 21.5); c.quadraticCurveTo(14 + side * 10.7 + mx, 26.5 + my, 14 + side * 9.9 + tx, hem - 0.4);
    }
    c.stroke();
    lockShine(14 + LX * 8.8, 21.0, 14 + LX * 10.4 + mx, 26 + my, 14 + LX * 9.4 + tx, hem - 1.2, p.hi, 0.1, 0.75, 0.3);
  }

  /* Curly puffs: a cloud of curls on each port. */
  function puffPart(hairC) {
    var p = pal(hairC, false), PI = Math.PI;
    shape(cloudPath(0, 0, 3.5, 3.5, 9, 1.9), hairC, { d: 1.5, lw: 0.5 });
    /* curls inside the cloud */
    c.strokeStyle = p.s2;
    c.lineWidth = 0.32;
    c.beginPath();
    c.moveTo(1.5, -1.0); c.arc(0.6, -1.0, 0.9, 0, PI * 1.5);
    c.moveTo(-0.8, 2.3); c.arc(-1.7, 2.3, 0.9, 0, PI * 1.5);
    c.moveTo(3.2, 1.9); c.arc(2.3, 1.9, 0.9, 0, PI * 1.5);
    c.moveTo(-2.0, -2.4); c.arc(-2.8, -2.0, 0.85, -1.2, PI * 0.8);
    c.stroke();
    c.fillStyle = 'rgba(255, 255, 255, 0.5)';
    c.beginPath(); c.ellipse(LX * 2.0, -3.0, 1.5, 0.75, LX * 0.5, 0, TAU); c.fill();
  }

  /* ---------- Face ---------- */
  function facePath() {
    c.moveTo(6, 10.5);
    c.bezierCurveTo(5.6, 15.4, 9.3, 19.6, 14, 19.6);
    c.bezierCurveTo(18.7, 19.6, 22.4, 15.4, 22, 10.5);
    c.bezierCurveTo(21.6, 5.0, 6.4, 5.0, 6, 10.5);
    c.closePath();
  }

  /* Iris colours for the eye colour she picked: deep at the lid, the
     colour itself across the middle, a pale glow along the bottom. */
  var IRIS_TOP = '#3a1230', IRIS_MID = EYES_DEFAULT, IRIS_BOT = '#f39ac0';
  function setIris(col) {
    IRIS_MID = col;
    IRIS_TOP = col === EYES_DEFAULT ? '#3a1230' : mix(col, '#10041c', 0.66);
    IRIS_BOT = col === EYES_DEFAULT ? '#f39ac0' : mix(mix(col, '#ffffff', 0.5), '#ffd0e8', 0.25);
  }
  function eye(ex, ey, side, state, skinC) {
    var rx = 2.7, ry = 3.3;
    c.lineCap = 'round';
    if (state === 'happy') {
      c.strokeStyle = '#2a0c24';
      c.lineWidth = 0.9;
      c.beginPath();
      c.arc(ex, ey + 1.2, 2.2, Math.PI * 1.12, Math.PI * 1.88);
      c.stroke();
      c.lineWidth = 0.5;
      c.beginPath();
      c.moveTo(ex + side * 2.0, ey + 0.2); c.lineTo(ex + side * 2.9, ey - 0.4);
      c.stroke();
      return;
    }
    if (state === 'closed') {
      /* lids shut: a soft downward lash curve */
      c.strokeStyle = '#2a0c24';
      c.lineWidth = 0.85;
      c.beginPath();
      c.arc(ex, ey - 0.6, 2.5, Math.PI * 0.18, Math.PI * 0.82);
      c.stroke();
      c.lineWidth = 0.5;
      c.beginPath();
      c.moveTo(ex + side * 2.3, ey + 0.6); c.lineTo(ex + side * 3.0, ey + 0.1);
      c.stroke();
      return;
    }
    c.save();
    c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, TAU);
    c.fillStyle = '#fffafd';
    c.fill();
    c.clip();
    var ig = c.createLinearGradient(0, ey - ry, 0, ey + ry);
    ig.addColorStop(0, IRIS_TOP);
    ig.addColorStop(0.5, IRIS_MID);
    ig.addColorStop(1, IRIS_BOT);
    c.fillStyle = ig;
    c.beginPath(); c.ellipse(ex, ey + 0.35, rx * 0.84, ry * 0.86, 0, 0, TAU); c.fill();
    c.strokeStyle = '#2a0c24';
    c.lineWidth = 0.3;
    c.stroke();
    /* iris ring of light along the bottom */
    c.strokeStyle = 'rgba(255, 210, 230, 0.55)';
    c.lineWidth = 0.35;
    c.beginPath(); c.ellipse(ex, ey + 0.35, rx * 0.62, ry * 0.66, 0, Math.PI * 0.2, Math.PI * 0.8); c.stroke();
    c.fillStyle = '#22081c';
    c.beginPath(); c.ellipse(ex, ey + 0.55, rx * 0.38, ry * 0.42, 0, 0, TAU); c.fill();
    /* upper-lid shadow across the white and iris */
    c.fillStyle = 'rgba(70, 20, 70, 0.32)';
    c.beginPath(); c.ellipse(ex, ey - ry * 0.72, rx * 1.2, ry * 0.55, 0, 0, TAU); c.fill();
    /* catchlights: her star on the lit side, a dot opposite */
    c.fillStyle = '#ffffff';
    fillStar(ex + LX * rx * 0.3, ey - ry * 0.28, 1.15);
    c.beginPath(); c.arc(ex - LX * rx * 0.36, ey + ry * 0.42, 0.42, 0, TAU); c.fill();
    if (state === 'half') {
      /* the lid comes halfway down */
      c.fillStyle = skinC;
      c.fillRect(ex - rx - 1, ey - ry - 1, rx * 2 + 2, ry + 0.9);
      c.fillStyle = pal(skinC, true).s1;
      c.fillRect(ex - rx - 1, ey - 0.6, rx * 2 + 2, 0.5);
    }
    c.restore();
    c.strokeStyle = '#2a0c24';
    if (state === 'half') {
      c.lineWidth = 0.9;
      c.beginPath();
      c.ellipse(ex, ey - 0.2, rx + 0.15, 0.9, 0, Math.PI * 1.0, Math.PI * 2.0);
      c.stroke();
      return;
    }
    /* upper lash line, heavy at the outer corner, with flicks */
    c.lineWidth = 0.95;
    c.beginPath();
    if (side < 0) c.ellipse(ex, ey, rx + 0.15, ry + 0.15, 0, Math.PI * 1.05, Math.PI * 1.8);
    else c.ellipse(ex, ey, rx + 0.15, ry + 0.15, 0, Math.PI * 1.2, Math.PI * 1.95);
    c.stroke();
    c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(ex + side * (rx - 0.1), ey - ry * 0.5);
    c.lineTo(ex + side * (rx + 1.2), ey - ry * 0.95);
    c.moveTo(ex + side * (rx - 0.6), ey - ry * 0.82);
    c.lineTo(ex + side * (rx + 0.5), ey - ry * 1.3);
    c.stroke();
    /* lower lash hint */
    c.strokeStyle = 'rgba(140, 60, 100, 0.55)';
    c.lineWidth = 0.35;
    c.beginPath(); c.ellipse(ex, ey, rx * 0.9, ry, 0, Math.PI * 0.3, Math.PI * 0.7); c.stroke();
  }

  function facePart(skinC, style, face) {
    var sp = pal(skinC, true);
    /* neck in the chin's shadow */
    c.fillStyle = sp.s1;
    c.fillRect(12.2, 18.4, 3.6, 2.2);
    shape(facePath, skinC, { warm: true, d: 1.7, soft: true, lw: 0.55 });
    c.save();
    c.beginPath(); facePath(); c.clip();
    /* fringe casts a soft shadow onto the forehead */
    c.translate(-LX * 0.5, 1.2);
    c.beginPath(); fringeOf(style)();
    c.fillStyle = sp.s1;
    c.globalAlpha *= 0.6;
    c.fill();
    c.restore();
    /* blush */
    c.fillStyle = 'rgba(255, 128, 168, 0.45)';
    c.beginPath(); c.ellipse(7.9, 16.0, 2.0, 1.1, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(20.1, 16.0, 2.0, 1.1, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255, 255, 255, 0.6)';
    c.beginPath(); c.arc(14 + LX * 6.6, 15.3, 0.45, 0, TAU); c.fill();
    if (face === 'freckles') {
      c.fillStyle = rgba(mix(sp.s2, '#a04828', 0.5), 0.7);
      var fr = [[7.0, 15.6], [8.1, 16.5], [9.1, 15.5], [18.9, 15.5], [19.9, 16.5], [21.0, 15.6], [13.2, 15.1], [14.8, 15.1]];
      for (var i = 0; i < fr.length; i++) { c.beginPath(); c.arc(fr[i][0], fr[i][1], 0.32, 0, TAU); c.fill(); }
    } else if (face === 'heartCheeks') {
      heartMark(9.0, 17.2, 1.15);
      heartMark(19.0, 17.2, 1.15);
    } else if (face === 'starPaint') {
      /* face paint: a gold star under one eye, a moon and dots under the other */
      c.fillStyle = '#b8780c';
      fillStar(8.9, 17.1, 1.75);
      c.fillStyle = GOLD;
      fillStar(8.9, 17.1, 1.4);
      c.fillStyle = GOLD_HI;
      fillStar(8.7, 16.9, 0.55);
      /* crescent: a disc with a bite out of its upper right */
      c.save();
      c.beginPath(); c.arc(19.0, 17.1, 1.45, 0, TAU); c.clip();
      c.fillStyle = '#6a58d8';
      c.beginPath(); c.rect(16, 14, 6, 6); c.arc(19.75, 16.6, 1.2, 0, TAU, true); c.fill('evenodd');
      c.restore();
      c.fillStyle = '#4ac8ff';
      c.beginPath(); c.arc(20.6, 18.0, 0.28, 0, TAU); c.fill();
      c.fillStyle = '#ff7ab0';
      c.beginPath(); c.arc(7.4, 16.2, 0.28, 0, TAU); c.fill();
      c.beginPath(); c.arc(17.4, 18.2, 0.26, 0, TAU); c.fill();
    }
  }
  function heartMark(x, y, r) {
    c.fillStyle = '#ff5c8e';
    c.beginPath();
    c.moveTo(x, y + r);
    c.bezierCurveTo(x - r * 1.5, y - r * 0.1, x - r * 0.7, y - r * 1.15, x, y - r * 0.3);
    c.bezierCurveTo(x + r * 0.7, y - r * 1.15, x + r * 1.5, y - r * 0.1, x, y + r);
    c.fill();
    c.fillStyle = 'rgba(255, 255, 255, 0.75)';
    c.beginPath(); c.arc(x + LX * r * 0.4, y - r * 0.3, r * 0.22, 0, TAU); c.fill();
  }

  /* Things she wears on her face; they stay put when her eyes move. */
  function faceWearPart(cu) {
    var ex0 = 10.2, ex1 = 17.8, ey = 13.3, i;
    if (cu.face === 'glasses') {
      var fr = mix(cu.suit, '#3a1458', 0.45);
      c.lineWidth = 0.75;
      for (i = 0; i < 2; i++) {
        var ex = i ? ex1 : ex0;
        /* lens: a faint tint and a slanted streak of glare */
        c.beginPath(); c.arc(ex, ey + 0.2, 3.55, 0, TAU);
        c.fillStyle = 'rgba(200, 240, 255, 0.16)';
        c.fill();
        c.save(); c.clip();
        c.fillStyle = 'rgba(255, 255, 255, 0.4)';
        c.beginPath();
        c.moveTo(ex - 3.6, ey - 0.6); c.lineTo(ex - 1.2, ey - 3.6); c.lineTo(ex - 0.2, ey - 3.6); c.lineTo(ex - 3.6, ey + 0.8);
        c.closePath(); c.fill();
        c.restore();
        c.strokeStyle = inkColor(fr);
        c.lineWidth = 1.05;
        c.beginPath(); c.arc(ex, ey + 0.2, 3.55, 0, TAU); c.stroke();
        c.strokeStyle = fr;
        c.lineWidth = 0.6;
        c.stroke();
        c.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        c.lineWidth = 0.3;
        c.beginPath(); c.arc(ex, ey + 0.2, 3.55, Math.PI * 1.1, Math.PI * 1.5); c.stroke();
      }
      c.strokeStyle = inkColor(fr);
      c.lineWidth = 0.7;
      c.beginPath(); c.moveTo(13.0, ey - 0.6); c.quadraticCurveTo(14, ey - 1.4, 15.0, ey - 0.6); c.stroke();
      c.beginPath(); c.moveTo(6.7, ey - 0.4); c.lineTo(5.9, ey - 1.0); c.moveTo(21.3, ey - 0.4); c.lineTo(22.1, ey - 1.0); c.stroke();
    } else if (cu.face === 'starShades') {
      for (i = 0; i < 2; i++) {
        var sx = i ? ex1 + 0.3 : ex0 - 0.3;
        var star = starPath(sx, ey + 0.2, 4.2, 0.56);
        c.beginPath(); star();
        var g = c.createLinearGradient(0, ey - 4.4, 0, ey + 4.6);
        g.addColorStop(0, '#3a1e86');
        g.addColorStop(0.55, '#b83aa8');
        g.addColorStop(1, '#ff8ac0');
        c.fillStyle = g;
        c.fill();
        c.save(); c.clip();
        c.fillStyle = 'rgba(255, 255, 255, 0.5)';
        c.beginPath();
        c.moveTo(sx - 4.6, ey - 0.4); c.lineTo(sx - 1.4, ey - 4.6); c.lineTo(sx - 0.2, ey - 4.6); c.lineTo(sx - 4.6, ey + 1.2);
        c.closePath(); c.fill();
        c.restore();
        c.lineJoin = 'round';
        c.strokeStyle = '#7a4a00';
        c.lineWidth = 1.0;
        c.beginPath(); star(); c.stroke();
        c.strokeStyle = GOLD;
        c.lineWidth = 0.55;
        c.stroke();
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(sx + LX * 1.2, ey - 1.2, 0.4, 0, TAU); c.fill();
      }
      c.strokeStyle = '#7a4a00';
      c.lineWidth = 1.0;
      c.beginPath(); c.moveTo(13.0, ey - 0.5); c.quadraticCurveTo(14, ey - 1.1, 15.0, ey - 0.5); c.stroke();
      c.strokeStyle = GOLD;
      c.lineWidth = 0.55;
      c.stroke();
    }
  }

  function featuresPart(skinC, eyes, mouth, iris) {
    var sp = pal(skinC, true);
    setIris(iris);
    eye(10.2, 13.3, -1, eyes, skinC);
    eye(17.8, 13.3, 1, eyes, skinC);
    c.fillStyle = sp.s1;
    c.beginPath(); c.ellipse(14 - LX * 0.4, 15.9, 0.55, 0.4, 0, 0, TAU); c.fill();
    if (mouth === 'happy') {
      c.fillStyle = '#9c2c48';
      c.beginPath(); c.moveTo(12.0, 16.6); c.quadraticCurveTo(14, 19.6, 16.0, 16.6); c.closePath(); c.fill();
      c.fillStyle = '#ffffff';
      c.fillRect(12.5, 16.6, 3, 0.6);
      c.fillStyle = '#ff8aa4';
      c.beginPath(); c.ellipse(14, 18.0, 0.9, 0.5, 0, 0, TAU); c.fill();
    } else if (mouth === 'open') {
      c.fillStyle = '#9c2c48';
      c.beginPath(); c.ellipse(14, 17.5, 0.85, 1.0, 0, 0, TAU); c.fill();
      c.fillStyle = '#ff8aa4';
      c.beginPath(); c.ellipse(14, 18.0, 0.55, 0.4, 0, 0, TAU); c.fill();
    } else {
      c.fillStyle = '#a8344e';
      c.beginPath(); c.moveTo(12.9, 16.9); c.quadraticCurveTo(14, 18.5, 15.1, 16.9); c.closePath(); c.fill();
      c.fillStyle = '#ff8aa4';
      c.beginPath(); c.ellipse(14, 17.6, 0.55, 0.3, 0, 0, TAU); c.fill();
    }
  }

  function fringePart(cu) {
    var st = cu.hairStyle;
    if (st === 'pixie') {
      /* a springy cowlick on the crown */
      fastShape(lockPath(13.6, 0.2, 14.2, -2.9, 17.8, -2.0, 0.85), cu.hair, 0.5, 0.45);
    }
    shape(fringeOf(st), cu.hair, { d: 1.6, lw: 0.6 });
    hairGloss(cu.hair, st);
    if (st === 'twinTails' || st === 'ringlets') {
      bow(4.2, 10.6, cu.suit);
      bow(23.8, 10.6, cu.suit);
    } else if (st === 'sideTail') {
      bow(23.6, 9.8, cu.suit, 1.1);
    } else if (st === 'bob') {
      /* star hair clip */
      shape(starPath(7.0, 5.2, 1.9, 0.5), '#ffd24a', { d: 0.6, lw: 0.35 });
      c.fillStyle = 'rgba(255, 255, 255, 0.85)';
      c.beginPath(); c.arc(6.6, 4.6, 0.32, 0, TAU); c.fill();
    } else if (st === 'longBraids') {
      /* tiny clips where the braids start */
      shape(roundRectPath(3.4, 9.0, 1.6, 2.6, 0.6), cu.suit, { d: 0.4, lw: 0.3 });
      shape(roundRectPath(23.0, 9.0, 1.6, 2.6, 0.6), cu.suit, { d: 0.4, lw: 0.3 });
    } else if (st === 'longHair') {
      /* ribbon headband with a bow over her left temple */
      var hb = function () {
        c.moveTo(4.5, 6.2);
        c.bezierCurveTo(6.4, 0.2, 21.6, 0.2, 23.5, 6.2);
        c.lineTo(22.4, 7.2);
        c.bezierCurveTo(20.6, 2.2, 7.4, 2.2, 5.6, 7.2);
        c.closePath();
      };
      shape(hb, cu.suit, { d: 0.6, lw: 0.4 });
      bow(21.0, 3.6, cu.suit, 1.05);
    } else if (st === 'pixie') {
      /* two crossed hair pins */
      c.strokeStyle = inkColor(cu.suit);
      c.lineWidth = 1.1;
      c.beginPath(); c.moveTo(5.6, 8.4); c.lineTo(8.2, 10.0); c.moveTo(5.5, 10.0); c.lineTo(8.3, 8.4); c.stroke();
      c.strokeStyle = cu.suit;
      c.lineWidth = 0.65;
      c.stroke();
    } else if (st === 'puffs') {
      /* bead bobbles on the ports */
      for (var side = -1; side <= 1; side += 2) {
        shape(circlePath(14 + side * 9.5, 10.9, 1.05), cu.suit, { d: 0.5, lw: 0.35 });
        shape(circlePath(14 + side * 9.9, 12.9, 1.05), mix(cu.suit, '#ffffff', 0.5), { d: 0.5, lw: 0.35 });
      }
    }
  }

  /* hair behind the head, inside the bubble */
  function hairBackPart(cu) {
    var st = cu.hairStyle;
    var nape = st === 'buns' || st === 'puffs' ? 18.5 : st === 'ponytail' ? 17.5 : st === 'pixie' ? 16.6 : 22;
    if (st === 'bob') shape(bobBackPath, pal(cu.hair, false).s1, { d: 1.2, hi: false, lw: 0.5 });
    else shape(napePath(nape), pal(cu.hair, false).s1, { d: 1.2, hi: false, lw: 0.5 });
    if (st === 'buns') bunsPart(cu.hair);
    if (st === 'pixie') {
      /* the ends flick out under her ears */
      for (var side = -1; side <= 1; side += 2) {
        fastShape(lockPath(14 + side * 8.6, 13.4, 14 + side * 9.9, 16.2, 14 + side * 8.9, 18.2, 1.3), pal(cu.hair, false).s1, 0.6, 0.45);
      }
    }
  }

  /* ---------- Body ---------- */
  function legColor(outfit, suitC) {
    if (outfit === 'galaxyDress') return '#3e2c6c';
    if (outfit === 'puffySuit' || outfit === 'rainbow') return '#eef0fa';
    if (outfit === 'tutu') return '#ffd9e8';
    if (outfit === 'mech') return metalOf(suitC);
    if (outfit === 'pilot') return mix(suitC, '#20264a', 0.62);
    if (isDress(outfit)) return '#ffe8ee';
    if (isSuit(outfit)) return suitC;
    return '#3a2a50';
  }

  function metalOf(col) { return mix(col, '#c8d4ec', 0.55); }
  var RAINBOW = ['#ff5a6e', '#ffb03a', '#ffe14a', '#4ad48a', '#4aa8ff', '#9a6af0'];

  var SOLE = '#3a2450';
  /* Boots at (cx, cy) with the toe toward +x, sole at cy + 1.15; socks
     adds a frilled sock top where a bare leg meets a low shoe. */
  function shoe(style, col, cx, cy, socks) {
    var p = pal(col, false);
    if (style === 'flipper') {
      /* chunky quilted moon boot */
      var mb = function () {
        c.moveTo(cx - 2.9, cy + 1.2);
        c.quadraticCurveTo(cx - 3.4, cy - 1.6, cx - 2.3, cy - 2.7);
        c.lineTo(cx + 1.2, cy - 2.7);
        c.quadraticCurveTo(cx + 1.6, cy - 1.0, cx + 2.8, cy - 0.8);
        c.quadraticCurveTo(cx + 4.3, cy - 0.4, cx + 4.1, cy + 1.2);
        c.closePath();
      };
      shape(mb, col, { d: 1.0, lw: 0.45 });
      c.save(); c.beginPath(); mb(); c.clip();
      c.fillStyle = '#f4f0ff';
      c.fillRect(cx - 4, cy + 0.35, 9, 1);
      c.fillStyle = '#b8a8d8';
      c.fillRect(cx - 4, cy + 1.0, 9, 0.3);
      c.restore();
      /* quilting, tread and a buckled strap */
      c.strokeStyle = p.s2;
      c.lineWidth = 0.28;
      c.beginPath();
      c.moveTo(cx - 2.9, cy - 1.5); c.quadraticCurveTo(cx - 0.8, cy - 1.1, cx + 1.3, cy - 1.5);
      c.moveTo(cx - 3.0, cy - 0.5); c.quadraticCurveTo(cx, cy, cx + 3.6, cy - 0.5);
      c.moveTo(cx - 0.8, cy - 2.6); c.lineTo(cx - 0.8, cy + 0.3);
      c.stroke();
      c.strokeStyle = '#8a7ab8';
      c.beginPath();
      for (var tn = 0; tn < 6; tn++) { c.moveTo(cx - 2.4 + tn * 1.15, cy + 0.75); c.lineTo(cx - 2.4 + tn * 1.15, cy + 1.2); }
      c.stroke();
      c.strokeStyle = '#ffffff';
      c.lineWidth = 0.55;
      c.beginPath(); c.moveTo(cx - 2.9, cy - 2.05); c.lineTo(cx + 1.35, cy - 2.05); c.stroke();
      gold(roundRectPath(cx - 0.3, cy - 2.45, 0.95, 0.8, 0.2), { d: 0.2, lw: 0.24 });
      c.fillStyle = 'rgba(255, 255, 255, 0.7)';
      c.beginPath(); c.ellipse(cx + 2.7, cy - 0.25, 0.9, 0.3, 0.2, 0, TAU); c.fill();
      shape(roundRectPath(cx - 2.8, cy - 3.4, 4.4, 1.2, 0.5), '#ffffff', { d: 0.4, lw: 0.3 });
      return;
    }
    if (style === 'starBoots') {
      /* tall boot up the calf with a fluffy cuff and a star */
      var sb = function () {
        c.moveTo(cx - 2.6, cy + 1.2);
        c.lineTo(cx - 2.2, cy - 4.2);
        c.lineTo(cx + 1.6, cy - 4.2);
        c.lineTo(cx + 1.7, cy - 1.2);
        c.quadraticCurveTo(cx + 3.8, cy - 0.9, cx + 3.7, cy + 1.2);
        c.closePath();
      };
      shape(sb, col, { d: 1.0, lw: 0.45 });
      c.fillStyle = SOLE;
      c.fillRect(cx - 2.7, cy + 0.6, 6.5, 0.6);
      gold(starPath(cx - 0.3, cy - 1.8, 1.35, 0.5), { d: 0.4, lw: 0.3 });
      c.fillStyle = '#fff6c8';
      fillStar(cx - 0.45, cy - 1.95, 0.5);
      /* heel block, toe shine and a stitched seam up the back */
      shape(roundRectPath(cx - 2.8, cy + 0.2, 1.5, 1.0, 0.3), p.s2, { d: 0.2, lw: 0.28, rim: false, hi: false });
      c.fillStyle = 'rgba(255, 255, 255, 0.7)';
      c.beginPath(); c.ellipse(cx + 2.4, cy - 0.35, 0.85, 0.3, 0.2, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      c.lineWidth = 0.22;
      c.setLineDash([0.4, 0.4]);
      c.beginPath(); c.moveTo(cx - 1.7, cy - 3.8); c.lineTo(cx - 1.9, cy + 0.2); c.stroke();
      c.setLineDash([]);
      /* cuff fluff */
      for (var f = 0; f < 4; f++) {
        shape(circlePath(cx - 2.1 + f * 1.25, cy - 4.4, 0.9), '#fff4fa', { d: 0.4, lw: 0.25, rim: false });
      }
      return;
    }
    if (style === 'rocketBoots') {
      var rb = function () {
        c.moveTo(cx - 2.8, cy + 1.2);
        c.quadraticCurveTo(cx - 3.1, cy - 1.8, cx - 1.8, cy - 2.4);
        c.lineTo(cx + 1.0, cy - 2.4);
        c.quadraticCurveTo(cx + 1.4, cy - 1.0, cx + 2.4, cy - 0.8);
        c.quadraticCurveTo(cx + 3.9, cy - 0.5, cx + 3.8, cy + 1.2);
        c.closePath();
      };
      var metal = mix(col, '#c8d4ec', 0.35);
      /* heel thruster */
      shape(function () {
        c.moveTo(cx - 2.6, cy - 0.6);
        c.lineTo(cx - 4.1, cy - 0.2);
        c.lineTo(cx - 4.1, cy + 1.3);
        c.lineTo(cx - 2.6, cy + 1.1);
        c.closePath();
      }, '#8a94b0', { d: 0.4, lw: 0.35 });
      shape(rb, metal, { d: 1.0, lw: 0.45 });
      c.fillStyle = SOLE;
      c.fillRect(cx - 2.8, cy + 0.6, 6.6, 0.6);
      c.fillStyle = '#ffffff';
      c.fillRect(cx - 2.6, cy - 1.3, 3.6, 0.35);
      c.fillStyle = '#44ffff';
      c.beginPath(); c.arc(cx + 0.6, cy - 1.9, 0.35, 0, TAU); c.fill();
      /* red nose cap, rivets, a streak of light on the plating */
      c.save(); c.beginPath(); rb(); c.clip();
      c.fillStyle = '#ff5a8a';
      c.beginPath(); c.ellipse(cx + 3.3, cy + 0.2, 1.5, 1.4, 0, 0, TAU); c.fill();
      c.restore();
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(cx - 2.1, cy - 0.5, 0.22, 0, TAU); c.fill();
      c.beginPath(); c.arc(cx - 0.6, cy - 0.3, 0.22, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255, 255, 255, 0.75)';
      c.beginPath(); c.ellipse(cx + 2.4, cy - 0.3, 0.8, 0.28, 0.2, 0, TAU); c.fill();
      c.fillStyle = '#7af0ff';
      c.beginPath(); c.ellipse(cx - 4.1, cy + 0.55, 0.3, 0.7, 0, 0, TAU); c.fill();
      /* fin */
      shape(function () {
        c.moveTo(cx - 1.6, cy - 2.4); c.lineTo(cx - 2.6, cy - 3.6); c.lineTo(cx - 0.4, cy - 2.4); c.closePath();
      }, '#ff5a8a', { d: 0.3, lw: 0.3, rim: false });
      return;
    }
    if (style === 'springBoots') {
      /* bouncy boot riding on a steel coil */
      var uy = cy - 1.7;
      var spb = function () {
        c.moveTo(cx - 2.7, uy + 1.15);
        c.quadraticCurveTo(cx - 3.1, uy - 1.9, cx - 1.9, uy - 2.5);
        c.lineTo(cx + 1.1, uy - 2.5);
        c.quadraticCurveTo(cx + 1.5, uy - 1.0, cx + 2.5, uy - 0.8);
        c.quadraticCurveTo(cx + 3.9, uy - 0.4, cx + 3.7, uy + 1.15);
        c.closePath();
      };
      /* coil: dark wire with a bright edge, on a foot plate */
      c.lineJoin = 'round';
      var coil = function () {
        c.beginPath();
        c.moveTo(cx - 1.9, uy + 1.2); c.lineTo(cx + 2.5, uy + 1.55); c.lineTo(cx - 1.9, uy + 1.95);
        c.lineTo(cx + 2.5, uy + 2.3); c.lineTo(cx - 1.9, uy + 2.65);
        c.stroke();
      };
      c.strokeStyle = '#3c4668'; c.lineWidth = 0.75; coil();
      c.strokeStyle = '#e6eeff'; c.lineWidth = 0.32; coil();
      shape(roundRectPath(cx - 2.7, cy + 0.75, 6.0, 0.6, 0.3), '#9aa6c8', { d: 0.3, lw: 0.3, rim: false });
      shape(spb, col, { d: 1.0, lw: 0.45 });
      c.save(); c.beginPath(); spb(); c.clip();
      c.fillStyle = mix(col, '#ffffff', 0.5);
      c.beginPath(); c.ellipse(cx + 2.9, uy + 0.7, 1.6, 1.4, 0, 0, TAU); c.fill();
      c.fillStyle = SOLE;
      c.fillRect(cx - 4, uy + 0.7, 9, 0.6);
      c.restore();
      shape(roundRectPath(cx - 2.6, uy - 3.2, 4.2, 1.2, 0.5), '#ffffff', { d: 0.4, lw: 0.3 });
      c.fillStyle = GOLD;
      fillStar(cx - 0.5, uy - 0.8, 0.9);
      c.fillStyle = 'rgba(255, 255, 255, 0.7)';
      c.beginPath(); c.ellipse(cx + 2.5, uy + 0.1, 0.7, 0.3, 0.2, 0, TAU); c.fill();
      return;
    }
    if (style === 'bunnySlippers') {
      var fur = mix(col, '#ffffff', 0.62), fp = pal(fur, false);
      /* pom tail on the heel */
      shape(circlePath(cx - 3.1, cy - 0.5, 0.95), '#ffffff', { d: 0.4, lw: 0.3, rim: false });
      var slip = function () {
        c.moveTo(cx - 2.8, cy + 1.15);
        c.quadraticCurveTo(cx - 3.4, cy - 1.5, cx - 1.4, cy - 1.9);
        c.quadraticCurveTo(cx + 1.4, cy - 2.4, cx + 2.9, cy - 1.5);
        c.quadraticCurveTo(cx + 4.6, cy - 0.5, cx + 4.0, cy + 1.15);
        c.closePath();
      };
      shape(slip, fur, { d: 1.0, lw: 0.45 });
      c.save(); c.beginPath(); slip(); c.clip();
      c.fillStyle = fp.s2;
      c.fillRect(cx - 4, cy + 0.7, 9, 0.6);
      c.restore();
      /* fluffy ankle cuff */
      for (var bf = 0; bf < 3; bf++) {
        shape(circlePath(cx - 2.3 + bf * 1.3, cy - 2.3, 0.9), '#ffffff', { d: 0.4, lw: 0.28, rim: false });
      }
      /* ears lie back from the toe */
      for (var be = 0; be < 2; be++) {
        var ex = cx + 1.5 + be * 0.9, ey = cy - 2.7 + be * 0.7, rot = -0.75 + be * 0.2;
        shape(ellipsePath(ex, ey, 0.8, 1.9, rot), fur, { d: 0.5, lw: 0.38 });
        c.fillStyle = 'rgba(255, 120, 176, 0.75)';
        c.beginPath(); c.ellipse(ex, ey, 0.34, 1.25, rot, 0, TAU); c.fill();
      }
      /* face on the toe */
      c.fillStyle = '#2a0c24';
      c.beginPath(); c.arc(cx + 2.7, cy - 0.45, 0.36, 0, TAU); c.fill();
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(cx + 2.6, cy - 0.57, 0.13, 0, TAU); c.fill();
      c.fillStyle = '#ff6a9e';
      c.beginPath(); c.ellipse(cx + 3.85, cy - 0.1, 0.36, 0.26, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255, 120, 170, 0.5)';
      c.beginPath(); c.ellipse(cx + 2.5, cy + 0.3, 0.6, 0.32, 0, 0, TAU); c.fill();
      return;
    }
    if (style === 'rollerSkates') {
      var ry0 = cy - 1.25;
      var rs = function () {
        c.moveTo(cx - 2.5, ry0 + 1.15);
        c.lineTo(cx - 2.2, ry0 - 3.1);
        c.lineTo(cx + 1.4, ry0 - 3.1);
        c.lineTo(cx + 1.6, ry0 - 1.1);
        c.quadraticCurveTo(cx + 3.8, ry0 - 0.8, cx + 3.6, ry0 + 1.15);
        c.closePath();
      };
      /* truck, wheels and toe stop under the boot */
      shape(roundRectPath(cx - 2.8, ry0 + 0.85, 6.6, 0.6, 0.3), '#9aa6c8', { d: 0.3, lw: 0.3, rim: false });
      shape(roundRectPath(cx + 3.2, ry0 + 1.2, 1.0, 1.0, 0.4), '#ff5a8a', { d: 0.3, lw: 0.28, rim: false });
      for (var wi = 0; wi < 2; wi++) {
        var wx = cx - 1.6 + wi * 3.5, wy = cy + 0.2;
        shape(circlePath(wx, wy, 1.12), GOLD, { d: 0.5, lw: 0.38, rim: false });
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(wx, wy, 0.42, 0, TAU); c.fill();
        c.fillStyle = '#8a94b0';
        c.beginPath(); c.arc(wx, wy, 0.18, 0, TAU); c.fill();
      }
      shape(rs, col, { d: 1.0, lw: 0.45 });
      c.save(); c.beginPath(); rs(); c.clip();
      c.fillStyle = '#ffffff';
      c.beginPath(); c.ellipse(cx + 3.0, ry0 + 0.6, 1.5, 1.3, 0, 0, TAU); c.fill();
      c.fillStyle = SOLE;
      c.fillRect(cx - 4, ry0 + 0.75, 9, 0.5);
      c.restore();
      /* laces up the front, a stripe on the side */
      c.strokeStyle = '#ffffff';
      c.lineWidth = 0.36;
      c.beginPath();
      for (var lc = 0; lc < 3; lc++) { c.moveTo(cx + 0.3, ry0 - 2.5 + lc * 0.75); c.lineTo(cx + 1.5, ry0 - 2.2 + lc * 0.75); }
      c.stroke();
      c.strokeStyle = p.hi;
      c.lineWidth = 0.4;
      c.beginPath(); c.moveTo(cx - 1.9, ry0 - 0.4); c.quadraticCurveTo(cx - 0.4, ry0 - 1.2, cx + 0.2, ry0 + 0.4); c.stroke();
      shape(roundRectPath(cx - 2.6, ry0 - 3.7, 4.3, 1.1, 0.5), '#ffffff', { d: 0.4, lw: 0.3 });
      return;
    }
    if (style === 'wingBoots') {
      var wb = function () {
        c.moveTo(cx - 2.7, cy + 1.2);
        c.quadraticCurveTo(cx - 3.0, cy - 1.8, cx - 2.0, cy - 2.9);
        c.lineTo(cx + 1.2, cy - 2.9);
        c.quadraticCurveTo(cx + 1.5, cy - 1.0, cx + 2.5, cy - 0.8);
        c.quadraticCurveTo(cx + 3.9, cy - 0.4, cx + 3.7, cy + 1.2);
        c.closePath();
      };
      /* a little feathered wing on the heel */
      var fe = [[-5.9, -4.7, 1.0], [-6.2, -2.9, 0.95], [-5.6, -1.3, 0.85]];
      for (var fi = 0; fi < 3; fi++) {
        shape(lockPath(cx - 1.9, cy - 1.5 + fi * 0.5, cx - 3.9, cy - 1.9 + fi * 0.5, cx + fe[fi][0], cy + fe[fi][1], fe[fi][2]),
          '#fffaff', { d: 0.5, lw: 0.36 });
      }
      shape(wb, col, { d: 1.0, lw: 0.45 });
      c.save(); c.beginPath(); wb(); c.clip();
      c.fillStyle = SOLE;
      c.fillRect(cx - 4, cy + 0.6, 9, 0.7);
      c.restore();
      /* turned-down cuff with a scalloped edge and a gold stud */
      var cuff = mix(col, '#ffffff', 0.55);
      shape(function () {
        c.moveTo(cx - 2.5, cy - 3.3); c.lineTo(cx + 1.6, cy - 3.3); c.lineTo(cx + 1.7, cy - 2.1);
        c.arc(cx + 1.0, cy - 2.1, 0.7, 0, Math.PI); c.arc(cx - 0.4, cy - 2.1, 0.7, 0, Math.PI); c.arc(cx - 1.8, cy - 2.1, 0.7, 0, Math.PI);
        c.closePath();
      }, cuff, { d: 0.5, lw: 0.35 });
      gold(circlePath(cx - 0.4, cy - 0.4, 0.6), { d: 0.3, lw: 0.28 });
      c.fillStyle = 'rgba(255, 255, 255, 0.75)';
      c.beginPath(); c.ellipse(cx + 2.1, cy - 0.2, 0.9, 0.35, 0.2, 0, TAU); c.fill();
      return;
    }
    var boxy = style === 'sneaker';
    var path = function () {
      c.moveTo(cx - 2.7, cy + 1.15);
      c.quadraticCurveTo(cx - 3.2, cy - 1.2, cx - 1.6, cy - 1.75);
      c.quadraticCurveTo(cx + 0.4, cy - 2.0, cx + 1.5, cy - 1.1);
      c.quadraticCurveTo(cx + (boxy ? 3.9 : 3.6), cy - 0.8, cx + (boxy ? 3.8 : 3.5), cy + 1.15);
      c.closePath();
    };
    shape(path, col, { d: 0.9, lw: 0.45 });
    c.save();
    c.beginPath(); path(); c.clip();
    if (boxy) {
      c.fillStyle = '#ffffff';
      c.fillRect(cx - 4, cy + 0.1, 8, 1.2);
      c.fillStyle = '#c8b8e0';
      c.fillRect(cx - 4, cy + 0.85, 8, 0.4);
    } else {
      c.fillStyle = SOLE;
      c.fillRect(cx - 4, cy + 0.6, 8, 0.7);
    }
    c.restore();
    if (boxy) {
      c.strokeStyle = '#ffffff';
      c.lineWidth = 0.35;
      c.beginPath();
      c.moveTo(cx - 0.6, cy - 1.4); c.lineTo(cx + 0.6, cy - 0.7);
      c.moveTo(cx + 0.4, cy - 1.5); c.lineTo(cx + 1.6, cy - 0.8);
      c.stroke();
      c.fillStyle = pal(col, false).s2;
      c.beginPath(); c.arc(cx - 1.9, cy - 0.3, 0.45, 0, TAU); c.fill();
    } else {
      c.strokeStyle = p.s2;
      c.lineWidth = 0.55;
      c.beginPath(); c.moveTo(cx - 2.3, cy - 1.0); c.lineTo(cx + 1.3, cy - 1.1); c.stroke();
      c.fillStyle = '#fff4aa';
      c.beginPath(); c.arc(cx + 1.2, cy - 1.1, 0.45, 0, TAU); c.fill();
      /* frilled sock top */
      if (socks) shape(function () {
        c.moveTo(cx - 1.7, cy - 2.9); c.lineTo(cx + 1.2, cy - 2.9); c.lineTo(cx + 1.2, cy - 2.0);
        c.arc(cx + 0.7, cy - 2.0, 0.5, 0, Math.PI); c.arc(cx - 0.25, cy - 2.0, 0.5, 0, Math.PI); c.arc(cx - 1.2, cy - 2.0, 0.5, 0, Math.PI);
        c.closePath();
      }, '#ffffff', { d: 0.3, lw: 0.3, rim: false });
      c.fillStyle = 'rgba(255, 255, 255, 0.75)';
      c.beginPath(); c.ellipse(cx + 2.0, cy - 0.3, 0.9, 0.35, 0.2, 0, TAU); c.fill();
    }
  }

  /* Leg with its boot, hip at (0, 0), hanging along +y: a thigh that
     tapers into the knee and a shaped calf. */
  var LEG_SHOE_Y = 6.2;
  function legPart(cu) {
    var lc = legColor(cu.outfit, cu.suit);
    var bare = isDress(cu.outfit) && cu.outfit !== 'galaxyDress';
    var leg = function () {
      c.moveTo(-1.9, -0.8);
      c.quadraticCurveTo(-2.05, 2.0, -1.35, 3.9);
      c.quadraticCurveTo(-1.6, 5.0, -1.2, 6.5);
      c.lineTo(1.25, 6.5);
      c.quadraticCurveTo(1.75, 5.0, 1.3, 3.9);
      c.quadraticCurveTo(2.0, 2.0, 1.9, -0.8);
      c.closePath();
    };
    shape(leg, lc, { warm: bare, d: 0.95, lw: 0.45 });
    /* knee shine */
    c.fillStyle = 'rgba(255, 255, 255, 0.4)';
    c.beginPath(); c.ellipse(-LX * 0.5, 3.6, 0.5, 0.75, 0, 0, TAU); c.fill();
    if (cu.outfit === 'puffySuit') {
      c.fillStyle = cu.suit;
      c.fillRect(-1.5, 3.4, 2.9, 0.8);
      c.strokeStyle = 'rgba(80, 70, 140, 0.45)';
      c.lineWidth = 0.3;
      c.beginPath(); c.moveTo(-1.8, 1.6); c.lineTo(1.8, 1.6); c.stroke();
    } else if (cu.outfit === 'rainbow') {
      for (var rb = 0; rb < 3; rb++) {
        c.fillStyle = RAINBOW[rb * 2];
        c.fillRect(-1.5, 3.1 + rb * 0.5, 2.9, 0.5);
      }
    } else if (cu.outfit === 'mech') {
      /* knee plate and a shin seam */
      shape(ellipsePath(0, 3.7, 1.75, 1.25), cu.suit, { d: 0.5, lw: 0.35 });
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(0, 3.7, 0.3, 0, TAU); c.fill();
      c.strokeStyle = pal(lc, false).s2;
      c.lineWidth = 0.3;
      c.beginPath(); c.moveTo(-1.6, 1.4); c.lineTo(1.6, 1.4); c.stroke();
    } else if (cu.outfit === 'pilot') {
      /* cargo pocket */
      c.strokeStyle = pal(lc, false).hi;
      c.lineWidth = 0.3;
      c.beginPath(); c.rect(-1.2, 0.9, 2.0, 1.9); c.moveTo(-1.2, 1.5); c.lineTo(0.8, 1.5); c.stroke();
    } else if (cu.outfit === 'tutu') {
      /* ballet ribbons laced up the shin */
      c.strokeStyle = cu.suit;
      c.lineWidth = 0.38;
      c.beginPath();
      c.moveTo(-1.3, 3.9); c.lineTo(1.3, 4.9); c.moveTo(1.4, 3.9); c.lineTo(-1.3, 4.9);
      c.moveTo(-1.3, 5.2); c.lineTo(1.3, 6.0); c.moveTo(1.3, 5.2); c.lineTo(-1.2, 6.0);
      c.stroke();
    }
    shoe(cu.shoes, cu.flipper, 0, LEG_SHOE_Y, bare);
  }

  function heartGem(hcx, hcy) {
    c.fillStyle = '#ff4a72';
    c.beginPath();
    c.arc(hcx - 0.6, hcy - 0.3, 0.65, 0, TAU);
    c.arc(hcx + 0.6, hcy - 0.3, 0.65, 0, TAU);
    c.moveTo(hcx - 1.15, hcy);
    c.lineTo(hcx, hcy + 1.3);
    c.lineTo(hcx + 1.15, hcy);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(255, 255, 255, 0.8)';
    c.beginPath(); c.arc(hcx - 0.6, hcy - 0.5, 0.25, 0, TAU); c.fill();
  }

  function skirtPath() {
    c.moveTo(8.6, 24.8);
    c.lineTo(19.4, 24.8);
    c.quadraticCurveTo(21.6, 27.2, 23.4, 30.3);
    c.quadraticCurveTo(20.8, 31.2, 18.6, 30.4);
    c.quadraticCurveTo(16.2, 31.2, 14.0, 30.4);
    c.quadraticCurveTo(11.8, 31.2, 9.4, 30.4);
    c.quadraticCurveTo(7.0, 31.2, 4.6, 30.3);
    c.quadraticCurveTo(6.4, 27.2, 8.6, 24.8);
    c.closePath();
  }

  /* One stiff layer of tulle: a fan from the waist to a scalloped hem. */
  function tulleLayer(halfW, hemY, n, col, a) {
    var r = halfW / n;
    var path = function () {
      c.moveTo(14 - 5.2, 24.9);
      c.lineTo(14 + 5.2, 24.9);
      c.quadraticCurveTo(14 + halfW * 0.86, 25.4, 14 + halfW, hemY);
      for (var i = 0; i < n; i++) c.arc(14 + halfW - r - i * 2 * r, hemY, r, 0, Math.PI);
      c.quadraticCurveTo(14 - halfW * 0.86, 25.4, 14 - 5.2, 24.9);
      c.closePath();
    };
    c.globalAlpha *= a;
    shape(path, col, { d: 1.2, lw: 0.32 });
    c.globalAlpha /= a;
    /* gathers running out from the waist */
    c.strokeStyle = rgba(pal(col, false).s1, 0.7);
    c.lineWidth = 0.28;
    c.beginPath();
    for (var g = 1; g < n; g++) {
      var gx = 14 + halfW - g * 2 * r;
      c.moveTo(14 + (gx - 14) * 0.5, 25.3); c.lineTo(gx, hemY);
    }
    c.stroke();
  }
  function blossom(x, y, r, col) {
    c.fillStyle = col;
    for (var i = 0; i < 5; i++) {
      var a = i / 5 * TAU - Math.PI / 2;
      c.beginPath(); c.arc(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.48, 0, TAU); c.fill();
    }
    c.fillStyle = GOLD;
    c.beginPath(); c.arc(x, y, r * 0.3, 0, TAU); c.fill();
  }
  function gownPath() {
    c.moveTo(8.6, 24.8);
    c.lineTo(19.4, 24.8);
    c.bezierCurveTo(22.6, 27.0, 24.8, 30.2, 25.2, 33.0);
    c.quadraticCurveTo(19.6, 34.3, 14, 33.7);
    c.quadraticCurveTo(8.4, 34.3, 2.8, 33.0);
    c.bezierCurveTo(3.2, 30.2, 5.4, 27.0, 8.6, 24.8);
    c.closePath();
  }
  function yukataSkirtPath() {
    c.moveTo(8.7, 24.8);
    c.lineTo(19.3, 24.8);
    c.quadraticCurveTo(20.9, 29, 20.5, 33.2);
    c.quadraticCurveTo(14, 34.0, 7.5, 33.2);
    c.quadraticCurveTo(7.1, 29, 8.7, 24.8);
    c.closePath();
  }

  function skirtPart(outfit, suitC) {
    var p = pal(suitC, false);
    if (outfit === 'tutu') {
      tulleLayer(9.4, 30.0, 5, p.s1, 0.92);
      tulleLayer(10.8, 29.0, 6, suitC, 0.92);
      tulleLayer(11.8, 27.8, 6, mix(suitC, '#ffffff', 0.5), 0.94);
      c.fillStyle = '#ffffff';
      var sq = [[6.0, 27.0], [9.4, 26.4], [12.6, 27.2], [16.2, 26.6], [19.4, 27.2], [22.2, 26.8]];
      for (var q = 0; q < sq.length; q++) { c.beginPath(); c.arc(sq[q][0], sq[q][1], 0.24, 0, TAU); c.fill(); }
      twinkle(8.0, 27.4, 0.8, '#ffffff');
      twinkle(20.6, 26.4, 0.7, '#fff8d0');
      return;
    }
    if (outfit === 'gown') {
      shape(gownPath, suitC, { d: 2.2 });
      c.save();
      c.beginPath(); gownPath(); c.clip();
      /* the skirt parts over a pale underskirt with tiered ruffles */
      var under = function () {
        c.moveTo(14, 25.0);
        c.quadraticCurveTo(11.2, 29, 9.2, 34.4);
        c.lineTo(18.8, 34.4);
        c.quadraticCurveTo(16.8, 29, 14, 25.0);
        c.closePath();
      };
      shape(under, '#fff4fa', { d: 1.0, lw: 0.35, rim: false });
      c.strokeStyle = '#e4bcd8';
      c.lineWidth = 0.32;
      c.beginPath();
      for (var tr = 0; tr < 3; tr++) {
        var ty = 28.2 + tr * 1.9, hw = 1.5 + tr * 1.05;
        c.moveTo(14 - hw, ty);
        for (var sc = 0; sc < 3; sc++) c.arc(14 - hw + hw / 3 + sc * hw * 2 / 3, ty, hw / 3, Math.PI, 0, true);
      }
      c.stroke();
      /* deep folds and a satin sheen on the overskirt */
      c.strokeStyle = p.s2;
      c.lineWidth = 0.4;
      c.beginPath();
      c.moveTo(9.4, 26.0); c.quadraticCurveTo(6.8, 29.6, 5.6, 33.2);
      c.moveTo(18.6, 26.0); c.quadraticCurveTo(21.2, 29.6, 22.4, 33.2);
      c.stroke();
      c.strokeStyle = rgba(p.hi, 0.9);
      c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(14 + LX * 3.6, 26.2); c.quadraticCurveTo(14 + LX * 6.4, 29.4, 14 + LX * 7.6, 32.4); c.stroke();
      c.restore();
      /* gold braid down the parting and round the hem */
      c.lineCap = 'round';
      var braid = function () {
        c.beginPath();
        c.moveTo(9.3, 33.7); c.quadraticCurveTo(11.2, 29, 14, 25.0); c.quadraticCurveTo(16.8, 29, 18.7, 33.7);
        c.moveTo(3.2, 32.9); c.quadraticCurveTo(6.4, 33.9, 9.3, 33.7);
        c.moveTo(18.7, 33.7); c.quadraticCurveTo(21.6, 33.9, 24.8, 32.9);
        c.stroke();
      };
      c.strokeStyle = '#8a5a08'; c.lineWidth = 0.95; braid();
      c.strokeStyle = GOLD; c.lineWidth = 0.55; braid();
      c.fillStyle = GOLD_HI;
      fillStar(6.6, 30.6, 0.85);
      fillStar(21.6, 30.2, 0.85);
      fillStar(8.6, 28.2, 0.6);
      fillStar(19.6, 28.0, 0.6);
      return;
    }
    if (outfit === 'yukata') {
      shape(yukataSkirtPath, suitC, { d: 1.7 });
      c.save();
      c.beginPath(); yukataSkirtPath(); c.clip();
      /* blossoms scattered over the cloth, a pale band at the hem */
      c.fillStyle = rgba(mix(suitC, '#ffffff', 0.7), 0.85);
      c.fillRect(6, 31.6, 16, 0.7);
      var pet = mix(suitC, '#ffffff', 0.86);
      blossom(10.2, 27.4, 1.1, pet);
      blossom(17.8, 29.4, 1.2, pet);
      blossom(11.6, 30.8, 0.8, pet);
      blossom(17.4, 26.4, 0.7, pet);
      c.restore();
      /* the left panel wraps over the right */
      c.strokeStyle = p.ink;
      c.lineWidth = 0.4;
      c.beginPath(); c.moveTo(15.8, 24.9); c.quadraticCurveTo(14.6, 29, 13.0, 33.5); c.stroke();
      c.strokeStyle = rgba(p.hi, 0.9);
      c.lineWidth = 0.35;
      c.beginPath(); c.moveTo(15.3, 25.2); c.quadraticCurveTo(14.1, 29, 12.5, 33.3); c.stroke();
      return;
    }
    /* petticoat frill peeking under the hem */
    if (outfit === 'frillyDress' || outfit === 'galaxyDress') {
      c.fillStyle = outfit === 'galaxyDress' ? '#d8c8ff' : '#ffffff';
      c.beginPath();
      c.moveTo(6, 29.6);
      for (var s = 0; s <= 6; s++) c.arc(6.6 + s * 2.5, 30.6, 1.25, Math.PI, 0);
      c.lineTo(22, 29.6);
      c.closePath();
      c.fill();
      c.strokeStyle = '#d6b6d8';
      c.lineWidth = 0.35;
      c.stroke();
    }
    if (outfit === 'galaxyDress') {
      shape(skirtPath, suitC, { d: 1.9 });
      c.save();
      c.beginPath(); skirtPath(); c.clip();
      var g = c.createLinearGradient(0, 24.8, 0, 31);
      g.addColorStop(0, rgba(suitC, 0));
      g.addColorStop(0.55, 'rgba(60, 30, 140, 0.55)');
      g.addColorStop(1, 'rgba(30, 14, 80, 0.85)');
      c.fillStyle = g;
      c.fillRect(4, 24, 20, 8);
      /* nebula wisps and stars */
      c.fillStyle = 'rgba(120, 220, 255, 0.35)';
      c.beginPath(); c.ellipse(10.5, 28.4, 3.2, 0.9, -0.3, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255, 120, 210, 0.35)';
      c.beginPath(); c.ellipse(17.6, 27.6, 3.0, 0.8, 0.35, 0, TAU); c.fill();
      c.fillStyle = '#ffffff';
      var dots = [[7.2, 29.4], [9.8, 26.8], [12.6, 29.0], [15.4, 26.4], [18.4, 29.6], [20.6, 28.0], [13.8, 27.6]];
      for (var d = 0; d < dots.length; d++) { c.beginPath(); c.arc(dots[d][0], dots[d][1], d % 3 ? 0.22 : 0.32, 0, TAU); c.fill(); }
      twinkle(16.6, 29.0, 0.9, '#fff8d0');
      c.restore();
      c.strokeStyle = '#c8b0ff';
      c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(5.0, 30.0); c.quadraticCurveTo(14, 31.0, 23.0, 30.0); c.stroke();
      return;
    }
    shape(skirtPath, suitC, { d: 1.9 });
    /* folds */
    c.strokeStyle = p.s1;
    c.lineWidth = 0.4;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(12.2, 25.6); c.quadraticCurveTo(11.4, 28, 10.8, 30.2);
    c.moveTo(16.0, 25.6); c.quadraticCurveTo(16.8, 28, 17.2, 30.2);
    c.moveTo(9.6, 26.2); c.quadraticCurveTo(8.2, 28.2, 7.2, 30.0);
    c.moveTo(18.4, 26.2); c.quadraticCurveTo(19.8, 28.2, 20.8, 30.0);
    c.stroke();
    c.strokeStyle = p.hi;
    c.lineWidth = 0.35;
    c.beginPath();
    c.moveTo(13.6, 25.8); c.quadraticCurveTo(13.4, 28, 13.2, 29.8);
    c.stroke();
    /* hem trim */
    if (outfit === 'snowDress') {
      /* snowflake stitches and a deep fur hem */
      twinkle(9.4, 27.6, 0.9, '#ffffff');
      twinkle(18.6, 27.2, 0.9, '#ffffff');
      twinkle(14.0, 28.4, 0.7, '#ffffff');
      for (var fh = 0; fh < 9; fh++) {
        shape(circlePath(5.4 + fh * 2.15, 30.2 + (fh % 2 ? 0.25 : -0.15), 1.3), '#fffaff', { d: 0.5, lw: 0.3, rim: false });
      }
    } else if (outfit === 'starDress') {
      c.fillStyle = '#ffd24a';
      fillStar(7.4, 28.9, 0.9);
      fillStar(11.2, 29.5, 0.8);
      fillStar(15.0, 28.6, 0.9);
      fillStar(19.0, 29.4, 0.8);
    } else if (outfit === 'sailorDress') {
      c.strokeStyle = '#ffffff';
      c.lineWidth = 0.5;
      c.beginPath();
      c.moveTo(6.0, 29.2); c.quadraticCurveTo(14, 29.9, 22.0, 29.2);
      c.stroke();
    }
  }

  function bodicePart(outfit, suitC) {
    var p = pal(suitC, false);
    var bodice = function () {
      c.moveTo(8.2, 21.2);
      c.quadraticCurveTo(14, 19.4, 19.8, 21.2);
      c.lineTo(19.3, 25.4);
      c.quadraticCurveTo(14, 26.0, 8.7, 25.4);
      c.closePath();
    };
    shape(bodice, suitC, { d: 1.4 });
    /* waist seam */
    c.strokeStyle = p.s2;
    c.lineWidth = 0.4;
    c.beginPath(); c.moveTo(8.8, 25.1); c.quadraticCurveTo(14, 25.8, 19.2, 25.1); c.stroke();
    if (outfit === 'frillyDress') {
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(9.8, 20.4);
      c.quadraticCurveTo(14, 22.4, 18.2, 20.4);
      c.lineTo(17.6, 21.6);
      c.quadraticCurveTo(14, 23.4, 10.4, 21.6);
      c.closePath();
      c.fill();
      c.strokeStyle = '#c8a8cc';
      c.lineWidth = 0.3;
      c.stroke();
      heartGem(14, 22.9);
    } else if (outfit === 'sailorDress') {
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(9, 20.6); c.lineTo(14, 23.8); c.lineTo(19, 20.6);
      c.lineTo(17, 20.6); c.lineTo(14, 22.4); c.lineTo(11, 20.6);
      c.closePath();
      c.fill();
      c.strokeStyle = p.ink;
      c.lineWidth = 0.3;
      c.stroke();
      c.strokeStyle = suitC;
      c.lineWidth = 0.3;
      c.beginPath(); c.moveTo(10.0, 20.9); c.lineTo(14, 23.3); c.lineTo(18.0, 20.9); c.stroke();
      /* neckerchief: a bow with two tails */
      shape(function () {
        c.moveTo(13.6, 23.6); c.lineTo(12.6, 25.9); c.lineTo(13.7, 25.4); c.lineTo(14, 24.2);
        c.lineTo(14.3, 25.4); c.lineTo(15.4, 25.9); c.lineTo(14.4, 23.6); c.closePath();
      }, '#ff4a72', { d: 0.3, lw: 0.28, rim: false });
      bow(14, 23.5, '#ff4a72', 0.62);
    } else if (outfit === 'tutu') {
      /* satin leotard: sweetheart seam, sequins, a ribbon sash and bow */
      c.strokeStyle = p.s2;
      c.lineWidth = 0.32;
      c.beginPath();
      c.moveTo(9.4, 22.4); c.quadraticCurveTo(11.6, 23.6, 14, 22.6); c.quadraticCurveTo(16.4, 23.6, 18.6, 22.4);
      c.stroke();
      c.strokeStyle = rgba(p.hi, 0.9);
      c.lineWidth = 0.45;
      c.beginPath(); c.moveTo(14 + LX * 3.6, 21.4); c.quadraticCurveTo(14 + LX * 4.6, 23, 14 + LX * 4.2, 24.6); c.stroke();
      c.fillStyle = '#ffffff';
      var sqn = [[11.2, 21.6], [16.6, 21.8], [12.6, 23.8], [15.6, 24.0], [17.8, 23.4]];
      for (var qi = 0; qi < sqn.length; qi++) { c.beginPath(); c.arc(sqn[qi][0], sqn[qi][1], 0.22, 0, TAU); c.fill(); }
      var sash = mix(suitC, '#ffffff', 0.6);
      shape(function () {
        c.moveTo(8.6, 24.3); c.quadraticCurveTo(14, 25.1, 19.4, 24.3); c.lineTo(19.3, 25.5);
        c.quadraticCurveTo(14, 26.2, 8.7, 25.5); c.closePath();
      }, sash, { d: 0.5, lw: 0.35, rim: false });
      bow(14, 25.0, sash, 0.8);
    } else if (outfit === 'gown') {
      /* gold stomacher, a jewel at the throat and a chain at the waist */
      var vee = function () {
        c.beginPath();
        c.moveTo(10.2, 20.8); c.lineTo(14, 24.6); c.lineTo(17.8, 20.8);
        c.stroke();
      };
      c.lineJoin = 'round';
      c.strokeStyle = '#8a5a08'; c.lineWidth = 0.95; vee();
      c.strokeStyle = GOLD; c.lineWidth = 0.55; vee();
      c.fillStyle = '#fff4fa';
      c.beginPath(); c.moveTo(11.0, 20.6); c.lineTo(14, 23.7); c.lineTo(17.0, 20.6); c.closePath(); c.fill();
      c.strokeStyle = '#e4bcd8';
      c.lineWidth = 0.25;
      c.beginPath(); c.moveTo(12.6, 21.6); c.lineTo(15.4, 21.6); c.moveTo(13.3, 22.5); c.lineTo(14.7, 22.5); c.stroke();
      gem(14, 24.6, 1.15, '#4ac8ff');
      c.strokeStyle = '#8a5a08'; c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(8.8, 25.0); c.quadraticCurveTo(14, 25.8, 19.2, 25.0); c.stroke();
      c.strokeStyle = GOLD; c.lineWidth = 0.45;
      c.stroke();
    } else if (outfit === 'yukata') {
      /* crossed collar over a white under-collar, wide obi and its cord */
      var obi = mix(suitC, '#ffffff', 0.74), cord = mix(suitC, '#3a1050', 0.3);
      shape(function () {
        c.moveTo(16.6, 20.4); c.lineTo(18.2, 20.5); c.lineTo(13.6, 24.2); c.lineTo(12.4, 23.5); c.closePath();
      }, '#fff8fc', { d: 0.4, lw: 0.32, rim: false });
      shape(function () {
        c.moveTo(9.8, 20.5); c.lineTo(11.4, 20.4); c.lineTo(15.6, 23.6); c.lineTo(14.4, 24.4); c.closePath();
      }, '#fff8fc', { d: 0.4, lw: 0.32, rim: false });
      shape(function () {
        c.moveTo(8.5, 23.5); c.quadraticCurveTo(14, 24.4, 19.5, 23.5); c.lineTo(19.4, 26.2);
        c.quadraticCurveTo(14, 27.0, 8.6, 26.2); c.closePath();
      }, obi, { d: 0.8, lw: 0.4 });
      c.strokeStyle = inkColor(cord); c.lineWidth = 0.75;
      c.beginPath(); c.moveTo(8.6, 24.9); c.quadraticCurveTo(14, 25.8, 19.4, 24.9); c.stroke();
      c.strokeStyle = cord; c.lineWidth = 0.42;
      c.stroke();
      gold(circlePath(14, 25.4, 0.7), { d: 0.3, lw: 0.28 });
      blossom(10.6, 22.4, 0.75, mix(suitC, '#ffffff', 0.86));
    } else if (outfit === 'snowDress') {
      /* fur-edged capelet tied with two pom-poms */
      var cap = function () {
        c.moveTo(6.8, 21.0);
        c.quadraticCurveTo(14, 19.3, 21.2, 21.0);
        c.quadraticCurveTo(22.2, 22.6, 21.6, 24.0);
        c.quadraticCurveTo(14, 25.4, 6.4, 24.0);
        c.quadraticCurveTo(5.8, 22.6, 6.8, 21.0);
        c.closePath();
      };
      shape(cap, mix(suitC, '#3a1050', 0.16), { d: 1.1, lw: 0.45 });
      for (var cf = 0; cf < 10; cf++) {
        var cfx = 6.6 + cf * 1.64, cfy = 24.1 + Math.sin(cf / 9 * Math.PI) * 0.85;
        shape(circlePath(cfx, cfy, 0.85), '#fffaff', { d: 0.4, lw: 0.26, rim: false });
      }
      c.strokeStyle = '#fffaff';
      c.lineWidth = 0.32;
      c.beginPath(); c.moveTo(13.6, 22.0); c.lineTo(12.8, 26.4); c.moveTo(14.4, 22.0); c.lineTo(15.3, 27.0); c.stroke();
      shape(circlePath(12.8, 26.9, 0.95), '#fffaff', { d: 0.4, lw: 0.28, rim: false });
      shape(circlePath(15.3, 27.5, 0.95), '#fffaff', { d: 0.4, lw: 0.28, rim: false });
    } else if (outfit === 'galaxyDress') {
      /* crescent-moon brooch on a dark sash */
      c.fillStyle = 'rgba(40, 20, 100, 0.55)';
      c.beginPath(); c.moveTo(8.6, 24.0); c.quadraticCurveTo(14, 24.9, 19.4, 24.0); c.lineTo(19.3, 25.3);
      c.quadraticCurveTo(14, 26.0, 8.7, 25.3); c.closePath(); c.fill();
      shape(circlePath(14, 22.6, 1.55), '#ffe27a', { d: 0.6, lw: 0.35 });
      c.fillStyle = suitC;
      c.beginPath(); c.arc(14.7, 22.2, 1.25, 0, TAU); c.fill();
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(16.9, 21.3, 0.25, 0, TAU); c.fill();
      c.beginPath(); c.arc(11.2, 21.8, 0.2, 0, TAU); c.fill();
    } else {
      shape(ellipsePath(12.4, 21.4, 1.5, 1.15, -0.3), '#ffd24a', { d: 0.6, lw: 0.35 });
      shape(ellipsePath(15.6, 21.4, 1.5, 1.15, 0.3), '#ffd24a', { d: 0.6, lw: 0.35 });
      c.fillStyle = '#c88a1a';
      c.beginPath(); c.arc(14, 21.4, 0.7, 0, TAU); c.fill();
      c.fillStyle = '#fff4a8';
      fillStar(14, 23.6, 1.4);
    }
  }

  function suitPart(outfit, suitC, gear) {
    var p = pal(suitC, false);
    var dark = mix(suitC, '#000000', 0.3);
    if (outfit === 'pilot' || outfit === 'mech' || outfit === 'kitty') {
      newSuit(outfit, suitC);
      return;
    }
    if (outfit !== 'onePiece' && outfit !== 'puffySuit' && gear !== 'jetpack') {
      /* oxygen tanks peeking out either side */
      shape(roundRectPath(5.6, 20.6, 2.8, 8.6, 1.2), mix(suitC, '#a8b8d0', 0.45), { d: 0.8, lw: 0.4 });
      shape(roundRectPath(19.6, 20.6, 2.8, 8.6, 1.2), mix(suitC, '#a8b8d0', 0.45), { d: 0.8, lw: 0.4 });
    }
    if (outfit === 'puffySuit') {
      /* classic white EVA suit, quilted, with mission colours */
      var puffy = function () {
        c.moveTo(8.0, 20.6);
        c.quadraticCurveTo(14, 19.2, 20.0, 20.6);
        c.quadraticCurveTo(21.6, 25.2, 20.4, 30.6);
        c.quadraticCurveTo(14, 31.6, 7.6, 30.6);
        c.quadraticCurveTo(6.4, 25.2, 8.0, 20.6);
        c.closePath();
      };
      shape(puffy, '#eef0fa', { d: 1.8 });
      c.strokeStyle = 'rgba(90, 80, 150, 0.45)';
      c.lineWidth = 0.32;
      c.beginPath();
      c.moveTo(7.4, 24.4); c.quadraticCurveTo(14, 25.2, 20.6, 24.4);
      c.moveTo(7.3, 27.8); c.quadraticCurveTo(14, 28.6, 20.7, 27.8);
      c.stroke();
      shape(roundRectPath(10.4, 21.2, 7.2, 3.4, 0.8), suitC, { d: 0.7, lw: 0.35 });
      c.fillStyle = '#44ff88'; c.beginPath(); c.arc(12.0, 22.9, 0.5, 0, TAU); c.fill();
      c.fillStyle = '#ffd24a'; c.beginPath(); c.arc(14.0, 22.9, 0.5, 0, TAU); c.fill();
      c.fillStyle = '#ff4466'; c.beginPath(); c.arc(16.0, 22.9, 0.5, 0, TAU); c.fill();
      c.fillStyle = suitC;
      c.fillRect(7.6, 29.2, 12.8, 1.0);
      c.strokeStyle = '#ffffff';
      c.lineWidth = 0.35;
      c.beginPath(); c.moveTo(14 + LX * 4.6, 21.4); c.quadraticCurveTo(14 + LX * 6.2, 24, 14 + LX * 5.8, 28); c.stroke();
      return;
    }
    if (outfit === 'rainbow') {
      var rt = roundRectPath(7.4, 20.2, 13.2, 10.4, 2.8);
      shape(rt, '#f6f4ff', { d: 1.6 });
      c.save();
      c.beginPath(); rt(); c.clip();
      c.lineCap = 'butt';
      c.lineWidth = 0.62;
      for (var ri = 0; ri < 6; ri++) {
        c.strokeStyle = RAINBOW[ri];
        c.beginPath(); c.arc(14, 27.2, 5.6 - ri * 0.56, Math.PI, 0); c.stroke();
      }
      c.lineCap = 'round';
      c.restore();
      /* a cloud at each foot of the rainbow */
      for (var cs = -1; cs <= 1; cs += 2) {
        var clx = 14 + cs * 4.3;
        shape(function () {
          c.moveTo(clx - 2.0, 27.9);
          c.arc(clx - 1.1, 27.2, 0.95, Math.PI, Math.PI * 1.6);
          c.arc(clx, 26.7, 1.15, Math.PI * 1.1, Math.PI * 1.9);
          c.arc(clx + 1.1, 27.2, 0.95, Math.PI * 1.4, TAU);
          c.lineTo(clx + 2.0, 27.9);
          c.closePath();
        }, '#ffffff', { d: 0.4, lw: 0.3, rim: false });
      }
      shape(roundRectPath(7.7, 28.5, 12.6, 1.3, 0.4), suitC, { d: 0.4, lw: 0.3, rim: false });
      gold(starPath(14, 29.1, 1.25, 0.5), { d: 0.4, lw: 0.3 });
      c.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      c.lineWidth = 0.4;
      c.beginPath(); c.moveTo(14 + LX * 4.6, 21.2); c.quadraticCurveTo(14 + LX * 5.9, 22.4, 14 + LX * 5.8, 25); c.stroke();
      return;
    }
    var torso = outfit === 'onePiece' ? roundRectPath(8.4, 19.9, 11.2, 10.4, 2.0)
              : outfit === 'sailorSwimsuit' ? roundRectPath(7.8, 20.2, 12.4, 10.4, 2.4)
              : roundRectPath(7.4, 20.2, 13.2, 10.4, 2.8);
    shape(torso, suitC, { d: 1.6 });
    if (outfit === 'frillyBikini') {
      c.fillStyle = dark;
      c.fillRect(7.6, 26.6, 12.8, 1.5);
      shape(roundRectPath(10, 21.4, 8, 4.4, 1.0), mix(suitC, '#ffffff', 0.35), { d: 0.7, lw: 0.35 });
      gold(starPath(12, 23.3, 1.15, 0.5), { d: 0.3, lw: 0.26 });
      gold(starPath(16, 23.3, 1.15, 0.5), { d: 0.3, lw: 0.26 });
      gold(starPath(14, 25.0, 0.95, 0.5), { d: 0.3, lw: 0.26 });
      twinkle(10.9, 22.0, 0.6, '#ffffff');
      twinkle(17.3, 25.2, 0.5, '#ffffff');
      gem(14, 27.35, 1.05, '#4ac8ff');
    } else if (outfit === 'sailorSwimsuit') {
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(9.2, 20.4); c.lineTo(14, 23.6); c.lineTo(18.8, 20.4);
      c.closePath();
      c.fill();
      c.strokeStyle = p.ink;
      c.lineWidth = 0.3;
      c.stroke();
      /* collar stripe, chest console with a lit screen and round keys */
      c.strokeStyle = suitC;
      c.lineWidth = 0.35;
      c.beginPath(); c.moveTo(10.4, 20.7); c.lineTo(14, 23.0); c.lineTo(17.6, 20.7); c.stroke();
      shape(roundRectPath(10.6, 23.9, 6.8, 3.7, 0.8), '#262640', { d: 0.5, lw: 0.35, rim: false });
      var scr = c.createLinearGradient(0, 24.3, 0, 25.5);
      scr.addColorStop(0, '#9ff6ff');
      scr.addColorStop(1, '#2a8ad0');
      c.fillStyle = scr;
      c.fillRect(11.2, 24.4, 5.6, 1.1);
      c.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      c.lineWidth = 0.22;
      c.beginPath(); c.moveTo(11.5, 25.1); c.lineTo(12.6, 24.7); c.lineTo(13.5, 25.2); c.lineTo(14.6, 24.6); c.lineTo(16.4, 25.0); c.stroke();
      var keys = ['#44ff88', '#ff4466', '#ffd24a'];
      for (var kb = 0; kb < 3; kb++) {
        c.fillStyle = keys[kb];
        c.beginPath(); c.arc(12.2 + kb * 1.8, 26.5, 0.55, 0, TAU); c.fill();
        c.fillStyle = 'rgba(255, 255, 255, 0.8)';
        c.beginPath(); c.arc(12.05 + kb * 1.8, 26.35, 0.18, 0, TAU); c.fill();
      }
      c.fillStyle = dark;
      c.fillRect(8, 28.2, 12, 1.4);
      gold(roundRectPath(13, 27.9, 2, 1.9, 0.4), { d: 0.3, lw: 0.28 });
    } else {
      c.fillStyle = '#d8ecff';
      c.fillRect(8.8, 20.6, 10.4, 0.7);
      c.fillRect(8.8, 22.1, 10.4, 0.5);
      c.strokeStyle = p.s2;
      c.lineWidth = 0.45;
      c.beginPath(); c.moveTo(14, 20); c.lineTo(14, 30.2); c.stroke();
      shape(circlePath(11.4, 24.2, 1.6), '#ffd24a', { d: 0.6, lw: 0.3 });
      c.fillStyle = '#fff4a8';
      fillStar(11.4, 24.2, 1.15);
      c.fillStyle = dark;
      c.fillRect(8.6, 26.7, 10.8, 1);
      /* zip pull, a chest pocket and racing stripes down the flanks */
      shape(roundRectPath(13.5, 21.2, 1.0, 1.5, 0.3), '#dfe6fa', { d: 0.3, lw: 0.26, rim: false });
      c.strokeStyle = p.s2;
      c.lineWidth = 0.3;
      c.beginPath(); c.rect(15.6, 23.2, 2.6, 2.2); c.moveTo(15.6, 23.9); c.lineTo(18.2, 23.9); c.stroke();
      c.strokeStyle = rgba(p.hi, 0.9);
      c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(9.2, 22.8); c.lineTo(9.2, 29.6); c.moveTo(18.8, 22.8); c.lineTo(18.8, 29.6); c.stroke();
    }
    /* soft bevel along the suit's lit shoulder */
    c.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    c.lineWidth = 0.4;
    c.beginPath();
    c.moveTo(14 + LX * 4.2, 21.0); c.quadraticCurveTo(14 + LX * 5.6, 22, 14 + LX * 5.6, 25);
    c.stroke();
  }

  function newSuit(outfit, suitC) {
    var p = pal(suitC, false), i;
    if (outfit === 'pilot') {
      /* bomber jacket: fleece collar, zip, ribbed hem, wings on the chest */
      var jk = roundRectPath(7.5, 20.2, 13.0, 10.2, 2.4);
      shape(jk, suitC, { d: 1.6 });
      c.save(); c.beginPath(); jk(); c.clip();
      c.fillStyle = p.s2;
      c.fillRect(7, 28.7, 14, 2);
      c.strokeStyle = rgba(p.hi, 0.7);
      c.lineWidth = 0.25;
      c.beginPath();
      for (i = 0; i < 9; i++) { c.moveTo(8.4 + i * 1.4, 28.9); c.lineTo(8.4 + i * 1.4, 30.3); }
      c.stroke();
      c.restore();
      c.strokeStyle = p.s2;
      c.lineWidth = 0.3;
      c.beginPath();
      c.moveTo(9.0, 26.6); c.lineTo(11.8, 26.9); c.moveTo(16.2, 26.9); c.lineTo(19.0, 26.6);
      c.stroke();
      /* zip */
      c.strokeStyle = '#5a6488'; c.lineWidth = 0.7;
      c.beginPath(); c.moveTo(14, 23.4); c.lineTo(14, 28.7); c.stroke();
      c.strokeStyle = '#e6eeff'; c.lineWidth = 0.3;
      c.setLineDash([0.35, 0.35]);
      c.beginPath(); c.moveTo(14, 23.4); c.lineTo(14, 28.7); c.stroke();
      c.setLineDash([]);
      shape(roundRectPath(13.5, 24.0, 1.0, 1.5, 0.3), '#dfe6fa', { d: 0.3, lw: 0.26, rim: false });
      /* fleece collar */
      var fl = function () {
        c.moveTo(8.2, 20.7);
        c.quadraticCurveTo(14, 23.2, 19.8, 20.7);
        c.quadraticCurveTo(20.7, 21.9, 19.6, 23.0);
        c.arc(18.4, 23.2, 0.9, 0, Math.PI * 0.9); c.arc(16.6, 23.8, 0.9, 0, Math.PI * 0.9);
        c.arc(14.0, 24.1, 1.0, 0, Math.PI); c.arc(11.4, 23.8, 0.9, 0.1 * Math.PI, Math.PI);
        c.arc(9.6, 23.2, 0.9, 0.1 * Math.PI, Math.PI);
        c.quadraticCurveTo(7.3, 21.9, 8.2, 20.7);
        c.closePath();
      };
      shape(fl, '#fff2dc', { d: 0.8, lw: 0.4 });
      /* pilot's wings: a gold star between two feathered bars */
      for (var ws = -1; ws <= 1; ws += 2) {
        gold(function () {
          c.moveTo(10.6 + ws * 0.6, 24.9); c.lineTo(10.6 + ws * 2.9, 24.4); c.lineTo(10.6 + ws * 2.3, 25.2);
          c.lineTo(10.6 + ws * 2.5, 25.8); c.lineTo(10.6 + ws * 0.6, 25.9); c.closePath();
        }, { d: 0.3, lw: 0.26 });
      }
      gold(starPath(10.6, 25.3, 1.15, 0.5), { d: 0.3, lw: 0.28 });
      return;
    }
    if (outfit === 'mech') {
      /* armour: angular breastplate, glowing reactor, hazard belt */
      var metal = metalOf(suitC), mp = pal(metal, false);
      var hull = function () {
        c.moveTo(7.6, 20.4); c.lineTo(20.4, 20.4); c.lineTo(21.2, 24.4);
        c.lineTo(19.0, 30.4); c.lineTo(9.0, 30.4); c.lineTo(6.8, 24.4); c.closePath();
      };
      shape(hull, metal, { d: 1.6 });
      shape(function () {
        c.moveTo(9.2, 21.0); c.lineTo(18.8, 21.0); c.lineTo(17.6, 26.4); c.lineTo(10.4, 26.4); c.closePath();
      }, suitC, { d: 1.0, lw: 0.4 });
      /* reactor */
      shape(circlePath(14, 23.6, 2.05), '#2a3458', { d: 0.5, lw: 0.35, rim: false });
      var rg = c.createRadialGradient(14, 23.6, 0.2, 14, 23.6, 1.6);
      rg.addColorStop(0, '#ffffff');
      rg.addColorStop(0.45, '#9ff6ff');
      rg.addColorStop(1, '#18b4e8');
      c.fillStyle = rg;
      c.beginPath(); c.arc(14, 23.6, 1.5, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      c.lineWidth = 0.25;
      c.beginPath(); c.moveTo(14, 22.2); c.lineTo(14, 25.0); c.moveTo(12.6, 23.6); c.lineTo(15.4, 23.6); c.stroke();
      /* plate seams, rivets */
      c.strokeStyle = mp.s2;
      c.lineWidth = 0.3;
      c.beginPath();
      c.moveTo(9.6, 27.4); c.lineTo(18.4, 27.4);
      c.moveTo(7.4, 24.4); c.lineTo(10.0, 24.4); c.moveTo(18.0, 24.4); c.lineTo(20.6, 24.4);
      c.stroke();
      c.fillStyle = '#ffffff';
      var rv = [[8.4, 21.6], [19.6, 21.6], [8.2, 26.0], [19.8, 26.0]];
      for (i = 0; i < 4; i++) { c.beginPath(); c.arc(rv[i][0], rv[i][1], 0.3, 0, TAU); c.fill(); }
      /* hazard belt */
      c.save();
      c.beginPath(); c.rect(9.4, 28.4, 9.2, 1.4); c.clip();
      c.fillStyle = GOLD;
      c.fillRect(9, 28, 10, 2);
      c.fillStyle = '#2a2440';
      for (i = 0; i < 7; i++) {
        c.beginPath(); c.moveTo(9.2 + i * 1.5, 29.9); c.lineTo(10.0 + i * 1.5, 28.3); c.lineTo(10.7 + i * 1.5, 28.3);
        c.lineTo(9.9 + i * 1.5, 29.9); c.closePath(); c.fill();
      }
      c.restore();
      c.strokeStyle = mp.ink;
      c.lineWidth = 0.3;
      c.strokeRect(9.4, 28.4, 9.2, 1.4);
      c.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      c.lineWidth = 0.4;
      c.beginPath(); c.moveTo(14 + LX * 5.6, 21.0); c.lineTo(14 + LX * 6.3, 24.0); c.stroke();
      return;
    }
    /* kitty suit: soft belly, paw print, a bell on a ribbon */
    shape(roundRectPath(7.4, 20.2, 13.2, 10.4, 2.8), suitC, { d: 1.6 });
    shape(ellipsePath(14, 26.6, 3.9, 3.3), '#fff4fa', { d: 0.9, lw: 0.35, rim: false, soft: true });
    c.fillStyle = '#ff8ab8';
    c.beginPath(); c.ellipse(14, 27.4, 1.35, 1.05, 0, 0, TAU); c.fill();
    c.beginPath(); c.arc(12.6, 25.9, 0.5, 0, TAU); c.fill();
    c.beginPath(); c.arc(14, 25.4, 0.5, 0, TAU); c.fill();
    c.beginPath(); c.arc(15.4, 25.9, 0.5, 0, TAU); c.fill();
    shape(function () {
      c.moveTo(9.0, 21.3); c.quadraticCurveTo(14, 23.0, 19.0, 21.3); c.lineTo(19.0, 22.3);
      c.quadraticCurveTo(14, 24.0, 9.0, 22.3); c.closePath();
    }, '#e8305c', { d: 0.4, lw: 0.3, rim: false });
    gold(circlePath(14, 23.4, 1.15), { d: 0.5, lw: 0.32 });
    c.strokeStyle = '#7a4a00';
    c.lineWidth = 0.28;
    c.beginPath(); c.moveTo(13.0, 23.5); c.lineTo(15.0, 23.5); c.moveTo(14, 23.5); c.lineTo(14, 24.4); c.stroke();
    c.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    c.lineWidth = 0.4;
    c.beginPath(); c.moveTo(14 + LX * 4.2, 21.0); c.quadraticCurveTo(14 + LX * 5.6, 22, 14 + LX * 5.6, 25); c.stroke();
  }
  /* The kitty suit's tail: curls up beside her, tip swaying on the cape
     spring. */
  function kittyTail(suitC, C, t) {
    var sw = C.x * 0.9 + Math.sin(t * 2.4) * 0.5, up = C.y * 0.6;
    var pts = function (w) {
      return lockPath(18.6, 28.6, 26.4 + sw * 0.5, 30.2, 25.6 + sw, 20.8 + up, w);
    };
    shape(pts(1.75), suitC, { d: 0.8, lw: 0.45 });
    /* white tip */
    c.save();
    c.beginPath(); c.rect(18, 14, 14, 9.6 + up); c.clip();
    shape(pts(1.75), '#fff4fa', { d: 0.6, lw: 0.45 });
    c.restore();
  }

  function tshirt(suitC) {
    shape(function () {
      c.moveTo(7.4, 21.2);
      c.quadraticCurveTo(10, 19.6, 14, 20.3);
      c.quadraticCurveTo(18, 19.6, 20.6, 21.2);
      c.lineTo(20.6, 26.6);
      c.quadraticCurveTo(14, 27.3, 7.4, 26.6);
      c.closePath();
    }, suitC, { d: 1.5 });
  }

  /* Torso with chest accessories (badge, backpack straps). */
  function torsoPart(cu) {
    var o = cu.outfit;
    if (o === 'yukata') {
      /* the obi's bow shows either side of her waist */
      var obi = mix(cu.suit, '#ffffff', 0.74);
      shape(ellipsePath(7.0, 24.6, 2.3, 1.9, -0.5), obi, { d: 0.7, lw: 0.4 });
      shape(ellipsePath(21.0, 24.6, 2.3, 1.9, 0.5), obi, { d: 0.7, lw: 0.4 });
    }
    if (isDress(o)) bodicePart(o, cu.suit);
    else if (isSuit(o)) suitPart(o, cu.suit, cu.gear);
    else tshirt(cu.suit);
    if (cu.gear === 'bunnyPack' || cu.gear === 'jetpack') {
      var strap = cu.gear === 'jetpack' ? '#5a6488' : '#ff9ccc';
      shape(roundRectPath(9.4, 20.4, 1.3, 5.6, 0.5), strap, { d: 0.4, lw: 0.3, rim: false });
      shape(roundRectPath(17.3, 20.4, 1.3, 5.6, 0.5), strap, { d: 0.4, lw: 0.3, rim: false });
      if (cu.gear === 'jetpack') {
        shape(roundRectPath(12.4, 24.0, 3.2, 1.6, 0.5), '#c8d0e8', { d: 0.4, lw: 0.3 });
        c.fillStyle = '#ff5a5a';
        c.beginPath(); c.arc(14, 24.8, 0.45, 0, TAU); c.fill();
      }
    }
    if (cu.gear === 'starBadge') badge(10.6, 23.2, 1);
  }

  function badge(x, y, s) {
    c.fillStyle = 'rgba(255, 220, 120, 0.35)';
    c.beginPath(); c.arc(x, y, 2.6 * s, 0, TAU); c.fill();
    shape(circlePath(x, y, 2.0 * s), '#5a3aa8', { d: 0.6, lw: 0.35 });
    shape(starPath(x, y - 0.05 * s, 1.75 * s, 0.48), '#ffd24a', { d: 0.6, lw: 0.35 });
    c.fillStyle = '#fff8d0';
    fillStar(x - 0.25 * s, y - 0.35 * s, 0.6 * s);
    /* ribbon tails */
    shape(function () {
      c.moveTo(x - 1.0 * s, y + 1.7 * s); c.lineTo(x - 1.6 * s, y + 3.6 * s); c.lineTo(x - 0.6 * s, y + 3.1 * s);
      c.lineTo(x - 0.1 * s, y + 1.9 * s); c.closePath();
      c.moveTo(x + 1.0 * s, y + 1.7 * s); c.lineTo(x + 1.6 * s, y + 3.6 * s); c.lineTo(x + 0.6 * s, y + 3.1 * s);
      c.lineTo(x + 0.1 * s, y + 1.9 * s); c.closePath();
    }, '#ff5a8a', { d: 0.4, lw: 0.3, rim: false });
  }

  /* Arms hang from the shoulder along +y: upper arm (puff sleeve or suit
     sleeve), forearm, mitten hand with a thumb. */
  var UPPER = 2.8, FORE = 3.0;
  function upperArmPart(cu) {
    var o = cu.outfit, suited = isSuit(o), rb;
    if (o === 'puffySuit' || o === 'rainbow') {
      shape(limbPath(0, 0, 0, UPPER + 0.4, 1.9, 1.6), '#eef0fa', { d: 0.9, lw: 0.45 });
      if (o === 'rainbow') {
        for (rb = 0; rb < 3; rb++) { c.fillStyle = RAINBOW[rb * 2]; c.fillRect(-1.7, 0.3 + rb * 0.45, 3.4, 0.45); }
      } else {
        c.fillStyle = cu.suit;
        c.fillRect(-1.7, 0.6, 3.4, 0.6);
      }
      return;
    }
    if (o === 'mech') {
      /* armoured arm under a domed shoulder plate */
      shape(limbPath(0, 0.4, 0, UPPER + 0.3, 1.5, 1.35), metalOf(cu.suit), { d: 0.9, lw: 0.45 });
      shape(function () {
        c.moveTo(-2.5, 1.0);
        c.bezierCurveTo(-2.7, -2.3, 2.7, -2.3, 2.5, 1.0);
        c.quadraticCurveTo(0, 1.9, -2.5, 1.0);
        c.closePath();
      }, cu.suit, { d: 0.9, lw: 0.45 });
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(0, 0.2, 0.34, 0, TAU); c.fill();
      return;
    }
    if (suited) {
      shape(limbPath(0, 0, 0, UPPER + 0.3, 1.6, 1.35), cu.suit, { d: 0.9, lw: 0.45 });
      if (o === 'pilot') {
        /* squadron patch */
        shape(circlePath(0, 1.1, 0.95), '#fff2dc', { d: 0.3, lw: 0.26, rim: false });
        c.fillStyle = '#ff5a8a';
        fillStar(0, 1.1, 0.62);
      }
      return;
    }
    if (o === 'yukata') {
      /* the sleeve opens out toward the elbow */
      shape(function () {
        c.moveTo(-1.7, -0.9); c.quadraticCurveTo(0, -1.6, 1.7, -0.9);
        c.lineTo(2.5, UPPER + 0.5); c.lineTo(-2.5, UPPER + 0.5); c.closePath();
      }, cu.suit, { d: 0.9, lw: 0.45 });
      return;
    }
    if (o === 'snowDress') {
      shape(limbPath(0, 0.2, 0, UPPER + 0.4, 1.5, 1.3), cu.suit, { d: 0.9, lw: 0.45 });
      return;
    }
    shape(limbPath(0, 0.2, 0, UPPER + 0.4, 1.2, 1.05), cu.skin, { warm: true, d: 0.8, lw: 0.45 });
    if (o === 'tutu') {
      /* a flutter of tulle caps the shoulder */
      shape(function () {
        c.moveTo(-2.0, 0.2);
        c.bezierCurveTo(-2.2, -1.7, 2.2, -1.7, 2.0, 0.2);
        c.arc(1.3, 0.3, 0.7, 0, Math.PI); c.arc(0, 0.5, 0.7, 0, Math.PI); c.arc(-1.3, 0.3, 0.7, 0, Math.PI);
        c.closePath();
      }, mix(cu.suit, '#ffffff', 0.5), { d: 0.6, lw: 0.4 });
      return;
    }
    /* puff sleeve with a gathered hem */
    var sleeve = function () {
      c.moveTo(-2.1, 0.6);
      c.bezierCurveTo(-2.4, -1.8, 2.4, -1.8, 2.1, 0.6);
      c.quadraticCurveTo(1.4, 2.4, 0, 2.1);
      c.quadraticCurveTo(-1.4, 2.4, -2.1, 0.6);
      c.closePath();
    };
    shape(sleeve, cu.suit, { d: 0.9, lw: 0.45 });
    c.strokeStyle = pal(cu.suit, false).s1;
    c.lineWidth = 0.3;
    c.beginPath(); c.moveTo(-0.7, 0.4); c.lineTo(-0.5, 1.8); c.moveTo(0.7, 0.4); c.lineTo(0.5, 1.8); c.stroke();
    if (o === 'frillyDress' || o === 'sailorDress' || o === 'gown') {
      c.strokeStyle = o === 'gown' ? GOLD : '#ffffff';
      c.lineWidth = 0.45;
      c.beginPath(); c.moveTo(-1.8, 1.3); c.quadraticCurveTo(0, 2.7, 1.8, 1.3); c.stroke();
    }
  }
  /* What covers her hands: bare skin with a dress, gloves with a suit. */
  function handCol(cu) {
    var o = cu.outfit;
    return o === 'puffySuit' || o === 'rainbow' ? cu.suit
         : o === 'mech' ? '#4a5680'
         : o === 'pilot' ? '#8a5a3a'
         : o === 'kitty' ? '#fff4fa'
         : o === 'snowDress' ? '#fffaff'
         : isSuit(o) ? '#f4f6ff' : cu.skin;
  }
  function gloved(cu) { return isSuit(cu.outfit) || cu.outfit === 'snowDress'; }
  function mittPath() {
    c.moveTo(-1.35, -0.7);
    c.bezierCurveTo(-1.85, 0.9, -1.1, 2.15, 0.1, 2.1);
    c.bezierCurveTo(1.4, 2.05, 1.85, 0.7, 1.4, -0.75);
    c.quadraticCurveTo(0, -1.5, -1.35, -0.7);
    c.closePath();
  }
  function thumbLine(col) {
    c.strokeStyle = col;
    c.lineWidth = 0.3;
    c.beginPath(); c.moveTo(1.15, -0.2); c.quadraticCurveTo(0.5, 0.6, 0.75, 1.3); c.stroke();
  }
  /* Forearm and mitten as one piece, elbow at (0, 0): a shared outline
     is stroked first so no seam shows at the wrist. */
  function foreArmPart(cu) {
    var o = cu.outfit, suited = isSuit(o), thick = suited || o === 'snowDress';
    var col = o === 'puffySuit' || o === 'rainbow' ? '#eef0fa' : o === 'mech' ? metalOf(cu.suit)
            : thick ? cu.suit : cu.skin;
    var hc = handCol(cu), skinHand = !gloved(cu);
    var arm = limbPath(0, 0, 0, FORE - 0.7, thick ? 1.35 : 1.08, thick ? 1.15 : 0.86);
    var hand = function () { c.save(); c.translate(0, FORE); mittPath(); c.restore(); };
    c.lineJoin = 'round';
    c.lineWidth = 0.9;
    c.strokeStyle = pal(col, !thick).ink;
    c.beginPath(); arm(); c.stroke();
    c.strokeStyle = pal(hc, skinHand).ink;
    c.beginPath(); hand(); c.stroke();
    shape(arm, col, { warm: !thick, d: 0.8, lw: 0 });
    shape(hand, hc, { warm: skinHand, d: 0.7, lw: 0 });
    /* thumb crease and cuff */
    c.save(); c.translate(0, FORE); thumbLine(pal(hc, skinHand).s1); c.restore();
    if (o === 'kitty') {
      /* paw pads */
      c.fillStyle = '#ff8ab8';
      c.beginPath(); c.ellipse(-0.1, FORE + 0.9, 0.62, 0.5, 0, 0, TAU); c.fill();
    }
    if (o === 'snowDress') {
      shape(ellipsePath(0, FORE - 0.8, 1.75, 0.95), '#fffaff', { d: 0.4, lw: 0.3, rim: false });
    } else if (o === 'yukata') {
      /* wide hanging sleeve with a pale lining at the opening */
      shape(function () {
        c.moveTo(-2.1, -0.9); c.lineTo(2.1, -0.9);
        c.quadraticCurveTo(3.0, 0.8, 3.0, 2.3);
        c.quadraticCurveTo(0, 3.3, -3.0, 2.3);
        c.quadraticCurveTo(-3.0, 0.8, -2.1, -0.9);
        c.closePath();
      }, cu.suit, { d: 0.9, lw: 0.45 });
      c.fillStyle = mix(cu.suit, '#ffffff', 0.78);
      c.beginPath(); c.ellipse(0, 2.45, 2.5, 0.55, 0, 0, TAU); c.fill();
      blossom(LX * -0.9, 0.9, 0.7, mix(cu.suit, '#ffffff', 0.86));
      c.save(); c.translate(0, FORE);
      shape(mittPath, hc, { warm: true, d: 0.7, lw: 0.45 });
      thumbLine(pal(hc, true).s1);
      c.restore();
    } else if (o === 'mech') {
      /* wrist ring and a status light */
      c.strokeStyle = cu.suit;
      c.lineWidth = 0.7;
      c.beginPath(); c.moveTo(-1.3, FORE - 0.6); c.quadraticCurveTo(0, FORE - 1.2, 1.3, FORE - 0.7); c.stroke();
      c.fillStyle = '#44ffff';
      c.beginPath(); c.arc(0, 0.8, 0.36, 0, TAU); c.fill();
    } else if (o === 'rainbow') {
      for (var rb = 0; rb < 3; rb++) {
        c.strokeStyle = RAINBOW[rb * 2];
        c.lineWidth = 0.34;
        c.beginPath(); c.moveTo(-1.3, FORE - 1.3 + rb * 0.34); c.quadraticCurveTo(0, FORE - 1.9 + rb * 0.34, 1.3, FORE - 1.4 + rb * 0.34); c.stroke();
      }
    } else if (o === 'pilot') {
      /* knitted cuff */
      shape(roundRectPath(-1.45, FORE - 1.5, 2.9, 1.0, 0.4), pal(cu.suit, false).s2, { d: 0.3, lw: 0.28, rim: false });
    } else if (suited) {
      c.strokeStyle = o === 'puffySuit' ? '#ffffff' : '#44ffff';
      c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(-1.35, FORE - 0.5); c.quadraticCurveTo(0, FORE - 1.2, 1.3, FORE - 0.6); c.stroke();
    }
  }
  /* The fist again, painted over a held item so she grips it. */
  function handPart(cu) {
    var skinHand = !gloved(cu), hc = handCol(cu);
    shape(mittPath, hc, { warm: skinHand, d: 0.7, lw: 0.45 });
    thumbLine(pal(hc, skinHand).s1);
  }

  /* ---------- Gear ---------- */
  /* Twin rocket pods on a back unit: nose cones, portholes, fins and
     flared nozzles. On her only the pods show past her shoulders. */
  function jetpackPart() {
    var metal = '#c4cee8', mp = pal(metal, false);
    shape(roundRectPath(8.4, 20.0, 11.2, 9.0, 2.2), '#8a94b8', { d: 1.0, lw: 0.45 });
    shape(circlePath(14, 24.0, 2.0), '#262640', { d: 0.4, lw: 0.35, rim: false });
    c.strokeStyle = '#44ffff';
    c.lineWidth = 0.35;
    c.beginPath(); c.arc(14, 24.0, 1.3, Math.PI * 0.85, Math.PI * 2.15); c.stroke();
    c.strokeStyle = '#ff5a8a';
    c.beginPath(); c.moveTo(14, 24.0); c.lineTo(14.8, 23.1); c.stroke();
    for (var side = -1; side <= 1; side += 2) {
      var x = side < 0 ? 3.2 : 20.4, xo = side < 0 ? x : x + 4.4;
      /* fin */
      shape(function () {
        c.moveTo(xo, 25.4); c.quadraticCurveTo(xo + side * 2.2, 27.4, xo + side * 2.0, 30.2); c.lineTo(xo, 28.8); c.closePath();
      }, '#ff5a8a', { d: 0.4, lw: 0.35, rim: false });
      /* nozzle */
      shape(function () {
        c.moveTo(x + 1.0, 28.6); c.lineTo(x + 3.4, 28.6); c.lineTo(x + 4.0, 31.0); c.lineTo(x + 0.4, 31.0); c.closePath();
      }, '#6a7494', { d: 0.4, lw: 0.35 });
      c.fillStyle = '#1e1a38';
      c.beginPath(); c.ellipse(x + 2.2, 31.0, 1.7, 0.4, 0, 0, TAU); c.fill();
      /* pod */
      var pod = function () {
        c.moveTo(x, 22.0);
        c.quadraticCurveTo(x + 0.2, 19.6, x + 2.2, 18.5);
        c.quadraticCurveTo(x + 4.2, 19.6, x + 4.4, 22.0);
        c.lineTo(x + 4.4, 28.2);
        c.quadraticCurveTo(x + 2.2, 29.3, x, 28.2);
        c.closePath();
      };
      shape(pod, metal, { d: 1.0, lw: 0.45 });
      c.save();
      c.beginPath(); pod(); c.clip();
      c.fillStyle = '#ff5a8a';
      c.fillRect(x - 1, 18, 6.4, 3.3);
      c.fillStyle = 'rgba(255, 255, 255, 0.35)';
      c.fillRect(x - 1, 18, 6.4, 1.6);
      c.fillStyle = '#ff5a8a';
      c.fillRect(x - 1, 26.2, 6.4, 0.9);
      c.strokeStyle = mp.s2;
      c.lineWidth = 0.3;
      c.beginPath(); c.moveTo(x - 1, 21.3); c.lineTo(x + 6, 21.3); c.stroke();
      c.restore();
      /* porthole */
      shape(circlePath(x + 2.2, 23.8, 1.15), '#2a3458', { d: 0.3, lw: 0.3, rim: false });
      c.fillStyle = '#7af0ff';
      c.beginPath(); c.arc(x + 2.2, 23.8, 0.75, 0, TAU); c.fill();
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(x + 1.95, 23.55, 0.28, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255, 255, 255, 0.7)';
      c.beginPath(); c.ellipse(x + (LX < 0 ? 0.9 : 3.5), 24.6, 0.35, 2.6, 0, 0, TAU); c.fill();
    }
  }
  function flame(x, y, k, len, t) {
    if (k <= 0.02) return;
    var L = len * k * (0.85 + 0.15 * Math.sin(t * 40 + x));
    var g = c.createLinearGradient(0, y, 0, y + L);
    g.addColorStop(0, 'rgba(255, 255, 230, 0.95)');
    g.addColorStop(0.35, 'rgba(120, 230, 255, 0.85)');
    g.addColorStop(1, 'rgba(160, 80, 255, 0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x - 1.2, y);
    c.quadraticCurveTo(x - 1.0, y + L * 0.5, x, y + L);
    c.quadraticCurveTo(x + 1.0, y + L * 0.5, x + 1.2, y);
    c.closePath();
    c.fill();
  }

  function bunnyPackPart() {
    /* the pack body bulges out behind her left side */
    shape(roundRectPath(4.2, 20.4, 5.0, 8.2, 2.2), '#ffc6e2', { d: 1.0, lw: 0.45 });
    /* pocket, zip pull and stitching */
    shape(roundRectPath(4.7, 24.6, 3.4, 3.2, 1.0), '#ffe2f0', { d: 0.5, lw: 0.3, rim: false });
    c.strokeStyle = '#d87aa8';
    c.lineWidth = 0.25;
    c.setLineDash([0.4, 0.4]);
    c.beginPath(); c.moveTo(5.0, 22.6); c.lineTo(8.4, 22.6); c.stroke();
    c.setLineDash([]);
    gold(circlePath(5.4, 23.2, 0.5), { d: 0.2, lw: 0.25 });
    /* bunny head over her right shoulder */
    shape(ellipsePath(22.6, 19.0, 3.3, 3.0), '#fff0f7', { d: 1.0, lw: 0.45 });
    c.fillStyle = '#2a0c24';
    c.beginPath(); c.arc(21.5, 18.8, 0.45, 0, TAU); c.fill();
    c.beginPath(); c.arc(23.7, 18.8, 0.45, 0, TAU); c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(21.35, 18.65, 0.16, 0, TAU); c.fill();
    c.beginPath(); c.arc(23.55, 18.65, 0.16, 0, TAU); c.fill();
    c.fillStyle = '#ff7aa8';
    c.beginPath(); c.ellipse(22.6, 19.7, 0.5, 0.35, 0, 0, TAU); c.fill();
    c.strokeStyle = '#c85a88';
    c.lineWidth = 0.25;
    c.beginPath(); c.moveTo(22.6, 20.0); c.quadraticCurveTo(22.1, 20.7, 21.6, 20.3);
    c.moveTo(22.6, 20.0); c.quadraticCurveTo(23.1, 20.7, 23.6, 20.3); c.stroke();
    c.fillStyle = 'rgba(255, 120, 170, 0.45)';
    c.beginPath(); c.ellipse(20.9, 20.0, 0.7, 0.4, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(24.3, 20.0, 0.7, 0.4, 0, 0, TAU); c.fill();
  }
  function bunnyEars(e) {
    for (var i = 0; i < 2; i++) {
      var bx = 21.6 + i * 2.0, by = 16.6;
      var tx = bx + (i ? 1.2 : -1.2) + e.x * (i ? 1.0 : 0.8), ty = by - 5.2 + e.y * 0.6;
      shape(lockPath(bx, by, bx + (i ? 0.5 : -0.5) + e.x * 0.3, by - 3, tx, ty, 1.05), '#fff0f7', { d: 0.6, lw: 0.4 });
      c.strokeStyle = 'rgba(255, 140, 190, 0.8)';
      c.lineWidth = 0.55;
      c.beginPath(); c.moveTo(bx, by - 0.6); c.quadraticCurveTo(bx + e.x * 0.3, by - 3, tx * 0.8 + bx * 0.2, ty * 0.8 + by * 0.2); c.stroke();
    }
  }

  /* Star cape from the shoulders; hem follows its spring. */
  function cape(suitC, C, t) {
    var outer = mix(suitC, '#2a1c6c', 0.4), lining = mix(suitC, '#ffd8f0', 0.35);
    var sw = C.x, lift = C.y;
    var hemL = 3.0 + sw * 0.9 - Math.max(0, -lift) * 0.4, hemR = 25.0 + sw * 0.9 + Math.max(0, -lift) * 0.4;
    var hemY = 32.4 + lift * 0.8;
    var wave = Math.sin(t * 5.0) * 0.5;
    var path = function () {
      c.moveTo(8.2, 20.6);
      c.quadraticCurveTo(5.4 + sw * 0.3, 25.0, hemL, hemY);
      c.quadraticCurveTo(8.6 + sw * 0.6, hemY + 1.2 + wave, 14 + sw * 0.8, hemY + 0.2);
      c.quadraticCurveTo(19.4 + sw * 0.6, hemY + 1.2 - wave, hemR, hemY);
      c.quadraticCurveTo(22.6 + sw * 0.3, 25.0, 19.8, 20.6);
      c.closePath();
    };
    shape(path, lining, { d: 1.6, lw: 0.5 });
    /* outer face showing at the flanks */
    c.save();
    c.beginPath(); path(); c.clip();
    c.fillStyle = outer;
    c.beginPath();
    c.moveTo(8.2, 20.6); c.quadraticCurveTo(5.4 + sw * 0.3, 25.0, hemL, hemY); c.lineTo(hemL - 3, hemY);
    c.lineTo(5, 20); c.closePath();
    c.moveTo(19.8, 20.6); c.quadraticCurveTo(22.6 + sw * 0.3, 25.0, hemR, hemY); c.lineTo(hemR + 3, hemY);
    c.lineTo(23, 20); c.closePath();
    c.fill();
    c.fillStyle = '#ffe27a';
    fillStar(6.4 + sw * 0.5, 29.8 + lift * 0.4, 0.8);
    fillStar(21.8 + sw * 0.5, 29.0 + lift * 0.4, 0.7);
    /* gold braid along the hem */
    c.strokeStyle = GOLD;
    c.lineWidth = 0.55;
    c.beginPath();
    c.moveTo(hemL, hemY - 0.35);
    c.quadraticCurveTo(8.6 + sw * 0.6, hemY + 0.85 + wave, 14 + sw * 0.8, hemY - 0.15);
    c.quadraticCurveTo(19.4 + sw * 0.6, hemY + 0.85 - wave, hemR, hemY - 0.35);
    c.stroke();
    c.restore();
  }

  /* Knitted scarf: the loop sits under the collar ring; one end hangs
     on the chest, the other streams behind her. */
  function scarfTail(col, C, t) {
    var p = pal(col, false);
    var x0 = 9.8, y0 = 21.6;
    var flap = Math.sin(t * 6.0 + 1) * 0.6;
    var x1 = x0 - 6.5 + C.x * 1.3, y1 = y0 + 5.5 + C.y * 1.1 + flap;
    shape(lockPath(x0, y0, x0 - 3 + C.x * 0.6, y0 + 1.2 + C.y * 0.5, x1, y1, 1.6), p.s1, { d: 0.7, lw: 0.45 });
  }
  function scarfFront(col, C) {
    var p = pal(col, false);
    shape(function () {
      c.moveTo(8.0, 21.0);
      c.quadraticCurveTo(14, 23.4, 20.0, 21.0);
      c.quadraticCurveTo(20.6, 22.0, 19.6, 22.8);
      c.quadraticCurveTo(14, 24.8, 8.4, 22.8);
      c.quadraticCurveTo(7.4, 22.0, 8.0, 21.0);
      c.closePath();
    }, col, { d: 0.9, lw: 0.45 });
    var sx = C.x * 0.3;
    shape(function () {
      c.moveTo(16.2, 22.6); c.lineTo(18.4, 22.4);
      c.lineTo(18.9 + sx, 27.0); c.lineTo(16.7 + sx, 27.3); c.closePath();
    }, col, { d: 0.7, lw: 0.45 });
    /* knit ribs and a pale stripe near the end */
    c.strokeStyle = p.s1;
    c.lineWidth = 0.3;
    c.beginPath();
    for (var r = 0; r < 5; r++) { c.moveTo(9.6 + r * 2.1, 21.9 + Math.sin(r / 4 * Math.PI) * 0.9); c.lineTo(9.8 + r * 2.1, 23.1 + Math.sin(r / 4 * Math.PI) * 0.9); }
    c.stroke();
    c.strokeStyle = p.hi;
    c.lineWidth = 0.55;
    c.beginPath(); c.moveTo(16.7 + sx * 0.7, 25.6); c.lineTo(18.8 + sx * 0.7, 25.4); c.stroke();
    /* fringe */
    c.strokeStyle = col;
    c.lineWidth = 0.35;
    c.beginPath();
    for (var f = 0; f < 4; f++) { c.moveTo(16.9 + f * 0.6 + sx, 27.2); c.lineTo(16.9 + f * 0.6 + sx * 1.2, 28.2); }
    c.stroke();
  }

  /* Fairy wings: two sheer panes a side that beat slowly and fold back
     when she moves. */
  function wings(suitC, C, t) {
    var tint = mix(suitC, '#ffffff', 0.38), edge = mix(suitC, '#5a2a9a', 0.35);
    var flap = 1 - (0.5 + 0.5 * Math.sin(t * 5.2)) * 0.11 - clamp(Math.abs(C.x) * 0.02, 0, 0.12);
    for (var side = -1; side <= 1; side += 2) {
      c.save();
      c.translate(14 + C.x * 0.15, 23.0);
      c.scale(side * flap, 1);
      var upper = function () {
        c.moveTo(1.0, -0.6);
        c.bezierCurveTo(4.5, -9.8, 12.6, -13.0, 16.0, -8.6);
        c.bezierCurveTo(17.6, -3.8, 9.0, 0.7, 1.0, 0.8);
        c.closePath();
      };
      var lower = function () {
        c.moveTo(1.0, 0.9);
        c.bezierCurveTo(6.6, 1.0, 12.6, 3.4, 11.8, 7.6);
        c.bezierCurveTo(8.6, 9.6, 3.2, 5.2, 1.0, 2.4);
        c.closePath();
      };
      var panes = [lower, upper];
      for (var i = 0; i < 2; i++) {
        var g = c.createRadialGradient(1, 0, 1, 1, 0, 17);
        g.addColorStop(0, rgba(mix(tint, '#ffffff', 0.5), 0.96));
        g.addColorStop(0.45, rgba(mix(tint, '#9fe8ff', 0.35), 0.92));
        g.addColorStop(1, rgba(tint, 0.96));
        c.beginPath(); panes[i]();
        c.fillStyle = g;
        c.fill();
        c.strokeStyle = edge;
        c.lineWidth = 0.55;
        c.stroke();
      }
      /* veins and a bright leading edge */
      c.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      c.lineWidth = 0.3;
      c.beginPath();
      c.moveTo(1.4, -0.2); c.quadraticCurveTo(7.6, -6.2, 14.8, -8.2);
      c.moveTo(1.4, 0.1); c.quadraticCurveTo(8.4, -3.2, 15.0, -5.2);
      c.moveTo(1.4, 0.4); c.quadraticCurveTo(8.0, -0.6, 12.4, -2.0);
      c.moveTo(1.4, 1.4); c.quadraticCurveTo(6.4, 2.6, 10.8, 6.4);
      c.moveTo(1.4, 1.9); c.quadraticCurveTo(4.6, 4.0, 7.6, 7.0);
      c.stroke();
      c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(3.0, -5.0); c.bezierCurveTo(6.4, -10.2, 12.0, -12.2, 15.4, -9.2); c.stroke();
      twinkle(11.6, -7.2, 1.3, '#ffffff');
      twinkle(8.6, 4.6, 0.9, '#fff8d0');
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(6.4, -5.6, 0.3, 0, TAU); c.fill();
      c.beginPath(); c.arc(13.4, -4.4, 0.25, 0, TAU); c.fill();
      c.restore();
    }
  }

  /* A great bow tied at the back of her waist: the loops stand out past
     her arms, the tails trail on the cape spring. */
  function backBow(suitC, C) {
    var p = pal(suitC, false), side;
    for (side = -1; side <= 1; side += 2) {
      fastShape(lockPath(14 + side * 1.6, 24.6, 14 + side * 7.0 + C.x * 0.5, 27.6 + C.y * 0.3,
        14 + side * 10.4 + C.x * 1.1, 33.4 + C.y * 0.8, 2.1), p.s1, 0.8, 0.45);
    }
    for (side = -1; side <= 1; side += 2) {
      var loop = (function (sd) {
        return function () {
          c.moveTo(14, 24.2);
          c.bezierCurveTo(14 + sd * 3.5, 21.2, 14 + sd * 9.0, 17.4, 14 + sd * 13.4, 17.8);
          c.quadraticCurveTo(14 + sd * 15.6, 22.8, 14 + sd * 13.0, 28.4);
          c.bezierCurveTo(14 + sd * 9.0, 28.2, 14 + sd * 3.5, 26.6, 14, 24.8);
          c.closePath();
        };
      })(side);
      shape(loop, suitC, { d: 1.2, lw: 0.45 });
      /* gathers running into the knot, a sheen along the top fold */
      c.strokeStyle = p.s2;
      c.lineWidth = 0.34;
      c.beginPath();
      c.moveTo(14 + side * 5.6, 23.2); c.quadraticCurveTo(14 + side * 9.0, 21.0, 14 + side * 12.6, 20.2);
      c.moveTo(14 + side * 5.6, 24.6); c.lineTo(14 + side * 12.8, 24.4);
      c.moveTo(14 + side * 5.6, 25.6); c.quadraticCurveTo(14 + side * 9.0, 26.6, 14 + side * 12.2, 26.8);
      c.stroke();
      c.strokeStyle = rgba(p.hi, 0.9);
      c.lineWidth = 0.6;
      c.beginPath(); c.moveTo(14 + side * 7.6, 20.2); c.quadraticCurveTo(14 + side * 10.4, 18.6, 14 + side * 12.8, 18.8); c.stroke();
    }
  }

  /* Cross-body satchel: strap from her left shoulder, pouch on her hip. */
  function satchel(col, C) {
    var leather = mix(col, '#7a4a2a', 0.2), p = pal(leather, false);
    var sw = clamp(C.x * 0.22, -1.2, 1.2);
    var bx = 10.2 + sw, by = 28.4;
    c.lineCap = 'round';
    c.strokeStyle = p.ink; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(18.9, 21.0); c.quadraticCurveTo(15.6, 24.6, bx + 0.6, by - 1.8); c.stroke();
    c.strokeStyle = p.s1; c.lineWidth = 0.95;
    c.stroke();
    c.strokeStyle = p.hi; c.lineWidth = 0.28;
    c.setLineDash([0.5, 0.5]);
    c.stroke();
    c.setLineDash([]);
    shape(function () {
      c.moveTo(bx - 2.9, by - 1.6); c.lineTo(bx + 2.9, by - 1.6);
      c.quadraticCurveTo(bx + 3.5, by + 2.6, bx, by + 2.9);
      c.quadraticCurveTo(bx - 3.5, by + 2.6, bx - 2.9, by - 1.6);
      c.closePath();
    }, leather, { d: 1.0, lw: 0.45 });
    var flap = function () {
      c.moveTo(bx - 3.1, by - 1.9); c.lineTo(bx + 3.1, by - 1.9);
      c.quadraticCurveTo(bx + 2.8, by + 0.6, bx, by + 1.1);
      c.quadraticCurveTo(bx - 2.8, by + 0.6, bx - 3.1, by - 1.9);
      c.closePath();
    };
    shape(flap, mix(leather, '#ffffff', 0.28), { d: 0.8, lw: 0.42 });
    /* saddle stitching along the flap */
    c.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    c.lineWidth = 0.24;
    c.setLineDash([0.45, 0.4]);
    c.beginPath();
    c.moveTo(bx - 2.5, by - 1.3); c.quadraticCurveTo(bx - 2.2, by + 0.2, bx, by + 0.6);
    c.quadraticCurveTo(bx + 2.2, by + 0.2, bx + 2.5, by - 1.3);
    c.stroke();
    c.setLineDash([]);
    gold(starPath(bx, by + 0.9, 1.2, 0.5), { d: 0.4, lw: 0.3 });
    gold(circlePath(bx + 0.9, by - 1.9, 0.45), { d: 0.2, lw: 0.25 });
  }

  /* Hover ring: a glowing hoop that floats round her waist with star
     beads circling it. Painted in two halves, behind her and in front. */
  function hoverRing(front, t) {
    var a0 = front ? 0 : Math.PI, a1 = front ? Math.PI : TAU;
    var arc = function (rx, ry) { c.beginPath(); c.ellipse(0, 0, rx, ry, 0, a0, a1); c.stroke(); };
    c.save();
    c.translate(14, 26.9 + Math.sin(t * 2.2) * 0.5);
    c.rotate(Math.sin(t * 1.3) * 0.05);
    c.lineCap = 'butt';
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = 'rgba(90, 220, 255, 0.28)'; c.lineWidth = 3.0; arc(12.0, 2.8);
    c.globalCompositeOperation = 'source-over';
    c.strokeStyle = '#2a2f86'; c.lineWidth = 1.6; arc(12.0, 2.8);
    var g = c.createLinearGradient(-12, 0, 12, 0);
    g.addColorStop(0, '#7af0ff');
    g.addColorStop(0.5, '#b8a0ff');
    g.addColorStop(1, '#ff8ad8');
    c.strokeStyle = g; c.lineWidth = 1.05; arc(12.0, 2.8);
    c.strokeStyle = 'rgba(255, 255, 255, 0.9)'; c.lineWidth = 0.3; arc(12.0, 2.55);
    c.lineCap = 'round';
    for (var k = 0; k < 3; k++) {
      var a = t * 1.7 + k * TAU / 3, sn = Math.sin(a);
      if ((sn > 0) !== front) continue;
      var bx = Math.cos(a) * 12.0, by = sn * 2.8;
      c.fillStyle = 'rgba(255, 240, 160, 0.4)';
      c.beginPath(); c.arc(bx, by, 2.0, 0, TAU); c.fill();
      gold(starPath(bx, by, 1.35, 0.5), { d: 0.4, lw: 0.3 });
    }
    c.restore();
  }

  /* ---------- Held items ----------
     Painted about her grip at (0, 0): the handle or base runs down into
     her fist, the item stands above it. */
  function sprinkles(pts) {
    var cols = ['#ffe14a', '#4ac8ff', '#ffffff', '#9a6af0', '#4ad48a'];
    c.lineWidth = 0.34;
    for (var i = 0; i < pts.length; i++) {
      c.strokeStyle = cols[i % cols.length];
      c.beginPath();
      c.moveTo(pts[i][0], pts[i][1]);
      c.lineTo(pts[i][0] + Math.cos(i * 1.7) * 0.55, pts[i][1] + Math.sin(i * 1.7) * 0.55);
      c.stroke();
    }
  }
  function gloss(x, y, rx, ry, rot, a) {
    c.fillStyle = 'rgba(255, 255, 255, ' + (a || 0.7) + ')';
    c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, TAU); c.fill();
  }
  function waffleCone(tipY, rimY, hw, col) {
    var cone = function () { c.moveTo(-hw, rimY); c.lineTo(hw, rimY); c.lineTo(0, tipY); c.closePath(); };
    shape(cone, col, { d: 0.8, lw: 0.4 });
    c.save(); c.beginPath(); cone(); c.clip();
    c.strokeStyle = rgba(pal(col, false).s2, 0.75);
    c.lineWidth = 0.26;
    c.beginPath();
    for (var i = -4; i <= 4; i++) {
      c.moveTo(i * 0.9 - 3, rimY); c.lineTo(i * 0.9 + 1.4, tipY + 0.4);
      c.moveTo(i * 0.9 + 3, rimY); c.lineTo(i * 0.9 - 1.4, tipY + 0.4);
    }
    c.stroke();
    c.restore();
  }
  function heldFood(food) {
    var i, PI = Math.PI;
    if (food === 'iceCream') {
      waffleCone(2.6, -2.2, 2.3, '#e8b46c');
      /* strawberry scoop with a melting skirt, vanilla on top, a cherry */
      var scoop = function () {
        c.moveTo(-2.9, -2.6);
        c.bezierCurveTo(-3.6, -6.6, 3.6, -6.6, 2.9, -2.6);
        c.arc(2.0, -2.4, 0.9, 0, PI); c.arc(0.2, -2.1, 0.9, 0, PI); c.arc(-1.7, -2.4, 1.0, 0, PI);
        c.closePath();
      };
      shape(scoop, '#ff9cbc', { d: 1.0, lw: 0.4 });
      shape(function () {
        c.moveTo(-2.1, -5.6);
        c.bezierCurveTo(-2.7, -9.0, 2.9, -9.0, 2.3, -5.6);
        c.arc(1.5, -5.5, 0.8, 0, PI); c.arc(0, -5.3, 0.75, 0, PI); c.arc(-1.4, -5.5, 0.75, 0, PI);
        c.closePath();
      }, '#fff2c4', { d: 0.9, lw: 0.4 });
      c.strokeStyle = '#3c8a3c'; c.lineWidth = 0.3;
      c.beginPath(); c.moveTo(0.3, -8.6); c.quadraticCurveTo(0.9, -10.2, 2.0, -10.4); c.stroke();
      shape(circlePath(0.2, -8.5, 0.95), '#e8263e', { d: 0.4, lw: 0.32, rim: false });
      gloss(-0.1, -8.85, 0.3, 0.2, -0.5, 0.9);
      sprinkles([[-1.6, -4.2], [0.6, -3.8], [1.7, -4.6], [-0.4, -7.2], [1.2, -6.9]]);
      gloss(LX * 1.6, -4.9, 0.9, 0.45, LX * 0.6);
    } else if (food === 'onigiri') {
      var rice = function () {
        c.moveTo(0, -7.6);
        c.quadraticCurveTo(1.3, -7.6, 3.7, -2.0);
        c.quadraticCurveTo(4.3, -0.2, 2.6, 0.0);
        c.lineTo(-2.6, 0.0);
        c.quadraticCurveTo(-4.3, -0.2, -3.7, -2.0);
        c.quadraticCurveTo(-1.3, -7.6, 0, -7.6);
        c.closePath();
      };
      shape(rice, '#fbfbff', { d: 1.1, lw: 0.4 });
      /* grains */
      c.strokeStyle = 'rgba(150, 150, 200, 0.5)';
      c.lineWidth = 0.22;
      c.beginPath();
      var gr = [[-1.2, -5.6], [0.9, -6.2], [2.0, -3.6], [-2.4, -3.0], [0.2, -4.9], [-0.9, -3.4], [1.5, -5.0]];
      for (i = 0; i < gr.length; i++) { c.moveTo(gr[i][0], gr[i][1]); c.arc(gr[i][0] - 0.3, gr[i][1], 0.3, 0, PI * 0.8); }
      c.stroke();
      shape(function () {
        c.moveTo(-2.0, -2.9); c.lineTo(2.0, -2.9); c.lineTo(2.3, 0.2); c.lineTo(-2.3, 0.2); c.closePath();
      }, '#24382e', { d: 0.5, lw: 0.3, rim: false });
      c.strokeStyle = 'rgba(160, 220, 180, 0.4)'; c.lineWidth = 0.22;
      c.beginPath(); c.moveTo(-1.4, -2.4); c.lineTo(-1.2, -0.2); c.moveTo(0.2, -2.5); c.lineTo(0.3, -0.2); c.moveTo(1.5, -2.4); c.lineTo(1.4, -0.3); c.stroke();
      /* a happy face */
      c.fillStyle = '#2a0c24';
      c.beginPath(); c.arc(-1.2, -4.3, 0.36, 0, TAU); c.fill();
      c.beginPath(); c.arc(1.2, -4.3, 0.36, 0, TAU); c.fill();
      c.strokeStyle = '#2a0c24'; c.lineWidth = 0.3;
      c.beginPath(); c.arc(0, -4.0, 0.6, PI * 0.15, PI * 0.85); c.stroke();
      c.fillStyle = 'rgba(255, 130, 170, 0.6)';
      c.beginPath(); c.ellipse(-2.1, -3.6, 0.6, 0.36, 0, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(2.1, -3.6, 0.6, 0.36, 0, 0, TAU); c.fill();
    } else if (food === 'donut') {
      var cy = -4.2;
      var ring = function () { c.moveTo(3.7, cy); c.arc(0, cy, 3.7, 0, TAU); c.moveTo(1.15, cy); c.arc(0, cy, 1.15, 0, TAU, true); };
      shape(ring, '#d89858', { d: 1.0, lw: 0.4 });
      /* icing with a wavy edge */
      c.beginPath();
      for (i = 0; i <= 24; i++) {
        var a = i / 24 * TAU, rr = 3.05 + Math.sin(a * 7) * 0.3;
        if (i === 0) c.moveTo(Math.cos(a) * rr, cy + Math.sin(a) * rr); else c.lineTo(Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      c.closePath();
      c.moveTo(1.5, cy); c.arc(0, cy, 1.5, 0, TAU, true);
      c.fillStyle = '#ff8fc0';
      c.fill('evenodd');
      c.strokeStyle = '#c84a88'; c.lineWidth = 0.25;
      c.stroke();
      sprinkles([[-2.2, cy - 0.6], [-1.0, cy - 2.2], [0.9, cy - 2.4], [2.3, cy - 0.9], [2.0, cy + 1.2], [0.2, cy + 2.2], [-1.8, cy + 1.6]]);
      c.strokeStyle = 'rgba(255, 255, 255, 0.75)'; c.lineWidth = 0.45;
      c.beginPath(); c.arc(0, cy, 2.5, PI * 1.08, PI * 1.42); c.stroke();
    } else if (food === 'crepe') {
      /* cream, fruit and chocolate peeking from the fold */
      shape(function () {
        c.moveTo(-2.9, -3.2);
        c.arc(-1.9, -4.4, 1.3, PI, PI * 1.7); c.arc(-0.2, -5.4, 1.5, PI * 1.1, PI * 1.9); c.arc(1.7, -4.6, 1.35, PI * 1.3, TAU);
        c.lineTo(2.9, -3.2); c.closePath();
      }, '#fffaf2', { d: 0.6, lw: 0.35 });
      shape(function () { c.moveTo(-2.4, -4.4); c.quadraticCurveTo(-1.5, -7.2, -0.3, -4.9); c.closePath(); }, '#e8263e', { d: 0.4, lw: 0.3, rim: false });
      c.fillStyle = '#fff4a8';
      c.beginPath(); c.arc(-1.6, -5.4, 0.16, 0, TAU); c.fill(); c.beginPath(); c.arc(-1.1, -4.9, 0.16, 0, TAU); c.fill();
      shape(ellipsePath(1.4, -5.3, 1.05, 0.8, 0.3), '#ffe89a', { d: 0.3, lw: 0.28, rim: false });
      c.strokeStyle = '#6b3a1a'; c.lineWidth = 0.36;
      c.beginPath(); c.moveTo(-0.6, -5.9); c.lineTo(0.2, -4.8); c.lineTo(0.8, -6.0); c.lineTo(1.6, -4.4); c.stroke();
      /* the crepe folded round it, in a striped paper sleeve */
      shape(function () { c.moveTo(-3.2, -3.9); c.quadraticCurveTo(0, -2.6, 3.2, -3.9); c.lineTo(0.2, 2.6); c.lineTo(-0.2, 2.6); c.closePath(); },
        '#f4d490', { d: 0.8, lw: 0.4 });
      var sleeve = function () { c.moveTo(-2.3, -1.5); c.lineTo(2.3, -1.5); c.lineTo(0.2, 2.9); c.lineTo(-0.2, 2.9); c.closePath(); };
      shape(sleeve, '#fff6fa', { d: 0.6, lw: 0.38 });
      c.save(); c.beginPath(); sleeve(); c.clip();
      c.strokeStyle = '#ff8fc0'; c.lineWidth = 0.4;
      c.beginPath();
      for (i = -3; i <= 3; i++) { c.moveTo(i * 0.95 - 0.8, -1.6); c.lineTo(i * 0.95 + 0.8, 3.0); }
      c.stroke();
      c.restore();
    } else if (food === 'taiyaki') {
      var fish = function () {
        c.moveTo(-4.0, -4.0);
        c.bezierCurveTo(-3.8, -6.6, 1.0, -6.9, 2.6, -4.9);
        c.lineTo(4.6, -6.4); c.quadraticCurveTo(4.0, -4.0, 4.6, -1.6); c.lineTo(2.6, -3.1);
        c.bezierCurveTo(1.0, -1.1, -3.8, -1.4, -4.0, -4.0);
        c.closePath();
      };
      shape(fish, '#d8964a', { d: 1.0, lw: 0.4 });
      c.save(); c.beginPath(); fish(); c.clip();
      c.fillStyle = 'rgba(255, 224, 160, 0.65)';
      c.beginPath(); c.ellipse(-0.6, -4.9, 2.6, 0.9, -0.1, 0, TAU); c.fill();
      c.restore();
      c.strokeStyle = '#8a5520'; c.lineWidth = 0.28;
      c.beginPath();
      c.arc(-3.0, -4.0, 1.5, -PI * 0.38, PI * 0.38);
      for (i = 0; i < 3; i++) {
        c.moveTo(-0.6 + i * 1.1, -5.0); c.arc(-1.1 + i * 1.1, -4.5, 0.7, -PI * 0.4, PI * 0.4);
        c.moveTo(-0.6 + i * 1.1, -3.6); c.arc(-1.1 + i * 1.1, -3.1, 0.7, -PI * 0.4, PI * 0.4);
      }
      c.moveTo(3.2, -4.0); c.lineTo(4.3, -5.4); c.moveTo(3.2, -4.0); c.lineTo(4.3, -4.0); c.moveTo(3.2, -4.0); c.lineTo(4.3, -2.6);
      c.stroke();
      c.fillStyle = '#2a140c';
      c.beginPath(); c.arc(-2.9, -4.5, 0.42, 0, TAU); c.fill();
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(-3.05, -4.65, 0.15, 0, TAU); c.fill();
      c.strokeStyle = '#8a5520';
      c.beginPath(); c.arc(-3.6, -3.5, 0.5, PI * 0.1, PI * 0.7); c.stroke();
    } else if (food === 'parfait') {
      /* pocky stick and wafer behind the cream */
      c.strokeStyle = '#6b3a1a'; c.lineWidth = 0.7;
      c.beginPath(); c.moveTo(1.2, -6.4); c.lineTo(3.4, -10.6); c.stroke();
      c.strokeStyle = '#f4d490'; c.lineWidth = 0.7;
      c.beginPath(); c.moveTo(3.4, -10.6); c.lineTo(3.9, -11.5); c.stroke();
      var glass = function () {
        c.moveTo(-2.7, -7.2); c.lineTo(2.7, -7.2);
        c.quadraticCurveTo(2.6, -3.0, 0.9, -1.5); c.lineTo(-0.9, -1.5);
        c.quadraticCurveTo(-2.6, -3.0, -2.7, -7.2);
        c.closePath();
      };
      c.save(); c.beginPath(); glass(); c.clip();
      var lay = [['#6b3a1a', -2.6], ['#f2c46a', -3.5], ['#fff4dc', -4.6], ['#ff6a8c', -5.6], ['#fff4dc', -8]];
      var y0 = -1.4;
      for (i = 0; i < lay.length; i++) { c.fillStyle = lay[i][0]; c.fillRect(-3, lay[i][1], 6, y0 - lay[i][1]); y0 = lay[i][1]; }
      c.fillStyle = '#e8263e';
      c.beginPath(); c.arc(-1.2, -5.0, 0.5, 0, TAU); c.fill(); c.beginPath(); c.arc(1.0, -5.1, 0.45, 0, TAU); c.fill();
      c.restore();
      /* whipped cream swirl and a cherry */
      shape(function () {
        c.moveTo(-2.6, -7.0);
        c.arc(-1.6, -7.6, 1.15, PI, PI * 1.6); c.arc(-0.2, -8.6, 1.35, PI * 1.05, PI * 1.85); c.arc(1.5, -7.7, 1.2, PI * 1.35, TAU);
        c.lineTo(2.6, -7.0); c.closePath();
      }, '#fffaf4', { d: 0.6, lw: 0.35 });
      shape(circlePath(-0.3, -10.1, 0.9), '#e8263e', { d: 0.4, lw: 0.3, rim: false });
      gloss(-0.55, -10.4, 0.28, 0.18, -0.5, 0.9);
      /* the glass itself: rim, stem, foot and a tall reflection */
      c.strokeStyle = 'rgba(214, 240, 255, 0.95)'; c.lineWidth = 0.42;
      c.beginPath(); glass(); c.stroke();
      c.beginPath(); c.moveTo(0, -1.5); c.lineTo(0, 0.2); c.stroke();
      shape(ellipsePath(0, 0.5, 1.9, 0.55), '#d6f0ff', { d: 0.3, lw: 0.3, rim: false });
      c.strokeStyle = 'rgba(255, 255, 255, 0.8)'; c.lineWidth = 0.4;
      c.beginPath(); c.moveTo(LX * 1.9, -6.6); c.quadraticCurveTo(LX * 1.8, -4.0, LX * 1.0, -2.4); c.stroke();
    } else if (food === 'macaron') {
      var mac = function (y, col) {
        var mp = pal(col, false);
        shape(ellipsePath(0, y + 1.25, 3.0, 1.15), col, { d: 0.6, lw: 0.35 });
        c.fillStyle = '#fffaf4';
        c.beginPath(); c.ellipse(0, y + 0.45, 2.9, 0.95, 0, 0, TAU); c.fill();
        c.strokeStyle = '#e4cfd0'; c.lineWidth = 0.22; c.stroke();
        shape(function () {
          c.moveTo(-3.0, y);
          c.bezierCurveTo(-3.0, y - 2.2, 3.0, y - 2.2, 3.0, y);
          for (var k = 0; k < 6; k++) c.arc(2.5 - k, y, 0.5, 0, PI);
          c.closePath();
        }, col, { d: 0.7, lw: 0.35 });
        c.strokeStyle = rgba(mp.hi, 0.9); c.lineWidth = 0.4;
        c.beginPath(); c.moveTo(LX * 2.1, y - 0.8); c.quadraticCurveTo(LX * 1.2, y - 1.5, 0, y - 1.5); c.stroke();
      };
      mac(-1.6, '#9fe0c0');
      mac(-4.6, '#ff9ac2');
      mac(-7.6, '#c8a8f4');
    } else if (food === 'strawberry') {
      var berry = function () {
        c.moveTo(-3.3, -5.4);
        c.bezierCurveTo(-3.9, -2.0, -1.4, 1.6, 0, 1.8);
        c.bezierCurveTo(1.4, 1.6, 3.9, -2.0, 3.3, -5.4);
        c.quadraticCurveTo(0, -7.0, -3.3, -5.4);
        c.closePath();
      };
      shape(berry, '#ee3048', { d: 1.2, lw: 0.4 });
      c.fillStyle = '#ffe89a';
      var sd = [[-1.8, -4.2], [0.2, -4.6], [2.0, -4.0], [-1.0, -2.6], [1.1, -2.4], [-2.2, -1.6], [0.1, -1.0], [2.0, -1.4], [-0.8, 0.4]];
      for (i = 0; i < sd.length; i++) { c.beginPath(); c.ellipse(sd[i][0], sd[i][1], 0.2, 0.32, 0, 0, TAU); c.fill(); }
      gloss(LX * 1.7, -4.4, 0.95, 0.5, LX * 0.7, 0.6);
      /* leafy crown and stalk */
      shape(function () {
        c.moveTo(0, -5.6);
        c.lineTo(-3.4, -6.4); c.lineTo(-1.9, -5.0); c.lineTo(-2.4, -3.8); c.lineTo(-0.7, -4.8);
        c.lineTo(0, -3.6); c.lineTo(0.7, -4.8); c.lineTo(2.4, -3.8); c.lineTo(1.9, -5.0); c.lineTo(3.4, -6.4);
        c.closePath();
      }, '#46b44a', { d: 0.5, lw: 0.34, rim: false });
      c.strokeStyle = '#2a7a34'; c.lineWidth = 0.6;
      c.beginPath(); c.moveTo(0, -5.6); c.quadraticCurveTo(0.2, -7.0, 1.0, -7.6); c.stroke();
    } else if (food === 'lollipop') {
      c.strokeStyle = '#b8a8d0'; c.lineWidth = 1.0;
      c.beginPath(); c.moveTo(0, 2.6); c.lineTo(0, -3.6); c.stroke();
      c.strokeStyle = '#ffffff'; c.lineWidth = 0.5;
      c.stroke();
      var cyl = -6.6, R = 3.6;
      shape(circlePath(0, cyl, R), '#fff4fa', { d: 1.1, lw: 0.42 });
      /* candy swirl */
      c.save(); c.beginPath(); c.arc(0, cyl, R - 0.2, 0, TAU); c.clip();
      var sw = ['#ff5a8a', '#4ac8ff', '#ffe14a'];
      c.lineWidth = 0.85;
      for (var arm = 0; arm < 3; arm++) {
        c.strokeStyle = sw[arm];
        c.beginPath();
        for (i = 0; i <= 26; i++) {
          var th = i / 26 * PI * 2.6 + arm * TAU / 3, rr2 = i / 26 * R * 1.1;
          if (i === 0) c.moveTo(Math.cos(th) * rr2, cyl + Math.sin(th) * rr2);
          else c.lineTo(Math.cos(th) * rr2, cyl + Math.sin(th) * rr2);
        }
        c.stroke();
      }
      c.restore();
      c.strokeStyle = 'rgba(255, 255, 255, 0.85)'; c.lineWidth = 0.5;
      c.beginPath(); c.arc(0, cyl, R - 0.8, PI * 1.08, PI * 1.45); c.stroke();
    } else if (food === 'dango') {
      c.save();
      c.rotate(0.1);
      c.strokeStyle = '#8a6a3a'; c.lineWidth = 0.75;
      c.beginPath(); c.moveTo(0, 2.6); c.lineTo(0, -10.6); c.stroke();
      c.strokeStyle = '#f4dca8'; c.lineWidth = 0.4;
      c.stroke();
      var dg = ['#a8dc7c', '#fffaf2', '#ffa8c8'];
      for (i = 0; i < 3; i++) {
        shape(circlePath(0, -2.2 - i * 3.1, 1.85), dg[i], { d: 0.9, lw: 0.4 });
        gloss(LX * 0.7, -3.0 - i * 3.1, 0.5, 0.3, LX * 0.6, 0.75);
      }
      c.restore();
    } else if (food === 'cottonCandy') {
      shape(function () { c.moveTo(-1.3, -2.4); c.lineTo(1.3, -2.4); c.lineTo(0.25, 2.8); c.lineTo(-0.25, 2.8); c.closePath(); },
        '#fff6fa', { d: 0.5, lw: 0.36 });
      c.strokeStyle = '#8fd0ff'; c.lineWidth = 0.3;
      c.beginPath(); c.moveTo(-1.0, -1.6); c.lineTo(0.9, -0.6); c.moveTo(-0.7, -0.2); c.lineTo(0.6, 0.6); c.moveTo(-0.4, 1.2); c.lineTo(0.4, 1.8); c.stroke();
      var cloud = cloudPath(0, -6.4, 3.0, 2.8, 9, 1.6);
      shape(cloud, '#ffaed4', { d: 1.3, lw: 0.4 });
      c.save(); c.beginPath(); cloud(); c.clip();
      var cg = c.createLinearGradient(-3, -9, 4, -3);
      cg.addColorStop(0, 'rgba(150, 216, 255, 0)');
      cg.addColorStop(0.5, 'rgba(150, 216, 255, 0)');
      cg.addColorStop(1, 'rgba(150, 216, 255, 0.9)');
      c.fillStyle = cg;
      c.fillRect(-6, -12, 12, 10);
      c.strokeStyle = 'rgba(255, 255, 255, 0.8)'; c.lineWidth = 0.36;
      c.beginPath();
      c.moveTo(-1.6, -7.4); c.arc(-2.4, -7.0, 0.9, -0.6, PI * 1.1);
      c.moveTo(1.6, -5.4); c.arc(0.8, -5.0, 0.9, -0.6, PI * 1.1);
      c.moveTo(1.2, -8.4); c.arc(0.4, -8.0, 0.8, -0.6, PI * 1.1);
      c.stroke();
      c.restore();
      twinkle(2.9, -9.3, 0.9, '#ffffff');
    } else if (food === 'plushie') {
      /* teddy bear dangling from one paw */
      var fur = '#d8a470', pale = '#f6dcb8';
      c.save();
      c.translate(-2.5, 0.2);
      shape(ellipsePath(-1.4, 0.4, 1.15, 1.35, 0.2), fur, { d: 0.6, lw: 0.38 });
      shape(ellipsePath(1.4, 0.4, 1.15, 1.35, -0.2), fur, { d: 0.6, lw: 0.38 });
      shape(ellipsePath(-2.3, -3.0, 1.0, 1.4, 0.5), fur, { d: 0.6, lw: 0.38 });
      shape(ellipsePath(2.4, -3.6, 1.0, 1.5, -0.9), fur, { d: 0.6, lw: 0.38 });
      shape(ellipsePath(0, -2.2, 2.4, 2.7), fur, { d: 1.0, lw: 0.4 });
      shape(ellipsePath(0, -1.9, 1.45, 1.7), pale, { d: 0.5, lw: 0, rim: false, soft: true });
      c.fillStyle = pale;
      c.beginPath(); c.ellipse(-1.4, 0.9, 0.6, 0.5, 0, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(1.4, 0.9, 0.6, 0.5, 0, 0, TAU); c.fill();
      shape(circlePath(-2.0, -8.0, 1.05), fur, { d: 0.5, lw: 0.38 });
      shape(circlePath(2.0, -8.0, 1.05), fur, { d: 0.5, lw: 0.38 });
      c.fillStyle = '#ffb0c8';
      c.beginPath(); c.arc(-2.0, -8.0, 0.5, 0, TAU); c.fill(); c.beginPath(); c.arc(2.0, -8.0, 0.5, 0, TAU); c.fill();
      shape(circlePath(0, -6.2, 2.6), fur, { d: 1.0, lw: 0.4 });
      shape(ellipsePath(0, -5.5, 1.25, 0.95), pale, { d: 0.4, lw: 0.28, rim: false, soft: true });
      c.fillStyle = '#2a140c';
      c.beginPath(); c.ellipse(0, -5.9, 0.42, 0.3, 0, 0, TAU); c.fill();
      c.beginPath(); c.arc(-1.1, -6.6, 0.34, 0, TAU); c.fill();
      c.beginPath(); c.arc(1.1, -6.6, 0.34, 0, TAU); c.fill();
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(-1.2, -6.72, 0.12, 0, TAU); c.fill(); c.beginPath(); c.arc(1.0, -6.72, 0.12, 0, TAU); c.fill();
      c.strokeStyle = '#2a140c'; c.lineWidth = 0.25;
      c.beginPath(); c.moveTo(0, -5.6); c.lineTo(0, -5.2); c.arc(0, -5.3, 0.5, PI * 0.2, PI * 0.8); c.stroke();
      c.fillStyle = 'rgba(255, 130, 170, 0.5)';
      c.beginPath(); c.ellipse(-1.7, -5.7, 0.5, 0.3, 0, 0, TAU); c.fill(); c.beginPath(); c.ellipse(1.7, -5.7, 0.5, 0.3, 0, 0, TAU); c.fill();
      bow(0, -3.9, '#ff5a8a', 0.62);
      /* a mended patch */
      c.strokeStyle = '#a87440'; c.lineWidth = 0.24;
      c.beginPath(); c.moveTo(0.5, -1.4); c.lineTo(1.1, -0.8); c.moveTo(1.1, -1.4); c.lineTo(0.5, -0.8); c.stroke();
      c.restore();
    } else if (food === 'lantern') {
      /* paper lantern on a carrying stick */
      c.strokeStyle = '#6a3a2a'; c.lineWidth = 0.95;
      c.beginPath(); c.moveTo(0, 2.6); c.lineTo(-0.6, -9.4); c.lineTo(-3.4, -10.0); c.stroke();
      c.strokeStyle = '#c89a6a'; c.lineWidth = 0.38;
      c.beginPath(); c.moveTo(0.15, 2.4); c.lineTo(-0.45, -9.3); c.stroke();
      c.strokeStyle = '#e8305c'; c.lineWidth = 0.3;
      c.beginPath(); c.moveTo(-3.4, -10.0); c.lineTo(-3.4, -8.6); c.stroke();
      var body = function () {
        c.moveTo(-4.9, -8.3); c.lineTo(-1.9, -8.3);
        c.bezierCurveTo(0.2, -7.2, 0.2, -3.2, -1.9, -2.1);
        c.lineTo(-4.9, -2.1);
        c.bezierCurveTo(-7.0, -3.2, -7.0, -7.2, -4.9, -8.3);
        c.closePath();
      };
      shape(body, '#ffc35a', { d: 1.1, lw: 0.4 });
      c.save(); c.beginPath(); body(); c.clip();
      var lg = c.createRadialGradient(-3.4, -5.2, 0.3, -3.4, -5.2, 3.4);
      lg.addColorStop(0, 'rgba(255, 255, 236, 0.95)');
      lg.addColorStop(1, 'rgba(255, 220, 130, 0)');
      c.fillStyle = lg;
      c.fillRect(-8, -9, 9, 8);
      c.strokeStyle = 'rgba(200, 110, 40, 0.55)'; c.lineWidth = 0.25;
      c.beginPath();
      for (i = 0; i < 4; i++) { c.moveTo(-7.3, -7.2 + i * 1.3); c.quadraticCurveTo(-3.4, -6.8 + i * 1.3, 0.5, -7.2 + i * 1.3); }
      c.stroke();
      c.fillStyle = '#e8305c';
      fillStar(-3.4, -5.2, 1.5);
      c.fillStyle = '#ffd0dc';
      fillStar(-3.5, -5.3, 0.6);
      c.restore();
      shape(roundRectPath(-5.1, -8.9, 3.4, 0.9, 0.3), '#5a2a4a', { d: 0.3, lw: 0.28, rim: false });
      shape(roundRectPath(-5.1, -2.3, 3.4, 0.9, 0.3), '#5a2a4a', { d: 0.3, lw: 0.28, rim: false });
      c.strokeStyle = '#e8305c'; c.lineWidth = 0.4;
      c.beginPath(); c.moveTo(-3.4, -1.4); c.lineTo(-3.4, 0.4); c.moveTo(-3.8, -0.4); c.lineTo(-4.0, 0.8); c.moveTo(-3.0, -0.4); c.lineTo(-2.8, 0.8); c.stroke();
      gold(circlePath(-3.4, -1.3, 0.42), { d: 0.2, lw: 0.24 });
    }
  }
  /* The lantern's light, added over the cached lantern each frame. */
  function lanternGlow(t) {
    var k = 0.8 + 0.2 * Math.sin(t * 5.3) * Math.sin(t * 2.1 + 1);
    var g = c.createRadialGradient(-3.4, -5.2, 0.4, -3.4, -5.2, 7.5);
    g.addColorStop(0, 'rgba(255, 226, 150, ' + (0.5 * k).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255, 170, 90, 0)');
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = g;
    c.beginPath(); c.arc(-3.4, -5.2, 7.5, 0, TAU); c.fill();
    c.globalCompositeOperation = 'source-over';
  }

  /* Star flag: a pennant in her colour streaming from a little pole. */
  function starFlag(suitC, t) {
    var w1 = Math.sin(t * 5.0) * 0.5, w2 = Math.sin(t * 5.0 - 1.3) * 0.75;
    c.strokeStyle = '#5a6488'; c.lineWidth = 0.95;
    c.beginPath(); c.moveTo(0, 2.6); c.lineTo(0, -11.0); c.stroke();
    c.strokeStyle = '#e6eeff'; c.lineWidth = 0.38;
    c.beginPath(); c.moveTo(-0.15, 2.4); c.lineTo(-0.15, -10.8); c.stroke();
    var flag = function () {
      c.moveTo(-0.4, -10.6);
      c.bezierCurveTo(-2.8, -11.4 + w1, -5.0, -9.6 + w1, -8.4, -10.2 + w2);
      c.lineTo(-6.6, -8.0 + w2);
      c.lineTo(-8.2, -5.6 + w2);
      c.bezierCurveTo(-5.0, -5.0 + w1, -2.8, -6.6 + w1, -0.4, -5.8);
      c.closePath();
    };
    shape(flag, suitC, { d: 1.0, lw: 0.42 });
    c.strokeStyle = pal(suitC, false).s2; c.lineWidth = 0.3;
    c.beginPath(); c.moveTo(-3.9, -10.5 + w1); c.quadraticCurveTo(-3.4, -8.2 + w1, -3.9, -5.8 + w1); c.stroke();
    c.fillStyle = '#8a5a08';
    fillStar(-2.5, -8.2 + w1 * 0.6, 1.65);
    c.fillStyle = GOLD;
    fillStar(-2.5, -8.2 + w1 * 0.6, 1.3);
    c.fillStyle = GOLD_HI;
    fillStar(-2.65, -8.35 + w1 * 0.6, 0.5);
    gold(circlePath(0, -11.3, 0.8), { d: 0.3, lw: 0.3 });
  }

  /* Star wand: striped handle, ribbons, a winged gold star and sparks. */
  function wand(t) {
    var tx = -3.2, ty = -7.2;
    var stick = function () { c.beginPath(); c.moveTo(0.7, 2.4); c.lineTo(tx, ty); c.stroke(); };
    c.lineCap = 'round';
    c.strokeStyle = '#5a2a7a'; c.lineWidth = 1.25; stick();
    c.strokeStyle = '#ff8fc0'; c.lineWidth = 0.8; stick();
    c.strokeStyle = '#ffffff'; c.lineWidth = 0.8;
    c.lineCap = 'butt';
    c.setLineDash([0.5, 1.1]);
    stick();
    c.setLineDash([]);
    c.lineCap = 'round';
    /* ribbons from the collar */
    var rsw = Math.sin(t * 3.4) * 0.6;
    fastShape(lockPath(tx + 0.5, ty + 1.2, tx - 2.2 + rsw, ty + 3.0, tx - 2.4 + rsw * 1.6, ty + 6.0, 0.7), '#ff5a8a', 0.4, 0.35);
    fastShape(lockPath(tx + 0.5, ty + 1.2, tx - 0.6 + rsw, ty + 3.6, tx - 1.0 + rsw * 1.6, ty + 5.2, 0.6), '#4ac8ff', 0.4, 0.35);
    var g = c.createRadialGradient(tx, ty, 0.3, tx, ty, 5.6);
    g.addColorStop(0, 'rgba(255, 240, 160, 0.6)');
    g.addColorStop(1, 'rgba(255, 180, 230, 0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(tx, ty, 5.6, 0, TAU); c.fill();
    /* little wings */
    for (var side = -1; side <= 1; side += 2) {
      shape(lockPath(tx + side * 1.4, ty + 0.4, tx + side * 3.6, ty - 0.6, tx + side * 5.2, ty - 2.4, 0.95), '#fffaff', { d: 0.4, lw: 0.34 });
      shape(lockPath(tx + side * 1.4, ty + 0.9, tx + side * 3.4, ty + 0.8, tx + side * 4.6, ty - 0.2, 0.8), '#fffaff', { d: 0.4, lw: 0.34 });
    }
    gold(starPath(tx, ty, 3.0, 0.5), { d: 0.8, lw: 0.42 });
    c.fillStyle = GOLD_HI;
    fillStar(tx - 0.3, ty - 0.3, 1.5);
    gem(tx, ty + 0.1, 0.85, '#ff4a8a');
    var k = (t * 1.3) % 1;
    twinkle(tx + 3.6 - k * 1.2, ty - 2.4 + k * 2.6, 1.1 * (1 - k), 'rgba(255, 255, 255, ' + (1 - k).toFixed(3) + ')');
    var k2 = (t * 1.3 + 0.5) % 1;
    twinkle(tx - 3.2 + k2 * 0.6, ty + 0.4 + k2 * 2.4, 0.9 * (1 - k2), 'rgba(255, 220, 250, ' + (1 - k2).toFixed(3) + ')');
  }

  function balloonBody(col) {
    shape(function () {
      c.moveTo(0, -4.8);
      c.bezierCurveTo(3.4, -4.8, 3.9, -0.4, 0.4, 2.4);
      c.lineTo(-0.4, 2.4);
      c.bezierCurveTo(-3.9, -0.4, -3.4, -4.8, 0, -4.8);
      c.closePath();
    }, col, { d: 1.4, lw: 0.45 });
    shape(function () { c.moveTo(-0.7, 2.2); c.lineTo(0.7, 2.2); c.lineTo(0.9, 3.0); c.lineTo(-0.9, 3.0); c.closePath(); }, pal(col, false).s1, { d: 0.3, lw: 0.3, rim: false });
    c.fillStyle = '#fff8d0';
    fillStar(0.2, -1.6, 1.3);
    c.fillStyle = 'rgba(255, 255, 255, 0.85)';
    c.beginPath(); c.ellipse(-1.5, -3.0, 0.7, 1.2, 0.5, 0, TAU); c.fill();
  }

  /* ---------- Part cache ----------
     Every rigid piece is painted once per look, light side and device
     scale into a small canvas, then blitted under the current joint
     transform. */
  var cache = {}, cacheN = 0;
  function part(key, s, x, y, w, h, draw) {
    var k = key + '@' + s;
    var p = cache[k];
    if (p) return p;
    if (cacheN >= 900) { cache = {}; cacheN = 0; }
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(w * s));
    cv.height = Math.max(1, Math.ceil(h * s));
    var g = cv.getContext('2d');
    g.setTransform(s, 0, 0, s, -x * s, -y * s);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    var pc = c;
    c = g;
    draw();
    c = pc;
    p = [cv, x, y, cv.width / s, cv.height / s];
    cache[k] = p;
    cacheN++;
    return p;
  }
  function blitAt(cv, x, y) { c.drawImage(cv, x, y, cv.width / curS, cv.height / curS); }
  function blit(p, x, y) {
    if (x === undefined) c.drawImage(p[0], p[1], p[2], p[3], p[4]);
    else c.drawImage(p[0], x + p[1], y + p[2], p[3], p[4]);
  }
  var curS = 1;

  /* ---------- Springs and the rig ---------- */
  function Spring(k, d) { this.k = k; this.d = d; this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; }
  Spring.prototype.step = function (dt, tx, ty, fx, fy) {
    var ax = this.k * (tx - this.x) - this.d * this.vx + fx;
    var ay = this.k * (ty - this.y) - this.d * this.vy + fy;
    this.vx += ax * dt; this.vy += ay * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
  };
  Spring.prototype.limit = function (lx, ly0, ly1) {
    if (this.x > lx) { this.x = lx; if (this.vx > 0) this.vx *= -0.3; }
    if (this.x < -lx) { this.x = -lx; if (this.vx < 0) this.vx *= -0.3; }
    if (this.y > ly1) { this.y = ly1; if (this.vy > 0) this.vy *= -0.3; }
    if (this.y < ly0) { this.y = ly0; if (this.vy < 0) this.vy *= -0.3; }
  };
  Spring.prototype.zero = function () { this.x = this.y = this.vx = this.vy = 0; };

  function neutralPose() {
    return {
      lean: 0, sq: 0, hx: 0, bob: 0, headX: 0, headY: 0, tilt: 0,
      legA: 0, legB: 0, liftA: 0, liftB: 0,
      armA: -0.55, armB: 0.55, bendA: 0.16, bendB: -0.16,
      lookX: 0, lookY: 0, eyes: 'open', mouth: 'normal',
      inner: { x: 0, y: 0 }, hair: { mx: 0, my: 0, tx: 0, ty: 0 },
      skirt: 0, skirtShear: 0, cape: { x: 0, y: 0 }, ant: { x: 0, y: 0 },
      bal: { x: 0, y: 0 }, ears: { x: 0, y: 0 }, jet: 0, glint: 0, refl: 0, time: 0,
      face: 1, sx: 1, floss: null,
    };
  }

  var REACT_DUR = { cheer: 1.05, wave: 1.4, arrive: 0.6 };

  function Rig(seed) {
    this.seed = seed || 1234567;
    this.reset();
  }
  Rig.prototype.rnd = function () {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  };
  Rig.prototype.reset = function () {
    this.init = false;
    this.time = 0;
    this.x = this.y = 0;
    this.vx = this.vy = this.ax = this.ay = 0;
    this.facing = 1; this.face = 1; this.turn = 1;
    this.phase = 0; this.stepN = 0; this.walk = 0; this.air = 0; this.r = 0;
    this.grounded = true; this.airT = 0; this.fallV = 0;
    this.moving = false; this.idleT = 0;
    this.sq = 0; this.sqV = 0; this.lean = 0; this.leanV = 0;
    this.hop = 0; this.hopV = 0; this.hopA = 0;
    this.tip = new Spring(15, 2.3);
    this.mid = new Spring(32, 4.2);
    this.inner = new Spring(60, 6.5);
    this.skirt = new Spring(55, 4.8);
    this.capeS = new Spring(24, 3.2);
    this.antS = new Spring(80, 3.0);
    this.balS = new Spring(4.5, 1.3);
    this.earS = new Spring(45, 3.0);
    this.headS = new Spring(160, 15);
    this.lookW = 0; this.lookWV = 0; this.lookY = 0; this.lookYV = 0;
    this.blinkT = 9; this.blinkNext = 1.6; this.blink2 = -1;
    this.glanceNext = 2.2; this.glanceT = 0; this.glanceX = 0; this.glanceY = 0;
    this.jet = 0;
    this.react = null; this.reactT = 0; this.reactHit = false;
    this.puffs = [];
    this.streaks = []; this.tb = 0; this.streakT = 0;
    this.pose = neutralPose();
  };
  Rig.prototype.doReact = function (kind) {
    if (!REACT_DUR[kind]) return;
    this.react = kind;
    this.reactT = 0;
    this.reactHit = false;
    /* a quick crouch to spring from */
    if (kind === 'cheer') this.sqV += 2.6;
  };
  Rig.prototype.puff = function (x, y, n, big) {
    for (var i = 0; i < n; i++) {
      var side = i % 2 ? 1 : -1;
      this.puffs.push({
        x: x + side * (1 + this.rnd() * 3), y: y - this.rnd() * 1.5,
        vx: side * (big ? 18 + this.rnd() * 22 : 8 + this.rnd() * 14), vy: -(4 + this.rnd() * (big ? 10 : 6)),
        age: 0, life: (big ? 0.8 : 0.55) + this.rnd() * 0.35, r0: big ? 2.2 : 1.5, r1: big ? 7.5 : 4.8,
      });
    }
    if (this.puffs.length > 24) this.puffs.splice(0, this.puffs.length - 24);
  };

  /* Advance by dt seconds with her feet at (x, y).
     o: grounded, facing (1/-1), planar (top-down room: y is depth),
        indoor (smaller steps), dust (kick up regolith), vmax (px/s),
        turbo (0..1 as the turbo boost takes her toward 2x: quicker,
        longer bounds, more lean, hair and cloth streaming back, speed
        streaks), size (how much larger the caller paints her). */
  Rig.prototype.update = function (dt, x, y, o) {
    o = o || {};
    if (!(dt > 0)) return this.pose;
    dt = Math.min(dt, 0.05);
    var vmax = o.vmax || 192;
    var facing = o.facing === -1 ? -1 : o.facing === 1 ? 1 : this.facing;
    if (!this.init || Math.abs(x - this.x) > 90 || Math.abs(y - this.y) > 90) {
      var again = this.init;
      this.x = x; this.y = y; this.vx = this.vy = this.ax = this.ay = 0;
      this.facing = this.face = facing; this.turn = 1;
      this.init = true;
      this.tip.zero(); this.mid.zero(); this.capeS.zero(); this.balS.zero();
      if (again || o.arrive) this.doReact('arrive');
    }
    var planar = !!o.planar, indoor = !!o.indoor;
    var grounded = o.grounded !== false;
    this.time += dt;
    /* velocity and acceleration from the feet, lightly smoothed */
    var rvx = (x - this.x) / dt, rvy = (y - this.y) / dt;
    this.x = x; this.y = y;
    var kv = Math.min(1, dt * 20);
    var nvx = this.vx + (rvx - this.vx) * kv, nvy = this.vy + (rvy - this.vy) * kv;
    var ka = Math.min(1, dt * 14);
    this.ax += ((nvx - this.vx) / dt - this.ax) * ka;
    this.ay += ((nvy - this.vy) / dt - this.ay) * ka;
    this.vx = nvx; this.vy = nvy;
    var pvy = planar ? 0 : this.vy, pay = planar ? 0 : this.ay;
    var sp = planar ? Math.sqrt(this.vx * this.vx + this.vy * this.vy) : Math.abs(this.vx);
    var r = clamp(sp / vmax, 0, 1);
    this.r = r;
    /* the turbo look only while she is actually going fast (not while
       held against a wall) */
    this.tb += (clamp(o.turbo || 0, 0, 1) - this.tb) * Math.min(1, dt * 10);
    var tb = this.tb * r;

    /* turning: the body flips half way through a short squash */
    if (facing !== this.facing) {
      this.facing = facing;
      this.turn = 0;
      this.blinkT = 0;
    }
    if (this.turn < 1) this.turn = Math.min(1, this.turn + dt / 0.2);
    this.face = this.turn < 0.5 ? -this.facing : this.facing;

    /* ground contact */
    if (!grounded) { this.airT += dt; this.fallV = Math.max(this.fallV, this.vy); }
    if (grounded && !this.grounded && this.airT > 0.15) {
      var imp = clamp(this.fallV / 220, 0.35, 1.3);
      this.sqV += imp * 5.5;
      if (o.dust) this.puff(x, y, 6, true);
      this.blinkT = 0.035;
    }
    if (grounded) { this.airT = 0; this.fallV = 0; }
    this.grounded = grounded;

    /* start and stop: a crouch and rock back before she goes, a plant
       when she stops */
    var moving = sp > (planar ? 20 : 16);
    if (grounded && moving && !this.moving && this.walk < 0.3) { this.sqV += 2.4; this.leanV -= 1.3; }
    if (grounded && !moving && this.moving) { this.sqV += 1.5; }
    this.moving = moving;
    this.walk += ((grounded && moving ? 1 : 0) - this.walk) * Math.min(1, dt * 8);
    this.air += ((grounded ? 0 : 1) - this.air) * Math.min(1, dt * 6);

    /* gait: two hops per cycle, contacts at phase = n·π */
    var steps = indoor ? lerp(1.9, 3.0, r) + 1.3 * tb : lerp(1.45, 2.35, r) + 0.8 * tb;
    if (grounded && moving) {
      this.phase += dt * Math.PI * steps;
    } else if (this.walk > 0.02) {
      /* finish the step: settle onto the nearest contact */
      var tgt = Math.round(this.phase / Math.PI) * Math.PI;
      this.phase += (tgt - this.phase) * Math.min(1, dt * 7);
    }
    var n = Math.floor(this.phase / Math.PI);
    if (n !== this.stepN) {
      this.stepN = n;
      if (grounded && this.walk > 0.4) {
        this.sqV += (indoor ? 0.8 : 1.7) * r + 0.35;
        if (o.dust && r > 0.2) this.puff(x + facing * 3, y, tb > 0.4 ? 3 : 2, tb > 0.4);
      }
    }
    var phi = this.phase, sphi = Math.sin(phi), cphi = Math.cos(phi);
    var H = this.walk * (indoor ? 0.45 + 1.0 * r + 0.4 * tb : 0.8 + 3.3 * r + 1.4 * tb);
    /* Long floaty hang, but a soft touch-down: near each contact the
       rise eases in from flat instead of bouncing off a sharp corner,
       so she sinks into the step and springs out of it. */
    var su = Math.abs(sphi);
    var hop = -H * Math.pow(su, 0.6) * (su * su / (su * su + 0.04));
    hop += this.air * Math.sin(this.time * 2.1) * 0.35;

    /* reactions */
    var R = this.react, rt = 0, re = 0;
    if (R) {
      this.reactT += dt;
      rt = this.reactT;
      var dur = REACT_DUR[R];
      if (rt >= dur) { this.react = R = null; }
      else {
        re = smooth(0, 0.14, rt) * (1 - smooth(dur - 0.25, dur, rt));
        if (R === 'cheer') {
          hop += -3.4 * Math.max(0, Math.sin(Math.PI * clamp((rt - 0.08) / 0.5, 0, 1)));
          if (!this.reactHit && rt > 0.58) { this.reactHit = true; this.sqV += 3.2; }
        } else if (R === 'arrive') {
          hop += -2.2 * Math.max(0, Math.sin(Math.PI * Math.min(1, rt / 0.34)));
          if (!this.reactHit && rt > 0.34) { this.reactHit = true; this.sqV += 3.6; if (o.dust) this.puff(x, y, 4, true); }
        }
      }
    }
    var hopV = (hop - this.hop) / dt;
    var hopA = (hopV - this.hopV) / dt;
    this.hop = hop; this.hopV = hopV;
    this.hopA += (hopA - this.hopA) * Math.min(1, dt * 30);

    /* body acceleration in sprite units (1 unit = 1 world px) */
    var AX = clamp(this.ax, -2500, 2500), AY = clamp(pay + this.hopA, -3000, 3000);
    var dl = 1.3 + 0.9 * tb;
    var dragX = clamp(-this.vx / vmax, -dl, dl), dragY = clamp(-pvy / vmax, -1.3, 1.3);
    var vxl = (planar ? this.vx : this.vx) * this.facing;
    var axl = this.ax * this.facing;

    /* springs (sub-stepped so the floaty ones stay stable) */
    var nsub = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / nsub;
    var floatUp = -this.air * (1.4 + clamp(pvy / vmax, -0.3, 1) * 2.2);
    for (var i = 0; i < nsub; i++) {
      this.mid.step(h, dragX * 2.4, dragY * 1.4 + floatUp * 0.5 - 0.7 * tb, -AX * 0.022, -AY * 0.05);
      this.tip.step(h, dragX * 5.2 + this.mid.x * 0.55, dragY * 4.2 + floatUp * 1.6 + this.mid.y * 0.55 - 1.8 * tb, -AX * 0.03, -AY * 0.085);
      this.inner.step(h, dragX * 0.45, dragY * 0.35 + floatUp * 0.15, -AX * 0.0028, -AY * 0.006);
      this.skirt.step(h, this.air * clamp(pvy / vmax, -0.4, 1.0) * 0.9 + this.walk * r * 0.12, dragX * 0.3,
                      AY * 0.0016, -AX * 0.0012);
      this.capeS.step(h, dragX * 4.0, dragY * 2.0 + floatUp * 0.8, -AX * 0.02, -AY * 0.05);
      this.antS.step(h, 0, 0, -AX * 0.012, -AY * 0.012);
      this.balS.step(h, dragX * 6.5, dragY * 3.0, -AX * 0.016, -AY * 0.02);
      this.earS.step(h, dragX * 1.6, dragY * 1.0 + floatUp * 0.4, -AX * 0.01, -AY * 0.03);
      this.headS.step(h, 0, 0, 0, -AY * 0.0018);
    }
    this.tip.limit(8.5 + 3 * tb, -7.5, 5.0);
    this.mid.limit(4.5 + 1.5 * tb, -4.5, 3.0);
    this.inner.limit(0.8, -0.7, 0.6);
    this.skirt.limit(1.2, -0.5, 1.3);
    this.capeS.limit(7 + 3 * tb, -6, 4);
    this.antS.limit(3, -2.5, 2.5);
    this.balS.limit(9, -4, 6);
    this.earS.limit(2.5, -2.5, 2.5);
    this.headS.limit(0.6, -0.6, 0.6);

    /* lean: forward with speed, back on a start, forward on a stop */
    var leanT = 0.11 * clamp(vxl / vmax, -1.2, 1.2) * (1 - this.air * 0.4) + clamp(-axl * 0.00005, -0.07, 0.07) + 0.06 * tb * this.walk;
    if (planar) leanT *= 0.6;
    this.leanV += (70 * (leanT - this.lean) - 9 * this.leanV) * dt;
    this.lean += this.leanV * dt;
    this.lean = clamp(this.lean, -0.2, 0.2);
    /* squash and stretch */
    var sqT = -this.air * Math.min(0.07, Math.abs(pvy) / vmax * 0.07);
    this.sqV += (190 * (sqT - this.sq) - 12 * this.sqV) * dt;
    this.sq += this.sqV * dt;
    this.sq = clamp(this.sq, -0.12, 0.22);
    /* jets fire while she climbs */
    this.jet += ((!grounded && pvy < -15 ? 1 : this.air * 0.25) - this.jet) * Math.min(1, dt * 8);

    /* idle: glances, weight shift */
    var idle = this.walk < 0.15 && this.air < 0.3 && !R;
    this.idleT = idle ? this.idleT + dt : 0;
    if (!idle) { this.glanceT = 0; this.glanceX = 0; this.glanceY = 0; }
    if (this.idleT > 1.2) {
      this.glanceNext -= dt;
      if (this.glanceT > 0) {
        this.glanceT -= dt;
        if (this.glanceT <= 0) { this.glanceX = 0; this.glanceY = 0; }
      } else if (this.glanceNext <= 0) {
        var g = this.rnd();
        var sd = this.rnd() < 0.5 ? -1 : 1;
        if (g < 0.75) { this.glanceX = sd * 0.9; this.glanceY = 0.05; }
        else { this.glanceX = sd * 0.3; this.glanceY = -0.75; }
        this.glanceT = 0.7 + this.rnd() * 0.7;
        this.glanceNext = 3.0 + this.rnd() * 3.5;
      }
    }
    var lookT = this.walk > 0.3 ? this.facing * 0.75 * this.walk : (this.air > 0.5 ? this.facing * 0.45 : this.glanceX);
    var lookYT = this.air > 0.5 ? -0.35 : this.glanceY;
    this.lookWV += (150 * (lookT - this.lookW) - 22 * this.lookWV) * dt;
    this.lookW += this.lookWV * dt;
    this.lookYV += (150 * (lookYT - this.lookY) - 22 * this.lookYV) * dt;
    this.lookY += this.lookYV * dt;

    /* blinks, sometimes doubled */
    this.blinkNext -= dt;
    if (this.blinkNext <= 0) {
      this.blinkT = 0;
      this.blinkNext = 2.2 + this.rnd() * 3.2;
      if (this.rnd() < 0.22) this.blink2 = 0.27;
    }
    this.blinkT += dt;
    if (this.blink2 > 0) { this.blink2 -= dt; if (this.blink2 <= 0) { this.blinkT = 0; this.blink2 = -1; } }

    /* puffs */
    for (var pi = this.puffs.length - 1; pi >= 0; pi--) {
      var pf = this.puffs[pi];
      pf.age += dt;
      if (pf.age >= pf.life) { this.puffs.splice(pi, 1); continue; }
      pf.x += pf.vx * dt; pf.y += pf.vy * dt;
      pf.vx *= Math.exp(-2.4 * dt); pf.vy *= Math.exp(-1.6 * dt);
    }
    /* turbo speed streaks: short lines left behind in the world as she
       goes, so they trail off behind her and fade */
    var sz = o.size || 1;
    this.streakT -= dt;
    if (tb > 0.15 && moving && this.streakT <= 0) {
      this.streakT = 0.05;
      var vv = Math.sqrt(this.vx * this.vx + this.vy * this.vy) || 1;
      var ux = this.vx / vv, uy = planar ? this.vy / vv : 0;
      var back = (6 + this.rnd() * 6) * sz;
      this.streaks.push({
        x: x - ux * back, y: y - (5 + this.rnd() * 24) * sz - uy * back,
        ux: ux, uy: uy, len: (9 + this.rnd() * 12) * sz, w: sz, a: tb, age: 0, life: 0.3,
      });
      if (this.streaks.length > 12) this.streaks.shift();
    }
    for (var si = this.streaks.length - 1; si >= 0; si--) {
      this.streaks[si].age += dt;
      if (this.streaks[si].age >= this.streaks[si].life) this.streaks.splice(si, 1);
    }

    /* ---- assemble the pose ---- */
    var P = this.pose, w = this.walk, a = this.air, face = this.face;
    var br = Math.sin(this.time * TAU / 3.4);
    var still = (1 - w) * (1 - a);
    var shiftK = smooth(3, 4.5, this.idleT);
    /* walk */
    var th = (indoor ? 0.22 + 0.22 * r + 0.1 * tb : 0.24 + 0.34 * r + 0.12 * tb) * w;
    var legA = th * cphi;
    var lift = w * (0.5 + 1.4 * r + 0.6 * tb);
    var lag = th * Math.cos(phi - 0.75);
    /* Arms: relaxed, swinging against the legs with a soft elbow. At
       rest they hold the little A-pose; walking they drop in toward her
       sides. She is drawn three-quarter on, so an arm swinging across
       her front is foreshortened: that half of each swing is kept short,
       which stops both hands meeting over her tummy (it read as arms
       held up) while the outward half carries the stride. */
    var ka2 = indoor ? 0.85 : 0.75;
    var spread = 0.55 - 0.25 * w;
    var swA = -ka2 * legA, swB = ka2 * legA;
    if (swA > 0) swA *= 0.3;
    if (swB < 0) swB *= 0.3;
    var armA = -spread + swA, armB = spread + swB;
    var bendA = 0.16 - 0.45 * ka2 * (lag - legA) + 0.02 * w, bendB = -0.16 + 0.45 * ka2 * (lag - legA) - 0.02 * w;
    var lA = legA, lB = -legA, liftA = lift * Math.max(0, -sphi), liftB = lift * Math.max(0, sphi);
    /* idle breathing and weight shift */
    armA -= 0.05 * br * still; armB += 0.05 * br * still;
    var hx = shiftK * 0.45 * Math.sin(this.time * 0.8) * still + w * 0.25 * sphi;
    lA += shiftK * 0.04 * Math.sin(this.time * 0.8) * still;
    lB += shiftK * 0.04 * Math.sin(this.time * 0.8) * still;
    /* float */
    if (a > 0.001) {
      var fl = Math.sin(this.time * 2.2);
      armA = lerp(armA, -1.25 - 0.2 * fl, a); armB = lerp(armB, 1.25 + 0.2 * Math.sin(this.time * 2.2 + 0.5), a);
      bendA = lerp(bendA, 0.55, a); bendB = lerp(bendB, -0.55, a);
      lA = lerp(lA, 0.22 + 0.12 * Math.sin(this.time * 3.0), a);
      lB = lerp(lB, -0.2 + 0.12 * Math.sin(this.time * 3.0 + 1.8), a);
      liftA = lerp(liftA, 1.0, a); liftB = lerp(liftB, 1.8, a);
    }
    var eyes = 'open', mouth = 'normal', tilt = 0.04 * w * sphi + this.lookW * 0.04 * face * still;
    var bt = this.blinkT;
    if (bt < 0.04) eyes = 'half'; else if (bt < 0.1) eyes = 'closed'; else if (bt < 0.15) eyes = 'half';
    if (R === 'cheer') {
      var wig = Math.sin(rt * 18) * 0.22;
      armA = lerp(armA, -2.05 - wig, re); armB = lerp(armB, 2.05 + wig, re);
      bendA = lerp(bendA, -0.45, re); bendB = lerp(bendB, 0.45, re);
      eyes = 'happy'; mouth = 'happy';
    } else if (R === 'wave') {
      armB = lerp(armB, 2.15, re);
      bendB = lerp(bendB, 0.55 * Math.sin(rt * 13), re);
      if (rt < 1.0) eyes = 'happy';
      mouth = 'happy';
      tilt += 0.07 * re;
    } else if (R === 'arrive') {
      if (rt < 0.3) mouth = 'open';
    }
    if (this.airT > 0.2 && this.vy > 60) mouth = 'open';

    P.lean = this.lean;
    P.sq = this.sq;
    P.hx = hx;
    P.bob = hop;
    P.headX = 0;
    P.headY = -0.3 * br * still + this.headS.y;
    P.tilt = tilt;
    P.legA = lA; P.legB = lB; P.liftA = liftA; P.liftB = liftB;
    P.armA = armA; P.armB = armB; P.bendA = bendA; P.bendB = bendB;
    P.lookX = this.lookW * face; P.lookY = this.lookY;
    P.eyes = eyes; P.mouth = mouth;
    P.inner.x = this.inner.x * face; P.inner.y = this.inner.y;
    P.hair.mx = this.mid.x * face; P.hair.my = this.mid.y;
    P.hair.tx = this.tip.x * face; P.hair.ty = this.tip.y;
    P.skirt = this.skirt.x; P.skirtShear = this.skirt.y * face;
    P.cape.x = this.capeS.x * face; P.cape.y = this.capeS.y;
    P.ant.x = this.antS.x * face; P.ant.y = this.antS.y;
    P.bal.x = this.balS.x * face; P.bal.y = this.balS.y;
    P.ears.x = this.earS.x * face; P.ears.y = this.earS.y;
    P.jet = this.jet;
    P.glint = clamp(-this.vx / vmax * 0.22, -0.25, 0.25) * face + hop * 0.02 + this.lean * 0.5;
    P.refl = this.x;
    P.time = this.time;
    P.face = face;
    P.sx = face * (1 - 0.3 * Math.sin(Math.PI * this.turn));
    P.floss = null;
    return P;
  };

  /* Wall-clock driven update for callers that only draw. */
  Rig.prototype.tick = function (x, y, o) {
    var now = (window.performance && performance.now) ? performance.now() : Date.now();
    var dt = this.lastNow ? (now - this.lastNow) / 1000 : 1 / 60;
    this.lastNow = now;
    if (dt > 0.25) dt = 1 / 60;
    return this.update(dt, x, y, o);
  };

  /* ---------- Whole figure ---------- */
  var HIP_Y = 27, SH_Y = 21.7;

  /* bare: leave the helmet off (the customise cards for hair and face). */
  function drawFigure(cu, P, env, s, bare) {
    var ck = custKey(cu);
    var dress = isDress(cu.outfit);
    var t = P.time || 0;
    curS = s;
    GT = glassTones(cu.glass);

    var legP = part('leg' + ck, s, -6.6, -1.6, 12.2, 10.2, function () { legPart(cu); });
    var upP = part('ua' + ck, s, -3.0, -2.6, 6.0, 7.8, function () { upperArmPart(cu); });
    var foP = part('fa' + ck, s, -3.4, -1.8, 6.8, 7.6, function () { foreArmPart(cu); });
    var haP = part('ha' + ck, s, -2.2, -2.0, 4.4, 4.4, function () { handPart(cu); });
    var toP = part('to' + ck, s, 2.6, 17.4, 23, 16, function () { torsoPart(cu); });
    var skP = dress ? part('sk' + ck, s, 1.2, 23.6, 25.6, 11.2, function () { skirtPart(cu.outfit, cu.suit); }) : null;
    var faP = part('fc' + ck, s, 4.8, 6.0, 18.4, 15.2, function () { facePart(cu.skin, cu.hairStyle, cu.face); });
    var feP = part('fe' + P.eyes + P.mouth + ck, s, 6.0, 8.6, 16, 11.6, function () { featuresPart(cu.skin, P.eyes, P.mouth, cu.eyes); });
    var fwP = cu.face === 'glasses' || cu.face === 'starShades'
      ? part('fw' + ck, s, 4.6, 7.6, 18.8, 11.6, function () { faceWearPart(cu); }) : null;
    var frP = part('fr' + ck, s, -0.4, -3.4, 29, 22.4, function () { fringePart(cu); });
    var hbP = part('hb' + ck, s, -0.4, -2.2, 28.8, 25, function () { hairBackPart(cu); });
    var coP = bare ? null : part('co' + ck, s, 6.4, 18.4, 15.2, 3.8, function () { helmetCollar(); });
    var hkP = bare ? null : part('hk' + cu.glass, s, HX - HR - 0.6, HY - HR - 0.6, HR * 2 + 1.2, HR * 2 + 1.2, function () { helmetBack(); });

    /* global: lean and squash about the feet, then the hop */
    c.translate(14, 34);
    c.rotate(P.lean);
    c.scale(1 + P.sq * 0.7, 1 - P.sq);
    c.translate(-14, -34);
    c.translate(0, P.bob);

    var floss = P.floss;
    var bodyX = floss ? 0 : P.hx;
    var headTx = bodyX * 0.6 + (P.headX || 0), headTy = P.headY || 0;
    function headT() {
      c.translate(14 + headTx, 19.6 + headTy);
      c.rotate(P.tilt || 0);
      c.translate(-14, -19.6);
    }

    /* hand A position (for the balloon string) */
    var shAx = 8.6 + bodyX, shAy = SH_Y;
    var a2A = P.armA + P.bendA;
    var hAx = shAx + Math.sin(P.armA) * UPPER + Math.sin(a2A) * FORE;
    var hAy = shAy + Math.cos(P.armA) * UPPER + Math.cos(a2A) * FORE;

    /* balloon floats behind everything */
    if (cu.food === 'balloon' && !floss) {
      var bx = hAx - 8.5 + P.bal.x, by = hAy - 20 + P.bal.y;
      c.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      c.lineWidth = 0.3;
      c.beginPath(); c.moveTo(hAx, hAy); c.quadraticCurveTo(hAx - 2.5 + P.bal.x * 0.3, hAy - 9, bx, by + 3.0); c.stroke();
      c.save();
      c.translate(bx, by);
      c.rotate(clamp(P.bal.x * 0.05, -0.4, 0.4));
      blit(part('bl' + ck, s, -4.4, -5.6, 8.8, 9.4, function () { balloonBody(cu.suit); }));
      c.restore();
    }

    /* cape, wings or bow behind the body */
    if (cu.gear === 'starCape' || cu.gear === 'wings' || cu.gear === 'backBow') {
      c.save(); c.translate(bodyX, 0);
      if (cu.gear === 'starCape') cape(cu.suit, P.cape, t);
      else if (cu.gear === 'wings') wings(cu.suit, P.cape, t);
      else backBow(cu.suit, P.cape);
      c.restore();
    }

    /* head back: bubble wall, hair behind the head, live tails */
    c.save();
    headT();
    if (!bare) {
      if (cu.helmet === 'catEars') catEars(true);
      else if (cu.helmet === 'planetRing') {
        blit(part('prb' + ck, s, -2.6, -6.4, 33.2, 11.6, function () { planetRingHalf(false); }));
      }
      blit(hkP);
    }
    c.save(); c.translate(P.inner.x * 0.6, P.inner.y * 0.6); blit(hbP); c.restore();
    var H = P.hair;
    if (cu.hairStyle === 'twinTails') twinTails(cu.hair, H);
    else if (cu.hairStyle === 'longBraids') braids(cu.hair, cu.suit, H, part('bd' + ck, s, -2.8, -3.1, 5.6, 6.2, function () { braidBead(cu.hair); }));
    else if (cu.hairStyle === 'buns') bunRibbons(cu.suit, H);
    else if (cu.hairStyle === 'ponytail') ponytail(cu.hair, cu.suit, H);
    else if (cu.hairStyle === 'sideTail') sideTail(cu.hair, H);
    else if (cu.hairStyle === 'ringlets') ringlets(H, part('rc' + ck, s, -3.9, -2.7, 7.8, 5.4, function () { ringletCoil(cu.hair); }));
    else if (cu.hairStyle === 'longHair') longBack(cu.hair, H);
    else if (cu.hairStyle === 'puffs') {
      var pfP = part('pf' + ck, s, -6.8, -6.8, 13.6, 13.6, function () { puffPart(cu.hair); });
      blit(pfP, 14 - 14.6 + H.mx * 0.5, 13.4 + H.my * 0.4);
      blit(pfP, 14 + 14.6 + H.mx * 0.5, 13.4 + H.my * 0.4);
    }
    c.restore();

    /* back gear */
    c.save();
    c.translate(bodyX, 0);
    if (cu.outfit === 'kitty') kittyTail(cu.suit, P.cape, t);
    if (cu.gear === 'jetpack') {
      blit(part('jp' + ck, s, 0.6, 17.6, 26.8, 14.2, jetpackPart));
      c.globalCompositeOperation = 'lighter';
      flame(5.4, 31.0, P.jet, 6.5, t);
      flame(22.6, 31.0, P.jet, 6.5, t + 0.3);
      c.globalCompositeOperation = 'source-over';
    } else if (cu.gear === 'bunnyPack') {
      bunnyEars(P.ears);
      blit(part('bp' + ck, s, 3.4, 15.4, 24.6, 14, bunnyPackPart));
    } else if (cu.gear === 'scarf') {
      scarfTail(cu.flipper, P.cape, t);
    } else if (cu.gear === 'hoverRing') {
      hoverRing(false, t);
    }
    c.restore();

    /* floss: the trailing arm swings behind the body */
    if (floss) flossArm(upP, foP, haP, floss, false);

    /* legs */
    var legs = [[11 + (floss ? floss.beat * 2 : 0), P.legA, P.liftA], [17 + (floss ? floss.beat * 2 : 0), P.legB, P.liftB]];
    for (var li = 0; li < 2; li++) {
      var L = legs[li];
      c.save();
      c.translate(L[0] + bodyX * 0.5, HIP_Y - L[2]);
      c.rotate(-L[1]);
      blit(legP);
      if (cu.shoes === 'rocketBoots' && P.jet > 0.05) {
        c.globalCompositeOperation = 'lighter';
        c.save(); c.translate(-3.4, LEG_SHOE_Y + 0.6); c.rotate(0.5); flame(0, 0, P.jet, 4.5, t + li); c.restore();
        c.globalCompositeOperation = 'source-over';
      }
      c.restore();
    }

    /* outfit */
    c.save();
    c.translate(bodyX, 0);
    if (skP) {
      c.save();
      c.translate(14, 24.8);
      c.transform(1, 0, clamp(P.skirtShear, -0.5, 0.5) * 0.35, 1, 0, 0);
      c.scale(1 + P.skirt * 0.14, 1 - P.skirt * 0.1);
      c.translate(-14, -24.8);
      blit(skP);
      c.restore();
    }
    blit(toP);
    if (cu.gear === 'scarf') scarfFront(cu.flipper, P.cape);
    else if (cu.gear === 'satchel') satchel(cu.flipper, P.cape);
    c.restore();

    /* arms */
    if (floss) {
      flossArm(upP, foP, haP, floss, true);
    } else {
      arm(upP, foP, haP, 8.6 + bodyX, SH_Y, P.armA, P.bendA, cu.food === 'none' ? null : function (hx, hy) {
        if (cu.food === 'balloon') return;
        /* the item rides in her fist and tips a little with her arm */
        c.save();
        c.translate(hx - 0.3, hy + 0.9);
        c.rotate(clamp((P.armA + 0.55) * 0.3, -0.35, 0.35));
        if (cu.food === 'starWand') wand(t);
        else if (cu.food === 'starFlag') starFlag(cu.suit, t);
        else {
          blit(part('fd' + ck, s, -7.4, -12.4, 15.6, 16.2, function () { heldFood(cu.food); }));
          if (cu.food === 'lantern') lanternGlow(t);
        }
        c.restore();
      });
      arm(upP, foP, haP, 19.4 + bodyX, SH_Y, P.armB, P.bendB, null);
    }
    if (cu.gear === 'hoverRing') { c.save(); c.translate(bodyX, 0); hoverRing(true, t); c.restore(); }

    /* head front */
    c.save();
    headT();
    if (coP) blit(coP);
    blit(faP);
    c.save(); c.translate(P.lookX * 1.0, P.lookY * 0.6); blit(feP); c.restore();
    if (fwP) blit(fwP);
    c.save(); c.translate(P.inner.x + P.lookX * 0.4, P.inner.y + P.lookY * 0.25); blit(frP); c.restore();
    if (!bare) {
      helmetFront(cu, P, env, [[frP[0], frP[1] + P.inner.x + P.lookX * 0.4, frP[2] + P.inner.y]]);
      hairPorts(cu.hairStyle);
      var hm = cu.helmet;
      if (hm === 'catEars') catEars(false);
      else if (hm === 'antenna') antenna(P, t);
      else if (hm === 'bunnyEars') bunnyTopEars(P);
      else if (hm === 'planetRing') {
        blit(part('prf' + ck, s, -2.6, -3.4, 33.2, 9.8, function () { planetRingHalf(true); }));
      } else if (hm === 'crown') {
        blit(part('cr' + ck, s, 8.4, -11.4, 12.4, 10.4, crownTop));
      } else if (hm === 'propeller') {
        blit(part('pc' + ck, s, 7.4, -8.6, 13.2, 8.4, function () { propCap(cu.suit); }));
        propBlades(t, P.jet || 0);
      } else if (hm === 'bigBow') {
        bigBowTails(cu.suit, P);
        blit(part('bb' + ck, s, 4.6, -10.6, 18.8, 9.8, function () { bigBowLoops(cu.suit); }));
      }
    }
    c.restore();
  }
  function arm(upP, foP, haP, sx, sy, alpha, bend, held) {
    var a2 = alpha + bend;
    var ex = sx + Math.sin(alpha) * UPPER, ey = sy + Math.cos(alpha) * UPPER;
    var hx = ex + Math.sin(a2) * FORE, hy = ey + Math.cos(a2) * FORE;
    c.save(); c.translate(sx, sy); c.rotate(-alpha); blit(upP); c.restore();
    c.save(); c.translate(ex, ey); c.rotate(-a2); blit(foP); c.restore();
    if (held) {
      held(hx, hy);
      c.save(); c.translate(hx, hy); c.rotate(-a2); blit(haP); c.restore();
    }
  }

  function flossArm(upP, foP, haP, F, front) {
    var b = F.beat;
    var sx = front ? 14 - b * 3.6 : 14 + b * 3.6, sy = front ? 22 : 22.6;
    var al = front ? b * 1.42 + F.ease * 0.3 : b * 1.6 - F.ease * 0.2;
    var st = 1.3;
    c.save();
    c.translate(sx, sy);
    c.rotate(-al);
    c.scale(1, st);
    blit(upP);
    c.translate(0, UPPER);
    c.scale(1, 1 / st);
    blit(foP);
    c.restore();
  }

  /* P: rig (Rig) or legacy params; mirror; env (helmet reflections). */
  function paint(ctx, sx, sy, rawCust, P) {
    P = P || {};
    var cu = readCust(rawCust);
    var pose = P.pose || (P.rig ? P.rig.pose : null) || STILL;
    var prevC = c, prevLX = LX;
    c = ctx;
    LX = P.mirror ? 1 : -1;
    c.save();
    c.translate(sx, sy);
    c.lineCap = 'round';
    var m = c.getTransform();
    var s = Math.sqrt(m.c * m.c + m.d * m.d);
    s = Math.min(24, Math.pow(2, Math.ceil(Math.log(Math.max(s, 0.5)) / Math.LN2 * 4) / 4));
    drawFigure(cu, pose, P.env || DEFAULT_ENV, s, P.bare);
    c.restore();
    c = prevC;
    LX = prevLX;
  }
  var STILL = neutralPose();

  /* Regolith dust kicked up by her steps and her turbo speed streaks,
     in world coordinates. */
  function drawDust(ctx, rig, camX, camY, col) {
    if (!rig) return;
    if (rig.streaks.length) {
      ctx.save();
      ctx.lineCap = 'round';
      for (var j = 0; j < rig.streaks.length; j++) {
        var st = rig.streaks[j];
        var ks = st.age / st.life, ln = st.len * (1 - 0.5 * ks);
        var sx0 = st.x - camX, sy0 = st.y - camY;
        ctx.strokeStyle = rgba('#ffffff', ((1 - ks) * 0.5 * st.a).toFixed(3));
        ctx.lineWidth = 1.5 * st.w * (1 - 0.4 * ks);
        ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(sx0 - st.ux * ln, sy0 - st.uy * ln); ctx.stroke();
      }
      ctx.restore();
    }
    if (!rig.puffs.length) return;
    var base = col || '#d8ccf4';
    for (var i = 0; i < rig.puffs.length; i++) {
      var p = rig.puffs[i];
      var k = p.age / p.life;
      var r = p.r0 + (p.r1 - p.r0) * Math.sqrt(k);
      var a = (1 - k) * (1 - k) * 0.5;
      var x = p.x - camX, y = p.y - camY;
      ctx.fillStyle = rgba(base, a.toFixed(3));
      ctx.beginPath(); ctx.ellipse(x, y - r * 0.4, r, r * 0.62, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba('#ffffff', (a * 0.5).toFixed(3));
      ctx.beginPath(); ctx.ellipse(x - r * 0.25, y - r * 0.6, r * 0.45, r * 0.3, 0, 0, TAU); ctx.fill();
    }
  }

  /* Floss dance (pause / victory) as a pose of the same puppet. */
  var flossPose = neutralPose();
  function floss(ctx, sx, sy, cust, phase) {
    var beat = Math.tanh(Math.sin(phase) * 3.2);
    var lagB = Math.tanh(Math.sin(phase - 0.8) * 2.4);
    var P = flossPose;
    P.floss = { beat: beat, ease: Math.sin(phase * 2) * 0.3 };
    P.eyes = 'happy'; P.mouth = 'happy';
    P.hair.mx = -lagB * 1.2; P.hair.tx = -lagB * 2.8; P.hair.my = 0; P.hair.ty = -Math.abs(lagB) * 0.8;
    P.inner.x = -lagB * 0.4;
    P.skirtShear = -lagB * 0.6; P.skirt = Math.abs(beat) * 0.3;
    P.cape.x = -lagB * 2.4; P.ears.x = -lagB * 1.2; P.ant.x = -lagB * 1.6;
    P.headY = Math.sin(phase * 2) * 0.3;
    P.tilt = beat * 0.06;
    P.lean = beat * 0.07;
    P.bob = -Math.abs(Math.sin(phase)) * 0.6;
    P.time = phase / 3;
    P.glint = beat * 0.1;
    paint(ctx, sx, sy, cust, { pose: P });
  }

  /* Accessory and held-item icons for the customise screen, painted by
     the same code that dresses her, centred on (0, 0) about 24 units. */
  var HELD_AT = { lantern: [3.0, 4.6], starFlag: [3.8, 4.2], plushie: [2.5, 4.0], starWand: [2.0, 3.6],
                  taiyaki: [-0.3, 4.0], dango: [0.5, 4.2], parfait: [-0.4, 5.2], lollipop: [0, 4.2] };
  function icon(ctx, kind, id, rawCust, t) {
    var cu = readCust(rawCust);
    var prevC = c, prevLX = LX;
    c = ctx; LX = -1;
    GT = glassTones(cu.glass);
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    t = t || 0;
    var still = { x: 0, y: 0 };
    if (kind === 'held') {
      if (id === 'balloon') {
        c.translate(0, -1); c.scale(2.2, 2.2); balloonBody(cu.suit);
        c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 0.25; c.beginPath(); c.moveTo(0, 3); c.quadraticCurveTo(-1, 5, 0.4, 7); c.stroke();
      } else {
        var at = HELD_AT[id] || [0, 3.6];
        c.scale(1.8, 1.8);
        c.translate(at[0], at[1]);
        if (id === 'starWand') wand(t);
        else if (id === 'starFlag') starFlag(cu.suit, t);
        else {
          heldFood(id);
          if (id === 'lantern') lanternGlow(t);
        }
      }
    } else if (kind === 'shoe') {
      /* one boot in profile, from the knee down */
      c.scale(6.9, 6.9);
      c.translate(0.5, -5.5);
      c.save();
      c.beginPath(); c.rect(-8, 2.6, 16, 8); c.clip();
      legPart(cu);
      c.restore();
    } else if (kind === 'gear') {
      if (id === 'jetpack') { c.scale(1.2, 1.2); c.translate(-14, -24.4); jetpackPart(); c.globalCompositeOperation = 'lighter'; flame(5.4, 31, 0.8, 5, t); flame(22.6, 31, 0.8, 5, t + 0.3); }
      else if (id === 'bunnyPack') {
        /* off her back the pack hangs under the bunny's head */
        c.scale(2.0, 2.0); c.translate(-22.6, -20.6);
        c.save(); c.beginPath(); c.rect(19, 19.6, 7.4, 10); c.clip(); c.translate(16, 0); bunnyPackPart(); c.restore();
        bunnyEars(still);
        c.save(); c.beginPath(); c.rect(18, 10, 10, 12.6); c.clip(); bunnyPackPart(); c.restore();
      }
      else if (id === 'starCape') { c.scale(1.3, 1.3); c.translate(-14, -26.5); cape(cu.suit, still, t); gold(ellipsePath(14, 20.8, 6.2, 1.1), { d: 0.4, lw: 0.35 }); gem(14, 21.0, 1.0, '#ff4a8a'); }
      else if (id === 'scarf') { c.scale(2.2, 2.2); c.translate(-14, -23.5); scarfTail(cu.flipper, { x: 2.6, y: -1.2 }, t); scarfFront(cu.flipper, still); }
      else if (id === 'starBadge') { c.scale(3.2, 3.2); c.translate(0, -0.8); badge(0, 0, 1); }
      else if (id === 'wings') { c.scale(0.86, 0.86); c.translate(-14, -21.4); wings(cu.suit, still, 0.3); }
      else if (id === 'backBow') {
        c.scale(0.95, 0.95); c.translate(-14, -25.4); backBow(cu.suit, still);
        shape(roundRectPath(12.2, 22.4, 3.6, 4.0, 1.3), pal(cu.suit, false).s1, { d: 0.5, lw: 0.42, rim: false });
      }
      else if (id === 'satchel') { c.scale(2.3, 2.3); c.translate(-12.6, -26.0); satchel(cu.flipper, still); }
      else if (id === 'hoverRing') { c.scale(0.98, 0.98); c.translate(-14, -26.9); hoverRing(false, t); hoverRing(true, t); }
    }
    c.restore();
    c = prevC; LX = prevLX;
  }

  Game.momoko = {
    paint: paint,
    floss: floss,
    icon: icon,
    drawDust: drawDust,
    createRig: function (seed) { return new Rig(seed); },
    variants: { hairStyle: HAIR_STYLES, outfit: OUTFITS, shoes: SHOES, helmet: HELMETS, gear: GEAR, food: HELD, face: FACES },
    readCust: readCust,
    /* Borrow the cel shader for a companion painted in the same light:
       S = shader(ctx, mirror); S.shape(S.ellipse(...), col, opts); S.done(). */
    shader: function (ctx, mirror) {
      var prevC = c, prevLX = LX;
      c = ctx;
      LX = mirror ? 1 : -1;
      return {
        shape: shape,
        ellipse: ellipsePath,
        limb: limbPath,
        lock: lockPath,
        star: starPath,
        rect: roundRectPath,
        cloud: cloudPath,
        /* the shadow tone of a colour */
        shade: function (col) { return pal(col, false).s1; },
        done: function () { c = prevC; LX = prevLX; },
      };
    },
  };
})();
