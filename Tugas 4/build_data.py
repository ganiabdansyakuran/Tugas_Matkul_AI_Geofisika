"""
================================================================================
SCRIPT TAHAP 1: BUILD DATA (build_data.py)
Deskripsi:
  Membaca dan memvalidasi data CSV survei batimetri dan shapefile tepi Danau Unhas,
  memeriksa dan mereproyeksi CRS (EPSG:32750), mengekspor geometri ke format
  tepi_danau.geojson, mengunduh/menyalin pustaka JS lokal ke libs/, serta
  menghasilkan file data.js untuk dikonsumsi langsung oleh index.html tanpa server.
================================================================================
"""

import sys
import json
import shutil
import urllib.request
from pathlib import Path
import numpy as np
import pandas as pd
import geopandas as gpd
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union, polygonize

# Konfigurasi Encoding Output Terminal
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parent
TARGET_CRS = "EPSG:32750"  # UTM Zone 50S


# ==============================================================================
# 1. DOWNLOAD & SALIN PUSTAKA JS LOKAL KE libs/
# ==============================================================================

def setup_local_libraries(libs_dir: Path):
    """Memastikan semua pustaka JavaScript tersimpan lokal di folder libs/."""
    libs_dir.mkdir(exist_ok=True)
    print("\n[LIBS] Memeriksa pustaka JavaScript lokal di folder 'libs/'...")

    # A. Plotly.js
    plotly_dest = libs_dir / "plotly.min.js"
    if not plotly_dest.exists() or plotly_dest.stat().st_size < 100_000:
        copied = False
        try:
            import plotly
            pkg_plotly_js = Path(plotly.__file__).resolve().parent / "package_data" / "plotly.min.js"
            if pkg_plotly_js.exists():
                shutil.copyfile(pkg_plotly_js, plotly_dest)
                print(f"  [OK] Plotly.js disalin dari instalasi Python: {plotly_dest.name} ({plotly_dest.stat().st_size:,} bytes)")
                copied = True
        except Exception:
            pass

        if not copied:
            print("  ↓ Mengunduh plotly.min.js dari CDN resmi...")
            urllib.request.urlretrieve("https://cdn.plot.ly/plotly-2.35.2.min.js", plotly_dest)
            print(f"  [OK] Berhasil mengunduh: {plotly_dest.name} ({plotly_dest.stat().st_size:,} bytes)")
    else:
        print(f"  [OK] Plotly.js sudah ada: {plotly_dest.name} ({plotly_dest.stat().st_size:,} bytes)")

    # B. Delaunator (Triangulasi Delaunay cepat)
    delaunator_dest = libs_dir / "delaunator.min.js"
    if not delaunator_dest.exists() or delaunator_dest.stat().st_size < 1_000:
        print("  ↓ Mengunduh delaunator.min.js...")
        try:
            urllib.request.urlretrieve("https://unpkg.com/delaunator@5.0.0/delaunator.min.js", delaunator_dest)
            print(f"  [OK] Berhasil mengunduh: {delaunator_dest.name} ({delaunator_dest.stat().st_size:,} bytes)")
        except Exception as err:
            print(f"  [!] Gagal mengunduh delaunator: {err}")
    else:
        print(f"  [OK] Delaunator sudah ada: {delaunator_dest.name} ({delaunator_dest.stat().st_size:,} bytes)")

    # C. D3-Delaunay
    d3_delaunay_dest = libs_dir / "d3-delaunay.min.js"
    if not d3_delaunay_dest.exists() or d3_delaunay_dest.stat().st_size < 1_000:
        print("  ↓ Mengunduh d3-delaunay.min.js...")
        try:
            urllib.request.urlretrieve("https://cdn.jsdelivr.net/npm/d3-delaunay@6/dist/d3-delaunay.min.js", d3_delaunay_dest)
            print(f"  [OK] Berhasil mengunduh: {d3_delaunay_dest.name} ({d3_delaunay_dest.stat().st_size:,} bytes)")
        except Exception as err:
            print(f"  [!] Gagal mengunduh d3-delaunay: {err}")
    else:
        print(f"  [OK] d3-delaunay sudah ada: {d3_delaunay_dest.name} ({d3_delaunay_dest.stat().st_size:,} bytes)")


# ==============================================================================
# 2. PENGOLAHAN SHAPEFILE & REPROJEKSI CRS
# ==============================================================================

