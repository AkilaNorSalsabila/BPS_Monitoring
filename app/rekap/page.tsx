'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Pemetaan Nama Bulan Indonesia ke Angka (dipakai untuk filter bulan kegiatan & pencairan)
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

// Tahun yang dipakai untuk mencocokkan filter periode kegiatan & periode
// pencairan. Diambil otomatis dari tahun berjalan, jadi tidak perlu diubah
// manual tiap pergantian tahun anggaran.
const TAHUN_FILTER = String(new Date().getFullYear());

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
}

// Satu baris penugasan mitra pada suatu kegiatan (sudah dilengkapi nama mitra
// & Total Honor). Total Honor DIHITUNG, bukan diambil dari kolom database
// (lihat catatan di fetchRekap).
interface PenugasanRow {
  id: number;
  kegiatanId: number;
  sobatId: string;
  namaMitra: string;
  totalHonor: number;
}

// Satu baris riwayat pencairan, sudah dilengkapi nama kegiatan & nama mitra
// (join manual di JS dari penugasan + mitra) supaya siap dipakai langsung
// untuk laporan tanpa perlu lookup lagi.
interface RiwayatPencairanRow {
  id: number;
  kegiatanId: number;
  namaKegiatan: string;
  sobatId: string;
  namaMitra: string;
  bulanPencairan: string | null;
  tglPencairan: string | null;
  nominalDicairkan: number | null;
  metodePembayaran: string | null;
  noReferensiSp2d: string | null;
  catatan: string | null;
}

// Rekap per-mitra pada satu kegiatan: honor ditugaskan vs sudah dicairkan.
interface MitraDetailRow {
  sobatId: string;
  namaMitra: string;
  totalHonor: number;
  totalDicairkan: number;
  sisa: number;
  jumlahPencairan: number;
  status: 'Lunas' | 'Sebagian' | 'Belum Dicairkan' | 'Belum Ada Honor';
}

/* ============================================
   HELPER: WARNA PROGRESS BAR BERDASARKAN PRESENTASE
============================================ */
function getPresentaseColor(presentase: number) {
  if (presentase >= 100) return { bar: 'bg-rose-500', text: 'text-rose-600' };
  if (presentase >= 80) return { bar: 'bg-amber-500', text: 'text-amber-600' };
  return { bar: 'bg-emerald-500', text: 'text-emerald-600' };
}

// Warna badge status pencairan per-mitra — mengikuti pola badge di
// halaman Pencairan: latar tipis + border + teks berwarna, bentuk rounded
// biasa (bukan pill) supaya konsisten dengan STATUS_META di sana.
function getStatusMitraStyle(status: MitraDetailRow['status']) {
  switch (status) {
    case 'Lunas':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'Sebagian':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'Belum Dicairkan':
      return 'bg-slate-50 text-slate-600 border-slate-200';
    default:
      return 'bg-slate-50 text-slate-500 border-slate-200';
  }
}

