'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';

// =========================================================
// SUPABASE
// =========================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

// =========================================================
// INTERFACE
// =========================================================

interface PenugasanData {
  id?: number;
  sobat_id: string;
  kegiatan_id: number;
  peran?: string;
  total_honor?: number;
  jumlah_dicairkan?: number;
  status_penugasan?: string;
  created_at?: string;

  mitra?: {
    nama_mitra: string;
    posisi_mitra?: string;
    kab_kota?: string;
    no_hp?: string;
  };

  kegiatan?: {
    nama_kegiatan: string;
    kode_kegiatan: string;
    bulan_kegiatan: string;
  };
}

interface LimitHonor {
  id: number;
  bulan_periode: string;
  batas_maksimal: number;
  persen_peringatan: number;
}

interface MitraOption {
  sobat_id: string;
  nama_mitra: string;
  posisi_mitra?: string;
}

interface KegiatanOption {
  id: number;
  nama_kegiatan: string;
  kode_kegiatan: string;
  bulan_kegiatan: string;
}

interface LimitBlockedInfo {
  namaMitra: string;
  periode: string;
  limitBulanan: number;
  hakHonorAlokasi: number;
  sudahDicairkan: number;
  sisaLimit: number;
  persenTerpakai: number;
  sebab: 'sudah_limit' | 'akan_melebihi';
}

interface DuplicateBlockedInfo {
  namaMitra: string;
  namaKegiatan: string;
}

interface PencairanHonor {
  id?: number;
  sobat_id: string;
  penugasan_id: number;
  tgl_pencairan: string;
  tahap_ke?: number;
  nominal_dicairkan: number;
  bulan_pencairan?: string | null;
  metode_pembayaran?: string | null;
  no_referensi_sp2d?: string | null;
  catatan?: string | null;
  created_at?: string;
}

const NAMA_BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

// =========================================================
// CONSTANT
// =========================================================

const STATUS_OPTIONS = [
  'Semua Status',
  'Ditugaskan',
  'Berjalan',
  'Selesai',
  'Dibatalkan',
];

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

// Fallback murni jaga-jaga bila BENAR-BENAR belum ada baris limit_honor untuk
// periode terkait. Nilai aktual selalu diambil dari database (lihat getLimitForPeriode).
const DEFAULT_LIMIT = 3000000;
const DEFAULT_WARN_PERCENT = 80;

// Pemetaan angka bulan -> nama bulan (Indonesia), dipakai untuk mencocokkan
// format "YYYY-MM" (mis. dari limit_honor.bulan_periode) dengan teks bebas
// (mis. kegiatan.bulan_kegiatan = "Agustus" atau "Agustus 2026").
// Sinkron dengan logika yang sama persis di halaman Monitoring Limit.
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

/**
 * Mencocokkan sebuah teks periode bebas (rawDbValue, mis. "Agustus 2026")
 * dengan format filter "YYYY-MM" (filterYYYYMM, mis. "2026-08").
 * Fungsi ini identik dengan isMatchingMonth pada MonitoringLimitPage
 * supaya limit per-periode konsisten di seluruh aplikasi.
 */
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

// =========================================================
// PARSER PERIODE KEGIATAN MULTI-BULAN
// =========================================================
// Format yang didukung dari kolom kegiatan.bulan_kegiatan (varchar):
//   1) Rentang       : "Agustus 2026 - Oktober 2026"
//   2) Bulan tunggal : "Agustus 2026 (1 Bulan)"  (angka bisa >1 juga)
// Keduanya diurai menjadi daftar bulan individual supaya honor dapat
// dibagi rata per bulan untuk keperluan pengecekan limit bulanan.