def process_shapefile(base_dir: Path) -> tuple[Polygon | MultiPolygon, gpd.GeoDataFrame]:
    """Mencari file shapefile (.shp), mengecek CRS, dan mengonversinya menjadi Polygon tertutup."""
    shp_files = list(base_dir.glob("*.shp"))
    if not shp_files:
        raise FileNotFoundError(f"Tidak ada file shapefile (.shp) di {base_dir}")

    # Prioritaskan shapefile danau
    selected_shp = shp_files[0]
    for shp in shp_files:
        if "danau" in shp.name.lower() or "lake" in shp.name.lower():
            selected_shp = shp
            break

    print(f"\n[SHP] Membaca shapefile garis tepi danau: {selected_shp.name}")
    gdf = gpd.read_file(selected_shp)

    # Cek CRS
    if gdf.crs is None:
        print(f"  [!] Shapefile tidak memiliki CRS terdefinisi. Mengasumsikan {TARGET_CRS}.")
        gdf.set_crs(TARGET_CRS, inplace=True)
    elif gdf.crs.to_string().upper() != TARGET_CRS.upper():
        print(f"  Reproyeksi shapefile dari {gdf.crs} ke {TARGET_CRS}...")
        gdf = gdf.to_crs(TARGET_CRS)

    print(f"  [OK] CRS shapefile aktif: {gdf.crs}")

    # Konversi geometri ke polygon
    geom_union = unary_union(gdf.geometry)
    if geom_union.geom_type in ["Polygon", "MultiPolygon"]:
        lake_polygon = geom_union
    elif geom_union.geom_type in ["LineString", "MultiLineString"]:
        polygons = list(polygonize(geom_union))
        if polygons:
            lake_polygon = unary_union(polygons)
        else:
            if geom_union.geom_type == "LineString":
                coords = list(geom_union.coords)
                if coords[0] != coords[-1]:
                    coords.append(coords[0])
                lake_polygon = Polygon(coords)
            else:
                poly_list = []
                for line in geom_union.geoms:
                    c = list(line.coords)
                    if len(c) >= 3:
                        if c[0] != c[-1]:
                            c.append(c[0])
                        poly_list.append(Polygon(c))
                lake_polygon = unary_union(poly_list)
    else:
        raise ValueError(f"Geometri tidak didukung: {geom_union.geom_type}")

    # Simpan output tambahan tepi_danau.geojson
    geojson_path = base_dir / "tepi_danau.geojson"
    gdf_polygon = gpd.GeoDataFrame([{"id": 1, "name": "Danau Unhas", "area_m2": round(lake_polygon.area, 2)}],
                                   geometry=[lake_polygon],
                                   crs=TARGET_CRS)
    gdf_polygon.to_file(geojson_path, driver="GeoJSON")
    print(f"  [OK] Berhasil menyimpan tepi_danau.geojson ({geojson_path.stat().st_size:,} bytes)")

    return lake_polygon, gdf_polygon


# ==============================================================================
# 3. PENGOLAHAN CSV BATIMETRI & METADATA
# ==============================================================================

