/* momoko.js – the hero painter.

   Momoko is painted in a 28×34 box (feet at the bottom edge, helmet
   centred over the head) so every caller can keep placing her the way
   it always has. Each shape gets the same cel treatment: a warm
   terminator band and a cool core on the side away from the key light,
   a lit edge toward it, a thin cyan rim of sky light along the shadow
   edge, and an outline in a deep shade of its own hue. The key light
   comes from the upper left in the world; callers that mirror the
   canvas pass opts.mirror so the light stays put when she turns. */
(function () {
  'use strict';
  window.Game = window.Game || {};

  var c = null;     /* context being painted */
  var LX = -1;      /* x direction toward the key light, in local space */

  /* ---------- Colour helpers ---------- */
  function norm(h) {
    if (typeof h !== 'string' || h.charAt(0) !== '#') return '#e06088';
    if (h.length === 4) return '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    return h.slice(0, 7);
  }
  function rgb(h) { var n = parseInt(h.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hex(r, g, b) {
    return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);
  }
  function mix(a, b, k) {
    var x = rgb(a), y = rgb(b);
    return hex(x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k);
  }

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

  function ellipsePath(x, y, rx, ry, rot) {
    return function () { c.moveTo(x + rx, y); c.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); };
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

  function fillStar(cx, cy, r) {
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var ang = -Math.PI / 2 + i * Math.PI / 5;
      var rr = i % 2 === 0 ? r : r * 0.42;
      if (i === 0) c.moveTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
      else c.lineTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
    }
    c.closePath();
    c.fill();
  }

  /* ---------- Helmet ---------- */
  var HX = 14, HY = 8, HR = 11.4;

  function helmetBack() {
    c.beginPath();
    c.arc(HX, HY, HR, 0, Math.PI * 2);
    c.fillStyle = 'rgba(150, 215, 255, 0.10)';
    c.fill();
  }

  function helmetCollar() {
    var path = ellipsePath(14, 20.3, 6.9, 1.35);
    c.beginPath(); path();
    var g = c.createLinearGradient(0, 18.9, 0, 21.7);
    g.addColorStop(0, '#f2ffff');
    g.addColorStop(0.45, '#8fdcf0');
    g.addColorStop(1, '#2a6488');
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = '#1e3a64';
    c.lineWidth = 0.45;
    c.stroke();
    /* status lights on the ring */
    c.fillStyle = '#44ffff';
    c.beginPath(); c.arc(9.4, 20.6, 0.55, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ff66cc';
    c.beginPath(); c.arc(18.6, 20.6, 0.55, 0, Math.PI * 2); c.fill();
  }

  function helmetFront() {
    c.save();
    c.translate(HX, HY);
    /* Fresnel: the glass thickens toward the edge */
    var fg = c.createRadialGradient(LX * 1.5, -1.5, HR * 0.55, 0, 0, HR);
    fg.addColorStop(0, 'rgba(190, 240, 255, 0)');
    fg.addColorStop(0.75, 'rgba(190, 240, 255, 0.08)');
    fg.addColorStop(1, 'rgba(200, 245, 255, 0.34)');
    c.fillStyle = fg;
    c.beginPath(); c.arc(0, 0, HR, 0, Math.PI * 2); c.fill();
    if (LX > 0) c.scale(-1, 1);
    /* Window highlight: a curved slab of sky light on the lit shoulder */
    c.fillStyle = 'rgba(255, 255, 255, 0.55)';
    c.beginPath();
    c.arc(0, 0, HR - 1.2, Math.PI * 1.06, Math.PI * 1.42);
    c.arc(0, 0, HR - 3.0, Math.PI * 1.40, Math.PI * 1.10, true);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(255, 255, 255, 0.9)';
    c.beginPath(); c.ellipse(-3.2, -8.0, 1.1, 0.7, -0.5, 0, Math.PI * 2); c.fill();
    /* Warm bounce from the ground on the far lower edge */
    c.fillStyle = 'rgba(255, 176, 224, 0.28)';
    c.beginPath();
    c.arc(0, 0, HR - 1.0, Math.PI * 0.08, Math.PI * 0.42);
    c.arc(0, 0, HR - 2.2, Math.PI * 0.40, Math.PI * 0.10, true);
    c.closePath();
    c.fill();
    c.restore();
    /* Rim: bright on the lit side, deep teal on the shadow side */
    var rg = c.createLinearGradient(HX + LX * HR, HY - HR, HX - LX * HR, HY + HR);
    rg.addColorStop(0, '#f0ffff');
    rg.addColorStop(0.5, '#5ee8ff');
    rg.addColorStop(1, '#2a88b8');
    c.strokeStyle = rg;
    c.lineWidth = 0.8;
    c.beginPath(); c.arc(HX, HY, HR, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(20, 50, 96, 0.55)';
    c.lineWidth = 0.35;
    c.beginPath(); c.arc(HX, HY, HR + 0.55, 0, Math.PI * 2); c.stroke();
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

  function hairGloss(hairC) {
    var p = pal(hairC, false);
    c.save();
    c.beginPath(); frontHairPath(); c.clip();
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
    c.restore();
    /* strand lines from the crown into the fringe */
    c.strokeStyle = p.s2;
    c.lineWidth = 0.32;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(13.2, 0.6); c.quadraticCurveTo(10.6, 3.5, 10.6, 7.0);
    c.moveTo(15.0, 0.6); c.quadraticCurveTo(17.6, 3.5, 17.7, 6.9);
    c.moveTo(14.2, 2.6); c.lineTo(14.4, 6.4);
    c.moveTo(7.2, 6.0); c.quadraticCurveTo(5.6, 10, 5.9, 14.5);
    c.moveTo(20.8, 6.0); c.quadraticCurveTo(22.4, 10, 22.1, 14.5);
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

  /* Twin tails: three locks per side that trail behind her motion. */
  function twinTails(hairC, sway, lift) {
    var p = pal(hairC, false);
    for (var side = -1; side <= 1; side += 2) {
      var sw = sway + side * 0.3;
      var locks = [
        [9.2, 11.2, 14.4, 18.2, 12.0, 27.6 + lift, 2.1, 0.8],
        [10.6, 10.4, 18.6, 15.2, 16.6, 25.4 + lift * 0.8, 1.7, 1.2],
        [9.9, 10.0, 17.8, 17.0, 13.6, 30.8 + lift, 3.2, 1.0],
      ];
      for (var i = 0; i < locks.length; i++) {
        var L = locks[i];
        var x0 = 14 + side * L[0], cx = 14 + side * L[2], x1 = 14 + side * L[4] + sw * L[7];
        var path = lockPath(x0, L[1], cx + sw * 0.4, L[3], x1, L[5], L[6]);
        shape(path, i === 0 ? p.s1 : hairC, { d: 1.1, lw: 0.5 });
        if (i === 2) lockShine(x0, L[1], cx + sw * 0.4, L[3], x1, L[5], p.hi, 0.12, 0.55, 0.9);
      }
    }
  }

  function braids(hairC, suitC, sway, lift) {
    var p = pal(hairC, false);
    for (var side = -1; side <= 1; side += 2) {
      var x0 = 14 + side * 10.2, y0 = 10.2;
      for (var b = 0; b < 6; b++) {
        var k = b / 5;
        var bx = x0 + side * (1.4 * Math.sin(k * 2.2)) + sway * k * 1.2 + (b % 2 ? 0.6 : -0.6) * side;
        var by = y0 + b * 4.1 + lift * k;
        shape(ellipsePath(bx, by, 2.25, 2.6, (b % 2 ? 0.35 : -0.35) * side), hairC, { d: 1.0, lw: 0.45 });
        c.strokeStyle = p.s2;
        c.lineWidth = 0.3;
        c.beginPath();
        c.moveTo(bx - 1.2, by + 1.2); c.quadraticCurveTo(bx, by + 0.4, bx + 1.2, by + 1.6);
        c.stroke();
      }
      /* ribbon tie at the end */
      var ex = x0 + side * 1.4 * Math.sin(2.2) + sway * 1.3, ey = y0 + 24.4 + lift;
      shape(ellipsePath(ex - 1.1, ey, 1.3, 0.9, -0.4), suitC, { d: 0.6, lw: 0.4 });
      shape(ellipsePath(ex + 1.1, ey, 1.3, 0.9, 0.4), suitC, { d: 0.6, lw: 0.4 });
    }
  }

  function buns(hairC, suitC, sway, lift) {
    var p = pal(suitC, false);
    /* ribbon tails first, so the buns sit over their knots */
    for (var side = -1; side <= 1; side += 2) {
      var rx0 = 14 + side * 8.6, rx1 = 14 + side * 12.2 + sway;
      shape(lockPath(rx0, 5.5, 14 + side * 13.2, 13, rx1, 24 + lift, 1.4), suitC, { d: 0.8, lw: 0.45 });
      lockShine(rx0, 5.5, 14 + side * 13.2, 13, rx1, 24 + lift, p.hi, 0.1, 0.5, 0.5);
    }
    var hp = pal(hairC, false);
    for (side = -1; side <= 1; side += 2) {
      var bx = 14 + side * 8.4, by = 2.6;
      shape(circlePath(bx, by, 4.1), hairC, { d: 1.6, lw: 0.5 });
      c.strokeStyle = hp.s1;
      c.lineWidth = 0.4;
      c.beginPath(); c.arc(bx + 0.3, by + 0.3, 2.2, Math.PI * 0.1, Math.PI * 1.45); c.stroke();
      c.fillStyle = 'rgba(255, 255, 255, 0.55)';
      c.beginPath(); c.ellipse(bx + LX * 1.6, by - 1.9, 1.1, 0.6, LX * 0.5, 0, Math.PI * 2); c.fill();
    }
  }

  function bow(bx, by, suitC) {
    shape(ellipsePath(bx - 1.7, by, 1.75, 1.35, -0.35), suitC, { d: 0.7, lw: 0.4 });
    shape(ellipsePath(bx + 1.7, by, 1.75, 1.35, 0.35), suitC, { d: 0.7, lw: 0.4 });
    shape(circlePath(bx, by, 0.8), pal(suitC, false).s1, { d: 0.4, lw: 0.35, rim: false });
  }

  /* ---------- Face ---------- */
  function facePath() {
    c.moveTo(6, 10.5);
    c.bezierCurveTo(5.6, 15.4, 9.3, 19.6, 14, 19.6);
    c.bezierCurveTo(18.7, 19.6, 22.4, 15.4, 22, 10.5);
    c.bezierCurveTo(21.6, 5.0, 6.4, 5.0, 6, 10.5);
    c.closePath();
  }

  var IRIS_TOP = '#3a1230', IRIS_MID = '#9a3c68', IRIS_BOT = '#f39ac0';
  function eye(ex, ey, side, closed) {
    var rx = 2.7, ry = 3.3;
    c.lineCap = 'round';
    if (closed) {
      /* happy arc */
      c.strokeStyle = '#2a0c24';
      c.lineWidth = 0.9;
      c.beginPath();
      c.arc(ex, ey + 1.2, 2.2, Math.PI * 1.12, Math.PI * 1.88);
      c.stroke();
      return;
    }
    c.save();
    c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2);
    c.fillStyle = '#fffafd';
    c.fill();
    c.clip();
    var ig = c.createLinearGradient(0, ey - ry, 0, ey + ry);
    ig.addColorStop(0, IRIS_TOP);
    ig.addColorStop(0.5, IRIS_MID);
    ig.addColorStop(1, IRIS_BOT);
    c.fillStyle = ig;
    c.beginPath(); c.ellipse(ex, ey + 0.35, rx * 0.84, ry * 0.86, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#2a0c24';
    c.lineWidth = 0.3;
    c.stroke();
    c.fillStyle = '#22081c';
    c.beginPath(); c.ellipse(ex, ey + 0.55, rx * 0.38, ry * 0.42, 0, 0, Math.PI * 2); c.fill();
    /* upper-lid shadow across the white and iris */
    c.fillStyle = 'rgba(70, 20, 70, 0.32)';
    c.beginPath(); c.ellipse(ex, ey - ry * 0.72, rx * 1.2, ry * 0.55, 0, 0, Math.PI * 2); c.fill();
    /* catchlights: her star on the lit side, a dot opposite */
    c.fillStyle = '#ffffff';
    fillStar(ex + LX * rx * 0.3, ey - ry * 0.28, 1.15);
    c.beginPath(); c.arc(ex - LX * rx * 0.36, ey + ry * 0.42, 0.42, 0, Math.PI * 2); c.fill();
    c.restore();
    /* upper lash line, heavy at the outer corner, with flicks */
    c.strokeStyle = '#2a0c24';
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

  function face(skinC, hairC, expr, blink) {
    var sp = pal(skinC, true);
    shape(facePath, skinC, { warm: true, d: 1.7, soft: true, lw: 0.55 });
    c.save();
    c.beginPath(); facePath(); c.clip();
    /* fringe casts a soft shadow onto the forehead */
    c.translate(-LX * 0.5, 1.2);
    c.beginPath(); frontHairPath();
    c.fillStyle = sp.s1;
    c.globalAlpha *= 0.6;
    c.fill();
    c.restore();
    /* blush */
    c.fillStyle = 'rgba(255, 128, 168, 0.45)';
    c.beginPath(); c.ellipse(7.9, 16.0, 2.0, 1.1, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(20.1, 16.0, 2.0, 1.1, 0, 0, Math.PI * 2); c.fill();
    eye(10.2, 13.3, -1, blink || expr === 'happy');
    eye(17.8, 13.3, 1, blink || expr === 'happy');
    /* nose and cheek glint */
    c.fillStyle = sp.s1;
    c.beginPath(); c.ellipse(14 - LX * 0.4, 15.9, 0.55, 0.4, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255, 255, 255, 0.6)';
    c.beginPath(); c.arc(14 + LX * 6.6, 15.3, 0.45, 0, Math.PI * 2); c.fill();
    /* mouth */
    if (expr === 'happy') {
      c.fillStyle = '#9c2c48';
      c.beginPath(); c.moveTo(12.0, 16.6); c.quadraticCurveTo(14, 19.6, 16.0, 16.6); c.closePath(); c.fill();
      c.fillStyle = '#ffffff';
      c.fillRect(12.5, 16.6, 3, 0.6);
      c.fillStyle = '#ff8aa4';
      c.beginPath(); c.ellipse(14, 18.0, 0.9, 0.5, 0, 0, Math.PI * 2); c.fill();
    } else {
      c.fillStyle = '#a8344e';
      c.beginPath(); c.moveTo(12.9, 16.9); c.quadraticCurveTo(14, 18.5, 15.1, 16.9); c.closePath(); c.fill();
      c.fillStyle = '#ff8aa4';
      c.beginPath(); c.ellipse(14, 17.6, 0.55, 0.3, 0, 0, Math.PI * 2); c.fill();
    }
  }

  /* ---------- Body ---------- */
  function isDress(o) { return o === 'frillyDress' || o === 'sailorDress' || o === 'starDress'; }
  function isSuit(o) { return o === 'frillyBikini' || o === 'sailorSwimsuit' || o === 'onePiece'; }

  function legColor(outfit, suitC) {
    if (isDress(outfit)) return '#ffe8ee';
    if (isSuit(outfit)) return suitC;
    return '#3a2a50';
  }

  function shoe(style, col, cx, cy) {
    var p = pal(col, false);
    if (style === 'flipper') {
      shape(function () {
        c.moveTo(cx - 2.2, cy - 0.9);
        c.quadraticCurveTo(cx + 1.6, cy - 1.8, cx + 5.0, cy - 0.4);
        c.quadraticCurveTo(cx + 5.6, cy + 0.6, cx + 4.6, cy + 1.3);
        c.quadraticCurveTo(cx + 0.8, cy + 2.0, cx - 2.4, cy + 1.2);
        c.quadraticCurveTo(cx - 3.2, cy + 0.1, cx - 2.2, cy - 0.9);
        c.closePath();
      }, col, { d: 0.9, lw: 0.45 });
      c.strokeStyle = p.s2;
      c.lineWidth = 0.3;
      c.beginPath();
      c.moveTo(cx + 0.6, cy - 0.4); c.lineTo(cx + 4.2, cy + 0.0);
      c.moveTo(cx + 0.6, cy + 0.6); c.lineTo(cx + 4.4, cy + 0.9);
      c.stroke();
      return;
    }
    var boxy = style === 'sneaker';
    var path = function () {
      c.moveTo(cx - 2.8, cy + 1.1);
      c.quadraticCurveTo(cx - 3.2, cy - 1.7, cx - 0.4, cy - 1.8);
      c.quadraticCurveTo(cx + (boxy ? 3.8 : 3.4), cy - 1.5, cx + (boxy ? 3.7 : 3.3), cy + 1.1);
      c.closePath();
    };
    shape(path, col, { d: 0.9, lw: 0.45 });
    if (boxy) {
      c.save();
      c.beginPath(); path(); c.clip();
      c.fillStyle = '#ffffff';
      c.fillRect(cx - 4, cy + 0.1, 8, 1.2);
      c.fillStyle = '#c8b8e0';
      c.fillRect(cx - 4, cy + 0.85, 8, 0.4);
      c.restore();
      c.strokeStyle = '#ffffff';
      c.lineWidth = 0.35;
      c.beginPath();
      c.moveTo(cx - 0.6, cy - 1.4); c.lineTo(cx + 0.6, cy - 0.7);
      c.moveTo(cx + 0.4, cy - 1.5); c.lineTo(cx + 1.6, cy - 0.8);
      c.stroke();
    } else {
      c.strokeStyle = p.s2;
      c.lineWidth = 0.55;
      c.beginPath(); c.moveTo(cx - 2.4, cy - 0.9); c.lineTo(cx + 1.8, cy - 1.0); c.stroke();
      c.fillStyle = '#fff4aa';
      c.beginPath(); c.arc(cx + 1.6, cy - 1.0, 0.45, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255, 255, 255, 0.75)';
      c.beginPath(); c.ellipse(cx + 1.6, cy - 0.3, 0.9, 0.35, 0, 0, Math.PI * 2); c.fill();
    }
  }

  function legsAndShoes(cust, outfit, kick, hip) {
    var lc = legColor(outfit, cust.suit);
    var top = isDress(outfit) ? 26 : 27;
    shape(limbPath(11 + hip, top, 11 + hip - kick * 0.12, 32.4 + kick * 0.3, 1.75, 1.5), lc, { d: 0.9, lw: 0.45 });
    shape(limbPath(17 + hip, top, 17 + hip + kick * 0.12, 32.4 - kick * 0.3, 1.75, 1.5), lc, { d: 0.9, lw: 0.45 });
    shoe(cust.shoes, cust.flipper, 11 + hip - kick * 0.12, 33.2 + kick * 0.3);
    shoe(cust.shoes, cust.flipper, 17 + hip + kick * 0.12, 33.2 - kick * 0.3);
  }

  function heartGem(hcx, hcy) {
    c.fillStyle = '#ff4a72';
    c.beginPath();
    c.arc(hcx - 0.6, hcy - 0.3, 0.65, 0, Math.PI * 2);
    c.arc(hcx + 0.6, hcy - 0.3, 0.65, 0, Math.PI * 2);
    c.moveTo(hcx - 1.15, hcy);
    c.lineTo(hcx, hcy + 1.3);
    c.lineTo(hcx + 1.15, hcy);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(255, 255, 255, 0.8)';
    c.beginPath(); c.arc(hcx - 0.6, hcy - 0.5, 0.25, 0, Math.PI * 2); c.fill();
  }

  function dress(outfit, suitC) {
    var p = pal(suitC, false);
    /* petticoat frill peeking under the hem */
    if (outfit === 'frillyDress') {
      c.fillStyle = '#ffffff';
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
    var skirt = function () {
      c.moveTo(8.6, 24.8);
      c.lineTo(19.4, 24.8);
      c.quadraticCurveTo(21.6, 27.2, 23.4, 30.3);
      c.quadraticCurveTo(20.8, 31.2, 18.6, 30.4);
      c.quadraticCurveTo(16.2, 31.2, 14.0, 30.4);
      c.quadraticCurveTo(11.8, 31.2, 9.4, 30.4);
      c.quadraticCurveTo(7.0, 31.2, 4.6, 30.3);
      c.quadraticCurveTo(6.4, 27.2, 8.6, 24.8);
      c.closePath();
    };
    shape(skirt, suitC, { d: 1.9 });
    /* folds */
    c.strokeStyle = p.s1;
    c.lineWidth = 0.4;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(12.2, 25.6); c.quadraticCurveTo(11.4, 28, 10.8, 30.2);
    c.moveTo(16.0, 25.6); c.quadraticCurveTo(16.8, 28, 17.2, 30.2);
    c.stroke();
    c.strokeStyle = p.hi;
    c.lineWidth = 0.35;
    c.beginPath();
    c.moveTo(13.6, 25.8); c.quadraticCurveTo(13.4, 28, 13.2, 29.8);
    c.stroke();
    /* hem trim */
    if (outfit === 'starDress') {
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
    /* bodice */
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
      c.fillStyle = '#ff4a72';
      c.beginPath(); c.moveTo(13.2, 23.4); c.lineTo(14.8, 23.4); c.lineTo(14, 24.6); c.closePath(); c.fill();
    } else {
      shape(ellipsePath(12.4, 21.4, 1.5, 1.15, -0.3), '#ffd24a', { d: 0.6, lw: 0.35 });
      shape(ellipsePath(15.6, 21.4, 1.5, 1.15, 0.3), '#ffd24a', { d: 0.6, lw: 0.35 });
      c.fillStyle = '#c88a1a';
      c.beginPath(); c.arc(14, 21.4, 0.7, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff4a8';
      fillStar(14, 23.6, 1.4);
    }
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

  function suit(outfit, suitC) {
    var p = pal(suitC, false);
    var dark = mix(suitC, '#000000', 0.3);
    if (outfit !== 'onePiece') {
      /* oxygen tanks peeking out either side */
      shape(roundRectPath(5.6, 20.6, 2.8, 8.6, 1.2), mix(suitC, '#a8b8d0', 0.45), { d: 0.8, lw: 0.4 });
      shape(roundRectPath(19.6, 20.6, 2.8, 8.6, 1.2), mix(suitC, '#a8b8d0', 0.45), { d: 0.8, lw: 0.4 });
    }
    var torso = outfit === 'onePiece' ? roundRectPath(8.4, 19.9, 11.2, 10.4, 2.0)
              : outfit === 'sailorSwimsuit' ? roundRectPath(7.8, 20.2, 12.4, 10.4, 2.4)
              : roundRectPath(7.4, 20.2, 13.2, 10.4, 2.8);
    shape(torso, suitC, { d: 1.6 });
    if (outfit === 'frillyBikini') {
      c.fillStyle = dark;
      c.fillRect(7.6, 26.6, 12.8, 1.5);
      shape(roundRectPath(10, 21.4, 8, 4.4, 1.0), mix(suitC, '#ffffff', 0.35), { d: 0.7, lw: 0.35 });
      c.fillStyle = '#fff4a8';
      fillStar(12, 23.4, 1);
      fillStar(16, 23.4, 1);
      fillStar(14, 25.2, 0.9);
      c.fillStyle = '#ffd24a';
      c.fillRect(13.2, 26.5, 1.6, 1.7);
    } else if (outfit === 'sailorSwimsuit') {
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(9.2, 20.4); c.lineTo(14, 23.6); c.lineTo(18.8, 20.4);
      c.closePath();
      c.fill();
      c.strokeStyle = p.ink;
      c.lineWidth = 0.3;
      c.stroke();
      shape(roundRectPath(11, 24.1, 6, 3.3, 0.6), '#262640', { d: 0.5, lw: 0.3, rim: false });
      c.fillStyle = '#44ff88'; c.fillRect(12, 24.9, 1.1, 1.1);
      c.fillStyle = '#ff4466'; c.fillRect(13.5, 24.9, 1.1, 1.1);
      c.fillStyle = '#ffd24a'; c.fillRect(15, 24.9, 1.1, 1.1);
      c.fillStyle = dark;
      c.fillRect(8, 28.2, 12, 1.4);
      c.fillStyle = '#ffd24a';
      c.fillRect(13, 28.0, 2, 1.8);
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
    }
    /* soft bevel along the suit's lit shoulder */
    c.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    c.lineWidth = 0.4;
    c.beginPath();
    c.moveTo(14 + LX * 4.2, 21.0); c.quadraticCurveTo(14 + LX * 5.6, 22, 14 + LX * 5.6, 25);
    c.stroke();
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

  /* Arm from the shoulder to the hand; suits get a full sleeve and a
     glove, dresses a puff sleeve over bare skin. */
  function arm(cust, outfit, x0, y0, x1, y1) {
    var skinC = cust.skin, suitC = cust.suit;
    var suited = isSuit(outfit);
    shape(limbPath(x0, y0, x1, y1, 1.55, 1.25), suited ? suitC : skinC, { warm: !suited, d: 0.9, lw: 0.45 });
    if (!suited) {
      shape(circlePath(x0 + (x1 - x0) * 0.12, y0 + 0.2, 2.0), suitC, { d: 0.9, lw: 0.45 });
    }
  }
  function hand(cust, outfit, x, y) {
    var suited = isSuit(outfit);
    var col = suited ? '#f4f6ff' : cust.skin;
    shape(circlePath(x, y, 1.45), col, { warm: !suited, d: 0.7, lw: 0.45 });
    if (suited) {
      c.strokeStyle = '#44ffff';
      c.lineWidth = 0.55;
      c.beginPath(); c.arc(x, y, 1.45, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
    }
  }

  /* ---------- Held food (left hand) ---------- */
  function heldFood(food, fx, fy) {
    if (food === 'iceCream') {
      c.fillStyle = '#e0b070';
      c.beginPath(); c.moveTo(fx - 1.5, fy + 2); c.lineTo(fx + 1.5, fy + 2); c.lineTo(fx, fy + 6); c.closePath(); c.fill();
      c.strokeStyle = '#9a7048'; c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(fx - 1, fy + 2.5); c.lineTo(fx + 0.8, fy + 5); c.stroke();
      shape(circlePath(fx, fy + 1, 2.2), '#ffc8d4', { d: 0.8, lw: 0.35 });
      c.fillStyle = '#ff3355';
      c.beginPath(); c.arc(fx, fy - 1.3, 0.7, 0, Math.PI * 2); c.fill();
    } else if (food === 'onigiri') {
      c.fillStyle = '#ffffff';
      c.beginPath(); c.moveTo(fx, fy - 1.5); c.lineTo(fx - 2.4, fy + 2.5); c.lineTo(fx + 2.4, fy + 2.5); c.closePath(); c.fill();
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
      c.fillStyle = '#f2d8a4';
      c.beginPath(); c.moveTo(fx - 2, fy - 2); c.lineTo(fx + 2, fy - 2); c.lineTo(fx, fy + 4); c.closePath(); c.fill();
      c.fillStyle = '#ffdceb';
      c.beginPath(); c.arc(fx, fy - 1.8, 1.4, Math.PI, 0); c.fill();
      c.fillStyle = '#dd3355';
      c.beginPath(); c.arc(fx - 0.6, fy - 2.2, 0.55, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#2a5d2a';
      c.fillRect(fx - 0.8, fy - 2.7, 0.4, 0.4);
    } else if (food === 'taiyaki') {
      c.fillStyle = '#cc8844';
      c.beginPath(); c.ellipse(fx, fy + 1, 3, 1.8, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(fx + 2.5, fy + 1); c.lineTo(fx + 4, fy - 0.5); c.lineTo(fx + 4, fy + 2.5); c.closePath(); c.fill();
      c.fillStyle = '#e0a868';
      c.beginPath(); c.ellipse(fx - 0.5, fy + 0.3, 1.6, 0.5, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#1a0c14';
      c.beginPath(); c.arc(fx - 1.8, fy + 0.5, 0.3, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#8a5520'; c.lineWidth = 0.3;
      c.beginPath(); c.moveTo(fx - 1, fy + 0.2); c.lineTo(fx + 1.5, fy + 0.2); c.stroke();
    } else if (food === 'parfait') {
      c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 0.4;
      c.strokeRect(fx - 1.6, fy - 1.5, 3.2, 5);
      c.fillStyle = '#6b3a1a'; c.fillRect(fx - 1.4, fy + 2, 2.8, 1.3);
      c.fillStyle = '#fff4dc'; c.fillRect(fx - 1.4, fy + 0.7, 2.8, 1.3);
      c.fillStyle = '#ff6688'; c.fillRect(fx - 1.4, fy - 0.6, 2.8, 1.3);
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(fx, fy - 1.8, 1.3, Math.PI, 0); c.fill();
      c.beginPath(); c.arc(fx - 0.5, fy - 2.3, 0.7, Math.PI, 0); c.fill();
      c.beginPath(); c.arc(fx + 0.3, fy - 2.6, 0.5, Math.PI, 0); c.fill();
      c.fillStyle = '#dd2244';
      c.beginPath(); c.arc(fx + 0.6, fy - 2.9, 0.5, 0, Math.PI * 2); c.fill();
    } else if (food === 'macaron') {
      c.fillStyle = '#ffbadb';
      c.beginPath(); c.ellipse(fx, fy - 0.8, 2.4, 1.1, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff'; c.fillRect(fx - 2.4, fy - 0.1, 4.8, 0.9);
      c.fillStyle = '#ff9ac2';
      c.beginPath(); c.ellipse(fx, fy + 1.3, 2.4, 1.1, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.5)';
      c.beginPath(); c.ellipse(fx - 0.8, fy - 1, 1, 0.3, 0, 0, Math.PI * 2); c.fill();
    } else if (food === 'strawberry') {
      c.fillStyle = '#e8344a';
      c.beginPath(); c.moveTo(fx - 2, fy - 1); c.quadraticCurveTo(fx, fy + 4, fx + 2, fy - 1); c.closePath(); c.fill();
      c.fillStyle = '#fff4a8';
      c.beginPath(); c.arc(fx - 0.8, fy + 0.5, 0.25, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(fx + 0.6, fy + 0.3, 0.25, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(fx, fy + 1.6, 0.25, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(fx - 1.1, fy + 1.9, 0.25, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#3caf3c';
      c.beginPath();
      c.moveTo(fx - 2.2, fy - 1); c.lineTo(fx - 0.6, fy - 1.8); c.lineTo(fx + 0.6, fy - 1.8);
      c.lineTo(fx + 2.2, fy - 1); c.lineTo(fx, fy - 0.2);
      c.closePath();
      c.fill();
    }
  }

  /* ---------- Whole figure ---------- */
  function readCust(cust) {
    cust = cust || {};
    return {
      hair: norm(cust.hair || '#e06088'),
      suit: norm(cust.suit || '#e06088'),
      skin: norm(cust.skin || '#ffddbb'),
      flipper: norm(cust.flipper || '#ff99cc'),
      hairStyle: cust.hairStyle || 'twinTails',
      outfit: cust.outfit || 'frillyDress',
      shoes: cust.shoes || 'maryJane',
      food: cust.food || 'none',
    };
  }

  /* The figure in three layers. The back layer (bubble wall, nape and
     tails) is painted at rest and swayed with a shear about the tail
     roots; the body (legs, outfit, arms) changes only with the walk
     frame; the head bobs with her breath. Outside the floss dance each
     layer is cached as a bitmap at the device scale it is drawn at, so
     a frame costs three blits instead of a few hundred cel fills. */
  function paintBack(cust, sway, lift) {
    helmetBack();
    shape(napePath(cust.hairStyle === 'buns' ? 18.5 : 22), pal(cust.hair, false).s1, { d: 1.2, hi: false, lw: 0.5 });
    if (cust.hairStyle === 'longBraids') braids(cust.hair, cust.suit, sway, lift);
    else if (cust.hairStyle === 'buns') buns(cust.hair, cust.suit, sway, lift);
    else twinTails(cust.hair, sway, lift);
  }

  function paintBody(cust, kick, swing, floss, beat, ease) {
    var outfit = cust.outfit;
    legsAndShoes(cust, outfit, kick, floss ? beat * 2 : 0);
    /* floss: the trailing arm swings behind the body */
    var armDir = -beat;
    if (floss) {
      arm(cust, outfit, 14 + armDir * 4, 23, 14 - armDir * 9, 26 - ease);
      hand(cust, outfit, 14 - armDir * 10, 26 - ease);
    }
    if (isDress(outfit)) dress(outfit, cust.suit);
    else if (isSuit(outfit)) suit(outfit, cust.suit);
    else tshirt(cust.suit);
    if (floss) {
      arm(cust, outfit, 14 - armDir * 4, 22, 14 + armDir * 9, 21 + ease);
      hand(cust, outfit, 14 + armDir * 10, 21 + ease);
    } else {
      var hasFood = cust.food !== 'none';
      arm(cust, outfit, 8.2, 21.8, hasFood ? 4.8 : 5.4, (hasFood ? 25.2 : 26.0) + swing);
      if (hasFood) heldFood(cust.food, 4, 22 + swing);
      hand(cust, outfit, hasFood ? 4.6 : 5.2, (hasFood ? 25.6 : 26.4) + swing);
      arm(cust, outfit, 19.8, 21.8, 22.6, 25.0 - swing);
      hand(cust, outfit, 22.8, 25.4 - swing);
    }
    /* neck in the chin's shadow */
    c.fillStyle = pal(cust.skin, true).s1;
    c.fillRect(12.2, 18.4, 3.6, 2.2);
  }

  function paintHead(cust, expr, blink) {
    helmetCollar();
    face(cust.skin, cust.hair, expr, blink);
    shape(frontHairPath, cust.hair, { d: 1.6, lw: 0.6 });
    hairGloss(cust.hair);
    if (cust.hairStyle === 'twinTails') {
      bow(4.2, 10.6, cust.suit);
      bow(23.8, 10.6, cust.suit);
    }
    helmetFront();
  }

  /* Layer cache. Bounds in sprite units cover tails, pet-free figure
     and a little lean. */
  var BX = -8, BY = -8, BW = 44, BH = 48;
  var cache = {}, cacheN = 0;
  function layer(key, s, draw) {
    var cv = cache[key];
    if (cv) return cv;
    if (cacheN >= 64) { cache = {}; cacheN = 0; }
    cv = document.createElement('canvas');
    cv.width = Math.ceil(BW * s);
    cv.height = Math.ceil(BH * s);
    var g = cv.getContext('2d');
    g.setTransform(s, 0, 0, s, -BX * s, -BY * s);
    g.lineCap = 'round';
    var pc = c;
    c = g;
    draw();
    c = pc;
    cache[key] = cv;
    cacheN++;
    return cv;
  }
  function blit(cv, s) { c.drawImage(cv, BX, BY, cv.width / s, cv.height / s); }

  /* P: frame, t, mirror, vx (forward speed), vy, pose ('floss'), beat, ease */
  function paint(ctx, sx, sy, rawCust, P) {
    P = P || {};
    var cust = readCust(rawCust);
    var floss = P.pose === 'floss';
    var t = P.t !== undefined ? P.t : Date.now() / 16.67;
    var f = P.frame || 0;
    var kick = floss ? 0 : Math.round(Math.sin(f * 1.5) * 4) / 2;
    var swing = floss ? 0 : Math.round(Math.sin(f * 1.57) * 5) / 5 * 0.6;
    var breathe = Math.sin(t * 0.06) * 0.35;
    var trail = clamp(P.vx || 0, -3.2, 3.2) * 0.55;
    var beat = P.beat || 0, ease = P.ease || 0;
    var sway = floss ? -beat * 2 : Math.sin(t * 0.07) * 0.8 - trail * 1.6;
    var lift = floss ? 0 : clamp(-(P.vy || 0) * 0.5, -1.6, 1.6);
    var expr = floss ? 'happy' : 'normal';
    var blink = !floss && (t % 230) < 6;

    var prevC = c, prevLX = LX;
    c = ctx;
    LX = P.mirror ? 1 : -1;
    c.save();
    c.translate(sx, sy);
    c.lineCap = 'round';

    if (floss) {
      c.translate(14, 22);
      c.rotate(beat * 0.08);
      c.translate(-14, -22);
      c.save(); c.translate(0, breathe); paintBack(cust, sway, lift); c.restore();
      paintBody(cust, 0, 0, true, beat, ease);
      c.save(); c.translate(0, breathe); paintHead(cust, expr, false); c.restore();
    } else {
      var m = c.getTransform();
      var s = Math.sqrt(m.a * m.a + m.b * m.b);
      s = Math.min(24, Math.pow(2, Math.ceil(Math.log(Math.max(s, 0.5)) / Math.LN2 * 4) / 4));
      var ck = cust.hair + cust.suit + cust.skin + cust.flipper + cust.hairStyle + cust.outfit +
               cust.shoes + cust.food + (P.mirror ? 'm' : 'n') + s;
      var back = layer('b' + ck, s, function () { paintBack(cust, 0, 0); });
      var body = layer('d' + kick + ',' + swing + ck, s, function () { paintBody(cust, kick, swing, false, 0, 0); });
      var head = layer('h' + blink + ck, s, function () { paintHead(cust, expr, blink); });
      /* tails sway as a shear about their roots */
      c.save();
      var k = sway / 20, l = lift / 20;
      c.transform(1, 0, k, 1 + l, -k * 10, breathe - l * 10);
      blit(back, s);
      c.restore();
      /* hem trails her motion: a light shear about the shoulders */
      c.save();
      var kb = -sway * 0.05;
      c.transform(1, 0, kb, 1, -kb * 21, 0);
      blit(body, s);
      c.restore();
      c.save();
      c.translate(0, breathe);
      blit(head, s);
      c.restore();
    }

    c.restore();
    c = prevC;
    LX = prevLX;
  }

  Game.momoko = {
    paint: paint,
    /* Borrow the cel shader for a companion painted in the same light:
       S = shader(ctx, mirror); S.shape(S.ellipse(...), col, opts); S.done(). */
    shader: function (ctx, mirror) {
      var prevC = c, prevLX = LX;
      c = ctx;
      LX = mirror ? 1 : -1;
      return {
        shape: shape,
        ellipse: ellipsePath,
        done: function () { c = prevC; LX = prevLX; },
      };
    },
    /* Pause / victory dance: same figure, floss pose. */
    floss: function (ctx, sx, sy, cust, phase) {
      var beat = Math.tanh(Math.sin(phase) * 3.2);
      paint(ctx, sx, sy, cust, { pose: 'floss', beat: beat, ease: Math.sin(phase * 2) * 0.3, t: phase * 6 });
    },
  };
})();
