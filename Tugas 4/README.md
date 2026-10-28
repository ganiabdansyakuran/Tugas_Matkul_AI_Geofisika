# Dashboard Batimetri Danau Unhas (3D & WebGIS Morfometri)

Dashboard geospasial interaktif berbasis *pure frontend* (HTML5, CSS3, Vanilla JavaScript) untuk visualisasi model 3D batimetri, penampang melintang, kontur kedalaman, dan analisis morfometri danau kampus Universitas Hasanuddin (Tamalanrea, Makassar).

Dibuat sebagai luaran Tugas 4 Mata Kuliah **AI Geofisika**.

---

## Fitur Unggulan Dashboard

1. **100% Offline & Mandiri (*No Server, No Internet, No Installation*)**:
   - Berjalan langsung melalui protokol `file://` hanya dengan **klik dua kali `index.html`** di browser apa pun (Google Chrome, Microsoft Edge, Firefox, Safari).
   - Tanpa ketergantungan CDN internet; seluruh dependensi (*Plotly.js*, *Delaunator*, *D3-Delaunay*) tersimpan secara lokal di folder `libs/`.
   - Tidak menggunakan pemanggilan `fetch()` atau `XMLHttpRequest` agar tidak terblokir oleh kebijakan CORS lokal browser.

2. **Model 3D Batimetri Interaktif (`mesh3d`)**:
   - Dapat diputar 360°, diperbesar (*zoom*), dan digeser (*pan*).
   - Triangulasi Delaunay dari 5,164 titik survei echosounder dan ~600 titik densifikasi garis tepi danau ($Z = 0.00\text{ m}$).
   - Slider **Vertical Exaggeration** dinamis (1.0x – 25.0x, default 5.0x).
   - Pilihan skema warna kedalaman (*Viridis*, *Blues*, *Turbo*, *Cividis*, *Tealrose*).
   - Fitur **Putar Otomatis (*360° Auto-Rotate*)** dan Reset Sudut Kamera.
   - Lapisan *toggleable*: Titik survei asli dan bidang transparan muka air ($Z = 0$).

3. **Peta 2D Kontur Kedalaman (*Isobath Map*)**:
   - Peta kontur warna dengan penanda garis penampang melintang (*slice position*) yang terhubung secara dinamis.

4. **Penampang Melintang (*Cross-Section Profile*)**:
   - Pengguna dapat memilih arah potongan: **Barat – Timur (E)** atau **Utara – Selatan (N)**.
   - Slider posisi koordinat potongan untuk melihat profil vertikal danau dan ketebalan kolom air.

5. **Peta Jalur Survei & Histogram**:
   - Visualisasi trayek sounding kapal echosounder berdasarkan nomor jalur (`L0001`, `L0002`, `L0003`).
   - Histogram distribusi frekuensi kedalaman dilengkapi garis referensi *Mean* dan *Median*.

6. **Analisis Statistik & Kestabilan Muka Air**:
   - Grafik profil kedalaman terhadap waktu dan *Box Plot* komparasi tiap jalur.
   - Grafik variasi tinggi muka air (*Water Surface Elevation*) selama survei (~30 menit).

7. **Tabel Klasifikasi Zona Kedalaman & Donut Chart**:
   - Pembagian morfometri ke dalam 4 zona: Sangat Dangkal ($<0.5\text{ m}$), Dangkal ($0.5-1.0\text{ m}$), Sedang ($1.0-1.5\text{ m}$), dan Dalam ($>1.5\text{ m}$) lengkap dengan luas ($m^2$ & ha), persentase, dan estimasi volume air ($m^3$).

8. **Filter Global & Ekspor Data**:
   - Filter reaktif berdasarkan jalur survei dan rentang kedalaman yang otomatis memperbarui seluruh grafik dan kartu KPI.
   - Tombol **Unduh 3D (PNG)** resolusi tinggi dan **Unduh CSV** data survei terfilter.

9. **Desain Modern & Mode Gelap/Terang (*Dark/Light Mode*)**:
   - Antarmuka *glassmorphic* bernuansa laut, kartu KPI beranimasi angka, dan penjelasan ilmiah ramah orang awam pada setiap grafik.

10. **Peta Kontur Kedalaman 2D & Basemap Interaktif (Leaflet)**:
    - Peta 2D interaktif lebar penuh dengan pilihan peta dasar (*Google Satelit* dan *Google Maps*). Peta dasar memerlukan koneksi internet untuk memuat tile (URL tile dikonfigurasikan melalui konstanta `BASEMAP_CONFIGS` di bagian atas `app.js` dan dapat diganti dengan mudah).
    - Menampilkan poligon terisi kontur kedalaman per interval (pilihan 0.1, 0.2, 0.25, 0.5 m) menggunakan generator `d3.contours()` dengan skema warna yang sinkron dengan model 3D.
    - Dilengkapi garis kontur dengan label kedalaman pada kontur utama, polyline batas tepi danau, dan jalur pemeruman akustik (terputus otomatis jika jarak titik > 8 m).
    - Slider transparansi kontur (0-100%), kontrol legenda lapisan dengan *checkbox* dan tombol "Pilih semua / Kosongkan", tombol "Zoom ke danau", serta pembacaan koordinat (WGS84 Lintang/Bujur, UTM East/North) dan kedalaman secara langsung saat kursor diarahkan ke danau.

