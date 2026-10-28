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
        sections: o.sections ? o.sections(pageA4, footerNo, header) : [
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
  //  DOKUMEN RAPAT (U-A-N-G): Sampul, Undangan, Absen, Notulen, Gambar
  // =====================================================================
  function buildDokumenRapat(D, data, assets) {
    var K = kit(D, assets);
    var run = K.run, para = K.para, cell = K.cell, C = K.C, mmT = K.mmT, CW = K.CW;
    var k = data.kegiatan || {}, n = data.notulen || {}, hadir = data.hadir || [], foto = data.foto || [];
    var undangan = data.undangan || [], rtl = data.rtl || [];
    var ins = assets.institusi || {}, b64 = assets.b64, kota = ins.kota || 'Makassar';
    var judul = k.judul || 'Judul Kegiatan';
    var tahun = (parseTgl(k.tanggal) || new Date()).getFullYear();
    var tglTtd = kota + ', ' + tglPanjang(k.tanggal);
    var waktu = [k.waktuMulai, k.waktuSelesai].filter(Boolean).join(' – ');
    if (waktu) waktu += ' WITA';
    var pimpinan = { label: n.jabatanPimpinan || 'Pimpinan Rapat', nama: n.pimpinanRapat, nip: n.nipPimpinan };
    var notulis = { label: n.jabatanNotulis || 'Notulis', nama: n.notulis, nip: n.nipNotulis };

    var judulBagian = function (t, sub) {
      var arr = [para([run(t, { bold: true, size: 28 })], { alignment: C, spacing: { before: 0, after: sub ? 0 : 200 }, pageBreakBefore: true, keepNext: true })];
      if (sub) arr.push(para([run(sub, { bold: true })], { alignment: C, spacing: { after: 160, line: 276 }, keepNext: true }));
      return arr;
    };

    var sampul = K.sampul({ kicker: 'DOKUMEN RAPAT', judul: judul, penyelenggara: k.penyelenggara,
      baris: [tglPanjang(k.tanggal, true), k.tempat || ''], tahun: tahun });

    // ---- U: Undangan (gambar satu halaman penuh) ----
    var hlmUndangan = [];
    if (undangan.length) {
      undangan.forEach(function (u, i) {
        var ratio = (u.h && u.w) ? u.h / u.w : 1.414;
        var maxW = 180, maxH = 262;
        var w = maxW, h = w * ratio;
        if (h > maxH) { h = maxH; w = h / ratio; }
        hlmUndangan.push(para([K.img(b64(u.data), w, h, /png/.test(u.mime) ? 'png' : 'jpg')],
          { alignment: C, spacing: { after: 0, line: 240 }, pageBreakBefore: i > 0 }));
      });
    } else {
      hlmUndangan.push(para([run('UNDANGAN', { bold: true, size: 28 })], { alignment: C, spacing: { before: 2400, after: 200 } }));
      hlmUndangan.push(para([run('(Undangan belum diunggah – silakan unggah melalui aplikasi atau sisipkan di halaman ini)', { italics: true, color: '888888' })], { alignment: C }));
    }

    // ---- A: Daftar hadir ----
    var isi = [];
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
    isi.push(K.table([wNo, wNama, wJab, wTtd], rowsDH));
    isi.push(para([run('Jumlah peserta hadir: ' + hadir.length + ' orang', { italics: true, size: 22 })], { spacing: { before: 80, after: 120 } }));
    isi.push(K.blokTtd(null, { atas: 'Mengetahui,', label: pimpinan.label, nama: pimpinan.nama, nip: pimpinan.nip }, tglTtd));

    // ---- N: Notulen ----
    var kopN = K.kop();
    isi.push(para('', { pageBreakBefore: true, spacing: { after: 0, line: 120 } }));
    isi = isi.concat(kopN);
    isi.push(para([run('NOTULEN RAPAT', { bold: true, size: 26 })], { alignment: C, spacing: { after: 200 } }));
    isi.push(K.info([['Kegiatan', judul], ['Hari / Tanggal', tglPanjang(k.tanggal, true)], ['Waktu', waktu || '-'],
      ['Tempat', k.tempat || '-'], ['Pimpinan Rapat', n.pimpinanRapat || '-'], ['Notulis', n.notulis || '-'],
      ['Peserta', hadir.length + ' orang (daftar hadir terlampir)']]));
    function bagian(label, t) {
      return [para([run(label, { bold: true })], { spacing: { before: 200, after: 60 }, keepNext: true })].concat(K.teks(t, { noIndent: true }));
    }
    isi = isi.concat(bagian('Agenda:', n.agenda || k.deskripsi));
    isi = isi.concat(bagian('Pembahasan:', n.pembahasan));
    isi = isi.concat(bagian('Keputusan / Kesepakatan:', n.keputusan));
    isi.push(para([run('Rencana Tindak Lanjut (RTL):', { bold: true })], { spacing: { before: 200, after: 80 }, keepNext: true }));
    if (rtl.length) isi.push(K.tabelRtl(rtl));
    else isi = isi.concat(K.teks(n.tindakLanjut, { noIndent: true, fallback: '-' }));
    isi = isi.concat(K.kosong(1));
    isi.push(K.blokTtd(Object.assign({ atas: 'Mengetahui,' }, pimpinan), Object.assign({ atas: '' }, notulis), tglTtd));

    // ---- G: Gambar / dokumentasi ----
    isi = isi.concat(judulBagian('DOKUMENTASI KEGIATAN', judul.toUpperCase()));
    isi = isi.concat(galeri(D, K, foto.map(function (f) { return { data: b64(f.data), mime: f.mime, w: f.w, h: f.h, ket: f.keterangan || ('Dokumentasi ' + judul) }; }),
      data.ukuranFoto === 'besar' ? 2 : 4));

    return K.dokumen({
      title: 'Dokumen Rapat ' + judul,
      sections: function (pageA4, footerNo) {
        return [
          { properties: { page: { size: pageA4.size, margin: { top: 0, bottom: 0, left: 0, right: 0, header: 0, footer: 0 } } }, children: sampul },
          { properties: { page: { size: pageA4.size, margin: { top: mmT(15), bottom: mmT(15), left: mmT(15), right: mmT(15), header: 0, footer: 0 } } }, children: hlmUndangan },
          { properties: { page: Object.assign({}, pageA4, { margin: Object.assign({}, pageA4.margin, { top: mmT(20) }) }) }, children: isi }
        ];
      }
    });
  }

  /**
   * Foto dokumentasi dengan keterangan.
   * perHalaman 4 = grid 2 kolom (kecil) · perHalaman 2 = satu kolom, foto besar, 2 foto per halaman.
   */
  function galeri(D, K, list, perHalaman) {
    if (!list.length) return K.belumDiisi();
    if (perHalaman === 2) {
      var out = [], maxW = 140, maxH = 92;
      list.forEach(function (f, i) {
        var ratio = (f.h && f.w) ? f.h / f.w : 0.75;
        var w = maxW, h = w * ratio;
        if (h > maxH) { h = maxH; w = h / ratio; }
        out.push(K.para([K.img(f.data, w, h, /png/.test(f.mime) ? 'png' : 'jpg')],
          { alignment: K.C, spacing: { before: i % 2 ? 240 : 0, after: 80 }, keepNext: true, pageBreakBefore: i > 0 && i % 2 === 0 }));
        out.push(K.para([K.run(f.ket, { size: 20, italics: true })], { alignment: K.C, spacing: { after: 120, line: 252 } }));
      });
      return out;
    }
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
    return [K.table([half, half], rows, K.NOBORDER)];
  }

  // =====================================================================
  //  EVALUASI TINDAK LANJUT RAPAT (versi ringkas)
  // =====================================================================
  function buildLaporanEvaluasi(D, data, assets) {
    var K = kit(D, assets);
    var run = K.run, para = K.para, cell = K.cell, C = K.C, mmT = K.mmT, CW = K.CW;
    var k = data.kegiatan || {}, n = data.notulen || {}, pg = data.pengaturan || {};
    var ins = assets.institusi || {}, b64 = assets.b64, kota = ins.kota || 'Makassar';
    var R = ringkasEvaluasi(data);
    var sumber = data.sumber || [];
    var tahun = (parseTgl(k.tanggal) || new Date()).getFullYear();
    var tglTtd = kota + ', ' + tglPanjang(k.tanggal);
    var penyusun = { label: k.evJabatanPenyusun || pg.notulisJabatan || 'Sekretaris Jurusan', nama: k.evPenyusun || pg.notulisNama, nip: k.evNipPenyusun || pg.notulisNip };
    var pimpinan = { label: n.jabatanPimpinan || pg.pimpinanJabatan || 'Ketua Jurusan', nama: n.pimpinanRapat || pg.pimpinanNama, nip: n.nipPimpinan || pg.pimpinanNip };

    var sampul = K.sampul({ kicker: 'EVALUASI TINDAK LANJUT RAPAT', judul: 'Evaluasi RTL ' + (k.judul || ''),
      labelPenyelenggara: 'Disusun oleh', penyelenggara: k.penyelenggara,
      baris: [tglPanjang(k.tanggal, true), 'Siklus PPEPP – Evaluasi & Pengendalian'], tahun: tahun });

    var isi = K.kop();
    isi.push(para([run('EVALUASI TINDAK LANJUT RAPAT', { bold: true, size: 26 })], { alignment: C, spacing: { after: 160 } }));
    isi.push(K.info([
      ['Dievaluasi pada', (k.judul || '-') + ', ' + tglPanjang(k.tanggal, true)],
      ['RTL dari rapat', sumber.map(function (s) { return s.kegiatan.judul + ' (' + tglPanjang(s.kegiatan.tanggal) + ')'; }).join('; ') || '-'],
      ['Jumlah RTL', R.total + ' RTL'],
      ['Capaian', R.per['Selesai'] + ' selesai (' + R.persenSelesai + '%), ' + R.per['Proses'] + ' proses, ' + R.per['Belum'] + ' belum' +
        (R.per['Tidak relevan'] ? ', ' + R.per['Tidak relevan'] + ' tidak relevan' : '') + ' · rata-rata capaian ' + R.rataCapaian + '%']
    ], mmT(34)));
    isi.push(para('', { spacing: { after: 80, line: 240 } }));

    var w = [mmT(9), mmT(41), mmT(25), mmT(18), mmT(17), CW - mmT(110)];
    var rows = [new D.TableRow({ tableHeader: true, children: ['No', 'Rencana Tindak Lanjut', 'PJ / Tenggat', 'Status', 'Capaian', 'Kendala / Koreksi']
      .map(function (h, i) { return cell(para([run(h, { bold: true, color: 'FFFFFF', size: 18 })], { alignment: C, spacing: { after: 0, line: 240 } }), w[i],
        { shading: { type: D.ShadingType.CLEAR, color: 'auto', fill: K.TEAL }, margins: { top: 60, bottom: 60, left: 40, right: 40 } }); }) })];
    var no = 0;
    sumber.forEach(function (s) {
      if (sumber.length > 1) rows.push(new D.TableRow({ children: [cell(para([run(s.kegiatan.judul + ' – ' + tglPanjang(s.kegiatan.tanggal), { bold: true, size: 20 })],
        { spacing: { after: 0, line: 252 } }), CW, { columnSpan: 6, shading: { type: D.ShadingType.CLEAR, color: 'auto', fill: 'E5F6F5' } })] }));
      s.items.forEach(function (it) {
        var ev = it.ev || {}, r = it.rtl; no++;
        var kk = [];
        if (ev.kendala) kk.push(K.small('Kendala: ' + ev.kendala, { size: 18 }));
        if (ev.koreksi) kk.push(K.small('Koreksi: ' + ev.koreksi, { size: 18 }));
        if (ev.dilanjutkanKe) kk.push(K.small('(dilanjutkan sebagai RTL rapat ini)', { size: 18, italics: true, color: K.TEAL }));
        if (!kk.length) kk.push(K.small('-', { size: 18 }));
        var rtlCell = [K.small(r.uraian, { size: 20 })];
        if (ev.bukti) rtlCell.push(K.small('Bukti: ' + ev.bukti, { size: 16, color: '1F5F9F' }));
        rows.push(new D.TableRow({ cantSplit: true, children: [
          cell(para(String(no), { alignment: C, spacing: { after: 0 } }), w[0]),
          cell(rtlCell, w[1]),
          cell([K.small(r.pj || '-', { size: 20 }), K.small(r.tenggat ? tglPanjang(r.tenggat) : '', { size: 16, color: '555555' })], w[2]),
          cell(para([run(ev.status || 'Belum dinilai', { bold: true, size: 18, color: STATUS_WARNA[ev.status || ''] })], { alignment: C, spacing: { after: 0, line: 240 } }), w[3]),
          cell(para(ev.status && ev.status !== 'Tidak relevan' ? (ev.capaian || 0) + '%' : '-', { alignment: C, spacing: { after: 0 } }), w[4]),
          cell(kk, w[5])
        ] }));
      });
    });
    if (!no) rows.push(new D.TableRow({ children: [cell(para([run('Tidak ada RTL yang dievaluasi.', { italics: true })], { alignment: C }), CW, { columnSpan: 6 })] }));
    isi.push(K.table(w, rows));

    var lanjut = R.items.filter(function (it) { return it.ev.dilanjutkanKe; });
    isi.push(para([run('Tindak lanjut: ', { bold: true }), run(lanjut.length
      ? lanjut.length + ' RTL yang belum tuntas ditetapkan kembali sebagai RTL ' + (k.judul || 'rapat ini') + ' untuk dievaluasi pada rapat berikutnya.'
      : 'tidak ada RTL yang dilanjutkan.')], { alignment: K.J, spacing: { before: 160, after: 120 } }));
    if (k.evKesimpulan) isi = isi.concat(K.teks(k.evKesimpulan, { noIndent: true }));
    isi = isi.concat(K.kosong(1));
    isi.push(K.blokTtd(Object.assign({ atas: 'Mengetahui,' }, pimpinan), Object.assign({ atas: '' }, penyusun), tglTtd));

    // lampiran bukti (gambar) bila ada
    var gambar = [];
    no = 0;
    R.items.forEach(function (it) {
      no++;
      (it.ev.buktiFiles || []).forEach(function (f) {
        if (f.data) gambar.push({ data: b64(f.data), mime: f.mime, w: f.w, h: f.h, ket: 'RTL ' + no + ': ' + it.rtl.uraian.slice(0, 80) });
      });
    });
    if (gambar.length) {
      isi.push(para([run('LAMPIRAN BUKTI DUKUNG', { bold: true, size: 26 })], { alignment: C, pageBreakBefore: true, spacing: { after: 200 } }));
      isi = isi.concat(galeri(D, K, gambar));
    }

    return K.dokumen({
      title: 'Evaluasi Tindak Lanjut ' + (k.judul || ''),
      sections: function (pageA4) {
        return [
          { properties: { page: { size: pageA4.size, margin: { top: 0, bottom: 0, left: 0, right: 0, header: 0, footer: 0 } } }, children: sampul },
          { properties: { page: Object.assign({}, pageA4, { margin: Object.assign({}, pageA4.margin, { top: mmT(20) }) }) }, children: isi }
        ];
      }
    });
  }

  var api = { buildDokumenRapat: buildDokumenRapat, buildLaporanEvaluasi: buildLaporanEvaluasi, ringkasEvaluasi: ringkasEvaluasi,
    tglPanjang: tglPanjang, STATUS: STATUS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Laporan = api;
})(this);
