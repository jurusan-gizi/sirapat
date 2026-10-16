/**
 * SIRAPAT – Sistem Informasi Rapat, Presensi & Tindak Lanjut
 * Poltekkes Kemenkes Makassar
 *
 * Backend Google Apps Script (Web App / API JSON).
 * Database : Google Sheets (dibuat otomatis oleh fungsi setup()).
 * Berkas   : tanda tangan & foto dokumentasi disimpan di Google Drive.
 *
 * LANGKAH PERTAMA: jalankan fungsi setup() sekali dari editor Apps Script.
 */

// ====== KONFIGURASI ======
var VERSI = '4.1';              // versi backend (tampil di URL /exec untuk pengecekan)
var SESI_DETIK = 6 * 3600;      // lama sesi login admin (maks. 6 jam – batas CacheService)
var MAKS_GAGAL = 5;             // percobaan login salah sebelum dikunci sementara
var KUNCI_DETIK = 15 * 60;      // lama penguncian setelah terlalu banyak gagal

var SHEETS = {
  // Akun admin aplikasi (login via Google Sheet). peran: superadmin | admin
  Admin: ['email', 'nama', 'nip', 'jabatan', 'peran', 'aktif', 'salt', 'hash', 'wajibGanti',
          'dibuatPada', 'loginTerakhir'],
  Kegiatan: ['id', 'judul', 'jenis', 'tanggal', 'waktuMulai', 'waktuSelesai', 'tempat',
             'penyelenggara', 'deskripsi', 'status', 'dibuatOleh', 'dibuatPada', 'diubahPada',
             // evaluasi RTL (PPEPP)
             'evaluasiDari', 'evPenyusun', 'evNipPenyusun', 'evJabatanPenyusun', 'evKesimpulan',
             // berkas undangan yang diunggah (id file gambar di Drive, dipisah koma)
             'undanganIds',
             // nama rapat bila memilih "Rapat Lainnya" & keterangan judul (mis. "Oktober 2026")
             'namaLain', 'keterangan'],
  Hadir: ['id', 'kegiatanId', 'waktu', 'nama', 'nipNim', 'jabatan', 'unitKerja', 'noHp',
          'ttdFileId', 'pegawaiId'],
  // Pengaturan umum (isian bawaan pimpinan rapat & notulis, dll.)
  Pengaturan: ['kunci', 'nilai', 'diubahOleh', 'diubahPada'],
  // Master data dosen/tendik untuk pilihan cepat di form daftar hadir
  Pegawai: ['id', 'nama', 'nip', 'jabatan', 'unitKerja', 'noHp', 'aktif', 'dibuatPada', 'diubahPada'],
  Notulen: ['kegiatanId', 'latarBelakang', 'dasarPelaksanaan', 'tujuan', 'agenda',
            'pembahasan', 'keputusan', 'tindakLanjut', 'kesimpulan', 'saran',
            'kataPengantar', 'pimpinanRapat', 'nipPimpinan', 'jabatanPimpinan',
            'notulis', 'nipNotulis', 'fotoIds', 'diubahOleh', 'diubahPada', 'jabatanNotulis'],
  // Rencana Tindak Lanjut hasil rapat (Penetapan)
  RTL: ['id', 'kegiatanId', 'urut', 'uraian', 'pj', 'tenggat', 'target', 'asalRtlId', 'dibuatPada'],
  // Evaluasi RTL pada rapat berikutnya (Evaluasi, Pengendalian, Peningkatan)
  Evaluasi: ['id', 'kegiatanId', 'rtlId', 'status', 'capaian', 'bukti', 'buktiFileIds', 'kendala',
             'koreksi', 'dilanjutkanKe', 'diubahPada']
};
var STATUS_RTL = ['Selesai', 'Proses', 'Belum', 'Tidak relevan'];

// ====== SETUP ======
function setup() {
  var props = PropertiesService.getScriptProperties();
  var ssId = props.getProperty('SPREADSHEET_ID');
  var ss;
  if (ssId) {
    ss = SpreadsheetApp.openById(ssId);
  } else {
    ss = SpreadsheetApp.create('SIRAPAT - Database');
    props.setProperty('SPREADSHEET_ID', ss.getId());
  }
  Object.keys(SHEETS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    siapkanHeader_(sh, name);
  });
  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Lembar1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);

  if (!props.getProperty('FOLDER_ID')) {
    var folder = DriveApp.createFolder('SIRAPAT - Berkas');
    props.setProperty('FOLDER_ID', folder.getId());
  }
  _sheetCache = {};
  Logger.log('Setup selesai. Spreadsheet: ' + ss.getUrl());

  // Buat superadmin pertama bila sheet Admin masih kosong
  if (!rows_('Admin').length) {
    var email = '';
    try { email = Session.getEffectiveUser().getEmail(); } catch (e) {}
    email = (email || 'admin@poltekkes-mks.ac.id').toLowerCase();
    var pw = passwordAcak_();
    var sec = buatHash_(pw);
    appendRow_('Admin', { email: email, nama: 'Super Admin', peran: 'superadmin', aktif: 'ya',
      salt: sec.salt, hash: sec.hash, wajibGanti: 'ya', dibuatPada: now_() });
    Logger.log('==============================================');
    Logger.log('AKUN SUPERADMIN PERTAMA');
    Logger.log('Email    : ' + email);
    Logger.log('Password : ' + pw + '   (sementara – wajib diganti saat login pertama)');
    Logger.log('==============================================');
  } else {
    Logger.log('Sheet Admin sudah berisi akun. Jika lupa password superadmin, jalankan fungsi resetPasswordSuperadmin().');
  }
}

/** Darurat: reset password semua superadmin (jalankan dari editor, lihat hasilnya di Log eksekusi). */
function resetPasswordSuperadmin() {
  rows_('Admin').filter(function (a) { return a.peran === 'superadmin'; }).forEach(function (a) {
    var pw = passwordAcak_(), sec = buatHash_(pw);
    a.salt = sec.salt; a.hash = sec.hash; a.wajibGanti = 'ya'; a.aktif = 'ya';
    updateRow_('Admin', a._row, a);
    bukaKunci_(a.email);
    Logger.log(a.email + '  →  password sementara: ' + pw);
  });
}

// ====== ALAT BANTU (jalankan dari editor Apps Script) ======
/**
 * Uji login langsung di server, tanpa lewat aplikasi web.
 * Isi EMAIL & PASSWORD di bawah, simpan, lalu Jalankan fungsi tesLogin.
 */
