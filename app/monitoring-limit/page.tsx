'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const FALLBACK_LIMIT_BULANAN = 3000000;

interface MonitoringLimitData {
  sobat_id: string;
  nama_mitra: string;
  posisi_mitra?: string;
  total_honor_terpakai: number;
  sisa_limit: number;
  persentase: number;
  kegiatan_diikuti: string[];
}

interface KegiatanOption {
  id: string | number;
  nama_kegiatan: string;
}

const NAMA_BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

// Pemetaan Nama Bulan Indonesia ke Angka (dipakai untuk limit_honor.bulan_periode
// yang formatnya "YYYY-MM", BUKAN untuk parsing rentang kegiatan)
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

// ============================================================
// PARSER PERIODE KEGIATAN MULTI-BULAN
// ============================================================
// Kolom kegiatan.bulan_kegiatan bisa berupa beberapa format tergantung
// dari mana kegiatan itu dibuat:
//   1) Rentang (format Kegiatan/Mitra terbaru) : "Agustus 2026 s.d. Oktober 2026 (3 Bulan)"
//   2) Rentang (format lama)                   : "Agustus 2026 - Oktober 2026"
//   3) Bulan tunggal                           : "Agustus 2026 (1 Bulan)"
//   4) Bulan tunggal polos (fallback lama)      : "Agustus 2026"
// Semua format ini diurai menjadi daftar bulan individual, supaya:
//  - kegiatan yang membentang beberapa bulan tetap terhitung di SETIAP
//    bulan yang dicakupnya (bukan cuma bulan yang namanya tertulis literal), dan
//  - honornya dibagi rata per bulan sebelum diakumulasikan ke limit bulanan
//    (supaya tidak dobel-hitung seperti sebelumnya).
// Logika ini identik dengan parser yang dipakai di halaman Penugasan.

interface PeriodeKegiatan {
  months: string[]; // mis. ["Agustus 2026", "September 2026", "Oktober 2026"]
  jumlahBulan: number;
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

// Mendukung pemisah "-" (format lama) maupun "s.d." (format baru), dengan
// atau tanpa keterangan "(N Bulan)" di akhir.
const RANGE_REGEX =
  /^([A-Za-zÀ-ÿ]+)\s+(\d{4})\s*(?:-|s\.?d\.?)\s*([A-Za-zÀ-ÿ]+)\s+(\d{4})\s*(?:\(\s*\d+\s*Bulan\s*\))?$/i;

// Mendukung "Agustus 2026 (1 Bulan)" maupun "Agustus 2026" polos (tanpa keterangan).
const SINGLE_REGEX = /^([A-Za-zÀ-ÿ]+)\s+(\d{4})\s*(?:\(\s*(\d+)\s*Bulan\s*\))?$/i;

const parsePeriodeKegiatan = (raw: string | null | undefined): PeriodeKegiatan => {
  const text = (raw || '').trim();
  if (!text) return { months: [], jumlahBulan: 0 };

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
        };
      }
    }
  }

  const singleMatch = text.match(SINGLE_REGEX);
  if (singleMatch) {
    const [, monthName, yearStr, jumlahStr] = singleMatch;
    const startIdx = monthIndexFromName(monthName);

    if (startIdx !== -1) {
      const jumlah = Math.max(parseInt(jumlahStr || '1', 10) || 1, 1);
      return {
        months: generateMonthSequence(startIdx, parseInt(yearStr, 10), jumlah),
        jumlahBulan: jumlah,
      };
    }
  }

  // Fallback: format tidak dikenali -> anggap 1 bulan apa adanya supaya
  // tidak error, tapi tidak dianggap cocok dengan bulan manapun secara
  // spesifik (label mentahnya disimpan sebagai satu "bulan" tersendiri).
  return { months: [text], jumlahBulan: 1 };
};

// Mengubah nilai filter "YYYY-MM" (dari <input type="month">) menjadi label
// "Nama Bulan Tahun" (mis. "2026-09" -> "September 2026") supaya bisa
// dicocokkan langsung terhadap hasil parsePeriodeKegiatan(...).months.
const periodeBulanToLabel = (yyyymm: string): string => {
  const [year, monthNum] = yyyymm.split('-');
  const monthName = NAMA_BULAN_ID[parseInt(monthNum, 10) - 1] || '';
  return `${monthName} ${year}`;
};

