'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

const NAMA_BULAN_ID = [
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

const READ_STORAGE_KEY = 'pencairan_notification_read_v2';

// Ambang default "mendekati limit" kalau baris limit_honor tidak mengisi
// persen_peringatan — HARUS sama dengan DEFAULT_WARN_PERCENT di halaman
// Pencairan supaya status notifikasi konsisten di kedua tempat.
const DEFAULT_WARN_PERCENT = 80;

// ============================================
// PARSE BULAN
// ============================================

const parseBulanLabel = (
  label: string
): { idx: number; year: number } | null => {
  const parts = (label || '').trim().split(/\s+/);
  const namaBulan = parts[0];
  const tahunStr = parts[1];

  const idx = NAMA_BULAN_ID.findIndex(
    (m) => m.toLowerCase() === (namaBulan || '').toLowerCase()
  );

  const year = parseInt(tahunStr, 10);

  if (idx === -1 || Number.isNaN(year)) return null;

  return { idx, year };
};

const monthInputToLabel = (value: string): string => {
  const [yearStr, monthStr] = (value || '').split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);

  if (!year || !month || month < 1 || month > 12) return '';

  return `${NAMA_BULAN_ID[month - 1]} ${year}`;
};

// ============================================
// CEK BULAN SUDAH LEWAT
// ============================================

const isBulanLewat = (label: string): boolean => {
  const parsed = parseBulanLabel(label);
  if (!parsed) return false;

  const now = new Date();
  const endOfBulan = new Date(
    parsed.year,
    parsed.idx + 1,
    0,
    23,
    59,
    59,
    999
  );

  return endOfBulan < now;
};

// ============================================
// DATA PENCAIRAN
// ============================================

interface RawPencairan {
  id: number;
  sobat_id: string;
  penugasan_id: number;
  bulan_pencairan: string;
  nominal_rencana: number;
  nominal_dicairkan: number | null;
  tgl_pencairan: string | null;
}

// ============================================
// DATA LIMIT HONOR
//
// Disimpan sebagai list (bukan Map per bulan_periode) supaya pencocokan
// bulan bisa fallback ke pasangan bulan+tahun numerik, sama persis
// seperti getLimitForBulan() di halaman Pencairan. Kalau hanya
// mengandalkan bulan_periode, baris limit yang dicocokkan lewat
// bulan+tahun di halaman Pencairan bisa jadi tidak ketemu di sini,
// sehingga status notifikasi bisa berbeda antara lonceng dan halaman.
// ============================================

interface LimitHonor {
  bulan: number | null;
  tahun: number | null;
  bulan_periode: string;
  batas_maksimal: number;
  persen_peringatan: number;
}

// ============================================
// GROUP MASALAH
// ============================================

export interface MasalahGroup {
  sobatId: string;
  namaMitra: string;

  // Bulan yang membebani limit.
  // - Belum realisasi: bulan rencana.
  // - Sudah realisasi: bulan tgl_pencairan.
  bulan: string;

  totalRencana: number;
  totalRealisasi: number;

  // Beban yang benar-benar dihitung ke limit.
  bebanAktual: number;

  limit: number;
  sisa: number;
  persen: number;

  // Status (saling eksklusif untuk melebihi/mencapai/mendekati, sama
  // seperti di halaman Pencairan):
  // - mendekati: >= persen_peringatan (default 80%) s.d. <100%
  // - mencapai: tepat 100%
  // - melebihi: >100%
  melebihi: boolean;
  mencapai: boolean;
  mendekati: boolean;

  // Belum realisasi + bulan rencana sudah lewat.
  adaTerlambat: boolean;

  penugasanIds: number[];

  // Kunci stabil untuk status sudah dibaca.
  notificationKey: string;
}

// ============================================
// RINGKASAN TUNGGAKAN PER MITRA
// ============================================

export interface TunggakanMitra {
  sobatId: string;
  namaMitra: string;
  jumlahMasalah: number;
  kegiatanBermasalah: string[];
}

// ============================================
// UTIL STATUS NOTIFIKASI
// ============================================

const getNotificationKey = (group: {
  sobatId: string;
  bulan: string;
  melebihi: boolean;
  mencapai: boolean;
  mendekati: boolean;
  adaTerlambat: boolean;
}) => {
  const status = group.melebihi
    ? 'melebihi'
    : group.mencapai
      ? 'mencapai'
      : group.mendekati
        ? 'mendekati'
        : 'aman';

  const terlambat = group.adaTerlambat ? 'terlambat' : 'normal';

  return `${group.sobatId}__${group.bulan}__${status}__${terlambat}`;
};

