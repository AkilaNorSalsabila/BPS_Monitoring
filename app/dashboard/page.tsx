'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import StatsCard from '@/components/dashboard/StatsCard';
import DisbursementChart, { DisbursementDataPoint } from '@/components/dashboard/DisbursementChart';
import EmployeeLimitTable, { EmployeeLimitRow, StatusLimit } from '@/components/dashboard/EmployeeLimitTable';
import WorkDistributionSection, {
  WorkDistributionAssignment,
  WorkDistributionMitra,
} from '@/components/dashboard/WorkDistributionSection';

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

const NAMA_BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

// =========================================================
// HELPER BULAN
// ⭐ Disamakan persis dengan halaman Laporan Mitra Limit: satu-satunya
// penentu "periode/bulan mana yang terbebani" untuk sebuah baris
// pencairan_honor adalah kolom `bulan_pencairan` — baik untuk rencana
// MAUPUN realisasi. `tgl_pencairan` HANYA tanggal transaksi aktual
// (kapan dibayarkan), bukan penentu periode; seorang mitra bisa saja
// dibayar lebih awal/lebih lambat dari bulan yang seharusnya dibebani.
// =========================================================

const parseBulanLabel = (label: string): { idx: number; year: number } | null => {
  if (!label) return null;
  const parts = label.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const idx = NAMA_BULAN_ID.findIndex((m) => m.toLowerCase() === parts[0].toLowerCase());
  const year = parseInt(parts[1], 10);

  if (idx === -1 || isNaN(year)) return null;
  return { idx, year };
};

const monthLabelToKey = (label: string): number | null => {
  const parsed = parseBulanLabel(label);
  if (!parsed) return null;
  return parsed.year * 12 + parsed.idx;
};

const bulanEquals = (a: string, b: string): boolean => {
  const ka = monthLabelToKey(a);
  const kb = monthLabelToKey(b);

  if (ka === null || kb === null) {
    return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
  }

  return ka === kb;
};

/** Dipakai untuk sorting kronologis; label yang gagal diparse dianggap 0 (paling awal). */
const periodeToSortKey = (label: string): number => monthLabelToKey(label) ?? 0;

/** Label bulan berjalan sesuai tanggal sistem, mis. "September 2026". */
const getCurrentMonthLabel = (): string => {
  const now = new Date();
  return `${NAMA_BULAN_ID[now.getMonth()]} ${now.getFullYear()}`;
};

// =========================================================
// PARSER PERIODE KEGIATAN MULTI-BULAN
// (khusus dipakai untuk section "Pemerataan Penugasan Mitra" di bawah,
// yang memang mengelompokkan berdasarkan bulan_kegiatan pada tabel
// kegiatan, bukan pencairan_honor)
// =========================================================

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

interface PeriodeKegiatan {
  months: string[];
  jumlahBulan: number;
}

function parseBulanKegiatan(raw: string | null | undefined): PeriodeKegiatan {
  const text = (raw || '').trim();
  if (!text) return { months: [], jumlahBulan: 0 };

  const matches = [...text.matchAll(MONTH_YEAR_REGEX)]
    .map((m) => ({ idx: monthIndexFromName(m[1]), year: parseInt(m[2], 10) }))
    .filter((m) => m.idx !== -1);

  if (matches.length >= 2) {
    const start = matches[0];
    const end = matches[matches.length - 1];
    const totalBulan = (end.year - start.year) * 12 + (end.idx - start.idx) + 1;
    if (totalBulan > 0 && totalBulan <= 36) {
      return { months: generateMonthSequence(start.idx, start.year, totalBulan), jumlahBulan: totalBulan };
    }
  }

  if (matches.length === 1) {
    const bulanCountMatch = text.match(/\(?\s*(\d+)\s*bulan\s*\)?/i);
    const jumlah = bulanCountMatch ? Math.max(parseInt(bulanCountMatch[1], 10) || 1, 1) : 1;
    return { months: generateMonthSequence(matches[0].idx, matches[0].year, jumlah), jumlahBulan: jumlah };
  }

  return { months: [text], jumlahBulan: 1 };
}

