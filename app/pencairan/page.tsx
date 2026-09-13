'use client';

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';

import { createClient } from '@supabase/supabase-js';
import { useSearchParams } from 'next/navigation';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { logActivity } from '@/lib/logActivity';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

// =========================================================
// TYPES
// =========================================================

interface PencairanRow {
  id?: number;
  sobat_id: string;
  penugasan_id: number;

  bulan_pencairan: string;

  tahap_ke?: number | null;

  nominal_rencana: number;

  nominal_dicairkan: number | null;

  tgl_pencairan: string | null;

  metode_pembayaran?: string | null;

  no_referensi_sp2d?: string | null;

  catatan?: string | null;

  created_at?: string;

  mitra?: {
    nama_mitra: string;
    status_keaktifan?: string;
  };

  penugasan?: {
    kegiatan?: {
      nama_kegiatan: string;
      kode_kegiatan?: string;
    };
  };
}

const getSisaRencana = (row: PencairanRow) =>
  Math.max(0, (Number(row.nominal_rencana) || 0) - (Number(row.nominal_dicairkan) || 0));

interface PenugasanOption {
  id: number;
  sobat_id: string;
  nama_mitra: string;
  nama_kegiatan: string;

  bulanKegiatanRaw?: string | null;

  periodeMulai?: string | null;
  periodeSelesai?: string | null;

  periodeOptions?: string[];
}

interface LimitHonor {
  id: number;
  bulan: number | null;
  tahun: number | null;
  bulan_periode: string;
  batas_maksimal: number;
  persen_peringatan: number;
}

type RowStatus =
  | 'sesuai'
  | 'kurang'
  | 'lebih'
  | 'terlambat'
  | 'menunggu';

interface MonthlyUsage {
  limit: number;
  realized: number;
  planned: number;
  total: number;
  remaining: number;
  percentage: number;
}

interface MasalahGroup {
  sobatId: string;
  namaMitra: string;
  bulan: string;

  totalRencana: number;
  totalRealisasi: number;
  bebanAktual: number;

  limit: number;
  sisa: number;
  persen: number;

  melebihi: boolean;
  tercapai: boolean;
  mendekati: boolean;
  adaTerlambat: boolean;
}

interface MitraGroup {
  sobat_id: string;
  mitra?: PencairanRow['mitra'];
  items: PencairanRow[];
  totalRencana: number;
  totalRealisasi: number;
  totalSisa: number;
}

// Hasil saran reschedule bulan baru.
interface RescheduleSuggestion {
  bulan: string;
  sisaLimit: number;
  diLuarPeriode: boolean;
}

// =========================================================
// CONSTANTS
// =========================================================

const NAMA_BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const DEFAULT_WARN_PERCENT = 80;

const MASALAH_PREVIEW_COUNT = 2;

const PERHATIAN_PREVIEW_COUNT = 3;

// =========================================================
// HELPERS
// =========================================================

const formatRupiah = (val: number) =>
  `Rp ${Math.round(Number(val) || 0).toLocaleString('id-ID')}`;

// Format angka mentah jadi string berpemisah ribuan titik (gaya Indonesia)
// untuk ditampilkan di dalam input teks, TANPA prefix "Rp" — supaya bisa
// terus diedit oleh admin secara natural (mis. 3000000 -> "3.000.000").
const formatNumberWithDots = (val: number | string): string => {
  const raw = typeof val === 'string' ? val.replace(/\D/g, '') : String(Math.round(val) || 0);
  if (!raw) return '';
  return Number(raw).toLocaleString('id-ID');
};

// Kebalikan dari formatNumberWithDots: buang semua titik/karakter non-digit
// supaya balik jadi angka mentah yang aman disimpan ke state & database.
const parseNumberFromDots = (val: string): number => {
  const digitsOnly = val.replace(/\D/g, '');
  return digitsOnly ? Number(digitsOnly) : 0;
};

const parseBulanLabel = (
  label: string
): { idx: number; year: number } | null => {
  if (!label) return null;

  const parts = label.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const namaBulan = parts[0];
  const tahunStr = parts[1];

  const idx = NAMA_BULAN_ID.findIndex(
    (m) => m.toLowerCase() === namaBulan.toLowerCase()
  );
  const year = parseInt(tahunStr, 10);

  if (idx === -1 || isNaN(year)) return null;

  return { idx, year };
};

const addMonths = (label: string, n: number): string => {
  const parsed = parseBulanLabel(label);
  if (!parsed) return label;

  let { idx, year } = parsed;
  idx += n;

  while (idx > 11) {
    idx -= 12;
    year += 1;
  }
  while (idx < 0) {
    idx += 12;
    year -= 1;
  }

  return `${NAMA_BULAN_ID[idx]} ${year}`;
};

// ⭐ PERUBAHAN (dari sesi sebelumnya): disamakan dengan hook Bell
// (useMasalahMitra.ts) supaya "akhir bulan" dihitung jam 23:59:59.999
// di hari terakhir bulan itu, bukan jam 00:00:00. Ini membuat status
// "terlambat" konsisten antara halaman Pencairan dan notifikasi Bell.
const isBulanLewat = (label: string): boolean => {
  const parsed = parseBulanLabel(label);
  if (!parsed) return false;

  const now = new Date();
  const endOfBulan = new Date(parsed.year, parsed.idx + 1, 0, 23, 59, 59, 999);

  return endOfBulan < now;
};

const labelToMonthInput = (label: string): string => {
  const parsed = parseBulanLabel(label);
  if (!parsed) return '';

  return `${parsed.year}-${String(parsed.idx + 1).padStart(2, '0')}`;
};

const monthInputToLabel = (value: string): string => {
  if (!value) return '';

  const [yearStr, monthStr] = value.split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);

  if (isNaN(year) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    return '';
  }

  return `${NAMA_BULAN_ID[monthNum - 1]} ${year}`;
};

const monthLabelToKey = (label: string): number | null => {
  const parsed = parseBulanLabel(label);
  if (!parsed) return null;
  return parsed.year * 12 + parsed.idx;
};

const isActualMonthAfterPlanned = (actual: string, planned: string): boolean => {
  const actualKey = monthLabelToKey(actual);
  const plannedKey = monthLabelToKey(planned);
  if (actualKey === null || plannedKey === null) return false;
  return actualKey > plannedKey;
};

// Bandingkan dua label bulan berdasarkan (tahun, bulan) yang sudah
// dinormalisasi, BUKAN kesamaan string mentah. Ini supaya variasi
// format kecil (mis. spasi ganda "September  2026", huruf besar/kecil)
// tidak membuat 2 label yang sebenarnya sama dianggap berbeda — yang
// sebelumnya bisa membuat bulan yang sudah punya rencana tetap muncul
// lagi di form karena perbandingan string persisnya gagal cocok.
const bulanEquals = (a: string, b: string): boolean => {
  const ka = monthLabelToKey(a);
  const kb = monthLabelToKey(b);

  if (ka === null || kb === null) {
    return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
  }

  return ka === kb;
};

// =========================================================
// PARSING PERIODE KEGIATAN
// =========================================================
const parseRangeKegiatan = (
  text: string | null | undefined
): { start: string; end: string } | null => {
  if (!text) return null;

  const normalized = text.trim().replace(/\s+/g, ' ');

  // FORMAT RENTANG
  // September 2026 s.d. November 2026 / sd / - / – / —
  const rangeMatch = normalized.match(
    /^([A-Za-zÀ-ÿ]+)\s+(\d{4})\s*(?:s\s*\.?\s*d\s*\.?|[-–—])\s*([A-Za-zÀ-ÿ]+)\s+(\d{4})/i
  );

  if (rangeMatch) {
    const start = `${rangeMatch[1]} ${rangeMatch[2]}`;
    const end = `${rangeMatch[3]} ${rangeMatch[4]}`;

    if (parseBulanLabel(start) && parseBulanLabel(end)) {
      return { start, end };
    }
  }

  // FORMAT 1 BULAN — start = end
  const singleMatch = normalized.match(/^([A-Za-zÀ-ÿ]+)\s+(\d{4})/);

  if (singleMatch) {
    const singleMonth = `${singleMatch[1]} ${singleMatch[2]}`;

    if (parseBulanLabel(singleMonth)) {
      return { start: singleMonth, end: singleMonth };
    }
  }

  return null;
};

const generateMonthRange = (start: string, end: string): string[] => {
  const startParsed = parseBulanLabel(start);
  const endParsed = parseBulanLabel(end);

  if (!startParsed || !endParsed) return [];

  const result: string[] = [];
  let current = start;
  let guard = 0;

  while (guard < 60) {
    result.push(current);

    const cur = parseBulanLabel(current);
    if (!cur) break;

    if (cur.idx === endParsed.idx && cur.year === endParsed.year) break;

    current = addMonths(current, 1);
    guard += 1;
  }

  return result;
};

// =========================================================
// STATUS
// =========================================================

const getRowStatus = (row: PencairanRow): RowStatus => {
  if (row.nominal_dicairkan === null || row.nominal_dicairkan === undefined) {
    return isBulanLewat(row.bulan_pencairan) ? 'terlambat' : 'menunggu';
  }

  if (Number(row.nominal_dicairkan) === Number(row.nominal_rencana)) {
    return 'sesuai';
  }

  if (Number(row.nominal_dicairkan) < Number(row.nominal_rencana)) {
    return 'kurang';
  }

  return 'lebih';
};

const STATUS_META: Record<
  RowStatus,
  { label: string; style: string; icon: string }
> = {
  sesuai: {
    label: 'Sesuai',
    style: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: '🟢',
  },
  kurang: {
    label: 'Realisasi Kurang',
    style: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: '🟡',
  },
  lebih: {
    label: 'Realisasi Lebih',
    style: 'bg-sky-50 text-sky-700 border-sky-200',
    icon: '🔵',
  },
  terlambat: {
    label: 'Terlambat',
    style: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: '🔴',
  },
  menunggu: {
    label: 'Menunggu',
    style: 'bg-slate-50 text-slate-600 border-slate-200',
    icon: '⏳',
  },
};

// =========================================================
// PAGE
// =========================================================