const safeReadStorage = (): string[] => {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(READ_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
};

const saveReadStorage = (values: Set<string>) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      READ_STORAGE_KEY,
      JSON.stringify(Array.from(values))
    );
  } catch {
    // localStorage bisa gagal pada mode private / storage penuh.
  }
};

// ============================================
// HOOK
// ============================================

export function useMasalahMitra() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RawPencairan[]>([]);

  const [mitraMap, setMitraMap] = useState<Map<string, string>>(new Map());

  const [limitList, setLimitList] = useState<LimitHonor[]>([]);

  const [kegiatanNameByPenugasan, setKegiatanNameByPenugasan] = useState<
    Map<number, string>
  >(new Map());

  // Daftar notifikasi yang sudah dibaca browser ini.
  const [readNotificationKeys, setReadNotificationKeys] = useState<Set<string>>(
    () => new Set()
  );

  // ============================================
  // LOAD STATUS BACA
  // ============================================

  useEffect(() => {
    setReadNotificationKeys(new Set(safeReadStorage()));
  }, []);

  // ============================================
  // FETCH DATA
  // ============================================

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);

      // ========================================
      // DATA PENCAIRAN
      // ========================================

      const {
        data: pencairanData,
        error: pencairanError,
      } = await supabase
        .from('pencairan_honor')
        .select(
          `
            id,
            sobat_id,
            penugasan_id,
            bulan_pencairan,
            nominal_rencana,
            nominal_dicairkan,
            tgl_pencairan
          `
        );

      if (pencairanError) {
        console.error('Gagal mengambil data pencairan:', pencairanError.message);
      }

      setRows((pencairanData || []) as RawPencairan[]);

      // ========================================
      // DATA MITRA
      // ========================================

      const { data: mitraData, error: mitraError } = await supabase
        .from('mitra')
        .select('sobat_id, nama_mitra');

      if (mitraError) {
        console.error('Gagal mengambil data mitra:', mitraError.message);
      }

      setMitraMap(
        new Map(
          (mitraData || []).map((m: any) => [
            m.sobat_id,
            m.nama_mitra,
          ])
        )
      );

      // ========================================
      // DATA LIMIT HONOR
      //
      // Ambil bulan & tahun numerik juga (bukan hanya bulan_periode teks)
      // dan persen_peringatan per baris, supaya pencocokan bulan dan
      // ambang "mendekati limit" identik dengan halaman Pencairan.
      // ========================================

      const { data: limitData, error: limitError } = await supabase
        .from('limit_honor')
        .select('bulan, tahun, bulan_periode, batas_maksimal, persen_peringatan');

      if (limitError) {
        console.error('Gagal mengambil data limit honor:', limitError.message);
      }

      setLimitList(
        (limitData || []).map((l: any) => ({
          bulan: l.bulan,
          tahun: l.tahun,
          bulan_periode: l.bulan_periode,
          batas_maksimal: Number(l.batas_maksimal) || 0,
          persen_peringatan: Number(l.persen_peringatan) || DEFAULT_WARN_PERCENT,
        }))
      );

      // ========================================
      // DATA PENUGASAN
      // ========================================

      const {
        data: penugasanData,
        error: penugasanError,
      } = await supabase
        .from('penugasan')
        .select(
          `
            id,
            kegiatan:kegiatan_id (
              nama_kegiatan
            )
          `
        );

      if (penugasanError) {
        console.error('Gagal mengambil data penugasan:', penugasanError.message);
      }

      setKegiatanNameByPenugasan(
        new Map(
          (penugasanData || []).map((p: any) => [
            p.id,
            p.kegiatan?.nama_kegiatan || '-',
          ])
        )
      );
    } catch (error) {
      console.error('Gagal memuat data untuk deteksi masalah:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // ============================================
  // LOAD + AUTO REFRESH
  // ============================================

  useEffect(() => {
    fetchAll();

    const interval = setInterval(fetchAll, 60000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // ============================================
  // CARI LIMIT UNTUK SATU BULAN
  //
  // Sama persis dengan getLimitForBulan() di halaman Pencairan:
  // 1. Coba cocokkan lewat teks bulan_periode.
  // 2. Kalau tidak ketemu, fallback ke pasangan bulan (1-12) + tahun.
  // ============================================

  const getLimitForBulan = useCallback(
    (bulanLabel: string): LimitHonor | null => {
      if (!bulanLabel) return null;

      const byPeriode = limitList.find(
        (l) =>
          (l.bulan_periode || '').trim().toLowerCase() ===
          bulanLabel.trim().toLowerCase()
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

  // ============================================
  // TENTUKAN BULAN BEBAN LIMIT
  // ============================================

  const getUsageMonth = useCallback((row: RawPencairan): string => {
    const sudahRealisasi =
      row.nominal_dicairkan !== null && row.nominal_dicairkan !== undefined;

    // Jika sudah direalisasikan dan tanggal tersedia,
    // beban limit pindah ke bulan tgl_pencairan.
    if (sudahRealisasi && row.tgl_pencairan) {
      const actualMonth = monthInputToLabel(row.tgl_pencairan.slice(0, 7));
      if (actualMonth) return actualMonth;
    }

    // Jika belum realisasi, tetap menahan limit bulan rencana.
    return row.bulan_pencairan;
  }, []);

  // ============================================
  // HITUNG MASALAH
  // ============================================

  const masalahGroups = useMemo<MasalahGroup[]>(() => {
    const grouped = new Map<string, RawPencairan[]>();

    rows.forEach((row) => {
      const bulanBeban = getUsageMonth(row);
      if (!bulanBeban) return;

      const key = `${row.sobat_id}__${bulanBeban}`;
      const existing = grouped.get(key) || [];
      existing.push(row);
      grouped.set(key, existing);
    });

    const result: MasalahGroup[] = [];

    grouped.forEach((sumberRows, key) => {
      const separatorIndex = key.indexOf('__');
      const sobatId =
        separatorIndex >= 0 ? key.slice(0, separatorIndex) : key;
      const bulan =
        separatorIndex >= 0 ? key.slice(separatorIndex + 2) : '';

      // ======================================
      // TOTAL RENCANA
      // ======================================

      const totalRencana = sumberRows.reduce(
        (total, row) => total + (Number(row.nominal_rencana) || 0),
        0
      );

      // ======================================
      // TOTAL REALISASI
      // ======================================

      const totalRealisasi = sumberRows.reduce(
        (total, row) => total + (Number(row.nominal_dicairkan) || 0),
        0
      );

      // ======================================
      // BEBAN AKTUAL
      // ======================================
      // Belum realisasi:
      //   nominal_rencana dibebankan ke bulan rencana.
      //
      // Sudah realisasi:
      //   nominal_dicairkan dibebankan ke bulan tgl_pencairan.
      //
      // Tidak menjumlahkan rencana + realisasi sekaligus.

      const bebanAktual = sumberRows.reduce((total, row) => {
        const sudahRealisasi =
          row.nominal_dicairkan !== null && row.nominal_dicairkan !== undefined;

        const nilai = sudahRealisasi
          ? Number(row.nominal_dicairkan) || 0
          : Number(row.nominal_rencana) || 0;

        return total + nilai;
      }, 0);

      // ======================================
      // LIMIT BULAN
      //
      // Pakai getLimitForBulan (fallback bulan_periode -> bulan+tahun)
      // dan persen_peringatan per baris limit, sama seperti halaman
      // Pencairan — bukan lagi Map bulan_periode + ambang tetap 80%.
      // ======================================

      const limitObj = getLimitForBulan(bulan);
      const limit = Number(limitObj?.batas_maksimal) || 0;

      const sisa = Math.max(limit - bebanAktual, 0);

      const persen = limit > 0 ? (bebanAktual / limit) * 100 : 0;

      // ======================================
      // STATUS LIMIT (urutan & ambang sama dengan halaman Pencairan)
      // ======================================
      // >100%                         Melebihi
      // =100%                         Mencapai (tepat)
      // >= persen_peringatan s.d 100% Mendekati
      // < persen_peringatan           Aman

      const melebihi = limit > 0 && bebanAktual > limit;

      const mencapai =
        !melebihi && limit > 0 && bebanAktual > 0 && bebanAktual === limit;

      const warnPercent = limitObj?.persen_peringatan ?? DEFAULT_WARN_PERCENT;

      const mendekati =
        !melebihi && !mencapai && limit > 0 && persen >= warnPercent;

      // ======================================
      // CEK TERLAMBAT
      // ======================================
      // Hanya dianggap terlambat jika BELUM direalisasikan.
      // Setelah terealisasi, masalah keterlambatan tidak lagi
      // menjadi outstanding notification.

      const adaTerlambat = sumberRows.some(
        (row) =>
          (row.nominal_dicairkan === null || row.nominal_dicairkan === undefined) &&
          isBulanLewat(row.bulan_pencairan)
      );

      const penugasanIds = Array.from(
        new Set(sumberRows.map((row) => row.penugasan_id))
      );

      const baseGroup = {
        sobatId,
        bulan,
        melebihi,
        mencapai,
        mendekati,
        adaTerlambat,
      };

      const notificationKey = getNotificationKey(baseGroup);

      // ======================================
      // MASUK NOTIFIKASI
      // ======================================

      if (melebihi || mencapai || mendekati || adaTerlambat) {
        result.push({
          sobatId,
          namaMitra: mitraMap.get(sobatId) || sobatId,
          bulan,
          totalRencana,
          totalRealisasi,
          bebanAktual,
          limit,
          sisa,
          persen,
          melebihi,
          mencapai,
          mendekati,
          adaTerlambat,
          penugasanIds,
          notificationKey,
        });
      }
    });

    // Prioritas:
    // 1. Melebihi
    // 2. Mencapai
    // 3. Terlambat
    // 4. Mendekati

    return result.sort((a, b) => {
      const getPriority = (group: MasalahGroup) => {
        if (group.melebihi) return 1;
        if (group.mencapai) return 2;
        if (group.adaTerlambat) return 3;
        if (group.mendekati) return 4;
        return 5;
      };

      const priorityDiff = getPriority(a) - getPriority(b);
      if (priorityDiff !== 0) return priorityDiff;

      return a.namaMitra.localeCompare(b.namaMitra, 'id');
    });
  }, [rows, mitraMap, getUsageMonth, getLimitForBulan]);

  // ============================================
  // UNREAD NOTIFICATION
  // ============================================

  const unreadMasalahGroups = useMemo(() => {
    return masalahGroups.filter(
      (group) => !readNotificationKeys.has(group.notificationKey)
    );
  }, [masalahGroups, readNotificationKeys]);

  const unreadCount = unreadMasalahGroups.length;

  const isNotificationRead = useCallback(
    (notificationKey: string) => readNotificationKeys.has(notificationKey),
    [readNotificationKeys]
  );

  // ============================================
  // TANDAI SUDAH DIBACA
  // ============================================

  const markAsRead = useCallback((notificationKey: string) => {
    setReadNotificationKeys((previous) => {
      const next = new Set(previous);
      next.add(notificationKey);
      saveReadStorage(next);
      return next;
    });
  }, []);

  const markGroupAsRead = useCallback(
    (group: MasalahGroup) => {
      markAsRead(group.notificationKey);
    },
    [markAsRead]
  );

  const markAllAsRead = useCallback(() => {
    setReadNotificationKeys((previous) => {
      const next = new Set(previous);
      masalahGroups.forEach((group) => next.add(group.notificationKey));
      saveReadStorage(next);
      return next;
    });
  }, [masalahGroups]);

  // ============================================
  // TUNGGAKAN PER MITRA
  // ============================================

  const tunggakanByMitra = useMemo<Map<string, TunggakanMitra>>(() => {
    const map = new Map<string, TunggakanMitra>();

    masalahGroups.forEach((group) => {
      const kegiatanNames = group.penugasanIds.map(
        (penugasanId) => kegiatanNameByPenugasan.get(penugasanId) || '-'
      );

      const existing = map.get(group.sobatId);

      if (existing) {
        existing.jumlahMasalah += 1;

        kegiatanNames.forEach((namaKegiatan) => {
          if (!existing.kegiatanBermasalah.includes(namaKegiatan)) {
            existing.kegiatanBermasalah.push(namaKegiatan);
          }
        });
      } else {
        map.set(group.sobatId, {
          sobatId: group.sobatId,
          namaMitra: group.namaMitra,
          jumlahMasalah: 1,
          kegiatanBermasalah: Array.from(new Set(kegiatanNames)),
        });
      }
    });

    return map;
  }, [masalahGroups, kegiatanNameByPenugasan]);

  return {
    loading,
    masalahGroups,
    unreadMasalahGroups,
    unreadCount,
    isNotificationRead,
    tunggakanByMitra,
    markAsRead,
    markGroupAsRead,
    markAllAsRead,
    refetch: fetchAll,
  };
}