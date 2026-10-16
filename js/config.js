/**
 * KONFIGURASI APLIKASI – sesuaikan setelah deploy (lihat README.md)
 */
window.APP_CONFIG = {
  // URL Web App Apps Script (Deploy > Web app > URL yang berakhiran /exec)
  API_URL: 'https://script.google.com/macros/s/GANTI_DENGAN_ID_DEPLOYMENT/exec',

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

  // Pilihan jenis kegiatan
  JENIS_KEGIATAN: ['Rapat', 'Rapat Bulanan', 'Workshop', 'Pelatihan', 'Seminar', 'Sosialisasi', 'Lokakarya',
    'Focus Group Discussion', 'Bimbingan Teknis', 'Kegiatan'],

  // Jabatan default penyusun laporan evaluasi RTL
  JABATAN_PENYUSUN: 'Sekretaris Jurusan'
};