export default function MonitoringLimitPage() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [dataList, setDataList] = useState<MonitoringLimitData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [kegiatanOptions, setKegiatanOptions] = useState<KegiatanOption[]>([]);

  // State untuk Modal Detail Kegiatan
  const [detailPenugasan, setDetailPenugasan] = useState<MonitoringLimitData | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);

  const [limitBulanan, setLimitBulanan] = useState<number>(FALLBACK_LIMIT_BULANAN);
  const [limitSudahDiatur, setLimitSudahDiatur] = useState<boolean>(false);

  // State Filter
  const [periodeBulan, setPeriodeBulan] = useState<string>('2026-08'); 
  const [statusFilter, setStatusFilter] = useState<string>('Semua');
  const [kegiatanFilter, setKegiatanFilter] = useState<string>('Semua');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // State Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage] = useState<number>(10);

  // Fetch Opsi Kegiatan
  const fetchKegiatanOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('kegiatan')
        .select('id, nama_kegiatan');
      
      if (!error && data) {
        setKegiatanOptions(data);
      }
    } catch (err) {
      console.error('Error fetching kegiatan options:', err);
    }
  };

  useEffect(() => {
    fetchKegiatanOptions();
  }, []);

  // Dipakai KHUSUS untuk mencocokkan limit_honor.bulan_periode (format
  // tunggal "YYYY-MM") terhadap filter yang dipilih. Ini BUKAN untuk
  // mencocokkan rentang kegiatan mitra — untuk itu pakai parsePeriodeKegiatan.
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

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: mitraData, error: mitraErr } = await supabase
        .from('mitra')
        .select('sobat_id, nama_mitra, posisi_mitra');

      if (mitraErr) throw mitraErr;

      const { data: penugasanData, error: penugasanErr } = await supabase
        .from('penugasan')
        .select(`
          sobat_id, 
          total_honor, 
          bulan_pembayaran, 
          kegiatan:kegiatan_id (
            nama_kegiatan,
            bulan_kegiatan
          )
        `);

      if (penugasanErr) console.warn('Query penugasan info:', penugasanErr.message);

      let limitAktif = FALLBACK_LIMIT_BULANAN;
      let sudahDiatur = false;
      const { data: limitData, error: limitErr } = await supabase
        .from('limit_honor')
        .select('bulan_periode, batas_maksimal');

      if (limitErr) {
        console.error('Error fetching limit_honor:', limitErr.message);
      } else if (limitData) {
        const limitRow = limitData.find((row: any) => isMatchingMonth(row.bulan_periode, periodeBulan));
        if (limitRow && limitRow.batas_maksimal !== undefined && limitRow.batas_maksimal !== null) {
          limitAktif = Number(limitRow.batas_maksimal);
          sudahDiatur = true;
        }
      }
      setLimitBulanan(limitAktif);
      setLimitSudahDiatur(sudahDiatur);

      // Label bulan yang sedang difilter, mis. "September 2026" — dicocokkan
      // terhadap daftar bulan hasil pengurai rentang periode tiap kegiatan.
      const targetBulanLabel = periodeBulanToLabel(periodeBulan);

      const computedList: MonitoringLimitData[] = (mitraData || [])
        .map((mitra) => {
          const penugasanMitra = (penugasanData || []).filter(
            (p: any) => p.sobat_id === mitra.sobat_id
          );

          let totalHonor = 0;
          const kegiatanSet = new Set<string>();

          penugasanMitra.forEach((p: any) => {
            const bulanTarget = p.kegiatan?.bulan_kegiatan || p.bulan_pembayaran;
            const periodeInfo = parsePeriodeKegiatan(bulanTarget);

            // Kegiatan ini dihitung untuk periode yang difilter HANYA jika
            // rentang bulannya benar-benar mencakup bulan tsb — termasuk
            // bulan "tengah" yang tidak disebut literal di teksnya
            // (mis. September pada rentang Agustus-Oktober).
            if (!periodeInfo.months.includes(targetBulanLabel)) return;

            // Honor dibagi rata ke tiap bulan yang dicakup kegiatan, supaya
            // kegiatan 3 bulan senilai Rp900rb menyumbang Rp300rb/bulan —
            // bukan Rp900rb penuh di setiap bulan yang ia sentuh.
            const honorPerBulan =
              (Number(p.total_honor) || 0) / Math.max(periodeInfo.jumlahBulan, 1);

            totalHonor += honorPerBulan;

            if (p.kegiatan?.nama_kegiatan) {
              kegiatanSet.add(p.kegiatan.nama_kegiatan);
            }
          });

          totalHonor = Math.round(totalHonor);

          const kegiatanList = Array.from(kegiatanSet);

          const sisa = Math.max(limitAktif - totalHonor, 0);
          const persen = limitAktif > 0 ? Math.round((totalHonor / limitAktif) * 100) : 0;

          return {
            sobat_id: mitra.sobat_id,
            nama_mitra: mitra.nama_mitra,
            posisi_mitra: mitra.posisi_mitra,
            total_honor_terpakai: totalHonor,
            sisa_limit: sisa,
            persentase: persen,
            kegiatan_diikuti: kegiatanList,
          };
        })
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

      let matchStatus = true;
      if (statusFilter === 'Belum Terpakai') {
        matchStatus = item.persentase === 0;
      } else if (statusFilter === 'Aman') {
        matchStatus = item.persentase > 0 && item.persentase < 80;
      } else if (statusFilter === 'Hampir Limit') {
        matchStatus = item.persentase >= 80 && item.persentase < 100;
      } else if (statusFilter === 'Mencapai Limit') {
        matchStatus = item.persentase >= 100;
      }

      let matchKegiatan = true;
      if (kegiatanFilter !== 'Semua') {
        matchKegiatan = item.kegiatan_diikuti.some(
          (k) => k.toLowerCase() === kegiatanFilter.toLowerCase()
        );
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
                  Pantau akumulasi penerimaan honor mitra BPS per periode bulanan
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

                <div className="flex flex-col gap-1 min-w-[150px]">
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
                    <option value="Hampir Limit">Hampir Limit (&ge;80%)</option>
                    <option value="Mencapai Limit">Mencapai Limit (100%)</option>
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
                      <th className="py-3.5 px-4">Honor Terpakai</th>
                      <th className="py-3.5 px-4">Sisa Limit</th>
                      <th className="py-3.5 px-4 text-center">Prosentase</th>
                      <th className="py-3.5 px-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400">
                          Menghitung akumulasi honor...
                        </td>
                      </tr>
                    ) : currentData.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400">
                          Tidak ditemukan data.
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
                            <td className="py-3.5 px-4 font-mono text-blue-600 font-medium">
                              {item.sobat_id}
                            </td>
                            <td className="py-3.5 px-4 text-slate-600 max-w-[220px]">
                              <div className="truncate font-medium text-slate-700">
                                {firstKegiatan}
                              </div>
                              {extraCount > 0 && (
                                <span className="text-[10px] text-blue-600 font-semibold bg-blue-50 px-1.5 py-0.5 rounded-md mt-1 inline-block">
                                  +{extraCount} kegiatan lainnya
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 font-semibold text-slate-700">
                              Rp{item.total_honor_terpakai.toLocaleString('id-ID')}
                            </td>
                            <td className="py-3.5 px-4 font-medium text-slate-500">
                              Rp{item.sisa_limit.toLocaleString('id-ID')}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <span
                                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                                  item.persentase >= 100
                                    ? 'bg-rose-50 text-rose-600 border border-rose-200'
                                    : item.persentase >= 80
                                    ? 'bg-amber-50 text-amber-600 border border-amber-200'
                                    : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                }`}
                              >
                                {item.total_honor_terpakai === 0 ? 'Belum Terpakai (0%)' : `${item.persentase}%`}
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
                        currentPage === page
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-600 hover:bg-slate-100'
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Detail Kegiatan Diikuti</h3>
                <p className="text-[11px] text-slate-500">Daftar lengkap penugasan pada periode ini</p>
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
                  {detailPenugasan.nama_mitra} <span className="text-blue-600 font-mono">({detailPenugasan.sobat_id})</span>
                </div>
              </div>

              <div>
                <div className="text-[11px] text-slate-400 font-medium mb-2">
                  Daftar Kegiatan ({detailPenugasan.kegiatan_diikuti.length} Kegiatan)
                </div>
                <ul className="space-y-2">
                  {detailPenugasan.kegiatan_diikuti.map((keg, idx) => (
                    <li key={idx} className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-700 flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <span className="font-medium">{keg}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-xs">
                <span className="text-slate-500">Total Honor Terpakai:</span>
                <span className="font-bold text-slate-800">
                  Rp{detailPenugasan.total_honor_terpakai.toLocaleString('id-ID')}
                </span>
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
