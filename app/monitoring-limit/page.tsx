'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const FALLBACK_LIMIT_BULANAN = 3000000;

// =========================================================
// RIWAYAT PERBAIKAN
// =========================================================
// v1 -> v2: ambil data dari `pencairan_honor` langsung (bukan lagi
// `penugasan.total_honor` / `penugasan.bulan_pembayaran` yang sudah tidak
// dipakai di skema baru).
//
// v2 -> v3: bulan beban tiap baris SEKARANG dihitung dari tanggal realisasi
// aktual (kolom `tgl_pencairan`) kalau baris sudah direalisasikan — bukan
// lagi disamakan dengan `bulan_pencairan` (bulan rencana). Baris yang cair
// di bulan berbeda dari rencana awal (dipercepat/diundur) jadi ikut
// terhitung di bulan realisasi aktualnya, bukan hilang atau nyangkut di
// bulan rencana lama. Catatan: nama kolom tanggal realisasi di database
// adalah `tgl_pencairan` (bukan `tanggal_realisasi`).
//
// v3 -> v4 (VERSI INI): Realisasi & Rencana sekarang DIPISAH, tidak cuma
// digabung jadi satu angka "terpakai":
//   - total_realisasi  = jumlah baris yang SUDAH cair (nominal_dicairkan)
//   - total_rencana    = jumlah baris yang BELUM cair (nominal_rencana)
//   - total_gabungan   = realisasi + rencana -> dipakai sebagai "beban
//     potensial" bulan itu, supaya rencana yang menumpuk bisa terdeteksi
//     SEBELUM benar-benar cair dan melebihi limit.
// Status limit dipecah jadi 5 level, bukan 4:
//   - Belum Terpakai   : gabungan = 0
//   - Aman             : gabungan < 80% limit
//   - Hampir Limit     : gabungan 80-99% limit (masih rencana/realisasi campur)
//   - Berisiko/Reschedule : gabungan >= 100% limit TAPI realisasi sendiri
//     masih di bawah limit -> ini baru proyeksi, masih bisa dicegah dengan
//     menjadwalkan ulang rencana yang belum cair.
//   - Melebihi Limit   : REALISASI SENDIRI (yang sudah benar-benar cair)
//     sudah >= limit -> ini sudah kejadian nyata, bukan proyeksi lagi.
// =========================================================

type StatusLimit = 'Belum Terpakai' | 'Aman' | 'Hampir Limit' | 'Berisiko' | 'Melebihi Limit';

interface KontribusiPencairan {
  pencairanId: number;
  namaKegiatan: string;
  nominal: number;
  sumber: 'Realisasi' | 'Rencana';
  bulanRencana: string;
  bulanBeban: string;
  direschedule: boolean;
}

interface MonitoringLimitData {
  sobat_id: string;
  nama_mitra: string;
  posisi_mitra?: string;
  total_realisasi: number;
  total_rencana: number;
  total_gabungan: number;
  sisa_limit: number;
  persentase_realisasi: number;
  persentase_gabungan: number;
  status: StatusLimit;
  kegiatan_diikuti: string[];
  kontribusi: KontribusiPencairan[];
}

interface KegiatanOption {
  id: string | number;
  nama_kegiatan: string;
}

const NAMA_BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

// ============================================================
// DEFAULT PERIODE = BULAN BERJALAN SAAT INI
// ============================================================
const getCurrentYYYYMM = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

// Mengubah nilai filter "YYYY-MM" (dari <input type="month">) menjadi label
// "Nama Bulan Tahun" (mis. "2026-09" -> "September 2026") — format ini yang
// dipakai di kolom bulan_pencairan & limit_honor.bulan_periode.
const periodeBulanToLabel = (yyyymm: string): string => {
  const [year, monthNum] = yyyymm.split('-');
  const monthName = NAMA_BULAN_ID[parseInt(monthNum, 10) - 1] || '';
  return `${monthName} ${year}`;
};

