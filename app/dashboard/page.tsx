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
// PARSER PERIODE KEGIATAN MULTI-BULAN
// =========================================================
// kegiatan.bulan_kegiatan bisa berisi rentang dengan kata sambung apa saja
// (mis. "Agustus 2026 - Oktober 2026", "Agustus 2026 s.d. Oktober 2026 (3
// Bulan)", dst). Sebelumnya dashboard memakai teks itu APA ADANYA sebagai
// "periode" untuk mengelompokkan mitra — akibatnya kegiatan 1 bulan dan
// kegiatan 3 bulan yang sama-sama mencakup Agustus dianggap DUA PERIODE
// TERPISAH yang tidak pernah digabung, sehingga limit gabungannya tidak
// pernah terdeteksi tercapai.
//
// Parser ini mengurai teks itu jadi daftar BULAN KALENDER individual
// ("Agustus 2026", "September 2026", dst) dengan mencari semua pasangan
// "NamaBulan Tahun" di dalam teks, apa pun kata penghubungnya.

const NAMA_BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

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

// Mencocokkan sebuah label bulan kalender (mis. "Agustus 2026") dengan
// format "YYYY-MM" dari limit_honor.bulan_periode (mis. "2026-08").
const BULAN_MAP: Record<string, string> = {
  '01': 'januari', '02': 'februari', '03': 'maret', '04': 'april',
  '05': 'mei', '06': 'juni', '07': 'juli', '08': 'agustus',
  '09': 'september', '10': 'oktober', '11': 'november', '12': 'desember',
};

