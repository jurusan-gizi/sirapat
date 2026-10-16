/**
 * Pad tanda tangan sederhana – mendukung jari (HP), stylus, dan mouse.
 */
(function (root) {
  function TandaTangan(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    var drawing = false, last = null, lastMid = null, strokes = 0;
    var color = opts.color || '#0d2a6b';

    function resize() {
      var r = canvas.getBoundingClientRect();
      var dpr = Math.max(1, window.devicePixelRatio || 1);
      var data = strokes ? canvas.toDataURL() : null;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = color; ctx.fillStyle = color;
      if (data) { var im = new Image(); im.onload = function () { ctx.drawImage(im, 0, 0, r.width, r.height); }; im.src = data; }
    }
    function pos(e) {
      var r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure || 0.5 };
    }
    function width(p) { return 1.6 + 2.2 * (p.p > 0 && p.p !== 0.5 ? p.p : 0.55); }

    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      drawing = true; last = pos(e); lastMid = last;
      ctx.beginPath(); ctx.arc(last.x, last.y, width(last) / 2, 0, Math.PI * 2); ctx.fill();
      strokes++;
      if (opts.onChange) opts.onChange();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drawing) return;
      e.preventDefault();
      var p = pos(e);
      var mid = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
      ctx.lineWidth = width(p);
      ctx.beginPath(); ctx.moveTo(lastMid.x, lastMid.y);
      ctx.quadraticCurveTo(last.x, last.y, mid.x, mid.y); ctx.stroke();
      last = p; lastMid = mid;
    });
    function end() { drawing = false; }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', end);
    window.addEventListener('resize', resize);
    resize();

    return {
      clear: function () { strokes = 0; var r = canvas.getBoundingClientRect(); ctx.clearRect(0, 0, r.width, r.height); if (opts.onChange) opts.onChange(); },
      isEmpty: function () { return strokes === 0; },
      /** PNG transparan, dipangkas ke area coretan, rasio 5:2 (cocok untuk tabel daftar hadir). */
      toPNG: function () {
        var w = canvas.width, h = canvas.height;
        var d = ctx.getImageData(0, 0, w, h).data;
        var minX = w, minY = h, maxX = -1, maxY = -1;
        for (var y = 0; y < h; y += 2) for (var x = 0; x < w; x += 2) {
          if (d[(y * w + x) * 4 + 3] > 10) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
        }
        if (maxX < 0) return null;
        var pad = 12; minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
        maxX = Math.min(w, maxX + pad); maxY = Math.min(h, maxY + pad);
        var bw = maxX - minX, bh = maxY - minY;
        var OW = 500, OH = 200, s = Math.min(OW / bw, OH / bh);
        var out = document.createElement('canvas'); out.width = OW; out.height = OH;
        out.getContext('2d').drawImage(canvas, minX, minY, bw, bh, (OW - bw * s) / 2, (OH - bh * s) / 2, bw * s, bh * s);
        return out.toDataURL('image/png');
      }
    };
  }
  root.TandaTangan = TandaTangan;
})(this);
