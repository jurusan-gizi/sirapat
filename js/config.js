/**
 * KONFIGURASI APLIKASI – sesuaikan setelah deploy (lihat README.md)
 */
window.APP_CONFIG = {
  // URL Web App Apps Script (Deploy > Web app > URL yang berakhiran /exec)
  API_URL: 'https://script.google.com/macros/s/AKfycbxdSFocPddJBNT_4WK7sd6QXoidczCiSYz0fYl-iPWsX98uVnesc4sq7F5L5DdMZxoH/exec',

  NAMA_APLIKASI: 'SIRAPAT',
  SUBJUDUL: 'Rapat, Presensi & Tindak Lanjut',

  // Data institusi untuk kop surat & sampul laporan (sesuai kop resmi)
  INSTITUSI: {
    kementerian: 'Kementerian Kesehatan',
    direktorat: ['Direktorat Jenderal', 'Sumber Daya Manusia Kesehatan'],
    nama: 'Politeknik Kesehatan Makassar',
    alamat: ['Jalan Wijaya Kusuma Raya No. 46 Banta-Bantaeng', 'Makassar, Sulawesi Selatan 90222'],
    telepon: '08115566606',
    website: 'https://portal.poltekkes-mks.ac.id',
    kota: 'Makassar'
  },

  // Logo: emblem persegi (ikon/aplikasi) & logo horizontal (kop & sampul)
  LOGO: 'assets/logo.png',
  LOGO_H: 'assets/logo-kemenkes.png',
  IKON_KOP: { pin: 'assets/ic-pin.png', phone: 'assets/ic-phone.png', web: 'assets/ic-web.png' },

  // Unit pengguna aplikasi
  UNIT: 'Jurusan Gizi',

  // Pilihan nama rapat (pilihan terakhir memunculkan isian nama rapat)
  JENIS_KEGIATAN: ['Rapat PBM', 'Rapat Evaluasi Kinerja', 'Rapat Pengelola', 'Rapat PKL/Rotasi', 'Rapat Lainnya'],

  // Isian bawaan saat membuat kegiatan (bisa diubah per kegiatan)
  TEMPAT_DEFAULT: 'Ruang Rapat Jurusan Gizi Poltekkes Kemenkes Makassar',
  PENYELENGGARA_DEFAULT: 'Jurusan Gizi Poltekkes Kemenkes Makassar',

  // Jabatan default penyusun laporan evaluasi RTL
  JABATAN_PENYUSUN: 'Sekretaris Jurusan'
};
