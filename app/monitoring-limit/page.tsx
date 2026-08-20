'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const DEFAULT_LIMIT_BULANAN = 3000000;

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

// Pemetaan Nama Bulan Indonesia ke Angka
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

export default function MonitoringLimitPage() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [dataList, setDataList] = useState<MonitoringLimitData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [kegiatanOptions, setKegiatanOptions] = useState<KegiatanOption[]>([]);

  // State Filter (Default Agustus 2026 sesuai data Supabase)
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

  // Logika Pencocokan Bulan & Tahun Fleksibel
  const isMatchingMonth = (rawDbValue: string | null | undefined, filterYYYYMM: string) => {
    if (!rawDbValue) return false;
    if (!filterYYYYMM) return true;

    const val = String(rawDbValue).trim().toLowerCase(); // Contoh DB: "agustus 2026"
    const [year, monthNum] = filterYYYYMM.split('-');     // ["2026", "08"]
    const monthName = BULAN_MAP[monthNum] || '';          // "agustus"

    const hasMonth = val.includes(monthName);
    const hasYear = val.includes(year);

    // 1. Jika DB tersimpan format teks ("Agustus 2026")
    if (hasMonth && hasYear) return true;

    // 2. Jika DB tersimpan format "2026-08" atau sejenisnya
    if (val.includes(filterYYYYMM) || val.startsWith(filterYYYYMM)) return true;

    // 3. Jika DB hanya berisi nama bulan tanpa tahun
    if (hasMonth && !val.match(/\d{4}/)) return true;

    return false;
  };

  // Fetch Data Hasil Agregasi Mitra & Honor
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Ambil Data Mitra
      const { data: mitraData, error: mitraErr } = await supabase
        .from('mitra')
        .select('sobat_id, nama_mitra, posisi_mitra');

      if (mitraErr) throw mitraErr;

      // 2. Ambil Penugasan beserta relasi ke Kegiatan (mengambil bulan_kegiatan)
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

      // 3. Agregasi Data Mitra berdasarkan Pemfilteran Periode
      const computedList: MonitoringLimitData[] = (mitraData || [])
        .map((mitra) => {
          const penugasanMitra = (penugasanData || []).filter((p: any) => {
            if (p.sobat_id !== mitra.sobat_id) return false;

            // Memeriksa bulan_kegiatan dari relasi tabel kegiatan, atau fallback ke bulan_pembayaran
            const bulanTarget = p.kegiatan?.bulan_kegiatan || p.bulan_pembayaran;

            return isMatchingMonth(bulanTarget, periodeBulan);
          });

          const totalHonor = penugasanMitra.reduce(
            (sum, p: any) => sum + (Number(p.total_honor) || 0),
            0
          );

          const kegiatanList = penugasanMitra
            .map((p: any) => p.kegiatan?.nama_kegiatan)
            .filter(Boolean);

          const sisa = Math.max(DEFAULT_LIMIT_BULANAN - totalHonor, 0);
          const persen = Math.round((totalHonor / DEFAULT_LIMIT_BULANAN) * 100);

          return {
            sobat_id: mitra.sobat_id,
            nama_mitra: mitra.nama_mitra,
            posisi_mitra: mitra.posisi_mitra,
            total_honor_terpakai: totalHonor,
            sisa_limit: sisa,
            persentase: persen,
            kegiatan_diikuti: kegiatanList.length > 0 
              ? Array.from(new Set(kegiatanList))
              : [],
          };
        })
        // Menyaring mitra yang hanya memiliki kegiatan/penugasan pada periode terfilter
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

  // Logika Filter Multi-Kriteria & Pagination
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
            </div>

            {/* BAR FILTER */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 mb-6 flex flex-wrap gap-4 items-center justify-between">
              <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                {/* Filter Periode Input Month */}
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

                {/* Filter Kegiatan */}
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

                {/* Filter Status */}
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

              {/* Input Search */}
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          Menghitung akumulasi honor...
                        </td>
                      </tr>
                    ) : currentData.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          Tidak ditemukan data.
                        </td>
                      </tr>
                    ) : (
                      currentData.map((item, index) => (
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
                          <td className="py-3.5 px-4 text-slate-600 max-w-[200px] truncate">
                            {item.kegiatan_diikuti.join(', ')}
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
                        </tr>
                      ))
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
    </div>
  );
}