interface PeriodeKegiatan {
  months: string[]; // mis. ["Agustus 2026", "September 2026", "Oktober 2026"]
  jumlahBulan: number;
  label: string; // teks asli, untuk ditampilkan apa adanya
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

const RANGE_REGEX =
  /^([A-Za-zÀ-ÿ]+)\s+(\d{4})\s*-\s*([A-Za-zÀ-ÿ]+)\s+(\d{4})$/i;

const RANGE_SD_REGEX =
  /^([A-Za-zÀ-ÿ]+)\s+(\d{4})\s*s\.?\s*d\.?\s*([A-Za-zÀ-ÿ]+)\s+(\d{4})(?:\s*\((\d+)\s*Bulan\))?$/i;

const SINGLE_REGEX =
  /^([A-Za-zÀ-ÿ]+)\s+(\d{4})\s*\((\d+)\s*Bulan\)$/i;

const parseBulanKegiatan = (
  raw: string | null | undefined
): PeriodeKegiatan => {
  const text = (raw || '').trim();

  if (!text) {
    return {
      months: [],
      jumlahBulan: 0,
      label: '-',
    };
  }

  // =========================================================
  // FORMAT 1:
  // "Agustus 2026 - Oktober 2026"
  // =========================================================
  const rangeMatch = text.match(RANGE_REGEX);

  if (rangeMatch) {
    const [
      ,
      startName,
      startYearStr,
      endName,
      endYearStr,
    ] = rangeMatch;

    const startIdx = monthIndexFromName(startName);
    const endIdx = monthIndexFromName(endName);

    const startYear = parseInt(startYearStr, 10);
    const endYear = parseInt(endYearStr, 10);

    if (startIdx !== -1 && endIdx !== -1) {
      const totalBulan =
        (endYear - startYear) * 12 +
        (endIdx - startIdx) +
        1;

      if (totalBulan > 0 && totalBulan <= 36) {
        return {
          months: generateMonthSequence(
            startIdx,
            startYear,
            totalBulan
          ),
          jumlahBulan: totalBulan,
          label: text,
        };
      }
    }
  }

  // =========================================================
  // FORMAT 2:
  // "Agustus 2026 s.d. November 2026 (4 Bulan)"
  //
  // Bisa juga:
  // "Agustus 2026 s.d November 2026 (4 Bulan)"
  // "Agustus 2026 sd. November 2026 (4 Bulan)"
  // "Agustus 2026 sd November 2026"
  // =========================================================
  const rangeSdMatch = text.match(RANGE_SD_REGEX);

  if (rangeSdMatch) {
    const [
      ,
      startName,
      startYearStr,
      endName,
      endYearStr,
      jumlahStr,
    ] = rangeSdMatch;

    const startIdx = monthIndexFromName(startName);
    const endIdx = monthIndexFromName(endName);

    const startYear = parseInt(startYearStr, 10);
    const endYear = parseInt(endYearStr, 10);

    if (startIdx !== -1 && endIdx !== -1) {
      // Hitung jumlah bulan berdasarkan tanggal awal dan akhir.
      const calculatedJumlahBulan =
        (endYear - startYear) * 12 +
        (endIdx - startIdx) +
        1;

      if (
        calculatedJumlahBulan > 0 &&
        calculatedJumlahBulan <= 36
      ) {
        // Kalau database mencantumkan "(4 Bulan)",
        // kita gunakan angka tersebut hanya jika valid.
        //
        // Namun untuk menjaga data tetap konsisten,
        // jumlah bulan berdasarkan rentang tanggal
        // menjadi acuan utama.
        const jumlahBulanDariTeks = jumlahStr
          ? parseInt(jumlahStr, 10)
          : calculatedJumlahBulan;

        const jumlahBulan =
          jumlahBulanDariTeks > 0 &&
          jumlahBulanDariTeks <= 36
            ? jumlahBulanDariTeks
            : calculatedJumlahBulan;

        return {
          months: generateMonthSequence(
            startIdx,
            startYear,
            jumlahBulan
          ),
          jumlahBulan,
          label: text,
        };
      }
    }
  }

  // =========================================================
  // FORMAT 3:
  // "Agustus 2026 (1 Bulan)"
  //
  // Jumlah bisa lebih dari 1:
  // "Agustus 2026 (4 Bulan)"
  // =========================================================
  const singleMatch = text.match(SINGLE_REGEX);

  if (singleMatch) {
    const [
      ,
      monthName,
      yearStr,
      jumlahStr,
    ] = singleMatch;

    const startIdx = monthIndexFromName(monthName);

    const jumlah = Math.max(
      parseInt(jumlahStr, 10) || 1,
      1
    );

    if (startIdx !== -1) {
      return {
        months: generateMonthSequence(
          startIdx,
          parseInt(yearStr, 10),
          jumlah
        ),
        jumlahBulan: jumlah,
        label: text,
      };
    }
  }

  // =========================================================
  // FORMAT 4 / FALLBACK:
  // Kalau format benar-benar tidak dikenali,
  // tetap pertahankan perilaku lama:
  // dianggap 1 bulan.
  // =========================================================
  return {
    months: [text],
    jumlahBulan: 1,
    label: text,
  };
};

// =========================================================
// GROUP PENUGASAN PER MITRA
// =========================================================
// Satu mitra bisa mengikuti banyak kegiatan sekaligus. Supaya tidak
// "terpencar" (nama mitra berulang di banyak baris), penugasan dikelompokkan
// per sobat_id: satu kartu = satu mitra, berisi ringkasan total + daftar
// seluruh kegiatan yang ia ikuti (bisa dibuka/tutup / expand-collapse).

interface MitraGroup {
  sobat_id: string;
  mitra?: PenugasanData['mitra'];
  items: PenugasanData[];
  totalAlokasi: number;
  totalDicairkan: number;
  totalSisaHonor: number;
  worstUsageRatio: number;
  worstWarnPercent: number;
}

// =========================================================
// PAGE
// =========================================================

export default function PenugasanPage() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);

  const [penugasanList, setPenugasanList] = useState<PenugasanData[]>([]);
  const [mitraOptions, setMitraOptions] = useState<MitraOption[]>([]);
  const [kegiatanOptions, setKegiatanOptions] = useState<KegiatanOption[]>([]);
  // Disimpan sebagai array (bukan Record dengan exact-key) supaya bisa
  // dicocokkan secara fleksibel via isMatchingMonth, sama seperti Monitoring Limit.
  const [limitList, setLimitList] = useState<LimitHonor[]>([]);

  const [loading, setLoading] = useState<boolean>(true);

  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('Semua Status');
  const [bulanFilter, setBulanFilter] = useState<string>('Semua Bulan');
  const [kegiatanFilter, setKegiatanFilter] = useState<string>('Semua Kegiatan');

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);

  // Kartu mitra mana saja yang sedang dibuka (expanded). Disimpan sebagai
  // Set berisi sobat_id.
  const [expandedMitraIds, setExpandedMitraIds] = useState<Set<string>>(new Set());

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [detailPenugasan, setDetailPenugasan] = useState<PenugasanData | null>(null);

  const [formData, setFormData] = useState<PenugasanData>({
    sobat_id: '',
    kegiatan_id: 0,
    total_honor: 0,
    jumlah_dicairkan: 0,
    status_penugasan: 'Ditugaskan',
  });

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState<boolean>(false);
  const [isBulkStatusModalOpen, setIsBulkStatusModalOpen] = useState<boolean>(false);
  const [bulkStatusValue, setBulkStatusValue] = useState<string>('Selesai');
  const [isBulkStatusSubmitting, setIsBulkStatusSubmitting] = useState<boolean>(false);

  const [isLimitBlockedModalOpen, setIsLimitBlockedModalOpen] = useState<boolean>(false);
  const [limitBlockedInfo, setLimitBlockedInfo] = useState<LimitBlockedInfo | null>(null);

  const [isDuplicateBlockedModalOpen, setIsDuplicateBlockedModalOpen] = useState<boolean>(false);
  const [duplicateBlockedInfo, setDuplicateBlockedInfo] = useState<DuplicateBlockedInfo | null>(null);

  const [isPencairanModalOpen, setIsPencairanModalOpen] = useState<boolean>(false);
  const [pencairanPenugasan, setPencairanPenugasan] = useState<PenugasanData | null>(null);
  const [riwayatPencairan, setRiwayatPencairan] = useState<PencairanHonor[]>([]);
  const [isLoadingRiwayat, setIsLoadingRiwayat] = useState<boolean>(false);
  const [isPencairanSubmitting, setIsPencairanSubmitting] = useState<boolean>(false);
  const [pencairanForm, setPencairanForm] = useState<{ nominal: number; tanggal: string; catatan: string }>({
    nominal: 0,
    tanggal: new Date().toISOString().slice(0, 10),
    catatan: '',
  });

  const fetchDropdownData = useCallback(async () => {
    try {
      const { data: resMitra, error: errMitra } = await supabase
        .from('mitra')
        .select('sobat_id, nama_mitra, posisi_mitra')
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
        .select('id, bulan_periode, batas_maksimal, persen_peringatan');

      if (errLimit) {
        console.error('Error fetching limit_honor:', errLimit.message);
      } else if (resLimit) {
        // Simpan apa adanya sebagai array — pencocokan periode dilakukan
        // secara fleksibel di getLimitForPeriode, bukan exact-key lookup.
        setLimitList(resLimit);
      }
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
          mitra:sobat_id ( nama_mitra, posisi_mitra, kab_kota, no_hp ),
          kegiatan:kegiatan_id ( nama_kegiatan, kode_kegiatan, bulan_kegiatan )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      let filteredData: PenugasanData[] = data || [];

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
        filteredData = filteredData.filter((item) =>
          item.kegiatan?.bulan_kegiatan?.toLowerCase().includes(bulanFilter.toLowerCase())
        );
      }

      if (kegiatanFilter !== 'Semua Kegiatan') {
        filteredData = filteredData.filter((item) => String(item.kegiatan_id) === kegiatanFilter);
      }

      setPenugasanList(filteredData);
      setCurrentPage(1);
      setSelectedIds([]);
    } catch (error: any) {
      console.error('Error fetching penugasan:', error);
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

  // Mengambil limit & persen peringatan untuk sebuah periode kegiatan
  // (mis. "Agustus 2026") dengan mencocokkan secara fleksibel ke baris
  // limit_honor yang paling sesuai. Nilai DEFAULT_LIMIT hanya dipakai kalau
  // memang tidak ada baris limit_honor yang cocok untuk periode tsb.
  const getLimitForPeriode = useCallback(
    (periode: string) => {
      const info = limitList.find((row) => isMatchingMonth(periode, row.bulan_periode));
      return {
        maxLimit: info?.batas_maksimal ?? DEFAULT_LIMIT,
        warnPercent: info?.persen_peringatan ?? DEFAULT_WARN_PERCENT,
      };
    },
    [limitList]
  );

  // Honor tiap kegiatan dibagi RATA ke setiap bulan yang dicakupnya.
  // Contoh: kegiatan 3 bulan dengan hak honor 900.000 -> 300.000 disumbangkan
  // ke akumulasi limit tiap-tiap dari 3 bulan tersebut (bukan 900.000 penuh di 1 bulan).
  const accumulatedHonorBySobatPeriode = useMemo(() => {
    const map: Record<string, number> = {};
    penugasanList.forEach((item) => {
      const { months, jumlahBulan } = parseBulanKegiatan(item.kegiatan?.bulan_kegiatan);
      if (months.length === 0) return;
      const honorPerBulan = (Number(item.total_honor) || 0) / jumlahBulan;
      months.forEach((bulan) => {
        const key = `${item.sobat_id}__${bulan}`;
        map[key] = (map[key] || 0) + honorPerBulan;
      });
    });
    return map;
  }, [penugasanList]);

  const accumulatedDicairkanBySobatPeriode = useMemo(() => {
    const map: Record<string, number> = {};
    penugasanList.forEach((item) => {
      const { months, jumlahBulan } = parseBulanKegiatan(item.kegiatan?.bulan_kegiatan);
      if (months.length === 0) return;
      const dicairkanPerBulan = (Number(item.jumlah_dicairkan) || 0) / jumlahBulan;
      months.forEach((bulan) => {
        const key = `${item.sobat_id}__${bulan}`;
        map[key] = (map[key] || 0) + dicairkanPerBulan;
      });
    });
    return map;
  }, [penugasanList]);

  const currentFormPeriodeInfo = useMemo(() => {
    const kegiatan = kegiatanOptions.find((k) => k.id === formData.kegiatan_id);
    const raw = kegiatan?.bulan_kegiatan || kegiatanOptions[0]?.bulan_kegiatan || '';
    return parseBulanKegiatan(raw);
  }, [formData.kegiatan_id, kegiatanOptions]);

  // Cek mitra SUDAH limit dari penugasan LAIN (tanpa memperhitungkan honor baru yang sedang diisi).
  // Sekarang mengecek SETIAP bulan yang dicakup kegiatan (periodeInfo.months), bukan cuma satu
  // periode tunggal, karena satu kegiatan bisa membentang beberapa bulan.
  const checkMitraAlreadyAtLimit = useCallback(
    (sobatId: string, periodeInfo: PeriodeKegiatan, excludePenugasanId?: number): LimitBlockedInfo | null => {
      if (!sobatId || periodeInfo.months.length === 0) return null;

      for (const bulan of periodeInfo.months) {
        const { maxLimit } = getLimitForPeriode(bulan);

        let existingTotal = 0;
        let existingDicairkan = 0;
        penugasanList.forEach((item) => {
          if (item.sobat_id !== sobatId) return;
          if (excludePenugasanId && item.id === excludePenugasanId) return;
          const itemPeriode = parseBulanKegiatan(item.kegiatan?.bulan_kegiatan);
          if (!itemPeriode.months.includes(bulan)) return;
          existingTotal += (Number(item.total_honor) || 0) / itemPeriode.jumlahBulan;
          existingDicairkan += (Number(item.jumlah_dicairkan) || 0) / itemPeriode.jumlahBulan;
        });

        if (existingTotal >= maxLimit) {
          const mitraInfo = mitraOptions.find((m) => m.sobat_id === sobatId);
          return {
            namaMitra: mitraInfo?.nama_mitra || sobatId,
            periode: bulan,
            limitBulanan: maxLimit,
            hakHonorAlokasi: existingTotal,
            sudahDicairkan: existingDicairkan,
            sisaLimit: Math.max(maxLimit - existingTotal, 0),
            persenTerpakai: Math.round((existingTotal / maxLimit) * 100),
            sebab: 'sudah_limit',
          };
        }
      }

      return null;
    },
    [penugasanList, mitraOptions, getLimitForPeriode]
  );

  const checkDuplicateAssignment = useCallback(
    (sobatId: string, kegiatanId: number, excludePenugasanId?: number): DuplicateBlockedInfo | null => {
      if (!sobatId || !kegiatanId) return null;

      const existing = penugasanList.find(
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
    [penugasanList, mitraOptions, kegiatanOptions]
  );

  const handleSelectMitraInForm = (sobatId: string) => {
    const blockedLimit = checkMitraAlreadyAtLimit(sobatId, currentFormPeriodeInfo, isEditMode ? formData.id : undefined);
    if (blockedLimit) {
      setLimitBlockedInfo(blockedLimit);
      setIsLimitBlockedModalOpen(true);
      return;
    }

    const blockedDuplicate = checkDuplicateAssignment(sobatId, formData.kegiatan_id, isEditMode ? formData.id : undefined);
    if (blockedDuplicate) {
      setDuplicateBlockedInfo(blockedDuplicate);
      setIsDuplicateBlockedModalOpen(true);
      return;
    }

    setFormData((prev) => ({ ...prev, sobat_id: sobatId }));
  };

  const handleSelectKegiatanInForm = (kegiatanId: number) => {
    const kegiatanTerpilih = kegiatanOptions.find((k) => k.id === kegiatanId);
    const periodeInfoBaru = parseBulanKegiatan(kegiatanTerpilih?.bulan_kegiatan);

    if (formData.sobat_id) {
      const blockedLimit = checkMitraAlreadyAtLimit(formData.sobat_id, periodeInfoBaru, isEditMode ? formData.id : undefined);
      if (blockedLimit) {
        setLimitBlockedInfo(blockedLimit);
        setIsLimitBlockedModalOpen(true);
        return;
      }

      const blockedDuplicate = checkDuplicateAssignment(formData.sobat_id, kegiatanId, isEditMode ? formData.id : undefined);
      if (blockedDuplicate) {
        setDuplicateBlockedInfo(blockedDuplicate);
        setIsDuplicateBlockedModalOpen(true);
        return;
      }
    }

    setFormData((prev) => ({ ...prev, kegiatan_id: kegiatanId }));
  };

  // Rincian proyeksi PER BULAN setelah honor yang sedang diisi ditambahkan.
  // Karena kegiatan bisa membentang beberapa bulan, honor dibagi rata
  // (formData.total_honor / jumlahBulan) dan diproyeksikan ke SETIAP bulan
  // yang dicakup kegiatan tsb — masing-masing dibandingkan ke limit bulan itu sendiri.
  interface BulanProyeksi {
    bulan: string;
    currentTotal: number;
    newTotal: number;
    maxLimit: number;
    warnPercent: number;
    isExceeded: boolean;
    isWarning: boolean;
    usagePercent: number;
  }

  const formLimitCheck = useMemo(() => {
    const periodeInfo = currentFormPeriodeInfo;

    if (!formData.sobat_id || periodeInfo.months.length === 0) {
      return {
        maxLimit: DEFAULT_LIMIT,
        isExceeded: false,
        isWarning: false,
        honorPerBulan: 0,
        perBulan: [] as BulanProyeksi[],
        worst: null as BulanProyeksi | null,
      };
    }

    const honorPerBulan = (Number(formData.total_honor) || 0) / periodeInfo.jumlahBulan;

    const perBulan: BulanProyeksi[] = periodeInfo.months.map((bulan) => {
      const { maxLimit, warnPercent } = getLimitForPeriode(bulan);

      let currentTotal = 0;
      penugasanList.forEach((item) => {
        if (item.sobat_id !== formData.sobat_id) return;
        if (isEditMode && item.id === formData.id) return;
        const itemPeriode = parseBulanKegiatan(item.kegiatan?.bulan_kegiatan);
        if (!itemPeriode.months.includes(bulan)) return;
        currentTotal += (Number(item.total_honor) || 0) / itemPeriode.jumlahBulan;
      });

      const newTotal = currentTotal + honorPerBulan;
      const usagePercent = maxLimit > 0 ? (newTotal / maxLimit) * 100 : 0;

      return {
        bulan,
        currentTotal,
        newTotal,
        maxLimit,
        warnPercent,
        isExceeded: newTotal > maxLimit,
        isWarning: usagePercent >= warnPercent && newTotal <= maxLimit,
        usagePercent,
      };
    });

    const isExceeded = perBulan.some((b) => b.isExceeded);
    const isWarning = !isExceeded && perBulan.some((b) => b.isWarning);
    const worst = perBulan.reduce<BulanProyeksi | null>(
      (acc, b) => (!acc || b.usagePercent > acc.usagePercent ? b : acc),
      null
    );

    return {
      maxLimit: worst?.maxLimit ?? DEFAULT_LIMIT,
      isExceeded,
      isWarning,
      honorPerBulan,
      perBulan,
      worst,
    };
  }, [
    formData.sobat_id,
    formData.total_honor,
    formData.id,
    formData.kegiatan_id,
    isEditMode,
    penugasanList,
    currentFormPeriodeInfo,
    getLimitForPeriode,
  ]);

  // Untuk satu baris penugasan (yang kegiatannya bisa membentang beberapa bulan),
  // ambil status/sisa-limit dari bulan yang PALING TERPAKAI (worst case) di antara
  // semua bulan yang dicakup kegiatan tsb. Ini yang ditampilkan di kolom tabel.
  const getRowLimitSummary = useCallback(
    (item: PenugasanData) => {
      const periodeInfo = parseBulanKegiatan(item.kegiatan?.bulan_kegiatan);
      if (periodeInfo.months.length === 0) {
        return {
          label: '-',
          jumlahBulan: 0,
          honorPerBulan: 0,
          worstUsageRatio: 0,
          worstWarnPercent: DEFAULT_WARN_PERCENT,
          sisaLimitMin: 0,
        };
      }

      const honorPerBulan = (Number(item.total_honor) || 0) / periodeInfo.jumlahBulan;

      let worstUsageRatio = 0;
      let worstWarnPercent = DEFAULT_WARN_PERCENT;
      let sisaLimitMin = Infinity;

      periodeInfo.months.forEach((bulan) => {
        const { maxLimit, warnPercent } = getLimitForPeriode(bulan);
        const totalAllocated = accumulatedHonorBySobatPeriode[`${item.sobat_id}__${bulan}`] || 0;
        const usageRatio = maxLimit > 0 ? (totalAllocated / maxLimit) * 100 : 0;
        const sisa = maxLimit - totalAllocated;

        if (usageRatio > worstUsageRatio) {
          worstUsageRatio = usageRatio;
          worstWarnPercent = warnPercent;
        }
        if (sisa < sisaLimitMin) sisaLimitMin = sisa;
      });

      return {
        label: periodeInfo.label,
        jumlahBulan: periodeInfo.jumlahBulan,
        honorPerBulan,
        worstUsageRatio,
        worstWarnPercent,
        sisaLimitMin: sisaLimitMin === Infinity ? 0 : sisaLimitMin,
      };
    },
    [accumulatedHonorBySobatPeriode, getLimitForPeriode]
  );

  // =========================================================
  // GROUPING PENUGASAN PER MITRA
  // =========================================================
  // Satu kartu = satu mitra. Menghindari nama mitra berulang di banyak baris
  // ketika mitra tsb mengikuti banyak kegiatan sekaligus.
  const groupedByMitra = useMemo<MitraGroup[]>(() => {
    const map = new Map<string, MitraGroup>();

    penugasanList.forEach((item) => {
      const key = item.sobat_id;
      if (!map.has(key)) {
        map.set(key, {
          sobat_id: key,
          mitra: item.mitra,
          items: [],
          totalAlokasi: 0,
          totalDicairkan: 0,
          totalSisaHonor: 0,
          worstUsageRatio: 0,
          worstWarnPercent: DEFAULT_WARN_PERCENT,
        });
      }
      const group = map.get(key)!;
      group.items.push(item);
      group.totalAlokasi += Number(item.total_honor) || 0;
      group.totalDicairkan += Number(item.jumlah_dicairkan) || 0;
    });

    const groups = Array.from(map.values()).map((group) => {
      group.totalSisaHonor = group.totalAlokasi - group.totalDicairkan;

      let worstRatio = 0;
      let worstWarn = DEFAULT_WARN_PERCENT;
      group.items.forEach((item) => {
        const summary = getRowLimitSummary(item);
        if (summary.worstUsageRatio > worstRatio) {
          worstRatio = summary.worstUsageRatio;
          worstWarn = summary.worstWarnPercent;
        }
      });
      group.worstUsageRatio = worstRatio;
      group.worstWarnPercent = worstWarn;

      group.items = [...group.items].sort((a, b) =>
        (a.kegiatan?.nama_kegiatan || '').localeCompare(b.kegiatan?.nama_kegiatan || '')
      );

      return group;
    });

    groups.sort((a, b) => (a.mitra?.nama_mitra || '').localeCompare(b.mitra?.nama_mitra || ''));

    return groups;
  }, [penugasanList, getRowLimitSummary]);

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
    const allSelected = groupItemIds.length > 0 && groupItemIds.every((id) => selectedIds.includes(id));
    setSelectedIds((prev) => {
      if (allSelected) {
        return prev.filter((id) => !groupItemIds.includes(id));
      }
      return Array.from(new Set([...prev, ...groupItemIds]));
    });
  };

  const handleClearSelection = () => setSelectedIds([]);

  const handleToggleExpand = (sobatId: string) => {
    setExpandedMitraIds((prev) => {
      const next = new Set(prev);
      if (next.has(sobatId)) {
        next.delete(sobatId);
      } else {
        next.add(sobatId);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    setExpandedMitraIds(new Set(groupedByMitra.map((g) => g.sobat_id)));
  };

  const handleCollapseAll = () => {
    setExpandedMitraIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;

    const confirmDelete = window.confirm(`Apakah Anda yakin ingin menghapus ${selectedIds.length} penugasan terpilih?`);
    if (!confirmDelete) return;

    setIsBulkDeleting(true);
    try {
      const { error } = await supabase.from('penugasan').delete().in('id', selectedIds);
      if (error) throw error;

      alert(`${selectedIds.length} penugasan berhasil dihapus.`);
      setSelectedIds([]);
      fetchPenugasan();
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
      setIsBulkStatusModalOpen(false);
      setSelectedIds([]);
      fetchPenugasan();
    } catch (error: any) {
      alert('Gagal mengubah status: ' + (error.message || 'Terjadi kesalahan'));
    } finally {
      setIsBulkStatusSubmitting(false);
    }
  };

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
      `Rp ${(item.total_honor || 0).toLocaleString('id-ID')}`,
      `Rp ${(item.jumlah_dicairkan || 0).toLocaleString('id-ID')}`,
      `Rp ${((item.total_honor || 0) - (item.jumlah_dicairkan || 0)).toLocaleString('id-ID')}`,
      item.status_penugasan || 'Ditugaskan',
    ]);

    autoTable(doc, {
      startY: 36,
      head: [['No', 'SOBAT ID', 'Nama Mitra', 'Kegiatan BPS', 'Posisi Mitra', 'Hak Honor Alokasi', 'Dicairkan', 'Sisa Honor', 'Status']],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 25 },
        2: { cellWidth: 45 },
        3: { cellWidth: 55 },
        4: { cellWidth: 35 },
        5: { cellWidth: 30, halign: 'right' },
        6: { cellWidth: 30, halign: 'right' },
        7: { cellWidth: 30, halign: 'right' },
        8: { cellWidth: 20, halign: 'center' },
      },
    });

    doc.save(`Data_Penugasan_BPS_Mojokerto_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handleOpenAddModal = () => {
    setIsEditMode(false);

    const defaultKegiatanId = kegiatanOptions[0]?.id || 0;
    const defaultPeriodeInfo = parseBulanKegiatan(kegiatanOptions[0]?.bulan_kegiatan);

    const firstAvailableMitra = mitraOptions.find((m) => !checkMitraAlreadyAtLimit(m.sobat_id, defaultPeriodeInfo));

    setFormData({
      sobat_id: firstAvailableMitra?.sobat_id || '',
      kegiatan_id: defaultKegiatanId,
      total_honor: 0,
      jumlah_dicairkan: 0,
      status_penugasan: 'Ditugaskan',
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (penugasan: PenugasanData) => {
    setIsEditMode(true);
    setFormData({
      id: penugasan.id,
      sobat_id: penugasan.sobat_id,
      kegiatan_id: penugasan.kegiatan_id,
      total_honor: penugasan.total_honor || 0,
      jumlah_dicairkan: penugasan.jumlah_dicairkan || 0,
      status_penugasan: penugasan.status_penugasan || 'Ditugaskan',
    });
    setIsModalOpen(true);
  };

  const handleSavePenugasan = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.sobat_id || !formData.kegiatan_id) {
      alert('Pilih Mitra dan Kegiatan BPS terlebih dahulu!');
      return;
    }

    const blockedDuplicate = checkDuplicateAssignment(formData.sobat_id, formData.kegiatan_id, isEditMode ? formData.id : undefined);
    if (blockedDuplicate) {
      setDuplicateBlockedInfo(blockedDuplicate);
      setIsDuplicateBlockedModalOpen(true);
      return;
    }

    const blockedLimit = checkMitraAlreadyAtLimit(formData.sobat_id, currentFormPeriodeInfo, isEditMode ? formData.id : undefined);
    if (blockedLimit) {
      setLimitBlockedInfo(blockedLimit);
      setIsLimitBlockedModalOpen(true);
      return;
    }

    const honorAllocated = Number(formData.total_honor) || 0;
    const honorDisbursed = Number(formData.jumlah_dicairkan) || 0;

    if (honorDisbursed > honorAllocated) {
      alert(
        `Gagal Menyimpan! Jumlah yang dicairkan (Rp ${honorDisbursed.toLocaleString('id-ID')}) tidak boleh melebihi Hak Honor Alokasi (Rp ${honorAllocated.toLocaleString('id-ID')}).`
      );
      return;
    }

    // Cek limit total — SEKARANG DIBLOKIR TOTAL, tidak bisa di-override lagi via confirm.
    // Karena kegiatan bisa membentang beberapa bulan, ambil bulan yang PALING PARAH
    // (yang benar-benar melebihi limit) untuk ditampilkan di modal blokir.
    if (formLimitCheck.isExceeded) {
      const mitraInfo = mitraOptions.find((m) => m.sobat_id === formData.sobat_id);
      const worstBulan = formLimitCheck.perBulan.find((b) => b.isExceeded) || formLimitCheck.worst;
      const dicairkanSaatIni = worstBulan
        ? accumulatedDicairkanBySobatPeriode[`${formData.sobat_id}__${worstBulan.bulan}`] || 0
        : 0;

      setLimitBlockedInfo({
        namaMitra: mitraInfo?.nama_mitra || formData.sobat_id,
        periode: worstBulan?.bulan || currentFormPeriodeInfo.label,
        limitBulanan: worstBulan?.maxLimit ?? formLimitCheck.maxLimit,
        hakHonorAlokasi: worstBulan?.newTotal ?? 0,
        sudahDicairkan: dicairkanSaatIni,
        sisaLimit: Math.max((worstBulan?.maxLimit ?? 0) - (worstBulan?.newTotal ?? 0), 0),
        persenTerpakai: worstBulan ? Math.round(worstBulan.usagePercent) : 0,
        sebab: 'akan_melebihi',
      });
      setIsLimitBlockedModalOpen(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        sobat_id: formData.sobat_id,
        kegiatan_id: formData.kegiatan_id,
        total_honor: honorAllocated,
        jumlah_dicairkan: honorDisbursed,
        status_penugasan: formData.status_penugasan,
      };

      if (isEditMode && formData.id) {
        const { error } = await supabase.from('penugasan').update(payload).eq('id', formData.id);
        if (error) throw error;
        alert('Penugasan berhasil diperbarui.');
      } else {
        const { error } = await supabase.from('penugasan').insert([payload]);
        if (error) throw error;
        alert('Penugasan baru berhasil ditambahkan.');
      }

      setIsModalOpen(false);
      fetchPenugasan();
    } catch (error: any) {
      alert('Gagal menyimpan penugasan: ' + (error.message || 'Terjadi kesalahan'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePenugasan = async (id: number, namaMitra: string) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus penugasan untuk "${namaMitra}"?`)) return;

    try {
      const { error } = await supabase.from('penugasan').delete().eq('id', id);
      if (error) throw error;

      alert('Penugasan berhasil dihapus.');
      fetchPenugasan();
    } catch (error: any) {
      alert('Gagal menghapus penugasan: ' + (error.message || 'Terjadi kesalahan'));
    }
  };

  const formatRupiah = (val: number) => `Rp ${val.toLocaleString('id-ID')}`;

  const formatTanggal = (val: string) => {
    if (!val) return '-';
    try {
      return new Date(val).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return val;
    }
  };

  const totalRiwayatDicairkan = useMemo(
    () => riwayatPencairan.reduce((sum, r) => sum + (Number(r.nominal_dicairkan) || 0), 0),
    [riwayatPencairan]
  );

  const sisaHonorPencairan = useMemo(() => {
    const totalHonor = Number(pencairanPenugasan?.total_honor) || 0;
    return Math.max(totalHonor - totalRiwayatDicairkan, 0);
  }, [pencairanPenugasan, totalRiwayatDicairkan]);

  const nominalPencairanInvalid =
    (Number(pencairanForm.nominal) || 0) <= 0 || (Number(pencairanForm.nominal) || 0) > sisaHonorPencairan;

  const handleOpenPencairanModal = async (penugasan: PenugasanData) => {
    if (!penugasan.id) return;

    setPencairanPenugasan(penugasan);
    setPencairanForm({
      nominal: 0,
      tanggal: new Date().toISOString().slice(0, 10),
      catatan: '',
    });
    setIsPencairanModalOpen(true);
    setIsLoadingRiwayat(true);

    try {
      const { data, error } = await supabase
        .from('pencairan_honor')
        .select('*')
        .eq('penugasan_id', penugasan.id)
        .order('tahap_ke', { ascending: true });

      if (error) throw error;
      setRiwayatPencairan(data || []);
    } catch (error: any) {
      console.error('Error fetching riwayat pencairan:', error?.message || error);
      alert('Gagal memuat riwayat pencairan: ' + (error?.message || 'Terjadi kesalahan'));
      setRiwayatPencairan([]);
    } finally {
      setIsLoadingRiwayat(false);
    }
  };

  const handleSavePencairan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pencairanPenugasan?.id) return;

    const nominal = Number(pencairanForm.nominal) || 0;

    if (nominal <= 0) {
      alert('Nominal pencairan harus lebih dari 0.');
      return;
    }

    if (nominal > sisaHonorPencairan) {
      alert(
        `Gagal Menyimpan! Nominal pencairan (${formatRupiah(nominal)}) tidak boleh melebihi sisa honor (${formatRupiah(
          sisaHonorPencairan
        )}).`
      );
      return;
    }

    const tanggalObj = new Date(pencairanForm.tanggal);
    const bulanPencairan = NAMA_BULAN_ID[tanggalObj.getMonth()] || null;
    const tahapBaru = riwayatPencairan.length + 1;

    setIsPencairanSubmitting(true);
    try {
      const { error: insertError } = await supabase.from('pencairan_honor').insert([
        {
          sobat_id: pencairanPenugasan.sobat_id,
          penugasan_id: pencairanPenugasan.id,
          tgl_pencairan: pencairanForm.tanggal,
          tahap_ke: tahapBaru,
          nominal_dicairkan: nominal,
          bulan_pencairan: bulanPencairan,
          catatan: pencairanForm.catatan.trim() || null,
        },
      ]);
      if (insertError) throw insertError;

      const newTotalDicairkan = totalRiwayatDicairkan + nominal;
      const { error: updateError } = await supabase
        .from('penugasan')
        .update({ jumlah_dicairkan: newTotalDicairkan })
        .eq('id', pencairanPenugasan.id);
      if (updateError) throw updateError;

      alert('Pencairan honor berhasil disimpan.');
      setIsPencairanModalOpen(false);
      setPencairanPenugasan(null);
      fetchPenugasan();
    } catch (error: any) {
      alert('Gagal menyimpan pencairan: ' + (error?.message || 'Terjadi kesalahan'));
    } finally {
      setIsPencairanSubmitting(false);
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
                    ? 'Kelola alokasi penugasan dan akumulasi limit honorarium mitra'
                    : `${totalMitraCount} mitra • ${totalPenugasanCount} penugasan — dikelompokkan per mitra karena satu mitra bisa mengikuti banyak kegiatan`}
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
                <div className="text-xs font-semibold text-blue-700">{selectedIds.length} penugasan dipilih</div>
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

            {/* Toolbar: pilih semua di halaman ini + buka/tutup semua kartu mitra */}
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

            {/* DAFTAR MITRA (dikelompokkan) */}
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
                    groupItemIds.length > 0 && groupItemIds.every((id) => selectedIds.includes(id));
                  const isGroupPartiallySelected =
                    groupItemIds.some((id) => selectedIds.includes(id)) && !isGroupFullySelected;

                  let statusLimitLabel = 'Tersedia';
                  let statusStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                  if (group.worstUsageRatio >= 100) {
                    statusLimitLabel = 'Limit Terlampaui';
                    statusStyle = 'bg-rose-50 text-rose-700 border-rose-200';
                  } else if (group.worstUsageRatio >= group.worstWarnPercent) {
                    statusLimitLabel = 'Mendekati Limit';
                    statusStyle = 'bg-amber-50 text-amber-700 border-amber-200';
                  }

                  return (
                    <div
                      key={group.sobat_id}
                      className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden"
                    >
                      {/* HEADER KARTU MITRA */}
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
                            <div className="font-semibold text-slate-800 text-sm truncate">
                              {group.mitra?.nama_mitra || '-'}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
                              <span className="font-mono text-blue-600">{group.sobat_id}</span>
                              {group.mitra?.posisi_mitra && <span className="truncate">• {group.mitra.posisi_mitra}</span>}
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
                            <div className="text-slate-400">Total Alokasi</div>
                            <div className="font-semibold text-blue-600">{formatRupiah(group.totalAlokasi)}</div>
                          </div>
                          <div className="text-right hidden md:block">
                            <div className="text-slate-400">Dicairkan</div>
                            <div className="font-semibold text-emerald-600">{formatRupiah(group.totalDicairkan)}</div>
                          </div>
                          <div className="text-right hidden lg:block">
                            <div className="text-slate-400">Sisa</div>
                            <div className="font-semibold text-amber-600">{formatRupiah(group.totalSisaHonor)}</div>
                          </div>
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-medium border shrink-0 ${statusStyle}`}
                        >
                          {statusLimitLabel}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleToggleExpand(group.sobat_id)}
                          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition cursor-pointer shrink-0"
                          title={isExpanded ? 'Tutup rincian kegiatan' : 'Buka rincian kegiatan'}
                        >
                          {isExpanded ? '▲' : '▼'}
                        </button>
                      </div>

                      {/* RINCIAN KEGIATAN MITRA (saat dibuka) */}
                      {isExpanded && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs text-slate-700">
                            <thead className="bg-slate-50/60 border-b border-slate-100 text-slate-500 font-semibold">
                              <tr>
                                <th className="py-2 px-3.5 w-8"></th>
                                <th className="py-2 px-3.5">Kegiatan</th>
                                <th className="py-2 px-3.5 text-right">Hak Honor Alokasi</th>
                                <th className="py-2 px-3.5 text-right">Dicairkan</th>
                                <th className="py-2 px-3.5 text-right">Sisa Honor</th>
                                <th className="py-2 px-3.5 text-right">Sisa Limit Periode</th>
                                <th className="py-2 px-3.5 text-center">Status Limit</th>
                                <th className="py-2 px-3.5 text-center">Aksi</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {group.items.map((item) => {
                                const isChecked = selectedIds.includes(item.id!);
                                const rowSummary = getRowLimitSummary(item);

                                const hakHonorAlokasi = Number(item.total_honor) || 0;
                                const dicairkan = Number(item.jumlah_dicairkan) || 0;
                                const sisaHonorKegiatan = hakHonorAlokasi - dicairkan;
                                const sisaLimit = rowSummary.sisaLimitMin;

                                const usageRatio = rowSummary.worstUsageRatio;
                                const warnPercent = rowSummary.worstWarnPercent;
                                let rowStatusLabel = 'Tersedia';
                                let rowStatusStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200';

                                if (usageRatio >= 100) {
                                  rowStatusLabel = 'Limit Terlampaui';
                                  rowStatusStyle = 'bg-rose-50 text-rose-700 border-rose-200';
                                } else if (usageRatio >= warnPercent) {
                                  rowStatusLabel = 'Mendekati Limit';
                                  rowStatusStyle = 'bg-amber-50 text-amber-700 border-amber-200';
                                }

                                return (
                                  <tr
                                    key={item.id}
                                    className={`hover:bg-slate-50/80 transition ${isChecked ? 'bg-blue-50/50' : ''}`}
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
                                      <div className="font-medium text-slate-800">{item.kegiatan?.nama_kegiatan || '-'}</div>
                                      <div className="text-[10px] text-slate-400">
                                        {rowSummary.label}
                                        {item.kegiatan?.kode_kegiatan ? ` • ${item.kegiatan.kode_kegiatan}` : ''}
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-3.5 text-right font-semibold text-blue-600">
                                      {formatRupiah(hakHonorAlokasi)}
                                      {rowSummary.jumlahBulan > 1 && (
                                        <div className="text-[10px] font-normal text-slate-400">
                                          ≈ {formatRupiah(rowSummary.honorPerBulan)}/bulan × {rowSummary.jumlahBulan} bln
                                        </div>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3.5 text-right font-semibold text-emerald-600">
                                      {formatRupiah(dicairkan)}
                                    </td>
                                    <td className="py-2.5 px-3.5 text-right font-medium">
                                      {sisaHonorKegiatan <= 0 && hakHonorAlokasi > 0 ? (
                                        <span className="text-[10px] bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded border border-emerald-200">
                                          Lunas
                                        </span>
                                      ) : (
                                        <span className="text-amber-600 font-semibold">{formatRupiah(sisaHonorKegiatan)}</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3.5 text-right font-semibold text-slate-700">
                                      {formatRupiah(sisaLimit)}
                                    </td>
                                    <td className="py-2.5 px-3.5 text-center">
                                      <span
                                        className={`px-2 py-0.5 rounded text-[10px] font-medium border ${rowStatusStyle}`}
                                      >
                                        {rowStatusLabel}
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
                                        <button
                                          onClick={() => handleOpenPencairanModal(item)}
                                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 border border-emerald-200 rounded-md transition cursor-pointer"
                                          title="Pencairan Honor"
                                        >
                                          💰
                                        </button>
                                        <button
                                          onClick={() => handleDeletePenugasan(item.id!, item.mitra?.nama_mitra || '')}
                                          className="p-1.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-md transition cursor-pointer"
                                          title="Hapus"
                                        >
                                          🗑️
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

            {/* PAGINATION */}
            <div className="mt-3 px-4 py-3 bg-white rounded-lg shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
              <div>
                Menampilkan mitra <strong>{startItem}</strong> - <strong>{endItem}</strong> dari total{' '}
                <strong>{totalMitraCount}</strong> mitra ({totalPenugasanCount} penugasan)
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

      {/* MODAL TAMBAH / EDIT */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
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
              {(() => {
                const totalHak = Number(formData.total_honor) || 0;
                const totalCair = Number(formData.jumlah_dicairkan) || 0;
                const sisaHonorKegiatan = totalHak - totalCair;
                const isFullyPaid = isEditMode && totalHak > 0 && totalCair >= totalHak;

                return (
                  <>
                    {isEditMode && (
                      <div
                        className={`p-3 rounded-lg text-xs font-medium border flex items-center justify-between ${
                          isFullyPaid
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        <div>
                          <span className="font-semibold">
                            {isFullyPaid ? '✅ STATUS: LUNAS' : '⏳ STATUS: BELUM DICAIRKAN PENUH'}
                          </span>
                          <p className="text-[11px] mt-0.5 text-slate-600">
                            {isFullyPaid
                              ? 'Honor telah dicairkan 100%. Field pencairan dikunci untuk keamanan data.'
                              : `Sisa honor kegiatan yang belum dicairkan: ${formatRupiah(sisaHonorKegiatan)}`}
                          </p>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Pilih Mitra</label>
                      <select
                        value={formData.sobat_id}
                        onChange={(e) => handleSelectMitraInForm(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 outline-none bg-white"
                        required
                      >
                        <option value="" disabled>
                          -- Pilih Mitra --
                        </option>
                        {mitraOptions.map((m) => {
                          const sudahLimit = !!checkMitraAlreadyAtLimit(
                            m.sobat_id,
                            currentFormPeriodeInfo,
                            isEditMode ? formData.id : undefined
                          );
                          const sudahDitugaskan = !!checkDuplicateAssignment(
                            m.sobat_id,
                            formData.kegiatan_id,
                            isEditMode ? formData.id : undefined
                          );
                          const label = sudahLimit
                            ? ' — Sudah Limit'
                            : sudahDitugaskan
                            ? ' — Sudah Ditugaskan di Kegiatan Ini'
                            : '';
                          return (
                            <option key={m.sobat_id} value={m.sobat_id}>
                              {m.nama_mitra} ({m.sobat_id}){label}
                            </option>
                          );
                        })}
                      </select>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Mitra yang sudah mencapai limit atau sudah ditugaskan pada kegiatan yang sama tidak dapat digunakan kembali.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Pilih Kegiatan BPS</label>
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
                    </div>

                    {/* HAK HONOR — peringatan real-time kalau proyeksi total akan melebihi limit */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Hak Honor Alokasi (Rp)</label>
                      <input
                        type="number"
                        min="0"
                        value={formData.total_honor || 0}
                        onChange={(e) => setFormData({ ...formData, total_honor: Number(e.target.value) })}
                        className={`w-full px-3 py-2 text-xs border rounded-md outline-none transition ${
                          formLimitCheck.isExceeded
                            ? 'border-rose-400 focus:border-rose-500 bg-rose-50'
                            : 'border-slate-200 focus:border-blue-500'
                        }`}
                        required
                      />
                      {formData.sobat_id && currentFormPeriodeInfo.months.length > 0 && (
                        <div className="mt-1.5 space-y-1">
                          {currentFormPeriodeInfo.jumlahBulan > 1 && (
                            <p className="text-[10px] text-slate-500">
                              Kegiatan ini berlangsung <strong>{currentFormPeriodeInfo.jumlahBulan} bulan</strong> ({currentFormPeriodeInfo.label}) — honor dibagi rata{' '}
                              <strong>{formatRupiah(formLimitCheck.honorPerBulan)}/bulan</strong>.
                            </p>
                          )}
                          <div className="space-y-0.5">
                            {formLimitCheck.perBulan.map((b) => (
                              <div
                                key={b.bulan}
                                className={`flex justify-between items-center text-[10px] px-2 py-1 rounded ${
                                  b.isExceeded
                                    ? 'bg-rose-50 text-rose-600 font-semibold'
                                    : b.isWarning
                                    ? 'bg-amber-50 text-amber-600 font-medium'
                                    : 'bg-slate-50 text-slate-400'
                                }`}
                              >
                                <span>{b.bulan}</span>
                                <span>
                                  {formatRupiah(b.newTotal)} / {formatRupiah(b.maxLimit)}
                                  {b.isExceeded ? ' ⛔' : ''}
                                </span>
                              </div>
                            ))}
                          </div>
                          {formLimitCheck.isExceeded && (
                            <p className="text-[10px] text-rose-600 font-semibold">
                              ⛔ Ada bulan yang melebihi limit. Kurangi nominalnya untuk bisa menyimpan.
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {isEditMode && (
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-xs font-semibold text-slate-700">Jumlah Dicairkan (Rp)</label>
                          {isFullyPaid && (
                            <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-100 px-1.5 py-0.5 rounded">
                              Lunas
                            </span>
                          )}
                        </div>
                        <div className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-slate-50 text-slate-700 font-semibold">
                          {formatRupiah(totalCair)}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Nilai ini dihitung otomatis dari riwayat pencairan. Kelola lewat tombol 💰 Pencairan Honor pada
                          daftar penugasan.
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Status Penugasan</label>
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
                  </>
                );
              })()}

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-md transition cursor-pointer"
                >
                  Batal
                </button>

                {/* Tombol Simpan dinonaktifkan saat proyeksi honor melebihi limit — admin sudah tahu sebelum klik */}
                <button
                  type="submit"
                  disabled={isSubmitting || formLimitCheck.isExceeded}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan Penugasan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DETAIL */}
      {isDetailModalOpen && detailPenugasan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm">Rincian Penugasan Mitra</h3>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Nama Mitra:</span>
                <span className="font-semibold text-slate-800">{detailPenugasan.mitra?.nama_mitra || '-'}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">SOBAT ID:</span>
                <span className="font-mono text-blue-600 font-semibold">{detailPenugasan.sobat_id}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Kegiatan:</span>
                <span className="font-medium text-slate-800">{detailPenugasan.kegiatan?.nama_kegiatan || '-'}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Periode:</span>
                <span className="font-medium text-slate-800">{detailPenugasan.kegiatan?.bulan_kegiatan || '-'}</span>
              </div>
              {(() => {
                const periodeInfo = parseBulanKegiatan(detailPenugasan.kegiatan?.bulan_kegiatan);
                if (periodeInfo.jumlahBulan <= 1) return null;
                const honorPerBulan = (Number(detailPenugasan.total_honor) || 0) / periodeInfo.jumlahBulan;
                return (
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-slate-500">Rincian Honor/Bulan:</span>
                    <span className="font-medium text-slate-800">
                      {formatRupiah(honorPerBulan)} × {periodeInfo.jumlahBulan} bulan
                    </span>
                  </div>
                );
              })()}
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Hak Honor Alokasi:</span>
                <span className="font-semibold text-blue-600">{formatRupiah(detailPenugasan.total_honor || 0)}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Jumlah Dicairkan:</span>
                <span className="font-semibold text-emerald-600">{formatRupiah(detailPenugasan.jumlah_dicairkan || 0)}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Sisa Honor Kegiatan:</span>
                <span className="font-semibold text-amber-600">
                  {formatRupiah((detailPenugasan.total_honor || 0) - (detailPenugasan.jumlah_dicairkan || 0))}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Status Penugasan:</span>
                <span className="font-medium text-slate-800">{detailPenugasan.status_penugasan || 'Ditugaskan'}</span>
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
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

      {/* MODAL BULK STATUS */}
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

      {/* MODAL LIMIT — dipakai untuk DUA sebab: sudah_limit & akan_melebihi */}
      {isLimitBlockedModalOpen && limitBlockedInfo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-rose-500 flex items-center justify-center mb-4">
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

              <h3 className="text-lg font-bold text-rose-600 mb-1.5">
                {limitBlockedInfo.sebab === 'akan_melebihi' ? 'Alokasi Melebihi Limit' : 'Mitra Sudah Limit'}
              </h3>

              <p className="text-sm text-slate-500 mb-5 leading-relaxed">
                {limitBlockedInfo.sebab === 'akan_melebihi' ? (
                  <>
                    Honor yang sedang diisi akan mendorong total mitra ini di periode{' '}
                    <strong>{limitBlockedInfo.periode}</strong> melebihi batas limit. Penugasan tidak dapat disimpan.
                  </>
                ) : (
                  <>
                    Mitra tidak dapat ditugaskan pada kegiatan baru di periode <strong>{limitBlockedInfo.periode}</strong>.
                  </>
                )}
              </p>

              <div className="w-full space-y-2.5 text-left text-sm mb-6">
                <div className="flex justify-between">
                  <span className="text-slate-500">Mitra</span>
                  <span className="font-semibold text-slate-800">{limitBlockedInfo.namaMitra}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Limit Periode</span>
                  <span className="font-semibold text-slate-800">{formatRupiah(limitBlockedInfo.limitBulanan)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">
                    {limitBlockedInfo.sebab === 'akan_melebihi' ? 'Proyeksi Total Alokasi' : 'Hak Honor Alokasi'}
                  </span>
                  <span className="font-semibold text-slate-800">{formatRupiah(limitBlockedInfo.hakHonorAlokasi)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Sudah Dicairkan</span>
                  <span className="font-semibold text-slate-800">{formatRupiah(limitBlockedInfo.sudahDicairkan)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Sisa Limit</span>
                  <span className="font-semibold text-slate-800">
                    {formatRupiah(limitBlockedInfo.sisaLimit)}{' '}
                    <span className="text-rose-600">({limitBlockedInfo.persenTerpakai}%)</span>
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  setIsLimitBlockedModalOpen(false);
                  setLimitBlockedInfo(null);
                }}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition cursor-pointer"
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DUPLIKAT */}
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
                <strong className="text-slate-700">{duplicateBlockedInfo.namaMitra}</strong> sudah memiliki penugasan
                pada kegiatan <strong className="text-slate-700">{duplicateBlockedInfo.namaKegiatan}</strong>.
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

      {/* MODAL PENCAIRAN HONOR */}
      {isPencairanModalOpen && pencairanPenugasan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-slate-800 text-sm">Pencairan Honor</h3>
              <button
                onClick={() => {
                  setIsPencairanModalOpen(false);
                  setPencairanPenugasan(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-4">
              {/* RINGKASAN */}
              <div className="space-y-2 text-xs">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-slate-500">Mitra</span>
                  <span className="font-semibold text-slate-800">{pencairanPenugasan.mitra?.nama_mitra || '-'}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-slate-500">Kegiatan</span>
                  <span className="font-medium text-slate-800 text-right">
                    {pencairanPenugasan.kegiatan?.nama_kegiatan || '-'}
                  </span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-slate-500">Hak Honor</span>
                  <span className="font-semibold text-blue-600">
                    {formatRupiah(Number(pencairanPenugasan.total_honor) || 0)}
                  </span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-slate-500">Sudah Dicairkan</span>
                  <span className="font-semibold text-emerald-600">{formatRupiah(totalRiwayatDicairkan)}</span>
                </div>
                <div className="flex justify-between pb-1">
                  <span className="text-slate-500">Sisa</span>
                  <span className="font-bold text-amber-600">{formatRupiah(sisaHonorPencairan)}</span>
                </div>
              </div>

              {/* RIWAYAT PENCAIRAN */}
              <div>
                <h4 className="text-xs font-semibold text-slate-700 mb-2">Riwayat Pencairan</h4>
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-40 overflow-y-auto">
                  {isLoadingRiwayat ? (
                    <div className="py-4 text-center text-[11px] text-slate-400">Memuat riwayat...</div>
                  ) : riwayatPencairan.length === 0 ? (
                    <div className="py-4 text-center text-[11px] text-slate-400">Belum ada pencairan.</div>
                  ) : (
                    riwayatPencairan.map((r, idx) => (
                      <div key={r.id || idx} className="flex justify-between items-center px-3 py-2 text-xs">
                        <div>
                          <div className="font-semibold text-slate-700">Tahap {r.tahap_ke ?? idx + 1}</div>
                          <div className="text-[10px] text-slate-400">{formatTanggal(r.tgl_pencairan)}</div>
                          {r.catatan && <div className="text-[10px] text-slate-400 italic">{r.catatan}</div>}
                        </div>
                        <div className="font-semibold text-emerald-600">
                          {formatRupiah(Number(r.nominal_dicairkan) || 0)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* FORM TAMBAH PENCAIRAN */}
              {sisaHonorPencairan > 0 ? (
                <form onSubmit={handleSavePencairan} className="space-y-3 pt-2 border-t border-slate-100">
                  <h4 className="text-xs font-semibold text-slate-700">Tambah Pencairan</h4>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nominal (Rp)</label>
                    <input
                      type="number"
                      min="0"
                      max={sisaHonorPencairan}
                      value={pencairanForm.nominal || 0}
                      onChange={(e) =>
                        setPencairanForm((prev) => ({ ...prev, nominal: Number(e.target.value) }))
                      }
                      className={`w-full px-3 py-2 text-xs border rounded-md outline-none transition ${
                        nominalPencairanInvalid && pencairanForm.nominal > 0
                          ? 'border-rose-400 focus:border-rose-500 bg-rose-50'
                          : 'border-slate-200 focus:border-blue-500'
                      }`}
                      required
                    />
                    {pencairanForm.nominal > sisaHonorPencairan ? (
                      <p className="text-[10px] text-rose-600 font-semibold mt-1">
                        ⛔ Nominal melebihi sisa honor ({formatRupiah(sisaHonorPencairan)}). Kurangi nominalnya.
                      </p>
                    ) : (
                      <p className="text-[10px] text-slate-400 mt-1">
                        Maksimal: {formatRupiah(sisaHonorPencairan)}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal</label>
                    <input
                      type="date"
                      value={pencairanForm.tanggal}
                      onChange={(e) => setPencairanForm((prev) => ({ ...prev, tanggal: e.target.value }))}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan (opsional)</label>
                    <textarea
                      value={pencairanForm.catatan}
                      onChange={(e) => setPencairanForm((prev) => ({ ...prev, catatan: e.target.value }))}
                      rows={2}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 outline-none resize-none"
                      placeholder="Catatan tambahan mengenai pencairan ini..."
                    />
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsPencairanModalOpen(false);
                        setPencairanPenugasan(null);
                      }}
                      className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-md transition cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={isPencairanSubmitting || nominalPencairanInvalid}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isPencairanSubmitting ? 'Menyimpan...' : 'Simpan'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="p-3 rounded-lg text-xs font-medium border bg-emerald-50 text-emerald-800 border-emerald-200 text-center">
                  ✅ Honor sudah dicairkan penuh (Lunas).
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
