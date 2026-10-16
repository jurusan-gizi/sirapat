# SIRAPAT – Sistem Informasi Rapat, Presensi & Tindak Lanjut

Aplikasi PWA untuk **Poltekkes Kemenkes Makassar**. Aplikasi ini memuat:

- **Admin** (login dengan email dan password yang terdaftar di sheet Admin, dikelola lewat menu **Kelola Admin**): membuat kegiatan, lalu otomatis mendapat **link dan QR code** form daftar hadir.
- **Form daftar hadir** untuk peserta, tanpa perlu login. Peserta mengisi data dan **tanda tangan dengan mencoret layar** (HP) atau memakai mouse (laptop). Jika sinyal hilang, isian disimpan dulu dan dikirim otomatis saat online.
- **Notulen rapat**: pimpinan, notulis, latar belakang, agenda, pembahasan, keputusan, kesimpulan, saran, serta **foto dokumentasi**.
- **Rencana Tindak Lanjut (RTL)** terstruktur: uraian, penanggung jawab, tenggat, dan target/indikator (*Penetapan*).
- **Evaluasi RTL** di rapat berikutnya. Admin bisa memilih **beberapa rapat sebelumnya** sekaligus, misalnya dua rapat bulanan. Isinya status (Selesai/Proses/Belum/Tidak relevan), % capaian, bukti (tautan/berkas), kendala, tindakan koreksi, dan opsi **melanjutkan RTL** yang belum tuntas ke rapat ini. Dengan begitu siklus **PPEPP** berjalan.
- **Laporan Evaluasi Tindak Lanjut (Word)**: ringkasan capaian + grafik, rincian per rapat, kendala & koreksi (pengendalian), RTL lanjutan (peningkatan), lampiran bukti dukung.
- **Laporan Kegiatan Word (.docx) lengkap** dengan satu klik. Isinya sampul berdesain, lembar pengesahan, kata pengantar, daftar isi, BAB I–IV, dan Lampiran (daftar hadir bertanda tangan, notulen, dokumentasi).

```
GitHub Pages (PWA)  ──►  Google Apps Script (API)  ──►  Google Sheets (data) + Google Drive (TTD & foto)
```

---

## Struktur folder

```
index.html, manifest.webmanifest, sw.js   → kerangka PWA
css/style.css                             → tampilan
js/config.js                              → ⚙️ KONFIGURASI (wajib diisi)
js/app.js                                 → logika aplikasi
js/ttd.js                                 → pad tanda tangan
js/laporan.js, js/cover.js                → generator laporan Word & sampul
vendor/docx.iife.js                       → pustaka pembuat .docx
assets/logo.png                           → emblem Kemenkes (ikon & sampul)
assets/logo-kemenkes.png                  → logo horizontal Kemenkes Poltekkes Makassar (kop & sampul)
assets/ic-*.png                           → ikon alamat/telepon/web pada kop
apps-script/Code.gs, appsscript.json      → backend (salin ke Apps Script)
```

---

## Langkah pemasangan (±15 menit)

> Tidak perlu Google Cloud. Login admin memakai akun yang tersimpan di sheet **Admin**. Database dan berkas tersimpan di Google Drive akun yang men-deploy Apps Script.

### 1. Backend Google Apps Script
1. Buka <https://script.google.com>, lalu klik **Proyek baru**. Beri nama `SIRAPAT Backend`.
2. Hapus isi `Kode.gs` / `Code.gs`, lalu tempel isi file `apps-script/Code.gs` (buka dengan Notepad → Ctrl+A → Ctrl+C).
3. Buka **Setelan proyek (⚙️)** dan centang *Tampilkan file manifes "appsscript.json"*. Kembali ke Editor, lalu ganti isi `appsscript.json` dengan file `apps-script/appsscript.json`. Simpan (Ctrl+S).
4. Pilih fungsi **`setup`**, klik **Jalankan**, lalu izinkan akses.
   - Fungsi ini membuat Spreadsheet **SIRAPAT - Database**, folder **SIRAPAT - Berkas**, dan **akun superadmin pertama**.
   - Buka **Log eksekusi** di bagian bawah. Di sana tercatat **email dan password sementara** superadmin. Catat keduanya.
5. Klik **Deploy → Deployment baru → Jenis: Aplikasi web**:
   - *Jalankan sebagai*: **Saya**
   - *Yang memiliki akses*: **Siapa saja** (dibutuhkan agar peserta bisa mengisi tanpa login)
6. Salin **URL aplikasi web** (berakhiran `/exec`).

### 2. Frontend di GitHub
1. Buat repository baru, misalnya `sirapat`, lalu unggah seluruh isi folder ini.
2. Edit `js/config.js` dan isi URL dari langkah 1.6:
   ```js
   API_URL: 'https://script.google.com/macros/s/XXXX/exec',
   ```
   Data kop surat (alamat, telepon, portal) ada di bagian `INSTITUSI`. Logo resmi dan kop sudah terpasang.
