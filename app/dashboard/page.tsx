'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import StatsCard from '@/components/dashboard/StatsCard';
import DisbursementChart, { DisbursementDataPoint } from '@/components/dashboard/DisbursementChart';
import EmployeeLimitTable, { EmployeeLimitRow, StatusLimit } from '@/components/dashboard/EmployeeLimitTable';

// =========================================================
// SUPABASE
// =========================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// =========================================================
// CONSTANT
// (disamakan dengan halaman Penugasan - limit_honor keyed by bulan_periode,
//  pencairan dibaca dari penugasan.jumlah_dicairkan)
// =========================================================

const DEFAULT_LIMIT = 3000000;

const DEFAULT_PERIODE = 'Agustus 2026';

const BULAN_URUTAN: Record<string, number> = {
  januari: 1,
  februari: 2,
  maret: 3,
  april: 4,
  mei: 5,
  juni: 6,
  juli: 7,
  agustus: 8,
  september: 9,
  oktober: 10,
  november: 11,
  desember: 12,
};

/** Parse "Agustus 2026" -> sortable number 202608. Return 0 kalau gagal parse. */
function periodeToSortKey(periode: string): number {
  const parts = periode.trim().toLowerCase().split(/\s+/);
  if (parts.length < 2) return 0;
  const bulan = BULAN_URUTAN[parts[0]] || 0;
  const tahun = parseInt(parts[1], 10) || 0;
  return tahun * 100 + bulan;
}

// =========================================================
// INTERFACE
// =========================================================

interface MitraRow {
  sobat_id: string;
  nama_mitra: string;
}

interface PenugasanRow {
  sobat_id: string;
  total_honor: number | null;
  jumlah_dicairkan: number | null;
  kegiatan?: {
    bulan_kegiatan: string;
  };
}

interface LimitHonorRow {
  bulan_periode: string;
  batas_maksimal: number;
  persen_peringatan: number;
}

// =========================================================
// PAGE
// =========================================================