function tesLogin() {
  var EMAIL = 'admin@poltekkes-mks.ac.id';
  var PASSWORD = 'TULIS_PASSWORD_DI_SINI';
  bukaKunci_(EMAIL);
  try {
    var u = login_({ email: EMAIL, password: PASSWORD });
    logoutToken_(u.token);
    Logger.log('BERHASIL – password & backend OK (' + u.nama + ', ' + u.peran + ').');
    Logger.log('Jika di aplikasi masih gagal: pastikan URL /exec menampilkan "versi":"' + VERSI + '" ' +
      '(buat Versi baru di Kelola deployment) dan API_URL di js/config.js sama dengan URL /exec.');
  } catch (e) {
    Logger.log('GAGAL: ' + e.message);
    Logger.log('Jalankan resetPasswordSuperadmin untuk membuat password sementara baru.');
  }
}

/** Buka kunci login semua akun (setelah salah password 5x). */
function bukaKunciSemua() {
  rows_('Admin').forEach(function (a) { bukaKunci_(a.email); });
  Logger.log('Kunci login semua akun sudah dibuka.');
}

/** Tampilkan info pemasangan: spreadsheet yang dipakai & daftar akun admin. */
function diagnosa() {
  var props = PropertiesService.getScriptProperties();
  Logger.log('Versi backend : ' + VERSI);
  Logger.log('Database      : ' + ss_().getUrl());
  Logger.log('Folder berkas : https://drive.google.com/drive/folders/' + props.getProperty('FOLDER_ID'));
  var admins = rows_('Admin');
  Logger.log('Jumlah admin  : ' + admins.length);
  admins.forEach(function (a) {
    Logger.log(' - ' + a.email + ' | ' + a.peran + ' | aktif: ' + (a.aktif === 'ya' ? 'ya' : 'TIDAK') +
      ' | wajib ganti password: ' + (a.wajibGanti === 'ya' ? 'ya' : 'tidak'));
  });
}

function bukaKunci_(email) {
  CacheService.getScriptCache().remove('gagal_' + sha_(String(email).toLowerCase().trim()).slice(0, 24));
}
function logoutToken_(token) {
  if (token) CacheService.getScriptCache().remove('sesi_' + token);
}

// ====== ROUTER ======
function doGet(e) {
  return json_({ ok: true, app: 'SIRAPAT', versi: VERSI, login: 'sheet', time: new Date().toISOString() });
}

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents || '{}');
    var action = req.action;
    var p = req.payload || {};
    var publicActions = {
      getKegiatanPublik: getKegiatanPublik_,
      kirimHadir: kirimHadir_,
      cariPegawai: cariPegawai_,
      login: login_
    };
    var adminActions = {
      whoami: function (p, user) { return user; },
      logout: logout_,
      gantiPassword: gantiPassword_,
      daftarAdmin: daftarAdmin_,
      simpanAdmin: simpanAdmin_,
      resetPasswordAdmin: resetPasswordAdmin_,
      daftarPegawai: daftarPegawai_,
      simpanPegawai: simpanPegawai_,
      hapusPegawai: hapusPegawai_,
      imporPegawai: imporPegawai_,
      unggahUndangan: unggahUndangan_,
      hapusUndangan: hapusUndangan_,
      daftarUndangan: daftarUndangan_,
      getPengaturan: function () { return pengaturan_(); },
      simpanPengaturan: simpanPengaturan_,
      daftarKegiatan: daftarKegiatan_,
      simpanKegiatan: simpanKegiatan_,
      hapusKegiatan: hapusKegiatan_,
      detailKegiatan: detailKegiatan_,
      hapusHadir: hapusHadir_,
      simpanNotulen: simpanNotulen_,
      unggahFoto: unggahFoto_,
      hapusFoto: hapusFoto_,
      daftarFoto: daftarFoto_,
      dataLaporan: dataLaporan_,
      simpanRtl: simpanRtl_,
      dataEvaluasi: dataEvaluasi_,
      simpanEvaluasi: simpanEvaluasi_,
      unggahBukti: unggahBukti_,
      hapusBukti: hapusBukti_,
      dataLaporanEvaluasi: dataLaporanEvaluasi_
    };
    if (publicActions[action]) return json_({ ok: true, data: publicActions[action](p) });
    if (adminActions[action]) {
      var user = verifikasiSesi_(req.token);
      if (user.wajibGanti && action !== 'gantiPassword' && action !== 'whoami' && action !== 'logout') {
        throw new Error('GANTI: Silakan ganti password sementara Anda terlebih dahulu.');
      }
      return json_({ ok: true, data: adminActions[action](p, user, req.token) });
    }
    throw new Error('Aksi tidak dikenal: ' + action);
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ====== AUTENTIKASI (akun di sheet Admin) ======
function hex_(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function sha_(str) {
  return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8));
}
/** Hash password: SHA-256 berulang dengan salt acak (password asli tidak pernah disimpan). */
function buatHash_(password, salt) {
  salt = salt || Utilities.getUuid().replace(/-/g, '');
  var h = salt + '|' + password;
  for (var i = 0; i < 1000; i++) h = sha_(salt + h);
  return { salt: salt, hash: h };
}
function passwordAcak_() {
  var huruf = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var out = '';
  var acak = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid());
  for (var i = 0; i < 10; i++) out += huruf[(acak[i] & 0xff) % huruf.length];
  return out;
}
function cekPassword_(pw) {
  pw = String(pw || '');
  if (pw.length < 8) throw new Error('Password minimal 8 karakter.');
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) throw new Error('Password harus mengandung huruf dan angka.');
  return pw;
}
function publikAdmin_(a) {
  return { email: a.email, nama: a.nama, nip: a.nip, jabatan: a.jabatan, peran: a.peran,
    aktif: a.aktif === 'ya', wajibGanti: a.wajibGanti === 'ya', loginTerakhir: a.loginTerakhir };
}

function login_(p) {
  var email = clean_(p.email, 120).toLowerCase();
  var pw = String(p.password || '').trim();   // spasi di awal/akhir (sering ikut tersalin) diabaikan
  if (!email || !pw) throw new Error('Email dan password wajib diisi.');
  var cache = CacheService.getScriptCache();
  var kGagal = 'gagal_' + sha_(email).slice(0, 24);
  var gagal = Number(cache.get(kGagal) || 0);
  if (gagal >= MAKS_GAGAL) throw new Error('Terlalu banyak percobaan. Coba lagi dalam 15 menit.');

  var a = rows_('Admin').filter(function (r) { return r.email.toLowerCase().trim() === email; })[0];
  if (!a || a.aktif !== 'ya' || buatHash_(pw, a.salt).hash !== a.hash) {
    cache.put(kGagal, String(gagal + 1), KUNCI_DETIK);
    throw new Error('Email atau password salah.');
  }
  cache.remove(kGagal);
  a.loginTerakhir = now_();
  updateRow_('Admin', a._row, a);

  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var user = publikAdmin_(a);
  cache.put('sesi_' + token, JSON.stringify(user), SESI_DETIK);
  user.token = token;
  user.exp = Math.floor(Date.now() / 1000) + SESI_DETIK;
  return user;
}