export default function RekapBulananPage() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [kegiatanList, setKegiatanList] = useState<KegiatanRow[]>([]);
  const [kegiatanOptions, setKegiatanOptions] = useState<KegiatanRow[]>([]);
  const [terpakaiMap, setTerpakaiMap] = useState<Record<number, number>>({});
  const [penugasanList, setPenugasanList] = useState<PenugasanRow[]>([]);
  const [riwayatList, setRiwayatList] = useState<RiwayatPencairanRow[]>([]);

  const [loading, setLoading] = useState<boolean>(true);

  // State Filter
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('Semua Status');
  const [kegiatanFilter, setKegiatanFilter] = useState<string>('Semua Kegiatan');
  const [bulanFilter, setBulanFilter] = useState<string>('Semua Bulan');
  // Filter periode REALISASI pencairan (bulan pencairan), terpisah dari periode kegiatan.
  // Berguna untuk kebutuhan keuangan: "pencairan bulan ini berapa".
  const [periodePencairanFilter, setPeriodePencairanFilter] = useState<string>('Semua Bulan');

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(5);

  // Kegiatan yang sedang dipilih untuk menampilkan detail mitra dalam modal
  const [selectedKegiatanId, setSelectedKegiatanId] = useState<number | null>(null);

  /* ============================================
     FORMAT RUPIAH & TANGGAL
  ============================================ */
  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const formatTanggalPendek = (val?: string | null) => {
    if (!val) return '-';
    try {
      return new Date(val).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return val;
    }
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
     FETCH DATA REKAP + PENUGASAN MITRA + RIWAYAT PENCAIRAN
     (sekali saja, sisanya difilter client-side)

     =========================================================
     PERBAIKAN PENTING DIBANDING VERSI SEBELUMNYA
     =========================================================
     Versi lama mengambil `penugasan.total_honor` langsung dari kolom
     database untuk dijadikan "Total Honor" tiap mitra & "Terpakai" tiap
     kegiatan. Kolom itu TIDAK PERNAH DIISI lagi sejak diputuskan Total
     Honor dihitung otomatis dari akumulasi Rencana Pencairan (tidak ada
     sumber lain seperti SK/kontrak/tarif yang jadi acuan) — makanya
     kolom itu selalu 0, dan berdampak:
       - "Terpakai" & "Presentase" di tabel Rekap selalu 0
       - "Sisa Honor" per mitra di modal Detail Mitra jadi MINUS begitu
         ada realisasi (0 - realisasi = negatif)

     Sekarang Total Honor tiap penugasan dihitung dari PENJUMLAHAN SEMUA
     baris `pencairan_honor` milik penugasan tsb — pakai
     `nominal_dicairkan` kalau baris itu sudah direalisasikan, kalau
     belum pakai `nominal_rencana` (baris yang sama tidak dihitung dua
     kali). Ini persis logika "beban" yang sudah dipakai di halaman
     Monitoring Limit, hanya di sini diagregasi per penugasan (bukan per
     bulan) untuk merepresentasikan total honor keseluruhan mitra pada
     kegiatan tsb.
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
      const kegiatanNamaMap = new Map(kegiatanRows.map((k) => [k.id, k.nama_kegiatan]));

      if (kegiatanIds.length > 0) {
        // Cukup ambil id, kegiatan_id, sobat_id — `total_honor` tidak lagi
        // dipakai (lihat catatan di atas), jadi tidak perlu diambil.
        const { data: dataPenugasan, error: errPenugasan } = await supabase
          .from('penugasan')
          .select('id, kegiatan_id, sobat_id')
          .in('kegiatan_id', kegiatanIds);

        if (errPenugasan) {
          console.error('Error fetch penugasan:', errPenugasan);
          setTerpakaiMap({});
          setPenugasanList([]);
          setRiwayatList([]);
        } else {
          const penugasanRows = dataPenugasan || [];

          const penugasanIds = penugasanRows.map((p: any) => p.id);
          const penugasanMap = new Map(
            penugasanRows.map((p: any) => [p.id, { kegiatanId: p.kegiatan_id, sobatId: p.sobat_id }])
          );

          // Nama mitra diambil terpisah supaya tidak bergantung pada
          // foreign key embed yang mungkin belum ter-setup di Supabase.
          // Diambil dari seluruh sobat_id yang muncul di penugasan (superset
          // dari sobat_id yang muncul di riwayat pencairan).
          const sobatIdsPenugasan = Array.from(
            new Set(penugasanRows.map((p: any) => p.sobat_id).filter(Boolean))
          );

          let mitraMap = new Map<string, string>();
          if (sobatIdsPenugasan.length > 0) {
            const { data: dataMitra, error: errMitra } = await supabase
              .from('mitra')
              .select('sobat_id, nama_mitra')
              .in('sobat_id', sobatIdsPenugasan);

            if (!errMitra && dataMitra) {
              mitraMap = new Map(dataMitra.map((m: any) => [m.sobat_id, m.nama_mitra]));
            }
          }

          // Total Honor per penugasan: akumulasi dari seluruh baris
          // pencairan_honor miliknya (lihat catatan perbaikan di atas).
          const totalHonorMap: Record<number, number> = {};
          let riwayatRows: RiwayatPencairanRow[] = [];

          if (penugasanIds.length > 0) {
            const { data: dataPencairan, error: errPencairan } = await supabase
              .from('pencairan_honor')
              .select(
                'id, penugasan_id, sobat_id, bulan_pencairan, tgl_pencairan, nominal_rencana, nominal_dicairkan, metode_pembayaran, no_referensi_sp2d, catatan'
              )
              .in('penugasan_id', penugasanIds)
              .order('tgl_pencairan', { ascending: false });

            if (errPencairan) {
              console.error('Error fetch pencairan_honor:', errPencairan);
              setRiwayatList([]);
            } else {
              const pencairanRows = dataPencairan || [];

              pencairanRows.forEach((r: any) => {
                const sudahRealisasi = r.nominal_dicairkan !== null && r.nominal_dicairkan !== undefined;
                const nominalEfektif = sudahRealisasi
                  ? Number(r.nominal_dicairkan) || 0
                  : Number(r.nominal_rencana) || 0;
                totalHonorMap[r.penugasan_id] = (totalHonorMap[r.penugasan_id] || 0) + nominalEfektif;
              });

              riwayatRows = pencairanRows.map((r: any) => {
                const infoPenugasan = penugasanMap.get(r.penugasan_id);
                const kegiatanId = infoPenugasan?.kegiatanId;
                return {
                  id: r.id,
                  kegiatanId: kegiatanId,
                  namaKegiatan: (kegiatanId !== undefined && kegiatanNamaMap.get(kegiatanId)) || '-',
                  sobatId: r.sobat_id,
                  namaMitra: mitraMap.get(r.sobat_id) || r.sobat_id,
                  bulanPencairan: r.bulan_pencairan,
                  tglPencairan: r.tgl_pencairan,
                  nominalDicairkan: r.nominal_dicairkan,
                  metodePembayaran: r.metode_pembayaran,
                  noReferensiSp2d: r.no_referensi_sp2d,
                  catatan: r.catatan,
                };
              });
            }
          }
          setRiwayatList(riwayatRows);

          const penugasanListBaru: PenugasanRow[] = penugasanRows.map((p: any) => ({
            id: p.id,
            kegiatanId: p.kegiatan_id,
            sobatId: p.sobat_id,
            namaMitra: mitraMap.get(p.sobat_id) || p.sobat_id,
            totalHonor: totalHonorMap[p.id] || 0,
          }));
          setPenugasanList(penugasanListBaru);

          // Total terpakai per kegiatan = jumlah Total Honor semua
          // penugasan pada kegiatan tsb.
          const terpakaiMapBaru: Record<number, number> = {};
          penugasanListBaru.forEach((p) => {
            terpakaiMapBaru[p.kegiatanId] = (terpakaiMapBaru[p.kegiatanId] || 0) + p.totalHonor;
          });
          setTerpakaiMap(terpakaiMapBaru);
        }
      } else {
        setTerpakaiMap({});
        setPenugasanList([]);
        setRiwayatList([]);
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

      // Persentase penggunaan anggaran berdasarkan PAGU (maksimal 100%)
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
      };
    });
  }, [kegiatanList, terpakaiMap]);

  /* ============================================
     TOTAL REALISASI (nominal) SUDAH DICAIRKAN PER "kegiatanId_sobatId"
     Hanya baris yang benar-benar sudah terealisasi (ada tgl_pencairan)
     yang dihitung sebagai "sudah dicairkan".
  ============================================ */
  const dicairkanMap = useMemo(() => {
    const map: Record<string, number> = {};
    riwayatList.forEach((r) => {
      if (r.tglPencairan && r.nominalDicairkan) {
        const key = `${r.kegiatanId}_${r.sobatId}`;
        map[key] = (map[key] || 0) + Number(r.nominalDicairkan);
      }
    });
    return map;
  }, [riwayatList]);

  /* ============================================
     DETAIL MITRA PER KEGIATAN
     (dipakai untuk baris expand, export Excel, & cetak PDF)
  ============================================ */
  const mitraDetailByKegiatan = useMemo(() => {
    const map: Record<number, MitraDetailRow[]> = {};

    penugasanList.forEach((p) => {
      const key = `${p.kegiatanId}_${p.sobatId}`;
      const totalDicairkan = dicairkanMap[key] || 0;
      const sisa = p.totalHonor - totalDicairkan;

      let status: MitraDetailRow['status'];
      if (p.totalHonor <= 0) status = 'Belum Ada Honor';
      else if (sisa <= 0) status = 'Lunas';
      else if (totalDicairkan > 0) status = 'Sebagian';
      else status = 'Belum Dicairkan';

      const jumlahPencairan = riwayatList.filter(
        (r) => r.kegiatanId === p.kegiatanId && r.sobatId === p.sobatId && !!r.tglPencairan
      ).length;

      if (!map[p.kegiatanId]) map[p.kegiatanId] = [];
      map[p.kegiatanId].push({
        sobatId: p.sobatId,
        namaMitra: p.namaMitra,
        totalHonor: p.totalHonor,
        totalDicairkan,
        sisa,
        jumlahPencairan,
        status,
      });
    });

    return map;
  }, [penugasanList, dicairkanMap, riwayatList]);

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

      // BULAN (periode kegiatan)
      let matchBulan = true;

      if (bulanFilter !== 'Semua Bulan') {
        const monthNumber = BULAN_NUMBER[bulanFilter];

        matchBulan = isMatchingMonth(
          row.bulan_kegiatan,
          `${TAHUN_FILTER}-${monthNumber}`
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

  // Riwayat pencairan yang ikut ditampilkan/diunduh dibatasi hanya untuk
  // kegiatan yang lolos filter di atas, DAN (opsional) periode realisasi
  // pencairannya, supaya laporan yang diunduh selalu konsisten dengan apa
  // yang sedang dilihat / dibutuhkan keuangan.
  const filteredRiwayat = useMemo(() => {
    const idSet = new Set(filteredRekap.map((r) => r.id));
    return riwayatList.filter((r) => {
      if (!idSet.has(r.kegiatanId)) return false;

      if (periodePencairanFilter !== 'Semua Bulan') {
        const monthNumber = BULAN_NUMBER[periodePencairanFilter];
        return isMatchingMonth(r.bulanPencairan, `${TAHUN_FILTER}-${monthNumber}`);
      }

      return true;
    });
  }, [riwayatList, filteredRekap, periodePencairanFilter]);

  /* ============================================
     RINGKASAN TOTAL (kartu ringkasan untuk keuangan)
     Mengikuti hasil filter yang sedang aktif.
  ============================================ */
  const summaryTotals = useMemo(() => {
    const totalPagu = filteredRekap.reduce((sum, r) => sum + r.paguAnggaran, 0);
    const totalTerpakai = filteredRekap.reduce((sum, r) => sum + r.terpakai, 0);
    const totalSisa = totalPagu - totalTerpakai;
    const totalRealisasi = filteredRiwayat.reduce(
      (sum, r) => (r.tglPencairan && r.nominalDicairkan ? sum + Number(r.nominalDicairkan) : sum),
      0
    );
    const presentaseKeseluruhan = totalPagu > 0 ? Math.round((totalTerpakai / totalPagu) * 100) : 0;

    return { totalPagu, totalTerpakai, totalSisa, totalRealisasi, presentaseKeseluruhan };
  }, [filteredRekap, filteredRiwayat]);

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
     EXPORT EXCEL — 3 sheet:
     1. Rekap Kegiatan
     2. Detail Mitra per Kegiatan (honor vs realisasi per mitra)
     3. Riwayat Pencairan (mengikuti filter periode pencairan)
  ============================================ */
  const handleExportExcel = async () => {
    if (filteredRekap.length === 0) {
      alert('Tidak ada data untuk diekspor.');
      return;
    }

    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();

      // --- SHEET 1: REKAP KEGIATAN ---
      const rekapRows = filteredRekap.map((row, index) => ({
        No: index + 1,
        Kegiatan: row.nama_kegiatan,
        'Periode Kegiatan': row.bulan_kegiatan || '-',
        'Pagu Anggaran': row.paguAnggaran,
        Terpakai: row.terpakai,
        Sisa: row.sisa,
        'Presentase (%)': row.presentase,
      }));

      const wsRekap = XLSX.utils.json_to_sheet(rekapRows);
      wsRekap['!cols'] = [
        { wch: 5 },
        { wch: 32 },
        { wch: 26 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 15 },
      ];
      XLSX.utils.book_append_sheet(workbook, wsRekap, 'Rekap Kegiatan');

      // --- SHEET 2: DETAIL MITRA PER KEGIATAN ---
      const detailMitraRows: any[] = [];
      let noDetail = 1;
      filteredRekap.forEach((k) => {
        const mitraRows = mitraDetailByKegiatan[k.id] || [];
        mitraRows.forEach((m) => {
          detailMitraRows.push({
            No: noDetail++,
            Kegiatan: k.nama_kegiatan,
            'Periode Kegiatan': k.bulan_kegiatan || '-',
            'Nama Mitra': m.namaMitra,
            'SOBAT ID': m.sobatId,
            'Total Honor Ditugaskan': m.totalHonor,
            'Sudah Dicairkan': m.totalDicairkan,
            Sisa: m.sisa,
            'Jml Pencairan': m.jumlahPencairan,
            Status: m.status,
          });
        });
      });

      const wsDetailMitra = XLSX.utils.json_to_sheet(
        detailMitraRows.length > 0
          ? detailMitraRows
          : [{ Keterangan: 'Belum ada mitra ditugaskan pada kegiatan-kegiatan hasil filter ini.' }]
      );
      wsDetailMitra['!cols'] = [
        { wch: 5 },
        { wch: 30 },
        { wch: 20 },
        { wch: 26 },
        { wch: 16 },
        { wch: 20 },
        { wch: 18 },
        { wch: 15 },
        { wch: 14 },
        { wch: 16 },
      ];
      XLSX.utils.book_append_sheet(workbook, wsDetailMitra, 'Detail Mitra per Kegiatan');

      // --- SHEET 3: RIWAYAT PENCAIRAN (transparansi/akuntabilitas) ---
      const riwayatRows = filteredRiwayat.map((row, index) => ({
        No: index + 1,
        Kegiatan: row.namaKegiatan,
        'Nama Mitra': row.namaMitra,
        'SOBAT ID': row.sobatId,
        'Bulan Rencana': row.bulanPencairan || '-',
        'Tanggal Realisasi': row.tglPencairan ? formatTanggalPendek(row.tglPencairan) : 'Belum cair',
        'Nominal Dicairkan':
          row.nominalDicairkan !== null && row.nominalDicairkan !== undefined ? row.nominalDicairkan : 0,
        'Metode Pembayaran': row.metodePembayaran || '-',
        'No. Referensi SP2D': row.noReferensiSp2d || '-',
        Catatan: row.catatan || '-',
      }));

      const wsRiwayat = XLSX.utils.json_to_sheet(
        riwayatRows.length > 0
          ? riwayatRows
          : [{ Keterangan: 'Belum ada riwayat pencairan untuk kegiatan-kegiatan pada filter ini.' }]
      );
      wsRiwayat['!cols'] = [
        { wch: 5 },
        { wch: 30 },
        { wch: 26 },
        { wch: 16 },
        { wch: 16 },
        { wch: 18 },
        { wch: 20 },
        { wch: 20 },
        { wch: 22 },
        { wch: 30 },
      ];
      XLSX.utils.book_append_sheet(workbook, wsRiwayat, 'Riwayat Pencairan');

      const tanggal = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `Rekap-Anggaran-Kegiatan-${tanggal}.xlsx`);
    } catch (err) {
      console.error('Gagal export excel:', err);
      alert('Gagal mengekspor ke Excel. Pastikan package "xlsx" sudah terpasang (npm install xlsx).');
    }
  };

  /* ============================================
     CETAK PDF — jsPDF + autoTable, kop surat BPS,
     berisi 3 tabel: Rekap Kegiatan, Detail Mitra per Kegiatan, Riwayat Pencairan
  ============================================ */
  const handleCetakPDF = () => {
    if (filteredRekap.length === 0) {
      alert('Tidak ada data untuk dicetak.');
      return;
    }

    const doc = new jsPDF('landscape', 'mm', 'a4');

    doc.setFontSize(14);
    doc.text('BADAN PUSAT STATISTIK KOTA MOJOKERTO', 14, 15);

    doc.setFontSize(10);
    doc.text('Rekap Anggaran, Detail Mitra & Riwayat Pencairan Honor per Kegiatan', 14, 21);

    doc.setFontSize(8);
    doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`, 14, 26);

    const filters: string[] = [];
    if (kegiatanFilter !== 'Semua Kegiatan') filters.push(`Kegiatan ${kegiatanFilter}`);
    if (bulanFilter !== 'Semua Bulan') filters.push(`Periode Kegiatan ${bulanFilter}`);
    if (statusFilter !== 'Semua Status') filters.push(`Status ${statusFilter}`);
    if (periodePencairanFilter !== 'Semua Bulan') filters.push(`Periode Pencairan ${periodePencairanFilter}`);

    doc.text(`Filter: ${filters.length > 0 ? filters.join(', ') : 'Semua Kegiatan'}`, 14, 31);

    // Ringkasan total di bawah baris filter
    doc.setFontSize(8);
    doc.text(
      `Total Pagu: ${formatRupiah(summaryTotals.totalPagu)}   |   Total Terpakai: ${formatRupiah(
        summaryTotals.totalTerpakai
      )} (${summaryTotals.presentaseKeseluruhan}%)   |   Sisa Anggaran: ${formatRupiah(
        summaryTotals.totalSisa
      )}   |   Realisasi Dicairkan: ${formatRupiah(summaryTotals.totalRealisasi)}`,
      14,
      36
    );

    // --- TABEL 1: REKAP KEGIATAN ---
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('1. Rekap Anggaran per Kegiatan', 14, 44);
    doc.setFont('helvetica', 'normal');

    const rekapBody = filteredRekap.map((row, index) => [
      index + 1,
      row.nama_kegiatan,
      row.bulan_kegiatan || '-',
      formatRupiah(row.paguAnggaran),
      formatRupiah(row.terpakai),
      formatRupiah(row.sisa),
      `${row.presentase}%`,
    ]);

    autoTable(doc, {
      startY: 48,
      head: [['No', 'Kegiatan', 'Periode', 'Pagu Anggaran', 'Terpakai', 'Sisa', 'Presentase']],
      body: rekapBody,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 65 },
        2: { cellWidth: 45 },
        3: { cellWidth: 38, halign: 'right' },
        4: { cellWidth: 38, halign: 'right' },
        5: { cellWidth: 38, halign: 'right' },
        6: { cellWidth: 25, halign: 'center' },
      },
    });

    // --- TABEL 2: DETAIL MITRA PER KEGIATAN ---
    const finalYTabel1 = (doc as any).lastAutoTable?.finalY || 48;
    const startYTabel2 = finalYTabel1 + 12;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('2. Detail Mitra per Kegiatan (Honor vs Realisasi)', 14, startYTabel2 - 4);
    doc.setFont('helvetica', 'normal');

    const detailMitraBody: any[] = [];
    filteredRekap.forEach((k) => {
      const mitraRows = mitraDetailByKegiatan[k.id] || [];
      mitraRows.forEach((m) => {
        detailMitraBody.push([
          k.nama_kegiatan,
          m.namaMitra,
          m.sobatId,
          formatRupiah(m.totalHonor),
          formatRupiah(m.totalDicairkan),
          formatRupiah(m.sisa),
          m.status,
        ]);
      });
    });

    autoTable(doc, {
      startY: startYTabel2,
      head: [['Kegiatan', 'Nama Mitra', 'SOBAT ID', 'Total Honor', 'Sudah Dicairkan', 'Sisa', 'Status']],
      body:
        detailMitraBody.length > 0
          ? detailMitraBody
          : [['-', 'Belum ada mitra ditugaskan pada kegiatan hasil filter ini.', '', '', '', '', '']],
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 55 },
        1: { cellWidth: 40 },
        2: { cellWidth: 28 },
        3: { cellWidth: 32, halign: 'right' },
        4: { cellWidth: 32, halign: 'right' },
        5: { cellWidth: 32, halign: 'right' },
        6: { cellWidth: 24, halign: 'center' },
      },
    });

    // --- TABEL 3: RIWAYAT PENCAIRAN ---
    const finalYTabel2 = (doc as any).lastAutoTable?.finalY || startYTabel2;
    const startYTabel3 = finalYTabel2 + 12;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('3. Riwayat Pencairan (Transparansi & Akuntabilitas)', 14, startYTabel3 - 4);
    doc.setFont('helvetica', 'normal');

    const riwayatBody =
      filteredRiwayat.length > 0
        ? filteredRiwayat.map((row, index) => [
            index + 1,
            row.namaKegiatan,
            row.namaMitra,
            row.sobatId,
            row.bulanPencairan || '-',
            row.tglPencairan ? formatTanggalPendek(row.tglPencairan) : 'Belum cair',
            row.nominalDicairkan ? formatRupiah(Number(row.nominalDicairkan)) : '-',
            row.noReferensiSp2d || '-',
          ])
        : [['-', 'Belum ada riwayat pencairan untuk kegiatan pada filter ini.', '', '', '', '', '', '']];

    autoTable(doc, {
      startY: startYTabel3,
      head: [['No', 'Kegiatan', 'Mitra', 'SOBAT ID', 'Bulan Rencana', 'Tgl Realisasi', 'Nominal', 'No. Ref SP2D']],
      body: riwayatBody,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 55 },
        2: { cellWidth: 40 },
        3: { cellWidth: 28 },
        4: { cellWidth: 28 },
        5: { cellWidth: 28 },
        6: { cellWidth: 32, halign: 'right' },
        7: { cellWidth: 32 },
      },
    });

    doc.save(`Rekap-Anggaran-Kegiatan-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans">
      <Sidebar mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />

      <div className="min-h-screen lg:pl-[230px]">
        <Header onMenuClick={() => setMobileSidebarOpen(true)} />

        <main className="p-3 sm:p-4 lg:p-5">
          <div className="mx-auto max-w-[1500px]">
            {/* ================= HEADER ================= */}

            <div className="mb-4 flex flex-wrap justify-between items-center gap-3">
              <div>
                <h1 className="text-lg font-bold text-slate-800">Rekap Bulanan</h1>
                <p className="text-[11px] text-slate-500">
                  Rekap anggaran per kegiatan, lengkap dengan mitra yang ditugaskan &amp; status pencairannya — file
                  yang diunduh sudah termasuk detail mitra dan riwayat pencairan lengkap untuk transparansi
                </p>
              </div>

              <div className="flex items-center gap-1.5 ml-auto">
                <button
                  onClick={handleExportExcel}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-md shadow-sm transition cursor-pointer"
                >
                  <span>📊</span>
                  Export Excel
                </button>
                <button
                  onClick={handleCetakPDF}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium rounded-md shadow-sm transition cursor-pointer"
                >
                  <span>🖨️</span>
                  Cetak PDF
                </button>
              </div>
            </div>

            {/* ================= KARTU RINGKASAN ================= */}

            {!loading && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
                <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200">
                  <p className="text-[11px] text-slate-500 mb-1">Total Pagu Anggaran</p>
                  <p className="text-sm font-bold text-slate-800">{formatRupiah(summaryTotals.totalPagu)}</p>
                </div>
                <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200">
                  <p className="text-[11px] text-slate-500 mb-1">Total Terpakai (Ditugaskan)</p>
                  <p className="text-sm font-bold text-blue-600">
                    {formatRupiah(summaryTotals.totalTerpakai)}{' '}
                    <span className="text-[10px] font-medium text-slate-400">
                      ({summaryTotals.presentaseKeseluruhan}%)
                    </span>
                  </p>
                </div>
                <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200">
                  <p className="text-[11px] text-slate-500 mb-1">Sisa Anggaran</p>
                  <p className="text-sm font-bold text-emerald-600">{formatRupiah(summaryTotals.totalSisa)}</p>
                </div>
                <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200">
                  <p className="text-[11px] text-slate-500 mb-1">Realisasi Sudah Dicairkan</p>
                  <p className="text-sm font-bold text-rose-600">{formatRupiah(summaryTotals.totalRealisasi)}</p>
                </div>
              </div>
            )}

            {/* ================= FILTER ================= */}

            <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 mb-4 flex flex-wrap gap-2.5 items-center">
              {/* SEARCH */}
              <div className="relative min-w-[220px]">
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
                <option value="Semua Status">Semua Status</option>
                <option value="Belum Terpakai">Belum Terpakai (0%)</option>
                <option value="Aman">Aman (&lt;80%)</option>
                <option value="Hampir Limit">Hampir Limit (&ge;80%)</option>
                <option value="Mencapai Limit">Mencapai Limit (100%)</option>
              </select>

              {/* FILTER KEGIATAN */}
              <select
                value={kegiatanFilter}
                onChange={(e) => {
                  setKegiatanFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="py-1.5 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400 cursor-pointer max-w-[220px]"
              >
                <option value="Semua Kegiatan">Semua Kegiatan</option>
                {kegiatanOptions.map((k) => (
                  <option key={k.id} value={k.nama_kegiatan}>
                    {k.nama_kegiatan}
                  </option>
                ))}
              </select>

              {/* FILTER PERIODE KEGIATAN */}
              <select
                value={bulanFilter}
                onChange={(e) => {
                  setBulanFilter(e.target.value);
                  setCurrentPage(1);
                }}
                title="Filter berdasarkan periode kegiatan"
                className="py-1.5 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400 cursor-pointer"
              >
                {BULAN_OPTIONS.map((bln) => (
                  <option key={bln} value={bln}>
                    {bln === 'Semua Bulan' ? 'Semua Periode Kegiatan' : `Periode: ${bln}`}
                  </option>
                ))}
              </select>

              {/* FILTER PERIODE PENCAIRAN */}
              <select
                value={periodePencairanFilter}
                onChange={(e) => {
                  setPeriodePencairanFilter(e.target.value);
                  setCurrentPage(1);
                }}
                title="Filter riwayat & rekap pencairan berdasarkan bulan realisasi"
                className="py-1.5 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400 cursor-pointer"
              >
                {BULAN_OPTIONS.map((bln) => (
                  <option key={bln} value={bln}>
                    {bln === 'Semua Bulan' ? 'Semua Periode Pencairan' : `Pencairan: ${bln}`}
                  </option>
                ))}
              </select>

              {/* RESET */}
              <button
                onClick={() => {
                  setSearchKeyword('');
                  setStatusFilter('Semua Status');
                  setBulanFilter('Semua Bulan');
                  setKegiatanFilter('Semua Kegiatan');
                  setPeriodePencairanFilter('Semua Bulan');
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 border border-slate-200 rounded bg-white hover:bg-slate-100 text-slate-600 text-xs transition cursor-pointer"
              >
                Reset
              </button>

              {/* JUMLAH BARIS */}
              <div className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-500">
                <span>Tampilkan:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="py-1 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400 cursor-pointer"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
                <span>baris</span>
              </div>
            </div>

            {/* ================= INFO RIWAYAT PENCAIRAN ================= */}

            {!loading && (
              <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-[11px] text-sky-700">
                Ditemukan <strong>{filteredRiwayat.length}</strong> riwayat pencairan
                {periodePencairanFilter !== 'Semua Bulan' && (
                  <>
                    {' '}
                    pada periode pencairan <strong>{periodePencairanFilter}</strong>
                  </>
                )}{' '}
                untuk kegiatan yang sesuai filter — klik tombol aksi untuk membuka detail mitra, atau unduh Excel/PDF
                untuk laporan lengkap.
              </div>
            )}

            {/* ================= TABEL REKAP ================= */}

            <div className="mb-2 text-[11px] text-slate-500 px-1">
              {loading
                ? 'Memuat data rekap...'
                : `${totalItems} kegiatan`}
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50/60 border-b border-slate-100 text-slate-500 font-semibold">
                    <tr>
                      <th className="py-2 px-3.5 text-center w-12">No</th>
                      <th className="py-2 px-3.5">Kegiatan</th>
                      <th className="py-2 px-3.5">Periode</th>
                      <th className="py-2 px-3.5 text-right">Pagu Anggaran</th>
                      <th className="py-2 px-3.5 text-right">Terpakai</th>
                      <th className="py-2 px-3.5 text-right">Sisa</th>
                      <th className="py-2 px-3.5">Presentase</th>
                      <th className="py-2 px-3.5 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {loading ? (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-slate-400 text-xs">
                          Memuat data rekap...
                        </td>
                      </tr>
                    ) : currentData.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-slate-400 text-xs">
                          Tidak ada data kegiatan untuk ditampilkan.
                        </td>
                      </tr>
                    ) : (
                      currentData.map((row, index) => {
                        const colors = getPresentaseColor(row.presentase);
                        const barWidth = Math.min(row.presentase, 100);
                        const mitraRows = mitraDetailByKegiatan[row.id] || [];

                        return (
                          <tr key={row.id} className="hover:bg-slate-50/80 transition">
                              <td className="py-2.5 px-3.5 text-center font-medium text-slate-400">
                                {(currentPage - 1) * itemsPerPage + index + 1}
                              </td>
                              <td className="py-2.5 px-3.5">
                                <Link
                                  href={`/kegiatan/${row.id}`}
                                  className="font-semibold text-blue-600 hover:underline"
                                >
                                  {row.nama_kegiatan}
                                </Link>
                              </td>
                              <td className="py-2.5 px-3.5 text-slate-500">{row.bulan_kegiatan || '-'}</td>
                              <td className="py-2.5 px-3.5 text-right font-semibold text-slate-800">
                                {formatRupiah(row.paguAnggaran)}
                              </td>
                              <td className="py-2.5 px-3.5 text-right font-semibold text-blue-600">
                                {formatRupiah(row.terpakai)}
                              </td>
                              <td className="py-2.5 px-3.5 text-right font-semibold text-amber-600">
                                {formatRupiah(row.sisa)}
                              </td>
                              <td className="py-2.5 px-3.5">
                                <div className="flex items-center gap-2">
                                  <span className={`font-semibold ${colors.text}`}>{row.presentase}%</span>
                                  <div className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                    <div className={`h-full rounded-full ${colors.bar}`} style={{ width: `${barWidth}%` }} />
                                  </div>
                                </div>
                              </td>
                              <td className="py-2.5 px-3.5">
                                <div className="flex items-center justify-center gap-1.5">
                                  <span className="text-[10px] font-medium text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 whitespace-nowrap">
                                    {mitraRows.length} mitra
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedKegiatanId(row.id)}
                                    className="p-1.5 text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-md transition cursor-pointer"
                                    title="Detail"
                                  >
                                    👁️
                                  </button>
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
                <div className="px-4 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white">
                  <div className="text-[11px] text-slate-500">
                    Menampilkan <span className="font-semibold text-slate-700">{startItem}</span> -{' '}
                    <span className="font-semibold text-slate-700">{endItem}</span> dari{' '}
                    <span className="font-semibold text-slate-700">{totalItems}</span> data
                  </div>

                  <div className="flex items-center gap-1.5 text-xs">
                    <button
                      onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                    >
                      ‹
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((page) => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                      .map((page, idx, array) => {
                        const prevPage = array[idx - 1];
                        const showEllipsis = prevPage && page - prevPage > 1;

                        return (
                          <React.Fragment key={page}>
                            {showEllipsis && <span className="px-1 text-slate-400">...</span>}
                            <button
                              onClick={() => setCurrentPage(page)}
                              className={`px-2.5 py-1 rounded font-medium transition cursor-pointer ${
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
                      className="px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                    >
                      ›
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ================= MODAL DETAIL MITRA ================= */}
            {selectedKegiatanId !== null && (() => {
              const kegiatan = rekapList.find((r) => r.id === selectedKegiatanId);
              const mitraRows = mitraDetailByKegiatan[selectedKegiatanId] || [];

              if (!kegiatan) return null;

              const totalHonorMitra = mitraRows.reduce((sum, m) => sum + m.totalHonor, 0);
              const totalDicairkanMitra = mitraRows.reduce((sum, m) => sum + m.totalDicairkan, 0);
              const totalSisaMitra = mitraRows.reduce((sum, m) => sum + m.sisa, 0);
              const totalPencairanMitra = mitraRows.reduce((sum, m) => sum + m.jumlahPencairan, 0);

              return (
                <div
                  className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-3 sm:p-5"
                  onMouseDown={(e) => {
                    if (e.target === e.currentTarget) setSelectedKegiatanId(null);
                  }}
                >
                  <div
                    className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-xl bg-white shadow-2xl border border-slate-200"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="detail-mitra-title"
                  >
                    {/* HEADER MODAL */}
                    <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3.5 sm:px-5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                            👥
                          </span>
                          <h2 id="detail-mitra-title" className="text-sm sm:text-base font-bold text-slate-800">
                            Detail Mitra
                          </h2>
                        </div>
                        <p className="text-xs font-semibold text-slate-700 truncate">
                          {kegiatan.nama_kegiatan}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Periode: {kegiatan.bulan_kegiatan || '-'}
                        </p>
                      </div>

                      <button
                        onClick={() => setSelectedKegiatanId(null)}
                        className="shrink-0 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition cursor-pointer"
                        title="Tutup"
                        aria-label="Tutup detail mitra"
                      >
                        ✕
                      </button>
                    </div>

                    {/* RINGKASAN MODAL */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 px-4 py-3.5 sm:px-5 bg-slate-50/70 border-b border-slate-200">
                      <div className="bg-white rounded-lg border border-slate-200 p-2.5">
                        <p className="text-[10px] text-slate-500 mb-1">Total Honor</p>
                        <p className="text-xs sm:text-sm font-bold text-slate-800">
                          {formatRupiah(totalHonorMitra)}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg border border-slate-200 p-2.5">
                        <p className="text-[10px] text-slate-500 mb-1">Sudah Dicairkan</p>
                        <p className="text-xs sm:text-sm font-bold text-emerald-600">
                          {formatRupiah(totalDicairkanMitra)}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg border border-slate-200 p-2.5">
                        <p className="text-[10px] text-slate-500 mb-1">Sisa Honor</p>
                        <p className="text-xs sm:text-sm font-bold text-amber-600">
                          {formatRupiah(totalSisaMitra)}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg border border-slate-200 p-2.5">
                        <p className="text-[10px] text-slate-500 mb-1">Total Pencairan</p>
                        <p className="text-xs sm:text-sm font-bold text-blue-600">
                          {totalPencairanMitra} kali
                        </p>
                      </div>
                    </div>

                    {/* ISI MODAL */}
                    <div className="max-h-[55vh] overflow-auto px-4 py-3.5 sm:px-5">
                      {mitraRows.length === 0 ? (
                        <div className="py-10 text-center">
                          <div className="text-3xl mb-2">👥</div>
                          <p className="text-xs font-medium text-slate-600">
                            Belum ada mitra yang ditugaskan pada kegiatan ini.
                          </p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            Data detail mitra akan tampil setelah ada penugasan.
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-slate-200">
                          <table className="w-full min-w-[760px] text-[11px] text-slate-600">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                              <tr>
                                <th className="py-2.5 px-3 text-center w-10">No</th>
                                <th className="py-2.5 px-3 text-left">Nama Mitra</th>
                                <th className="py-2.5 px-3 text-left">SOBAT ID</th>
                                <th className="py-2.5 px-3 text-right">Total Honor</th>
                                <th className="py-2.5 px-3 text-right">Sudah Dicairkan</th>
                                <th className="py-2.5 px-3 text-right">Sisa</th>
                                <th className="py-2.5 px-3 text-center">Jml Pencairan</th>
                                <th className="py-2.5 px-3 text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {mitraRows.map((m, index) => (
                                <tr key={`${m.sobatId}-${index}`} className="hover:bg-slate-50/70">
                                  <td className="py-2.5 px-3 text-center text-slate-400">{index + 1}</td>
                                  <td className="py-2.5 px-3 font-medium text-slate-700">{m.namaMitra}</td>
                                  <td className="py-2.5 px-3 font-mono text-blue-600">{m.sobatId}</td>
                                  <td className="py-2.5 px-3 text-right font-medium text-slate-700">
                                    {formatRupiah(m.totalHonor)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right text-emerald-600 font-medium">
                                    {formatRupiah(m.totalDicairkan)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-medium text-amber-600">
                                    {formatRupiah(m.sisa)}
                                  </td>
                                  <td className="py-2.5 px-3 text-center">{m.jumlahPencairan}</td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span
                                      className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium border ${getStatusMitraStyle(
                                        m.status
                                      )}`}
                                    >
                                      {m.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold">
                              <tr>
                                <td colSpan={3} className="py-2.5 px-3 text-right text-slate-600">
                                  Total
                                </td>
                                <td className="py-2.5 px-3 text-right text-slate-800">
                                  {formatRupiah(totalHonorMitra)}
                                </td>
                                <td className="py-2.5 px-3 text-right text-emerald-600">
                                  {formatRupiah(totalDicairkanMitra)}
                                </td>
                                <td className="py-2.5 px-3 text-right text-amber-600">
                                  {formatRupiah(totalSisaMitra)}
                                </td>
                                <td className="py-2.5 px-3 text-center text-blue-600">
                                  {totalPencairanMitra}
                                </td>
                                <td className="py-2.5 px-3 text-center">-</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* FOOTER MODAL */}
                    <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 sm:px-5">
                      <p className="text-[10px] sm:text-[11px] text-slate-400">
                        {mitraRows.length} mitra pada kegiatan ini
                      </p>
                      <button
                        onClick={() => setSelectedKegiatanId(null)}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition cursor-pointer"
                      >
                        Tutup
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

          </div>
        </main>
      </div>
    </div>
  );
}