export default function DashboardPage() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [periodeBulan, setPeriodeBulan] = useState<string>(DEFAULT_PERIODE);
  const [periodeOptions, setPeriodeOptions] = useState<string[]>([]);

  const [mitraList, setMitraList] = useState<MitraRow[]>([]);
  const [penugasanList, setPenugasanList] = useState<PenugasanRow[]>([]);
  const [limitByPeriode, setLimitByPeriode] = useState<Record<string, LimitHonorRow>>({});
  const [loading, setLoading] = useState<boolean>(true);

  /* ============================================
     FETCH DATA (mitra, penugasan+kegiatan, limit_honor)
  ============================================ */
  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: mitraData, error: mitraErr } = await supabase
        .from('mitra')
        .select('sobat_id, nama_mitra');
      if (mitraErr) throw mitraErr;
      setMitraList(mitraData || []);

      const { data: penugasanData, error: penugasanErr } = await supabase.from('penugasan').select(`
          sobat_id,
          total_honor,
          jumlah_dicairkan,
          kegiatan:kegiatan_id (
            bulan_kegiatan
          )
        `);
      if (penugasanErr) throw penugasanErr;
      setPenugasanList((penugasanData as any) || []);

      const { data: limitData, error: limitErr } = await supabase
        .from('limit_honor')
        .select('bulan_periode, batas_maksimal, persen_peringatan');

      if (limitErr) {
        console.error('Error fetch limit_honor:', limitErr);
      }

      const map: Record<string, LimitHonorRow> = {};
      (limitData || []).forEach((row: LimitHonorRow) => {
        if (row.bulan_periode) {
          map[String(row.bulan_periode).trim()] = row;
        }
      });
      setLimitByPeriode(map);

      // Periode dashboard diambil dari DATA AKTUAL, bukan hard-code.
      // Sumber periode:
      // 1. kegiatan.bulan_kegiatan melalui penugasan
      // 2. limit_honor.bulan_periode
      //
      // Dengan demikian Januari, Februari, dst. akan ikut muncul
      // selama memang terdapat datanya.
      const periodeSet = new Set<string>();

      (penugasanData || []).forEach((item: any) => {
        const periode = item?.kegiatan?.bulan_kegiatan;
        if (periode) periodeSet.add(String(periode).trim());
      });

      (limitData || []).forEach((row: LimitHonorRow) => {
        if (row.bulan_periode) {
          periodeSet.add(String(row.bulan_periode).trim());
        }
      });

      const dynamicPeriodeOptions = Array.from(periodeSet).sort(
        (a, b) => periodeToSortKey(a) - periodeToSortKey(b)
      );

      setPeriodeOptions(dynamicPeriodeOptions);

      // Pertahankan Agustus 2026 jika ada. Jika tidak ada, gunakan
      // periode terbaru yang tersedia.
      setPeriodeBulan((current) => {
        if (dynamicPeriodeOptions.includes(current)) {
          return current;
        }

        if (dynamicPeriodeOptions.includes(DEFAULT_PERIODE)) {
          return DEFAULT_PERIODE;
        }

        return dynamicPeriodeOptions[dynamicPeriodeOptions.length - 1] || current;
      });
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
     AKUMULASI HONOR & PENCAIRAN PER MITRA PER PERIODE
     (pola sama seperti halaman Penugasan)
  ============================================ */
  const accumulatedBySobatPeriode = useMemo(() => {
    const map: Record<string, { totalHonor: number; totalDicairkan: number }> = {};
    penugasanList.forEach((item) => {
      const periode = item.kegiatan?.bulan_kegiatan || '';
      const key = `${item.sobat_id}__${periode}`;
      if (!map[key]) map[key] = { totalHonor: 0, totalDicairkan: 0 };
      map[key].totalHonor += Number(item.total_honor) || 0;
      map[key].totalDicairkan += Number(item.jumlah_dicairkan) || 0;
    });
    return map;
  }, [penugasanList]);

  const getLimitForPeriode = useCallback(
    (periode: string) => {
      const normalized = String(periode || '').trim().toLowerCase();

      const info =
        limitByPeriode[periode] ||
        Object.values(limitByPeriode).find(
          (row) =>
            String(row.bulan_periode || '').trim().toLowerCase() === normalized
        );

      return {
        maxLimit: info?.batas_maksimal ?? DEFAULT_LIMIT,
        warnPercent: info?.persen_peringatan ?? 80,
      };
    },
    [limitByPeriode]
  );

  /* ============================================
     STATS: Total Pegawai, Sudah Limit, Masih Tersedia,
     Total Pencairan (untuk periode terpilih)
  ============================================ */
  const stats = useMemo(() => {
    const { maxLimit } = getLimitForPeriode(periodeBulan);

    let sudahLimit = 0;
    let totalPencairanPeriode = 0;

    mitraList.forEach((mitra) => {
      const acc =
        accumulatedBySobatPeriode[
          `${mitra.sobat_id}__${periodeBulan}`
        ];

      if (!acc) return;

      const totalHonor = acc.totalHonor || 0;

      if (totalHonor >= maxLimit && totalHonor > 0) {
        sudahLimit += 1;
      }

      totalPencairanPeriode +=
        acc.totalDicairkan || 0;
    });

    // Total pegawai pada dashboard mengikuti periode terpilih:
    // hanya mitra yang mempunyai penugasan pada periode tersebut.
    const mitraPeriode = new Set<string>();

    penugasanList.forEach((item) => {
      const periode = item.kegiatan?.bulan_kegiatan || '';
      if (periode === periodeBulan && item.sobat_id) {
        mitraPeriode.add(item.sobat_id);
      }
    });

    const totalPegawai = mitraPeriode.size;
    const masihTersedia = Math.max(totalPegawai - sudahLimit, 0);

    return {
      totalPegawai,
      sudahLimit,
      masihTersedia,
      totalPencairanPeriode,
      persenSudahLimit: totalPegawai > 0 ? Math.round((sudahLimit / totalPegawai) * 1000) / 10 : 0,
      persenTersedia: totalPegawai > 0 ? Math.round((masihTersedia / totalPegawai) * 1000) / 10 : 0,
    };
  }, [mitraList, accumulatedBySobatPeriode, periodeBulan, getLimitForPeriode]);

  /* ============================================
     GRAFIK PENCAIRAN
     Menampilkan 6 periode terakhir yang memang ada di data.
     Statistik kartu dan tabel tetap mengikuti periode dropdown.
  ============================================ */
  const disbursementData: DisbursementDataPoint[] = useMemo(() => {
    const totalPerPeriode: Record<string, number> = {};

    penugasanList.forEach((item) => {
      const periode = item.kegiatan?.bulan_kegiatan;
      if (!periode) return;
      totalPerPeriode[periode] = (totalPerPeriode[periode] || 0) + (Number(item.jumlah_dicairkan) || 0);
    });

    const periodeList = Object.keys(totalPerPeriode).sort(
      (a, b) => periodeToSortKey(a) - periodeToSortKey(b)
    );

    const last6 = periodeList.slice(-6);

    return last6.map((periode) => ({
      periode,
      total: totalPerPeriode[periode],
    }));
  }, [penugasanList]);

  /* ============================================
     TABEL PEGAWAI MENDEKATI/SUDAH LIMIT (periode terpilih)
  ============================================ */
  const employeeLimitRows: EmployeeLimitRow[] = useMemo(() => {
    const { maxLimit, warnPercent } = getLimitForPeriode(periodeBulan);

    const rows: EmployeeLimitRow[] = [];

    mitraList.forEach((mitra) => {
      const acc = accumulatedBySobatPeriode[`${mitra.sobat_id}__${periodeBulan}`];
      const terpakai = acc?.totalHonor || 0;
      if (terpakai <= 0 || maxLimit <= 0) return;

      const usageRatio = (terpakai / maxLimit) * 100;
      if (usageRatio < warnPercent) return; // hanya tampilkan yang mendekati/sudah limit

      const status: StatusLimit = usageRatio >= 100 ? 'Limit Terlampaui' : 'Mendekati Limit';

      rows.push({
        sobatId: mitra.sobat_id,
        namaMitra: mitra.nama_mitra,
        terpakai,
        limit: maxLimit,
        presentase: Math.round(usageRatio),
        status,
      });
    });

    return rows.sort((a, b) => b.presentase - a.presentase);
  }, [mitraList, accumulatedBySobatPeriode, periodeBulan, getLimitForPeriode]);

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
                title="Total Pegawai"
                value={loading ? '...' : String(stats.totalPegawai)}
                helper="Pegawai aktif"
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
          </div>
        </main>
      </div>
    </div>
  );
}
