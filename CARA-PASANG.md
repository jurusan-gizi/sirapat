# SiRapat – Bahan Rapat (lampiran PDF / PPT / DOCX)

## 1. Apps Script SiRapat
1. Ganti SELURUH isi Code.gs dengan file apps-script/Code.gs di paket ini → Simpan.
   (File ini sudah termasuk login lewat Gizi-Link.)
2. Aktifkan konversi PPT/DOCX: di editor Apps Script, panel kiri **Layanan (+)** → pilih **Drive API** → **Tambah**.
   (Gratis. Tanpa langkah ini, PDF & gambar tetap bisa; PPT/DOCX akan diminta disimpan sebagai PDF.)
3. Terapkan → Kelola deployment → Edit (ikon pensil) → Versi: **Versi baru** → Terapkan.
   Bila diminta izin, klik Izinkan.

## 2. GitHub repo sirapat
Ganti: js/app.js, js/laporan.js, css/style.css, sw.js (versi v16).
Lalu muat ulang SiRapat 1–2 kali.

## 3. Cara pakai
Kegiatan → tab Dokumen Rapat → kartu **B · Bahan Rapat** → 📎 Unggah Bahan → beri judul.
- PDF/gambar langsung diproses; PPT/DOCX dikonversi dulu (±1–2 menit).
- Maks. 25 MB per file, 60 halaman/slide per file.
- File asli tersimpan di folder Drive SiRapat (tautan "Buka file asli di Drive").
- Di Dokumen Rapat, bahan tampil paling akhir: "LAMPIRAN BAHAN RAPAT"
  (slide lanskap 2 per halaman, halaman dokumen potret 1 per halaman).
