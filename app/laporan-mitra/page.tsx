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
// CONSTANT
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

// Laporan hanya menampilkan mitra/pegawai yang SUDAH mencapai limit.
// "Mencapai limit" = total hak honor alokasi >= batas maksimal periode.
const STATUS_FILTER_OPTIONS = ['Semua', 'Mencapai Limit', 'Limit Terlampaui'];

const NAMA_BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

// =========================================================
// PARSER PERIODE KEGIATAN MULTI-BULAN
// =========================================================
// kegiatan.bulan_kegiatan bisa berisi macam-macam format penulisan rentang,
// mis. "Agustus 2026 - Oktober 2026", "Agustus 2026 s.d. Oktober 2026 (3
// Bulan)", "Agustus 2026 sampai dengan Oktober 2026", dst — kata
// penghubungnya bisa apa saja. Daripada menebak-nebak semua variasi kalimat,
// parser ini cukup MENCARI SEMUA pasangan "NamaBulan Tahun" di dalam teks,
// lalu memakai yang pertama & terakhir sebagai awal-akhir rentang. Ini jauh
// lebih tahan-banting terhadap variasi format penulisan.

interface PeriodeKegiatan {
  months: string[];
  jumlahBulan: number;
  label: string;
}

const monthIndexFromName = (name: string): number =>
  NAMA_BULAN_ID.findIndex((m) => m.toLowerCase() === name.trim().toLowerCase());

const generateMonthSequence = (startMonthIdx: number, startYear: number, count: number): string[] => {
  const result: string[] = [];
  let idx = startMonthIdx;
  let year = startYear;
  for (let i = 0; i < count; i++) {
    result.push(`${NAMA_BULAN_ID[idx]} ${year}`);
    idx++;
    if (idx > 11) {
      idx = 0;
      year++;
    }
  }
  return result;
};

const MONTH_YEAR_REGEX = /([A-Za-zÀ-ÿ]+)\s+(\d{4})/g;

const parseBulanKegiatan = (raw: string | null | undefined): PeriodeKegiatan => {
  const text = (raw || '').trim();
  if (!text) return { months: [], jumlahBulan: 0, label: '-' };

  const matches = [...text.matchAll(MONTH_YEAR_REGEX)]
    .map((m) => ({ idx: monthIndexFromName(m[1]), year: parseInt(m[2], 10) }))
    .filter((m) => m.idx !== -1);

  // Ada 2+ pasangan bulan-tahun (mis. "Agustus 2026 ... Oktober 2026")
  // -> anggap sebagai rentang dari yang pertama sampai yang terakhir.
  if (matches.length >= 2) {
    const start = matches[0];
    const end = matches[matches.length - 1];
    const totalBulan = (end.year - start.year) * 12 + (end.idx - start.idx) + 1;
    if (totalBulan > 0 && totalBulan <= 36) {
      return {
        months: generateMonthSequence(start.idx, start.year, totalBulan),
        jumlahBulan: totalBulan,
        label: text,
      };
    }
  }

  // Cuma 1 pasangan bulan-tahun -> cek ada keterangan "(N Bulan)" di teks,
  // mis. "Agustus 2026 (1 Bulan)" atau "Agustus 2026 (3 Bulan)".
  if (matches.length === 1) {
    const bulanCountMatch = text.match(/\(?\s*(\d+)\s*bulan\s*\)?/i);
    const jumlah = bulanCountMatch ? Math.max(parseInt(bulanCountMatch[1], 10) || 1, 1) : 1;
    return {
      months: generateMonthSequence(matches[0].idx, matches[0].year, jumlah),
      jumlahBulan: jumlah,
      label: text,
    };
  }

  // Tidak ada pola "NamaBulan Tahun" yang bisa diurai sama sekali.
  return { months: [text], jumlahBulan: 1, label: text };
};

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

type StatusLimit = 'Mencapai Limit' | 'Limit Terlampaui';

