'use client';

import React, { useMemo, useState } from 'react';

// =========================================================
// TIPE DATA
// =========================================================
// Setiap "assignment" = satu baris di tabel penugasan (satu mitra pada satu
// kegiatan), lengkap dengan daftar bulan kalender yang dicakup kegiatan itu
// (hasil parseBulanKegiatan di halaman Dashboard). Disimpan mentah begitu —
// bukan sudah teragregasi per mitra — supaya toggle "Sepanjang Waktu / Tahun
// Ini" bisa menghitung ulang agregasinya sesuai scope yang dipilih.

export interface WorkDistributionAssignment {
  sobatId: string;
  namaMitra: string;
  totalHonor: number;
  months: string[]; // mis. ["Agustus 2026", "September 2026", "Oktober 2026"]
}

export interface WorkDistributionMitra {
  sobatId: string;
  namaMitra: string;
}

interface Props {
  mitraList: WorkDistributionMitra[];
  assignments: WorkDistributionAssignment[];
  tahunAktif?: string; // dipakai HANYA sebagai fallback awal kalau data belum ada tahun apa pun
  loading?: boolean;
}

type SortDir = 'asc' | 'desc';
type Scope = 'all' | 'year';

type Kategori = 'Belum Pernah' | 'Di Bawah Rata-rata' | 'Normal' | 'Di Atas Rata-rata';

const KATEGORI_STYLE: Record<Kategori, string> = {
  'Belum Pernah': 'bg-rose-50 text-rose-700 border border-rose-200',
  'Di Bawah Rata-rata': 'bg-amber-50 text-amber-700 border border-amber-200',
  Normal: 'bg-slate-100 text-slate-600 border border-slate-200',
  'Di Atas Rata-rata': 'bg-blue-50 text-blue-700 border border-blue-200',
};

function getKategori(jumlah: number, rataRata: number): Kategori {
  if (jumlah === 0) return 'Belum Pernah';
  if (rataRata <= 0) return 'Normal';
  if (jumlah > rataRata * 1.5) return 'Di Atas Rata-rata';
  if (jumlah < rataRata * 0.5) return 'Di Bawah Rata-rata';
  return 'Normal';
}

const formatRupiah = (val: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val || 0);

const ITEMS_PER_PAGE = 10;

interface Row {
  sobatId: string;
  namaMitra: string;
  jumlahKegiatan: number;
  totalHonor: number;
}