def process_csv_and_build_data(
    base_dir: Path,
    lake_polygon: Polygon | MultiPolygon
) -> Path:
    """Membaca CSV, memformat kolom, menghitung statistik jalur, dan menulis data.js."""
    csv_path = base_dir / "Danau_Unhas.csv"
    if not csv_path.exists():
        raise FileNotFoundError(f"File CSV '{csv_path.name}' tidak ditemukan di {base_dir}")

    print(f"\n[CSV] Membaca data survei: {csv_path.name}")
    df = pd.read_csv(csv_path)

    # Validasi kolom wajib
    required_cols = ["Name", "Time", "East", "North", "Water Surface H", "Bottom Elev.", "Depth"]
    for col in required_cols:
        if col not in df.columns:
            raise KeyError(f"Kolom wajib '{col}' tidak ditemukan di CSV!")

    # Bersihkan NaN
    df = df.dropna(subset=["East", "North", "Depth"]).copy()

    # Ekstrak jalur survei dari nama titik (misal L0001_000001 -> L0001)
    df["Line"] = df["Name"].astype(str).apply(lambda x: x.split("_")[0] if "_" in x else "Line")

    # Hitung panjang jalur survei
    line_stats = {}
    total_survey_length_m = 0.0

    unique_lines = sorted(df["Line"].unique().tolist())
    for line_id in unique_lines:
        line_df = df[df["Line"] == line_id].sort_values("Time")
        pts = line_df[["East", "North"]].to_numpy()
        if len(pts) > 1:
            diffs = np.diff(pts, axis=0)
            dists = np.sqrt(np.sum(diffs ** 2, axis=1))
            length_m = float(np.sum(dists))
        else:
            length_m = 0.0

        total_survey_length_m += length_m
        line_stats[line_id] = {
            "count": int(len(line_df)),
            "length_m": round(length_m, 2),
            "min_depth": round(float(line_df["Depth"].min()), 3),
            "max_depth": round(float(line_df["Depth"].max()), 3),
            "mean_depth": round(float(line_df["Depth"].mean()), 3),
            "start_time": str(line_df["Time"].min()),
            "end_time": str(line_df["Time"].max()),
        }

    # Titik terdalam
    deepest_idx = df["Depth"].idxmax()
    deepest_row = df.loc[deepest_idx]

    # Ekstrak koordinat batas danau (boundary vertices)
    boundary_coords = []
    polys = [lake_polygon] if lake_polygon.geom_type == "Polygon" else list(lake_polygon.geoms)
    for poly in polys:
        bx, by = poly.exterior.xy
        for x, y in zip(bx, by):
            boundary_coords.append([round(float(x), 2), round(float(y), 2)])

    # Format data titik survei: {name, line, time, e, n, wse, bottom, depth}
    points_list = []
    for _, row in df.iterrows():
        points_list.append({
            "name": str(row["Name"]),
            "line": str(row["Line"]),
            "time": str(row["Time"]),
            "e": round(float(row["East"]), 2),
            "n": round(float(row["North"]), 2),
            "wse": round(float(row["Water Surface H"]), 2),
            "bottom": round(float(row["Bottom Elev."]), 2),
            "depth": round(float(row["Depth"]), 2)
        })

    # Waktu survei
    time_min = str(df["Time"].min())
    time_max = str(df["Time"].max())
    try:
        t_start = pd.to_datetime(time_min)
        t_end = pd.to_datetime(time_max)
        duration_min = round((t_end - t_start).total_seconds() / 60.0, 2)
        survey_date = t_start.strftime("%Y-%m-%d")
    except Exception:
        duration_min = 30.0
        survey_date = "2026-10-08"

    # Meta informasi
    min_e = float(df["East"].min())
    max_e = float(df["East"].max())
    min_n = float(df["North"].min())
    max_n = float(df["North"].max())

    poly_min_e, poly_min_n, poly_max_e, poly_max_n = lake_polygon.bounds

    meta_info = {
        "title": "Batimetri Danau Unhas",
        "crs": TARGET_CRS,
        "date": survey_date,
        "timeStart": time_min,
        "timeEnd": time_max,
        "durationMinutes": duration_min,
        "totalPoints": len(points_list),
        "lines": unique_lines,
        "lineStats": line_stats,
        "totalSurveyLengthMeters": round(total_survey_length_m, 2),
        "lakeAreaM2": round(float(lake_polygon.area), 2),
        "lakePerimeterM": round(float(lake_polygon.length), 2),
        "depthStats": {
            "min": round(float(df["Depth"].min()), 3),
            "max": round(float(df["Depth"].max()), 3),
            "mean": round(float(df["Depth"].mean()), 3),
            "median": round(float(df["Depth"].median()), 3),
            "std": round(float(df["Depth"].std()), 3)
        },
        "wseStats": {
            "min": round(float(df["Water Surface H"].min()), 3),
            "max": round(float(df["Water Surface H"].max()), 3),
            "mean": round(float(df["Water Surface H"].mean()), 3)
        },
        "deepestPoint": {
            "name": str(deepest_row["Name"]),
            "line": str(deepest_row["Line"]),
            "e": round(float(deepest_row["East"]), 2),
            "n": round(float(deepest_row["North"]), 2),
            "depth": round(float(deepest_row["Depth"]), 2),
            "time": str(deepest_row["Time"])
        },
        "bounds": {
            "minE": round(min(min_e, poly_min_e), 2),
            "maxE": round(max(max_e, poly_max_e), 2),
            "minN": round(min(min_n, poly_min_n), 2),
            "maxN": round(max(max_n, poly_max_n), 2)
        }
    }

    # Tulis data.js
    data_js_path = base_dir / "data.js"
    print(f"\n[EXPORT] Menulis file data.js ({len(points_list):,} titik, {len(boundary_coords):,} simpul batas)...")

    js_content = (
        "// File data batimetri danau hasil generasi otomatis oleh build_data.py\n"
        "// Format data siap dikonsumsi langsung oleh index.html secara offline tanpa server.\n"
        f"const DATA = {{\n"
        f"  meta: {json.dumps(meta_info, indent=2)},\n"
        f"  boundary: {json.dumps(boundary_coords)},\n"
        f"  points: {json.dumps(points_list, separators=(',', ':'))}\n"
        f"}};\n"
        f"if (typeof window !== 'undefined') {{ window.DATA = DATA; }}\n"
        f"if (typeof module !== 'undefined') {{ module.exports = DATA; }}\n"
    )

    with open(data_js_path, "w", encoding="utf-8") as f:
        f.write(js_content)

    print(f"  [OK] Berhasil membuat: {data_js_path.name} ({data_js_path.stat().st_size:,} bytes)")
    return data_js_path


# ==============================================================================
# MAIN
# ==============================================================================

def main():
    print("=" * 80)
    print("        BUILD DATA BATIMETRI DANAU UNHAS (OFFLINE DASHBOARD GENERATOR)")
    print("=" * 80)

    libs_dir = BASE_DIR / "libs"
    setup_local_libraries(libs_dir)

    lake_polygon, _ = process_shapefile(BASE_DIR)
    data_js_path = process_csv_and_build_data(BASE_DIR, lake_polygon)

    print("\n" + "=" * 80)
    print("                      PROSES BUILD DATA SELESAI SUKSES                         ")
    print("=" * 80)
    print(f"1. Pustaka Offline JS : {libs_dir.resolve()}")
    print(f"2. File GeoJSON Batas : {(BASE_DIR / 'tepi_danau.geojson').resolve()}")
    print(f"3. File Data Frontend : {data_js_path.resolve()}")
    print("=" * 80 + "\n")


if __name__ == "__main__":
    main()
