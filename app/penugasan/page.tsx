'use client';

// =========================================================
// LOKASI FILE INI: app/penugasan/page.tsx
//
// VERSI GABUNGAN:
// - Data penugasan tetap fokus pada informasi penugasan.
// - Total rencana pencairan dihitung dari pencairan_honor.nominal_rencana.
// - Realisasi dan sisa tidak ditampilkan di sini karena menjadi tanggung
//   jawab /pencairan.
// - Tampilan TABEL mengelompok per Mitra (expand/collapse).
// - Badge status limit dihitung PER BULAN, ditampilkan sebagai ringkasan
//   proporsi (mis. "1/3 Bulan Penuh"); rincian lengkap di Modal Detail.
// - FIX: ringkasan badge level-MITRA (getGroupLimitBadge) DEDUPE per bulan,
//   karena limit honor itu satu bucket per mitra-per-bulan yang dipakai
//   bersama lintas kegiatan.
//
// ⭐ PERUBAHAN TERBARU — CADANGAN RENCANA TERLAMBAT
//   Rencana pencairan yang sudah lewat bulannya tapi BELUM dicairkan pasti
//   akan mendarat di bulan berjalan begitu direalisasikan. Karena itu
//   nominalnya DICADANGKAN dari limit bulan berjalan milik mitra tersebut.
//
//   Contoh (masukan mentor):
//     Rencana Agustus Rp3jt belum dicairkan sampai Agustus habis.
//     Realisasi paling cepat baru bisa September → Rp3jt itu mengunci
//     limit September. Sebelumnya halaman ini masih menampilkan
//     "September: Sisa Rp3.000.000 dari Rp3.000.000" sehingga admin
//     menugaskan mitra itu lagi di September, lalu rencana Agustus
//     terdorong ke Oktober, dan seterusnya mundur terus (efek domino).
//
//   Sekarang September ditampilkan sebagai penuh/terpesan, dan penugasan
//   baru diblokir kalau SELURUH bulan periode kegiatan tidak punya sisa
//   efektif. Kalau masih ada sisa efektif, penugasan tetap boleh dibuat.
// =========================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { logActivity } from '@/lib/logActivity';

// =========================================================
// SUPABASE
// =========================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

// =========================================================
// INTERFACE
// =========================================================

interface PenugasanData {
  id?: number;
  sobat_id: string;
  kegiatan_id: number;
  status_penugasan?: string;
  created_at?: string;

  mitra?: {
    nama_mitra: string;
    posisi_mitra?: string;
    kab_kota?: string;
    no_hp?: string;
    status_keaktifan?: string;
  };

  kegiatan?: {
    nama_kegiatan: string;
    kode_kegiatan: string;
    bulan_kegiatan: string;
  };

  totalRencana?: number;
}

interface MitraOption {
  sobat_id: string;
  nama_mitra: string;
  posisi_mitra?: string;
  status_keaktifan?: string;
}

interface KegiatanOption {
  id: number;
  nama_kegiatan: string;
  kode_kegiatan: string;
  bulan_kegiatan: string;
}

interface DuplicateBlockedInfo {
  namaMitra: string;
  namaKegiatan: string;
}

interface LimitHonorRef {
  bulan_periode: string;
  batas_maksimal: number;
  persen_peringatan?: number;
}

interface PencairanRef {
  penugasan_id?: number | null;
  sobat_id: string;
  bulan_pencairan: string;
  nominal_rencana: number;
  nominal_dicairkan?: number | null;
  tgl_pencairan?: string | null;
}

const NAMA_BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const DEFAULT_WARN_PERCENT = 80;

// =========================================================
// CONSTANT
// =========================================================

const STATUS_OPTIONS = ['Semua Status', 'Ditugaskan', 'Berjalan', 'Selesai', 'Dibatalkan'];