function verifikasiSesi_(token) {
  if (!token) throw new Error('AUTH: Silakan login terlebih dahulu.');
  var v = CacheService.getScriptCache().get('sesi_' + token);
  if (!v) throw new Error('AUTH: Sesi login berakhir, silakan login kembali.');
  return JSON.parse(v);
}

function logout_(p, user, token) {
  logoutToken_(token);
  return true;
}

function gantiPassword_(p, user, token) {
  var a = rows_('Admin').filter(function (r) { return r.email === user.email; })[0];
  if (!a) throw new Error('Akun tidak ditemukan.');
  if (buatHash_(String(p.lama || '').trim(), a.salt).hash !== a.hash) throw new Error('Password lama salah.');
  var baru = cekPassword_(String(p.baru || '').trim());
  if (baru === p.lama) throw new Error('Password baru harus berbeda dari password lama.');
  var sec = buatHash_(baru);
  a.salt = sec.salt; a.hash = sec.hash; a.wajibGanti = '';
  updateRow_('Admin', a._row, a);
  user.wajibGanti = false;
  CacheService.getScriptCache().put('sesi_' + token, JSON.stringify(user), SESI_DETIK);
  return user;
}

function wajibSuper_(user) {
  if (user.peran !== 'superadmin') throw new Error('Hanya superadmin yang dapat mengelola akun admin.');
}

function daftarAdmin_(p, user) {
  wajibSuper_(user);
  return rows_('Admin').map(publikAdmin_);
}

/** Tambah / ubah admin. Akun baru mendapat password sementara (ditampilkan sekali). */
function simpanAdmin_(p, user) {
  wajibSuper_(user);
  var email = clean_(p.email, 120).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Format email tidak valid.');
  return withLock_(function () {
    var a = rows_('Admin').filter(function (r) { return r.email === email; })[0];
    var hasil = {};
    var data = a ? Object.assign({}, a) : { email: email, dibuatPada: now_() };
    data.nama = clean_(p.nama, 120) || data.nama || email;
    data.nip = clean_(p.nip, 40);
    data.jabatan = clean_(p.jabatan, 120);
    data.peran = p.peran === 'superadmin' ? 'superadmin' : 'admin';
    data.aktif = p.aktif === false ? '' : 'ya';
    if (email === user.email && (data.peran !== 'superadmin' || data.aktif !== 'ya')) {
      throw new Error('Anda tidak dapat menonaktifkan atau menurunkan peran akun sendiri.');
    }
    if (!a) {
      var pw = passwordAcak_(), sec = buatHash_(pw);
      data.salt = sec.salt; data.hash = sec.hash; data.wajibGanti = 'ya';
      appendRow_('Admin', data);
      hasil.passwordSementara = pw;
    } else {
      updateRow_('Admin', a._row, data);
    }
    hasil.admin = publikAdmin_(data);
    return hasil;
  });
}

function resetPasswordAdmin_(p, user) {
  wajibSuper_(user);
  return withLock_(function () {
    var a = rows_('Admin').filter(function (r) { return r.email === String(p.email).toLowerCase(); })[0];
    if (!a) throw new Error('Akun tidak ditemukan.');
    var pw = passwordAcak_(), sec = buatHash_(pw);
    a.salt = sec.salt; a.hash = sec.hash; a.wajibGanti = 'ya';
    updateRow_('Admin', a._row, a);
    return { email: a.email, passwordSementara: pw };
  });
}

// ====== HELPER SHEET ======
function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Backend belum di-setup. Jalankan fungsi setup().');
  return SpreadsheetApp.openById(id);
}
var _sheetCache = {};
/** Ambil sheet; buat otomatis bila belum ada & tambahkan kolom baru (untuk pembaruan versi). */
function sheet_(name) {
  if (_sheetCache[name]) return _sheetCache[name];
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); siapkanHeader_(sh, name); }
  else if (sh.getLastColumn() < SHEETS[name].length) siapkanHeader_(sh, name);
  _sheetCache[name] = sh;
  return sh;
}
function siapkanHeader_(sh, name) {
  sh.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]])
    .setFontWeight('bold').setBackground('#00615C').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.getRange('A:Z').setNumberFormat('@'); // semua kolom sebagai teks
}
function folder_() {
  return DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FOLDER_ID'));
}
function rows_(name) {
  var sh = sheet_(name);
  var values = sh.getDataRange().getValues();
  var head = values.shift();
  return values.map(function (r, i) {
    var o = { _row: i + 2 };
    SHEETS[name].forEach(function (h) { o[h] = ''; });
    head.forEach(function (h, j) { if (h) o[h] = nilai_(r[j]); });
    return o;
  });
}
function deleteRows_(name, list) {
  var sh = sheet_(name);
  list.slice().sort(function (a, b) { return b._row - a._row; })
    .forEach(function (r) { sh.deleteRow(r._row); });
}
function fmtDate_(d) { return Utilities.formatDate(d, 'Asia/Makassar', 'yyyy-MM-dd'); }
/** Nilai sel → teks. Sel yang terlanjur diubah Sheets menjadi tanggal/jam dikembalikan ke format aslinya. */
function nilai_(v) {
  if (v instanceof Date) {
    if (v.getFullYear() < 1901) return Utilities.formatDate(v, zonaSheet_(), 'HH:mm');     // jam (mis. 09:00)
    var jam = Utilities.formatDate(v, 'Asia/Makassar', 'HH:mm:ss');
    return jam === '00:00:00' ? fmtDate_(v) : Utilities.formatDate(v, 'Asia/Makassar', 'yyyy-MM-dd HH:mm:ss');
  }
  if (typeof v === 'number' && Math.abs(v) >= 1e15) return v.toFixed(0);                   // NIP panjang
  return String(v);
}
var _zona = null;
function zonaSheet_() {
  if (!_zona) { try { _zona = ss_().getSpreadsheetTimeZone(); } catch (e) { _zona = 'Asia/Makassar'; } }
  return _zona;
}
function barisTeks_(name, obj) {
  return SHEETS[name].map(function (h) { return obj[h] == null ? '' : String(obj[h]); });
}
/** Tulis baris sebagai TEKS agar jam, tanggal & NIP tidak diubah otomatis oleh Google Sheets. */
function appendRow_(name, obj) {
  var sh = sheet_(name);
  var r = sh.getLastRow() + 1;
  sh.getRange(r, 1, 1, SHEETS[name].length).setNumberFormat('@').setValues([barisTeks_(name, obj)]);
}
function updateRow_(name, rowNum, obj) {
  var sh = sheet_(name);
  sh.getRange(rowNum, 1, 1, SHEETS[name].length).setNumberFormat('@').setValues([barisTeks_(name, obj)]);
}
function uid_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 12); }
function now_() { return Utilities.formatDate(new Date(), 'Asia/Makassar', "yyyy-MM-dd HH:mm:ss"); }
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function clean_(s, max) { return String(s == null ? '' : s).trim().slice(0, max || 500); }