// Mengambil label "Nama Bulan Tahun" dari sebuah tanggal (dipakai untuk
// menentukan bulan beban dari tgl_pencairan).
const tanggalToBulanLabel = (tanggal: string): string => {
  const d = new Date(tanggal);
  return `${NAMA_BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
};

// ============================================================
// Bulan beban efektif per baris pencairan_honor.
// - Sudah direalisasikan (nominal_dicairkan terisi) -> pakai bulan dari
//   tgl_pencairan (tanggal aktual pencairan/realisasi).
// - Masih rencana -> pakai bulan_pencairan (bulan rencana).
// ============================================================
const getBulanBebanEfektif = (p: any): string => {
  const sudahRealisasi = p.nominal_dicairkan !== null && p.nominal_dicairkan !== undefined;
  if (sudahRealisasi && p.tgl_pencairan) {
    return tanggalToBulanLabel(p.tgl_pencairan);
  }
  return p.bulan_pencairan;
};

// ============================================================
// Menentukan status limit dari kombinasi realisasi & gabungan.
// ============================================================
const getStatusLimit = (persenRealisasi: number, persenGabungan: number): StatusLimit => {
  if (persenGabungan === 0) return 'Belum Terpakai';
  if (persenRealisasi >= 100) return 'Melebihi Limit';
  if (persenGabungan >= 100) return 'Berisiko';
  if (persenGabungan >= 80) return 'Hampir Limit';
  return 'Aman';
};

const STATUS_STYLE: Record<StatusLimit, string> = {
  'Belum Terpakai': 'bg-slate-50 text-slate-500 border-slate-200',
  'Aman': 'bg-emerald-50 text-emerald-600 border-emerald-200',
  'Hampir Limit': 'bg-amber-50 text-amber-600 border-amber-200',
  'Berisiko': 'bg-orange-50 text-orange-700 border-orange-300',
  'Melebihi Limit': 'bg-rose-50 text-rose-600 border-rose-200',
};

const STATUS_LABEL: Record<StatusLimit, string> = {
  'Belum Terpakai': 'Belum Terpakai',
  'Aman': 'Aman',
  'Hampir Limit': 'Hampir Limit',
  'Berisiko': 'Berisiko / Perlu Reschedule',
  'Melebihi Limit': 'Melebihi Limit',
};

export default function MonitoringLimitPage() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [dataList, setDataList] = useState<MonitoringLimitData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [kegiatanOptions, setKegiatanOptions] = useState<KegiatanOption[]>([]);

  const [detailPenugasan, setDetailPenugasan] = useState<MonitoringLimitData | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);

  const [limitBulanan, setLimitBulanan] = useState<number>(FALLBACK_LIMIT_BULANAN);
  const [limitSudahDiatur, setLimitSudahDiatur] = useState<boolean>(false);

  const [periodeBulan, setPeriodeBulan] = useState<string>(getCurrentYYYYMM());
  const [statusFilter, setStatusFilter] = useState<string>('Semua');
  const [kegiatanFilter, setKegiatanFilter] = useState<string>('Semua');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage] = useState<number>(10);

  const fetchKegiatanOptions = async () => {
    try {
      const { data, error } = await supabase.from('kegiatan').select('id, nama_kegiatan');
      if (!error && data) setKegiatanOptions(data);
    } catch (err) {
      console.error('Error fetching kegiatan options:', err);
    }
  };

  useEffect(() => {
    fetchKegiatanOptions();
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const targetBulanLabel = periodeBulanToLabel(periodeBulan);

      const { data: mitraData, error: mitraErr } = await supabase
        .from('mitra')
        .select('sobat_id, nama_mitra, posisi_mitra');

      if (mitraErr) throw mitraErr;

      // Tidak filter `.eq('bulan_pencairan', targetBulanLabel)` di query.
      // Semua baris diambil (termasuk tgl_pencairan), lalu bulan beban
      // efektif dihitung & difilter di JS lewat getBulanBebanEfektif — agar
      // baris yang direalisasikan beda bulan dari rencananya tetap
      // terhitung di bulan realisasi aktualnya.
      const { data: pencairanData, error: pencairanErr } = await supabase
        .from('pencairan_honor')
        .select(`
          id,
          sobat_id,
          bulan_pencairan,
          tgl_pencairan,
          nominal_rencana,
          nominal_dicairkan,
          penugasan:penugasan_id (
            kegiatan:kegiatan_id (
              nama_kegiatan
            )
          )
        `);

      if (pencairanErr) console.warn('Query pencairan_honor info:', pencairanErr.message);

      const pencairanBulanIni = (pencairanData || []).filter(
        (p: any) => getBulanBebanEfektif(p) === targetBulanLabel
      );

      let limitAktif = FALLBACK_LIMIT_BULANAN;
      let sudahDiatur = false;

      const { data: limitData, error: limitErr } = await supabase
        .from('limit_honor')
        .select('bulan_periode, batas_maksimal');

      if (limitErr) {
        console.error('Error fetching limit_honor:', limitErr.message);
      } else if (limitData) {
        const limitRow = limitData.find(
          (row: any) => (row.bulan_periode || '').trim().toLowerCase() === targetBulanLabel.trim().toLowerCase()
        );
        if (limitRow && limitRow.batas_maksimal !== undefined && limitRow.batas_maksimal !== null) {
          limitAktif = Number(limitRow.batas_maksimal);
          sudahDiatur = true;
        }
      }
      setLimitBulanan(limitAktif);
      setLimitSudahDiatur(sudahDiatur);

      const computedList: MonitoringLimitData[] = (mitraData || [])
        .map((mitra) => {
          const pencairanMitra = pencairanBulanIni.filter((p: any) => p.sobat_id === mitra.sobat_id);

          let totalRealisasi = 0;
          let totalRencana = 0;
          const kegiatanSet = new Set<string>();
          const kontribusi: KontribusiPencairan[] = [];

          pencairanMitra.forEach((p: any) => {
            const sudahRealisasi = p.nominal_dicairkan !== null && p.nominal_dicairkan !== undefined;
            const nominal = sudahRealisasi ? Number(p.nominal_dicairkan) || 0 : Number(p.nominal_rencana) || 0;
            const namaKegiatan = p.penugasan?.kegiatan?.nama_kegiatan || '-';
            const bulanBeban = getBulanBebanEfektif(p);
            const direschedule = bulanBeban !== p.bulan_pencairan;

            if (sudahRealisasi) {
              totalRealisasi += nominal;
            } else {
              totalRencana += nominal;
            }
            kegiatanSet.add(namaKegiatan);

            kontribusi.push({
              pencairanId: p.id,
              namaKegiatan,
              nominal,
              sumber: sudahRealisasi ? 'Realisasi' : 'Rencana',
              bulanRencana: p.bulan_pencairan,
              bulanBeban,
              direschedule,
            });
          });

          totalRealisasi = Math.round(totalRealisasi);
          totalRencana = Math.round(totalRencana);
          const totalGabungan = totalRealisasi + totalRencana;
          const kegiatanList = Array.from(kegiatanSet);

          const sisa = Math.max(limitAktif - totalGabungan, 0);
          const persenRealisasi = limitAktif > 0 ? Math.round((totalRealisasi / limitAktif) * 100) : 0;
          const persenGabungan = limitAktif > 0 ? Math.round((totalGabungan / limitAktif) * 100) : 0;
          const status = getStatusLimit(persenRealisasi, persenGabungan);

          return {
            sobat_id: mitra.sobat_id,
            nama_mitra: mitra.nama_mitra,
            posisi_mitra: mitra.posisi_mitra,
            total_realisasi: totalRealisasi,
            total_rencana: totalRencana,
            total_gabungan: totalGabungan,
            sisa_limit: sisa,
            persentase_realisasi: persenRealisasi,
            persentase_gabungan: persenGabungan,
            status,
            kegiatan_diikuti: kegiatanList,
            kontribusi: kontribusi.sort((a, b) => b.nominal - a.nominal),
          };
        })
        // Hanya mitra yang punya rencana/realisasi pencairan (dengan bulan
        // beban efektif) pada bulan ini.
        .filter((mitra) => mitra.kegiatan_diikuti.length > 0);

      setDataList(computedList);
    } catch (err: any) {
      console.error('Error computing limit monitoring:', err);
    } finally {
      setLoading(false);
    }
  }, [periodeBulan]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredData = useMemo(() => {
    return dataList.filter((item) => {
      const matchSearch =
        item.nama_mitra.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        item.sobat_id.includes(searchKeyword);

      const matchStatus = statusFilter === 'Semua' || item.status === statusFilter;

      let matchKegiatan = true;
      if (kegiatanFilter !== 'Semua') {
        matchKegiatan = item.kegiatan_diikuti.some((k) => k.toLowerCase() === kegiatanFilter.toLowerCase());
      }

      return matchSearch && matchStatus && matchKegiatan;
    });
  }, [dataList, searchKeyword, statusFilter, kegiatanFilter]);

  const totalItems = filteredData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  const currentData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage, itemsPerPage]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans">
      <Sidebar mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />

      <div className="min-h-screen lg:pl-[230px]">
        <Header onMenuClick={() => setMobileSidebarOpen(true)} />

        <main className="p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1400px]">
            <div className="mb-5 flex flex-wrap justify-between items-center gap-3">
              <div>
                <h1 className="text-base font-bold text-slate-800">Monitoring Limit</h1>
                <p className="text-xs text-slate-500">
                  Pantau akumulasi rencana &amp; realisasi honor mitra BPS per bulan
                </p>
              </div>
              <div
                className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border ${
                  limitSudahDiatur
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                Limit periode ini: Rp{limitBulanan.toLocaleString('id-ID')}
                {!limitSudahDiatur && ' (default, belum diatur)'}
              </div>
            </div>

            {/* BAR FILTER */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 mb-6 flex flex-wrap gap-4 items-center justify-between">
              <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                <div className="flex flex-col gap-1 min-w-[150px]">
                  <label className="text-[11px] font-medium text-slate-400">Periode Bulan</label>
                  <input
                    type="month"
                    value={periodeBulan}
                    onChange={(e) => {
                      setPeriodeBulan(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="py-1.5 px-3 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex flex-col gap-1 min-w-[160px]">
                  <label className="text-[11px] font-medium text-slate-400">Kegiatan</label>
                  <select
                    value={kegiatanFilter}
                    onChange={(e) => {
                      setKegiatanFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="py-1.5 px-3 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-blue-500"
                  >
                    <option value="Semua">Semua Kegiatan</option>
                    {kegiatanOptions.map((k) => (
                      <option key={k.id} value={k.nama_kegiatan}>
                        {k.nama_kegiatan}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1 min-w-[190px]">
                  <label className="text-[11px] font-medium text-slate-400">Status Limit</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="py-1.5 px-3 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-blue-500"
                  >
                    <option value="Semua">Semua Status</option>
                    <option value="Belum Terpakai">Belum Terpakai (0%)</option>
                    <option value="Aman">Aman (&lt;80%)</option>
                    <option value="Hampir Limit">Hampir Limit (80-99%)</option>
                    <option value="Berisiko">Berisiko / Perlu Reschedule</option>
                    <option value="Melebihi Limit">Melebihi Limit (realisasi)</option>
                  </select>
                </div>
              </div>

              <div className="relative w-full md:w-64">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400 text-xs">
                  🔍
                </span>
                <input
                  type="text"
                  placeholder="Cari pegawai / SOBAT ID..."
                  value={searchKeyword}
                  onChange={(e) => {
                    setSearchKeyword(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* TABEL DATA MONITORING LIMIT */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50/70 border-b border-slate-100 font-semibold text-slate-500">
                    <tr>
                      <th className="py-3.5 px-4 text-center w-12">No</th>
                      <th className="py-3.5 px-4">Pegawai / Mitra</th>
                      <th className="py-3.5 px-4">SOBAT ID</th>
                      <th className="py-3.5 px-4">Kegiatan Diikuti</th>
                      <th className="py-3.5 px-4">Realisasi (pasti)</th>
                      <th className="py-3.5 px-4">Rencana (belum cair)</th>
                      <th className="py-3.5 px-4">Sisa Limit</th>
                      <th className="py-3.5 px-4 text-center">Status</th>
                      <th className="py-3.5 px-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400">
                          Menghitung akumulasi honor...
                        </td>
                      </tr>
                    ) : currentData.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400">
                          Tidak ditemukan data untuk bulan ini.
                        </td>
                      </tr>
                    ) : (
                      currentData.map((item, index) => {
                        const firstKegiatan = item.kegiatan_diikuti[0] || '-';
                        const extraCount = item.kegiatan_diikuti.length - 1;

                        return (
                          <tr key={item.sobat_id || index} className="hover:bg-slate-50/60 transition">
                            <td className="py-3.5 px-4 text-center font-medium text-slate-400">
                              {(currentPage - 1) * itemsPerPage + index + 1}
                            </td>
                            <td className="py-3.5 px-4 font-semibold text-slate-800">
                              {item.nama_mitra}
                              <div className="text-[10px] text-slate-400 font-normal">
                                {item.posisi_mitra || 'Mitra'}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-mono text-blue-600 font-medium">{item.sobat_id}</td>
                            <td className="py-3.5 px-4 text-slate-600 max-w-[220px]">
                              <div className="truncate font-medium text-slate-700">{firstKegiatan}</div>
                              {extraCount > 0 && (
                                <span className="text-[10px] text-blue-600 font-semibold bg-blue-50 px-1.5 py-0.5 rounded-md mt-1 inline-block">
                                  +{extraCount} kegiatan lainnya
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 font-semibold text-emerald-700">
                              Rp{item.total_realisasi.toLocaleString('id-ID')}
                              <div className="text-[10px] font-normal text-slate-400">
                                {item.persentase_realisasi}% dari limit
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-semibold text-blue-700">
                              Rp{item.total_rencana.toLocaleString('id-ID')}
                              <div className="text-[10px] font-normal text-slate-400">
                                belum direalisasikan
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-medium text-slate-500">
                              Rp{item.sisa_limit.toLocaleString('id-ID')}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <span
                                className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold border ${STATUS_STYLE[item.status]}`}
                                title={`Realisasi ${item.persentase_realisasi}% • Gabungan (realisasi+rencana) ${item.persentase_gabungan}%`}
                              >
                                {STATUS_LABEL[item.status]}
                                {item.status !== 'Belum Terpakai' && ` (${item.persentase_gabungan}%)`}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setDetailPenugasan(item);
                                  setIsDetailModalOpen(true);
                                }}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-md transition cursor-pointer mx-auto"
                                title="Detail"
                              >
                                👁️
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* PAGINATION */}
              <div className="px-4 py-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-white text-xs">
                <div className="text-slate-400">
                  Menampilkan {totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} -{' '}
                  {Math.min(currentPage * itemsPerPage, totalItems)} dari {totalItems} data
                </div>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-7 h-7 rounded-md font-medium transition ${
                        currentPage === page ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* MODAL DETAIL KEGIATAN MITRA */}
      {isDetailModalOpen && detailPenugasan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-100">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Detail Kontribusi Honor</h3>
                <p className="text-[11px] text-slate-500">Rincian rencana &amp; realisasi pencairan pada periode ini</p>
              </div>
              <button
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setDetailPenugasan(null);
                }}
                className="w-7 h-7 rounded-full bg-slate-200/60 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <div className="text-[11px] text-slate-400 font-medium">Nama Mitra & SOBAT ID</div>
                <div className="text-xs font-bold text-slate-800 mt-0.5">
                  {detailPenugasan.nama_mitra}{' '}
                  <span className="text-blue-600 font-mono">({detailPenugasan.sobat_id})</span>
                </div>
              </div>

              <div>
                <div className="text-[11px] text-slate-400 font-medium mb-2">
                  Rincian Kontribusi ({detailPenugasan.kontribusi.length})
                </div>
                <ul className="space-y-2">
                  {detailPenugasan.kontribusi.map((k, idx) => (
                    <li
                      key={k.pencairanId ?? idx}
                      className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-700 flex items-start justify-between gap-2"
                    >
                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="font-medium">{k.namaKegiatan}</div>
                          <div className="flex flex-wrap items-center gap-1 mt-1">
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold border ${
                                k.sumber === 'Realisasi'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-blue-50 text-blue-700 border-blue-200'
                              }`}
                            >
                              {k.sumber}
                            </span>
                            {k.direschedule && (
                              <span
                                className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold border bg-orange-50 text-orange-700 border-orange-200"
                                title={`Rencana awal: ${k.bulanRencana}`}
                              >
                                🕐 Dihitung sbg beban {k.bulanBeban}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className="font-semibold text-slate-700 shrink-0">
                        Rp{k.nominal.toLocaleString('id-ID')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Realisasi (pasti):</span>
                  <span className="font-bold text-emerald-700">
                    Rp{detailPenugasan.total_realisasi.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Rencana (belum cair):</span>
                  <span className="font-bold text-blue-700">
                    Rp{detailPenugasan.total_rencana.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-100">
                  <span className="text-slate-500">Total Gabungan:</span>
                  <span className="font-bold text-slate-800">
                    Rp{detailPenugasan.total_gabungan.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            </div>

            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setDetailPenugasan(null);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}