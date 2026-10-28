/**
 * ==============================================================================
 * DASHBOARD BATIMETRI DANAU UNHAS - FRONTEND CORE (app.js)
 * Mata Kuliah: AI Geofisika - Tugas 4
 * Arsitektur: Pure Client-Side JavaScript (No Server, No Fetch, 100% Offline)
 * Pustaka: Plotly.js, Delaunator
 * ==============================================================================
 */

(function () {
  "use strict";

  // ============================================================================
  // 1. KONSTANTA & STATE GLOBAL APLIKASI
  // ============================================================================
  const SURVEY_POINT_COLOR = "#000000";
  const SURVEY_POINT_SIZE = 3.5;
  const SURVEY_POINT_LINE_COLOR = "#ffffff";
  const SURVEY_POINT_LINE_WIDTH = 0.5;
  const SURVEY_POINT_Z_OFFSET = 0.02; // Offset meter display titik survei agar tidak z-fighting

  const HELPER_GRID_STEP = 2.0; // Spasi grid titik bantu (meter)
  const HELPER_MIN_SURVEY_DIST = 4.0; // Jarak minimum dari titik ukur untuk membuat titik bantu (meter)
  const BOUNDARY_DENSIFY_STEP = 4.0; // Spasi titik tepi danau yang dilonggarkan (3-5 m)

  const ROTATION_PERIOD_MS = 50000; // 50 detik per rotasi 360 derajat (~7.2 deg/s)
  const ROTATION_FRAME_INTERVAL_MS = 33; // Batasi ~30 FPS (interval 33ms)

  const SPINNER_STEP = 0.01; // Langkah per klik tombol spinner (meter) — mudah diubah di sini
  const SPINNER_STEP_SHIFT = 0.1; // Langkah Shift+panah (meter)
  const DEFAULT_CAMERA = {
    eye: { x: -1.35, y: -1.55, z: 0.85 },
    center: { x: 0, y: 0, z: 0 }
  };

  // Proyeksi Koordinat GIS (UTM Zona 50S & WGS84)
  const PROJ_UTM50S = "+proj=utm +zone=50 +south +datum=WGS84 +units=m +no_defs";
  const PROJ_WGS84 = "+proj=longlat +datum=WGS84 +no_defs";

  // URL dan Konfigurasi Basemap Tile Google
  const BASEMAP_CONFIGS = {
    satellite: {
      name: "Google Satelit",
      url: "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
      options: {
        subdomains: ["0", "1", "2", "3"],
        maxNativeZoom: 20,
        maxZoom: 22,
        attribution: "Google"
      }
    },
    roadmap: {
      name: "Google Maps",
      url: "https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
      options: {
        subdomains: ["0", "1", "2", "3"],
        maxNativeZoom: 20,
        maxZoom: 22,
        attribution: "Google"
      }
    }
  };

  const MAX_TRACK_SEGMENT_DIST = 8.0; // Jarak maksimum antar titik berurutan sebelum jalur diputus (meter)

  // Konfigurasi bersama untuk 4 diagram statistik (tanpa tombol select/lasso/autoscale)
  const STATS_PLOT_CONFIG = {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d"]
  };

  // Pemetaan dinamis nama seri ke indeks trace Plotly untuk restyle
  const TRACE_MAPS = {
    tracks: {},
    timeSeries: {},
    boxplot: {},
    wse: {}
  };

  const STATE = {
    theme: "dark",
    verticalExaggeration: 5.0,
    colorscale: "Viridis",
    showPoints3D: false,
    isRotating: false,

    // Konfigurasi Peta Basemap Leaflet
    basemapState: {
      activeType: "satellite",
      contourInterval: 0.2,
      transparency: 35, // default 35%
      layers: {
        contours: true,
        boundary: true,
        tracks: true
      }
    },
    contourGrid: null,

    // Filter Global: Draft (di kontrol) vs Applied (visualisasi & perhitungan)
    draftFilter: {
      activeLines: new Set(["L0001", "L0002", "L0003"]),
      minDepth: 0.0,
      maxDepth: 2.2
    },
    appliedFilter: {
      activeLines: new Set(["L0001", "L0002", "L0003"]),
      minDepth: 0.0,
      maxDepth: 2.2
    },

    // Status Centang Legenda Kustom
    legendState: {
      tracks: {
        boundary: true,
        L0001: true,
        L0002: true,
        L0003: true
      },
      lines: {
        L0001: true,
        L0002: true,
        L0003: true
      },
      wse: {
        elevasi: true,
        rata_rata: true
      },
      basemap: {
        contours: true,
        boundary: true,
        tracks: true
      }
    },

    // Cross-Section Slice
    sliceDirection: "WE", // 'WE' (Barat-Timur) atau 'SN' (Utara-Selatan)
    slicePosPercent: 50,  // 0% hingga 100%
    sliceCoord: 0.0,

    // Data Olahan
    rawPoints: [],
    boundaryPoints: [],
    densifiedBoundary: [],
    helperPoints: [],
    filteredPoints: [],
    
    // Mesh 3D & Triangulasi
    delaunayMesh: {
      x: [],
      y: [],
      z: [],
      depth: [],
      i: [],
      j: [],
      k: [],
      triangles: []
    },

    // Nilai Referensi Koordinat
    minE: 0,
    minN: 0,
    maxE: 0,
    maxN: 0
  };

  // Palet Warna Berdasarkan Tema
  const THEME_CONFIG = {
    dark: {
      bg: "#111e38",
      paperBg: "#111e38",
      plotBg: "#111e38",
      textColor: "#f8fafc",
      gridColor: "#1e293b",
      zerolineColor: "#334155",
      lakeBoundaryColor: "#f43f5e",
      sliceLineColor: "#fbbf24"
    },
    light: {
      bg: "#ffffff",
      paperBg: "#ffffff",
      plotBg: "#ffffff",
      textColor: "#0f172a",
      gridColor: "#e2e8f0",
      zerolineColor: "#cbd5e1",
      lakeBoundaryColor: "#e11d48",
      sliceLineColor: "#d97706"
    }
  };

  const LINE_COLORS = {
    L0001: "#10b981", // Emerald
    L0002: "#f59e0b", // Amber
    L0003: "#8b5cf6"  // Purple
  };

  // ============================================================================
  // 2. FUNGSI GEOMETRI & PEMROSESAN DATA DI BROWSER
  // ============================================================================

  /**
   * Menghitung luas poligon tertutup menggunakan rumus Shoelace (Gauss)
   */
  function calculateShoelaceArea(polygon) {
    let area = 0;
    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      area += (polygon[j][0] + polygon[i][0]) * (polygon[j][1] - polygon[i][1]);
    }
    return Math.abs(area / 2);
  }

  /**
   * Uji apakah titik (px, py) berada di dalam poligon (Ray-Casting Algorithm)
   */
  function isPointInPolygon(px, py, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Menghitung jarak terpendek titik (px, py) ke segmen garis (x1, y1)-(x2, y2)
   */
  function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  /**
   * Menghitung jarak terpendek titik (px, py) ke seluruh segmen garis tepi polygon
   */
  function distToBoundary(px, py, boundary) {
    let minDist = Infinity;
    for (let i = 0; i < boundary.length - 1; i++) {
      const d = distToSegment(px, py, boundary[i][0], boundary[i][1], boundary[i + 1][0], boundary[i + 1][1]);
      if (d < minDist) minDist = d;
    }
    return minDist;
  }

  /**
   * Densifikasi garis keliling tepi danau dengan jarak interval 3-5 meter (konstanta BOUNDARY_DENSIFY_STEP) dan Z = 0
   */
  function densifyBoundary(boundary, stepMeters = BOUNDARY_DENSIFY_STEP) {
    const densified = [];
    for (let i = 0; i < boundary.length - 1; i++) {
      const p1 = boundary[i];
      const p2 = boundary[i + 1];
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      const dist = Math.hypot(dx, dy);
      const segments = Math.max(1, Math.ceil(dist / stepMeters));

      for (let s = 0; s < segments; s++) {
        densified.push({
          name: `Shoreline_${i}_${s}`,
          line: "Shoreline",
          time: "",
          e: p1[0] + (dx * s) / segments,
          n: p1[1] + (dy * s) / segments,
          depth: 0.0,
          z: 0.0,
          isBoundary: true
        });
      }
    }
    return densified;
  }

  /**
   * Menghasilkan titik bantu (helper points) pada grid reguler (spasi HELPER_GRID_STEP = 2.0 m)
   * di seluruh area di dalam poligon tepi yang berjarak > HELPER_MIN_SURVEY_DIST (4.0 m) dari titik ukur.
   * Kedalaman dihitung secara bertahap (linier) dari titik ukur terluar menuju 0 di garis tepi:
   * depth = z_s * (d_b / (d_b + d_s)), Z = -depth. Titik tepi tidak dipakai dalam perhitungan IDW.
   */
  function generateHelperPoints(surveyPoints, boundary, gridStep = HELPER_GRID_STEP, minDistThreshold = HELPER_MIN_SURVEY_DIST) {
    let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
    boundary.forEach(p => {
      minE = Math.min(minE, p[0]);
      maxE = Math.max(maxE, p[0]);
      minN = Math.min(minN, p[1]);
      maxN = Math.max(maxN, p[1]);
    });

    // Spatial hash grid untuk mempercepat pencarian titik ukur terdekat (cell size 10m)
    const cellSize = 10.0;
    const grid = new Map();
    for (let i = 0; i < surveyPoints.length; i++) {
      const p = surveyPoints[i];
      const cx = Math.floor(p.e / cellSize);
      const cy = Math.floor(p.n / cellSize);
      const key = `${cx}_${cy}`;
      let cell = grid.get(key);
      if (!cell) {
        cell = [];
        grid.set(key, cell);
      }
      cell.push(p);
    }

    const helperPoints = [];

    for (let e = minE + gridStep / 2; e <= maxE; e += gridStep) {
      for (let n = minN + gridStep / 2; n <= maxN; n += gridStep) {
        if (!isPointInPolygon(e, n, boundary)) continue;

        const baseCx = Math.floor(e / cellSize);
        const baseCy = Math.floor(n / cellSize);

        // Uji cepat: jika ada titik ukur dalam radius minDistThreshold (4m), lewati
        let tooClose = false;
        for (let dx = -1; dx <= 1 && !tooClose; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const cell = grid.get(`${baseCx + dx}_${baseCy + dy}`);
            if (cell) {
              for (let i = 0; i < cell.length; i++) {
                if (Math.hypot(cell[i].e - e, cell[i].n - n) <= minDistThreshold) {
                  tooClose = true;
                  break;
                }
              }
              if (tooClose) break;
            }
          }
        }
        if (tooClose) continue;

        // Cari k = 3 titik ukur terdekat
        let top3 = [
          { d: Infinity, depth: 0 },
          { d: Infinity, depth: 0 },
          { d: Infinity, depth: 0 }
        ];

        let searchRadius = 1;
        let found = 0;
        while (found < 3 && searchRadius <= 35) {
          for (let dx = -searchRadius; dx <= searchRadius; dx++) {
            for (let dy = -searchRadius; dy <= searchRadius; dy++) {
              if (Math.abs(dx) !== searchRadius && Math.abs(dy) !== searchRadius) continue;
              const cell = grid.get(`${baseCx + dx}_${baseCy + dy}`);
              if (cell) {
                for (let i = 0; i < cell.length; i++) {
                  const d = Math.hypot(cell[i].e - e, cell[i].n - n);
                  if (d < top3[2].d) {
                    top3[2] = { d, depth: cell[i].depth };
                    top3.sort((a, b) => a.d - b.d);
                    found++;
                  }
                }
              }
            }
          }
          searchRadius++;
        }

        // z_s = rata-rata berbobot 1/d dari kedalaman k=3 titik ukur terdekat
        let wSum = 0;
        let valSum = 0;
        for (const item of top3) {
          if (item.d === Infinity) continue;
          if (item.d < 1e-4) {
            valSum = item.depth;
            wSum = 1;
            break;
          }
          const w = 1.0 / item.d;
          wSum += w;
          valSum += w * item.depth;
        }

        const z_s = wSum > 0 ? (valSum / wSum) : 0.0;
        const d_s = top3[0].d;
        const nearestDepth = top3[0].depth;

        // d_b = jarak terpendek p ke garis tepi poligon (jarak titik ke segmen)
        const d_b = distToBoundary(e, n, boundary);

        // Kedalaman titik bantu menurun linier bertahap: z_s * d_b / (d_b + d_s)
        let depth = (d_b + d_s > 0) ? (z_s * (d_b / (d_b + d_s))) : 0.0;
        // Pastikan tidak pernah lebih besar dari kedalaman titik ukur terdekat, dan tidak pernah negatif
        depth = Math.max(0.0, Math.min(nearestDepth, depth));

        helperPoints.push({
          e: e,
          n: n,
          depth: depth,
          z: -depth,
          d_b: d_b,
          d_s: d_s,
          name: `Helper_${helperPoints.length}`,
          line: "Interpolated",
          isHelper: true
        });
      }
    }

    return helperPoints;
  }

  /**
   * Melakukan Triangulasi Delaunay dan membuang segitiga di luar danau
   * Menggunakan filter: titik pusat (centroid) berada di dalam polygon danau,
   * serta membuang segitiga flat Z=0 di bagian danau dengan lebar >= 3 meter.
   */
  function buildDelaunayMesh() {
    const minE = STATE.minE;
    const minN = STATE.minN;

    // Gabungkan titik survei terfilter + titik batas tepi danau (Z = 0) + titik bantu interpolasi
    const combinedPoints = [];
    
    // 1. Titik survei aktif
    STATE.filteredPoints.forEach(p => {
      combinedPoints.push({
        x: p.e - minE,
        y: p.n - minN,
        e: p.e,
        n: p.n,
        z: -p.depth,
        depth: p.depth,
        name: p.name,
        line: p.line,
        isBoundary: false
      });
    });

    // 2. Titik batas pantai (Z = 0)
    STATE.densifiedBoundary.forEach(b => {
      combinedPoints.push({
        x: b.e - minE,
        y: b.n - minN,
        e: b.e,
        n: b.n,
        z: 0.0,
        depth: 0.0,
        name: b.name,
        line: "Shoreline",
        isBoundary: true
      });
    });

    // 3. Titik bantu interpolasi untuk menutup celah area tanpa pengukuran
    if (STATE.helperPoints && STATE.helperPoints.length > 0) {
      STATE.helperPoints.forEach(h => {
        combinedPoints.push({
          x: h.e - minE,
          y: h.n - minN,
          e: h.e,
          n: h.n,
          z: h.z,
          depth: h.depth,
          name: h.name,
          line: "Interpolated",
          isBoundary: false
        });
      });
    }

    if (combinedPoints.length < 3) return;

    // Siapkan array koordinat 2D untuk Delaunator
    const coords2d = combinedPoints.map(p => [p.x, p.y]);
    
    // Eksekusi Delaunay Triangulation
    const d = Delaunator.from(coords2d);
    const triangles = d.triangles;

    const validI = [];
    const validJ = [];
    const validK = [];
    const validTriangles = [];

    const boundary = DATA.boundary;

    for (let t = 0; t < triangles.length; t += 3) {
      const i0 = triangles[t];
      const i1 = triangles[t + 1];
      const i2 = triangles[t + 2];

      const p0 = combinedPoints[i0];
      const p1 = combinedPoints[i1];
      const p2 = combinedPoints[i2];

      // Hitung titik berat (centroid) segitiga dalam koordinat asli
      const cx = (p0.e + p1.e + p2.e) / 3;
      const cy = (p0.n + p1.n + p2.n) / 3;

      // Filter 1: titik berat (centroid) harus berada di dalam poligon danau
      if (isPointInPolygon(cx, cy, boundary)) {
        // Filter 2: buang segitiga yang ketiga titik sudutnya semuanya titik tepi (Z=0),
        // KECUALI jika segitiga itu memang di dalam poligon yang sempit (lebar < 3 m, yaitu dCentroid < 1.5 m)
        const isAllBoundary = p0.isBoundary && p1.isBoundary && p2.isBoundary;
        if (isAllBoundary) {
          const dCentroid = distToBoundary(cx, cy, boundary);
          if (dCentroid >= 1.5) {
            continue; // Buang segitiga flat di tengah danau
          }
        }

        validI.push(i0);
        validJ.push(i1);
        validK.push(i2);

        // Hitung luas segitiga (rumus Cross Product 2D)
        const triArea = 0.5 * Math.abs(
          p0.x * (p1.y - p2.y) +
          p1.x * (p2.y - p0.y) +
          p2.x * (p0.y - p1.y)
        );
        const avgDepth = (p0.depth + p1.depth + p2.depth) / 3;
        validTriangles.push({
          i: i0, j: i1, k: i2,
          area: triArea,
          avgDepth: avgDepth,
          volume: triArea * avgDepth
        });
      }
    }

    STATE.delaunayMesh = {
      x: combinedPoints.map(p => p.x),
      y: combinedPoints.map(p => p.y),
      e: combinedPoints.map(p => p.e),
      n: combinedPoints.map(p => p.n),
      z: combinedPoints.map(p => p.z),
      depth: combinedPoints.map(p => p.depth),
      i: validI,
      j: validJ,
      k: validK,
      triangles: validTriangles,
      points: combinedPoints
    };
  }

  /**
   * Menghitung metrik morfometri danau (luas, volume, statistik kedalaman)
   * Luas dan volume dihitung langsung dari mesh 3D yang telah diperbaiki
   */
  function calculateMetrics() {
    // 1. Luas permukaan danau & volume air danau dari mesh 3D yang telah diperbaiki
    let totalMeshArea = 0;
    let totalVolume = 0;
    if (STATE.delaunayMesh && STATE.delaunayMesh.triangles) {
      STATE.delaunayMesh.triangles.forEach(t => {
        totalMeshArea += t.area;
        totalVolume += t.volume;
      });
    }

    const lakeArea = totalMeshArea > 0 ? totalMeshArea : calculateShoelaceArea(DATA.boundary);

    // 2. Statistik kedalaman: mean dari volume/luas mesh, min dan max dari data ukur
    const depths = STATE.filteredPoints.map(p => p.depth);
    let minD = 0, maxD = 0, meanD = 0, medianD = 0;

    if (depths.length > 0) {
      minD = Math.min(...depths);
      maxD = Math.max(...depths);
      meanD = totalMeshArea > 0 ? (totalVolume / totalMeshArea) : (depths.reduce((a, b) => a + b, 0) / depths.length);
      
      const sorted = [...depths].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      medianD = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    // 3. Panjang lintasan survei
    let totalLengthM = 0;
    STATE.appliedFilter.activeLines.forEach(lineId => {
      if (DATA.meta.lineStats[lineId]) {
        totalLengthM += DATA.meta.lineStats[lineId].length_m;
      }
    });

    return {
      area: lakeArea,
      volume: totalVolume,
      minDepth: minD,
      maxDepth: maxD,
      meanDepth: meanD,
      medianDepth: medianD,
      pointsCount: STATE.filteredPoints.length,
      trackLengthM: totalLengthM
    };
  }

  // ============================================================================
  // 3. ANIMASI COUNTER & UPDATE KARTU KPI
  // ============================================================================

  function animateNumber(elementId, targetValue, decimals = 0, duration = 800) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    const startValue = parseFloat(el.textContent.replace(/,/g, "")) || 0;
    const startTime = performance.now();

    function updateCounter(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1.0);
      // Easing out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (targetValue - startValue) * eased;

      el.textContent = current.toLocaleString("id-ID", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });

      if (progress < 1.0) {
        requestAnimationFrame(updateCounter);
      } else {
        el.textContent = targetValue.toLocaleString("id-ID", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        });
      }
    }
    requestAnimationFrame(updateCounter);
  }

  function updateKpiCards() {
    const m = calculateMetrics();

    animateNumber("kpi-area", m.area, 0);
    const elHa = document.getElementById("kpi-area-ha");
    if (elHa) elHa.textContent = `Setara dengan ${(m.area / 10000).toFixed(3)} hektar`;

    animateNumber("kpi-volume", m.volume, 0);
    const elVolLiters = document.getElementById("kpi-volume-liters");
    if (elVolLiters) elVolLiters.textContent = `Setara dengan ${(m.volume * 1000).toLocaleString("id-ID")} liter air`;

    animateNumber("kpi-max-depth", m.maxDepth, 2);
    animateNumber("kpi-mean-depth", m.meanDepth, 2);
    
    const elMedian = document.getElementById("kpi-median-depth");
    if (elMedian) elMedian.textContent = `Median: ${m.medianDepth.toFixed(2)} m (Min: ${m.minDepth.toFixed(2)} m)`;

    animateNumber("kpi-points-count", m.pointsCount, 0);
    const elBound = document.getElementById("kpi-boundary-count");
    if (elBound) elBound.textContent = `+${STATE.densifiedBoundary.length} titik tepi pantai`;

    animateNumber("kpi-track-length", m.trackLengthM, 1);
    const elLines = document.getElementById("kpi-lines-count");
    if (elLines) elLines.textContent = `${STATE.appliedFilter.activeLines.size} Jalur Survei Aktif`;
  }

  // ============================================================================
  // 4. VISUALISASI PLOTLY
  // ============================================================================

  /**
   * 4.1 MODEL 3D UTAMA (Plotly mesh3d)
   */
  function render3DModel() {
    const container = document.getElementById("plot-3d");
    if (!container) return;

    const mesh = STATE.delaunayMesh;
    const tc = THEME_CONFIG[STATE.theme];

    // Pertahankan pilihan mode pengguna (orbit, zoom, pan) jika sudah aktif, atau default ke 'orbit'
    let currentDragmode = "orbit";
    if (container && container._fullLayout && container._fullLayout.scene && container._fullLayout.scene.dragmode) {
      currentDragmode = container._fullLayout.scene.dragmode;
    }

    // Traces array
    const traces = [];

    // 1. Dasar Danau (mesh3d)
    const hoverText = mesh.depth.map((d, idx) => {
      const e = mesh.e[idx].toFixed(2);
      const n = mesh.n[idx].toFixed(2);
      const z = mesh.z[idx].toFixed(2);
      const p = mesh.points && mesh.points[idx];
      let label = "Batimetri Danau (Hasil Ukur)";
      if (p && p.line === "Shoreline") label = "Garis Pantai (Elevasi 0 m)";
      else if (p && p.line === "Interpolated") label = "Batimetri Danau (Hasil Interpolasi)";
      return `<b>${label}</b><br>East: ${e} m<br>North: ${n} m<br>Elevasi Z: ${z} m<br>Kedalaman: ${d.toFixed(2)} m`;
    });

    traces.push({
      type: "mesh3d",
      x: mesh.x,
      y: mesh.y,
      z: mesh.z,
      i: mesh.i,
      j: mesh.j,
      k: mesh.k,
      intensity: mesh.depth,
      colorscale: STATE.colorscale,
      cmin: 0.0,
      cmax: 2.05,
      colorbar: {
        title: {
          text: "<b>Kedalaman<br>(m)</b>",
          side: "top",
          font: { color: tc.textColor, size: 12 }
        },
        ticksuffix: " m",
        tickfont: { color: tc.textColor, size: 11 },
        len: 0.75,
        thickness: 16,
        x: 1.02,
        xanchor: "left",
        xpad: 8,
        y: 0.5,
        yanchor: "middle"
      },
      hoverinfo: "text",
      text: hoverText,
      name: "Dasar Danau",
      opacity: 1.0
    });

    // 2. Garis Tepi Danau di Z = 0 (scatter3d)
    const bx = DATA.boundary.map(p => p[0] - STATE.minE);
    const by = DATA.boundary.map(p => p[1] - STATE.minN);
    const bz = new Array(bx.length).fill(0.0);

    traces.push({
      type: "scatter3d",
      mode: "lines",
      x: bx,
      y: by,
      z: bz,
      line: { color: tc.lakeBoundaryColor, width: 6 },
      name: "Garis Tepi Danau (Z=0)",
      hoverinfo: "skip"
    });

    // 3. Titik Survei Asli (scatter3d - toggleable)
    if (STATE.showPoints3D) {
      const sx = STATE.filteredPoints.map(p => p.e - STATE.minE);
      const sy = STATE.filteredPoints.map(p => p.n - STATE.minN);
      // Naikkan Z sedikit (+0.02 m) khusus untuk visualisasi agar tidak z-fighting dengan mesh
      const sz = STATE.filteredPoints.map(p => -p.depth + SURVEY_POINT_Z_OFFSET);

      traces.push({
        type: "scatter3d",
        mode: "markers",
        x: sx,
        y: sy,
        z: sz,
        marker: {
          size: SURVEY_POINT_SIZE,
          color: SURVEY_POINT_COLOR,
          line: {
            color: SURVEY_POINT_LINE_COLOR,
            width: SURVEY_POINT_LINE_WIDTH
          },
          opacity: 0.95
        },
        name: "Titik Survei",
        hoverinfo: "text",
        text: STATE.filteredPoints.map(p => `<b>${p.name}</b><br>Jalur: ${p.line}<br>Kedalaman: ${p.depth.toFixed(2)} m<br>Elevasi Z: ${(-p.depth).toFixed(2)} m`)
      });
    }

    // Hitung Aspect Ratio berdasarkan dimensi aktual dan Vertical Exaggeration
    const dx = STATE.maxE - STATE.minE;
    const dy = STATE.maxN - STATE.minN;
    const dz = 2.05;
    const maxDim = Math.max(dx, dy);

    const aspectX = dx / maxDim;
    const aspectY = dy / maxDim;
    const aspectZ = (dz / maxDim) * STATE.verticalExaggeration;

    const layout = {
      uirevision: "lake-3d-model-camera",
      paper_bgcolor: tc.paperBg,
      plot_bgcolor: tc.plotBg,
      font: { color: tc.textColor, family: "inherit" },
      margin: { l: 10, r: 100, b: 10, t: 25 },
      scene: {
        dragmode: currentDragmode,
        xaxis: {
          title: "East (m)",
          color: tc.textColor,
          gridcolor: tc.gridColor,
          backgroundcolor: tc.bg,
          showbackground: true
        },
        yaxis: {
          title: "North (m)",
          color: tc.textColor,
          gridcolor: tc.gridColor,
          backgroundcolor: tc.bg,
          showbackground: true
        },
        zaxis: {
          title: "Elevasi Z (m)",
          color: tc.textColor,
          gridcolor: tc.gridColor,
          zerolinecolor: tc.lakeBoundaryColor,
          backgroundcolor: tc.bg,
          showbackground: true
        },
        aspectmode: "manual",
        aspectratio: { x: aspectX, y: aspectY, z: aspectZ },
        camera: {
          eye: { ...DEFAULT_CAMERA.eye },
          center: { ...DEFAULT_CAMERA.center }
        }
      },
      legend: {
        x: 0.02,
        y: 0.95,
        bgcolor: STATE.theme === "dark" ? "rgba(17, 30, 56, 0.85)" : "rgba(255, 255, 255, 0.85)",
        font: { color: tc.textColor }
      }
    };

    const config = {
      responsive: true,
      displayModeBar: true,
      displaylogo: false,
      // Hapus tombol turntable dan last-save camera; orbit dan home tetap ada
      modeBarButtonsToRemove: ["tableRotation", "resetCameraLastSave3d"],
      modeBarButtons: [
        ["zoom3d", "pan3d", "orbitRotation"],
        ["resetCameraDefault3d"],
        ["toImage"]
      ]
    };

    Plotly.react(container, traces, layout, config).then(() => {
      const loader = document.getElementById("loading-3d");
      if (loader) loader.style.display = "none";
    });
  }

  /**
   * 4.2 PETA 2D KONTUR KEDALAMAN (Heatmap / Contour dengan Garis Irisan)
   */
  function render2DContourMap() {
    const container = document.getElementById("plot-2d-contour");
    if (!container) return;
    const tc = THEME_CONFIG[STATE.theme];

    // Siapkan grid 2D reguler untuk kontur (step 2.5m)
    const step = 2.5;
    const xGrid = [];
    for (let e = STATE.minE; e <= STATE.maxE + step; e += step) xGrid.push(e);
    const yGrid = [];
    for (let n = STATE.minN; n <= STATE.maxN + step; n += step) yGrid.push(n);

    // IDW Interpolasi ke sel-sel grid di dalam danau
    const zMatrix = [];
    const pts = STATE.filteredPoints;
    const boundary = DATA.boundary;

    for (let j = 0; j < yGrid.length; j++) {
      const row = [];
      const y = yGrid[j];
      for (let i = 0; i < xGrid.length; i++) {
        const x = xGrid[i];
        if (isPointInPolygon(x, y, boundary)) {
          // Cari beberapa titik survei terdekat untuk IDW
          let wSum = 0;
          let valSum = 0;
          let minDist = Infinity;
          let nearestVal = 0;

          for (let k = 0; k < pts.length; k += 3) {
            const d = Math.hypot(pts[k].e - x, pts[k].n - y);
            if (d < minDist) {
              minDist = d;
              nearestVal = pts[k].depth;
            }
            if (d < 30) {
              const w = 1 / Math.pow(d + 0.1, 2);
              wSum += w;
              valSum += w * pts[k].depth;
            }
          }

          const z_s = wSum > 0 ? (valSum / wSum) : nearestVal;
          const d_b = distToBoundary(x, y, boundary);
          // Taper kedalaman bertahap menuju 0 di garis tepi danau
          const cellDepth = Math.max(0.0, Math.min(nearestVal, (d_b + minDist > 0) ? (z_s * d_b / (d_b + minDist)) : 0.0));
          row.push(cellDepth);
        } else {
          row.push(null);
        }
      }
      zMatrix.push(row);
    }

    // Simpan grid kontur untuk dipakai oleh peta basemap Leaflet (tanpa interpolasi ulang)
    STATE.contourGrid = {
      xGrid,
      yGrid,
      zMatrix,
      step
    };

    const traces = [
      // Kontur kedalaman
      {
        type: "contour",
        x: xGrid,
        y: yGrid,
        z: zMatrix,
        colorscale: STATE.colorscale,
        reversescale: false,
        cmin: 0,
        cmax: 2.05,
        contours: {
          coloring: "heatmap",
          showlines: true,
          showlabels: true,
          labelfont: { size: 10, color: "#ffffff" }
        },
        colorbar: {
          title: {
            text: "<b>Kedalaman<br>(m)</b>",
            side: "top",
            font: { color: tc.textColor, size: 12 }
          },
          ticksuffix: " m",
          tickfont: { color: tc.textColor, size: 11 },
          len: 0.85,
          thickness: 16,
          x: 1.02,
          xanchor: "left",
          xpad: 8
        },
        hoverinfo: "x+y+z",
        name: "Kedalaman (m)"
      },
      // Garis tepi danau
      {
        type: "scatter",
        mode: "lines",
        x: boundary.map(p => p[0]),
        y: boundary.map(p => p[1]),
        line: { color: tc.lakeBoundaryColor, width: 3 },
        name: "Batas Danau",
        hoverinfo: "skip"
      }
    ];

    // Garis penunjuk irisan (Slice Indicator Line)
    if (STATE.sliceDirection === "WE") {
      // Garis horizontal pada Northing tertentu
      traces.push({
        type: "scatter",
        mode: "lines",
        x: [STATE.minE - 10, STATE.maxE + 10],
        y: [STATE.sliceCoord, STATE.sliceCoord],
        line: { color: tc.sliceLineColor, width: 3, dash: "dash" },
        name: "Posisi Potongan (Irisan)",
        hoverinfo: "skip"
      });
    } else {
      // Garis vertikal pada Easting tertentu
      traces.push({
        type: "scatter",
        mode: "lines",
        x: [STATE.sliceCoord, STATE.sliceCoord],
        y: [STATE.minN - 10, STATE.maxN + 10],
        line: { color: tc.sliceLineColor, width: 3, dash: "dash" },
        name: "Posisi Potongan (Irisan)",
        hoverinfo: "skip"
      });
    }

    const layout = {
      paper_bgcolor: tc.paperBg,
      plot_bgcolor: tc.plotBg,
      font: { color: tc.textColor, family: "inherit" },
      margin: { l: 55, r: 90, b: 45, t: 25 },
      xaxis: { title: "East (m)", color: tc.textColor, gridcolor: tc.gridColor },
      yaxis: { title: "North (m)", color: tc.textColor, gridcolor: tc.gridColor, scaleanchor: "x" },
      showlegend: false
    };

    Plotly.react(container, traces, layout, { responsive: true, displaylogo: false });
  }

  /**
   * 4.3 PENAMPANG MELINTANG (Cross-Section Profile)
   */
  function renderCrossSection() {
    const container = document.getElementById("plot-cross-section");
    if (!container) return;
    const tc = THEME_CONFIG[STATE.theme];

    const isWE = STATE.sliceDirection === "WE";
    const sliceVal = STATE.sliceCoord;
    const boundary = DATA.boundary;
    const pts = STATE.filteredPoints;

    // Sampel titik-titik sepanjang garis irisan
    const sampleDistances = [];
    const bedElevations = [];
    const waterElevations = [];

    const minCoord = isWE ? STATE.minE : STATE.minN;
    const maxCoord = isWE ? STATE.maxE : STATE.maxN;
    const step = 2.0;

    for (let coord = minCoord; coord <= maxCoord; coord += step) {
      const e = isWE ? coord : sliceVal;
      const n = isWE ? sliceVal : coord;
      const distFromStart = coord - minCoord;

      if (isPointInPolygon(e, n, boundary)) {
        // Interpolasi kedalaman pada koordinat (e, n) menggunakan titik survei terdekat
        let wSum = 0;
        let valSum = 0;
        let minDist = Infinity;
        let nearestDepth = 0;

        for (let k = 0; k < pts.length; k += 2) {
          const d = Math.hypot(pts[k].e - e, pts[k].n - n);
          if (d < minDist) {
            minDist = d;
            nearestDepth = pts[k].depth;
          }
          if (d < 25) {
            const w = 1 / Math.pow(d + 0.1, 2);
            wSum += w;
            valSum += w * pts[k].depth;
          }
        }

        const z_s = wSum > 0 ? (valSum / wSum) : nearestDepth;
        const d_b = distToBoundary(e, n, boundary);
        // Taper kedalaman bertahap menuju 0 di garis tepi danau
        const depth = Math.max(0.0, Math.min(nearestDepth, (d_b + minDist > 0) ? (z_s * d_b / (d_b + minDist)) : 0.0));

        sampleDistances.push(distFromStart);
        bedElevations.push(-depth); // Z dasar danau
        waterElevations.push(0.0);   // Muka air Z = 0
      } else {
        // Di luar danau
        if (sampleDistances.length > 0 && bedElevations[bedElevations.length - 1] !== null) {
          sampleDistances.push(distFromStart);
          bedElevations.push(null);
          waterElevations.push(null);
        }
      }
    }

    const traces = [
      // Lapisan Air (Area Terisi Air)
      {
        type: "scatter",
        mode: "lines",
        x: sampleDistances,
        y: waterElevations,
        line: { color: "#38bdf8", width: 2 },
        name: "Muka Air (Z = 0 m)",
        hoverinfo: "x+y"
      },
      // Dasar Danau dengan Isian Air Biru di Antara Garis
      {
        type: "scatter",
        mode: "lines",
        x: sampleDistances,
        y: bedElevations,
        fill: "tonexty",
        fillcolor: STATE.theme === "dark" ? "rgba(56, 189, 248, 0.35)" : "rgba(2, 132, 199, 0.3)",
        line: { color: "#f59e0b", width: 3 },
        name: "Dasar Danau (Batimetri)",
        hoverinfo: "text",
        text: bedElevations.map(z => z !== null ? `Kedalaman: ${(-z).toFixed(2)} m (Elevasi: ${z.toFixed(2)} m)` : "")
      }
    ];

    const axisLabel = isWE ? "Jarak Barat - Timur (meter)" : "Jarak Selatan - Utara (meter)";
    const layout = {
      paper_bgcolor: tc.paperBg,
      plot_bgcolor: tc.plotBg,
      font: { color: tc.textColor, family: "inherit" },
      margin: { l: 55, r: 25, b: 45, t: 25 },
      xaxis: { title: axisLabel, color: tc.textColor, gridcolor: tc.gridColor },
      yaxis: {
        title: "Elevasi Z (m)",
        color: tc.textColor,
        gridcolor: tc.gridColor,
        range: [-2.5, 0.5],
        zerolinecolor: "#38bdf8",
        zerolinewidth: 2
      },
      legend: {
        x: 0.02,
        y: 0.15,
        bgcolor: STATE.theme === "dark" ? "rgba(17, 30, 56, 0.8)" : "rgba(255, 255, 255, 0.8)",
        font: { color: tc.textColor }
      }
    };

    Plotly.react(container, traces, layout, { responsive: true, displaylogo: false });
  }

  // ============================================================================
  // FUNGSI KONTROL LEGENDA KUSTOM HTML UNTUK 3 DIAGRAM
  // ============================================================================

  function getToggleBtnText(type) {
    if (type === "tracks") {
      const inputs = document.querySelectorAll("#legend-tracks input[type='checkbox']:not(:disabled)");
      const anyChecked = Array.from(inputs).some(cb => cb.checked);
      return anyChecked ? "Kosongkan" : "Pilih Semua";
    } else if (type === "lines") {
      const inputs = document.querySelectorAll("#legend-lines input[type='checkbox']:not(:disabled)");
      const anyChecked = Array.from(inputs).some(cb => cb.checked);
      return anyChecked ? "Kosongkan" : "Pilih Semua";
    } else if (type === "wse") {
      const inputs = document.querySelectorAll("#legend-wse input[type='checkbox']:not(:disabled)");
      const anyChecked = Array.from(inputs).some(cb => cb.checked);
      return anyChecked ? "Kosongkan" : "Pilih Semua";
    }
    return "Pilih Semua / Kosongkan";
  }

  function refreshLegendToggleBtn(type) {
    const btn = document.getElementById(`btn-toggle-${type}`);
    if (btn) btn.textContent = getToggleBtnText(type);
  }

  function toggleAllLegendItems(type) {
    if (type === "tracks") {
      const container = document.getElementById("plot-tracks");
      const inputs = document.querySelectorAll("#legend-tracks input[type='checkbox']:not(:disabled)");
      const anyChecked = Array.from(inputs).some(cb => cb.checked);
      const targetState = !anyChecked;

      inputs.forEach(cb => {
        cb.checked = targetState;
        const key = cb.getAttribute("data-key");
        if (key) STATE.legendState.tracks[key] = targetState;
      });

      if (container) {
        const indices = [];
        Object.entries(STATE.legendState.tracks).forEach(([key, val]) => {
          const idx = TRACE_MAPS.tracks[key];
          if (idx !== undefined && idx >= 0) indices.push(idx);
        });
        if (indices.length > 0) {
          Plotly.restyle(container, { visible: targetState }, indices);
        }
      }
      refreshLegendToggleBtn("tracks");
    } else if (type === "lines") {
      const timeContainer = document.getElementById("plot-depth-series");
      const boxContainer = document.getElementById("plot-boxplot");
      const inputs = document.querySelectorAll("#legend-lines input[type='checkbox']:not(:disabled)");
      const anyChecked = Array.from(inputs).some(cb => cb.checked);
      const targetState = !anyChecked;

      inputs.forEach(cb => {
        cb.checked = targetState;
        const key = cb.getAttribute("data-key");
        if (key) STATE.legendState.lines[key] = targetState;
      });

      if (timeContainer) {
        const timeIndices = [];
        Object.entries(STATE.legendState.lines).forEach(([key, val]) => {
          const idx = TRACE_MAPS.timeSeries[key];
          if (idx !== undefined && idx >= 0) timeIndices.push(idx);
        });
        if (timeIndices.length > 0) {
          Plotly.restyle(timeContainer, { visible: targetState }, timeIndices);
        }
      }

      if (boxContainer) {
        const boxIndices = [];
        Object.entries(STATE.legendState.lines).forEach(([key, val]) => {
          const idx = TRACE_MAPS.boxplot[key];
          if (idx !== undefined && idx >= 0) boxIndices.push(idx);
        });
        if (boxIndices.length > 0) {
          Plotly.restyle(boxContainer, { visible: targetState }, boxIndices);
        }
      }
      refreshLegendToggleBtn("lines");
    } else if (type === "wse") {
      const container = document.getElementById("plot-wse");
      const inputs = document.querySelectorAll("#legend-wse input[type='checkbox']:not(:disabled)");
      const anyChecked = Array.from(inputs).some(cb => cb.checked);
      const targetState = !anyChecked;

      inputs.forEach(cb => {
        cb.checked = targetState;
        const key = cb.getAttribute("data-key");
        if (key) STATE.legendState.wse[key] = targetState;
      });

      if (container) {
        const indices = [];
        Object.entries(STATE.legendState.wse).forEach(([key, val]) => {
          const idx = TRACE_MAPS.wse[key];
          if (idx !== undefined && idx >= 0) indices.push(idx);
        });
        if (indices.length > 0) {
          Plotly.restyle(container, { visible: targetState }, indices);
        }
      }
      refreshLegendToggleBtn("wse");
    }
  }

  function updateTracksLegendUI() {
    const legendEl = document.getElementById("legend-tracks");
    if (!legendEl) return;
    const container = document.getElementById("plot-tracks");
    const tc = THEME_CONFIG[STATE.theme];

    legendEl.innerHTML = "";

    const itemsGroup = document.createElement("div");
    itemsGroup.className = "legend-items-group";

    // Item 1: Batas Danau
    const bPill = document.createElement("label");
    bPill.className = "legend-pill";
    const bChecked = STATE.legendState.tracks.boundary !== false;
    bPill.innerHTML = `
      <input type="checkbox" data-key="boundary" ${bChecked ? "checked" : ""}>
      <span class="legend-swatch line-swatch" style="background: ${tc.lakeBoundaryColor};"></span>
      <span>Batas Danau</span>
    `;
    bPill.querySelector("input").addEventListener("change", (e) => {
      const checked = e.target.checked;
      STATE.legendState.tracks.boundary = checked;
      const idx = TRACE_MAPS.tracks["boundary"];
      if (idx !== undefined && idx >= 0 && container) {
        Plotly.restyle(container, { visible: checked }, [idx]);
      }
      refreshLegendToggleBtn("tracks");
    });
    itemsGroup.appendChild(bPill);

    // Items 2..4: Jalur Survei (L0001, L0002, L0003)
    ["L0001", "L0002", "L0003"].forEach(lineId => {
      const isLineActive = STATE.appliedFilter.activeLines.has(lineId);
      const linePts = STATE.filteredPoints.filter(p => p.line === lineId);
      const count = isLineActive ? linePts.length : (DATA.meta.lineStats[lineId] ? DATA.meta.lineStats[lineId].count : 0);
      const isChecked = STATE.legendState.tracks[lineId] !== false;

      const pill = document.createElement("label");
      pill.className = `legend-pill ${!isLineActive ? "disabled" : ""}`;
      pill.innerHTML = `
        <input type="checkbox" data-key="${lineId}" ${isChecked ? "checked" : ""} ${!isLineActive ? "disabled" : ""}>
        <span class="legend-swatch" style="background: ${LINE_COLORS[lineId] || "#0ea5e9"};"></span>
        <span>${lineId} (${count.toLocaleString("id-ID")})</span>
      `;

      pill.querySelector("input").addEventListener("change", (e) => {
        const checked = e.target.checked;
        STATE.legendState.tracks[lineId] = checked;
        const idx = TRACE_MAPS.tracks[lineId];
        if (idx !== undefined && idx >= 0 && container) {
          Plotly.restyle(container, { visible: checked }, [idx]);
        }
        refreshLegendToggleBtn("tracks");
      });

      itemsGroup.appendChild(pill);
    });

    legendEl.appendChild(itemsGroup);

    // Tombol Pilih semua / Kosongkan
    const btnToggle = document.createElement("button");
    btnToggle.type = "button";
    btnToggle.className = "btn-legend-toggle";
    btnToggle.id = "btn-toggle-tracks";
    btnToggle.textContent = getToggleBtnText("tracks");
    btnToggle.addEventListener("click", () => {
      toggleAllLegendItems("tracks");
    });
    legendEl.appendChild(btnToggle);
  }

  function updateLinesLegendUI() {
    const legendEl = document.getElementById("legend-lines");
    if (!legendEl) return;
    const timeContainer = document.getElementById("plot-depth-series");
    const boxContainer = document.getElementById("plot-boxplot");

    legendEl.innerHTML = "";

    const itemsGroup = document.createElement("div");
    itemsGroup.className = "legend-items-group";

    ["L0001", "L0002", "L0003"].forEach(lineId => {
      const isLineActive = STATE.appliedFilter.activeLines.has(lineId);
      const isChecked = STATE.legendState.lines[lineId] !== false;

      const pill = document.createElement("label");
      pill.className = `legend-pill ${!isLineActive ? "disabled" : ""}`;
      pill.innerHTML = `
        <input type="checkbox" data-key="${lineId}" ${isChecked ? "checked" : ""} ${!isLineActive ? "disabled" : ""}>
        <span class="legend-swatch" style="background: ${LINE_COLORS[lineId] || "#0ea5e9"};"></span>
        <span>${lineId}</span>
      `;

      pill.querySelector("input").addEventListener("change", (e) => {
        const checked = e.target.checked;
        STATE.legendState.lines[lineId] = checked;

        const tIdx = TRACE_MAPS.timeSeries[lineId];
        if (tIdx !== undefined && tIdx >= 0 && timeContainer) {
          Plotly.restyle(timeContainer, { visible: checked }, [tIdx]);
        }

        const bIdx = TRACE_MAPS.boxplot[lineId];
        if (bIdx !== undefined && bIdx >= 0 && boxContainer) {
          Plotly.restyle(boxContainer, { visible: checked }, [bIdx]);
        }

        refreshLegendToggleBtn("lines");
      });

      itemsGroup.appendChild(pill);
    });

    legendEl.appendChild(itemsGroup);

    // Tombol Pilih semua / Kosongkan
    const btnToggle = document.createElement("button");
    btnToggle.type = "button";
    btnToggle.className = "btn-legend-toggle";
    btnToggle.id = "btn-toggle-lines";
    btnToggle.textContent = getToggleBtnText("lines");
    btnToggle.addEventListener("click", () => {
      toggleAllLegendItems("lines");
    });
    legendEl.appendChild(btnToggle);
  }

  function updateWSELegendUI(meanWSE) {
    const legendEl = document.getElementById("legend-wse");
    if (!legendEl) return;
    const container = document.getElementById("plot-wse");

    legendEl.innerHTML = "";

    const itemsGroup = document.createElement("div");
    itemsGroup.className = "legend-items-group";

    // Item 1: Elevasi Muka Air
    const pillElevasi = document.createElement("label");
    pillElevasi.className = "legend-pill";
    const elevasiChecked = STATE.legendState.wse.elevasi !== false;
    pillElevasi.innerHTML = `
      <input type="checkbox" data-key="elevasi" ${elevasiChecked ? "checked" : ""}>
      <span class="legend-swatch line-swatch" style="background: #38bdf8;"></span>
      <span>Elevasi Muka Air</span>
    `;
    pillElevasi.querySelector("input").addEventListener("change", (e) => {
      const checked = e.target.checked;
      STATE.legendState.wse.elevasi = checked;
      const idx = TRACE_MAPS.wse["elevasi"];
      if (idx !== undefined && idx >= 0 && container) {
        Plotly.restyle(container, { visible: checked }, [idx]);
      }
      refreshLegendToggleBtn("wse");
    });
    itemsGroup.appendChild(pillElevasi);

    // Item 2: Rata-rata
    const pillMean = document.createElement("label");
    pillMean.className = "legend-pill";
    const meanChecked = STATE.legendState.wse.rata_rata !== false;
    pillMean.innerHTML = `
      <input type="checkbox" data-key="rata_rata" ${meanChecked ? "checked" : ""}>
      <span class="legend-swatch dash-swatch"></span>
      <span>Rata-rata (${meanWSE.toFixed(2)} m)</span>
    `;
    pillMean.querySelector("input").addEventListener("change", (e) => {
      const checked = e.target.checked;
      STATE.legendState.wse.rata_rata = checked;
      const idx = TRACE_MAPS.wse["rata_rata"];
      if (idx !== undefined && idx >= 0 && container) {
        Plotly.restyle(container, { visible: checked }, [idx]);
      }
      refreshLegendToggleBtn("wse");
    });
    itemsGroup.appendChild(pillMean);

    legendEl.appendChild(itemsGroup);

    // Tombol Pilih semua / Kosongkan
    const btnToggle = document.createElement("button");
    btnToggle.type = "button";
    btnToggle.className = "btn-legend-toggle";
    btnToggle.id = "btn-toggle-wse";
    btnToggle.textContent = getToggleBtnText("wse");
    btnToggle.addEventListener("click", () => {
      toggleAllLegendItems("wse");
    });
    legendEl.appendChild(btnToggle);
  }

  // ============================================================================
  // 4. DIAGRAM STATISTIK DENGAN MODEBAR & LEGENDA KUSTOM
  // ============================================================================

  /**
   * 4.4 PETA JALUR SURVEI (Survey Tracks Map)
   */
  function renderSurveyTracks() {
    const container = document.getElementById("plot-tracks");
    if (!container) return;
    const tc = THEME_CONFIG[STATE.theme];

    const traces = [];
    const traceMap = {};

    // Poligon batas danau
    traceMap["boundary"] = traces.length;
    traces.push({
      type: "scatter",
      mode: "lines",
      x: DATA.boundary.map(p => p[0]),
      y: DATA.boundary.map(p => p[1]),
      line: { color: tc.lakeBoundaryColor, width: 3 },
      name: "Batas Danau",
      hoverinfo: "skip",
      visible: STATE.legendState.tracks.boundary !== false
    });

    // Titik survei per jalur
    ["L0001", "L0002", "L0003"].forEach(lineId => {
      const linePts = STATE.filteredPoints.filter(p => p.line === lineId);
      if (linePts.length > 0) {
        traceMap[lineId] = traces.length;
        traces.push({
          type: "scatter",
          mode: "markers",
          x: linePts.map(p => p.e),
          y: linePts.map(p => p.n),
          marker: {
            size: 3,
            color: LINE_COLORS[lineId] || "#0ea5e9",
            opacity: 0.75
          },
          name: `${lineId} (${linePts.length.toLocaleString("id-ID")} titik)`,
          hoverinfo: "text",
          text: linePts.map(p => `<b>${p.name}</b><br>Kedalaman: ${p.depth} m<br>Waktu: ${p.time}`),
          visible: STATE.legendState.tracks[lineId] !== false
        });
      } else {
        traceMap[lineId] = -1;
      }
    });

    TRACE_MAPS.tracks = traceMap;

    const padE = (STATE.maxE - STATE.minE) * 0.04;
    const padN = (STATE.maxN - STATE.minN) * 0.04;

    const layout = {
      dragmode: "zoom",
      showlegend: false,
      paper_bgcolor: tc.paperBg,
      plot_bgcolor: tc.plotBg,
      font: { color: tc.textColor, family: "inherit" },
      margin: { l: 65, r: 25, b: 45, t: 25 },
      xaxis: {
        title: "East (m)",
        color: tc.textColor,
        gridcolor: tc.gridColor,
        range: [STATE.minE - padE, STATE.maxE + padE]
      },
      yaxis: {
        title: "North (m)",
        color: tc.textColor,
        gridcolor: tc.gridColor,
        scaleanchor: "x",
        range: [STATE.minN - padN, STATE.maxN + padN]
      }
    };

    Plotly.react(container, traces, layout, STATS_PLOT_CONFIG);
    updateTracksLegendUI();
  }

  /**
   * 4.5 HISTOGRAM DISTRIBUSI KEDALAMAN
   */
  function renderHistogram() {
    const container = document.getElementById("plot-histogram");
    if (!container) return;
    const tc = THEME_CONFIG[STATE.theme];

    // Distribusi kedalaman menggunakan seluruh elemen mesh batimetri danau yang telah diperbaiki
    const depths = (STATE.delaunayMesh && STATE.delaunayMesh.triangles && STATE.delaunayMesh.triangles.length > 0)
      ? STATE.delaunayMesh.triangles.map(t => t.avgDepth)
      : STATE.filteredPoints.map(p => p.depth);

    if (depths.length === 0) return;

    const meanD = depths.reduce((a, b) => a + b, 0) / depths.length;
    const sorted = [...depths].sort((a, b) => a - b);
    const medianD = sorted[Math.floor(sorted.length / 2)];

    const traces = [
      {
        type: "histogram",
        x: depths,
        autobinx: false,
        xbins: { start: 0.0, end: 2.2, size: 0.08 },
        marker: {
          color: "rgba(14, 165, 233, 0.75)",
          line: { color: "#38bdf8", width: 1 }
        },
        name: "Distribusi Kedalaman",
        hoverinfo: "x+y"
      }
    ];

    const layout = {
      dragmode: "zoom",
      showlegend: false,
      paper_bgcolor: tc.paperBg,
      plot_bgcolor: tc.plotBg,
      font: { color: tc.textColor, family: "inherit" },
      margin: { l: 55, r: 25, b: 45, t: 25 },
      xaxis: {
        title: "Kedalaman (m)",
        color: tc.textColor,
        gridcolor: tc.gridColor,
        range: [0.0, 2.2]
      },
      yaxis: {
        title: "Jumlah Elemen Mesh Danau",
        color: tc.textColor,
        gridcolor: tc.gridColor,
        autorange: true
      },
      shapes: [
        // Garis Rata-rata (Merah)
        {
          type: "line",
          x0: meanD, x1: meanD,
          y0: 0, y1: 1, yref: "paper",
          line: { color: "#ef4444", width: 2, dash: "dash" }
        },
        // Garis Median (Ungu)
        {
          type: "line",
          x0: medianD, x1: medianD,
          y0: 0, y1: 1, yref: "paper",
          line: { color: "#a855f7", width: 2, dash: "dot" }
        }
      ],
      annotations: [
        {
          x: meanD, y: 0.95, yref: "paper",
          text: `Mean: ${meanD.toFixed(2)} m`,
          showarrow: true,
          arrowcolor: "#ef4444",
          font: { color: "#ef4444", size: 11 }
        },
        {
          x: medianD, y: 0.75, yref: "paper",
          text: `Median: ${medianD.toFixed(2)} m`,
          showarrow: true,
          arrowcolor: "#a855f7",
          font: { color: "#a855f7", size: 11 }
        }
      ]
    };

    Plotly.react(container, traces, layout, STATS_PLOT_CONFIG);
  }

  /**
   * 4.6 KEDALAMAN VS WAKTU & BOXPLOT PER JALUR
   */
  function renderTimeSeriesAndBoxPlot() {
    const timeContainer = document.getElementById("plot-depth-series");
    const boxContainer = document.getElementById("plot-boxplot");
    const tc = THEME_CONFIG[STATE.theme];

    // --- Tab 1: Time Series ---
    if (timeContainer) {
      const timeTraces = [];
      const timeTraceMap = {};

      ["L0001", "L0002", "L0003"].forEach(lineId => {
        const linePts = STATE.filteredPoints.filter(p => p.line === lineId);
        if (linePts.length > 0) {
          timeTraceMap[lineId] = timeTraces.length;
          timeTraces.push({
            type: "scatter",
            mode: "lines",
            x: linePts.map((_, i) => i + 1),
            y: linePts.map(p => p.depth),
            line: { color: LINE_COLORS[lineId] || "#0ea5e9", width: 1.5 },
            name: lineId,
            hoverinfo: "x+y+name",
            visible: STATE.legendState.lines[lineId] !== false
          });
        } else {
          timeTraceMap[lineId] = -1;
        }
      });

      TRACE_MAPS.timeSeries = timeTraceMap;

      const timeLayout = {
        dragmode: "zoom",
        showlegend: false,
        paper_bgcolor: tc.paperBg,
        plot_bgcolor: tc.plotBg,
        font: { color: tc.textColor, family: "inherit" },
        margin: { l: 55, r: 25, b: 45, t: 25 },
        xaxis: {
          title: "Nomor Urut Pengukuran",
          color: tc.textColor,
          gridcolor: tc.gridColor,
          range: [1, Math.max(10, STATE.filteredPoints.length)]
        },
        yaxis: {
          title: "Kedalaman (m)",
          color: tc.textColor,
          gridcolor: tc.gridColor,
          autorange: "reversed"
        }
      };
      Plotly.react(timeContainer, timeTraces, timeLayout, STATS_PLOT_CONFIG);
    }

    // --- Tab 2: Box Plot ---
    if (boxContainer) {
      const boxTraces = [];
      const boxTraceMap = {};

      ["L0001", "L0002", "L0003"].forEach(lineId => {
        const linePts = STATE.filteredPoints.filter(p => p.line === lineId);
        if (linePts.length > 0) {
          boxTraceMap[lineId] = boxTraces.length;
          boxTraces.push({
            type: "box",
            y: linePts.map(p => p.depth),
            name: lineId,
            marker: { color: LINE_COLORS[lineId] || "#0ea5e9" },
            boxpoints: "outliers",
            visible: STATE.legendState.lines[lineId] !== false
          });
        } else {
          boxTraceMap[lineId] = -1;
        }
      });

      TRACE_MAPS.boxplot = boxTraceMap;

      const boxLayout = {
        dragmode: "zoom",
        showlegend: false,
        paper_bgcolor: tc.paperBg,
        plot_bgcolor: tc.plotBg,
        font: { color: tc.textColor, family: "inherit" },
        margin: { l: 55, r: 25, b: 45, t: 25 },
        yaxis: {
          title: "Kedalaman (m)",
          color: tc.textColor,
          gridcolor: tc.gridColor,
          autorange: "reversed"
        }
      };
      Plotly.react(boxContainer, boxTraces, boxLayout, STATS_PLOT_CONFIG);
    }

    updateLinesLegendUI();
  }

  /**
   * 4.7 KESTABILAN TINGGI MUKA AIR (Water Surface H)
   */
  function renderWSEPlot() {
    const container = document.getElementById("plot-wse");
    if (!container) return;
    const tc = THEME_CONFIG[STATE.theme];

    const pts = STATE.filteredPoints;
    if (pts.length === 0) return;

    const wseVals = pts.map(p => p.wse);
    const meanWSE = wseVals.reduce((a, b) => a + b, 0) / wseVals.length;

    const traces = [];
    const traceMap = {};

    traceMap["elevasi"] = traces.length;
    traces.push({
      type: "scatter",
      mode: "lines",
      x: pts.map((_, idx) => idx + 1),
      y: wseVals,
      line: { color: "#38bdf8", width: 1.5 },
      name: "Elevasi Muka Air",
      hoverinfo: "y",
      visible: STATE.legendState.wse.elevasi !== false
    });

    traceMap["rata_rata"] = traces.length;
    traces.push({
      type: "scatter",
      mode: "lines",
      x: [1, pts.length],
      y: [meanWSE, meanWSE],
      line: { color: "#ef4444", width: 2, dash: "dash" },
      name: `Rata-rata (${meanWSE.toFixed(2)} m)`,
      visible: STATE.legendState.wse.rata_rata !== false
    });

    TRACE_MAPS.wse = traceMap;

    const minW = Math.min(...wseVals);
    const maxW = Math.max(...wseVals);
    const padW = Math.max(0.08, (maxW - minW) * 0.2);

    const layout = {
      dragmode: "zoom",
      showlegend: false,
      paper_bgcolor: tc.paperBg,
      plot_bgcolor: tc.plotBg,
      font: { color: tc.textColor, family: "inherit" },
      margin: { l: 55, r: 25, b: 45, t: 25 },
      xaxis: {
        title: "Nomor Urut Titik",
        color: tc.textColor,
        gridcolor: tc.gridColor,
        range: [1, Math.max(10, pts.length)]
      },
      yaxis: {
        title: "Tinggi Muka Air (m)",
        color: tc.textColor,
        gridcolor: tc.gridColor,
        range: [minW - padW, maxW + padW]
      }
    };

    Plotly.react(container, traces, layout, STATS_PLOT_CONFIG);
    updateWSELegendUI(meanWSE);
  }

  /**
   * 4.8 KLASIFIKASI ZONA KEDALAMAN (Tabel & Donut Chart)
   */
  function renderDepthClassification() {
    const donutContainer = document.getElementById("plot-donut-zones");
    const tableBody = document.getElementById("zone-table-body");
    const tc = THEME_CONFIG[STATE.theme];

    // Klasifikasi 4 Zona
    const zones = [
      { name: "Sangat Dangkal", range: "< 0.50 m", min: 0.0, max: 0.5, color: "#38bdf8", area: 0, volume: 0 },
      { name: "Dangkal", range: "0.50 - 1.00 m", min: 0.5, max: 1.0, color: "#34d399", area: 0, volume: 0 },
      { name: "Sedang", range: "1.00 - 1.50 m", min: 1.0, max: 1.5, color: "#f59e0b", area: 0, volume: 0 },
      { name: "Dalam", range: "> 1.50 m", min: 1.5, max: 99.0, color: "#6366f1", area: 0, volume: 0 }
    ];

    let totalArea = 0;
    let totalVolume = 0;

    // Hitung luas dan volume tiap zona dari segitiga Delaunay
    STATE.delaunayMesh.triangles.forEach(t => {
      const d = t.avgDepth;
      for (let z of zones) {
        if (d >= z.min && d < z.max) {
          z.area += t.area;
          z.volume += t.volume;
          break;
        }
      }
      totalArea += t.area;
      totalVolume += t.volume;
    });

    if (totalArea === 0) totalArea = 1;

    // Render Tabel
    if (tableBody) {
      tableBody.innerHTML = "";
      zones.forEach(z => {
        const pct = (z.area / totalArea) * 100;
        const row = document.createElement("tr");
        row.innerHTML = `
          <td><span class="zone-badge" style="background: ${z.color};"></span><strong>${z.name}</strong></td>
          <td>${z.range}</td>
          <td>${Math.round(z.area).toLocaleString("id-ID")}</td>
          <td>${(z.area / 10000).toFixed(3)}</td>
          <td><strong>${pct.toFixed(1)}%</strong></td>
          <td>${Math.round(z.volume).toLocaleString("id-ID")}</td>
        `;
        tableBody.appendChild(row);
      });
    }

    // Render Donut Chart
    if (donutContainer) {
      const traces = [
        {
          type: "pie",
          hole: 0.55,
          labels: zones.map(z => z.name),
          values: zones.map(z => Math.round(z.area)),
          marker: { colors: zones.map(z => z.color) },
          textposition: "inside",
          textinfo: "label+percent",
          hoverinfo: "label+value+percent",
          hovertemplate: "<b>%{label}</b><br>Luas: %{value:,.0f} m²<br>Persen: %{percent}<extra></extra>"
        }
      ];

      const layout = {
        paper_bgcolor: tc.paperBg,
        plot_bgcolor: tc.plotBg,
        font: { color: tc.textColor, family: "inherit" },
        margin: { l: 15, r: 15, b: 15, t: 15 },
        showlegend: false
      };

      Plotly.react(donutContainer, traces, layout, { responsive: true, displaylogo: false });
    }
  }

  /**
   * 4.9 PERBARUI INSIGHT OTOMATIS
   */
  function updateAutomatedInsights() {
    const el = document.getElementById("insight-text");
    if (!el) return;

    const deepest = DATA.meta.deepestPoint;
    const m = calculateMetrics();

    el.innerHTML = `
      Titik terdalam danau tercatat sebesar <strong class="insight-highlight">${deepest.depth.toFixed(2)} meter</strong> 
      pada koordinat UTM <strong>${deepest.e.toLocaleString("id-ID")} m E, ${deepest.n.toLocaleString("id-ID")} m N</strong> (${deepest.line}). 
      Danau Unhas memiliki luas permukaan <strong>${Math.round(m.area).toLocaleString("id-ID")} m² (${(m.area / 10000).toFixed(2)} ha)</strong> 
      dengan estimasi total volume tampungan air <strong>${Math.round(m.volume).toLocaleString("id-ID")} m³ (${(m.volume * 1000).toLocaleString("id-ID")} liter)</strong>. 
      Rata-rata kedalaman danau berkisar <strong>${m.meanDepth.toFixed(2)} m</strong>, mengindikasikan danau buatan dangkal tipe retensi dengan morfologi dasar landai dan cekungan terdalam di bagian barat daya danau.
    `;
  }

  // ============================================================================
  // 4.10 PETA KONTUR KEDALAMAN DAN BASEMAP (LEAFLET 2D)
  // ============================================================================

  let basemapMap = null;
  let currentTileLayer = null;
  let contourLayerGroup = null;
  let boundaryLayerGroup = null;
  let tracksLayerGroup = null;
  let contourPolygonLayers = [];
  let lakeLatLngBounds = null;
  let cachedBoundaryLatLngs = null;
  let coordReadoutControl = null;
  let depthLegendControl = null;
  let tileErrorCount = 0;
  let tileSuccessCount = 0;

  /**
   * Konversi koordinat dari UTM Zone 50S ke WGS84 [lat, lng]
   */
  function convertUTMtoLatLng(e, n) {
    if (typeof proj4 === "undefined") return [0, 0];
    const pt = proj4(PROJ_UTM50S, PROJ_WGS84, [e, n]);
    return [pt[1], pt[0]];
  }

  /**
   * Konversi koordinat dari WGS84 [lat, lng] ke UTM Zone 50S [e, n]
   */
  function convertLatLngToUTM(lat, lng) {
    if (typeof proj4 === "undefined") return [0, 0];
    const pt = proj4(PROJ_WGS84, PROJ_UTM50S, [lng, lat]);
    return [pt[0], pt[1]];
  }

  /**
   * Interpolasi warna kedalaman berdasarkan skema warna aktif
   */
  function getColorForDepth(depth, maxDepth = 2.2, scheme = STATE.colorscale) {
    const t = Math.max(0, Math.min(1, depth / maxDepth));
    const palettes = {
      Viridis: [
        [68, 1, 84],
        [72, 40, 120],
        [62, 74, 137],
        [49, 104, 142],
        [38, 130, 142],
        [31, 158, 137],
        [53, 183, 121],
        [109, 205, 89],
        [180, 222, 44],
        [253, 231, 37]
      ],
      Blues: [
        [247, 251, 255],
        [222, 235, 247],
        [198, 219, 239],
        [158, 202, 225],
        [107, 174, 214],
        [66, 146, 198],
        [33, 113, 181],
        [8, 81, 156],
        [8, 48, 107]
      ],
      Turbo: [
        [48, 18, 59],
        [70, 134, 251],
        [27, 229, 181],
        [164, 252, 60],
        [251, 185, 56],
        [227, 68, 10],
        [122, 4, 3]
      ],
      Cividis: [
        [0, 32, 77],
        [0, 53, 110],
        [65, 84, 114],
        [107, 115, 128],
        [150, 150, 142],
        [196, 188, 139],
        [255, 234, 70]
      ],
      Tealrose: [
        [0, 147, 146],
        [57, 177, 166],
        [156, 212, 198],
        [225, 229, 224],
        [240, 187, 179],
        [227, 129, 131],
        [179, 39, 78]
      ]
    };
    const stops = palettes[scheme] || palettes.Viridis;
    const pos = t * (stops.length - 1);
    const i = Math.floor(pos);
    const frac = pos - i;
    if (i >= stops.length - 1) {
      const c = stops[stops.length - 1];
      return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }
    const c1 = stops[i];
    const c2 = stops[i + 1];
    const r = Math.round(c1[0] + frac * (c2[0] - c1[0]));
    const g = Math.round(c1[1] + frac * (c2[1] - c1[1]));
    const b = Math.round(c1[2] + frac * (c2[2] - c1[2]));
    return `rgb(${r}, ${g}, ${b})`;
  }

  /**
   * Inisialisasi peta Leaflet, kontrol, dan layer groups
   */
  function initBasemapMap() {
    const container = document.getElementById("map-basemap-container");
    if (!container || basemapMap || typeof L === "undefined") return;

    // Cache batas koordinat danau
    if (!cachedBoundaryLatLngs && DATA.boundary) {
      cachedBoundaryLatLngs = DATA.boundary.map(p => convertUTMtoLatLng(p[0], p[1]));
      lakeLatLngBounds = L.latLngBounds(cachedBoundaryLatLngs);
    }

    // Inisialisasi peta Leaflet dengan preferCanvas: true
    basemapMap = L.map(container, {
      zoomControl: true,
      preferCanvas: true,
      maxZoom: 22
    });

    // Kontrol skala metrik
    L.control.scale({
      imperial: false,
      metric: true,
      position: "bottomleft"
    }).addTo(basemapMap);

    // Layer groups untuk konten peta
    contourLayerGroup = L.layerGroup().addTo(basemapMap);
    boundaryLayerGroup = L.layerGroup().addTo(basemapMap);
    tracksLayerGroup = L.layerGroup().addTo(basemapMap);

    // Kontrol Readout Koordinat
    coordReadoutControl = L.control({ position: "bottomleft" });
    coordReadoutControl.onAdd = function () {
      const div = L.DomUtil.create("div", "leaflet-control-coord");
      div.innerHTML = `<div><strong>Koordinat:</strong> Arahkan kursor ke peta</div><div><strong>UTM:</strong> - | <strong>Kedalaman:</strong> -</div>`;
      return div;
    };
    coordReadoutControl.addTo(basemapMap);

    // Kontrol Legenda Skala Warna Kedalaman
    depthLegendControl = L.control({ position: "bottomright" });
    depthLegendControl.onAdd = function () {
      const div = L.DomUtil.create("div", "leaflet-control-depth-legend");
      return div;
    };
    depthLegendControl.addTo(basemapMap);

    // Muat tile layer default
    switchBasemap(STATE.basemapState.activeType);

    // Pusatkan peta ke batas danau
    fitLakeBounds();

    // Mousemove koordinat readout
    basemapMap.on("mousemove", (e) => {
      if (!coordReadoutControl) return;
      const div = coordReadoutControl.getContainer();
      if (!div) return;

      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      const [utmE, utmN] = convertLatLngToUTM(lat, lng);

      let depthText = "Di luar danau";
      if (DATA.boundary && isPointInPolygon(utmE, utmN, DATA.boundary)) {
        if (STATE.contourGrid) {
          const { xGrid, yGrid, zMatrix, step } = STATE.contourGrid;
          const gx = Math.round((utmE - xGrid[0]) / step);
          const gy = Math.round((utmN - yGrid[0]) / step);
          if (gy >= 0 && gy < yGrid.length && gx >= 0 && gx < xGrid.length) {
            const val = zMatrix[gy][gx];
            if (val !== null && !isNaN(val)) {
              depthText = `${val.toFixed(2)} m`;
            }
          }
        }
      }

      div.innerHTML = `
        <div><strong>Lat:</strong> ${lat.toFixed(5)}° <strong>Lng:</strong> ${lng.toFixed(5)}°</div>
        <div><strong>E:</strong> ${utmE.toFixed(1)} m <strong>N:</strong> ${utmN.toFixed(1)} m | <strong>Kedalaman:</strong> ${depthText}</div>
      `;
    });

    basemapMap.on("mouseout", () => {
      if (!coordReadoutControl) return;
      const div = coordReadoutControl.getContainer();
      if (div) {
        div.innerHTML = `<div><strong>Koordinat:</strong> Arahkan kursor ke peta</div><div><strong>UTM:</strong> - | <strong>Kedalaman:</strong> -</div>`;
      }
    });

    // Invalidate size saat kartu muncul di viewport
    if ("IntersectionObserver" in window) {
      const cardEl = document.getElementById("card-basemap-contour");
      if (cardEl) {
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting && basemapMap) {
              basemapMap.invalidateSize();
            }
          });
        }, { threshold: 0.1 });
        observer.observe(cardEl);
      }
    }

    setTimeout(() => {
      if (basemapMap) {
        basemapMap.invalidateSize();
        fitLakeBounds();
      }
    }, 250);
  }

  /**
   * Posisikan peta ke batas keseluruhan danau
   */
  function fitLakeBounds() {
    if (!basemapMap) return;
    if (!lakeLatLngBounds && DATA.boundary) {
      cachedBoundaryLatLngs = DATA.boundary.map(p => convertUTMtoLatLng(p[0], p[1]));
      lakeLatLngBounds = L.latLngBounds(cachedBoundaryLatLngs);
    }
    if (lakeLatLngBounds) {
      basemapMap.fitBounds(lakeLatLngBounds, { padding: [25, 25] });
    }
  }

  /**
   * Mengganti layer basemap tanpa memproses ulang kontur dan jalur
   */
  function switchBasemap(type) {
    if (!basemapMap || !BASEMAP_CONFIGS[type]) return;
    STATE.basemapState.activeType = type;

    if (currentTileLayer) {
      basemapMap.removeLayer(currentTileLayer);
    }

    const cfg = BASEMAP_CONFIGS[type];
    currentTileLayer = L.tileLayer(cfg.url, cfg.options);
    tileErrorCount = 0;
    tileSuccessCount = 0;

    const banner = document.getElementById("basemap-notice-banner");
    if (banner) banner.style.display = "none";

    currentTileLayer.on("tileerror", () => {
      tileErrorCount++;
      if (tileErrorCount >= 8 && tileSuccessCount === 0) {
        if (banner) banner.style.display = "flex";
      }
    });

    currentTileLayer.on("tileload", () => {
      tileSuccessCount++;
      if (banner) banner.style.display = "none";
    });

    currentTileLayer.addTo(basemapMap);
    currentTileLayer.bringToBack();
  }

  /**
   * Mengubah transparansi poligon kontur tanpa menghitung ulang kontur
   */
  function updateContourTransparency(transparencyPercent) {
    STATE.basemapState.transparency = transparencyPercent;
    const fillOpacity = Math.max(0, Math.min(1, (100 - transparencyPercent) / 100));
    const badge = document.getElementById("val-contour-opacity");
    if (badge) badge.textContent = `${transparencyPercent}%`;

    contourPolygonLayers.forEach(layer => {
      if (layer && typeof layer.setStyle === "function") {
        layer.setStyle({ fillOpacity: fillOpacity });
      }
    });
  }

  /**
   * Memperbarui legenda skala warna kedalaman di pojok peta
   */
  function updateDepthLegendControl(maxDepth = 2.2) {
    if (!depthLegendControl) return;
    const div = depthLegendControl.getContainer();
    if (!div) return;

    const gradientStops = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const c = getColorForDepth(t * maxDepth, maxDepth, STATE.colorscale);
      gradientStops.push(`${c} ${t * 100}%`);
    }
    const gradCss = `linear-gradient(to right, ${gradientStops.join(", ")})`;

    div.innerHTML = `
      <div style="font-weight: 700; font-size: 11px; margin-bottom: 5px; color: inherit; white-space: nowrap;">Kedalaman (m)</div>
      <div style="width: 130px; height: 10px; border-radius: 3px; background: ${gradCss}; border: 1px solid rgba(0,0,0,0.2); margin-bottom: 4px;"></div>
      <div style="display: flex; justify-content: space-between; font-size: 9.5px; font-family: monospace; color: inherit; width: 130px;">
        <span>0.0</span>
        <span>${(maxDepth * 0.5).toFixed(1)}</span>
        <span>${maxDepth.toFixed(1)} m</span>
      </div>
    `;
  }

  /**
   * Terapkan visibilitas layer sesuai state checkbox tanpa menghitung ulang
   */
  function applyBasemapLayerVisibility() {
    if (!basemapMap) return;
    const layers = STATE.basemapState.layers;

    if (layers.contours) {
      if (!basemapMap.hasLayer(contourLayerGroup)) basemapMap.addLayer(contourLayerGroup);
    } else {
      if (basemapMap.hasLayer(contourLayerGroup)) basemapMap.removeLayer(contourLayerGroup);
    }

    if (layers.boundary) {
      if (!basemapMap.hasLayer(boundaryLayerGroup)) basemapMap.addLayer(boundaryLayerGroup);
    } else {
      if (basemapMap.hasLayer(boundaryLayerGroup)) basemapMap.removeLayer(boundaryLayerGroup);
    }

    if (layers.tracks) {
      if (!basemapMap.hasLayer(tracksLayerGroup)) basemapMap.addLayer(tracksLayerGroup);
    } else {
      if (basemapMap.hasLayer(tracksLayerGroup)) basemapMap.removeLayer(tracksLayerGroup);
    }
  }

  /**
   * Perbarui teks tombol Pilih Semua / Kosongkan Legenda Peta
   */
  function updateBasemapLegendToggleBtn() {
    const btn = document.getElementById("btn-toggle-basemap-layers");
    if (!btn) return;
    const layers = STATE.basemapState.layers;
    const allChecked = layers.contours && layers.boundary && layers.tracks;
    btn.textContent = allChecked ? "Kosongkan" : "Pilih semua";
  }

  /**
   * Menghitung ulang lapisan kontur dan jalur pemeruman pada peta Leaflet
   */
  function updateBasemapLayers() {
    if (!basemapMap || !STATE.contourGrid) return;

    // Bersihkan layer lama
    contourLayerGroup.clearLayers();
    boundaryLayerGroup.clearLayers();
    tracksLayerGroup.clearLayers();
    contourPolygonLayers = [];

    const { xGrid, yGrid, zMatrix, step } = STATE.contourGrid;
    const nx = xGrid.length;
    const ny = yGrid.length;
    if (nx < 2 || ny < 2) return;

    // Ratakan matriks kedalaman untuk d3-contour (width = nx, height = ny)
    const flatValues = new Float64Array(nx * ny);
    let maxDepth = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v = zMatrix[j][i];
        if (v !== null && !isNaN(v)) {
          flatValues[j * nx + i] = v;
          if (v > maxDepth) maxDepth = v;
        } else {
          flatValues[j * nx + i] = -1;
        }
      }
    }

    const interval = STATE.basemapState.contourInterval;
    const thresholds = [];
    for (let t = 0; t <= maxDepth + interval * 0.1; t += interval) {
      thresholds.push(Number(t.toFixed(2)));
    }
    if (thresholds.length === 0) thresholds.push(0);

    // Bangkitkan kontur dengan d3.contours
    if (typeof d3 !== "undefined" && d3.contours) {
      const contourGen = d3.contours().size([nx, ny]).thresholds(thresholds);
      const contours = contourGen(flatValues);
      const fillOpacity = (100 - STATE.basemapState.transparency) / 100;

      contours.forEach((c, idx) => {
        const val = c.value;
        const nextVal = (idx + 1 < contours.length) ? contours[idx + 1].value : (val + interval);
        const color = getColorForDepth(val, maxDepth > 0 ? maxDepth : 2.2, STATE.colorscale);

        const geojsonCoordinates = c.coordinates.map(polygon =>
          polygon.map(ring =>
            ring.map(pt => {
              const utmE = xGrid[0] + pt[0] * step;
              const utmN = yGrid[0] + pt[1] * step;
              const [lng, lat] = proj4(PROJ_UTM50S, PROJ_WGS84, [utmE, utmN]);
              return [lng, lat];
            })
          )
        );

        const feature = {
          type: "Feature",
          properties: {
            val: val,
            nextVal: nextVal,
            depthRange: `${val.toFixed(1)} - ${nextVal.toFixed(1)} m`
          },
          geometry: {
            type: "MultiPolygon",
            coordinates: geojsonCoordinates
          }
        };

        const polyLayer = L.geoJSON(feature, {
          style: {
            fillColor: color,
            fillOpacity: fillOpacity,
            weight: 0,
            color: "transparent"
          }
        });

        polyLayer.bindTooltip(`Kedalaman: ${val.toFixed(1)} - ${nextVal.toFixed(1)} m`, {
          sticky: true,
          className: "basemap-contour-tooltip"
        });

        contourPolygonLayers.push(polyLayer);
        contourLayerGroup.addLayer(polyLayer);

        // Garis kontur tipis gelap & label kontur utama
        const isMajor = (interval >= 0.5) || (Math.abs(val % 0.5) < 0.01 && val > 0);
        const lineWeight = 0.8;
        const lineColor = "rgba(15, 23, 42, 0.75)";

        geojsonCoordinates.forEach(polygon => {
          polygon.forEach(ring => {
            if (ring.length < 3) return;
            const latlngs = ring.map(pt => [pt[1], pt[0]]);
            const line = L.polyline(latlngs, {
              color: lineColor,
              weight: lineWeight,
              interactive: false
            });
            contourLayerGroup.addLayer(line);

            if (isMajor && ring.length >= 15) {
              const midIdx = Math.floor(ring.length / 2);
              const midPt = latlngs[midIdx];
              const labelIcon = L.divIcon({
                className: "contour-label-tag",
                html: `${val.toFixed(1)} m`,
                iconSize: null
              });
              const marker = L.marker(midPt, { icon: labelIcon, interactive: false });
              contourLayerGroup.addLayer(marker);

              if (ring.length >= 70) {
                const secondIdx = Math.floor(ring.length * 0.85);
                const secondPt = latlngs[secondIdx];
                const marker2 = L.marker(secondPt, { icon: labelIcon, interactive: false });
                contourLayerGroup.addLayer(marker2);
              }
            }
          });
        });
      });
    }

    // 2. Batas Tepi Danau
    if (cachedBoundaryLatLngs && cachedBoundaryLatLngs.length > 0) {
      const boundaryLine = L.polyline(cachedBoundaryLatLngs, {
        color: "#ff3b5c",
        weight: 2.5,
        fill: false,
        interactive: false
      });
      boundaryLayerGroup.addLayer(boundaryLine);
    }

    // 3. Jalur Pemeruman (warna #00e5ff, weight 1.2, opacity 0.9, putus jika > 8 m)
    const pts = STATE.filteredPoints;
    const linesMap = {};
    pts.forEach(p => {
      if (!linesMap[p.line]) linesMap[p.line] = [];
      linesMap[p.line].push(p);
    });

    const allSegments = [];
    Object.keys(linesMap).forEach(lineId => {
      const linePts = linesMap[lineId];
      linePts.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

      let currentSegment = [];
      for (let k = 0; k < linePts.length; k++) {
        const p = linePts[k];
        const latlng = convertUTMtoLatLng(p.e, p.n);

        if (currentSegment.length > 0) {
          const prev = linePts[k - 1];
          const dist = Math.hypot(p.e - prev.e, p.n - prev.n);
          if (dist > MAX_TRACK_SEGMENT_DIST) {
            if (currentSegment.length > 1) {
              allSegments.push(currentSegment);
            }
            currentSegment = [];
          }
        }
        currentSegment.push(latlng);
      }
      if (currentSegment.length > 1) {
        allSegments.push(currentSegment);
      }
    });

    if (allSegments.length > 0) {
      const tracksPolyline = L.polyline(allSegments, {
        color: "#00e5ff",
        weight: 1.2,
        opacity: 0.9,
        interactive: false
      });
      tracksLayerGroup.addLayer(tracksPolyline);
    }

    applyBasemapLayerVisibility();
    updateDepthLegendControl(maxDepth > 0 ? maxDepth : 2.2);
  }

  /**
   * Memperbarui seluruh visualisasi secara sinkron
   */
  function renderAll() {
    buildDelaunayMesh();
    updateKpiCards();
    render3DModel();
    render2DContourMap();
    renderCrossSection();
    renderSurveyTracks();
    renderHistogram();
    renderTimeSeriesAndBoxPlot();
    renderWSEPlot();
    renderDepthClassification();
    updateAutomatedInsights();
    updateBasemapLayers();
  }

  // ============================================================================
  // 5. EVENT LISTENERS & KONTROL INTERAKTIF
  // ============================================================================

  function setupEventListeners() {
    // 5.1 Ganti Tema (Dark / Light Mode)
    const btnTheme = document.getElementById("btn-theme-toggle");
    if (btnTheme) {
      btnTheme.addEventListener("click", () => {
        STATE.theme = STATE.theme === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", STATE.theme);
        // Ganti ikon bulan/matahari (SVG use href)
        const icon = document.getElementById("theme-icon");
        if (icon) {
          const iconId = STATE.theme === "dark" ? "#icon-moon" : "#icon-sun";
          icon.innerHTML = `<use href="${iconId}"/>`;
        }
        // Perbarui aria-label tombol tema
        btnTheme.setAttribute("aria-label",
          STATE.theme === "dark" ? "Ganti ke mode terang" : "Ganti ke mode gelap"
        );
        renderAll();
        if (basemapMap) {
          basemapMap.invalidateSize();
        }
      });
    }

    // 5.2 Vertical Exaggeration Slider
    const ctrlVE = document.getElementById("ctrl-ve");
    const valVE = document.getElementById("ctrl-ve-val");
    if (ctrlVE) {
      ctrlVE.addEventListener("input", (e) => {
        STATE.verticalExaggeration = parseFloat(e.target.value);
        if (valVE) valVE.textContent = `${STATE.verticalExaggeration.toFixed(1)}x`;
        render3DModel();
      });
    }

    // 5.3 Colorscale Selector
    const ctrlColor = document.getElementById("ctrl-colorscale");
    if (ctrlColor) {
      ctrlColor.addEventListener("change", (e) => {
        STATE.colorscale = e.target.value;
        render3DModel();
        render2DContourMap();
        updateBasemapLayers();
      });
    }

    // 5.4 Checkbox Titik Survei 3D
    const chkPts = document.getElementById("ctrl-show-points");
    if (chkPts) {
      chkPts.addEventListener("change", (e) => {
        STATE.showPoints3D = e.target.checked;
        render3DModel();
      });
    }

    // 5.5 Putar Otomatis 3D (Toggle)
    const btnRotate = document.getElementById("btn-autorotate");
    if (btnRotate) {
      btnRotate.addEventListener("click", () => {
        if (STATE.isRotating) {
          stopAutoRotate();
        } else {
          startAutoRotate();
        }
      });
    }

    // Hentikan putaran otomatis saat pengguna berinteraksi langsung dengan model 3D (drag / zoom / touch)
    const plot3dContainer = document.getElementById("plot-3d");
    if (plot3dContainer) {
      ["mousedown", "wheel", "touchstart"].forEach(evtName => {
        plot3dContainer.addEventListener(evtName, () => {
          if (STATE.isRotating) {
            stopAutoRotate();
          }
        }, { passive: true });
      });
    }

    // 5.6 Reset Kamera 3D
    const btnResetCam = document.getElementById("btn-reset-cam");
    if (btnResetCam) {
      btnResetCam.addEventListener("click", () => {
        stopAutoRotate();
        const container = document.getElementById("plot-3d");
        if (container) {
          Plotly.relayout(container, {
            "scene.camera": {
              eye: { ...DEFAULT_CAMERA.eye },
              center: { ...DEFAULT_CAMERA.center }
            },
            "scene.dragmode": "orbit"
          });
        }
      });
    }

    // 5.8 Cross-Section Direction Toggle
    const btnWE = document.getElementById("btn-slice-we");
    const btnSN = document.getElementById("btn-slice-sn");
    const lblAxis = document.getElementById("lbl-slice-axis");
    const sliderPos = document.getElementById("slider-slice-pos");

    function updateSliceCoordinate() {
      const pct = STATE.slicePosPercent / 100.0;
      if (STATE.sliceDirection === "WE") {
        STATE.sliceCoord = STATE.minN + pct * (STATE.maxN - STATE.minN);
      } else {
        STATE.sliceCoord = STATE.minE + pct * (STATE.maxE - STATE.minE);
      }
      const valEl = document.getElementById("val-slice-coord");
      if (valEl) valEl.textContent = `${STATE.sliceCoord.toFixed(2)} m`;
    }

    if (btnWE && btnSN) {
      btnWE.addEventListener("click", () => {
        STATE.sliceDirection = "WE";
        btnWE.classList.add("active");
        btnSN.classList.remove("active");
        if (lblAxis) lblAxis.textContent = "Posisi N:";
        updateSliceCoordinate();
        renderCrossSection();
        render2DContourMap();
      });

      btnSN.addEventListener("click", () => {
        STATE.sliceDirection = "SN";
        btnSN.classList.add("active");
        btnWE.classList.remove("active");
        if (lblAxis) lblAxis.textContent = "Posisi E:";
        updateSliceCoordinate();
        renderCrossSection();
        render2DContourMap();
      });
    }

    if (sliderPos) {
      sliderPos.addEventListener("input", (e) => {
        STATE.slicePosPercent = parseFloat(e.target.value);
        updateSliceCoordinate();
        renderCrossSection();
        render2DContourMap();
      });
    }

    // 5.9 Tab Profil Waktu vs Boxplot
    const btnTabTime = document.getElementById("btn-tab-timeseries");
    const btnTabBox = document.getElementById("btn-tab-boxplot");
    const plotTime = document.getElementById("plot-depth-series");
    const plotBox = document.getElementById("plot-boxplot");

    if (btnTabTime && btnTabBox) {
      btnTabTime.addEventListener("click", () => {
        btnTabTime.classList.add("active");
        btnTabBox.classList.remove("active");
        if (plotTime) {
          plotTime.style.display = "block";
          Plotly.Plots.resize(plotTime);
        }
        if (plotBox) plotBox.style.display = "none";
      });

      btnTabBox.addEventListener("click", () => {
        btnTabBox.classList.add("active");
        btnTabTime.classList.remove("active");
        if (plotTime) plotTime.style.display = "none";
        if (plotBox) {
          plotBox.style.display = "block";
          Plotly.Plots.resize(plotBox);
        }
      });
    }

    // 5.10 Global Filter: Range Kedalaman dengan Sinkronisasi Dua Arah Slider & Input Angka
    const filterMin = document.getElementById("filter-depth-min");
    const filterMax = document.getElementById("filter-depth-max");
    const inputMin = document.getElementById("input-depth-min");
    const inputMax = document.getElementById("input-depth-max");

    const DATA_MIN_DEPTH = 0.0;
    const DATA_MAX_DEPTH = 2.2;

    // Helper: update draftFilter Min
    function updateDraftMin(val) {
      val = Math.round(val / SPINNER_STEP) * SPINNER_STEP;
      val = Math.max(DATA_MIN_DEPTH, Math.min(STATE.draftFilter.maxDepth, val));
      STATE.draftFilter.minDepth = val;
      if (filterMin) filterMin.value = val.toFixed(2);
      if (inputMin) inputMin.value = val.toFixed(2);
      updateSpinnerButtonStates();
      updateFilterApplyButtonUI();
    }

    // Helper: update draftFilter Max
    function updateDraftMax(val) {
      val = Math.round(val / SPINNER_STEP) * SPINNER_STEP;
      val = Math.max(STATE.draftFilter.minDepth, Math.min(DATA_MAX_DEPTH, val));
      STATE.draftFilter.maxDepth = val;
      if (filterMax) filterMax.value = val.toFixed(2);
      if (inputMax) inputMax.value = val.toFixed(2);
      updateSpinnerButtonStates();
      updateFilterApplyButtonUI();
    }

    // Slider Min (slider menggeser -> perbarui draftFilter & sinkronkan ke kotak input)
    if (filterMin) {
      filterMin.addEventListener("input", () => {
        let val = parseFloat(filterMin.value);
        if (isNaN(val)) val = DATA_MIN_DEPTH;
        if (val > STATE.draftFilter.maxDepth) {
          val = STATE.draftFilter.maxDepth;
          filterMin.value = val.toFixed(2);
        }
        if (inputMin) inputMin.value = val.toFixed(2);
        STATE.draftFilter.minDepth = val;
        updateSpinnerButtonStates();
        updateFilterApplyButtonUI();
      });
    }

    // Slider Max (slider menggeser -> perbarui draftFilter & sinkronkan ke kotak input)
    if (filterMax) {
      filterMax.addEventListener("input", () => {
        let val = parseFloat(filterMax.value);
        if (isNaN(val)) val = DATA_MAX_DEPTH;
        if (val < STATE.draftFilter.minDepth) {
          val = STATE.draftFilter.minDepth;
          filterMax.value = val.toFixed(2);
        }
        if (inputMax) inputMax.value = val.toFixed(2);
        STATE.draftFilter.maxDepth = val;
        updateSpinnerButtonStates();
        updateFilterApplyButtonUI();
      });
    }

    // Kotak Input Min (mengetik -> validasi saat Enter atau Blur)
    if (inputMin) {
      const commitInputMin = () => {
        let val = parseFloat(inputMin.value);
        if (isNaN(val)) val = STATE.draftFilter.minDepth;
        val = Math.max(DATA_MIN_DEPTH, Math.min(DATA_MAX_DEPTH, val));
        // Validasi: Min tidak boleh lebih besar dari Maks
        if (val > STATE.draftFilter.maxDepth) {
          val = STATE.draftFilter.maxDepth;
        }
        val = Math.round(val * 100) / 100;
        inputMin.value = val.toFixed(2);
        if (filterMin) filterMin.value = val.toFixed(2);
        STATE.draftFilter.minDepth = val;
        updateSpinnerButtonStates();
        updateFilterApplyButtonUI();
      };

      inputMin.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          commitInputMin();
          inputMin.blur();
          if (e.ctrlKey) {
            applyFilters();
          }
        }
      });
      inputMin.addEventListener("blur", commitInputMin);
    }

    // Kotak Input Max (mengetik -> validasi saat Enter atau Blur)
    if (inputMax) {
      const commitInputMax = () => {
        let val = parseFloat(inputMax.value);
        if (isNaN(val)) val = STATE.draftFilter.maxDepth;
        val = Math.max(DATA_MIN_DEPTH, Math.min(DATA_MAX_DEPTH, val));
        // Validasi: Maks tidak boleh lebih kecil dari Min
        if (val < STATE.draftFilter.minDepth) {
          val = STATE.draftFilter.minDepth;
        }
        val = Math.round(val * 100) / 100;
        inputMax.value = val.toFixed(2);
        if (filterMax) filterMax.value = val.toFixed(2);
        STATE.draftFilter.maxDepth = val;
        updateSpinnerButtonStates();
        updateFilterApplyButtonUI();
      };

      inputMax.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          commitInputMax();
          inputMax.blur();
          if (e.ctrlKey) {
            applyFilters();
          }
        }
      });
      inputMax.addEventListener("blur", commitInputMax);
    }

    // 5.10 Tombol Terapkan Filter
    const btnApply = document.getElementById("btn-apply-filter");
    if (btnApply) {
      btnApply.addEventListener("click", () => {
        applyFilters();
      });
    }

    // 5.11 Reset Filter
    const btnReset = document.getElementById("btn-reset-filter");
    if (btnReset) {
      btnReset.addEventListener("click", () => {
        const isAppliedAlreadyDefault =
          STATE.appliedFilter.activeLines.size === 3 &&
          STATE.appliedFilter.activeLines.has("L0001") &&
          STATE.appliedFilter.activeLines.has("L0002") &&
          STATE.appliedFilter.activeLines.has("L0003") &&
          Math.abs(STATE.appliedFilter.minDepth - DATA_MIN_DEPTH) < 0.001 &&
          Math.abs(STATE.appliedFilter.maxDepth - DATA_MAX_DEPTH) < 0.001;

        STATE.draftFilter.activeLines = new Set(["L0001", "L0002", "L0003"]);
        STATE.draftFilter.minDepth = DATA_MIN_DEPTH;
        STATE.draftFilter.maxDepth = DATA_MAX_DEPTH;

        STATE.appliedFilter.activeLines = new Set(["L0001", "L0002", "L0003"]);
        STATE.appliedFilter.minDepth = DATA_MIN_DEPTH;
        STATE.appliedFilter.maxDepth = DATA_MAX_DEPTH;

        if (filterMin) filterMin.value = DATA_MIN_DEPTH.toFixed(2);
        if (filterMax) filterMax.value = DATA_MAX_DEPTH.toFixed(2);
        if (inputMin) inputMin.value = DATA_MIN_DEPTH.toFixed(2);
        if (inputMax) inputMax.value = DATA_MAX_DEPTH.toFixed(2);

        document.querySelectorAll(".line-checkbox").forEach(cb => {
          cb.checked = true;
        });

        updateSpinnerButtonStates();
        updateFilterApplyButtonUI();

        // Hanya jalankan render ulang jika appliedFilter sebelumnya bukan default
        if (!isAppliedAlreadyDefault) {
          filterDataset();
          renderAll();
        }
      });
    }

    // 5.12a Spinner tombol Min/Maks kedalaman (panah atas/bawah kustom)
    // Perbarui status redup (disabled) tombol spinner ketika nilai draft di batas
    function updateSpinnerButtonStates() {
      const sMinUp   = document.getElementById("spin-min-up");
      const sMinDown = document.getElementById("spin-min-down");
      const sMaxUp   = document.getElementById("spin-max-up");
      const sMaxDown = document.getElementById("spin-max-down");
      if (sMinUp)   sMinUp.disabled   = STATE.draftFilter.minDepth >= STATE.draftFilter.maxDepth;
      if (sMinDown) sMinDown.disabled = STATE.draftFilter.minDepth <= DATA_MIN_DEPTH;
      if (sMaxUp)   sMaxUp.disabled   = STATE.draftFilter.maxDepth >= DATA_MAX_DEPTH;
      if (sMaxDown) sMaxDown.disabled = STATE.draftFilter.maxDepth <= STATE.draftFilter.minDepth;
    }

    // Helper untuk press-and-hold dengan akselerasi
    function makePressHandler(action) {
      let timerId = null;
      let holdTimer = null;
      let interval = 200; // ms awal

      function fire() {
        action();
        interval = Math.max(50, interval - 15); // makin cepat hingga minimal 50 ms
        timerId = setTimeout(fire, interval);
      }

      return {
        start(e) {
          e.preventDefault();
          action();
          holdTimer = setTimeout(() => { fire(); }, 400);
        },
        stop() {
          clearTimeout(holdTimer);
          clearTimeout(timerId);
          interval = 200;
        }
      };
    }

    // Pasang event ke tombol spinner Min & Max
    const spinMinUp   = document.getElementById("spin-min-up");
    const spinMinDown = document.getElementById("spin-min-down");
    const spinMaxUp   = document.getElementById("spin-max-up");
    const spinMaxDown = document.getElementById("spin-max-down");

    if (spinMinUp) {
      const h = makePressHandler(() => updateDraftMin(STATE.draftFilter.minDepth + SPINNER_STEP));
      spinMinUp.addEventListener("mousedown", h.start);
      spinMinUp.addEventListener("touchstart", h.start, { passive: false });
      ["mouseup", "mouseleave", "touchend"].forEach(ev => spinMinUp.addEventListener(ev, h.stop));
    }
    if (spinMinDown) {
      const h = makePressHandler(() => updateDraftMin(STATE.draftFilter.minDepth - SPINNER_STEP));
      spinMinDown.addEventListener("mousedown", h.start);
      spinMinDown.addEventListener("touchstart", h.start, { passive: false });
      ["mouseup", "mouseleave", "touchend"].forEach(ev => spinMinDown.addEventListener(ev, h.stop));
    }
    if (spinMaxUp) {
      const h = makePressHandler(() => updateDraftMax(STATE.draftFilter.maxDepth + SPINNER_STEP));
      spinMaxUp.addEventListener("mousedown", h.start);
      spinMaxUp.addEventListener("touchstart", h.start, { passive: false });
      ["mouseup", "mouseleave", "touchend"].forEach(ev => spinMaxUp.addEventListener(ev, h.stop));
    }
    if (spinMaxDown) {
      const h = makePressHandler(() => updateDraftMax(STATE.draftFilter.maxDepth - SPINNER_STEP));
      spinMaxDown.addEventListener("mousedown", h.start);
      spinMaxDown.addEventListener("touchstart", h.start, { passive: false });
      ["mouseup", "mouseleave", "touchend"].forEach(ev => spinMaxDown.addEventListener(ev, h.stop));
    }

    // Panah keyboard pada kotak input (Up/Down dan Shift+Up/Down)
    if (inputMin) {
      inputMin.addEventListener("keydown", (e) => {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          updateDraftMin(STATE.draftFilter.minDepth + (e.shiftKey ? SPINNER_STEP_SHIFT : SPINNER_STEP));
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          updateDraftMin(STATE.draftFilter.minDepth - (e.shiftKey ? SPINNER_STEP_SHIFT : SPINNER_STEP));
        }
      });
    }
    if (inputMax) {
      inputMax.addEventListener("keydown", (e) => {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          updateDraftMax(STATE.draftFilter.maxDepth + (e.shiftKey ? SPINNER_STEP_SHIFT : SPINNER_STEP));
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          updateDraftMax(STATE.draftFilter.maxDepth - (e.shiftKey ? SPINNER_STEP_SHIFT : SPINNER_STEP));
        }
      });
    }

    // Inisialisasi status spinner & apply button
    updateSpinnerButtonStates();
    updateFilterApplyButtonUI();

    // 5.12 Unduh Gambar 3D (PNG)
    const btnDownload3D = document.getElementById("btn-download-3d");
    if (btnDownload3D) {
      btnDownload3D.addEventListener("click", () => {
        const container = document.getElementById("plot-3d");
        if (container) {
          Plotly.downloadImage(container, {
            format: "png",
            filename: "Model_3D_Batimetri_Danau_Unhas",
            width: 1400,
            height: 900,
            scale: 2
          });
        }
      });
    }

    // 5.13 Unduh CSV Terfilter
    const btnDownloadCSV = document.getElementById("btn-download-csv");
    if (btnDownloadCSV) {
      btnDownloadCSV.addEventListener("click", downloadFilteredCSV);
    }

    // 5.14 Kontrol Kartu Peta Basemap Leaflet
    // Pilihan Peta Dasar (Radio Satelit / Maps)
    document.querySelectorAll('input[name="basemap-layer"]').forEach(radio => {
      radio.addEventListener("change", (e) => {
        if (e.target.checked) {
          switchBasemap(e.target.value);
        }
      });
    });

    // Pilihan Interval Kontur
    const selectInterval = document.getElementById("select-contour-interval");
    if (selectInterval) {
      selectInterval.addEventListener("change", (e) => {
        STATE.basemapState.contourInterval = parseFloat(e.target.value);
        updateBasemapLayers();
      });
    }

    // Slider Transparansi Kontur
    const sliderOpacity = document.getElementById("slider-contour-opacity");
    if (sliderOpacity) {
      sliderOpacity.addEventListener("input", (e) => {
        updateContourTransparency(parseInt(e.target.value, 10));
      });
    }

    // Tombol Zoom ke Danau
    const btnZoomLake = document.getElementById("btn-zoom-to-lake");
    if (btnZoomLake) {
      btnZoomLake.addEventListener("click", () => {
        fitLakeBounds();
      });
    }

    // Checkbox Lapisan Kontur
    const cbContours = document.getElementById("layer-cb-contours");
    if (cbContours) {
      cbContours.addEventListener("change", (e) => {
        STATE.basemapState.layers.contours = e.target.checked;
        applyBasemapLayerVisibility();
        updateBasemapLegendToggleBtn();
      });
    }

    // Checkbox Lapisan Batas Tepi Danau
    const cbBoundary = document.getElementById("layer-cb-boundary");
    if (cbBoundary) {
      cbBoundary.addEventListener("change", (e) => {
        STATE.basemapState.layers.boundary = e.target.checked;
        applyBasemapLayerVisibility();
        updateBasemapLegendToggleBtn();
      });
    }

    // Checkbox Lapisan Jalur Pemeruman
    const cbTracks = document.getElementById("layer-cb-tracks");
    if (cbTracks) {
      cbTracks.addEventListener("change", (e) => {
        STATE.basemapState.layers.tracks = e.target.checked;
        applyBasemapLayerVisibility();
        updateBasemapLegendToggleBtn();
      });
    }

    // Tombol Pilih Semua / Kosongkan Legenda Peta
    const btnToggleBasemap = document.getElementById("btn-toggle-basemap-layers");
    if (btnToggleBasemap) {
      btnToggleBasemap.addEventListener("click", () => {
        const layers = STATE.basemapState.layers;
        const allChecked = layers.contours && layers.boundary && layers.tracks;
        const targetState = !allChecked;

        layers.contours = targetState;
        layers.boundary = targetState;
        layers.tracks = targetState;

        if (cbContours) cbContours.checked = targetState;
        if (cbBoundary) cbBoundary.checked = targetState;
        if (cbTracks) cbTracks.checked = targetState;

        applyBasemapLayerVisibility();
        updateBasemapLegendToggleBtn();
      });
    }

    // Window Resize Invalidate Size
    window.addEventListener("resize", () => {
      if (basemapMap) {
        basemapMap.invalidateSize();
      }
    });
  }

  // ============================================================================
  // LOGIKA PUTAR OTOMATIS 3D YANG STABIL
  // ============================================================================
  let rotationAnimId = null;
  let rotationStartTime = 0;
  let lastRotationFrameTime = 0;
  let rotationRadius = 0;
  let rotationHeightZ = 0;
  let rotationInitialAngle = 0;

  function updateRotateButtonUI(isRotating) {
    const btnRotate = document.getElementById("btn-autorotate");
    if (!btnRotate) return;
    if (isRotating) {
      btnRotate.classList.add("btn-primary");
      btnRotate.classList.remove("btn-secondary");
      btnRotate.innerHTML = `<svg width="16" height="16" aria-hidden="true"><use href="#icon-stop"/></svg> Hentikan Putar`;
    } else {
      btnRotate.classList.remove("btn-primary");
      btnRotate.classList.add("btn-secondary");
      btnRotate.innerHTML = `<svg width="16" height="16" aria-hidden="true"><use href="#icon-play"/></svg> Putar Otomatis`;
    }
  }

  function startAutoRotate() {
    // 1. Pastikan hanya ada satu loop animasi berjalan: batalkan loop lama jika ada
    if (rotationAnimId) {
      cancelAnimationFrame(rotationAnimId);
      rotationAnimId = null;
    }

    const container = document.getElementById("plot-3d");
    if (!container) return;

    // 2. Baca posisi kamera saat ini dari Plotly scene
    let curEye = DEFAULT_CAMERA.eye;
    if (container._fullLayout && container._fullLayout.scene && container._fullLayout.scene._scene) {
      const glCamera = container._fullLayout.scene._scene.getCamera();
      if (glCamera && glCamera.eye) {
        curEye = glCamera.eye;
      }
    } else if (container._fullLayout && container._fullLayout.scene && container._fullLayout.scene.camera && container._fullLayout.scene.camera.eye) {
      curEye = container._fullLayout.scene.camera.eye;
    }

    const eyeX = (typeof curEye.x === "number") ? curEye.x : DEFAULT_CAMERA.eye.x;
    const eyeY = (typeof curEye.y === "number") ? curEye.y : DEFAULT_CAMERA.eye.y;
    const eyeZ = (typeof curEye.z === "number") ? curEye.z : DEFAULT_CAMERA.eye.z;

    // Jari-jari horizontal r dan ketinggian eye.z dibaca satu kali dan dijaga konstan (bebas zoom)
    rotationRadius = Math.hypot(eyeX, eyeY);
    if (rotationRadius < 0.2) {
      rotationRadius = Math.hypot(DEFAULT_CAMERA.eye.x, DEFAULT_CAMERA.eye.y);
    }
    rotationHeightZ = eyeZ;
    rotationInitialAngle = Math.atan2(eyeY, eyeX);
    rotationStartTime = performance.now();
    lastRotationFrameTime = rotationStartTime;

    STATE.isRotating = true;
    updateRotateButtonUI(true);

    function rotateStep(timestamp) {
      if (!STATE.isRotating) return;

      // Batasi pembaruan sekitar 30 FPS (interval >= 33 ms)
      if (timestamp - lastRotationFrameTime >= ROTATION_FRAME_INTERVAL_MS) {
        lastRotationFrameTime = timestamp;
        const elapsed = timestamp - rotationStartTime;
        // Sudut dihitung dari waktu (timestamp): satu putaran penuh per ROTATION_PERIOD_MS (50 detik)
        const theta = rotationInitialAngle + (2 * Math.PI * (elapsed % ROTATION_PERIOD_MS) / ROTATION_PERIOD_MS);
        const nextX = rotationRadius * Math.cos(theta);
        const nextY = rotationRadius * Math.sin(theta);

        // Perbarui kamera hanya dengan Plotly.relayout di scene.camera
        Plotly.relayout(container, {
          "scene.camera": {
            center: { x: 0, y: 0, z: 0 },
            eye: { x: nextX, y: nextY, z: rotationHeightZ }
          }
        });
      }

      rotationAnimId = requestAnimationFrame(rotateStep);
    }

    rotationAnimId = requestAnimationFrame(rotateStep);
  }

  function stopAutoRotate() {
    STATE.isRotating = false;
    if (rotationAnimId) {
      cancelAnimationFrame(rotationAnimId);
      rotationAnimId = null;
    }
    updateRotateButtonUI(false);
  }

  function downloadFilteredCSV() {
    const rows = [["Name", "Line", "Time", "East", "North", "Water_Surface_H", "Bottom_Elev", "Depth_m"]];
    STATE.filteredPoints.forEach(p => {
      rows.push([p.name, p.line, p.time, p.e, p.n, p.wse, p.bottom, p.depth]);
    });

    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Data_Batimetri_Danau_Unhas_Terfilter_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Filter dataset titik survei berdasarkan appliedFilter (jalur dan kedalaman)
   */
  function filterDataset() {
    STATE.filteredPoints = STATE.rawPoints.filter(p => {
      const matchLine = STATE.appliedFilter.activeLines.has(p.line);
      const matchDepth = p.depth >= STATE.appliedFilter.minDepth && p.depth <= STATE.appliedFilter.maxDepth;
      return matchLine && matchDepth;
    });

    // Bangkitkan titik bantu berdasarkan titik ukur aktif pada grid reguler
    STATE.helperPoints = generateHelperPoints(STATE.filteredPoints, DATA.boundary, HELPER_GRID_STEP, HELPER_MIN_SURVEY_DIST);
  }

  /**
   * Cek apakah ada perbedaan antara draftFilter dan appliedFilter
   */
  function hasFilterChanges() {
    const draft = STATE.draftFilter;
    const applied = STATE.appliedFilter;

    if (Math.abs(draft.minDepth - applied.minDepth) > 0.001) return true;
    if (Math.abs(draft.maxDepth - applied.maxDepth) > 0.001) return true;

    if (draft.activeLines.size !== applied.activeLines.size) return true;
    for (const line of draft.activeLines) {
      if (!applied.activeLines.has(line)) return true;
    }
    return false;
  }

  /**
   * Perbarui UI tombol Terapkan Filter & badge status filter
   */
  function updateFilterApplyButtonUI(isLoading = false) {
    const btnApply = document.getElementById("btn-apply-filter");
    const badge = document.getElementById("filter-status-badge");
    const badgeIcon = document.getElementById("filter-status-icon");
    const badgeText = document.getElementById("filter-status-text");
    const hasChanges = hasFilterChanges();

    if (btnApply) {
      btnApply.disabled = !hasChanges || isLoading;
      if (hasChanges && !isLoading) {
        btnApply.classList.add("has-changes");
      } else {
        btnApply.classList.remove("has-changes");
      }
    }

    if (badge && badgeText) {
      if (isLoading) {
        badge.className = "filter-status-badge is-loading";
        badgeText.textContent = "Menerapkan...";
        if (badgeIcon) {
          badgeIcon.innerHTML = `<span class="notice-dot-spin"></span>`;
        }
      } else if (hasChanges) {
        badge.className = "filter-status-badge is-unapplied";
        badgeText.textContent = "Perubahan belum diterapkan";
        if (badgeIcon) {
          badgeIcon.innerHTML = `<span class="notice-dot"></span>`;
        }
      } else {
        badge.className = "filter-status-badge is-applied";
        badgeText.textContent = "Filter sudah diterapkan";
        if (badgeIcon) {
          badgeIcon.innerHTML = `<svg width="14" height="14" aria-hidden="true"><use href="#icon-check"/></svg>`;
        }
      }
    }
  }

  /**
   * Terapkan filter draft ke appliedFilter dan lakukan pembaruan penuh dashboard
   */
  function applyFilters() {
    const btnApply = document.getElementById("btn-apply-filter");
    const btnText = document.getElementById("btn-apply-filter-text");

    // 1. Salin draftFilter ke appliedFilter
    STATE.appliedFilter.minDepth = STATE.draftFilter.minDepth;
    STATE.appliedFilter.maxDepth = STATE.draftFilter.maxDepth;
    STATE.appliedFilter.activeLines = new Set(STATE.draftFilter.activeLines);

    // 2. Tampilkan keadaan memproses singkat
    if (btnApply) {
      btnApply.disabled = true;
      btnApply.classList.add("is-loading");
    }
    if (btnText) {
      btnText.textContent = "Menerapkan...";
    }
    updateFilterApplyButtonUI(true);

    // 3. Jalankan pembaruan di frame berikutnya agar status 'Menerapkan...' sempat terlihat
    setTimeout(() => {
      filterDataset();
      renderAll();

      if (btnText) {
        btnText.textContent = "Terapkan Filter";
      }
      if (btnApply) {
        btnApply.classList.remove("is-loading");
      }
      updateFilterApplyButtonUI(false);
    }, 16);
  }

  /**
   * Inisialisasi Checkbox Filter Jalur (hanya mengubah draftFilter)
   */
  function setupLineFilterUI() {
    const container = document.getElementById("line-filter-container");
    if (!container) return;
    container.innerHTML = "";

    ["L0001", "L0002", "L0003"].forEach(lineId => {
      const count = DATA.meta.lineStats[lineId] ? DATA.meta.lineStats[lineId].count : 0;
      const label = document.createElement("label");
      label.className = "filter-pill";
      const isChecked = STATE.draftFilter.activeLines.has(lineId);
      label.innerHTML = `
        <input type="checkbox" class="line-checkbox" value="${lineId}" ${isChecked ? "checked" : ""}>
        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${LINE_COLORS[lineId] || '#0ea5e9'};"></span>
        <span>${lineId} (${count.toLocaleString("id-ID")})</span>
      `;

      const cb = label.querySelector("input");
      cb.addEventListener("change", (e) => {
        if (e.target.checked) {
          STATE.draftFilter.activeLines.add(lineId);
        } else {
          STATE.draftFilter.activeLines.delete(lineId);
        }
        updateFilterApplyButtonUI();
      });

      container.appendChild(label);
    });
  }

  // ============================================================================
  // 6. INIT UTAMA DASHBOARD
  // ============================================================================

  function init() {
    if (typeof DATA === "undefined") {
      alert("Error: File data.js tidak ditemukan atau gagal dimuat. Pastikan build_data.py sudah dijalankan!");
      return;
    }

    // 1. Simpan referensi data mentah
    STATE.rawPoints = DATA.points;
    STATE.boundaryPoints = DATA.boundary;
    
    // Bounds koordinat
    STATE.minE = DATA.meta.bounds.minE;
    STATE.maxE = DATA.meta.bounds.maxE;
    STATE.minN = DATA.meta.bounds.minN;
    STATE.maxN = DATA.meta.bounds.maxN;

    // Nilai awal posisi irisan (50% dari utara-selatan)
    STATE.sliceCoord = STATE.minN + 0.5 * (STATE.maxN - STATE.minN);
    const valSliceEl = document.getElementById("val-slice-coord");
    if (valSliceEl) valSliceEl.textContent = `${STATE.sliceCoord.toFixed(2)} m`;

    // 2. Densifikasi garis tepi pantai (interval BOUNDARY_DENSIFY_STEP = 4 m)
    STATE.densifiedBoundary = densifyBoundary(DATA.boundary, BOUNDARY_DENSIFY_STEP);

    // 3. Terapkan filter awal (seluruh titik) dan bangkitkan titik bantu interpolasi
    filterDataset();

    // 4. Siapkan UI Kontrol
    setupLineFilterUI();
    setupEventListeners();
    initBasemapMap();

    // 5. Render seluruh komponen
    renderAll();
  }

  // Jalankan saat DOM siap
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
