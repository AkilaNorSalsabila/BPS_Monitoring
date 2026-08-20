'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface KegiatanOption {
  id: number;
  nama_kegiatan: string;
  bulan_kegiatan?: string;
}

interface LimitInfo {
  batas_maksimal: number;
  persen_peringatan: number;
  bulan_kegiatan?: string;
}

interface MonitoringLimitData {
  sobat_id: string;
  nama_mitra: string;
  alokasi_honor: number;
  dicairkan: number;
  sisa_limit: number;
  persentase: number;
  status: 'aman' | 'peringatan' | 'melebihi';
}

export default function MonitoringLimitPage() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Dropdown Kegiatan
  const [kegiatanOptions, setKegiatanOptions] = useState<KegiatanOption[]>([]);
  const [selectedKegiatanId, setSelectedKegiatanId] = useState<string>('');
  const [loadingKegiatan, setLoadingKegiatan] = useState<boolean>(true);

  // Limit Kegiatan Terpilih
  const [limitInfo, setLimitInfo] = useState<LimitInfo | null>(null);

  // Data Tabel
  const [dataList, setDataList] = useState<MonitoringLimitData[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Filter & Pagination
  const [statusFilter, setStatusFilter] = useState<string>('Semua Status');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  // 1. Fetch Daftar Kegiatan
  useEffect(() => {
    const fetchKegiatan = async () => {
      setLoadingKegiatan(true);
      try {
        const { data, error } = await supabase
          .from('kegiatan')
          .select('id, nama_kegiatan, bulan_kegiatan')
          .order('created_at', { ascending: false });

        if (!error && data) {
          setKegiatanOptions(data);
          if (data.length > 0) setSelectedKegiatanId(String(data[0].id));
        }
      } catch (err) {
        console.error('Error fetching kegiatan:', err);
      } finally {
        setLoadingKegiatan(false);
      }
    };
    fetchKegiatan();
  }, []);

  // 2. Fetch Data Monitoring & Limit Berdasarkan Kegiatan Terpilih
  const fetchData = useCallback(async () => {
    if (!selectedKegiatanId) return;
    setLoading(true);

    try {
      const kegiatanIdNum = Number(selectedKegiatanId);

      // Ambil detail kegiatan aktif untuk mendapatkan bulan_kegiatan
      const currentKegiatan = kegiatanOptions.find((k) => String(k.id) === selectedKegiatanId);

      // a. Ambil limit kegiatan dari tabel limit_honor berdasarkan kegiatan_id
      const { data: limitData } = await supabase
        .from('limit_honor')
        .select('batas_maksimal, persen_peringatan')
        .eq('kegiatan_id', kegiatanIdNum)
        .maybeSingle();

      const batasMaksimal = limitData?.batas_maksimal || 0;
      const persenPeringatan = limitData?.persen_peringatan || 80;

      setLimitInfo(
        limitData
          ? {
              batas_maksimal: batasMaksimal,
              persen_peringatan: persenPeringatan,
              bulan_kegiatan: currentKegiatan?.bulan_kegiatan,
            }
          : null
      );

      // b. Ambil penugasan mitra pada kegiatan ini
      const { data: penugasanData, error: errPenugasan } = await supabase
        .from('penugasan')
        .select(`
          id,
          sobat_id,
          total_honor,
          jumlah_dicairkan,
          mitra!inner ( sobat_id, nama_mitra )
        `)
        .eq('kegiatan_id', kegiatanIdNum);

      if (errPenugasan) throw errPenugasan;

      // c. Hitung per mitra
      const rows: MonitoringLimitData[] = (penugasanData || []).map((p: any) => {
        const dataMitra = Array.isArray(p.mitra) ? p.mitra[0] : p.mitra;
        const alokasi = Number(p.total_honor) || 0;
        const dicairkan = Number(p.jumlah_dicairkan) || 0;
        const persentase = batasMaksimal > 0 ? (alokasi / batasMaksimal) * 100 : 0;

        let status: MonitoringLimitData['status'] = 'aman';
        if (alokasi > batasMaksimal && batasMaksimal > 0) status = 'melebihi';
        else if (persentase >= persenPeringatan && batasMaksimal > 0) status = 'peringatan';

        return {
          sobat_id: dataMitra?.sobat_id || p.sobat_id,
          nama_mitra: dataMitra?.nama_mitra || 'Tanpa Nama',
          alokasi_honor: alokasi,
          dicairkan,
          sisa_limit: batasMaksimal - alokasi,
          persentase,
          status,
        };
      });

      rows.sort((a, b) => b.persentase - a.persentase);
      setDataList(rows);
      setCurrentPage(1);
    } catch (err) {
      console.error('Error fetching monitoring data:', err);
      setDataList([]);
    } finally {
      setLoading(false);
    }
  }, [selectedKegiatanId, kegiatanOptions]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter Data
  const filteredData = useMemo(() => {
    return dataList.filter((item) => {
      const matchSearch =
        !searchKeyword ||
        item.nama_mitra.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        item.sobat_id.toLowerCase().includes(searchKeyword.toLowerCase());

      const matchStatus =
        statusFilter === 'Semua Status' ||
        (statusFilter === 'Aman' && item.status === 'aman') ||
        (statusFilter === 'Mendekati Limit' && item.status === 'peringatan') ||
        (statusFilter === 'Melebihi Limit' && item.status === 'melebihi');

      return matchSearch && matchStatus;
    });
  }, [dataList, searchKeyword, statusFilter]);

  // Pagination
  const totalItems = filteredData.length;
  const currentData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans">
      <Sidebar mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />

      <div className="min-h-screen lg:pl-[230px]">
        <Header title="Monitoring Limit" onMenuClick={() => setMobileSidebarOpen(true)} />

        <main className="p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1400px]">
            {/* HEADER & PILIH KEGIATAN */}
            <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
              <div>
                <h1 className="text-xl font-bold text-slate-800">Monitoring Limit Honor Mitra</h1>
                <p className="text-xs text-slate-500 mt-1">
                  Pantau alokasi honor mitra terhadap limit yang berlaku pada kegiatan.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-600">Kegiatan:</label>
                <select
                  value={selectedKegiatanId}
                  onChange={(e) => setSelectedKegiatanId(e.target.value)}
                  className="py-2 px-3 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-blue-500 min-w-[260px]"
                >
                  {loadingKegiatan && <option>Memuat kegiatan...</option>}
                  {kegiatanOptions.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.nama_kegiatan} {k.bulan_kegiatan ? `— ${k.bulan_kegiatan}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* INFO LIMIT KEGIATAN */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs text-slate-500 block">
                  Batas Maksimal Honor {limitInfo?.bulan_kegiatan ? `Bulan ${limitInfo.bulan_kegiatan}` : 'Kegiatan Ini'}:
                </span>
                <span className="text-lg font-bold text-slate-800">
                  {limitInfo ? formatRupiah(limitInfo.batas_maksimal) : 'Belum Ditetapkan'}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Ambang Peringatan:</span>
                <span className="text-sm font-semibold text-amber-600">
                  {limitInfo ? `${limitInfo.persen_peringatan}% dari limit` : '-'}
                </span>
              </div>
            </div>

            {/* FILTER & TABEL */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 justify-between">
                <input
                  type="text"
                  placeholder="Cari Mitra (Nama / SOBAT ID)"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-blue-500 min-w-[240px]"
                />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none"
                >
                  <option value="Semua Status">Semua Status</option>
                  <option value="Aman">Aman</option>
                  <option value="Mendekati Limit">Mendekati Limit</option>
                  <option value="Melebihi Limit">Melebihi Limit</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold">
                    <tr>
                      <th className="py-3 px-4 text-center">No</th>
                      <th className="py-3 px-4">SOBAT ID</th>
                      <th className="py-3 px-4">Nama Mitra</th>
                      <th className="py-3 px-4">Alokasi Honor</th>
                      <th className="py-3 px-4">Dicairkan</th>
                      <th className="py-3 px-4">Sisa Limit</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">Memuat data...</td>
                      </tr>
                    ) : currentData.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">Tidak ada data penugasan.</td>
                      </tr>
                    ) : (
                      currentData.map((item, idx) => (
                        <tr key={item.sobat_id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 text-center">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                          <td className="py-3 px-4 font-semibold text-blue-600">{item.sobat_id}</td>
                          <td className="py-3 px-4 font-semibold">{item.nama_mitra}</td>
                          <td className="py-3 px-4">{formatRupiah(item.alokasi_honor)}</td>
                          <td className="py-3 px-4">{formatRupiah(item.dicairkan)}</td>
                          <td className={`py-3 px-4 ${item.sisa_limit < 0 ? 'text-rose-600 font-bold' : ''}`}>
                            {formatRupiah(item.sisa_limit)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {item.status === 'melebihi' && (
                              <span className="px-2 py-0.5 rounded text-[10px] bg-rose-50 text-rose-700 border border-rose-200 font-semibold">
                                Melebihi Limit
                              </span>
                            )}
                            {item.status === 'peringatan' && (
                              <span className="px-2 py-0.5 rounded text-[10px] bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
                                Mendekati Limit
                              </span>
                            )}
                            {item.status === 'aman' && (
                              <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                                Aman
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}