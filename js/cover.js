/**
 * Gambar pendukung laporan (SVG, dirender ke PNG):
 *  - coverSvg()  : latar sampul A4 (1240 x 1754 px ≈ 150 dpi), warna Kemenkes.
 *  - grafikSvg() : diagram batang status RTL untuk Laporan Evaluasi.
 * Teks sampul ditulis di Word (bisa diedit) di atas gambar ini.
 */
(function (root) {
  var W = 1240, H = 1754;
  var WARNA = { dark: '#00615C', dark2: '#003F3C', mid: '#00B5AD', lime: '#C9DA2B' };

  function coverSvg(t) {
    t = Object.assign({}, WARNA, t || {});
    var y = function (f) { return Math.round(H * f); };
    var mm = function (v) { return Math.round(v * W / 210); };

    var dots = '';
    for (var r = 0; r < 6; r++) for (var c = 0; c < 9; c++) {
      dots += '<circle cx="' + (mm(132) + c * 26) + '" cy="' + (mm(14) + r * 26) +
        '" r="3.2" fill="#ffffff" fill-opacity="0.18"/>';
    }
    var rings = '';
    [90, 150, 210, 270, 330].forEach(function (rr, i) {
      rings += '<circle cx="' + (W - 40) + '" cy="' + mm(22) + '" r="' + rr +
        '" fill="none" stroke="#ffffff" stroke-opacity="' + (0.10 - i * 0.015).toFixed(3) + '" stroke-width="2"/>';
    });
    var lines = '';
    for (var i = -8; i < 30; i++) {
      lines += '<line x1="' + (i * 60) + '" y1="' + H + '" x2="' + (i * 60 + 260) + '" y2="' + y(0.80) +
        '" stroke="#ffffff" stroke-opacity="0.035" stroke-width="18"/>';
    }

    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
      '" viewBox="0 0 ' + W + ' ' + H + '">' +
      '<defs>' +
      '<linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="' + t.dark + '"/><stop offset="1" stop-color="' + t.dark2 + '"/></linearGradient>' +
      '<radialGradient id="g2" cx="0.5" cy="0.5" r="0.5">' +
      '<stop offset="0" stop-color="' + t.mid + '" stop-opacity="0.13"/>' +
      '<stop offset="1" stop-color="' + t.mid + '" stop-opacity="0"/></radialGradient>' +
      '</defs>' +
      '<rect width="' + W + '" height="' + H + '" fill="url(#g1)"/>' +
      rings + dots + lines +
      '<rect x="' + mm(20) + '" y="' + mm(21) + '" width="' + mm(16) + '" height="' + mm(1.4) + '" fill="' + t.lime + '"/>' +
      '<polygon points="0,' + (y(0.40) - 16) + ' ' + W + ',' + (y(0.33) - 16) + ' ' + W + ',' + y(0.33) + ' 0,' + y(0.40) + '" fill="' + t.lime + '"/>' +
      '<polygon points="0,' + y(0.40) + ' ' + W + ',' + y(0.33) + ' ' + W + ',' + y(0.80) + ' 0,' + y(0.86) + '" fill="#ffffff"/>' +
      '<polygon points="0,' + y(0.86) + ' ' + W + ',' + y(0.80) + ' ' + W + ',' + (y(0.80) + 12) + ' 0,' + (y(0.86) + 12) + '" fill="' + t.mid + '"/>' +
      // cahaya lembut di belakang logo
      '<ellipse cx="' + (W / 2) + '" cy="' + mm(150) + '" rx="' + mm(80) + '" ry="' + mm(40) + '" fill="url(#g2)"/>' +
      '<rect x="' + (W / 2 - mm(25)) + '" y="' + mm(181) + '" width="' + mm(50) + '" height="3" fill="' + t.mid + '"/>' +
      '</svg>';
  }

  /** Diagram batang horizontal jumlah RTL per status. data: [{label, nilai, warna}] */
  function grafikSvg(data, judul) {
    var GW = 1200, rowH = 74, top = judul ? 70 : 20, left = 250, right = 120;
    var GH = top + data.length * rowH + 20;
    var max = Math.max.apply(null, data.map(function (d) { return d.nilai; }).concat([1]));
    var total = data.reduce(function (a, d) { return a + d.nilai; }, 0) || 1;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + GW + '" height="' + GH + '" viewBox="0 0 ' + GW + ' ' + GH + '">' +
      '<rect width="' + GW + '" height="' + GH + '" fill="#ffffff"/>';
    if (judul) s += '<text x="20" y="44" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="bold" fill="#1d2b2e">' + esc(judul) + '</text>';
    data.forEach(function (d, i) {
      var yy = top + i * rowH;
      var w = Math.round((GW - left - right) * d.nilai / max);
      s += '<text x="' + (left - 20) + '" y="' + (yy + 42) + '" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#33474b">' + esc(d.label) + '</text>' +
        '<rect x="' + left + '" y="' + (yy + 12) + '" width="' + (GW - left - right) + '" height="44" rx="8" fill="#EEF3F3"/>' +
        (w > 0 ? '<rect x="' + left + '" y="' + (yy + 12) + '" width="' + Math.max(w, 16) + '" height="44" rx="8" fill="' + d.warna + '"/>' : '') +
        '<text x="' + (left + Math.max(w, 16) + 14) + '" y="' + (yy + 44) + '" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="bold" fill="#1d2b2e">' +
        d.nilai + ' (' + Math.round(d.nilai * 100 / total) + '%)</text>';
    });
    return { svg: s + '</svg>', w: GW, h: GH };
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var api = { coverSvg: coverSvg, grafikSvg: grafikSvg, COVER_W: W, COVER_H: H, WARNA: WARNA };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Cover = api;
})(this);