function isMatchingMonth(calendarLabel: string | null | undefined, filterYYYYMM: string): boolean {
  if (!calendarLabel) return false;
  if (!filterYYYYMM) return true;

  const val = String(calendarLabel).trim().toLowerCase();
  const [year, monthNum] = filterYYYYMM.split('-');
  const monthName = BULAN_MAP[monthNum] || '';

  return val.includes(monthName) && val.includes(year);
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
  // Disimpan sebagai array (bukan Record dengan exact-key) supaya bisa
  // dicocokkan secara fleksibel via isMatchingMonth — sama seperti halaman
  // Penugasan/Laporan yang sudah dibetulkan. Key persis ke bulan_periode
  // ("2026-08") HAMPIR TIDAK PERNAH sama dengan label kalender ("Agustus
  // 2026"), jadi kalau tetap Record, limit akan selalu jatuh ke DEFAULT_LIMIT.
  const [limitList, setLimitList] = useState<LimitHonorRow[]>([]);
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

      setLimitList(limitData || []);

      // Periode dashboard diambil dari DATA AKTUAL, bukan hard-code, dan
      // sekarang berupa BULAN KALENDER ("Agustus 2026") hasil pengurain
      // kegiatan.bulan_kegiatan (bisa multi-bulan) + limit_honor.bulan_periode
      // (format "YYYY-MM" dikonversi ke label kalender yang sama). Dengan
      // begitu satu kegiatan yang membentang 3 bulan akan muncul sebagai 3
      // opsi bulan terpisah, bukan 1 opsi rentang yang aneh.
      const periodeSet = new Set<string>();

      (penugasanData || []).forEach((item: any) => {
        const raw = item?.kegiatan?.bulan_kegiatan;
        if (!raw) return;
        parseBulanKegiatan(String(raw)).months.forEach((bulan) => periodeSet.add(bulan));
      });

      (limitData || []).forEach((row: LimitHonorRow) => {
        const raw = String(row.bulan_periode || '').trim();
        const [tahun, bulanNum] = raw.split('-');
        const idx = parseInt(bulanNum, 10) - 1;
        if (tahun && idx >= 0 && idx < 12) {
          periodeSet.add(`${NAMA_BULAN_ID[idx]} ${tahun}`);
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
     AKUMULASI HONOR & PENCAIRAN PER MITRA PER BULAN KALENDER
     Honor kegiatan dibagi rata ke setiap bulan yang dicakupnya (kegiatan 3
     bulan dengan honor 900.000 -> 300.000/bulan), lalu dijumlah per mitra
     per bulan kalender — supaya kegiatan 1-bulan dan kegiatan multi-bulan
     yang sama-sama menyentuh bulan yang sama IKUT TERGABUNG, bukan dianggap
     "periode" yang terpisah.
  ============================================ */
  const accumulatedBySobatPeriode = useMemo(() => {
    const map: Record<string, { totalHonor: number; totalDicairkan: number }> = {};
    penugasanList.forEach((item) => {
      if (!item.sobat_id) return;
      const { months, jumlahBulan } = parseBulanKegiatan(item.kegiatan?.bulan_kegiatan);
      if (months.length === 0) return;

      const honorPerBulan = (Number(item.total_honor) || 0) / jumlahBulan;
      const dicairkanPerBulan = (Number(item.jumlah_dicairkan) || 0) / jumlahBulan;

      months.forEach((bulan) => {
        const key = `${item.sobat_id}__${bulan}`;
        if (!map[key]) map[key] = { totalHonor: 0, totalDicairkan: 0 };
        map[key].totalHonor += honorPerBulan;
        map[key].totalDicairkan += dicairkanPerBulan;
      });
    });
    return map;
  }, [penugasanList]);

  const getLimitForPeriode = useCallback(
    (bulan: string) => {
      const info = limitList.find((row) => isMatchingMonth(bulan, row.bulan_periode));

      return {
        maxLimit: info?.batas_maksimal ?? DEFAULT_LIMIT,
        warnPercent: info?.persen_peringatan ?? 80,
      };
    },
    [limitList]
  );

  /* ============================================
     STATS: Total Mitra, Sudah Limit, Masih Tersedia,
     Total Pencairan (untuk periode terpilih)
  ============================================ */
  const stats = useMemo(() => {
    const { maxLimit } = getLimitForPeriode(periodeBulan);

    // Total mitra pada dashboard mengikuti periode terpilih: hanya mitra
    // yang kegiatannya MENCAKUP bulan tsb (bukan exact-match teks penuh),
    // supaya kegiatan multi-bulan ikut terhitung di setiap bulan yang
    // dilaluinya.
    const mitraPeriode = new Set<string>();
    penugasanList.forEach((item) => {
      if (!item.sobat_id) return;
      const { months } = parseBulanKegiatan(item.kegiatan?.bulan_kegiatan);
      if (months.includes(periodeBulan)) {
        mitraPeriode.add(item.sobat_id);
      }
    });

    let sudahLimit = 0;
    let totalPencairanPeriode = 0;

    mitraPeriode.forEach((sobatId) => {
      const acc = accumulatedBySobatPeriode[`${sobatId}__${periodeBulan}`];
      if (!acc) return;

      const totalHonor = acc.totalHonor || 0;
      if (totalHonor >= maxLimit && totalHonor > 0) {
        sudahLimit += 1;
      }

      totalPencairanPeriode += acc.totalDicairkan || 0;
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
  }, [accumulatedBySobatPeriode, penugasanList, periodeBulan, getLimitForPeriode]);

  /* ============================================
     GRAFIK PENCAIRAN
     Menampilkan 6 bulan kalender terakhir yang memang ada di data.
     Statistik kartu dan tabel tetap mengikuti periode dropdown.
  ============================================ */
  const disbursementData: DisbursementDataPoint[] = useMemo(() => {
    const totalPerPeriode: Record<string, number> = {};

    penugasanList.forEach((item) => {
      const { months, jumlahBulan } = parseBulanKegiatan(item.kegiatan?.bulan_kegiatan);
      if (months.length === 0) return;
      const dicairkanPerBulan = (Number(item.jumlah_dicairkan) || 0) / jumlahBulan;
      months.forEach((bulan) => {
        totalPerPeriode[bulan] = (totalPerPeriode[bulan] || 0) + dicairkanPerBulan;
      });
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
          </div>
        </main>
      </div>
    </div>
  );
}