// ====== PUBLIK: FORM DAFTAR HADIR ======
function getKegiatanPublik_(p) {
  var k = rows_('Kegiatan').filter(function (r) { return r.id === p.id; })[0];
  if (!k) throw new Error('Kegiatan tidak ditemukan.');
  return { id: k.id, judul: k.judul, jenis: k.jenis, tanggal: k.tanggal,
           waktuMulai: k.waktuMulai, waktuSelesai: k.waktuSelesai, tempat: k.tempat,
           penyelenggara: k.penyelenggara, status: k.status };
}

function kirimHadir_(p) {
  // Peserta memilih dari Data Pegawai → nama & NIP diambil dari master (NIP tidak dikirim ke browser utuh)
  if (p.pegawaiId) {
    var pg = rows_('Pegawai').filter(function (r) { return r.id === p.pegawaiId && r.aktif !== 'tidak'; })[0];
    if (pg) {
      p.nama = pg.nama; p.nipNim = pg.nip;
      p.jabatan = clean_(p.jabatan) || pg.jabatan; p.unitKerja = clean_(p.unitKerja) || pg.unitKerja;
      p.noHp = clean_(p.noHp) || pg.noHp;
    } else { p.pegawaiId = ''; }
  }
  var nama = clean_(p.nama, 120);
  if (!nama) throw new Error('Nama wajib diisi.');
  if (!p.ttd || p.ttd.indexOf('data:image/png;base64,') !== 0) throw new Error('Tanda tangan wajib diisi.');
  var b64 = p.ttd.split(',')[1];
  if (b64.length > 400000) throw new Error('Ukuran tanda tangan terlalu besar.');

  return withLock_(function () {
    var k = rows_('Kegiatan').filter(function (r) { return r.id === p.kegiatanId; })[0];
    if (!k) throw new Error('Kegiatan tidak ditemukan.');
    if (k.status === 'tutup') throw new Error('Daftar hadir kegiatan ini sudah ditutup.');
    var nip = clean_(p.nipNim, 40);
    var dup = rows_('Hadir').some(function (r) {
      return r.kegiatanId === k.id && (
        (nip && r.nipNim === nip) ||
        (!nip && r.nama.toLowerCase() === nama.toLowerCase()));
    });
    if (dup) throw new Error('Anda sudah mengisi daftar hadir kegiatan ini.');

    var id = uid_();
    var blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/png', 'ttd_' + k.id + '_' + id + '.png');
    var file = folder_().createFile(blob);
    appendRow_('Hadir', {
      id: id, kegiatanId: k.id, waktu: now_(), nama: nama, nipNim: nip,
      jabatan: clean_(p.jabatan, 120), unitKerja: clean_(p.unitKerja, 160),
      noHp: clean_(p.noHp, 30), ttdFileId: file.getId(), pegawaiId: clean_(p.pegawaiId, 20)
    });
    return { id: id, nama: nama };
  });
}

// ====== ADMIN: KEGIATAN ======
function daftarKegiatan_() {
  var hadir = rows_('Hadir');
  var notulen = rows_('Notulen');
  var rtl = rows_('RTL');
  return rows_('Kegiatan').map(function (k) {
    k.jumlahHadir = hadir.filter(function (h) { return h.kegiatanId === k.id; }).length;
    k.jumlahRtl = rtl.filter(function (r) { return r.kegiatanId === k.id; }).length;
    k.adaNotulen = notulen.some(function (n) { return n.kegiatanId === k.id && n.pembahasan; });
    delete k._row;
    return k;
  }).sort(function (a, b) { return (b.tanggal + b.dibuatPada).localeCompare(a.tanggal + a.dibuatPada); });
}

function simpanKegiatan_(p, user) {
  if (!clean_(p.judul)) throw new Error('Judul kegiatan wajib diisi.');
  if (!clean_(p.tanggal)) throw new Error('Tanggal wajib diisi.');
  return withLock_(function () {
    var data = {
      judul: clean_(p.judul, 300), jenis: clean_(p.jenis, 60), tanggal: clean_(p.tanggal, 10),
      namaLain: clean_(p.namaLain, 200), keterangan: clean_(p.keterangan, 120),
      waktuMulai: clean_(p.waktuMulai, 5), waktuSelesai: clean_(p.waktuSelesai, 5),
      tempat: clean_(p.tempat, 200), penyelenggara: clean_(p.penyelenggara, 200),
      deskripsi: clean_(p.deskripsi, 2000), status: p.status === 'tutup' ? 'tutup' : 'aktif',
      diubahPada: now_()
    };
    if (p.id) {
      var row = rows_('Kegiatan').filter(function (r) { return r.id === p.id; })[0];
      if (!row) throw new Error('Kegiatan tidak ditemukan.');
      var merged = Object.assign({}, row, data);
      updateRow_('Kegiatan', row._row, merged);
      delete merged._row;
      return merged;
    }
    data.id = uid_();
    data.dibuatOleh = user.email;
    data.dibuatPada = now_();
    appendRow_('Kegiatan', data);
    return data;
  });
}

function hapusKegiatan_(p) {
  return withLock_(function () {
    var k = rows_('Kegiatan').filter(function (r) { return r.id === p.id; })[0];
    if (!k) throw new Error('Kegiatan tidak ditemukan.');
    // hapus daftar hadir & notulen terkait (dari bawah ke atas)
    ['Hadir', 'Notulen', 'RTL', 'Evaluasi'].forEach(function (name) {
      var sh = sheet_(name);
      rows_(name).filter(function (r) { return r.kegiatanId === k.id; })
        .sort(function (a, b) { return b._row - a._row; })
        .forEach(function (r) {
          trashFile_(r.ttdFileId);
          String(r.fotoIds || '').split(',').forEach(trashFile_);
          String(r.buktiFileIds || '').split(',').forEach(trashFile_);
          sh.deleteRow(r._row);
        });
    });
    String(k.undanganIds || '').split(',').forEach(trashFile_);
    sheet_('Kegiatan').deleteRow(k._row);
    return true;
  });
}