// =========================================================
// INTERFACE
// =========================================================

interface MitraRow {
  sobat_id: string;
  nama_mitra: string;
}

// Baris rencana/realisasi pencairan — SUMBER UTAMA untuk grafik pencairan,
// tabel "Mendekati/Sudah Limit", DAN untuk menghitung Total Honor per
// penugasan (lihat catatan di bawah).
interface PencairanHonorRow {
  sobat_id: string;
  // ⭐ FIX: dibutuhkan supaya nominal pencairan bisa dikaitkan ke satu
  // baris Penugasan tertentu (satu mitra bisa punya lebih dari satu
  // penugasan di bulan yang sama).
  penugasan_id: number | null;
  bulan_pencairan: string;
  nominal_rencana: number | null;
  nominal_dicairkan: number | null;
  tgl_pencairan: string | null; // ⚠️ HANYA tanggal transaksi aktual, BUKAN penentu periode.
}

interface LimitHonorRow {
  bulan: number | null;
  tahun: number | null;
  bulan_periode: string;
  batas_maksimal: number;
  persen_peringatan: number;
}

// Dipakai khusus untuk section Pemerataan Penugasan Mitra.
// ⭐ FIX: `total_honor` di tabel `penugasan` TIDAK dipakai lagi — sesuai
// keputusan desain, honor tidak diinput manual di Penugasan, melainkan
// dihitung otomatis dari akumulasi Rencana Pencairan (pencairan_honor).
// `id` ditambahkan supaya baris penugasan bisa dicocokkan dengan baris
// pencairan_honor via `penugasan_id`.
interface PenugasanRow {
  id: number;
  sobat_id: string;
  kegiatan?: {
    bulan_kegiatan: string;
  };
}

// =========================================================
// PAGE
// =========================================================