const BULAN_OPTIONS = [
  'Semua Bulan',
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

// =========================================================
// PARSER PERIODE KEGIATAN MULTI-BULAN
// =========================================================

interface PeriodeKegiatan {
  months: string[];
  jumlahBulan: number;
  label: string;
}

const monthIndexFromName = (name: string): number =>
  NAMA_BULAN_ID.findIndex((m) => m.toLowerCase() === name.trim().toLowerCase());

const dateToMonthLabel = (dateValue: string | null | undefined): string | null => {
  if (!dateValue) return null;
  const monthKey = dateValue.slice(0, 7);
  const [year, month] = monthKey.split('-');
  const monthNumber = Number(month);
  if (!year || !monthNumber || monthNumber < 1 || monthNumber > 12) return null;
  return `${NAMA_BULAN_ID[monthNumber - 1]} ${year}`;
};

// Parse label "September 2026" → { idx, year }
const parseBulanLabel = (label: string): { idx: number; year: number } | null => {
  if (!label) return null;
  const parts = label.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const idx = monthIndexFromName(parts[0]);
  const year = parseInt(parts[1], 10);
  if (idx === -1 || isNaN(year)) return null;
  return { idx, year };
};

// Bandingkan dua label bulan secara ternormalisasi, supaya variasi spasi
// atau huruf besar/kecil tidak membuat bulan yang sama dianggap berbeda.
const bulanEquals = (a: string, b: string): boolean => {
  const pa = parseBulanLabel(a);
  const pb = parseBulanLabel(b);
  if (!pa || !pb) {
    return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
  }
  return pa.idx === pb.idx && pa.year === pb.year;
};

// Sama persis dengan /pencairan: akhir bulan dihitung 23:59:59.999 di hari
// terakhir bulan itu, supaya status "terlambat" konsisten antar halaman.
const isBulanLewat = (label: string): boolean => {
  const parsed = parseBulanLabel(label);
  if (!parsed) return false;
  const endOfBulan = new Date(parsed.year, parsed.idx + 1, 0, 23, 59, 59, 999);
  return endOfBulan < new Date();
};

// Label bulan kalender berjalan — tujuan mendarat semua rencana terlambat.
const getBulanBerjalanLabel = (): string => {
  const now = new Date();
  return `${NAMA_BULAN_ID[now.getMonth()]} ${now.getFullYear()}`;
};

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

const RANGE_REGEX = /^([A-Za-zÀ-ÿ]+)\s+(\d{4})\s*-\s*([A-Za-zÀ-ÿ]+)\s+(\d{4})$/i;
const RANGE_SD_REGEX = /^([A-Za-zÀ-ÿ]+)\s+(\d{4})\s*s\.?\s*d\.?\s*([A-Za-zÀ-ÿ]+)\s+(\d{4})(?:\s*\((\d+)\s*Bulan\))?$/i;
const SINGLE_REGEX = /^([A-Za-zÀ-ÿ]+)\s+(\d{4})\s*\((\d+)\s*Bulan\)$/i;

const parseBulanKegiatan = (raw: string | null | undefined): PeriodeKegiatan => {
  const text = (raw || '').trim();
  if (!text) return { months: [], jumlahBulan: 0, label: '-' };

  const rangeMatch = text.match(RANGE_REGEX);
  if (rangeMatch) {
    const [, startName, startYearStr, endName, endYearStr] = rangeMatch;
    const startIdx = monthIndexFromName(startName);
    const endIdx = monthIndexFromName(endName);
    const startYear = parseInt(startYearStr, 10);
    const endYear = parseInt(endYearStr, 10);
    if (startIdx !== -1 && endIdx !== -1) {
      const totalBulan = (endYear - startYear) * 12 + (endIdx - startIdx) + 1;
      if (totalBulan > 0 && totalBulan <= 36) {
        return {
          months: generateMonthSequence(startIdx, startYear, totalBulan),
          jumlahBulan: totalBulan,
          label: text,
        };
      }
    }
  }

  const rangeSdMatch = text.match(RANGE_SD_REGEX);
  if (rangeSdMatch) {
    const [, startName, startYearStr, endName, endYearStr, jumlahStr] = rangeSdMatch;
    const startIdx = monthIndexFromName(startName);
    const endIdx = monthIndexFromName(endName);
    const startYear = parseInt(startYearStr, 10);
    const endYear = parseInt(endYearStr, 10);
    if (startIdx !== -1 && endIdx !== -1) {
      const calculatedJumlahBulan = (endYear - startYear) * 12 + (endIdx - startIdx) + 1;
      if (calculatedJumlahBulan > 0 && calculatedJumlahBulan <= 36) {
        const jumlahBulanDariTeks = jumlahStr ? parseInt(jumlahStr, 10) : calculatedJumlahBulan;
        const jumlahBulan =
          jumlahBulanDariTeks > 0 && jumlahBulanDariTeks <= 36
            ? jumlahBulanDariTeks
            : calculatedJumlahBulan;
        return {
          months: generateMonthSequence(startIdx, startYear, jumlahBulan),
          jumlahBulan,
          label: text,
        };
      }
    }
  }

  const singleMatch = text.match(SINGLE_REGEX);
  if (singleMatch) {
    const [, monthName, yearStr, jumlahStr] = singleMatch;
    const startIdx = monthIndexFromName(monthName);
    const jumlah = Math.max(parseInt(jumlahStr, 10) || 1, 1);
    if (startIdx !== -1) {
      return {
        months: generateMonthSequence(startIdx, parseInt(yearStr, 10), jumlah),
        jumlahBulan: jumlah,
        label: text,
      };
    }
  }

  return { months: [text], jumlahBulan: 1, label: text };
};

// =========================================================
// STATUS LIMIT PER BULAN
// =========================================================

interface MonthLimitStatus {
  bulan: string;
  limit: number | null; // null = belum diatur
  used: number; // beban nyata (rencana + realisasi) di bulan itu
  cadangan: number; // ⭐ dipesan rencana terlambat yang belum dicairkan
  sisa: number | null; // limit - used - cadangan (sisa EFEKTIF)
  warnPercent: number;
  isUnset: boolean;
  isFull: boolean;
  isWarning: boolean;
  isBlockedByCadangan: boolean; // penuhnya karena cadangan, bukan beban nyata
}

interface MitraGroup {
  sobat_id: string;
  mitra?: PenugasanData['mitra'];
  items: PenugasanData[];
  totalRencana: number;
}

export default function PenugasanPage() {
  const router = useRouter();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);

  const [penugasanListRaw, setPenugasanListRaw] = useState<PenugasanData[]>([]);
  const [penugasanList, setPenugasanList] = useState<PenugasanData[]>([]);
  const [mitraOptions, setMitraOptions] = useState<MitraOption[]>([]);
  const [kegiatanOptions, setKegiatanOptions] = useState<KegiatanOption[]>([]);

  const [loading, setLoading] = useState<boolean>(true);

  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('Semua Status');
  const [bulanFilter, setBulanFilter] = useState<string>('Semua Bulan');
  const [kegiatanFilter, setKegiatanFilter] = useState<string>('Semua Kegiatan');

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);

  const [expandedMitraIds, setExpandedMitraIds] = useState<Set<string>>(new Set());

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [detailPenugasan, setDetailPenugasan] = useState<PenugasanData | null>(null);

  const [formData, setFormData] = useState<PenugasanData>({
    sobat_id: '',
    kegiatan_id: 0,
    status_penugasan: 'Ditugaskan',
  });

  // Combobox pencarian mitra
  const [isMitraDropdownOpen, setIsMitraDropdownOpen] = useState<boolean>(false);
  const [mitraSearchKeyword, setMitraSearchKeyword] = useState<string>('');
  const mitraDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (mitraDropdownRef.current && !mitraDropdownRef.current.contains(e.target as Node)) {
        setIsMitraDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState<boolean>(false);
  const [isBulkStatusModalOpen, setIsBulkStatusModalOpen] = useState<boolean>(false);
  const [bulkStatusValue, setBulkStatusValue] = useState<string>('Selesai');
  const [isBulkStatusSubmitting, setIsBulkStatusSubmitting] = useState<boolean>(false);

  const [isDuplicateBlockedModalOpen, setIsDuplicateBlockedModalOpen] = useState<boolean>(false);
  const [duplicateBlockedInfo, setDuplicateBlockedInfo] = useState<DuplicateBlockedInfo | null>(null);

  // Data referensi limit honor bulanan
  const [limitRefList, setLimitRefList] = useState<LimitHonorRef[]>([]);
  const [pencairanRefList, setPencairanRefList] = useState<PencairanRef[]>([]);

  const bulanBerjalan = useMemo(() => getBulanBerjalanLabel(), []);

  // ---------------------------------------------------------
  // FETCH
  // ---------------------------------------------------------

  const fetchDropdownData = useCallback(async () => {
    try {
      const { data: resMitra, error: errMitra } = await supabase
        .from('mitra')
        .select('sobat_id, nama_mitra, posisi_mitra, status_keaktifan')
        .order('nama_mitra');
      if (errMitra) console.error('Error fetching mitra:', errMitra.message);
      if (resMitra) setMitraOptions(resMitra);

      const { data: resKegiatan, error: errKegiatan } = await supabase
        .from('kegiatan')
        .select('id, nama_kegiatan, kode_kegiatan, bulan_kegiatan')
        .order('nama_kegiatan');
      if (errKegiatan) console.error('Error fetching kegiatan:', errKegiatan.message);
      if (resKegiatan) setKegiatanOptions(resKegiatan);

      const { data: resLimit, error: errLimit } = await supabase
        .from('limit_honor')
        .select('bulan_periode, batas_maksimal, persen_peringatan');
      if (errLimit) console.error('Error fetching limit_honor:', errLimit.message);
      if (resLimit) setLimitRefList(resLimit);

      const { data: resPencairan, error: errPencairan } = await supabase
        .from('pencairan_honor')
        .select(
          'penugasan_id, sobat_id, bulan_pencairan, nominal_rencana, nominal_dicairkan, tgl_pencairan'
        );
      if (errPencairan) console.error('Error fetching pencairan_honor:', errPencairan.message);
      if (resPencairan) setPencairanRefList(resPencairan);
    } catch (error) {
      console.error('Error fetching dropdown data:', error);
    }
  }, []);

  const fetchPenugasan = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('penugasan')
        .select(`
          *,
          mitra:sobat_id ( nama_mitra, posisi_mitra, kab_kota, no_hp, status_keaktifan ),
          kegiatan:kegiatan_id ( nama_kegiatan, kode_kegiatan, bulan_kegiatan )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const { data: pencairanTotals, error: pencairanTotalsError } = await supabase
        .from('pencairan_honor')
        .select('penugasan_id, nominal_rencana');

      if (pencairanTotalsError) throw pencairanTotalsError;

      const totalsByPenugasan: Record<number, number> = {};

      (pencairanTotals || []).forEach((row: any) => {
        const penugasanId = Number(row.penugasan_id);
        if (!Number.isFinite(penugasanId)) return;
        totalsByPenugasan[penugasanId] =
          (totalsByPenugasan[penugasanId] || 0) + (Number(row.nominal_rencana) || 0);
      });

      const allData: PenugasanData[] = (data || []).map((item: any) => ({
        ...item,
        totalRencana: totalsByPenugasan[Number(item.id)] || 0,
      }));

      setPenugasanListRaw(allData);

      let filteredData: PenugasanData[] = [...allData];

      if (statusFilter !== 'Semua Status') {
        filteredData = filteredData.filter((item) => item.status_penugasan === statusFilter);
      }

      if (searchKeyword.trim()) {
        const kw = searchKeyword.trim().toLowerCase();
        filteredData = filteredData.filter(
          (item) =>
            item.sobat_id?.toLowerCase().includes(kw) ||
            item.mitra?.nama_mitra?.toLowerCase().includes(kw) ||
            item.mitra?.posisi_mitra?.toLowerCase().includes(kw) ||
            item.kegiatan?.nama_kegiatan?.toLowerCase().includes(kw) ||
            item.kegiatan?.kode_kegiatan?.toLowerCase().includes(kw)
        );
      }

      if (bulanFilter !== 'Semua Bulan') {
        filteredData = filteredData.filter((item) => {
          const periodeInfo = parseBulanKegiatan(item.kegiatan?.bulan_kegiatan);
          return periodeInfo.months.some((bulanLengkap) => {
            const namaBulanSaja = bulanLengkap.split(' ')[0] || '';
            return namaBulanSaja.toLowerCase() === bulanFilter.toLowerCase();
          });
        });
      }

      if (kegiatanFilter !== 'Semua Kegiatan') {
        filteredData = filteredData.filter((item) => String(item.kegiatan_id) === kegiatanFilter);
      }

      setPenugasanList(filteredData);
      setCurrentPage(1);
      setSelectedIds([]);
    } catch (error: any) {
      console.error('Error fetching penugasan:', error);
      alert('Gagal memuat data penugasan: ' + (error?.message || 'Terjadi kesalahan'));
    } finally {
      setLoading(false);
    }
  }, [searchKeyword, statusFilter, bulanFilter, kegiatanFilter]);

  useEffect(() => {
    fetchDropdownData();
  }, [fetchDropdownData]);

  useEffect(() => {
    fetchPenugasan();
  }, [fetchPenugasan]);

  // =========================================================
  // MITRA AKTIF vs NONAKTIF
  // =========================================================
  const selectableMitraOptions = useMemo(() => {
    return mitraOptions.filter(
      (m) => m.status_keaktifan !== 'Nonaktif' || (isEditMode && m.sobat_id === formData.sobat_id)
    );
  }, [mitraOptions, isEditMode, formData.sobat_id]);

  const filteredMitraOptionsForCombobox = useMemo(() => {
    const kw = mitraSearchKeyword.trim().toLowerCase();
    if (!kw) return selectableMitraOptions;
    return selectableMitraOptions.filter(
      (m) => m.nama_mitra.toLowerCase().includes(kw) || m.sobat_id.toLowerCase().includes(kw)
    );
  }, [selectableMitraOptions, mitraSearchKeyword]);

  const selectedMitraOption = useMemo(
    () => mitraOptions.find((m) => m.sobat_id === formData.sobat_id) || null,
    [mitraOptions, formData.sobat_id]
  );

  const checkDuplicateAssignment = useCallback(
    (
      sobatId: string,
      kegiatanId: number,
      excludePenugasanId?: number
    ): DuplicateBlockedInfo | null => {
      if (!sobatId || !kegiatanId) return null;
      const existing = penugasanListRaw.find(
        (item) =>
          item.sobat_id === sobatId &&
          item.kegiatan_id === kegiatanId &&
          (!excludePenugasanId || item.id !== excludePenugasanId)
      );
      if (existing) {
        const mitraInfo = mitraOptions.find((m) => m.sobat_id === sobatId);
        const kegiatanInfo = kegiatanOptions.find((k) => k.id === kegiatanId);
        return {
          namaMitra: mitraInfo?.nama_mitra || sobatId,
          namaKegiatan: kegiatanInfo?.nama_kegiatan || 'kegiatan ini',
        };
      }
      return null;
    },
    [penugasanListRaw, mitraOptions, kegiatanOptions]
  );

  const handleSelectMitraInForm = (sobatId: string) => {
    const blockedDuplicate = checkDuplicateAssignment(
      sobatId,
      formData.kegiatan_id,
      isEditMode ? formData.id : undefined
    );
    if (blockedDuplicate) {
      setDuplicateBlockedInfo(blockedDuplicate);
      setIsDuplicateBlockedModalOpen(true);
      return;
    }
    setFormData((prev) => ({ ...prev, sobat_id: sobatId }));
  };

  const handleSelectKegiatanInForm = (kegiatanId: number) => {
    if (formData.sobat_id) {
      const blockedDuplicate = checkDuplicateAssignment(
        formData.sobat_id,
        kegiatanId,
        isEditMode ? formData.id : undefined
      );
      if (blockedDuplicate) {
        setDuplicateBlockedInfo(blockedDuplicate);
        setIsDuplicateBlockedModalOpen(true);
        return;
      }
    }
    setFormData((prev) => ({ ...prev, kegiatan_id: kegiatanId }));
  };

  const currentFormPeriodeInfo = useMemo(() => {
    const kegiatan = kegiatanOptions.find((k) => k.id === formData.kegiatan_id);
    const raw = kegiatan?.bulan_kegiatan || kegiatanOptions[0]?.bulan_kegiatan || '';
    return parseBulanKegiatan(raw);
  }, [formData.kegiatan_id, kegiatanOptions]);

  // =========================================================
  // BEBAN NYATA per (mitra, bulan)
  //
  // ATURAN SAMA DENGAN /pencairan:
  // - Belum terealisasi -> membebani BULAN RENCANA.
  // - Sudah terealisasi -> membebani BULAN TANGGAL REALISASI.
  // =========================================================
  const totalRencanaByMitraBulanRef = useMemo(() => {
    const map: Record<string, number> = {};

    pencairanRefList.forEach((r) => {
      const sudahRealisasi =
        r.nominal_dicairkan !== null && r.nominal_dicairkan !== undefined;

      const bulanPenggunaan =
        sudahRealisasi && r.tgl_pencairan
          ? dateToMonthLabel(r.tgl_pencairan)
          : r.bulan_pencairan;

      if (!bulanPenggunaan) return;

      const nominal = sudahRealisasi
        ? Number(r.nominal_dicairkan) || 0
        : Number(r.nominal_rencana) || 0;

      const key = `${r.sobat_id}__${bulanPenggunaan}`;
      map[key] = (map[key] || 0) + nominal;
    });

    return map;
  }, [pencairanRefList]);

  // =========================================================
  // ⭐ RENCANA TERLAMBAT & CADANGAN LIMIT BULAN BERJALAN
  // =========================================================

  // Daftar rencana terlambat (belum dicairkan, bulan rencananya sudah lewat)
  // per mitra. Dipakai untuk mencadangkan limit bulan berjalan sekaligus
  // menampilkan penjelasan ke admin.
  const rowsTerlambatByMitra = useMemo(() => {
    const map: Record<string, PencairanRef[]> = {};

    pencairanRefList.forEach((r) => {
      const sudahRealisasi =
        r.nominal_dicairkan !== null && r.nominal_dicairkan !== undefined;
      if (sudahRealisasi) return;
      if (!r.bulan_pencairan) return;
      if (!isBulanLewat(r.bulan_pencairan)) return;
      if (bulanEquals(r.bulan_pencairan, bulanBerjalan)) return;

      if (!map[r.sobat_id]) map[r.sobat_id] = [];
      map[r.sobat_id].push(r);
    });

    return map;
  }, [pencairanRefList, bulanBerjalan]);

  // Cadangan hanya membebani BULAN BERJALAN, bukan seluruh bulan ke depan.
  // Kalau semua bulan ikut dikunci, admin tidak bisa menjadwalkan apa pun.
  const getCadanganTerlambat = useCallback(
    (sobatId: string, bulan: string): number => {
      if (!bulanEquals(bulan, bulanBerjalan)) return 0;
      return (rowsTerlambatByMitra[sobatId] || []).reduce(
        (sum, r) => sum + (Number(r.nominal_rencana) || 0),
        0
      );
    },
    [rowsTerlambatByMitra, bulanBerjalan]
  );

  const getLimitObjectForPeriode = useCallback(
    (periode: string) => {
      return limitRefList.find((l) => bulanEquals(l.bulan_periode || '', periode)) || null;
    },
    [limitRefList]
  );

  // Rencana terlambat milik mitra yang sedang dipilih di form.
  const rowsTerlambatForForm = useMemo(
    () => (formData.sobat_id ? rowsTerlambatByMitra[formData.sobat_id] || [] : []),
    [rowsTerlambatByMitra, formData.sobat_id]
  );

  // Tabel referensi sisa limit per bulan untuk mitra yang sedang dipilih.
  // Sisa yang ditampilkan adalah SISA EFEKTIF (sudah dikurangi cadangan).
  const limitReferenceRows = useMemo(() => {
    if (!formData.sobat_id || currentFormPeriodeInfo.months.length === 0) return [];

    return currentFormPeriodeInfo.months.map((bulanLabel) => {
      const limitObj = getLimitObjectForPeriode(bulanLabel);
      const used = totalRencanaByMitraBulanRef[`${formData.sobat_id}__${bulanLabel}`] || 0;
      const cadangan = getCadanganTerlambat(formData.sobat_id, bulanLabel);
      const limit = limitObj ? Number(limitObj.batas_maksimal) : null;
      const sisa = limit !== null ? limit - used - cadangan : null;

      return {
        bulanLabel,
        limit,
        used,
        cadangan,
        sisa,
        unset: limit === null,
        blockedByCadangan: cadangan > 0 && sisa !== null && sisa <= 0,
      };
    });
  }, [
    formData.sobat_id,
    currentFormPeriodeInfo.months,
    getLimitObjectForPeriode,
    totalRencanaByMitraBulanRef,
    getCadanganTerlambat,
  ]);

  // BLOKIR KERAS di form: kalau SEMUA bulan periode kegiatan tidak punya
  // sisa efektif, Penugasan tidak boleh disimpan.
  const isPenugasanBlockedByLimit = useMemo(() => {
    if (limitReferenceRows.length === 0) return false;
    return limitReferenceRows.every((r) => !r.unset && r.sisa !== null && r.sisa <= 0);
  }, [limitReferenceRows]);

  // Apakah blokirnya disebabkan cadangan rencana terlambat? Ini menentukan
  // pesan yang ditampilkan ke admin (tindak lanjutnya beda).
  const isBlockedByCadanganTerlambat = useMemo(
    () => isPenugasanBlockedByLimit && limitReferenceRows.some((r) => r.blockedByCadangan),
    [isPenugasanBlockedByLimit, limitReferenceRows]
  );

  // =========================================================
  // STATUS LIMIT PER BULAN UNTUK 1 BARIS PENUGASAN
  // =========================================================
  const getRowMonthStatuses = useCallback(
    (item: PenugasanData, focusBulanName?: string): MonthLimitStatus[] => {
      const periodeInfo = parseBulanKegiatan(item.kegiatan?.bulan_kegiatan);
      const monthsToShow = focusBulanName
        ? periodeInfo.months.filter(
            (m) => (m.split(' ')[0] || '').toLowerCase() === focusBulanName.toLowerCase()
          )
        : periodeInfo.months;

      return monthsToShow.map((bulan) => {
        const limitObj = getLimitObjectForPeriode(bulan);
        const used = totalRencanaByMitraBulanRef[`${item.sobat_id}__${bulan}`] || 0;
        const cadangan = getCadanganTerlambat(item.sobat_id, bulan);

        if (!limitObj) {
          return {
            bulan,
            limit: null,
            used,
            cadangan,
            sisa: null,
            warnPercent: DEFAULT_WARN_PERCENT,
            isUnset: true,
            isFull: false,
            isWarning: false,
            isBlockedByCadangan: false,
          };
        }

        const limit = Number(limitObj.batas_maksimal);
        const warnPercent = Number(limitObj.persen_peringatan) || DEFAULT_WARN_PERCENT;
        const terpakai = used + cadangan;
        const sisa = limit - terpakai;
        const usagePercent = limit > 0 ? (terpakai / limit) * 100 : 0;
        const isFull = sisa <= 0;
        const isWarning = !isFull && usagePercent >= warnPercent;

        return {
          bulan,
          limit,
          used,
          cadangan,
          sisa,
          warnPercent,
          isUnset: false,
          isFull,
          isWarning,
          isBlockedByCadangan: cadangan > 0 && isFull,
        };
      });
    },
    [getLimitObjectForPeriode, totalRencanaByMitraBulanRef, getCadanganTerlambat]
  );

  const getRowLimitBadge = useCallback(
    (item: PenugasanData, focusBulanName?: string) => {
      const statuses = getRowMonthStatuses(item, focusBulanName);
      if (statuses.length === 0) return null;

      const total = statuses.length;
      const unsetCount = statuses.filter((s) => s.isUnset).length;
      const fullCount = statuses.filter((s) => !s.isUnset && s.isFull).length;
      const warnCount = statuses.filter((s) => !s.isUnset && !s.isFull && s.isWarning).length;
      const cadanganCount = statuses.filter((s) => s.isBlockedByCadangan).length;

      if (unsetCount > 0) {
        return {
          label:
            total > 1 ? `Belum Disetting (${unsetCount}/${total} bln)` : 'Belum Disetting',
          style: 'bg-purple-50 text-purple-700 border-purple-200',
          icon: '🟣',
        };
      }
      if (fullCount > 0) {
        // Kalau penuhnya karena rencana terlambat, beri label berbeda supaya
        // admin tahu tindak lanjutnya adalah mencairkan, bukan menunggu.
        if (cadanganCount > 0 && cadanganCount === fullCount) {
          return {
            label:
              total > 1
                ? `${fullCount}/${total} Bulan Terpesan`
                : 'Terpesan Pencairan Terlambat',
            style: 'bg-orange-50 text-orange-700 border-orange-300',
            icon: '⚠️',
          };
        }
        return {
          label: total > 1 ? `${fullCount}/${total} Bulan Penuh` : 'Limit Penuh',
          style: 'bg-rose-50 text-rose-700 border-rose-200',
          icon: '🔴',
        };
      }
      if (warnCount > 0) {
        return {
          label: total > 1 ? `${warnCount}/${total} Bulan Mendekati` : 'Mendekati Limit',
          style: 'bg-amber-50 text-amber-700 border-amber-200',
          icon: '🟡',
        };
      }
      return {
        label: 'Aman',
        style: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        icon: '🟢',
      };
    },
    [getRowMonthStatuses]
  );

  const activeFocusBulan = bulanFilter !== 'Semua Bulan' ? bulanFilter : undefined;

  // =========================================================
  // GROUPING PER MITRA
  // =========================================================
  const groupedByMitra = useMemo<MitraGroup[]>(() => {
    const map = new Map<string, MitraGroup>();

    penugasanList.forEach((item) => {
      const key = item.sobat_id;
      if (!map.has(key)) {
        map.set(key, {
          sobat_id: key,
          mitra: item.mitra,
          items: [],
          totalRencana: 0,
        });
      }
      const group = map.get(key)!;
      group.items.push(item);
      group.totalRencana += Number(item.totalRencana) || 0;
    });

    const groups = Array.from(map.values()).map((group) => {
      group.items = [...group.items].sort((a, b) =>
        (a.kegiatan?.nama_kegiatan || '').localeCompare(b.kegiatan?.nama_kegiatan || '')
      );
      return group;
    });

    groups.sort((a, b) => (a.mitra?.nama_mitra || '').localeCompare(b.mitra?.nama_mitra || ''));
    return groups;
  }, [penugasanList]);

  const getGroupLimitBadge = useCallback(
    (group: MitraGroup) => {
      const monthStatusMap = new Map<string, MonthLimitStatus>();

      group.items.forEach((item) => {
        const statuses = getRowMonthStatuses(item, activeFocusBulan);
        statuses.forEach((s) => {
          if (!monthStatusMap.has(s.bulan)) {
            monthStatusMap.set(s.bulan, s);
          }
        });
      });

      const uniqueStatuses = Array.from(monthStatusMap.values());
      const total = uniqueStatuses.length;
      const unsetCount = uniqueStatuses.filter((s) => s.isUnset).length;
      const fullCount = uniqueStatuses.filter((s) => !s.isUnset && s.isFull).length;
      const warnCount = uniqueStatuses.filter(
        (s) => !s.isUnset && !s.isFull && s.isWarning
      ).length;
      const cadanganCount = uniqueStatuses.filter((s) => s.isBlockedByCadangan).length;

      if (total === 0)
        return { label: '-', style: 'bg-slate-50 text-slate-400 border-slate-200', icon: '' };

      if (unsetCount > 0) {
        return {
          label:
            total > 1 ? `Belum Disetting (${unsetCount}/${total} bln)` : 'Belum Disetting',
          style: 'bg-purple-50 text-purple-700 border-purple-200',
          icon: '🟣',
        };
      }
      if (fullCount > 0) {
        if (cadanganCount > 0 && cadanganCount === fullCount) {
          return {
            label:
              total > 1
                ? `${fullCount}/${total} Bulan Terpesan`
                : 'Terpesan Pencairan Terlambat',
            style: 'bg-orange-50 text-orange-700 border-orange-300',
            icon: '⚠️',
          };
        }
        return {
          label: total > 1 ? `${fullCount}/${total} Bulan Penuh` : 'Limit Penuh',
          style: 'bg-rose-50 text-rose-700 border-rose-200',
          icon: '🔴',
        };
      }
      if (warnCount > 0) {
        return {
          label: total > 1 ? `${warnCount}/${total} Bulan Mendekati` : 'Mendekati Limit',
          style: 'bg-amber-50 text-amber-700 border-amber-200',
          icon: '🟡',
        };
      }
      return {
        label: 'Aman',
        style: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        icon: '🟢',
      };
    },
    [getRowMonthStatuses, activeFocusBulan]
  );

  // Daftar mitra (dari data yang sedang tampil) yang punya rencana terlambat,
  // untuk notifikasi ringkas di atas tabel.
  const mitraDenganTerlambat = useMemo(() => {
    const result: {
      sobatId: string;
      namaMitra: string;
      rows: PencairanRef[];
      totalCadangan: number;
    }[] = [];

    const sobatIdsTampil = new Set(penugasanList.map((p) => p.sobat_id));

    Object.entries(rowsTerlambatByMitra).forEach(([sobatId, rowsTerlambat]) => {
      if (!sobatIdsTampil.has(sobatId)) return;

      const namaMitra =
        penugasanList.find((p) => p.sobat_id === sobatId)?.mitra?.nama_mitra || sobatId;

      result.push({
        sobatId,
        namaMitra,
        rows: rowsTerlambat,
        totalCadangan: rowsTerlambat.reduce(
          (sum, r) => sum + (Number(r.nominal_rencana) || 0),
          0
        ),
      });
    });

    return result.sort((a, b) => b.totalCadangan - a.totalCadangan);
  }, [rowsTerlambatByMitra, penugasanList]);

  const totalMitraCount = groupedByMitra.length;
  const totalPenugasanCount = penugasanList.length;
  const totalPages = Math.ceil(totalMitraCount / itemsPerPage) || 1;

  const currentGroups = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return groupedByMitra.slice(start, start + itemsPerPage);
  }, [groupedByMitra, currentPage, itemsPerPage]);

  const startItem = totalMitraCount === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalMitraCount);

  const currentItemIds = useMemo(
    () => currentGroups.flatMap((g) => g.items.map((item) => item.id!).filter(Boolean)),
    [currentGroups]
  );

  const isAllCurrentPageSelected =
    currentItemIds.length > 0 && currentItemIds.every((id) => selectedIds.includes(id));
  const isSomeCurrentPageSelected =
    currentItemIds.some((id) => selectedIds.includes(id)) && !isAllCurrentPageSelected;

  const handleToggleSelectOne = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleToggleSelectAllCurrentPage = () => {
    if (isAllCurrentPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !currentItemIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...currentItemIds])));
    }
  };

  const handleToggleSelectGroup = (groupItemIds: number[]) => {
    const allSelected =
      groupItemIds.length > 0 && groupItemIds.every((id) => selectedIds.includes(id));
    setSelectedIds((prev) => {
      if (allSelected) return prev.filter((id) => !groupItemIds.includes(id));
      return Array.from(new Set([...prev, ...groupItemIds]));
    });
  };

  const handleClearSelection = () => setSelectedIds([]);

  const handleToggleExpand = (sobatId: string) => {
    setExpandedMitraIds((prev) => {
      const next = new Set(prev);
      if (next.has(sobatId)) next.delete(sobatId);
      else next.add(sobatId);
      return next;
    });
  };

  const handleExpandAll = () =>
    setExpandedMitraIds(new Set(groupedByMitra.map((g) => g.sobat_id)));
  const handleCollapseAll = () => setExpandedMitraIds(new Set());

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (
      !window.confirm(`Apakah Anda yakin ingin menghapus ${selectedIds.length} penugasan terpilih?`)
    )
      return;

    setIsBulkDeleting(true);
    try {
      const { error } = await supabase.from('penugasan').delete().in('id', selectedIds);
      if (error) throw error;
      alert(`${selectedIds.length} penugasan berhasil dihapus.`);
      await logActivity({
        aksi: 'hapus',
        entitas: 'penugasan',
        deskripsi: `Menghapus ${selectedIds.length} penugasan sekaligus`,
      });
      setSelectedIds([]);
      fetchPenugasan();
      fetchDropdownData();
    } catch (error: any) {
      alert('Gagal menghapus penugasan terpilih: ' + (error.message || 'Terjadi kesalahan'));
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleBulkStatusChange = async () => {
    if (selectedIds.length === 0) return;
    setIsBulkStatusSubmitting(true);
    try {
      const { error } = await supabase
        .from('penugasan')
        .update({ status_penugasan: bulkStatusValue })
        .in('id', selectedIds);
      if (error) throw error;
      alert(`Status ${selectedIds.length} penugasan berhasil diubah menjadi "${bulkStatusValue}".`);
      await logActivity({
        aksi: 'ubah',
        entitas: 'penugasan',
        deskripsi: `Mengubah status ${selectedIds.length} penugasan sekaligus menjadi "${bulkStatusValue}"`,
      });
      setIsBulkStatusModalOpen(false);
      setSelectedIds([]);
      fetchPenugasan();
    } catch (error: any) {
      alert('Gagal mengubah status: ' + (error.message || 'Terjadi kesalahan'));
    } finally {
      setIsBulkStatusSubmitting(false);
    }
  };

  const formatRupiah = (val: number) => `Rp ${(Number(val) || 0).toLocaleString('id-ID')}`;

  const handleExportPDF = () => {
    if (penugasanList.length === 0) {
      alert('Tidak ada data penugasan untuk diexport.');
      return;
    }

    const doc = new jsPDF('landscape', 'mm', 'a4');
    doc.setFontSize(14);
    doc.text('BADAN PUSAT STATISTIK KOTA MOJOKERTO', 14, 15);
    doc.setFontSize(10);
    doc.text('Daftar Penugasan Mitra Statistik', 14, 21);
    doc.setFontSize(8);
    doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`, 14, 26);

    let filterText = 'Filter: ';
    const filters: string[] = [];
    if (searchKeyword.trim()) filters.push(`Pencarian "${searchKeyword}"`);
    if (statusFilter !== 'Semua Status') filters.push(`Status ${statusFilter}`);
    if (bulanFilter !== 'Semua Bulan') filters.push(`Bulan ${bulanFilter}`);
    if (kegiatanFilter !== 'Semua Kegiatan') {
      const kegiatan = kegiatanOptions.find((k) => String(k.id) === kegiatanFilter);
      filters.push(`Kegiatan ${kegiatan?.nama_kegiatan || '-'}`);
    }
    filterText += filters.length > 0 ? filters.join(', ') : 'Semua Data';
    doc.text(filterText, 14, 31);

    const tableBody = penugasanList.map((item, index) => [
      index + 1,
      item.sobat_id || '-',
      item.mitra?.nama_mitra || '-',
      item.kegiatan?.nama_kegiatan || '-',
      item.mitra?.posisi_mitra || '-',
      `Rp ${(item.totalRencana || 0).toLocaleString('id-ID')}`,
      item.status_penugasan || 'Ditugaskan',
    ]);

    autoTable(doc, {
      startY: 36,
      head: [
        ['No', 'SOBAT ID', 'Nama Mitra', 'Kegiatan BPS', 'Posisi Mitra', 'Total Rencana', 'Status'],
      ],
      body: tableBody,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
      },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 25 },
        2: { cellWidth: 45 },
        3: { cellWidth: 55 },
        4: { cellWidth: 35 },
        5: { cellWidth: 30, halign: 'right' },
        6: { cellWidth: 20, halign: 'center' },
      },
    });

    doc.save(`Data_Penugasan_BPS_Mojokerto_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handleOpenAddModal = () => {
    setIsEditMode(false);
    const defaultKegiatanId = kegiatanOptions[0]?.id || 0;
    const firstAvailableMitra = mitraOptions.find((m) => m.status_keaktifan !== 'Nonaktif');

    setFormData({
      sobat_id: firstAvailableMitra?.sobat_id || '',
      kegiatan_id: defaultKegiatanId,
      status_penugasan: 'Ditugaskan',
    });
    setMitraSearchKeyword('');
    setIsMitraDropdownOpen(false);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (penugasan: PenugasanData) => {
    setIsEditMode(true);
    setFormData({
      id: penugasan.id,
      sobat_id: penugasan.sobat_id,
      kegiatan_id: penugasan.kegiatan_id,
      status_penugasan: penugasan.status_penugasan || 'Ditugaskan',
    });
    setMitraSearchKeyword('');
    setIsMitraDropdownOpen(false);
    setIsModalOpen(true);
  };

  const handleSavePenugasan = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.sobat_id || !formData.kegiatan_id) {
      alert('Pilih Mitra dan Kegiatan BPS terlebih dahulu!');
      return;
    }

    const blockedDuplicate = checkDuplicateAssignment(
      formData.sobat_id,
      formData.kegiatan_id,
      isEditMode ? formData.id : undefined
    );
    if (blockedDuplicate) {
      setDuplicateBlockedInfo(blockedDuplicate);
      setIsDuplicateBlockedModalOpen(true);
      return;
    }

    if (isPenugasanBlockedByLimit) {
      const namaMitra =
        mitraOptions.find((m) => m.sobat_id === formData.sobat_id)?.nama_mitra ||
        formData.sobat_id;

      if (isBlockedByCadanganTerlambat) {
        const daftarTerlambat = rowsTerlambatForForm
          .map((r) => `   • ${r.bulan_pencairan} — ${formatRupiah(r.nominal_rencana)}`)
          .join('\n');

        alert(
          `Penugasan untuk ${namaMitra} tidak dapat disimpan.\n\n` +
            `Mitra ini masih punya rencana pencairan yang TERLAMBAT dan belum dicairkan:\n` +
            `${daftarTerlambat}\n\n` +
            `Rencana tersebut hanya bisa direalisasikan paling cepat bulan ${bulanBerjalan}, ` +
            `sehingga limit ${bulanBerjalan} sudah dicadangkan untuknya dan tidak tersisa ` +
            `kapasitas untuk penugasan baru di periode kegiatan ini.\n\n` +
            `Tindak lanjut: buka menu Pencairan, lalu cairkan (tandai realisasi) rencana ` +
            `terlambat itu, atau pindahkan ke bulan lain yang masih punya kapasitas. ` +
            `Setelah itu penugasan ini bisa disimpan kalau masih ada sisa limit.`
        );
      } else {
        alert(
          'Penugasan tidak dapat disimpan: limit honor mitra ini sudah penuh di seluruh bulan periode kegiatan ini. ' +
            'Pilih kegiatan lain, atau tunggu sampai ada bulan dengan sisa limit.'
        );
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        sobat_id: formData.sobat_id,
        kegiatan_id: formData.kegiatan_id,
        status_penugasan: formData.status_penugasan,
      };

      const namaMitra =
        mitraOptions.find((m) => m.sobat_id === formData.sobat_id)?.nama_mitra ||
        formData.sobat_id;
      const namaKegiatan =
        kegiatanOptions.find((k) => k.id === formData.kegiatan_id)?.nama_kegiatan || 'kegiatan';

      if (isEditMode && formData.id) {
        const { error } = await supabase.from('penugasan').update(payload).eq('id', formData.id);
        if (error) throw error;
        alert('Penugasan berhasil diperbarui.');
        await logActivity({
          aksi: 'ubah',
          entitas: 'penugasan',
          deskripsi: `Mengubah penugasan ${namaMitra} pada kegiatan ${namaKegiatan}`,
          referensiId: formData.id,
        });
        setIsModalOpen(false);
        fetchPenugasan();
      } else {
        const { data: inserted, error } = await supabase
          .from('penugasan')
          .insert([payload])
          .select('id')
          .single();
        if (error) throw error;
        await logActivity({
          aksi: 'tambah',
          entitas: 'penugasan',
          deskripsi: `Menugaskan ${namaMitra} ke kegiatan ${namaKegiatan}`,
          referensiId: inserted?.id,
        });
        setIsModalOpen(false);
        router.push(`/pencairan?penugasan_id=${inserted?.id}`);
        return;
      }
    } catch (error: any) {
      alert('Gagal menyimpan penugasan: ' + (error.message || 'Terjadi kesalahan'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePenugasan = async (id: number, namaMitra: string) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus penugasan untuk "${namaMitra}"?`))
      return;
    try {
      const { error } = await supabase.from('penugasan').delete().eq('id', id);
      if (error) throw error;
      alert('Penugasan berhasil dihapus.');
      await logActivity({
        aksi: 'hapus',
        entitas: 'penugasan',
        deskripsi: `Menghapus penugasan untuk ${namaMitra}`,
        referensiId: id,
      });
      fetchPenugasan();
      fetchDropdownData();
    } catch (error: any) {
      alert('Gagal menghapus penugasan: ' + (error.message || 'Terjadi kesalahan'));
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans">
      <Sidebar mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />

      <div className="min-h-screen lg:pl-[230px]">
        <Header onMenuClick={() => setMobileSidebarOpen(true)} />

        <main className="p-3 sm:p-4 lg:p-5">
          <div className="mx-auto max-w-[1500px]">
            <div className="mb-4 flex flex-wrap justify-between items-center gap-3">
              <div>
                <h1 className="text-lg font-bold text-slate-800">Penugasan Mitra</h1>
                <p className="text-[11px] text-slate-500">
                  {loading
                    ? 'Kelola penugasan mitra ke kegiatan BPS'
                    : `${totalMitraCount} mitra • ${totalPenugasanCount} penugasan — total & sisa honor dihitung otomatis dari halaman Pencairan`}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleOpenAddModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md shadow-sm transition cursor-pointer"
                >
                  <span>➕</span> Buat Penugasan
                </button>
                <button
                  onClick={handleExportPDF}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-md shadow-sm transition cursor-pointer"
                >
                  <span>📄</span> Export PDF
                </button>
              </div>
            </div>

            {/* ⭐ NOTIFIKASI: MITRA DENGAN PENCAIRAN TERLAMBAT */}
            {mitraDenganTerlambat.length > 0 && (
              <div className="mb-3 rounded-lg border-2 border-orange-300 bg-orange-50 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-orange-800">
                      ⚠️ {mitraDenganTerlambat.length} mitra punya pencairan terlambat yang
                      belum dicairkan
                    </p>
                    <p className="text-[11px] text-orange-700 mt-0.5">
                      Rencana yang sudah lewat bulannya hanya bisa direalisasikan paling cepat
                      di <strong>{bulanBerjalan}</strong>, jadi limit {bulanBerjalan} untuk
                      mitra tersebut sudah <strong>dicadangkan</strong>. Selama belum dicairkan
                      atau dipindahkan, penugasan baru di bulan itu akan ditolak bila sisanya
                      tidak cukup.
                    </p>
                  </div>
                  <Link
                    href="/pencairan"
                    className="text-[10px] font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded px-2.5 py-1.5 transition shrink-0"
                  >
                    💰 Buka Pencairan
                  </Link>
                </div>

                <div className="mt-2 space-y-1">
                  {mitraDenganTerlambat.map((m) => (
                    <p key={m.sobatId} className="text-[10px] text-orange-800">
                      • <strong>{m.namaMitra}</strong> — dicadangkan{' '}
                      {formatRupiah(m.totalCadangan)} dari limit {bulanBerjalan} (
                      {m.rows
                        .map((r) => `${r.bulan_pencairan}: ${formatRupiah(r.nominal_rencana)}`)
                        .join(', ')}
                      )
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 mb-4 flex flex-wrap gap-2.5 items-center justify-between">
              <div className="flex flex-wrap items-center gap-2 w-full">
                <div className="relative min-w-[260px]">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400 text-xs">
                    🔍
                  </span>
                  <input
                    type="text"
                    placeholder="Cari Mitra, SOBAT ID, Kegiatan, Posisi"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-blue-400"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="py-1.5 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400 cursor-pointer"
                >
                  {STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>

                <select
                  value={kegiatanFilter}
                  onChange={(e) => setKegiatanFilter(e.target.value)}
                  className="py-1.5 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400 cursor-pointer max-w-[240px]"
                >
                  <option value="Semua Kegiatan">Semua Kegiatan</option>
                  {kegiatanOptions.map((k) => (
                    <option key={k.id} value={String(k.id)}>
                      {k.nama_kegiatan}
                      {k.kode_kegiatan ? ` (${k.kode_kegiatan})` : ''}
                    </option>
                  ))}
                </select>

                <select
                  value={bulanFilter}
                  onChange={(e) => setBulanFilter(e.target.value)}
                  className="py-1.5 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400 cursor-pointer"
                >
                  {BULAN_OPTIONS.map((bln) => (
                    <option key={bln} value={bln}>
                      {bln}
                    </option>
                  ))}
                </select>

                <button
                  onClick={fetchPenugasan}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition cursor-pointer"
                >
                  Cari
                </button>

                <button
                  onClick={() => {
                    setSearchKeyword('');
                    setStatusFilter('Semua Status');
                    setBulanFilter('Semua Bulan');
                    setKegiatanFilter('Semua Kegiatan');
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded transition cursor-pointer"
                >
                  Reset
                </button>

                <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-500">
                  <span>Mitra/halaman:</span>
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
                </div>
              </div>
            </div>

            {selectedIds.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-semibold text-blue-700">
                  {selectedIds.length} penugasan dipilih
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setBulkStatusValue('Selesai');
                      setIsBulkStatusModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-300 hover:bg-blue-100 text-blue-700 text-xs font-medium rounded-md transition cursor-pointer"
                  >
                    🔄 Ubah Status
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    disabled={isBulkDeleting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-medium rounded-md transition cursor-pointer"
                  >
                    🗑️ {isBulkDeleting ? 'Menghapus...' : 'Hapus Terpilih'}
                  </button>
                  <button
                    onClick={handleClearSelection}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium rounded-md transition cursor-pointer"
                  >
                    Batal Pilih
                  </button>
                </div>
              </div>
            )}

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 px-4 py-2.5 mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAllCurrentPageSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = isSomeCurrentPageSelected;
                  }}
                  onChange={handleToggleSelectAllCurrentPage}
                  disabled={currentItemIds.length === 0}
                  className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                />
                <span>Pilih semua penugasan di halaman ini</span>
              </label>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleExpandAll}
                  className="px-2.5 py-1 border border-slate-200 rounded bg-white hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                >
                  Buka Semua Mitra
                </button>
                <button
                  onClick={handleCollapseAll}
                  className="px-2.5 py-1 border border-slate-200 rounded bg-white hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                >
                  Tutup Semua Mitra
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              {loading ? (
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 py-10 text-center text-slate-400 text-xs">
                  Memuat data penugasan...
                </div>
              ) : currentGroups.length === 0 ? (
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 py-10 text-center text-slate-400 text-xs">
                  Tidak ada data yang sesuai dengan filter.
                </div>
              ) : (
                currentGroups.map((group) => {
                  const isExpanded = expandedMitraIds.has(group.sobat_id);
                  const groupItemIds = group.items.map((i) => i.id!).filter(Boolean);
                  const isGroupFullySelected =
                    groupItemIds.length > 0 &&
                    groupItemIds.every((id) => selectedIds.includes(id));
                  const isGroupPartiallySelected =
                    groupItemIds.some((id) => selectedIds.includes(id)) && !isGroupFullySelected;
                  const groupBadge = getGroupLimitBadge(group);
                  const isMitraNonaktif = group.mitra?.status_keaktifan === 'Nonaktif';
                  const punyaTerlambat = (rowsTerlambatByMitra[group.sobat_id] || []).length > 0;

                  return (
                    <div
                      key={group.sobat_id}
                      className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden"
                    >
                      <div
                        className={`flex flex-wrap items-center gap-3 px-4 py-3 ${
                          isExpanded ? 'bg-slate-50/70 border-b border-slate-200' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isGroupFullySelected}
                          ref={(el) => {
                            if (el) el.indeterminate = isGroupPartiallySelected;
                          }}
                          onChange={() => handleToggleSelectGroup(groupItemIds)}
                          className="w-3.5 h-3.5 accent-blue-600 cursor-pointer shrink-0"
                        />

                        <button
                          type="button"
                          onClick={() => handleToggleExpand(group.sobat_id)}
                          className="flex items-center gap-3 min-w-[220px] flex-1 text-left cursor-pointer"
                        >
                          <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
                            {(group.mitra?.nama_mitra || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-800 text-sm truncate">
                                {group.mitra?.nama_mitra || '-'}
                              </span>
                              {isMitraNonaktif && (
                                <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-100 text-red-700 border border-red-200">
                                  Nonaktif
                                </span>
                              )}
                              {punyaTerlambat && (
                                <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-orange-100 text-orange-700 border border-orange-300">
                                  ⚠️ Ada terlambat
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
                              <span className="font-mono text-blue-600">{group.sobat_id}</span>
                              {group.mitra?.posisi_mitra && (
                                <span className="truncate">• {group.mitra.posisi_mitra}</span>
                              )}
                            </div>
                          </div>
                        </button>

                        <div className="flex items-center gap-4 text-[11px] shrink-0">
                          <div className="text-center">
                            <div className="text-slate-400">Kegiatan</div>
                            <div className="font-semibold text-slate-700 bg-slate-100 rounded px-1.5">
                              {group.items.length}
                            </div>
                          </div>
                          <div className="text-right hidden sm:block">
                            <div className="text-slate-400">Total Rencana</div>
                            <div className="font-semibold text-blue-600">
                              {formatRupiah(group.totalRencana)}
                            </div>
                          </div>
                        </div>

                        {groupBadge && (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-medium border shrink-0 ${groupBadge.style}`}
                          >
                            {groupBadge.icon} {groupBadge.label}
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleToggleExpand(group.sobat_id)}
                          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition cursor-pointer shrink-0"
                          title={isExpanded ? 'Tutup rincian kegiatan' : 'Buka rincian kegiatan'}
                        >
                          {isExpanded ? '▲' : '▼'}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs text-slate-700">
                            <thead className="bg-slate-50/60 border-b border-slate-100 text-slate-500 font-semibold">
                              <tr>
                                <th className="py-2 px-3.5 w-8"></th>
                                <th className="py-2 px-3.5">Kegiatan</th>
                                <th className="py-2 px-3.5 text-right">Rencana</th>
                                <th className="py-2 px-3.5 text-center">Limit</th>
                                <th className="py-2 px-3.5 text-center">Rencana Pencairan</th>
                                <th className="py-2 px-3.5 text-center">Status</th>
                                <th className="py-2 px-3.5 text-center">Aksi</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {group.items.map((item) => {
                                const isChecked = selectedIds.includes(item.id!);
                                const periodeInfo = parseBulanKegiatan(
                                  item.kegiatan?.bulan_kegiatan
                                );
                                const totalRencana = Number(item.totalRencana) || 0;
                                const rowBadge = getRowLimitBadge(item, activeFocusBulan);

                                return (
                                  <tr
                                    key={item.id}
                                    className={`hover:bg-slate-50/80 transition ${
                                      isChecked ? 'bg-blue-50/50' : ''
                                    }`}
                                  >
                                    <td className="py-2.5 px-3.5 text-center">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => handleToggleSelectOne(item.id!)}
                                        className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                                      />
                                    </td>
                                    <td className="py-2.5 px-3.5">
                                      <div className="font-medium text-slate-800">
                                        {item.kegiatan?.nama_kegiatan || '-'}
                                      </div>
                                      <div className="text-[10px] text-slate-400">
                                        {periodeInfo.label}
                                        {item.kegiatan?.kode_kegiatan
                                          ? ` • ${item.kegiatan.kode_kegiatan}`
                                          : ''}
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-3.5 text-right font-semibold text-blue-600">
                                      {totalRencana > 0 ? (
                                        formatRupiah(totalRencana)
                                      ) : (
                                        <span className="text-slate-400 font-normal">
                                          Belum ada rencana
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3.5 text-center">
                                      {rowBadge ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setDetailPenugasan(item);
                                            setIsDetailModalOpen(true);
                                          }}
                                          title="Klik untuk lihat rincian per bulan"
                                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border hover:opacity-80 transition cursor-pointer ${rowBadge.style}`}
                                        >
                                          {rowBadge.icon} {rowBadge.label}
                                        </button>
                                      ) : (
                                        <span className="text-[10px] text-slate-300">-</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3.5 text-center">
                                      {totalRencana > 0 ? (
                                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium border bg-emerald-50 text-emerald-700 border-emerald-200">
                                          🟢 Lengkap
                                        </span>
                                      ) : (
                                        <Link
                                          href={`/pencairan?penugasan_id=${item.id}`}
                                          title="Wajib diisi — klik untuk buat Rencana Pencairan"
                                          className="inline-block px-2 py-0.5 rounded text-[10px] font-medium border bg-amber-50 text-amber-700 border-amber-200 hover:opacity-80 transition"
                                        >
                                          🟡 Belum ada
                                        </Link>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3.5 text-center">
                                      <span className="px-2 py-0.5 rounded text-[10px] font-medium border bg-slate-50 text-slate-600 border-slate-200">
                                        {item.status_penugasan || 'Ditugaskan'}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3.5 text-center">
                                      <div className="flex items-center justify-center gap-1.5">
                                        <button
                                          onClick={() => {
                                            setDetailPenugasan(item);
                                            setIsDetailModalOpen(true);
                                          }}
                                          className="p-1.5 text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-md transition cursor-pointer"
                                          title="Detail"
                                        >
                                          👁️
                                        </button>
                                        <button
                                          onClick={() => handleOpenEditModal(item)}
                                          className="p-1.5 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-md transition cursor-pointer"
                                          title="Edit"
                                        >
                                          ✏️
                                        </button>
                                        <Link
                                          href={`/pencairan?penugasan_id=${item.id}`}
                                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 border border-emerald-200 rounded-md transition cursor-pointer"
                                          title="Kelola Pencairan"
                                        >
                                          💰
                                        </Link>
                                        <button
                                          onClick={() =>
                                            handleDeletePenugasan(
                                              item.id!,
                                              item.mitra?.nama_mitra || ''
                                            )
                                          }
                                          className="p-1.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-md transition cursor-pointer"
                                          title="Hapus"
                                        >
                                          <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="14"
                                            height="14"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                          >
                                            <path d="M3 6h18" />
                                            <path d="M8 6V4h8v2" />
                                            <path d="M19 6l-1 14H6L5 6" />
                                            <path d="M10 11v5" />
                                            <path d="M14 11v5" />
                                          </svg>
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-3 px-4 py-3 bg-white rounded-lg shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
              <div>
                Menampilkan mitra <strong>{startItem}</strong> - <strong>{endItem}</strong> dari
                total <strong>{totalMitraCount}</strong> mitra ({totalPenugasanCount} penugasan)
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1 border border-slate-200 rounded bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-600 transition cursor-pointer"
                >
                  Sebelumnya
                </button>
                <span className="px-3 py-1 font-medium text-slate-700">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1 border border-slate-200 rounded bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-600 transition cursor-pointer"
                >
                  Selanjutnya
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ================= MODAL: TAMBAH/EDIT PENUGASAN ================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto border border-slate-200">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center sticky top-0 z-20">
              <h3 className="font-bold text-slate-800 text-sm">
                {isEditMode ? 'Edit Penugasan Mitra' : 'Tambah Penugasan Mitra'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePenugasan} className="p-5 space-y-4">
              {isEditMode && (
                <div className="p-3 rounded-lg text-xs font-medium border bg-slate-50 text-slate-600 border-slate-200">
                  Rencana &amp; realisasi honor dikelola di menu{' '}
                  <Link
                    href={`/pencairan?penugasan_id=${formData.id}`}
                    className="text-blue-600 font-semibold underline"
                  >
                    Pencairan
                  </Link>
                  .
                </div>
              )}

              <div ref={mitraDropdownRef} className="relative">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pilih Mitra
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setIsMitraDropdownOpen((prev) => !prev);
                    setMitraSearchKeyword('');
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white outline-none focus:border-blue-500 flex items-center justify-between gap-2 text-left"
                >
                  <span className="min-w-0 truncate flex items-center gap-1.5">
                    {selectedMitraOption ? (
                      <>
                        <span className="text-slate-800 font-medium truncate">
                          {selectedMitraOption.nama_mitra}
                        </span>
                        <span className="text-slate-400 font-mono shrink-0">
                          ({selectedMitraOption.sobat_id})
                        </span>
                        {selectedMitraOption.status_keaktifan === 'Nonaktif' && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700 border border-rose-300">
                            NONAKTIF
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-400">-- Pilih Mitra --</span>
                    )}
                  </span>
                  <span
                    className={`text-slate-400 shrink-0 transition-transform ${
                      isMitraDropdownOpen ? 'rotate-180' : ''
                    }`}
                  >
                    ▾
                  </span>
                </button>

                {isMitraDropdownOpen && (
                  <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg overflow-hidden">
                    <div className="p-2 border-b border-slate-100 bg-slate-50">
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none text-slate-400 text-xs">
                          🔍
                        </span>
                        <input
                          type="text"
                          autoFocus
                          value={mitraSearchKeyword}
                          onChange={(e) => setMitraSearchKeyword(e.target.value)}
                          placeholder="Cari nama mitra / SOBAT ID..."
                          className="w-full pl-7 pr-2.5 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-blue-400 bg-white"
                        />
                      </div>
                    </div>

                    <div className="max-h-56 overflow-y-auto">
                      {filteredMitraOptionsForCombobox.length === 0 ? (
                        <div className="px-3 py-4 text-center text-[11px] text-slate-400">
                          Tidak ada mitra yang cocok dengan pencarian.
                        </div>
                      ) : (
                        filteredMitraOptionsForCombobox.map((m) => {
                          const sudahDitugaskan = !!checkDuplicateAssignment(
                            m.sobat_id,
                            formData.kegiatan_id,
                            isEditMode ? formData.id : undefined
                          );
                          const isNonaktif = m.status_keaktifan === 'Nonaktif';
                          const isSelected = formData.sobat_id === m.sobat_id;
                          const punyaTerlambat = (rowsTerlambatByMitra[m.sobat_id] || []).length > 0;

                          let badge: React.ReactNode = null;
                          if (isNonaktif) {
                            badge = (
                              <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700 border border-rose-300">
                                NONAKTIF
                              </span>
                            );
                          } else if (sudahDitugaskan) {
                            badge = (
                              <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                Sudah Ditugaskan
                              </span>
                            );
                          } else if (punyaTerlambat) {
                            badge = (
                              <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-orange-50 text-orange-700 border border-orange-300">
                                ⚠️ Ada Terlambat
                              </span>
                            );
                          }

                          return (
                            <button
                              key={m.sobat_id}
                              type="button"
                              onClick={() => {
                                handleSelectMitraInForm(m.sobat_id);
                                setIsMitraDropdownOpen(false);
                                setMitraSearchKeyword('');
                              }}
                              className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 hover:bg-blue-50/60 transition ${
                                isSelected ? 'bg-blue-50' : ''
                              }`}
                            >
                              <span className="min-w-0 truncate">
                                <span className="font-medium text-slate-800">{m.nama_mitra}</span>
                                <span className="text-slate-400 font-mono ml-1">
                                  ({m.sobat_id})
                                </span>
                              </span>
                              {badge}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pilih Kegiatan BPS
                </label>
                <select
                  value={formData.kegiatan_id}
                  onChange={(e) => handleSelectKegiatanInForm(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 outline-none bg-white"
                  required
                >
                  <option value={0} disabled>
                    -- Pilih Kegiatan --
                  </option>
                  {kegiatanOptions.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.nama_kegiatan} ({k.bulan_kegiatan})
                    </option>
                  ))}
                </select>
                {currentFormPeriodeInfo.jumlahBulan > 1 && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    Kegiatan ini berlangsung {currentFormPeriodeInfo.jumlahBulan} bulan (
                    {currentFormPeriodeInfo.label}).
                  </p>
                )}
              </div>

              {/* ⭐ PERINGATAN RENCANA TERLAMBAT MITRA INI */}
              {rowsTerlambatForForm.length > 0 && (
                <div className="rounded-md border-2 border-orange-300 bg-orange-50 px-3 py-2.5">
                  <p className="text-[11px] font-bold text-orange-800">
                    ⚠️ Mitra ini punya pencairan terlambat yang belum dicairkan
                  </p>

                  <div className="mt-1 space-y-0.5">
                    {rowsTerlambatForForm.map((r, i) => (
                      <p key={`${r.bulan_pencairan}-${i}`} className="text-[10px] text-orange-700">
                        • {r.bulan_pencairan} — {formatRupiah(r.nominal_rencana)}
                      </p>
                    ))}
                  </div>

                  <p className="text-[10px] text-orange-700 mt-1.5 leading-relaxed">
                    Nominal di atas sudah <strong>dicadangkan</strong> dari limit{' '}
                    <strong>{bulanBerjalan}</strong>, karena realisasinya paling cepat baru bisa
                    dilakukan bulan ini. Angka "sisa" di tabel bawah sudah dikurangi jumlah
                    tersebut.
                  </p>

                  <Link
                    href="/pencairan"
                    className="inline-block mt-1.5 text-[10px] font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded px-2 py-1 transition"
                  >
                    💰 Cairkan / pindahkan di menu Pencairan
                  </Link>
                </div>
              )}

              {limitReferenceRows.length > 0 && (
                <div
                  className={`rounded-md border overflow-hidden ${
                    isPenugasanBlockedByLimit ? 'border-rose-300' : 'border-slate-200'
                  }`}
                >
                  <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                    Status limit honor mitra ini per bulan (periode kegiatan)
                  </div>
                  <table className="w-full text-[11px]">
                    <tbody className="divide-y divide-slate-100">
                      {limitReferenceRows.map((r) => (
                        <tr key={r.bulanLabel}>
                          <td className="px-3 py-1.5 text-slate-600 align-top">
                            {r.bulanLabel}
                            {r.cadangan > 0 && (
                              <div className="text-[10px] text-orange-600">
                                dipesan {formatRupiah(r.cadangan)} oleh rencana terlambat
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right align-top">
                            {r.unset ? (
                              <span className="text-purple-600 font-medium">
                                Limit belum diatur
                              </span>
                            ) : r.sisa !== null && r.sisa <= 0 ? (
                              r.blockedByCadangan ? (
                                <span className="text-orange-700 font-semibold">
                                  ⚠️ Terpesan pencairan terlambat (sisa Rp 0)
                                </span>
                              ) : (
                                <span className="text-rose-600 font-semibold">
                                  🔴 Penuh (sisa Rp 0)
                                </span>
                              )
                            ) : (
                              <span className="text-emerald-600 font-medium">
                                🟢 Sisa {formatRupiah(r.sisa || 0)} dari{' '}
                                {formatRupiah(r.limit || 0)}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {isPenugasanBlockedByLimit ? (
                    isBlockedByCadanganTerlambat ? (
                      <p className="px-3 py-2 text-[11px] text-orange-800 font-semibold bg-orange-50 border-t border-orange-200 leading-relaxed">
                        ⚠️ Penugasan tidak dapat disimpan — kapasitas limit mitra ini sudah
                        dipesan oleh pencairan terlambat yang belum dicairkan. Cairkan atau
                        pindahkan rencana tersebut dulu di menu Pencairan.
                      </p>
                    ) : (
                      <p className="px-3 py-2 text-[11px] text-rose-700 font-semibold bg-rose-50 border-t border-rose-200">
                        🔴 Penugasan tidak dapat disimpan — limit honor mitra ini sudah penuh di
                        seluruh bulan periode kegiatan ini.
                      </p>
                    )
                  ) : (
                    <p className="px-3 py-1.5 text-[10px] text-slate-400 bg-slate-50 border-t border-slate-100">
                      Bulan &amp; nominal pasti baru ditentukan saat mengisi Rencana Pencairan
                      (wajib diisi setelah Penugasan disimpan).
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Status Penugasan
                </label>
                <select
                  value={formData.status_penugasan}
                  onChange={(e) => setFormData({ ...formData, status_penugasan: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 outline-none bg-white"
                >
                  <option value="Ditugaskan">Ditugaskan</option>
                  <option value="Berjalan">Berjalan</option>
                  <option value="Selesai">Selesai</option>
                  <option value="Dibatalkan">Dibatalkan</option>
                </select>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-md transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isPenugasanBlockedByLimit}
                  title={
                    isPenugasanBlockedByLimit
                      ? isBlockedByCadanganTerlambat
                        ? 'Kapasitas limit sudah dipesan pencairan terlambat yang belum dicairkan'
                        : 'Limit honor mitra ini sudah penuh di seluruh bulan periode kegiatan'
                      : undefined
                  }
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting
                    ? 'Menyimpan...'
                    : isPenugasanBlockedByLimit
                    ? isBlockedByCadanganTerlambat
                      ? 'Terpesan — Cairkan Dulu'
                      : 'Limit Penuh — Tidak Bisa Simpan'
                    : 'Simpan Penugasan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: DETAIL ================= */}
      {isDetailModalOpen && detailPenugasan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-slate-800 text-sm">Rincian Penugasan Mitra</h3>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs overflow-y-auto">
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Nama Mitra:</span>
                <span className="font-semibold text-slate-800">
                  {detailPenugasan.mitra?.nama_mitra || '-'}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">SOBAT ID:</span>
                <span className="font-mono text-blue-600 font-semibold">
                  {detailPenugasan.sobat_id}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Kegiatan:</span>
                <span className="font-medium text-slate-800">
                  {detailPenugasan.kegiatan?.nama_kegiatan || '-'}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Periode:</span>
                <span className="font-medium text-slate-800">
                  {detailPenugasan.kegiatan?.bulan_kegiatan || '-'}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Total Rencana Pencairan:</span>
                <span className="font-semibold text-blue-600">
                  {formatRupiah(detailPenugasan.totalRencana || 0)}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Status Penugasan:</span>
                <span className="font-medium text-slate-800">
                  {detailPenugasan.status_penugasan || 'Ditugaskan'}
                </span>
              </div>

              {/* RENCANA TERLAMBAT MITRA INI */}
              {(rowsTerlambatByMitra[detailPenugasan.sobat_id] || []).length > 0 && (
                <div className="rounded-md border border-orange-300 bg-orange-50 px-3 py-2.5">
                  <p className="text-[11px] font-bold text-orange-800">
                    ⚠️ Ada pencairan terlambat yang belum dicairkan
                  </p>
                  <div className="mt-1 space-y-0.5">
                    {(rowsTerlambatByMitra[detailPenugasan.sobat_id] || []).map((r, i) => (
                      <p key={`${r.bulan_pencairan}-${i}`} className="text-[10px] text-orange-700">
                        • {r.bulan_pencairan} — {formatRupiah(r.nominal_rencana)}
                      </p>
                    ))}
                  </div>
                  <p className="text-[10px] text-orange-700 mt-1.5 leading-relaxed">
                    Nominal ini dicadangkan dari limit {bulanBerjalan}, jadi angka sisa di bawah
                    sudah dikurangi jumlah tersebut.
                  </p>
                </div>
              )}

              {/* RINCIAN LIMIT PER BULAN */}
              {(() => {
                const statuses = getRowMonthStatuses(detailPenugasan); // semua bulan, tanpa filter
                if (statuses.length === 0) return null;
                return (
                  <div className="pt-1">
                    <div className="text-slate-500 mb-1.5">Rincian Limit per Bulan:</div>
                    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
                      {statuses.map((s) => {
                        let badgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                        let badgeLabel = 'Aman';
                        if (s.isUnset) {
                          badgeStyle = 'bg-purple-50 text-purple-700 border-purple-200';
                          badgeLabel = 'Belum Disetting';
                        } else if (s.isBlockedByCadangan) {
                          badgeStyle = 'bg-orange-50 text-orange-700 border-orange-300';
                          badgeLabel = 'Terpesan';
                        } else if (s.isFull) {
                          badgeStyle = 'bg-rose-50 text-rose-700 border-rose-200';
                          badgeLabel = 'Penuh';
                        } else if (s.isWarning) {
                          badgeStyle = 'bg-amber-50 text-amber-700 border-amber-200';
                          badgeLabel = 'Mendekati';
                        }
                        return (
                          <div
                            key={s.bulan}
                            className="flex items-start justify-between gap-2 px-3 py-2 bg-white"
                          >
                            <div className="min-w-0">
                              <div className="font-medium text-slate-700">{s.bulan}</div>
                              {s.cadangan > 0 && (
                                <div className="text-[10px] text-orange-600">
                                  dipesan {formatRupiah(s.cadangan)} oleh rencana terlambat
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-slate-500 text-right">
                                {s.isUnset
                                  ? 'Limit belum diset'
                                  : `Sisa ${formatRupiah(Math.max(s.sisa || 0, 0))} dari ${formatRupiah(
                                      s.limit || 0
                                    )}`}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${badgeStyle}`}
                              >
                                {badgeLabel}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-between gap-2 shrink-0">
              <Link
                href={`/pencairan?penugasan_id=${detailPenugasan.id}`}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-md transition cursor-pointer"
              >
                💰 Kelola Pencairan
              </Link>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-medium rounded-md transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: UBAH STATUS MASSAL ================= */}
      {isBulkStatusModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden border border-slate-200">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm">Ubah Status Massal</h3>
              <button
                onClick={() => setIsBulkStatusModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-600">
                Pilih status baru untuk <strong>{selectedIds.length}</strong> penugasan terpilih:
              </p>
              <select
                value={bulkStatusValue}
                onChange={(e) => setBulkStatusValue(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 outline-none bg-white"
              >
                <option value="Ditugaskan">Ditugaskan</option>
                <option value="Berjalan">Berjalan</option>
                <option value="Selesai">Selesai</option>
                <option value="Dibatalkan">Dibatalkan</option>
              </select>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setIsBulkStatusModalOpen(false)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-md transition cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleBulkStatusChange}
                disabled={isBulkStatusSubmitting}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition cursor-pointer disabled:opacity-50"
              >
                {isBulkStatusSubmitting ? 'Proses...' : 'Terapkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: MITRA SUDAH DITUGASKAN ================= */}
      {isDuplicateBlockedModalOpen && duplicateBlockedInfo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-amber-500 flex items-center justify-center mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </div>

              <h3 className="text-lg font-bold text-amber-600 mb-1.5">Mitra Sudah Ditugaskan</h3>

              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                <strong className="text-slate-700">{duplicateBlockedInfo.namaMitra}</strong> sudah
                memiliki penugasan pada kegiatan{' '}
                <strong className="text-slate-700">{duplicateBlockedInfo.namaKegiatan}</strong>.
                <br />
                Satu mitra tidak dapat ditugaskan dua kali pada kegiatan yang sama.
              </p>

              <button
                onClick={() => {
                  setIsDuplicateBlockedModalOpen(false);
                  setDuplicateBlockedInfo(null);
                }}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition cursor-pointer"
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}