function trashFile_(id) {
  if (!id) return;
  try { DriveApp.getFileById(String(id).trim()).setTrashed(true); } catch (e) {}
}

function detailKegiatan_(p) {
  var k = rows_('Kegiatan').filter(function (r) { return r.id === p.id; })[0];
  if (!k) throw new Error('Kegiatan tidak ditemukan.');
  delete k._row;
  var hadir = rows_('Hadir').filter(function (h) { return h.kegiatanId === k.id; })
    .map(function (h) { delete h._row; return h; });
  var n = rows_('Notulen').filter(function (r) { return r.kegiatanId === k.id; })[0] || null;
  if (n) delete n._row;
  return { kegiatan: k, hadir: hadir, notulen: n, rtl: rtlRapat_(k.id), pengaturan: pengaturan_(),
           jumlahUndangan: String(k.undanganIds || '').split(',').filter(String).length };
}

function hapusHadir_(p) {
  return withLock_(function () {
    var h = rows_('Hadir').filter(function (r) { return r.id === p.id; })[0];
    if (!h) throw new Error('Data tidak ditemukan.');
    trashFile_(h.ttdFileId);
    sheet_('Hadir').deleteRow(h._row);
    return true;
  });
}

// ====== ADMIN: NOTULEN ======
function simpanNotulen_(p, user) {
  return withLock_(function () {
    var row = rows_('Notulen').filter(function (r) { return r.kegiatanId === p.kegiatanId; })[0];
    var data = row ? Object.assign({}, row) : { kegiatanId: p.kegiatanId, fotoIds: '' };
    ['latarBelakang', 'dasarPelaksanaan', 'tujuan', 'agenda', 'pembahasan', 'keputusan',
     'tindakLanjut', 'kesimpulan', 'saran', 'kataPengantar'].forEach(function (f) {
      if (p[f] !== undefined) data[f] = clean_(p[f], 45000);
    });
    ['pimpinanRapat', 'nipPimpinan', 'jabatanPimpinan', 'notulis', 'nipNotulis', 'jabatanNotulis'].forEach(function (f) {
      if (p[f] !== undefined) data[f] = clean_(p[f], 200);
    });
    data.diubahOleh = user.email;
    data.diubahPada = now_();
    if (row) updateRow_('Notulen', row._row, data); else appendRow_('Notulen', data);
    delete data._row;
    return data;
  });
}

function unggahFoto_(p) {
  if (!p.data || p.data.indexOf('data:image/') !== 0) throw new Error('Format foto tidak valid.');
  var mime = p.data.slice(5, p.data.indexOf(';'));
  var bytes = Utilities.base64Decode(p.data.split(',')[1]);
  if (bytes.length > 4 * 1024 * 1024) throw new Error('Foto maksimal 4 MB.');
  var file = folder_().createFile(Utilities.newBlob(bytes, mime,
    'foto_' + p.kegiatanId + '_' + uid_() + (mime === 'image/png' ? '.png' : '.jpg')));
  file.setDescription(clean_(p.keterangan, 300));
  return withLock_(function () {
    var row = rows_('Notulen').filter(function (r) { return r.kegiatanId === p.kegiatanId; })[0];
    var data = row ? Object.assign({}, row) : { kegiatanId: p.kegiatanId };
    var ids = String(data.fotoIds || '').split(',').filter(String);
    ids.push(file.getId());
    data.fotoIds = ids.join(',');
    if (row) updateRow_('Notulen', row._row, data); else appendRow_('Notulen', data);
    return { id: file.getId(), fotoIds: data.fotoIds };
  });
}

function hapusFoto_(p) {
  return withLock_(function () {
    var row = rows_('Notulen').filter(function (r) { return r.kegiatanId === p.kegiatanId; })[0];
    if (!row) throw new Error('Notulen tidak ditemukan.');
    row.fotoIds = String(row.fotoIds || '').split(',')
      .filter(function (id) { return id && id !== p.fotoId; }).join(',');
    trashFile_(p.fotoId);
    updateRow_('Notulen', row._row, row);
    return { fotoIds: row.fotoIds };
  });
}

// ====== ADMIN: DATA LAPORAN (termasuk gambar base64) ======
function dataLaporan_(p) {
  var d = detailKegiatan_(p);
  d.hadir.forEach(function (h) {
    h.ttd = fileB64_(h.ttdFileId);
  });
  d.foto = daftarFoto_({ kegiatanId: p.id });
  d.undangan = daftarUndangan_({ kegiatanId: p.id });
  var ev = dataEvaluasi_({ kegiatanId: p.id });
  d.evaluasi = ev.sumber.length ? ev : null;
  return d;
}

function fileB64_(id) {
  if (!id) return '';
  try { return Utilities.base64Encode(DriveApp.getFileById(id).getBlob().getBytes()); }
  catch (e) { return ''; }
}

// Foto dokumentasi (base64) untuk ditampilkan di halaman admin
function daftarFoto_(p) {
  var row = rows_('Notulen').filter(function (r) { return r.kegiatanId === p.kegiatanId; })[0];
  if (!row || !row.fotoIds) return [];
  return row.fotoIds.split(',').filter(String).map(function (id) {
    try {
      var f = DriveApp.getFileById(id);
      return { id: id, keterangan: f.getDescription() || '', mime: f.getMimeType(),
               data: Utilities.base64Encode(f.getBlob().getBytes()) };
    } catch (e) { return null; }
  }).filter(Boolean);
}

// ====== RTL (Rencana Tindak Lanjut) ======
function rtlRapat_(kegiatanId) {
  var semua = rows_('RTL');
  var keg = rows_('Kegiatan');
  return semua.filter(function (r) { return r.kegiatanId === kegiatanId; })
    .sort(function (a, b) { return Number(a.urut) - Number(b.urut); })
    .map(function (r) {
      delete r._row;
      if (r.asalRtlId) {
        var asal = semua.filter(function (x) { return x.id === r.asalRtlId; })[0];
        var ka = asal && keg.filter(function (x) { return x.id === asal.kegiatanId; })[0];
        if (ka) { r.asalJudul = ka.judul; r.asalTanggal = ka.tanggal; }
      }
      return r;
    });
}

