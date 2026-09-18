'use client';

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { createClient } from '@supabase/supabase-js';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { logActivity } from '@/lib/logActivity';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || '';

const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

const supabase = createClient(
  supabaseUrl,
  supabaseKey
);

// =====================================================
// INTERFACE
// =====================================================

interface LimitHonor {
  id: number;
  bulan_periode: string;
  batas_maksimal: number;
  persen_peringatan: number;
}

interface RincianKegiatan {
  namaKegiatan: string;
  honorBulanIni: number;
  totalHonorKegiatan: number;
  jumlahBulanKegiatan: number;
}

interface MitraLimitRow {
  sobat_id: string;
  nama_mitra: string;
  alokasi: number;
  dicairkan: number;
  sisa: number;
  persen_terpakai: number;
  status:
    | 'aman'
    | 'peringatan'
    | 'mencapai'
    | 'melebihi';
  rincianKegiatan: RincianKegiatan[];
}

interface KegiatanTahunRow {
  bulan_kegiatan: string | null;
}

// =====================================================
// BULAN
// =====================================================

const BULAN_OPTIONS = [
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

// =====================================================
// PARSER PERIODE KEGIATAN MULTI-BULAN
// =====================================================

const monthIndexFromName = (
  name: string
): number => {
  return NAMA_BULAN_ID.findIndex(
    (m) =>
      m.toLowerCase() ===
      name.trim().toLowerCase()
  );
};

const generateMonthSequence = (
  startMonthIdx: number,
  startYear: number,
  count: number
): string[] => {
  const result: string[] = [];

  let idx = startMonthIdx;
  let year = startYear;

  for (let i = 0; i < count; i++) {
    result.push(
      `${NAMA_BULAN_ID[idx]} ${year}`
    );

    idx++;

    if (idx > 11) {
      idx = 0;
      year++;
    }
  }

  return result;
};

const MONTH_YEAR_REGEX =
  /([A-Za-zÀ-ÿ]+)\s+(\d{4})/g;

interface PeriodeKegiatan {
  months: string[];
  jumlahBulan: number;
}

function parseBulanKegiatan(
  raw: string | null | undefined
): PeriodeKegiatan {
  const text = (raw || '').trim();

  if (!text) {
    return {
      months: [],
      jumlahBulan: 0,
    };
  }

  const matches = [
    ...text.matchAll(MONTH_YEAR_REGEX),
  ]
    .map((m) => ({
      idx: monthIndexFromName(m[1]),
      year: parseInt(m[2], 10),
    }))
    .filter((m) => m.idx !== -1);

  // Contoh:
  // Januari 2026 - Maret 2026
  if (matches.length >= 2) {
    const start = matches[0];
    const end =
      matches[matches.length - 1];

    const totalBulan =
      (end.year - start.year) * 12 +
      (end.idx - start.idx) +
      1;

    if (
      totalBulan > 0 &&
      totalBulan <= 36
    ) {
      return {
        months: generateMonthSequence(
          start.idx,
          start.year,
          totalBulan
        ),
        jumlahBulan: totalBulan,
      };
    }
  }

  // Contoh:
  // Januari 2026
  // Januari 2026 (3 bulan)
  if (matches.length === 1) {
    const bulanCountMatch =
      text.match(
        /\(?\s*(\d+)\s*bulan\s*\)?/i
      );

    const jumlah =
      bulanCountMatch
        ? Math.max(
            parseInt(
              bulanCountMatch[1],
              10
            ) || 1,
            1
          )
        : 1;

    return {
      months: generateMonthSequence(
        matches[0].idx,
        matches[0].year,
        jumlah
      ),
      jumlahBulan: jumlah,
    };
  }

  return {
    months: [text],
    jumlahBulan: 1,
  };
}

// =====================================================
// PAGE
// =====================================================

export default function PengaturanLimitPage() {
  const [
    mobileSidebarOpen,
    setMobileSidebarOpen,
  ] = useState(false);

  // =====================================================
  // STATE BULAN & TAHUN
  // =====================================================

  const [
    selectedBulanNama,
    setSelectedBulanNama,
  ] = useState<string>(
    BULAN_OPTIONS[
      new Date().getMonth()
    ]
  );

  const [
    selectedTahun,
    setSelectedTahun,
  ] = useState<string>(
    new Date()
      .getFullYear()
      .toString()
  );

  const selectedBulanPeriode =
    `${selectedBulanNama} ${selectedTahun}`;

  const [
    tahunList,
    setTahunList,
  ] = useState<string[]>([
    new Date()
      .getFullYear()
      .toString(),
  ]);

  // =====================================================
  // DATA LIMIT & REKAP
  // =====================================================

  const [
    limitInfo,
    setLimitInfo,
  ] = useState<LimitHonor | null>(null);

  const [
    loadingLimit,
    setLoadingLimit,
  ] = useState<boolean>(false);

  const [
    mitraRows,
    setMitraRows,
  ] = useState<MitraLimitRow[]>([]);

  const [
    loadingRows,
    setLoadingRows,
  ] = useState<boolean>(false);

  // =====================================================
  // FILTER & PAGINATION
  // =====================================================

  const [
    searchKeyword,
    setSearchKeyword,
  ] = useState<string>('');

  const [
    statusFilter,
    setStatusFilter,
  ] = useState<string>(
    'Semua Status'
  );

  const [
    currentPage,
    setCurrentPage,
  ] = useState<number>(1);

  const itemsPerPage = 10;

  // =====================================================
  // MODAL LIMIT
  // =====================================================

  const [
    isModalOpen,
    setIsModalOpen,
  ] = useState<boolean>(false);

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState<boolean>(false);

  const [
    formData,
    setFormData,
  ] = useState({
    batas_maksimal_str: '3.000.000',
    persen_peringatan: 80,
  });

  // =====================================================
  // FORMAT RUPIAH
  // =====================================================

  const formatRupiah = (
    val: number
  ): string => {
    return new Intl.NumberFormat(
      'id-ID',
      {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
      }
    ).format(val);
  };

  // =====================================================
  // FORMAT INPUT ANGKA
  // =====================================================

  const formatNumberInput = (
    val: string
  ): string => {
    const numbers =
      val.replace(/\D/g, '');

    if (!numbers) return '';

    return new Intl.NumberFormat(
      'id-ID'
    ).format(Number(numbers));
  };

  // =====================================================
  // PARSE INPUT ANGKA
  // =====================================================

  const parseNumberInput = (
    val: string
  ): number => {
    const numbers =
      val.replace(/\D/g, '');

    return numbers
      ? Number(numbers)
      : 0;
  };

  // =====================================================
  // 1. FETCH DAFTAR TAHUN
  // =====================================================

  const fetchTahunOptions =
    useCallback(async () => {
      try {
        const {
          data,
          error,
        } = await supabase
          .from('kegiatan')
          .select(
            'bulan_kegiatan'
          );

        if (error) {
          throw error;
        }

        const yearsSet =
          new Set<string>();

        // Selalu tampilkan tahun berjalan
        yearsSet.add(
          new Date()
            .getFullYear()
            .toString()
        );

        (
          data ?? []
        ).forEach(
          (
            item: KegiatanTahunRow
          ) => {
            if (
              !item.bulan_kegiatan
            ) {
              return;
            }

            const matchYear:
              | string[]
              | null =
              item.bulan_kegiatan.match(
                /\b20\d{2}\b/g
              );

            if (!matchYear) {
              return;
            }

            matchYear.forEach(
              (y: string) => {
                yearsSet.add(y);
              }
            );
          }
        );

        const sortedYears =
          Array.from(
            yearsSet
          ).sort(
            (
              a,
              b
            ) =>
              Number(b) -
              Number(a)
          );

        setTahunList(
          sortedYears
        );
      } catch (err) {
        console.error(
          'Error fetching tahun options:',
          err
        );
      }
    }, []);

  useEffect(() => {
    fetchTahunOptions();
  }, [fetchTahunOptions]);

  // =====================================================
  // 2. FETCH LIMIT BERDASARKAN BULAN PERIODE
  // =====================================================

  const fetchLimitInfo =
    useCallback(async () => {
      if (
        !selectedBulanPeriode
      ) {
        return;
      }

      setLoadingLimit(true);

      try {
        const {
          data,
          error,
        } = await supabase
          .from(
            'limit_honor'
          )
          .select(
            `
              id,
              bulan_periode,
              batas_maksimal,
              persen_peringatan
            `
          )
          .eq(
            'bulan_periode',
            selectedBulanPeriode
          )
          .maybeSingle();

        if (error) {
          throw error;
        }

        setLimitInfo(
          data || null
        );
      } catch (err: unknown) {
        console.error(
          'Error fetching limit_honor:',
          err
        );

        setLimitInfo(null);
      } finally {
        setLoadingLimit(false);
      }
    }, [
      selectedBulanPeriode,
    ]);

  useEffect(() => {
    fetchLimitInfo();
  }, [fetchLimitInfo]);

  // =====================================================
  // 3. FETCH DATA MITRA & AKUMULASI PER BULAN
  // =====================================================

  const fetchMitraRows =
    useCallback(async () => {
      if (
        !selectedBulanPeriode
      ) {
        setMitraRows([]);
        return;
      }

      setLoadingRows(true);

      try {
        const batasMaksimal =
          Number(
            limitInfo?.batas_maksimal ||
              0
          );

        const persenPeringatan =
          Number(
            limitInfo?.persen_peringatan ||
              80
          );

        const normalizePeriode = (
          value: unknown
        ): string =>
          String(value || '')
            .trim()
            .replace(
              /\s+/g,
              ' '
            )
            .toLowerCase();

        const periodeAktif =
          normalizePeriode(
            selectedBulanPeriode
          );

        // =================================================
        // FETCH PENUGASAN
        // =================================================

        const {
          data: penugasanData,
          error: errPenugasan,
        } = await supabase
          .from('penugasan')
          .select(
            `
              id,
              sobat_id,
              total_honor,
              jumlah_dicairkan,
              kegiatan!inner (
                id,
                nama_kegiatan,
                bulan_kegiatan
              ),
              mitra!inner (
                sobat_id,
                nama_mitra
              )
            `
          );

        if (errPenugasan) {
          throw errPenugasan;
        }

        // =================================================
        // AMBIL ID PENUGASAN
        // =================================================

        const penugasanIds =
          (
            penugasanData || []
          )
            .map(
              (
                item: any
              ) => item.id
            )
            .filter(
              Boolean
            );

        // =================================================
        // FETCH PENCAIRAN
        // =================================================

        const {
          data: pencairanData,
          error: errPencairan,
        } =
          penugasanIds.length
            ? await supabase
                .from(
                  'pencairan_honor'
                )
                .select(
                  `
                    id,
                    penugasan_id,
                    sobat_id,
                    bulan_pencairan,
                    nominal_rencana,
                    nominal_dicairkan,
                    tgl_pencairan
                  `
                )
                .in(
                  'penugasan_id',
                  penugasanIds
                )
            : {
                data: [],
                error: null,
              };

        if (errPencairan) {
          throw errPencairan;
        }

        // =================================================
        // MAP PENCAIRAN
        // =================================================

        const pencairanMap: Record<
          string,
          {
            rencana: number;
            realisasi: number;
          }
        > = {};

        (
          pencairanData || []
        ).forEach(
          (row: any) => {
            if (
              normalizePeriode(
                row.bulan_pencairan
              ) !==
              periodeAktif
            ) {
              return;
            }

            const key =
              String(
                row.penugasan_id
              );

            if (
              !pencairanMap[key]
            ) {
              pencairanMap[
                key
              ] = {
                rencana: 0,
                realisasi: 0,
              };
            }

            pencairanMap[
              key
            ].rencana +=
              Number(
                row.nominal_rencana
              ) || 0;

            pencairanMap[
              key
            ].realisasi +=
              Number(
                row.nominal_dicairkan
              ) || 0;
          }
        );

        // =================================================
        // MAP ALOKASI MITRA
        // =================================================

        const alokasiMap: Record<
          string,
          {
            nama_mitra: string;
            total: number;
            dicairkan: number;
            rincian: RincianKegiatan[];
          }
        > = {};

        (
          penugasanData || []
        ).forEach(
          (item: any) => {
            const dataMitra =
              Array.isArray(
                item.mitra
              )
                ? item.mitra[0]
                : item.mitra;

            const dataKegiatan =
              Array.isArray(
                item.kegiatan
              )
                ? item.kegiatan[0]
                : item.kegiatan;

            const sobatId =
              dataMitra?.sobat_id ||
              item.sobat_id;

            const namaMitra =
              dataMitra?.nama_mitra ||
              'Tanpa Nama';

            if (!sobatId) {
              return;
            }

            // =============================================
            // PARSE PERIODE KEGIATAN
            // =============================================

            const periodeInfo =
              parseBulanKegiatan(
                dataKegiatan?.bulan_kegiatan
              );

            const masukBulanIni =
              periodeInfo.months.some(
                (
                  bulan: string
                ) =>
                  normalizePeriode(
                    bulan
                  ) ===
                  periodeAktif
              );

            const pencairanBulanIni =
              pencairanMap[
                String(
                  item.id
                )
              ];

            if (
              !masukBulanIni &&
              !pencairanBulanIni
            ) {
              return;
            }

            // =============================================
            // HITUNG JUMLAH BULAN
            // =============================================

            const jumlahBulan =
              periodeInfo.jumlahBulan ||
              1;

            const totalHonorKegiatan =
              Number(
                item.total_honor
              ) || 0;

            const totalDicairkanKegiatan =
              Number(
                item.jumlah_dicairkan
              ) || 0;

            // =============================================
            // HITUNG HONOR BULAN INI
            // =============================================

            const honorBulanIni =
              pencairanBulanIni
                ? pencairanBulanIni.rencana
                : totalHonorKegiatan /
                  jumlahBulan;

            const dicairkanBulanIni =
              pencairanBulanIni
                ? pencairanBulanIni.realisasi
                : totalDicairkanKegiatan /
                  jumlahBulan;

            if (
              honorBulanIni === 0 &&
              dicairkanBulanIni === 0
            ) {
              return;
            }

            // =============================================
            // BUAT MAP MITRA
            // =============================================

            if (
              !alokasiMap[
                sobatId
              ]
            ) {
              alokasiMap[
                sobatId
              ] = {
                nama_mitra:
                  namaMitra,
                total: 0,
                dicairkan: 0,
                rincian: [],
              };
            }

            alokasiMap[
              sobatId
            ].total +=
              honorBulanIni;

            alokasiMap[
              sobatId
            ].dicairkan +=
              dicairkanBulanIni;

            alokasiMap[
              sobatId
            ].rincian.push({
              namaKegiatan:
                dataKegiatan?.nama_kegiatan ||
                '-',
              honorBulanIni,
              totalHonorKegiatan,
              jumlahBulanKegiatan:
                jumlahBulan,
            });
          }
        );

        // =================================================
        // BENTUK ROW TABEL
        // =================================================

        const rows: MitraLimitRow[] =
          Object.entries(
            alokasiMap
          ).map(
            ([
              sobatId,
              data,
            ]) => {
              const persenTerpakai =
                batasMaksimal >
                0
                  ? (data.total /
                      batasMaksimal) *
                    100
                  : 0;

              let status:
                MitraLimitRow['status'] =
                'aman';

              if (
                batasMaksimal >
                0
              ) {
                if (
                  data.total >
                  batasMaksimal
                ) {
                  status =
                    'melebihi';
                } else if (
                  data.total >=
                  batasMaksimal
                ) {
                  status =
                    'mencapai';
                } else if (
                  persenTerpakai >=
                  persenPeringatan
                ) {
                  status =
                    'peringatan';
                }
              }

              return {
                sobat_id:
                  sobatId,
                nama_mitra:
                  data.nama_mitra,
                alokasi:
                  data.total,
                dicairkan:
                  data.dicairkan,
                sisa:
                  batasMaksimal -
                  data.total,
                persen_terpakai:
                  persenTerpakai,
                status,
                rincianKegiatan:
                  data.rincian,
              };
            }
          );

        // Urutkan dari persentase penggunaan tertinggi
        rows.sort(
          (a, b) =>
            b.persen_terpakai -
            a.persen_terpakai
        );

        setMitraRows(
          rows
        );

        setCurrentPage(1);
      } catch (err: unknown) {
        console.error(
          'Error fetching akumulasi mitra rows:',
          err
        );

        setMitraRows([]);
      } finally {
        setLoadingRows(false);
      }
    }, [
      selectedBulanPeriode,
      limitInfo,
    ]);

  useEffect(() => {
    fetchMitraRows();
  }, [fetchMitraRows]);

  // =====================================================
  // 4. FILTER & PAGINATION
  // =====================================================

  const filteredRows =
    useMemo(() => {
      return mitraRows.filter(
        (row) => {
          const keyword =
            searchKeyword
              .toLowerCase();

          const matchSearch =
            !keyword ||
            row.nama_mitra
              .toLowerCase()
              .includes(
                keyword
              ) ||
            row.sobat_id
              .toLowerCase()
              .includes(
                keyword
              );

          const matchStatus =
            statusFilter ===
              'Semua Status' ||
            (statusFilter ===
              'Aman' &&
              row.status ===
                'aman') ||
            (statusFilter ===
              'Mendekati Limit' &&
              row.status ===
                'peringatan') ||
            (statusFilter ===
              'Mencapai Limit' &&
              row.status ===
                'mencapai') ||
            (statusFilter ===
              'Melebihi Limit' &&
              row.status ===
                'melebihi');

          return (
            matchSearch &&
            matchStatus
          );
        }
      );
    }, [
      mitraRows,
      searchKeyword,
      statusFilter,
    ]);

  const totalItems =
    filteredRows.length;

  const totalPages =
    Math.ceil(
      totalItems /
        itemsPerPage
    ) || 1;

  const currentData =
    useMemo(() => {
      const start =
        (currentPage -
          1) *
        itemsPerPage;

      return filteredRows.slice(
        start,
        start +
          itemsPerPage
      );
    }, [
      filteredRows,
      currentPage,
    ]);

  const startItem =
    totalItems === 0
      ? 0
      : (currentPage - 1) *
          itemsPerPage +
        1;

  const endItem = Math.min(
    currentPage *
      itemsPerPage,
    totalItems
  );

  // =====================================================
  // RINGKASAN
  // =====================================================

  const totalMitra =
    mitraRows.length;

  const totalAlokasi =
    mitraRows.reduce(
      (acc, row) =>
        acc + row.alokasi,
      0
    );

  const totalDicairkan =
    mitraRows.reduce(
      (acc, row) =>
        acc + row.dicairkan,
      0
    );

  // =====================================================
  // 5. MODAL LIMIT
  // =====================================================

  const handleOpenLimitModal =
    () => {
      const currentBatas =
        limitInfo?.batas_maksimal ||
        3000000;

      setFormData({
        batas_maksimal_str:
          new Intl.NumberFormat(
            'id-ID'
          ).format(
            currentBatas
          ),
        persen_peringatan:
          limitInfo?.persen_peringatan ||
          80,
      });

      setIsModalOpen(true);
    };

  // =====================================================
  // 6. SIMPAN LIMIT
  // =====================================================

  const handleSaveLimit =
    async (
      e: React.FormEvent
    ) => {
      e.preventDefault();

      if (
        !selectedBulanPeriode
      ) {
        return;
      }

      const numericBatas =
        parseNumberInput(
          formData.batas_maksimal_str
        );

      if (
        numericBatas <= 0
      ) {
        alert(
          'Batas maksimal harus lebih dari 0.'
        );
        return;
      }

      const persenPeringatan =
        Number(
          formData.persen_peringatan
        );

      if (
        persenPeringatan < 1 ||
        persenPeringatan > 100
      ) {
        alert(
          'Ambang peringatan harus antara 1 sampai 100 persen.'
        );
        return;
      }

      setIsSubmitting(true);

      try {
        // ===============================================
        // UPDATE
        // ===============================================

        if (limitInfo) {
          const {
            error,
          } = await supabase
            .from(
              'limit_honor'
            )
            .update({
              batas_maksimal:
                numericBatas,
              persen_peringatan:
                persenPeringatan,
            })
            .eq(
              'id',
              limitInfo.id
            );

          if (error) {
            throw error;
          }

          await logActivity({
            aksi: 'ubah',
            entitas:
              'limit_honor',
            deskripsi:
              `Mengubah limit honor bulan ${selectedBulanPeriode} menjadi ${formatRupiah(numericBatas)} (peringatan ${persenPeringatan}%)`,
            referensiId:
              limitInfo.id,
          });

          alert(
            `Limit honor bulan ${selectedBulanPeriode} berhasil diperbarui.`
          );
        }

        // ===============================================
        // INSERT
        // ===============================================

        else {
          const {
            data: inserted,
            error,
          } = await supabase
            .from(
              'limit_honor'
            )
            .insert([
              {
                bulan_periode:
                  selectedBulanPeriode,
                batas_maksimal:
                  numericBatas,
                persen_peringatan:
                  persenPeringatan,
              },
            ])
            .select(
              'id'
            )
            .single();

          if (error) {
            throw error;
          }

          await logActivity({
            aksi: 'tambah',
            entitas:
              'limit_honor',
            deskripsi:
              `Menetapkan limit honor bulan ${selectedBulanPeriode} sebesar ${formatRupiah(numericBatas)} (peringatan ${persenPeringatan}%)`,
            referensiId:
              inserted?.id ??
              null,
          });

          alert(
            `Limit honor bulan ${selectedBulanPeriode} berhasil ditetapkan.`
          );
        }

        setIsModalOpen(
          false
        );

        await fetchLimitInfo();
      } catch (err: unknown) {
        console.error(
          'Error saving limit_honor:',
          err
        );

        const message =
          err instanceof Error
            ? err.message
            : 'Terjadi kesalahan';

        alert(
          'Gagal menyimpan limit: ' +
            message
        );
      } finally {
        setIsSubmitting(
          false
        );
      }
    };

  // =====================================================
  // 7. STATUS BADGE
  // =====================================================

  const statusBadge = (
    status: MitraLimitRow['status']
  ) => {
    if (
      status ===
        'mencapai' ||
      status ===
        'melebihi'
    ) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          {status ===
          'melebihi'
            ? 'Melebihi Limit'
            : 'Mencapai Limit'}
        </span>
      );
    }

    if (
      status ===
      'peringatan'
    ) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          Mendekati Limit
        </span>
      );
    }

    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        Aman
      </span>
    );
  };

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans">
      <Sidebar
        mobileOpen={
          mobileSidebarOpen
        }
        onClose={() =>
          setMobileSidebarOpen(
            false
          )
        }
      />

      <div className="min-h-screen lg:pl-[230px]">
        <Header
          title="Pengaturan Limit Honor Mitra"
          onMenuClick={() =>
            setMobileSidebarOpen(
              true
            )
          }
        />

        <main className="p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1400px]">

            {/* ================================================= */}
            {/* JUDUL & FILTER BULAN */}
            {/* ================================================= */}

            <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
              <div>
                <h1 className="text-xl font-bold text-slate-800">
                  Akumulasi & Limit Honor Mitra (Bulanan)
                </h1>

                <p className="text-xs text-slate-500 mt-1">
                  Menampilkan total gabungan
                  honor mitra dari seluruh
                  kegiatan pada bulan spesifik
                  yang dipilih. Kegiatan yang
                  membentang beberapa bulan
                  otomatis dibagi rata per bulan.
                </p>
              </div>

              {/* DROPDOWN BULAN & TAHUN */}

              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-600">
                  Pilih Bulan:
                </label>

                <select
                  value={
                    selectedBulanNama
                  }
                  onChange={(e) => {
                    setSelectedBulanNama(
                      e.target.value
                    );
                    setCurrentPage(
                      1
                    );
                  }}
                  className="py-2 px-3 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-blue-500"
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

                <select
                  value={
                    selectedTahun
                  }
                  onChange={(e) => {
                    setSelectedTahun(
                      e.target.value
                    );
                    setCurrentPage(
                      1
                    );
                  }}
                  className="py-2 px-3 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-blue-500"
                >
                  {tahunList.map(
                    (thn) => (
                      <option
                        key={thn}
                        value={thn}
                      >
                        {thn}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>

            {/* ================================================= */}
            {/* KARTU RINGKASAN */}
            {/* ================================================= */}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">

              {/* JUMLAH MITRA */}

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-semibold text-slate-500 mb-3">
                  Jumlah Mitra Aktif
                </span>

                <span className="text-xl font-extrabold text-slate-800">
                  {totalMitra}
                </span>
              </div>

              {/* LIMIT */}

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-semibold text-slate-500 mb-3">
                  Limit SBM (
                  {
                    selectedBulanPeriode
                  }
                  )
                </span>

                <span className="text-xl font-extrabold text-slate-800">
                  {loadingLimit ? (
                    '...'
                  ) : limitInfo ? (
                    formatRupiah(
                      limitInfo.batas_maksimal
                    )
                  ) : (
                    <span className="text-base text-slate-400 italic font-normal">
                      Belum ditetapkan
                    </span>
                  )}
                </span>
              </div>

              {/* TOTAL ALOKASI */}

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-semibold text-slate-500 mb-3">
                  Total Akumulasi Alokasi
                </span>

                <span className="text-xl font-extrabold text-slate-800">
                  {formatRupiah(
                    totalAlokasi
                  )}
                </span>
              </div>

              {/* TOTAL DICAIRKAN */}

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-semibold text-slate-500 mb-3">
                  Total Dicairkan
                </span>

                <span className="text-xl font-extrabold text-emerald-500">
                  {formatRupiah(
                    totalDicairkan
                  )}
                </span>
              </div>
            </div>

            {/* ================================================= */}
            {/* TOMBOL ATUR LIMIT */}
            {/* ================================================= */}

            <div className="mb-6">
              <button
                onClick={
                  handleOpenLimitModal
                }
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition"
              >
                <span>
                  ⚙️
                </span>

                {limitInfo
                  ? `Ubah Limit Bulan (${selectedBulanPeriode})`
                  : `Tetapkan Limit Bulan (${selectedBulanPeriode})`}
              </button>
            </div>

            {/* ================================================= */}
            {/* FILTER */}
            {/* ================================================= */}

            <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 mb-4 flex flex-wrap gap-2.5 items-center justify-between">
              <div className="flex flex-wrap items-center gap-2">

                {/* SEARCH */}

                <div className="relative min-w-[240px]">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400 text-xs">
                    🔍
                  </span>

                  <input
                    type="text"
                    placeholder="Cari Mitra (Nama / SOBAT ID)"
                    value={
                      searchKeyword
                    }
                    onChange={(e) => {
                      setSearchKeyword(
                        e.target.value
                      );
                      setCurrentPage(
                        1
                      );
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
                    setCurrentPage(
                      1
                    );
                  }}
                  className="py-1.5 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400"
                >
                  <option value="Semua Status">
                    Semua Status
                  </option>

                  <option value="Aman">
                    Aman
                  </option>

                  <option value="Mendekati Limit">
                    Mendekati Limit
                  </option>

                  <option value="Mencapai Limit">
                    Mencapai Limit
                  </option>

                  <option value="Melebihi Limit">
                    Melebihi Limit
                  </option>
                </select>
              </div>
            </div>

            {/* ================================================= */}
            {/* TABEL DATA */}
            {/* ================================================= */}

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">

                  <thead className="bg-slate-50/50 border-b border-slate-200 font-bold text-slate-700">
                    <tr>
                      <th className="py-3.5 px-6 text-center w-16">
                        No
                      </th>

                      <th className="py-3.5 px-6">
                        SOBAT ID
                      </th>

                      <th className="py-3.5 px-6">
                        Nama Mitra
                      </th>

                      <th className="py-3.5 px-6">
                        Limit Bulanan
                      </th>

                      <th className="py-3.5 px-6">
                        Total Akumulasi Honor
                      </th>

                      <th className="py-3.5 px-6">
                        Dicairkan
                      </th>

                      <th className="py-3.5 px-6">
                        Sisa Limit Bulanan
                      </th>

                      <th className="py-3.5 px-6 text-center">
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">

                    {/* LOADING */}

                    {loadingRows ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="py-8 text-center text-slate-400"
                        >
                          Memuat data akumulasi
                          honor mitra bulan{' '}
                          {
                            selectedBulanPeriode
                          }
                          ...
                        </td>
                      </tr>
                    ) : currentData.length ===
                      0 ? (

                      /* EMPTY */

                      <tr>
                        <td
                          colSpan={8}
                          className="py-8 text-center text-slate-400"
                        >
                          Belum ada penugasan
                          mitra pada bulan{' '}
                          {
                            selectedBulanPeriode
                          }
                          .
                        </td>
                      </tr>
                    ) : (

                      /* DATA */

                      currentData.map(
                        (
                          item,
                          index
                        ) => (
                          <tr
                            key={
                              item.sobat_id ||
                              index
                            }
                            className={`hover:bg-slate-50/60 transition ${
                              item.status ===
                              'melebihi'
                                ? 'bg-rose-50/40'
                                : ''
                            }`}
                          >

                            {/* NO */}

                            <td className="py-4 px-6 text-center text-slate-400 font-medium">
                              {(currentPage -
                                1) *
                                itemsPerPage +
                                index +
                                1}
                            </td>

                            {/* SOBAT ID */}

                            <td className="py-4 px-6 font-semibold text-blue-600">
                              {
                                item.sobat_id
                              }
                            </td>

                            {/* NAMA */}

                            <td className="py-4 px-6 font-semibold text-slate-800">
                              {
                                item.nama_mitra
                              }
                            </td>

                            {/* LIMIT */}

                            <td className="py-4 px-6 text-slate-600 font-medium">
                              {limitInfo
                                ? formatRupiah(
                                    limitInfo.batas_maksimal
                                  )
                                : '-'}
                            </td>

                            {/* AKUMULASI */}

                            <td className="py-4 px-6 font-bold text-slate-800">
                              {formatRupiah(
                                item.alokasi
                              )}

                              {item
                                .rincianKegiatan
                                .length >
                                1 && (
                                <div className="text-[10px] font-normal text-slate-400 mt-0.5">
                                  gabungan{' '}
                                  {
                                    item
                                      .rincianKegiatan
                                      .length
                                  }{' '}
                                  kegiatan
                                </div>
                              )}

                              {item
                                .rincianKegiatan
                                .length ===
                                1 &&
                                item
                                  .rincianKegiatan[0]
                                  .jumlahBulanKegiatan >
                                  1 && (
                                  <div className="text-[10px] font-normal text-slate-400 mt-0.5">
                                    ≈{' '}
                                    {formatRupiah(
                                      item
                                        .rincianKegiatan[0]
                                        .honorBulanIni
                                    )}
                                    /bulan dari
                                    total{' '}
                                    {formatRupiah(
                                      item
                                        .rincianKegiatan[0]
                                        .totalHonorKegiatan
                                    )}{' '}
                                    (
                                    {
                                      item
                                        .rincianKegiatan[0]
                                        .jumlahBulanKegiatan
                                    }{' '}
                                    bln)
                                  </div>
                                )}
                            </td>

                            {/* DICAIRKAN */}

                            <td className="py-4 px-6 text-slate-600 font-medium">
                              {formatRupiah(
                                item.dicairkan
                              )}
                            </td>

                            {/* SISA */}

                            <td
                              className={`py-4 px-6 font-medium ${
                                item.sisa <=
                                0
                                  ? 'text-rose-600 font-semibold'
                                  : 'text-slate-600'
                              }`}
                            >
                              {limitInfo
                                ? formatRupiah(
                                    item.sisa
                                  )
                                : '-'}
                            </td>

                            {/* STATUS */}

                            <td className="py-4 px-6 text-center">
                              {statusBadge(
                                item.status
                              )}
                            </td>
                          </tr>
                        )
                      )
                    )}
                  </tbody>
                </table>
              </div>

              {/* ================================================= */}
              {/* PAGINATION */}
              {/* ================================================= */}

              {filteredRows.length >
                0 && (
                <div className="px-6 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-white">

                  <div className="text-xs text-slate-500">
                    Menampilkan{' '}
                    <span className="font-semibold text-slate-700">
                      {
                        startItem
                      }
                    </span>{' '}
                    -{' '}
                    <span className="font-semibold text-slate-700">
                      {
                        endItem
                      }
                    </span>{' '}
                    dari{' '}
                    <span className="font-semibold text-slate-700">
                      {
                        totalItems
                      }
                    </span>{' '}
                    mitra
                  </div>

                  <div className="flex items-center gap-1.5 text-xs">

                    {/* PREVIOUS */}

                    <button
                      onClick={() =>
                        setCurrentPage(
                          (
                            prev
                          ) =>
                            Math.max(
                              prev -
                                1,
                              1
                            )
                        )
                      }
                      disabled={
                        currentPage ===
                        1
                      }
                      className="px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      ‹
                    </button>

                    {/* PAGE NUMBER */}

                    {Array.from(
                      {
                        length:
                          totalPages,
                      },
                      (
                        _,
                        i
                      ) =>
                        i + 1
                    )
                      .filter(
                        (
                          page
                        ) =>
                          page ===
                            1 ||
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
                              idx -
                                1
                            ];

                          const showEllipsis =
                            prevPage &&
                            page -
                              prevPage >
                              1;

                          return (
                            <React.Fragment
                              key={
                                page
                              }
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
                                {
                                  page
                                }
                              </button>
                            </React.Fragment>
                          );
                        }
                      )}

                    {/* NEXT */}

                    <button
                      onClick={() =>
                        setCurrentPage(
                          (
                            prev
                          ) =>
                            Math.min(
                              prev +
                                1,
                              totalPages
                            )
                        )
                      }
                      disabled={
                        currentPage ===
                          totalPages ||
                        totalPages ===
                          0
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

      {/* ===================================================== */}
      {/* MODAL LIMIT BULANAN */}
      {/* ===================================================== */}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">

          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">

            {/* HEADER MODAL */}

            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm">
                {limitInfo
                  ? 'Ubah Limit Bulanan'
                  : 'Tetapkan Limit Bulanan'}
              </h3>

              <button
                onClick={() =>
                  setIsModalOpen(
                    false
                  )
                }
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>

            {/* FORM */}

            <form
              onSubmit={
                handleSaveLimit
              }
              className="p-6 space-y-4 text-xs"
            >

              {/* PERIODE */}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Periode Bulan
                </label>

                <input
                  type="text"
                  value={
                    selectedBulanPeriode
                  }
                  disabled
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-slate-600 font-semibold"
                />
              </div>

              {/* BATAS MAKSIMAL */}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Batas Maksimal Honor
                  Bulanan (Rp) *
                </label>

                <input
                  type="text"
                  value={
                    formData.batas_maksimal_str
                  }
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      batas_maksimal_str:
                        formatNumberInput(
                          e.target.value
                        ),
                    })
                  }
                  placeholder="Contoh: 3.000.000"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-medium"
                  required
                />

                <span className="text-[10px] text-slate-400 mt-1 block">
                  Ketik angka saja,
                  titik pemisah ribuan
                  akan ditambahkan
                  otomatis.
                </span>
              </div>

              {/* AMBANG PERINGATAN */}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Ambang Peringatan (%) *
                </label>

                <input
                  type="number"
                  min={1}
                  max={100}
                  value={
                    formData.persen_peringatan
                  }
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      persen_peringatan:
                        Number(
                          e.target
                            .value
                        ),
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                  required
                />
              </div>

              {/* BUTTON */}

              <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">

                <button
                  type="button"
                  onClick={() =>
                    setIsModalOpen(
                      false
                    )
                  }
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-semibold transition"
                >
                  Batal
                </button>

                <button
                  type="submit"
                  disabled={
                    isSubmitting
                  }
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-sm transition disabled:opacity-50"
                >
                  {isSubmitting
                    ? 'Menyimpan...'
                    : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}