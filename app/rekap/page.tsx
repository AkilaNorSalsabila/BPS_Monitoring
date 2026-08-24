'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Fallback limit kalau kegiatan belum punya batas_maksimal di tabel limit_honor
const DEFAULT_LIMIT_BULANAN = 3000000;

// Pemetaan Nama Bulan Indonesia ke Angka (sama seperti Monitoring Limit)
const BULAN_MAP: Record<string, string> = {
  '01': 'januari',
  '02': 'februari',
  '03': 'maret',
  '04': 'april',
  '05': 'mei',
  '06': 'juni',
  '07': 'juli',
  '08': 'agustus',
  '09': 'september',
  '10': 'oktober',
  '11': 'november',
  '12': 'desember',
};

const BULAN_OPTIONS = [
  'Semua Bulan',
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const BULAN_NUMBER: Record<string, string> = {
  Januari: '01',
  Februari: '02',
  Maret: '03',
  April: '04',
  Mei: '05',
  Juni: '06',
  Juli: '07',
  Agustus: '08',
  September: '09',
  Oktober: '10',
  November: '11',
  Desember: '12',
};

/* ============================================
   INTERFACE
============================================ */

interface KegiatanRow {
  id: number;
  nama_kegiatan: string;
  pagu_anggaran: number;
  bulan_kegiatan?: string;
}

interface RekapRow {
  id: number;
  nama_kegiatan: string;
  bulan_kegiatan?: string;
  paguAnggaran: number;
  terpakai: number;
  sisa: number;
  presentase: number;
  batasMaksimal: number;
  pakaiDefaultLimit: boolean;
}

/* ============================================
   HELPER: WARNA PROGRESS BAR BERDASARKAN PRESENTASE
============================================ */
function getPresentaseColor(presentase: number) {
  if (presentase >= 100) return { bar: 'bg-rose-500', text: 'text-rose-600' };
  if (presentase >= 80) return { bar: 'bg-amber-500', text: 'text-amber-600' };
  return { bar: 'bg-emerald-500', text: 'text-emerald-600' };
}

export default function RekapBulananPage() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [kegiatanList, setKegiatanList] = useState<KegiatanRow[]>([]);
  const [kegiatanOptions, setKegiatanOptions] = useState<KegiatanRow[]>([]);
  const [terpakaiMap, setTerpakaiMap] = useState<Record<number, number>>({});
  const [limitMap, setLimitMap] = useState<Record<number, number>>({});

  const [loading, setLoading] = useState<boolean>(true);

  // State Filter
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('Semua Status');
  const [kegiatanFilter, setKegiatanFilter] = useState<string>('Semua Kegiatan');
  const [bulanFilter, setBulanFilter] = useState<string>('Semua Bulan');

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(5);

  /* ============================================
     FORMAT RUPIAH
  ============================================ */
  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  /* ============================================
     LOGIKA PENCOCOKAN BULAN & TAHUN FLEKSIBEL
     (persis seperti Monitoring Limit)
  ============================================ */
  const isMatchingMonth = (rawDbValue: string | null | undefined, filterYYYYMM: string) => {
    if (!rawDbValue) return false;
    if (!filterYYYYMM) return true;

    const val = String(rawDbValue).trim().toLowerCase();
    const [year, monthNum] = filterYYYYMM.split('-');
    const monthName = BULAN_MAP[monthNum] || '';

    const hasMonth = val.includes(monthName);
    const hasYear = val.includes(year);

    if (hasMonth && hasYear) return true;
    if (val.includes(filterYYYYMM) || val.startsWith(filterYYYYMM)) return true;
    if (hasMonth && !val.match(/\d{4}/)) return true;

    return false;
  };

  /* ============================================
     FETCH OPSI KEGIATAN (untuk dropdown filter, tidak terpengaruh search)
  ============================================ */
  const fetchKegiatanOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('kegiatan')
        .select('id, nama_kegiatan, pagu_anggaran, bulan_kegiatan');

      if (!error && data) {
        setKegiatanOptions(data);
      }
    } catch (err) {
      console.error('Error fetching kegiatan options:', err);
    }
  };

  /* ============================================
     FETCH DATA REKAP (sekali saja, sisanya difilter client-side)
  ============================================ */
  const fetchRekap = useCallback(async () => {
    setLoading(true);
    try {
      const { data: dataKegiatan, error: errKegiatan } = await supabase
        .from('kegiatan')
        .select('id, nama_kegiatan, pagu_anggaran, bulan_kegiatan')
        .order('created_at', { ascending: false });

      if (errKegiatan) throw errKegiatan;

      const kegiatanRows: KegiatanRow[] = dataKegiatan || [];
      setKegiatanList(kegiatanRows);
      setCurrentPage(1);

      const kegiatanIds = kegiatanRows.map((k) => k.id);

      if (kegiatanIds.length > 0) {
        const { data: dataPenugasan, error: errPenugasan } = await supabase
          .from('penugasan')
          .select('kegiatan_id, total_honor')
          .in('kegiatan_id', kegiatanIds);

        if (errPenugasan) {
          console.error('Error fetch penugasan:', errPenugasan);
        } else {
          const map: Record<number, number> = {};
          (dataPenugasan || []).forEach((row: any) => {
            map[row.kegiatan_id] = (map[row.kegiatan_id] || 0) + (Number(row.total_honor) || 0);
          });
          setTerpakaiMap(map);
        }

        const { data: dataLimit, error: errLimit } = await supabase
          .from('limit_honor')
          .select('kegiatan_id, batas_maksimal')
          .in('kegiatan_id', kegiatanIds);

        if (errLimit) {
          console.error('Error fetch limit_honor:', errLimit);
        } else {
          const map: Record<number, number> = {};
          (dataLimit || []).forEach((row: any) => {
            map[row.kegiatan_id] = Number(row.batas_maksimal) || 0;
          });
          setLimitMap(map);
        }
      } else {
        setTerpakaiMap({});
        setLimitMap({});
      }
    } catch (err: any) {
      console.error('Error fetching rekap:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKegiatanOptions();
    fetchRekap();
  }, [fetchRekap]);

  /* ============================================
     GABUNGKAN JADI REKAP ROW
  ============================================ */
  const rekapList: RekapRow[] = useMemo(() => {
    return kegiatanList.map((k) => {
      const terpakai = terpakaiMap[k.id] || 0;
      const paguAnggaran = Number(k.pagu_anggaran) || 0;

      const batasDariDb = limitMap[k.id] || 0;
      const pakaiDefaultLimit = batasDariDb <= 0;
      const batasMaksimal = pakaiDefaultLimit
        ? DEFAULT_LIMIT_BULANAN
        : batasDariDb;

      // Persentase penggunaan anggaran berdasarkan PAGU
      // Maksimal 100%
      const presentase =
        paguAnggaran > 0
          ? Math.min(Math.round((terpakai / paguAnggaran) * 100), 100)
          : 0;

      return {
        id: k.id,
        nama_kegiatan: k.nama_kegiatan,
        bulan_kegiatan: k.bulan_kegiatan,
        paguAnggaran,
        terpakai,
        sisa: paguAnggaran - terpakai,
        presentase,
        batasMaksimal,
        pakaiDefaultLimit,
      };
    });
  }, [kegiatanList, terpakaiMap, limitMap]);

  /* ============================================
     FILTER: Search, Status, Kegiatan, Bulan
  ============================================ */
  const filteredRekap = useMemo(() => {
    return rekapList.filter((row) => {
      const keyword = searchKeyword.trim().toLowerCase();

      // SEARCH
      const matchSearch =
        !keyword ||
        row.nama_kegiatan.toLowerCase().includes(keyword);

      // BULAN
      let matchBulan = true;

      if (bulanFilter !== 'Semua Bulan') {
        const monthNumber = BULAN_NUMBER[bulanFilter];

        matchBulan = isMatchingMonth(
          row.bulan_kegiatan,
          `2026-${monthNumber}`
        );
      }

      // KEGIATAN
      const matchKegiatan =
        kegiatanFilter === 'Semua Kegiatan' ||
        row.nama_kegiatan === kegiatanFilter;

      // STATUS
      let matchStatus = true;

      if (statusFilter === 'Belum Terpakai') {
        matchStatus = row.presentase === 0;
      } else if (statusFilter === 'Aman') {
        matchStatus =
          row.presentase > 0 &&
          row.presentase < 80;
      } else if (statusFilter === 'Hampir Limit') {
        matchStatus =
          row.presentase >= 80 &&
          row.presentase < 100;
      } else if (statusFilter === 'Mencapai Limit') {
        matchStatus = row.presentase >= 100;
      }

      return (
        matchSearch &&
        matchBulan &&
        matchKegiatan &&
        matchStatus
      );
    });
  }, [
    rekapList,
    searchKeyword,
    bulanFilter,
    kegiatanFilter,
    statusFilter,
  ]);

  /* ============================================
     PAGINATION (berdasarkan hasil filter)
  ============================================ */
  const totalItems = filteredRekap.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  const currentData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredRekap.slice(start, start + itemsPerPage);
  }, [filteredRekap, currentPage, itemsPerPage]);

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  /* ============================================
     EXPORT EXCEL (mengikuti data hasil filter)
  ============================================ */
  const handleExportExcel = async () => {
    if (filteredRekap.length === 0) {
      alert('Tidak ada data untuk diekspor.');
      return;
    }

    try {
      const XLSX = await import('xlsx');

      const rows = filteredRekap.map((row, index) => ({
        No: index + 1,
        Kegiatan: row.nama_kegiatan,
        'Pagu Anggaran': row.paguAnggaran,
        Terpakai: row.terpakai,
        Sisa: row.sisa,
        'Batas Maksimal (Limit)': row.batasMaksimal,
        'Presentase (%)': row.presentase,
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 5 },
        { wch: 30 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 20 },
        { wch: 15 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap Bulanan');

      const tanggal = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `Laporan-Pegawai-Limit-${tanggal}.xlsx`);
    } catch (err) {
      console.error('Gagal export excel:', err);
      alert('Gagal mengekspor ke Excel. Pastikan package "xlsx" sudah terpasang (npm install xlsx).');
    }
  };

  /* ============================================
     CETAK PDF
  ============================================ */
  const handleCetakPDF = () => {
    if (filteredRekap.length === 0) {
      alert('Tidak ada data untuk dicetak.');
      return;
    }
    window.print();
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans">
      <div className="print:hidden">
        <Sidebar mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />
      </div>

      <div className="min-h-screen lg:pl-[230px] print:pl-0">
        <div className="print:hidden">
          <Header onMenuClick={() => setMobileSidebarOpen(true)} />
        </div>

        <main className="p-4 sm:p-6 lg:p-8 print:p-0">
          <div className="mx-auto max-w-[1400px]">
            {/* JUDUL HALAMAN */}
            <div className="mb-4 flex flex-wrap justify-between items-center gap-3 print:hidden">
              <div>
                <h1 className="text-base font-bold text-slate-800">Rekap Bulanan</h1>
                <p className="text-xs text-slate-500">
                  Rekap anggaran & pemakaian honor per kegiatan, per periode bulanan
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportExcel}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm transition"
                >
                  <span>📊</span> Export Excel
                </button>
                <button
                  onClick={handleCetakPDF}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-sm transition"
                >
                  <span>🖨️</span> Cetak PDF
                </button>
              </div>
            </div>

            <h1 className="hidden print:block text-lg font-bold text-slate-800 mb-4">Rekap Bulanan</h1>

            {/* ================================================= */}
            {/* FILTER */}
            {/* ================================================= */}

            <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 mb-4 flex flex-wrap gap-2.5 items-center justify-between print:hidden">

              <div className="flex flex-wrap items-center gap-2 w-full">

                {/* SEARCH */}

                <div className="relative min-w-[260px]">

                  <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400 text-xs">
                    🔍
                  </span>

                  <input
                    type="text"
                    placeholder="Cari Kegiatan..."
                    value={searchKeyword}
                    onChange={(e) => {
                      setSearchKeyword(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-blue-400"
                  />

                </div>

                {/* FILTER STATUS */}

                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="py-1.5 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400 cursor-pointer"
                >

                  <option value="Semua Status">
                    Semua Status
                  </option>

                  <option value="Belum Terpakai">
                    Belum Terpakai (0%)
                  </option>

                  <option value="Aman">
                    Aman (&lt;80%)
                  </option>

                  <option value="Hampir Limit">
                    Hampir Limit (&ge;80%)
                  </option>

                  <option value="Mencapai Limit">
                    Mencapai Limit (100%)
                  </option>

                </select>

                {/* FILTER KEGIATAN */}

                <select
                  value={kegiatanFilter}
                  onChange={(e) => {
                    setKegiatanFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="py-1.5 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400 cursor-pointer max-w-[240px]"
                >

                  <option value="Semua Kegiatan">
                    Semua Kegiatan
                  </option>

                  {kegiatanOptions.map((k) => (
                    <option
                      key={k.id}
                      value={k.nama_kegiatan}
                    >
                      {k.nama_kegiatan}
                    </option>
                  ))}

                </select>

                {/* FILTER BULAN */}

                <select
                  value={bulanFilter}
                  onChange={(e) => {
                    setBulanFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="py-1.5 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400 cursor-pointer"
                >

                  {BULAN_OPTIONS.map((bln) => (
                    <option
                      key={bln}
                      value={bln}
                    >
                      {bln}
                    </option>
                  ))}

                </select>

                {/* CARI */}

                <button
                  onClick={() => {
                    setCurrentPage(1);
                    fetchRekap();
                  }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition cursor-pointer"
                >
                  Cari
                </button>

                {/* RESET */}

                <button
                  onClick={() => {
                    setSearchKeyword('');
                    setStatusFilter('Semua Status');
                    setBulanFilter('Semua Bulan');
                    setKegiatanFilter('Semua Kegiatan');
                    setCurrentPage(1);
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded transition cursor-pointer"
                >
                  Reset
                </button>

                {/* JUMLAH BARIS */}

                <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-500">

                  <span>
                    Tampilkan:
                  </span>

                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(
                        Number(e.target.value)
                      );

                      setCurrentPage(1);
                    }}
                    className="py-1 px-2 border border-slate-200 rounded bg-white text-slate-700 outline-none focus:border-blue-400 cursor-pointer"
                  >

                    <option value={5}>
                      5
                    </option>

                    <option value={10}>
                      10
                    </option>

                    <option value={25}>
                      25
                    </option>

                    <option value={50}>
                      50
                    </option>

                  </select>

                  <span>
                    baris
                  </span>

                </div>

              </div>

            </div>


            {/* TABEL REKAP */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50/50 border-b border-slate-200 font-bold text-slate-700">
                    <tr>
                      <th className="py-3.5 px-6 text-center w-16">No</th>
                      <th className="py-3.5 px-6">Kegiatan</th>
                      <th className="py-3.5 px-6">Pagu Anggaran</th>
                      <th className="py-3.5 px-6">Terpakai</th>
                      <th className="py-3.5 px-6">Sisa</th>
                      <th className="py-3.5 px-6">Presentase</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          Memuat data rekap...
                        </td>
                      </tr>
                    ) : currentData.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          Tidak ada data kegiatan untuk ditampilkan.
                        </td>
                      </tr>
                    ) : (
                      currentData.map((row, index) => {
                        const colors = getPresentaseColor(row.presentase);
                        const barWidth = Math.min(row.presentase, 100);

                        return (
                          <tr key={row.id} className="hover:bg-slate-50/60 transition">
                            <td className="py-4 px-6 text-center font-medium text-slate-400">
                              {(currentPage - 1) * itemsPerPage + index + 1}
                            </td>
                            <td className="py-4 px-6 font-semibold text-blue-600">
                              <Link href={`/kegiatan/${row.id}`} className="hover:underline">
                                {row.nama_kegiatan}
                              </Link>
                            </td>
                            <td className="py-4 px-6 font-semibold text-slate-800">
                              {formatRupiah(row.paguAnggaran)}
                            </td>
                            <td className="py-4 px-6 text-slate-600 font-medium">
                              {formatRupiah(row.terpakai)}
                            </td>
                            <td className="py-4 px-6 text-slate-600 font-medium">
                              {formatRupiah(row.sisa)}
                            </td>
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-2">
                                <span className={`font-semibold ${colors.text}`}>{row.presentase}%</span>
                                <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden print:w-16">
                                  <div
                                    className={`h-full rounded-full ${colors.bar}`}
                                    style={{ width: `${barWidth}%` }}
                                  />
                                </div>
                                {row.pakaiDefaultLimit && (
                                  <span
                                    className="text-slate-300 text-[10px] cursor-help"
                                    title={`Belum ada limit khusus di Pengaturan Limit, memakai limit default ${formatRupiah(
                                      DEFAULT_LIMIT_BULANAN
                                    )}`}
                                  >
                                    ⓘ
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* PAGINATION FOOTER */}
              {totalItems > 0 && (
                <div className="px-6 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-white print:hidden">
                  <div className="text-xs text-slate-500">
                    Menampilkan <span className="font-semibold text-slate-700">{startItem}</span> -{' '}
                    <span className="font-semibold text-slate-700">{endItem}</span> dari{' '}
                    <span className="font-semibold text-slate-700">{totalItems}</span> data
                  </div>

                  <div className="flex items-center gap-1.5 text-xs">
                    <button
                      onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      ‹
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(
                        (page) => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1
                      )
                      .map((page, idx, array) => {
                        const prevPage = array[idx - 1];
                        const showEllipsis = prevPage && page - prevPage > 1;

                        return (
                          <React.Fragment key={page}>
                            {showEllipsis && <span className="px-1 text-slate-400">...</span>}
                            <button
                              onClick={() => setCurrentPage(page)}
                              className={`px-3 py-1 rounded font-medium transition ${
                                currentPage === page
                                  ? 'bg-blue-600 text-white border border-blue-600'
                                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {page}
                            </button>
                          </React.Fragment>
                        );
                      })}

                    <button
                      onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages || totalPages === 0}
                      className="px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      ›
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