3. Buka **Settings → Pages → Source: Deploy from a branch → main / (root)**, lalu Simpan.
4. Aplikasi bisa diakses di `https://NAMA-AKUN-GITHUB.github.io/sirapat/`. Di HP, pilih **"Tambahkan ke layar utama"** untuk memasangnya sebagai aplikasi.

### 3. Login pertama & menambah admin
1. Login dengan email dan password sementara dari Log eksekusi. Aplikasi langsung meminta Anda **membuat password baru**.
2. Klik nama Anda di pojok kanan atas, lalu pilih **Kelola Admin**:
   - **Ubah** akun Anda sendiri untuk mengisi nama lengkap, NIP, dan jabatan.
   - **＋ Tambah Admin** untuk Sekjur atau staf lain. Password sementara tampil **sekali** dan bisa langsung dikirim via WhatsApp.
3. Peran yang tersedia:
   - **Superadmin**: semua fitur, termasuk mengelola akun admin.
   - **Admin**: kegiatan, daftar hadir, notulen, RTL, evaluasi, dan laporan.
4. Jika ada admin yang lupa password, superadmin memilih **Reset password** di Kelola Admin.
5. Jika **superadmin sendiri** lupa password, jalankan fungsi `resetPasswordSuperadmin` dari editor Apps Script, lalu lihat password sementara baru di Log eksekusi.

**Keamanan login:**
- Password disimpan sebagai hash bergaram (salt), bukan teks asli.
- Login dikunci 15 menit setelah 5 kali salah.
- Sesi login berlaku 6 jam.
- Admin yang dinonaktifkan tidak bisa login.

---

## Cara pakai

1. **Login**, lalu pilih **＋ Kegiatan Baru**. Isi judul, tanggal, waktu, dan tempat, lalu Simpan.
2. Di tab **Daftar Hadir**, bagikan link atau QR lewat WhatsApp, atau pilih **Tampilkan di Layar** untuk menayangkan QR besar di proyektor. Daftar peserta diperbarui otomatis setiap 20 detik.
3. Di tab **Notulen & RTL**, isi semua bagian dan unggah foto. Tips penulisan:
   - Satu baris akan menjadi satu paragraf.
   - Awali baris dengan `1.` untuk daftar bernomor, atau `-` untuk poin.
4. Masih di tab **Notulen & RTL**, isi tabel **RTL** (uraian, PJ, tenggat, target) lalu **Simpan Notulen & RTL**.
5. Pada rapat berikutnya, buka tab **Evaluasi RTL** → centang rapat-rapat sebelumnya yang akan dievaluasi → **Tampilkan RTL** → isi status, capaian, bukti, kendala, tindakan koreksi. RTL berstatus Proses/Belum otomatis dicentang **"Lanjutkan sebagai RTL rapat ini"** (bisa dibatalkan). Klik **Simpan Evaluasi**.
6. Di tab **Laporan**, unduh **Laporan Kegiatan** dan/atau **Laporan Evaluasi Tindak Lanjut** (Word).
7. Saat membuka laporan di Microsoft Word, pilih **Ya** ketika diminta memperbarui field. Langkah ini membuat nomor halaman daftar isi akurat.
8. Setelah kegiatan selesai, ubah status menjadi **Ditutup** lewat tombol ✎ Edit agar form tidak menerima isian lagi.

## Memperbarui dari versi sebelumnya
1. Ganti isi `Code.gs` di Apps Script dengan versi baru, lalu **Deploy → Kelola deployment → ✎ Edit → Versi baru → Deploy** (URL tetap sama).
2. Sheet baru (**RTL**, **Evaluasi**) dan kolom baru dibuat otomatis saat aplikasi dipakai – tidak perlu menjalankan `setup()` lagi.
3. Jalankan fungsi `setup` sekali lagi untuk membuat sheet **Admin** dan akun superadmin pertama. Lihat password sementara di Log eksekusi. Data lama tidak berubah.
4. Unggah ulang seluruh file frontend ke GitHub. Di `js/config.js`, cukup salin nilai `API_URL` milik Anda.

## Memperbarui backend
Setelah mengubah `Code.gs`, buka **Deploy → Kelola deployment → ✎ Edit → Versi: Versi baru → Deploy**. Dengan cara ini URL `/exec` tetap sama.

## Catatan
- Data tersimpan di Spreadsheet **"SIRAPAT - Database"**, sedangkan tanda tangan dan foto ada di folder **"SIRAPAT - Berkas"**. Keduanya berada di Drive akun yang men-deploy.
- QR code dibuat oleh layanan `api.qrserver.com`, yang hanya menerima isi link form.
- Jika aplikasi diperbarui, naikkan `VERSION` di `sw.js` (misalnya `sirapat-v3`) agar cache di HP pengguna ikut diperbarui.