export default function WorkDistributionSection({
  mitraList = [],
  assignments = [],
  tahunAktif = String(new Date().getFullYear()),
  loading,
}: Props) {
  const [scope, setScope] = useState<Scope>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [sortDir, setSortDir] = useState<SortDir>('asc'); // asc dulu -> yang paling jarang tampil duluan
  const [currentPage, setCurrentPage] = useState(1);

  // =========================================================
  // AGREGASI SESUAI SCOPE (Sepanjang Waktu vs Tahun Ini)
  // =========================================================
  const data: Row[] = useMemo(() => {
    const countMap: Record<string, number> = {};
    const honorMap: Record<string, number> = {};

    assignments.forEach((a) => {
      const cocokScope = scope === 'all' || a.months.some((m) => m.endsWith(tahunAktif));
      if (!cocokScope) return;

      countMap[a.sobatId] = (countMap[a.sobatId] || 0) + 1;
      honorMap[a.sobatId] = (honorMap[a.sobatId] || 0) + a.totalHonor;
    });

    return mitraList.map((m) => ({
      sobatId: m.sobatId,
      namaMitra: m.namaMitra,
      jumlahKegiatan: countMap[m.sobatId] || 0,
      totalHonor: honorMap[m.sobatId] || 0,
    }));
  }, [mitraList, assignments, scope, tahunAktif]);

  // =========================================================
  // RINGKASAN
  // =========================================================
  const summary = useMemo(() => {
    const totalMitra = data.length;
    const totalKegiatan = data.reduce((sum, r) => sum + r.jumlahKegiatan, 0);
    const rataRata = totalMitra > 0 ? totalKegiatan / totalMitra : 0;

    const belumPernah = data.filter((r) => r.jumlahKegiatan === 0);

    const terbanyak = [...data].sort((a, b) => b.jumlahKegiatan - a.jumlahKegiatan)[0] || null;

    const top10 = [...data]
      .filter((r) => r.jumlahKegiatan > 0)
      .sort((a, b) => b.jumlahKegiatan - a.jumlahKegiatan)
      .slice(0, 10);

    const maxJumlah = top10.length > 0 ? top10[0].jumlahKegiatan : 0;

    return { totalMitra, rataRata, belumPernah, terbanyak, top10, maxJumlah };
  }, [data]);

  // =========================================================
  // TABEL: FILTER + SORT + PAGINASI
  // =========================================================
  const filteredSorted = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();

    const filtered = data.filter(
      (r) =>
        !keyword ||
        r.namaMitra.toLowerCase().includes(keyword) ||
        r.sobatId.toLowerCase().includes(keyword)
    );

    return filtered.sort((a, b) => {
      const diff = a.jumlahKegiatan - b.jumlahKegiatan;
      if (diff !== 0) return sortDir === 'asc' ? diff : -diff;
      return a.namaMitra.localeCompare(b.namaMitra);
    });
  }, [data, searchKeyword, sortDir]);

  const totalItems = filteredSorted.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;

  const currentData = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredSorted.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredSorted, currentPage]);

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const endItem = Math.min(currentPage * ITEMS_PER_PAGE, totalItems);

  const handleToggleSort = () => {
    setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    setCurrentPage(1);
  };

  const handleChangeScope = (next: Scope) => {
    setScope(next);
    setCurrentPage(1);
  };

  return (
    <section className="mt-5">
      {/* HEADER + TOGGLE SCOPE — sengaja terpisah dari dropdown "Periode" di
          atas (yang bulanan, untuk limit honor). Pemerataan beban kerja baru
          bermakna kalau dilihat rentang panjang, jadi cuma ada 2 pilihan
          kasar: sepanjang waktu, atau tahun berjalan. */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-800">Pemerataan Penugasan Mitra</h2>
          <p className="text-[11px] text-slate-500">
            Distribusi jumlah kegiatan per mitra
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm shrink-0">
          <button
            onClick={() => handleChangeScope('all')}
            className={`px-3 py-1 rounded-md text-[11.5px] font-semibold transition ${
              scope === 'all' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            Sepanjang Waktu
          </button>
          <button
            onClick={() => handleChangeScope('year')}
            className={`px-3 py-1 rounded-md text-[11.5px] font-semibold transition ${
              scope === 'year' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            Tahun {tahunAktif}
          </button>
        </div>
      </div>

      {/* RINGKASAN — satu strip horizontal (bukan grid card terpisah) supaya
          tidak kelihatan seperti mengulang baris StatsCard di atas. */}
      <div className="rounded-xl border border-slate-100 bg-white shadow-sm mb-3 grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-100">
        <div className="p-3.5">
          <div className="text-[10.5px] text-slate-400">Total Mitra</div>
          <div className="mt-0.5 text-base font-bold text-slate-800">
            {loading ? '...' : summary.totalMitra}
          </div>
        </div>

        <div className="p-3.5">
          <div className="text-[10.5px] text-rose-500">Belum Pernah Dapat Tugas</div>
          <div className="mt-0.5 text-base font-bold text-rose-600">
            {loading ? '...' : summary.belumPernah.length}
            {!loading && summary.totalMitra > 0 && (
              <span className="ml-1.5 text-[10px] font-medium text-slate-400">
                ({Math.round((summary.belumPernah.length / summary.totalMitra) * 100)}%)
              </span>
            )}
          </div>
        </div>

        <div className="p-3.5">
          <div className="text-[10.5px] text-slate-400">Rata-rata Kegiatan / Mitra</div>
          <div className="mt-0.5 text-base font-bold text-slate-800">
            {loading ? '...' : summary.rataRata.toFixed(1)}
          </div>
        </div>

        <div className="p-3.5">
          <div className="text-[10.5px] text-blue-500">Kegiatan Terbanyak</div>
          <div className="mt-0.5 text-sm font-bold text-blue-700 truncate">
            {loading ? '...' : summary.terbanyak && summary.terbanyak.jumlahKegiatan > 0 ? summary.terbanyak.namaMitra : '-'}
          </div>
          <div className="text-[10px] text-slate-400">
            {loading || !summary.terbanyak || summary.terbanyak.jumlahKegiatan === 0
              ? ''
              : `${summary.terbanyak.jumlahKegiatan} kegiatan`}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 mb-3">
        {/* TOP 10 MITRA KEGIATAN TERBANYAK */}
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <h3 className="text-xs font-bold text-slate-700 mb-3">Top 10 Mitra — Kegiatan Terbanyak</h3>

          {loading ? (
            <div className="py-8 text-center text-[11px] text-slate-400">Memuat data...</div>
          ) : summary.top10.length === 0 ? (
            <div className="py-8 text-center text-[11px] text-slate-400">Belum ada penugasan tercatat.</div>
          ) : (
            <div className="space-y-2.5">
              {summary.top10.map((row, idx) => {
                const widthPercent = summary.maxJumlah > 0 ? (row.jumlahKegiatan / summary.maxJumlah) * 100 : 0;
                return (
                  <div key={row.sobatId} className="flex items-center gap-2.5 text-[11.5px]">
                    <span className="w-4 shrink-0 text-slate-400 font-medium text-right">{idx + 1}</span>
                    <div className="min-w-[110px] max-w-[130px] truncate font-medium text-slate-700">
                      {row.namaMitra}
                    </div>
                    <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${widthPercent}%` }}
                      />
                    </div>
                    <span className="w-6 shrink-0 text-right font-semibold text-slate-700">
                      {row.jumlahKegiatan}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* MITRA BELUM PERNAH DAPAT TUGAS */}
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <h3 className="text-xs font-bold text-slate-700 mb-3">
            Mitra Belum Pernah Dapat Tugas
            {!loading && summary.belumPernah.length > 0 && (
              <span className="ml-1.5 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-full px-1.5 py-0.5">
                {summary.belumPernah.length}
              </span>
            )}
          </h3>

          {loading ? (
            <div className="py-8 text-center text-[11px] text-slate-400">Memuat data...</div>
          ) : summary.belumPernah.length === 0 ? (
            <div className="py-8 text-center text-[11px] text-emerald-600">
              🎉 Semua mitra sudah pernah mendapat penugasan{scope === 'year' ? ` di tahun ${tahunAktif}` : ''}.
            </div>
          ) : (
            <div className="max-h-[210px] overflow-y-auto pr-1 space-y-1.5">
              {summary.belumPernah.map((row) => (
                <div
                  key={row.sobatId}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-rose-50/40 border border-rose-100"
                >
                  <div className="min-w-0">
                    <div className="text-[11.5px] font-medium text-slate-700 truncate">{row.namaMitra}</div>
                    <div className="text-[10px] font-mono text-slate-400">{row.sobatId}</div>
                  </div>
                  <span className="text-[10px] font-semibold text-rose-600 shrink-0">0 kegiatan</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* TABEL LENGKAP */}
      <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="p-3.5 border-b border-slate-100 flex flex-wrap items-center gap-2.5 justify-between">
          <div className="relative min-w-[220px] flex-1 max-w-xs">
            <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400 text-xs">
              🔍
            </span>
            <input
              type="text"
              placeholder="Cari mitra / SOBAT ID..."
              value={searchKeyword}
              onChange={(e) => {
                setSearchKeyword(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-blue-400"
            />
          </div>

          <button
            onClick={handleToggleSort}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition"
          >
            Urutkan Jumlah Kegiatan: {sortDir === 'asc' ? 'Terendah dulu' : 'Tertinggi dulu'}
            <span>{sortDir === 'asc' ? '▲' : '▼'}</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50/70 border-b border-slate-100 font-semibold text-slate-500">
              <tr>
                <th className="py-2.5 px-3.5 text-center w-10">No</th>
                <th className="py-2.5 px-3.5">Nama Mitra</th>
                <th className="py-2.5 px-3.5">SOBAT ID</th>
                <th className="py-2.5 px-3.5 text-center">Jumlah Kegiatan</th>
                <th className="py-2.5 px-3.5 text-right">Total Honor</th>
                <th className="py-2.5 px-3.5 text-center">Kategori</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Memuat data...
                  </td>
                </tr>
              ) : currentData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Tidak ada mitra yang cocok dengan pencarian.
                  </td>
                </tr>
              ) : (
                currentData.map((row, index) => {
                  const kategori = getKategori(row.jumlahKegiatan, summary.rataRata);
                  return (
                    <tr key={row.sobatId} className="hover:bg-slate-50/60 transition">
                      <td className="py-2.5 px-3.5 text-center font-medium text-slate-400">
                        {(currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                      </td>
                      <td className="py-2.5 px-3.5 font-semibold text-slate-800">{row.namaMitra}</td>
                      <td className="py-2.5 px-3.5 font-mono text-blue-600">{row.sobatId}</td>
                      <td className="py-2.5 px-3.5 text-center font-semibold text-slate-700">
                        {row.jumlahKegiatan}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-medium text-slate-600">
                        {formatRupiah(row.totalHonor)}
                      </td>
                      <td className="py-2.5 px-3.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-medium ${KATEGORI_STYLE[kategori]}`}>
                          {kategori}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalItems > 0 && (
          <div className="px-3.5 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-[11.5px] text-slate-500">
            <div>
              Menampilkan <strong className="text-slate-700">{startItem}</strong> -{' '}
              <strong className="text-slate-700">{endItem}</strong> dari{' '}
              <strong className="text-slate-700">{totalItems}</strong> mitra
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                ‹
              </button>
              <span className="px-2 font-medium text-slate-700">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}