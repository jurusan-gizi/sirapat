/* SIRAPAT – aplikasi utama (SPA + PWA) */
(function () {
  'use strict';
  var CFG = window.APP_CONFIG;
  var $app = document.getElementById('app');
  var state = { user: null, timer: null };

  // ================= util =================
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function toast(msg, type) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast show ' + (type || '');
    clearTimeout(t._h); t._h = setTimeout(function () { t.className = 'toast'; }, 3800);
  }
  function tgl(s, hari) { return window.Laporan.tglPanjang(s, hari); }
  function linkHadir(id) { return location.origin + location.pathname + '#/hadir/' + id; }
  function formData(form) {
    var o = {};
    $$('input,select,textarea', form).forEach(function (el) { if (el.name) o[el.name] = el.value; });
    return o;
  }
  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn._t = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span> ' + (label || 'Memproses…'); }
    else { btn.disabled = false; btn.innerHTML = btn._t || btn.innerHTML; }
  }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  // ================= API =================
  function api(action, payload, opts) {
    opts = opts || {};
    var body = { action: action, payload: payload || {} };
    if (!opts.publik) body.token = (state.user || {}).token;
    return fetch(CFG.API_URL, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (!res.ok) {
        if (/^AUTH:/.test(res.error)) { logout(true); }
        if (/^GANTI:/.test(res.error) && state.user) { simpanUser({ wajibGanti: true }); route(); }
        throw new Error(String(res.error).replace(/^(AUTH|GANTI):\s*/, ''));
      }
      return res.data;
    });
  }

  // ================= Auth (akun di Google Sheet) =================
  function loadUser() {
    var u = lsGet('sirapat_user', null);
    if (u && u.exp * 1000 > Date.now() + 60000) state.user = u; else state.user = null;
    renderUserBox();
  }
  function simpanUser(u) {
    state.user = Object.assign({}, state.user || {}, u);
    lsSet('sirapat_user', state.user);
    renderUserBox();
  }
  function logout(expired) {
    if (state.user && !expired) api('logout').catch(function () {});
    state.user = null; localStorage.removeItem('sirapat_user');
    renderUserBox();
    if (expired) toast('Sesi login berakhir, silakan login kembali.', 'warn');
    if (!/^#\/hadir\//.test(location.hash)) { if (location.hash && location.hash !== '#/') location.hash = '#/'; else route(); }
  }
  function renderUserBox() {
    var box = document.getElementById('userBox');
    if (!state.user) { box.innerHTML = ''; return; }
    var u = state.user, inisial = String(u.nama || u.email).replace(/^(dr|prof|ir|drs)\.?\s+/i, '').trim().charAt(0).toUpperCase();
    box.innerHTML = '<div class="menu-wrap"><button class="user" id="btnUser" aria-haspopup="true"><span class="avatar">' + esc(inisial) + '</span>' +
      '<span class="uname">' + esc(u.nama) + '</span><span class="caret">▾</span></button>' +
      '<div class="menu" id="menuUser" hidden><div class="menu-head"><b>' + esc(u.nama) + '</b><small>' + esc(u.email) + '</small>' +
      '<span class="tag">' + (u.peran === 'superadmin' ? 'Superadmin' : 'Admin') + '</span></div>' +
      '<a href="#/">🏠 Beranda</a><a href="#/pegawai">📇 Data Pegawai</a><a href="#/akun">🔑 Ganti Password</a>' +
      (u.peran === 'superadmin' ? '<a href="#/pengaturan">⚙️ Pengaturan</a><a href="#/admin">👥 Kelola Admin</a>' : '') +
      '<button id="btnLogout">↩ Keluar</button></div></div>';
    var menu = $('#menuUser');
    $('#btnUser').onclick = function (e) { e.stopPropagation(); menu.hidden = !menu.hidden; };
    document.addEventListener('click', function () { menu.hidden = true; }, { once: true });
    $('#btnLogout').onclick = function () { logout(); };
  }

  // ================= Router =================
  function route() {
    clearInterval(state.timer);
    window.scrollTo(0, 0);
    var h = location.hash.replace(/^#\/?/, '');
    var parts = h.split('/');
    document.body.classList.toggle('publik', parts[0] === 'hadir');
    if (parts[0] === 'hadir' && parts[1]) return viewHadir(parts[1]);
    loadUser();
    if (!state.user) return viewLogin();
    if (state.user.wajibGanti) return viewAkun(true);
    if (parts[0] === 'akun') return viewAkun(false);
    if (parts[0] === 'admin') return viewKelolaAdmin();
    if (parts[0] === 'pegawai') return viewPegawai();
    if (parts[0] === 'pengaturan') return viewPengaturan();
    if (parts[0] === 'kegiatan' && parts[1] === 'baru') return viewFormKegiatan(null);
    if (parts[0] === 'kegiatan' && parts[1] && parts[2] === 'edit') return viewFormKegiatan(parts[1]);
    if (parts[0] === 'kegiatan' && parts[1]) return viewDetail(parts[1], parts[2] || 'hadir');
    return viewDashboard();
  }
  window.addEventListener('hashchange', route);

  // ================= View: Login =================
  function viewLogin() {
    var ingat = lsGet('sirapat_email', '');
    $app.innerHTML =
      '<section class="hero">' +
      '<div class="hero-card">' +
      '<img src="' + esc(CFG.LOGO_H || CFG.LOGO) + '" alt="Kemenkes Poltekkes Makassar" class="hero-logo">' +
      '<p class="eyebrow">' + esc(CFG.NAMA_APLIKASI) + ' · ' + esc(CFG.INSTITUSI.nama) + '</p>' +
      '<h1>Presensi, notulen &amp;<br>tindak lanjut rapat<br><em>dalam satu tempat.</em></h1>' +
      '<form id="fLogin" class="login-form" autocomplete="on">' +
      '<label class="field"><span>Email</span><input type="email" name="email" required autocomplete="username" value="' + esc(ingat) + '" placeholder="nama@poltekkes-mks.ac.id"></label>' +
      '<label class="field"><span>Password</span><div class="pw"><input type="password" name="password" required autocomplete="current-password">' +
      '<button type="button" class="icon-btn lihat" tabindex="-1" title="Tampilkan">👁</button></div></label>' +
      '<button class="btn primary block lg" id="btnLogin">Masuk</button>' +
      '<p class="muted small">Akun admin dibuat oleh superadmin. Lupa password? Hubungi superadmin SIRAPAT untuk reset.</p></form>' +
      '<ul class="feat"><li><i>1</i>Buat kegiatan & bagikan QR daftar hadir</li><li><i>2</i>Peserta isi & tanda tangan langsung di HP</li>' +
      '<li><i>3</i>Tulis notulen, RTL & unggah dokumentasi</li><li><i>4</i>Evaluasi RTL rapat sebelumnya (siklus PPEPP)</li><li><i>5</i>Unduh laporan Word lengkap sekali klik</li></ul>' +
      '</div></section>';
    pasangLihatPw($app);
    var f = $('#fLogin');
    if (ingat) f.password.focus(); else f.email.focus();
    f.onsubmit = function (e) {
      e.preventDefault();
      var b = $('#btnLogin'); busy(b, true, 'Memeriksa…');
      api('login', { email: f.email.value.trim(), password: f.password.value }, { publik: true }).then(function (u) {
        lsSet('sirapat_email', u.email);
        state.user = null; simpanUser(u);
        toast('Selamat datang, ' + u.nama + '!', 'ok');
        route();
      }).catch(function (err) { busy(b, false); f.password.value = ''; f.password.focus(); toast(err.message, 'error'); });
    };
  }
  function pasangLihatPw(root) {
    $$('.pw .lihat', root).forEach(function (b) {
      b.onclick = function () { var i = b.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; };
    });
  }

  // ================= View: Ganti password =================
  function viewAkun(wajib) {
    var u = state.user;
    $app.innerHTML =
      (wajib ? '' : '<a class="back" href="#/">← Beranda</a>') +
      '<div class="narrow"><div class="pagehead"><div><p class="eyebrow">Akun saya</p><h2>' + (wajib ? 'Buat Password Baru' : 'Ganti Password') + '</h2></div></div>' +
      (wajib ? '<p class="hint warn">Anda masuk dengan <b>password sementara</b>. Demi keamanan, buat password baru sebelum melanjutkan.</p>' : '') +
      '<form class="card form" id="fPw">' +
      '<p class="muted small">' + esc(u.nama) + ' · ' + esc(u.email) + '</p>' +
      field(wajib ? 'Password sementara' : 'Password lama', '<div class="pw"><input type="password" name="lama" required autocomplete="current-password"><button type="button" class="icon-btn lihat" tabindex="-1">👁</button></div>') +
      field('Password baru', '<div class="pw"><input type="password" name="baru" required minlength="8" autocomplete="new-password"><button type="button" class="icon-btn lihat" tabindex="-1">👁</button></div>', 'Minimal 8 karakter, mengandung huruf dan angka.') +
      field('Ulangi password baru', '<input type="password" name="ulang" required autocomplete="new-password">') +
      '<div class="actions">' + (wajib ? '<button type="button" class="btn ghost" id="btnBatal">Keluar</button>' : '<span></span>') +
      '<button class="btn primary" id="btnPw">Simpan Password</button></div></form></div>';
    pasangLihatPw($app);
    if (wajib) $('#btnBatal').onclick = function () { logout(); };
    var f = $('#fPw');
    f.onsubmit = function (e) {
      e.preventDefault();
      if (f.baru.value !== f.ulang.value) return toast('Ulangan password baru tidak sama.', 'error');
      var b = $('#btnPw'); busy(b, true, 'Menyimpan…');
      api('gantiPassword', { lama: f.lama.value, baru: f.baru.value }).then(function () {
        simpanUser({ wajibGanti: false });
        toast('Password berhasil diganti.', 'ok');
        location.hash = '#/'; route();
      }).catch(function (err) { busy(b, false); toast(err.message, 'error'); });
    };
  }

  // ================= View: Kelola admin (superadmin) =================
  function viewKelolaAdmin() {
    if (state.user.peran !== 'superadmin') { location.hash = '#/'; return; }
    $app.innerHTML = '<a class="back" href="#/">← Beranda</a>' +
      '<div class="pagehead"><div><p class="eyebrow">Pengaturan</p><h2>Kelola Admin</h2></div>' +
      '<button class="btn primary" id="btnTambahAdmin">＋ Tambah Admin</button></div>' +
      '<div id="formAdmin"></div><div class="card"><div id="listAdmin"><div class="loader"><span></span></div></div></div>';
    $('#btnTambahAdmin').onclick = function () { formAdmin(null); };
    muatAdmin();
  }
  function muatAdmin() {
    api('daftarAdmin').then(function (list) {
      state.admins = list;
      $('#listAdmin').innerHTML = '<div class="tablewrap"><table class="tbl"><thead><tr><th>Nama / Email</th><th>Peran</th><th>Status</th><th>Login terakhir</th><th></th></tr></thead><tbody>' +
        list.map(function (a, i) {
          return '<tr><td><b>' + esc(a.nama) + '</b><br><small>' + esc(a.email) + (a.jabatan ? ' · ' + esc(a.jabatan) : '') + '</small></td>' +
            '<td><span class="tag">' + (a.peran === 'superadmin' ? 'Superadmin' : 'Admin') + '</span></td>' +
            '<td>' + (a.aktif ? '<span class="tag green">Aktif</span>' : '<span class="tag gray">Nonaktif</span>') +
            (a.wajibGanti ? '<br><small>menunggu ganti password</small>' : '') + '</td>' +
            '<td><small>' + esc(a.loginTerakhir || '–') + '</small></td>' +
            '<td class="aksi"><button class="btn ghost sm" data-edit="' + i + '">Ubah</button>' +
            '<button class="btn ghost sm" data-reset="' + i + '">Reset password</button></td></tr>';
        }).join('') + '</tbody></table></div>';
      $$('[data-edit]').forEach(function (b) { b.onclick = function () { formAdmin(state.admins[b.dataset.edit]); }; });
      $$('[data-reset]').forEach(function (b) {
        b.onclick = function () {
          var a = state.admins[b.dataset.reset];
          if (!confirm('Reset password ' + a.nama + '? Password lama tidak bisa dipakai lagi.')) return;
          busy(b, true, '…');
          api('resetPasswordAdmin', { email: a.email }).then(function (r) { busy(b, false); tampilPasswordSementara(a.nama, r.email, r.passwordSementara); muatAdmin(); })
            .catch(function (e) { busy(b, false); toast(e.message, 'error'); });
        };
      });
    }).catch(function (e) { $('#listAdmin').innerHTML = '<div class="empty small">' + esc(e.message) + '</div>'; });
  }
  function formAdmin(a) {
    var baru = !a; a = a || { peran: 'admin', aktif: true };
    $('#formAdmin').innerHTML = '<form class="card form" id="fAdm"><h3>' + (baru ? 'Tambah Admin' : 'Ubah Admin') + '</h3><div class="grid2">' +
      field('Email *', '<input type="email" name="email" required value="' + esc(a.email) + '"' + (baru ? '' : ' readonly') + '>') +
      field('Nama lengkap & gelar *', '<input name="nama" required value="' + esc(a.nama) + '">') +
      field('NIP', '<input name="nip" inputmode="numeric" value="' + esc(a.nip) + '">') +
      field('Jabatan', '<input name="jabatan" placeholder="mis. Sekretaris Jurusan" value="' + esc(a.jabatan) + '">') +
      field('Peran', '<select name="peran"><option value="admin"' + (a.peran !== 'superadmin' ? ' selected' : '') + '>Admin – kelola kegiatan, notulen, RTL, laporan</option>' +
        '<option value="superadmin"' + (a.peran === 'superadmin' ? ' selected' : '') + '>Superadmin – juga mengelola akun admin</option></select>') +
      field('Status', '<select name="aktif"><option value="ya"' + (a.aktif ? ' selected' : '') + '>Aktif</option><option value="tidak"' + (!a.aktif ? ' selected' : '') + '>Nonaktif (tidak bisa login)</option></select>') +
      '</div>' + (baru ? '<p class="hint">Password sementara akan dibuat otomatis dan ditampilkan sekali setelah disimpan.</p>' : '') +
      '<div class="actions"><button type="button" class="btn ghost" id="btnBatalAdm">Batal</button><button class="btn primary" id="btnSimpanAdm">Simpan</button></div></form>';
    $('#formAdmin').scrollIntoView({ behavior: 'smooth' });
    $('#btnBatalAdm').onclick = function () { $('#formAdmin').innerHTML = ''; };
    var f = $('#fAdm');
    f.onsubmit = function (e) {
      e.preventDefault();
      var d = formData(f); d.aktif = d.aktif === 'ya';
      var b = $('#btnSimpanAdm'); busy(b, true, 'Menyimpan…');
      api('simpanAdmin', d).then(function (r) {
        $('#formAdmin').innerHTML = '';
        if (r.passwordSementara) tampilPasswordSementara(r.admin.nama, r.admin.email, r.passwordSementara);
        else toast('Data admin tersimpan.', 'ok');
        muatAdmin();
      }).catch(function (err) { busy(b, false); toast(err.message, 'error'); });
    };
  }
  function tampilPasswordSementara(nama, email, pw) {
    var ov = document.createElement('div');
    ov.className = 'modal';
    var pesan = 'Akun SIRAPAT Anda:\nAlamat: ' + location.origin + location.pathname + '\nEmail: ' + email + '\nPassword sementara: ' + pw + '\n(Wajib diganti saat login pertama)';
    ov.innerHTML = '<div class="modal-box"><h3>Password sementara</h3><p class="muted small">Untuk <b>' + esc(nama) + '</b> (' + esc(email) + '). Catat atau kirim sekarang – password ini <b>tidak akan ditampilkan lagi</b>.</p>' +
      '<div class="pwbox">' + esc(pw) + '</div>' +
      '<div class="btnrow"><button class="btn sm" id="cpPw">Salin</button>' +
      '<a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(pesan) + '">Kirim via WhatsApp</a>' +
      '<button class="btn sm primary" id="tutupPw">Selesai</button></div></div>';
    document.body.appendChild(ov);
    $('#cpPw').onclick = function () { if (navigator.clipboard) navigator.clipboard.writeText(pw).then(function () { toast('Disalin.', 'ok'); }); };
    $('#tutupPw').onclick = function () { ov.remove(); };
  }

  // ================= View: Pengaturan (superadmin) =================
  function viewPengaturan() {
    if (state.user.peran !== 'superadmin') { location.hash = '#/'; return; }
    $app.innerHTML = '<a class="back" href="#/">← Beranda</a><div class="narrow"><div class="pagehead"><div><p class="eyebrow">Pengaturan</p><h2>Isian Bawaan Notulen</h2>' +
      '<p class="muted small">Otomatis terisi di setiap notulen baru (tetap bisa diganti per rapat). Ubah di sini bila periode jabatan berganti.</p></div></div>' +
      '<div id="pgBody"><div class="loader"><span></span></div></div></div>';
    api('getPengaturan').then(function (pg) {
      $('#pgBody').innerHTML = '<form class="card form" id="fPg">' +
        '<h3 class="sect">Pimpinan Rapat</h3>' +
        field('Nama & gelar', '<input name="pimpinanNama" value="' + esc(pg.pimpinanNama) + '">') +
        '<div class="grid2">' + field('NIP', '<input name="pimpinanNip" value="' + esc(pg.pimpinanNip) + '">') +
        field('Jabatan', '<input name="pimpinanJabatan" value="' + esc(pg.pimpinanJabatan) + '">') + '</div>' +
        '<h3 class="sect">Notulis</h3>' +
        field('Nama & gelar', '<input name="notulisNama" value="' + esc(pg.notulisNama) + '">') +
        '<div class="grid2">' + field('NIP', '<input name="notulisNip" value="' + esc(pg.notulisNip) + '">') +
        field('Jabatan', '<input name="notulisJabatan" value="' + esc(pg.notulisJabatan) + '">') + '</div>' +
        '<p class="muted small">Notulis juga dipakai sebagai penyusun Laporan Evaluasi RTL.</p>' +
        '<div class="actions"><span></span><button class="btn primary" id="btnPg">Simpan Pengaturan</button></div></form>';
      $('#fPg').onsubmit = function (e) {
        e.preventDefault();
        var b = $('#btnPg'); busy(b, true, 'Menyimpan…');
        api('simpanPengaturan', formData(this)).then(function () { busy(b, false); toast('Pengaturan tersimpan.', 'ok'); })
          .catch(function (err) { busy(b, false); toast(err.message, 'error'); });
      };
    }).catch(function (e) { $('#pgBody').innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
  }

  // ================= View: Data Pegawai =================
  function viewPegawai() {
    $app.innerHTML = '<a class="back" href="#/">← Beranda</a>' +
      '<div class="pagehead"><div><p class="eyebrow">Master data</p><h2>Data Pegawai</h2>' +
      '<p class="muted small">Nama & NIP di sini muncul sebagai pilihan di form daftar hadir. Peserta tetap bisa mengisi manual.</p></div>' +
      '<div class="btnrow"><button class="btn" id="btnImpor">⇪ Impor dari Excel</button><button class="btn primary" id="btnTambahPeg">＋ Tambah</button></div></div>' +
      '<div id="panelPeg"></div>' +
      '<div class="toolbar"><input type="search" id="cariPeg" class="input" placeholder="Cari nama / NIP / unit…"></div>' +
      '<div class="card"><div id="listPeg"><div class="loader"><span></span></div></div></div>';
    $('#btnTambahPeg').onclick = function () { formPegawai(null); };
    $('#btnImpor').onclick = formImpor;
    $('#cariPeg').oninput = function () { renderPegawai(); };
    muatPegawai();
  }
  function muatPegawai() {
    api('daftarPegawai').then(function (list) { state.pegawai = list; renderPegawai(); })
      .catch(function (e) { $('#listPeg').innerHTML = '<div class="empty small">' + esc(e.message) + '</div>'; });
  }
  function renderPegawai() {
    var q = ($('#cariPeg').value || '').toLowerCase();
    var list = state.pegawai.filter(function (p) { return (p.nama + ' ' + p.nip + ' ' + p.unitKerja + ' ' + p.jabatan).toLowerCase().indexOf(q) >= 0; });
    if (!state.pegawai.length) {
      $('#listPeg').innerHTML = '<div class="empty small"><b>Belum ada data pegawai.</b><br>Klik “Impor dari Excel” untuk memasukkan banyak nama sekaligus.</div>';
      return;
    }
    $('#listPeg').innerHTML = '<p class="muted small">' + list.length + ' dari ' + state.pegawai.length + ' pegawai</p>' +
      '<div class="tablewrap"><table class="tbl"><thead><tr><th>#</th><th>Nama / NIP</th><th>Jabatan / Unit</th><th>Status</th><th></th></tr></thead><tbody>' +
      list.map(function (p, i) {
        return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(p.nama) + '</b><br><small>' + esc(p.nip || '–') + '</small></td>' +
          '<td>' + esc(p.jabatan || '–') + '<br><small>' + esc(p.unitKerja) + '</small></td>' +
          '<td>' + (p.aktif === 'tidak' ? '<span class="tag gray">Nonaktif</span>' : '<span class="tag green">Aktif</span>') + '</td>' +
          '<td class="aksi"><button class="btn ghost sm" data-ubah="' + esc(p.id) + '">Ubah</button>' +
          '<button class="icon-btn" data-hapus="' + esc(p.id) + '" title="Hapus">✕</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    var byId = function (id) { return state.pegawai.filter(function (p) { return p.id === id; })[0]; };
    $$('[data-ubah]').forEach(function (b) { b.onclick = function () { formPegawai(byId(b.dataset.ubah)); }; });
    $$('[data-hapus]').forEach(function (b) {
      b.onclick = function () {
        var p = byId(b.dataset.hapus);
        if (!confirm('Hapus ' + p.nama + ' dari Data Pegawai?\n(Daftar hadir yang sudah ada tidak terpengaruh.)')) return;
        api('hapusPegawai', { id: p.id }).then(function () { toast('Data dihapus.', 'ok'); muatPegawai(); })
          .catch(function (e) { toast(e.message, 'error'); });
      };
    });
  }
  function formPegawai(p) {
    var baru = !p; p = p || { aktif: 'ya' };
    $('#panelPeg').innerHTML = '<form class="card form" id="fPeg"><h3>' + (baru ? 'Tambah Pegawai' : 'Ubah Data Pegawai') + '</h3>' +
      field('Nama lengkap & gelar *', '<input name="nama" required value="' + esc(p.nama) + '">') +
      '<div class="grid2">' +
      field('NIP', '<input name="nip" inputmode="numeric" value="' + esc(p.nip) + '">') +
      field('No. HP', '<input name="noHp" type="tel" value="' + esc(p.noHp) + '">') +
      field('Jabatan', '<input name="jabatan" placeholder="mis. Dosen / Lektor" value="' + esc(p.jabatan) + '">') +
      field('Unit kerja', '<input name="unitKerja" placeholder="mis. Jurusan Gizi" value="' + esc(p.unitKerja) + '">') +
      field('Status', '<select name="aktif"><option value="ya"' + (p.aktif !== 'tidak' ? ' selected' : '') + '>Aktif (muncul di pilihan)</option>' +
        '<option value="tidak"' + (p.aktif === 'tidak' ? ' selected' : '') + '>Nonaktif (pensiun/pindah)</option></select>') +
      '</div><div class="actions"><button type="button" class="btn ghost" id="btnBatalPeg">Batal</button><button class="btn primary" id="btnSimpanPeg">Simpan</button></div></form>';
    $('#panelPeg').scrollIntoView({ behavior: 'smooth' });
    $('#btnBatalPeg').onclick = function () { $('#panelPeg').innerHTML = ''; };
    $('#fPeg').onsubmit = function (e) {
      e.preventDefault();
      var d = formData(this); if (!baru) d.id = p.id;
      var b = $('#btnSimpanPeg'); busy(b, true, 'Menyimpan…');
      api('simpanPegawai', d).then(function () { $('#panelPeg').innerHTML = ''; toast('Data pegawai tersimpan.', 'ok'); muatPegawai(); })
        .catch(function (err) { busy(b, false); toast(err.message, 'error'); });
    };
  }
  function formImpor() {
    $('#panelPeg').innerHTML = '<div class="card form"><h3>Impor dari Excel / Google Sheets</h3>' +
      '<ol class="small muted"><li>Siapkan kolom berurutan: <b>Nama | NIP | Jabatan | Unit Kerja | No HP</b> (kolom yang kosong boleh dibiarkan).</li>' +
      '<li>Blok baris datanya di Excel, tekan <b>Ctrl+C</b>, lalu tempel (<b>Ctrl+V</b>) di kotak di bawah.</li>' +
      '<li>Pegawai dengan NIP yang sudah ada akan diperbarui, bukan digandakan.</li></ol>' +
      '<textarea id="txtImpor" rows="8" class="input mono" placeholder="Manjilala, S.Gz., M.Gizi&#9;197710092003041010&#9;Dosen&#9;Jurusan Gizi"></textarea>' +
      '<div id="prevImpor" class="small muted"></div>' +
      '<div class="actions"><button type="button" class="btn ghost" id="btnBatalImp">Batal</button><button class="btn primary" id="btnImporGo" disabled>Impor</button></div></div>';
    $('#panelPeg').scrollIntoView({ behavior: 'smooth' });
    var items = [];
    $('#txtImpor').oninput = function () {
      items = this.value.replace(/\r/g, '').split('\n').map(function (ln) {
        var c = ln.indexOf('\t') >= 0 ? ln.split('\t') : ln.split(';');
        c = c.map(function (x) { return x.trim().replace(/^"|"$/g, ''); });
        return { nama: c[0] || '', nip: (c[1] || '').replace(/[^0-9]/g, ''), jabatan: c[2] || '', unitKerja: c[3] || '', noHp: c[4] || '' };
      }).filter(function (r, i) { return r.nama && !(i === 0 && /^nama/i.test(r.nama)); });
      $('#prevImpor').innerHTML = items.length ? '<b>' + items.length + ' baris siap diimpor.</b> Contoh: ' +
        items.slice(0, 3).map(function (r) { return esc(r.nama) + (r.nip ? ' (' + esc(r.nip) + ')' : ''); }).join('; ') +
        (items.some(function (r) { return !r.nip; }) ? '<br>⚠ Ada baris tanpa NIP – akan dicocokkan berdasarkan nama.' : '') : '';
      $('#btnImporGo').disabled = !items.length;
    };
    $('#btnBatalImp').onclick = function () { $('#panelPeg').innerHTML = ''; };
    $('#btnImporGo').onclick = function () {
      var b = this; busy(b, true, 'Mengimpor…');
      api('imporPegawai', { items: items }).then(function (r) {
        $('#panelPeg').innerHTML = '';
        toast('Impor selesai: ' + r.tambah + ' baru, ' + r.ubah + ' diperbarui' + (r.lewat ? ', ' + r.lewat + ' dilewati' : '') + '.', 'ok');
        muatPegawai();
      }).catch(function (e) { busy(b, false); toast(e.message, 'error'); });
    };
  }

  // ================= View: Dashboard =================
  function viewDashboard() {
    $app.innerHTML =
      '<div class="pagehead"><div><p class="eyebrow">Beranda</p><h2>Kegiatan</h2></div>' +
      '<a class="btn primary" href="#/kegiatan/baru">＋ Kegiatan Baru</a></div>' +
      '<div class="toolbar"><input type="search" id="cari" placeholder="Cari kegiatan…" class="input"></div>' +
      '<div id="list" class="cards"><div class="skeleton"></div><div class="skeleton"></div></div>';
    api('daftarKegiatan').then(function (rows) {
      lsSet('sirapat_cache_list', rows);
      renderList(rows);
      $('#cari').oninput = function () {
        var q = this.value.toLowerCase();
        renderList(rows.filter(function (r) { return (r.judul + r.tempat + r.jenis).toLowerCase().indexOf(q) >= 0; }));
      };
    }).catch(function (e) {
      var cache = lsGet('sirapat_cache_list', null);
      if (cache) { renderList(cache); toast('Menampilkan data tersimpan (offline).', 'warn'); }
      else $('#list').innerHTML = '<div class="empty">Gagal memuat: ' + esc(e.message) + '</div>';
    });
  }
  function renderList(rows) {
    if (!rows.length) {
      $('#list').innerHTML = '<div class="empty"><b>Belum ada kegiatan.</b><br>Klik “Kegiatan Baru” untuk membuat daftar hadir pertama.</div>';
      return;
    }
    $('#list').innerHTML = rows.map(function (k) {
      var d = parseDate(k.tanggal);
      return '<a class="card kcard" href="#/kegiatan/' + esc(k.id) + '">' +
        '<div class="date"><b>' + (d ? d.getDate() : '–') + '</b><span>' + (d ? BLN[d.getMonth()] : '') + '</span><small>' + (d ? d.getFullYear() : '') + '</small></div>' +
        '<div class="kbody"><div class="tags"><span class="tag">' + esc(k.jenis || 'Kegiatan') + '</span>' +
        (k.status === 'tutup' ? '<span class="tag gray">Ditutup</span>' : '<span class="tag green">Aktif</span>') + '</div>' +
        '<h3>' + esc(k.judul) + '</h3><p class="muted">' + esc(k.tempat || '-') + (k.waktuMulai ? ' · ' + esc(k.waktuMulai) + ' WITA' : '') + '</p>' +
        '<div class="stats"><span>👥 ' + k.jumlahHadir + ' hadir</span><span>' + (k.adaNotulen ? '📝 Notulen ✓' : '📝 Notulen –') + '</span></div></div></a>';
    }).join('');
  }
  var BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  function parseDate(s) { var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }

  // ================= View: Form kegiatan =================
  function viewFormKegiatan(id) {
    var load = id ? api('detailKegiatan', { id: id }).then(function (d) { return d.kegiatan; }) : Promise.resolve({
      tanggal: new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10), waktuMulai: '09:00', waktuSelesai: '12:00', jenis: 'Rapat', status: 'aktif'
    });
    $app.innerHTML = '<div class="loader"><span></span></div>';
    load.then(function (k) {
      $app.innerHTML =
        '<a class="back" href="' + (id ? '#/kegiatan/' + esc(id) : '#/') + '">← Kembali</a>' +
        '<div class="pagehead"><div><p class="eyebrow">' + (id ? 'Ubah' : 'Buat') + ' kegiatan</p><h2>' + (id ? 'Edit Kegiatan' : 'Kegiatan Baru') + '</h2></div></div>' +
        '<form class="card form" id="fk">' +
        field('Judul / Nama Kegiatan *', '<textarea name="judul" rows="2" required placeholder="mis. Rapat Koordinasi Persiapan Akreditasi">' + esc(k.judul) + '</textarea>') +
        '<div class="grid2">' +
        field('Jenis Kegiatan', '<select name="jenis">' + CFG.JENIS_KEGIATAN.concat(k.jenis && CFG.JENIS_KEGIATAN.indexOf(k.jenis) < 0 ? [k.jenis] : []).map(function (j) { return '<option' + (j === k.jenis ? ' selected' : '') + '>' + esc(j) + '</option>'; }).join('') + '</select>') +
        field('Tanggal *', '<input type="date" name="tanggal" required value="' + esc(k.tanggal) + '">') +
        field('Waktu Mulai', '<input type="time" name="waktuMulai" value="' + esc(k.waktuMulai) + '">') +
        field('Waktu Selesai', '<input type="time" name="waktuSelesai" value="' + esc(k.waktuSelesai) + '">') +
        '</div>' +
        field('Tempat', '<input name="tempat" placeholder="mis. Aula Lt. 3 Kampus Wijaya Kusuma" value="' + esc(k.tempat) + '">') +
        field('Penyelenggara / Unit', '<input name="penyelenggara" placeholder="mis. Jurusan Gizi" value="' + esc(k.penyelenggara) + '">') +
        field('Deskripsi / Agenda singkat', '<textarea name="deskripsi" rows="3" placeholder="Opsional">' + esc(k.deskripsi) + '</textarea>') +
        (id ? field('Status Daftar Hadir', '<select name="status"><option value="aktif"' + (k.status !== 'tutup' ? ' selected' : '') + '>Aktif (menerima isian)</option><option value="tutup"' + (k.status === 'tutup' ? ' selected' : '') + '>Ditutup</option></select>') : '') +
        '<div class="actions">' + (id ? '<button type="button" class="btn danger ghost" id="btnHapus">Hapus kegiatan</button>' : '<span></span>') +
        '<button class="btn primary" id="btnSimpan">Simpan & Buat Form Daftar Hadir</button></div></form>';
      $('#fk').onsubmit = function (e) {
        e.preventDefault();
        var d = formData(this); if (id) d.id = id;
        var b = $('#btnSimpan'); busy(b, true, 'Menyimpan…');
        api('simpanKegiatan', d).then(function (res) {
          toast('Kegiatan tersimpan.', 'ok'); location.hash = '#/kegiatan/' + res.id;
        }).catch(function (err) { busy(b, false); toast(err.message, 'error'); });
      };
      if (id) $('#btnHapus').onclick = function () {
        if (!confirm('Hapus kegiatan ini beserta seluruh daftar hadir, notulen, dan foto? Tindakan ini tidak bisa dibatalkan.')) return;
        busy(this, true, 'Menghapus…');
        api('hapusKegiatan', { id: id }).then(function () { toast('Kegiatan dihapus.', 'ok'); location.hash = '#/'; })
          .catch(function (err) { toast(err.message, 'error'); });
      };
    }).catch(function (e) { $app.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
  }
  function field(label, control, hint) {
    return '<label class="field"><span>' + label + '</span>' + control + (hint ? '<small>' + hint + '</small>' : '') + '</label>';
  }

  // ================= View: Detail kegiatan =================
  function viewDetail(id, tab) {
    $app.innerHTML = '<div class="loader"><span></span></div>';
    api('detailKegiatan', { id: id }).then(function (d) {
      state.detail = d;
      var k = d.kegiatan;
      $app.innerHTML =
        '<a class="back" href="#/">← Semua kegiatan</a>' +
        '<div class="khead card"><div><div class="tags"><span class="tag">' + esc(k.jenis || 'Kegiatan') + '</span>' +
        (k.status === 'tutup' ? '<span class="tag gray">Daftar hadir ditutup</span>' : '<span class="tag green">Menerima isian</span>') + '</div>' +
        '<h2>' + esc(k.judul) + '</h2><p class="muted">📅 ' + esc(tgl(k.tanggal, true)) +
        (k.waktuMulai ? ' · 🕘 ' + esc(k.waktuMulai) + (k.waktuSelesai ? '–' + esc(k.waktuSelesai) : '') + ' WITA' : '') +
        (k.tempat ? ' · 📍 ' + esc(k.tempat) : '') + '</p></div>' +
        '<div class="btnrow"><a class="btn sm' + (d.jumlahUndangan ? ' ghost' : ' primary') + '" href="#/kegiatan/' + esc(id) + '/laporan">📨 ' +
        (d.jumlahUndangan ? 'Undangan ✓' : 'Unggah Undangan') + '</a><a class="btn ghost sm" href="#/kegiatan/' + esc(id) + '/edit">✎ Edit</a></div></div>' +
        '<nav class="tabs">' +
        ['hadir:👥 Daftar Hadir', 'notulen:📝 Notulen & RTL', 'laporan:📄 Dokumen Rapat', 'evaluasi:🔁 Evaluasi RTL'].map(function (t) {
          var p = t.split(':');
          return '<a href="#/kegiatan/' + esc(id) + '/' + p[0] + '" class="' + (tab === p[0] ? 'on' : '') + '">' + p[1] + '</a>';
        }).join('') + '</nav><div id="tabBody"></div>';
      if (tab === 'notulen') tabNotulen(d);
      else if (tab === 'evaluasi') tabEvaluasi(d);
      else if (tab === 'laporan') tabLaporan(d);
      else tabHadir(d);
    }).catch(function (e) { $app.innerHTML = '<a class="back" href="#/">← Kembali</a><div class="empty">' + esc(e.message) + '</div>'; });
  }

  // ---- Tab daftar hadir ----
  function tabHadir(d) {
    var k = d.kegiatan, link = linkHadir(k.id);
    var qr = 'https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=12&data=' + encodeURIComponent(link);
    $('#tabBody').innerHTML =
      '<div class="grid-side">' +
      '<div class="card share"><h3>Bagikan Form Daftar Hadir</h3>' +
      '<img class="qr" src="' + qr + '" alt="QR Code daftar hadir" crossorigin="anonymous">' +
      '<div class="linkbox"><input readonly value="' + esc(link) + '" id="lnk"><button class="btn sm" id="btnCopy">Salin</button></div>' +
      '<div class="btnrow"><a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/?text=' +
      encodeURIComponent('Silakan isi daftar hadir ' + k.judul + ' melalui tautan berikut:\n' + link) + '">Kirim via WhatsApp</a>' +
      '<a class="btn sm" href="' + qr + '" download="QR-daftar-hadir.png" target="_blank" rel="noopener">Unduh QR</a>' +
      '<button class="btn sm" id="btnLayar">Tampilkan di Layar</button></div></div>' +
      '<div class="card"><div class="cardhead"><h3>Peserta Hadir <span class="count" id="cnt">' + d.hadir.length + '</span></h3>' +
      '<button class="btn ghost sm" id="btnRefresh">↻ Muat ulang</button></div>' +
      '<div id="tblHadir"></div></div></div>';
    renderHadir(d.hadir);
    $('#btnCopy').onclick = function () {
      (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { toast('Tautan disalin.', 'ok'); })
        .catch(function () { $('#lnk').select(); document.execCommand('copy'); toast('Tautan disalin.', 'ok'); });
    };
    $('#btnLayar').onclick = function () { layarPenuh(k, qr, link); };
    var refresh = function () {
      api('detailKegiatan', { id: k.id }).then(function (nd) { state.detail = nd; renderHadir(nd.hadir); $('#cnt').textContent = nd.hadir.length; }).catch(function () {});
    };
    $('#btnRefresh').onclick = refresh;
    state.timer = setInterval(function () { if (!document.hidden) refresh(); }, 20000);
  }
  function renderHadir(list) {
    var el = $('#tblHadir'); if (!el) return;
    if (!list.length) { el.innerHTML = '<div class="empty small">Belum ada peserta yang mengisi. Daftar ini diperbarui otomatis.</div>'; return; }
    el.innerHTML = '<div class="tablewrap"><table class="tbl"><thead><tr><th>#</th><th>Nama / NIP</th><th>Jabatan / Unit</th><th>Waktu</th><th></th></tr></thead><tbody>' +
      list.map(function (h, i) {
        return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(h.nama) + '</b><br><small>' + esc(h.nipNim) + '</small></td>' +
          '<td>' + esc(h.jabatan) + '<br><small>' + esc(h.unitKerja) + '</small></td><td><small>' + esc(String(h.waktu).slice(11, 16)) + '</small></td>' +
          '<td class="aksi">' + (h.pegawaiId ? '' : '<button class="btn ghost sm" data-peg="' + i + '" title="Simpan ke Data Pegawai agar lain kali bisa dipilih">＋ Data Pegawai</button>') +
          '<button class="icon-btn" data-del="' + esc(h.id) + '" title="Hapus">✕</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    $$('[data-peg]', el).forEach(function (b) {
      b.onclick = function () {
        var h = list[b.dataset.peg];
        if (!confirm('Simpan "' + h.nama + '" ke Data Pegawai?\nLain kali cukup dipilih di form daftar hadir.')) return;
        busy(b, true, '…');
        api('simpanPegawai', { nama: h.nama, nip: h.nipNim, jabatan: h.jabatan, unitKerja: h.unitKerja, noHp: h.noHp })
          .then(function () { b.remove(); toast(h.nama + ' disimpan ke Data Pegawai.', 'ok'); })
          .catch(function (e) { busy(b, false); toast(e.message, 'error'); });
      };
    });
    $$('[data-del]', el).forEach(function (b) {
      b.onclick = function () {
        if (!confirm('Hapus data kehadiran ini?')) return;
        api('hapusHadir', { id: b.dataset.del }).then(function () {
          toast('Data dihapus.', 'ok');
          state.detail.hadir = state.detail.hadir.filter(function (x) { return x.id !== b.dataset.del; });
          renderHadir(state.detail.hadir); $('#cnt').textContent = state.detail.hadir.length;
        }).catch(function (e) { toast(e.message, 'error'); });
      };
    });
  }
  function layarPenuh(k, qr, link) {
    var ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = '<div class="present"><img src="' + esc(CFG.LOGO) + '" class="plogo" alt=""><p class="eyebrow">Daftar Hadir</p><h1>' + esc(k.judul) + '</h1>' +
      '<p>' + esc(tgl(k.tanggal, true)) + (k.tempat ? ' · ' + esc(k.tempat) : '') + '</p><img src="' + qr + '" class="pqr" alt="QR">' +
      '<p class="plink">Pindai QR atau buka:<br><b>' + esc(link) + '</b></p><button class="btn" id="tutupOv">Tutup</button></div>';
    document.body.appendChild(ov);
    if (ov.requestFullscreen) ov.requestFullscreen().catch(function () {});
    $('#tutupOv').onclick = function () { if (document.fullscreenElement) document.exitFullscreen(); ov.remove(); };
  }

  // ---- Tab notulen & RTL ----
  var NOTULEN_FIELDS = [
    ['agenda', 'Agenda / Susunan Acara', 4, 'mis. 1. Pembukaan  2. Evaluasi RTL  3. Diskusi  4. Penutup'],
    ['pembahasan', 'Hasil Pembahasan / Jalannya Rapat', 8, 'Uraikan poin-poin pembahasan.'],
    ['keputusan', 'Keputusan / Kesepakatan', 4, '']
  ];
  function textareaFields(list, n) {
    return list.map(function (f) {
      return field(f[1], '<textarea name="' + f[0] + '" rows="' + f[2] + '">' + esc(n[f[0]]) + '</textarea>', f[3]);
    }).join('');
  }
  function rtlRow(r, i) {
    r = r || {};
    return '<div class="rtl-row" data-id="' + esc(r.id || '') + '" data-asal="' + esc(r.asalRtlId || '') + '" data-asaljudul="' + esc(r.asalJudul || '') + '">' +
      '<div class="rtl-no">' + (i + 1) + '</div><div class="rtl-body">' +
      (r.asalJudul ? '<span class="tag lime">↩ Lanjutan dari ' + esc(r.asalJudul) + '</span>' : '') +
      '<textarea data-f="uraian" rows="2" placeholder="Uraian rencana tindak lanjut">' + esc(r.uraian) + '</textarea>' +
      '<div class="grid3"><label><small>Penanggung jawab</small><input data-f="pj" value="' + esc(r.pj) + '" placeholder="mis. Ketua Prodi"></label>' +
      '<label><small>Tenggat</small><input type="date" data-f="tenggat" value="' + esc(r.tenggat) + '"></label>' +
      '<label><small>Target / indikator</small><input data-f="target" value="' + esc(r.target) + '" placeholder="mis. Dokumen 100% lengkap"></label></div>' +
      '</div><button type="button" class="icon-btn" data-hapus-rtl title="Hapus RTL">✕</button></div>';
  }
  function kumpulkanRtl() {
    return $$('#rtlList .rtl-row').map(function (row) {
      var o = { id: row.dataset.id, asalRtlId: row.dataset.asal, asalJudul: row.dataset.asaljudul };
      $$('[data-f]', row).forEach(function (el) { o[el.dataset.f] = el.value; });
      return o;
    });
  }
  function renderRtl(list) {
    var el = $('#rtlList');
    el.innerHTML = list.length ? list.map(rtlRow).join('') : '<div class="empty small">Belum ada RTL. Klik “＋ Tambah RTL”.</div>';
    $$('[data-hapus-rtl]', el).forEach(function (b) {
      b.onclick = function () {
        var cur = kumpulkanRtl(), idx = $$('#rtlList .rtl-row').indexOf(b.closest('.rtl-row'));
        if (cur[idx].uraian && !confirm('Hapus RTL ini?')) return;
        cur.splice(idx, 1); renderRtl(cur); $('#fn').oninput();
      };
    });
  }

  function tabNotulen(d) {
    var n = Object.assign({}, d.notulen || {}), kid = d.kegiatan.id;
    var rtl = (d.rtl || []).slice();
    // isian bawaan pimpinan rapat & notulis (menu Pengaturan)
    var pg = d.pengaturan || {};
    if (!n.pimpinanRapat && !n.notulis) {
      n.pimpinanRapat = pg.pimpinanNama; n.nipPimpinan = pg.pimpinanNip; n.jabatanPimpinan = pg.pimpinanJabatan;
      n.notulis = pg.notulisNama; n.nipNotulis = pg.notulisNip; n.jabatanNotulis = pg.notulisJabatan;
    }
    var draft = lsGet('sirapat_draft_' + kid, null);
    var savedT = n.diubahPada ? Date.parse(String(n.diubahPada).replace(' ', 'T') + '+08:00') || 0 : 0;
    if (draft && draft.t > savedT) {
      Object.assign(n, draft.data); if (draft.rtl) rtl = draft.rtl;
      setTimeout(function () { toast('Draf yang belum tersimpan dipulihkan.', 'warn'); }, 300);
    }
    $('#tabBody').innerHTML =
      '<form class="card form" id="fn">' +
      '<p class="hint">💡 Tips: satu baris = satu paragraf. Awali baris dengan <code>1.</code> untuk daftar bernomor atau <code>-</code> untuk poin. Draf tersimpan otomatis di perangkat ini.</p>' +
      '<h3 class="sect">Pimpinan & Notulis</h3><div class="grid2">' +
      field('Nama Pimpinan Rapat', '<input name="pimpinanRapat" value="' + esc(n.pimpinanRapat) + '">') +
      field('NIP Pimpinan', '<input name="nipPimpinan" inputmode="numeric" value="' + esc(n.nipPimpinan) + '">') +
      field('Jabatan Pimpinan', '<input name="jabatanPimpinan" placeholder="mis. Ketua Jurusan Gizi" value="' + esc(n.jabatanPimpinan) + '">') +
      '<span></span>' +
      field('Nama Notulis', '<input name="notulis" value="' + esc(n.notulis) + '">') +
      field('NIP Notulis', '<input name="nipNotulis" inputmode="numeric" value="' + esc(n.nipNotulis) + '">') +
      field('Jabatan Notulis', '<input name="jabatanNotulis" placeholder="mis. Sekretaris Jurusan Gizi" value="' + esc(n.jabatanNotulis) + '">') +
      '</div><p class="muted small">Terisi otomatis dari menu Pengaturan; ubah bila rapat dipimpin/dinotulis orang lain.</p><h3 class="sect">Isi Notulen</h3>' + textareaFields(NOTULEN_FIELDS, n) +
      '<h3 class="sect">Rencana Tindak Lanjut (RTL) <span class="tag">Penetapan</span></h3>' +
      '<p class="muted small">RTL akan dievaluasi pada rapat berikutnya melalui menu <b>Evaluasi RTL</b>.</p>' +
      '<div id="rtlList" class="rtl-list"></div>' +
      '<button type="button" class="btn sm" id="btnTambahRtl">＋ Tambah RTL</button>' +
      '<div class="actions sticky"><small class="muted" id="savedInfo">' + (n.diubahPada ? 'Tersimpan ' + esc(n.diubahPada) : 'Belum disimpan') + '</small>' +
      '<button class="btn primary" id="btnSN">Simpan Notulen & RTL</button></div></form>' +
      '<div class="card"><div class="cardhead"><h3>📷 Foto Dokumentasi <span class="tag">G</span></h3>' +
      '<label class="btn sm primary">＋ Tambah Foto<input type="file" accept="image/*" multiple hidden id="inFoto"></label></div>' +
      '<div id="fotoGrid" class="fotogrid"><div class="empty small">Memuat foto…</div></div></div>';
    renderRtl(rtl);
    var form = $('#fn');
    form.oninput = function () {
      lsSet('sirapat_draft_' + kid, { t: Date.now(), data: formData(form), rtl: kumpulkanRtl() });
      $('#savedInfo').textContent = 'Ada perubahan belum disimpan';
    };
    $('#btnTambahRtl').onclick = function () {
      var cur = kumpulkanRtl(); cur.push({}); renderRtl(cur);
      var rows = $$('#rtlList textarea'); rows[rows.length - 1].focus();
    };
    form.onsubmit = function (e) {
      e.preventDefault();
      var b = $('#btnSN'); busy(b, true, 'Menyimpan…');
      var data = {}; $$('[name]', form).forEach(function (el) { data[el.name] = el.value; });
      data.kegiatanId = kid;
      var items = kumpulkanRtl().filter(function (r) { return r.uraian && r.uraian.trim(); });
      api('simpanNotulen', data).then(function (res) {
        d.notulen = res;
        return api('simpanRtl', { kegiatanId: kid, items: items });
      }).then(function (list) {
        busy(b, false); localStorage.removeItem('sirapat_draft_' + kid);
        d.rtl = list; renderRtl(list);
        $('#savedInfo').textContent = 'Tersimpan ' + d.notulen.diubahPada; toast('Notulen & ' + list.length + ' RTL tersimpan.', 'ok');
      }).catch(function (err) { busy(b, false); toast(err.message, 'error'); });
    };
    muatFoto(kid);
    $('#inFoto').onchange = function () {
      var files = Array.prototype.slice.call(this.files); this.value = '';
      var chain = Promise.resolve();
      files.forEach(function (f, i) {
        chain = chain.then(function () {
          var ket = prompt('Keterangan foto ' + (i + 1) + ' dari ' + files.length + ' (opsional):', '') || '';
          toast('Mengunggah foto ' + (i + 1) + '/' + files.length + '…');
          return kecilkanGambar(f, 1600, 0.82).then(function (dataUrl) {
            return api('unggahFoto', { kegiatanId: kid, data: dataUrl, keterangan: ket });
          });
        });
      });
      chain.then(function () { toast('Foto berhasil diunggah.', 'ok'); muatFoto(kid); })
        .catch(function (e) { toast(e.message, 'error'); muatFoto(kid); });
    };
  }
  function muatFoto(kid) {
    api('daftarFoto', { kegiatanId: kid }).then(function (list) {
      var g = $('#fotoGrid'); if (!g) return;
      if (!list.length) { g.innerHTML = '<div class="empty small">Belum ada foto dokumentasi.</div>'; return; }
      g.innerHTML = list.map(function (f) {
        return '<figure><img src="data:' + esc(f.mime) + ';base64,' + f.data + '" alt=""><figcaption>' + esc(f.keterangan || '–') +
          '</figcaption><button class="icon-btn" data-foto="' + esc(f.id) + '" title="Hapus">✕</button></figure>';
      }).join('');
      $$('[data-foto]', g).forEach(function (b) {
        b.onclick = function () {
          if (!confirm('Hapus foto ini?')) return;
          api('hapusFoto', { kegiatanId: kid, fotoId: b.dataset.foto }).then(function () { toast('Foto dihapus.', 'ok'); muatFoto(kid); })
            .catch(function (e) { toast(e.message, 'error'); });
        };
      });
    }).catch(function (e) { var g = $('#fotoGrid'); if (g) g.innerHTML = '<div class="empty small">' + esc(e.message) + '</div>'; });
  }
  function kecilkanGambar(file, max, q) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var s = Math.min(1, max / Math.max(im.width, im.height));
        var c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q));
      };
      im.onerror = function () { rej(new Error('File bukan gambar yang valid.')); };
      im.src = url;
    });
  }
  function bacaFile(file) {
    if (/^image\//.test(file.type)) return kecilkanGambar(file, 1600, 0.82);
    return new Promise(function (res, rej) {
      var fr = new FileReader(); fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(new Error('Gagal membaca berkas.')); }; fr.readAsDataURL(file);
    });
  }

  // ---- Tab evaluasi RTL (Evaluasi – Pengendalian – Peningkatan) ----
  var STATUS = ['Selesai', 'Proses', 'Belum', 'Tidak relevan'];
  function tabEvaluasi(d) {
    var kid = d.kegiatan.id;
    $('#tabBody').innerHTML = '<div class="loader"><span></span></div>';
    Promise.all([api('dataEvaluasi', { kegiatanId: kid }), api('daftarKegiatan')]).then(function (r) {
      renderEvaluasi(d, r[0], r[1]);
    }).catch(function (e) { $('#tabBody').innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
  }

  function renderEvaluasi(d, ev, semua) {
    var k = d.kegiatan, kid = k.id;
    var dipilih = ev.sumberIds || [];
    var kandidat = semua.filter(function (x) {
      return x.id !== kid && ((x.jumlahRtl > 0 && x.tanggal <= k.tanggal) || dipilih.indexOf(x.id) >= 0);
    }).sort(function (a, b) { return b.tanggal.localeCompare(a.tanggal); });
    var noUrut = 0;

    var html =
      '<div class="ppepp"><span class="on">Penetapan</span><span class="on">Pelaksanaan</span><span class="cur">Evaluasi</span><span class="cur">Pengendalian</span><span class="cur">Peningkatan</span></div>' +
      '<div class="card"><h3>1. Pilih rapat yang RTL-nya dievaluasi</h3>' +
      '<p class="muted small">Boleh memilih lebih dari satu rapat, misalnya dua rapat bulanan sebelumnya.</p>' +
      (kandidat.length ? '<div class="pilih-rapat">' + kandidat.map(function (x) {
        return '<label class="opt"><input type="checkbox" value="' + esc(x.id) + '"' + (dipilih.indexOf(x.id) >= 0 ? ' checked' : '') + '>' +
          '<span><b>' + esc(x.judul) + '</b><small>' + esc(tgl(x.tanggal, true)) + ' · ' + x.jumlahRtl + ' RTL</small></span></label>';
      }).join('') + '</div><button class="btn sm" id="btnMuatRtl">Tampilkan RTL</button>'
        : '<div class="empty small">Belum ada rapat sebelumnya yang memiliki RTL. Isi RTL di tab <b>Notulen & RTL</b> pada rapat sebelumnya.</div>') +
      '</div>';

    if (ev.sumber.length) {
      html += '<div class="card ringkas" id="ringkas"></div>';
      ev.sumber.forEach(function (s) {
        html += '<div class="card"><div class="cardhead"><div><p class="eyebrow">RTL dari</p><h3>' + esc(s.kegiatan.judul) + '</h3>' +
          '<small class="muted">' + esc(tgl(s.kegiatan.tanggal, true)) + '</small></div><span class="count">' + s.items.length + '</span></div>';
        if (!s.items.length) html += '<div class="empty small">Rapat ini tidak memiliki RTL.</div>';
        s.items.forEach(function (it) {
          var r = it.rtl, e = it.ev || {};
          noUrut++;
          html += '<div class="ev-item" data-rtl="' + esc(r.id) + '">' +
            '<div class="ev-head"><span class="rtl-no">' + noUrut + '</span><div><b>' + esc(r.uraian) + '</b>' +
            '<small class="muted">PJ: ' + esc(r.pj || '-') + (r.tenggat ? ' · Tenggat: ' + esc(tgl(r.tenggat)) : '') + (r.target ? ' · Target: ' + esc(r.target) : '') + '</small></div></div>' +
            '<div class="seg">' + STATUS.map(function (st) {
              return '<label class="st-' + st.split(' ')[0].toLowerCase() + '"><input type="radio" name="st_' + esc(r.id) + '" value="' + st + '"' + (e.status === st ? ' checked' : '') + '><span>' + st + '</span></label>';
            }).join('') + '</div>' +
            '<div class="cap"><span>Capaian</span><input type="range" min="0" max="100" step="5" data-e="capaian" value="' + esc(e.capaian || 0) + '"><output>' + esc(e.capaian || 0) + '%</output></div>' +
            '<div class="grid2">' +
            field('Kendala', '<textarea data-e="kendala" rows="2">' + esc(e.kendala) + '</textarea>') +
            field('Tindakan koreksi (pengendalian)', '<textarea data-e="koreksi" rows="2">' + esc(e.koreksi) + '</textarea>') +
            '</div>' +
            field('Bukti (tautan)', '<input data-e="bukti" placeholder="mis. link Google Drive / SK / laporan" value="' + esc(e.bukti) + '">') +
            '<div class="bukti"><div class="bukti-list">' + buktiHtml(e.buktiFiles) + '</div>' +
            '<label class="btn sm ghost">📎 Unggah bukti<input type="file" hidden accept="image/*,application/pdf" data-up></label></div>' +
            '<label class="check lanjut"><input type="checkbox" data-e="lanjutkan"' + (e.dilanjutkanKe ? ' checked' : '') + '> ' +
            (e.dilanjutkanKe ? 'Sudah dilanjutkan sebagai RTL rapat ini' : 'Lanjutkan sebagai RTL rapat ini (peningkatan)') + '</label>' +
            '<div class="tenggat-baru"' + (e.dilanjutkanKe ? ' hidden' : '') + '><small>Tenggat baru</small><input type="date" data-e="tenggatBaru"></div>' +
            '</div>';
        });
        html += '</div>';
      });
      html += '<div class="card form"><h3>Penyusun Laporan Evaluasi</h3><div class="grid2">' +
        field('Nama', '<input id="evPenyusun" value="' + esc(k.evPenyusun || (d.pengaturan || {}).notulisNama) + '">') +
        field('NIP', '<input id="evNipPenyusun" inputmode="numeric" value="' + esc(k.evNipPenyusun || (d.pengaturan || {}).notulisNip) + '">') +
        field('Jabatan', '<input id="evJabatanPenyusun" value="' + esc(k.evJabatanPenyusun || (d.pengaturan || {}).notulisJabatan || CFG.JABATAN_PENYUSUN) + '">') + '<span></span></div>' +
        field('Kesimpulan evaluasi (opsional)', '<textarea id="evKesimpulan" rows="3" placeholder="Kosongkan agar dibuat otomatis dari capaian">' + esc(k.evKesimpulan) + '</textarea>') +
        '<div class="actions sticky"><button class="btn" id="btnLapEv">⬇ Laporan Evaluasi (Word)</button>' +
        '<button class="btn primary" id="btnSimpanEv">Simpan Evaluasi</button></div></div>';
    }
    $('#tabBody').innerHTML = html;

    var pilihan = function () { return $$('.pilih-rapat input:checked').map(function (c) { return c.value; }); };
    if ($('#btnMuatRtl')) $('#btnMuatRtl').onclick = function () {
      var ids = pilihan();
      if (!ids.length) return toast('Pilih minimal satu rapat.', 'warn');
      busy(this, true, 'Memuat…');
      api('dataEvaluasi', { kegiatanId: kid, sumberIds: ids }).then(function (nev) { renderEvaluasi(d, nev, semua); })
        .catch(function (e) { toast(e.message, 'error'); });
    };
    if (!ev.sumber.length) return;

    // interaksi per item
    $$('.ev-item').forEach(function (item) {
      var range = $('[data-e=capaian]', item), out = $('output', item);
      range.oninput = function () { out.textContent = range.value + '%'; ringkasan(); };
      $$('input[type=radio]', item).forEach(function (rb) {
        rb.onchange = function () {
          if (rb.value === 'Selesai') { range.value = 100; out.textContent = '100%'; }
          if (rb.value === 'Belum' && Number(range.value) === 100) { range.value = 0; out.textContent = '0%'; }
          var cb = $('[data-e=lanjutkan]', item);
          if ((rb.value === 'Proses' || rb.value === 'Belum') && !cb.checked) { cb.checked = true; cb.onchange(); }
          if ((rb.value === 'Selesai' || rb.value === 'Tidak relevan') && cb.checked && cb.dataset.auto) { cb.checked = false; cb.onchange(); }
          ringkasan();
        };
      });
      var cb = $('[data-e=lanjutkan]', item);
      cb.onchange = function (ev2) { if (!ev2) cb.dataset.auto = '1'; else delete cb.dataset.auto; $('.tenggat-baru', item).hidden = !cb.checked; };
      $('[data-up]', item).onchange = function () {
        var f = this.files[0]; this.value = '';
        if (!f) return;
        if (f.size > 8 * 1024 * 1024) return toast('Berkas maksimal 8 MB.', 'error');
        toast('Mengunggah bukti…');
        bacaFile(f).then(function (data) {
          return api('unggahBukti', { kegiatanId: kid, rtlId: item.dataset.rtl, data: data, nama: f.name });
        }).then(function (files) { $('.bukti-list', item).innerHTML = buktiHtml(files); pasangHapusBukti(item); toast('Bukti terunggah.', 'ok'); })
          .catch(function (e) { toast(e.message, 'error'); });
      };
      pasangHapusBukti(item);
    });
    function pasangHapusBukti(item) {
      $$('[data-hapus-bukti]', item).forEach(function (b) {
        b.onclick = function () {
          if (!confirm('Hapus berkas bukti ini?')) return;
          api('hapusBukti', { kegiatanId: kid, rtlId: item.dataset.rtl, fileId: b.dataset.hapusBukti })
            .then(function (files) { $('.bukti-list', item).innerHTML = buktiHtml(files); pasangHapusBukti(item); })
            .catch(function (e) { toast(e.message, 'error'); });
        };
      });
    }
    function kumpulkan() {
      return $$('.ev-item').map(function (item) {
        var st = $('input[type=radio]:checked', item);
        return { rtlId: item.dataset.rtl, status: st ? st.value : '', capaian: $('[data-e=capaian]', item).value,
          kendala: $('[data-e=kendala]', item).value, koreksi: $('[data-e=koreksi]', item).value, bukti: $('[data-e=bukti]', item).value,
          lanjutkan: $('[data-e=lanjutkan]', item).checked, tenggatBaru: $('[data-e=tenggatBaru]', item).value };
      });
    }
    function ringkasan() {
      var items = kumpulkan(), per = { '': 0 }; STATUS.forEach(function (s) { per[s] = 0; });
      var sum = 0, n = 0;
      items.forEach(function (it) { per[it.status]++; if (it.status && it.status !== 'Tidak relevan') { sum += Number(it.capaian); n++; } });
      var relevan = items.length - per['Tidak relevan'];
      var pct = relevan ? Math.round(per['Selesai'] * 100 / relevan) : 0;
      $('#ringkas').innerHTML = '<div class="big"><b>' + pct + '%</b><span>RTL selesai<br><small>rata-rata capaian ' + (n ? Math.round(sum / n) : 0) + '%</small></span></div>' +
        '<div class="bar">' + STATUS.map(function (s) {
          return per[s] ? '<i class="st-' + s.split(' ')[0].toLowerCase() + '" style="flex:' + per[s] + '"></i>' : '';
        }).join('') + (per[''] ? '<i class="st-kosong" style="flex:' + per[''] + '"></i>' : '') + '</div>' +
        '<div class="legend">' + STATUS.map(function (s) { return '<span class="st-' + s.split(' ')[0].toLowerCase() + '"><i></i>' + s + ' ' + per[s] + '</span>'; }).join('') +
        (per[''] ? '<span class="st-kosong"><i></i>Belum dinilai ' + per[''] + '</span>' : '') + '</div>';
    }
    ringkasan();

    function simpan() {
      var payload = { kegiatanId: kid, sumberIds: pilihan().length ? pilihan() : ev.sumberIds, items: kumpulkan(),
        meta: { evPenyusun: $('#evPenyusun').value, evNipPenyusun: $('#evNipPenyusun').value,
          evJabatanPenyusun: $('#evJabatanPenyusun').value, evKesimpulan: $('#evKesimpulan').value } };
      return api('simpanEvaluasi', payload);
    }
    $('#btnSimpanEv').onclick = function () {
      var b = this; busy(b, true, 'Menyimpan…');
      simpan().then(function (nev) {
        Object.assign(d.kegiatan, nev.kegiatan);
        var lanjut = 0; nev.sumber.forEach(function (s) { s.items.forEach(function (it) { if (it.ev && it.ev.dilanjutkanKe) lanjut++; }); });
        toast('Evaluasi tersimpan' + (lanjut ? ' · ' + lanjut + ' RTL dilanjutkan ke rapat ini' : '') + '.', 'ok');
        renderEvaluasi(d, nev, semua);
      }).catch(function (e) { busy(b, false); toast(e.message, 'error'); });
    };
    $('#btnLapEv').onclick = function () {
      var b = this; busy(b, true, 'Menyimpan…');
      simpan().then(function () { busy(b, false); buatLaporanEvaluasi(kid, b); })
        .catch(function (e) { busy(b, false); toast(e.message, 'error'); });
    };
  }
  function buktiHtml(files) {
    return (files || []).map(function (f) {
      return '<span class="chip">' + (/^image\//.test(f.mime) ? '🖼' : '📄') + ' <a href="' + esc(f.url) + '" target="_blank" rel="noopener">' + esc(f.nama) + '</a>' +
        '<button type="button" class="icon-btn" data-hapus-bukti="' + esc(f.id) + '">✕</button></span>';
    }).join('');
  }

  // ---- Tab Dokumen Rapat (U-A-N-G) ----
  function tabLaporan(d) {
    var n = d.notulen || {}, k = d.kegiatan;
    var adaEv = !!k.evaluasiDari;
    $('#tabBody').innerHTML =
      '<div class="uang">' +
      '<div class="card u-item"><div class="u-head"><span class="u-huruf">U</span><div><h3>Undangan</h3><small id="infoUnd">Memuat…</small></div>' +
      '<label class="btn sm primary">📨 Unggah Undangan<input type="file" hidden accept="image/*,application/pdf" multiple id="inUnd"></label></div>' +
      '<p class="muted small">Foto/scan (JPG, PNG) atau <b>PDF</b> undangan resmi. PDF otomatis diubah menjadi gambar per halaman.</p>' +
      '<div id="gridUnd" class="und-grid"></div></div>' +
      '<div class="card u-item"><div class="u-head"><span class="u-huruf">A</span><div><h3>Absen / Daftar Hadir</h3><small>' + d.hadir.length + ' peserta bertanda tangan</small></div>' +
      '<a class="btn sm ghost" href="#/kegiatan/' + esc(k.id) + '/hadir">Lihat</a></div></div>' +
      '<div class="card u-item"><div class="u-head"><span class="u-huruf">N</span><div><h3>Notulen</h3><small>' +
      (n.pembahasan ? 'Terisi · ' + (d.rtl || []).length + ' RTL' : '<span class="warn-t">Belum diisi</span>') + '</small></div>' +
      '<a class="btn sm ghost" href="#/kegiatan/' + esc(k.id) + '/notulen">' + (n.pembahasan ? 'Ubah' : 'Isi') + '</a></div></div>' +
      '<div class="card u-item"><div class="u-head"><span class="u-huruf">G</span><div><h3>Gambar / Foto Kegiatan</h3><small id="infoFoto">' +
      (n.fotoIds ? String(n.fotoIds).split(',').filter(String).length + ' foto' : '<span class="warn-t">Belum ada foto</span>') + '</small></div>' +
      '<a class="btn sm ghost" href="#/kegiatan/' + esc(k.id) + '/notulen">Kelola</a></div></div>' +
      '</div>' +
      '<div class="grid-side"><div class="card lap-preview">' + miniCover('DOKUMEN RAPAT', k.judul) + '</div>' +
      '<div class="card"><h3>📄 Dokumen Rapat (Word)</h3>' +
      '<p class="muted small">Sampul + <b>U</b>ndangan + <b>A</b>bsen + <b>N</b>otulen (dengan RTL) + <b>G</b>ambar kegiatan, dalam satu file .docx.</p>' +
      '<div id="peringatan"></div>' +
      '<button class="btn primary block" id="btnLap">⬇ Unduh Dokumen Rapat</button>' +
      '<hr class="sep"><h3>🔁 Evaluasi Tindak Lanjut</h3>' +
      '<p class="muted small">Ringkasan evaluasi RTL rapat sebelumnya (2–3 halaman) sebagai bukti siklus PPEPP.</p>' +
      (adaEv ? '<button class="btn block" id="btnLapEv2">⬇ Unduh Evaluasi RTL</button>'
        : '<p class="hint">Belum ada evaluasi RTL pada rapat ini. Isi di tab <a href="#/kegiatan/' + esc(k.id) + '/evaluasi">Evaluasi RTL</a>.</p>') +
      '</div></div>';
    $('#btnLap').onclick = function () { buatLaporan(k.id, this); };
    if (adaEv) $('#btnLapEv2').onclick = function () { buatLaporanEvaluasi(k.id, this); };
    var cekKurang = function (jmlUnd) {
      var kurang = [];
      if (!jmlUnd) kurang.push('Undangan belum diunggah');
      if (!d.hadir.length) kurang.push('belum ada peserta di daftar hadir');
      if (!n.pembahasan) kurang.push('notulen belum diisi');
      if (!n.fotoIds) kurang.push('belum ada foto kegiatan');
      $('#peringatan').innerHTML = kurang.length ? '<p class="hint warn">⚠ ' + kurang.join('; ') + '. Dokumen tetap bisa diunduh.</p>' : '<p class="hint ok">✓ Berkas UANG lengkap.</p>';
    };
    muatUndangan(k.id, cekKurang);
    $('#inUnd').onchange = function () {
      var files = Array.prototype.slice.call(this.files); this.value = '';
      if (!files.length) return;
      var chain = Promise.resolve(), total = 0;
      files.forEach(function (f) {
        chain = chain.then(function () {
          var halaman = /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name) ? pdfKeGambar(f) : kecilkanGambar(f, 2000, 0.88).then(function (x) { return [x]; });
          toast('Memproses ' + f.name + '…');
          return halaman.then(function (list) {
            return list.reduce(function (p, dataUrl, i) {
              return p.then(function () {
                total++; toast('Mengunggah halaman undangan ' + total + '…');
                return api('unggahUndangan', { kegiatanId: k.id, data: dataUrl, nama: f.name + (list.length > 1 ? ' (hal. ' + (i + 1) + ')' : '') });
              });
            }, Promise.resolve());
          });
        });
      });
      chain.then(function () { toast('Undangan berhasil diunggah (' + total + ' halaman).', 'ok'); muatUndangan(k.id, cekKurang); })
        .catch(function (e) { toast(e.message, 'error'); muatUndangan(k.id, cekKurang); });
    };
  }
  function muatUndangan(kid, cb) {
    api('daftarUndangan', { kegiatanId: kid }).then(function (list) {
      var g = $('#gridUnd'); if (!g) return;
      $('#infoUnd').innerHTML = list.length ? list.length + ' halaman' : '<span class="warn-t">Belum diunggah</span>';
      g.innerHTML = list.map(function (u, i) {
        return '<figure><img src="data:' + esc(u.mime) + ';base64,' + u.data + '" alt=""><figcaption>Hal. ' + (i + 1) + '</figcaption>' +
          '<button class="icon-btn" data-und="' + esc(u.id) + '" title="Hapus halaman">✕</button></figure>';
      }).join('');
      $$('[data-und]', g).forEach(function (b) {
        b.onclick = function () {
          if (!confirm('Hapus halaman undangan ini?')) return;
          api('hapusUndangan', { kegiatanId: kid, fileId: b.dataset.und }).then(function () { muatUndangan(kid, cb); })
            .catch(function (e) { toast(e.message, 'error'); });
        };
      });
      if (cb) cb(list.length);
    }).catch(function (e) { var g = $('#gridUnd'); if (g) g.innerHTML = '<div class="empty small">' + esc(e.message) + '</div>'; });
  }
  /** Ubah PDF undangan menjadi gambar JPEG per halaman (maks. 6 halaman) memakai pdf.js. */
  function pdfKeGambar(file) {
    var base = new URL('vendor/', location.href).href;
    return import(base + 'pdf.min.mjs').then(function (pdfjs) {
      pdfjs.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
      return file.arrayBuffer().then(function (buf) { return pdfjs.getDocument({ data: buf }).promise; });
    }).then(function (pdf) {
      var jml = Math.min(pdf.numPages, 6), out = [], chain = Promise.resolve();
      for (var i = 1; i <= jml; i++) (function (no) {
        chain = chain.then(function () { return pdf.getPage(no); }).then(function (page) {
          var vp1 = page.getViewport({ scale: 1 });
          var vp = page.getViewport({ scale: 1600 / vp1.width });
          var c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
          var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
          return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () { out.push(c.toDataURL('image/jpeg', 0.88)); });
        });
      })(i);
      return chain.then(function () {
        if (pdf.numPages > 6) toast('PDF memiliki ' + pdf.numPages + ' halaman; hanya 6 halaman pertama yang dipakai.', 'warn');
        return out;
      });
    }).catch(function (e) { throw new Error('Gagal membaca PDF: ' + e.message); });
  }
  function miniCover(kicker, judul) {
    return '<div class="mini-cover"><div class="mc-top"><small>' + esc(kicker) + '</small><b>' + esc(judul) + '</b></div>' +
      '<div class="mc-mid"><img src="' + esc(CFG.LOGO_H || CFG.LOGO) + '" alt=""></div><div class="mc-bot">' + esc(CFG.INSTITUSI.nama.toUpperCase()) + '</div></div>';
  }

  // ---- pembuat dokumen Word ----
  function loadScript(src) {
    return new Promise(function (res, rej) {
      if ($('script[src="' + src + '"]')) return res();
      var s = document.createElement('script'); s.src = src; s.onload = res;
      s.onerror = function () { rej(new Error('Gagal memuat ' + src)); }; document.head.appendChild(s);
    });
  }
  function b64ToBytes(b64) {
    var bin = atob(String(b64).replace(/^data:[^,]*,/, '')), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function svgToPng(svg, w, h) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () {
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(im, 0, 0, w, h);
        c.toBlob(function (b) { b.arrayBuffer().then(function (ab) { res(new Uint8Array(ab)); }); }, 'image/png');
      };
      im.onerror = rej;
      im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }
  function ukuranGambar(src) {
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () { res({ w: im.naturalWidth, h: im.naturalHeight }); };
      im.onerror = function () { res({ w: 4, h: 3 }); };
      im.src = src;
    });
  }
  function ambilBytes(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error('Gagal memuat ' + url); return r.arrayBuffer(); }).then(function (b) { return new Uint8Array(b); }); }
  /** Aset tetap laporan (logo, ikon kop, latar sampul) – dimuat sekali. */
  function muatAset() {
    if (state.aset) return Promise.resolve(state.aset);
    var ik = CFG.IKON_KOP || {};
    return Promise.all([
      loadScript('vendor/docx.iife.js'), ambilBytes(CFG.LOGO), CFG.LOGO_H ? ambilBytes(CFG.LOGO_H) : null,
      CFG.LOGO_H ? ukuranGambar(CFG.LOGO_H) : null,
      ik.pin ? ambilBytes(ik.pin) : null, ik.phone ? ambilBytes(ik.phone) : null, ik.web ? ambilBytes(ik.web) : null,
      svgToPng(window.Cover.coverSvg(), window.Cover.COVER_W, window.Cover.COVER_H)
    ]).then(function (r) {
      state.aset = { logo: r[1], logoH: r[2], logoHRatio: r[3] ? r[3].h / r[3].w : 0.27,
        ikon: r[4] ? { pin: r[4], phone: r[5], web: r[6] } : null, coverBg: r[7], institusi: CFG.INSTITUSI, b64: b64ToBytes };
      return state.aset;
    });
  }
  function unduh(blob, nama) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nama.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 120) + '.docx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }
  function buatLaporan(id, btn) {
    busy(btn, true, 'Menyusun dokumen…');
    Promise.all([muatAset(), api('dataLaporan', { id: id })]).then(function (r) {
      var aset = r[0], data = r[1];
      data.notulen = data.notulen || {};
      return Promise.all(data.foto.concat(data.undangan || []).map(function (f) {
        return ukuranGambar('data:' + f.mime + ';base64,' + f.data).then(function (s) { f.w = s.w; f.h = s.h; });
      })).then(function () {
        return window.docx.Packer.toBlob(window.Laporan.buildDokumenRapat(window.docx, data, aset));
      }).then(function (blob) {
        unduh(blob, 'Dokumen Rapat - ' + data.kegiatan.judul);
        busy(btn, false); toast('Dokumen Rapat berhasil dibuat.', 'ok');
      });
    }).catch(function (e) { busy(btn, false); toast('Gagal membuat laporan: ' + e.message, 'error'); console.error(e); });
  }
  function buatLaporanEvaluasi(id, btn) {
    busy(btn, true, 'Menyusun laporan evaluasi…');
    Promise.all([muatAset(), api('dataLaporanEvaluasi', { id: id })]).then(function (r) {
      var aset = r[0], data = r[1];
      var tugas = [];
      data.sumber.forEach(function (s) {
        s.items.forEach(function (it) {
          ((it.ev || {}).buktiFiles || []).forEach(function (f) {
            if (f.data) tugas.push(ukuranGambar('data:' + f.mime + ';base64,' + f.data).then(function (u) { f.w = u.w; f.h = u.h; }));
          });
        });
      });
      return Promise.all(tugas).then(function () {
        return window.docx.Packer.toBlob(window.Laporan.buildLaporanEvaluasi(window.docx, data, aset));
      }).then(function (blob) {
        unduh(blob, 'Evaluasi RTL - ' + data.kegiatan.judul);
        busy(btn, false); toast('Laporan evaluasi berhasil dibuat.', 'ok');
      });
    }).catch(function (e) { busy(btn, false); toast('Gagal membuat laporan evaluasi: ' + e.message, 'error'); console.error(e); });
  }

  // ================= View: Form daftar hadir (publik) =================
  function viewHadir(id) {
    renderUserBox();
    $app.innerHTML = '<div class="loader"><span></span></div>';
    var cacheKey = 'sirapat_keg_' + id;
    api('getKegiatanPublik', { id: id }, { publik: true }).then(function (k) { lsSet(cacheKey, k); tampil(k); })
      .catch(function (e) {
        var c = lsGet(cacheKey, null);
        if (c && !navigator.onLine) return tampil(c);
        $app.innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
      });

    function tampil(k) {
      var profil = lsGet('sirapat_profil', {});
      if (k.status === 'tutup') {
        $app.innerHTML = '<div class="pub-wrap"><div class="card center"><h2>Daftar hadir ditutup</h2><p class="muted">' + esc(k.judul) + '</p></div></div>';
        return;
      }
      $app.innerHTML =
        '<div class="pub-wrap"><div class="pub-head"><img src="' + esc(CFG.LOGO) + '" alt=""><div><p class="eyebrow">Daftar Hadir ' + esc(k.jenis || 'Kegiatan') + '</p>' +
        '<h2>' + esc(k.judul) + '</h2><p>📅 ' + esc(tgl(k.tanggal, true)) + (k.waktuMulai ? ' · 🕘 ' + esc(k.waktuMulai) + ' WITA' : '') +
        (k.tempat ? '<br>📍 ' + esc(k.tempat) : '') + '</p></div></div>' +
        '<form class="card form" id="fh" autocomplete="on">' +
        '<div class="field ac-wrap"><span>Nama lengkap & gelar *</span>' +
        '<input name="nama" id="inNama" required autocomplete="off" placeholder="Ketik nama atau NIP Anda…" value="' + esc(profil.nama) + '">' +
        '<input type="hidden" name="pegawaiId" id="inPid" value="' + esc(profil.pegawaiId) + '">' +
        '<div class="ac-list" id="acList" role="listbox" hidden></div>' +
        '<small id="acHint"></small></div>' +
        field('NIP / NIM / NIK', '<input name="nipNim" id="inNip" inputmode="numeric" value="' + esc(profil.pegawaiId ? profil.nipSamar : profil.nipNim) + '">') +
        '<div class="grid2">' +
        field('Jabatan', '<input name="jabatan" placeholder="mis. Dosen" value="' + esc(profil.jabatan) + '">') +
        field('Unit kerja / Instansi', '<input name="unitKerja" placeholder="mis. Jurusan Gizi" value="' + esc(profil.unitKerja) + '">') +
        '</div>' +
        field('No. HP (opsional)', '<input name="noHp" type="tel" inputmode="tel" value="' + esc(profil.noHp) + '">') +
        '<div class="field"><span>Tanda tangan *</span><div class="ttd-wrap"><canvas id="cv"></canvas><span class="ttd-ph" id="ph">Coret tanda tangan di sini</span>' +
        '<button type="button" class="btn ghost sm ttd-clear" id="btnClr">Hapus</button></div>' +
        '<small>Gunakan jari (HP/tablet) atau mouse (laptop).</small></div>' +
        '<label class="check"><input type="checkbox" id="ingat" checked> Ingat data saya di perangkat ini</label>' +
        '<button class="btn primary block lg" id="btnKirim">Kirim Daftar Hadir</button></form>' +
        '<p class="foot">' + esc(CFG.INSTITUSI.nama) + '</p></div>';
      pasangPilihPegawai(profil);
      var pad = window.TandaTangan($('#cv'), { onChange: function () { $('#ph').style.display = pad && !pad.isEmpty() ? 'none' : ''; } });
      $('#ph').style.display = '';
      $('#btnClr').onclick = function () { pad.clear(); $('#ph').style.display = ''; };
      $('#fh').onsubmit = function (e) {
        e.preventDefault();
        if (pad.isEmpty()) { toast('Silakan bubuhkan tanda tangan.', 'error'); return; }
        var data = formData(this); data.kegiatanId = id; data.ttd = pad.toPNG();
        if ($('#ingat').checked) lsSet('sirapat_profil', { nama: data.nama, nipNim: data.pegawaiId ? '' : data.nipNim, pegawaiId: data.pegawaiId,
          nipSamar: data.pegawaiId ? data.nipNim : '', jabatan: data.jabatan, unitKerja: data.unitKerja, noHp: data.noHp });
        else localStorage.removeItem('sirapat_profil');
        var b = $('#btnKirim'); busy(b, true, 'Mengirim…');
        if (!navigator.onLine) { antrikan(data); return selesai(k, data, true); }
        api('kirimHadir', data, { publik: true }).then(function () { selesai(k, data, false); })
          .catch(function (err) {
            busy(b, false);
            if (/Failed to fetch|NetworkError|Load failed/i.test(err.message)) { antrikan(data); return selesai(k, data, true); }
            toast(err.message, 'error');
          });
      };
    }
    function selesai(k, data, offline) {
      $app.innerHTML = '<div class="pub-wrap"><div class="card center done"><div class="big-check">✓</div><h2>Terima kasih, ' + esc(data.nama.split(',')[0]) + '!</h2>' +
        '<p>Kehadiran Anda pada <b>' + esc(k.judul) + '</b> ' + (offline ? 'tersimpan di perangkat dan akan <b>dikirim otomatis</b> saat internet tersedia.' : 'telah tercatat.') + '</p>' +
        '<p class="muted small">' + new Date().toLocaleString('id-ID') + '</p></div></div>';
    }
  }

  /** Kolom nama dengan saran dari Data Pegawai; isian manual tetap diizinkan. */
  function pasangPilihPegawai(profil) {
    var inNama = $('#inNama'), inPid = $('#inPid'), inNip = $('#inNip'), list = $('#acList'), hint = $('#acHint');
    var timer = null, hasil = [], aktif = -1, seq = 0;
    function setTerpilih(on) {
      inNip.readOnly = on;
      inNama.classList.toggle('terpilih', on);
      hint.innerHTML = on ? '<b class="ok">✓ Terdaftar di Data Pegawai</b> – NIP diisi otomatis. Bukan Anda? Ubah nama untuk memilih ulang / isi manual.'
        : 'Ketik minimal 3 huruf nama atau 4 angka NIP, lalu pilih dari daftar. Tidak ada di daftar? Lanjutkan isi manual.';
    }
    function tutup() { list.hidden = true; aktif = -1; }
    function pilih(r) {
      inNama.value = r.nama; inPid.value = r.id; inNip.value = r.nipSamar;
      var f = $('#fh');
      if (r.jabatan) { f.jabatan.value = r.jabatan; f.jabatan.dataset.auto = '1'; }
      if (r.unitKerja) { f.unitKerja.value = r.unitKerja; f.unitKerja.dataset.auto = '1'; }
      setTerpilih(true); tutup();
    }
    function render() {
      if (!hasil.length) {
        list.innerHTML = '<div class="ac-empty">Tidak ditemukan di Data Pegawai – silakan isi manual.</div>';
      } else {
        list.innerHTML = hasil.map(function (r, i) {
          return '<div class="ac-item' + (i === aktif ? ' on' : '') + '" data-i="' + i + '" role="option"><b>' + esc(r.nama) + '</b>' +
            '<small>' + [r.nipSamar, r.jabatan, r.unitKerja].filter(Boolean).map(esc).join(' · ') + '</small></div>';
        }).join('');
      }
      list.hidden = false;
      $$('.ac-item', list).forEach(function (el) {
        el.onmousedown = function (e) { e.preventDefault(); pilih(hasil[el.dataset.i]); };
      });
    }
    function cari() {
      var q = inNama.value.trim();
      var cukup = /^\d+$/.test(q) ? q.length >= 4 : q.replace(/[^a-z0-9]/gi, '').length >= 3;
      if (!cukup || !navigator.onLine) { tutup(); return; }
      var my = ++seq;
      api('cariPegawai', { q: q }, { publik: true }).then(function (r) {
        if (my !== seq || document.activeElement !== inNama) return;
        hasil = r; aktif = r.length ? 0 : -1; render();
      }).catch(function () {});
    }
    inNama.addEventListener('input', function () {
      if (inPid.value) {
        inPid.value = ''; inNip.value = ''; setTerpilih(false);
        // kosongkan jabatan/unit yang tadi terisi otomatis dari pilihan
        [$('#fh').jabatan, $('#fh').unitKerja].forEach(function (el) { if (el.dataset.auto) { el.value = ''; delete el.dataset.auto; } });
      }
      clearTimeout(timer); timer = setTimeout(cari, 300);
    });
    inNama.addEventListener('keydown', function (e) {
      if (list.hidden || !hasil.length) return;
      if (e.key === 'ArrowDown') { aktif = (aktif + 1) % hasil.length; render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { aktif = (aktif - 1 + hasil.length) % hasil.length; render(); e.preventDefault(); }
      else if (e.key === 'Enter' && aktif >= 0) { pilih(hasil[aktif]); e.preventDefault(); }
      else if (e.key === 'Escape') tutup();
    });
    inNama.addEventListener('blur', function () { setTimeout(tutup, 150); });
    inNama.addEventListener('focus', function () { if (!inPid.value && inNama.value.trim().length >= 3) cari(); });
    setTerpilih(!!(profil && profil.pegawaiId));
    if (profil && profil.pegawaiId) { $('#fh').jabatan.dataset.auto = '1'; $('#fh').unitKerja.dataset.auto = '1'; }
  }

  // ================= Antrean offline =================
  function antrikan(data) {
    var q = lsGet('sirapat_antrean', []); q.push(data); lsSet('sirapat_antrean', q);
  }
  function kirimAntrean() {
    var q = lsGet('sirapat_antrean', []);
    if (!q.length || !navigator.onLine) return;
    var sisa = [];
    q.reduce(function (p, item) {
      return p.then(function () {
        return api('kirimHadir', item, { publik: true }).catch(function (e) {
          if (/Failed to fetch|NetworkError|Load failed/i.test(e.message)) sisa.push(item);
        });
      });
    }, Promise.resolve()).then(function () {
      lsSet('sirapat_antrean', sisa);
      if (q.length > sisa.length) toast((q.length - sisa.length) + ' daftar hadir tertunda berhasil dikirim.', 'ok');
    });
  }
  function netStatus() {
    document.getElementById('netbar').hidden = navigator.onLine;
    if (navigator.onLine) kirimAntrean();
  }
  window.addEventListener('online', netStatus);
  window.addEventListener('offline', netStatus);

  // ================= Start =================
  document.getElementById('appName').textContent = CFG.NAMA_APLIKASI;
  document.getElementById('appSub').textContent = CFG.SUBJUDUL;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  netStatus();
  route();
})();
