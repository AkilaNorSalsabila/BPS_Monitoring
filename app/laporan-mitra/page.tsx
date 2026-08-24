'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';

// =========================================================
// SUPABASE
// =========================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// =========================================================
// CONSTANT (disamakan persis dengan halaman Penugasan)
// =========================================================

const DEFAULT_LIMIT = 3000000;
const DEFAULT_WARN_PERCENT = 80;

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

// Status limit yang ditampilkan di laporan ini (hanya yang "kena limit")
const STATUS_FILTER_OPTIONS = ['Semua', 'Mendekati Limit', 'Limit Terlampaui'];

// =========================================================
// INTERFACE
// =========================================================

interface LimitHonor {
  id: number;
  tahun_bulan: string;
  batas_maksimal: number;
  persen_peringatan: number;
}

interface KegiatanOption {
  id: number;
  nama_kegiatan: string;
}

interface PenugasanRaw {
  id: number;
  sobat_id: string;
  kegiatan_id: number;
  total_honor: number | null;

  mitra?: {
    sobat_id: string;
    nama_mitra: string;
  };

  kegiatan?: {
    id: number;
    nama_kegiatan: string;
    bulan_kegiatan: string;
  };
}

type StatusLimit = 'Tersedia' | 'Mendekati Limit' | 'Limit Terlampaui';

interface LaporanRow {
  id: number;
  sobatId: string;
  namaPegawai: string;
  nikNip: string;
  kegiatanId: number;
  namaKegiatan: string;
  periode: string;
  terpakai: number; // akumulasi honor pegawai di periode ini (semua kegiatan)
  limit: number; // limit pegawai untuk periode ini
  presentase: number;
  status: StatusLimit;
}

// =========================================================
// HELPER
// =========================================================

const formatRupiah = (val: number) => `Rp${(val || 0).toLocaleString('id-ID')}`;

function statusBadge(status: StatusLimit) {
  if (status === 'Limit Terlampaui') {
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
        Limit Terlampaui
      </span>
    );
  }
  if (status === 'Mendekati Limit') {
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        Mendekati Limit
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
      Tersedia
    </span>
  );
}

function presentaseColor(status: StatusLimit) {
  if (status === 'Limit Terlampaui') return 'text-rose-600';
  if (status === 'Mendekati Limit') return 'text-amber-600';
  return 'text-emerald-600';
}

// =========================================================
// PAGE
// =========================================================