/** Simpan seluruh daftar RTL sebuah rapat (tambah, ubah, hapus). */
function simpanRtl_(p) {
  if (!p.kegiatanId) throw new Error('kegiatanId kosong.');
  return withLock_(function () {
    var ada = rows_('RTL').filter(function (r) { return r.kegiatanId === p.kegiatanId; });
    var items = (p.items || []).filter(function (it) { return clean_(it.uraian); });
    var keep = {};
    items.forEach(function (it, i) {
      var data = {
        kegiatanId: p.kegiatanId, urut: i + 1, uraian: clean_(it.uraian, 2000), pj: clean_(it.pj, 200),
        tenggat: clean_(it.tenggat, 10), target: clean_(it.target, 500), asalRtlId: clean_(it.asalRtlId, 20)
      };
      var row = it.id && ada.filter(function (r) { return r.id === it.id; })[0];
      if (row) {
        data.id = row.id; data.dibuatPada = row.dibuatPada;
        updateRow_('RTL', row._row, data);
      } else {
        data.id = uid_(); data.dibuatPada = now_();
        appendRow_('RTL', data);
      }
      keep[data.id] = true;
    });
    var hapus = ada.filter(function (r) { return !keep[r.id]; });
    // RTL lanjutan yang dihapus: lepaskan tanda "dilanjutkan" di evaluasi asal
    if (hapus.length) {
      var ids = hapus.map(function (r) { return r.id; });
      rows_('Evaluasi').forEach(function (e) {
        if (ids.indexOf(e.dilanjutkanKe) >= 0) { e.dilanjutkanKe = ''; updateRow_('Evaluasi', e._row, e); }
      });
      deleteRows_('RTL', hapus);
    }
    return rtlRapat_(p.kegiatanId);
  });
}

// ====== EVALUASI RTL (PPEPP) ======
/**
 * Data evaluasi untuk rapat `kegiatanId`:
 * sumber = rapat-rapat sebelumnya yang RTL-nya dievaluasi pada rapat ini.
 */
function dataEvaluasi_(p) {
  var kid = p.kegiatanId || p.id;
  var keg = rows_('Kegiatan');
  var k = keg.filter(function (r) { return r.id === kid; })[0];
  if (!k) throw new Error('Kegiatan tidak ditemukan.');
  var sumberIds = (p.sumberIds || String(k.evaluasiDari || '').split(',')).filter(String);
  var rtlAll = rows_('RTL');
  var evAll = rows_('Evaluasi').filter(function (e) { return e.kegiatanId === kid; });
  var sumber = sumberIds.map(function (sid) {
    var ks = keg.filter(function (r) { return r.id === sid; })[0];
    if (!ks) return null;
    var rtl = rtlAll.filter(function (r) { return r.kegiatanId === sid; })
      .sort(function (a, b) { return Number(a.urut) - Number(b.urut); })
      .map(function (r) {
        delete r._row;
        var e = evAll.filter(function (x) { return x.rtlId === r.id; })[0] || null;
        if (e) { delete e._row; e.buktiFiles = infoFiles_(e.buktiFileIds); }
        return { rtl: r, ev: e };
      });
    delete ks._row;
    return { kegiatan: ks, items: rtl };
  }).filter(Boolean)
    .sort(function (a, b) { return a.kegiatan.tanggal.localeCompare(b.kegiatan.tanggal); });
  delete k._row;
  return { kegiatan: k, sumberIds: sumberIds, sumber: sumber, status: STATUS_RTL };
}

function infoFiles_(ids) {
  return String(ids || '').split(',').filter(String).map(function (id) {
    try {
      var f = DriveApp.getFileById(id);
      return { id: id, nama: f.getName().replace(/^bukti_[^_]+_[^_]+_/, ''), mime: f.getMimeType(), url: f.getUrl() };
    } catch (e) { return null; }
  }).filter(Boolean);
}

function simpanEvaluasi_(p, user) {
  var kid = p.kegiatanId;
  return withLock_(function () {
    var k = rows_('Kegiatan').filter(function (r) { return r.id === kid; })[0];
    if (!k) throw new Error('Kegiatan tidak ditemukan.');
    var sumberIds = (p.sumberIds || []).filter(function (id) { return id && id !== kid; });
    k.evaluasiDari = sumberIds.join(',');
    var m = p.meta || {};
    k.evPenyusun = clean_(m.evPenyusun, 200); k.evNipPenyusun = clean_(m.evNipPenyusun, 40);
    k.evJabatanPenyusun = clean_(m.evJabatanPenyusun, 200); k.evKesimpulan = clean_(m.evKesimpulan, 5000);
    k.diubahPada = now_();
    updateRow_('Kegiatan', k._row, k);

    var rtlAll = rows_('RTL');
    var evAll = rows_('Evaluasi').filter(function (e) { return e.kegiatanId === kid; });
    var urutBaru = rtlAll.filter(function (r) { return r.kegiatanId === kid; }).length;

    (p.items || []).forEach(function (it) {
      var rtl = rtlAll.filter(function (r) { return r.id === it.rtlId; })[0];
      if (!rtl) return;
      var e = evAll.filter(function (x) { return x.rtlId === it.rtlId; })[0];
      var data = e ? Object.assign({}, e) : { id: uid_(), kegiatanId: kid, rtlId: it.rtlId, buktiFileIds: '', dilanjutkanKe: '' };
      data.status = STATUS_RTL.indexOf(it.status) >= 0 ? it.status : '';
      var cap = Math.max(0, Math.min(100, Number(it.capaian) || 0));
      if (data.status === 'Selesai') cap = 100;
      data.capaian = it.status ? cap : '';
      data.bukti = clean_(it.bukti, 2000);
      data.kendala = clean_(it.kendala, 3000);
      data.koreksi = clean_(it.koreksi, 3000);
      data.diubahPada = now_();

      // Peningkatan: lanjutkan RTL yang belum tuntas ke rapat ini
      if (it.lanjutkan && !data.dilanjutkanKe) {
        var baru = { id: uid_(), kegiatanId: kid, urut: ++urutBaru, uraian: rtl.uraian, pj: rtl.pj,
          tenggat: clean_(it.tenggatBaru, 10), target: rtl.target, asalRtlId: rtl.id, dibuatPada: now_() };
        appendRow_('RTL', baru);
        data.dilanjutkanKe = baru.id;
      } else if (!it.lanjutkan && data.dilanjutkanKe) {
        var lama = rows_('RTL').filter(function (r) { return r.id === data.dilanjutkanKe; });
        deleteRows_('RTL', lama);
        data.dilanjutkanKe = '';
      }
      if (e) updateRow_('Evaluasi', e._row, data); else appendRow_('Evaluasi', data);
    });
    return dataEvaluasi_({ kegiatanId: kid });
  });
}

