/* ui.js – title screen, HUD, menus, dialogue, game over, victory, beach cutscene */
(function () {
  'use strict';
  window.Game = window.Game || {};

  var W = 800, H = 480;
  var titleAnimTimer = 0;
  var titleBubbles = [];

  /* Title-screen twinkling stars */
  for (var i = 0; i < 60; i++) {
    titleBubbles.push({
      x: Math.random() * W,
      y: Math.random() * H * 0.9,
      r: 1 + Math.random() * 4,
      speed: 0, /* stars stay put, they just twinkle */
      wobble: Math.random() * Math.PI * 2,
    });
  }

  /* ---- Helpers ---- */
  var FONT = '"M PLUS Rounded 1c", sans-serif';

  /* The rectangle the ambient backdrops fill, in game coordinates. It is
     the 800x480 viewport everywhere except on touch devices, where the
     engine widens it to the whole canvas for the title, customize, intro
     and victory screens so space fills the bezel instead of a dark
     frame. Everything else on those screens stays clipped to the
     viewport via clipGame(). */
  var VIEW = { x: 0, y: 0, w: W, h: H };
  function setView(x, y, w, h) { VIEW.x = x; VIEW.y = y; VIEW.w = w; VIEW.h = h; }
  function clipGame(c) { c.beginPath(); c.rect(0, 0, W, H); c.clip(); }

  /* Extra stars for the part of the view outside the viewport, made once
     per layout at the same density as the title's own star field. */
  var bezelStars = [], bezelKey = '';
  function viewBezelStars() {
    var key = VIEW.x + ',' + VIEW.y + ',' + VIEW.w + ',' + VIEW.h;
    if (key === bezelKey) return bezelStars;
    bezelKey = key;
    bezelStars = [];
    var extra = VIEW.w * VIEW.h - W * H;
    var n = Math.round(titleBubbles.length * extra / (W * H));
    for (var i = 0; i < n; i++) {
      var x, y, tries = 0;
      do {
        x = VIEW.x + Math.random() * VIEW.w;
        y = VIEW.y + Math.random() * VIEW.h;
      } while (x >= 0 && x < W && y >= 0 && y < H && ++tries < 20);
      bezelStars.push({ x: x, y: y, r: 1 + Math.random() * 4, wobble: Math.random() * Math.PI * 2 });
    }
    return bezelStars;
  }

  /* True when the mouse is over the rect, in whatever coordinate space
     the caller is currently drawing in (the pointer is stored in
     backing-store pixels and mapped back through the live transform). */
  var anyHot = false;
  function pointerOver(c, x, y, w, h) {
    var p = Game.input && Game.input.pointer;
    if (!p || p.px < 0 || !c.getTransform) return false;
    var pt = c.getTransform().inverse().transformPoint(new DOMPoint(p.px, p.py));
    var over = pt.x >= x && pt.x <= x + w && pt.y >= y && pt.y <= y + h;
    if (over) anyHot = true;
    return over;
  }

  /* Shrink the current font until text fits maxW. Keeps the weight/family
     of the font string already set on the context. */
  function fitFont(c, text, maxW, size, weight) {
    while (size > 8) {
      c.font = (weight ? weight + ' ' : '') + size + 'px ' + FONT;
      if (c.measureText(text).width <= maxW) break;
      size--;
    }
  }

  /* Rounded, glossy button with hover and press feedback. `style` picks a
     palette: undefined = standard, 'primary' = big call-to-action. */
  function drawButton(c, text, x, y, w, h, hover, style) {
    hover = hover || pointerOver(c, x, y, w, h);
    var pressed = hover && Game.input.pointer.down;
    var r = Math.min(12, h / 2);
    var pal = style === 'primary'
      ? { top: '#ff9be0', bot: '#e04cae', low: '#b02a88', hTop: '#ffb8ea', hBot: '#ee55bb', edge: '#ffe0f4' }
      : style === 'danger'
      ? { top: '#ff7a9a', bot: '#c83460', low: '#98204a', hTop: '#ff9ab4', hBot: '#d23e68', edge: '#ffd0dc' }
      : { top: '#7a48c0', bot: '#48207e', low: '#2e1058', hTop: '#8a55d0', hBot: '#55259a', edge: '#ff66cc' };
    var oy = pressed ? 2 : 0;
    c.save();
    if (!pressed) {
      /* Layered shadow: a wide soft one and a tight dark one */
      c.fillStyle = 'rgba(4, 0, 20, 0.22)';
      roundRect(c, x - 2, y + 4, w + 4, h + 4, r + 2);
      c.fill();
      c.fillStyle = 'rgba(4, 0, 20, 0.5)';
      roundRect(c, x, y + 3, w, h, r);
      c.fill();
    }
    /* Halo in the edge colour so the button lifts off the backdrop */
    c.strokeStyle = hexAlpha(pal.edge, style === 'primary' || hover ? 0.3 : 0.16);
    c.lineWidth = 6;
    roundRect(c, x, y + oy, w, h, r);
    c.stroke();
    var g = c.createLinearGradient(0, y + oy, 0, y + oy + h);
    g.addColorStop(0, hover ? pal.hTop : pal.top);
    g.addColorStop(0.55, hover ? pal.hBot : pal.bot);
    g.addColorStop(1, hover ? pal.hBot : pal.low);
    c.fillStyle = g;
    roundRect(c, x, y + oy, w, h, r);
    c.fill();
    /* Glossy cap fading down the upper half */
    var gl = c.createLinearGradient(0, y + oy + 2, 0, y + oy + h * 0.5);
    gl.addColorStop(0, 'rgba(255, 255, 255, 0.38)');
    gl.addColorStop(1, 'rgba(255, 255, 255, 0.04)');
    c.fillStyle = gl;
    roundRect(c, x + 3, y + oy + 2.5, w - 6, h * 0.46, Math.max(2, r - 3));
    c.fill();
    c.strokeStyle = hover ? '#ffffff' : pal.edge;
    c.lineWidth = 2;
    roundRect(c, x, y + oy, w, h, r);
    c.stroke();
    /* Hairline inset */
    c.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    c.lineWidth = 1;
    roundRect(c, x + 2.5, y + oy + 2.5, w - 5, h - 5, Math.max(2, r - 2.5));
    c.stroke();
    c.fillStyle = '#ffffff';
    fitFont(c, text, w - 16, Math.min(18, Math.round(h * 0.42)), 'bold');
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = 'rgba(0, 0, 0, 0.45)';
    c.shadowOffsetY = 1;
    c.fillText(text, x + w / 2, y + oy + h / 2 + 1);
    c.restore();
  }

  /* Menu card: layered drop shadow, gradient body with a sheen across
     the top, a glowing edge and a hairline inset. */
  function drawPanel(c, x, y, w, h, r, edge, top, bot, edgeW) {
    c.save();
    c.fillStyle = 'rgba(2, 0, 14, 0.2)';
    roundRect(c, x - 5, y + 3, w + 10, h + 12, r + 5);
    c.fill();
    c.fillStyle = 'rgba(2, 0, 14, 0.42)';
    roundRect(c, x - 1, y + 5, w + 2, h + 2, r + 1);
    c.fill();
    c.strokeStyle = hexAlpha(edge, 0.22);
    c.lineWidth = (edgeW || 2) + 6;
    roundRect(c, x, y, w, h, r);
    c.stroke();
    var g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, top);
    g.addColorStop(1, bot);
    c.fillStyle = g;
    roundRect(c, x, y, w, h, r);
    c.fill();
    var sh = c.createLinearGradient(0, y, 0, y + Math.min(h * 0.45, 90));
    sh.addColorStop(0, 'rgba(255, 255, 255, 0.13)');
    sh.addColorStop(1, 'rgba(255, 255, 255, 0)');
    c.fillStyle = sh;
    c.fill();
    c.strokeStyle = edge;
    c.lineWidth = edgeW || 2;
    c.stroke();
    c.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    c.lineWidth = 1;
    var inset = (edgeW || 2) / 2 + 2;
    roundRect(c, x + inset, y + inset, w - inset * 2, h - inset * 2, Math.max(2, r - inset));
    c.stroke();
    c.restore();
  }

  /* Selectable chip (customize tabs and option tiles): violet gradient
     with a sheen and hairline, gold ring and halo when selected. */
  function drawChip(c, x, y, w, h, r, selected, hot) {
    c.save();
    c.fillStyle = 'rgba(4, 0, 20, 0.4)';
    roundRect(c, x, y + 2, w, h, r);
    c.fill();
    var g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, selected ? '#8a50d8' : hot ? '#55309a' : '#3c2078');
    g.addColorStop(1, selected ? '#4c2496' : hot ? '#30185e' : '#1e0e48');
    c.fillStyle = g;
    roundRect(c, x, y, w, h, r);
    c.fill();
    var sh = c.createLinearGradient(0, y, 0, y + h * 0.5);
    sh.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
    sh.addColorStop(1, 'rgba(255, 255, 255, 0)');
    c.fillStyle = sh;
    c.fill();
    if (selected) {
      c.strokeStyle = 'rgba(255, 221, 136, 0.28)';
      c.lineWidth = 6;
      c.stroke();
      c.strokeStyle = '#ffdd88';
      c.lineWidth = 2;
      c.stroke();
    } else {
      c.strokeStyle = hot ? 'rgba(255, 255, 255, 0.5)' : 'rgba(190, 150, 255, 0.4)';
      c.lineWidth = 1;
      c.stroke();
    }
    c.restore();
  }

  /* Room lighting: ambient occlusion, light pools and shading for an
     interior (Game.FX.bloom), plus the same colour grade and vignette as
     the outdoor scenes when `finish` is set (Game.FX.grade / .vignette),
     painted once per room into a canvas at device resolution and blitted
     over the bare walls and floor. One canvas is reused for whichever
     room is on screen, so a room costs one unscaled blit per frame. */
  var roomCv = null, roomKey = '';
  function drawRoomLight(c, key, paint, finish) {
    var fx = Game.FX || {};
    var grade = finish && fx.grade, vig = finish && fx.vignette;
    if (!fx.bloom && !grade && !vig) return;
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    key += '@' + dpr + !!fx.bloom + !!grade + !!vig;
    if (key !== roomKey) {
      roomKey = key;
      var rw = Math.round(W * dpr), rh = Math.round(H * dpr);
      if (!roomCv || roomCv.width !== rw || roomCv.height !== rh) {
        roomCv = document.createElement('canvas');
        roomCv.width = rw;
        roomCv.height = rh;
      }
      var g = roomCv.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, rw, rh);
      g.scale(dpr, dpr);
      if (fx.bloom) paint(g);
      if (grade) {
        var lg = g.createLinearGradient(0, 0, W, H);
        lg.addColorStop(0, 'rgba(255, 176, 150, 0.16)');
        lg.addColorStop(0.45, 'rgba(255, 176, 150, 0)');
        lg.addColorStop(0.6, 'rgba(40, 70, 190, 0)');
        lg.addColorStop(1, 'rgba(40, 70, 190, 0.2)');
        g.fillStyle = lg;
        g.fillRect(0, 0, W, H);
      }
      if (vig) {
        g.save();
        g.scale(W, H);
        var rg = g.createRadialGradient(0.5, 0.5, 0.25, 0.5, 0.5, 0.8);
        rg.addColorStop(0, 'rgba(8, 3, 26, 0)');
        rg.addColorStop(0.6, 'rgba(8, 3, 26, 0.16)');
        rg.addColorStop(1, 'rgba(8, 3, 26, 0.6)');
        g.fillStyle = rg;
        g.fillRect(0, 0, 1, 1);
        g.restore();
      }
    }
    c.drawImage(roomCv, 0, 0, W, H);
  }

  /* Vertical gradient band from colour a at y0 to colour b at y1. */
  function shadeBand(g, y0, y1, a, b) {
    var lg = g.createLinearGradient(0, y0, 0, y1);
    lg.addColorStop(0, a);
    lg.addColorStop(1, b);
    g.fillStyle = lg;
    g.fillRect(0, y0, W, y1 - y0);
  }

  /* Darkening toward the left and right walls between y0 and y1. */
  function shadeCorners(g, y0, y1, a) {
    var lg = g.createLinearGradient(0, 0, W, 0);
    lg.addColorStop(0, 'rgba(12, 4, 40, ' + a + ')');
    lg.addColorStop(0.15, 'rgba(12, 4, 40, 0)');
    lg.addColorStop(0.85, 'rgba(12, 4, 40, 0)');
    lg.addColorStop(1, 'rgba(12, 4, 40, ' + a + ')');
    g.fillStyle = lg;
    g.fillRect(0, y0, W, y1 - y0);
  }

  /* Soft elliptical pool of light centred on (x, y). */
  function lightPool(g, x, y, rx, ry, rgb, a) {
    g.save();
    g.translate(x, y);
    g.scale(1, ry / rx);
    var rg = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    rg.addColorStop(0, 'rgba(' + rgb + ', ' + a + ')');
    rg.addColorStop(1, 'rgba(' + rgb + ', 0)');
    g.fillStyle = rg;
    g.fillRect(-rx, -rx, rx * 2, rx * 2);
    g.restore();
  }

  /* Cone of light from a lamp at (x, y0) spreading to half-width r at y1. */
  function lightCone(g, x, y0, y1, r, rgb, a) {
    var lg = g.createLinearGradient(0, y0, 0, y1);
    lg.addColorStop(0, 'rgba(' + rgb + ', ' + a + ')');
    lg.addColorStop(1, 'rgba(' + rgb + ', 0)');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(x - 7, y0);
    g.lineTo(x + 7, y0);
    g.lineTo(x + r, y1);
    g.lineTo(x - r, y1);
    g.closePath();
    g.fill();
  }

  /* Contact shadow under a character whose feet are at (x, y). */
  /* Momoko indoors: painted 1.5x up from her feet at (x, y) so she
     holds her own against the furniture; her walk position and every
     hit test stay where they were. */
  var INTERIOR_HERO = 1.5;
  /* One rig animates her in every room; it notices the jump in position
     when she comes through a door and plays her arrival hop. */
  var interiorRig = null, previewRig = null, introRig = null, beachRig = null;
  function heroRig(r) { return r || (Game.momoko ? Game.momoko.createRig() : null); }
  var interiorHeroAt = { x: 0, y: 0 };
  function drawInteriorHero(c, x, y, facing, frame) {
    interiorHeroAt.x = x; interiorHeroAt.y = y;
    interiorRig = heroRig(interiorRig);
    var pose = interiorRig ? interiorRig.tick(x, y, { facing: facing, planar: true, indoor: true, vmax: 144, arrive: true,
      turbo: Game.input.turbo.ease - 1, size: INTERIOR_HERO }) : null;
    if (interiorRig) Game.momoko.drawDust(c, interiorRig, 0, 0);
    c.save();
    c.translate(x, y);
    c.scale(INTERIOR_HERO, INTERIOR_HERO);
    footShadow(c, 0, 0);
    c.scale(pose ? pose.sx : facing, 1);
    Game.entities.drawMomokoSprite(c, -14, -34, Game.customization, frame, {
      rig: interiorRig, mirror: (pose ? pose.face : facing) === -1,
      env: { sky: '#6a3aa8', ground: '#5a3a8a', key: '#ffe2b0', glow: '#ff9ad8' },
    });
    c.restore();
  }
  /* Indoors she steps at the engine's fixed 60 Hz; draw her between the
     last two steps (Game.renderAlpha) so her walk glides on 120 Hz
     screens too. prev is null until the room has stepped once. */
  function blendStep(prev, cur) {
    if (prev == null || Math.abs(cur - prev) > 48) return cur;
    var a = Game.renderAlpha == null ? 1 : Game.renderAlpha;
    return prev + (cur - prev) * a;
  }
  function footShadow(c, x, y) {
    c.fillStyle = 'rgba(10, 2, 30, 0.38)';
    c.beginPath();
    c.ellipse(x, y, 12, 3.2, 0, 0, Math.PI * 2);
    c.fill();
  }

  function paintHouseLight(g) {
    var wb = HOUSE_WALL_BOTTOM;
    /* Ceiling shade, starlight from the window washing the wall, dark
       corners, then occlusion where the wall meets the floor */
    shadeBand(g, 0, wb * 0.7, 'rgba(12, 4, 40, 0.42)', 'rgba(12, 4, 40, 0)');
    lightPool(g, 375, 237, 300, 130, '255, 236, 200', 0.26);
    shadeCorners(g, 0, wb, 0.4);
    shadeBand(g, wb - 36, wb, 'rgba(12, 4, 40, 0)', 'rgba(12, 4, 40, 0.5)');
    shadeBand(g, wb, wb + 40, 'rgba(12, 4, 40, 0.55)', 'rgba(12, 4, 40, 0)');
    /* Window light pooling on the floor, brightest just past the wall */
    lightPool(g, 375, wb + 70, 210, 62, '255, 240, 205', 0.3);
    lightPool(g, 375, wb + 44, 90, 22, '255, 250, 230', 0.22);
    /* Glow spilling from the doorway on the right */
    lightPool(g, W - 52, H - 34, 90, 22, '255, 210, 140', 0.22);
    shadeBand(g, H - 60, H, 'rgba(12, 4, 40, 0)', 'rgba(12, 4, 40, 0.3)');
  }

  function paintCafeLight(g) {
    var i;
    shadeBand(g, 0, 50, 'rgba(20, 4, 24, 0.45)', 'rgba(20, 4, 24, 0.1)');
    shadeBand(g, 64, 84, 'rgba(20, 4, 24, 0.45)', 'rgba(20, 4, 24, 0)');
    /* Pendant lamps: a cone down the wall and a warm pool on the floor */
    for (i = 0; i < 5; i++) {
      var x = 100 + i * 140;
      lightCone(g, x, 96, 220, 78, '255, 214, 150', 0.26);
      lightPool(g, x, 300, 120, 46, '255, 206, 140', 0.2);
    }
    shadeCorners(g, 0, H, 0.34);
    shadeBand(g, 186, 220, 'rgba(20, 4, 24, 0)', 'rgba(20, 4, 24, 0.4)');
    shadeBand(g, 220, 262, 'rgba(20, 4, 24, 0.5)', 'rgba(20, 4, 24, 0)');
    /* Cool starlight from the window falling across the floor */
    var lg = g.createLinearGradient(0, 220, 0, 380);
    lg.addColorStop(0, 'rgba(150, 190, 255, 0.2)');
    lg.addColorStop(1, 'rgba(150, 190, 255, 0)');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(W - 200, 220);
    g.lineTo(W - 70, 220);
    g.lineTo(W - 150, 380);
    g.lineTo(W - 330, 380);
    g.closePath();
    g.fill();
    shadeBand(g, H - 90, H, 'rgba(20, 4, 24, 0)', 'rgba(20, 4, 24, 0.35)');
  }

  function paintShopLight(g) {
    /* Shadow cast by the banner, three display spotlights, a bright
       centre and dark corners */
    shadeBand(g, 70, 92, 'rgba(4, 14, 22, 0.55)', 'rgba(4, 14, 22, 0)');
    for (var i = 0; i < 3; i++) {
      lightCone(g, 150 + i * 250, 70, 372, 170, '255, 244, 205', 0.11);
    }
    lightPool(g, W / 2 - 40, 220, 420, 190, '190, 244, 255', 0.14);
    shadeCorners(g, 70, H, 0.45);
    shadeBand(g, 350, H, 'rgba(4, 14, 22, 0)', 'rgba(4, 14, 22, 0.5)');
    /* Display cases: shadow, lit body, a sheen across the top and a
       shelf highlight under the piece */
    var grid = shopGrid();
    for (var gi = 0; gi < grid.length; gi++) {
      var t = grid[gi];
      g.fillStyle = 'rgba(2, 12, 20, 0.4)';
      roundRect(g, t.x + 4, t.y + 7, t.w - 8, t.h - 8, 8);
      g.fill();
      var tg = g.createLinearGradient(0, t.y + 4, 0, t.y + t.h - 4);
      tg.addColorStop(0, '#3a94b0');
      tg.addColorStop(0.6, '#226a84');
      tg.addColorStop(1, '#154a62');
      g.fillStyle = tg;
      roundRect(g, t.x + 4, t.y + 4, t.w - 8, t.h - 8, 8);
      g.fill();
      var ts = g.createLinearGradient(0, t.y + 4, 0, t.y + 44);
      ts.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
      ts.addColorStop(1, 'rgba(255, 255, 255, 0)');
      g.fillStyle = ts;
      g.fill();
      g.strokeStyle = '#cdeaf4';
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = 'rgba(255, 244, 205, 0.16)';
      g.beginPath();
      g.ellipse(t.x + t.w / 2, t.y + t.h / 2 + 20, 26, 6, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  var beachSunX = 0, beachSunY = 0;
  function paintBeachLight(g) {
    /* Sun bloom, haze along the horizon, warm light on the sun's side
       and a soft vignette, matching the finish on the space scenes */
    lightPool(g, beachSunX, beachSunY, 300, 300, '255, 246, 210', 0.34);
    shadeBand(g, H * 0.46, H * 0.6, 'rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.3)');
    shadeBand(g, H * 0.6, H * 0.68, 'rgba(255, 255, 255, 0.22)', 'rgba(255, 255, 255, 0)');
    var left = beachSunX < W / 2;
    var lg = g.createLinearGradient(left ? 0 : W, 0, left ? W : 0, H);
    lg.addColorStop(0, 'rgba(255, 190, 130, 0.14)');
    lg.addColorStop(0.5, 'rgba(255, 190, 130, 0)');
    lg.addColorStop(1, 'rgba(60, 60, 150, 0.16)');
    g.fillStyle = lg;
    g.fillRect(0, 0, W, H);
    g.save();
    g.scale(W, H);
    var rg = g.createRadialGradient(0.5, 0.5, 0.3, 0.5, 0.5, 0.8);
    rg.addColorStop(0, 'rgba(50, 20, 60, 0)');
    rg.addColorStop(1, 'rgba(50, 20, 60, 0.4)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 1, 1);
    g.restore();
  }

  function hitButton(mx, my, x, y, w, h) {
    return mx >= x && mx <= x + w && my >= y && my <= y + h;
  }

  /* Split text into lines that fit maxWidth. Breaks on spaces, and falls
     back to per-character breaks for runs with no spaces (Japanese). */
  function layoutLines(c, text, maxWidth) {
    var out = [];
    var paras = text.split('\n');
    for (var li = 0; li < paras.length; li++) {
      var words = paras[li].split(' ');
      var line = '';
      for (var i = 0; i < words.length; i++) {
        var word = words[i];
        var test = line ? line + ' ' + word : word;
        if (c.measureText(test).width <= maxWidth) { line = test; continue; }
        if (line) { out.push(line); line = ''; }
        /* Word alone is too wide: break it character by character. */
        while (c.measureText(word).width > maxWidth && word.length > 1) {
          var n = word.length - 1;
          while (n > 1 && c.measureText(word.slice(0, n)).width > maxWidth) n--;
          /* Don't start a line with closing punctuation. */
          while (n > 1 && '、。！？」）ー'.indexOf(word.charAt(n)) >= 0) n--;
          out.push(word.slice(0, n));
          word = word.slice(n);
        }
        line = word;
      }
      out.push(line);
    }
    return out;
  }

  function wrapText(c, text, x, y, maxWidth, lineHeight) {
    var lines = layoutLines(c, text, maxWidth);
    for (var i = 0; i < lines.length; i++) c.fillText(lines[i], x, y + i * lineHeight);
    return lines.length * lineHeight;
  }

  /* ---- Title Screen ---- */
  /* ---- Space backdrop shared by the title, intro and victory screens ----
     Soft drifting nebula glows behind the twinkling star field. */
  /* Nebula painter shared with the gameplay sky: glowing clouds strung
     along a wavy band, dark dust lanes cut out of them and a dense field
     of faint stars, on a transparent tile tw x th that wraps
     horizontally. Nothing is painted below `horizon`. */
  function paintNebula(n, tw, th, horizon, cols, rnd) {
    var k = th / 480, i;
    var area = (tw * th) / (1200 * 480);
    function bandY(x) {
      return th * 0.31 + Math.sin(x / tw * Math.PI * 2) * th * 0.125 + Math.sin(x / tw * Math.PI * 6 + 1) * th * 0.045;
    }
    function blob(x, y, r, color, a) {
      for (var wx = -tw; wx <= tw; wx += tw) {
        if (x + wx + r < 0 || x + wx - r > tw) continue;
        var rg = n.createRadialGradient(x + wx, y, 0, x + wx, y, r);
        rg.addColorStop(0, hexAlpha(color, a));
        rg.addColorStop(0.55, hexAlpha(color, a * 0.4));
        rg.addColorStop(1, hexAlpha(color, 0));
        n.fillStyle = rg;
        n.fillRect(x + wx - r, y - r, r * 2, r * 2);
      }
    }
    n.save();
    n.globalCompositeOperation = 'lighter';
    for (i = 0; i < 90 * area; i++) {
      var bx = rnd() * tw;
      var spread = (rnd() + rnd() - 1) * 110 * k;
      var br = (36 + rnd() * 110) * k;
      blob(bx, Math.min(horizon - br * 0.4, bandY(bx) + spread), br,
        cols[Math.floor(rnd() * cols.length)], 0.05 + rnd() * 0.09);
    }
    /* Bright knots */
    for (i = 0; i < 16 * area; i++) {
      var kx = rnd() * tw;
      blob(kx, bandY(kx) + (rnd() - 0.5) * 60 * k, (14 + rnd() * 26) * k, cols[i % cols.length], 0.14);
      blob(kx, bandY(kx) + (rnd() - 0.5) * 20 * k, 8 * k, '#ffffff', 0.1);
    }
    n.globalCompositeOperation = 'destination-out';
    for (i = 0; i < 14 * area; i++) {
      var lx = rnd() * tw;
      blob(lx, bandY(lx) + (rnd() - 0.5) * 90 * k, (24 + rnd() * 50) * k, '#000000', 0.32);
    }
    n.globalCompositeOperation = 'source-over';
    var starCols = ['#ffffff', '#ffffff', '#ffffff', '#cfe4ff', '#ffe0f2', '#fff2c8'];
    for (i = 0; i < 620 * area; i++) {
      var sx = rnd() * tw;
      /* Two in three stars hug the nebula band */
      var sy = i % 3 ? bandY(sx) + (rnd() + rnd() - 1) * 150 * k : rnd() * horizon;
      var big = rnd() < 0.06;
      var sa = (big ? 0.9 : 0.25 + rnd() * 0.5) * (1 - Math.max(0, sy - horizon + 120) / 120);
      var sr = big ? 1 + rnd() * 0.5 : 0.35 + rnd() * 0.5;
      var sc = starCols[Math.floor(rnd() * starCols.length)];
      if (sy < 0 || sy > horizon) continue;
      n.globalAlpha = sa;
      n.fillStyle = sc;
      n.beginPath();
      n.arc(sx, sy, sr, 0, Math.PI * 2);
      n.fill();
    }
    n.restore();
  }

  /* ---- Space backdrop shared by the title, intro and victory screens ----
     Deep-space gradient, nebula and star dust, with a colour grade and
     vignette, rendered once per view layout at device resolution and
     blitted; only the twinkling stars are drawn per frame. */
  var backdropCv = null, backdropKey = '';
  function backdropCanvas() {
    var fx = Game.FX || {};
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    var key = VIEW.w + 'x' + VIEW.h + '@' + dpr + !!fx.grade + !!fx.vignette;
    if (backdropCv && key === backdropKey) return backdropCv;
    backdropKey = key;
    var cv = backdropCv = document.createElement('canvas');
    cv.width = Math.round(VIEW.w * dpr);
    cv.height = Math.round(VIEW.h * dpr);
    var g = cv.getContext('2d');
    g.scale(dpr, dpr);
    var vw = VIEW.w, vh = VIEW.h;
    var grad = g.createLinearGradient(0, 0, 0, vh);
    grad.addColorStop(0, '#0a0420');
    grad.addColorStop(0.5, '#1c0c44');
    grad.addColorStop(1, '#3a1a78');
    g.fillStyle = grad;
    g.fillRect(0, 0, vw, vh);
    /* Glow rising from the bottom edge, where the town sits */
    var hz = g.createLinearGradient(0, vh * 0.5, 0, vh);
    hz.addColorStop(0, 'rgba(160, 74, 216, 0)');
    hz.addColorStop(1, 'rgba(160, 74, 216, 0.42)');
    g.fillStyle = hz;
    g.fillRect(0, vh * 0.5, vw, vh * 0.5);
    var seed = 4242;
    g.globalAlpha = 0.78;
    paintNebula(g, vw, vh, vh, ['#ff4fb8', '#7a5cff', '#35c8ff', '#b04ac8'], function () {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    });
    g.globalAlpha = 1;
    if (fx.grade) {
      var lg = g.createLinearGradient(0, 0, vw, vh);
      lg.addColorStop(0, 'rgba(255, 176, 150, 0.12)');
      lg.addColorStop(0.45, 'rgba(255, 176, 150, 0)');
      lg.addColorStop(0.6, 'rgba(40, 70, 190, 0)');
      lg.addColorStop(1, 'rgba(40, 70, 190, 0.18)');
      g.fillStyle = lg;
      g.fillRect(0, 0, vw, vh);
    }
    if (fx.vignette) {
      g.save();
      g.scale(vw, vh);
      var rg = g.createRadialGradient(0.5, 0.5, 0.3, 0.5, 0.5, 0.82);
      rg.addColorStop(0, 'rgba(8, 3, 26, 0)');
      rg.addColorStop(1, 'rgba(8, 3, 26, 0.55)');
      g.fillStyle = rg;
      g.fillRect(0, 0, 1, 1);
      g.restore();
    }
    return cv;
  }

  function drawSpaceBackdrop(c) {
    c.drawImage(backdropCanvas(), VIEW.x, VIEW.y, VIEW.w, VIEW.h);

    for (var i = 0; i < titleBubbles.length; i++) {
      drawTwinkleStar(c, titleBubbles[i], i);
    }
    if (VIEW.w > W || VIEW.h > H) {
      var extra = viewBezelStars();
      for (var j = 0; j < extra.length; j++) drawTwinkleStar(c, extra[j], j);
    }
  }

  function drawTwinkleStar(c, b, i) {
    b.wobble += 0.04;
    var twinkle = 0.3 + 0.7 * Math.abs(Math.sin(b.wobble));
    c.save();
    c.globalAlpha = twinkle * 0.9;
    c.fillStyle = i % 13 === 0 ? '#44ffff' : (i % 17 === 0 ? '#ff66cc' : '#ffffff');
    c.beginPath();
    c.arc(b.x, b.y, 0.8 + b.r * 0.4 * twinkle, 0, Math.PI * 2);
    c.fill();
    if (b.r > 3) {
      c.strokeStyle = c.fillStyle;
      c.lineWidth = 0.6;
      c.beginPath();
      c.moveTo(b.x - b.r * 1.3, b.y);
      c.lineTo(b.x + b.r * 1.3, b.y);
      c.moveTo(b.x, b.y - b.r * 1.3);
      c.lineTo(b.x, b.y + b.r * 1.3);
      c.stroke();
    }
    c.restore();
  }

  /* Sphere-lit planet with soft bands and an optional ring that passes
     behind the planet at the top and in front of it at the bottom. */
  function drawShadedPlanet(c, x, y, r, light, dark, ring) {
    var tilt = -0.3;
    c.save();
    if (ring) {
      c.strokeStyle = ring;
      c.lineWidth = r * 0.14;
      c.globalAlpha = 0.75;
      c.beginPath();
      c.ellipse(x, y, r * 1.7, r * 0.34, tilt, Math.PI, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 1;
    }
    var g = c.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r);
    g.addColorStop(0, light);
    g.addColorStop(1, dark);
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    /* Bands, clipped to the disc */
    c.save();
    c.clip();
    c.fillStyle = 'rgba(255, 255, 255, 0.12)';
    c.beginPath();
    c.ellipse(x, y - r * 0.25, r * 1.2, r * 0.14, tilt, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(0, 0, 0, 0.1)';
    c.beginPath();
    c.ellipse(x, y + r * 0.3, r * 1.2, r * 0.2, tilt, 0, Math.PI * 2);
    c.fill();
    /* Atmosphere: the limb brightens where the air is seen edge-on */
    var ag = c.createRadialGradient(x, y, r * 0.7, x, y, r);
    ag.addColorStop(0, 'rgba(255, 255, 255, 0)');
    ag.addColorStop(1, 'rgba(255, 240, 255, 0.3)');
    c.fillStyle = ag;
    c.fillRect(x - r, y - r, r * 2, r * 2);
    /* Night side: a terminator sweeping round the lower right, with a
       warm band where day turns to night */
    var ng = c.createRadialGradient(x - r * 0.55, y - r * 0.6, r * 0.2, x - r * 0.3, y - r * 0.35, r * 1.75);
    ng.addColorStop(0, 'rgba(10, 4, 30, 0)');
    ng.addColorStop(0.5, 'rgba(10, 4, 30, 0)');
    ng.addColorStop(0.62, 'rgba(120, 30, 70, 0.18)');
    ng.addColorStop(0.8, 'rgba(10, 4, 30, 0.6)');
    ng.addColorStop(1, 'rgba(10, 4, 30, 0.78)');
    c.fillStyle = ng;
    c.fillRect(x - r, y - r, r * 2, r * 2);
    c.restore();
    /* Atmosphere rim on the lit limb, and its glow just outside */
    c.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(x, y, r - 0.6, Math.PI * 0.85, Math.PI * 1.65);
    c.stroke();
    c.strokeStyle = 'rgba(255, 220, 255, 0.18)';
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(x, y, r + 1.2, Math.PI * 0.95, Math.PI * 1.55);
    c.stroke();
    if (ring) {
      c.strokeStyle = ring;
      c.lineWidth = r * 0.14;
      c.globalAlpha = 0.9;
      c.beginPath();
      c.ellipse(x, y, r * 1.7, r * 0.34, tilt, 0, Math.PI);
      c.stroke();
    }
    c.restore();
  }

  /* ---- Moon-town horizon for the title and victory screens ----
     A row of dome houses with lit windows, antennas, the WELCOME sign
     and a parked rocket along the bottom of the view. The static part is
     rendered once per view layout to an offscreen canvas; only the
     blinking lights and the shooting star are drawn per frame. */
  var TOWN_H = 150;
  var TOWN_GROUND = TOWN_H - 48;
  var townCanvas = null, townKey = '';
  /* Buildings in game-x; those outside the view are skipped, so the
     tablet's wider view picks up the extra ones in the bezel. */
  var TOWN_ITEMS = [
    { k: 'dome', x: -250, c: '#3b1d6b', r: '#6a2f8f' },
    { k: 'ant', x: -150, h: 60 },
    { k: 'small', x: -110, c: '#2d1550' },
    { k: 'dome', x: 60, c: '#3b1d6b', r: '#7a3a9e' },
    { k: 'ant', x: 125, h: 52 },
    { k: 'small', x: 170, c: '#2d1550' },
    { k: 'sign', x: 250 },
    { k: 'ant', x: 522, h: 64 },
    { k: 'rocket', x: 572 },
    { k: 'dome', x: 672, c: '#35195f', r: '#6a2f8f' },
    { k: 'small', x: 768, c: '#2d1550' },
    { k: 'ant', x: 905, h: 58 },
    { k: 'dome', x: 980, c: '#3b1d6b', r: '#7a3a9e' },
    { k: 'small', x: 1090, c: '#2d1550' },
  ];
  function titleTownCanvas() {
    var key = VIEW.x + ',' + VIEW.w;
    if (townCanvas && key === townKey) return townCanvas;
    townKey = key;
    var cv = document.createElement('canvas');
    cv.width = Math.ceil(VIEW.w);
    cv.height = TOWN_H;
    var c = cv.getContext('2d');
    var ox = -VIEW.x; /* local x of game x = 0 */
    var gy = TOWN_GROUND;
    /* Horizon haze */
    var hz = c.createLinearGradient(0, 0, 0, gy);
    hz.addColorStop(0, 'rgba(120, 70, 190, 0)');
    hz.addColorStop(1, 'rgba(120, 70, 190, 0.22)');
    c.fillStyle = hz;
    c.fillRect(0, 0, cv.width, gy);
    /* Far ridge */
    c.fillStyle = '#1c0d3a';
    c.beginPath();
    c.moveTo(0, gy + 4);
    for (var rx = 0; rx <= cv.width; rx += 8) {
      var wx = rx - ox;
      c.lineTo(rx, gy - 22 - Math.sin(wx * 0.012) * 10 - Math.sin(wx * 0.031 + 1) * 5);
    }
    c.lineTo(cv.width, gy + 4);
    c.closePath();
    c.fill();
    /* Buildings */
    for (var i = 0; i < TOWN_ITEMS.length; i++) {
      var it = TOWN_ITEMS[i];
      var x = it.x + ox;
      if (x < -120 || x > cv.width + 120) continue;
      if (it.k === 'dome') {
        c.fillStyle = it.c;
        c.fillRect(x - 50, gy - 86, 100, 86);
        c.fillStyle = 'rgba(0, 0, 0, 0.2)';
        c.fillRect(x + 34, gy - 86, 16, 86);
        c.fillStyle = it.r;
        c.beginPath();
        c.ellipse(x, gy - 86, 56, 26, 0, Math.PI, 0);
        c.closePath();
        c.fill();
        c.fillStyle = 'rgba(255, 255, 255, 0.18)';
        c.beginPath();
        c.ellipse(x - 22, gy - 100, 14, 5, -0.35, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#261040';
        c.fillRect(x - 56, gy - 88, 112, 5);
        /* antenna */
        c.fillStyle = '#bfb8d8';
        c.fillRect(x - 1, gy - 128, 2, 16);
        /* windows with glow */
        var wc = ['#ffd24a', '#44ffff', '#ff88cc'];
        for (var w = 0; w < 3; w++) {
          var wxp = x - 38 + w * 28;
          var wg = c.createRadialGradient(wxp + 9, gy - 60, 2, wxp + 9, gy - 60, 26);
          wg.addColorStop(0, hexAlpha(wc[w], 0.35));
          wg.addColorStop(1, hexAlpha(wc[w], 0));
          c.fillStyle = wg;
          c.fillRect(wxp - 18, gy - 88, 54, 54);
          c.fillStyle = wc[w];
          c.fillRect(wxp, gy - 69, 18, 18);
          c.fillStyle = '#221133';
          c.fillRect(wxp + 8, gy - 69, 2, 18);
          c.fillRect(wxp, gy - 61, 18, 2);
        }
        /* door with porch light */
        c.fillStyle = '#1a0a2e';
        c.fillRect(x - 12, gy - 40, 24, 40);
        c.fillStyle = 'rgba(255, 220, 140, 0.25)';
        c.beginPath();
        c.arc(x, gy - 44, 14, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#ffe9a0';
        c.beginPath();
        c.arc(x, gy - 44, 2.2, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#44ffff';
        c.fillRect(x - 50, gy - 5, 100, 2);
      } else if (it.k === 'small') {
        c.fillStyle = it.c;
        c.fillRect(x - 28, gy - 52, 56, 52);
        c.fillStyle = 'rgba(0, 0, 0, 0.2)';
        c.fillRect(x + 18, gy - 52, 10, 52);
        c.fillStyle = '#4a2478';
        c.beginPath();
        c.ellipse(x, gy - 52, 32, 14, 0, Math.PI, 0);
        c.closePath();
        c.fill();
        c.fillStyle = '#ffd24a';
        c.fillRect(x - 16, gy - 40, 12, 12);
        c.fillStyle = '#44ffff';
        c.fillRect(x + 4, gy - 40, 12, 12);
        c.fillStyle = '#221133';
        c.fillRect(x - 11, gy - 40, 2, 12);
        c.fillRect(x + 9, gy - 40, 2, 12);
        c.fillStyle = '#1a0a2e';
        c.fillRect(x - 7, gy - 20, 14, 20);
      } else if (it.k === 'ant') {
        c.strokeStyle = '#6d7686';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x, gy); c.lineTo(x, gy - it.h);
        c.stroke();
        c.lineWidth = 1;
        for (var a = 1; a <= 4; a++) {
          var ay = gy - it.h * a / 5, aw = 3 + (4 - a) * 2;
          c.beginPath(); c.moveTo(x - aw, ay); c.lineTo(x + aw, ay); c.stroke();
        }
      } else if (it.k === 'sign') {
        c.fillStyle = '#4a5566';
        c.fillRect(x - 1.2, gy - 50, 2.4, 50);
        c.fillStyle = '#0e0e1c';
        c.fillRect(x - 34, gy - 84, 68, 36);
        c.fillStyle = '#1a1a2a';
        c.fillRect(x - 32, gy - 82, 64, 32);
        c.strokeStyle = '#44ffff';
        c.lineWidth = 2;
        c.strokeRect(x - 32, gy - 82, 64, 32);
        c.fillStyle = '#44ffff';
        c.font = 'bold 13px ' + FONT;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('WELCOME', x, gy - 66);
        c.textBaseline = 'alphabetic';
      } else if (it.k === 'rocket') {
        /* Launch pad and a parked rocket (flame clipped away) */
        c.fillStyle = '#3a3a4e';
        c.fillRect(x - 30, gy - 5, 60, 5);
        c.fillStyle = '#ffd24a';
        for (var st = 0; st < 4; st++) c.fillRect(x - 26 + st * 14, gy - 4, 6, 1.5);
        c.save();
        c.translate(x, gy - 5);
        c.scale(0.95, 0.95);
        c.translate(0, -24);
        c.beginPath();
        c.rect(-30, -40, 60, 64);
        c.clip();
        drawRocketShip(c, 0);
        c.restore();
        c.fillStyle = '#6d7686';
        c.fillRect(x + 28, gy - 46, 2, 46);
        c.fillRect(x + 20, gy - 44, 10, 2);
      }
    }
    /* Ground with a pale crust and dust shading toward the bottom */
    c.fillStyle = '#241247';
    c.beginPath();
    c.moveTo(0, TOWN_H);
    for (var fx = 0; fx <= cv.width; fx += 6) {
      var fwx = fx - ox;
      c.lineTo(fx, gy + Math.sin(fwx * 0.01) * 3 + Math.sin(fwx * 0.027) * 1.5);
    }
    c.lineTo(cv.width, TOWN_H);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(190, 160, 240, 0.35)';
    c.lineWidth = 1.5;
    c.stroke();
    var dg = c.createLinearGradient(0, gy, 0, TOWN_H);
    dg.addColorStop(0, 'rgba(0, 0, 0, 0)');
    dg.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
    c.fillStyle = dg;
    c.fillRect(0, gy, cv.width, TOWN_H - gy);
    /* Craters and pebbles */
    for (var cr = 0; cr < cv.width / 70; cr++) {
      var cx0 = (cr * 173) % cv.width, cy0 = gy + 10 + (cr * 37) % 24, crr = 3 + cr % 4;
      c.fillStyle = 'rgba(0, 0, 0, 0.3)';
      c.beginPath(); c.ellipse(cx0, cy0, crr, crr * 0.4, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(200, 170, 255, 0.25)';
      c.lineWidth = 1;
      c.beginPath(); c.ellipse(cx0, cy0 - 0.8, crr, crr * 0.4, 0, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    }
    townCanvas = cv;
    return cv;
  }
  function hexAlpha(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ', ' + a + ')';
  }
  /* Blit the cached town, then the live bits: blinking antenna tips,
     pulsing porch lights and an occasional shooting star. */
  function drawTitleTown(c, t) {
    var cv = titleTownCanvas();
    var top = VIEW.y + VIEW.h - TOWN_H;
    var gy = top + TOWN_GROUND;
    /* Shooting star every few seconds, high in the sky */
    var cyc = t % 420;
    if (cyc < 70) {
      var sp = cyc / 70;
      var sxx = VIEW.x + VIEW.w * (0.95 - sp * 0.6);
      var syy = VIEW.y + 30 + sp * 90;
      c.save();
      c.lineCap = 'round';
      for (var sg = 0; sg < 6; sg++) {
        c.globalAlpha = (1 - sg / 6) * 0.8 * Math.sin(sp * Math.PI);
        c.strokeStyle = sg === 0 ? '#ffffff' : '#bfe8ff';
        c.lineWidth = 2.2 - sg * 0.3;
        c.beginPath();
        c.moveTo(sxx + sg * 9, syy - sg * 2.6);
        c.lineTo(sxx + sg * 9 + 9, syy - sg * 2.6 - 2.6);
        c.stroke();
      }
      c.restore();
    }
    c.drawImage(cv, VIEW.x, top);
    var ox = VIEW.x;
    for (var i = 0; i < TOWN_ITEMS.length; i++) {
      var it = TOWN_ITEMS[i];
      var x = it.x;
      if (x < ox - 120 || x > ox + VIEW.w + 120) continue;
      if (it.k === 'ant') {
        c.fillStyle = Math.sin(t * 0.07 + it.x) > 0 ? '#ff3344' : '#5a1020';
        c.beginPath(); c.arc(x, gy - it.h - 2, 2, 0, Math.PI * 2); c.fill();
      } else if (it.k === 'dome') {
        c.fillStyle = Math.sin(t * 0.05 + it.x) > -0.2 ? '#44ffff' : '#1a7a7a';
        c.beginPath(); c.arc(x, gy - 130, 2.6, 0, Math.PI * 2); c.fill();
      } else if (it.k === 'rocket') {
        c.fillStyle = Math.sin(t * 0.1) > 0 ? '#44ff88' : '#1a5a30';
        c.beginPath(); c.arc(x + 29, gy - 48, 1.8, 0, Math.PI * 2); c.fill();
      }
    }
  }

  function drawTitleScreen(c) {
    titleAnimTimer++;

    drawSpaceBackdrop(c);

    /* On a tablet the view is wider and taller than the viewport, so the
       planets and Momoko move out into the bezel and frame the menu
       instead of crowding the title. */
    var wide = VIEW.w > W + 100;
    if (wide) {
      var vr = VIEW.x + VIEW.w, vb = VIEW.y + VIEW.h;
      drawShadedPlanet(c, vr - 150, VIEW.y + 140, 62, '#ffc2ee', '#c43e9a', '#ffd24a');
      drawShadedPlanet(c, vr - 60, VIEW.y + 270, 16, '#c8fbff', '#3a8fb8', null);
      drawShadedPlanet(c, vr - 170, vb - 250, 34, '#fff1a8', '#d69a1e', null);
    } else {
      clipGame(c);
      /* Ringed home planet and a little moon in the upper-right */
      drawShadedPlanet(c, W - 110, 86, 40, '#ffc2ee', '#c43e9a', '#ffd24a');
      drawShadedPlanet(c, W - 44, 170, 11, '#c8fbff', '#3a8fb8', null);
    }
    /* Moon town along the bottom of the view */
    drawTitleTown(c, titleAnimTimer);
    /* Version stamp in the bottom-right corner of the screen (not the
       viewport) – drawn after the town so the ground doesn't cover it */
    drawViewStamp(c, '#9ab4d4');

    /* Momoko drifting above the town on the left, trailing sparkles */
    var bob = Math.sin(titleAnimTimer * 0.04) * 8;
    /* Halfway between the screen edge and the buttons */
    var mx = wide ? (VIEW.x + W / 2 - 90) / 2 : 150;
    var my = wide ? 300 : 226;
    var ms = wide ? 3.4 : 2.6;
    for (var sp = 0; sp < 6; sp++) {
      var age = (titleAnimTimer + sp * 12) % 72;
      c.save();
      c.globalAlpha = (1 - age / 72) * 0.8;
      c.fillStyle = sp % 2 ? '#ffd24a' : '#ff99dd';
      c.beginPath();
      c.arc(mx - ms * 11.5 - age * 0.9, my + bob + Math.sin(age * 0.2 + sp) * 6, 2.5 - age / 40, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    c.save();
    c.translate(mx, my + bob);
    c.rotate(Math.sin(titleAnimTimer * 0.02) * 0.08);
    c.scale(ms, ms);
    drawMomokoPreview(c, Game.customization);
    c.restore();
    if (wide) clipGame(c);

    /* Title text */
    var title = Game.i18n.t('title');
    c.save();
    /* Keep clear of the ringed planet's ring on the right (the Japanese
       title is much wider than the English one). */
    fitFont(c, title, 500, 44, 'bold');
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    /* Shadow + outline */
    c.fillStyle = '#220044';
    c.fillText(title, W / 2 + 2, 104);
    c.lineJoin = 'round';
    c.lineWidth = 7;
    c.strokeStyle = '#2a0b55';
    c.strokeText(title, W / 2, 100);
    /* Main – lit from above: pale at the cap, deeper toward the foot */
    var tg = c.createLinearGradient(0, 78, 0, 122);
    tg.addColorStop(0, '#e2ffff');
    tg.addColorStop(0.45, '#44ffff');
    tg.addColorStop(1, '#22a8f0');
    c.fillStyle = tg;
    c.fillText(title, W / 2, 100);
    /* Glow */
    c.shadowColor = '#ff66cc';
    c.shadowBlur = 16;
    c.fillText(title, W / 2, 100);
    c.restore();

    /* Subtitle */
    c.font = '15px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'center';
    c.lineJoin = 'round';
    c.lineWidth = 4;
    c.strokeStyle = 'rgba(26, 8, 60, 0.75)';
    c.strokeText(Game.i18n.t('titleSubtitle'), W / 2, 150);
    c.fillStyle = '#ffd24a';
    c.fillText(Game.i18n.t('titleSubtitle'), W / 2, 150);

    /* Buttons */
    drawButton(c, Game.i18n.t('play'), W / 2 - 90, 200, 180, 44, false, 'primary');
    drawButton(c, Game.i18n.t('howToPlay'), W / 2 - 90, 260, 180, 44);
    drawButton(c, Game.i18n.t('language') + ': ' + Game.i18n.t('langLabel'), W / 2 - 90, 320, 180, 44);

    /* Sound toggle */
    var muteLabel = Game.i18n.t(Game.audio.isMuted() ? 'soundOff' : 'soundOn');
    drawButton(c, muteLabel, W / 2 - 90, 380, 180, 36);


    /* Instructions overlay flag */
    return false;
  }

  var showInstructions = false;

  /* OK button on the How to Play card — shared by draw and hit test. */
  var HOWTO_OK = { x: W / 2 - 60, y: 318, w: 120, h: 40 };

  /* Little pictograms for the How to Play rows: 0 arrows, 1 talk, 2 star. */
  function drawHowToIcon(c, kind, x, y) {
    c.save();
    c.translate(x, y);
    c.fillStyle = 'rgba(102, 204, 255, 0.14)';
    c.beginPath(); c.arc(0, 0, 22, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#66ccff';
    c.lineWidth = 1.5;
    c.stroke();
    if (kind === 0) {
      c.fillStyle = '#dff4ff';
      for (var a = 0; a < 4; a++) {
        c.save();
        c.rotate(a * Math.PI / 2);
        c.beginPath(); c.moveTo(0, -15); c.lineTo(6, -8); c.lineTo(-6, -8); c.closePath(); c.fill();
        c.restore();
      }
      c.beginPath(); c.arc(0, 0, 3, 0, Math.PI * 2); c.fill();
    } else if (kind === 1) {
      c.fillStyle = '#ff99dd';
      roundRect(c, -13, -11, 26, 17, 6);
      c.fill();
      c.beginPath(); c.moveTo(-5, 5); c.lineTo(-9, 12); c.lineTo(1, 5); c.closePath(); c.fill();
      c.fillStyle = '#3a1458';
      for (var d = -1; d <= 1; d++) { c.beginPath(); c.arc(d * 6, -3, 2, 0, Math.PI * 2); c.fill(); }
    } else {
      c.fillStyle = '#ffd24a';
      c.beginPath();
      for (var p = 0; p < 10; p++) {
        var r = p % 2 ? 6 : 14, ang = -Math.PI / 2 + p * Math.PI / 5;
        c.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
      }
      c.closePath(); c.fill();
    }
    c.restore();
  }

  function drawInstructionsOverlay(c) {
    c.save();
    /* The title buttons underneath aren't clickable while this is up. */
    anyHot = false;
    c.fillStyle = 'rgba(5, 2, 18, 0.7)';
    c.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    var px = 150, py = 70, pw = W - 300, ph = 310;
    drawPanel(c, px, py, pw, ph, 16, '#b07cff', 'rgba(52, 22, 108, 0.98)', 'rgba(22, 8, 52, 0.98)');
    c.fillStyle = '#66ccff';
    c.font = 'bold 24px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(Game.i18n.t('howToPlay'), W / 2, py + 34);
    /* One row per instruction line, each with its own pictogram. */
    var rows = Game.i18n.t('instructions').split('\n');
    c.textAlign = 'left';
    for (var i = 0; i < rows.length; i++) {
      var ry = py + 90 + i * 58;
      if (i > 0) {
        c.fillStyle = 'rgba(176, 124, 255, 0.18)';
        c.fillRect(px + 30, ry - 29, pw - 60, 1);
      }
      drawHowToIcon(c, Math.min(i, 2), px + 60, ry);
      c.fillStyle = '#e6eeff';
      fitFont(c, rows[i], pw - 130, 16, '');
      c.fillText(rows[i], px + 96, ry + 1);
    }
    c.textBaseline = 'alphabetic';
    drawButton(c, 'OK', HOWTO_OK.x, HOWTO_OK.y, HOWTO_OK.w, HOWTO_OK.h);
    c.restore();
  }

  /* Title click handler – returns action string or null */
  function handleTitleClick(mx, my) {
    if (showInstructions) {
      if (hitButton(mx, my, HOWTO_OK.x, HOWTO_OK.y, HOWTO_OK.w, HOWTO_OK.h)) {
        showInstructions = false;
        Game.audio.play('select');
        return null;
      }
      return null;
    }
    if (hitButton(mx, my, W / 2 - 90, 200, 180, 44)) { Game.audio.play('select'); return 'play'; }
    if (hitButton(mx, my, W / 2 - 90, 260, 180, 44)) { Game.audio.play('select'); showInstructions = true; return null; }
    if (hitButton(mx, my, W / 2 - 90, 320, 180, 44)) { Game.audio.play('select'); Game.i18n.toggleLanguage(); return null; }
    if (hitButton(mx, my, W / 2 - 90, 380, 180, 36)) { Game.audio.toggleMute(); return null; }
    return null;
  }

  /* (No HUD — exploration game; quest progress lives in drawQuestHUD.) */

  /* ---- Pause Menu ---- */
  var pauseFlossTimer = 0;
  function drawPauseMenu(c) {
    pauseFlossTimer++;
    c.save();
    c.fillStyle = 'rgba(10, 4, 32, 0.82)';
    c.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    /* Card behind the menu, the same violet panel as the travel menu */
    var pcx = W / 2 - 40, pcy = 78, pcw = 300, pch = 338;
    drawPanel(c, pcx, pcy, pcw, pch, 16, '#ff66cc', '#34166c', '#160834', 3);
    c.fillStyle = '#44ffff';
    c.font = 'bold 32px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'center';
    c.shadowColor = 'rgba(255, 102, 204, 0.6)';
    c.shadowBlur = 12;
    c.fillText(Game.i18n.t('paused'), W / 2 + 110, 130);
    c.shadowBlur = 0;

    /* Floss-dance Momoko – phase advances at ~1.7Hz and the pose math
       smooths the beat with a tanh sigmoid so she transitions between
       sides across several frames instead of snapping between two.
       Placed to the left of the menu buttons so she's visible but not
       competing for space. */
    if (Game.entities && Game.entities.drawMomokoFloss) {
      c.save();
      c.translate(170, 220);
      c.scale(3.5, 3.5);
      Game.entities.drawMomokoFloss(c, 0, 0, Game.customization, pauseFlossTimer * 0.18);
      c.restore();
    }

    drawButton(c, Game.i18n.t('resume'), W / 2 - 10, 170, 220, 44, false, 'primary');
    drawButton(c, Game.i18n.t('language') + ': ' + Game.i18n.t('langLabel'), W / 2 - 10, 230, 220, 44);
    var muteLabel = Game.i18n.t(Game.audio.isMuted() ? 'soundOff' : 'soundOn');
    drawButton(c, muteLabel, W / 2 - 10, 290, 220, 44);
    drawButton(c, Game.i18n.t('quit'), W / 2 - 10, 350, 220, 44);

    /* Version stamp – matches the title-screen stamp so we can tell at a
       glance which build is paused (handy for bug reports). */
    drawViewStamp(c, '#6688aa');
    c.restore();
  }

  function handlePauseClick(mx, my) {
    if (hitButton(mx, my, W / 2 - 10, 170, 220, 44)) { Game.audio.play('select'); return 'resume'; }
    if (hitButton(mx, my, W / 2 - 10, 230, 220, 44)) { Game.audio.play('select'); Game.i18n.toggleLanguage(); return null; }
    if (hitButton(mx, my, W / 2 - 10, 290, 220, 44)) { Game.audio.toggleMute(); return null; }
    if (hitButton(mx, my, W / 2 - 10, 350, 220, 44)) { Game.audio.play('select'); return 'quit'; }
    return null;
  }

  /* ---- QR code ----
     Pre-computed Version-4 QR matrix (33×33 modules, error-correction
     level M) encoding the game's public URL. Generated offline; see the
     commit notes. Rendered in canvas-space so it sits in the empty
     upper-right strip area, inviting someone else to scan and play. */
  var QR_URL = 'https://ruck314.github.io/momoko-in-space/';
  var QR_SIZE = 33;
  var QR_ROWS = [
    '111111100010000010111011101111111',
    '100000100101100110101110001000001',
    '101110101111101110001111101011101',
    '101110101111000000100010101011101',
    '101110101111011110001111101011101',
    '100000101000111001110100101000001',
    '111111101010101010101010101111111',
    '000000001000101010111111100000000',
    '101111100011011001111000001111100',
    '110010001110010011111111101101101',
    '011010101000011111000010000010100',
    '101110001011010011100111101011111',
    '110101100010001010010011010011000',
    '010101011111000101100101011001011',
    '110100100001101111001110011001110',
    '011000010010101100111100011001100',
    '001101110101101101010000110111001',
    '111100011111110010111001011101111',
    '101001101011101110100010010110110',
    '101001001110111110001111111111111',
    '010110111011100000100010110111011',
    '110000000111011111010011001001101',
    '100011101101101000100010100101110',
    '101101010011110010001100001001111',
    '100001111010111001001010111110000',
    '000000001010010011111100100010101',
    '111111100001101111001001101010110',
    '100000101111100011100101100011111',
    '101110101101011010010010111111001',
    '101110101001010101111101110011011',
    '101110101011101111000011111100000',
    '100000100101001100001111000011100',
    '111111101100110101110011110100010',
  ];

  /* Paints the QR code centered in the rect (cx, cy, size) with a white
     quiet zone so scanners don't choke on adjacent canvas colour. */
  function drawQRCode(c, cx, cy, size) {
    var quiet = 4; /* modules of white padding around the code */
    var totalModules = QR_SIZE + quiet * 2;
    var cell = Math.floor(size / totalModules);
    if (cell < 1) cell = 1;
    var rendered = cell * totalModules;
    var x0 = Math.round(cx - rendered / 2);
    var y0 = Math.round(cy - rendered / 2);
    c.save();
    /* White background (includes quiet zone) */
    c.fillStyle = '#ffffff';
    c.fillRect(x0, y0, rendered, rendered);
    c.fillStyle = '#000000';
    for (var r = 0; r < QR_SIZE; r++) {
      var row = QR_ROWS[r];
      for (var q = 0; q < QR_SIZE; q++) {
        if (row.charAt(q) === '1') {
          c.fillRect(
            x0 + (q + quiet) * cell,
            y0 + (r + quiet) * cell,
            cell, cell
          );
        }
      }
    }
    /* "SCAN" caption below */
    c.fillStyle = '#cfe6ff';
    c.font = 'bold 10px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillText('SCAN TO PLAY', cx, y0 + rendered + 14);
    c.restore();
  }

  /* ---- Dialogue Box ----
     Drawn in canvas-space (NOT game-space) so it lives in the bottom
     bezel area on touch devices and doesn't obscure gameplay. Caller
     supplies the canvas dimensions and where the game viewport sits
     inside them; the box floats below the viewport if there's bezel
     room, otherwise it hugs the bottom of the gameplay area with
     reduced height. */
  function drawDialogue(c, speaker, text, cw, ch, gx, gy, portrait) {
    /* Back-compat: if canvas dims aren't supplied, fall back to
       in-viewport rendering at the bottom of the gameplay area. */
    if (cw == null) { cw = W; ch = H; gx = 0; gy = 0; }
    var gameBottom = gy + H;
    var bezelBelow = Math.max(0, ch - gameBottom);
    var boxH, boxY;
    var topDock = false;
    if (bezelBelow >= 56) {
      /* Sits fully in the bottom bezel */
      boxH = Math.min(bezelBelow - 8, 90);
      boxY = gameBottom + Math.max(4, (bezelBelow - boxH) / 2);
    } else if (bezelBelow > 0) {
      /* Overflow into the bezel plus a small fade over the game edge */
      boxH = Math.min(56 + bezelBelow, 80);
      boxY = ch - boxH - 4;
    } else {
      /* No bezel — dock at the top of the sky. Momoko and whoever she is
         talking to stand on the ground, so the bottom would hide them. */
      topDock = true;
      boxH = 56;
      boxY = gy + 16;
    }
    /* Narrower when docked on top so the quest HUD stays clear. */
    var boxW = Math.min(topDock ? 500 : 560, cw - 40);
    var boxX = (cw - boxW) / 2;

    c.save();
    /* Speaker portrait sits in a circle at the left; text starts after it. */
    var textX = boxX + 66;
    /* Size the box to the text so a third line never spills out. The
       bottom edge stays where the layout above put it. */
    c.font = '14px ' + FONT;
    var lines = layoutLines(c, text, boxX + boxW - 16 - textX);
    var need = 34 + lines.length * 19 + 10;
    if (need > boxH) { if (!topDock) boxY -= need - boxH; boxH = need; }

    /* The same card as the pause and travel menus; the colours below
       match its top (with the sheen) and bottom edges for the tail. */
    drawPanel(c, boxX, boxY, boxW, boxH, 12, '#b07cff', 'rgba(52, 22, 108, 0.96)', 'rgba(18, 8, 44, 0.96)');
    c.fillStyle = topDock ? 'rgb(18, 8, 44)' : 'rgb(78, 52, 127)';
    /* Tail: points down at the scene when docked on top, up at the game
       when the box lives in the bottom bezel. */
    var tx = boxX + boxW / 2;
    c.beginPath();
    if (topDock) {
      c.moveTo(tx - 9, boxY + boxH - 1); c.lineTo(tx, boxY + boxH + 10); c.lineTo(tx + 9, boxY + boxH - 1);
    } else {
      c.moveTo(tx - 9, boxY + 1); c.lineTo(tx, boxY - 10); c.lineTo(tx + 9, boxY + 1);
    }
    c.closePath();
    c.fill();
    c.strokeStyle = '#b07cff';
    c.lineWidth = 2;
    c.lineJoin = 'round';
    c.beginPath();
    if (topDock) {
      c.moveTo(tx - 9, boxY + boxH); c.lineTo(tx, boxY + boxH + 10); c.lineTo(tx + 9, boxY + boxH);
    } else {
      c.moveTo(tx - 9, boxY); c.lineTo(tx, boxY - 10); c.lineTo(tx + 9, boxY);
    }
    c.stroke();
    roundRect(c, boxX, boxY, boxW, boxH, 12);
    c.stroke();
    /* Hide the box edge behind the tail base */
    c.fillStyle = topDock ? 'rgb(18, 8, 44)' : 'rgb(78, 52, 127)';
    c.fillRect(tx - 7, topDock ? boxY + boxH - 2 : boxY - 1, 14, 3);

    /* Portrait circle */
    var avx = boxX + 34, avy = boxY + 18 + Math.max(0, (boxH - 44) / 2);
    c.fillStyle = 'rgba(0, 0, 0, 0.3)';
    c.beginPath(); c.arc(avx, avy + 2, 22, 0, Math.PI * 2); c.fill();
    var ag = c.createRadialGradient(avx - 6, avy - 8, 2, avx, avy, 22);
    ag.addColorStop(0, '#3a1a70');
    ag.addColorStop(1, '#180838');
    c.fillStyle = ag;
    c.beginPath(); c.arc(avx, avy, 22, 0, Math.PI * 2); c.fill();
    if (portrait && portrait.draw && portrait.w) {
      c.save();
      c.beginPath(); c.arc(avx, avy, 20, 0, Math.PI * 2); c.clip();
      var ps = Math.max(1, Math.min(1.5, 34 / Math.max(portrait.w, portrait.h)));
      c.translate(avx, avy + 1);
      c.scale(ps, ps);
      portrait.draw(c, portrait.x + portrait.w / 2, portrait.y + portrait.h / 2);
      c.restore();
    }
    c.beginPath(); c.arc(avx, avy, 22, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(255, 102, 204, 0.25)';
    c.lineWidth = 6;
    c.stroke();
    c.strokeStyle = '#ff66cc';
    c.lineWidth = 2;
    c.stroke();

    /* Speaker name tag */
    c.font = 'bold 14px ' + FONT;
    var tagW = c.measureText(speaker).width + 20;
    c.fillStyle = 'rgba(4, 0, 20, 0.4)';
    roundRect(c, textX - 2, boxY - 8, tagW, 22, 11);
    c.fill();
    var tagG = c.createLinearGradient(0, boxY - 10, 0, boxY + 12);
    tagG.addColorStop(0, '#ff9be0');
    tagG.addColorStop(1, '#d83ea4');
    c.fillStyle = tagG;
    roundRect(c, textX - 2, boxY - 10, tagW, 22, 11);
    c.fill();
    c.fillStyle = 'rgba(255, 255, 255, 0.28)';
    roundRect(c, textX + 1, boxY - 8.5, tagW - 6, 9, 5);
    c.fill();
    c.fillStyle = '#ffffff';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(speaker, textX + 8, boxY + 1);

    /* Text */
    c.fillStyle = '#f0e8ff';
    c.font = '14px ' + FONT;
    c.textBaseline = 'alphabetic';
    for (var i = 0; i < lines.length; i++) {
      c.fillText(lines[i], textX, boxY + 34 + i * 19);
    }

    c.restore();
  }

  /* ---- Game Over Screen ---- */
  function drawGameOver(c) {
    c.save();
    c.fillStyle = 'rgba(20, 0, 0, 0.85)';
    c.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);

    c.fillStyle = '#ff3344';
    c.font = 'bold 40px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'center';
    c.fillText(Game.i18n.t('gameOver'), W / 2, 160);

    drawButton(c, Game.i18n.t('tryAgain'), W / 2 - 90, 240, 180, 48);
    c.restore();
  }

  function handleGameOverClick(mx, my) {
    if (hitButton(mx, my, W / 2 - 90, 240, 180, 48)) { Game.audio.play('select'); return 'retry'; }
    return null;
  }

  /* ---- Victory Screen ---- */
  var victoryParticles = [];
  var victoryTimer = 0;

  function drawVictory(c) {
    victoryTimer++;

    c.save();
    drawSpaceBackdrop(c);
    /* On a tablet the planets sit out toward the screen corners, as on
       the title, so the celebration fills the screen. */
    if (VIEW.w > W + 100) {
      drawShadedPlanet(c, VIEW.x + 170, VIEW.y + VIEW.h - 200, 62, '#ffc2ee', '#c43e9a', '#ffd24a');
      drawShadedPlanet(c, VIEW.x + VIEW.w - 140, VIEW.y + 150, 38, '#fff1a8', '#d69a1e', null);
    } else {
      clipGame(c);
      drawShadedPlanet(c, 110, 380, 46, '#ffc2ee', '#c43e9a', '#ffd24a');
      drawShadedPlanet(c, W - 96, 360, 30, '#fff1a8', '#d69a1e', null);
    }
    /* The town she saved, along the bottom as on the title (drawn before
       the clip on tablets so it spans the whole screen) */
    drawTitleTown(c, victoryTimer);
    if (VIEW.w > W + 100) clipGame(c);

    /* Fireworks: round sparks that glow, fade, and leave short trails */
    if (victoryTimer % 24 === 1) {
      /* Burst to either side of the centred headline, not on top of it. */
      var fx = (Math.random() < 0.5 ? 70 : 560) + Math.random() * 170;
      var fy = 60 + Math.random() * 170;
      var colors = ['#ff6688', '#66ff99', '#66aaff', '#ffd24a', '#ff88dd', '#77ffee'];
      var col = colors[Math.floor(Math.random() * colors.length)];
      for (var i = 0; i < 28; i++) {
        var angle = (Math.PI * 2 * i) / 28;
        var sp = 1.6 + Math.random() * 1.4;
        victoryParticles.push({
          x: fx, y: fy, px: fx, py: fy,
          vx: Math.cos(angle) * sp,
          vy: Math.sin(angle) * sp,
          life: 50 + Math.random() * 20,
          maxLife: 70,
          color: i % 5 === 0 ? '#ffffff' : col,
          size: 1.6 + Math.random() * 1.6
        });
      }
    }

    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    for (var p = victoryParticles.length - 1; p >= 0; p--) {
      var part = victoryParticles[p];
      part.px = part.x;
      part.py = part.y;
      part.x += part.vx;
      part.y += part.vy;
      part.vx *= 0.98;
      part.vy = part.vy * 0.98 + 0.025;
      part.life--;
      if (part.life <= 0) { victoryParticles.splice(p, 1); continue; }
      var a = part.life / part.maxLife;
      c.globalAlpha = a;
      c.strokeStyle = part.color;
      c.lineWidth = part.size;
      c.beginPath();
      c.moveTo(part.px - part.vx * 3, part.py - part.vy * 3);
      c.lineTo(part.x, part.y);
      c.stroke();
      c.globalAlpha = a * 0.35;
      c.fillStyle = part.color;
      c.beginPath();
      c.arc(part.x, part.y, part.size * 2.4, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';

    /* Momoko dancing in celebration */
    if (Game.entities && Game.entities.drawMomokoFloss) {
      c.save();
      c.translate(W / 2, 290 + Math.abs(Math.sin(victoryTimer * 0.09)) * -6);
      c.scale(2.6, 2.6);
      Game.entities.drawMomokoFloss(c, 0, 0, Game.customization, victoryTimer * 0.18);
      c.restore();
    }

    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = 'bold 48px ' + FONT;
    c.lineJoin = 'round';
    c.lineWidth = 7;
    c.strokeStyle = '#4a1f00';
    c.strokeText(Game.i18n.t('victory'), W / 2, 74);
    c.fillStyle = '#ffd24a';
    c.shadowColor = '#ffaa00';
    c.shadowBlur = 18;
    c.fillText(Game.i18n.t('victory'), W / 2, 74);
    c.shadowBlur = 0;

    c.lineWidth = 5;
    c.strokeStyle = 'rgba(20, 6, 48, 0.85)';
    c.fillStyle = '#9fe6ff';
    fitFont(c, Game.i18n.t('savedOcean'), W - 80, 22, 'bold');
    c.strokeText(Game.i18n.t('savedOcean'), W / 2, 128);
    c.fillText(Game.i18n.t('savedOcean'), W / 2, 128);

    c.fillStyle = '#e6dcff';
    c.font = '16px ' + FONT;
    c.lineWidth = 4;
    c.strokeText(Game.i18n.t('thanks'), W / 2, 160);
    c.fillText(Game.i18n.t('thanks'), W / 2, 160);

    drawButton(c, Game.i18n.t('playAgain'), W / 2 - 100, 400, 200, 48, false, 'primary');
    c.restore();
  }

  function handleVictoryClick(mx, my) {
    if (hitButton(mx, my, W / 2 - 100, 400, 200, 48)) {
      Game.audio.play('select');
      victoryParticles = [];
      victoryTimer = 0;
      return 'restart';
    }
    return null;
  }

  /* ---- Customization Screen ----
     Layout follows the sketch the user's daughter drew:
       - Title at top
       - Momoko preview on the left side (live, animated, and she does a
         little cheer whenever something changes)
       - Two rows of category tabs along the top-right
       - A grid of picture cards, two rows of five, each showing the
         option painted by the hero renderer itself (a close crop of
         Momoko wearing it, or the item on its own); categories with more
         than ten options page with arrows
       - Color swatches below the grid when the current tab has a color
       - Start button at the bottom
     On a tablet the whole layout is drawn larger, centred in the screen,
     so the cards and swatches are comfortable to tap. */
  var hairColors = ['#e06088', '#4a3728', '#f5d060', '#f08a3c', '#cc3333', '#4488ff', '#4ccfa8', '#b088e8', '#222222', '#eae6f6'];
  var suitColors = ['#e06088', '#ff8fb8', '#cc3333', '#dd7722', '#f2c230', '#228844', '#38b8d0', '#3366aa', '#7733aa', '#f0eefa'];
  var shoeColors = ['#ff99cc', '#ff5a5a', '#ffcc44', '#33bb77', '#38b8d0', '#66aaff', '#b088e8', '#ffffff', '#552211', '#2a2a44'];
  var eyeColors  = ['#9a3c68', '#d83a4a', '#c88a2a', '#6a4a2a', '#3aa860', '#2ab8b0', '#3a7ae0', '#8a5ae0', '#5a6478'];
  var glassColors = ['#5ee8ff', '#8af0b0', '#ffd86a', '#ff9a6a', '#ff8fd0', '#c8a8ff', '#ffffff'];
  var skinTones  = ['#ffe0c0', '#f3c9a5', '#ddb896', '#c68c5a', '#8d6e4c', '#5c3d2e'];

  /* Tab definitions. `field` is the key inside Game.customization this tab
     writes to; `colorField` (optional) adds a swatch row below the grid,
     drawn as `swatch` (a lock of hair, a patch of cloth, ...). `crop` is
     the window of Momoko's 28x34 sprite box shown on each card (x, y, w,
     h) and `bare` leaves her helmet off so the hair or face shows; tabs
     without a crop draw the item on its own. `zoom` brings the big
     preview closer (or back) while the tab is open. */
  var CROP_HAIR = [-4.5, -4.8, 37, 26.2], CROP_FACE = [3.2, 4.6, 21.6, 15.3], CROP_BODY = [1.5, 17.6, 25, 17.7],
      CROP_HELMET = [-3.5, -14.8, 35, 24.8];
  var customTabs = [
    { id: 'hair',  label: 'tabHair',  field: 'hairStyle', colorField: 'hair',    colors: hairColors, swatch: 'hair',
      colorLabel: 'hairColor', crop: CROP_HAIR, bare: true, zoom: 1.1,
      variants: [
        { id: 'twinTails',  label: 'varTwinTails' },
        { id: 'longBraids', label: 'varLongBraids' },
        { id: 'buns',       label: 'varBuns' },
        { id: 'ponytail',   label: 'varPonytail' },
        { id: 'bob',        label: 'varBob' },
        { id: 'sideTail',   label: 'varSideTail' },
        { id: 'ringlets',   label: 'varRinglets' },
        { id: 'longHair',   label: 'varLongHair' },
        { id: 'pixie',      label: 'varPixie' },
        { id: 'puffs',      label: 'varPuffs' },
      ] },
    { id: 'face',  label: 'tabFace',  field: 'face',      colorField: 'eyes',    colors: eyeColors, swatch: 'eyes',
      colorLabel: 'eyeColor', crop: CROP_FACE, bare: true, zoom: 1.16,
      variants: [
        { id: 'none',        label: 'varNone' },
        { id: 'glasses',     label: 'varGlasses' },
        { id: 'starShades',  label: 'varStarShades' },
        { id: 'freckles',    label: 'varFreckles' },
        { id: 'heartCheeks', label: 'varHeartCheeks' },
        { id: 'starPaint',   label: 'varStarPaint' },
      ] },
    { id: 'dress', label: 'tabDress', field: 'outfit',    colorField: 'suit',    colors: suitColors, swatch: 'cloth',
      colorLabel: 'suitColor', crop: CROP_BODY,
      variants: [
        { id: 'frillyDress', label: 'varFrillyDress' },
        { id: 'sailorDress', label: 'varSailorDress' },
        { id: 'starDress',   label: 'varStarDress' },
        { id: 'galaxyDress', label: 'varGalaxyDress' },
        { id: 'tutu',        label: 'varTutu' },
        { id: 'gown',        label: 'varGown' },
        { id: 'yukata',      label: 'varYukata' },
        { id: 'snowDress',   label: 'varSnowDress' },
      ] },
    { id: 'swim',  label: 'tabSwim',  field: 'outfit',    colorField: 'suit',    colors: suitColors, swatch: 'cloth',
      colorLabel: 'suitColor', crop: CROP_BODY,
      variants: [
        { id: 'sailorSwimsuit', label: 'varSailorSwimsuit' },
        { id: 'onePiece',       label: 'varOnePiece' },
        { id: 'frillyBikini',   label: 'varFrillyBikini' },
        { id: 'puffySuit',      label: 'varPuffySuit' },
        { id: 'pilot',          label: 'varPilot' },
        { id: 'mech',           label: 'varMech' },
        { id: 'kitty',          label: 'varKitty' },
        { id: 'rainbow',        label: 'varRainbow' },
      ] },
    { id: 'shoes', label: 'tabShoes', field: 'shoes',     colorField: 'flipper', colors: shoeColors, swatch: 'boot',
      colorLabel: 'tabShoes', icon: 'shoe',
      variants: [
        { id: 'maryJane',      label: 'varMaryJane' },
        { id: 'sneaker',       label: 'varSneaker' },
        { id: 'flipper',       label: 'varFlipper' },
        { id: 'rocketBoots',   label: 'varRocketBoots' },
        { id: 'starBoots',     label: 'varStarBoots' },
        { id: 'springBoots',   label: 'varSpringBoots' },
        { id: 'bunnySlippers', label: 'varBunnySlippers' },
        { id: 'rollerSkates',  label: 'varRollerSkates' },
        { id: 'wingBoots',     label: 'varWingBoots' },
      ] },
    { id: 'helmet', label: 'tabHelmet', field: 'helmet',  colorField: 'glass',   colors: glassColors, swatch: 'glass',
      colorLabel: 'glassColor', crop: CROP_HELMET, zoom: 1.06,
      variants: [
        { id: 'bubble',     label: 'varHelmBubble' },
        { id: 'catEars',    label: 'varHelmCat' },
        { id: 'bunnyEars',  label: 'varHelmBunny' },
        { id: 'antenna',    label: 'varHelmAntenna' },
        { id: 'visor',      label: 'varHelmVisor' },
        { id: 'planetRing', label: 'varHelmRing' },
        { id: 'crown',      label: 'varHelmCrown' },
        { id: 'propeller',  label: 'varHelmPropeller' },
        { id: 'bigBow',     label: 'varHelmBow' },
      ] },
    { id: 'gear',  label: 'tabGear',  field: 'gear',      colorField: null, colors: null, icon: 'gear',
      variants: [
        { id: 'none',      label: 'varNone' },
        { id: 'jetpack',   label: 'varJetpack' },
        { id: 'bunnyPack', label: 'varBunnyPack' },
        { id: 'starCape',  label: 'varStarCape' },
        { id: 'scarf',     label: 'varScarf' },
        { id: 'starBadge', label: 'varStarBadge' },
        { id: 'wings',     label: 'varWings' },
        { id: 'backBow',   label: 'varBackBow' },
        { id: 'satchel',   label: 'varSatchel' },
        { id: 'hoverRing', label: 'varHoverRing' },
      ] },
    { id: 'crab',  label: 'tabCrab',  field: 'crab',      colorField: null, colors: null, icon: 'pet', zoom: 0.94,
      variants: [
        { id: 'none',   label: 'varNone' },
        { id: 'red',    label: 'varCrabRed' },
        { id: 'blue',   label: 'varCrabBlue' },
        { id: 'gold',   label: 'varCrabGold' },
        { id: 'fluffy', label: 'varCrabFluffy' },
        { id: 'husky',  label: 'varCrabHusky' },
        { id: 'robo',   label: 'varCrabRobo' },
        { id: 'star',   label: 'varCrabStar' },
      ] },
    { id: 'food',  label: 'tabFood',  field: 'food',      colorField: null, colors: null, icon: 'held',
      variants: [
        { id: 'none',        label: 'varNone' },
        { id: 'starWand',    label: 'varStarWand' },
        { id: 'balloon',     label: 'varBalloon' },
        { id: 'starFlag',    label: 'varStarFlag' },
        { id: 'lantern',     label: 'varLantern' },
        { id: 'plushie',     label: 'varPlushie' },
        { id: 'iceCream',    label: 'varIceCream' },
        { id: 'lollipop',    label: 'varLollipop' },
        { id: 'cottonCandy', label: 'varCottonCandy' },
        { id: 'donut',       label: 'varDonut' },
        { id: 'crepe',       label: 'varCrepe' },
        { id: 'parfait',     label: 'varParfait' },
        { id: 'macaron',     label: 'varMacaron' },
        { id: 'strawberry',  label: 'varStrawberry' },
        { id: 'onigiri',     label: 'varOnigiri' },
        { id: 'taiyaki',     label: 'varTaiyaki' },
        { id: 'dango',       label: 'varDango' },
      ] },
  ];

  var customSelection = { tab: 'hair', page: {} };

  /* ---- Layout constants (shared by draw + hit-test) ---- */
  var PANEL_X = 316, PANEL_W = 474;
  var TAB_Y = 42, TAB_H = 40, TAB_GAP = 4, TAB_ROW1 = 5;
  var GRID_Y = 132, GRID_COLS = 5, GRID_ROWS = 2, GRID_TILE_W = 90, GRID_TILE_H = 88, GRID_GAP = 6;
  var PER_PAGE = GRID_COLS * GRID_ROWS;
  var ROW_H = 40, ROW_GAP = 2;
  var COLOR_X = PANEL_X + 66, COLOR_STEP = 41, SWATCH_R = 15;
  var PAGER_W = 64;
  var START_BTN_W = 200, START_BTN_H = 46;
  var START_BTN_X = PANEL_X + PANEL_W / 2 - START_BTN_W / 2;
  var START_BTN_Y = 420;

  /* How much larger the layout is drawn than the 800x480 window, and
     where its corner lands: 1 and (0, 0) on a desktop, up to 1.5x and
     centred when the view covers a whole tablet screen. */
  var custXf = { k: 1, x: 0, y: 0 };
  function customLayout() {
    var k = Math.min(1.5, VIEW.w / (W + 24), VIEW.h / (H + 16));
    if (k < 1.02) k = 1;
    custXf.k = k;
    custXf.x = VIEW.x + VIEW.w / 2 - W * k / 2;
    custXf.y = VIEW.y + VIEW.h / 2 - H * k / 2;
  }

  function getTab(id) {
    for (var i = 0; i < customTabs.length; i++) if (customTabs[i].id === id) return customTabs[i];
    return customTabs[0];
  }
  /* Five tabs across the first row, the rest share the second. */
  function tabRect(i) {
    var row = i < TAB_ROW1 ? 0 : 1, n = row ? customTabs.length - TAB_ROW1 : TAB_ROW1, col = row ? i - TAB_ROW1 : i;
    var w = (PANEL_W - (n - 1) * TAB_GAP) / n;
    return [PANEL_X + col * (w + TAB_GAP), TAB_Y + row * (TAB_H + TAB_GAP), w];
  }
  function pageCount(tab) { return Math.max(1, Math.ceil(tab.variants.length / PER_PAGE)); }
  function curPage(tab) {
    var p = customSelection.page[tab.id] || 0;
    return Math.min(p, pageCount(tab) - 1);
  }
  function tileRect(k) {
    return [PANEL_X + (k % GRID_COLS) * (GRID_TILE_W + GRID_GAP), GRID_Y + Math.floor(k / GRID_COLS) * (GRID_TILE_H + GRID_GAP)];
  }
  /* The rows under the grid, top to bottom: the pager on tabs with more
     than one page, the tab's own colours, then skin tones (always). */
  function rowsFor(tab) {
    var rows = [];
    if (pageCount(tab) > 1) rows.push({ pager: true });
    if (tab.colorField) rows.push({ field: tab.colorField, colors: tab.colors, swatch: tab.swatch, label: tab.colorLabel });
    rows.push({ field: 'skin', colors: skinTones, swatch: 'skin', label: 'skinTone' });
    var y = GRID_Y + GRID_ROWS * (GRID_TILE_H + GRID_GAP) + 2;
    for (var i = 0; i < rows.length; i++) { rows[i].y = y; y += ROW_H + ROW_GAP; }
    return rows;
  }

  /* ---- Option previews ----
     Each card shows its option painted by the real hero renderer (a
     close crop of Momoko wearing it, in her current colours) or the item
     itself, rendered once per look at device resolution and kept until
     the look changes. */
  var PV_W = GRID_TILE_W - 8, PV_H = 62;
  var previewCache = {}, previewN = 0;
  function cardCust(tab, v) {
    var cu = {};
    for (var k in Game.customization) cu[k] = Game.customization[k];
    cu[tab.field] = v.id;
    /* nothing in her hands or on her back to hide what the card is about */
    if (tab.crop) { cu.food = 'none'; cu.gear = 'none'; }
    return cu;
  }
  function paintNone(g) {
    var cx = PV_W / 2, cy = PV_H / 2 + 1;
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(10, 2, 36, 0.5)';
    g.lineWidth = 5.5;
    g.beginPath(); g.arc(cx, cy + 1.5, 15, 0, Math.PI * 2); g.stroke();
    var lg = g.createLinearGradient(0, cy - 16, 0, cy + 16);
    lg.addColorStop(0, '#f0e6ff');
    lg.addColorStop(1, '#9a86d8');
    g.strokeStyle = lg;
    g.lineWidth = 4;
    g.beginPath(); g.arc(cx, cy, 15, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(cx - 10.2, cy + 10.2); g.lineTo(cx + 10.2, cy - 10.2); g.stroke();
    g.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, 16.3, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
  }
  function optionPreview(c, tab, v) {
    var k = c.getTransform().d || 1;
    var cu = cardCust(tab, v), rc = Game.momoko.readCust(cu);
    var key = tab.id + v.id + k;
    for (var f in rc) key += rc[f];
    var cv = previewCache[key];
    if (cv) return cv;
    if (previewN > 200) { previewCache = {}; previewN = 0; }
    cv = document.createElement('canvas');
    cv.width = Math.ceil(PV_W * k);
    cv.height = Math.ceil(PV_H * k);
    var g = cv.getContext('2d');
    g.scale(k, k);
    if (v.id === 'none' && !tab.crop) {
      paintNone(g);
    } else if (tab.crop) {
      var cr = tab.crop, sc = Math.min(PV_W / cr[2], PV_H / cr[3]);
      g.translate(PV_W / 2 - (cr[0] + cr[2] / 2) * sc, PV_H / 2 - (cr[1] + cr[3] / 2) * sc);
      g.scale(sc, sc);
      Game.momoko.paint(g, 0, 0, cu, { bare: tab.bare });
    } else {
      /* the item on its own, standing on a soft shadow */
      g.fillStyle = 'rgba(8, 2, 30, 0.42)';
      g.beginPath(); g.ellipse(PV_W / 2, PV_H - 5.5, 22, 3.6, 0, 0, Math.PI * 2); g.fill();
      if (tab.icon === 'pet') {
        g.translate(PV_W / 2 + 2, PV_H - 22);
        g.scale(2.9, 2.9);
        Game.entities.drawCrabPet(g, 0, 0, v.id, 0);
      } else if (tab.icon === 'shoe') {
        g.translate(PV_W / 2, PV_H / 2);
        Game.momoko.icon(g, 'shoe', v.id, cu, 0);
      } else {
        g.translate(PV_W / 2, PV_H / 2 - 2);
        g.scale(2.05, 2.05);
        Game.momoko.icon(g, tab.icon, v.id, cu, 0.3);
      }
    }
    previewCache[key] = cv;
    previewN++;
    return cv;
  }

  /* Card label, centred: one line if it fits at a readable size, else two. */
  function cardLabel(c, text, cx, cy, maxW) {
    for (var sz = 11; sz >= 9; sz--) {
      c.font = 'bold ' + sz + 'px ' + FONT;
      if (c.measureText(text).width <= maxW) { c.fillText(text, cx, cy); return; }
    }
    var cut = text.lastIndexOf(' ');
    if (cut < 0 || /[　-鿿]/.test(text)) cut = Math.ceil(text.length / 2);
    var a = text.slice(0, cut).trim(), b = text.slice(cut).trim();
    fitFont(c, a.length > b.length ? a : b, maxW, 9, 'bold');
    c.fillText(a, cx, cy - 5);
    c.fillText(b, cx, cy + 5);
  }

  function checkBadge(c, bx, by, r) {
    c.fillStyle = '#ffd24a';
    c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#7a4a00';
    c.lineWidth = 1;
    c.stroke();
    c.strokeStyle = '#4a2a00';
    c.lineWidth = r * 0.28;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath(); c.moveTo(bx - r * 0.46, by + r * 0.03); c.lineTo(bx - r * 0.11, by + r * 0.37); c.lineTo(bx + r * 0.49, by - r * 0.34); c.stroke();
  }

  function drawOptionCard(c, tab, v, x, y, selected, hot) {
    if (hot && Game.input.pointer.down) y += 1.5;
    c.save();
    if (selected) {
      /* soft glow behind the chosen card */
      c.shadowColor = 'rgba(255, 214, 120, 0.6)';
      c.shadowBlur = 14;
    }
    drawChip(c, x, y, GRID_TILE_W, GRID_TILE_H, 10, selected, hot);
    c.restore();
    /* stage for the picture: a pool of light on a dark floor */
    var ix = x + 4, iy = y + 4, iw = PV_W, ih = PV_H;
    c.save();
    roundRect(c, ix, iy, iw, ih, 7);
    var sg = c.createRadialGradient(ix + iw / 2, iy + ih * 0.56, 3, ix + iw / 2, iy + ih * 0.5, iw * 0.62);
    sg.addColorStop(0, selected ? 'rgba(255, 196, 240, 0.62)' : hot ? 'rgba(190, 150, 255, 0.52)' : 'rgba(150, 110, 230, 0.42)');
    sg.addColorStop(1, 'rgba(14, 4, 40, 0.78)');
    c.fillStyle = sg;
    c.fill();
    c.clip();
    c.drawImage(optionPreview(c, tab, v), ix, iy, iw, ih);
    /* glass sheen across the top of the picture */
    var gl = c.createLinearGradient(0, iy, 0, iy + ih * 0.4);
    gl.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
    gl.addColorStop(1, 'rgba(255, 255, 255, 0)');
    c.fillStyle = gl;
    c.fillRect(ix, iy, iw, ih * 0.4);
    c.restore();
    c.save();
    roundRect(c, ix, iy, iw, ih, 7);
    c.strokeStyle = selected ? 'rgba(255, 228, 160, 0.9)' : 'rgba(200, 170, 255, 0.35)';
    c.lineWidth = selected ? 1.5 : 1;
    c.stroke();
    c.restore();
    /* label */
    c.fillStyle = selected ? '#ffffff' : '#e6dcff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    cardLabel(c, Game.i18n.t(v.label), x + GRID_TILE_W / 2, y + GRID_TILE_H - 10.5, GRID_TILE_W - 8);
    if (selected) checkBadge(c, x + GRID_TILE_W - 9, y + 9, 8);
  }

  /* Colour swatch drawn as the thing it colours: a lock of hair, a patch
     of cloth, a boot, an eye, a glass bubble or a cheek. The chosen one
     gets a gold ring and a tick. */
  function swatchShape(c, kind, r) {
    c.beginPath();
    if (kind === 'hair') {
      /* a tress: broad at the root, curling to a point */
      c.moveTo(-r * 0.75, -r * 0.9);
      c.bezierCurveTo(r * 0.3, -r * 1.2, r * 1.15, -r * 0.5, r * 0.9, r * 0.25);
      c.bezierCurveTo(r * 0.7, r * 0.8, r * 0.1, r * 1.05, -r * 0.6, r * 0.95);
      c.bezierCurveTo(-r * 0.1, r * 0.75, r * 0.25, r * 0.35, r * 0.05, -r * 0.05);
      c.bezierCurveTo(-r * 0.15, -r * 0.45, -r * 0.75, -r * 0.4, -r * 0.95, -r * 0.55);
      c.bezierCurveTo(-r * 0.95, -r * 0.75, -r * 0.9, -r * 0.85, -r * 0.75, -r * 0.9);
    } else if (kind === 'cloth') {
      roundRect(c, -r * 0.9, -r * 0.9, r * 1.8, r * 1.8, r * 0.3);
    } else if (kind === 'boot') {
      c.moveTo(-r * 0.75, -r * 0.9);
      c.lineTo(r * 0.1, -r * 0.9);
      c.quadraticCurveTo(r * 0.15, -r * 0.1, r * 0.5, 0);
      c.quadraticCurveTo(r * 1.05, r * 0.15, r * 0.95, r * 0.9);
      c.lineTo(-r * 0.8, r * 0.9);
      c.quadraticCurveTo(-r * 0.95, 0, -r * 0.75, -r * 0.9);
    } else {
      c.arc(0, 0, r, 0, Math.PI * 2);
    }
    c.closePath();
  }
  function drawSwatch(c, x, y, col, selected, hot, kind) {
    var r = SWATCH_R;
    c.save();
    c.translate(x, y);
    if (hot && Game.input.pointer.down) c.translate(0, 1);
    /* drop shadow */
    c.save(); c.translate(0, 2); swatchShape(c, kind, r); c.fillStyle = 'rgba(4, 0, 20, 0.45)'; c.fill(); c.restore();
    swatchShape(c, kind, r);
    if (kind === 'glass') {
      var gg = c.createRadialGradient(-4, -5, 1, 0, 0, r);
      gg.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
      gg.addColorStop(0.5, hexAlpha(shadeHex(col, 0.45), 0.5));
      gg.addColorStop(1, hexAlpha(col, 0.8));
      c.fillStyle = gg;
      c.fill();
      c.strokeStyle = col;
      c.lineWidth = 2.5;
      c.stroke();
      c.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      c.lineWidth = 1.6;
      c.lineCap = 'round';
      c.beginPath(); c.arc(0, 0, r - 4.5, Math.PI * 1.1, Math.PI * 1.45); c.stroke();
    } else if (kind === 'eyes') {
      c.fillStyle = '#fffafd';
      c.fill();
      var ig = c.createLinearGradient(0, -r, 0, r);
      ig.addColorStop(0, shadeHex(col, -0.62));
      ig.addColorStop(0.5, col);
      ig.addColorStop(1, shadeHex(col, 0.5));
      c.fillStyle = ig;
      c.beginPath(); c.arc(0, 0.5, r - 2.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(20, 4, 24, 0.85)';
      c.beginPath(); c.arc(0, 1, r * 0.36, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(-r * 0.36, -r * 0.34, r * 0.24, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(r * 0.36, r * 0.42, r * 0.12, 0, Math.PI * 2); c.fill();
    } else {
      var g = c.createLinearGradient(-r, -r, r * 0.6, r);
      g.addColorStop(0, shadeHex(col, 0.42));
      g.addColorStop(0.42, col);
      g.addColorStop(1, shadeHex(col, -0.3));
      c.fillStyle = g;
      c.fill();
      c.save();
      c.clip();
      if (kind === 'hair') {
        c.strokeStyle = shadeHex(col, -0.4);
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(-r * 0.6, -r * 0.7); c.bezierCurveTo(r * 0.3, -r * 0.8, r * 0.75, -r * 0.1, r * 0.1, r * 0.8);
        c.stroke();
        c.strokeStyle = 'rgba(255, 255, 255, 0.65)';
        c.lineWidth = 1.8;
        c.beginPath(); c.moveTo(-r * 0.1, -r * 0.88); c.bezierCurveTo(r * 0.55, -r * 0.8, r * 0.9, -r * 0.3, r * 0.75, r * 0.2); c.stroke();
      } else if (kind === 'cloth') {
        /* a fold, and a row of stitches round the edge */
        c.fillStyle = 'rgba(255, 255, 255, 0.22)';
        c.beginPath(); c.moveTo(-r, -r); c.lineTo(r * 0.2, -r); c.lineTo(-r, r * 0.4); c.closePath(); c.fill();
        c.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        c.lineWidth = 1;
        c.setLineDash([2.2, 2]);
        roundRect(c, -r * 0.9 + 2.6, -r * 0.9 + 2.6, r * 1.8 - 5.2, r * 1.8 - 5.2, r * 0.2);
        c.stroke();
        c.setLineDash([]);
      } else if (kind === 'boot') {
        c.fillStyle = 'rgba(30, 10, 60, 0.55)';
        c.fillRect(-r, r * 0.62, r * 2, r);
        c.fillStyle = 'rgba(255, 255, 255, 0.85)';
        c.fillRect(-r, -r * 0.92, r * 1.2, r * 0.3);
        c.beginPath(); c.ellipse(r * 0.5, r * 0.3, r * 0.3, r * 0.14, 0.2, 0, Math.PI * 2); c.fill();
      } else {
        /* cheek: a blush and a soft highlight */
        c.fillStyle = 'rgba(255, 110, 150, 0.3)';
        c.beginPath(); c.ellipse(r * 0.3, r * 0.42, r * 0.42, r * 0.26, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(255, 255, 255, 0.6)';
        c.beginPath(); c.ellipse(-r * 0.35, -r * 0.45, r * 0.3, r * 0.18, -0.6, 0, Math.PI * 2); c.fill();
      }
      c.restore();
    }
    swatchShape(c, kind, r);
    c.strokeStyle = hot ? 'rgba(255, 255, 255, 0.9)' : 'rgba(20, 6, 48, 0.7)';
    c.lineWidth = hot ? 1.5 : 1;
    if (kind !== 'glass') c.stroke();
    if (selected) {
      c.strokeStyle = 'rgba(255, 221, 136, 0.35)';
      c.lineWidth = 6;
      c.beginPath(); c.arc(0, 0, r + 3.5, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = '#ffdd88';
      c.lineWidth = 2.2;
      c.beginPath(); c.arc(0, 0, r + 3.5, 0, Math.PI * 2); c.stroke();
      checkBadge(c, r * 0.82, -r * 0.82, 6);
    }
    c.restore();
  }
  /* Lighten (k > 0) or darken (k < 0) a #rrggbb colour. */
  function shadeHex(h, k) {
    var n = parseInt(h.slice(1, 7), 16), t = k > 0 ? 255 : 0, a = Math.abs(k);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r + (t - r) * a); g = Math.round(g + (t - g) * a); b = Math.round(b + (t - b) * a);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  function drawPagerArrow(c, x, y, dir, enabled, hot) {
    drawChip(c, x, y, PAGER_W, ROW_H - 2, 9, false, enabled && hot);
    c.fillStyle = enabled ? '#ffffff' : 'rgba(255, 255, 255, 0.3)';
    c.beginPath();
    var cx = x + PAGER_W / 2, cy = y + (ROW_H - 2) / 2;
    c.moveTo(cx + dir * 8, cy);
    c.lineTo(cx - dir * 5, cy - 9);
    c.lineTo(cx - dir * 5, cy + 9);
    c.closePath();
    c.fill();
  }

  /* What is at (mx, my) in the layout: 'tab:i', 'card:i' (index into
     the tab's variants), 'page:-1' / 'page:1' or 'color:row:i'; '' for
     nothing. Painting (hover) and clicks share it. */
  function customHit(mx, my, tab, page) {
    var i;
    for (i = 0; i < customTabs.length; i++) {
      var tr = tabRect(i);
      if (hitButton(mx, my, tr[0], tr[1], tr[2], TAB_H)) return 'tab:' + i;
    }
    var first = page * PER_PAGE, last = Math.min(tab.variants.length, first + PER_PAGE);
    for (i = first; i < last; i++) {
      var rr = tileRect(i - first);
      if (hitButton(mx, my, rr[0], rr[1], GRID_TILE_W, GRID_TILE_H)) return 'card:' + i;
    }
    var rows = rowsFor(tab);
    for (i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (my < row.y || my >= row.y + ROW_H) continue;
      if (row.pager) {
        if (hitButton(mx, my, PANEL_X, row.y, PAGER_W, ROW_H)) return 'page:-1';
        if (hitButton(mx, my, PANEL_X + PANEL_W - PAGER_W, row.y, PAGER_W, ROW_H)) return 'page:1';
        return '';
      }
      var ci = Math.floor((mx - (COLOR_X - COLOR_STEP / 2)) / COLOR_STEP);
      return ci >= 0 && ci < row.colors.length ? 'color:' + i + ':' + ci : '';
    }
    return '';
  }

  /* Tabs, option cards and the rows under them. hot is the customHit
     target under the mouse. */
  function paintPanel(c, activeTab, page, hot) {
    /* Tabs: a row of five and a row of four */
    for (var ti = 0; ti < customTabs.length; ti++) {
      var tr = tabRect(ti);
      var tab = customTabs[ti];
      var active = activeTab === tab;
      drawChip(c, tr[0], tr[1], tr[2], TAB_H, 9, active, hot === 'tab:' + ti);
      c.fillStyle = active ? '#ffffff' : '#d8c8f4';
      fitFont(c, Game.i18n.t(tab.label), tr[2] - 10, 14, 'bold');
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(Game.i18n.t(tab.label), tr[0] + tr[2] / 2, tr[1] + TAB_H / 2 + 1);
    }

    /* Option cards for the active tab (current page) */
    var currentVariantId = Game.customization[activeTab.field];
    var first = page * PER_PAGE;
    var last = Math.min(activeTab.variants.length, first + PER_PAGE);
    for (var vi = first; vi < last; vi++) {
      var rr = tileRect(vi - first);
      var v = activeTab.variants[vi];
      drawOptionCard(c, activeTab, v, rr[0], rr[1], v.id === currentVariantId, hot === 'card:' + vi);
    }

    /* Rows under the grid: pager, colour swatches, skin tones */
    var rows = rowsFor(activeTab);
    for (var ri = 0; ri < rows.length; ri++) {
      var row = rows[ri], ry = row.y;
      if (row.pager) {
        var pages = pageCount(activeTab);
        drawPagerArrow(c, PANEL_X, ry + 1, -1, page > 0, hot === 'page:-1');
        drawPagerArrow(c, PANEL_X + PANEL_W - PAGER_W, ry + 1, 1, page < pages - 1, hot === 'page:1');
        for (var pd = 0; pd < pages; pd++) {
          c.fillStyle = pd === page ? '#ffdd88' : 'rgba(200, 180, 255, 0.45)';
          c.beginPath(); c.arc(PANEL_X + PANEL_W / 2 + (pd - (pages - 1) / 2) * 18, ry + ROW_H / 2, pd === page ? 5.5 : 4, 0, Math.PI * 2); c.fill();
        }
        continue;
      }
      c.fillStyle = '#a8c4e8';
      fitFont(c, Game.i18n.t(row.label), 46, 13, 'bold');
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText(Game.i18n.t(row.label), PANEL_X + 2, ry + ROW_H / 2 + 1);
      var selColor = Game.customization[row.field];
      for (var ci = 0; ci < row.colors.length; ci++) {
        drawSwatch(c, COLOR_X + ci * COLOR_STEP, ry + ROW_H / 2, row.colors[ci], row.colors[ci] === selColor,
                   hot === 'color:' + ri + ':' + ci, row.swatch);
      }
    }
  }

  /* The parts of the screen that only change now and then are painted
     into layers at device resolution and blitted each frame: the stage
     under Momoko once, the panel whenever the look, the tab, the page,
     the hover or the language changes. */
  var PANEL_BOX = [PANEL_X - 16, TAB_Y - 16, PANEL_W + 32,
                   GRID_Y + GRID_ROWS * (GRID_TILE_H + GRID_GAP) + 2 * (ROW_H + ROW_GAP) + 18 - (TAB_Y - 16)];
  var STAGE_BOX = [10, 70, 300, 350];
  var panelSlot = { key: '', cv: null }, stageSlot = { key: '', cv: null };
  function drawLayer(c, slot, key, box, paint) {
    var sc = c.getTransform().a;
    key += '|' + sc;
    if (key !== slot.key) {
      slot.key = key;
      var w = Math.ceil(box[2] * sc), h = Math.ceil(box[3] * sc);
      if (!slot.cv || slot.cv.width !== w || slot.cv.height !== h) {
        slot.cv = document.createElement('canvas');
        slot.cv.width = w;
        slot.cv.height = h;
      }
      var g = slot.cv.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);
      g.setTransform(sc, 0, 0, sc, -box[0] * sc, -box[1] * sc);
      paint(g);
    }
    c.drawImage(slot.cv, box[0], box[1], box[2], box[3]);
  }

  /* Preview stage – soft radial glow and a lit pedestal so Momoko pops */
  var STAGE_CX = 160, STAGE_PAD_Y = 325;
  function paintStage(c) {
    var stageCY = 240;
    var stageGrad = c.createRadialGradient(STAGE_CX, stageCY, 20, STAGE_CX, stageCY, 150);
    stageGrad.addColorStop(0, 'rgba(255, 170, 235, 0.3)');
    stageGrad.addColorStop(0.5, 'rgba(170, 120, 255, 0.12)');
    stageGrad.addColorStop(1, 'rgba(170, 120, 255, 0)');
    c.fillStyle = stageGrad;
    c.fillRect(10, 70, 300, 340);
    var pg = c.createRadialGradient(STAGE_CX, STAGE_PAD_Y, 4, STAGE_CX, STAGE_PAD_Y, 92);
    pg.addColorStop(0, 'rgba(255, 200, 250, 0.5)');
    pg.addColorStop(0.6, 'rgba(150, 110, 255, 0.18)');
    pg.addColorStop(1, 'rgba(150, 110, 255, 0)');
    c.fillStyle = pg;
    c.beginPath(); c.ellipse(STAGE_CX, STAGE_PAD_Y, 92, 20, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(160, 230, 255, 0.55)';
    c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(STAGE_CX, STAGE_PAD_Y, 62, 11, 0, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(255, 200, 250, 0.35)';
    c.beginPath(); c.ellipse(STAGE_CX, STAGE_PAD_Y, 76, 14, 0, 0, Math.PI * 2); c.stroke();
  }

  var customizeTimer = 0;
  var previewZoom = 1;
  function drawCustomizeScreen(c) {
    customizeTimer++;
    /* Background – the title's starfield, dimmed so the controls stay
       legible. */
    drawSpaceBackdrop(c);
    c.fillStyle = 'rgba(6, 2, 20, 0.4)';
    c.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    customLayout();
    c.save();
    c.translate(custXf.x, custXf.y);
    c.scale(custXf.k, custXf.k);

    /* Title */
    c.fillStyle = '#66ccff';
    c.font = 'bold 24px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'center';
    c.fillText(Game.i18n.t('customize'), W / 2, 30);

    var activeTab = getTab(customSelection.tab);

    drawLayer(c, stageSlot, '', STAGE_BOX, paintStage);

    /* Momoko preview: she steps a little closer on the tabs that edit
       her head, and back to make room for her pup. */
    previewZoom += ((activeTab.zoom || 1) - previewZoom) * 0.14;
    c.save();
    c.translate(STAGE_CX, STAGE_PAD_Y);
    c.scale(5 * previewZoom, 5 * previewZoom);
    c.translate(-14, -34);
    drawMomokoPreview(c, Game.customization);
    c.restore();

    /* Tabs, cards and swatches, from their layer */
    var page = curPage(activeTab), hot = '';
    var ptr = Game.input && Game.input.pointer;
    if (ptr && ptr.px >= 0 && c.getTransform) {
      var pt = c.getTransform().inverse().transformPoint(new DOMPoint(ptr.px, ptr.py));
      hot = customHit(pt.x, pt.y, activeTab, page);
      if (hot) anyHot = true;
    }
    var cu = Game.customization;
    var key = activeTab.id + '|' + page + '|' + hot + '|' + (hot && ptr.down ? 1 : 0) + '|' + Game.i18n.lang;
    for (var f in cu) key += '|' + cu[f];
    drawLayer(c, panelSlot, key, PANEL_BOX, function (g) { paintPanel(g, activeTab, page, hot); });
    /* the chosen card's gold ring breathes */
    for (var vi = page * PER_PAGE; vi < Math.min(activeTab.variants.length, (page + 1) * PER_PAGE); vi++) {
      if (activeTab.variants[vi].id !== Game.customization[activeTab.field]) continue;
      var rr = tileRect(vi - page * PER_PAGE);
      c.strokeStyle = 'rgba(255, 240, 190, ' + (0.3 + 0.3 * Math.sin(customizeTimer * 0.08)).toFixed(3) + ')';
      c.lineWidth = 3;
      roundRect(c, rr[0] - 1.5, rr[1] - 1.5, GRID_TILE_W + 3, GRID_TILE_H + 3, 11.5);
      c.stroke();
    }

    /* Start button */
    drawButton(c, Game.i18n.t('startGame'), START_BTN_X, START_BTN_Y, START_BTN_W, START_BTN_H, false, 'primary');
    c.restore();
  }

  function drawMomokoPreview(c, cust) {
    if (!Game.entities) return;
    previewRig = heroRig(previewRig);
    if (previewRig) previewRig.tick(0, 0, { facing: 1 });
    if (Game.entities.drawMomokoSprite) Game.entities.drawMomokoSprite(c, 0, 0, cust, 0, { rig: previewRig });
    /* Crab pet appears next to her feet in the preview so the player can
       see the companion they just picked. */
    if (Game.entities.drawCrabPet && cust.crab && cust.crab !== 'none') {
      Game.entities.drawCrabPet(c, -8, 30.5, cust.crab, customizeTimer);
    }
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  /* A change on the customise screen gets a little cheer from her. */
  function customized() {
    Game.audio.play('select');
    if (previewRig) previewRig.doReact('cheer');
  }

  function handleCustomizeClick(mx, my) {
    /* into the layout's own coordinates (see customLayout) */
    mx = (mx - custXf.x) / custXf.k;
    my = (my - custXf.y) / custXf.k;

    var activeTab = getTab(customSelection.tab);
    var page = curPage(activeTab);
    var hit = customHit(mx, my, activeTab, page).split(':');
    var n = +hit[1];
    if (hit[0] === 'tab') {
      customSelection.tab = customTabs[n].id;
      Game.audio.play('select');
    } else if (hit[0] === 'card') {
      Game.customization[activeTab.field] = activeTab.variants[n].id;
      customized();
    } else if (hit[0] === 'page') {
      if (page + n >= 0 && page + n < pageCount(activeTab)) {
        customSelection.page[activeTab.id] = page + n;
        Game.audio.play('select');
      }
    } else if (hit[0] === 'color') {
      var row = rowsFor(activeTab)[n];
      Game.customization[row.field] = row.colors[+hit[2]];
      customized();
    }
    if (hit[0]) return null;

    /* Start button */
    if (hitButton(mx, my, START_BTN_X, START_BTN_Y, START_BTN_W, START_BTN_H)) {
      Game.audio.play('select');
      return 'start';
    }
    return null;
  }

  /* ---- Intro / Backstory ---- */
  var introAnimTimer = 0;

  function drawIntroScreen(c) {
    introAnimTimer++;

    /* Background – same starry backdrop as the title for continuity */
    drawSpaceBackdrop(c);
    clipGame(c);

    /* Size the story card to its text and centre it between the heading
       and the Continue button instead of leaving a half-empty box. */
    var panelX = 240, panelW = 540;
    c.font = '14px "M PLUS Rounded 1c", sans-serif';
    var introLines = layoutLines(c, Game.i18n.t('introText'), panelW - 36);
    var panelH = introLines.length * 20 + 40;
    var panelY = Math.round(72 + (H - 72 - 72 - panelH) / 2);
    var portraitY = panelY + panelH / 2 - 32;

    /* Momoko portrait (left) */
    c.save();
    c.translate(120, portraitY);
    c.scale(3.2, 3.2);
    if (Game.entities && Game.entities.drawMomokoSprite) {
      introRig = heroRig(introRig);
      if (introRig) introRig.tick(0, 0, { facing: 1 });
      Game.entities.drawMomokoSprite(c, 0, 0, Game.customization, 0, { rig: introRig });
    }
    c.restore();

    /* Title */
    c.fillStyle = '#ffcc66';
    c.font = 'bold 28px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'center';
    c.shadowColor = '#884400';
    c.shadowBlur = 6;
    c.fillText(Game.i18n.t('introTitle'), W / 2, 46);
    c.shadowBlur = 0;

    /* Story panel – the same violet card as How to Play and dialogue */
    drawPanel(c, panelX, panelY, panelW, panelH, 14, '#b07cff', 'rgba(52, 22, 108, 0.94)', 'rgba(22, 8, 52, 0.94)');

    /* Story text */
    c.fillStyle = '#f0e8ff';
    c.font = '14px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'left';
    wrapText(c, Game.i18n.t('introText'), panelX + 18, panelY + 28, panelW - 36, 20);

    /* Continue button */
    drawButton(c, Game.i18n.t('continueBtn'), W / 2 - 90, H - 60, 180, 44, false, 'primary');
  }

  function handleIntroClick(mx, my) {
    if (hitButton(mx, my, W / 2 - 90, H - 60, 180, 44)) {
      Game.audio.play('select');
      introAnimTimer = 0;
      return 'start';
    }
    return null;
  }

  /* ---- Beach Cutscene ---- */
  /* Scene config is regenerated on every breach via startBeachCutscene()
     so each surface trip looks a little different (time of day, who's on
     the beach, what they're doing). Falls back to a default scene if the
     state ever ends up rendered without a config. */
  var beachTimer = 0;
  var beachKitty = null;
  var beachScene = null;

  /* Time-of-day palettes – each set drives sky gradient, distant hills,
     sand, water, and sun colour so the whole frame stays cohesive. */
  var BEACH_PALETTES = {
    morning: {
      sky: ['#aedcf2', '#dbeefb', '#fff1d4'],
      hills: '#7aa6c5',
      sand: ['#f3dfa6', '#ecca80', '#d8b070'],
      water: '#1e8fc8',
      waterMid: '#39a3d8',
      waterLight: '#73c4e8',
      sun: '#fff9c0',
      sunCore: '#fff8a8',
      sunRays: 'rgba(255,250,200,0.10)',
    },
    noon: {
      sky: ['#4a9ee6', '#89c6f2', '#ffd89b'],
      hills: '#7fa8c9',
      sand: ['#f0d590', '#e8c478', '#d4a968'],
      water: '#1e7bb8',
      waterMid: '#2e95cc',
      waterLight: '#5ab4dd',
      sun: '#fff6a8',
      sunCore: '#fff6a8',
      sunRays: 'rgba(255,244,176,0.12)',
    },
    sunset: {
      sky: ['#ff7e5f', '#feb47b', '#ffd29a'],
      hills: '#9a5e7e',
      sand: ['#f4c282', '#e69e63', '#c47a4a'],
      water: '#3a4a8a',
      waterMid: '#5a6cae',
      waterLight: '#8a9acf',
      sun: '#ffd06b',
      sunCore: '#ffb766',
      sunRays: 'rgba(255,180,110,0.18)',
    },
  };

  var BEACH_TITLES = ['beachTitle', 'beachTitleAlt1', 'beachTitleAlt2', 'beachTitleAlt3'];
  var BEACH_TEXTS = ['beachText', 'beachTextAlt1', 'beachTextAlt2', 'beachTextAlt3'];
  var BEACH_KID_COLORS = ['#33bb77', '#cc44aa', '#ee7733', '#3388dd', '#dd3344', '#9966dd'];

  function makeBeachScene() {
    var times = ['morning', 'noon', 'sunset'];
    var time = times[Math.floor(Math.random() * times.length)];
    var pal = BEACH_PALETTES[time];

    /* Seagulls (3-6 birds at varied heights) */
    var gullCount = 3 + Math.floor(Math.random() * 4);
    var gulls = [];
    for (var g = 0; g < gullCount; g++) {
      gulls.push({
        x: Math.random() * W,
        y: 40 + Math.random() * 90,
        spd: 0.25 + Math.random() * 0.35,
        phase: Math.random() * Math.PI * 2,
      });
    }

    /* Crabs (2-4) with random base positions */
    var crabCount = 2 + Math.floor(Math.random() * 3);
    var crabs = [];
    for (var cb = 0; cb < crabCount; cb++) {
      crabs.push({
        baseX: 100 + Math.random() * (W - 200),
        dir: Math.random() > 0.5 ? 1 : -1,
        phase: Math.random() * Math.PI * 2,
      });
    }

    /* Kids (1-3) playing on the sand, each with a random shirt colour */
    var kidCount = 1 + Math.floor(Math.random() * 3);
    var kids = [];
    for (var k = 0; k < kidCount; k++) {
      kids.push({
        x: 180 + k * (440 / kidCount) + Math.random() * 40,
        y: 0.82 + Math.random() * 0.06,
        color: BEACH_KID_COLORS[Math.floor(Math.random() * BEACH_KID_COLORS.length)],
        bobOffset: Math.random() * Math.PI * 2,
      });
    }

    /* Optional flourishes */
    var hasBeachBall = Math.random() < 0.55;
    var ballX = 200 + Math.random() * 400;
    var hasFrisbee = Math.random() < 0.45;
    var frisbeeX = 200 + Math.random() * 400;
    var hasDolphin = Math.random() < 0.35;

    /* Title / subtitle pulled from translation pools so JP/EN both vary */
    var titleKey = BEACH_TITLES[Math.floor(Math.random() * BEACH_TITLES.length)];
    var textKey = BEACH_TEXTS[Math.floor(Math.random() * BEACH_TEXTS.length)];

    return {
      time: time,
      pal: pal,
      gulls: gulls,
      crabs: crabs,
      kids: kids,
      hasBeachBall: hasBeachBall,
      ballX: ballX,
      hasFrisbee: hasFrisbee,
      frisbeeX: frisbeeX,
      hasDolphin: hasDolphin,
      dolphinPhase: Math.random() * Math.PI * 2,
      titleKey: titleKey,
      textKey: textKey,
    };
  }

  /* Player-controlled Momoko state while the beach cutscene is up. She
     walks on the sand line between the palms; action key does a small
     hop. Position is in canvas-logical (0..W,0..H) coords. */
  var beachMomoko = null;
  var BEACH_GROUND_Y = H * 0.84;
  var BEACH_MIN_X = 60;
  var BEACH_MAX_X = W - 60;
  var BEACH_WALK_SPEED = 2.6;
  var BEACH_JUMP_V = -5.2;
  var BEACH_GRAVITY = 0.32;

  function startBeachCutscene() {
    beachTimer = 0;
    beachKitty = null;
    beachScene = makeBeachScene();
    beachMomoko = {
      x: W / 2,
      y: BEACH_GROUND_Y,
      vy: 0,
      facing: 1,
      walkPhase: 0,
      grounded: true,
      moving: false,
    };
  }

  /* Called from engine.js every frame while State.BEACH is active. `keys`
     and `jp` are the shared Game.input state. */
  function updateBeach(keys, jp) {
    if (!beachMomoko) return;
    var m = beachMomoko;
    m.moving = false;
    if (keys.left)  { m.x -= BEACH_WALK_SPEED; m.facing = -1; m.moving = true; }
    if (keys.right) { m.x += BEACH_WALK_SPEED; m.facing =  1; m.moving = true; }
    if (m.x < BEACH_MIN_X) m.x = BEACH_MIN_X;
    if (m.x > BEACH_MAX_X) m.x = BEACH_MAX_X;

    /* Hop on action (space / BUBBLE). Uses justPressed so holding the
       key doesn't auto-bounce. */
    if (jp && jp.action && m.grounded) {
      m.vy = BEACH_JUMP_V;
      m.grounded = false;
    }
    /* Gravity + ground clamp */
    m.vy += BEACH_GRAVITY;
    m.y += m.vy;
    if (m.y >= BEACH_GROUND_Y) {
      m.y = BEACH_GROUND_Y;
      m.vy = 0;
      m.grounded = true;
    }

    if (m.moving && m.grounded) m.walkPhase += 0.35;
  }

  function drawPalmTree(c, x, groundY, scale, sway) {
    var s = scale || 1;
    /* Trunk – curved bezier */
    c.strokeStyle = '#6b4321';
    c.lineWidth = 10 * s;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x, groundY);
    c.bezierCurveTo(x - 10 * s, groundY - 60 * s, x + 10 * s, groundY - 100 * s, x + sway, groundY - 140 * s);
    c.stroke();
    /* Trunk rings */
    c.strokeStyle = '#4a2d15';
    c.lineWidth = 1.5;
    for (var tr = 0; tr < 6; tr++) {
      var rt = (tr + 1) / 7;
      var rx = x - 10 * s * (1 - rt) + sway * rt;
      var ry = groundY - 140 * s * rt;
      c.beginPath();
      c.arc(rx, ry, 5 * s, 0, Math.PI, false);
      c.stroke();
    }
    /* Fronds */
    var topX = x + sway;
    var topY = groundY - 140 * s;
    c.fillStyle = '#2a8833';
    for (var fr = 0; fr < 7; fr++) {
      var ang = (fr / 7) * Math.PI * 2 + 0.3;
      var len = 60 * s + (fr % 2) * 10;
      var tipX = topX + Math.cos(ang) * len;
      var tipY = topY + Math.sin(ang) * len * 0.7;
      var midX = topX + Math.cos(ang) * len * 0.5;
      var midY = topY + Math.sin(ang) * len * 0.35;
      c.beginPath();
      c.moveTo(topX, topY);
      c.quadraticCurveTo(midX, midY - 12 * s, tipX, tipY);
      c.quadraticCurveTo(midX, midY + 12 * s, topX, topY);
      c.closePath();
      c.fill();
    }
    /* Frond highlights */
    c.fillStyle = '#3caa45';
    for (var fh = 0; fh < 7; fh++) {
      var ahg = (fh / 7) * Math.PI * 2 + 0.3;
      var lng = 60 * s + (fh % 2) * 10;
      var hx = topX + Math.cos(ahg) * lng * 0.7;
      var hy = topY + Math.sin(ahg) * lng * 0.5;
      c.beginPath();
      c.ellipse(hx, hy, lng * 0.25, 3 * s, ahg, 0, Math.PI * 2);
      c.fill();
    }
    /* Coconuts */
    c.fillStyle = '#3d2512';
    c.beginPath(); c.arc(topX - 6 * s, topY + 4 * s, 4 * s, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(topX + 5 * s, topY + 5 * s, 4 * s, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(topX, topY - 2 * s, 3.5 * s, 0, Math.PI * 2); c.fill();
  }

  function drawSandcastle(c, x, y) {
    /* Base */
    c.fillStyle = '#d4a968';
    c.beginPath();
    c.moveTo(x - 24, y);
    c.lineTo(x + 24, y);
    c.lineTo(x + 22, y - 14);
    c.lineTo(x - 22, y - 14);
    c.closePath();
    c.fill();
    /* Center tower */
    c.fillStyle = '#e0b876';
    c.beginPath();
    c.moveTo(x - 10, y - 14);
    c.lineTo(x + 10, y - 14);
    c.lineTo(x + 9, y - 36);
    c.lineTo(x - 9, y - 36);
    c.closePath();
    c.fill();
    /* Tower top – crenellations as arcs */
    c.fillStyle = '#e0b876';
    for (var cc = 0; cc < 3; cc++) {
      c.beginPath();
      c.arc(x - 7 + cc * 7, y - 38, 2.5, Math.PI, 0);
      c.fill();
    }
    /* Side turrets */
    c.beginPath();
    c.arc(x - 22, y - 14, 5, Math.PI, 0);
    c.fill();
    c.beginPath();
    c.arc(x + 22, y - 14, 5, Math.PI, 0);
    c.fill();
    /* Door */
    c.fillStyle = '#8a6338';
    c.beginPath();
    c.moveTo(x - 3, y - 14);
    c.lineTo(x + 3, y - 14);
    c.lineTo(x + 3, y - 22);
    c.quadraticCurveTo(x, y - 26, x - 3, y - 22);
    c.closePath();
    c.fill();
    /* Flag */
    c.strokeStyle = '#5d3a1b';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(x, y - 36);
    c.lineTo(x, y - 48);
    c.stroke();
    c.fillStyle = '#ee4466';
    c.beginPath();
    c.moveTo(x, y - 48);
    c.lineTo(x + 8, y - 45);
    c.lineTo(x, y - 42);
    c.closePath();
    c.fill();
  }

  function drawBeachUmbrella(c, x, groundY) {
    /* Pole */
    c.strokeStyle = '#5d3a1b';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(x, groundY);
    c.lineTo(x, groundY - 62);
    c.stroke();
    /* Canopy dome – alternating stripes */
    var stripes = ['#ee4466', '#ffffff'];
    for (var st = 0; st < 6; st++) {
      var a0 = Math.PI + (st / 6) * Math.PI;
      var a1 = Math.PI + ((st + 1) / 6) * Math.PI;
      c.fillStyle = stripes[st % 2];
      c.beginPath();
      c.moveTo(x, groundY - 62);
      c.arc(x, groundY - 62, 38, a0, a1);
      c.closePath();
      c.fill();
    }
    /* Rim dots */
    c.fillStyle = '#cc2244';
    for (var rm = 0; rm < 7; rm++) {
      var ang = Math.PI + (rm / 6) * Math.PI;
      c.beginPath();
      c.arc(x + Math.cos(ang) * 38, groundY - 62 + Math.sin(ang) * 38, 2, 0, Math.PI * 2);
      c.fill();
    }
    /* Pole tip */
    c.fillStyle = '#ffcc33';
    c.beginPath();
    c.arc(x, groundY - 64, 3, 0, Math.PI * 2);
    c.fill();
  }

  function drawBeachTowel(c, x, y, w, h, c1, c2) {
    /* Towel base */
    c.fillStyle = c1;
    roundRect(c, x, y, w, h, 3);
    c.fill();
    /* Stripes */
    c.fillStyle = c2;
    var sw = w / 6;
    for (var s = 0; s < 3; s++) {
      c.fillRect(x + s * 2 * sw + sw * 0.5, y, sw * 0.6, h);
    }
    /* Fringe */
    c.strokeStyle = c2;
    c.lineWidth = 1;
    for (var fg = 0; fg < 8; fg++) {
      var fx = x + (fg / 7) * w;
      c.beginPath();
      c.moveTo(fx, y + h);
      c.lineTo(fx, y + h + 3);
      c.stroke();
    }
  }

  function drawSeagull(c, x, y, flap) {
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2;
    var wing = Math.sin(flap) * 5;
    c.beginPath();
    c.moveTo(x - 10, y + 2 + wing);
    c.quadraticCurveTo(x - 5, y - 5 - wing, x, y);
    c.quadraticCurveTo(x + 5, y - 5 - wing, x + 10, y + 2 + wing);
    c.stroke();
    /* Body dot */
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(x, y - 1, 1.6, 0, Math.PI * 2);
    c.fill();
  }

  function drawCrab(c, x, y, phase) {
    var leg = Math.sin(phase) * 2;
    c.fillStyle = '#dd4433';
    /* Body */
    c.beginPath();
    c.ellipse(x, y, 8, 5, 0, 0, Math.PI * 2);
    c.fill();
    /* Claws */
    c.beginPath();
    c.ellipse(x - 9, y - 2, 3.5, 2.5, -0.3, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(x + 9, y - 2, 3.5, 2.5, 0.3, 0, Math.PI * 2);
    c.fill();
    /* Legs */
    c.strokeStyle = '#aa2211';
    c.lineWidth = 1.4;
    for (var lg = 0; lg < 3; lg++) {
      var lx = x - 5 + lg * 5;
      var lOff = (lg % 2 === 0 ? leg : -leg);
      c.beginPath();
      c.moveTo(lx - 2, y + 3);
      c.lineTo(lx - 4, y + 6 + lOff);
      c.stroke();
      c.beginPath();
      c.moveTo(lx + 2, y + 3);
      c.lineTo(lx + 4, y + 6 - lOff);
      c.stroke();
    }
    /* Eyes */
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(x - 3, y - 4, 1.5, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x + 3, y - 4, 1.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#000000';
    c.beginPath(); c.arc(x - 3, y - 4, 0.8, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x + 3, y - 4, 0.8, 0, Math.PI * 2); c.fill();
  }

  function drawKid(c, x, groundY, outfit, bob) {
    var bobOff = Math.sin(bob) * 1.5;
    /* Head */
    c.fillStyle = '#ffddbb';
    c.beginPath();
    c.arc(x, groundY - 30 + bobOff, 5, 0, Math.PI * 2);
    c.fill();
    /* Hair tuft */
    c.fillStyle = '#553322';
    c.beginPath();
    c.arc(x, groundY - 34 + bobOff, 5, Math.PI + 0.3, Math.PI * 2 - 0.3);
    c.fill();
    /* Eyes */
    c.fillStyle = '#223344';
    c.beginPath(); c.arc(x - 2, groundY - 30 + bobOff, 0.8, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x + 2, groundY - 30 + bobOff, 0.8, 0, Math.PI * 2); c.fill();
    /* Smile */
    c.strokeStyle = '#aa3344';
    c.lineWidth = 0.8;
    c.beginPath();
    c.arc(x, groundY - 28 + bobOff, 1.6, 0.2, Math.PI - 0.2);
    c.stroke();
    /* Body / shirt */
    c.fillStyle = outfit;
    c.beginPath();
    c.moveTo(x - 5, groundY - 24 + bobOff);
    c.quadraticCurveTo(x - 6, groundY - 14, x - 4, groundY - 10);
    c.lineTo(x + 4, groundY - 10);
    c.quadraticCurveTo(x + 6, groundY - 14, x + 5, groundY - 24 + bobOff);
    c.closePath();
    c.fill();
    /* Arms – waving */
    c.strokeStyle = '#ffddbb';
    c.lineWidth = 2;
    c.lineCap = 'round';
    var arm = Math.sin(bob + 1) * 4;
    c.beginPath();
    c.moveTo(x - 5, groundY - 22 + bobOff);
    c.lineTo(x - 9, groundY - 18 - arm);
    c.stroke();
    c.beginPath();
    c.moveTo(x + 5, groundY - 22 + bobOff);
    c.lineTo(x + 9, groundY - 18 + arm);
    c.stroke();
    /* Legs */
    c.strokeStyle = outfit;
    c.lineWidth = 2.2;
    c.beginPath();
    c.moveTo(x - 2, groundY - 10);
    c.lineTo(x - 3, groundY);
    c.stroke();
    c.beginPath();
    c.moveTo(x + 2, groundY - 10);
    c.lineTo(x + 3, groundY);
    c.stroke();
  }

  function drawStarfish(c, x, y, size, rot, color) {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.fillStyle = color;
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var r = (i % 2 === 0) ? size : size * 0.4;
      var a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      var px = Math.cos(a) * r;
      var py = Math.sin(a) * r;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
    c.fill();
    c.restore();
  }

  function drawBeachCutscene(c, wolfe) {
    beachTimer++;
    var t = beachTimer;
    /* Lazily seed a default scene if the engine somehow rendered the
       cutscene without calling startBeachCutscene first. */
    if (!beachScene) beachScene = makeBeachScene();
    var sc = beachScene;
    var pal = sc.pal;

    /* Sky gradient – three-stop palette per time of day */
    var skyGrad = c.createLinearGradient(0, 0, 0, H * 0.6);
    skyGrad.addColorStop(0, pal.sky[0]);
    skyGrad.addColorStop(0.6, pal.sky[1]);
    skyGrad.addColorStop(1, pal.sky[2]);
    c.fillStyle = skyGrad;
    c.fillRect(0, 0, W, H * 0.6);

    /* Sun position varies with time of day so sunset reads as low / warm */
    var sunX = sc.time === 'morning' ? 150 : sc.time === 'sunset' ? 690 : 650;
    var sunY = sc.time === 'sunset' ? 150 : 78;

    c.save();
    c.globalAlpha = 1;
    c.strokeStyle = pal.sun;
    c.lineWidth = 3;
    for (var ry = 0; ry < 14; ry++) {
      var ra = (ry / 14) * Math.PI * 2 + t * 0.002;
      c.globalAlpha = 0.12;
      c.beginPath();
      c.moveTo(sunX, sunY);
      c.lineTo(sunX + Math.cos(ra) * 180, sunY + Math.sin(ra) * 180);
      c.stroke();
    }
    c.restore();

    /* Sun glow */
    var sunGrad = c.createRadialGradient(sunX, sunY, 10, sunX, sunY, 80);
    sunGrad.addColorStop(0, pal.sunRays.replace(/[\d.]+\)$/, '0.9)'));
    sunGrad.addColorStop(1, pal.sunRays.replace(/[\d.]+\)$/, '0)'));
    c.fillStyle = sunGrad;
    c.fillRect(sunX - 90, sunY - 90, 180, 180);
    /* Sun core */
    c.fillStyle = pal.sunCore;
    c.beginPath();
    c.arc(sunX, sunY, 32, 0, Math.PI * 2);
    c.fill();

    /* Distant hills */
    c.fillStyle = pal.hills;
    c.beginPath();
    c.moveTo(0, H * 0.58);
    c.bezierCurveTo(120, H * 0.5, 200, H * 0.55, 320, H * 0.53);
    c.bezierCurveTo(460, H * 0.5, 560, H * 0.57, 700, H * 0.54);
    c.bezierCurveTo(760, H * 0.53, 800, H * 0.56, 800, H * 0.58);
    c.lineTo(800, H * 0.6);
    c.lineTo(0, H * 0.6);
    c.closePath();
    c.fill();

    /* Clouds – tinted slightly to match palette */
    c.fillStyle = sc.time === 'sunset' ? '#ffd0b0' : '#ffffff';
    for (var cl = 0; cl < 4; cl++) {
      var cx = ((200 + cl * 220 + t * 0.25) % (W + 200)) - 100;
      var cy = 50 + cl * 18;
      c.globalAlpha = 0.9;
      c.beginPath();
      c.arc(cx, cy, 18, 0, Math.PI * 2);
      c.arc(cx + 18, cy - 4, 22, 0, Math.PI * 2);
      c.arc(cx + 38, cy, 16, 0, Math.PI * 2);
      c.arc(cx + 24, cy + 8, 18, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    }

    /* Seagulls (count / positions vary per visit) */
    for (var sg = 0; sg < sc.gulls.length; sg++) {
      var bird = sc.gulls[sg];
      bird.x += bird.spd;
      if (bird.x > W + 20) bird.x = -20;
      drawSeagull(c, bird.x, bird.y + Math.sin(t * 0.02 + bird.phase) * 4, t * 0.18 + bird.phase);
    }

    /* Optional dolphin breaching the waves in the distance */
    if (sc.hasDolphin) {
      var dPhase = t * 0.012 + sc.dolphinPhase;
      var dx = ((dPhase * 30) % (W + 200)) - 100;
      var dyOff = Math.sin(dPhase * 2) * 10 - 6;
      if (Math.sin(dPhase * 2) > 0) {
        c.fillStyle = '#3a4a55';
        c.beginPath();
        c.ellipse(dx, H * 0.92 + dyOff, 14, 5, -0.3, 0, Math.PI * 2);
        c.fill();
        /* Dorsal fin */
        c.beginPath();
        c.moveTo(dx, H * 0.92 + dyOff - 2);
        c.lineTo(dx + 4, H * 0.92 + dyOff - 9);
        c.lineTo(dx + 8, H * 0.92 + dyOff - 1);
        c.closePath();
        c.fill();
      }
    }

    /* Sand – main beach */
    var sandGrad = c.createLinearGradient(0, H * 0.55, 0, H);
    sandGrad.addColorStop(0, pal.sand[0]);
    sandGrad.addColorStop(0.5, pal.sand[1]);
    sandGrad.addColorStop(1, pal.sand[2]);
    c.fillStyle = sandGrad;
    c.beginPath();
    c.moveTo(0, H * 0.6);
    for (var sx = 0; sx <= W; sx += 8) {
      var sandY = H * 0.58 + Math.sin(sx * 0.008) * 4 + Math.sin(sx * 0.04) * 2;
      c.lineTo(sx, sandY);
    }
    c.lineTo(W, H);
    c.lineTo(0, H);
    c.closePath();
    c.fill();

    /* Sand bumps / ripples */
    c.strokeStyle = 'rgba(183, 138, 78, 0.4)';
    c.lineWidth = 1;
    for (var rp = 0; rp < 6; rp++) {
      c.beginPath();
      c.moveTo(0, H * 0.7 + rp * 22);
      for (var rx2 = 0; rx2 <= W; rx2 += 20) {
        c.lineTo(rx2, H * 0.7 + rp * 22 + Math.sin(rx2 * 0.03 + rp) * 2);
      }
      c.stroke();
    }

    /* Palm trees (behind beach items) */
    drawPalmTree(c, 70, H * 0.6, 1.0, Math.sin(t * 0.008) * 4);
    drawPalmTree(c, 760, H * 0.6, 0.9, Math.sin(t * 0.009 + 1) * 4);
    drawPalmTree(c, 540, H * 0.58, 0.7, Math.sin(t * 0.007 + 2) * 3);

    /* Beach towels */
    drawBeachTowel(c, 160, H * 0.76, 70, 28, '#ee4466', '#ffffff');
    drawBeachTowel(c, 420, H * 0.8, 64, 26, '#44aadd', '#ffff66');

    /* Umbrella + accompanying towel */
    drawBeachUmbrella(c, 660, H * 0.84);

    /* Sandcastle */
    drawSandcastle(c, 320, H * 0.82);

    /* Beach ball – bouncing on the sand */
    if (sc.hasBeachBall) {
      var ballY = H * 0.86 - Math.abs(Math.sin(t * 0.06)) * 30;
      drawBeachBall(c, sc.ballX, ballY, t * 0.04);
    }
    /* Frisbee – arcing through the sky */
    if (sc.hasFrisbee) {
      var frX = (sc.frisbeeX + (t * 1.2) % 600) - 100;
      var frY = 200 + Math.sin(t * 0.025) * 60;
      drawFrisbee(c, frX, frY, t * 0.2);
    }

    /* Starfish scattered on sand */
    drawStarfish(c, 140, H * 0.84, 6, 0.4, '#e66442');
    drawStarfish(c, 500, H * 0.78, 5, 1.1, '#e6a84a');
    drawStarfish(c, 720, H * 0.77, 5, 0.7, '#d94a5a');

    /* Kids – count and colours vary per visit */
    for (var ki = 0; ki < sc.kids.length; ki++) {
      var kid = sc.kids[ki];
      drawKid(c, kid.x, H * kid.y, kid.color, t * 0.08 + kid.bobOffset);
    }

    /* Crabs walking on sand */
    for (var cb = 0; cb < sc.crabs.length; cb++) {
      var crab = sc.crabs[cb];
      var crabX = crab.baseX + Math.sin(t * 0.01 + crab.phase) * 30 * crab.dir;
      var crabY = H * 0.88 + Math.sin(t * 0.04 + crab.phase) * 1;
      drawCrab(c, crabX, crabY, t * 0.2 + crab.phase);
    }

    /* Wolfe on beach */
    if (wolfe) {
      wolfe.y = H * 0.6 - 22;
      wolfe.draw(c, 0, 0);
    }

    /* Water at bottom – tinted by time of day */
    c.fillStyle = pal.water;
    c.fillRect(0, H * 0.93, W, H * 0.07);

    /* Overlapping waves */
    c.fillStyle = pal.waterMid;
    c.beginPath();
    c.moveTo(0, H * 0.93);
    for (var w1 = 0; w1 <= W; w1 += 6) {
      c.lineTo(w1, H * 0.93 + Math.sin(t * 0.04 + w1 * 0.04) * 3);
    }
    c.lineTo(W, H);
    c.lineTo(0, H);
    c.closePath();
    c.fill();

    c.fillStyle = pal.waterLight;
    c.beginPath();
    c.moveTo(0, H * 0.945);
    for (var w2 = 0; w2 <= W; w2 += 6) {
      c.lineTo(w2, H * 0.945 + Math.sin(t * 0.05 + w2 * 0.05 + 1.2) * 2.5);
    }
    c.lineTo(W, H);
    c.lineTo(0, H);
    c.closePath();
    c.fill();

    /* Wave foam fringe */
    c.strokeStyle = '#ffffff';
    c.lineWidth = 1.8;
    c.globalAlpha = 0.85;
    c.beginPath();
    for (var wf = 0; wf <= W; wf += 4) {
      var wfy = H * 0.93 + Math.sin(t * 0.04 + wf * 0.04) * 3;
      if (wf === 0) c.moveTo(wf, wfy);
      else c.lineTo(wf, wfy);
    }
    c.stroke();
    c.globalAlpha = 1;
    /* Foam dots */
    c.fillStyle = 'rgba(255,255,255,0.7)';
    for (var fd = 0; fd < 18; fd++) {
      var fdx = (fd * 46 + (t * 0.3) % 46) % W;
      var fdy = H * 0.93 + Math.sin(t * 0.04 + fdx * 0.04) * 3 + Math.sin(t * 0.07 + fd) * 1.5;
      c.beginPath();
      c.arc(fdx, fdy, 1.5, 0, Math.PI * 2);
      c.fill();
    }

    /* Player-controlled Momoko walking on the sand. Drawn after sand /
       decor and before Kitty so she sits in the natural z-order. Scaled
       2x so she matches the size of kids / beach props. The sprite's
       animFrame parameter drives her flipper/foot kick timing. */
    if (beachMomoko) {
      var mm = beachMomoko;
      /* Shadow on sand */
      c.save();
      c.fillStyle = 'rgba(0,0,0,0.22)';
      var shadowSquash = mm.grounded ? 1 : 0.6;
      c.beginPath();
      c.ellipse(mm.x, BEACH_GROUND_Y + 10, 16 * shadowSquash, 4 * shadowSquash, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();

      c.save();
      c.translate(mm.x, mm.y);
      c.scale(2, 2);
      if (mm.facing === -1) c.scale(-1, 1);
      /* The sprite's natural origin is its top-left, so shift up by full
         sprite height (34) to plant feet on the ground line. */
      if (Game.entities && Game.entities.drawMomokoSprite) {
        beachRig = heroRig(beachRig);
        var bp = beachRig ? beachRig.tick(mm.x / 2, mm.y / 2, { grounded: mm.grounded, facing: mm.facing, vmax: 90 }) : null;
        if (bp) c.scale(bp.sx * mm.facing, 1);
        Game.entities.drawMomokoSprite(c, -14, -34, Game.customization, 0, { rig: beachRig, mirror: (bp ? bp.face : mm.facing) === -1 });
      }
      /* Companion crab trails behind her opposite facing direction */
      if (Game.entities && Game.entities.drawCrabPet &&
          Game.customization.crab && Game.customization.crab !== 'none') {
        Game.entities.drawCrabPet(c, -22, -2, Game.customization.crab, beachTimer, mm.facing === -1);
      }
      c.restore();
    }

    /* Kitty Corn splashing at shore */
    if (!beachKitty && Game.entities && Game.entities.KittyCorn) {
      beachKitty = new Game.entities.KittyCorn(420, H * 0.9);
    }
    if (beachKitty) {
      beachKitty.update();
      beachKitty.x = 420 + Math.sin(t * 0.04) * 20;
      beachKitty.y = H * 0.9 - 8 + Math.sin(t * 0.12) * 3;
      beachKitty.draw(c, 0, 0);
      /* Splash particles */
      for (var sp2 = 0; sp2 < 3; sp2++) {
        var spa = -Math.PI / 2 + (sp2 - 1) * 0.5;
        var spr = 6 + (Math.sin(t * 0.1 + sp2) + 1) * 8;
        c.fillStyle = 'rgba(255,255,255,0.7)';
        c.beginPath();
        c.arc(beachKitty.x + 12 + Math.cos(spa) * spr, beachKitty.y + 20 + Math.sin(spa) * spr, 2, 0, Math.PI * 2);
        c.fill();
      }
    }

    beachSunX = sunX;
    beachSunY = sunY;
    drawRoomLight(c, 'beach-' + sc.time, paintBeachLight);

    /* Title text with shadow – pulled from a small pool so it varies */
    c.save();
    c.fillStyle = '#ffffff';
    c.font = 'bold 30px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'center';
    c.shadowColor = 'rgba(0,0,0,0.6)';
    c.shadowBlur = 6;
    c.shadowOffsetY = 2;
    c.fillText(Game.i18n.t(sc.titleKey), W / 2, 40);
    c.restore();

    /* Text panel */
    var panelW = 520, panelH = 60, panelX = (W - panelW) / 2, panelY = 58;
    c.fillStyle = 'rgba(0, 40, 70, 0.55)';
    roundRect(c, panelX, panelY, panelW, panelH, 10);
    c.fill();
    c.fillStyle = '#e8f4ff';
    c.font = '14px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'center';
    wrapText(c, Game.i18n.t(sc.textKey), W / 2, panelY + 22, panelW - 20, 20);

    drawButton(c, Game.i18n.t('back'), W / 2 - 90, 140, 180, 40);
  }

  function drawBeachBall(c, x, y, spin) {
    var r = 12;
    /* Base */
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    /* Coloured wedges */
    var wedges = ['#ee4466', '#ffdd44', '#33aaee'];
    for (var w = 0; w < 3; w++) {
      var a0 = spin + (w / 3) * Math.PI * 2;
      var a1 = a0 + Math.PI / 6;
      c.fillStyle = wedges[w];
      c.beginPath();
      c.moveTo(x, y);
      c.arc(x, y, r, a0, a1);
      c.closePath();
      c.fill();
    }
    /* Outline */
    c.strokeStyle = '#333';
    c.lineWidth = 0.8;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
    /* Shadow on sand */
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.beginPath();
    c.ellipse(x, H * 0.88, 8, 2, 0, 0, Math.PI * 2);
    c.fill();
  }

  function drawFrisbee(c, x, y, spin) {
    c.save();
    c.translate(x, y);
    c.rotate(Math.sin(spin) * 0.3);
    c.fillStyle = '#ff6644';
    c.beginPath();
    c.ellipse(0, 0, 12, 3, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#cc3322';
    c.beginPath();
    c.ellipse(0, 1, 12, 1.5, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function handleBeachClick(mx, my) {
    if (hitButton(mx, my, W / 2 - 90, 140, 180, 40)) {
      Game.audio.play('select');
      beachTimer = 0;
      return 'dive';
    }
    return null;
  }

  /* ---- Exports ---- */
  /* ============================================================ */
  /*               TRAVEL MENU (rocket destinations)                */
  /* ============================================================ */
  function drawTravelMenu(c) {
    /* Dim backdrop over the game */
    c.save();
    c.fillStyle = 'rgba(10, 4, 32, 0.85)';
    c.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);

    /* Panel – drop shadow and a soft violet gradient like the other cards */
    var px = W / 2 - 240, py = 70, pw = 480, ph = 340;
    drawPanel(c, px, py, pw, ph, 16, '#ff66cc', '#34166c', '#160834', 3);

    /* Title */
    c.fillStyle = '#44ffff';
    c.font = 'bold 28px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'center';
    c.fillText(Game.i18n.t('travelMenuTitle'), W / 2, 110);

    /* Destination buttons */
    var bw = 190, bh = 180, gap = 30;
    var bx1 = W / 2 - bw - gap / 2;
    var bx2 = W / 2 + gap / 2;
    var by = 150;

    drawDestinationCard(c, bx1, by, bw, bh, 'home');
    drawDestinationCard(c, bx2, by, bw, bh, 'moon');

    /* Cancel button */
    drawButton(c, Game.i18n.t('travelCancel'), W / 2 - 90, 360, 180, 36);
    c.restore();
  }

  function drawDestinationCard(c, x, y, w, h, kind) {
    c.save();
    var hot = pointerOver(c, x, y, w, h);
    drawPanel(c, x, y, w, h, 12, hot ? '#ffffff' : '#44ffff',
      hot ? '#4c2896' : '#3a1c78', hot ? '#281258' : '#1a0a3e');

    /* Planet preview – the same shaded planets as the title and the
       rocket flight, sitting in a soft glow */
    var pcx = x + w / 2, pcy = y + 62;
    var glow = c.createRadialGradient(pcx, pcy, 10, pcx, pcy, 60);
    glow.addColorStop(0, kind === 'home' ? 'rgba(255, 102, 204, 0.3)' : 'rgba(255, 210, 74, 0.3)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c.fillStyle = glow;
    c.fillRect(x + 2, y + 2, w - 4, 120);
    if (kind === 'home') {
      drawShadedPlanet(c, pcx, pcy, 30, '#ffc2ee', '#c43e9a', '#ffd24a');
    } else {
      drawShadedPlanet(c, pcx, pcy, 32, '#fff1a8', '#d69a1e', null);
      /* Cheese holes */
      c.fillStyle = 'rgba(160, 100, 20, 0.55)';
      c.beginPath(); c.arc(pcx - 9, pcy - 5, 5, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(pcx + 9, pcy + 6, 4, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(pcx - 3, pcy + 14, 3, 0, Math.PI * 2); c.fill();
    }

    /* Label */
    c.fillStyle = '#ffffff';
    c.textAlign = 'center';
    var label = kind === 'home'
      ? Game.i18n.t('destHerosPlanet')
      : Game.i18n.t('destCheeseMoon');
    fitFont(c, label, w - 16, 16, 'bold');
    c.fillText(label, pcx, y + 130);

    /* Launch button */
    drawButton(c, Game.i18n.t('travelConfirm'), x + 20, y + 145, w - 40, 30);
    c.restore();
  }

  function handleTravelMenuClick(mx, my) {
    var bw = 190, bh = 180, gap = 30;
    var bx1 = W / 2 - bw - gap / 2;
    var bx2 = W / 2 + gap / 2;
    var by = 150;
    /* Launch buttons within each card */
    if (hitButton(mx, my, bx1 + 20, by + 145, bw - 40, 30)) {
      Game.audio.play('select');
      return { zone: 0 };
    }
    if (hitButton(mx, my, bx2 + 20, by + 145, bw - 40, 30)) {
      Game.audio.play('select');
      return { zone: 1 };
    }
    /* Cancel */
    if (hitButton(mx, my, W / 2 - 90, 360, 180, 36)) {
      Game.audio.play('select');
      return 'cancel';
    }
    return null;
  }

  function updateTravelMenu(keys, jp) {
    /* no-op; click handles all interaction */
  }

  /* ============================================================ */
  /*                    ROCKET LAUNCH ANIMATION                     */
  /* ============================================================ */
  /* Momoko's rocket, nose pointing up, centred on its body. */
  function drawRocketShip(c, flicker) {
    /* Flame */
    var fl = 1 + Math.sin(flicker) * 0.15;
    var fg = c.createLinearGradient(0, 22, 0, 22 + 34 * fl);
    fg.addColorStop(0, '#fff6b0');
    fg.addColorStop(0.4, '#ffb030');
    fg.addColorStop(1, 'rgba(255, 60, 80, 0)');
    c.fillStyle = fg;
    c.beginPath();
    c.moveTo(-9, 22);
    c.quadraticCurveTo(0, 22 + 40 * fl, 9, 22);
    c.closePath();
    c.fill();
    /* Fins */
    c.fillStyle = '#ff7ac8';
    c.beginPath();
    c.moveTo(-11, 4); c.lineTo(-22, 24); c.lineTo(-11, 20); c.closePath();
    c.fill();
    c.fillStyle = '#c23a88';
    c.beginPath();
    c.moveTo(11, 4); c.lineTo(22, 24); c.lineTo(11, 20); c.closePath();
    c.fill();
    /* Body – the same hull as the parked rocket: pale rim, bright lit
       band, violet shadow side */
    var bg = c.createLinearGradient(-12, 0, 12, 0);
    bg.addColorStop(0, '#cfd8ea');
    bg.addColorStop(0.3, '#ffffff');
    bg.addColorStop(0.6, '#d9ddf0');
    bg.addColorStop(1, '#6f6a9e');
    c.fillStyle = bg;
    c.beginPath();
    c.moveTo(0, -34);
    c.bezierCurveTo(14, -22, 13, 0, 11, 22);
    c.lineTo(-11, 22);
    c.bezierCurveTo(-13, 0, -14, -22, 0, -34);
    c.fill();
    /* Nose cone */
    var ng = c.createLinearGradient(-10, 0, 10, 0);
    ng.addColorStop(0, '#ff6aa6');
    ng.addColorStop(0.3, '#ff9cc8');
    ng.addColorStop(1, '#b02460');
    c.fillStyle = ng;
    c.beginPath();
    c.moveTo(0, -34);
    c.bezierCurveTo(8, -27, 10, -22, 10.5, -18);
    c.lineTo(-10.5, -18);
    c.bezierCurveTo(-10, -22, -8, -27, 0, -34);
    c.fill();
    /* Shadow the cone casts on the hull, and a panel line */
    c.fillStyle = 'rgba(40, 30, 90, 0.22)';
    c.fillRect(-10.5, -18, 21, 2.5);
    c.fillRect(-11.5, 8, 23, 0.8);
    /* Porthole */
    c.fillStyle = '#7a6fb0';
    c.beginPath(); c.arc(0, -4, 7, 0, Math.PI * 2); c.fill();
    var wg = c.createRadialGradient(-2, -6, 1, 0, -4, 5.5);
    wg.addColorStop(0, '#d8fbff');
    wg.addColorStop(1, '#2fa8d8');
    c.fillStyle = wg;
    c.beginPath(); c.arc(0, -4, 5.5, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    c.lineWidth = 1.1;
    c.lineCap = 'round';
    c.beginPath(); c.arc(0, -4, 3.8, Math.PI * 1.05, Math.PI * 1.5); c.stroke();
    /* Centre fin */
    c.fillStyle = '#c23a88';
    c.fillRect(-1.5, 12, 3, 13);
  }

  function drawRocketAnim(c, timer, target) {
    var t = Math.min(1, timer / 120); /* 0..1 over the flight */
    drawSpaceBackdrop(c);

    /* Stars streaming past -- faster in mid-flight */
    var speed = 4 + Math.sin(t * Math.PI) * 14;
    c.strokeStyle = '#ffffff';
    c.lineCap = 'round';
    /* Fill the whole view (the tablet screen during the flight) at the
       viewport's streak density. */
    var streaks = Math.round(40 * VIEW.w * VIEW.h / (W * H));
    for (var s = 0; s < streaks; s++) {
      var sy = VIEW.y + (s * 97) % VIEW.h;
      var sx = VIEW.x + VIEW.w - ((s * 211 + timer * speed * (0.5 + (s % 3) * 0.4)) % (VIEW.w + 80));
      c.globalAlpha = 0.25 + (s % 3) * 0.2;
      c.lineWidth = 1 + (s % 3) * 0.5;
      c.beginPath();
      c.moveTo(sx, sy);
      c.lineTo(sx + speed * 2.2, sy);
      c.stroke();
    }
    c.globalAlpha = 1;

    /* Origin planet slides away to the lower-left, destination grows in
       from the right. Zone 0 is the ringed home planet, 1 the Cheese Moon. */
    var home = ['#ffc2ee', '#c43e9a', '#ffd24a'];
    var moon = ['#fff1a8', '#d69a1e', null];
    var from = target === 0 ? moon : home;
    var to = target === 0 ? home : moon;
    drawShadedPlanet(c, 90 - t * 260, H - 30 + t * 120, 120, from[0], from[1], from[2]);
    var dr = 20 + t * t * 120;
    var dpx = W + 60 - t * 230, dpy = 150 + t * 60;
    var dglow = c.createRadialGradient(dpx, dpy, dr * 0.9, dpx, dpy, dr * 1.5);
    dglow.addColorStop(0, hexAlpha(to[0], 0.12));
    dglow.addColorStop(1, hexAlpha(to[0], 0));
    c.fillStyle = dglow;
    c.fillRect(dpx - dr * 2, dpy - dr * 2, dr * 4, dr * 4);
    drawShadedPlanet(c, dpx, dpy, dr, to[0], to[1], to[2]);

    /* Rocket: rises off the origin, cruises, then dips toward the target */
    var rx = 160 + t * 420;
    var ry = 330 - Math.sin(t * Math.PI * 0.9) * 170 + Math.sin(timer * 0.25) * 2;
    var heading = 0.6 + t * 0.7; /* radians from straight up toward the right */
    /* Sparkle trail */
    for (var k = 0; k < 10; k++) {
      var kt = Math.max(0, t - k * 0.02);
      var kx = 160 + kt * 420 - Math.sin(heading) * 30;
      var ky = 330 - Math.sin(kt * Math.PI * 0.9) * 170 + Math.cos(heading) * 30;
      c.globalAlpha = (1 - k / 10) * 0.7;
      c.fillStyle = k % 2 ? '#ffd24a' : '#ff99dd';
      c.beginPath();
      c.arc(kx, ky, 3.5 - k * 0.3, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    c.save();
    c.translate(rx, ry);
    c.rotate(heading);
    c.scale(1.4 - t * 0.5, 1.4 - t * 0.5);
    drawRocketShip(c, timer * 0.9);
    c.restore();

    /* Text */
    c.font = 'bold 26px ' + FONT;
    c.textAlign = 'center';
    c.lineJoin = 'round';
    c.lineWidth = 6;
    c.strokeStyle = '#1a0b3d';
    var msg = timer < 70 ? Game.i18n.t('rocketLaunching') : Game.i18n.t('rocketArriving');
    c.strokeText(msg, W / 2, 56);
    c.fillStyle = '#44ffff';
    c.fillText(msg, W / 2, 56);
  }

  /* ============================================================ */
  /*                    HOUSE INTERIOR & FURNITURE                  */
  /* ============================================================ */
  /* Furniture is organised into named categories. Each category has its
     own row of buyable pieces in the palette so a player who wants only
     plants doesn't have to scroll through unrelated items. */
  var FURNITURE_CATEGORIES = [
    { id: 'sleep',  items: ['bed'] },
    { id: 'seat',   items: ['chair', 'sofa', 'stool'] },
    { id: 'tables', items: ['table', 'coffeeTable', 'desk'] },
    { id: 'light',  items: ['lamp', 'ceilingLight', 'candle'] },
    { id: 'decor',  items: ['painting', 'rug', 'mirror'] },
    { id: 'plants', items: ['plant', 'flowers'] },
    { id: 'tech',   items: ['tv'] },
    { id: 'store',  items: ['bookshelf', 'dresser'] },
  ];
  /* Flat list kept as the source-of-truth for the drawing switch below
     and for back-compat with previously saved rooms. */
  var FURNITURE_TYPES = (function () {
    var t = [];
    for (var i = 0; i < FURNITURE_CATEGORIES.length; i++) {
      for (var j = 0; j < FURNITURE_CATEGORIES[i].items.length; j++) {
        t.push(FURNITURE_CATEGORIES[i].items[j]);
      }
    }
    return t;
  })();
  var selectedCategory = 0;
  var selectedFurniture = null;
  /* Each house keeps its own walked-around Momoko position so re-entering
     a house drops her where she was. */
  var housePlayerPos = {};
  /* Anim timer for the in-house Momoko sprite. */
  var housePlayerFrame = 0;
  var housePlayerFacing = 1;
  /* Bounds where Momoko is allowed to walk (matches the floor area, leaves
     room for the palette strip up top and the exit-door at the right).
     The top is pushed below the category tabs + palette row. */
  var HOUSE_FLOOR_TOP = 196;
  var HOUSE_FLOOR_BOTTOM = H - 30;
  var HOUSE_FLOOR_LEFT = 20;
  var HOUSE_FLOOR_RIGHT = W - 110;

  function loadFurnitureState() {
    try {
      var raw = localStorage.getItem('momoko-space-furniture');
      if (raw) return JSON.parse(raw);
    } catch (e) { /* fallthrough */ }
    return {};
  }

  function saveFurnitureState(state) {
    try {
      localStorage.setItem('momoko-space-furniture', JSON.stringify(state));
    } catch (e) { /* storage disabled */ }
  }

  function getHousePlayerPos(houseId) {
    if (!housePlayerPos[houseId]) {
      housePlayerPos[houseId] = { x: 100, y: H - 80 };
    }
    return housePlayerPos[houseId];
  }

  /* Per-house look: wall gradient, wallpaper motif, floor colours. */
  var HOUSE_THEMES = {
    heroHome:  { wallTop: '#4a2a7a', wallBot: '#6a3c96', motif: 'stars',  ink: '#ffd24a',
                 floor: '#8a5ab8', floorDark: '#5a3488', trim: '#ff66cc' },
    lilaHouse: { wallTop: '#1f5a6a', wallBot: '#2f7f88', motif: 'dots',   ink: '#bff7ee',
                 floor: '#5a8f9a', floorDark: '#355f6a', trim: '#7affd8' },
    migwordCottage: { wallTop: '#a8741c', wallBot: '#d6a032', motif: 'holes', ink: '#7a4a10',
                 floor: '#8a5a2a', floorDark: '#5a3a18', trim: '#ffe27a' },
  };
  /* Wall/floor seam -- just below the palette strip so furniture placed
     anywhere in the walkable band stands on the floor, not the wall. */
  var HOUSE_WALL_BOTTOM = 286;

  function drawHouseInterior(c, houseId) {
    if (MOON_ROOMS[houseId]) { drawMoonRoom(c, houseId); return; }
    var th = HOUSE_THEMES[houseId] || HOUSE_THEMES.heroHome;
    var wb = HOUSE_WALL_BOTTOM;
    /* Back wall */
    var wallGrad = c.createLinearGradient(0, 0, 0, wb);
    wallGrad.addColorStop(0, th.wallTop);
    wallGrad.addColorStop(1, th.wallBot);
    c.fillStyle = wallGrad;
    c.fillRect(0, 0, W, wb);
    /* Wallpaper motif */
    c.save();
    c.globalAlpha = 0.16;
    c.fillStyle = th.ink;
    for (var wy = 18; wy < wb - 10; wy += 34) {
      for (var wx = ((wy / 34) % 2) * 26 + 14; wx < W; wx += 52) {
        c.beginPath();
        if (th.motif === 'stars') {
          for (var k = 0; k < 10; k++) {
            var rr = k % 2 ? 2.4 : 6;
            var aa = -Math.PI / 2 + k * Math.PI / 5;
            c.lineTo(wx + Math.cos(aa) * rr, wy + Math.sin(aa) * rr);
          }
        } else if (th.motif === 'dots') {
          c.arc(wx, wy, 4, 0, Math.PI * 2);
        } else {
          c.ellipse(wx, wy, 7, 5, 0.3, 0, Math.PI * 2);
        }
        c.fill();
      }
    }
    c.restore();
    /* Window with a view of space, below the palette so it stays visible */
    var winX = 300, winY = 204, winW = 150, winH = 66;
    c.fillStyle = '#0a0420';
    roundRect(c, winX, winY, winW, winH, 8);
    c.fill();
    c.save();
    roundRect(c, winX, winY, winW, winH, 8);
    c.clip();
    if (houseId === 'migwordCottage') {
      drawShadedPlanet(c, winX + 112, winY + 22, 16, '#ffc2ee', '#c43e9a', '#ffd24a');
    } else {
      drawShadedPlanet(c, winX + 112, winY + 22, 14, '#fff1a8', '#d69a1e', null);
    }
    c.fillStyle = '#ffffff';
    for (var ws = 0; ws < 12; ws++) {
      c.globalAlpha = 0.4 + ((ws * 17) % 60) / 100;
      c.beginPath();
      c.arc(winX + 8 + ((ws * 13) % 90), winY + 8 + ((ws * 27) % 52), 0.8 + (ws % 3) * 0.5, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    c.strokeStyle = th.trim;
    c.lineWidth = 4;
    roundRect(c, winX, winY, winW, winH, 8);
    c.stroke();
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(winX + winW / 2, winY); c.lineTo(winX + winW / 2, winY + winH);
    c.stroke();
    /* Floor: lighter toward the back wall, planks fanning out in
       perspective from a vanishing point above the room. */
    var floorGrad = c.createLinearGradient(0, wb, 0, H);
    floorGrad.addColorStop(0, th.floorDark);
    floorGrad.addColorStop(1, th.floor);
    c.fillStyle = floorGrad;
    c.fillRect(0, wb, W, H - wb);
    c.strokeStyle = 'rgba(0, 0, 0, 0.18)';
    c.lineWidth = 1;
    for (var pl = -8; pl <= 8; pl++) {
      c.beginPath();
      c.moveTo(W / 2 + pl * 60, wb);
      c.lineTo(W / 2 + pl * 150, H);
      c.stroke();
    }
    for (var row = 1; row < 6; row++) {
      var ry = wb + (H - wb) * (row * row) / 36;
      c.beginPath();
      c.moveTo(0, ry);
      c.lineTo(W, ry);
      c.stroke();
    }
    /* Baseboard */
    c.fillStyle = 'rgba(0, 0, 0, 0.25)';
    c.fillRect(0, wb - 10, W, 10);
    c.fillStyle = th.trim;
    c.globalAlpha = 0.6;
    c.fillRect(0, wb - 10, W, 2);
    c.globalAlpha = 1;
    /* Starlight from the window pooling on the floor, and the floor
       falling into shadow toward the side walls, so the room reads as a
       lit space rather than a flat slab. */
    var pool = c.createLinearGradient(0, wb, 0, H);
    pool.addColorStop(0, 'rgba(255, 244, 214, 0.16)');
    pool.addColorStop(1, 'rgba(255, 244, 214, 0)');
    c.fillStyle = pool;
    c.beginPath();
    c.moveTo(winX + 6, wb);
    c.lineTo(winX + winW - 6, wb);
    c.lineTo(winX + winW + 70, H);
    c.lineTo(winX - 70, H);
    c.closePath();
    c.fill();
    var vig = c.createLinearGradient(0, 0, W, 0);
    vig.addColorStop(0, 'rgba(0, 0, 0, 0.22)');
    vig.addColorStop(0.2, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(0.8, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
    c.fillStyle = vig;
    c.fillRect(0, wb, W, H - wb);
    drawRoomLight(c, 'house-' + houseId, paintHouseLight, true);

    /* House name label – outlined so the cyan reads on the bright
       cheese wallpaper as well as the dark ones */
    c.font = 'bold 20px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'left';
    var nameKey = houseId === 'heroHome' ? 'houseHero'
                : houseId === 'lilaHouse' ? 'houseLila'
                : 'houseMigword';
    c.lineJoin = 'round';
    c.lineWidth = 5;
    c.strokeStyle = '#1a0b3d';
    c.strokeText(Game.i18n.t(nameKey), 20, 40);
    c.fillStyle = '#44ffff';
    c.fillText(Game.i18n.t(nameKey), 20, 40);

    /* Palette strip (categories on top, items below) */
    c.fillStyle = 'rgba(10, 4, 32, 0.8)';
    c.fillRect(0, 50, W, 144);
    c.fillStyle = 'rgba(0, 0, 0, 0.3)';
    c.fillRect(0, 194, W, 3);
    c.fillStyle = 'rgba(176, 124, 255, 0.5)';
    c.fillRect(0, 193, W, 1);
    c.fillStyle = '#ffd24a';
    c.font = '12px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'left';
    c.fillText(Game.i18n.t('furnitureTabTitle'), 10, 64);
    /* Clear button (top-right of the palette strip) */
    var clearW = 84, clearH = 26, clearX = W - clearW - 10, clearY = 52;
    drawButton(c, Game.i18n.t('furnitureClear'), clearX, clearY, clearW, clearH, false, 'danger');
    /* Category tabs */
    var catTabW = Math.min(86, Math.floor((W - 20) / FURNITURE_CATEGORIES.length));
    for (var ci = 0; ci < FURNITURE_CATEGORIES.length; ci++) {
      var cat = FURNITURE_CATEGORIES[ci];
      var cx = 10 + ci * catTabW;
      var cy = 72;
      var catHover = ci === selectedCategory;
      drawChip(c, cx, cy, catTabW - 4, 26, 6, catHover, false);
      c.fillStyle = catHover ? '#ffffff' : '#d8c8f4';
      c.font = 'bold 11px "M PLUS Rounded 1c", sans-serif';
      c.textAlign = 'center';
      c.fillText(
        Game.i18n.t('furnitureCat_' + cat.id),
        cx + (catTabW - 4) / 2,
        cy + 17
      );
    }
    /* Selected category's items */
    var items = FURNITURE_CATEGORIES[selectedCategory].items;
    for (var fi = 0; fi < items.length; fi++) {
      var ft = items[fi];
      var fx = 20 + fi * 78;
      var fy = 108;
      var hover = selectedFurniture === ft;
      drawChip(c, fx, fy, 68, 76, 8, hover, false);
      drawFurniture(c, ft, fx + 34, fy + 38, 'palette');
      /* Tiny label under each piece */
      c.fillStyle = '#ffe9c8';
      var ftLabel = Game.i18n.t('furniture_' + ft) || ft;
      fitFont(c, ftLabel, 62, 10, 'bold');
      c.textAlign = 'center';
      c.fillText(ftLabel, fx + 34, fy + 70);
    }

    /* Placed furniture (drawn before the player so they layer below) */
    var state = loadFurnitureState();
    var items = state[houseId] || [];
    for (var pi = 0; pi < items.length; pi++) {
      drawFurniture(c, items[pi].type, items[pi].x, items[pi].y);
    }

    /* Momoko walking inside — she can mingle with the placed furniture. */
    var pp = getHousePlayerPos(houseId);
    if (Game.entities && Game.entities.drawMomokoSprite) {
      drawInteriorHero(c, blendStep(pp.px, pp.x), blendStep(pp.py, pp.y) + 4, housePlayerFacing, housePlayerFrame);
    }

    /* Exit door (right side, bigger so it reads as an actual exit) */
    c.fillStyle = 'rgba(0, 0, 0, 0.25)';
    c.beginPath();
    c.ellipse(W - 52, H - 30, 44, 6, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#3a2412';
    c.fillRect(W - 84, H - 140, 64, 110);
    var dg = c.createLinearGradient(W - 80, 0, W - 24, 0);
    dg.addColorStop(0, '#9a6a3c');
    dg.addColorStop(1, '#74482a');
    c.fillStyle = dg;
    c.fillRect(W - 80, H - 136, 56, 102);
    /* Recessed panels */
    c.strokeStyle = '#5a3a22';
    c.lineWidth = 1.5;
    c.strokeRect(W - 74, H - 128, 18, 40);
    c.strokeRect(W - 48, H - 128, 18, 40);
    c.strokeRect(W - 74, H - 80, 18, 38);
    c.strokeRect(W - 48, H - 80, 18, 38);
    c.fillStyle = '#ffd24a';
    c.beginPath();
    c.arc(W - 33, H - 86, 3.5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255, 255, 255, 0.6)';
    c.beginPath();
    c.arc(W - 34, H - 87, 1.2, 0, Math.PI * 2);
    c.fill();
    /* "Outside" sign */
    c.fillStyle = '#44ffff';
    c.fillRect(W - 92, H - 152, 80, 16);
    c.fillStyle = '#0a0420';
    c.font = 'bold 11px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'center';
    c.fillText(Game.i18n.t('furnitureExit'), W - 52, H - 141);
    /* One-shot top-right EXIT button (drawn after the palette so it
       sits above category tabs / clear button visually). */
    drawExitButton(c);
  }

  function drawFurniture(c, type, x, y, mode) {
    /* mode: undefined | 'palette' (medium icon) — placed furniture is 1.6×
       so it reads at a glance, palette icons are 0.85×. Each piece is
       rendered with layered shading, gradients, and trim detail rather
       than flat blocks. */
    c.save();
    var scale = mode === 'palette' ? 0.85 : 1.6;
    c.translate(x, y);
    c.scale(scale, scale);
    /* Soft contact shadow under most pieces (skip rug/painting). */
    if (type !== 'rug' && type !== 'painting' && type !== 'mirror' && type !== 'ceilingLight') {
      c.save();
      c.globalAlpha = 0.25;
      c.fillStyle = '#000';
      c.beginPath();
      c.ellipse(0, 16, 26, 4, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    switch (type) {
      case 'bed': {
        /* Carved wooden footboard */
        var foot = c.createLinearGradient(0, 8, 0, 18);
        foot.addColorStop(0, '#a36a3a');
        foot.addColorStop(1, '#5a3418');
        c.fillStyle = foot;
        c.fillRect(-32, 8, 64, 10);
        c.fillStyle = '#c98a4e';
        c.fillRect(-32, 8, 64, 1.5);
        /* Carved beading along the footboard */
        c.fillStyle = '#3a1e0a';
        for (var bf = 0; bf < 7; bf++) {
          c.beginPath();
          c.arc(-26 + bf * 9, 13, 0.9, 0, Math.PI * 2);
          c.fill();
        }
        /* Mattress with piped trim */
        var matt = c.createLinearGradient(0, -6, 0, 10);
        matt.addColorStop(0, '#fff4f8');
        matt.addColorStop(1, '#f0c8d8');
        c.fillStyle = matt;
        c.fillRect(-30, -6, 60, 16);
        c.strokeStyle = '#cc77a0';
        c.lineWidth = 1;
        c.strokeRect(-30, -6, 60, 16);
        /* Mattress button tufts */
        c.fillStyle = '#cc77a0';
        for (var bm = 0; bm < 5; bm++) {
          c.beginPath();
          c.arc(-22 + bm * 11, 0, 0.9, 0, Math.PI * 2);
          c.fill();
        }
        /* Quilted star blanket folded over the foot */
        var blank = c.createLinearGradient(0, 4, 0, 12);
        blank.addColorStop(0, '#7ab8ff');
        blank.addColorStop(1, '#3a78cc');
        c.fillStyle = blank;
        c.fillRect(-30, 2, 60, 8);
        c.fillStyle = '#aad8ff';
        c.fillRect(-30, 2, 60, 1.2);
        /* Tiny stars on the blanket */
        c.fillStyle = '#ffe98a';
        for (var bs = 0; bs < 6; bs++) {
          var bsx = -25 + bs * 10, bsy = 6;
          c.beginPath();
          c.moveTo(bsx, bsy - 1.6);
          c.lineTo(bsx + 0.5, bsy - 0.5);
          c.lineTo(bsx + 1.6, bsy);
          c.lineTo(bsx + 0.5, bsy + 0.5);
          c.lineTo(bsx, bsy + 1.6);
          c.lineTo(bsx - 0.5, bsy + 0.5);
          c.lineTo(bsx - 1.6, bsy);
          c.lineTo(bsx - 0.5, bsy - 0.5);
          c.closePath();
          c.fill();
        }
        /* Pillows — two with lace edges */
        for (var pi2 = 0; pi2 < 2; pi2++) {
          var pX = pi2 === 0 ? -25 : -10;
          var plg = c.createLinearGradient(0, -10, 0, -2);
          plg.addColorStop(0, '#ffffff');
          plg.addColorStop(1, '#ffd9e8');
          c.fillStyle = plg;
          c.fillRect(pX, -10, 13, 8);
          c.strokeStyle = '#ff8ab0';
          c.lineWidth = 0.6;
          for (var pl = 0; pl < 4; pl++) {
            c.beginPath();
            c.arc(pX + 1.5 + pl * 3.3, -10, 0.9, Math.PI, 0);
            c.stroke();
          }
        }
        /* Tall headboard with heart cutout */
        var hb = c.createLinearGradient(0, -28, 0, -6);
        hb.addColorStop(0, '#a36a3a');
        hb.addColorStop(1, '#7a4a22');
        c.fillStyle = hb;
        c.beginPath();
        c.moveTo(-32, -6);
        c.lineTo(-32, -22);
        c.quadraticCurveTo(-32, -30, -24, -30);
        c.lineTo(24, -30);
        c.quadraticCurveTo(32, -30, 32, -22);
        c.lineTo(32, -6);
        c.closePath();
        c.fill();
        c.strokeStyle = '#5a3418';
        c.lineWidth = 0.8;
        c.stroke();
        /* Heart cutout */
        c.fillStyle = '#2a1458';
        c.beginPath();
        c.arc(-2, -22, 2, 0, Math.PI * 2);
        c.arc(2, -22, 2, 0, Math.PI * 2);
        c.moveTo(-3.6, -21);
        c.lineTo(0, -16);
        c.lineTo(3.6, -21);
        c.closePath();
        c.fill();
        /* Headboard finials */
        c.fillStyle = '#c98a4e';
        c.beginPath(); c.arc(-26, -29, 2.5, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(26, -29, 2.5, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#ff66cc';
        c.beginPath(); c.arc(-26, -32, 1.4, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(26, -32, 1.4, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'table': {
        /* Round bistro table — polished wood with pedestal base */
        /* Cross-base feet */
        c.fillStyle = '#3a2010';
        c.beginPath();
        c.moveTo(-16, 14);
        c.lineTo(16, 14);
        c.lineTo(12, 17);
        c.lineTo(-12, 17);
        c.closePath();
        c.fill();
        /* Pedestal with brass rings */
        var ped = c.createLinearGradient(-3, 0, 3, 0);
        ped.addColorStop(0, '#5a3418');
        ped.addColorStop(0.5, '#a36a3a');
        ped.addColorStop(1, '#5a3418');
        c.fillStyle = ped;
        c.fillRect(-3, -4, 6, 18);
        c.fillStyle = '#ffd24a';
        c.fillRect(-3, 0, 6, 1.5);
        c.fillRect(-3, 9, 6, 1.5);
        /* Tabletop ellipse with rim */
        c.fillStyle = '#3a2010';
        c.beginPath();
        c.ellipse(0, -4, 26, 7, 0, 0, Math.PI * 2);
        c.fill();
        var top = c.createRadialGradient(-4, -8, 2, 0, -6, 24);
        top.addColorStop(0, '#d8a064');
        top.addColorStop(0.6, '#a36a3a');
        top.addColorStop(1, '#7a4818');
        c.fillStyle = top;
        c.beginPath();
        c.ellipse(0, -6, 25, 5.5, 0, 0, Math.PI * 2);
        c.fill();
        /* Wood grain lines */
        c.strokeStyle = 'rgba(60,30,12,0.4)';
        c.lineWidth = 0.4;
        for (var tg = 0; tg < 4; tg++) {
          c.beginPath();
          c.ellipse(0, -6, 18 - tg * 4, 4 - tg, 0, 0, Math.PI * 2);
          c.stroke();
        }
        /* Highlight specular */
        c.save();
        c.globalAlpha = 0.5;
        c.fillStyle = '#ffe9c8';
        c.beginPath();
        c.ellipse(-8, -8, 8, 1.4, -0.3, 0, Math.PI * 2);
        c.fill();
        c.restore();
        /* Tiny vase + flower as a centerpiece */
        c.fillStyle = '#cc88ff';
        c.beginPath();
        c.moveTo(-3, -8);
        c.lineTo(3, -8);
        c.lineTo(2, -14);
        c.lineTo(-2, -14);
        c.closePath();
        c.fill();
        c.fillStyle = '#ff66cc';
        c.beginPath(); c.arc(0, -16, 2.2, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#ffd24a';
        c.beginPath(); c.arc(0, -16, 0.9, 0, Math.PI * 2); c.fill();
        /* Stem */
        c.strokeStyle = '#44aa55';
        c.lineWidth = 0.6;
        c.beginPath();
        c.moveTo(0, -14); c.lineTo(0, -16);
        c.stroke();
        break;
      }
      case 'chair': {
        /* Plush armchair — high back with button tufts */
        /* Wooden legs (peeking out at the bottom) */
        c.fillStyle = '#3a2010';
        c.fillRect(-12, 10, 3, 6);
        c.fillRect(9, 10, 3, 6);
        c.fillStyle = '#ffd24a';
        c.fillRect(-12, 14, 3, 1);
        c.fillRect(9, 14, 3, 1);
        /* Arms */
        var armG = c.createLinearGradient(0, -2, 0, 8);
        armG.addColorStop(0, '#dd5599');
        armG.addColorStop(1, '#8a2a66');
        c.fillStyle = armG;
        c.beginPath();
        c.moveTo(-15, -4);
        c.quadraticCurveTo(-17, -6, -15, -8);
        c.quadraticCurveTo(-13, -10, -11, -8);
        c.lineTo(-11, 10);
        c.lineTo(-15, 10);
        c.closePath();
        c.fill();
        c.beginPath();
        c.moveTo(15, -4);
        c.quadraticCurveTo(17, -6, 15, -8);
        c.quadraticCurveTo(13, -10, 11, -8);
        c.lineTo(11, 10);
        c.lineTo(15, 10);
        c.closePath();
        c.fill();
        /* High back */
        var backG = c.createLinearGradient(0, -22, 0, 0);
        backG.addColorStop(0, '#ffaacc');
        backG.addColorStop(1, '#cc4488');
        c.fillStyle = backG;
        c.beginPath();
        c.moveTo(-11, 0);
        c.lineTo(-11, -18);
        c.quadraticCurveTo(-11, -24, -5, -24);
        c.lineTo(5, -24);
        c.quadraticCurveTo(11, -24, 11, -18);
        c.lineTo(11, 0);
        c.closePath();
        c.fill();
        /* Highlight stripe down the back */
        c.save();
        c.globalAlpha = 0.5;
        c.fillStyle = '#ffd9e8';
        c.fillRect(-9, -22, 2, 22);
        c.restore();
        /* Button tufts */
        c.fillStyle = '#8a2a66';
        var tufts = [[-5, -16], [5, -16], [0, -10], [-5, -4], [5, -4]];
        for (var tt = 0; tt < tufts.length; tt++) {
          c.beginPath();
          c.arc(tufts[tt][0], tufts[tt][1], 0.9, 0, Math.PI * 2);
          c.fill();
        }
        /* Cushion (seat) — rounded */
        var cuG = c.createLinearGradient(0, -2, 0, 10);
        cuG.addColorStop(0, '#ffe9f4');
        cuG.addColorStop(1, '#f0a8c8');
        c.fillStyle = cuG;
        c.beginPath();
        c.moveTo(-12, 0);
        c.quadraticCurveTo(-14, 4, -10, 8);
        c.lineTo(10, 8);
        c.quadraticCurveTo(14, 4, 12, 0);
        c.closePath();
        c.fill();
        c.strokeStyle = '#cc6688';
        c.lineWidth = 0.6;
        c.stroke();
        /* Piping along the cushion crease */
        c.fillStyle = '#cc6688';
        for (var cp = 0; cp < 4; cp++) {
          c.beginPath();
          c.arc(-7 + cp * 4.6, 4, 0.5, 0, Math.PI * 2);
          c.fill();
        }
        break;
      }
      case 'lamp': {
        /* Floor lamp with fringed pleated shade and warm glow */
        /* Glow halo */
        c.save();
        c.globalAlpha = 0.45;
        var halo = c.createRadialGradient(0, -16, 2, 0, -16, 26);
        halo.addColorStop(0, 'rgba(255,232,140,0.9)');
        halo.addColorStop(1, 'rgba(255,232,140,0)');
        c.fillStyle = halo;
        c.beginPath(); c.arc(0, -16, 26, 0, Math.PI * 2); c.fill();
        c.restore();
        /* Brass base */
        c.fillStyle = '#3a2a14';
        c.fillRect(-8, 12, 16, 4);
        var baseG = c.createLinearGradient(-8, 8, 8, 12);
        baseG.addColorStop(0, '#7a5a22');
        baseG.addColorStop(0.5, '#ffd24a');
        baseG.addColorStop(1, '#7a5a22');
        c.fillStyle = baseG;
        c.beginPath();
        c.ellipse(0, 12, 8, 3, 0, 0, Math.PI * 2);
        c.fill();
        /* Pole */
        var poleG = c.createLinearGradient(-2, 0, 2, 0);
        poleG.addColorStop(0, '#5a4218');
        poleG.addColorStop(0.5, '#c89a3a');
        poleG.addColorStop(1, '#5a4218');
        c.fillStyle = poleG;
        c.fillRect(-1, -8, 2, 22);
        /* Decorative knob midway */
        c.fillStyle = '#ffd24a';
        c.beginPath(); c.arc(0, 2, 1.6, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#7a5a22';
        c.beginPath(); c.arc(0, 2, 0.7, 0, Math.PI * 2); c.fill();
        /* Pleated shade — drawn as a polygon with vertical fold lines */
        var sh = c.createLinearGradient(0, -22, 0, -8);
        sh.addColorStop(0, '#fff2a0');
        sh.addColorStop(1, '#d8a040');
        c.fillStyle = sh;
        c.beginPath();
        c.moveTo(-8, -22);
        c.lineTo(8, -22);
        c.lineTo(13, -8);
        c.lineTo(-13, -8);
        c.closePath();
        c.fill();
        c.strokeStyle = '#a86820';
        c.lineWidth = 0.5;
        for (var pf = 0; pf < 6; pf++) {
          var px2 = -10 + pf * 4;
          c.beginPath();
          c.moveTo(px2, -22 + Math.abs(pf - 2.5) * 0.5);
          c.lineTo(px2 + (px2 < 0 ? -2 : 2) * 0.5, -8);
          c.stroke();
        }
        /* Top trim band */
        c.fillStyle = '#a86820';
        c.fillRect(-8, -23, 16, 1.5);
        /* Bottom fringe */
        c.fillStyle = '#ffd24a';
        for (var fr = 0; fr < 7; fr++) {
          var frx = -13 + fr * 4.4;
          c.beginPath();
          c.moveTo(frx, -8);
          c.lineTo(frx + 1.5, -5);
          c.lineTo(frx + 3, -8);
          c.closePath();
          c.fill();
        }
        /* Glowing bulb tip */
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(0, -10, 1.4, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'rug': {
        /* Persian-style oval rug with medallion */
        /* Outer dark border */
        c.fillStyle = '#3a1840';
        c.beginPath();
        c.ellipse(0, 0, 32, 11, 0, 0, Math.PI * 2);
        c.fill();
        /* Main field */
        var rugG = c.createRadialGradient(0, 0, 2, 0, 0, 30);
        rugG.addColorStop(0, '#cc4466');
        rugG.addColorStop(0.7, '#882244');
        rugG.addColorStop(1, '#5a1830');
        c.fillStyle = rugG;
        c.beginPath();
        c.ellipse(0, 0, 29, 9.5, 0, 0, Math.PI * 2);
        c.fill();
        /* Inner border line */
        c.strokeStyle = '#ffd24a';
        c.lineWidth = 0.8;
        c.beginPath();
        c.ellipse(0, 0, 27, 8.6, 0, 0, Math.PI * 2);
        c.stroke();
        c.beginPath();
        c.ellipse(0, 0, 25, 7.6, 0, 0, Math.PI * 2);
        c.stroke();
        /* Central medallion */
        c.fillStyle = '#3a1840';
        c.beginPath();
        c.ellipse(0, 0, 12, 4, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#ffd24a';
        c.beginPath();
        c.ellipse(0, 0, 9, 2.8, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#cc4466';
        c.beginPath();
        c.ellipse(0, 0, 4, 1.4, 0, 0, Math.PI * 2);
        c.fill();
        /* Diamond motifs at the cardinal points */
        c.fillStyle = '#44ccff';
        var diamonds = [[-21, 0], [21, 0], [0, -6.5], [0, 6.5]];
        for (var dm = 0; dm < diamonds.length; dm++) {
          var dxr = diamonds[dm][0], dyr = diamonds[dm][1];
          c.beginPath();
          c.moveTo(dxr, dyr - 1.6);
          c.lineTo(dxr + 1.6, dyr);
          c.lineTo(dxr, dyr + 1.6);
          c.lineTo(dxr - 1.6, dyr);
          c.closePath();
          c.fill();
        }
        /* Corner flourishes */
        c.fillStyle = '#ff99cc';
        var flourish = [[-15, -4], [15, -4], [-15, 4], [15, 4]];
        for (var ff = 0; ff < flourish.length; ff++) {
          c.beginPath();
          c.arc(flourish[ff][0], flourish[ff][1], 1.2, 0, Math.PI * 2);
          c.fill();
        }
        /* End tassels */
        c.strokeStyle = '#ffe9c8';
        c.lineWidth = 0.5;
        for (var ts = 0; ts < 9; ts++) {
          var tsy2 = -4 + ts * 1;
          c.beginPath();
          c.moveTo(-32, tsy2);
          c.lineTo(-35, tsy2);
          c.stroke();
          c.beginPath();
          c.moveTo(32, tsy2);
          c.lineTo(35, tsy2);
          c.stroke();
        }
        break;
      }
      case 'plant': {
        /* Potted monstera with glossy leaves and decorated terracotta pot */
        /* Pot body — terracotta with painted band */
        var potG = c.createLinearGradient(0, 4, 0, 18);
        potG.addColorStop(0, '#d88848');
        potG.addColorStop(1, '#7a3a18');
        c.fillStyle = potG;
        c.beginPath();
        c.moveTo(-9, 4);
        c.lineTo(9, 4);
        c.lineTo(7, 18);
        c.lineTo(-7, 18);
        c.closePath();
        c.fill();
        /* Pot rim */
        c.fillStyle = '#f0a868';
        c.fillRect(-10, 2, 20, 3);
        c.fillStyle = '#5a2810';
        c.fillRect(-10, 5, 20, 0.6);
        /* Painted geo-pattern band */
        c.fillStyle = '#ffe9c8';
        c.fillRect(-8, 9, 16, 3);
        c.fillStyle = '#7a3a18';
        for (var pp2 = 0; pp2 < 4; pp2++) {
          c.beginPath();
          c.moveTo(-7 + pp2 * 4, 9);
          c.lineTo(-5 + pp2 * 4, 12);
          c.lineTo(-3 + pp2 * 4, 9);
          c.closePath();
          c.fill();
        }
        /* Soil */
        c.fillStyle = '#3a2010';
        c.beginPath();
        c.ellipse(0, 4, 9, 1.6, 0, 0, Math.PI * 2);
        c.fill();
        /* Leaf drawing helper — split monstera-style */
        function leaf(cx2, cy2, w, h, rot, light, dark, slits) {
          c.save();
          c.translate(cx2, cy2);
          c.rotate(rot);
          var lg = c.createLinearGradient(0, -h, 0, h);
          lg.addColorStop(0, light);
          lg.addColorStop(1, dark);
          c.fillStyle = lg;
          c.beginPath();
          c.moveTo(0, h);
          c.bezierCurveTo(-w, h * 0.4, -w, -h * 0.6, 0, -h);
          c.bezierCurveTo(w, -h * 0.6, w, h * 0.4, 0, h);
          c.closePath();
          c.fill();
          /* Center vein */
          c.strokeStyle = dark;
          c.lineWidth = 0.6;
          c.beginPath();
          c.moveTo(0, h);
          c.lineTo(0, -h);
          c.stroke();
          /* Side veins / monstera slits */
          for (var ll = 0; ll < slits; ll++) {
            var ly = -h * 0.7 + (ll / (slits - 1)) * h * 1.4;
            c.lineWidth = 0.4;
            c.beginPath();
            c.moveTo(0, ly);
            c.lineTo(w * 0.7, ly + h * 0.1);
            c.stroke();
            c.beginPath();
            c.moveTo(0, ly);
            c.lineTo(-w * 0.7, ly + h * 0.1);
            c.stroke();
          }
          c.restore();
        }
        leaf(-7, -2, 6, 10, -0.5, '#7ad06a', '#1f5a28', 4);
        leaf(7, -3, 6, 11, 0.5, '#7ad06a', '#1f5a28', 4);
        leaf(-3, -10, 5, 12, -0.15, '#a8e088', '#2a6a30', 4);
        leaf(3, -12, 5, 11, 0.15, '#a8e088', '#2a6a30', 4);
        leaf(0, -16, 4, 9, 0, '#c8f098', '#2a6a30', 3);
        /* Highlight glints on a couple of leaves */
        c.save();
        c.globalAlpha = 0.5;
        c.fillStyle = '#fff';
        c.beginPath(); c.arc(-7, -4, 0.9, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(5, -10, 0.7, 0, Math.PI * 2); c.fill();
        c.restore();
        break;
      }
      case 'painting': {
        /* Ornate gilt-framed cosmic landscape */
        /* Outer dark frame edge */
        c.fillStyle = '#3a2a14';
        c.fillRect(-19, -17, 38, 34);
        /* Gilt frame with gradient */
        var frG = c.createLinearGradient(-18, -16, 18, 16);
        frG.addColorStop(0, '#ffe9a8');
        frG.addColorStop(0.5, '#c89a3a');
        frG.addColorStop(1, '#7a5a22');
        c.fillStyle = frG;
        c.fillRect(-18, -16, 36, 32);
        /* Inner mat */
        c.fillStyle = '#1a0a2a';
        c.fillRect(-15, -13, 30, 26);
        /* Painted scene — dusk sky gradient */
        var sky = c.createLinearGradient(0, -12, 0, 12);
        sky.addColorStop(0, '#4a1858');
        sky.addColorStop(0.6, '#cc5577');
        sky.addColorStop(1, '#ffaa66');
        c.fillStyle = sky;
        c.fillRect(-14, -12, 28, 24);
        /* Distant ringed planet */
        c.fillStyle = '#ffd24a';
        c.beginPath();
        c.arc(-5, -6, 4, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#ffe9c8';
        c.lineWidth = 0.8;
        c.beginPath();
        c.ellipse(-5, -6, 7, 2, -0.3, 0, Math.PI * 2);
        c.stroke();
        /* Tiny moon */
        c.fillStyle = '#ffe9c8';
        c.beginPath();
        c.arc(7, -8, 1.6, 0, Math.PI * 2);
        c.fill();
        /* Stars */
        c.fillStyle = '#ffffff';
        var stars = [[-10, -10], [10, -4], [-8, -2], [4, -10], [-2, -9]];
        for (var st = 0; st < stars.length; st++) {
          c.beginPath();
          c.arc(stars[st][0], stars[st][1], 0.6, 0, Math.PI * 2);
          c.fill();
        }
        /* Foreground mountains */
        c.fillStyle = '#1a0a2a';
        c.beginPath();
        c.moveTo(-14, 12);
        c.lineTo(-10, 4);
        c.lineTo(-5, 9);
        c.lineTo(0, 2);
        c.lineTo(6, 7);
        c.lineTo(11, 3);
        c.lineTo(14, 12);
        c.closePath();
        c.fill();
        /* Frame corner ornaments */
        c.fillStyle = '#ffe9a8';
        var corners = [[-18, -16], [18, -16], [-18, 16], [18, 16]];
        for (var co = 0; co < corners.length; co++) {
          c.beginPath();
          c.arc(corners[co][0], corners[co][1], 2.4, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = '#7a5a22';
        for (var co2 = 0; co2 < corners.length; co2++) {
          c.beginPath();
          c.arc(corners[co2][0], corners[co2][1], 1.1, 0, Math.PI * 2);
          c.fill();
        }
        /* Hanging hook & wire */
        c.strokeStyle = '#5a4218';
        c.lineWidth = 0.5;
        c.beginPath();
        c.moveTo(-10, -18);
        c.quadraticCurveTo(0, -22, 10, -18);
        c.stroke();
        c.fillStyle = '#3a2a14';
        c.beginPath();
        c.arc(0, -21, 1.2, 0, Math.PI * 2);
        c.fill();
        break;
      }
      case 'bookshelf': {
        /* Carved bookshelf with varied books, plant, drawer */
        /* Outer carved frame */
        var bsG = c.createLinearGradient(-18, 0, 18, 0);
        bsG.addColorStop(0, '#3a2010');
        bsG.addColorStop(0.5, '#7a4a22');
        bsG.addColorStop(1, '#3a2010');
        c.fillStyle = bsG;
        c.fillRect(-18, -26, 36, 50);
        /* Crown molding */
        c.fillStyle = '#a36a3a';
        c.fillRect(-19, -28, 38, 4);
        c.fillStyle = '#5a3418';
        c.fillRect(-19, -25, 38, 1);
        /* Decorative pediment */
        c.fillStyle = '#a36a3a';
        c.beginPath();
        c.moveTo(-14, -28);
        c.lineTo(0, -32);
        c.lineTo(14, -28);
        c.closePath();
        c.fill();
        c.fillStyle = '#ffd24a';
        c.beginPath(); c.arc(0, -30, 1.4, 0, Math.PI * 2); c.fill();
        /* Inset back panel */
        c.fillStyle = '#2a1408';
        c.fillRect(-15, -23, 30, 38);
        /* Shelf horizontals */
        c.fillStyle = '#5a3418';
        c.fillRect(-15, -10, 30, 1.5);
        c.fillRect(-15, 4, 30, 1.5);
        /* --- TOP SHELF: tall books, leaning */
        var topBooks = [
          {x: -13, w: 4, h: 12, c: '#cc4466', t: '#ffd24a'},
          {x: -8.5, w: 3, h: 11, c: '#4488cc', t: '#ffe9c8'},
          {x: -4.5, w: 4, h: 12, c: '#44aa66', t: '#ffd24a'},
          {x: 0, w: 3, h: 10, c: '#ffd24a', t: '#cc4466'},
          {x: 3.5, w: 3.5, h: 11, c: '#cc88ff', t: '#fff'},
          {x: 7.5, w: 4, h: 12, c: '#ff7733', t: '#ffe9c8'},
        ];
        for (var tb = 0; tb < topBooks.length; tb++) {
          var bk = topBooks[tb];
          var bkg = c.createLinearGradient(bk.x, 0, bk.x + bk.w, 0);
          bkg.addColorStop(0, bk.c);
          bkg.addColorStop(0.5, bk.t);
          bkg.addColorStop(1, bk.c);
          c.fillStyle = bk.c;
          c.fillRect(bk.x, -10 - bk.h, bk.w, bk.h);
          c.fillStyle = bk.t;
          c.fillRect(bk.x, -10 - bk.h, bk.w, 1);
          c.fillRect(bk.x, -12, bk.w, 0.6);
          /* Tiny title band */
          c.fillStyle = bk.t;
          c.fillRect(bk.x + 0.6, -10 - bk.h * 0.6, bk.w - 1.2, 0.6);
        }
        /* Leaning book */
        c.save();
        c.translate(12, -10);
        c.rotate(-0.3);
        c.fillStyle = '#44ccff';
        c.fillRect(0, -8, 3, 8);
        c.fillStyle = '#ffd24a';
        c.fillRect(0, -8, 3, 0.6);
        c.restore();
        /* --- MIDDLE SHELF: shorter books + a tiny plant */
        var midBooks = [
          {x: -13, w: 3, h: 9, c: '#6a3aaa'},
          {x: -9.5, w: 4, h: 8, c: '#aa4466'},
          {x: -5, w: 3, h: 9, c: '#22aa88'},
          {x: -1.5, w: 3, h: 8, c: '#ddaa44'},
        ];
        for (var mb = 0; mb < midBooks.length; mb++) {
          var mbk = midBooks[mb];
          c.fillStyle = mbk.c;
          c.fillRect(mbk.x, 4 - mbk.h, mbk.w, mbk.h);
          c.fillStyle = '#ffd24a';
          c.fillRect(mbk.x, 4 - mbk.h, mbk.w, 0.5);
        }
        /* Small plant on the middle shelf */
        c.fillStyle = '#a36a3a';
        c.fillRect(4, -2, 5, 5);
        c.fillStyle = '#44aa66';
        c.beginPath();
        c.arc(4, -3, 2.2, 0, Math.PI * 2);
        c.arc(7.5, -4, 2.2, 0, Math.PI * 2);
        c.arc(10, -2, 2.2, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#ff66cc';
        c.beginPath();
        c.arc(7.5, -5, 0.9, 0, Math.PI * 2);
        c.fill();
        /* Tiny clock */
        c.fillStyle = '#ffd24a';
        c.beginPath();
        c.arc(11, 2, 1.6, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#3a2010';
        c.lineWidth = 0.4;
        c.beginPath(); c.moveTo(11, 2); c.lineTo(11, 0.8);
        c.moveTo(11, 2); c.lineTo(12, 2);
        c.stroke();
        /* --- DRAWER at the bottom */
        var dwG = c.createLinearGradient(0, 6, 0, 24);
        dwG.addColorStop(0, '#a36a3a');
        dwG.addColorStop(1, '#5a3418');
        c.fillStyle = dwG;
        c.fillRect(-15, 6, 30, 12);
        c.strokeStyle = '#3a2010';
        c.lineWidth = 0.6;
        c.strokeRect(-15, 6, 30, 12);
        /* Drawer dividers */
        c.beginPath();
        c.moveTo(0, 6); c.lineTo(0, 18);
        c.stroke();
        /* Brass knobs */
        c.fillStyle = '#ffd24a';
        c.beginPath(); c.arc(-7.5, 12, 1.4, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(7.5, 12, 1.4, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#7a5a22';
        c.beginPath(); c.arc(-7.5, 12, 0.6, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(7.5, 12, 0.6, 0, Math.PI * 2); c.fill();
        /* Bottom feet */
        c.fillStyle = '#3a2010';
        c.fillRect(-18, 22, 5, 4);
        c.fillRect(13, 22, 5, 4);
        /* Side carving accents */
        c.fillStyle = '#a36a3a';
        c.fillRect(-18, -22, 1.5, 32);
        c.fillRect(16.5, -22, 1.5, 32);
        break;
      }
      case 'sofa': {
        /* Three-cushion velvet sofa */
        c.fillStyle = '#3a2010';
        c.fillRect(-26, 12, 4, 6);
        c.fillRect(22, 12, 4, 6);
        var sofaBack = c.createLinearGradient(0, -16, 0, 4);
        sofaBack.addColorStop(0, '#cc4488');
        sofaBack.addColorStop(1, '#7a2454');
        c.fillStyle = sofaBack;
        c.beginPath();
        c.moveTo(-30, -2);
        c.quadraticCurveTo(-30, -16, -22, -16);
        c.lineTo(22, -16);
        c.quadraticCurveTo(30, -16, 30, -2);
        c.lineTo(30, 12);
        c.lineTo(-30, 12);
        c.closePath();
        c.fill();
        /* Three seat cushions */
        var cs = c.createLinearGradient(0, -2, 0, 12);
        cs.addColorStop(0, '#ff99cc');
        cs.addColorStop(1, '#cc4488');
        c.fillStyle = cs;
        for (var sc = 0; sc < 3; sc++) {
          c.fillRect(-26 + sc * 18, -2, 17, 14);
          c.strokeStyle = '#7a2454';
          c.lineWidth = 0.6;
          c.strokeRect(-26 + sc * 18, -2, 17, 14);
        }
        /* Pillows */
        c.fillStyle = '#ffe9c8';
        c.fillRect(-22, -10, 6, 6);
        c.fillStyle = '#88ddff';
        c.fillRect(16, -10, 6, 6);
        /* Tufts on the back */
        c.fillStyle = '#5a1a3a';
        for (var sft = 0; sft < 5; sft++) {
          c.beginPath();
          c.arc(-18 + sft * 9, -10, 0.7, 0, Math.PI * 2);
          c.fill();
        }
        break;
      }
      case 'stool': {
        /* Round padded stool with brass legs */
        c.fillStyle = '#ffd24a';
        c.fillRect(-9, 6, 2, 10);
        c.fillRect(7, 6, 2, 10);
        c.fillStyle = '#a86820';
        c.fillRect(-9, 14, 2, 2);
        c.fillRect(7, 14, 2, 2);
        var sto = c.createRadialGradient(0, 2, 2, 0, 4, 14);
        sto.addColorStop(0, '#ee99dd');
        sto.addColorStop(1, '#aa3a88');
        c.fillStyle = sto;
        c.beginPath();
        c.ellipse(0, 4, 12, 5, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#552266';
        c.beginPath(); c.arc(0, 4, 0.9, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'coffeeTable': {
        /* Low rectangular coffee table with magazine + mug */
        c.fillStyle = '#3a2010';
        c.fillRect(-20, 10, 4, 6);
        c.fillRect(16, 10, 4, 6);
        var ctop = c.createLinearGradient(0, -2, 0, 10);
        ctop.addColorStop(0, '#d8a064');
        ctop.addColorStop(1, '#7a4818');
        c.fillStyle = ctop;
        c.fillRect(-22, -2, 44, 12);
        c.fillStyle = '#5a2a14';
        c.fillRect(-22, -2, 44, 1.5);
        /* Magazine */
        c.fillStyle = '#88ddff';
        c.fillRect(-14, 0, 14, 8);
        c.fillStyle = '#ff66cc';
        c.fillRect(-13, 1, 6, 1);
        c.fillRect(-13, 3, 8, 1);
        /* Mug */
        c.fillStyle = '#ffd24a';
        c.fillRect(4, 1, 6, 6);
        c.strokeStyle = '#ffd24a';
        c.lineWidth = 1;
        c.beginPath(); c.arc(11, 4, 2, -Math.PI / 2, Math.PI / 2); c.stroke();
        break;
      }
      case 'desk': {
        /* Writing desk with drawer + lamp + book */
        c.fillStyle = '#3a2010';
        c.fillRect(-22, -4, 44, 6);
        c.fillRect(-22, 2, 6, 18);
        c.fillRect(16, 2, 6, 18);
        /* Drawer */
        c.fillStyle = '#a36a3a';
        c.fillRect(-15, 4, 30, 8);
        c.strokeStyle = '#3a2010';
        c.lineWidth = 0.6;
        c.strokeRect(-15, 4, 30, 8);
        c.fillStyle = '#ffd24a';
        c.beginPath(); c.arc(0, 8, 1.4, 0, Math.PI * 2); c.fill();
        /* Desk top highlight */
        c.fillStyle = '#d8a064';
        c.fillRect(-22, -4, 44, 1.4);
        /* Tiny task lamp */
        c.strokeStyle = '#ddddee';
        c.lineWidth = 1.4;
        c.beginPath();
        c.moveTo(-12, -4);
        c.lineTo(-12, -10);
        c.lineTo(-7, -12);
        c.stroke();
        c.fillStyle = '#ffd24a';
        c.beginPath();
        c.moveTo(-9, -10);
        c.lineTo(-3, -10);
        c.lineTo(-5, -7);
        c.lineTo(-7, -7);
        c.closePath();
        c.fill();
        /* Stack of books */
        c.fillStyle = '#cc4466';
        c.fillRect(6, -8, 10, 2);
        c.fillStyle = '#44aa66';
        c.fillRect(7, -10, 9, 2);
        c.fillStyle = '#4488cc';
        c.fillRect(6, -12, 10, 2);
        break;
      }
      case 'ceilingLight': {
        /* Pendant chandelier — small but ornate */
        c.strokeStyle = '#3a1a2a';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(0, -22);
        c.lineTo(0, -12);
        c.stroke();
        c.fillStyle = '#ffd24a';
        c.beginPath();
        c.moveTo(-10, -12);
        c.lineTo(10, -12);
        c.lineTo(7, -2);
        c.lineTo(-7, -2);
        c.closePath();
        c.fill();
        c.fillStyle = '#ffe9a8';
        c.beginPath(); c.arc(0, -2, 2.6, 0, Math.PI * 2); c.fill();
        /* Glow */
        c.save();
        c.globalAlpha = 0.4;
        var ceilG = c.createRadialGradient(0, -2, 2, 0, -2, 24);
        ceilG.addColorStop(0, '#ffe98a');
        ceilG.addColorStop(1, 'rgba(255,232,140,0)');
        c.fillStyle = ceilG;
        c.beginPath(); c.arc(0, -2, 24, 0, Math.PI * 2); c.fill();
        c.restore();
        /* Drop crystals */
        c.fillStyle = '#cdeaf4';
        c.beginPath(); c.arc(-6, 1, 1, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(0, 3, 1.2, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(6, 1, 1, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'candle': {
        /* Three pillar candles in a brass tray */
        c.fillStyle = '#3a2014';
        c.beginPath();
        c.ellipse(0, 14, 16, 3, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#ffd24a';
        c.fillRect(-14, 12, 28, 2);
        var heights = [-6, -10, -4];
        var cposx = [-9, 0, 9];
        for (var ca = 0; ca < 3; ca++) {
          c.fillStyle = '#ffe9c8';
          c.fillRect(cposx[ca] - 2, heights[ca], 4, 12 - heights[ca]);
          c.fillStyle = '#cc8855';
          c.fillRect(cposx[ca] - 2, heights[ca], 4, 1.4);
          c.strokeStyle = '#3a2010';
          c.lineWidth = 0.5;
          c.beginPath();
          c.moveTo(cposx[ca], heights[ca] - 1);
          c.lineTo(cposx[ca], heights[ca] - 4);
          c.stroke();
          c.fillStyle = '#ffaa44';
          c.beginPath();
          c.ellipse(cposx[ca], heights[ca] - 5, 1.2, 2.4, 0, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#ffe98a';
          c.beginPath();
          c.ellipse(cposx[ca], heights[ca] - 5, 0.6, 1.6, 0, 0, Math.PI * 2);
          c.fill();
        }
        break;
      }
      case 'mirror': {
        /* Tall ornate oval mirror */
        c.fillStyle = '#3a2a14';
        c.beginPath();
        c.ellipse(0, 0, 14, 22, 0, 0, Math.PI * 2);
        c.fill();
        var mirG = c.createLinearGradient(-12, -20, 12, 20);
        mirG.addColorStop(0, '#ffe9a8');
        mirG.addColorStop(0.5, '#c89a3a');
        mirG.addColorStop(1, '#7a5a22');
        c.fillStyle = mirG;
        c.beginPath();
        c.ellipse(0, 0, 13, 20, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#cdeaf4';
        c.beginPath();
        c.ellipse(0, 0, 10, 17, 0, 0, Math.PI * 2);
        c.fill();
        /* Reflection sheen */
        c.save();
        c.globalAlpha = 0.5;
        c.fillStyle = '#fff';
        c.beginPath();
        c.ellipse(-3, -8, 3, 8, -0.3, 0, Math.PI * 2);
        c.fill();
        c.restore();
        /* Top crown ornament */
        c.fillStyle = '#ffd24a';
        c.beginPath(); c.arc(0, -22, 2, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'flowers': {
        /* Bouquet vase with mixed wildflowers */
        c.fillStyle = '#cdeaf4';
        c.beginPath();
        c.moveTo(-7, 6);
        c.lineTo(7, 6);
        c.lineTo(5, 18);
        c.lineTo(-5, 18);
        c.closePath();
        c.fill();
        c.fillStyle = '#88ccdd';
        c.fillRect(-7, 6, 14, 1.4);
        /* Stems */
        c.strokeStyle = '#3a8a3a';
        c.lineWidth = 0.6;
        for (var ss = 0; ss < 5; ss++) {
          c.beginPath();
          c.moveTo(-4 + ss * 2, 6);
          c.lineTo(-4 + ss * 2 + (ss - 2) * 0.6, -6 - ss * 0.5);
          c.stroke();
        }
        /* Flower heads */
        var flCol = ['#ff66cc', '#ffd24a', '#cc88ff', '#ff8866', '#88ddff'];
        var flY = [-8, -10, -7, -11, -9];
        for (var flI = 0; flI < 5; flI++) {
          c.fillStyle = flCol[flI];
          c.beginPath();
          c.arc(-4 + flI * 2 + (flI - 2) * 0.6, flY[flI], 2.2, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#ffd24a';
          c.beginPath();
          c.arc(-4 + flI * 2 + (flI - 2) * 0.6, flY[flI], 0.7, 0, Math.PI * 2);
          c.fill();
        }
        /* Leaves */
        c.fillStyle = '#3a8a3a';
        c.beginPath();
        c.ellipse(-3, 2, 3, 1.2, 0.4, 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        c.ellipse(3, 2, 3, 1.2, -0.4, 0, Math.PI * 2);
        c.fill();
        break;
      }
      case 'tv': {
        /* Retro tube TV on a wooden stand */
        c.fillStyle = '#3a2010';
        c.fillRect(-20, 10, 40, 8);
        c.fillStyle = '#5a3418';
        c.fillRect(-20, 10, 40, 1.4);
        c.fillStyle = '#3a2010';
        c.fillRect(-16, 18, 4, 6);
        c.fillRect(12, 18, 4, 6);
        /* TV body */
        c.fillStyle = '#3a3a4a';
        c.fillRect(-18, -16, 36, 26);
        /* Screen */
        var scr = c.createLinearGradient(-14, -12, 14, 6);
        scr.addColorStop(0, '#88aaff');
        scr.addColorStop(0.5, '#cdeaf4');
        scr.addColorStop(1, '#3a4488');
        c.fillStyle = scr;
        c.fillRect(-14, -12, 28, 18);
        /* Static / scan lines */
        c.strokeStyle = 'rgba(255,255,255,0.18)';
        c.lineWidth = 0.4;
        for (var sl = 0; sl < 4; sl++) {
          c.beginPath();
          c.moveTo(-14, -10 + sl * 4);
          c.lineTo(14, -10 + sl * 4);
          c.stroke();
        }
        /* Heart on the screen */
        c.fillStyle = '#ff66cc';
        c.beginPath();
        c.arc(-2, -3, 1.4, 0, Math.PI * 2);
        c.arc(2, -3, 1.4, 0, Math.PI * 2);
        c.moveTo(-3.4, -2);
        c.lineTo(0, 1.2);
        c.lineTo(3.4, -2);
        c.closePath();
        c.fill();
        /* Knobs and antenna */
        c.fillStyle = '#7a8896';
        c.beginPath(); c.arc(-15, 2, 1.4, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(-15, 6, 1.4, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#7a8896';
        c.lineWidth = 0.8;
        c.beginPath();
        c.moveTo(-6, -16); c.lineTo(-12, -22);
        c.moveTo(6, -16); c.lineTo(12, -22);
        c.stroke();
        c.fillStyle = '#ff66cc';
        c.beginPath(); c.arc(-12, -22, 0.9, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(12, -22, 0.9, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'dresser': {
        /* Mid-century three-drawer dresser with mirror */
        var drG = c.createLinearGradient(-22, 0, 22, 0);
        drG.addColorStop(0, '#5a3418');
        drG.addColorStop(0.5, '#a36a3a');
        drG.addColorStop(1, '#5a3418');
        c.fillStyle = drG;
        c.fillRect(-22, -10, 44, 30);
        /* Top edge highlight */
        c.fillStyle = '#d8a064';
        c.fillRect(-22, -10, 44, 1.6);
        /* Three drawers */
        c.strokeStyle = '#3a2010';
        c.lineWidth = 0.8;
        for (var dr = 0; dr < 3; dr++) {
          c.strokeRect(-20, -7 + dr * 9, 40, 8);
          c.fillStyle = '#ffd24a';
          c.beginPath(); c.arc(-8, -3 + dr * 9, 1.2, 0, Math.PI * 2); c.fill();
          c.beginPath(); c.arc(8, -3 + dr * 9, 1.2, 0, Math.PI * 2); c.fill();
        }
        /* Vanity items on top */
        c.fillStyle = '#ff99cc';
        c.fillRect(-12, -14, 6, 4);
        c.fillStyle = '#cc88ff';
        c.beginPath(); c.arc(2, -12, 2.4, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#ffd24a';
        c.beginPath(); c.arc(2, -13, 0.8, 0, Math.PI * 2); c.fill();
        /* Feet */
        c.fillStyle = '#3a2010';
        c.fillRect(-22, 20, 4, 4);
        c.fillRect(18, 20, 4, 4);
        break;
      }
    }
    c.restore();
  }

  function handleHouseInteriorClick(mx, my, houseId) {
    if (MOON_ROOMS[houseId]) return handleMoonRoomClick(mx, my, houseId);
    /* One-shot top-right EXIT button */
    if (hitExitButton(mx, my)) {
      Game.audio.play('select');
      selectedFurniture = null;
      return 'exit';
    }
    /* Exit door */
    if (hitButton(mx, my, W - 92, H - 152, 80, 122)) {
      Game.audio.play('select');
      selectedFurniture = null;
      return 'exit';
    }
    /* Clear button — wipes all furniture for this house in one shot */
    var clearW = 84, clearH = 26, clearX = W - clearW - 10, clearY = 52;
    if (hitButton(mx, my, clearX, clearY, clearW, clearH)) {
      var st0 = loadFurnitureState();
      st0[houseId] = [];
      saveFurnitureState(st0);
      selectedFurniture = null;
      Game.audio.play('select');
      return null;
    }
    /* Category tabs */
    var catTabW = Math.min(86, Math.floor((W - 20) / FURNITURE_CATEGORIES.length));
    for (var ci = 0; ci < FURNITURE_CATEGORIES.length; ci++) {
      var cx = 10 + ci * catTabW;
      var cy = 72;
      if (hitButton(mx, my, cx, cy, catTabW - 4, 26)) {
        selectedCategory = ci;
        selectedFurniture = null;
        Game.audio.play('select');
        return null;
      }
    }
    /* Item palette clicks (selected category only) */
    var palItems = FURNITURE_CATEGORIES[selectedCategory].items;
    for (var fi = 0; fi < palItems.length; fi++) {
      var fx = 20 + fi * 78;
      var fy = 108;
      if (hitButton(mx, my, fx, fy, 68, 76)) {
        selectedFurniture = palItems[fi];
        Game.audio.play('pickup');
        return null;
      }
    }
    /* Place or remove furniture on the floor area */
    if (my > HOUSE_FLOOR_TOP && my < HOUSE_FLOOR_BOTTOM) {
      var state = loadFurnitureState();
      if (!state[houseId]) state[houseId] = [];
      /* Click on existing item → remove (radius scales with the new size) */
      for (var ei = state[houseId].length - 1; ei >= 0; ei--) {
        var it = state[houseId][ei];
        var d = Math.sqrt((mx - it.x) * (mx - it.x) + (my - it.y) * (my - it.y));
        if (d < 36) {
          state[houseId].splice(ei, 1);
          saveFurnitureState(state);
          Game.audio.play('pickup');
          return null;
        }
      }
      /* Place if furniture selected */
      if (selectedFurniture && mx < HOUSE_FLOOR_RIGHT) {
        state[houseId].push({ type: selectedFurniture, x: mx, y: my });
        saveFurnitureState(state);
        Game.audio.play('pickup');
      }
    }
    return null;
  }

  /* Turbo in the rooms (input.js): her speed this step is the room's
     walking speed times the turbo multiplier while a direction is held.
     Letting go after a turbo run, she glides to a stop over the quarter
     second the turbo takes to ease off (at 1x she stops as before);
     the room adds glide.vx / glide.vy on steps with no arrow held. */
  var glide = { vx: 0, vy: 0, e: 1 };
  function roomSpeed(keys, key, base) {
    var tb = Game.input.turboStep(key, true);
    if (tb.t === 300) Game.audio.play('whoosh');
    var sp = base * tb.mul;
    if (keys.left || keys.right || keys.up || keys.down) {
      glide.vx = ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * sp;
      glide.vy = ((keys.down ? 1 : 0) - (keys.up ? 1 : 0)) * sp;
    } else {
      var k = glide.e > 1 ? Math.max(0, tb.ease - 1) / (glide.e - 1) : 0;
      glide.vx *= k; glide.vy *= k;
    }
    glide.e = tb.ease;
    return sp;
  }

  function updateHouseInterior(keys, jp, houseId) {
    if (MOON_ROOMS[houseId]) { updateMoonRoom(keys, jp, houseId); return; }
    /* Walk Momoko around the room with arrow keys / D-pad. */
    var pp = getHousePlayerPos(houseId);
    var sp = roomSpeed(keys, 'house', 2.4);
    var moved = false;
    pp.px = pp.x; pp.py = pp.y;
    if (keys.left)  { pp.x -= sp; housePlayerFacing = -1; moved = true; }
    if (keys.right) { pp.x += sp; housePlayerFacing = 1;  moved = true; }
    if (keys.up)    { pp.y -= sp; moved = true; }
    if (keys.down)  { pp.y += sp; moved = true; }
    if (!moved && (glide.vx || glide.vy)) { pp.x += glide.vx; pp.y += glide.vy; moved = true; }
    if (pp.x < HOUSE_FLOOR_LEFT)  pp.x = HOUSE_FLOOR_LEFT;
    if (pp.x > HOUSE_FLOOR_RIGHT) pp.x = HOUSE_FLOOR_RIGHT;
    if (pp.y < HOUSE_FLOOR_TOP)   pp.y = HOUSE_FLOOR_TOP;
    if (pp.y > HOUSE_FLOOR_BOTTOM) pp.y = HOUSE_FLOOR_BOTTOM;
    if (moved) housePlayerFrame = (housePlayerFrame + 1) % 24;
  }

  /* ============================================================ */
  /*        CHEESE MOON VILLAGE — shop and home interiors          */
  /* ============================================================ */
  /* Gouda's Cheese Deli, the Moon Scoops parlour and the Whisker family
     home use the house-interior state (engine enterHouse) but draw their
     own furnished rooms instead of the furniture editor. Momoko walks
     about the floor; walking up to something and pressing the action
     button (or tapping it) tries it, and each room has a resident mouse
     who chats in a speech bubble. The static walls, shelves and counter
     are painted once per room into two cached layers. */
  var ROOM_FLOOR_TOP = 296;
  var ROOM_COUNTER_TOP = 206, ROOM_COUNTER_BOT = 262;
  var room = { id: null, t: 0, say: null, sayT: 0, pop: null, popT: 0, near: -1, fx: [], bits: null };

  /* Resident moon mouse, upright like Chef Brie. Feet at (x, y), scale s.
     o: fur, apron, hat ('bowtie' | 'scoop' | 'bow' | null), hop (0..1). */
  function drawRoomMouse(c, x, y, s, o, t) {
    var FUR = o.fur, FUR_D = hexShadeUI(o.fur, -22), INK = '#3a2414';
    var bob = Math.sin(t * 0.05 + (o.phase || 0)) * 1.1 - (o.hop || 0) * 10;
    var blink = ((t + (o.phase || 0) * 40) % 220) < 7;
    c.save();
    c.translate(x, y);
    c.scale(s * (o.face || 1), s);
    c.translate(-15, -36);
    var y0 = bob;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.strokeStyle = FUR_D;
    c.lineWidth = 1.8;
    var wag = Math.sin(t * 0.08 + (o.phase || 0)) * 2.5;
    c.beginPath(); c.moveTo(23, y0 + 31); c.quadraticCurveTo(33, y0 + 30 + wag * 0.4, 32, y0 + 21 + wag); c.stroke();
    c.fillStyle = '#ffb0c4';
    c.beginPath(); c.ellipse(10, 35 + Math.min(0, y0) * 0.6, 4, 1.8, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(20, 35 + Math.min(0, y0) * 0.6, 4, 1.8, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = FUR;
    c.strokeStyle = INK;
    c.lineWidth = 1;
    c.beginPath(); c.ellipse(15, y0 + 26, 10, 9, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255, 255, 255, 0.35)';
    c.beginPath(); c.ellipse(15, y0 + 28, 6, 5.5, 0, 0, Math.PI * 2); c.fill();
    if (o.apron) {
      c.fillStyle = o.apron;
      c.beginPath();
      c.moveTo(9, y0 + 20); c.lineTo(21, y0 + 20);
      c.quadraticCurveTo(23, y0 + 33, 15, y0 + 34);
      c.quadraticCurveTo(7, y0 + 33, 9, y0 + 20);
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(58, 36, 20, 0.45)';
      c.stroke();
      c.fillStyle = 'rgba(255, 255, 255, 0.7)';
      c.fillRect(12.5, y0 + 26, 5, 3.5);
    }
    /* Arms: wave while talking */
    var wave = o.talking ? Math.sin(t * 0.25) * 0.5 : 0;
    c.fillStyle = FUR;
    c.strokeStyle = INK;
    c.lineWidth = 1;
    c.beginPath(); c.ellipse(6, y0 + 25, 2.4, 3.6, 0.3, 0, Math.PI * 2); c.fill(); c.stroke();
    c.save();
    c.translate(24, y0 + 23);
    c.rotate(-0.3 - wave - (o.talking ? 0.6 : 0));
    c.beginPath(); c.ellipse(0, 1, 2.4, 3.6, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.restore();
    var earT = Math.sin(t * 0.03 + (o.phase || 0)) * 0.08;
    c.beginPath(); c.ellipse(6, y0 + 9, 5, 5.4, -0.3 - earT, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.ellipse(24, y0 + 9, 5, 5.4, 0.3 + earT, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#ffb0c4';
    c.beginPath(); c.ellipse(6.4, y0 + 9.4, 3, 3.4, -0.3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(23.6, y0 + 9.4, 3, 3.4, 0.3, 0, Math.PI * 2); c.fill();
    c.fillStyle = FUR;
    c.beginPath(); c.ellipse(15, y0 + 13, 8.5, 7.6, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255, 255, 255, 0.55)';
    c.beginPath(); c.ellipse(12, y0 + 10, 3.2, 1.6, -0.4, 0, Math.PI * 2); c.fill();
    c.fillStyle = INK;
    if (blink) {
      c.beginPath(); c.moveTo(10.4, y0 + 13); c.lineTo(13, y0 + 13); c.moveTo(17, y0 + 13); c.lineTo(19.6, y0 + 13); c.stroke();
    } else {
      c.beginPath(); c.ellipse(11.8, y0 + 12.6, 1.5, 2, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(18.2, y0 + 12.6, 1.5, 2, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(11.3, y0 + 11.8, 0.6, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(17.7, y0 + 11.8, 0.6, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = 'rgba(255, 120, 150, 0.4)';
    c.beginPath(); c.ellipse(9.4, y0 + 16, 1.8, 1.1, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(20.6, y0 + 16, 1.8, 1.1, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ff6a9a';
    c.beginPath(); c.arc(15, y0 + 15.4, 1.2, 0, Math.PI * 2); c.fill();
    c.strokeStyle = INK;
    c.lineWidth = 0.8;
    if (o.talking && (t >> 3) % 2) {
      c.fillStyle = '#c83a5a';
      c.beginPath(); c.ellipse(15, y0 + 17.4, 1.6, 1.3, 0, 0, Math.PI * 2); c.fill();
    } else {
      c.beginPath(); c.arc(15, y0 + 16, 2, 0.35, Math.PI - 0.35); c.stroke();
    }
    if (o.moustache) {
      c.fillStyle = '#8a5a2a';
      c.beginPath();
      c.ellipse(12.6, y0 + 16.4, 2.6, 1.1, 0.35, 0, Math.PI * 2);
      c.ellipse(17.4, y0 + 16.4, 2.6, 1.1, -0.35, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = 'rgba(58, 36, 20, 0.5)';
    c.lineWidth = 0.5;
    var tw = Math.sin(t * 0.11) * 0.5;
    c.beginPath();
    c.moveTo(11, y0 + 15.6); c.lineTo(5.5, y0 + 14.6 + tw);
    c.moveTo(11, y0 + 16.4); c.lineTo(5.5, y0 + 17 + tw);
    c.moveTo(19, y0 + 15.6); c.lineTo(24.5, y0 + 14.6 - tw);
    c.moveTo(19, y0 + 16.4); c.lineTo(24.5, y0 + 17 - tw);
    c.stroke();
    c.strokeStyle = INK;
    c.lineWidth = 1;
    if (o.hat === 'bowtie') {
      c.fillStyle = '#e8445a';
      c.beginPath(); c.moveTo(15, y0 + 20.5); c.lineTo(10.5, y0 + 18); c.lineTo(10.5, y0 + 23); c.closePath();
      c.moveTo(15, y0 + 20.5); c.lineTo(19.5, y0 + 18); c.lineTo(19.5, y0 + 23); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.arc(15, y0 + 20.5, 1.3, 0, Math.PI * 2); c.fill();
    } else if (o.hat === 'scoop') {
      /* Paper soda-fountain hat with pink stripes */
      c.fillStyle = '#ffffff';
      c.beginPath(); c.moveTo(7, y0 + 7); c.lineTo(23, y0 + 7); c.lineTo(20, y0 - 1); c.lineTo(10, y0 - 1); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = '#ff66aa';
      c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(9, y0 + 4.5); c.lineTo(21, y0 + 4.5); c.moveTo(10, y0 + 1.5); c.lineTo(20, y0 + 1.5); c.stroke();
      c.fillStyle = '#e8344a';
      c.beginPath(); c.arc(15, y0 - 2.6, 1.8, 0, Math.PI * 2); c.fill();
    } else if (o.hat === 'bow') {
      c.fillStyle = o.bow || '#ff66aa';
      c.beginPath(); c.moveTo(19, y0 + 4); c.lineTo(14.5, y0 + 1); c.lineTo(15, y0 + 7); c.closePath();
      c.moveTo(19, y0 + 4); c.lineTo(23.5, y0 + 0.5); c.lineTo(23.5, y0 + 7); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.arc(19, y0 + 4, 1.4, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }

  /* Small helpers used by the room painters */
  function cheeseWheelUI(c, x, y, r, col) {
    c.fillStyle = hexShadeUI(col, -28);
    c.beginPath(); c.ellipse(x, y + r * 0.22, r, r * 0.55, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = col;
    c.beginPath(); c.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(90, 48, 16, 0.75)';
    c.lineWidth = 1.2;
    c.stroke();
    c.fillStyle = 'rgba(255, 255, 255, 0.4)';
    c.beginPath(); c.ellipse(x - r * 0.3, y - r * 0.15, r * 0.35, r * 0.12, -0.2, 0, Math.PI * 2); c.fill();
  }
  function holeUI(c, x, y, r) {
    c.fillStyle = 'rgba(150, 90, 24, 0.85)';
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(110, 60, 16, 0.6)';
    c.beginPath(); c.arc(x, y - r * 0.25, r * 0.8, Math.PI, 0); c.fill();
  }
  function shelfBoard(c, x, y, w) {
    c.fillStyle = 'rgba(0, 0, 0, 0.25)';
    c.fillRect(x, y + 6, w, 4);
    c.fillStyle = '#8a4a20';
    c.fillRect(x, y, w, 7);
    c.fillStyle = '#c4803e';
    c.fillRect(x, y, w, 2);
  }
  function roomWindow(c, x, y, r, trim, planet) {
    c.fillStyle = '#0a0420';
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.save();
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.clip();
    for (var s = 0; s < 14; s++) {
      c.fillStyle = 'rgba(255, 255, 255, ' + (0.4 + (s * 17 % 60) / 100) + ')';
      c.beginPath(); c.arc(x - r + (s * 29) % (r * 2), y - r + (s * 41) % (r * 2), 0.8 + (s % 3) * 0.5, 0, Math.PI * 2); c.fill();
    }
    if (planet) drawShadedPlanet(c, x + r * 0.35, y - r * 0.3, r * 0.3, '#ffc0e4', '#8a2a80', '#ffd24a');
    c.restore();
    c.strokeStyle = trim;
    c.lineWidth = 5;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(x - r, y); c.lineTo(x + r, y); c.moveTo(x, y - r); c.lineTo(x, y + r); c.stroke();
  }
  function tiledFloor(c, a, b, y0) {
    c.fillStyle = a;
    c.fillRect(0, y0, W, H - y0);
    c.fillStyle = b;
    for (var row = 0; row < 6; row++) {
      var ya = y0 + (H - y0) * (row * row) / 36, yb = y0 + (H - y0) * ((row + 1) * (row + 1)) / 36;
      for (var col = -10; col < 10; col++) {
        if ((row + col) % 2 === 0) continue;
        var u0 = col / 10, u1 = (col + 1) / 10;
        var ka = 0.6 + 0.4 * (ya - y0) / (H - y0), kb = 0.6 + 0.4 * (yb - y0) / (H - y0);
        c.beginPath();
        c.moveTo(W / 2 + u0 * W * ka, ya); c.lineTo(W / 2 + u1 * W * ka, ya);
        c.lineTo(W / 2 + u1 * W * kb, yb); c.lineTo(W / 2 + u0 * W * kb, yb);
        c.closePath(); c.fill();
      }
    }
  }
  function counterFront(c, x0, x1, top, body, trim) {
    c.fillStyle = 'rgba(0, 0, 0, 0.28)';
    c.fillRect(x0 + 4, ROOM_COUNTER_BOT, x1 - x0, 7);
    var g = c.createLinearGradient(0, ROOM_COUNTER_TOP, 0, ROOM_COUNTER_BOT);
    g.addColorStop(0, hexShadeUI(body, 12));
    g.addColorStop(1, hexShadeUI(body, -24));
    c.fillStyle = g;
    c.fillRect(x0, ROOM_COUNTER_TOP + 8, x1 - x0, ROOM_COUNTER_BOT - ROOM_COUNTER_TOP - 8);
    c.fillStyle = top;
    c.fillRect(x0 - 6, ROOM_COUNTER_TOP, x1 - x0 + 12, 9);
    c.fillStyle = 'rgba(255, 255, 255, 0.35)';
    c.fillRect(x0 - 6, ROOM_COUNTER_TOP, x1 - x0 + 12, 2);
    c.fillStyle = trim;
    c.fillRect(x0, ROOM_COUNTER_BOT - 6, x1 - x0, 6);
  }

  /* ---- Gouda's Cheese Deli ---- */
  var DELI_CHEESES = [
    { name: 'cheeseSwiss',   line: 'tasteSwiss',   col: '#ffd24a', x: 150 },
    { name: 'cheeseCheddar', line: 'tasteCheddar', col: '#ff9a3a', x: 260 },
    { name: 'cheeseBlue',    line: 'tasteBlue',    col: '#dfe8f4', x: 470 },
    { name: 'cheeseStar',    line: 'tasteStar',    col: '#fff4dc', x: 580 },
  ];
  function paintDeliBack(c) {
    var wg = c.createLinearGradient(0, 0, 0, 254);
    wg.addColorStop(0, '#6a3a1a');
    wg.addColorStop(1, '#a8682e');
    c.fillStyle = wg;
    c.fillRect(0, 0, W, 254);
    /* Wood panelling */
    c.strokeStyle = 'rgba(40, 18, 6, 0.25)';
    c.lineWidth = 1;
    for (var px = 30; px < W; px += 46) { c.beginPath(); c.moveTo(px, 0); c.lineTo(px, 254); c.stroke(); }
    /* Cream wainscot with a mint rail */
    c.fillStyle = '#f4e2c0';
    c.fillRect(0, 196, W, 58);
    c.fillStyle = '#5ec8a0';
    c.fillRect(0, 192, W, 6);
    /* Shelves of cheese wheels, left and right */
    var sides = [[16, 230], [W - 246, 230]];
    for (var si = 0; si < 2; si++) {
      var sx = sides[si][0], sw = sides[si][1];
      for (var sh = 0; sh < 2; sh++) {
        var sy = 112 + sh * 50;
        for (var wi = 0; wi < 6; wi++) {
          var cols = ['#ffd24a', '#ffb03a', '#fff0b0', '#ff9a3a', '#ffe27a', '#f4d8a0'];
          cheeseWheelUI(c, sx + 22 + wi * 37, sy - 9, 15, cols[(wi + sh * 2 + si) % cols.length]);
        }
        shelfBoard(c, sx, sy, sw);
      }
    }
    /* Chalkboard: today's cheese */
    c.fillStyle = '#6a4020';
    roundRect(c, 288, 90, 224, 70, 6); c.fill();
    c.fillStyle = '#24382e';
    roundRect(c, 294, 96, 212, 58, 4); c.fill();
    c.fillStyle = 'rgba(255, 255, 255, 0.08)';
    c.fillRect(300, 100, 90, 3);
    c.fillStyle = '#f4f0e0';
    c.textAlign = 'center';
    fitFont(c, Game.i18n.t('deliBoard'), 196, 14, 'bold');
    c.fillText(Game.i18n.t('deliBoard'), 400, 120);
    c.fillStyle = '#ffd24a';
    c.beginPath(); c.moveTo(380, 130); c.lineTo(420, 130); c.lineTo(414, 146); c.closePath(); c.fill();
    c.fillStyle = '#c88a2a';
    c.beginPath(); c.arc(398, 136, 2.6, 0, Math.PI * 2); c.arc(408, 141, 1.8, 0, Math.PI * 2); c.fill();
    /* Hanging cheeses on hooks from the ceiling rail */
    c.fillStyle = '#4a2410';
    c.fillRect(0, 0, W, 8);
    var hang = [60, 120, 690, 745];
    for (var hi = 0; hi < hang.length; hi++) {
      var hx = hang[hi], hl = 26 + (hi % 2) * 12;
      c.strokeStyle = '#d8c8a0';
      c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(hx, 8); c.lineTo(hx, 8 + hl); c.stroke();
      c.fillStyle = hi % 2 ? '#ffb03a' : '#ffd24a';
      c.beginPath(); c.moveTo(hx - 12, 8 + hl); c.lineTo(hx + 12, 8 + hl); c.lineTo(hx, 8 + hl + 26); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(90, 48, 16, 0.75)';
      c.stroke();
      holeUI(c, hx - 3, 8 + hl + 7, 2.4);
    }
    /* Floor: cream and mint tiles */
    tiledFloor(c, '#e8dcc0', '#9ed8bc', 254);
    c.fillStyle = 'rgba(0, 0, 0, 0.25)';
    c.fillRect(0, 248, W, 6);
    /* Big wheel display on the right */
    cheeseWheelUI(c, 724, 284, 38, '#ffd24a');
    cheeseWheelUI(c, 724, 262, 30, '#ffb03a');
    cheeseWheelUI(c, 724, 244, 22, '#fff0b0');
  }
  function paintDeliFront(c) {
    counterFront(c, 90, 640, '#f0e6d0', '#7a4a24', '#5ec8a0');
    /* Glass display case on top */
    c.fillStyle = 'rgba(220, 248, 255, 0.18)';
    c.fillRect(96, ROOM_COUNTER_TOP - 40, 538, 40);
    c.strokeStyle = 'rgba(240, 255, 255, 0.7)';
    c.lineWidth = 2;
    c.strokeRect(96, ROOM_COUNTER_TOP - 40, 538, 40);
    c.fillStyle = 'rgba(255, 255, 255, 0.5)';
    c.beginPath(); c.moveTo(110, ROOM_COUNTER_TOP - 36); c.lineTo(150, ROOM_COUNTER_TOP - 36); c.lineTo(120, ROOM_COUNTER_TOP - 4); c.lineTo(104, ROOM_COUNTER_TOP - 4); c.closePath(); c.fill();
    /* Scale by the till in the middle (where Mr. Gouda stands) */
    c.fillStyle = '#c8cee0';
    c.fillRect(352, ROOM_COUNTER_TOP + 14, 96, 30);
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(400, ROOM_COUNTER_TOP + 29, 11, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#5a3010';
    c.lineWidth = 1.4;
    c.stroke();
    c.beginPath(); c.moveTo(400, ROOM_COUNTER_TOP + 29); c.lineTo(406, ROOM_COUNTER_TOP + 22); c.stroke();
  }
  function drawDeliItems(c) {
    for (var i = 0; i < DELI_CHEESES.length; i++) {
      var ch = DELI_CHEESES[i], x = ch.x, y = ROOM_COUNTER_TOP - 14;
      var bitten = room.bits.bitten[i];
      c.save();
      if (i === 0) {
        cheeseWheelUI(c, x, y, 26, ch.col);
        holeUI(c, x - 10, y - 2, 3); holeUI(c, x + 8, y + 1, 2.4); holeUI(c, x, y - 6, 2);
      } else if (i === 1) {
        c.fillStyle = '#c86a20';
        c.fillRect(x - 24, y - 12, 48, 22);
        c.fillStyle = ch.col;
        c.fillRect(x - 24, y - 16, 48, 18);
        c.strokeStyle = 'rgba(90, 48, 16, 0.75)';
        c.lineWidth = 1.2;
        c.strokeRect(x - 24, y - 16, 48, 26);
      } else if (i === 2) {
        cheeseWheelUI(c, x, y, 24, ch.col);
        c.strokeStyle = '#5a7ac8';
        c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(x - 14, y - 4); c.quadraticCurveTo(x - 6, y + 2, x + 2, y - 3); c.quadraticCurveTo(x + 8, y - 6, x + 14, y + 2); c.stroke();
        c.beginPath(); c.moveTo(x - 8, y + 5); c.quadraticCurveTo(x, y + 2, x + 8, y + 6); c.stroke();
      } else {
        cheeseWheelUI(c, x, y, 24, ch.col);
        c.fillStyle = '#ffd24a';
        c.beginPath();
        for (var k = 0; k < 10; k++) {
          var rr = k % 2 ? 3 : 7, aa = -Math.PI / 2 + k * Math.PI / 5;
          c.lineTo(x + Math.cos(aa) * rr, y - 2 + Math.sin(aa) * rr * 0.6);
        }
        c.closePath(); c.fill();
      }
      if (bitten) {
        /* A Momoko-sized bite out of the back-right edge: the wall shows
           through, ringed by the cut cheese, with a few crumbs */
        c.fillStyle = '#f4e2c0';
        c.beginPath(); c.arc(x + 19, y - 12, 6, 0, Math.PI * 2); c.arc(x + 11, y - 15, 5, 0, Math.PI * 2); c.fill();
        c.strokeStyle = hexShadeUI(ch.col, -30);
        c.lineWidth = 1.4;
        c.beginPath(); c.arc(x + 19, y - 12, 6, Math.PI * 0.55, Math.PI * 1.25); c.stroke();
        c.beginPath(); c.arc(x + 11, y - 15, 5, Math.PI * 0.2, Math.PI * 0.95); c.stroke();
        c.fillStyle = ch.col;
        c.fillRect(x + 22, y + 4, 2.4, 2.4);
        c.fillRect(x + 27, y + 2, 1.8, 1.8);
      }
      c.restore();
    }
  }

  /* ---- Moon Scoops ice-cream parlour ---- */
  var FLAVOURS = [
    { name: 'flavorCheesecake', line: 'scoopLine1', col: '#fff0a8', x: 150 },
    { name: 'flavorStrawberry', line: 'scoopLine2', col: '#ff9ac8', x: 250 },
    { name: 'flavorMint',       line: 'scoopLine3', col: '#9fe8c8', x: 350 },
    { name: 'flavorGalaxy',     line: 'scoopLine4', col: '#9a7ae8', x: 450 },
  ];
  var CONE_X = 590;
  function paintParlourBack(c) {
    /* Candy stripes */
    for (var sx = 0; sx < W; sx += 40) {
      c.fillStyle = (sx / 40) % 2 ? '#ffe4f0' : '#ffc4dc';
      c.fillRect(sx, 0, 40, 254);
    }
    shadeBand(c, 0, 90, 'rgba(120, 30, 80, 0.25)', 'rgba(120, 30, 80, 0)');
    /* Mint scalloped trim under the ceiling and a chair rail */
    c.fillStyle = '#5ec8a0';
    c.fillRect(0, 0, W, 10);
    for (var sc = 0; sc < W; sc += 20) { c.beginPath(); c.arc(sc + 10, 10, 10, 0, Math.PI); c.fill(); }
    c.fillStyle = '#ffffff';
    c.fillRect(0, 186, W, 68);
    c.fillStyle = '#5ec8a0';
    c.fillRect(0, 182, W, 6);
    /* Neon cone sign */
    c.save();
    c.shadowColor = '#ff66cc';
    c.shadowBlur = 12;
    c.strokeStyle = '#ff66cc';
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(120, 140); c.lineTo(100, 96); c.lineTo(140, 96); c.closePath(); c.stroke();
    c.beginPath(); c.arc(120, 84, 18, Math.PI, 0); c.stroke();
    c.strokeStyle = '#44ddff';
    c.beginPath(); c.arc(120, 66, 12, Math.PI, 0); c.stroke();
    c.restore();
    /* Menu board with the four flavours */
    c.fillStyle = '#5a2440';
    roundRect(c, 250, 84, 300, 84, 8); c.fill();
    c.fillStyle = '#fff8ec';
    roundRect(c, 256, 90, 288, 72, 6); c.fill();
    for (var f = 0; f < FLAVOURS.length; f++) {
      var mx = 292 + f * 72;
      c.fillStyle = '#e8a050';
      c.beginPath(); c.moveTo(mx - 9, 118); c.lineTo(mx + 9, 118); c.lineTo(mx, 136); c.closePath(); c.fill();
      c.fillStyle = FLAVOURS[f].col;
      c.beginPath(); c.arc(mx, 112, 10, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(90, 36, 64, 0.5)';
      c.lineWidth = 1;
      c.stroke();
      c.fillStyle = '#5a2440';
      c.textAlign = 'center';
      fitFont(c, Game.i18n.t(FLAVOURS[f].name), 66, 10, 'bold');
      c.fillText(Game.i18n.t(FLAVOURS[f].name), mx, 152);
    }
    /* Round window to space */
    roomWindow(c, 680, 104, 46, '#5ec8a0', true);
    /* Cone pendant lamps */
    for (var l = 0; l < 3; l++) {
      var lx = 200 + l * 200;
      c.strokeStyle = '#8a5a70';
      c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(lx, 10); c.lineTo(lx, 40); c.stroke();
      c.fillStyle = '#e8a050';
      c.beginPath(); c.moveTo(lx - 12, 40); c.lineTo(lx + 12, 40); c.lineTo(lx, 62); c.closePath(); c.fill();
      c.fillStyle = '#fff6c8';
      c.beginPath(); c.arc(lx, 40, 9, Math.PI, 0); c.fill();
    }
    tiledFloor(c, '#fff4f8', '#ff9ac8', 254);
    c.fillStyle = 'rgba(0, 0, 0, 0.2)';
    c.fillRect(0, 248, W, 6);
  }
  function paintParlourFront(c) {
    counterFront(c, 90, 650, '#ffffff', '#ff88bb', '#5ec8a0');
    /* Freezer lid: four tubs of ice cream set into the counter */
    for (var f = 0; f < FLAVOURS.length; f++) {
      var x = FLAVOURS[f].x;
      c.fillStyle = '#c8cee0';
      c.beginPath(); c.ellipse(x, ROOM_COUNTER_TOP + 3, 34, 8, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = FLAVOURS[f].col;
      c.beginPath(); c.ellipse(x, ROOM_COUNTER_TOP + 1, 29, 6.5, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255, 255, 255, 0.45)';
      c.beginPath(); c.ellipse(x - 8, ROOM_COUNTER_TOP - 1, 10, 2.4, 0, 0, Math.PI * 2); c.fill();
      /* Flavour dots on the counter front */
      c.fillStyle = FLAVOURS[f].col;
      c.beginPath(); c.arc(x, ROOM_COUNTER_TOP + 30, 9, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#ffffff';
      c.lineWidth = 2;
      c.stroke();
    }
    /* Cone holder */
    c.fillStyle = '#c8cee0';
    c.fillRect(CONE_X - 16, ROOM_COUNTER_TOP - 6, 32, 8);
    c.strokeStyle = '#5a2440';
    c.lineWidth = 1;
    c.strokeRect(CONE_X - 16, ROOM_COUNTER_TOP - 6, 32, 8);
  }
  function drawParlourItems(c) {
    var b = room.bits;
    /* The cone and its stack of scoops (newest one drops in) */
    var tip = ROOM_COUNTER_TOP - 2, top = tip - 34;
    c.fillStyle = '#e8a050';
    c.beginPath(); c.moveTo(CONE_X - 13, top); c.lineTo(CONE_X + 13, top); c.lineTo(CONE_X, tip); c.closePath(); c.fill();
    c.strokeStyle = '#a8642a';
    c.lineWidth = 1;
    c.stroke();
    c.beginPath();
    c.moveTo(CONE_X - 9, top + 8); c.lineTo(CONE_X + 4, top + 26);
    c.moveTo(CONE_X + 9, top + 8); c.lineTo(CONE_X - 4, top + 26);
    c.stroke();
    for (var s = 0; s < b.scoops.length; s++) {
      var drop = s === b.scoops.length - 1 ? Math.max(0, 1 - b.dropT / 14) : 0;
      var sy = top - 6 - s * 15 - drop * drop * 60;
      var wob = Math.sin(room.t * 0.05 + s) * (b.scoops.length >= 5 ? 1.5 : 0.4);
      c.fillStyle = FLAVOURS[b.scoops[s]].col;
      c.beginPath(); c.arc(CONE_X + wob, sy, 13, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(90, 36, 64, 0.45)';
      c.stroke();
      c.fillStyle = 'rgba(255, 255, 255, 0.55)';
      c.beginPath(); c.ellipse(CONE_X + wob - 4, sy - 5, 4, 2, -0.4, 0, Math.PI * 2); c.fill();
      if (b.scoops[s] === 3) {
        c.fillStyle = '#ffffff';
        c.fillRect(CONE_X + wob + 3, sy - 1, 1.6, 1.6);
        c.fillRect(CONE_X + wob - 5, sy + 3, 1.4, 1.4);
      }
    }
    if (b.scoops.length >= 5) {
      c.fillStyle = '#e8344a';
      var ty = top - 6 - 4 * 15 - 14;
      c.beginPath(); c.arc(CONE_X, ty, 4.5, 0, Math.PI * 2); c.fill();
    }
  }
  /* Stools along the front of the floor (they y-sort with Momoko) */
  function drawStool(c, x, y) {
    c.fillStyle = 'rgba(0, 0, 0, 0.22)';
    c.beginPath(); c.ellipse(x, y, 16, 4, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#c8cee0';
    c.fillRect(x - 2, y - 30, 4, 30);
    c.fillRect(x - 10, y - 2, 20, 3);
    c.fillStyle = '#ff66aa';
    c.beginPath(); c.ellipse(x, y - 32, 16, 6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ff9ac8';
    c.beginPath(); c.ellipse(x, y - 34, 14, 4.5, 0, 0, Math.PI * 2); c.fill();
  }

  /* ---- The Whisker family home ---- */
  var BABIES = [
    { id: 'babyNib', fur: '#f0d8b8', phase: 0 },
    { id: 'babyDot', fur: '#e8e0f0', phase: 2.1, bow: '#44ddff' },
    { id: 'babyPom', fur: '#d8b090', phase: 4.2 },
  ];
  var MUSIC_BOX = { x: 610, y: 300 };
  function paintFamilyBack(c) {
    /* Inside a cheese wheel: warm curved wall with holes */
    var wg = c.createRadialGradient(400, 120, 60, 400, 160, 520);
    wg.addColorStop(0, '#ffe08a');
    wg.addColorStop(1, '#c8842a');
    c.fillStyle = wg;
    c.fillRect(0, 0, W, 254);
    var holes = [[40, 60, 12], [150, 30, 8], [250, 70, 6], [560, 40, 10], [770, 80, 9], [470, 24, 5], [90, 170, 7], [740, 190, 6]];
    for (var h = 0; h < holes.length; h++) holeUI(c, holes[h][0], holes[h][1], holes[h][2]);
    /* Curved ceiling shadow */
    c.fillStyle = 'rgba(90, 48, 16, 0.25)';
    c.beginPath(); c.moveTo(0, 0); c.lineTo(W, 0); c.lineTo(W, 30); c.quadraticCurveTo(W / 2, -10, 0, 30); c.closePath(); c.fill();
    /* Round window with the stars */
    roomWindow(c, 400, 104, 44, '#a8642a', false);
    /* Fireplace (the flames are drawn live) */
    c.fillStyle = '#b8583a';
    roundRect(c, 70, 128, 120, 126, 8); c.fill();
    c.strokeStyle = 'rgba(80, 30, 16, 0.5)';
    c.lineWidth = 1;
    for (var br = 0; br < 6; br++) {
      c.beginPath(); c.moveTo(70, 146 + br * 18); c.lineTo(190, 146 + br * 18); c.stroke();
    }
    c.fillStyle = '#2a120a';
    c.beginPath(); c.moveTo(96, 254); c.lineTo(96, 196); c.arc(130, 196, 34, Math.PI, 0); c.lineTo(164, 254); c.closePath(); c.fill();
    c.fillStyle = '#8a4a20';
    c.fillRect(62, 122, 136, 10);
    /* Family pictures on the mantel and walls */
    var pics = [[96, 104, '#ff88bb'], [150, 108, '#44ddff'], [560, 96, '#88dd66'], [620, 110, '#ffd24a']];
    for (var p = 0; p < pics.length; p++) {
      var px = pics[p][0], py = pics[p][1];
      c.fillStyle = '#8a4a20';
      c.fillRect(px - 15, py - 18, 30, 26);
      c.fillStyle = pics[p][2];
      c.fillRect(px - 12, py - 15, 24, 20);
      c.fillStyle = '#f4e2c8';
      c.beginPath(); c.arc(px - 4, py - 6, 4, 0, Math.PI * 2); c.arc(px + 5, py - 4, 3, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(px - 7, py - 10, 2, 0, Math.PI * 2); c.arc(px - 1, py - 10, 2, 0, Math.PI * 2); c.fill();
    }
    /* Matchbox bunk beds on the right */
    for (var bk = 0; bk < 2; bk++) {
      var by = 170 + bk * 52;
      c.fillStyle = '#e8445a';
      c.fillRect(640, by, 130, 30);
      c.fillStyle = '#ffe9c8';
      c.fillRect(646, by + 4, 118, 10);
      c.fillStyle = '#ffffff';
      c.beginPath(); c.ellipse(662, by + 8, 12, 6, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = bk ? '#88dd66' : '#44ddff';
      c.fillRect(676, by + 10, 88, 12);
      c.strokeStyle = '#6a2a20';
      c.lineWidth = 1.2;
      c.strokeRect(640, by, 130, 30);
    }
    c.fillStyle = '#8a5a30';
    c.fillRect(636, 160, 6, 94);
    c.fillRect(768, 160, 6, 94);
    /* Wooden floor and a round rag rug */
    var fg = c.createLinearGradient(0, 254, 0, H);
    fg.addColorStop(0, '#8a5a2a');
    fg.addColorStop(1, '#b07a3a');
    c.fillStyle = fg;
    c.fillRect(0, 254, W, H - 254);
    c.strokeStyle = 'rgba(0, 0, 0, 0.16)';
    c.lineWidth = 1;
    for (var pl = -8; pl <= 8; pl++) { c.beginPath(); c.moveTo(W / 2 + pl * 60, 254); c.lineTo(W / 2 + pl * 150, H); c.stroke(); }
    c.fillStyle = 'rgba(0, 0, 0, 0.25)';
    c.fillRect(0, 248, W, 6);
    var rugs = ['#ff88bb', '#ffd24a', '#44ddff', '#88dd66', '#ffffff'];
    for (var r = 0; r < rugs.length; r++) {
      c.fillStyle = rugs[r];
      c.beginPath(); c.ellipse(380, 384, 200 - r * 36, 52 - r * 9.4, 0, 0, Math.PI * 2); c.fill();
    }
    /* Dining table with thimble cups and a cheese snack */
    c.fillStyle = 'rgba(0, 0, 0, 0.25)';
    c.beginPath(); c.ellipse(330, 290, 74, 9, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#8a4a20';
    c.fillRect(272, 250, 8, 40);
    c.fillRect(380, 250, 8, 40);
    c.fillStyle = '#c4803e';
    c.beginPath(); c.ellipse(330, 248, 72, 14, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#e0a868';
    c.beginPath(); c.ellipse(330, 245, 70, 11, 0, 0, Math.PI * 2); c.fill();
    var cups = [290, 316, 344, 370];
    for (var cu = 0; cu < cups.length; cu++) {
      c.fillStyle = '#c8cee0';
      c.fillRect(cups[cu] - 5, 232, 10, 11);
      c.fillStyle = '#9aa0b8';
      c.fillRect(cups[cu] - 5, 232, 10, 2);
    }
    c.fillStyle = '#ffd24a';
    c.beginPath(); c.moveTo(318, 242); c.lineTo(346, 242); c.lineTo(340, 226); c.closePath(); c.fill();
    /* Low shelf for the music box */
    c.fillStyle = '#8a4a20';
    c.fillRect(MUSIC_BOX.x - 34, 250, 68, 8);
    c.fillRect(MUSIC_BOX.x - 30, 258, 6, 32);
    c.fillRect(MUSIC_BOX.x + 24, 258, 6, 32);
  }
  function drawFamilyItems(c) {
    var t = room.t;
    /* Fire */
    for (var f = 0; f < 3; f++) {
      var fl = 0.8 + Math.sin(t * 0.21 + f * 2) * 0.15 + Math.sin(t * 0.37 + f) * 0.08;
      c.fillStyle = ['#ff7a2a', '#ffb030', '#fff0a0'][f];
      c.beginPath(); c.ellipse(130 + (f - 1) * 3, 250 - f * 3, 22 - f * 7, (30 - f * 8) * fl, 0, Math.PI, 0); c.fill();
    }
    c.fillStyle = '#6a3a1a';
    c.fillRect(108, 248, 44, 6);
    /* Music box on its shelf: a little cheese-wheel carousel */
    var spin = room.bits.musicT > 0 ? t * 0.12 : 0;
    var mx = MUSIC_BOX.x, my = 250;
    c.fillStyle = '#ff88bb';
    c.fillRect(mx - 18, my - 16, 36, 16);
    c.strokeStyle = '#6a2a40';
    c.lineWidth = 1;
    c.strokeRect(mx - 18, my - 16, 36, 16);
    c.fillStyle = '#ffd24a';
    c.beginPath(); c.ellipse(mx, my - 18, 14, 4, 0, 0, Math.PI * 2); c.fill();
    for (var k = 0; k < 3; k++) {
      var a = spin + k * Math.PI * 2 / 3;
      c.fillStyle = ['#ffffff', '#44ddff', '#88dd66'][k];
      c.beginPath(); c.arc(mx + Math.cos(a) * 9, my - 22 + Math.sin(a) * 2, 3, 0, Math.PI * 2); c.fill();
    }
    c.strokeStyle = '#c8cee0';
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(mx + 18, my - 8); c.lineTo(mx + 24, my - 8 + Math.sin(spin * 2) * 3); c.stroke();
  }
  /* The babies play tag round the rug, turning to face the way they run. */
  function babyAt(i) {
    var bb = room.bits.babies[i];
    var a = room.t * 0.012 + BABIES[i].phase;
    var x = 380 + Math.cos(a) * 150, y = 384 + Math.sin(a) * 36;
    return { x: x, y: y, face: Math.sin(a) > 0 ? -1 : 1, hop: bb.hop > 0 ? Math.sin((1 - bb.hop / 30) * Math.PI) : 0 };
  }

  /* ---- Room table ---- */
  var MOON_ROOMS = {
    cheeseDeli: {
      title: 'roomDeli', sub: 'roomDeliSub', name: 'goudaName', hi: 'goudaHi', chat: ['goudaChat1', 'goudaChat2'],
      keeper: { x: 400, y: 232, s: 2.4, fur: '#c8945a', apron: '#5ec8a0', hat: 'bowtie', moustache: true },
      ink: '#ffe9c8', band: 'rgba(58, 26, 8, 0.82)',
      back: paintDeliBack, front: paintDeliFront, items: drawDeliItems,
      light: function (g) {
        shadeBand(g, 0, 90, 'rgba(30, 10, 0, 0.4)', 'rgba(30, 10, 0, 0)');
        lightCone(g, 400, 10, 250, 160, '255, 230, 170', 0.18);
        lightPool(g, 400, 330, 320, 80, '255, 230, 170', 0.22);
        shadeCorners(g, 0, H, 0.34);
        shadeBand(g, H - 80, H, 'rgba(30, 10, 0, 0)', 'rgba(30, 10, 0, 0.3)');
      },
      start: function () { return { bitten: [false, false, false, false] }; },
      spots: function () {
        var out = [];
        for (var i = 0; i < DELI_CHEESES.length; i++) out.push({ x: DELI_CHEESES[i].x, y: ROOM_FLOOR_TOP + 4, label: 'actionTaste', tap: [DELI_CHEESES[i].x - 32, ROOM_COUNTER_TOP - 44, 64, 100], i: i });
        return out;
      },
      act: function (sp) {
        room.bits.bitten[sp.i] = true;
        roomSay(DELI_CHEESES[sp.i].line);
        roomPop('cafeYum');
        roomBurst(DELI_CHEESES[sp.i].x, ROOM_COUNTER_TOP - 20, [DELI_CHEESES[sp.i].col, '#ffffff', '#ff9a3a']);
        Game.audio.play('pickup');
      },
    },
    iceCreamParlour: {
      title: 'roomParlour', sub: 'roomParlourSub', name: 'scoopName', hi: 'scoopHi', chat: ['scoopChat1', 'scoopChat2'],
      keeper: { x: 520, y: 232, s: 2.4, fur: '#f4f0f4', apron: '#ff9ac8', hat: 'scoop' },
      ink: '#5a2440', band: 'rgba(255, 244, 250, 0.88)',
      back: paintParlourBack, front: paintParlourFront, items: drawParlourItems,
      light: function (g) {
        for (var l = 0; l < 3; l++) {
          lightCone(g, 200 + l * 200, 60, 250, 90, '255, 240, 210', 0.2);
          lightPool(g, 200 + l * 200, 320, 130, 40, '255, 220, 236', 0.2);
        }
        lightPool(g, 680, 104, 90, 90, '200, 220, 255', 0.16);
        shadeCorners(g, 0, H, 0.26);
      },
      start: function () { return { scoops: [], dropT: 0 }; },
      spots: function () {
        var out = [];
        for (var i = 0; i < FLAVOURS.length; i++) out.push({ x: FLAVOURS[i].x, y: ROOM_FLOOR_TOP + 4, label: 'actionScoop', tap: [FLAVOURS[i].x - 36, ROOM_COUNTER_TOP - 14, 72, 70], i: i });
        return out;
      },
      act: function (sp) {
        var b = room.bits;
        if (b.scoops.length >= 5) b.scoops = [];
        b.scoops.push(sp.i);
        b.dropT = 0;
        if (b.scoops.length >= 5) {
          roomSay('scoopTower');
          roomPop('cafeYum');
          roomBurst(CONE_X, ROOM_COUNTER_TOP - 110, ['#ff66cc', '#ffd24a', '#44ddff', '#88dd66'], 22);
          Game.audio.play('victory');
        } else {
          roomSay(FLAVOURS[sp.i].line);
          roomBurst(CONE_X, ROOM_COUNTER_TOP - 40 - b.scoops.length * 15, [FLAVOURS[sp.i].col, '#ffffff']);
          Game.audio.play('pickup');
        }
      },
      actors: function (list) {
        for (var s = 0; s < 3; s++) list.push({ y: 318, draw: drawStool, x: 200 + s * 100 });
      },
    },
    mouseFamilyHome: {
      title: 'roomFamily', sub: 'roomFamilySub', name: 'mamaName', hi: 'mamaHi', chat: ['mamaChat1', 'mamaChat2'],
      keeper: { x: 450, y: 292, s: 2.3, fur: '#e0c8a8', apron: '#ff88bb', hat: 'bow', bow: '#ff66aa', floor: true },
      ink: '#fff4d8', band: 'rgba(90, 48, 16, 0.82)',
      back: paintFamilyBack, front: null, items: drawFamilyItems,
      light: function (g) {
        lightPool(g, 130, 260, 200, 110, '255, 170, 90', 0.3);
        lightPool(g, 400, 104, 120, 80, '220, 230, 255', 0.14);
        shadeCorners(g, 0, H, 0.36);
        shadeBand(g, H - 80, H, 'rgba(40, 16, 0, 0)', 'rgba(40, 16, 0, 0.3)');
      },
      start: function () { return { babies: [{ hop: 0, met: false }, { hop: 0, met: false }, { hop: 0, met: false }], musicT: 0, thanked: false }; },
      spots: function () {
        var out = [];
        for (var i = 0; i < BABIES.length; i++) {
          var p = babyAt(i);
          out.push({ x: p.x, y: p.y, label: 'actionPlay', tap: [p.x - 26, p.y - 50, 52, 58], baby: i });
        }
        out.push({ x: MUSIC_BOX.x, y: MUSIC_BOX.y + 4, label: 'actionWind', tap: [MUSIC_BOX.x - 30, 220, 60, 50], music: true });
        return out;
      },
      act: function (sp) {
        var b = room.bits;
        if (sp.music) {
          b.musicT = 240;
          for (var i = 0; i < b.babies.length; i++) b.babies[i].hop = 30;
          roomSay('musicLine');
          roomBurst(MUSIC_BOX.x, 220, ['#ffd24a', '#ff88bb', '#44ddff'], 12, true);
          Game.audio.play('victory');
          return;
        }
        var bb = b.babies[sp.baby];
        bb.hop = 30;
        bb.met = true;
        var all = b.babies[0].met && b.babies[1].met && b.babies[2].met;
        if (all && !b.thanked) { b.thanked = true; roomSay('mamaThanks'); }
        else roomSay(BABIES[sp.baby].id, BABIES[sp.baby].id + 'Name');
        roomBurst(sp.x, sp.y - 40, ['#ff88bb', '#ffffff'], 6, true);
        Game.audio.play('boing');
      },
      actors: function (list) {
        for (var i = 0; i < BABIES.length; i++) {
          (function (i) {
            var p = babyAt(i);
            list.push({ y: p.y, draw: function (c) {
              c.fillStyle = 'rgba(40, 16, 0, 0.3)';
              c.beginPath(); c.ellipse(p.x, p.y, 13, 3.4, 0, 0, Math.PI * 2); c.fill();
              drawRoomMouse(c, p.x, p.y, 1.35, { fur: BABIES[i].fur, phase: BABIES[i].phase, face: p.face,
                hop: p.hop + (room.bits.musicT > 0 ? Math.abs(Math.sin(room.t * 0.15 + i)) * 0.6 : 0),
                hat: BABIES[i].bow ? 'bow' : null, bow: BABIES[i].bow }, room.t);
            } });
          })(i);
        }
      },
    },
  };

  function isMoonRoom(id) { return !!MOON_ROOMS[id]; }

  function startMoonRoom(id) {
    var R = MOON_ROOMS[id];
    room.id = id;
    room.t = 0;
    room.fx = [];
    room.pop = null; room.popT = 0;
    room.near = -1;
    room.chatI = 0;
    room.bits = R.start();
    var pp = getHousePlayerPos(id);
    pp.x = 130; pp.y = H - 80; pp.px = pp.py = null;
    housePlayerFacing = 1;
    roomSay(R.hi);
  }
  function roomSay(key, nameKey) {
    room.say = key;
    room.sayName = nameKey || null;
    room.sayT = 330;
  }
  function roomPop(key) {
    var pp = getHousePlayerPos(room.id);
    room.pop = key; room.popT = 60;
    room.popX = pp.x; room.popY = pp.y - 80;
  }
  function roomBurst(x, y, cols, n, hearts) {
    for (var i = 0; i < (n || 10); i++) {
      var a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 2.2;
      room.fx.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.6, life: 40 + Math.random() * 20, col: cols[i % cols.length], heart: !!hearts });
    }
  }
  function keeperSpot(R) {
    return { x: R.keeper.x, y: R.keeper.floor ? R.keeper.y + 10 : ROOM_FLOOR_TOP + 4, label: 'actionTalk',
             tap: [R.keeper.x - 34, R.keeper.y - 100, 68, 104], keeper: true };
  }
  function roomSpots(R) {
    var s = R.spots();
    s.push(keeperSpot(R));
    return s;
  }
  function roomAct(R, sp) {
    if (sp.keeper) {
      var b = room.bits;
      if (R === MOON_ROOMS.mouseFamilyHome && b.thanked) roomSay('mamaThanks');
      else roomSay(R.chat[room.chatI++ % R.chat.length]);
      Game.audio.play('select');
      return;
    }
    R.act(sp);
  }

  function updateMoonRoom(keys, jp, id) {
    var R = MOON_ROOMS[id];
    if (room.id !== id) startMoonRoom(id);
    room.t++;
    if (room.sayT > 0) room.sayT--;
    if (room.popT > 0) room.popT--;
    var b = room.bits;
    if (b.dropT != null) b.dropT++;
    if (b.musicT > 0) b.musicT--;
    if (b.babies) for (var bi = 0; bi < b.babies.length; bi++) if (b.babies[bi].hop > 0) b.babies[bi].hop--;
    for (var f = room.fx.length - 1; f >= 0; f--) {
      var p = room.fx[f];
      p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life--;
      if (p.life <= 0) room.fx.splice(f, 1);
    }
    /* Walk Momoko about the floor */
    var pp = getHousePlayerPos(id);
    var sp = roomSpeed(keys, 'moonRoom', 2.2), moved = false;
    pp.px = pp.x; pp.py = pp.y;
    if (keys.left)  { pp.x -= sp; housePlayerFacing = -1; moved = true; }
    if (keys.right) { pp.x += sp; housePlayerFacing = 1;  moved = true; }
    if (keys.up)    { pp.y -= sp; moved = true; }
    if (keys.down)  { pp.y += sp; moved = true; }
    if (!moved && (glide.vx || glide.vy)) { pp.x += glide.vx; pp.y += glide.vy; moved = true; }
    if (pp.x < 30) pp.x = 30;
    if (pp.x > W - 110) pp.x = W - 110;
    if (pp.y < ROOM_FLOOR_TOP) pp.y = ROOM_FLOOR_TOP;
    if (pp.y > H - 30) pp.y = H - 30;
    if (moved) housePlayerFrame = (housePlayerFrame + 1) % 24;
    /* The nearest thing she can try */
    var spots = roomSpots(R), best = 64;
    room.near = -1;
    for (var i = 0; i < spots.length; i++) {
      var dx = pp.x - spots[i].x, dy = (pp.y - spots[i].y) * 1.4;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < best) { best = d; room.near = i; }
    }
    if (jp.action && room.near >= 0) roomAct(R, spots[room.near]);
  }

  function handleMoonRoomClick(mx, my, id) {
    var R = MOON_ROOMS[id];
    if (hitExitButton(mx, my) || hitButton(mx, my, W - 92, H - 152, 80, 122)) {
      Game.audio.play('select');
      return 'exit';
    }
    var spots = roomSpots(R);
    for (var i = spots.length - 1; i >= 0; i--) {
      var tp = spots[i].tap;
      if (hitButton(mx, my, tp[0], tp[1], tp[2], tp[3])) { roomAct(R, spots[i]); return null; }
    }
    return null;
  }

  /* Static room layers, painted once per room and language into
     device-resolution canvases. */
  var roomLayers = {};
  function roomLayer(c, id, part, y0, y1, paint) {
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    var key = id + '@' + dpr + Game.i18n.lang;
    var L = roomLayers[part];
    if (!L || L.key !== key) {
      if (!L) L = roomLayers[part] = { cv: document.createElement('canvas') };
      L.key = key;
      L.cv.width = Math.round(W * dpr);
      L.cv.height = Math.round((y1 - y0) * dpr);
      var g = L.cv.getContext('2d');
      g.scale(dpr, dpr);
      g.translate(0, -y0);
      g.lineJoin = 'round';
      g.lineCap = 'round';
      paint(g);
    }
    c.drawImage(L.cv, 0, y0, W, y1 - y0);
  }

  function drawRoomDoor(c) {
    c.fillStyle = 'rgba(0, 0, 0, 0.25)';
    c.beginPath(); c.ellipse(W - 52, H - 30, 44, 6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#3a2412';
    c.fillRect(W - 84, H - 140, 64, 110);
    var dg = c.createLinearGradient(W - 80, 0, W - 24, 0);
    dg.addColorStop(0, '#9a6a3c');
    dg.addColorStop(1, '#74482a');
    c.fillStyle = dg;
    c.fillRect(W - 80, H - 136, 56, 102);
    c.fillStyle = '#ffd24a';
    c.beginPath(); c.arc(W - 33, H - 86, 3.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffd24a';
    c.beginPath(); c.moveTo(W - 64, H - 104); c.lineTo(W - 40, H - 104); c.lineTo(W - 44, H - 124); c.closePath(); c.fill();
    c.fillStyle = '#44ffff';
    c.fillRect(W - 92, H - 152, 80, 16);
    c.fillStyle = '#0a0420';
    c.font = 'bold 11px ' + FONT;
    c.textAlign = 'center';
    c.fillText(Game.i18n.t('furnitureExit'), W - 52, H - 141);
  }

  function drawRoomBubble(c, R) {
    if (room.sayT <= 0 || !room.say) return;
    var k = R.keeper, text = Game.i18n.t(room.say);
    var name = Game.i18n.t(room.sayName || R.name);
    var bw = 300, pad = 12;
    c.save();
    c.globalAlpha = Math.min(1, room.sayT / 20);
    c.font = 'bold 13px ' + FONT;
    var lines = layoutLines(c, text, bw - pad * 2);
    var bh = 30 + lines.length * 17;
    /* Up beside the speaker's head (clear of the counter, where the
       things to try are), tail pointing down at them */
    var anchorX = k.x, anchorY = k.y - k.s * 30;
    if (room.sayName) {
      var bp = babyAt(BABIES.map(function (b) { return b.id + 'Name'; }).indexOf(room.sayName));
      anchorX = bp.x; anchorY = bp.y - 46;
    }
    var right = anchorX < W / 2 + 60;
    var bx = right ? anchorX + 10 : anchorX - 10 - bw;
    bx = Math.max(10, Math.min(W - bw - 10, bx));
    var by = Math.max(68, anchorY - 16 - bh);
    var tx = right ? Math.max(bx + 18, anchorX + 26) : Math.min(bx + bw - 18, anchorX - 26);
    c.fillStyle = 'rgba(20, 6, 40, 0.3)';
    roundRect(c, bx + 2, by + 4, bw, bh, 14); c.fill();
    c.fillStyle = '#fff8ec';
    c.strokeStyle = '#5a3010';
    c.lineWidth = 2;
    roundRect(c, bx, by, bw, bh, 14); c.fill(); c.stroke();
    var tipX = right ? tx - 14 : tx + 14, tipY = Math.max(by + bh + 8, anchorY - 4);
    c.beginPath(); c.moveTo(tx - 8, by + bh - 1); c.lineTo(tipX, tipY); c.lineTo(tx + 8, by + bh - 1); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(tx - 8, by + bh); c.lineTo(tipX, tipY); c.lineTo(tx + 8, by + bh); c.stroke();
    c.fillStyle = '#ff66aa';
    c.font = 'bold 12px ' + FONT;
    c.textAlign = 'left';
    c.fillText(name, bx + pad, by + 18);
    c.fillStyle = '#3a2414';
    c.font = 'bold 13px ' + FONT;
    for (var i = 0; i < lines.length; i++) c.fillText(lines[i], bx + pad, by + 36 + i * 17);
    c.restore();
  }

  function drawMoonRoom(c, id) {
    var R = MOON_ROOMS[id];
    if (room.id !== id) startMoonRoom(id);
    roomLayer(c, id, 'back', 0, H, R.back);
    drawRoomLight(c, 'moon-' + id, R.light, true);
    var k = R.keeper, kt = room.sayT > 0 && !room.sayName;
    /* Keeper behind the counter (or standing on the floor at home) */
    if (!k.floor) {
      drawRoomMouse(c, k.x, k.y, k.s, { fur: k.fur, apron: k.apron, hat: k.hat, moustache: k.moustache, talking: kt }, room.t);
      if (R.front) roomLayer(c, id, 'front', ROOM_COUNTER_TOP - 44, ROOM_COUNTER_BOT + 8, R.front);
    }
    R.items(c);
    /* Floor actors and Momoko, back to front */
    var pp = getHousePlayerPos(id);
    var list = [];
    if (R.actors) R.actors(list);
    if (k.floor) {
      list.push({ y: k.y, draw: function (c) {
        c.fillStyle = 'rgba(40, 16, 0, 0.3)';
        c.beginPath(); c.ellipse(k.x, k.y, 24, 5, 0, 0, Math.PI * 2); c.fill();
        drawRoomMouse(c, k.x, k.y, k.s, { fur: k.fur, apron: k.apron, hat: k.hat, bow: k.bow, talking: kt, face: pp.x < k.x ? 1 : -1 }, room.t);
      } });
    }
    list.push({ y: pp.y, hero: true });
    list.sort(function (a, b) { return a.y - b.y; });
    for (var i = 0; i < list.length; i++) {
      if (list[i].hero) drawInteriorHero(c, blendStep(pp.px, pp.x), blendStep(pp.py, pp.y) + 4, housePlayerFacing, housePlayerFrame);
      else list[i].draw(c, list[i].x, list[i].y);
    }
    /* What she can try from here */
    if (room.near >= 0) {
      var sp = roomSpots(R)[room.near];
      var lx = sp.tap[0] + sp.tap[2] / 2, ly = sp.tap[1] - 6 + Math.sin(room.t * 0.1) * 2;
      var label = Game.i18n.t(sp.label);
      c.font = 'bold 12px ' + FONT;
      var lw = c.measureText(label).width + 18;
      c.fillStyle = '#ff66aa';
      roundRect(c, lx - lw / 2, ly - 18, lw, 20, 10); c.fill();
      c.strokeStyle = '#ffffff';
      c.lineWidth = 1.5;
      c.stroke();
      c.fillStyle = '#ffffff';
      c.textAlign = 'center';
      c.fillText(label, lx, ly - 4);
    }
    /* Sparkles and hearts */
    for (var f = 0; f < room.fx.length; f++) {
      var p = room.fx[f];
      c.globalAlpha = Math.min(1, p.life / 20);
      c.fillStyle = p.col;
      if (p.heart) {
        c.beginPath();
        c.arc(p.x - 2, p.y - 1, 2.2, 0, Math.PI * 2); c.arc(p.x + 2, p.y - 1, 2.2, 0, Math.PI * 2);
        c.moveTo(p.x - 4, p.y); c.lineTo(p.x, p.y + 4.5); c.lineTo(p.x + 4, p.y); c.closePath(); c.fill();
      } else {
        c.fillRect(p.x - 2, p.y - 2, 4, 4);
      }
    }
    c.globalAlpha = 1;
    /* Yum! over Momoko */
    if (room.popT > 0) {
      c.save();
      c.globalAlpha = Math.min(1, room.popT / 30);
      var py = room.popY - (60 - room.popT) * 0.4;
      c.fillStyle = '#fff';
      c.beginPath(); c.ellipse(room.popX, py, 24, 13, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ff66cc';
      c.font = 'bold 14px ' + FONT;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(Game.i18n.t(room.pop), room.popX, py);
      c.restore();
    }
    drawRoomDoor(c);
    /* Title on a hanging board */
    c.fillStyle = R.band;
    roundRect(c, 240, 14, 320, 50, 12); c.fill();
    c.fillStyle = R.ink;
    c.textAlign = 'center';
    fitFont(c, Game.i18n.t(R.title), 300, 20, 'bold');
    c.fillText(Game.i18n.t(R.title), 400, 38);
    fitFont(c, Game.i18n.t(R.sub), 300, 11, 'bold');
    c.fillText(Game.i18n.t(R.sub), 400, 56);
    drawRoomBubble(c, R);
    /* Hint at the bottom */
    c.fillStyle = 'rgba(10, 4, 32, 0.7)';
    c.fillRect(0, H - 24, W - 100, 24);
    c.fillStyle = '#ffe9c8';
    c.font = 'bold 11px ' + FONT;
    c.textAlign = 'center';
    c.fillText(Game.i18n.t(Game.input.isTouch() ? 'roomHint' : 'roomHintKeys'), (W - 100) / 2, H - 8);
    drawExitButton(c);
  }

  /* ============================================================ */
  /*                  COSMIC CAFÉ — comfy cutscene                  */
  /* ============================================================ */
  /* Cozy cafe interior with warm lighting, a barista, patrons sipping
     drinks, drifting steam and floating hearts. Momoko walks in and sits
     at a table with her dog. Press the action button or tap the door to
     leave. */
  var cafeTimer = 0;
  var cafePlayerX = 130;
  var cafePlayerY = H - 80;
  var cafeFacing = 1;
  var cafeFrame = 0;
  var cafePrevX = null, cafePrevY = null;
  var cafeHearts = [];

  /* Buyable items on the cafe counter. Buying an item swaps the held-food
     slot in Game.customization so the snack appears in Momoko's hand once
     she leaves the cafe. Positions are tuned to sit on top of the counter
     band (y ≈ 158) within the rendered counter (x ≈ 40..560). */
  var CAFE_MENU = [
    { food: 'iceCream',   labelKey: 'varIceCream',   x: 80,  y: 152 },
    { food: 'donut',      labelKey: 'varDonut',      x: 180, y: 152 },
    { food: 'macaron',    labelKey: 'varMacaron',    x: 280, y: 152 },
    { food: 'crepe',      labelKey: 'varCrepe',      x: 380, y: 152 },
    { food: 'parfait',    labelKey: 'varParfait',    x: 480, y: 152 },
    { food: 'taiyaki',    labelKey: 'varTaiyaki',    x: 80,  y: 248 },
    { food: 'onigiri',    labelKey: 'varOnigiri',    x: 180, y: 248 },
    { food: 'strawberry', labelKey: 'varStrawberry', x: 280, y: 248 },
  ];
  /* Index of the menu item Momoko is currently close enough to buy with
     the action button (-1 = none). Recomputed each frame from her
     position. */
  var cafeNearMenuIdx = -1;
  /* Brief feedback bubble — "Yum!" text shown after a purchase. */
  var cafeYumTimer = 0;
  var cafeYumX = 0;
  var cafeYumY = 0;

  function startCafeCutscene() {
    cafeTimer = 0;
    cafePlayerX = 130;
    cafePlayerY = H - 80;
    cafePrevX = cafePrevY = null;
    cafeFacing = 1;
    cafeFrame = 0;
    cafeHearts = [];
    cafeNearMenuIdx = -1;
    cafeYumTimer = 0;
    for (var hi = 0; hi < 6; hi++) {
      cafeHearts.push({
        x: 80 + Math.random() * (W - 160),
        y: H - 40 - Math.random() * 200,
        vy: -0.2 - Math.random() * 0.4,
        phase: Math.random() * Math.PI * 2,
        size: 2 + Math.random() * 2,
      });
    }
  }

  /* Apply a purchase: swap in the held-food slot, persist, sparkle and
     pop a "Yum!" bubble above the player. */
  function buyCafeItem(idx) {
    if (idx < 0 || idx >= CAFE_MENU.length) return;
    var item = CAFE_MENU[idx];
    if (!Game.customization) return;
    Game.customization.food = item.food;
    if (Game.engine && Game.engine.savePersistent) Game.engine.savePersistent();
    cafeYumTimer = 60;
    cafeYumX = cafePlayerX;
    cafeYumY = cafePlayerY - 40;
    if (Game.audio && Game.audio.play) Game.audio.play('pickup');
  }

  function updateCafeInterior(keys, jp) {
    cafeTimer++;
    if (cafeYumTimer > 0) cafeYumTimer--;
    /* Walk Momoko around the cafe floor */
    var sp = roomSpeed(keys, 'cafe', 2.0);
    var moved = false;
    cafePrevX = cafePlayerX; cafePrevY = cafePlayerY;
    if (keys.left)  { cafePlayerX -= sp; cafeFacing = -1; moved = true; }
    if (keys.right) { cafePlayerX += sp; cafeFacing = 1;  moved = true; }
    if (keys.up)    { cafePlayerY -= sp; moved = true; }
    if (keys.down)  { cafePlayerY += sp; moved = true; }
    if (!moved && (glide.vx || glide.vy)) { cafePlayerX += glide.vx; cafePlayerY += glide.vy; moved = true; }
    if (cafePlayerX < 30)       cafePlayerX = 30;
    if (cafePlayerX > W - 110)  cafePlayerX = W - 110;
    if (cafePlayerY < 200)      cafePlayerY = 200;
    if (cafePlayerY > H - 30)   cafePlayerY = H - 30;
    if (moved) cafeFrame = (cafeFrame + 1) % 24;
    /* Hearts drift up and respawn at the bottom */
    for (var hi = 0; hi < cafeHearts.length; hi++) {
      var h = cafeHearts[hi];
      h.y += h.vy;
      h.phase += 0.04;
      if (h.y < 60) {
        h.y = H - 30;
        h.x = 80 + Math.random() * (W - 160);
      }
    }
    /* Find the closest menu item within proximity range so the action
       button buys it instead of exiting. */
    cafeNearMenuIdx = -1;
    var bestDist = 70;
    for (var mi = 0; mi < CAFE_MENU.length; mi++) {
      var m = CAFE_MENU[mi];
      var dx = cafePlayerX - m.x;
      var dy = cafePlayerY - m.y;
      var dd = Math.sqrt(dx * dx + dy * dy);
      if (dd < bestDist) {
        bestDist = dd;
        cafeNearMenuIdx = mi;
      }
    }
    /* Action button: buy if near a menu item. The EXIT button + door
       tile handle leaving so action stays focused on interaction. */
    if (jp.action && cafeNearMenuIdx >= 0) {
      buyCafeItem(cafeNearMenuIdx);
    }
    return null;
  }

  function drawCafeCounter(c) {
    /* Long pink wood counter along the back wall */
    c.fillStyle = '#5a2a44';
    c.fillRect(40, 158, W - 240, 12);
    var topG = c.createLinearGradient(0, 150, 0, 158);
    topG.addColorStop(0, '#ffd9a8');
    topG.addColorStop(1, '#cc7a44');
    c.fillStyle = topG;
    c.fillRect(40, 150, W - 240, 8);
    /* Counter front */
    var frG = c.createLinearGradient(0, 170, 0, 220);
    frG.addColorStop(0, '#aa3a66');
    frG.addColorStop(1, '#5a1a2a');
    c.fillStyle = frG;
    c.fillRect(40, 170, W - 240, 50);
    /* Heart panels along the front */
    for (var hp = 0; hp < 6; hp++) {
      var hpx = 80 + hp * 80;
      c.fillStyle = '#ff8ab0';
      c.beginPath();
      c.arc(hpx - 3, 188, 3, 0, Math.PI * 2);
      c.arc(hpx + 3, 188, 3, 0, Math.PI * 2);
      c.moveTo(hpx - 5.4, 190);
      c.lineTo(hpx, 197);
      c.lineTo(hpx + 5.4, 190);
      c.closePath();
      c.fill();
    }
    /* Espresso machine */
    c.fillStyle = '#d8d8e0';
    c.fillRect(70, 110, 64, 40);
    c.fillStyle = '#7a8896';
    c.fillRect(74, 144, 56, 6);
    /* Espresso machine spouts */
    c.fillStyle = '#3a2a44';
    c.fillRect(86, 150, 4, 6);
    c.fillRect(112, 150, 4, 6);
    /* Indicator lights */
    var indicator = (Math.sin(cafeTimer * 0.06) + 1) * 0.5;
    c.fillStyle = '#ff6644';
    c.globalAlpha = 0.5 + indicator * 0.5;
    c.beginPath(); c.arc(82, 122, 2, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#44ff88';
    c.beginPath(); c.arc(92, 122, 2, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
    /* Steam puff */
    c.save();
    c.globalAlpha = 0.5 + Math.sin(cafeTimer * 0.05) * 0.2;
    c.fillStyle = '#fff';
    var stY = 100 - (cafeTimer * 0.5 % 30);
    c.beginPath(); c.arc(102, stY, 4, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(106, stY - 6, 3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(98, stY - 10, 2.5, 0, Math.PI * 2); c.fill();
    c.restore();
    /* Pastry display case */
    c.fillStyle = '#ffe9c8';
    c.fillRect(160, 122, 100, 30);
    c.strokeStyle = '#5a2a44';
    c.lineWidth = 1.5;
    c.strokeRect(160, 122, 100, 30);
    /* Cakes inside */
    var cakeColors = ['#ff66cc', '#ffd24a', '#cc88ff', '#88ddff'];
    for (var ck = 0; ck < 4; ck++) {
      var ckx = 170 + ck * 22;
      c.fillStyle = cakeColors[ck];
      c.fillRect(ckx, 138, 14, 12);
      c.fillStyle = '#ffffff';
      c.fillRect(ckx, 136, 14, 2);
      c.fillStyle = '#ff3366';
      c.beginPath(); c.arc(ckx + 7, 134, 1.4, 0, Math.PI * 2); c.fill();
    }
    /* Cash register */
    c.fillStyle = '#3a2a44';
    c.fillRect(290, 124, 36, 26);
    c.fillStyle = '#ffd24a';
    c.fillRect(294, 128, 28, 6);
    c.fillStyle = '#0a0420';
    c.fillRect(294, 128, 28, 6);
    c.fillStyle = '#44ffff';
    c.font = '7px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'left';
    c.fillText('$1.50', 296, 133);
    /* Small chalkboard menu on the back wall */
    c.fillStyle = '#1a2a1a';
    c.fillRect(360, 70, 140, 64);
    c.strokeStyle = '#88553a';
    c.lineWidth = 3;
    c.strokeRect(360, 70, 140, 64);
    c.fillStyle = '#ffe9f4';
    c.font = 'bold 10px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'center';
    c.fillText('~ COSMIC MENU ~', 430, 84);
    c.fillStyle = '#ffd24a';
    c.font = '9px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'left';
    c.fillText('star latte ........ $2', 370, 98);
    c.fillText('moon mocha ..... $3', 370, 110);
    c.fillText('comet cake ...... $1', 370, 122);
  }

  /* Hash a position into a deterministic per-patron variant index so
     facial style / outfit varies between patrons but stays consistent
     between frames. */
  function cafePatronVariant(x, n) {
    return Math.abs(Math.floor(x * 13 + 7)) % n;
  }

  function drawCafePatron(c, x, y, color, hairColor, t, drink) {
    var variant = cafePatronVariant(x, 4);
    var hairStyle = cafePatronVariant(x + 41, 4);
    var bob = Math.sin(t * 0.05 + x * 0.01) * 0.6;
    var blink = Math.sin(t * 0.04 + x * 0.013) > 0.95;
    /* ===== Chair behind the patron ===== */
    /* Chair legs peek out at the bottom */
    c.fillStyle = '#3a1a2a';
    c.fillRect(x - 13, y + 12, 2.6, 8);
    c.fillRect(x + 10.4, y + 12, 2.6, 8);
    /* Chair seat */
    var seatG = c.createLinearGradient(0, y + 8, 0, y + 16);
    seatG.addColorStop(0, '#cc4488');
    seatG.addColorStop(1, '#7a2454');
    c.fillStyle = seatG;
    c.beginPath();
    c.moveTo(x - 14, y + 16);
    c.quadraticCurveTo(x - 16, y + 10, x - 12, y + 8);
    c.lineTo(x + 12, y + 8);
    c.quadraticCurveTo(x + 16, y + 10, x + 14, y + 16);
    c.closePath();
    c.fill();
    /* Chair back — high curved with button tufts */
    var backG = c.createLinearGradient(0, y - 18, 0, y + 8);
    backG.addColorStop(0, '#aa3a66');
    backG.addColorStop(1, '#5a1a3a');
    c.fillStyle = backG;
    c.beginPath();
    c.moveTo(x - 13, y + 8);
    c.lineTo(x - 13, y - 10);
    c.quadraticCurveTo(x - 13, y - 18, x - 7, y - 18);
    c.lineTo(x + 7, y - 18);
    c.quadraticCurveTo(x + 13, y - 18, x + 13, y - 10);
    c.lineTo(x + 13, y + 8);
    c.closePath();
    c.fill();
    /* Button tufts on the chair back */
    c.fillStyle = '#3a0a22';
    var tufts = [[-5, -12], [5, -12], [0, -7], [-5, -2], [5, -2]];
    for (var ct = 0; ct < tufts.length; ct++) {
      c.beginPath();
      c.arc(x + tufts[ct][0], y + tufts[ct][1], 0.7, 0, Math.PI * 2);
      c.fill();
    }
    /* ===== Body / outfit ===== */
    /* Outfit shading */
    var bodyG = c.createLinearGradient(0, y - 12, 0, y + 8);
    bodyG.addColorStop(0, color);
    bodyG.addColorStop(1, hexShadeUI(color, -25));
    c.fillStyle = bodyG;
    c.beginPath();
    c.moveTo(x - 9, y + 8);
    c.lineTo(x - 9, y - 10);
    c.quadraticCurveTo(x - 9, y - 12, x - 7, y - 12);
    c.lineTo(x + 7, y - 12);
    c.quadraticCurveTo(x + 9, y - 12, x + 9, y - 10);
    c.lineTo(x + 9, y + 8);
    c.closePath();
    c.fill();
    /* Outfit detail per variant — collar, scarf, jacket, sweater */
    if (variant === 0) {
      /* V-neck collar with brooch */
      c.fillStyle = '#ffe9c8';
      c.beginPath();
      c.moveTo(x - 5, y - 10);
      c.lineTo(x, y - 4);
      c.lineTo(x + 5, y - 10);
      c.closePath();
      c.fill();
      c.fillStyle = '#ffd24a';
      c.beginPath(); c.arc(x, y - 7, 0.9, 0, Math.PI * 2); c.fill();
    } else if (variant === 1) {
      /* Striped scarf around the neck */
      c.fillStyle = '#ffe9c8';
      c.fillRect(x - 8, y - 12, 16, 3);
      c.fillStyle = '#cc4466';
      c.fillRect(x - 8, y - 11, 16, 0.6);
      c.fillRect(x - 8, y - 9.6, 16, 0.6);
      c.fillStyle = '#ffe9c8';
      c.fillRect(x - 5, y - 9, 3, 6);
    } else if (variant === 2) {
      /* Cardigan with row of buttons */
      c.fillStyle = hexShadeUI(color, -40);
      c.fillRect(x - 9, y - 11, 1.4, 19);
      c.fillRect(x + 7.6, y - 11, 1.4, 19);
      c.fillStyle = '#ffd24a';
      for (var bb = 0; bb < 3; bb++) {
        c.beginPath(); c.arc(x, y - 8 + bb * 5, 0.8, 0, Math.PI * 2); c.fill();
      }
    } else {
      /* Striped sweater */
      c.fillStyle = hexShadeUI(color, 30);
      c.fillRect(x - 9, y - 8, 18, 1.4);
      c.fillRect(x - 9, y - 4, 18, 1.4);
      c.fillRect(x - 9, y, 18, 1.4);
      c.fillRect(x - 9, y + 4, 18, 1.4);
    }
    /* Visible sleeve / arm on the table side, holding the drink/snack */
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(x + 6, y - 8);
    c.quadraticCurveTo(x + 12, y - 4, x + 8, y);
    c.lineTo(x + 4, y);
    c.lineTo(x + 4, y - 6);
    c.closePath();
    c.fill();
    c.fillStyle = '#ffccaa';
    c.beginPath();
    c.arc(x + 7, y - 1, 1.8, 0, Math.PI * 2);
    c.fill();
    /* ===== Head ===== */
    var hy = y - 16 + bob;
    /* Neck */
    c.fillStyle = '#ddaa88';
    c.fillRect(x - 2.2, y - 12, 4.4, 3);
    /* Head shape */
    c.fillStyle = '#ffccaa';
    c.beginPath();
    c.arc(x, hy, 7, 0, Math.PI * 2);
    c.fill();
    /* Cheek blush */
    c.save();
    c.globalAlpha = 0.6;
    c.fillStyle = '#ff99aa';
    c.beginPath(); c.arc(x - 4, hy + 1, 1.6, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x + 4, hy + 1, 1.6, 0, Math.PI * 2); c.fill();
    c.restore();
    /* Ears */
    c.fillStyle = '#ddaa88';
    c.beginPath(); c.arc(x - 7, hy + 1, 1.4, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x + 7, hy + 1, 1.4, 0, Math.PI * 2); c.fill();
    /* Earrings */
    c.fillStyle = '#ffd24a';
    c.beginPath(); c.arc(x - 7, hy + 2.8, 0.55, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x + 7, hy + 2.8, 0.55, 0, Math.PI * 2); c.fill();
    /* ===== Hair (4 styles) ===== */
    if (hairStyle === 0) {
      /* Long flowing hair with side bangs */
      c.fillStyle = hairColor;
      c.beginPath();
      c.arc(x, hy - 1, 8, Math.PI, Math.PI * 2);
      c.fill();
      c.fillRect(x - 8, hy - 1, 16, 5);
      /* Side strands flowing down past shoulders */
      c.beginPath();
      c.moveTo(x - 8, hy + 4);
      c.bezierCurveTo(x - 11, hy + 8, x - 10, hy + 12, x - 8, hy + 14);
      c.lineTo(x - 5, hy + 14);
      c.lineTo(x - 5, hy + 4);
      c.closePath();
      c.fill();
      c.beginPath();
      c.moveTo(x + 8, hy + 4);
      c.bezierCurveTo(x + 11, hy + 8, x + 10, hy + 12, x + 8, hy + 14);
      c.lineTo(x + 5, hy + 14);
      c.lineTo(x + 5, hy + 4);
      c.closePath();
      c.fill();
      /* Bangs */
      c.fillStyle = hexShadeUI(hairColor, -15);
      c.beginPath();
      c.moveTo(x - 7, hy - 4);
      c.bezierCurveTo(x - 4, hy - 1, x + 4, hy - 1, x + 7, hy - 4);
      c.lineTo(x + 6, hy + 1);
      c.lineTo(x - 6, hy + 1);
      c.closePath();
      c.fill();
      /* Hair bow */
      c.fillStyle = '#ff66cc';
      c.beginPath();
      c.moveTo(x - 6, hy - 6);
      c.lineTo(x - 9, hy - 9);
      c.lineTo(x - 9, hy - 4);
      c.closePath();
      c.fill();
      c.beginPath();
      c.moveTo(x - 6, hy - 6);
      c.lineTo(x - 4, hy - 9);
      c.lineTo(x - 4, hy - 4);
      c.closePath();
      c.fill();
      c.fillStyle = '#ffd24a';
      c.beginPath(); c.arc(x - 6, hy - 6, 0.7, 0, Math.PI * 2); c.fill();
    } else if (hairStyle === 1) {
      /* Twin-tail buns */
      c.fillStyle = hairColor;
      c.beginPath();
      c.arc(x, hy - 1, 8, Math.PI, Math.PI * 2);
      c.fill();
      c.fillRect(x - 8, hy - 1, 16, 4);
      c.beginPath(); c.arc(x - 8, hy - 5, 3.4, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(x + 8, hy - 5, 3.4, 0, Math.PI * 2); c.fill();
      /* Bangs */
      c.fillStyle = hexShadeUI(hairColor, -15);
      c.fillRect(x - 6, hy - 3, 12, 3);
      /* Bun ribbons */
      c.fillStyle = '#ff66cc';
      c.fillRect(x - 9.6, hy - 6, 3.2, 0.8);
      c.fillRect(x + 6.4, hy - 6, 3.2, 0.8);
    } else if (hairStyle === 2) {
      /* Short bob with side fringe */
      c.fillStyle = hairColor;
      c.beginPath();
      c.arc(x, hy, 8.4, Math.PI - 0.1, Math.PI * 2 + 0.1);
      c.fill();
      c.fillRect(x - 8, hy, 16, 5);
      c.fillStyle = hexShadeUI(hairColor, 25);
      c.fillRect(x - 7, hy - 4, 6, 3);
      /* Hair clip */
      c.fillStyle = '#ffd24a';
      c.fillRect(x + 4, hy - 4, 3, 1.2);
    } else {
      /* Curly afro / pile */
      c.fillStyle = hairColor;
      var puffs = [[-7, -4], [-3, -7], [3, -7], [7, -4], [-5, -1], [5, -1], [0, -8]];
      for (var pf = 0; pf < puffs.length; pf++) {
        c.beginPath();
        c.arc(x + puffs[pf][0], hy + puffs[pf][1], 4, 0, Math.PI * 2);
        c.fill();
      }
      /* Headband */
      c.fillStyle = '#ff66cc';
      c.fillRect(x - 8, hy - 1, 16, 1.2);
      c.fillStyle = '#ffd24a';
      c.beginPath(); c.arc(x, hy - 0.4, 0.8, 0, Math.PI * 2); c.fill();
    }
    /* ===== Eyes ===== */
    c.fillStyle = '#220033';
    if (blink) {
      c.fillRect(x - 3.2, hy + 0.5, 2.4, 0.7);
      c.fillRect(x + 0.8, hy + 0.5, 2.4, 0.7);
    } else {
      /* Eye whites */
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(x - 2.2, hy + 0.6, 1.5, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(x + 2.2, hy + 0.6, 1.5, 0, Math.PI * 2); c.fill();
      /* Pupils */
      c.fillStyle = '#220033';
      c.beginPath(); c.arc(x - 2.2, hy + 0.8, 1, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(x + 2.2, hy + 0.8, 1, 0, Math.PI * 2); c.fill();
      /* Eye shine */
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(x - 1.7, hy + 0.4, 0.5, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(x + 2.7, hy + 0.4, 0.5, 0, Math.PI * 2); c.fill();
      /* Eyelashes */
      c.strokeStyle = '#220033';
      c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(x - 3.5, hy - 0.4); c.lineTo(x - 4.4, hy - 1.4); c.stroke();
      c.beginPath(); c.moveTo(x + 3.5, hy - 0.4); c.lineTo(x + 4.4, hy - 1.4); c.stroke();
    }
    /* Eyebrows */
    c.strokeStyle = hexShadeUI(hairColor, -30);
    c.lineWidth = 0.7;
    c.beginPath(); c.moveTo(x - 4, hy - 1.6); c.lineTo(x - 1, hy - 2.2); c.stroke();
    c.beginPath(); c.moveTo(x + 1, hy - 2.2); c.lineTo(x + 4, hy - 1.6); c.stroke();
    /* Nose */
    c.strokeStyle = '#cc8866';
    c.lineWidth = 0.4;
    c.beginPath();
    c.moveTo(x, hy + 1.4);
    c.lineTo(x + 0.4, hy + 2.4);
    c.stroke();
    /* Smile */
    c.strokeStyle = '#aa3a66';
    c.lineWidth = 0.8;
    c.beginPath();
    c.arc(x, hy + 3, 1.7, 0.2, Math.PI - 0.2);
    c.stroke();
    /* Lip blush */
    c.save();
    c.globalAlpha = 0.5;
    c.strokeStyle = '#ff99aa';
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(x, hy + 3, 1.4, 0.6, Math.PI - 0.6);
    c.stroke();
    c.restore();
    /* ===== Drink + dessert in front ===== */
    if (drink) {
      var mugVariant = cafePatronVariant(x + 7, 3);
      /* Mug body */
      var mugColors = ['#ff8ab0', '#88ddff', '#ffd24a'];
      var mugColor = mugColors[mugVariant];
      c.fillStyle = mugColor;
      c.beginPath();
      c.moveTo(x + 4, y - 6);
      c.lineTo(x + 12, y - 6);
      c.lineTo(x + 11, y - 1);
      c.lineTo(x + 5, y - 1);
      c.closePath();
      c.fill();
      /* Mug rim band */
      c.fillStyle = hexShadeUI(mugColor, 25);
      c.fillRect(x + 4, y - 6, 8, 1);
      /* Mug heart */
      c.fillStyle = '#fff';
      var hcX = x + 8, hcY = y - 4;
      c.beginPath();
      c.arc(hcX - 0.9, hcY - 0.3, 0.8, 0, Math.PI * 2);
      c.arc(hcX + 0.9, hcY - 0.3, 0.8, 0, Math.PI * 2);
      c.moveTo(hcX - 1.6, hcY);
      c.lineTo(hcX, hcY + 1.6);
      c.lineTo(hcX + 1.6, hcY);
      c.closePath();
      c.fill();
      /* Mug handle */
      c.strokeStyle = mugColor;
      c.lineWidth = 1;
      c.beginPath(); c.arc(x + 13, y - 3.4, 1.6, -Math.PI / 2, Math.PI / 2); c.stroke();
      /* Drink surface — coffee crema */
      c.fillStyle = '#a8744a';
      c.beginPath();
      c.ellipse(x + 8, y - 6, 4, 0.8, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#ffe9c8';
      c.save();
      c.globalAlpha = 0.6;
      c.beginPath();
      c.ellipse(x + 7.4, y - 6.1, 2, 0.5, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
      /* Steam (rising) */
      c.save();
      c.globalAlpha = 0.55 + Math.sin(t * 0.06 + x) * 0.2;
      c.fillStyle = '#fff';
      var stPhase = (t * 0.4 + x * 0.1) % 12;
      c.beginPath(); c.arc(x + 7, y - 8 - stPhase, 1.4, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(x + 9.4, y - 11 - stPhase, 1.1, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(x + 6.4, y - 13 - stPhase, 0.9, 0, Math.PI * 2); c.fill();
      c.restore();
      /* Pastry plate */
      var dessertVariant = cafePatronVariant(x + 19, 4);
      c.fillStyle = '#ffe9c8';
      c.beginPath();
      c.ellipse(x - 5, y - 1, 5, 1.4, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#cdaaee';
      c.lineWidth = 0.4;
      c.beginPath();
      c.ellipse(x - 5, y - 1, 5, 1.4, 0, 0, Math.PI * 2);
      c.stroke();
      if (dessertVariant === 0) {
        /* Pink macaron */
        c.fillStyle = '#ff8ab0';
        c.beginPath(); c.ellipse(x - 5, y - 3, 3, 1.4, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#ffe9c8';
        c.fillRect(x - 7.2, y - 2.6, 4.4, 0.6);
        c.fillStyle = '#ff99cc';
        c.beginPath(); c.ellipse(x - 5, y - 4, 3, 1.4, 0, 0, Math.PI * 2); c.fill();
      } else if (dessertVariant === 1) {
        /* Slice of cake */
        c.fillStyle = '#ffd9e8';
        c.beginPath();
        c.moveTo(x - 8, y - 2.4);
        c.lineTo(x - 2, y - 2.4);
        c.lineTo(x - 5, y - 7);
        c.closePath();
        c.fill();
        c.fillStyle = '#ff66cc';
        c.beginPath();
        c.arc(x - 5, y - 7, 1, 0, Math.PI * 2);
        c.fill();
      } else if (dessertVariant === 2) {
        /* Donut */
        c.fillStyle = '#a8744a';
        c.beginPath(); c.ellipse(x - 5, y - 3, 2.8, 1.6, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#ff66cc';
        c.beginPath(); c.ellipse(x - 5, y - 3.4, 2.6, 1, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#ffe9c8';
        c.beginPath(); c.arc(x - 5, y - 3.2, 0.7, 0, Math.PI * 2); c.fill();
        /* Sprinkles */
        c.fillStyle = '#ffd24a';
        c.fillRect(x - 6, y - 4, 0.5, 0.5);
        c.fillStyle = '#88ddff';
        c.fillRect(x - 4, y - 3.4, 0.5, 0.5);
        c.fillStyle = '#fff';
        c.fillRect(x - 5.5, y - 3.6, 0.5, 0.5);
      } else {
        /* Croissant */
        c.fillStyle = '#d8a064';
        c.beginPath();
        c.arc(x - 5, y - 3, 3, Math.PI, 0);
        c.fill();
        c.fillStyle = '#a8744a';
        c.beginPath();
        c.arc(x - 5, y - 3, 3, Math.PI, 0);
        c.stroke();
      }
    }
    /* ===== Conversation bubble — occasionally shows a chat icon ===== */
    var chatPhase = Math.sin(t * 0.012 + x * 0.07);
    if (chatPhase > 0.92) {
      c.save();
      c.globalAlpha = (chatPhase - 0.92) / 0.08;
      var bx = x + 10, by = hy - 10;
      c.fillStyle = '#fff';
      c.beginPath();
      c.ellipse(bx, by, 6, 4, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.moveTo(bx - 3, by + 3);
      c.lineTo(bx - 5, by + 6);
      c.lineTo(bx - 1, by + 4);
      c.closePath();
      c.fill();
      c.fillStyle = '#220033';
      c.font = '5px "M PLUS Rounded 1c", sans-serif';
      c.textAlign = 'center';
      c.fillText('♥♥♥', bx, by + 1.5);
      c.restore();
    }
  }

  /* Lightweight color shader for the cafe — local to ui.js so we don't
     reach into entities.js. Positive `pct` lightens, negative darkens. */
  function hexShadeUI(hex, pct) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
    var f = pct / 100;
    function adj(v) {
      var nv = v + (f >= 0 ? (255 - v) * f : v * f);
      return Math.max(0, Math.min(255, Math.round(nv)));
    }
    var r2 = adj(r), g2 = adj(g), b2 = adj(b);
    return '#' + ((1 << 24) + (r2 << 16) + (g2 << 8) + b2).toString(16).slice(1);
  }

  function drawCafeTable(c, x, y) {
    /* Round bistro table */
    c.fillStyle = '#3a2010';
    c.beginPath();
    c.ellipse(x, y, 20, 5, 0, 0, Math.PI * 2);
    c.fill();
    var topG = c.createRadialGradient(x - 4, y - 2, 2, x, y, 22);
    topG.addColorStop(0, '#d8a064');
    topG.addColorStop(1, '#7a4818');
    c.fillStyle = topG;
    c.beginPath();
    c.ellipse(x, y - 2, 19, 4, 0, 0, Math.PI * 2);
    c.fill();
    /* Pedestal */
    c.fillStyle = '#5a3418';
    c.fillRect(x - 2, y, 4, 18);
    /* Cross-base feet */
    c.fillStyle = '#3a2010';
    c.fillRect(x - 12, y + 18, 24, 3);
    /* Mug + flower vase */
    c.fillStyle = '#ff8ab0';
    c.fillRect(x - 8, y - 8, 6, 6);
    c.strokeStyle = '#ff8ab0';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(x - 1, y - 5, 2, -Math.PI / 2, Math.PI / 2);
    c.stroke();
    /* Vase + flower */
    c.fillStyle = '#cc88ff';
    c.beginPath();
    c.moveTo(x + 4, y - 4);
    c.lineTo(x + 9, y - 4);
    c.lineTo(x + 8, y - 10);
    c.lineTo(x + 5, y - 10);
    c.closePath();
    c.fill();
    c.fillStyle = '#ff66cc';
    c.beginPath(); c.arc(x + 6.5, y - 12, 2, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffd24a';
    c.beginPath(); c.arc(x + 6.5, y - 12, 0.8, 0, Math.PI * 2); c.fill();
  }

  function drawCafeInterior(c) {
    cafeTimer++;
    /* Warm interior gradient — sunset peach into cream */
    var bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#5a1a3a');
    bg.addColorStop(0.55, '#a83a5a');
    bg.addColorStop(1, '#3a1024');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    /* Wallpaper pattern — repeating tiny stars */
    c.save();
    c.globalAlpha = 0.18;
    c.fillStyle = '#ffd9a8';
    for (var ws = 0; ws < 60; ws++) {
      var wsx = (ws * 71) % W;
      var wsy = (ws * 43) % (H - 200) + 20;
      c.beginPath();
      c.arc(wsx, wsy, 1.4, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    /* Ceiling beam */
    c.fillStyle = '#3a1a2a';
    c.fillRect(0, 50, W, 14);
    c.fillStyle = '#5a2a44';
    c.fillRect(0, 60, W, 4);
    /* Hanging pendant lamps with warm glow */
    for (var lp = 0; lp < 5; lp++) {
      var lpx = 100 + lp * 140;
      c.strokeStyle = '#3a1a2a';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(lpx, 64);
      c.lineTo(lpx, 86);
      c.stroke();
      c.fillStyle = '#ffd24a';
      c.beginPath();
      c.moveTo(lpx - 9, 86);
      c.lineTo(lpx + 9, 86);
      c.lineTo(lpx + 6, 96);
      c.lineTo(lpx - 6, 96);
      c.closePath();
      c.fill();
      c.save();
      c.globalAlpha = 0.4 + Math.sin(cafeTimer * 0.04 + lp) * 0.05;
      var glow = c.createRadialGradient(lpx, 96, 4, lpx, 96, 60);
      glow.addColorStop(0, 'rgba(255,210,138,0.7)');
      glow.addColorStop(1, 'rgba(255,210,138,0)');
      c.fillStyle = glow;
      c.beginPath(); c.arc(lpx, 96, 60, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    /* Floor — warm wood planks */
    var fl = c.createLinearGradient(0, 220, 0, H);
    fl.addColorStop(0, '#7a4818');
    fl.addColorStop(1, '#3a2010');
    c.fillStyle = fl;
    c.fillRect(0, 220, W, H - 220);
    c.strokeStyle = 'rgba(0,0,0,0.3)';
    c.lineWidth = 1;
    for (var pl = 0; pl < 7; pl++) {
      c.beginPath();
      c.moveTo(0, 240 + pl * 24);
      c.lineTo(W, 240 + pl * 24);
      c.stroke();
    }
    drawRoomLight(c, 'cafe', paintCafeLight, true);
    /* Counter at the back */
    drawCafeCounter(c);
    /* Barista behind the counter */
    drawCafePatron(c, 220, 138, '#ee99dd', '#cc4488', cafeTimer, false);
    /* Small "Welcome to the Cosmic Café!" sign */
    c.fillStyle = '#ffe9c8';
    c.font = 'bold 22px "Brush Script MT", cursive';
    c.textAlign = 'center';
    c.fillText('~ Cosmic Café ~', W / 2, 40);
    c.font = '12px "M PLUS Rounded 1c", sans-serif';
    c.fillStyle = '#ffd9a8';
    c.fillText('a cozy spot among the stars', W / 2, 56);
    /* Tables with patrons */
    /* Contact shadows under the three tables */
    c.fillStyle = 'rgba(20, 4, 24, 0.36)';
    c.beginPath(); c.ellipse(130, 341, 30, 5, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(361, 371, 40, 5.5, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(560, 341, 30, 5, 0, 0, Math.PI * 2); c.fill();
    drawCafeTable(c, 130, 320);
    drawCafePatron(c, 130, 320 - 6, '#88ddff', '#3a4488', cafeTimer + 30, true);
    drawCafeTable(c, 360, 350);
    drawCafePatron(c, 350, 350 - 6, '#ffd24a', '#7a4418', cafeTimer + 70, true);
    drawCafePatron(c, 372, 350 - 6, '#cc88ff', '#552288', cafeTimer + 110, true);
    drawCafeTable(c, 560, 320);
    drawCafePatron(c, 560, 320 - 6, '#88ee88', '#3a7a3a', cafeTimer + 50, true);
    /* Window with stars (right side) */
    c.fillStyle = '#0a0420';
    c.fillRect(W - 200, 90, 130, 90);
    c.strokeStyle = '#ffd24a';
    c.lineWidth = 3;
    c.strokeRect(W - 200, 90, 130, 90);
    /* Cross frame */
    c.beginPath();
    c.moveTo(W - 135, 90); c.lineTo(W - 135, 180); c.stroke();
    c.beginPath();
    c.moveTo(W - 200, 135); c.lineTo(W - 70, 135); c.stroke();
    /* Stars inside the window */
    c.fillStyle = '#fff';
    for (var sw = 0; sw < 14; sw++) {
      var swx = (W - 196) + ((sw * 13) % 122);
      var swy = 96 + ((sw * 27) % 78);
      c.globalAlpha = 0.5 + ((sw * 17) % 50) / 100;
      c.beginPath();
      c.arc(swx, swy, 0.8 + (sw % 3) * 0.4, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    /* Tiny ringed planet visible */
    c.fillStyle = '#ff66cc';
    c.beginPath(); c.arc(W - 120, 145, 7, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#ffd24a';
    c.lineWidth = 1.2;
    c.beginPath();
    c.ellipse(W - 120, 145, 12, 3, -0.3, 0, Math.PI * 2);
    c.stroke();
    /* Floating hearts (atmosphere) */
    for (var hi = 0; hi < cafeHearts.length; hi++) {
      var h = cafeHearts[hi];
      var sway = Math.sin(h.phase) * 8;
      var hx = h.x + sway;
      c.save();
      c.globalAlpha = 0.55;
      c.fillStyle = '#ff99cc';
      c.beginPath();
      c.arc(hx - h.size, h.y - h.size * 0.5, h.size, 0, Math.PI * 2);
      c.arc(hx + h.size, h.y - h.size * 0.5, h.size, 0, Math.PI * 2);
      c.moveTo(hx - h.size * 1.8, h.y);
      c.lineTo(hx, h.y + h.size * 1.8);
      c.lineTo(hx + h.size * 1.8, h.y);
      c.closePath();
      c.fill();
      c.restore();
    }
    /* Buyable menu items on the counter — drawn before Momoko so she
       walks in front of the food stand. */
    drawCafeMenuItems(c);
    /* Momoko walking around the cafe */
    if (Game.entities && Game.entities.drawMomokoSprite) {
      drawInteriorHero(c, blendStep(cafePrevX, cafePlayerX), blendStep(cafePrevY, cafePlayerY) + 4, cafeFacing, cafeFrame);
    }
    /* Yum! purchase feedback bubble */
    if (cafeYumTimer > 0) {
      c.save();
      c.globalAlpha = Math.min(1, cafeYumTimer / 30);
      var ybY = cafeYumY - (60 - cafeYumTimer) * 0.4;
      c.fillStyle = '#fff';
      c.beginPath();
      c.ellipse(cafeYumX, ybY, 20, 12, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#ff66cc';
      c.font = 'bold 14px "M PLUS Rounded 1c", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(Game.i18n.t('cafeYum'), cafeYumX, ybY);
      c.textBaseline = 'alphabetic';
      c.restore();
    }
    /* Exit door (right side) */
    c.fillStyle = '#3a2412';
    c.fillRect(W - 84, H - 140, 64, 110);
    c.fillStyle = '#aa5a32';
    c.fillRect(W - 80, H - 136, 56, 102);
    c.strokeStyle = '#5a3a22';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(W - 52, H - 132); c.lineTo(W - 52, H - 36); c.stroke();
    c.fillStyle = '#ffd24a';
    c.beginPath();
    c.arc(W - 36, H - 86, 3, 0, Math.PI * 2);
    c.fill();
    /* "Outside" sign */
    c.fillStyle = '#44ffff';
    c.fillRect(W - 92, H - 152, 80, 16);
    c.fillStyle = '#0a0420';
    c.font = 'bold 11px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'center';
    c.fillText(Game.i18n.t('furnitureExit'), W - 52, H - 141);
    /* Hint at the bottom */
    c.fillStyle = 'rgba(10, 4, 32, 0.7)';
    c.fillRect(0, H - 24, W - 100, 24);
    c.fillStyle = '#ffe9c8';
    c.font = 'bold 11px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'center';
    c.fillText(Game.i18n.t(Game.input.isTouch() ? 'cafeHint' : 'cafeHintKeys'), (W - 100) / 2, H - 8);
    /* One-shot top-right EXIT button (always visible) */
    drawExitButton(c);
  }

  /* Render each buyable menu item on the counter as a small framed
     dish. Highlights the one Momoko is closest to. */
  function drawCafeMenuItems(c) {
    for (var mi = 0; mi < CAFE_MENU.length; mi++) {
      var m = CAFE_MENU[mi];
      var hot = (mi === cafeNearMenuIdx);
      /* Plate */
      c.save();
      c.fillStyle = '#3a1a2a';
      c.beginPath();
      c.ellipse(m.x, m.y + 18, 22, 4, 0, 0, Math.PI * 2);
      c.fill();
      /* Stand frame */
      c.fillStyle = hot ? '#ffd24a' : '#a86820';
      c.fillRect(m.x - 22, m.y - 14, 44, 4);
      /* Plate ring */
      var plateG = c.createRadialGradient(m.x - 4, m.y + 12, 2, m.x, m.y + 14, 22);
      plateG.addColorStop(0, '#ffe9c8');
      plateG.addColorStop(1, '#cdaaee');
      c.fillStyle = plateG;
      c.beginPath();
      c.ellipse(m.x, m.y + 14, 20, 5, 0, 0, Math.PI * 2);
      c.fill();
      /* Item icon — borrow the held-food drawing logic by creating a
         tiny inline sprite per food type. */
      drawCafeFoodIcon(c, m.food, m.x, m.y);
      /* Highlight ring + price tag when Momoko is near */
      if (hot) {
        c.save();
        c.globalAlpha = 0.55 + Math.sin(cafeTimer * 0.18) * 0.25;
        c.strokeStyle = '#ffd24a';
        c.lineWidth = 2;
        c.beginPath();
        c.ellipse(m.x, m.y + 14, 24, 7, 0, 0, Math.PI * 2);
        c.stroke();
        c.restore();
      }
      /* Label */
      c.fillStyle = hot ? '#ffd24a' : '#ffe9c8';
      c.font = (hot ? 'bold ' : '') + '9px "M PLUS Rounded 1c", sans-serif';
      c.textAlign = 'center';
      c.fillText(Game.i18n.t(m.labelKey) || m.food, m.x, m.y + 28);
      c.restore();
    }
    /* Action prompt above the closest item */
    if (cafeNearMenuIdx >= 0) {
      var nm = CAFE_MENU[cafeNearMenuIdx];
      var px = nm.x, py = nm.y - 22;
      c.save();
      c.globalAlpha = 0.85;
      c.fillStyle = '#0a0420';
      c.strokeStyle = '#ffd24a';
      c.lineWidth = 1.5;
      roundRect(c, px - 32, py - 9, 64, 18, 5);
      c.fill();
      c.stroke();
      c.fillStyle = '#ffd24a';
      c.font = 'bold 9px "M PLUS Rounded 1c", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(Game.i18n.t('cafeBuyPrompt'), px, py);
      c.textBaseline = 'alphabetic';
      c.restore();
    }
  }

  /* Tiny food icons drawn at the menu position. Mirrors the held-food
     options so the player sees what she's buying. */
  function drawCafeFoodIcon(c, food, x, y) {
    if (food === 'iceCream') {
      /* Cone */
      c.fillStyle = '#e0b070';
      c.beginPath();
      c.moveTo(x - 5, y + 6);
      c.lineTo(x + 5, y + 6);
      c.lineTo(x, y + 14);
      c.closePath();
      c.fill();
      c.strokeStyle = '#9a7048';
      c.lineWidth = 0.6;
      c.beginPath(); c.moveTo(x - 3, y + 7); c.lineTo(x + 3, y + 13); c.stroke();
      c.fillStyle = '#ffc8d4';
      c.beginPath(); c.arc(x, y + 4, 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ff3355';
      c.beginPath(); c.arc(x, y - 2, 1.6, 0, Math.PI * 2); c.fill();
    } else if (food === 'donut') {
      c.fillStyle = '#a8744a';
      c.beginPath(); c.ellipse(x, y + 6, 9, 5, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ff66cc';
      c.beginPath(); c.ellipse(x, y + 5, 8, 4, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffe9c8';
      c.beginPath(); c.arc(x, y + 5, 1.8, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffd24a';
      c.fillRect(x - 4, y + 3, 1, 1);
      c.fillStyle = '#88ddff';
      c.fillRect(x + 3, y + 4, 1, 1);
      c.fillStyle = '#fff';
      c.fillRect(x, y + 7, 1, 1);
    } else if (food === 'macaron') {
      c.fillStyle = '#ff8ab0';
      c.beginPath(); c.ellipse(x, y + 3, 7, 3, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffe9c8';
      c.fillRect(x - 6, y + 5, 12, 2);
      c.fillStyle = '#ff99cc';
      c.beginPath(); c.ellipse(x, y + 8, 7, 3, 0, 0, Math.PI * 2); c.fill();
    } else if (food === 'crepe') {
      c.fillStyle = '#e8c898';
      c.beginPath();
      c.moveTo(x - 7, y + 12);
      c.lineTo(x + 7, y + 12);
      c.lineTo(x, y - 4);
      c.closePath();
      c.fill();
      c.fillStyle = '#ffd9e8';
      c.beginPath();
      c.moveTo(x - 4, y - 2);
      c.lineTo(x + 4, y - 2);
      c.lineTo(x, y + 6);
      c.closePath();
      c.fill();
      c.fillStyle = '#cc4466';
      c.beginPath(); c.arc(x, y - 1, 1.4, 0, Math.PI * 2); c.fill();
    } else if (food === 'parfait') {
      /* Glass */
      c.strokeStyle = '#cdeaf4';
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(x - 5, y - 2);
      c.lineTo(x - 4, y + 12);
      c.lineTo(x + 4, y + 12);
      c.lineTo(x + 5, y - 2);
      c.stroke();
      c.fillStyle = '#cc4466';
      c.fillRect(x - 4, y + 3, 8, 4);
      c.fillStyle = '#ffd9e8';
      c.fillRect(x - 4, y, 8, 3);
      c.fillStyle = '#ffe9c8';
      c.beginPath(); c.arc(x, y - 2, 3, Math.PI, 0); c.fill();
      c.fillStyle = '#ff3366';
      c.beginPath(); c.arc(x, y - 4, 1, 0, Math.PI * 2); c.fill();
    } else if (food === 'taiyaki') {
      c.fillStyle = '#d8a064';
      c.beginPath();
      c.ellipse(x, y + 6, 8, 4, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#7a4818';
      c.beginPath(); c.arc(x - 4, y + 5, 0.6, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffe9c8';
      c.beginPath();
      c.moveTo(x + 6, y + 6);
      c.lineTo(x + 10, y + 4);
      c.lineTo(x + 10, y + 8);
      c.closePath();
      c.fill();
    } else if (food === 'onigiri') {
      c.fillStyle = '#fff';
      c.beginPath();
      c.moveTo(x - 7, y + 10);
      c.lineTo(x, y - 4);
      c.lineTo(x + 7, y + 10);
      c.closePath();
      c.fill();
      c.fillStyle = '#3a2010';
      c.fillRect(x - 5, y + 5, 10, 4);
    } else if (food === 'strawberry') {
      c.fillStyle = '#ff3366';
      c.beginPath();
      c.moveTo(x, y + 12);
      c.bezierCurveTo(x - 8, y + 10, x - 8, y - 2, x, y - 2);
      c.bezierCurveTo(x + 8, y - 2, x + 8, y + 10, x, y + 12);
      c.closePath();
      c.fill();
      c.fillStyle = '#ffd24a';
      c.beginPath(); c.arc(x - 2, y + 2, 0.6, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(x + 2, y + 5, 0.6, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(x, y + 8, 0.6, 0, Math.PI * 2); c.fill();
      /* Leaves */
      c.fillStyle = '#3a8a3a';
      c.beginPath();
      c.moveTo(x - 4, y - 1);
      c.lineTo(x, y - 5);
      c.lineTo(x + 4, y - 1);
      c.closePath();
      c.fill();
    }
  }

  /* ============================================================ */
  /*                  ONE-SHOT EXIT BUTTON                          */
  /* ============================================================ */
  /* Compact button rendered in the top-right corner of every interior
     scene (cafe, shop, house). One tap returns the player to the
     planet, no matter where they are in the room. */
  var EXIT_BTN = { x: W - 80, y: 8, w: 72, h: 30 };
  function drawExitButton(c) {
    drawButton(c, Game.i18n.t('exitButton') + ' ✕', EXIT_BTN.x, EXIT_BTN.y, EXIT_BTN.w, EXIT_BTN.h, false, 'danger');
  }
  function hitExitButton(mx, my) {
    return hitButton(mx, my, EXIT_BTN.x, EXIT_BTN.y, EXIT_BTN.w, EXIT_BTN.h);
  }

  function handleCafeInteriorClick(mx, my) {
    /* One-shot top-right EXIT button */
    if (hitExitButton(mx, my)) {
      Game.audio.play('select');
      return 'exit';
    }
    /* Exit door */
    if (hitButton(mx, my, W - 92, H - 152, 80, 122)) {
      Game.audio.play('select');
      return 'exit';
    }
    /* Tap a counter menu item to buy it directly. */
    for (var mi = 0; mi < CAFE_MENU.length; mi++) {
      var m = CAFE_MENU[mi];
      if (hitButton(mx, my, m.x - 28, m.y - 28, 56, 70)) {
        buyCafeItem(mi);
        return null;
      }
    }
    return null;
  }

  /* ============================================================ */
  /*                  STAR BAZAAR — shop interior                   */
  /* ============================================================ */
  /* The shop renders a grid of buyable furniture (one of each type from
     FURNITURE_TYPES). Tapping/clicking a tile adds it to Game.shop.cart;
     the cart is shown in the corner. The hero exits via the right-side
     door, then walks to a houseDoor — entering deposits the cart. */
  var shopTimer = 0;
  var shopFlashItem = null;
  var shopFlashTimer = 0;

  function startShopInterior() {
    shopTimer = 0;
    shopFlashItem = null;
    shopFlashTimer = 0;
  }

  function updateShopInterior(keys, jp) {
    shopTimer++;
    if (shopFlashTimer > 0) shopFlashTimer--;
    if (jp.action) return 'exit';
    return null;
  }

  function shopGrid() {
    /* Layout: 9 columns × 2 rows so all 18 furniture types fit between
       the banner (y < 70) and the lower cart/delivery panels (y > 370). */
    var cols = 9;
    var cellW = 76, cellH = 130;
    /* Left-aligned so the second row stops short of the exit door at
       W - 92 instead of sliding underneath it. */
    var startX = 20;
    var startY = 90;
    var positions = [];
    for (var i = 0; i < FURNITURE_TYPES.length; i++) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      positions.push({
        type: FURNITURE_TYPES[i],
        x: startX + col * cellW,
        y: startY + row * cellH,
        w: cellW,
        h: cellH,
      });
    }
    return positions;
  }

  function drawShopInterior(c) {
    shopTimer++;
    /* Warm gold/teal interior */
    var bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1a3a4a');
    bg.addColorStop(0.55, '#3aa8c4');
    bg.addColorStop(1, '#0a1a22');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    /* Star wallpaper */
    c.save();
    c.globalAlpha = 0.18;
    c.fillStyle = '#ffd24a';
    for (var ws = 0; ws < 50; ws++) {
      var wx = (ws * 67) % W;
      var wy = (ws * 41) % H;
      c.beginPath(); c.arc(wx, wy, 1.2, 0, Math.PI * 2); c.fill();
    }
    c.restore();
    drawRoomLight(c, 'shop', paintShopLight, true);
    /* Banner */
    c.fillStyle = '#0a1a22';
    c.fillRect(0, 0, W, 70);
    c.strokeStyle = '#ffd24a';
    c.lineWidth = 3;
    c.strokeRect(2, 2, W - 4, 66);
    c.fillStyle = '#ffd24a';
    c.font = 'bold 26px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'center';
    c.fillText('★ STAR BAZAAR ★', W / 2, 30);
    c.fillStyle = '#cdeaf4';
    c.font = '12px "M PLUS Rounded 1c", sans-serif';
    c.fillText(Game.i18n.t('shopHint'), W / 2, 52);
    /* Item grid */
    var grid = shopGrid();
    for (var gi = 0; gi < grid.length; gi++) {
      var g = grid[gi];
      /* Tile – the lit display cases are part of the cached room
         lighting; without it, a plain tile */
      if (!Game.FX || !Game.FX.bloom) {
        c.fillStyle = '#247088';
        c.strokeStyle = '#cdeaf4';
        c.lineWidth = 1.5;
        roundRect(c, g.x + 4, g.y + 4, g.w - 8, g.h - 8, 8);
        c.fill();
        c.stroke();
      }
      /* Furniture preview — drawn at palette scale */
      drawFurniture(c, g.type, g.x + g.w / 2, g.y + g.h / 2 + 4, 'palette');
      /* Label */
      c.fillStyle = '#ffe9c8';
      var label = Game.i18n.t('furniture_' + g.type) || g.type;
      fitFont(c, label, g.w - 14, 11, 'bold');
      c.textAlign = 'center';
      c.fillText(label, g.x + g.w / 2, g.y + g.h - 12);
      /* Flash highlight on the just-bought item */
      if (shopFlashItem === g.type && shopFlashTimer > 0) {
        c.save();
        c.globalAlpha = shopFlashTimer / 20;
        c.strokeStyle = '#ffd24a';
        c.lineWidth = 4;
        roundRect(c, g.x + 2, g.y + 2, g.w - 4, g.h - 4, 8);
        c.stroke();
        c.restore();
      }
    }
    /* Cart panel (lower-left) */
    var cartX = 12, cartY = H - 110, cartW = 220, cartH = 96;
    drawPanel(c, cartX, cartY, cartW, cartH, 10, '#ffd24a', 'rgba(22, 52, 66, 0.92)', 'rgba(8, 20, 28, 0.92)');
    c.fillStyle = '#ffd24a';
    c.font = 'bold 12px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'left';
    c.fillText(
      Game.i18n.t('shopCart') + ' ' +
        (Game.shop ? Game.shop.cart.length : 0) + '/' +
        (Game.shop ? Game.shop.MAX : 4),
      cartX + 10,
      cartY + 18
    );
    /* Cart icons */
    var cart = (Game.shop && Game.shop.cart) || [];
    for (var ci = 0; ci < cart.length; ci++) {
      var cixx = cartX + 24 + ci * 48;
      var ciyy = cartY + 60;
      c.fillStyle = '#1a3a4a';
      c.beginPath(); c.arc(cixx, ciyy, 20, 0, Math.PI * 2); c.fill();
      drawFurniture(c, cart[ci].type, cixx, ciyy + 4, 'palette');
    }
    if (cart.length === 0) {
      c.fillStyle = '#88aabb';
      fitFont(c, Game.i18n.t('shopCartEmpty'), cartW - 20, 11);
      c.textAlign = 'left';
      c.fillText(Game.i18n.t('shopCartEmpty'), cartX + 10, cartY + 56);
    }
    /* Delivery hint (lower-right) */
    var hintX = W - 280, hintY = H - 110;
    drawPanel(c, hintX, hintY, 270, 68, 10, '#ff66cc', 'rgba(22, 52, 66, 0.92)', 'rgba(8, 20, 28, 0.92)');
    c.fillStyle = '#ff99cc';
    c.font = 'bold 12px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'left';
    c.fillText(Game.i18n.t('shopDeliveryTitle'), hintX + 12, hintY + 18);
    c.fillStyle = '#ffe9c8';
    c.font = '11px "M PLUS Rounded 1c", sans-serif';
    var lines = (Game.i18n.t('shopDeliveryDesc') || '').split('\n');
    for (var ln = 0; ln < lines.length; ln++) {
      c.fillText(lines[ln], hintX + 12, hintY + 36 + ln * 14);
    }
    /* Exit door */
    c.fillStyle = '#3a2412';
    c.fillRect(W - 84, H - 220, 64, 110);
    c.fillStyle = '#aa5a32';
    c.fillRect(W - 80, H - 216, 56, 102);
    c.strokeStyle = '#5a3a22';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(W - 52, H - 212); c.lineTo(W - 52, H - 116); c.stroke();
    c.fillStyle = '#ffd24a';
    c.beginPath();
    c.arc(W - 36, H - 166, 3, 0, Math.PI * 2);
    c.fill();
    /* "Outside" sign */
    c.fillStyle = '#44ffff';
    c.fillRect(W - 92, H - 232, 80, 16);
    c.fillStyle = '#0a0420';
    c.font = 'bold 11px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'center';
    c.fillText(Game.i18n.t('furnitureExit'), W - 52, H - 221);
    /* One-shot top-right EXIT button */
    drawExitButton(c);
  }

  function handleShopInteriorClick(mx, my) {
    /* One-shot top-right EXIT button */
    if (hitExitButton(mx, my)) {
      Game.audio.play('select');
      return 'exit';
    }
    /* Exit door */
    if (hitButton(mx, my, W - 92, H - 232, 80, 122)) {
      Game.audio.play('select');
      return 'exit';
    }
    /* Item grid */
    var grid = shopGrid();
    for (var gi = 0; gi < grid.length; gi++) {
      var g = grid[gi];
      if (hitButton(mx, my, g.x + 4, g.y + 4, g.w - 8, g.h - 8)) {
        if (Game.shop && Game.shop.cart.length < Game.shop.MAX) {
          Game.shop.cart.push({ type: g.type });
          shopFlashItem = g.type;
          shopFlashTimer = 20;
          Game.audio.play('pickup');
        } else {
          Game.audio.play('select');
        }
        return null;
      }
    }
    return null;
  }

  /* Carry-overlay – bobbing icons of items in the cart, hovering above
     Momoko's head while she walks the world map. */
  function drawCarryOverlay(c, player, camX, camY) {
    if (!Game.shop || !Game.shop.cart || Game.shop.cart.length === 0) return;
    var bx = Math.round(player.x - camX) + (player.w || 28) / 2;
    /* rests on top of her helmet (she is painted 1.25x up from her feet) */
    var by = Math.round(player.y - camY) - 27;
    var t = Date.now() * 0.005;
    var bob = Math.sin(t * 2) * 2;
    /* Pillow under the items */
    c.save();
    c.globalAlpha = 0.55;
    c.fillStyle = '#000';
    c.beginPath();
    c.ellipse(bx, by + 14, 22, 4, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    /* Stack items */
    var items = Game.shop.cart;
    for (var i = 0; i < items.length; i++) {
      var ix = bx + (i - (items.length - 1) / 2) * 22;
      var iy = by + bob - i * 1.5;
      /* Halo behind each item */
      c.save();
      c.globalAlpha = 0.55;
      var halo = c.createRadialGradient(ix, iy, 2, ix, iy, 18);
      halo.addColorStop(0, 'rgba(255,232,140,0.8)');
      halo.addColorStop(1, 'rgba(255,232,140,0)');
      c.fillStyle = halo;
      c.beginPath(); c.arc(ix, iy, 18, 0, Math.PI * 2); c.fill();
      c.restore();
      drawFurniture(c, items[i].type, ix, iy, 'palette');
    }
  }

  /* ============================================================ */
  /*              TELESCOPE VIEW (cheese moon → home)               */
  /* ============================================================ */
  /* Looking through the telescope on the cheese moon: a round lens on
     Momoko's ringed home planet, with her town's little houses along the
     sunlit edge -- her pink house, and Lila's window twinkling. */
  var SCOPE_HOUSES = [
    { a: -2.5, c: '#6a4a9a', s: 1.2 },
    { a: -2.2, c: '#ff66b8', s: 1.7, home: true },
    { a: -1.88, c: '#5a88d8', s: 1.5, lila: true },
    { a: -1.6, c: '#7a5aaa', s: 1.25 },
  ];
  function drawTelescopeView(c) {
    var t = Date.now() * 0.001;
    var cx = W / 2, cy = 192, R = 156;
    c.save();
    c.fillStyle = '#07031a';
    c.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    /* Inside the lens */
    c.save();
    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.clip();
    drawSpaceBackdrop(c);
    var px = cx + 16 + Math.sin(t * 0.4) * 3, py = cy + 26 + Math.cos(t * 0.3) * 2, pr = 82;
    var glow = c.createRadialGradient(px, py, pr * 0.8, px, py, pr * 1.6);
    glow.addColorStop(0, 'rgba(255, 120, 200, 0.35)');
    glow.addColorStop(1, 'rgba(255, 120, 200, 0)');
    c.fillStyle = glow;
    c.beginPath(); c.arc(px, py, pr * 1.6, 0, Math.PI * 2); c.fill();
    drawShadedPlanet(c, px, py, pr, '#ffc0e4', '#8a2a80', '#ffd24a');
    /* The town along the sunlit limb */
    for (var i = 0; i < SCOPE_HOUSES.length; i++) {
      var hs = SCOPE_HOUSES[i];
      c.save();
      c.translate(px + Math.cos(hs.a) * (pr - 1), py + Math.sin(hs.a) * (pr - 1));
      c.rotate(hs.a + Math.PI / 2);
      c.scale(hs.s, hs.s);
      c.fillStyle = hs.c;
      c.strokeStyle = '#2a1450';
      c.lineWidth = 0.9;
      c.beginPath();
      c.moveTo(-6, 1); c.lineTo(-6, -8); c.arc(0, -8, 6, Math.PI, 0); c.lineTo(6, 1); c.closePath();
      c.fill(); c.stroke();
      var on = hs.lila ? 0.5 + 0.5 * Math.sin(t * 5) : 0.85;
      c.fillStyle = 'rgba(255, 230, 140, ' + on.toFixed(2) + ')';
      c.fillRect(-2.2, -7, 4.4, 3.6);
      if (hs.lila && on > 0.6) {
        c.fillStyle = 'rgba(255, 240, 180, 0.5)';
        c.beginPath(); c.arc(0, -5.2, 5 * on, 0, Math.PI * 2); c.fill();
      }
      if (hs.home) {
        c.fillStyle = '#ffd24a';
        c.beginPath(); c.arc(0, -15.5, 1.4, 0, Math.PI * 2); c.fill();
      }
      c.restore();
    }
    /* A tiny UFO drifting past, and a shooting star now and then */
    var ux = cx - R + ((t * 22) % (R * 2 + 60)) - 30, uy = cy - 92 + Math.sin(t * 1.3) * 5;
    c.fillStyle = '#bbcdd8';
    c.beginPath(); c.ellipse(ux, uy, 9, 2.4, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#88ddee';
    c.beginPath(); c.ellipse(ux, uy - 1, 4, 3, 0, Math.PI, 0); c.fill();
    var sp = (t * 0.25) % 1;
    if (sp < 0.12) {
      var sk = sp / 0.12;
      var ssx = cx + 110 - sk * 150, ssy = cy - 120 + sk * 60;
      c.strokeStyle = 'rgba(255, 255, 255, ' + (1 - sk).toFixed(2) + ')';
      c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(ssx, ssy); c.lineTo(ssx + 18, ssy - 7); c.stroke();
    }
    /* Lens: darker toward the edge, a curved glint up top */
    var lv = c.createRadialGradient(cx, cy, R * 0.6, cx, cy, R);
    lv.addColorStop(0, 'rgba(4, 0, 16, 0)');
    lv.addColorStop(1, 'rgba(4, 0, 16, 0.6)');
    c.fillStyle = lv;
    c.fillRect(cx - R, cy - R, R * 2, R * 2);
    c.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    c.lineWidth = 6;
    c.beginPath(); c.arc(cx, cy, R - 20, Math.PI * 1.1, Math.PI * 1.45); c.stroke();
    c.restore();
    /* Brass rim */
    var rg = c.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    rg.addColorStop(0, '#fff0b0');
    rg.addColorStop(0.4, '#e8b048');
    rg.addColorStop(1, '#8a5418');
    c.strokeStyle = rg;
    c.lineWidth = 14;
    c.beginPath(); c.arc(cx, cy, R + 6, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = '#3a2414';
    c.lineWidth = 2;
    c.beginPath(); c.arc(cx, cy, R + 13, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(cx, cy, R - 1, 0, Math.PI * 2); c.stroke();
    /* Caption card */
    var bw = 560, bh = 98, bx = (W - bw) / 2, by = 372;
    drawPanel(c, bx, by, bw, bh, 14, '#ffd24a', 'rgba(52, 22, 108, 0.96)', 'rgba(18, 8, 44, 0.96)');
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillStyle = '#ffd24a';
    c.font = 'bold 19px ' + FONT;
    c.fillText(Game.i18n.t('telescopeTitle'), W / 2, by + 26);
    c.fillStyle = '#f0e8ff';
    c.font = '14px ' + FONT;
    var tl = layoutLines(c, Game.i18n.t('telescopeText'), bw - 40);
    for (var li = 0; li < tl.length && li < 2; li++) c.fillText(tl[li], W / 2, by + 49 + li * 19);
    c.fillStyle = 'rgba(200, 184, 255, ' + (0.65 + Math.sin(t * 3) * 0.25).toFixed(2) + ')';
    c.font = '12px ' + FONT;
    c.fillText(Game.i18n.t('telescopeHint'), W / 2, by + bh - 10);
    c.restore();
  }

  /* ============================================================ */
  /*                         QUEST HUD                              */
  /* ============================================================ */
  function drawQuestHUD(c) {
    var q = Game.quests;
    if (!q) return;
    var rows = [];
    if (q.lila === 'inProgress') {
      rows.push({ text: Game.i18n.t('questLilaProgress') + ' ' + (q.progress.gems || 0) + '/5',
                  color: '#ff66cc', icon: '\u2605' });
    }
    if (q.migword === 'inProgress') {
      rows.push({ text: Game.i18n.t('questMigwordProgress') + ' ' + (q.progress.cheese || 0) + '/3',
                  color: '#ffd24a', icon: '\u2665' });
    }
    if (q.brie === 'inProgress') {
      var got = q.progress.crumbs || {}, nc = 0;
      for (var ck in got) if (got[ck]) nc++;
      rows.push({ text: nc >= 5 ? Game.i18n.t('questBrieReturn') : Game.i18n.t('questBrieProgress') + ' ' + nc + '/5',
                  color: '#ffb84a', icon: '\u25B2' });
    }
    var y = 38;
    c.save();
    c.font = 'bold 12px "M PLUS Rounded 1c", sans-serif';
    c.textBaseline = 'middle';
    for (var i = 0; i < rows.length; i++) {
      /* Dark pill so the text stays readable over bright planets (the
         cheese moon sits right behind it on level 2). */
      var tw = c.measureText(rows[i].text).width;
      var pw = tw + 34, ph = 22, px = W - 10 - pw;
      c.fillStyle = 'rgba(2, 0, 14, 0.4)';
      roundRect(c, px, y - ph / 2 + 2.5, pw, ph, 11);
      c.fill();
      var hg = c.createLinearGradient(0, y - ph / 2, 0, y + ph / 2);
      hg.addColorStop(0, 'rgba(58, 26, 116, 0.92)');
      hg.addColorStop(1, 'rgba(18, 8, 44, 0.92)');
      c.fillStyle = hg;
      roundRect(c, px, y - ph / 2, pw, ph, 11);
      c.fill();
      c.strokeStyle = hexAlpha(rows[i].color, 0.22);
      c.lineWidth = 5;
      c.stroke();
      c.strokeStyle = rows[i].color;
      c.lineWidth = 1.5;
      c.stroke();
      c.fillStyle = 'rgba(255, 255, 255, 0.14)';
      roundRect(c, px + 3, y - ph / 2 + 2, pw - 6, ph * 0.42, 6);
      c.fill();
      c.fillStyle = rows[i].color;
      c.textAlign = 'center';
      c.fillText(rows[i].icon, px + 13, y + 1);
      c.textAlign = 'left';
      c.fillText(rows[i].text, px + 24, y + 1);
      y += 28;
    }
    c.restore();
  }

  /* Canvas text doesn't trigger web-font downloads reliably (Safari), so
     ask for every weight we draw with, covering all game text. */
  if (document.fonts && document.fonts.load) {
    var sample = Game.i18n.allText();
    ['400', '700'].forEach(function (wgt) {
      document.fonts.load(wgt + ' 16px "M PLUS Rounded 1c"', sample).then(function () { panelSlot.key = ''; }).catch(function () {});
    });
  }

  window.Game.ui = {
    beginFrame: function () { anyHot = false; },
    setView: setView,
    drawShadedPlanet: drawShadedPlanet,
    paintNebula: paintNebula,
    isHot: function () { return anyHot; },
    drawTitleScreen: function (c) {
      /* The title clips itself to the viewport; pop that before the
         How-to card so its scrim can dim the whole tablet screen. */
      c.save();
      drawTitleScreen(c);
      c.restore();
      if (showInstructions) drawInstructionsOverlay(c);
    },
    drawPauseMenu: drawPauseMenu,
    drawDialogue: drawDialogue,
    drawQRCode: drawQRCode,
    drawGameOver: drawGameOver,
    drawVictory: drawVictory,
    drawCustomizeScreen: drawCustomizeScreen,
    drawIntroScreen: drawIntroScreen,
    drawBeachCutscene: drawBeachCutscene,
    startBeachCutscene: startBeachCutscene,
    updateBeach: updateBeach,
    handleTitleClick: handleTitleClick,
    handlePauseClick: handlePauseClick,
    handleGameOverClick: handleGameOverClick,
    handleVictoryClick: handleVictoryClick,
    handleCustomizeClick: handleCustomizeClick,
    handleIntroClick: handleIntroClick,
    handleBeachClick: handleBeachClick,
    isShowingInstructions: function () { return showInstructions; },
    /* Space re-theme additions */
    drawTravelMenu: drawTravelMenu,
    handleTravelMenuClick: handleTravelMenuClick,
    updateTravelMenu: updateTravelMenu,
    drawRocketAnim: drawRocketAnim,
    drawHouseInterior: drawHouseInterior,
    handleHouseInteriorClick: handleHouseInteriorClick,
    updateHouseInterior: updateHouseInterior,
    /* The moon village rooms reset each visit and keep no furniture. */
    startHouseInterior: function (id) { if (MOON_ROOMS[id]) startMoonRoom(id); },
    isMoonRoom: isMoonRoom,
    drawCafeInterior: drawCafeInterior,
    handleCafeInteriorClick: handleCafeInteriorClick,
    updateCafeInterior: updateCafeInterior,
    startCafeCutscene: startCafeCutscene,
    drawShopInterior: drawShopInterior,
    handleShopInteriorClick: handleShopInteriorClick,
    updateShopInterior: updateShopInterior,
    startShopInterior: startShopInterior,
    drawCarryOverlay: drawCarryOverlay,
    drawQuestHUD: drawQuestHUD,
    drawTelescopeView: drawTelescopeView,
    drawVersionStamp: drawVersionStamp,
    /* Momoko's feet in the room last drawn, and her arrival hop there
       (the door transition in engine.js). */
    heroPos: function () { return interiorHeroAt; },
    heroArrive: function () { if (interiorRig) interiorRig.doReact('arrive'); },
  };

  /* Version stamp in the bottom-right corner of the current view, so on
     a tablet menu it sits in the screen corner. */
  function drawViewStamp(c, color) {
    if (!Game.VERSION) return;
    c.save();
    c.fillStyle = color;
    c.font = '11px ' + FONT;
    c.textAlign = 'right';
    c.textBaseline = 'alphabetic';
    c.fillText(Game.VERSION + (Game.BUILD ? ' (' + Game.BUILD + ')' : ''),
      VIEW.x + VIEW.w - 8, VIEW.y + VIEW.h - 8);
    c.restore();
  }

  /* Reusable version stamp — same position + style as the title screen
     so you can tell at a glance which build is running during gameplay. */
  function drawVersionStamp(c) {
    if (!Game.VERSION) return;
    c.save();
    c.font = '11px "M PLUS Rounded 1c", sans-serif';
    c.textAlign = 'right';
    c.textBaseline = 'alphabetic';
    var stamp = Game.VERSION + (Game.BUILD ? ' (' + Game.BUILD + ')' : '');
    /* Dark halo so it stays readable on the bright Cheese Moon ground */
    c.lineJoin = 'round';
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(10, 4, 32, 0.55)';
    c.strokeText(stamp, W - 8, H - 8);
    c.fillStyle = '#9ab4d4';
    c.fillText(stamp, W - 8, H - 8);
    c.restore();
  }
})();