export default function LaporanPegawaiLimitPage() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [rawData, setRawData] = useState<PenugasanRaw[]>([]);
  const [limitByPeriode, setLimitByPeriode] = useState<Record<string, LimitHonor>>({});
  const [kegiatanOptions, setKegiatanOptions] = useState<KegiatanOption[]>([]);

  const [loading, setLoading] = useState(true);

  // Filter
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('Semua');
  const [kegiatanFilter, setKegiatanFilter] = useState<string>('Semua Kegiatan');
  const [bulanFilter, setBulanFilter] = useState<string>('Semua Bulan');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);

  /* ============================================
     LOGIKA PENCOCOKAN BULAN & TAHUN FLEKSIBEL
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
     FETCH DATA PENDUKUNG (kegiatan & limit_honor)
  ============================================ */
  const fetchKegiatanOptions = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('kegiatan').select('id, nama_kegiatan');
      if (!error && data) setKegiatanOptions(data);
    } catch (err) {
      console.error('Error fetching kegiatan options:', err);
    }
  }, []);

  const fetchLimitHonor = useCallback(async () => {
    try {
      const { data: resLimit, error: errLimit } = await supabase
        .from('limit_honor')
        .select('id, tahun_bulan, batas_maksimal, persen_peringatan');

      if (!errLimit && resLimit) {
        const map: Record<string, LimitHonor> = {};
        resLimit.forEach((row: LimitHonor) => {
          map[row.tahun_bulan] = row;
        });
        setLimitByPeriode(map);
      }
    } catch (err) {
      console.error('Error fetching limit_honor:', err);
    }
  }, []);

  /* ============================================
     FETCH DATA PENUGASAN (dasar perhitungan laporan)
  ============================================ */
  const fetchLaporan = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('penugasan')
        .select(
          `
          id,
          sobat_id,
          kegiatan_id,
          total_honor,
          mitra:sobat_id (
            sobat_id,
            nama_mitra
          ),
          kegiatan:kegiatan_id (
            id,
            nama_kegiatan,
            bulan_kegiatan
          )
        `
        )
        .order('created_at', { ascending: false });

      if (error) throw error;

      setRawData((data as any) || []);
      setCurrentPage(1);
    } catch (err) {
      console.error('Error fetching laporan:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKegiatanOptions();
    fetchLimitHonor();
    fetchLaporan();
  }, [fetchKegiatanOptions, fetchLimitHonor, fetchLaporan]);

  /* ============================================
     GET LIMIT PERIODE (identik dengan Penugasan)
  ============================================ */
  const getLimitForPeriode = useCallback(
    (periode: string) => {
      const info = limitByPeriode[periode];
      return {
        maxLimit: info?.batas_maksimal ?? DEFAULT_LIMIT,
        warnPercent: info?.persen_peringatan ?? DEFAULT_WARN_PERCENT,
      };
    },
    [limitByPeriode]
  );

  /* ============================================
     AKUMULASI HONOR PEGAWAI PER PERIODE
     (identik dengan accumulatedHonorBySobatPeriode di Penugasan)
  ============================================ */
  const accumulatedHonorBySobatPeriode = useMemo(() => {
    const map: Record<string, number> = {};
    rawData.forEach((item) => {
      const periode = item.kegiatan?.bulan_kegiatan || '';
      const key = `${item.sobat_id}__${periode}`;
      map[key] = (map[key] || 0) + (Number(item.total_honor) || 0);
    });
    return map;
  }, [rawData]);

  /* ============================================
     SUSUN BARIS LAPORAN
     Terpakai & Limit = milik PEGAWAI di periode itu (akumulasi semua
     kegiatannya), bukan milik satu kegiatan saja.
  ============================================ */
  const laporanList: LaporanRow[] = useMemo(() => {
    return rawData.map((item) => {
      const periode = item.kegiatan?.bulan_kegiatan || '-';
      const { maxLimit, warnPercent } = getLimitForPeriode(periode);

      const terpakai = accumulatedHonorBySobatPeriode[`${item.sobat_id}__${periode}`] || 0;
      const usageRatio = maxLimit > 0 ? (terpakai / maxLimit) * 100 : 0;
      const presentase = Math.round(usageRatio);

      let status: StatusLimit = 'Tersedia';
      if (usageRatio >= 100) {
        status = 'Limit Terlampaui';
      } else if (usageRatio >= warnPercent) {
        status = 'Mendekati Limit';
      }

      return {
        id: item.id,
        sobatId: item.sobat_id,
        namaPegawai: item.mitra?.nama_mitra || '-',
        nikNip: item.mitra?.sobat_id || item.sobat_id,
        kegiatanId: item.kegiatan?.id || item.kegiatan_id,
        namaKegiatan: item.kegiatan?.nama_kegiatan || '-',
        periode,
        terpakai,
        limit: maxLimit,
        presentase,
        status,
      };
    });
  }, [rawData, accumulatedHonorBySobatPeriode, getLimitForPeriode]);

  /* ============================================
     FILTER
     - Dasar: hanya pegawai yang SUDAH kena limit (Mendekati/Melebihi),
       pegawai berstatus "Tersedia" tidak ditampilkan di laporan ini.
     - Search, Kegiatan, Bulan, Status: mempersempit dari dasar tsb.
  ============================================ */
  const filteredLaporan = useMemo(() => {
    return laporanList
      .filter((row) => row.status !== 'Tersedia')
      .filter((row) => {
        const keyword = searchKeyword.trim().toLowerCase();

        const matchSearch =
          !keyword ||
          row.namaPegawai.toLowerCase().includes(keyword) ||
          row.nikNip.toLowerCase().includes(keyword) ||
          row.namaKegiatan.toLowerCase().includes(keyword);

        let matchBulan = true;
        if (bulanFilter !== 'Semua Bulan') {
          const monthNumber = BULAN_NUMBER[bulanFilter];
          matchBulan = isMatchingMonth(row.periode, `2026-${monthNumber}`);
        }

        const matchKegiatan = kegiatanFilter === 'Semua Kegiatan' || row.namaKegiatan === kegiatanFilter;
        const matchStatus = statusFilter === 'Semua' || row.status === statusFilter;

        return matchSearch && matchBulan && matchKegiatan && matchStatus;
      });
  }, [laporanList, searchKeyword, bulanFilter, kegiatanFilter, statusFilter]);

  /* ============================================
     PAGINATION
  ============================================ */
  const totalItems = filteredLaporan.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  const currentData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredLaporan.slice(start, start + itemsPerPage);
  }, [filteredLaporan, currentPage, itemsPerPage]);

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  /* ============================================
     EXPORT EXCEL
  ============================================ */
  const handleExportExcel = async () => {
    if (filteredLaporan.length === 0) {
      alert('Tidak ada data untuk diekspor.');
      return;
    }

    try {
      const XLSX = await import('xlsx');

      const rows = filteredLaporan.map((row, index) => ({
        No: index + 1,
        'Nama Pegawai': row.namaPegawai,
        'NIK/NIP': row.nikNip,
        Kegiatan: row.namaKegiatan,
        Periode: row.periode,
        'Terpakai (Pegawai)': row.terpakai,
        'Limit (Pegawai)': row.limit,
        'Presentase (%)': row.presentase,
        Status: row.status,
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 5 },
        { wch: 25 },
        { wch: 15 },
        { wch: 30 },
        { wch: 16 },
        { wch: 18 },
        { wch: 18 },
        { wch: 12 },
        { wch: 16 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Laporan Pegawai Limit');

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
    if (filteredLaporan.length === 0) {
      alert('Tidak ada data untuk dicetak.');
      return;
    }

    const doc = new jsPDF('landscape', 'mm', 'a4');

    doc.setFontSize(14);
    doc.text('BADAN PUSAT STATISTIK KOTA MOJOKERTO', 14, 15);

    doc.setFontSize(10);
    doc.text('Laporan Pegawai Limit', 14, 21);

    doc.setFontSize(8);
    doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`, 14, 26);

    const filters: string[] = [];
    if (kegiatanFilter !== 'Semua Kegiatan') filters.push(`Kegiatan ${kegiatanFilter}`);
    if (bulanFilter !== 'Semua Bulan') filters.push(`Bulan ${bulanFilter}`);
    if (statusFilter !== 'Semua') filters.push(`Status ${statusFilter}`);
    doc.text(`Filter: ${filters.length > 0 ? filters.join(', ') : 'Semua Pegawai Terkena Limit'}`, 14, 31);

    const tableBody = filteredLaporan.map((row, index) => [
      index + 1,
      row.namaPegawai,
      row.nikNip,
      row.namaKegiatan,
      formatRupiah(row.terpakai),
      formatRupiah(row.limit),
      `${row.presentase}%`,
      row.status,
    ]);

    autoTable(doc, {
      startY: 36,
      head: [['No', 'Nama Pegawai', 'NIK/NIP', 'Kegiatan', 'Terpakai', 'Limit', 'Presentase', 'Status']],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 45 },
        2: { cellWidth: 30 },
        3: { cellWidth: 60 },
        4: { cellWidth: 35, halign: 'right' },
        5: { cellWidth: 35, halign: 'right' },
        6: { cellWidth: 25, halign: 'center' },
        7: { cellWidth: 25, halign: 'center' },
      },
    });

    doc.save(`Laporan-Pegawai-Limit-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  /* ============================================
     RENDER
  ============================================ */
  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans">
      <Sidebar mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />

      <div className="min-h-screen lg:pl-[230px]">
        <Header onMenuClick={() => setMobileSidebarOpen(true)} />

        <main className="p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1400px]">
            {/* JUDUL HALAMAN */}
            <div className="mb-4 flex flex-wrap justify-between items-center gap-3">
              <div>
                <h1 className="text-base font-bold text-slate-800">Laporan Pegawai Limit</h1>
                <p className="text-xs text-slate-500">
                  Daftar pegawai/mitra yang sudah mendekati atau melebihi limit honor periode berjalan
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

            {/* FILTER (disamakan persis dengan halaman Penugasan) */}
            <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 mb-4 flex flex-wrap gap-2.5 items-center justify-between">
              <div className="flex flex-wrap items-center gap-2 w-full">
                {/* SEARCH */}
                <div className="relative min-w-[260px]">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400 text-xs">
                    🔍
                  </span>
                  <input
                    type="text"
                    placeholder="Cari Pegawai, NIK/NIP, Kegiatan"
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
                  {STATUS_FILTER_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
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
                  <option value="Semua Kegiatan">Semua Kegiatan</option>
                  {kegiatanOptions.map((k) => (
                    <option key={k.id} value={k.nama_kegiatan}>
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
                    <option key={bln} value={bln}>
                      {bln}
                    </option>
                  ))}
                </select>

                {/* CARI */}
                <button
                  onClick={() => {
                    setCurrentPage(1);
                    fetchLaporan();
                  }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition cursor-pointer"
                >
                  Cari
                </button>

                {/* RESET */}
                <button
                  onClick={() => {
                    setSearchKeyword('');
                    setStatusFilter('Semua');
                    setKegiatanFilter('Semua Kegiatan');
                    setBulanFilter('Semua Bulan');
                    setCurrentPage(1);
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded transition cursor-pointer"
                >
                  Reset
                </button>

                {/* JUMLAH BARIS */}
                <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-500">
                  <span>Tampilkan:</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="py-1 px-2 border border-slate-200 rounded bg-white text-slate-700 outline-none focus:border-blue-400 cursor-pointer"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                  <span>baris</span>
                </div>
              </div>
            </div>

            {/* TABEL */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                    <tr>
                      <th className="py-3 px-4 text-center w-12">No</th>
                      <th className="py-3 px-4">Nama Pegawai</th>
                      <th className="py-3 px-4">NIK/NIP</th>
                      <th className="py-3 px-4">Kegiatan</th>
                      <th className="py-3 px-4">Terpakai</th>
                      <th className="py-3 px-4">Limit</th>
                      <th className="py-3 px-4">Presentase</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400">
                          Memuat data laporan...
                        </td>
                      </tr>
                    ) : currentData.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400">
                          Tidak ada pegawai yang mendekati/melebihi limit sesuai filter ini.
                        </td>
                      </tr>
                    ) : (
                      currentData.map((row, index) => (
                        <tr
                          key={row.id}
                          className={`hover:bg-slate-50/60 transition ${
                            row.status === 'Limit Terlampaui' ? 'bg-rose-50/40' : ''
                          }`}
                        >
                          <td className="py-3.5 px-4 text-center font-medium text-slate-400">
                            {(currentPage - 1) * itemsPerPage + index + 1}
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-blue-600">{row.namaPegawai}</td>
                          <td className="py-3.5 px-4 text-blue-500">{row.nikNip}</td>
                          <td className="py-3.5 px-4 text-blue-500">
                            <Link href={`/kegiatan/${row.kegiatanId}`} className="hover:underline">
                              {row.namaKegiatan}
                            </Link>
                          </td>
                          <td className="py-3.5 px-4 font-medium text-slate-700">
                            {formatRupiah(row.terpakai)}
                          </td>
                          <td className="py-3.5 px-4 font-medium text-slate-700">
                            {formatRupiah(row.limit)}
                          </td>
                          <td className={`py-3.5 px-4 font-semibold ${presentaseColor(row.status)}`}>
                            {row.presentase}%
                          </td>
                          <td className="py-3.5 px-4">{statusBadge(row.status)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* PAGINATION */}
              {totalItems > 0 && (
                <div className="px-6 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-white">
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