// Satu "kontribusi" = sumbangan honor dari SATU kegiatan ke SATU baris
// laporan (mitra + bulan) gabungan. Satu baris laporan bisa berisi lebih
// dari satu kontribusi kalau mitra ybs mengikuti beberapa kegiatan yang
// sama-sama menyentuh bulan tsb.
interface KontribusiKegiatan {
  kegiatanId: number;
  namaKegiatan: string;
  honorBulanIni: number;
  totalHonorKegiatan: number;
  jumlahBulanKegiatan: number;
  periodeAsliKegiatan: string;
}

interface LaporanRow {
  // Kunci unik baris = kombinasi mitra + bulan (BUKAN per kegiatan lagi),
  // supaya mitra yang sama pada bulan yang sama HANYA muncul satu baris,
  // walau ia mengikuti banyak kegiatan berbeda pada bulan itu. Mitra yang
  // sama pada BULAN BERBEDA tetap jadi baris terpisah, karena limit memang
  // dihitung per bulan — tidak boleh ikut tergabung lintas periode.
  id: string;
  sobatId: string;
  namaPegawai: string;
  nikNip: string;

  // Bulan spesifik yang terkena limit (mis. "September 2026").
  periode: string;

  // Daftar kegiatan yang menyusun total honor baris ini pada bulan tsb.
  kegiatanList: KontribusiKegiatan[];

  // Total GABUNGAN hak honor alokasi dari SEMUA kegiatan pada bulan ini
  // (sama persis dengan totalAllocated di bawah — dipisah supaya jelas
  // makna "yang ditampilkan sebagai honor terpakai").
  terpakai: number;

  // Sisa limit periode (bulan tsb).
  limit: number;

  // Total hak honor alokasi seluruh penugasan mitra pada bulan tsb.
  totalAllocated: number;

  // Batas maksimal limit bulan tsb.
  maxLimit: number;

  presentase: number;
  status: StatusLimit;
}

// =========================================================
// HELPER
// =========================================================

const formatRupiah = (val: number) =>
  `Rp${(val || 0).toLocaleString('id-ID')}`;

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
  return status === 'Limit Terlampaui'
    ? 'text-rose-600'
    : 'text-amber-600';
}

// =========================================================
// PAGE
// =========================================================