export default function PencairanPage() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const searchParams = useSearchParams();

  const [autoOpenHandled, setAutoOpenHandled] = useState(false);

  const [rows, setRows] = useState<PencairanRow[]>([]);
  const [penugasanOptions, setPenugasanOptions] = useState<PenugasanOption[]>([]);
  const [limitList, setLimitList] = useState<LimitHonor[]>([]);

  const [loading, setLoading] = useState(true);

  const [bulanFilter, setBulanFilter] = useState<string>('Semua Bulan');
  const [mitraFilter, setMitraFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('Semua Status');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<
    Partial<PencairanRow> & { nominal_rencana_original?: number }
  >({
    penugasan_id: 0,
    bulan_pencairan: '',
    nominal_rencana: 0,
    tahap_ke: null,
  });

  // Nominal per bulan untuk mode "rencana bertahap" (multi-bulan).
  // key = label bulan (mis. "September 2026"), value = nominal rencana bulan itu.
  // Dipakai saat TAMBAH maupun EDIT rencana untuk penugasan yang periode
  // kegiatannya lebih dari 1 bulan. Bulan yang dikosongkan (0) tidak
  // akan dibuatkan/disimpan barisnya di database.
  const [multiMonthAmounts, setMultiMonthAmounts] = useState<Record<string, number>>({});

  // Mapping bulan -> id baris pencairan_honor yang SUDAH ADA di database
  // untuk penugasan yang sedang diedit/dibuka. Dipakai supaya saat mode
  // bertahap, kita tahu bulan mana yang harus di-UPDATE (row id ada),
  // di-INSERT (belum ada row-nya), atau di-DELETE (row ada tapi nominal
  // dikosongkan jadi 0).
  const [multiMonthRowIds, setMultiMonthRowIds] = useState<Record<string, number>>({});

  // Pencarian penugasan (combobox) — supaya admin bisa mengetik nama
  // mitra / nama kegiatan / SOBAT ID untuk menyaring daftar penugasan,
  // alih-alih men-scroll dropdown panjang satu per satu.
  const [penugasanSearchQuery, setPenugasanSearchQuery] = useState('');
  const [isPenugasanDropdownOpen, setIsPenugasanDropdownOpen] = useState(false);
  const penugasanInputRef = useRef<HTMLInputElement | null>(null);

  const [realisasiTarget, setRealisasiTarget] = useState<PencairanRow | null>(null);

  const [realisasiForm, setRealisasiForm] = useState({
    nominal: 0,
    tanggal: new Date().toISOString().slice(0, 10),
    metode: '',
    catatan: '',
  });

  const [isRealisasiSubmitting, setIsRealisasiSubmitting] = useState(false);

  const [detailGroup, setDetailGroup] = useState<{
    sobatId: string;
    bulan: string;
  } | null>(null);

  // Expand/collapse per mitra di tabel.
  const [expandedMitraIds, setExpandedMitraIds] = useState<Set<string>>(new Set());

  // Notifikasi masalah limit — dibatasi tampil dulu, bisa dibuka semua.
  const [showAllMasalah, setShowAllMasalah] = useState(false);

  // Notifikasi "terlambat" dan "belum realisasi/kurang" juga dibatasi
  // tampil dulu (supaya notifikasi tidak memakan banyak tempat), tapi
  // baris "+ N lainnya" di bawahnya harus bisa diklik untuk membuka semua.
  const [showAllOverdue, setShowAllOverdue] = useState(false);
  const [showAllPerluTindakLanjut, setShowAllPerluTindakLanjut] = useState(false);

  // =========================================================
  // FETCH
  // =========================================================

  const fetchAll = useCallback(async () => {
    setLoading(true);

    try {
      const { data: pencairanData, error: errPencairan } = await supabase
        .from('pencairan_honor')
        .select(`
          *,
          penugasan:penugasan_id (
            kegiatan:kegiatan_id (
              nama_kegiatan,
              kode_kegiatan
            )
          )
        `)
        .order('bulan_pencairan', { ascending: true });

      if (errPencairan) throw errPencairan;

      const { data: mitraData, error: errMitra } = await supabase
        .from('mitra')
        .select('sobat_id, nama_mitra, status_keaktifan');

      if (errMitra) throw errMitra;

      const mitraMap = new Map(
        (mitraData || []).map((m: any) => [
          m.sobat_id,
          { nama_mitra: m.nama_mitra, status_keaktifan: m.status_keaktifan },
        ])
      );

      setRows(
        (pencairanData || []).map((row: any) => ({
          ...row,
          mitra: mitraMap.get(row.sobat_id),
        }))
      );

      const { data: penugasanData, error: errPenugasan } = await supabase
        .from('penugasan')
        .select(`
          id,
          sobat_id,
          mitra:sobat_id ( nama_mitra ),
          kegiatan:kegiatan_id ( nama_kegiatan, bulan_kegiatan )
        `);

      if (errPenugasan) throw errPenugasan;

      setPenugasanOptions(
        (penugasanData || []).map((p: any) => {
          const bulanKegiatanRaw = p.kegiatan?.bulan_kegiatan || null;
          const range = parseRangeKegiatan(bulanKegiatanRaw);
          const periodeOptions = range
            ? generateMonthRange(range.start, range.end)
            : [];

          return {
            id: p.id,
            sobat_id: p.sobat_id,
            nama_mitra: p.mitra?.nama_mitra || p.sobat_id,
            nama_kegiatan: p.kegiatan?.nama_kegiatan || '-',
            bulanKegiatanRaw,
            periodeMulai: range?.start || null,
            periodeSelesai: range?.end || null,
            periodeOptions,
          };
        })
      );

      const { data: limitData, error: errLimit } = await supabase
        .from('limit_honor')
        .select(`
          id,
          bulan,
          tahun,
          bulan_periode,
          batas_maksimal,
          persen_peringatan
        `);

      if (errLimit) throw errLimit;

      setLimitList(
        (limitData || []).map((l: any) => ({
          ...l,
          batas_maksimal: Number(l.batas_maksimal) || 0,
          persen_peringatan: Number(l.persen_peringatan) || DEFAULT_WARN_PERCENT,
        }))
      );
    } catch (error: any) {
      console.error('Gagal memuat data pencairan:', error);
      alert('Gagal memuat data pencairan: ' + (error?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // =========================================================
  // AUTO OPEN DARI PENUGASAN
  // =========================================================

  useEffect(() => {
    if (autoOpenHandled) return;

    const penugasanIdFromUrl = searchParams.get('penugasan_id');
    if (!penugasanIdFromUrl) return;

    if (penugasanOptions.length === 0) return;

    const targetId = Number(penugasanIdFromUrl);
    const penugasan = penugasanOptions.find((p) => p.id === targetId);

    if (penugasan) {
      setIsEditMode(false);
      setFormData({
        penugasan_id: targetId,
        bulan_pencairan: getFirstAvailableMonth(penugasan),
        nominal_rencana: 0,
        tahap_ke: null,
      });
      setMultiMonthAmounts({});
      setMultiMonthRowIds({});
      setPenugasanSearchQuery(`${penugasan.nama_mitra} — ${penugasan.nama_kegiatan}`);
      setIsPenugasanDropdownOpen(false);
      setIsFormOpen(true);
    }

    setAutoOpenHandled(true);
  }, [autoOpenHandled, searchParams, penugasanOptions]);

  // =========================================================
  // AUTO OPEN DETAIL DARI NOTIFIKASI HEADER
  // =========================================================

  useEffect(() => {
  const detailSobatId = searchParams.get('detail_sobat_id');
  const detailBulan = searchParams.get('detail_bulan');

  if (!detailSobatId || !detailBulan) return;
  if (loading) return;

  /*
   * Cari berdasarkan BULAN YANG MEMBEBANI LIMIT,
   * bukan hanya bulan_pencairan.
   *
   * Belum realisasi:
   *   bulan beban = bulan_pencairan
   *
   * Sudah realisasi:
   *   bulan beban = bulan dari tgl_pencairan
   */
  const hasData = rows.some((r) => {
    if (r.sobat_id !== detailSobatId) return false;

    const sudahRealisasi =
      r.nominal_dicairkan !== null &&
      r.nominal_dicairkan !== undefined;

    if (sudahRealisasi && r.tgl_pencairan) {
      const bulanRealisasi = monthInputToLabel(
        r.tgl_pencairan.slice(0, 7)
      );

      return bulanRealisasi === detailBulan;
    }

    return r.bulan_pencairan === detailBulan;
  });

  if (!hasData) return;

  setDetailGroup({
    sobatId: detailSobatId,
    bulan: detailBulan,
  });

  // Bersihkan query URL setelah modal berhasil dibuka
  window.history.replaceState({}, '', '/pencairan');
}, [searchParams, rows, loading]);

  // =========================================================
  // LIMIT
  // =========================================================

  const getLimitForBulan = useCallback(
    (bulanLabel: string) => {
      if (!bulanLabel) return null;

      const byPeriode = limitList.find((l) =>
        bulanEquals(l.bulan_periode || '', bulanLabel)
      );

      if (byPeriode) return byPeriode;

      const parsed = parseBulanLabel(bulanLabel);
      if (!parsed) return null;

      return (
        limitList.find(
          (l) => Number(l.bulan) === parsed.idx + 1 && Number(l.tahun) === parsed.year
        ) || null
      );
    },
    [limitList]
  );

  // =========================================================
  // PERHITUNGAN BEBAN LIMIT
  //
  // Row belum direalisasi: dihitung nominal_rencana
  // Row sudah direalisasi: dihitung nominal_dicairkan
  // (rencana yang sudah direalisasi TIDAK dihitung dua kali)
  // =========================================================

  // Bulan yang benar-benar membebani limit:
  // - belum realisasi -> bulan rencana
  // - sudah realisasi -> bulan dari tgl_pencairan
  const getRowUsageMonth = useCallback((row: PencairanRow): string => {
    const sudahRealisasi = row.nominal_dicairkan !== null && row.nominal_dicairkan !== undefined;

    if (sudahRealisasi && row.tgl_pencairan) {
      const monthValue = row.tgl_pencairan.slice(0, 7);
      const actualMonth = monthInputToLabel(monthValue);
      if (actualMonth) return actualMonth;
    }

    return row.bulan_pencairan;
  }, []);

  const getMonthlyUsage = useCallback(
    (sobatId: string, bulan: string, excludeRowId?: number): MonthlyUsage => {
      const limitObj = getLimitForBulan(bulan);
      const limit = Number(limitObj?.batas_maksimal) || 0;

      let realized = 0;
      let planned = 0;

      rows.forEach((row) => {
        if (row.sobat_id !== sobatId) return;
        if (excludeRowId !== undefined && row.id === excludeRowId) return;
        if (getRowUsageMonth(row) !== bulan) return;

        const real = row.nominal_dicairkan;

        if (real !== null && real !== undefined) {
          realized += Number(real) || 0;
        } else {
          planned += Number(row.nominal_rencana) || 0;
        }
      });

      const total = realized + planned;
      const remaining = limit - total;
      const percentage = limit > 0 ? (total / limit) * 100 : 0;

      return { limit, realized, planned, total, remaining, percentage };
    },
    [rows, getLimitForBulan, getRowUsageMonth]
  );

  // =========================================================
  // DETEKSI MASALAH
  //
  // Tiga status yang saling eksklusif untuk beban bulan ini:
  // - melebihi : total  > limit
  // - tercapai : total == limit (persis 100%, belum lebih)
  // - mendekati: total  < limit tapi >= ambang peringatan (mis. 80%)
  // =========================================================

  const masalahGroups = useMemo<MasalahGroup[]>(() => {
    const keys = new Set<string>();

    rows.forEach((r) => {
      keys.add(`${r.sobat_id}__${getRowUsageMonth(r)}`);
    });

    const result: MasalahGroup[] = [];

    keys.forEach((key) => {
      const separatorIndex = key.indexOf('__');
      const sobatId = separatorIndex >= 0 ? key.slice(0, separatorIndex) : key;
      const bulan = separatorIndex >= 0 ? key.slice(separatorIndex + 2) : '';

      const limitObj = getLimitForBulan(bulan);
      const usage = getMonthlyUsage(sobatId, bulan);

      const sumberRows = rows.filter(
        (r) => r.sobat_id === sobatId && getRowUsageMonth(r) === bulan
      );

      const adaTerlambat = sumberRows.some((r) => getRowStatus(r) === 'terlambat');

      const melebihi = usage.limit > 0 && usage.total > usage.limit;

      const tercapai =
        !melebihi && usage.limit > 0 && usage.total > 0 && usage.total === usage.limit;

      const warnPercent = limitObj?.persen_peringatan ?? DEFAULT_WARN_PERCENT;

      const mendekati =
        !melebihi &&
        !tercapai &&
        usage.limit > 0 &&
        usage.percentage >= warnPercent;

      // Ditampilkan kalau:
      // 1. limit terlampaui
      // 2. limit persis tercapai (100%)
      // 3. mendekati limit
      // 4. ada pencairan terlambat
      if (melebihi || tercapai || mendekati || adaTerlambat) {
        const namaMitra = sumberRows[0]?.mitra?.nama_mitra || sobatId;

        result.push({
          sobatId,
          namaMitra,
          bulan,

          totalRencana: sumberRows.reduce(
            (sum, r) => sum + (Number(r.nominal_rencana) || 0),
            0
          ),
          totalRealisasi: sumberRows.reduce(
            (sum, r) => sum + (Number(r.nominal_dicairkan) || 0),
            0
          ),

          bebanAktual: usage.total,
          limit: usage.limit,
          sisa: usage.remaining,
          persen: usage.percentage,

          melebihi,
          tercapai,
          mendekati,
          adaTerlambat,
        });
      }
    });

    return result.sort((a, b) => {
      if (a.melebihi !== b.melebihi) return a.melebihi ? -1 : 1;
      if (a.tercapai !== b.tercapai) return a.tercapai ? -1 : 1;
      if (a.adaTerlambat !== b.adaTerlambat) return a.adaTerlambat ? -1 : 1;
      return b.persen - a.persen;
    });
  }, [rows, getLimitForBulan, getMonthlyUsage, getRowUsageMonth]);

  const visibleMasalahGroups = showAllMasalah
    ? masalahGroups
    : masalahGroups.slice(0, MASALAH_PREVIEW_COUNT);

  // Rencana yang BELUM direalisasikan (menunggu — belum lewat bulan, jadi
  // beda dari "terlambat" yang sudah punya notifikasi sendiri) ATAU yang
  // REALISASINYA KURANG dari rencana. Dua kondisi ini digabung jadi satu
  // notifikasi "perlu ditindaklanjuti" supaya admin tidak perlu membuka
  // tiap mitra satu-satu untuk menemukannya.
  const perluTindakLanjutRows = useMemo(
    () =>
      rows.filter((r) => {
        const status = getRowStatus(r);
        return status === 'menunggu' || status === 'kurang';
      }),
    [rows]
  );

  // =========================================================
  // RESCHEDULE SUGGESTION
  //
  // Strategi dua tahap:
  // 1. Coba cari bulan kandidat DI DALAM periode kegiatan (perilaku lama).
  // 2. Kalau tidak ada satupun bulan dalam periode yang punya sisa limit
  //    cukup (mis. periode kegiatan cuma 1 bulan), coba cari bulan lain
  //    DI LUAR periode kegiatan — tetap harus belum lewat & sisa limit
  //    cukup. Hasilnya ditandai `diLuarPeriode` supaya UI bisa memberi
  //    peringatan dan admin yang memutuskan.
  // =========================================================

  const findRescheduleSuggestion = useCallback(
    (
      row: PencairanRow,
      fromBulan: string,
      amountToMove: number
    ): RescheduleSuggestion | null => {
      if (amountToMove <= 0) return null;

      const penugasan = penugasanOptions.find((p) => p.id === row.penugasan_id);
      const allowedMonths = penugasan?.periodeOptions || [];

      const cariBulan = (hanyaDalamPeriode: boolean): RescheduleSuggestion | null => {
        for (let i = 1; i <= 12; i++) {
          const candidateBulan = addMonths(fromBulan, i);

          // Jangan pernah menyarankan bulan yang sudah lewat.
          if (isBulanLewat(candidateBulan)) continue;

          if (
            hanyaDalamPeriode &&
            allowedMonths.length > 0 &&
            !allowedMonths.includes(candidateBulan)
          ) {
            continue;
          }

          const limitObj = getLimitForBulan(candidateBulan);
          if (!limitObj) continue;

          // "Tidak boleh numpuk" di sini berarti tidak boleh melebihi
          // limit bulan itu — bukan berarti bulannya harus 0 rencana
          // sama sekali. Kalau bulan itu sudah ada rencana lain (dari
          // kegiatan yang sama atau beda) tapi sisa limitnya masih
          // cukup menampung nominal yang dipindah, tetap boleh dipakai.
          const usage = getMonthlyUsage(row.sobat_id, candidateBulan, row.id);
          const sisa = limitObj.batas_maksimal - usage.total;

          if (sisa >= amountToMove) {
            return {
              bulan: candidateBulan,
              sisaLimit: sisa,
              diLuarPeriode:
                allowedMonths.length > 0 && !allowedMonths.includes(candidateBulan),
            };
          }
        }

        return null;
      };

      // 1) Coba dulu di dalam periode kegiatan.
      const dalamPeriode = cariBulan(true);
      if (dalamPeriode) return dalamPeriode;

      // 2) Kalau tidak ketemu, baru coba di luar periode kegiatan.
      return cariBulan(false);
    },
    [penugasanOptions, getMonthlyUsage, getLimitForBulan]
  );

  // =========================================================
  // RESCHEDULE
  // =========================================================

  const handleReschedule = async (row: PencairanRow, bulanBaru: string) => {
    if (!row.id) return;

    if (row.nominal_dicairkan !== null && row.nominal_dicairkan !== undefined) {
      alert(
        'Pencairan yang sudah direalisasikan tidak dapat dijadwalkan ulang. Yang dapat dipindahkan adalah rencana pencairan yang belum direalisasikan.'
      );
      return;
    }

    const penugasan = penugasanOptions.find((p) => p.id === row.penugasan_id);

    // Bulan di luar periode kegiatan TIDAK diblokir total lagi — hanya
    // diberi peringatan di konfirmasi, karena reschedule ke luar periode
    // kadang memang satu-satunya opsi (mis. periode kegiatan cuma 1 bulan).
    const diLuarPeriode =
      !!penugasan?.periodeOptions?.length &&
      !penugasan.periodeOptions.includes(bulanBaru);

    const targetUsage = getMonthlyUsage(row.sobat_id, bulanBaru, row.id);
    const targetLimit = getLimitForBulan(bulanBaru);

    if (!targetLimit) {
      alert(`Limit honor bulan ${bulanBaru} belum diatur.`);
      return;
    }

    const sisa = targetLimit.batas_maksimal - targetUsage.total;

    if (Number(row.nominal_rencana) > sisa) {
      alert(
        `Bulan ${bulanBaru} tidak memiliki sisa limit yang cukup. Sisa limit: ${formatRupiah(
          sisa
        )}, sedangkan rencana yang dipindahkan: ${formatRupiah(row.nominal_rencana)}.`
      );
      return;
    }

    const confirmMsg =
      `Pindahkan rencana pencairan ${
        row.mitra?.nama_mitra || row.sobat_id
      } sebesar ${formatRupiah(row.nominal_rencana)} dari ${row.bulan_pencairan} ke ${bulanBaru}?` +
      (diLuarPeriode
        ? `\n\n⚠️ Bulan ${bulanBaru} berada di luar periode kegiatan (${
            penugasan?.bulanKegiatanRaw || '-'
          }). Pastikan ini sudah sesuai kebijakan sebelum melanjutkan.`
        : '');

    if (!window.confirm(confirmMsg)) return;

    try {
      const { error } = await supabase
        .from('pencairan_honor')
        .update({ bulan_pencairan: bulanBaru })
        .eq('id', row.id);

      if (error) throw error;

      await logActivity({
        aksi: 'ubah',
        entitas: 'pencairan_honor',
        deskripsi: `Menjadwalkan ulang rencana pencairan ${
          row.mitra?.nama_mitra || row.sobat_id
        } sebesar ${formatRupiah(row.nominal_rencana)} dari ${row.bulan_pencairan} ke ${bulanBaru}${
          diLuarPeriode ? ' (di luar periode kegiatan)' : ''
        }`,
        referensiId: row.id,
      });

      setDetailGroup(null);
      await fetchAll();
    } catch (error: any) {
      alert('Gagal menjadwalkan ulang: ' + error.message);
    }
  };

  // =========================================================
  // FILTER
  // =========================================================

  const bulanOptionsFromData = useMemo(() => {
    const set = new Set(rows.map((r) => r.bulan_pencairan));

    return Array.from(set).sort((a, b) => {
      const pa = parseBulanLabel(a);
      const pb = parseBulanLabel(b);

      if (!pa || !pb) return a.localeCompare(b);

      return pa.year - pb.year || pa.idx - pb.idx;
    });
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (bulanFilter !== 'Semua Bulan' && r.bulan_pencairan !== bulanFilter) {
        return false;
      }

      if (mitraFilter.trim()) {
        const kw = mitraFilter.trim().toLowerCase();
        const nama = (r.mitra?.nama_mitra || '').toLowerCase();
        const sobat = r.sobat_id.toLowerCase();

        if (!nama.includes(kw) && !sobat.includes(kw)) return false;
      }

      if (statusFilter !== 'Semua Status' && getRowStatus(r) !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [rows, bulanFilter, mitraFilter, statusFilter]);

  // =========================================================
  // GROUPING PER MITRA (tampilan tabel)
  // =========================================================

  const groupedRows = useMemo<MitraGroup[]>(() => {
    const map = new Map<string, MitraGroup>();

    filteredRows.forEach((row) => {
      const key = row.sobat_id;

      if (!map.has(key)) {
        map.set(key, {
          sobat_id: key,
          mitra: row.mitra,
          items: [],
          totalRencana: 0,
          totalRealisasi: 0,
          totalSisa: 0,
        });
      }

      const group = map.get(key)!;
      group.items.push(row);
      group.totalRencana += Number(row.nominal_rencana) || 0;
      group.totalRealisasi += Number(row.nominal_dicairkan) || 0;
    });

    const groups = Array.from(map.values()).map((group) => {
      group.totalSisa = group.totalRencana - group.totalRealisasi;

      group.items = [...group.items].sort((a, b) => {
        const pa = parseBulanLabel(a.bulan_pencairan);
        const pb = parseBulanLabel(b.bulan_pencairan);

        if (!pa || !pb) return 0;

        return pa.year - pb.year || pa.idx - pb.idx;
      });

      return group;
    });

    groups.sort((a, b) =>
      (a.mitra?.nama_mitra || a.sobat_id).localeCompare(b.mitra?.nama_mitra || b.sobat_id)
    );

    return groups;
  }, [filteredRows]);

  // Badge ringkas status per mitra: menunjukkan kondisi paling
  // mendesak di antara semua rencana pencairan mitra itu (setelah
  // filter aktif), urutannya: terlambat > lebih > kurang > menunggu.
  const getGroupStatusBadge = useCallback((group: MitraGroup) => {
    const statuses = group.items.map((r) => getRowStatus(r));
    const total = statuses.length;

    if (total === 0) return null;

    const terlambatCount = statuses.filter((s) => s === 'terlambat').length;
    const lebihCount = statuses.filter((s) => s === 'lebih').length;
    const kurangCount = statuses.filter((s) => s === 'kurang').length;
    const menungguCount = statuses.filter((s) => s === 'menunggu').length;

    if (terlambatCount > 0) {
      return {
        label: total > 1 ? `${terlambatCount}/${total} Terlambat` : 'Terlambat',
        style: STATUS_META.terlambat.style,
        icon: STATUS_META.terlambat.icon,
      };
    }
    if (lebihCount > 0) {
      return {
        label: total > 1 ? `${lebihCount}/${total} Realisasi Lebih` : 'Realisasi Lebih',
        style: STATUS_META.lebih.style,
        icon: STATUS_META.lebih.icon,
      };
    }
    if (kurangCount > 0) {
      return {
        label: total > 1 ? `${kurangCount}/${total} Realisasi Kurang` : 'Realisasi Kurang',
        style: STATUS_META.kurang.style,
        icon: STATUS_META.kurang.icon,
      };
    }
    if (menungguCount > 0) {
      return {
        label: total > 1 ? `${menungguCount}/${total} Menunggu` : 'Menunggu',
        style: STATUS_META.menunggu.style,
        icon: STATUS_META.menunggu.icon,
      };
    }

    return {
      label: 'Semua Sesuai',
      style: STATUS_META.sesuai.style,
      icon: STATUS_META.sesuai.icon,
    };
  }, []);

  const handleToggleExpandMitra = (sobatId: string) => {
    setExpandedMitraIds((prev) => {
      const next = new Set(prev);
      if (next.has(sobatId)) next.delete(sobatId);
      else next.add(sobatId);
      return next;
    });
  };

  const handleExpandAllMitra = () =>
    setExpandedMitraIds(new Set(groupedRows.map((g) => g.sobat_id)));

  const handleCollapseAllMitra = () => setExpandedMitraIds(new Set());

  // =========================================================
  // FORM TAMBAH / EDIT
  // =========================================================

  const selectedPenugasanForForm = useMemo(
    () => penugasanOptions.find((p) => p.id === formData.penugasan_id) || null,
    [penugasanOptions, formData.penugasan_id]
  );

  // ⭐ PERUBAHAN: Daftar penugasan yang BELUM punya rencana pencairan
  // sama sekali. Ini yang boleh muncul & dipilih di form TAMBAH RENCANA
  // PENCAIRAN. Begitu sebuah penugasan sudah punya minimal 1 baris di
  // `pencairan_honor` — mau itu masih rencana, sudah direalisasikan
  // sebagian (kurang/lebih), atau sudah direalisasikan penuh (sesuai)
  // — penugasan itu TIDAK BOLEH tampil lagi di daftar Tambah, karena
  // aturan bisnisnya adalah "satu penugasan = satu rencana pencairan".
  // Tidak berlaku untuk mode EDIT, karena edit memang untuk penugasan
  // yang sudah punya rencana.
  const availablePenugasanOptionsForAdd = useMemo(
    () =>
      penugasanOptions.filter(
        (p) => !rows.some((r) => r.penugasan_id === p.id)
      ),
    [penugasanOptions, rows]
  );

  // Daftar penugasan yang sudah disaring sesuai kata kunci pencarian
  // (nama mitra / nama kegiatan / SOBAT ID) untuk combobox pemilihan
  // penugasan, supaya admin tidak perlu men-scroll dropdown panjang.
  //
  // ⭐ PERUBAHAN: saat mode TAMBAH, basis pencariannya adalah
  // `availablePenugasanOptionsForAdd` (yang belum punya rencana sama
  // sekali) — bukan seluruh `penugasanOptions` lagi. Saat mode EDIT,
  // dropdown ini memang tidak dipakai (input disabled), tapi tetap
  // dijaga konsisten memakai daftar penuh.
  const filteredPenugasanOptions = useMemo(() => {
    const basis = isEditMode ? penugasanOptions : availablePenugasanOptionsForAdd;
    const q = penugasanSearchQuery.trim().toLowerCase();

    if (!q) return basis;

    return basis.filter(
      (p) =>
        p.nama_mitra.toLowerCase().includes(q) ||
        p.nama_kegiatan.toLowerCase().includes(q) ||
        p.sobat_id.toLowerCase().includes(q)
    );
  }, [
    penugasanOptions,
    availablePenugasanOptionsForAdd,
    isEditMode,
    penugasanSearchQuery,
  ]);

  // Mode "rencana bertahap": berlaku baik saat TAMBAH maupun EDIT, kalau
  // periode kegiatan penugasan ini lebih dari 1 bulan. Kalau cuma 1
  // bulan, form tetap pakai tampilan lama (1 dropdown bulan + 1 nominal).
  const isMultiMonthMode = useMemo(
    () =>
      !!selectedPenugasanForForm &&
      (selectedPenugasanForForm.periodeOptions?.length || 0) > 1,
    [selectedPenugasanForForm]
  );

  const totalMultiMonthAmount = useMemo(
    () =>
      Object.values(multiMonthAmounts).reduce(
        (sum, v) => sum + (Number(v) || 0),
        0
      ),
    [multiMonthAmounts]
  );

  // Cari rencana pencairan yang SUDAH ADA untuk kombinasi penugasan+bulan
  // tertentu. Dipakai supaya bulan yang sudah punya rencana tidak bisa
  // dipilih/diisi lagi dari form yang sama (mencegah duplikat), baik di
  // mode 1 bulan maupun mode bertahap. `excludeRowId` dipakai saat edit
  // supaya baris yang sedang diedit tidak menganggap dirinya sendiri
  // sebagai "sudah ada".
  const getExistingRencanaForBulan = useCallback(
    (penugasanId: number, bulan: string, excludeRowId?: number) => {
      return (
        rows.find(
          (r) =>
            r.penugasan_id === penugasanId &&
            r.id !== excludeRowId &&
            bulanEquals(r.bulan_pencairan || '', bulan)
        ) || null
      );
    },
    [rows]
  );

  // Satu penugasan hanya boleh mempunyai SATU rencana pencairan aktif.
  // Jika sudah ada minimal satu baris pencairan_honor untuk penugasan ini,
  // penambahan rencana baru diblokir, walaupun rencana lama baru terisi 1 bulan.
  // Edit rencana yang sudah ada tetap diperbolehkan.
  //
  // Catatan: sekarang kasus ini seharusnya sudah jarang tercapai lewat UI,
  // karena `availablePenugasanOptionsForAdd` sudah menyaring penugasan
  // yang sudah punya rencana dari daftar combobox sejak awal. Blok ini
  // tetap dipertahankan sebagai pengaman kedua (defense in depth), misalnya
  // untuk kondisi race-condition (dua tab dibuka bersamaan).
  const existingRencanaForSelectedPenugasan = useMemo(() => {
    if (isEditMode || !selectedPenugasanForForm) return [];
    return rows.filter((r) => r.penugasan_id === selectedPenugasanForForm.id);
  }, [isEditMode, rows, selectedPenugasanForForm]);

  const hasExistingRencanaForSelectedPenugasan =
    existingRencanaForSelectedPenugasan.length > 0;

  // =========================================================
  // SISA LIMIT FORM
  // =========================================================

  const sisaLimitUntukForm = useMemo(() => {
    if (!formData.bulan_pencairan) return null;

    const penugasan = penugasanOptions.find((p) => p.id === formData.penugasan_id);
    if (!penugasan) return null;

    const limitObj = getLimitForBulan(formData.bulan_pencairan);

    if (!limitObj) {
      return { unset: true, sisa: 0, limit: 0 };
    }

    const currentRowId = isEditMode && formData.id ? Number(formData.id) : undefined;

    const usage = getMonthlyUsage(
      penugasan.sobat_id,
      formData.bulan_pencairan,
      currentRowId
    );

    return {
      unset: false,
      sisa: limitObj.batas_maksimal - usage.total,
      limit: limitObj.batas_maksimal,
      digunakan: usage.total,
    };
  }, [formData, penugasanOptions, getLimitForBulan, getMonthlyUsage, isEditMode]);

  // =========================================================
  // OPEN ADD / EDIT
  // =========================================================

  const getFirstAvailableMonth = useCallback(
    (penugasan: PenugasanOption | undefined) => {
      if (!penugasan) return '';

      const months = penugasan.periodeOptions || [];
      if (months.length === 0) return '';

      const available = months.find((bulan) => {
        // Lewati bulan yang sudah punya rencana untuk penugasan ini.
        const alreadyPlanned = rows.some(
          (r) =>
            r.penugasan_id === penugasan.id &&
            bulanEquals(r.bulan_pencairan || '', bulan)
        );
        if (alreadyPlanned) return false;

        const limitObj = getLimitForBulan(bulan);
        if (!limitObj) return false;

        const usage = getMonthlyUsage(penugasan.sobat_id, bulan);
        return limitObj.batas_maksimal - usage.total > 0;
      });

      return available || months[0] || '';
    },
    [rows, getLimitForBulan, getMonthlyUsage]
  );

  const handleOpenAddForm = () => {
    setIsEditMode(false);

    // ⭐ PERUBAHAN: default pilihan pertama diambil dari penugasan yang
    // BELUM punya rencana sama sekali, bukan dari seluruh penugasan.
    const firstPenugasan = availablePenugasanOptionsForAdd[0];

    setFormData({
      penugasan_id: firstPenugasan?.id || 0,
      bulan_pencairan: getFirstAvailableMonth(firstPenugasan),
      nominal_rencana: 0,
      tahap_ke: null,
    });

    setMultiMonthAmounts({});
    setMultiMonthRowIds({});

    setPenugasanSearchQuery(
      firstPenugasan ? `${firstPenugasan.nama_mitra} — ${firstPenugasan.nama_kegiatan}` : ''
    );
    setIsPenugasanDropdownOpen(false);

    setIsFormOpen(true);
  };

  // Edit satu baris. Kalau penugasan baris ini punya periode kegiatan
  // lebih dari 1 bulan, form dibuka dalam mode bertahap: SEMUA bulan
  // dalam periode kegiatan ditampilkan sekaligus (seperti form tambah),
  // masing-masing diisi otomatis dari rencana yang sudah ada (kalau ada).
  const handleOpenEditForm = (row: PencairanRow) => {
    setIsEditMode(true);

    setFormData({
      ...row,
      nominal_rencana_original: row.nominal_rencana,
    });

    const penugasan = penugasanOptions.find((p) => p.id === row.penugasan_id);
    const periodeOptions = penugasan?.periodeOptions || [];
    const isMultiBulan = periodeOptions.length > 1;

    if (isMultiBulan) {
      // Ambil semua baris pencairan_honor milik penugasan ini, supaya
      // form edit menampilkan seluruh bulan dalam periode kegiatan,
      // bukan cuma 1 baris yang diklik.
      const existingRows = rows.filter((r) => r.penugasan_id === row.penugasan_id);

      const amounts: Record<string, number> = {};
      const rowIds: Record<string, number> = {};

      periodeOptions.forEach((bulan) => {
        const existing = existingRows.find((r) =>
          bulanEquals(r.bulan_pencairan || '', bulan)
        );
        amounts[bulan] = existing ? Number(existing.nominal_rencana) || 0 : 0;
        if (existing?.id) rowIds[bulan] = existing.id;
      });

      setMultiMonthAmounts(amounts);
      setMultiMonthRowIds(rowIds);
    } else {
      setMultiMonthAmounts({});
      setMultiMonthRowIds({});
    }

    setPenugasanSearchQuery(
      penugasan ? `${penugasan.nama_mitra} — ${penugasan.nama_kegiatan}` : ''
    );
    setIsPenugasanDropdownOpen(false);

    setIsFormOpen(true);
  };

  const getPenugasanLabel = (p: PenugasanOption) => `${p.nama_mitra} — ${p.nama_kegiatan}`;

  // Dipanggil ketika admin memilih salah satu hasil pencarian penugasan
  // di combobox. Perilakunya menyamai onChange dropdown lama: bulan
  // pencairan direset ke bulan pertama yang tersedia (kalau bukan mode
  // edit), dan input rencana bertahap ikut direset karena daftar
  // bulannya bisa jadi berbeda untuk penugasan baru.
  const handleSelectPenugasan = (p: PenugasanOption) => {
    setFormData((prev) => ({
      ...prev,
      penugasan_id: p.id,
      bulan_pencairan: !isEditMode ? getFirstAvailableMonth(p) : prev.bulan_pencairan,
    }));

    setMultiMonthAmounts({});
    setMultiMonthRowIds({});

    setPenugasanSearchQuery(getPenugasanLabel(p));
    setIsPenugasanDropdownOpen(false);
  };

  // Buka daftar penugasan seperti dropdown biasa: kosongkan kata kunci
  // supaya SEMUA penugasan tampil dulu (tidak ikut tersaring oleh nama
  // yang sedang terpilih), lalu admin bisa langsung klik salah satu atau
  // mulai mengetik untuk menyaring.
  const handleOpenPenugasanDropdown = () => {
    if (isEditMode) return;
    setPenugasanSearchQuery('');
    setIsPenugasanDropdownOpen(true);
    penugasanInputRef.current?.focus();
  };

  // Tutup daftar & kembalikan teks di kotak pencarian ke penugasan yang
  // sedang terpilih (kalau ada), supaya kotaknya tidak kosong walau
  // admin tadi sempat mengetik kata kunci tapi tidak memilih apa-apa.
  const handleClosePenugasanDropdown = () => {
    setIsPenugasanDropdownOpen(false);
    setPenugasanSearchQuery(
      selectedPenugasanForForm ? getPenugasanLabel(selectedPenugasanForForm) : ''
    );
  };

  // =========================================================
  // SAVE PLAN
  // =========================================================

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();

    const penugasan = penugasanOptions.find((p) => p.id === formData.penugasan_id);

    if (!formData.penugasan_id || !penugasan) {
      alert('Pilih penugasan terlebih dahulu.');
      return;
    }

    // =========================================================
    // SATU PENUGASAN = SATU RENCANA (hanya berlaku saat TAMBAH BARU)
    // =========================================================
    // Jika penugasan sudah memiliki minimal satu rencana pencairan,
    // rencana baru tidak boleh dibuat lagi. Edit rencana yang sudah ada
    // tetap diperbolehkan.
    //
    // Cek state lokal terlebih dahulu. Setelah itu cek langsung ke Supabase
    // sebagai pengaman jika data berubah dari tab/user lain.
    if (!isEditMode) {
      const existingPlansInState = rows.filter(
        (r) => r.penugasan_id === penugasan.id
      );

      if (existingPlansInState.length > 0) {
        const bulanSudahAda = existingPlansInState
          .map((r) => r.bulan_pencairan)
          .filter(Boolean)
          .join(', ');

        alert(
          `Penugasan ${penugasan.nama_mitra} — ${penugasan.nama_kegiatan} sudah memiliki rencana pencairan.` +
            `\n\nRencana yang sudah ada: ${bulanSudahAda || 'sudah tercatat'}.` +
            `\n\nRencana baru tidak dapat ditambahkan. Jika ingin mengubah nominal atau bulan, gunakan tombol Edit pada rencana yang sudah ada.`
        );
        return;
      }

      const { data: existingPlansInDb, error: existingPlansError } = await supabase
        .from('pencairan_honor')
        .select('id, bulan_pencairan')
        .eq('penugasan_id', penugasan.id);

      if (existingPlansError) {
        console.error('Gagal memeriksa rencana pencairan yang sudah ada:', existingPlansError);
        alert('Gagal memeriksa rencana pencairan yang sudah ada: ' + (existingPlansError.message || 'Unknown error'));
        return;
      }

      if ((existingPlansInDb || []).length > 0) {
        const bulanSudahAda = (existingPlansInDb || [])
          .map((r: any) => r.bulan_pencairan)
          .filter(Boolean)
          .join(', ');

        alert(
          `Penugasan ${penugasan.nama_mitra} — ${penugasan.nama_kegiatan} sudah memiliki rencana pencairan.` +
            `\n\nRencana yang sudah ada: ${bulanSudahAda || 'sudah tercatat'}.` +
            `\n\nRencana baru tidak dapat ditambahkan. Jika ingin mengubah nominal atau bulan, gunakan tombol Edit pada rencana yang sudah ada.`
        );
        return;
      }
    }

    // =========================================================
    // CABANG RENCANA BERTAHAP (MULTI-BULAN)
    //
    // Dipakai kalau periode kegiatan penugasan > 1 bulan, baik saat
    // TAMBAH maupun EDIT. Setiap bulan dalam periode kegiatan diproses
    // independen berdasarkan nominal yang diisi admin:
    // - Bulan tanpa row lama & nominal > 0  -> INSERT baris baru
    // - Bulan dengan row lama & nominal > 0 -> UPDATE baris tsb
    // - Bulan dengan row lama & nominal = 0 -> DELETE baris tsb
    //   (kecuali sudah direalisasikan; itu diblokir validasi di bawah)
    // - Bulan tanpa row lama & nominal = 0  -> dilewati saja
    // =========================================================
    if (isMultiMonthMode && selectedPenugasanForForm) {
      const monthsData = (selectedPenugasanForForm.periodeOptions || []).map(
        (bulan, idx) => ({
          bulan,
          tahap: idx + 1,
          nominal: Number(multiMonthAmounts[bulan]) || 0,
          existingId: multiMonthRowIds[bulan],
        })
      );

      const toProcess = monthsData.filter((m) => m.nominal > 0 || m.existingId);

      if (toProcess.length === 0) {
        alert('Isi nominal rencana untuk minimal 1 bulan.');
        return;
      }

      // Validasi: bulan yang sudah direalisasikan tidak boleh diubah
      // nominalnya (baik diedit ke nilai lain maupun dikosongkan/dihapus).
      for (const m of toProcess) {
        if (!m.existingId) continue;

        const existingRow = rows.find((r) => r.id === m.existingId);
        const sudahRealisasi =
          existingRow?.nominal_dicairkan !== null &&
          existingRow?.nominal_dicairkan !== undefined;

        if (sudahRealisasi && m.nominal !== Number(existingRow?.nominal_rencana)) {
          alert(
            `Rencana bulan ${m.bulan} sudah direalisasikan dan tidak dapat diubah dari form ini. Gunakan menu Realisasi untuk menyesuaikan.`
          );
          return;
        }
      }

      // Validasi tiap bulan yang nominalnya > 0 terhadap sisa limit
      // bulan itu sendiri (independen antar bulan, dan mengecualikan
      // baris itu sendiri dari perhitungan pemakaian kalau sedang diedit).
      for (const m of toProcess) {
        if (m.nominal <= 0) continue;

        const limitObj = getLimitForBulan(m.bulan);

        if (!limitObj) {
          alert(
            `Limit honor untuk bulan ${m.bulan} belum diatur. Atur limit dulu sebelum menyimpan.`
          );
          return;
        }

        const usage = getMonthlyUsage(penugasan.sobat_id, m.bulan, m.existingId);
        const sisa = limitObj.batas_maksimal - usage.total;

        if (m.nominal > sisa) {
          alert(
            `Rencana bulan ${m.bulan} sebesar ${formatRupiah(
              m.nominal
            )} melebihi sisa limit bulan itu.\n\nLimit: ${formatRupiah(
              limitObj.batas_maksimal
            )}\nSudah digunakan: ${formatRupiah(usage.total)}\nSisa: ${formatRupiah(
              Math.max(sisa, 0)
            )}`
          );
          return;
        }
      }

      setIsSubmitting(true);

      try {
        const toInsert = toProcess.filter((m) => !m.existingId && m.nominal > 0);
        const toUpdate = toProcess.filter((m) => m.existingId && m.nominal > 0);
        const toDelete = toProcess.filter((m) => m.existingId && m.nominal <= 0);

        if (toInsert.length > 0) {
          const payloads = toInsert.map((m) => ({
            penugasan_id: penugasan.id,
            sobat_id: penugasan.sobat_id,
            bulan_pencairan: m.bulan,
            nominal_rencana: m.nominal,
            tahap_ke: m.tahap,
            catatan: formData.catatan || null,
          }));

          const { error } = await supabase.from('pencairan_honor').insert(payloads);
          if (error) throw error;
        }

        for (const m of toUpdate) {
          const { error } = await supabase
            .from('pencairan_honor')
            .update({ nominal_rencana: m.nominal, tahap_ke: m.tahap })
            .eq('id', m.existingId);

          if (error) throw error;
        }

        for (const m of toDelete) {
          const { error } = await supabase
            .from('pencairan_honor')
            .delete()
            .eq('id', m.existingId);

          if (error) throw error;
        }

        await logActivity({
          aksi: isEditMode ? 'ubah' : 'tambah',
          entitas: 'pencairan_honor',
          deskripsi: `${
            isEditMode ? 'Mengubah' : 'Membuat'
          } rencana pencairan bertahap untuk ${penugasan.nama_mitra} (${toProcess
            .map((m) => `${m.bulan}: ${formatRupiah(m.nominal)}`)
            .join(', ')}), total ${formatRupiah(
            toProcess.reduce((sum, m) => sum + m.nominal, 0)
          )}`,
        });

        setIsFormOpen(false);
        setMultiMonthAmounts({});
        setMultiMonthRowIds({});
        await fetchAll();
      } catch (error: any) {
        alert('Gagal menyimpan rencana pencairan: ' + error.message);
      } finally {
        setIsSubmitting(false);
      }

      return;
    }

    // =========================================================
    // CABANG SINGLE-BULAN (mendukung tahap ke yang bisa diisi manual,
    // dipakai untuk tambah 1 bulan maupun edit satu baris)
    // =========================================================

    const nominal = Number(formData.nominal_rencana) || 0;

    if (!formData.penugasan_id || !formData.bulan_pencairan || nominal <= 0) {
      alert('Lengkapi penugasan, bulan, dan nominal rencana. Nominal harus lebih dari 0.');
      return;
    }

    // VALIDASI BULAN SESUAI PERIODE KEGIATAN
    if (
      selectedPenugasanForForm?.periodeOptions &&
      selectedPenugasanForForm.periodeOptions.length > 0
    ) {
      if (!selectedPenugasanForForm.periodeOptions.includes(formData.bulan_pencairan)) {
        alert(
          `Bulan pencairan harus berada di dalam periode kegiatan: ${
            selectedPenugasanForForm.bulanKegiatanRaw || '-'
          }`
        );
        return;
      }
    }

    // VALIDASI LIMIT
    if (sisaLimitUntukForm?.unset) {
      alert(
        `Limit honor untuk bulan ${formData.bulan_pencairan} belum diatur. Atur limit dulu sebelum membuat rencana.`
      );
      return;
    }

    if (sisaLimitUntukForm && nominal > sisaLimitUntukForm.sisa) {
      const sisa = Math.max(sisaLimitUntukForm.sisa, 0);

      alert(
        `Rencana pencairan ${formatRupiah(nominal)} melebihi sisa limit bulan ${
          formData.bulan_pencairan
        } sebesar ${formatRupiah(sisa)}.\n\nLimit: ${formatRupiah(
          sisaLimitUntukForm.limit
        )}\nSudah digunakan: ${formatRupiah(sisaLimitUntukForm.digunakan || 0)}`
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        penugasan_id: formData.penugasan_id,
        sobat_id: penugasan.sobat_id,
        bulan_pencairan: formData.bulan_pencairan,
        nominal_rencana: nominal,
        tahap_ke:
          formData.tahap_ke !== undefined &&
          formData.tahap_ke !== null &&
          String(formData.tahap_ke) !== ''
            ? Number(formData.tahap_ke)
            : null,
        catatan: formData.catatan || null,
      };

      if (isEditMode && formData.id) {
        const { error } = await supabase
          .from('pencairan_honor')
          .update(payload)
          .eq('id', formData.id);

        if (error) throw error;

        await logActivity({
          aksi: 'ubah',
          entitas: 'pencairan_honor',
          deskripsi: `Mengubah rencana pencairan ${penugasan.nama_mitra} bulan ${
            formData.bulan_pencairan
          } menjadi ${formatRupiah(nominal)}${
            payload.tahap_ke ? ` (Tahap ${payload.tahap_ke})` : ''
          }`,
          referensiId: formData.id,
        });
      } else {
        const { data: inserted, error } = await supabase
          .from('pencairan_honor')
          .insert([payload])
          .select('id')
          .single();

        if (error) throw error;

        await logActivity({
          aksi: 'tambah',
          entitas: 'pencairan_honor',
          deskripsi: `Membuat rencana pencairan ${penugasan.nama_mitra} bulan ${
            formData.bulan_pencairan
          } sebesar ${formatRupiah(nominal)}${
            payload.tahap_ke ? ` (Tahap ${payload.tahap_ke})` : ''
          }`,
          referensiId: inserted?.id,
        });
      }

      setIsFormOpen(false);
      await fetchAll();
    } catch (error: any) {
      alert('Gagal menyimpan rencana pencairan: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // =========================================================
  // DELETE
  // =========================================================

  const handleDeleteRow = async (row: PencairanRow) => {
    if (!row.id) return;

    if (
      !window.confirm(
        `Hapus rencana pencairan ${row.mitra?.nama_mitra || row.sobat_id} bulan ${
          row.bulan_pencairan
        }?`
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase.from('pencairan_honor').delete().eq('id', row.id);

      if (error) throw error;

      await logActivity({
        aksi: 'hapus',
        entitas: 'pencairan_honor',
        deskripsi: `Menghapus rencana pencairan ${row.mitra?.nama_mitra || row.sobat_id} bulan ${
          row.bulan_pencairan
        }`,
        referensiId: row.id,
      });

      await fetchAll();
    } catch (error: any) {
      alert('Gagal menghapus: ' + error.message);
    }
  };

  // =========================================================
  // REALISASI
  // =========================================================

  const handleOpenRealisasi = (row: PencairanRow) => {
    setRealisasiTarget(row);

    setRealisasiForm({
      nominal: row.nominal_dicairkan ?? row.nominal_rencana,
      tanggal: row.tgl_pencairan || new Date().toISOString().slice(0, 10),
      metode: row.metode_pembayaran || '',
      catatan: row.catatan || '',
    });
  };

  // =========================================================
  // VALIDASI REALISASI
  //
  // Contoh: Limit Oktober = 3 jt. A = rencana 2 jt, B = rencana 1 jt.
  // Ketika A direalisasikan: A dikeluarkan dari perhitungan sementara,
  // B tetap dihitung 1 jt, realisasi baru A ditambahkan.
  // 1 jt + 2 jt = 3 jt -> BOLEH. 1 jt + 2,5 jt = 3,5 jt -> DITOLAK.
  //
  // Catatan: setiap tahap/bulan pada rencana bertahap punya baris
  // sendiri, sehingga realisasi tetap dilakukan per baris/tahap
  // masing-masing — validasi ini otomatis berlaku sama untuk baris
  // dari rencana bertahap maupun rencana satu bulan biasa.
  // =========================================================

  const getRealisasiValidation = useCallback(
    (
      target: PencairanRow,
      nominalRealisasi: number,
      tanggalRealisasi: string
    ) => {
      const nominal = Number(nominalRealisasi) || 0;
      const bulanRealisasi = tanggalRealisasi
        ? monthInputToLabel(tanggalRealisasi.slice(0, 7))
        : '';

      if (!bulanRealisasi) {
        return {
          valid: false,
          message: 'Tanggal realisasi wajib diisi dengan tanggal yang valid.',
          usage: null,
          remainingAfter: 0,
          bulanRealisasi: '',
          terlambat: false,
        };
      }

      const limitObj = getLimitForBulan(bulanRealisasi);

      if (!limitObj) {
        return {
          valid: false,
          message: `Limit honor bulan realisasi ${bulanRealisasi} belum diatur.`,
          usage: null,
          remainingAfter: 0,
          bulanRealisasi,
          terlambat: isActualMonthAfterPlanned(
            bulanRealisasi,
            target.bulan_pencairan
          ),
        };
      }

      // Target dikeluarkan dari perhitungan karena nilai rencananya akan
      // digantikan oleh nominal realisasi pada bulan aktual.
      const usageOthers = getMonthlyUsage(
        target.sobat_id,
        bulanRealisasi,
        target.id
      );

      const totalAfter = usageOthers.total + nominal;
      const remainingAfter = limitObj.batas_maksimal - totalAfter;
      const terlambat = isActualMonthAfterPlanned(
        bulanRealisasi,
        target.bulan_pencairan
      );

      if (totalAfter > limitObj.batas_maksimal) {
        return {
          valid: false,
          message:
            `Realisasi tidak dapat disimpan karena melebihi limit bulan realisasi ${bulanRealisasi}.\n\n` +
            `Bulan rencana: ${target.bulan_pencairan}\n` +
            `Bulan realisasi: ${bulanRealisasi}\n` +
            `Limit: ${formatRupiah(limitObj.batas_maksimal)}\n` +
            `Beban pencairan lain: ${formatRupiah(usageOthers.total)}\n` +
            `Realisasi yang dimasukkan: ${formatRupiah(nominal)}\n` +
            `Total setelah realisasi: ${formatRupiah(totalAfter)}\n` +
            `Kelebihan: ${formatRupiah(
              Math.max(totalAfter - limitObj.batas_maksimal, 0)
            )}\n\n` +
            `Silakan jadwalkan ulang rencana lain ke bulan yang masih memiliki sisa limit.`,
          usage: usageOthers,
          remainingAfter,
          bulanRealisasi,
          terlambat,
        };
      }

      return {
        valid: true,
        message: '',
        usage: usageOthers,
        remainingAfter,
        bulanRealisasi,
        terlambat,
      };
    },
    [getMonthlyUsage, getLimitForBulan]
  );

  // =========================================================
  // SAVE REALISASI
  // =========================================================

  const handleSaveRealisasi = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!realisasiTarget?.id) return;

    const nominal = Number(realisasiForm.nominal) || 0;

    if (nominal <= 0) {
      alert('Nominal realisasi harus lebih dari 0.');
      return;
    }

    if (!realisasiForm.tanggal) {
      alert('Tanggal realisasi wajib diisi.');
      return;
    }

    const validation = getRealisasiValidation(
      realisasiTarget,
      nominal,
      realisasiForm.tanggal
    );

    if (!validation.valid) {
      alert(validation.message);
      return;
    }

    setIsRealisasiSubmitting(true);

    try {
      const { error } = await supabase
        .from('pencairan_honor')
        .update({
          nominal_dicairkan: nominal,
          tgl_pencairan: realisasiForm.tanggal,
          metode_pembayaran: realisasiForm.metode || null,
          catatan: realisasiForm.catatan || null,
          tahap_ke: (realisasiTarget.tahap_ke ?? 0) || null,
        })
        .eq('id', realisasiTarget.id);

      if (error) throw error;

      await logActivity({
        aksi: 'ubah',
        entitas: 'pencairan_honor',
        deskripsi: `Menandai realisasi pencairan ${
          realisasiTarget.mitra?.nama_mitra || realisasiTarget.sobat_id
        } bulan ${realisasiTarget.bulan_pencairan} sebesar ${formatRupiah(nominal)}`,
        referensiId: realisasiTarget.id,
      });

      setRealisasiTarget(null);
      await fetchAll();
    } catch (error: any) {
      alert('Gagal menyimpan realisasi: ' + error.message);
    } finally {
      setIsRealisasiSubmitting(false);
    }
  };

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans">
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />

      <div className="min-h-screen lg:pl-[230px]">
        <Header onMenuClick={() => setMobileSidebarOpen(true)} />

        <main className="p-3 sm:p-4 lg:p-5">
          <div className="mx-auto max-w-[1500px]">

            {/* ================= HEADER ================= */}

            <div className="mb-4 flex flex-wrap justify-between items-center gap-3">
              <div>
                <h1 className="text-lg font-bold text-slate-800">
                  Pencairan Honor
                  {masalahGroups.length > 0 && (
                    <span className="ml-2 text-sm font-semibold text-rose-600">
                      ({masalahGroups.length} perhatian)
                    </span>
                  )}
                </h1>

                <p className="text-[11px] text-slate-500">
                  Rencana &amp; realisasi pencairan honor mitra, dipantau terhadap
                  limit honor per mitra per bulan; nilai limit bulan tersebut sama untuk setiap mitra
                </p>
              </div>

              <button
                onClick={handleOpenAddForm}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md shadow-sm transition cursor-pointer"
              >
                <span>➕</span>
                Tambah Rencana Pencairan
              </button>
            </div>

            {/* ================= NOTIFIKASI TERLAMBAT ================= */}

            {(() => {
              const overdueRows = rows.filter(
                (r) =>
                  (r.nominal_dicairkan === null || r.nominal_dicairkan === undefined) &&
                  isBulanLewat(r.bulan_pencairan)
              );

              if (overdueRows.length === 0) return null;

              return (
                <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-rose-700">
                        ⏰ {overdueRows.length} rencana pencairan sudah melewati bulan rencana
                      </p>
                      <p className="text-[11px] text-rose-600 mt-0.5">
                        Rencana tidak otomatis dipindahkan. Saat benar-benar direalisasikan,
                        pemakaian limit akan mengikuti bulan dari tanggal realisasi.
                      </p>
                    </div>
                    <span className="text-[10px] font-semibold text-rose-700 bg-white border border-rose-200 rounded px-2 py-1">
                      Perlu tindakan admin
                    </span>
                  </div>

                  <div className="mt-2 space-y-1.5">
                    {(showAllOverdue ? overdueRows : overdueRows.slice(0, 3)).map((r) => {
                      const suggestion = findRescheduleSuggestion(
                        r,
                        r.bulan_pencairan,
                        Number(r.nominal_rencana) || 0
                      );

                      return (
                        <div key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setDetailGroup({ sobatId: r.sobat_id, bulan: r.bulan_pencairan })}
                            className="text-left text-[10px] text-rose-700 hover:underline cursor-pointer"
                          >
                            • {r.mitra?.nama_mitra || r.sobat_id} — {r.bulan_pencairan} — {formatRupiah(r.nominal_rencana)}
                          </button>

                          {suggestion && (
                            <button
                              type="button"
                              onClick={() => handleReschedule(r, suggestion.bulan)}
                              className="text-[10px] px-2 py-0.5 bg-white hover:bg-rose-100 text-rose-700 border border-rose-300 rounded transition cursor-pointer shrink-0"
                              title={`Sisa limit bulan ${suggestion.bulan}: ${formatRupiah(suggestion.sisaLimit)}`}
                            >
                              💡 Pindah ke {suggestion.bulan}
                              {suggestion.diLuarPeriode && (
                                <span className="ml-1 text-rose-400">(di luar periode)</span>
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {overdueRows.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setShowAllOverdue((v) => !v)}
                        className="text-[10px] text-rose-500 font-semibold hover:underline cursor-pointer"
                      >
                        {showAllOverdue
                          ? '▲ Tampilkan lebih sedikit'
                          : `+ ${overdueRows.length - 3} rencana lainnya`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ================= NOTIFIKASI BELUM REALISASI / KURANG ================= */}

            {perluTindakLanjutRows.length > 0 && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-amber-700">
                      🟡 {perluTindakLanjutRows.length} rencana pencairan belum direalisasikan atau realisasinya kurang dari rencana
                    </p>
                    <p className="text-[11px] text-amber-600 mt-0.5">
                      Klik salah satu untuk langsung menandai realisasinya.
                    </p>
                  </div>
                  <span className="text-[10px] font-semibold text-amber-700 bg-white border border-amber-200 rounded px-2 py-1">
                    Perlu ditindaklanjuti
                  </span>
                </div>

                <div className="mt-2 space-y-1">
                  {(showAllPerluTindakLanjut
                    ? perluTindakLanjutRows
                    : perluTindakLanjutRows.slice(0, PERHATIAN_PREVIEW_COUNT)
                  ).map((r) => {
                    const status = getRowStatus(r);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => handleOpenRealisasi(r)}
                        className="block w-full text-left text-[10px] text-amber-700 hover:underline cursor-pointer"
                      >
                        • {r.mitra?.nama_mitra || r.sobat_id} — {r.bulan_pencairan} —{' '}
                        {status === 'kurang'
                          ? `kurang ${formatRupiah(getSisaRencana(r))} dari rencana`
                          : 'belum direalisasikan'}
                      </button>
                    );
                  })}
                  {perluTindakLanjutRows.length > PERHATIAN_PREVIEW_COUNT && (
                    <button
                      type="button"
                      onClick={() => setShowAllPerluTindakLanjut((v) => !v)}
                      className="text-[10px] text-amber-600 font-semibold hover:underline cursor-pointer"
                    >
                      {showAllPerluTindakLanjut
                        ? '▲ Tampilkan lebih sedikit'
                        : `+ ${perluTindakLanjutRows.length - PERHATIAN_PREVIEW_COUNT} rencana lainnya`}
                    </button>
                  )}
                </div>
              </div>
            )}

            {masalahGroups.length > 0 && (
              <div className="mb-4 space-y-2">
                {visibleMasalahGroups.map((g) => (
                  <div
                    key={`${g.sobatId}__${g.bulan}`}
                    className={`rounded-lg border px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${
                      g.melebihi
                        ? 'bg-rose-50 border-rose-200'
                        : g.tercapai
                        ? 'bg-orange-50 border-orange-200'
                        : g.adaTerlambat
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-yellow-50 border-yellow-200'
                    }`}
                  >
                    <div className="text-xs">
                      <span className="font-semibold">
                        {g.melebihi && '🔴 Limit Terlampaui — '}
                        {!g.melebihi && g.tercapai && '🟠 Limit Tercapai — '}
                        {!g.melebihi && !g.tercapai && g.mendekati && '⚠️ Mendekati Limit — '}
                        {g.adaTerlambat && '⏰ Ada Pencairan Terlambat — '}
                        {g.namaMitra} · {g.bulan}
                      </span>

                      <p className="text-slate-600 mt-0.5">
                        Beban bulan ini: <strong>{formatRupiah(g.bebanAktual)}</strong>{' '}
                        dari limit <strong>{formatRupiah(g.limit)}</strong>
                        {' · '}
                        {g.sisa >= 0
                          ? `Sisa ${formatRupiah(g.sisa)}`
                          : `Kelebihan ${formatRupiah(Math.abs(g.sisa))}`}
                      </p>

                      {g.adaTerlambat && (
                        <p className="text-rose-600 mt-0.5">
                          Terdapat rencana pencairan yang sudah melewati bulan tetapi
                          belum direalisasikan.
                        </p>
                      )}

                      {g.tercapai && (
                        <p className="text-orange-700 mt-0.5 font-medium">
                          Limit bulan ini sudah terpakai penuh (100%). Belum melebihi,
                          tapi tidak ada sisa lagi.
                        </p>
                      )}

                      {g.mendekati && !g.tercapai && !g.melebihi && (
                        <p className="text-amber-700 mt-0.5">
                          Penggunaan limit sudah {g.persen.toFixed(1)}%.
                        </p>
                      )}

                      {g.melebihi && (
                        <p className="text-rose-600 mt-0.5 font-medium">
                          Total beban pencairan sudah melebihi batas bulanan.
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() =>
                        setDetailGroup({ sobatId: g.sobatId, bulan: g.bulan })
                      }
                      className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-md transition cursor-pointer shrink-0"
                    >
                      Lihat Detail
                    </button>
                  </div>
                ))}

                {masalahGroups.length > MASALAH_PREVIEW_COUNT && (
                  <button
                    onClick={() => setShowAllMasalah((v) => !v)}
                    className="text-xs text-blue-600 hover:underline font-medium px-1 cursor-pointer"
                  >
                    {showAllMasalah
                      ? '▲ Tampilkan lebih sedikit'
                      : `▼ Tampilkan ${masalahGroups.length - MASALAH_PREVIEW_COUNT} lainnya`}
                  </button>
                )}
              </div>
            )}

            {/* ================= FILTER ================= */}

            <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 mb-4 flex flex-wrap gap-2.5 items-center">
              <input
                type="text"
                placeholder="Cari mitra / SOBAT ID"
                value={mitraFilter}
                onChange={(e) => setMitraFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-blue-400 min-w-[220px]"
              />

              <select
                value={bulanFilter}
                onChange={(e) => setBulanFilter(e.target.value)}
                className="py-1.5 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400 cursor-pointer"
              >
                <option>Semua Bulan</option>
                {bulanOptionsFromData.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="py-1.5 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400 cursor-pointer"
              >
                <option value="Semua Status">Semua Status</option>
                {(Object.keys(STATUS_META) as RowStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].label}
                  </option>
                ))}
              </select>

              <div className="ml-auto flex items-center gap-1.5">
                <button
                  onClick={handleExpandAllMitra}
                  className="px-2.5 py-1.5 border border-slate-200 rounded bg-white hover:bg-slate-100 text-slate-600 text-xs transition cursor-pointer"
                >
                  Buka Semua Mitra
                </button>
                <button
                  onClick={handleCollapseAllMitra}
                  className="px-2.5 py-1.5 border border-slate-200 rounded bg-white hover:bg-slate-100 text-slate-600 text-xs transition cursor-pointer"
                >
                  Tutup Semua Mitra
                </button>
              </div>
            </div>

            {/* ================= TABEL (GROUPED PER MITRA) ================= */}

            <div className="mb-2 text-[11px] text-slate-500 px-1">
              {loading
                ? 'Memuat data pencairan...'
                : `${groupedRows.length} mitra • ${filteredRows.length} rencana pencairan`}
            </div>

            <div className="space-y-2.5">
              {loading ? (
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 py-10 text-center text-slate-400 text-xs">
                  Memuat data pencairan...
                </div>
              ) : groupedRows.length === 0 ? (
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 py-10 text-center text-slate-400 text-xs">
                  Tidak ada data yang sesuai filter.
                </div>
              ) : (
                groupedRows.map((group) => {
                  const isExpanded = expandedMitraIds.has(group.sobat_id);
                  const groupBadge = getGroupStatusBadge(group);

                  return (
                    <div
                      key={group.sobat_id}
                      className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleExpandMitra(group.sobat_id)}
                        className={`w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left cursor-pointer ${
                          isExpanded ? 'bg-slate-50/70 border-b border-slate-200' : ''
                        }`}
                      >
                        <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
                          {(group.mitra?.nama_mitra || '?').charAt(0).toUpperCase()}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-800 text-sm truncate">
                            {group.mitra?.nama_mitra || group.sobat_id}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            <span className="font-mono text-blue-600">{group.sobat_id}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-[11px] shrink-0">
                          <div className="text-center">
                            <div className="text-slate-400">Rencana</div>
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
                          <div className="text-right hidden md:block">
                            <div className="text-slate-400">Realisasi</div>
                            <div className="font-semibold text-emerald-600">
                              {formatRupiah(group.totalRealisasi)}
                            </div>
                          </div>
                          <div className="text-right hidden lg:block">
                            <div className="text-slate-400">Sisa</div>
                            <div className="font-semibold text-amber-600">
                              {formatRupiah(group.totalSisa)}
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

                        <span className="p-1.5 text-slate-400 shrink-0">
                          {isExpanded ? '▲' : '▼'}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs text-slate-700">
                            <thead className="bg-slate-50/60 border-b border-slate-100 text-slate-500 font-semibold">
                              <tr>
                                <th className="py-2 px-3.5">Kegiatan</th>
                                <th className="py-2 px-3.5">Bulan</th>
                                <th className="py-2 px-3.5 text-right">Rencana</th>
                                <th className="py-2 px-3.5 text-right">Realisasi</th>
                                <th className="py-2 px-3.5 text-right">Sisa</th>
                                <th className="py-2 px-3.5 text-center">Tahap</th>
                                <th className="py-2 px-3.5 text-center">Status</th>
                                <th className="py-2 px-3.5 text-center">Aksi</th>
                              </tr>
                            </thead>

                            <tbody className="divide-y divide-slate-50">
                              {group.items.map((row) => {
                                const status = getRowStatus(row);
                                const meta = STATUS_META[status];

                                return (
                                  <tr key={row.id} className="hover:bg-slate-50/80 transition">
                                    <td className="py-2.5 px-3.5">
                                      {row.penugasan?.kegiatan?.nama_kegiatan || '-'}
                                    </td>

                                    <td className="py-2.5 px-3.5">
                                      <div>{row.bulan_pencairan}</div>
                                      <div className="text-[10px] text-slate-400">Keterangan: {row.catatan || 'Belum ada keterangan'}</div>
                                    </td>

                                    <td className="py-2.5 px-3.5 text-right font-semibold text-blue-600">
                                      {formatRupiah(row.nominal_rencana)}
                                    </td>

                                    <td className="py-2.5 px-3.5 text-right font-semibold text-emerald-600">
                                      {row.nominal_dicairkan !== null &&
                                      row.nominal_dicairkan !== undefined
                                        ? formatRupiah(row.nominal_dicairkan)
                                        : '-'}
                                    </td>

                                    <td className={`py-2.5 px-3.5 text-right font-semibold ${getSisaRencana(row) > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                                      {formatRupiah(getSisaRencana(row))}
                                    </td>

                                    <td className="py-2.5 px-3.5 text-center">
                                      <span className="inline-flex rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                                        Tahap {row.tahap_ke || '-'}
                                      </span>
                                    </td>

                                    <td className="py-2.5 px-3.5 text-center">
                                      <span
                                        className={`px-2 py-0.5 rounded text-[10px] font-medium border ${meta.style}`}
                                      >
                                        {meta.icon} {meta.label}
                                      </span>
                                    </td>

                                    <td className="py-2.5 px-3.5 text-center">
                                      <div className="flex items-center justify-center gap-1.5">
                                        <button
                                          onClick={() =>
                                            setDetailGroup({
                                              sobatId: row.sobat_id,
                                              bulan: getRowUsageMonth(row),
                                            })
                                          }
                                          className="p-1.5 text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-md transition cursor-pointer"
                                          title="Lihat rincian perhitungan limit bulan ini"
                                        >
                                          👁️
                                        </button>

                                        <button
                                          onClick={() => handleOpenRealisasi(row)}
                                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 border border-emerald-200 rounded-md transition cursor-pointer"
                                          title="Tandai Realisasi"
                                        >
                                          💰
                                        </button>

                                        <button
                                          onClick={() => handleOpenEditForm(row)}
                                          className="p-1.5 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-md transition cursor-pointer"
                                          title="Edit Rencana"
                                        >
                                          ✏️
                                        </button>

                                        <button
                                          onClick={() => handleDeleteRow(row)}
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
          </div>
        </main>
      </div>

      {/* ================= MODAL TAMBAH / EDIT RENCANA ================= */}

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm">
                {isEditMode ? 'Edit Rencana Pencairan' : 'Tambah Rencana Pencairan'}
              </h3>

              <button
                onClick={() => setIsFormOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-5 space-y-4">
              {/* PENUGASAN — combobox dengan pencarian nama mitra / kegiatan / SOBAT ID */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Penugasan
                </label>

                <div className="relative">
                  <input
                    ref={penugasanInputRef}
                    type="text"
                    value={penugasanSearchQuery}
                    onChange={(e) => {
                      setPenugasanSearchQuery(e.target.value);
                      setIsPenugasanDropdownOpen(true);
                    }}
                    onFocus={() => {
                      if (isEditMode) return;
                      // Kosongkan dulu teks yang sedang tampil (nama
                      // penugasan terpilih) supaya daftar yang terbuka
                      // menampilkan SEMUA penugasan seperti dropdown
                      // biasa, bukan hasil yang sudah tersaring jadi
                      // cuma 1 opsi karena "menyaring" dirinya sendiri.
                      setPenugasanSearchQuery('');
                      setIsPenugasanDropdownOpen(true);
                    }}
                    onBlur={() => {
                      // Delay supaya klik pada opsi combobox / tombol panah
                      // sempat terdaftar sebelum dropdown ditutup.
                      setTimeout(() => handleClosePenugasanDropdown(), 150);
                    }}
                    disabled={isEditMode}
                    placeholder="Ketik nama mitra, kegiatan, atau SOBAT ID..."
                    className="w-full pl-3 pr-8 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 outline-none bg-white disabled:bg-slate-50"
                    autoComplete="off"
                    required
                  />

                  {/* Tombol panah dropdown — supaya tetap terasa seperti
                      dropdown biasa yang bisa diklik untuk membuka semua
                      opsi, bukan cuma kotak pencarian. */}
                  <button
                    type="button"
                    tabIndex={-1}
                    disabled={isEditMode}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      isPenugasanDropdownOpen
                        ? handleClosePenugasanDropdown()
                        : handleOpenPenugasanDropdown()
                    }
                    className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 disabled:opacity-30 cursor-pointer"
                    aria-label="Buka daftar penugasan"
                  >
                    <span className={`text-[10px] transition-transform ${isPenugasanDropdownOpen ? 'rotate-180' : ''}`}>
                      ▼
                    </span>
                  </button>

                  {isPenugasanDropdownOpen && !isEditMode && (
                    <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg">
                      {filteredPenugasanOptions.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-slate-400">
                          {availablePenugasanOptionsForAdd.length === 0
                            ? 'Semua penugasan sudah memiliki rencana pencairan.'
                            : 'Tidak ada penugasan yang cocok.'}
                        </div>
                      ) : (
                        filteredPenugasanOptions.map((p) => (
                          <button
                            type="button"
                            key={p.id}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSelectPenugasan(p)}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 cursor-pointer transition ${
                              formData.penugasan_id === p.id ? 'bg-blue-50' : ''
                            }`}
                          >
                            <div className="font-semibold text-slate-800">
                              {p.nama_mitra}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {p.nama_kegiatan} ·{' '}
                              <span className="font-mono text-blue-600">{p.sobat_id}</span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {selectedPenugasanForForm?.bulanKegiatanRaw && (
                  <p className="text-[10px] text-slate-500 mt-1">
                    Periode kegiatan:{' '}
                    <strong>{selectedPenugasanForForm.bulanKegiatanRaw}</strong>
                  </p>
                )}
              </div>

              {isMultiMonthMode && selectedPenugasanForForm ? (
                /* =========================================================
                   RENCANA BERTAHAP (MULTI-BULAN)
                   Muncul kalau periode kegiatan penugasan > 1 bulan, baik
                   saat TAMBAH maupun EDIT. Admin isi/ubah nominal per
                   bulan; bulan yang dikosongkan (0) tidak akan dibuatkan/
                   disimpan rencananya. Bulan yang sudah direalisasikan
                   dikunci karena tidak boleh diubah dari form ini.
                ========================================================= */
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Rencana Pencairan per Bulan (Bertahap)
                  </label>
                  <p className="text-[10px] text-slate-500 mb-2">
                    Periode kegiatan ini berlangsung{' '}
                    {selectedPenugasanForForm.periodeOptions!.length} bulan (
                    {selectedPenugasanForForm.bulanKegiatanRaw}). Isi nominal untuk
                    bulan yang direncanakan ada pencairan; biarkan kosong (0) untuk
                    bulan yang dilewati. Nomor tahap mengikuti urutan bulan secara
                    otomatis.
                  </p>

                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {selectedPenugasanForForm.periodeOptions!.map((bulan, idx) => {
                      const existingRowId = multiMonthRowIds[bulan];
                      const existingRow = existingRowId
                        ? rows.find((r) => r.id === existingRowId)
                        : null;
                      const sudahRealisasi =
                        existingRow?.nominal_dicairkan !== null &&
                        existingRow?.nominal_dicairkan !== undefined;

                      const limitObj = getLimitForBulan(bulan);
                      const usage = getMonthlyUsage(
                        selectedPenugasanForForm.sobat_id,
                        bulan,
                        existingRowId
                      );
                      const hasLimit = Boolean(limitObj);
                      const sisa = hasLimit
                        ? Number(limitObj?.batas_maksimal || 0) - usage.total
                        : 0;
                      const amount = multiMonthAmounts[bulan] || 0;
                      const overLimit = hasLimit && amount > sisa;

                      return (
                        <div
                          key={bulan}
                          className="border border-slate-200 rounded-md p-2.5"
                        >
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[11px] font-semibold text-slate-700">
                              Tahap {idx + 1} — {bulan}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {sudahRealisasi
                                ? 'sudah direalisasikan'
                                : !hasLimit
                                ? 'limit belum diatur'
                                : `sisa ${formatRupiah(Math.max(sisa, 0))}`}
                            </span>
                          </div>

                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs text-slate-400 pointer-events-none">
                              Rp
                            </span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={formatNumberWithDots(amount)}
                              disabled={sudahRealisasi}
                              onChange={(e) => {
                                const val = parseNumberFromDots(e.target.value);
                                setMultiMonthAmounts((prev) => ({
                                  ...prev,
                                  [bulan]: val,
                                }));
                              }}
                              placeholder="0 (lewati bulan ini)"
                              className={`w-full pl-8 pr-3 py-1.5 text-xs border rounded-md outline-none transition disabled:bg-slate-100 disabled:text-slate-400 ${
                                overLimit
                                  ? 'border-rose-400 bg-rose-50'
                                  : 'border-slate-200 focus:border-blue-500'
                              }`}
                            />
                          </div>

                          {sudahRealisasi && (
                            <p className="text-[10px] text-slate-500 mt-1">
                              Rencana bulan ini sudah direalisasikan, tidak dapat
                              diubah dari sini. Gunakan menu Realisasi jika perlu
                              penyesuaian.
                            </p>
                          )}
                          {overLimit && !sudahRealisasi && (
                            <p className="text-[10px] text-rose-600 mt-1">
                              Melebihi sisa limit bulan ini (
                              {formatRupiah(Math.max(sisa, 0))}).
                            </p>
                          )}
                          {!hasLimit && amount > 0 && !sudahRealisasi && (
                            <p className="text-[10px] text-purple-700 mt-1">
                              ⚠️ Limit bulan {bulan} belum diatur.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-[10px] text-slate-500 mt-2">
                    Total rencana:{' '}
                    <strong>{formatRupiah(totalMultiMonthAmount)}</strong>
                  </p>
                </div>
              ) : (
                <>
                  {/* BULAN */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Bulan Pencairan
                    </label>

                    {selectedPenugasanForForm?.periodeOptions &&
                    selectedPenugasanForForm.periodeOptions.length > 0 ? (
                      <select
                        value={formData.bulan_pencairan || ''}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            bulan_pencairan: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 outline-none bg-white disabled:bg-slate-100 disabled:text-slate-400"
                        disabled={hasExistingRencanaForSelectedPenugasan}
                        required
                      >
                        <option value="" disabled>
                          -- Pilih Bulan --
                        </option>

                        {selectedPenugasanForForm.periodeOptions.map((b) => {
                          const currentRowId =
                            isEditMode && formData.id ? Number(formData.id) : undefined;

                          const existing = getExistingRencanaForBulan(
                            selectedPenugasanForForm.id,
                            b,
                            currentRowId
                          );

                          const limitObj = getLimitForBulan(b);
                          const usage = getMonthlyUsage(
                            selectedPenugasanForForm.sobat_id,
                            b,
                            currentRowId
                          );
                          const hasLimit = Boolean(limitObj);
                          const sisa = hasLimit
                            ? Number(limitObj?.batas_maksimal || 0) - usage.total
                            : 0;
                          const isFull = hasLimit && sisa <= 0;

                          // Bulan yang sudah punya rencana untuk penugasan ini
                          // dikunci, supaya tidak bisa dibuatkan rencana kedua
                          // yang duplikat pada bulan yang sama.
                          const isLockedByExisting =
                            Boolean(existing) && b !== formData.bulan_pencairan;

                          return (
                            <option
                              key={b}
                              value={b}
                              disabled={
                                isLockedByExisting ||
                                (isFull && b !== formData.bulan_pencairan)
                              }
                            >
                              {b}
                              {isLockedByExisting
                                ? ' — sudah ada rencana'
                                : !hasLimit
                                ? ' — limit belum diatur'
                                : isFull
                                ? ' — limit penuh'
                                : ` — sisa ${formatRupiah(sisa)}`}
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <>
                        <input
                          type="month"
                          value={labelToMonthInput(formData.bulan_pencairan || '')}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              bulan_pencairan: monthInputToLabel(e.target.value),
                            }))
                          }
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 outline-none disabled:bg-slate-100 disabled:text-slate-400"
                          disabled={hasExistingRencanaForSelectedPenugasan}
                          required
                        />

                        {selectedPenugasanForForm && (
                          <p className="text-[10px] text-amber-600 mt-1">
                            ⚠️ Periode kegiatan ini belum dalam format baku, jadi bulan
                            pencairan masih bebas dipilih.
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {/* NOMINAL */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nominal Rencana (Rp)
                    </label>

                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs text-slate-400 pointer-events-none">
                        Rp
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatNumberWithDots(formData.nominal_rencana || 0)}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            nominal_rencana: parseNumberFromDots(e.target.value),
                          }))
                        }
                        placeholder="0"
                        disabled={hasExistingRencanaForSelectedPenugasan}
                        className={`w-full pl-8 pr-3 py-2 text-xs border rounded-md outline-none transition ${
                          sisaLimitUntukForm &&
                          !sisaLimitUntukForm.unset &&
                          Number(formData.nominal_rencana) > sisaLimitUntukForm.sisa
                            ? 'border-rose-400 bg-rose-50'
                            : 'border-slate-200 focus:border-blue-500'
                        }`}
                        required
                      />
                    </div>

                    {sisaLimitUntukForm?.unset && (
                      <p className="text-[10px] text-purple-700 font-semibold mt-1">
                        ⚠️ Limit honor bulan {formData.bulan_pencairan} belum diatur.
                      </p>
                    )}

                    {sisaLimitUntukForm && !sisaLimitUntukForm.unset && (
                      <div className="text-[10px] mt-1 space-y-0.5">
                        <p className="text-slate-500">
                          Beban saat ini:{' '}
                          <strong>{formatRupiah(sisaLimitUntukForm.digunakan || 0)}</strong>
                        </p>

                        <p
                          className={
                            sisaLimitUntukForm.sisa < 0
                              ? 'text-rose-600 font-semibold'
                              : 'text-slate-500'
                          }
                        >
                          Sisa limit:{' '}
                          <strong>
                            {formatRupiah(Math.max(sisaLimitUntukForm.sisa, 0))}
                          </strong>{' '}
                          dari {formatRupiah(sisaLimitUntukForm.limit)}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* TAHAP KE — bisa diisi manual per baris, mis. untuk menandai
                      rencana ini sebagai tahap keberapa dari mitra yang sama */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Tahap Ke (opsional)
                    </label>

                    <input
                      type="number"
                      min={1}
                      value={formData.tahap_ke ?? ''}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          tahap_ke: e.target.value ? Number(e.target.value) : null,
                        }))
                      }
                      placeholder="mis. 1, 2, 3..."
                      disabled={hasExistingRencanaForSelectedPenugasan}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 outline-none disabled:bg-slate-100 disabled:text-slate-400"
                    />

                    <p className="text-[10px] text-slate-500 mt-1">
                      Menandai rencana ini sebagai tahap keberapa untuk mitra ini
                      (opsional). Untuk rencana bertahap multi-bulan, nomor tahap
                      biasanya sudah otomatis mengikuti urutan bulan.
                    </p>
                  </div>
                </>
              )}

              {/* BUTTON */}
              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-md transition cursor-pointer"
                >
                  Batal
                </button>

                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    (!isEditMode && !isMultiMonthMode && hasExistingRencanaForSelectedPenugasan)
                  }
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting
                    ? 'Menyimpan...'
                    : !isEditMode && !isMultiMonthMode && hasExistingRencanaForSelectedPenugasan
                    ? 'Sudah Ada Rencana'
                    : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL REALISASI ================= */}

      {realisasiTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">
                  Tandai Realisasi Pencairan
                </h3>

                <p className="text-[10px] text-slate-500 mt-0.5">
                  Bulan limit mengikuti bulan dari tanggal realisasi. Jika terlambat, rencana tetap tercatat pada bulan awal tetapi pemakaian aktual masuk ke bulan realisasi.
                </p>
              </div>

              <button
                onClick={() => setRealisasiTarget(null)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRealisasi} className="p-5 space-y-4">
              {/* INFO */}
              <div className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Mitra</span>
                  <strong className="text-right">
                    {realisasiTarget.mitra?.nama_mitra || realisasiTarget.sobat_id}
                  </strong>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Bulan Rencana</span>
                  <strong>{realisasiTarget.bulan_pencairan}</strong>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Bulan Realisasi</span>
                  <strong>
                    {realisasiForm.tanggal
                      ? monthInputToLabel(realisasiForm.tanggal.slice(0, 7)) || '-'
                      : '-'}
                  </strong>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Rencana</span>
                  <strong>{formatRupiah(realisasiTarget.nominal_rencana)}</strong>
                </div>
              </div>

              {/* NOMINAL REALISASI */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nominal Realisasi (Rp)
                </label>

                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs text-slate-400 pointer-events-none">
                    Rp
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatNumberWithDots(realisasiForm.nominal)}
                    onChange={(e) =>
                      setRealisasiForm((prev) => ({
                        ...prev,
                        nominal: parseNumberFromDots(e.target.value),
                      }))
                    }
                    placeholder="0"
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 outline-none"
                    required
                  />
                </div>

                {/* LIVE LIMIT CHECK */}
                {(() => {
                  const nominal = Number(realisasiForm.nominal) || 0;
                  const validation = getRealisasiValidation(
                    realisasiTarget,
                    nominal,
                    realisasiForm.tanggal
                  );

                  if (!validation.usage) {
                    return (
                      <p className="text-[10px] text-purple-600 font-semibold mt-1">
                        ⚠️ Limit bulan realisasi belum diatur.
                      </p>
                    );
                  }

                  const usage = validation.usage;

                  if (!validation.valid) {
                    return (
                      <div className="mt-2 p-2.5 rounded-md bg-rose-50 border border-rose-200">
                        <p className="text-[10px] text-rose-700 font-semibold">
                          🔴 Realisasi melebihi limit bulan realisasi.
                        </p>

                        <div className="text-[10px] text-rose-600 mt-1 space-y-0.5">
                          <p>
                            Beban pencairan lain:{' '}
                            <strong>{formatRupiah(usage.total)}</strong>
                          </p>
                          <p>
                            Realisasi ini: <strong>{formatRupiah(nominal)}</strong>
                          </p>
                          <p>
                            Total:{' '}
                            <strong>{formatRupiah(usage.total + nominal)}</strong>
                          </p>
                          <p>
                            Limit: <strong>{formatRupiah(usage.limit)}</strong>
                          </p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="mt-2 p-2.5 rounded-md bg-emerald-50 border border-emerald-200">
                      <p className="text-[10px] text-emerald-700 font-semibold">
                        🟢 Masih dalam batas limit.
                      </p>

                      <p className="text-[10px] text-emerald-600 mt-0.5">
                        Setelah realisasi, sisa limit:{' '}
                        <strong>{formatRupiah(validation.remainingAfter)}</strong>
                        {' dari '}
                        {formatRupiah(usage.limit)}
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* TANGGAL */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tanggal Realisasi
                </label>

                <input
                  type="date"
                  value={realisasiForm.tanggal}
                  onChange={(e) =>
                    setRealisasiForm((prev) => ({ ...prev, tanggal: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 outline-none"
                  required
                />

                {realisasiTarget && realisasiForm.tanggal && (() => {
                  const bulanRealisasi = monthInputToLabel(realisasiForm.tanggal.slice(0, 7));
                  if (!bulanRealisasi || bulanRealisasi === realisasiTarget.bulan_pencairan) return null;

                  return (
                    <div className="mt-2 p-2.5 rounded-md bg-amber-50 border border-amber-200">
                      <p className="text-[10px] text-amber-700 font-semibold">
                        ⏰ Realisasi melewati bulan rencana
                      </p>
                      <p className="text-[10px] text-amber-600 mt-0.5">
                        Rencana: <strong>{realisasiTarget.bulan_pencairan}</strong> →
                        Realisasi: <strong>{bulanRealisasi}</strong>. Limit yang dipakai adalah
                        limit {bulanRealisasi}.
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* METODE */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Metode Pembayaran (opsional)
                </label>

                <input
                  type="text"
                  value={realisasiForm.metode}
                  onChange={(e) =>
                    setRealisasiForm((prev) => ({ ...prev, metode: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 outline-none"
                  placeholder="mis. Transfer Bank"
                />
              </div>

              {/* KETERANGAN */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Keterangan (opsional)
                </label>

                <textarea
                  value={realisasiForm.catatan}
                  onChange={(e) =>
                    setRealisasiForm((prev) => ({
                      ...prev,
                      catatan: e.target.value,
                    }))
                  }
                  rows={2}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 outline-none resize-none"
                  placeholder="Catatan tambahan untuk pencairan ini"
                />
              </div>

              {/* BUTTON */}
              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRealisasiTarget(null)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-md transition cursor-pointer"
                >
                  Batal
                </button>

                <button
                  type="submit"
                  disabled={
                    isRealisasiSubmitting ||
                    !getRealisasiValidation(
                      realisasiTarget,
                      Number(realisasiForm.nominal) || 0,
                      realisasiForm.tanggal
                    ).valid
                  }
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-md transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRealisasiSubmitting ? 'Menyimpan...' : 'Simpan Realisasi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= DETAIL MASALAH ================= */}

      {detailGroup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">
                  Detail Limit — {detailGroup.bulan}
                </h3>

                <p className="text-[10px] text-slate-500">
                  Beban limit dihitung berdasarkan realisasi aktual dan rencana yang
                  belum direalisasikan.
                </p>
              </div>

              <button
                onClick={() => setDetailGroup(null)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3">
              {(() => {
                const rowsInGroup = rows.filter(
                  (r) =>
                    r.sobat_id === detailGroup.sobatId &&
                    getRowUsageMonth(r) === detailGroup.bulan
                );

                const limitObj = getLimitForBulan(detailGroup.bulan);
                const usage = getMonthlyUsage(detailGroup.sobatId, detailGroup.bulan);

                const totalRencana = rowsInGroup.reduce(
                  (sum, r) => sum + (Number(r.nominal_rencana) || 0),
                  0
                );

                const totalRealisasi = rowsInGroup.reduce(
                  (sum, r) => sum + (Number(r.nominal_dicairkan) || 0),
                  0
                );

                const kelebihan = Math.max(usage.total - usage.limit, 0);

                return (
                  <>
                    {/* TABLE */}
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-400 text-left">
                          <th className="py-1">Kegiatan</th>
                          <th className="py-1">Bulan Rencana</th>
                          <th className="py-1 text-right">Rencana</th>
                          <th className="py-1 text-right">Realisasi</th>
                          <th className="py-1 text-right">Sisa</th>
                          <th className="py-1 text-center">Tahap</th>
                          <th className="py-1 text-center">Aksi</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-50">
                        {rowsInGroup.map((r) => {
                          const belumRealisasi =
                            r.nominal_dicairkan === null ||
                            r.nominal_dicairkan === undefined;

                          const butuhReschedule =
                            belumRealisasi &&
                            (kelebihan > 0 || getRowStatus(r) === 'terlambat');

                          const suggestion = butuhReschedule
                            ? findRescheduleSuggestion(
                                r,
                                detailGroup.bulan,
                                Number(r.nominal_rencana) || 0
                              )
                            : null;

                          // Bulan realisasi aktual (dari tgl_pencairan), dipakai
                          // untuk menjelaskan KENAPA baris ini masuk hitungan
                          // bulan `detailGroup.bulan` — terutama kalau berbeda
                          // dari bulan_pencairan (rencana awal), supaya admin
                          // bisa langsung lihat sumber selisihnya di sini.
                          const bulanRealisasiAktual =
                            !belumRealisasi && r.tgl_pencairan
                              ? monthInputToLabel(r.tgl_pencairan.slice(0, 7))
                              : null;

                          const realisasiBerbedaBulan =
                            bulanRealisasiAktual &&
                            !bulanEquals(bulanRealisasiAktual, r.bulan_pencairan);

                          return (
                            <tr key={r.id}>
                              <td className="py-1.5">
                                <div>{r.penugasan?.kegiatan?.nama_kegiatan || '-'}</div>

                                {getRowStatus(r) === 'terlambat' && (
                                  <span className="text-[9px] text-rose-600">
                                    🔴 Belum direalisasikan
                                  </span>
                                )}
                              </td>

                              <td className="py-1.5">
                                <div>{r.bulan_pencairan}</div>
                                {realisasiBerbedaBulan && (
                                  <div className="text-[9px] text-amber-600 mt-0.5">
                                    ⏰ Dihitung sbg beban {bulanRealisasiAktual}
                                    <br />
                                    (tgl realisasi: {r.tgl_pencairan})
                                  </div>
                                )}
                              </td>

                              <td className="py-1.5 text-right font-semibold">
                                {formatRupiah(r.nominal_rencana)}
                              </td>

                              <td className="py-1.5 text-right text-emerald-600 font-semibold">
                                {r.nominal_dicairkan !== null &&
                                r.nominal_dicairkan !== undefined
                                  ? formatRupiah(r.nominal_dicairkan)
                                  : '-'}
                              </td>

                              <td className="py-1.5 text-right text-amber-600 font-semibold">
                                {formatRupiah(getSisaRencana(r))}
                              </td>

                              <td className="py-1.5 text-center">
                                <span className="text-[10px] font-semibold text-violet-700">
                                  Tahap {r.tahap_ke || '-'}
                                </span>
                              </td>

                              <td className="py-1.5 text-center">
                                {suggestion ? (
                                  <button
                                    onClick={() => handleReschedule(r, suggestion.bulan)}
                                    className="text-[10px] px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded transition cursor-pointer"
                                    title={
                                      suggestion.diLuarPeriode
                                        ? 'Bulan ini berada di luar periode kegiatan'
                                        : undefined
                                    }
                                  >
                                    💡 Pindah ke {suggestion.bulan}
                                    {suggestion.diLuarPeriode && (
                                      <span className="ml-1 text-blue-400">
                                        (di luar periode)
                                      </span>
                                    )}
                                  </button>
                                ) : (
                                  butuhReschedule && (
                                    <span className="text-[10px] text-slate-400">
                                      Tidak ada bulan dengan sisa limit cukup
                                    </span>
                                  )
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* SUMMARY */}
                    <div className="text-xs bg-slate-50 rounded-lg p-3 space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Total Rencana</span>
                        <span className="font-semibold">{formatRupiah(totalRencana)}</span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-500">Total Realisasi</span>
                        <span className="font-semibold text-emerald-600">
                          {formatRupiah(totalRealisasi)}
                        </span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-500">Total Sisa</span>
                        <span className="font-semibold text-amber-600">
                          {formatRupiah(Math.max(0, totalRencana - totalRealisasi))}
                        </span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-500">Beban Aktual</span>
                        <span className="font-semibold">{formatRupiah(usage.total)}</span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-slate-500">Limit Bulan Ini</span>
                        <span className="font-semibold">
                          {limitObj ? formatRupiah(limitObj.batas_maksimal) : 'Belum diatur'}
                        </span>
                      </div>

                      <div className="border-t border-slate-200 pt-1.5 flex justify-between">
                        <span className="text-slate-500">Sisa Limit</span>
                        <span
                          className={`font-bold ${
                            usage.remaining < 0 ? 'text-rose-600' : 'text-emerald-600'
                          }`}
                        >
                          {usage.remaining < 0
                            ? `-${formatRupiah(Math.abs(usage.remaining))}`
                            : formatRupiah(usage.remaining)}
                        </span>
                      </div>

                      {kelebihan > 0 && (
                        <div className="flex justify-between text-rose-600">
                          <span>Kelebihan</span>
                          <span className="font-semibold">{formatRupiah(kelebihan)}</span>
                        </div>
                      )}
                    </div>

                    <div className="text-[10px] text-slate-400">
                      <p>
                        💡 Rencana yang sudah direalisasikan tidak dapat dijadwalkan
                        ulang. Yang dapat dipindahkan adalah rencana yang belum
                        direalisasikan.
                      </p>

                      <p className="mt-1">
                        Sistem mengutamakan bulan berikutnya dalam periode kegiatan yang
                        masih memiliki kapasitas. Jika tidak ada, sistem menyarankan
                        bulan lain di luar periode kegiatan (ditandai "di luar periode")
                        yang masih memiliki sisa limit. Keputusan reschedule tetap di admin.
                      </p>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}