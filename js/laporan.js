/**
 * Generator laporan Word (.docx) – dipakai di browser (window.docx) dan Node (require('docx')).
 *
 *  buildLaporan(docx, data, assets)          -> Laporan Kegiatan
 *  buildLaporanEvaluasi(docx, data, assets)  -> Laporan Evaluasi Tindak Lanjut (RTL)
 *
 * assets: {
 *   logo: Uint8Array (emblem persegi), logoH: Uint8Array (logo horizontal), logoHRatio: tinggi/lebar,
 *   ikon: { pin, phone, web } (PNG kecil untuk kop), coverBg: Uint8Array, grafik: {data,w,h} (opsional),
 *   institusi: {...}, b64: fn(base64) -> Uint8Array
 * }
 */
(function (root) {
  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus',
    'September', 'Oktober', 'November', 'Desember'];
  var HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var STATUS = ['Selesai', 'Proses', 'Belum', 'Tidak relevan'];
  var STATUS_WARNA = { 'Selesai': '1E8E5A', 'Proses': 'D99A00', 'Belum': 'C0392B', 'Tidak relevan': '8A9A9D', '': 'B0B0B0' };

  function parseTgl(s) {
    var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function tglPanjang(s, denganHari) {
    var d = parseTgl(s);
    if (!d) return s || '-';
    return (denganHari ? HARI[d.getDay()] + ', ' : '') + d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear();
  }
  function arr(x) { return Array.isArray(x) ? x : (x ? [x] : []); }

  /** Ringkasan evaluasi: jumlah per status, rata-rata capaian, daftar item rata. */
  function ringkasEvaluasi(ev) {
    var items = [];
    (ev && ev.sumber || []).forEach(function (s) {
      s.items.forEach(function (it) { items.push({ rapat: s.kegiatan, rtl: it.rtl, ev: it.ev || {} }); });
    });
    var per = {}; STATUS.concat(['']).forEach(function (st) { per[st] = 0; });
    var sum = 0, n = 0;
    items.forEach(function (it) {
      var st = it.ev.status || '';
      per[st] = (per[st] || 0) + 1;
      if (st && st !== 'Tidak relevan') { sum += Number(it.ev.capaian) || 0; n++; }
    });
    var relevan = items.length - per['Tidak relevan'];
    return {
      items: items, total: items.length, per: per, relevan: relevan,
      persenSelesai: relevan ? Math.round(per['Selesai'] * 100 / relevan) : 0,
      rataCapaian: n ? Math.round(sum / n) : 0
    };
  }
  function kategori(p) {
    return p >= 90 ? 'sangat baik' : p >= 75 ? 'baik' : p >= 50 ? 'cukup' : 'kurang';
  }

  // =====================================================================
  //  KIT: helper bersama untuk kedua laporan
  // =====================================================================
  function kit(D, assets) {
    var ins = assets.institusi || {};
    var K = {};
    var FONT = 'Times New Roman', SANS = 'Arial', KOP = 'Segoe UI';
    var C = D.AlignmentType.CENTER, J = D.AlignmentType.JUSTIFIED;
    K.TEAL = '00615C'; K.TEAL2 = '00B5AD'; K.LIME = 'C9DA2B'; K.KOPTEAL = '00A99D';
    K.FONT = FONT; K.SANS = SANS; K.C = C; K.J = J;
    var mmT = K.mmT = function (v) { return Math.round(v * 56.6929); };
    var mmE = function (v) { return Math.round(v * 36000); };
    var mmPx = K.mmPx = function (v) { return Math.round(v * 96 / 25.4); };
    var CW = K.CW = mmT(140);
    var numInstance = 0;
    K.toc = [];

    // ---- perkiraan halaman untuk daftar isi (Word memperbarui saat dibuka) ----
    var LPP = 38, CPL = 74, est = { page: 1, line: 0, first: true };
    function addLines(n) { est.line += n; while (est.line > LPP) { est.page++; est.line -= LPP; } }
    K.addLines = addLines;
    K.addMm = function (mm) { addLines(mm / 7); };

    var run = K.run = function (text, o) { return new D.TextRun(Object.assign({ text: String(text == null ? '' : text) }, o || {})); };
    var para = K.para = function (children, o) {
      if (typeof children === 'string') children = [run(children)];
      o = Object.assign({}, o || {});
      o.spacing = Object.assign({ line: 360 }, o.spacing || {});
      if (!o.spacing.lineRule) o.spacing.lineRule = D.LineRuleType.AUTO;
      return new D.Paragraph(Object.assign({ children: children }, o));
    };
    K.kosong = function (n) {
      var a = []; for (var i = 0; i < (n || 1); i++) a.push(para('', { spacing: { after: 0, line: 240 } }));
      addLines((n || 1) * 0.7); return a;
    };
    K.bab = function (title, halTetap) {
      if (halTetap) { K.toc.push({ title: title, level: 1, page: halTetap }); }
      else {
        if (est.first) est.page = 1; else est.page++;
        est.first = false; est.line = 3;
        K.toc.push({ title: title, level: 1, page: est.page });
      }
      return para([run(title)], { heading: D.HeadingLevel.HEADING_1 });
    };
    K.subbab = function (title) {
      if (est.line + 4 > LPP) { est.page++; est.line = 0; }
      K.toc.push({ title: title, level: 2, page: est.page }); addLines(2);
      return para([run(title)], { heading: D.HeadingLevel.HEADING_2 });
    };
    K.belumDiisi = function () {
      addLines(1.4);
      return [para([run('(belum diisi)', { italics: true, color: '888888' })], { indent: { left: mmT(6) } })];
    };
    K.paragraf = function (t, o) {
      addLines(Math.ceil(String(t).length / CPL) + 0.4);
      return para(typeof t === 'string' ? [run(t)] : t, Object.assign({ alignment: J, indent: { firstLine: mmT(12.5) } }, o || {}));
    };
    /** Teks bebas → paragraf; baris "1. " = daftar bernomor, "- " = poin. */
    var teks = K.teks = function (t, o) {
      o = o || {};
      var lines = String(t || '').replace(/\r/g, '').split('\n');
      var out = [], last = null, inst = 0;
      lines.forEach(function (ln) {
        var s = ln.trim();
        if (!s) { last = null; return; }
        var mB = s.match(/^[-•*–]\s+(.*)$/), mN = s.match(/^(\d+)[.)]\s+(.*)$/);
        addLines(Math.ceil(s.length / (CPL - 6)) + 0.4);
        if (mB) {
          out.push(para([run(mB[1])], { numbering: { reference: 'poin', level: 0 }, alignment: J })); last = 'b';
        } else if (mN) {
          if (last !== 'n') inst = ++numInstance;
          out.push(para([run(mN[2])], { numbering: { reference: 'angka', level: 0, instance: inst }, alignment: J })); last = 'n';
        } else {
          out.push(para([run(s)], { alignment: J, indent: o.noIndent ? undefined : { firstLine: mmT(12.5) } })); last = null;
        }
      });
      return out.length ? out : (o.fallback ? teks(o.fallback, { noIndent: o.noIndent }) : K.belumDiisi());
    };

    // ---- tabel ----
    var NB = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    K.NOBORDER = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };
    var LN = { style: D.BorderStyle.SINGLE, size: 4, color: '555555' };
    K.BORDER = { top: LN, bottom: LN, left: LN, right: LN, insideHorizontal: LN, insideVertical: LN };
    var cell = K.cell = function (children, w, o) {
      o = o || {};
      if (!Array.isArray(children)) children = [children];
      children = children.map(function (c) { return typeof c === 'string' ? para(c, { spacing: { after: 0, line: 264 } }) : c; });
      return new D.TableCell(Object.assign({
        children: children, width: { size: w, type: D.WidthType.DXA },
        margins: { top: 60, bottom: 60, left: 100, right: 100 }, verticalAlign: D.VerticalAlign.CENTER
      }, o));
    };
    var table = K.table = function (widths, rows, borders) {
      return new D.Table({ width: { size: widths.reduce(function (a, b) { return a + b; }, 0), type: D.WidthType.DXA },
        columnWidths: widths, borders: borders || K.BORDER, rows: rows });
    };
    K.headCell = function (t, w) {
      return cell(para([run(t, { bold: true, color: 'FFFFFF', size: 21 })], { alignment: C, spacing: { after: 0, line: 252 } }), w,
        { shading: { type: D.ShadingType.CLEAR, color: 'auto', fill: K.TEAL } });
    };
    K.small = function (t, o) { return para([run(t, Object.assign({ size: 21 }, o || {}))], { spacing: { after: 0, line: 252 } }); };
    /** Tabel label : nilai tanpa garis. */
    K.info = function (pairs, w1) {
      addLines(pairs.length * 1.1);
      w1 = w1 || mmT(38);
      return table([w1, mmT(4), CW - w1 - mmT(4)], pairs.map(function (r) {
        return new D.TableRow({ children: [cell(r[0], w1, { margins: { top: 20, bottom: 20, left: 0, right: 60 } }),
          cell(':', mmT(4), { margins: { top: 20, bottom: 20, left: 0, right: 0 } }),
          cell(r[1], CW - w1 - mmT(4), { margins: { top: 20, bottom: 20, left: 60, right: 60 } })] });
      }), K.NOBORDER);
    };
    var img = K.img = function (bytes, wmm, hmm, type) {
      return new D.ImageRun({ type: type || 'png', data: bytes, transformation: { width: mmPx(wmm), height: mmPx(hmm) } });
    };

    // ---- kop surat (sesuai kop resmi) ----
    K.kop = function () {
      addLines(8);
      var wL = mmT(64), wR = CW - wL;
      var ratio = assets.logoHRatio || 0.27;
      var gray = '4A4A4A';
      var kp = function (children, o) {
        return para(children, Object.assign({ spacing: { after: 0, line: 228 } }, o || {}));
      };
      var ikon = function (k) {
        return assets.ikon && assets.ikon[k] ? [img(assets.ikon[k], 2.6, 2.6), run('  ', { size: 14 })] : [];
      };
      var right = [kp([run(ins.kementerian || 'Kementerian Kesehatan', { font: KOP, bold: true, size: 26, color: K.KOPTEAL })], { spacing: { after: 20, line: 240 } })];
      arr(ins.direktorat).forEach(function (l) { right.push(kp([run(l, { font: KOP, bold: true, size: 19, color: gray })])); });
      right.push(kp([run(ins.nama || 'Politeknik Kesehatan Makassar', { font: KOP, size: 20, color: gray })], { spacing: { after: 30, line: 228 } }));
      arr(ins.alamat).forEach(function (l, i) {
        right.push(kp((i === 0 ? ikon('pin') : [run('', { size: 14 })]).concat([run(l, { font: KOP, size: 14, color: gray })]),
          i === 0 ? {} : { indent: { left: mmT(3.6) } }));
      });
      if (ins.telepon) right.push(kp(ikon('phone').concat([run(ins.telepon, { font: KOP, size: 14, color: gray })])));
      if (ins.website) right.push(kp(ikon('web').concat([run(ins.website, { font: KOP, size: 14, color: gray })])));
      var left = assets.logoH
        ? para([img(assets.logoH, 50, 50 * ratio)], { alignment: C, spacing: { after: 0 } })
        : para([img(assets.logo, 22, 22)], { alignment: C, spacing: { after: 0 } });
      return [
        table([wL, wR], [new D.TableRow({ children: [cell(left, wL), cell(right, wR, { margins: { top: 0, bottom: 0, left: 60, right: 0 } })] })], K.NOBORDER),
        para('', { spacing: { after: 240, line: 160 } })
      ];
    };

    // ---- blok tanda tangan ----
    K.blokTtd = function (kiri, kanan, tanggalBaris) {
      addLines(9);
      function kol(x) {
        var a = [];
        if (x.atas !== undefined) a.push(para(x.atas || ' ', { alignment: C, spacing: { after: 0 } }));
        a.push(para(x.label || '', { alignment: C, spacing: { after: 0 } }));
        for (var i = 0; i < 4; i++) a.push(para('', { spacing: { after: 0, line: 240 } }));
        a.push(para([run(x.nama || '..............................', { bold: true, underline: {} })], { alignment: C, spacing: { after: 0 } }));
        if (x.nip) a.push(para('NIP. ' + x.nip, { alignment: C, spacing: { after: 0 } }));
        return a;
      }
      var half = CW / 2;
      // satu baris tabel yang tidak boleh terpotong halaman (tanggal + tanda tangan tetap menyatu)
      var tgl = function () { return tanggalBaris ? [para(tanggalBaris, { alignment: C, spacing: { after: 0 } })] : []; };
      var spasi = function () { return tanggalBaris ? [para('\u00A0', { spacing: { after: 0 } })] : []; };
      var kiriIsi = spasi().concat(kiri ? kol(kiri) : []);
      var kananIsi = tgl().concat(kanan ? kol(kanan) : []);
      return table([half, half], [new D.TableRow({ cantSplit: true, children: [
        cell(kiriIsi.length ? kiriIsi : '', half, { verticalAlign: D.VerticalAlign.TOP }),
        cell(kananIsi.length ? kananIsi : '', half, { verticalAlign: D.VerticalAlign.TOP })] })], K.NOBORDER);
    };

    // ---- sampul ----
    K.sampul = function (o) {
      var judul = o.judul || 'Judul Kegiatan';
      var size = judul.length > 140 ? 34 : judul.length > 90 ? 42 : judul.length > 50 ? 50 : 58;
      var frame = function (x, y, w, h) {
        return { type: 'absolute', position: { x: mmT(x), y: mmT(y) }, width: mmT(w), height: mmT(h),
          anchor: { horizontal: D.FrameAnchorType.PAGE, vertical: D.FrameAnchorType.PAGE },
          rule: D.HeightRule.EXACT, wrap: D.FrameWrap.NONE };
      };
      var floatImg = function (bytes, x, y, w, h, behind) {
        return new D.ImageRun({ type: 'png', data: bytes, transformation: { width: mmPx(w), height: mmPx(h) },
          floating: { horizontalPosition: { relative: D.HorizontalPositionRelativeFrom.PAGE, offset: mmE(x) },
            verticalPosition: { relative: D.VerticalPositionRelativeFrom.PAGE, offset: mmE(y) },
            behindDocument: !!behind, allowOverlap: true, zIndex: behind ? 0 : 5, wrap: { type: D.TextWrappingType.NONE } } });
      };
      var logoImg = assets.logoH
        ? floatImg(assets.logoH, 45, 150 - 60 * (assets.logoHRatio || 0.27), 120, 120 * (assets.logoHRatio || 0.27))
        : floatImg(assets.logo, 83, 128, 44, 44);
      var detail = [run(o.labelPenyelenggara || 'Diselenggarakan oleh', { font: SANS, size: 18, color: '6B7C80' }),
        run(o.penyelenggara || ins.nama || '-', { font: SANS, size: 24, bold: true, color: K.TEAL, break: 1 })];
      arr(o.baris).forEach(function (b, i) { detail.push(run(b, { font: SANS, size: 22, color: '333333', break: i === 0 ? 2 : 1 })); });
      return [
        para([floatImg(assets.coverBg, 0, 0, 210, 297, true), logoImg], { spacing: { after: 0, line: 240 } }),
        para([run(o.kicker, { font: SANS, size: 24, bold: true, color: K.LIME, characterSpacing: 60 })],
          { frame: frame(20, 25, 170, 10), spacing: { after: 0, line: 240 } }),
        para([run(judul.toUpperCase(), { font: SANS, size: size, bold: true, color: 'FFFFFF' })],
          { frame: frame(20, 37, 160, 52), spacing: { after: 0, line: Math.round(size * 12), lineRule: D.LineRuleType.EXACT } }),
        para(detail, { frame: frame(20, 186, 170, 42), alignment: C, spacing: { after: 0, line: 264 } }),
        para([
          run((ins.nama || 'Politeknik Kesehatan Makassar').toUpperCase(), { font: SANS, size: 26, bold: true, color: 'FFFFFF' }),
          run((ins.kementerian || 'Kementerian Kesehatan').toUpperCase(), { font: SANS, size: 18, color: 'CFEDEA', break: 1 }),
          run(String(o.tahun), { font: SANS, size: 32, bold: true, color: K.LIME, break: 2 })
        ], { frame: frame(20, 262, 170, 28), alignment: C, spacing: { after: 0, line: 252 } })
      ];
    };

    K.daftarIsi = function () {
      return [
        para([run('DAFTAR ISI', { bold: true, size: 28 })], { alignment: C, spacing: { after: 360 }, pageBreakBefore: true }),
        new D.TableOfContents('Daftar Isi', { hyperlink: true, headingStyleRange: '1-2', cachedEntries: K.toc })
      ];
    };

    /** Rakit dokumen: sampul, halaman awal (romawi), isi (angka). */
    K.dokumen = function (o) {
      var pageA4 = { size: { width: mmT(210), height: mmT(297) },
        margin: { top: mmT(30), bottom: mmT(30), left: mmT(40), right: mmT(30), header: mmT(12), footer: mmT(12) } };
      var footerNo = function () {
        return new D.Footer({ children: [para([new D.TextRun({ children: [D.PageNumber.CURRENT], size: 22 })], { alignment: C, spacing: { after: 0 } })] });
      };
      var header = new D.Header({ children: [para([run(o.header, { size: 16, italics: true, color: '777777' })],
        { alignment: D.AlignmentType.RIGHT, spacing: { after: 0 },
          border: { bottom: { style: D.BorderStyle.SINGLE, size: 4, color: K.TEAL2, space: 2 } } })] });
      return new D.Document({
        creator: ins.nama || 'SIRAPAT', title: o.title, features: { updateFields: true },
        styles: {
          default: { document: { run: { font: FONT, size: 24 }, paragraph: { spacing: { line: 360, lineRule: D.LineRuleType.AUTO, after: 120 } } } },
          paragraphStyles: [
            { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
              run: { font: FONT, size: 28, bold: true, color: '000000' },
              paragraph: { alignment: C, spacing: { before: 0, after: 360 }, pageBreakBefore: true, outlineLevel: 0, keepNext: true } },
            { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
              run: { font: FONT, size: 24, bold: true, color: '000000' },
              paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 1, keepNext: true } },
            { id: 'TOC2', name: 'toc 2', basedOn: 'Normal', next: 'Normal', paragraph: { indent: { left: mmT(6) } } }
          ]
        },
        numbering: { config: [
          { reference: 'poin', levels: [{ level: 0, format: D.LevelFormat.BULLET, text: '•', alignment: D.AlignmentType.LEFT,
            style: { paragraph: { indent: { left: mmT(10), hanging: mmT(5) } } } }] },
          { reference: 'angka', levels: [{ level: 0, format: D.LevelFormat.DECIMAL, text: '%1.', alignment: D.AlignmentType.LEFT,
            style: { paragraph: { indent: { left: mmT(10), hanging: mmT(6) } } } }] }
        ] },
        sections: [
          { properties: { page: { size: pageA4.size, margin: { top: 0, bottom: 0, left: 0, right: 0, header: 0, footer: 0 } } }, children: o.sampul },
          { properties: { page: Object.assign({}, pageA4, { pageNumbers: { start: 1, formatType: D.NumberFormat.LOWER_ROMAN } }) },
            footers: { default: footerNo() }, children: o.awal },
          { properties: { page: Object.assign({}, pageA4, { pageNumbers: { start: 1, formatType: D.NumberFormat.DECIMAL } }) },
            headers: { default: header }, footers: { default: footerNo() }, children: o.isi }
        ]
      });
    };

    /** Tabel RTL (penetapan). */
    K.tabelRtl = function (rtl) {
      var w = [mmT(9), mmT(55), mmT(28), mmT(22), CW - mmT(114)];
      var rows = [new D.TableRow({ tableHeader: true, children: [K.headCell('No', w[0]), K.headCell('Rencana Tindak Lanjut', w[1]),
        K.headCell('Penanggung Jawab', w[2]), K.headCell('Tenggat', w[3]), K.headCell('Target / Indikator', w[4])] })];
      rtl.forEach(function (r, i) {
        var u = [K.small(r.uraian)];
        if (r.asalJudul) u.push(K.small('(lanjutan dari ' + r.asalJudul + ')', { italics: true, size: 18, color: '666666' }));
        rows.push(new D.TableRow({ cantSplit: true, children: [
          cell(para(String(i + 1), { alignment: C, spacing: { after: 0 } }), w[0]), cell(u, w[1]),
          cell(K.small(r.pj || '-'), w[2]), cell(K.small(r.tenggat ? tglPanjang(r.tenggat) : '-'), w[3]), cell(K.small(r.target || '-'), w[4])] }));
      });
      addLines(2 + rtl.length * 2.6);
      return table(w, rows);
    };

    /** Tabel ringkas hasil evaluasi RTL. */
    K.tabelEvaluasi = function (items, lengkap) {
      var w = lengkap ? [mmT(9), mmT(57), mmT(26), mmT(24), CW - mmT(116)] : [mmT(9), mmT(71), mmT(30), CW - mmT(110)];
      var head = lengkap ? ['No', 'RTL & Target', 'PJ / Tenggat', 'Status', 'Capaian'] : ['No', 'Rencana Tindak Lanjut', 'Status', 'Capaian'];
      var rows = [new D.TableRow({ tableHeader: true, children: head.map(function (h, i) { return K.headCell(h, w[i]); }) })];
      items.forEach(function (it, i) {
        var ev = it.ev || {}, st = ev.status || 'Belum dievaluasi';
        var stCell = cell(para([run(st, { bold: true, size: 20, color: STATUS_WARNA[ev.status || ''] })], { alignment: C, spacing: { after: 0, line: 252 } }),
          lengkap ? w[3] : w[2]);
        var cap = cell(para(ev.status && ev.status !== 'Tidak relevan' ? (ev.capaian || 0) + '%' : '-', { alignment: C, spacing: { after: 0 } }), w[w.length - 1]);
        var rtlCell = [K.small(it.rtl.uraian)];
        if (lengkap) {
          if (it.rtl.target) rtlCell.push(K.small('Target: ' + it.rtl.target, { size: 18, color: '555555' }));
          if (ev.bukti) rtlCell.push(K.small('Bukti: ' + ev.bukti, { size: 18, color: '1F5F9F' }));
          if (ev.buktiFiles && ev.buktiFiles.length) rtlCell.push(K.small('Lampiran bukti: ' + ev.buktiFiles.map(function (f) { return f.nama; }).join(', '), { size: 18, color: '555555' }));
        }
        var c = [cell(para(String(i + 1), { alignment: C, spacing: { after: 0 } }), w[0]), cell(rtlCell, w[1])];
        if (lengkap) c.push(cell([K.small(it.rtl.pj || '-'), K.small(it.rtl.tenggat ? tglPanjang(it.rtl.tenggat) : '', { size: 18, color: '555555' })], w[2]));
        c.push(stCell, cap);
        rows.push(new D.TableRow({ cantSplit: true, children: c }));
      });
      addLines(2 + items.length * (lengkap ? 3.4 : 2.2));
      return table(w, rows);
    };
    return K;
  }

  // =====================================================================
  //  LAPORAN KEGIATAN
  // =====================================================================
  function buildLaporan(D, data, assets) {
    var K = kit(D, assets);
    var run = K.run, para = K.para, cell = K.cell, C = K.C, mmT = K.mmT, CW = K.CW;
    var k = data.kegiatan || {}, n = data.notulen || {}, hadir = data.hadir || [], foto = data.foto || [];
    var rtl = data.rtl || [];
    var ins = assets.institusi || {}, b64 = assets.b64, kota = ins.kota || 'Makassar';
    var judul = k.judul || 'Judul Kegiatan';
    var tahun = (parseTgl(k.tanggal) || new Date()).getFullYear();
    var tglTtd = kota + ', ' + tglPanjang(k.tanggal);
    var waktu = [k.waktuMulai, k.waktuSelesai].filter(Boolean).join(' – ');
    if (waktu) waktu += ' WITA';
    var pimpinan = { label: n.jabatanPimpinan || 'Pimpinan Rapat', nama: n.pimpinanRapat, nip: n.nipPimpinan };
    var notulis = { label: 'Notulis', nama: n.notulis, nip: n.nipNotulis };
    var ringkas = data.evaluasi ? ringkasEvaluasi(data.evaluasi) : null;

    var sampul = K.sampul({ kicker: 'LAPORAN ' + (k.jenis ? k.jenis.toUpperCase() : 'KEGIATAN'), judul: judul,
      penyelenggara: k.penyelenggara, baris: [tglPanjang(k.tanggal, true), k.tempat || ''], tahun: tahun });

    // ---- halaman awal ----
    var awal = [para([run('LEMBAR PENGESAHAN', { bold: true, size: 28 })], { alignment: C, spacing: { after: 360 } })];
    awal.push(K.info([['Judul Kegiatan', judul], ['Jenis Kegiatan', k.jenis || '-'], ['Hari / Tanggal', tglPanjang(k.tanggal, true)],
      ['Waktu', waktu || '-'], ['Tempat', k.tempat || '-'], ['Penyelenggara', k.penyelenggara || '-'], ['Jumlah Peserta', hadir.length + ' orang']], mmT(40)));
    awal = awal.concat(K.kosong(2));
    awal.push(K.blokTtd(Object.assign({ atas: 'Mengetahui,' }, pimpinan), Object.assign({ atas: '' }, notulis), tglTtd));
    awal.push(K.bab('KATA PENGANTAR', 'ii'));
    var kpDefault = 'Puji syukur kami panjatkan ke hadirat Tuhan Yang Maha Esa karena atas rahmat dan karunia-Nya laporan kegiatan ' +
      judul + ' ini dapat diselesaikan dengan baik.\n' +
      'Laporan ini disusun sebagai bentuk pertanggungjawaban dan dokumentasi atas pelaksanaan kegiatan yang diselenggarakan oleh ' +
      (k.penyelenggara || ins.nama || 'panitia') + ' pada ' + tglPanjang(k.tanggal, true) + (k.tempat ? ' bertempat di ' + k.tempat : '') +
      '. Laporan ini memuat latar belakang, pelaksanaan, hasil kegiatan, rencana tindak lanjut, serta lampiran berupa daftar hadir, notulen, dan dokumentasi kegiatan.\n' +
      'Kami mengucapkan terima kasih kepada seluruh pihak yang telah berpartisipasi dan mendukung terlaksananya kegiatan ini. ' +
      'Kami menyadari laporan ini masih memiliki kekurangan, sehingga saran dan masukan yang membangun sangat kami harapkan. ' +
      'Semoga laporan ini bermanfaat bagi semua pihak.';
    awal = awal.concat(K.teks(n.kataPengantar, { fallback: kpDefault }));
    awal.push(para(tglTtd, { alignment: D.AlignmentType.RIGHT, spacing: { before: 240, after: 0 } }));
    awal.push(para('Tim Penyusun', { alignment: D.AlignmentType.RIGHT }));
    var idxDI = awal.length;

    // ---- isi ----
    var isi = [];
    isi.push(K.bab('BAB I PENDAHULUAN'));
    isi.push(K.subbab('A. Latar Belakang')); isi = isi.concat(K.teks(n.latarBelakang));
    isi.push(K.subbab('B. Dasar Pelaksanaan')); isi = isi.concat(K.teks(n.dasarPelaksanaan, { noIndent: true }));
    isi.push(K.subbab('C. Tujuan')); isi = isi.concat(K.teks(n.tujuan, { noIndent: true }));

    isi.push(K.bab('BAB II PELAKSANAAN KEGIATAN'));
    isi.push(K.subbab('A. Waktu dan Tempat'));
    isi.push(para('Kegiatan ini dilaksanakan pada:', { spacing: { after: 60 } }));
    isi.push(K.info([['Hari / Tanggal', tglPanjang(k.tanggal, true)], ['Waktu', waktu || '-'], ['Tempat', k.tempat || '-']], mmT(35)));
    isi.push(K.subbab('B. Peserta'));
    isi.push(K.paragraf([run('Kegiatan ini dihadiri oleh '), run(hadir.length + ' orang', { bold: true }),
      run(' peserta. Daftar hadir peserta selengkapnya terlampir pada Lampiran 1.')]));
    isi.push(K.subbab('C. Agenda Kegiatan'));
    isi = isi.concat(K.teks(n.agenda || k.deskripsi, { noIndent: true }));

    isi.push(K.bab('BAB III HASIL KEGIATAN'));
    isi.push(K.subbab('A. Hasil Pembahasan')); isi = isi.concat(K.teks(n.pembahasan));
    isi.push(K.subbab('B. Keputusan / Kesepakatan')); isi = isi.concat(K.teks(n.keputusan, { noIndent: true }));
    isi.push(K.subbab('C. Rencana Tindak Lanjut'));
    if (rtl.length) {
      isi.push(K.paragraf('Rencana tindak lanjut (RTL) yang ditetapkan dalam kegiatan ini beserta penanggung jawab dan tenggat waktunya adalah sebagai berikut:'));
      isi.push(K.tabelRtl(rtl));
      isi.push(para('', { spacing: { after: 0 } }));
    } else isi = isi.concat(K.teks(n.tindakLanjut, { noIndent: true }));
    if (ringkas && ringkas.total) {
      isi.push(K.subbab('D. Evaluasi Tindak Lanjut Rapat Sebelumnya'));
      isi.push(K.paragraf('Dalam kegiatan ini juga dilakukan evaluasi terhadap ' + ringkas.total + ' RTL dari ' +
        data.evaluasi.sumber.map(function (s) { return s.kegiatan.judul + ' (' + tglPanjang(s.kegiatan.tanggal) + ')'; }).join(' dan ') +
        '. Sebanyak ' + ringkas.per['Selesai'] + ' RTL telah selesai (' + ringkas.persenSelesai + '%), ' + ringkas.per['Proses'] +
        ' dalam proses, dan ' + ringkas.per['Belum'] + ' belum dilaksanakan, dengan rata-rata capaian ' + ringkas.rataCapaian +
        '%. Rincian evaluasi disajikan dalam Laporan Evaluasi Tindak Lanjut tersendiri.'));
      isi.push(K.tabelEvaluasi(ringkas.items, false));
      isi.push(para('', { spacing: { after: 0 } }));
    }

    isi.push(K.bab('BAB IV PENUTUP'));
    isi.push(K.subbab('A. Kesimpulan')); isi = isi.concat(K.teks(n.kesimpulan));
    isi.push(K.subbab('B. Saran')); isi = isi.concat(K.teks(n.saran, { noIndent: true }));
    isi.push(para('', { spacing: { after: 0 } }));
    isi.push(K.paragraf('Demikian laporan kegiatan ini kami susun dengan sebenar-benarnya untuk dapat dipergunakan sebagaimana mestinya.'));
    isi = isi.concat(K.kosong(1));
    isi.push(K.blokTtd(null, Object.assign({ atas: '' }, pimpinan), tglTtd));

    // ---- Lampiran 1: daftar hadir ----
    isi.push(K.bab('LAMPIRAN 1. DAFTAR HADIR'));
    isi = isi.concat(K.kop());
    isi.push(para([run('DAFTAR HADIR', { bold: true, size: 26 })], { alignment: C, spacing: { after: 0 } }));
    isi.push(para([run(judul.toUpperCase(), { bold: true })], { alignment: C, spacing: { after: 120, line: 276 } }));
    isi.push(K.info([['Hari / Tanggal', tglPanjang(k.tanggal, true)], ['Waktu', waktu || '-'], ['Tempat', k.tempat || '-']], mmT(32)));
    isi.push(para('', { spacing: { after: 60, line: 240 } }));
    var wNo = mmT(10), wNama = mmT(50), wJab = mmT(42), wTtd = CW - wNo - wNama - wJab;
    var rowsDH = [new D.TableRow({ tableHeader: true, children: [K.headCell('No', wNo), K.headCell('Nama / NIP', wNama),
      K.headCell('Jabatan / Unit Kerja', wJab), K.headCell('Tanda Tangan', wTtd)] })];
    hadir.forEach(function (h, i) {
      var ttd = h.ttd ? [K.img(b64(h.ttd), 28, 11)] : [];
      rowsDH.push(new D.TableRow({ cantSplit: true, height: { value: mmT(15), rule: D.HeightRule.ATLEAST }, children: [
        cell(para(String(i + 1), { alignment: C, spacing: { after: 0 } }), wNo),
        cell([para([run(h.nama, { bold: true })], { spacing: { after: 0, line: 252 } }),
          para([run(h.nipNim ? 'NIP/NIM. ' + h.nipNim : '', { size: 20 })], { spacing: { after: 0, line: 252 } })], wNama),
        cell([para([run(h.jabatan || '-', { size: 22 })], { spacing: { after: 0, line: 252 } }),
          para([run(h.unitKerja || '', { size: 20, color: '444444' })], { spacing: { after: 0, line: 252 } })], wJab),
        cell(para([run((i + 1) + '. ', { size: 18 })].concat(ttd),
          { alignment: i % 2 ? D.AlignmentType.RIGHT : D.AlignmentType.LEFT, spacing: { after: 0 } }), wTtd)
      ] }));
    });
    if (!hadir.length) rowsDH.push(new D.TableRow({ children: [cell(para([run('Belum ada peserta yang mengisi daftar hadir.', { italics: true })], { alignment: C }), CW, { columnSpan: 4 })] }));
    K.addLines(Math.max(1, hadir.length) * 2.4);
    isi.push(K.table([wNo, wNama, wJab, wTtd], rowsDH));
    isi = isi.concat(K.kosong(1));
    isi.push(K.blokTtd(null, { atas: '', label: 'Penanggung Jawab', nama: n.pimpinanRapat, nip: n.nipPimpinan }, tglTtd));

    // ---- Lampiran 2: notulen ----
    isi.push(K.bab('LAMPIRAN 2. NOTULEN RAPAT'));
    isi = isi.concat(K.kop());
    isi.push(para([run('NOTULEN RAPAT', { bold: true, size: 26 })], { alignment: C, spacing: { after: 200 } }));
    isi.push(K.info([['Kegiatan', judul], ['Hari / Tanggal', tglPanjang(k.tanggal, true)], ['Waktu', waktu || '-'],
      ['Tempat', k.tempat || '-'], ['Pimpinan Rapat', n.pimpinanRapat || '-'], ['Notulis', n.notulis || '-'],
      ['Peserta', hadir.length + ' orang (daftar hadir terlampir)']]));
    function bagian(label, t) {
      K.addLines(1.5);
      return [para([run(label, { bold: true })], { spacing: { before: 200, after: 60 }, keepNext: true })].concat(K.teks(t, { noIndent: true }));
    }
    isi = isi.concat(bagian('Agenda:', n.agenda || k.deskripsi));
    isi = isi.concat(bagian('Pembahasan:', n.pembahasan));
    isi = isi.concat(bagian('Keputusan / Kesepakatan:', n.keputusan));
    if (ringkas && ringkas.total) {
      isi.push(para([run('Evaluasi RTL rapat sebelumnya:', { bold: true })], { spacing: { before: 200, after: 60 }, keepNext: true }));
      isi.push(K.paragraf(ringkas.per['Selesai'] + ' dari ' + ringkas.total + ' RTL selesai (' + ringkas.persenSelesai + '%); rata-rata capaian ' + ringkas.rataCapaian + '%.', { indent: undefined }));
    }
    if (rtl.length) {
      isi.push(para([run('Rencana Tindak Lanjut:', { bold: true })], { spacing: { before: 200, after: 80 }, keepNext: true }));
      isi.push(K.tabelRtl(rtl));
    } else isi = isi.concat(bagian('Rencana Tindak Lanjut:', n.tindakLanjut));
    isi = isi.concat(K.kosong(1));
    isi.push(K.blokTtd(Object.assign({ atas: 'Mengetahui,' }, pimpinan), notulis, tglTtd));

    // ---- Lampiran 3: dokumentasi ----
    isi.push(K.bab('LAMPIRAN 3. DOKUMENTASI KEGIATAN'));
    isi = isi.concat(galeri(D, K, foto.map(function (f) { return { data: b64(f.data), mime: f.mime, w: f.w, h: f.h, ket: f.keterangan || ('Dokumentasi ' + judul) }; })));

    var awalFinal = awal.slice(0, idxDI).concat(K.daftarIsi(), awal.slice(idxDI));
    return K.dokumen({ title: 'Laporan ' + judul, header: 'Laporan ' + (k.jenis || 'Kegiatan') + ' – ' + judul,
      sampul: sampul, awal: awalFinal, isi: isi });
  }

  /** Grid foto 2 kolom dengan keterangan. */
  function galeri(D, K, list) {
    if (!list.length) return K.belumDiisi();
    var half = K.CW / 2, fw = 66, rows = [];
    for (var i = 0; i < list.length; i += 2) {
      rows.push(new D.TableRow({ cantSplit: true, children: [list[i], list[i + 1]].map(function (f) {
        if (!f) return K.cell('', half);
        var ratio = (f.h && f.w) ? f.h / f.w : 0.75;
        var fh = Math.min(fw * ratio, 80), fwA = fh / ratio;
        return K.cell([
          K.para([K.img(f.data, fwA, fh, /png/.test(f.mime) ? 'png' : 'jpg')], { alignment: K.C, spacing: { after: 60 } }),
          K.para([K.run(f.ket, { size: 20, italics: true })], { alignment: K.C, spacing: { after: 0, line: 252 } })
        ], half, { verticalAlign: D.VerticalAlign.TOP });
      }) }));
    }
    K.addMm(Math.ceil(list.length / 2) * 70);
    return [K.table([half, half], rows, K.NOBORDER)];
  }

  // =====================================================================
  //  LAPORAN EVALUASI TINDAK LANJUT (PPEPP)
  // =====================================================================
  function buildLaporanEvaluasi(D, data, assets) {
    var K = kit(D, assets);
    var run = K.run, para = K.para, cell = K.cell, C = K.C, mmT = K.mmT, CW = K.CW;
    var k = data.kegiatan || {}, n = data.notulen || {};
    var ins = assets.institusi || {}, b64 = assets.b64, kota = ins.kota || 'Makassar';
    var R = ringkasEvaluasi(data);
    var sumber = data.sumber || [];
    var tahun = (parseTgl(k.tanggal) || new Date()).getFullYear();
    var tglTtd = kota + ', ' + tglPanjang(k.tanggal);
    var daftarRapat = sumber.map(function (s) { return s.kegiatan.judul + ' (' + tglPanjang(s.kegiatan.tanggal) + ')'; });
    var penyusun = { label: k.evJabatanPenyusun || 'Sekretaris Jurusan', nama: k.evPenyusun, nip: k.evNipPenyusun };
    var pimpinan = { label: n.jabatanPimpinan || 'Pimpinan Rapat', nama: n.pimpinanRapat, nip: n.nipPimpinan };
    var judul = 'Evaluasi Rencana Tindak Lanjut ' + (k.judul || '');

    var sampul = K.sampul({ kicker: 'LAPORAN EVALUASI TINDAK LANJUT', judul: judul,
      labelPenyelenggara: 'Disusun oleh', penyelenggara: k.penyelenggara,
      baris: [tglPanjang(k.tanggal, true), 'Siklus PPEPP – Evaluasi & Pengendalian'], tahun: tahun });

    // ---- halaman awal ----
    var awal = [K.bab('KATA PENGANTAR', 'i')];
    awal = awal.concat(K.teks('Puji syukur kami panjatkan ke hadirat Tuhan Yang Maha Esa karena atas rahmat dan karunia-Nya Laporan Evaluasi Tindak Lanjut ini dapat diselesaikan.\n' +
      'Laporan ini disusun sebagai bagian dari siklus Penetapan, Pelaksanaan, Evaluasi, Pengendalian, dan Peningkatan (PPEPP) Sistem Penjaminan Mutu Internal, ' +
      'khususnya untuk memantau ketercapaian rencana tindak lanjut (RTL) yang telah ditetapkan pada ' + daftarRapat.join(' dan ') +
      '. Evaluasi dilaksanakan pada ' + k.judul + ', ' + tglPanjang(k.tanggal, true) + '.\n' +
      'Kami berharap laporan ini dapat menjadi dasar pengambilan keputusan dan perbaikan berkelanjutan. Terima kasih kepada seluruh penanggung jawab RTL atas kerja sama dan dukungannya.'));
    awal.push(para(tglTtd, { alignment: D.AlignmentType.RIGHT, spacing: { before: 240, after: 0 } }));
    awal.push(para(penyusun.label, { alignment: D.AlignmentType.RIGHT }));
    var idxDI = awal.length;

    // ---- BAB I ----
    var isi = [];
    isi.push(K.bab('BAB I PENDAHULUAN'));
    isi.push(K.subbab('A. Latar Belakang'));
    isi.push(K.paragraf('Setiap rapat menghasilkan keputusan dan rencana tindak lanjut (RTL) yang harus dilaksanakan oleh penanggung jawab sesuai tenggat yang disepakati. ' +
      'Agar keputusan rapat benar-benar terlaksana, ketercapaian RTL perlu dievaluasi secara berkala pada rapat berikutnya sebagai wujud penerapan siklus PPEPP.'));
    isi.push(K.paragraf('Pada ' + (k.judul || 'rapat ini') + ' yang dilaksanakan ' + tglPanjang(k.tanggal, true) + (k.tempat ? ' di ' + k.tempat : '') +
      ', dilakukan evaluasi terhadap ' + R.total + ' RTL yang berasal dari ' + sumber.length + ' rapat sebelumnya.'));
    isi.push(K.subbab('B. Tujuan'));
    isi = isi.concat(K.teks('- Mengetahui tingkat ketercapaian RTL hasil rapat sebelumnya.\n- Mengidentifikasi kendala pelaksanaan RTL dan menetapkan tindakan koreksi (pengendalian).\n' +
      '- Menetapkan RTL lanjutan sebagai langkah peningkatan berkelanjutan.', { noIndent: true }));
    isi.push(K.subbab('C. Ruang Lingkup'));
    isi.push(K.paragraf('Evaluasi mencakup RTL dari rapat-rapat berikut:'));
    var wR = [mmT(9), mmT(78), mmT(32), CW - mmT(119)];
    var rowsR = [new D.TableRow({ tableHeader: true, children: [K.headCell('No', wR[0]), K.headCell('Rapat', wR[1]), K.headCell('Tanggal', wR[2]), K.headCell('Jumlah RTL', wR[3])] })];
    sumber.forEach(function (s, i) {
      rowsR.push(new D.TableRow({ children: [cell(para(String(i + 1), { alignment: C, spacing: { after: 0 } }), wR[0]), cell(K.small(s.kegiatan.judul), wR[1]),
        cell(K.small(tglPanjang(s.kegiatan.tanggal)), wR[2]), cell(para(String(s.items.length), { alignment: C, spacing: { after: 0 } }), wR[3])] }));
    });
    K.addLines(2 + sumber.length * 2);
    isi.push(K.table(wR, rowsR));
    isi.push(K.subbab('D. Metode Evaluasi'));
    isi.push(K.paragraf('Setiap RTL dinilai statusnya (Selesai, Proses, Belum, atau Tidak relevan) beserta persentase capaian dan bukti pendukung. ' +
      'Persentase penyelesaian dihitung dari jumlah RTL berstatus Selesai dibagi jumlah RTL yang relevan.'));

    // ---- BAB II ----
    isi.push(K.bab('BAB II HASIL EVALUASI'));
    isi.push(K.subbab('A. Ringkasan Capaian'));
    isi.push(K.paragraf([run('Dari '), run(R.total + ' RTL', { bold: true }), run(' yang dievaluasi, '),
      run(R.per['Selesai'] + ' RTL telah selesai (' + R.persenSelesai + '%)', { bold: true }),
      run(', ' + R.per['Proses'] + ' RTL masih dalam proses, ' + R.per['Belum'] + ' RTL belum dilaksanakan, dan ' + R.per['Tidak relevan'] +
        ' RTL dinyatakan tidak relevan lagi. Rata-rata capaian seluruh RTL yang relevan adalah '),
      run(R.rataCapaian + '%', { bold: true }), run(', termasuk kategori ' + kategori(R.persenSelesai) + '.')]));
    var wS = [mmT(70), mmT(35), CW - mmT(105)];
    var rowsS = [new D.TableRow({ tableHeader: true, children: [K.headCell('Status', wS[0]), K.headCell('Jumlah', wS[1]), K.headCell('Persentase', wS[2])] })];
    STATUS.forEach(function (st) {
      rowsS.push(new D.TableRow({ children: [cell(para([run(st, { bold: true, color: STATUS_WARNA[st] })], { spacing: { after: 0, line: 252 } }), wS[0]),
        cell(para(String(R.per[st]), { alignment: C, spacing: { after: 0 } }), wS[1]),
        cell(para((R.total ? Math.round(R.per[st] * 100 / R.total) : 0) + '%', { alignment: C, spacing: { after: 0 } }), wS[2])] }));
    });
    if (R.per['']) rowsS.push(new D.TableRow({ children: [cell(K.small('Belum dievaluasi', { italics: true }), wS[0]),
      cell(para(String(R.per['']), { alignment: C, spacing: { after: 0 } }), wS[1]), cell(para('-', { alignment: C, spacing: { after: 0 } }), wS[2])] }));
    rowsS.push(new D.TableRow({ children: [cell(K.small('Jumlah', { bold: true }), wS[0]), cell(para([run(String(R.total), { bold: true })], { alignment: C, spacing: { after: 0 } }), wS[1]),
      cell(para([run('100%', { bold: true })], { alignment: C, spacing: { after: 0 } }), wS[2])] }));
    K.addLines(12);
    isi.push(K.table(wS, rowsS));
    if (assets.grafik) {
      var gw = 130, gh = gw * assets.grafik.h / assets.grafik.w;
      isi.push(para([K.img(assets.grafik.data, gw, gh)], { alignment: C, spacing: { before: 200, after: 0 } }));
      isi.push(para([run('Gambar 1. Sebaran status RTL', { italics: true, size: 20 })], { alignment: C }));
      K.addMm(gh + 12);
    }
    isi.push(K.subbab('B. Rincian Evaluasi per Rapat'));
    sumber.forEach(function (s, i) {
      K.addLines(2);
      isi.push(para([run((i + 1) + '. ' + s.kegiatan.judul, { bold: true }), run(' – ' + tglPanjang(s.kegiatan.tanggal, true), { color: '555555' })],
        { spacing: { before: 160, after: 80 }, keepNext: true }));
      isi.push(s.items.length ? K.tabelEvaluasi(s.items.map(function (it) { return { rtl: it.rtl, ev: it.ev || {} }; }), true)
        : para([run('Tidak ada RTL pada rapat ini.', { italics: true })]));
    });

    // ---- BAB III Pengendalian ----
    isi.push(K.bab('BAB III PENGENDALIAN'));
    isi.push(K.subbab('A. Kendala dan Tindakan Koreksi'));
    var belum = R.items.filter(function (it) { return it.ev.status !== 'Selesai' && it.ev.status !== 'Tidak relevan'; });
    if (belum.length) {
      isi.push(K.paragraf('Terdapat ' + belum.length + ' RTL yang belum tuntas. Kendala dan tindakan koreksi yang ditetapkan adalah sebagai berikut:'));
      var wK = [mmT(9), mmT(45), mmT(43), CW - mmT(97)];
      var rowsK = [new D.TableRow({ tableHeader: true, children: [K.headCell('No', wK[0]), K.headCell('RTL', wK[1]), K.headCell('Kendala', wK[2]), K.headCell('Tindakan Koreksi', wK[3])] })];
      belum.forEach(function (it, i) {
        rowsK.push(new D.TableRow({ cantSplit: true, children: [cell(para(String(i + 1), { alignment: C, spacing: { after: 0 } }), wK[0]),
          cell([K.small(it.rtl.uraian), K.small('PJ: ' + (it.rtl.pj || '-'), { size: 18, color: '555555' })], wK[1]),
          cell(K.small(it.ev.kendala || '-'), wK[2]), cell(K.small(it.ev.koreksi || '-'), wK[3])] }));
      });
      K.addLines(2 + belum.length * 3);
      isi.push(K.table(wK, rowsK));
    } else {
      isi.push(K.paragraf('Seluruh RTL yang relevan telah selesai dilaksanakan sehingga tidak diperlukan tindakan koreksi.'));
    }
    var tr = R.items.filter(function (it) { return it.ev.status === 'Tidak relevan'; });
    if (tr.length) {
      isi.push(K.subbab('B. RTL yang Tidak Relevan'));
      isi = isi.concat(K.teks(tr.map(function (it) { return '- ' + it.rtl.uraian + (it.ev.kendala ? ' (alasan: ' + it.ev.kendala + ')' : ''); }).join('\n'), { noIndent: true }));
    }

    // ---- BAB IV Peningkatan & Penutup ----
    isi.push(K.bab('BAB IV PENINGKATAN DAN PENUTUP'));
    isi.push(K.subbab('A. Rencana Tindak Lanjut Lanjutan'));
    var lanjut = R.items.filter(function (it) { return it.ev.dilanjutkanKe; });
    if (lanjut.length) {
      isi.push(K.paragraf('Sebagai langkah peningkatan, ' + lanjut.length + ' RTL yang belum tuntas ditetapkan kembali sebagai RTL ' + (k.judul || 'rapat ini') + ' untuk dievaluasi pada rapat berikutnya:'));
      isi = isi.concat(K.teks(lanjut.map(function (it, i) { return (i + 1) + '. ' + it.rtl.uraian + ' (PJ: ' + (it.rtl.pj || '-') + ')'; }).join('\n'), { noIndent: true }));
    } else {
      isi.push(K.paragraf('Tidak ada RTL yang dilanjutkan ke periode berikutnya.'));
    }
    isi.push(K.subbab('B. Kesimpulan'));
    isi = isi.concat(K.teks(k.evKesimpulan, { fallback: 'Tingkat penyelesaian RTL sebesar ' + R.persenSelesai + '% dengan rata-rata capaian ' + R.rataCapaian +
      '% termasuk kategori ' + kategori(R.persenSelesai) + '. ' + (belum.length ? 'RTL yang belum tuntas perlu mendapat perhatian penanggung jawab dan dipantau pada rapat berikutnya.' : 'Kinerja tindak lanjut rapat perlu dipertahankan.') }));
    isi.push(K.paragraf('Demikian laporan evaluasi tindak lanjut ini disusun untuk dapat dipergunakan sebagaimana mestinya.'));
    isi = isi.concat(K.kosong(1));
    isi.push(K.blokTtd(Object.assign({ atas: 'Mengetahui,' }, pimpinan), Object.assign({ atas: '' }, penyusun), tglTtd));

    // ---- Lampiran: bukti dukung ----
    isi.push(K.bab('LAMPIRAN. BUKTI DUKUNG'));
    var gambar = [], lainnya = [];
    R.items.forEach(function (it, i) {
      (it.ev.buktiFiles || []).forEach(function (f) {
        if (f.data) gambar.push({ data: b64(f.data), mime: f.mime, w: f.w, h: f.h, ket: 'RTL ' + (i + 1) + ': ' + it.rtl.uraian.slice(0, 80) });
        else lainnya.push('- RTL ' + (i + 1) + ' – ' + f.nama + (f.url ? ' (' + f.url + ')' : ''));
      });
      if (it.ev.bukti) lainnya.push('- RTL ' + (i + 1) + ' – ' + it.ev.bukti);
    });
    if (lainnya.length) {
      isi.push(para([run('Daftar tautan / berkas bukti:', { bold: true })], { spacing: { after: 60 } }));
      isi = isi.concat(K.teks(lainnya.join('\n'), { noIndent: true }));
    }
    if (gambar.length) isi = isi.concat(galeri(D, K, gambar));
    if (!gambar.length && !lainnya.length) isi = isi.concat(K.belumDiisi());

    var awalFinal = awal.slice(0, idxDI).concat(K.daftarIsi(), awal.slice(idxDI));
    return K.dokumen({ title: 'Laporan Evaluasi Tindak Lanjut ' + (k.judul || ''), header: 'Laporan Evaluasi Tindak Lanjut – ' + (k.judul || ''),
      sampul: sampul, awal: awalFinal, isi: isi });
  }

  /** Data diagram status untuk grafikSvg(). */
  function dataGrafik(ev) {
    var R = ringkasEvaluasi(ev);
    var warna = { 'Selesai': '#1E8E5A', 'Proses': '#D99A00', 'Belum': '#C0392B', 'Tidak relevan': '#8A9A9D' };
    return STATUS.map(function (st) { return { label: st, nilai: R.per[st], warna: warna[st] }; });
  }

  var api = { buildLaporan: buildLaporan, buildLaporanEvaluasi: buildLaporanEvaluasi, ringkasEvaluasi: ringkasEvaluasi,
    dataGrafik: dataGrafik, tglPanjang: tglPanjang, STATUS: STATUS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Laporan = api;
})(this);