---

## Struktur Direktori Proyek

```text
Tugas_4/
│
├── index.html                  # Dashboard frontend utama (Klik dua kali untuk membuka)
├── style.css                   # Stylesheet modern (Dark & Light theme, responsif)
├── app.js                      # Logika aplikasi JS (Delaunay, filter, render grafik Plotly & Leaflet)
├── data.js                     # Data survei & batas danau dalam format JavaScript
├── build_data.py               # Skrip builder pengolah data CSV & Shapefile
│
├── libs/                       # Pustaka JavaScript & CSS lokal (offline)
│   ├── plotly.min.js           # Mesin grafik 3D & 2D Plotly
│   ├── delaunator.min.js       # Algoritma triangulasi Delaunay cepat
│   ├── d3-delaunay.min.js      # Pustaka Delaunay & Voronoi D3
│   ├── proj4.js                # Transformasi koordinat geodesi (UTM 50S ke WGS84)
│   ├── d3-array.min.js         # Manipulasi array numerik D3
│   ├── d3-contour.min.js       # Generator kontur poligon MultiPolygon 2D
│   ├── leaflet.js              # Mesin peta interaktif Leaflet
│   ├── leaflet.css             # Stylesheet peta Leaflet
│   └── images/                 # Aset ikon dan bayangan marker Leaflet
│
├── Danau_Unhas.csv             # Data mentah survei batimetri (5,164 titik)
├── Danau_unhas_UTM.shp         # Shapefile garis keliling/tepi danau (digitasi QGIS)
├── Danau_unhas_UTM.prj         # Proyeksi CRS shapefile (WGS 84 / UTM zone 50S)
├── Danau_unhas_UTM.dbf         # Tabel atribut shapefile
├── Danau_unhas_UTM.shx         # Indeks geometri shapefile
│
├── requirements.txt            # Dependensi Python untuk build_data.py
└── README.md                   # Dokumentasi teknis proyek
```

---

## Cara Menjalankan

### Cara 1: Membuka Dashboard Langsung (Tanpa Instalasi)
1. Buka folder proyek di File Explorer komputer Anda.
2. **Klik dua kali file `index.html`**.
3. Dashboard akan langsung terbuka di browser default Anda secara instan dan 100% *offline*.

---

### Cara 2: Menjalankan Ulang `build_data.py` (Jika Data Mentah Diperbarui)
Skrip `build_data.py` bertugas memvalidasi koordinat, mereproyeksi CRS shapefile ke `EPSG:32750`, menyiapkan pustaka lokal di `libs/`, dan memperbarui `data.js`.

1. Pastikan Python 3 sudah terpasang di komputer Anda.
2. Pasang dependensi yang diperlukan:
   ```bash
   pip install -r requirements.txt
   ```
3. Jalankan skrip builder:
   ```bash
   python build_data.py
   ```
4. Setelah proses selesai, file `data.js` akan otomatis diperbarui. Buka kembali `index.html`.

---

## Ringkasan Morfometri Danau Unhas

| Parameter Morfometri | Nilai / Keterangan |
| :--- | :--- |
| **Sistem Koordinat** | UTM Zone 50S (EPSG:32750) |
| **Waktu Pengukuran** | 8 Oktober 2026, 10:55 – 11:25 WITA (~30 menit) |
| **Jumlah Titik Sounding** | 5,164 titik ukur aktif |
| **Jumlah Jalur Survei** | 3 Jalur (`L0001`: 4,000 titik, `L0002`: 145 titik, `L0003`: 1,019 titik) |
| **Total Panjang Trayek** | 3,081.5 meter (~3.08 km) |
| **Luas Permukaan Danau** | **47,904 m²** (4.79 hektar) |
| **Estimasi Volume Air** | **51,723 m³** (51.72 juta liter) |
| **Kedalaman Maksimum** | **2.02 meter** (Jalur L0003 di koordinat UTM 776,199 m E, 9,431,627 m N) |
| **Kedalaman Rata-rata** | **1.47 meter** |
| **Tinggi Muka Air Rata-rata** | **5.26 meter** di atas MSL |

---

## Catatan Metodologi Ilmiah
- **Acuan Muka Air ($Z = 0$)**: Bidang muka air danau dijadikan referensi nol kedalaman. Seluruh titik pada garis pantai hasil digitasi citra satelit diberi nilai $Z = 0.00\text{ m}$.
- **Metode Integrasi Volume**: Volume dihitung dengan menjumlahkan volume prisma segitiga tegak hasil triangulasi Delaunay di dalam batas poligon danau:
  $$V = \sum_{t=1}^{N} A_t \times \bar{d}_t$$
  di mana $A_t$ adalah luas segitiga ke-$t$ dan $\bar{d}_t$ adalah rata-rata kedalaman ketiga simpulnya.
- **Interpolasi Shoreline**: Mengingat kapal survei echosounder memiliki keterbatasan sarat air (*draft*), area perairan di antara titik sounding terluar dan bibir pantai danau merupakan hasil interpolasi batimetri menuju garis pantai nol, bukan hasil pemeruman langsung.