function unggahBukti_(p) {
  if (!p.data || p.data.indexOf('data:') !== 0) throw new Error('Format berkas tidak valid.');
  var mime = p.data.slice(5, p.data.indexOf(';'));
  var bytes = Utilities.base64Decode(p.data.split(',')[1]);
  if (bytes.length > 8 * 1024 * 1024) throw new Error('Berkas bukti maksimal 8 MB.');
  var nama = clean_(p.nama, 120).replace(/[\\/:*?"<>|]+/g, ' ') || ('bukti_' + uid_());
  var file = folder_().createFile(Utilities.newBlob(bytes, mime, 'bukti_' + p.kegiatanId + '_' + p.rtlId + '_' + nama));
  return withLock_(function () {
    var e = rows_('Evaluasi').filter(function (x) { return x.kegiatanId === p.kegiatanId && x.rtlId === p.rtlId; })[0];
    var data = e ? Object.assign({}, e) : { id: uid_(), kegiatanId: p.kegiatanId, rtlId: p.rtlId, buktiFileIds: '' };
    var ids = String(data.buktiFileIds || '').split(',').filter(String);
    ids.push(file.getId());
    data.buktiFileIds = ids.join(','); data.diubahPada = now_();
    if (e) updateRow_('Evaluasi', e._row, data); else appendRow_('Evaluasi', data);
    return infoFiles_(data.buktiFileIds);
  });
}

function hapusBukti_(p) {
  return withLock_(function () {
    var e = rows_('Evaluasi').filter(function (x) { return x.kegiatanId === p.kegiatanId && x.rtlId === p.rtlId; })[0];
    if (!e) throw new Error('Data evaluasi tidak ditemukan.');
    e.buktiFileIds = String(e.buktiFileIds || '').split(',').filter(function (id) { return id && id !== p.fileId; }).join(',');
    trashFile_(p.fileId);
    updateRow_('Evaluasi', e._row, e);
    return infoFiles_(e.buktiFileIds);
  });
}

/** Data lengkap Laporan Evaluasi Tindak Lanjut, termasuk gambar bukti (base64). */
function dataLaporanEvaluasi_(p) {
  var d = dataEvaluasi_({ kegiatanId: p.id });
  var n = rows_('Notulen').filter(function (r) { return r.kegiatanId === p.id; })[0] || null;
  if (n) delete n._row;
  d.notulen = n;
  d.pengaturan = pengaturan_();
  d.sumber.forEach(function (s) {
    s.items.forEach(function (it) {
      if (!it.ev || !it.ev.buktiFiles) return;
      it.ev.buktiFiles.forEach(function (f) {
        if (/^image\/(png|jpe?g)$/.test(f.mime)) {
          try { f.data = Utilities.base64Encode(DriveApp.getFileById(f.id).getBlob().getBytes()); } catch (e) {}
        }
      });
    });
  });
  return d;
}

// ====== DATA PEGAWAI (master nama & NIP dosen/tendik) ======
function normal_(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function samarNip_(nip) {
  nip = String(nip || '').replace(/\s/g, '');
  if (nip.length <= 8) return nip ? nip.slice(0, 2) + '••••' : '';
  return nip.slice(0, 4) + '••••••' + nip.slice(-4);
}
/** Daftar pegawai aktif (disimpan di cache 10 menit agar pencarian cepat). */
function pegawaiAktif_() {
  var cache = CacheService.getScriptCache();
  var c = cache.get('pegawai_aktif');
  if (c) return JSON.parse(c);
  var list = lengkapiIdPegawai_().filter(function (r) { return r.aktif !== 'tidak' && r.nama; })
    .map(function (r) { return { id: r.id, nama: r.nama, nip: r.nip, jabatan: r.jabatan, unitKerja: r.unitKerja }; });
  try { cache.put('pegawai_aktif', JSON.stringify(list), 600); } catch (e) {}
  return list;
}
function resetCachePegawai_() { CacheService.getScriptCache().remove('pegawai_aktif'); }
/** ID pegawai berupa nomor urut (1, 2, 3, …). */
function idPegawaiBaru_(semua) {
  var maks = 0;
  semua.forEach(function (r) { var n = parseInt(r.id, 10); if (String(n) === String(r.id).trim() && n > maks) maks = n; });
  return String(maks + 1);
}
/**
 * Baris yang diisi langsung di Google Sheet dengan kolom id kosong atau ganda
 * diberi nomor urut otomatis, agar tetap bisa dipilih di form daftar hadir.
 */
function lengkapiIdPegawai_() {
  var semua = rows_('Pegawai');
  var dipakai = {}, perlu = [];
  semua.forEach(function (r) {
    var id = String(r.id).trim();
    if (!r.nama) return;
    if (!id || dipakai[id]) perlu.push(r); else dipakai[id] = true;
  });
  if (perlu.length) {
    withLock_(function () {
      perlu.forEach(function (r) {
        r.id = idPegawaiBaru_(semua);
        if (!r.aktif) r.aktif = 'ya';
        if (!r.dibuatPada) r.dibuatPada = now_();
        updateRow_('Pegawai', r._row, r);
      });
    });
  }
  return semua;
}

/**
 * PUBLIK – pencarian untuk form daftar hadir. Minimal 3 huruf / 4 angka, maks. 8 hasil,
 * NIP ditampilkan tersamar agar data pegawai tidak bisa disalin utuh oleh orang luar.
 */
function cariPegawai_(p) {
  var q = normal_(p.q);
  if (q.length < 3) return [];
  var kata = String(p.q || '').toLowerCase().split(/\s+/).map(normal_).filter(String);
  var hasil = pegawaiAktif_().filter(function (r) {
    var nn = normal_(r.nama), nip = normal_(r.nip);
    if (/^\d+$/.test(q)) return q.length >= 4 && nip.indexOf(q) >= 0;
    return kata.every(function (k) { return nn.indexOf(k) >= 0; });
  }).slice(0, 8);
  return hasil.map(function (r) {
    return { id: r.id, nama: r.nama, nipSamar: samarNip_(r.nip), jabatan: r.jabatan, unitKerja: r.unitKerja };
  });
}

function daftarPegawai_() {
  resetCachePegawai_();   // perubahan yang diketik langsung di Sheet langsung terbaca
  return lengkapiIdPegawai_().map(function (r) { delete r._row; return r; })
    .sort(function (a, b) { return a.nama.localeCompare(b.nama); });
}

function dataPegawai_(p, lama) {
  var d = lama ? Object.assign({}, lama) : { id: idPegawaiBaru_(rows_('Pegawai').concat(_idBaruImpor)), dibuatPada: now_() };
  d.nama = clean_(p.nama, 120); d.nip = clean_(p.nip, 40).replace(/\s/g, '');
  d.jabatan = clean_(p.jabatan, 120); d.unitKerja = clean_(p.unitKerja, 160);
  d.noHp = clean_(p.noHp, 30); d.aktif = p.aktif === false || p.aktif === 'tidak' ? 'tidak' : 'ya';
  d.diubahPada = now_();
  if (!d.nama) throw new Error('Nama pegawai wajib diisi.');
  return d;
}

var _idBaruImpor = [];   // id yang sudah dibagikan dalam satu proses impor
function simpanPegawai_(p) {
  return withLock_(function () {
    var semua = rows_('Pegawai');
    var lama = p.id && semua.filter(function (r) { return r.id === p.id; })[0];
    var d = dataPegawai_(p, lama);
    var dupNip = d.nip && semua.filter(function (r) { return r.nip === d.nip && r.id !== d.id; })[0];
    if (dupNip) throw new Error('NIP ' + d.nip + ' sudah terdaftar atas nama ' + dupNip.nama + '.');
    if (lama) updateRow_('Pegawai', lama._row, d); else appendRow_('Pegawai', d);
    resetCachePegawai_();
    delete d._row;
    return d;
  });
}

function hapusPegawai_(p) {
  return withLock_(function () {
    var r = rows_('Pegawai').filter(function (x) { return x.id === p.id; })[0];
    if (!r) throw new Error('Data tidak ditemukan.');
    deleteRows_('Pegawai', [r]);
    resetCachePegawai_();
    return true;
  });
}

/** Impor banyak pegawai sekaligus (dari salin-tempel Excel). Data dengan NIP sama diperbarui. */
function imporPegawai_(p) {
  return withLock_(function () {
    var semua = rows_('Pegawai');
    var tambah = 0, ubah = 0, lewat = 0;
    (p.items || []).slice(0, 2000).forEach(function (it) {
      if (!clean_(it.nama)) { lewat++; return; }
      var nip = clean_(it.nip, 40).replace(/\s/g, '');
      var lama = semua.filter(function (r) {
        return nip ? r.nip === nip : normal_(r.nama) === normal_(it.nama);
      })[0];
      if (lama && lama._row < 0) { lewat++; return; }   // duplikat di dalam data impor
      var d = dataPegawai_(it, lama);
      if (lama) { updateRow_('Pegawai', lama._row, d); ubah++; }
      else { appendRow_('Pegawai', d); d._row = -1; semua.push(d); _idBaruImpor.push({ id: d.id }); tambah++; }
    });
    resetCachePegawai_();
    return { tambah: tambah, ubah: ubah, lewat: lewat };
  });
}


// ====== PENGATURAN (isian bawaan) ======
var PENGATURAN_AWAL = {
  pimpinanNama: 'Manjilala, S.Gz., M.Gizi',
  pimpinanNip: '19771009 200604 1 010',
  pimpinanJabatan: 'Ketua Jurusan Gizi',
  notulisNama: 'Aswita Amir, DCN, M.Si',
  notulisNip: '19770116 200112 2 003',
  notulisJabatan: 'Sekretaris Jurusan Gizi'
};
function pengaturan_() {
  var out = Object.assign({}, PENGATURAN_AWAL);
  rows_('Pengaturan').forEach(function (r) { if (r.kunci) out[r.kunci] = r.nilai; });
  return out;
}
function simpanPengaturan_(p, user) {
  wajibSuper_(user);
  return withLock_(function () {
    var rows = rows_('Pengaturan');
    Object.keys(PENGATURAN_AWAL).forEach(function (k) {
      if (p[k] === undefined) return;
      var v = clean_(p[k], 300);
      var row = rows.filter(function (r) { return r.kunci === k; })[0];
      var d = { kunci: k, nilai: v, diubahOleh: user.email, diubahPada: now_() };
      if (row) updateRow_('Pengaturan', row._row, d); else appendRow_('Pengaturan', d);
    });
    return pengaturan_();
  });
}

// ====== UNDANGAN (gambar hasil scan/foto/PDF yang diunggah) ======
function unggahUndangan_(p) {
  if (!p.data || p.data.indexOf('data:image/') !== 0) throw new Error('Undangan harus berupa gambar (PDF diubah otomatis oleh aplikasi).');
  var mime = p.data.slice(5, p.data.indexOf(';'));
  var bytes = Utilities.base64Decode(p.data.split(',')[1]);
  if (bytes.length > 6 * 1024 * 1024) throw new Error('Ukuran halaman undangan maksimal 6 MB.');
  var file = folder_().createFile(Utilities.newBlob(bytes, mime,
    'undangan_' + p.kegiatanId + '_' + uid_() + (mime === 'image/png' ? '.png' : '.jpg')));
  file.setDescription(clean_(p.nama, 200));
  return withLock_(function () {
    var k = rows_('Kegiatan').filter(function (r) { return r.id === p.kegiatanId; })[0];
    if (!k) { trashFile_(file.getId()); throw new Error('Kegiatan tidak ditemukan.'); }
    var ids = String(k.undanganIds || '').split(',').filter(String);
    ids.push(file.getId());
    k.undanganIds = ids.join(',');
    updateRow_('Kegiatan', k._row, k);
    return { id: file.getId(), jumlah: ids.length };
  });
}
function hapusUndangan_(p) {
  return withLock_(function () {
    var k = rows_('Kegiatan').filter(function (r) { return r.id === p.kegiatanId; })[0];
    if (!k) throw new Error('Kegiatan tidak ditemukan.');
    var ids = String(k.undanganIds || '').split(',').filter(String);
    if (p.semua) { ids.forEach(trashFile_); ids = []; }
    else { ids = ids.filter(function (id) { return id !== p.fileId; }); trashFile_(p.fileId); }
    k.undanganIds = ids.join(',');
    updateRow_('Kegiatan', k._row, k);
    return { jumlah: ids.length };
  });
}
function daftarUndangan_(p) {
  var k = rows_('Kegiatan').filter(function (r) { return r.id === p.kegiatanId; })[0];
  if (!k || !k.undanganIds) return [];
  return String(k.undanganIds).split(',').filter(String).map(function (id) {
    try {
      var f = DriveApp.getFileById(id);
      return { id: id, nama: f.getDescription() || '', mime: f.getMimeType(), data: Utilities.base64Encode(f.getBlob().getBytes()) };
    } catch (e) { return null; }
  }).filter(Boolean);
}
