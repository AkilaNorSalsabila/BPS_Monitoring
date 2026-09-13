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
// PERBAIKAN UTAMA DIBANDING VERSI SEBELUMNYA
// =========================================================
// Versi lama mengambil honor dari `penugasan.total_honor`, lalu membaginya
// rata ke tiap bulan yang dicakup `kegiatan.bulan_kegiatan`. Kolom
// `total_honor` SUDAH TIDAK DIPAKAI LAGI di skema baru — honor sekarang
// murni berasal dari `pencairan_honor` (nominal_rencana / nominal_dicairkan)
// yang sudah punya `bulan_pencairan` spesifik per baris. Akibatnya laporan
// versi lama SELALU KOSONG (semua total_honor = null/0), bukan karena
// format teks periode.
//
// Versi ini mengambil datanya langsung dari `pencairan_honor`, persis
// seperti logika di halaman Pencairan: beban bulan = nominal_dicairkan
// kalau sudah direalisasikan, kalau belum pakai nominal_rencana (row yang
// sama TIDAK dihitung dua kali).
// =========================================================

const DEFAULT_WARN_PERCENT = 80;

const BULAN_OPTIONS = [
  'Semua Bulan',
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

// Laporan hanya menampilkan mitra yang SUDAH mencapai/melewati limit.
const STATUS_FILTER_OPTIONS = ['Semua', 'Mencapai Limit', 'Limit Terlampaui'];

// =========================================================
// INTERFACE
// =========================================================

interface LimitHonor {
  id: number;
  bulan_periode: string;
  batas_maksimal: number;
  persen_peringatan: number;
}

interface KegiatanOption {
  id: number;
  nama_kegiatan: string;
}

interface MitraRef {
  sobat_id: string;
  nama_mitra: string;
}

interface PencairanRaw {
  id: number;
  sobat_id: string;
  penugasan_id: number;
  bulan_pencairan: string;
  nominal_rencana: number | null;
  nominal_dicairkan: number | null;

  penugasan?: {
    kegiatan?: {
      id: number;
      nama_kegiatan: string;
    } | null;
  } | null;
}

type StatusLimit = 'Mencapai Limit' | 'Limit Terlampaui';

// Satu "kontribusi" = satu baris pencairan_honor yang ikut membebani limit
// mitra pada bulan tsb.
interface KontribusiKegiatan {
  pencairanId: number;
  kegiatanId: number | null;
  namaKegiatan: string;
  nominal: number;
  sumber: 'Realisasi' | 'Rencana';
}

interface LaporanRow {
  // Kunci unik baris = kombinasi mitra + bulan (bukan per kegiatan/per
  // pencairan), supaya mitra yang sama pada bulan yang sama hanya muncul
  // satu baris walau kontribusinya dari beberapa kegiatan/pencairan.
  id: string;
  sobatId: string;
  namaPegawai: string;
  nikNip: string;
  periode: string;

  kegiatanList: KontribusiKegiatan[];

  terpakai: number; // total beban gabungan bulan ini
  limit: number; // sisa limit (0 kalau sudah terlampaui)
  totalAllocated: number;
  maxLimit: number;

  presentase: number;
  status: StatusLimit;
}

// =========================================================
// HELPER
// =========================================================

const formatRupiah = (val: number) => `Rp${(val || 0).toLocaleString('id-ID')}`;

const BULAN_MAP: Record<string, string> = {
  januari: '01',
  februari: '02',
  maret: '03',
  april: '04',
  mei: '05',
  juni: '06',
  juli: '07',
  agustus: '08',
  september: '09',
  oktober: '10',
  november: '11',
  desember: '12',
};

// Normalisasi periode agar variasi seperti:
// "September 2026", " september 2026 ", "SEPTEMBER 2026"
// tetap dianggap sebagai bulan yang sama.
// Juga mendukung format "2026-09".
function normalizePeriodeBulan(value: string) {
  const raw = String(value || '').trim().toLowerCase().replace(/\\s+/g, ' ');

  const isoMatch = raw.match(/^(\\d{4})-(\\d{1,2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}`;
  }

  const parts = raw.split(' ');
  if (parts.length >= 2) {
    const month = BULAN_MAP[parts[0]];
    const year = parts.find((part) => /^\\d{4}$/.test(part));

    if (month && year) {
      return `${year}-${month}`;
    }
  }

  // Fallback: tetap konsisten untuk format yang tidak dikenali.
  return raw;
}

function displayPeriodeBulan(value: string) {
  const normalized = normalizePeriodeBulan(value);
  const match = normalized.match(/^(\\d{4})-(\\d{2})$/);

  if (!match) return String(value || '-');

  const monthName = Object.entries(BULAN_MAP).find(([, month]) => month === match[2])?.[0] || '';
  return `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${match[1]}`;
}

function statusBadge(status: StatusLimit) {
  if (status === 'Limit Terlampaui') {
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
        Limit Terlampaui
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
      Mencapai Limit
    </span>
  );
}

function presentaseColor(status: StatusLimit) {
  return status === 'Limit Terlampaui' ? 'text-rose-600' : 'text-amber-600';
}

// =========================================================
// PAGE
// =========================================================

export default function LaporanPegawaiLimitPage() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [rawData, setRawData] = useState<PencairanRaw[]>([]);
  const [mitraMap, setMitraMap] = useState<Record<string, string>>({});
  const [limitList, setLimitList] = useState<LimitHonor[]>([]);
  const [kegiatanOptions, setKegiatanOptions] = useState<KegiatanOption[]>([]);

  const [loading, setLoading] = useState(true);

  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('Semua');
  const [kegiatanFilter, setKegiatanFilter] = useState('Semua Kegiatan');
  const [bulanFilter, setBulanFilter] = useState('Semua Bulan');

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // =========================================================
  // MATCHING PERIODE — bulan_pencairan sudah berupa 1 bulan spesifik
  // (mis. "September 2026"), jadi cukup cocokkan langsung ke bulan_periode
  // di limit_honor. Tetap dibuat sedikit fleksibel untuk jaga-jaga variasi
  // spasi/kapitalisasi.
  // =========================================================

  const isMatchingMonth = useCallback((bulanPencairan: string, bulanPeriodeLimit: string) => {
    if (!bulanPencairan || !bulanPeriodeLimit) return false;
    return normalizePeriodeBulan(bulanPencairan) === normalizePeriodeBulan(bulanPeriodeLimit);
  }, []);

  // =========================================================
  // FETCH KEGIATAN (untuk dropdown filter)
  // =========================================================

  const fetchKegiatanOptions = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('kegiatan').select('id, nama_kegiatan').order('nama_kegiatan');
      if (error) {
        console.error('Error fetching kegiatan options:', error.message);
        return;
      }
      setKegiatanOptions(data || []);
    } catch (err) {
      console.error('Error fetching kegiatan options:', err);
    }
  }, []);

  // =========================================================
  // FETCH LIMIT HONOR
  // =========================================================

  const fetchLimitHonor = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('limit_honor')
        .select('id, bulan_periode, batas_maksimal, persen_peringatan');

      if (error) {
        console.error('Error fetching limit_honor:', error.message);
        return;
      }
      setLimitList(data || []);
    } catch (err) {
      console.error('Error fetching limit_honor:', err);
    }
  }, []);

  // =========================================================
  // FETCH PENCAIRAN HONOR (sumber data yang benar sekarang)
  // =========================================================

  const fetchLaporan = useCallback(async () => {
    setLoading(true);

    try {
      const { data: mitraData, error: errMitra } = await supabase
        .from('mitra')
        .select('sobat_id, nama_mitra');

      if (errMitra) throw errMitra;

      const map: Record<string, string> = {};
      (mitraData || []).forEach((m: MitraRef) => {
        map[m.sobat_id.trim()] = m.nama_mitra;
      });
      setMitraMap(map);

      const { data, error } = await supabase
        .from('pencairan_honor')
        .select(`
          id,
          sobat_id,
          penugasan_id,
          bulan_pencairan,
          nominal_rencana,
          nominal_dicairkan,
          penugasan:penugasan_id (
            kegiatan:kegiatan_id (
              id,
              nama_kegiatan
            )
          )
        `);

      if (error) throw error;

      setRawData((data as unknown as PencairanRaw[]) || []);
      setCurrentPage(1);
    } catch (err) {
      console.error('Error fetching laporan:', err);
      setRawData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKegiatanOptions();
    fetchLimitHonor();
    fetchLaporan();
  }, [fetchKegiatanOptions, fetchLimitHonor, fetchLaporan]);

  // =========================================================
  // GET LIMIT PERIODE
  // =========================================================

  const getLimitForPeriode = useCallback(
    (bulan: string) => {
      const info = limitList.find((row) => isMatchingMonth(bulan, row.bulan_periode));
      return {
        maxLimit: info ? Number(info.batas_maksimal) || 0 : 0,
        warnPercent: info ? Number(info.persen_peringatan) || DEFAULT_WARN_PERCENT : DEFAULT_WARN_PERCENT,
      };
    },
    [limitList, isMatchingMonth]
  );

  // =========================================================
  // SUSUN DATA LAPORAN — DIGABUNG PER MITRA + BULAN
  //
  // Beban tiap baris pencairan_honor = nominal_dicairkan kalau sudah
  // direalisasikan, kalau belum pakai nominal_rencana (row yang sama
  // TIDAK dihitung dua kali — sama persis seperti getMonthlyUsage di
  // halaman Pencairan).
  // =========================================================

  const laporanList: LaporanRow[] = useMemo(() => {
    const kontribusiMap: Record<string, KontribusiKegiatan[]> = {};
    const infoMap: Record<string, { sobatId: string; bulan: string }> = {};

    rawData.forEach((item) => {
      if (!item.sobat_id || !item.bulan_pencairan) return;

      const periodeNormalized = normalizePeriodeBulan(item.bulan_pencairan);
       const key = `${item.sobat_id.trim()}__${periodeNormalized}`;

      const sudahRealisasi = item.nominal_dicairkan !== null && item.nominal_dicairkan !== undefined;
      const nominal = sudahRealisasi ? Number(item.nominal_dicairkan) || 0 : Number(item.nominal_rencana) || 0;

      if (!kontribusiMap[key]) kontribusiMap[key] = [];
      kontribusiMap[key].push({
        pencairanId: item.id,
        kegiatanId: item.penugasan?.kegiatan?.id ?? null,
        namaKegiatan: item.penugasan?.kegiatan?.nama_kegiatan || '-',
        nominal,
        sumber: sudahRealisasi ? 'Realisasi' : 'Rencana',
      });

      if (!infoMap[key]) {
        infoMap[key] = { sobatId: item.sobat_id.trim(), bulan: periodeNormalized };
      }
    });

    const rows: LaporanRow[] = [];

    Object.keys(kontribusiMap).forEach((key) => {
      const info = infoMap[key];
      if (!info) return;

      const { maxLimit } = getLimitForPeriode(info.bulan);

      // Kalau limit bulan itu belum dikonfigurasi, jangan dianggap
      // mencapai limit (jangan pakai angka default).
      if (maxLimit <= 0) return;

      const kontribusi = kontribusiMap[key];
      const totalAllocated = kontribusi.reduce((sum, k) => sum + k.nominal, 0);
      const usageRatio = (totalAllocated / maxLimit) * 100;

      // Hanya mitra+bulan yang mencapai/melewati limit yang ditampilkan.
      if (usageRatio < 100) return;

      const sisaLimit = Math.max(maxLimit - totalAllocated, 0);
      const presentase = Math.round(usageRatio);
      const status: StatusLimit = usageRatio > 100 ? 'Limit Terlampaui' : 'Mencapai Limit';

      const kegiatanList = [...kontribusi].sort((a, b) => b.nominal - a.nominal);

      rows.push({
        id: key,
        sobatId: info.sobatId,
        namaPegawai: mitraMap[info.sobatId] || info.sobatId,
        nikNip: info.sobatId,
        periode: displayPeriodeBulan(info.bulan),
        kegiatanList,
        terpakai: totalAllocated,
        limit: sisaLimit,
        totalAllocated,
        maxLimit,
        presentase,
        status,
      });
    });

    rows.sort((a, b) => {
      const namaCompare = a.namaPegawai.localeCompare(b.namaPegawai);
      if (namaCompare !== 0) return namaCompare;
      return a.periode.localeCompare(b.periode);
    });

    return rows;
  }, [rawData, mitraMap, getLimitForPeriode]);

  // =========================================================
  // FILTER
  // =========================================================

  const filteredLaporan = useMemo(() => {
    return laporanList.filter((row) => {
      const keyword = searchKeyword.trim().toLowerCase();

      const matchSearch =
        !keyword ||
        row.namaPegawai.toLowerCase().includes(keyword) ||
        row.nikNip.toLowerCase().includes(keyword) ||
        row.sobatId.toLowerCase().includes(keyword) ||
        row.kegiatanList.some((k) => k.namaKegiatan.toLowerCase().includes(keyword));

      const matchBulan = bulanFilter === 'Semua Bulan' || row.periode.toLowerCase().startsWith(bulanFilter.toLowerCase());

      const matchKegiatan =
        kegiatanFilter === 'Semua Kegiatan' || row.kegiatanList.some((k) => k.namaKegiatan === kegiatanFilter);

      const matchStatus = statusFilter === 'Semua' || row.status === statusFilter;

      return matchSearch && matchBulan && matchKegiatan && matchStatus;
    });
  }, [laporanList, searchKeyword, bulanFilter, kegiatanFilter, statusFilter]);

  // =========================================================
  // PAGINATION
  // =========================================================

  const totalItems = filteredLaporan.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  const currentData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredLaporan.slice(start, start + itemsPerPage);
  }, [filteredLaporan, currentPage, itemsPerPage]);

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  // =========================================================
  // EXPORT EXCEL
  // =========================================================

  const handleExportExcel = async () => {
    if (filteredLaporan.length === 0) {
      alert('Tidak ada data mitra yang mencapai limit untuk diekspor.');
      return;
    }

    try {
      const XLSX = await import('xlsx');

      const rows = filteredLaporan.map((row, index) => ({
        No: index + 1,
        'Nama Mitra/Pegawai': row.namaPegawai,
        'SOBAT ID': row.nikNip,
        Kegiatan: row.kegiatanList.map((k) => k.namaKegiatan).join(', '),
        'Rincian Kontribusi': row.kegiatanList
          .map((k) => `${k.namaKegiatan} (${k.sumber}): ${formatRupiah(k.nominal)}`)
          .join('; '),
        Periode: row.periode,
        'Beban Bulan Ini (Gabungan)': row.terpakai,
        'Sisa Limit Periode': row.limit,
        'Batas Limit Periode': row.maxLimit,
        'Persentase (%)': row.presentase,
        Status: row.status,
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);

      worksheet['!cols'] = [
        { wch: 5 }, { wch: 28 }, { wch: 18 }, { wch: 32 }, { wch: 40 },
        { wch: 16 }, { wch: 22 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 18 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Laporan Mitra Limit');

      const tanggal = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `Laporan-Mitra-Limit-${tanggal}.xlsx`);
    } catch (err) {
      console.error('Gagal export excel:', err);
      alert('Gagal mengekspor ke Excel. Pastikan package "xlsx" sudah terpasang (npm install xlsx).');
    }
  };

  // =========================================================
  // CETAK PDF
  // =========================================================

  const handleCetakPDF = () => {
    if (filteredLaporan.length === 0) {
      alert('Tidak ada data mitra yang mencapai limit untuk dicetak.');
      return;
    }

    const doc = new jsPDF('landscape', 'mm', 'a4');

    doc.setFontSize(14);
    doc.text('BADAN PUSAT STATISTIK KOTA MOJOKERTO', 14, 15);

    doc.setFontSize(10);
    doc.text('Laporan Mitra Mencapai Limit', 14, 21);

    doc.setFontSize(8);
    doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`, 14, 26);

    const filters: string[] = [];
    if (kegiatanFilter !== 'Semua Kegiatan') filters.push(`Kegiatan ${kegiatanFilter}`);
    if (bulanFilter !== 'Semua Bulan') filters.push(`Bulan ${bulanFilter}`);
    if (statusFilter !== 'Semua') filters.push(`Status ${statusFilter}`);

    doc.text(
      `Filter: ${filters.length > 0 ? filters.join(', ') : 'Semua Mitra yang Mencapai Limit'}`,
      14,
      31
    );

    const tableBody = filteredLaporan.map((row, index) => [
      index + 1,
      row.namaPegawai,
      row.nikNip,
      row.kegiatanList.map((k) => k.namaKegiatan).join('\n'),
      row.periode,
      formatRupiah(row.terpakai),
      formatRupiah(row.limit),
      `${row.presentase}%`,
      row.status,
    ]);

    autoTable(doc, {
      startY: 36,
      head: [['No', 'Nama Mitra/Pegawai', 'SOBAT ID', 'Kegiatan', 'Periode', 'Beban Bulan Ini', 'Sisa Limit Periode', 'Persentase', 'Status']],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 40 },
        2: { cellWidth: 28 },
        3: { cellWidth: 55 },
        4: { cellWidth: 24 },
        5: { cellWidth: 34, halign: 'right' },
        6: { cellWidth: 34, halign: 'right' },
        7: { cellWidth: 22, halign: 'center' },
        8: { cellWidth: 30, halign: 'center' },
      },
    });

    doc.save(`Laporan-Mitra-Limit-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans">
      <Sidebar mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />

      <div className="min-h-screen lg:pl-[230px]">
        <Header onMenuClick={() => setMobileSidebarOpen(true)} />

        <main className="p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1400px]">
            <div className="mb-4 flex flex-wrap justify-between items-center gap-3">
              <div>
                <h1 className="text-base font-bold text-slate-800">Laporan Mitra Limit</h1>
                <p className="text-xs text-slate-500">
                  Menampilkan hanya mitra yang telah mencapai atau melewati limit honor periode — dihitung dari rencana &amp; realisasi pencairan, digabung satu baris per mitra per bulan
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

            <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 mb-4 flex flex-wrap gap-2.5 items-center justify-between">
              <div className="flex flex-wrap items-center gap-2 w-full">
                <div className="relative min-w-[260px]">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400 text-xs">🔍</span>
                  <input
                    type="text"
                    placeholder="Cari Mitra, SOBAT ID, Kegiatan"
                    value={searchKeyword}
                    onChange={(e) => {
                      setSearchKeyword(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-blue-400"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="py-1.5 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400 cursor-pointer"
                >
                  {STATUS_FILTER_OPTIONS.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>

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
                    <option key={k.id} value={k.nama_kegiatan}>{k.nama_kegiatan}</option>
                  ))}
                </select>

                <select
                  value={bulanFilter}
                  onChange={(e) => {
                    setBulanFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="py-1.5 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400 cursor-pointer"
                >
                  {BULAN_OPTIONS.map((bln) => (
                    <option key={bln} value={bln}>{bln}</option>
                  ))}
                </select>

                <button
                  onClick={() => {
                    setCurrentPage(1);
                    fetchLaporan();
                  }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition cursor-pointer"
                >
                  Cari
                </button>

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

            {!loading && totalItems > 0 && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-700">
                Menampilkan <strong>{totalItems}</strong> mitra (per periode bulan) yang sudah mencapai atau melewati limit — sudah digabung per mitra per bulan.
              </div>
            )}

            {!loading && totalItems === 0 && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-500">
                Tidak ada mitra yang mencapai/melewati limit saat ini. Kalau menurutmu seharusnya ada, cek: (1) sudah ada rencana/realisasi di halaman Pencairan untuk bulan tsb, (2) limit bulan itu sudah diatur di Pengaturan Limit.
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                    <tr>
                      <th className="py-3 px-4 text-center w-12">No</th>
                      <th className="py-3 px-4">Nama Mitra</th>
                      <th className="py-3 px-4">SOBAT ID</th>
                      <th className="py-3 px-4">Kegiatan</th>
                      <th className="py-3 px-4">Periode</th>
                      <th className="py-3 px-4 text-right">Beban Bulan Ini</th>
                      <th className="py-3 px-4 text-right">Sisa Limit Periode</th>
                      <th className="py-3 px-4 text-right">Persentase</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400">Memuat data laporan...</td>
                      </tr>
                    ) : currentData.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400">Tidak ada mitra yang mencapai limit sesuai filter.</td>
                      </tr>
                    ) : (
                      currentData.map((row, index) => (
                        <tr
                          key={row.id}
                          className={`hover:bg-slate-50/60 transition ${row.status === 'Limit Terlampaui' ? 'bg-rose-50/40' : 'bg-amber-50/20'}`}
                        >
                          <td className="py-3.5 px-4 text-center font-medium text-slate-400">
                            {(currentPage - 1) * itemsPerPage + index + 1}
                          </td>

                          <td className="py-3.5 px-4 font-semibold text-blue-600 align-top">{row.namaPegawai}</td>
                          <td className="py-3.5 px-4 text-blue-500 font-mono align-top">{row.nikNip}</td>

                          <td className="py-3.5 px-4 align-top">
                            <div className="space-y-1.5">
                              {row.kegiatanList.map((k, i) => (
                                <div key={`${k.pencairanId}-${i}`} className="text-[11.5px] leading-tight">
                                  {k.kegiatanId ? (
                                    <Link href={`/kegiatan/${k.kegiatanId}`} className="font-medium text-blue-500 hover:underline">
                                      {k.namaKegiatan}
                                    </Link>
                                  ) : (
                                    <span className="font-medium text-slate-700">{k.namaKegiatan}</span>
                                  )}
                                  <span className="text-slate-500"> — {formatRupiah(k.nominal)}</span>
                                  <span
                                    className={`ml-1.5 px-1 py-0.5 rounded text-[9px] font-semibold border ${
                                      k.sumber === 'Realisasi'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : 'bg-blue-50 text-blue-700 border-blue-200'
                                    }`}
                                  >
                                    {k.sumber}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-slate-600 align-top">{row.periode}</td>

                          <td className="py-3.5 px-4 text-right font-semibold text-blue-600 align-top">
                            {formatRupiah(row.terpakai)}
                            {row.kegiatanList.length > 1 && (
                              <div className="text-[10px] font-normal text-slate-400">
                                gabungan {row.kegiatanList.length} kontribusi
                              </div>
                            )}
                          </td>

                          <td className={`py-3.5 px-4 text-right font-semibold align-top ${row.limit <= 0 ? 'text-rose-600' : 'text-amber-600'}`}>
                            {formatRupiah(row.limit)}
                          </td>

                          <td className={`py-3.5 px-4 text-right font-semibold align-top ${presentaseColor(row.status)}`}>
                            {row.presentase}%
                          </td>

                          <td className="py-3.5 px-4 text-center align-top">{statusBadge(row.status)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

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
                      .filter((page) => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                      .map((page, idx, array) => {
                        const prevPage = array[idx - 1];
                        const showEllipsis = prevPage !== undefined && page - prevPage > 1;

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