export default function DashboardPage() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // ⭐ Default periode SELALU bulan berjalan sesuai tanggal sistem.
  const [periodeBulan, setPeriodeBulan] = useState<string>(getCurrentMonthLabel());
  const [periodeOptions, setPeriodeOptions] = useState<string[]>([]);

  const [mitraList, setMitraList] = useState<MitraRow[]>([]);
  const [pencairanList, setPencairanList] = useState<PencairanHonorRow[]>([]);
  const [limitList, setLimitList] = useState<LimitHonorRow[]>([]);

  // Khusus untuk section Pemerataan Penugasan Mitra (tidak dipakai untuk
  // statistik limit/grafik lagi).
  const [penugasanList, setPenugasanList] = useState<PenugasanRow[]>([]);

  const [loading, setLoading] = useState<boolean>(true);

  /* ============================================
     FETCH DATA
  ============================================ */
  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: mitraData, error: mitraErr } = await supabase
        .from('mitra')
        .select('sobat_id, nama_mitra');
      if (mitraErr) throw mitraErr;
      setMitraList(mitraData || []);

      // ⭐ SUMBER UTAMA statistik limit, grafik pencairan, DAN Total Honor
      // per penugasan (lewat kolom penugasan_id).
      const { data: pencairanData, error: pencairanErr } = await supabase
        .from('pencairan_honor')
        .select('sobat_id, penugasan_id, bulan_pencairan, nominal_rencana, nominal_dicairkan, tgl_pencairan');
      if (pencairanErr) throw pencairanErr;
      setPencairanList((pencairanData as any) || []);

      const { data: limitData, error: limitErr } = await supabase
        .from('limit_honor')
        .select('bulan, tahun, bulan_periode, batas_maksimal, persen_peringatan');
      if (limitErr) {
        console.error('Error fetch limit_honor:', limitErr);
      }
      setLimitList(limitData || []);

      // Masih dibutuhkan untuk section Pemerataan Penugasan Mitra.
      // ⭐ FIX: select `id` (bukan `total_honor`) supaya bisa dicocokkan
      // dengan pencairan_honor.penugasan_id.
      const { data: penugasanData, error: penugasanErr } = await supabase.from('penugasan').select(`
          id,
          sobat_id,
          kegiatan:kegiatan_id (
            bulan_kegiatan
          )
        `);
      if (penugasanErr) throw penugasanErr;
      setPenugasanList((penugasanData as any) || []);

      // ⭐ Opsi periode dibangun dari `bulan_pencairan` (SATU-SATUNYA sumber
      // periode, baik rencana maupun realisasi) + bulan_periode di
      // limit_honor, dan SELALU menyertakan bulan berjalan.
      const periodeSet = new Set<string>();

      (pencairanData || []).forEach((row: any) => {
        if (row.bulan_pencairan) periodeSet.add(row.bulan_pencairan);
      });

      (limitData || []).forEach((row: LimitHonorRow) => {
        if (row.bulan_periode) periodeSet.add(row.bulan_periode);
      });

      periodeSet.add(getCurrentMonthLabel());

      const dynamicPeriodeOptions = Array.from(periodeSet).sort(
        (a, b) => periodeToSortKey(a) - periodeToSortKey(b)
      );

      setPeriodeOptions(dynamicPeriodeOptions);

      // Pertahankan pilihan periode yang sedang aktif kalau masih valid;
      // kalau tidak (mis. pertama kali load), pakai bulan berjalan.
      setPeriodeBulan((current) =>
        dynamicPeriodeOptions.includes(current) ? current : getCurrentMonthLabel()
      );
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  /* ============================================
     BULAN YANG MEMBEBANI LIMIT untuk 1 baris pencairan_honor.
     ⭐ FIX: SELALU pakai `bulan_pencairan`, baik untuk rencana maupun
     realisasi — konsisten dengan Laporan Mitra Limit. `tgl_pencairan`
     TIDAK dipakai untuk menentukan periode (itu cuma tanggal transaksi
     aktual; mitra bisa dibayar lebih awal/lambat dari bulan yang
     seharusnya dibebani).
  ============================================ */
  const getRowUsageMonth = useCallback((row: PencairanHonorRow): string => {
    return row.bulan_pencairan;
  }, []);

  /* ============================================
     LIMIT UNTUK SATU BULAN (fallback: label -> bulan/tahun numerik)
  ============================================ */
  const getLimitForBulan = useCallback(
    (bulanLabel: string) => {
      if (!bulanLabel) return null;

      const byPeriode = limitList.find((l) => bulanEquals(l.bulan_periode || '', bulanLabel));
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

  /* ============================================
     PEMAKAIAN LIMIT SEORANG MITRA PADA SATU BULAN
     (realisasi + rencana yang belum direalisasikan, tidak dihitung dobel)
  ============================================ */
  const getMonthlyUsage = useCallback(
    (sobatId: string, bulan: string) => {
      const limitObj = getLimitForBulan(bulan);
      const limit = Number(limitObj?.batas_maksimal) || DEFAULT_LIMIT;
      const warnPercent = limitObj?.persen_peringatan ?? DEFAULT_WARN_PERCENT;

      let realized = 0;
      let planned = 0;

      pencairanList.forEach((row) => {
        if (row.sobat_id !== sobatId) return;
        if (getRowUsageMonth(row) !== bulan) return;

        const real = row.nominal_dicairkan;
        if (real !== null && real !== undefined) {
          realized += Number(real) || 0;
        } else {
          planned += Number(row.nominal_rencana) || 0;
        }
      });

      const total = realized + planned;

      return { limit, warnPercent, realized, planned, total };
    },
    [pencairanList, getLimitForBulan, getRowUsageMonth]
  );

  /* ============================================
     STATS: Total Mitra, Sudah Limit, Masih Tersedia,
     Total Pencairan (untuk periode terpilih)
  ============================================ */
  const stats = useMemo(() => {
    const mitraPeriode = new Set<string>();
    pencairanList.forEach((row) => {
      if (getRowUsageMonth(row) === periodeBulan) mitraPeriode.add(row.sobat_id);
    });

    let sudahLimit = 0;
    mitraPeriode.forEach((sobatId) => {
      const usage = getMonthlyUsage(sobatId, periodeBulan);
      if (usage.limit > 0 && usage.total >= usage.limit) sudahLimit += 1;
    });

    // Total Pencairan = jumlah yang BENAR-BENAR sudah dicairkan (realisasi)
    // yang bulan_pencairan-nya jatuh di periode terpilih.
    let totalPencairanPeriode = 0;
    pencairanList.forEach((row) => {
      if (getRowUsageMonth(row) !== periodeBulan) return;
      if (row.nominal_dicairkan !== null && row.nominal_dicairkan !== undefined) {
        totalPencairanPeriode += Number(row.nominal_dicairkan) || 0;
      }
    });

    const totalMitra = mitraPeriode.size;
    const masihTersedia = Math.max(totalMitra - sudahLimit, 0);

    return {
      totalMitra,
      sudahLimit,
      masihTersedia,
      totalPencairanPeriode,
      persenSudahLimit: totalMitra > 0 ? Math.round((sudahLimit / totalMitra) * 1000) / 10 : 0,
      persenTersedia: totalMitra > 0 ? Math.round((masihTersedia / totalMitra) * 1000) / 10 : 0,
    };
  }, [pencairanList, periodeBulan, getRowUsageMonth, getMonthlyUsage]);

  /* ============================================
     GRAFIK PENCAIRAN
     Total REALISASI (nominal_dicairkan) per bulan_pencairan, 6 bulan
     terakhir yang memang ada datanya.
  ============================================ */
  const disbursementData: DisbursementDataPoint[] = useMemo(() => {
    const totalPerPeriode: Record<string, number> = {};

    pencairanList.forEach((row) => {
      if (row.nominal_dicairkan === null || row.nominal_dicairkan === undefined) return;
      const bulan = getRowUsageMonth(row);
      if (!bulan) return;
      totalPerPeriode[bulan] = (totalPerPeriode[bulan] || 0) + (Number(row.nominal_dicairkan) || 0);
    });

    const periodeListSorted = Object.keys(totalPerPeriode).sort(
      (a, b) => periodeToSortKey(a) - periodeToSortKey(b)
    );

    const last6 = periodeListSorted.slice(-6);

    return last6.map((periode) => ({
      periode,
      total: totalPerPeriode[periode],
    }));
  }, [pencairanList, getRowUsageMonth]);

  /* ============================================
     TABEL PEGAWAI MENDEKATI/SUDAH LIMIT (periode terpilih di dropdown)
  ============================================ */
  const employeeLimitRows: EmployeeLimitRow[] = useMemo(() => {
    const rows: EmployeeLimitRow[] = [];

    mitraList.forEach((mitra) => {
      const usage = getMonthlyUsage(mitra.sobat_id, periodeBulan);
      if (usage.total <= 0 || usage.limit <= 0) return;

      const usageRatio = (usage.total / usage.limit) * 100;
      if (usageRatio < usage.warnPercent) return; // hanya tampilkan yang mendekati/sudah limit

      const status: StatusLimit = usageRatio >= 100 ? 'Limit Terlampaui' : 'Mendekati Limit';

      rows.push({
        sobatId: mitra.sobat_id,
        namaMitra: mitra.nama_mitra,
        terpakai: usage.total,
        limit: usage.limit,
        presentase: Math.round(usageRatio),
        status,
      });
    });

    return rows.sort((a, b) => b.presentase - a.presentase);
  }, [mitraList, periodeBulan, getMonthlyUsage]);

  /* ============================================
     PEMERATAAN PENUGASAN (tetap berbasis kegiatan.bulan_kegiatan untuk
     sebaran bulan; Total Honor SEKARANG dihitung dari pencairan_honor)
  ============================================ */
  const mitraForDistribution: WorkDistributionMitra[] = useMemo(
    () => mitraList.map((m) => ({ sobatId: m.sobat_id, namaMitra: m.nama_mitra })),
    [mitraList]
  );

  const mitraNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    mitraList.forEach((m) => {
      map[m.sobat_id] = m.nama_mitra;
    });
    return map;
  }, [mitraList]);

  // ⭐ FIX (inti perbaikan): Total Honor per penugasan TIDAK diambil dari
  // kolom penugasan.total_honor (sudah tidak diisi lagi), melainkan
  // dijumlahkan dari pencairan_honor yang penugasan_id-nya cocok.
  // Prioritas: pakai nominal_dicairkan kalau sudah ada realisasinya,
  // kalau belum pakai nominal_rencana — konsisten dengan getMonthlyUsage.
  const totalHonorByPenugasanId = useMemo(() => {
    const map: Record<number, number> = {};
    pencairanList.forEach((row) => {
      if (row.penugasan_id === null || row.penugasan_id === undefined) return;
      const nilai =
        row.nominal_dicairkan !== null && row.nominal_dicairkan !== undefined
          ? Number(row.nominal_dicairkan)
          : Number(row.nominal_rencana) || 0;
      map[row.penugasan_id] = (map[row.penugasan_id] || 0) + nilai;
    });
    return map;
  }, [pencairanList]);

  const workDistributionAssignments: WorkDistributionAssignment[] = useMemo(() => {
    return penugasanList
      .filter((item) => item.sobat_id)
      .map((item) => {
        const { months } = parseBulanKegiatan(item.kegiatan?.bulan_kegiatan);
        return {
          sobatId: item.sobat_id,
          namaMitra: mitraNameMap[item.sobat_id] || item.sobat_id,
          totalHonor: totalHonorByPenugasanId[item.id] || 0, // ⭐ diganti dari item.total_honor
          months,
        };
      });
  }, [penugasanList, mitraNameMap, totalHonorByPenugasanId]);

  const tahunAktif = useMemo(() => {
    const parts = periodeBulan.trim().split(/\s+/);
    return parts[1] || String(new Date().getFullYear());
  }, [periodeBulan]);

  const formatRupiah = (val: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800">
      <Sidebar mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />

      <div className="min-h-screen lg:pl-[230px]">
        <Header onMenuClick={() => setMobileSidebarOpen(true)} />

        <main className="p-3 sm:p-4 lg:p-5">
          <div className="mx-auto max-w-[1500px]">
            <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
              <span className="text-[12px] text-slate-400">Periode</span>
              <select
                value={periodeBulan}
                onChange={(e) => setPeriodeBulan(e.target.value)}
                className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-600 shadow-sm outline-none focus:border-blue-400"
                aria-label="Periode dashboard"
              >
                {periodeOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4 ">
              <StatsCard
                title="Total Mitra"
                value={loading ? '...' : String(stats.totalMitra)}
                helper="Mitra aktif"
                tone="blue"
                icon="users"
              />
              <StatsCard
                title="Sudah Limit"
                value={loading ? '...' : String(stats.sudahLimit)}
                helper={loading ? '' : `${stats.persenSudahLimit}% dari total`}
                tone="red"
                icon="limit"
              />
              <StatsCard
                title="Masih Tersedia"
                value={loading ? '...' : String(stats.masihTersedia)}
                helper={loading ? '' : `${stats.persenTersedia}% dari total`}
                tone="green"
                icon="available"
              />
              <StatsCard
                title="Total Pencairan"
                value={loading ? '...' : formatRupiah(stats.totalPencairanPeriode)}
                helper={`Total periode ${periodeBulan}`}
                tone="indigo"
                icon="money"
              />
            </section>

            <section className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1.06fr]">
              <DisbursementChart data={disbursementData} loading={loading} />
              <EmployeeLimitTable data={employeeLimitRows} loading={loading} />
            </section>

            <WorkDistributionSection
              mitraList={mitraForDistribution}
              assignments={workDistributionAssignments}
              tahunAktif={tahunAktif}
              loading={loading}
            />
          </div>
        </main>
      </div>
    </div>
  );
}