export default function LaporanPegawaiLimitPage() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [rawData, setRawData] = useState<PenugasanRaw[]>([]);
  // Disimpan sebagai array (bukan Record dengan exact-key) supaya bisa
  // dicocokkan secara fleksibel via isMatchingMonth — sama seperti Penugasan.
  const [limitList, setLimitList] = useState<LimitHonor[]>([]);
  const [kegiatanOptions, setKegiatanOptions] = useState<KegiatanOption[]>([]);

  const [loading, setLoading] = useState(true);

  // Filter
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('Semua');
  const [kegiatanFilter, setKegiatanFilter] = useState('Semua Kegiatan');
  const [bulanFilter, setBulanFilter] = useState('Semua Bulan');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // =========================================================
  // MATCHING PERIODE
  // =========================================================

  const isMatchingMonth = useCallback(
    (rawDbValue: string | null | undefined, filterYYYYMM: string) => {
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
    },
    []
  );

  // =========================================================
  // FETCH KEGIATAN
  // =========================================================

  const fetchKegiatanOptions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('kegiatan')
        .select('id, nama_kegiatan')
        .order('nama_kegiatan');

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
  //
  // PENTING:
  // Halaman Penugasan menggunakan kolom `bulan_periode`,
  // bukan `tahun_bulan`.
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
  // FETCH PENUGASAN
  // =========================================================

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
          created_at,
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

      setRawData((data as unknown as PenugasanRaw[]) || []);
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
  // Sama dengan halaman Penugasan
  // =========================================================

  const getLimitForPeriode = useCallback(
    (bulan: string) => {
      const info = limitList.find((row) => isMatchingMonth(bulan, row.bulan_periode));

      return {
        maxLimit: info?.batas_maksimal ?? DEFAULT_LIMIT,
        warnPercent: info?.persen_peringatan ?? DEFAULT_WARN_PERCENT,
      };
    },
    [limitList, isMatchingMonth]
  );

  // =========================================================
  // AKUMULASI HAK HONOR ALOKASI PER MITRA + PERIODE
  //
  // Ini mengikuti:
  // accumulatedHonorBySobatPeriode pada halaman Penugasan.
  //
  // Jadi:
  // totalAllocated = SUM(penugasan.total_honor / jumlah bulan kegiatan)
  // untuk SOBAT yang sama pada BULAN yang sama, dijumlah dari SEMUA
  // kegiatan yang menyentuh bulan tsb.
  // =========================================================

  // Honor tiap kegiatan dibagi RATA ke setiap bulan yang dicakupnya.
  // Kegiatan 3 bulan dengan hak honor 900.000 -> 300.000 disumbangkan ke
  // akumulasi limit tiap-tiap dari 3 bulan tsb, BUKAN 900.000 penuh di 1 bulan.
  const accumulatedHonorBySobatBulan = useMemo(() => {
    const map: Record<string, number> = {};

    rawData.forEach((item) => {
      if (!item.sobat_id) return;
      const { months, jumlahBulan } = parseBulanKegiatan(item.kegiatan?.bulan_kegiatan);
      if (months.length === 0) return;

      const honorPerBulan = (Number(item.total_honor) || 0) / jumlahBulan;
      months.forEach((bulan) => {
        const key = `${item.sobat_id}__${bulan}`;
        map[key] = (map[key] || 0) + honorPerBulan;
      });
    });

    return map;
  }, [rawData]);

  // =========================================================
  // SUSUN DATA LAPORAN — DIGABUNG PER MITRA + BULAN
  //
  // Sebelumnya: satu baris per (kegiatan, bulan) — jadi mitra yang
  // mengikuti 2 kegiatan pada bulan yang sama muncul sebagai 2 baris
  // terpisah, padahal limitnya memang dihitung gabungan.
  //
  // Sekarang:
  // 1. Semua kontribusi kegiatan dikelompokkan dulu per (sobat_id, bulan).
  // 2. Limit dicek SEKALI per kelompok itu, memakai total gabungan
  //    (accumulatedHonorBySobatBulan — sudah menjumlah semua kegiatan).
  // 3. Kalau kelompok itu mencapai/melewati limit, HANYA SATU baris yang
  //    dibuat, berisi daftar kegiatan penyusunnya (kegiatanList) supaya
  //    rinciannya tetap terlihat.
  // 4. Mitra yang sama di BULAN BERBEDA tetap jadi kelompok (baris)
  //    terpisah, karena key kelompoknya adalah sobat_id + bulan.
  // =========================================================

  const laporanList: LaporanRow[] = useMemo(() => {
    const kontribusiMap: Record<string, KontribusiKegiatan[]> = {};
    const infoMitraMap: Record<
      string,
      { sobatId: string; namaPegawai: string; nikNip: string; bulan: string }
    > = {};

    rawData.forEach((item) => {
      if (!item.sobat_id) return;

      const periodeInfo = parseBulanKegiatan(item.kegiatan?.bulan_kegiatan);
      if (periodeInfo.months.length === 0) return;

      const jumlahBulan = periodeInfo.jumlahBulan || 1;
      const totalHonorKegiatan = Number(item.total_honor) || 0;
      const honorBulanIni = totalHonorKegiatan / jumlahBulan;

      periodeInfo.months.forEach((bulan) => {
        const key = `${item.sobat_id}__${bulan}`;

        if (!kontribusiMap[key]) kontribusiMap[key] = [];
        kontribusiMap[key].push({
          kegiatanId: item.kegiatan?.id || item.kegiatan_id,
          namaKegiatan: item.kegiatan?.nama_kegiatan || '-',
          honorBulanIni,
          totalHonorKegiatan,
          jumlahBulanKegiatan: jumlahBulan,
          periodeAsliKegiatan: periodeInfo.label,
        });

        if (!infoMitraMap[key]) {
          infoMitraMap[key] = {
            sobatId: item.sobat_id,
            namaPegawai: item.mitra?.nama_mitra || '-',
            nikNip: item.mitra?.sobat_id || item.sobat_id,
            bulan,
          };
        }
      });
    });

    const rows: LaporanRow[] = [];

    Object.keys(kontribusiMap).forEach((key) => {
      const info = infoMitraMap[key];
      if (!info) return;

      const { maxLimit } = getLimitForPeriode(info.bulan);
      const totalAllocated = accumulatedHonorBySobatBulan[key] || 0;
      const usageRatio = maxLimit > 0 ? (totalAllocated / maxLimit) * 100 : 0;

      // HANYA kelompok (mitra + bulan) yang mencapai / melewati limit.
      if (usageRatio < 100) return;

      const sisaLimit = Math.max(maxLimit - totalAllocated, 0);
      const presentase = Math.min(Math.round(usageRatio), 100);
      const status: StatusLimit = usageRatio > 100 ? 'Limit Terlampaui' : 'Mencapai Limit';

      // Urutkan kegiatan penyusun dari honor terbesar supaya yang paling
      // signifikan tampil paling atas di tiap baris.
      const kegiatanList = [...kontribusiMap[key]].sort(
        (a, b) => b.honorBulanIni - a.honorBulanIni
      );

      rows.push({
        id: key,
        sobatId: info.sobatId,
        namaPegawai: info.namaPegawai,
        nikNip: info.nikNip,
        periode: info.bulan,
        kegiatanList,
        terpakai: totalAllocated,
        limit: sisaLimit,
        totalAllocated,
        maxLimit,
        presentase,
        status,
      });
    });

    // Urutan tampilan: nama mitra A-Z, lalu berdasarkan urutan bulan.
    rows.sort((a, b) => {
      const namaCompare = a.namaPegawai.localeCompare(b.namaPegawai);
      if (namaCompare !== 0) return namaCompare;
      return a.periode.localeCompare(b.periode);
    });

    return rows;
  }, [rawData, accumulatedHonorBySobatBulan, getLimitForPeriode]);

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

      let matchBulan = true;

      if (bulanFilter !== 'Semua Bulan') {
        // row.periode sudah berupa bulan spesifik (mis. "September 2026"),
        // jadi cukup dicocokkan langsung ke nama bulan yang dipilih.
        matchBulan = row.periode.toLowerCase().startsWith(bulanFilter.toLowerCase());
      }

      const matchKegiatan =
        kegiatanFilter === 'Semua Kegiatan' ||
        row.kegiatanList.some((k) => k.namaKegiatan === kegiatanFilter);

      const matchStatus =
        statusFilter === 'Semua' ||
        row.status === statusFilter;

      return (
        matchSearch &&
        matchBulan &&
        matchKegiatan &&
        matchStatus
      );
    });
  }, [
    laporanList,
    searchKeyword,
    bulanFilter,
    kegiatanFilter,
    statusFilter,
  ]);

  // =========================================================
  // PAGINATION
  // =========================================================

  const totalItems = filteredLaporan.length;

  const totalPages =
    Math.ceil(totalItems / itemsPerPage) || 1;

  const currentData = useMemo(() => {
    const start =
      (currentPage - 1) * itemsPerPage;

    return filteredLaporan.slice(
      start,
      start + itemsPerPage
    );
  }, [
    filteredLaporan,
    currentPage,
    itemsPerPage,
  ]);

  const startItem =
    totalItems === 0
      ? 0
      : (currentPage - 1) * itemsPerPage + 1;

  const endItem = Math.min(
    currentPage * itemsPerPage,
    totalItems
  );

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

      const rows = filteredLaporan.map(
        (row, index) => ({
          No: index + 1,
          'Nama Mitra/Pegawai':
            row.namaPegawai,
          'SOBAT ID / NIK/NIP':
            row.nikNip,
          Kegiatan: row.kegiatanList
            .map((k) => k.namaKegiatan)
            .join(', '),
          'Rincian Honor per Kegiatan': row.kegiatanList
            .map((k) => `${k.namaKegiatan}: ${formatRupiah(k.honorBulanIni)}`)
            .join('; '),
          Periode: row.periode,

          // Sesuai permintaan:
          'Hak Honor Alokasi (Gabungan)':
            row.terpakai,

          // Sesuai permintaan:
          'Sisa Limit Periode':
            row.limit,

          'Batas Limit Periode':
            row.maxLimit,

          'Persentase (%)':
            row.presentase,

          Status: row.status,
        })
      );

      const worksheet =
        XLSX.utils.json_to_sheet(rows);

      worksheet['!cols'] = [
        { wch: 5 },
        { wch: 28 },
        { wch: 20 },
        { wch: 32 },
        { wch: 40 },
        { wch: 16 },
        { wch: 22 },
        { wch: 20 },
        { wch: 22 },
        { wch: 15 },
        { wch: 20 },
      ];

      const workbook =
        XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        'Laporan Mitra Limit'
      );

      const tanggal =
        new Date()
          .toISOString()
          .slice(0, 10);

      XLSX.writeFile(
        workbook,
        `Laporan-Mitra-Limit-${tanggal}.xlsx`
      );
    } catch (err) {
      console.error(
        'Gagal export excel:',
        err
      );

      alert(
        'Gagal mengekspor ke Excel. Pastikan package "xlsx" sudah terpasang (npm install xlsx).'
      );
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

    const doc = new jsPDF(
      'landscape',
      'mm',
      'a4'
    );

    doc.setFontSize(14);
    doc.text(
      'BADAN PUSAT STATISTIK KOTA MOJOKERTO',
      14,
      15
    );

    doc.setFontSize(10);
    doc.text(
      'Laporan Mitra/Pegawai Mencapai Limit',
      14,
      21
    );

    doc.setFontSize(8);
    doc.text(
      `Tanggal Cetak: ${new Date().toLocaleDateString(
        'id-ID'
      )}`,
      14,
      26
    );

    const filters: string[] = [];

    if (
      kegiatanFilter !== 'Semua Kegiatan'
    ) {
      filters.push(
        `Kegiatan ${kegiatanFilter}`
      );
    }

    if (bulanFilter !== 'Semua Bulan') {
      filters.push(
        `Bulan ${bulanFilter}`
      );
    }

    if (statusFilter !== 'Semua') {
      filters.push(
        `Status ${statusFilter}`
      );
    }

    doc.text(
      `Filter: ${
        filters.length > 0
          ? filters.join(', ')
          : 'Semua Mitra yang Mencapai Limit'
      }`,
      14,
      31
    );

    const tableBody =
      filteredLaporan.map(
        (row, index) => [
          index + 1,
          row.namaPegawai,
          row.nikNip,
          // Multi-kegiatan ditulis satu per baris dalam sel yang sama
          // (jsPDF autotable otomatis melebarkan tinggi baris untuk '\n').
          row.kegiatanList.map((k) => k.namaKegiatan).join('\n'),
          row.periode,

          // Hak Honor Alokasi (gabungan semua kegiatan pada bulan ini)
          formatRupiah(row.terpakai),

          // Sisa Limit Periode
          formatRupiah(row.limit),

          `${row.presentase}%`,
          row.status,
        ]
      );

    autoTable(doc, {
      startY: 36,

      head: [
        [
          'No',
          'Nama Mitra/Pegawai',
          'SOBAT ID / NIK/NIP',
          'Kegiatan',
          'Periode',
          'Hak Honor Alokasi',
          'Sisa Limit Periode',
          'Persentase',
          'Status',
        ],
      ],

      body: tableBody,

      theme: 'grid',

      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
      },

      bodyStyles: {
        fontSize: 8,
      },

      columnStyles: {
        0: {
          cellWidth: 10,
          halign: 'center',
        },
        1: {
          cellWidth: 40,
        },
        2: {
          cellWidth: 30,
        },
        3: {
          cellWidth: 55,
        },
        4: {
          cellWidth: 22,
        },
        5: {
          cellWidth: 35,
          halign: 'right',
        },
        6: {
          cellWidth: 35,
          halign: 'right',
        },
        7: {
          cellWidth: 22,
          halign: 'center',
        },
        8: {
          cellWidth: 30,
          halign: 'center',
        },
      },
    });

    doc.save(
      `Laporan-Mitra-Limit-${new Date()
        .toISOString()
        .slice(0, 10)}.pdf`
    );
  };

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans">
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onClose={() =>
          setMobileSidebarOpen(false)
        }
      />

      <div className="min-h-screen lg:pl-[230px]">
        <Header
          onMenuClick={() =>
            setMobileSidebarOpen(true)
          }
        />

        <main className="p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1400px]">

            {/* JUDUL */}
            <div className="mb-4 flex flex-wrap justify-between items-center gap-3">
              <div>
                <h1 className="text-base font-bold text-slate-800">
                  Laporan Mitra/Pegawai Limit
                </h1>

                <p className="text-xs text-slate-500">
                  Menampilkan hanya mitra/pegawai yang telah mencapai atau melewati limit honor periode — digabung satu baris per mitra per bulan
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={
                    handleExportExcel
                  }
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm transition"
                >
                  <span>📊</span>
                  Export Excel
                </button>

                <button
                  onClick={
                    handleCetakPDF
                  }
                  className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-sm transition"
                >
                  <span>🖨️</span>
                  Cetak PDF
                </button>
              </div>
            </div>

            {/* FILTER */}
            <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 mb-4 flex flex-wrap gap-2.5 items-center justify-between">
              <div className="flex flex-wrap items-center gap-2 w-full">

                {/* SEARCH */}
                <div className="relative min-w-[260px]">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400 text-xs">
                    🔍
                  </span>

                  <input
                    type="text"
                    placeholder="Cari Mitra, SOBAT ID, Kegiatan"
                    value={
                      searchKeyword
                    }
                    onChange={(e) => {
                      setSearchKeyword(
                        e.target.value
                      );
                      setCurrentPage(1);
                    }}
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-blue-400"
                  />
                </div>

                {/* STATUS */}
                <select
                  value={
                    statusFilter
                  }
                  onChange={(e) => {
                    setStatusFilter(
                      e.target.value
                    );
                    setCurrentPage(1);
                  }}
                  className="py-1.5 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400 cursor-pointer"
                >
                  {STATUS_FILTER_OPTIONS.map(
                    (st) => (
                      <option
                        key={st}
                        value={st}
                      >
                        {st}
                      </option>
                    )
                  )}
                </select>

                {/* KEGIATAN */}
                <select
                  value={
                    kegiatanFilter
                  }
                  onChange={(e) => {
                    setKegiatanFilter(
                      e.target.value
                    );
                    setCurrentPage(1);
                  }}
                  className="py-1.5 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400 cursor-pointer max-w-[240px]"
                >
                  <option value="Semua Kegiatan">
                    Semua Kegiatan
                  </option>

                  {kegiatanOptions.map(
                    (k) => (
                      <option
                        key={k.id}
                        value={
                          k.nama_kegiatan
                        }
                      >
                        {k.nama_kegiatan}
                      </option>
                    )
                  )}
                </select>

                {/* BULAN */}
                <select
                  value={
                    bulanFilter
                  }
                  onChange={(e) => {
                    setBulanFilter(
                      e.target.value
                    );
                    setCurrentPage(1);
                  }}
                  className="py-1.5 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400 cursor-pointer"
                >
                  {BULAN_OPTIONS.map(
                    (bln) => (
                      <option
                        key={bln}
                        value={bln}
                      >
                        {bln}
                      </option>
                    )
                  )}
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
                    setStatusFilter(
                      'Semua'
                    );
                    setKegiatanFilter(
                      'Semua Kegiatan'
                    );
                    setBulanFilter(
                      'Semua Bulan'
                    );
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
                    value={
                      itemsPerPage
                    }
                    onChange={(e) => {
                      setItemsPerPage(
                        Number(
                          e.target.value
                        )
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

            {/* INFO */}
            {!loading &&
              totalItems > 0 && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-700">
                  Menampilkan{' '}
                  <strong>
                    {totalItems}
                  </strong>{' '}
                  mitra/pegawai (per periode bulan) yang
                  sudah mencapai atau
                  melewati limit — sudah digabung per mitra per bulan.
                </div>
              )}

            {/* TABLE */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                    <tr>
                      <th className="py-3 px-4 text-center w-12">
                        No
                      </th>

                      <th className="py-3 px-4">
                        Nama Mitra/Pegawai
                      </th>

                      <th className="py-3 px-4">
                        SOBAT ID / NIK/NIP
                      </th>

                      <th className="py-3 px-4">
                        Kegiatan
                      </th>

                      <th className="py-3 px-4">
                        Periode
                      </th>

                      <th className="py-3 px-4 text-right">
                        Hak Honor Alokasi
                      </th>

                      <th className="py-3 px-4 text-right">
                        Sisa Limit Periode
                      </th>

                      <th className="py-3 px-4 text-right">
                        Persentase
                      </th>

                      <th className="py-3 px-4 text-center">
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="py-8 text-center text-slate-400"
                        >
                          Memuat data
                          laporan...
                        </td>
                      </tr>
                    ) : currentData.length ===
                      0 ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="py-8 text-center text-slate-400"
                        >
                          Tidak ada mitra/pegawai
                          yang mencapai limit
                          sesuai filter.
                        </td>
                      </tr>
                    ) : (
                      currentData.map(
                        (
                          row,
                          index
                        ) => (
                          <tr
                            key={row.id}
                            className={`hover:bg-slate-50/60 transition ${
                              row.status ===
                              'Limit Terlampaui'
                                ? 'bg-rose-50/40'
                                : 'bg-amber-50/20'
                            }`}
                          >
                            <td className="py-3.5 px-4 text-center font-medium text-slate-400">
                              {(currentPage -
                                1) *
                                itemsPerPage +
                                index +
                                1}
                            </td>

                            <td className="py-3.5 px-4 font-semibold text-blue-600 align-top">
                              {
                                row.namaPegawai
                              }
                            </td>

                            <td className="py-3.5 px-4 text-blue-500 font-mono align-top">
                              {
                                row.nikNip
                              }
                            </td>

                            {/* KEGIATAN — bisa lebih dari satu, satu mitra
                                bisa punya beberapa kegiatan yang sama-sama
                                menyentuh bulan ini. Tiap kegiatan ditampilkan
                                dengan porsi honornya masing-masing supaya
                                rinciannya tetap terlihat meski sudah digabung
                                jadi satu baris. */}
                            <td className="py-3.5 px-4 align-top">
                              <div className="space-y-1.5">
                                {row.kegiatanList.map((k, i) => (
                                  <div key={`${k.kegiatanId}-${i}`} className="text-[11.5px] leading-tight">
                                    <Link
                                      href={`/kegiatan/${k.kegiatanId}`}
                                      className="font-medium text-blue-500 hover:underline"
                                    >
                                      {k.namaKegiatan}
                                    </Link>
                                    <span className="text-slate-500"> — {formatRupiah(k.honorBulanIni)}</span>
                                    {k.jumlahBulanKegiatan > 1 && (
                                      <div className="text-[10px] text-slate-400">
                                        bagian dari {k.periodeAsliKegiatan}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </td>

                            <td className="py-3.5 px-4 text-slate-600 align-top">
                              {row.periode}
                            </td>

                            {/* HAK HONOR ALOKASI — total gabungan semua
                                kegiatan pada bulan ini */}
                            <td className="py-3.5 px-4 text-right font-semibold text-blue-600 align-top">
                              {formatRupiah(row.terpakai)}
                              {row.kegiatanList.length > 1 && (
                                <div className="text-[10px] font-normal text-slate-400">
                                  gabungan {row.kegiatanList.length} kegiatan
                                </div>
                              )}
                            </td>

                            {/* SISA LIMIT PERIODE */}
                            <td
                              className={`py-3.5 px-4 text-right font-semibold align-top ${
                                row.limit <=
                                0
                                  ? 'text-rose-600'
                                  : 'text-amber-600'
                              }`}
                            >
                              {formatRupiah(
                                row.limit
                              )}
                            </td>

                            {/* PERSENTASE */}
                            <td
                              className={`py-3.5 px-4 text-right font-semibold align-top ${presentaseColor(
                                row.status
                              )}`}
                            >
                              {row.presentase}
                              %
                            </td>

                            <td className="py-3.5 px-4 text-center align-top">
                              {statusBadge(
                                row.status
                              )}
                            </td>
                          </tr>
                        )
                      )
                    )}
                  </tbody>
                </table>
              </div>

              {/* PAGINATION */}
              {totalItems > 0 && (
                <div className="px-6 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-white">
                  <div className="text-xs text-slate-500">
                    Menampilkan{' '}
                    <span className="font-semibold text-slate-700">
                      {startItem}
                    </span>{' '}
                    -{' '}
                    <span className="font-semibold text-slate-700">
                      {endItem}
                    </span>{' '}
                    dari{' '}
                    <span className="font-semibold text-slate-700">
                      {totalItems}
                    </span>{' '}
                    data
                  </div>

                  <div className="flex items-center gap-1.5 text-xs">
                    <button
                      onClick={() =>
                        setCurrentPage(
                          (prev) =>
                            Math.max(
                              prev - 1,
                              1
                            )
                        )
                      }
                      disabled={
                        currentPage === 1
                      }
                      className="px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      ‹
                    </button>

                    {Array.from(
                      {
                        length: totalPages,
                      },
                      (_, i) => i + 1
                    )
                      .filter(
                        (page) =>
                          page === 1 ||
                          page ===
                            totalPages ||
                          Math.abs(
                            page -
                              currentPage
                          ) <= 1
                      )
                      .map(
                        (
                          page,
                          idx,
                          array
                        ) => {
                          const prevPage =
                            array[
                              idx - 1
                            ];

                          const showEllipsis =
                            prevPage &&
                            page -
                              prevPage >
                              1;

                          return (
                            <React.Fragment
                              key={page}
                            >
                              {showEllipsis && (
                                <span className="px-1 text-slate-400">
                                  ...
                                </span>
                              )}

                              <button
                                onClick={() =>
                                  setCurrentPage(
                                    page
                                  )
                                }
                                className={`px-3 py-1 rounded font-medium transition ${
                                  currentPage ===
                                  page
                                    ? 'bg-blue-600 text-white border border-blue-600'
                                    : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                {page}
                              </button>
                            </React.Fragment>
                          );
                        }
                      )}

                    <button
                      onClick={() =>
                        setCurrentPage(
                          (prev) =>
                            Math.min(
                              prev + 1,
                              totalPages
                            )
                        )
                      }
                      disabled={
                        currentPage ===
                          totalPages ||
                        totalPages === 0
                      }
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
