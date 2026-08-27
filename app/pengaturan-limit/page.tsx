'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

// =====================================================
// INTERFACE
// =====================================================

interface LimitHonor {
  id: number;
  bulan_periode: string; // contoh: "Januari 2026"
  batas_maksimal: number;
  persen_peringatan: number;
}

interface MitraLimitRow {
  sobat_id: string;
  nama_mitra: string;
  alokasi: number;
  dicairkan: number;
  sisa: number;
  persen_terpakai: number;
  status: 'aman' | 'peringatan' | 'mencapai' | 'melebihi';
}

const BULAN_OPTIONS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

// =====================================================
// PAGE
// =====================================================

export default function PengaturanLimitPage() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // =====================================================
  // STATE BULAN & TAHUN (PER BULAN)
  // =====================================================
  const [selectedBulanNama, setSelectedBulanNama] = useState<string>('Januari');
  const [selectedTahun, setSelectedTahun] = useState<string>(new Date().getFullYear().toString());

  // Gabungan string filter aktif, misal: "Januari 2026"
  const selectedBulanPeriode = `${selectedBulanNama} ${selectedTahun}`;

  // Daftar tahun yang tersedia dari database / helper
  const [tahunList, setTahunList] = useState<string[]>([new Date().getFullYear().toString()]);

  // =====================================================
  // DATA LIMIT & REKAP
  // =====================================================
  const [limitInfo, setLimitInfo] = useState<LimitHonor | null>(null);
  const [loadingLimit, setLoadingLimit] = useState<boolean>(false);
  const [mitraRows, setMitraRows] = useState<MitraLimitRow[]>([]);
  const [loadingRows, setLoadingRows] = useState<boolean>(false);

  // =====================================================
  // FILTER & PAGINATION
  // =====================================================
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('Semua Status');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;

  // =====================================================
  // MODAL LIMIT
  // =====================================================
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formData, setFormData] = useState({
    batas_maksimal: 3000000,
    persen_peringatan: 80,
  });

  // Format Rupiah
  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  // =====================================================
  // 1. FETCH DAFTAR TAHUN DARI TABEL KEGIATAN
  // =====================================================
  const fetchTahunOptions = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('kegiatan').select('bulan_kegiatan');
      if (error) throw error;

      const yearsSet = new Set<string>();
      yearsSet.add(new Date().getFullYear().toString());

      data?.forEach((item) => {
        if (item.bulan_kegiatan) {
          BULAN_OPTIONS.forEach((bln) => {
            if (item.bulan_kegiatan.includes(bln)) {
              // Ambil 4 digit angka terakhir atau regex tahun
              const matchYear = item.bulan_kegiatan.match(/\b20\d{2}\b/g);
              if (matchYear) {
                matchYear.forEach((y) => yearsSet.add(y));
              }
            }
          });
        }
      });

      const sortedYears = Array.from(yearsSet).sort().reverse();
      setTahunList(sortedYears);
    } catch (err) {
      console.error('Error fetching tahun options:', err);
    }
  }, []);

  useEffect(() => {
    fetchTahunOptions();
  }, [fetchTahunOptions]);

  // =====================================================
  // 2. FETCH LIMIT BERDASARKAN BULAN PERIODE
  // =====================================================
  const fetchLimitInfo = useCallback(async () => {
    if (!selectedBulanPeriode) return;

    setLoadingLimit(true);
    try {
      const { data, error } = await supabase
        .from('limit_honor')
        .select('id, bulan_periode, batas_maksimal, persen_peringatan')
        .eq('bulan_periode', selectedBulanPeriode)
        .maybeSingle();

      if (error) throw error;
      setLimitInfo(data || null);
    } catch (err: any) {
      console.error('Error fetching limit_honor:', err?.message || err);
      setLimitInfo(null);
    } finally {
      setLoadingLimit(false);
    }
  }, [selectedBulanPeriode]);

  useEffect(() => {
    fetchLimitInfo();
  }, [fetchLimitInfo]);

  // =====================================================
  // 3. FETCH DATA MITRA & AKUMULASI PER BULAN
  // =====================================================
  const fetchMitraRows = useCallback(async () => {
    if (!selectedBulanPeriode) {
      setMitraRows([]);
      return;
    }

    setLoadingRows(true);
    try {
      const batasMaksimal = Number(limitInfo?.batas_maksimal || 0);
      const persenPeringatan = Number(limitInfo?.persen_peringatan || 80);

      // Ambil penugasan yang mencakup bulan terpilih (misal: memuat nama bulan tersebut di kolom bulan_kegiatan)
      const { data: penugasanData, error: errPenugasan } = await supabase
        .from('penugasan')
        .select(`
          id,
          sobat_id,
          total_honor,
          kegiatan!inner (
            id,
            nama_kegiatan,
            bulan_kegiatan
          ),
          mitra!inner (
            sobat_id,
            nama_mitra
          )
        `)
        .ilike('kegiatan.bulan_kegiatan', `%${selectedBulanPeriode}%`);

      if (errPenugasan) throw errPenugasan;

      const alokasiMap: Record<string, { nama_mitra: string; total: number }> = {};
      const penugasanIdToSobat: Record<number, string> = {};

      (penugasanData || []).forEach((item: any) => {
        const dataMitra = Array.isArray(item.mitra) ? item.mitra[0] : item.mitra;
        const sobatId = dataMitra?.sobat_id || item.sobat_id;
        const namaMitra = dataMitra?.nama_mitra || 'Tanpa Nama';

        if (!sobatId) return;

        if (!alokasiMap[sobatId]) {
          alokasiMap[sobatId] = { nama_mitra: namaMitra, total: 0 };
        }

        const honor = Number(item.total_honor) || 0;
        alokasiMap[sobatId].total += honor;
        penugasanIdToSobat[item.id] = sobatId;
      });

      // Ambil data pencairan berdasarkan penugasan terkait
      const penugasanIds = Object.keys(penugasanIdToSobat).map(Number);
      const dicairkanMap: Record<string, number> = {};

      if (penugasanIds.length > 0) {
        const { data: pencairanData, error: errPencairan } = await supabase
          .from('pencairan_honor')
          .select('penugasan_id, nominal_dicairkan')
          .in('penugasan_id', penugasanIds);

        if (errPencairan) throw errPencairan;

        (pencairanData || []).forEach((p: any) => {
          const sobatId = penugasanIdToSobat[p.penugasan_id];
          if (!sobatId) return;
          const nominal = Number(p.nominal_dicairkan) || 0;
          dicairkanMap[sobatId] = (dicairkanMap[sobatId] || 0) + nominal;
        });
      }

      const rows: MitraLimitRow[] = Object.entries(alokasiMap).map(([sobatId, data]) => {
        const dicairkan = dicairkanMap[sobatId] || 0;
        const persenTerpakai = batasMaksimal > 0 ? (data.total / batasMaksimal) * 100 : 0;

        let status: MitraLimitRow['status'] = 'aman';
        if (batasMaksimal > 0) {
          if (data.total > batasMaksimal) {
            status = 'melebihi';
          } else if (data.total === batasMaksimal) {
            status = 'mencapai';
          } else if (persenTerpakai >= persenPeringatan) {
            status = 'peringatan';
          }
        }

        const sisa = batasMaksimal - data.total;

        return {
          sobat_id: sobatId,
          nama_mitra: data.nama_mitra,
          alokasi: data.total,
          dicairkan,
          sisa,
          persen_terpakai: persenTerpakai,
          status,
        };
      });

      rows.sort((a, b) => b.persen_terpakai - a.persen_terpakai);
      setMitraRows(rows);
      setCurrentPage(1);
    } catch (err: any) {
      console.error('Error fetching akumulasi mitra rows:', err?.message || err);
      setMitraRows([]);
    } finally {
      setLoadingRows(false);
    }
  }, [selectedBulanPeriode, limitInfo]);

  useEffect(() => {
    fetchMitraRows();
  }, [fetchMitraRows]);

  // =====================================================
  // 4. FILTER & PAGINATION
  // =====================================================
  const filteredRows = useMemo(() => {
    return mitraRows.filter((row) => {
      const keyword = searchKeyword.toLowerCase();
      const matchSearch =
        !keyword ||
        row.nama_mitra.toLowerCase().includes(keyword) ||
        row.sobat_id.toLowerCase().includes(keyword);

      const matchStatus =
        statusFilter === 'Semua Status' ||
        (statusFilter === 'Aman' && row.status === 'aman') ||
        (statusFilter === 'Mendekati Limit' && row.status === 'peringatan') ||
        (statusFilter === 'Mencapai Limit' && row.status === 'mencapai') ||
        (statusFilter === 'Melebihi Limit' && row.status === 'melebihi');

      return matchSearch && matchStatus;
    });
  }, [mitraRows, searchKeyword, statusFilter]);

  const totalItems = filteredRows.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  const currentData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredRows.slice(start, start + itemsPerPage);
  }, [filteredRows, currentPage]);

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  // Ringkasan
  const totalMitra = mitraRows.length;
  const totalAlokasi = mitraRows.reduce((acc, row) => acc + row.alokasi, 0);
  const totalDicairkan = mitraRows.reduce((acc, row) => acc + row.dicairkan, 0);

  // =====================================================
  // 5. MODAL SIMPAN LIMIT
  // =====================================================
  const handleOpenLimitModal = () => {
    setFormData({
      batas_maksimal: limitInfo?.batas_maksimal || 3000000,
      persen_peringatan: limitInfo?.persen_peringatan || 80,
    });
    setIsModalOpen(true);
  };

  const handleSaveLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBulanPeriode) return;

    if (Number(formData.batas_maksimal) <= 0) {
      alert('Batas maksimal harus lebih dari 0.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (limitInfo) {
        const { error } = await supabase
          .from('limit_honor')
          .update({
            batas_maksimal: Number(formData.batas_maksimal),
            persen_peringatan: Number(formData.persen_peringatan),
          })
          .eq('id', limitInfo.id);

        if (error) throw error;
        alert(`Limit honor bulan ${selectedBulanPeriode} berhasil diperbarui.`);
      } else {
        const { error } = await supabase.from('limit_honor').insert([
          {
            bulan_periode: selectedBulanPeriode,
            batas_maksimal: Number(formData.batas_maksimal),
            persen_peringatan: Number(formData.persen_peringatan),
          },
        ]);

        if (error) throw error;
        alert(`Limit honor bulan ${selectedBulanPeriode} berhasil ditetapkan.`);
      }

      setIsModalOpen(false);
      await fetchLimitInfo();
    } catch (err: any) {
      console.error('Error saving limit_honor:', err);
      alert('Gagal menyimpan limit: ' + (err?.message || 'Terjadi kesalahan'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusBadge = (status: MitraLimitRow['status']) => {
    if (status === 'mencapai' || status === 'melebihi') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          {status === 'melebihi' ? 'Melebihi Limit' : 'Mencapai Limit'}
        </span>
      );
    }
    if (status === 'peringatan') {
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

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans">
      <Sidebar mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />

      <div className="min-h-screen lg:pl-[230px]">
        <Header title="Pengaturan Limit Honor Mitra" onMenuClick={() => setMobileSidebarOpen(true)} />

        <main className="p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1400px]">
            {/* JUDUL & PILIH BULAN PER BULAN */}
            <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
              <div>
                <h1 className="text-xl font-bold text-slate-800">
                  Akumulasi & Limit Honor Mitra (Bulanan)
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  Menampilkan total gabungan honor mitra dari seluruh kegiatan pada bulan spesifik yang dipilih.
                </p>
              </div>

              {/* DROPDOWN BULAN & TAHUN */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-600">Pilih Bulan:</label>
                <select
                  value={selectedBulanNama}
                  onChange={(e) => {
                    setSelectedBulanNama(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="py-2 px-3 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-blue-500"
                >
                  {BULAN_OPTIONS.map((bln) => (
                    <option key={bln} value={bln}>
                      {bln}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedTahun}
                  onChange={(e) => {
                    setSelectedTahun(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="py-2 px-3 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-blue-500"
                >
                  {tahunList.map((thn) => (
                    <option key={thn} value={thn}>
                      {thn}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* KARTU RINGKASAN */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-semibold text-slate-500 mb-3">Jumlah Mitra Aktif</span>
                <span className="text-xl font-extrabold text-slate-800">{totalMitra}</span>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-semibold text-slate-500 mb-3">
                  Limit SBM ({selectedBulanPeriode})
                </span>
                <span className="text-xl font-extrabold text-slate-800">
                  {loadingLimit ? '...' : limitInfo ? formatRupiah(limitInfo.batas_maksimal) : (
                    <span className="text-base text-slate-400 italic font-normal">Belum ditetapkan</span>
                  )}
                </span>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-semibold text-slate-500 mb-3">Total Akumulasi Alokasi</span>
                <span className="text-xl font-extrabold text-slate-800">{formatRupiah(totalAlokasi)}</span>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-semibold text-slate-500 mb-3">Total Dicairkan</span>
                <span className="text-xl font-extrabold text-emerald-500">{formatRupiah(totalDicairkan)}</span>
              </div>
            </div>

            {/* TOMBOL ATUR LIMIT */}
            <div className="mb-6">
              <button
                onClick={handleOpenLimitModal}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition"
              >
                <span>⚙️</span>
                {limitInfo ? `Ubah Limit Bulan (${selectedBulanPeriode})` : `Tetapkan Limit Bulan (${selectedBulanPeriode})`}
              </button>
            </div>

            {/* FILTER PENCARIAN */}
            <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 mb-4 flex flex-wrap gap-2.5 items-center justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[240px]">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400 text-xs">
                    🔍
                  </span>
                  <input
                    type="text"
                    placeholder="Cari Mitra (Nama / SOBAT ID)"
                    value={searchKeyword}
                    onChange={(e) => {
                      setSearchKeyword(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-blue-400"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="py-1.5 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400"
                >
                  <option value="Semua Status">Semua Status</option>
                  <option value="Aman">Aman</option>
                  <option value="Mendekati Limit">Mendekati Limit</option>
                  <option value="Melebihi Limit">Melebihi Limit</option>
                </select>
              </div>
            </div>

            {/* TABEL DATA */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50/50 border-b border-slate-200 font-bold text-slate-700">
                    <tr>
                      <th className="py-3.5 px-6 text-center w-16">No</th>
                      <th className="py-3.5 px-6">SOBAT ID</th>
                      <th className="py-3.5 px-6">Nama Mitra</th>
                      <th className="py-3.5 px-6">Limit Bulanan</th>
                      <th className="py-3.5 px-6">Total Akumulasi Honor</th>
                      <th className="py-3.5 px-6">Dicairkan</th>
                      <th className="py-3.5 px-6">Sisa Limit Bulanan</th>
                      <th className="py-3.5 px-6 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingRows ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400">
                          Memuat data akumulasi honor mitra bulan {selectedBulanPeriode}...
                        </td>
                      </tr>
                    ) : currentData.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400">
                          Belum ada penugasan mitra pada bulan {selectedBulanPeriode}.
                        </td>
                      </tr>
                    ) : (
                      currentData.map((item, index) => (
                        <tr
                          key={item.sobat_id || index}
                          className={`hover:bg-slate-50/60 transition ${
                            item.status === 'melebihi' ? 'bg-rose-50/40' : ''
                          }`}
                        >
                          <td className="py-4 px-6 text-center text-slate-400 font-medium">
                            {(currentPage - 1) * itemsPerPage + index + 1}
                          </td>
                          <td className="py-4 px-6 font-semibold text-blue-600">{item.sobat_id}</td>
                          <td className="py-4 px-6 font-semibold text-slate-800">{item.nama_mitra}</td>
                          <td className="py-4 px-6 text-slate-600 font-medium">
                            {limitInfo ? formatRupiah(limitInfo.batas_maksimal) : '-'}
                          </td>
                          <td className="py-4 px-6 font-bold text-slate-800">{formatRupiah(item.alokasi)}</td>
                          <td className="py-4 px-6 text-slate-600 font-medium">{formatRupiah(item.dicairkan)}</td>
                          <td
                            className={`py-4 px-6 font-medium ${
                              item.sisa <= 0 ? 'text-rose-600 font-semibold' : 'text-slate-600'
                            }`}
                          >
                            {limitInfo ? formatRupiah(item.sisa) : '-'}
                          </td>
                          <td className="py-4 px-6 text-center">{statusBadge(item.status)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* PAGINATION */}
              {filteredRows.length > 0 && (
                <div className="px-6 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-white">
                  <div className="text-xs text-slate-500">
                    Menampilkan <span className="font-semibold text-slate-700">{startItem}</span> -{' '}
                    <span className="font-semibold text-slate-700">{endItem}</span> dari{' '}
                    <span className="font-semibold text-slate-700">{totalItems}</span> mitra
                  </div>

                  <div className="flex items-center gap-1.5 text-xs">
                    <button
                      onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      ‹
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((page) => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                      .map((page, idx, array) => {
                        const prevPage = array[idx - 1];
                        const showEllipsis = prevPage && page - prevPage > 1;

                        return (
                          <React.Fragment key={page}>
                            {showEllipsis && <span className="px-1 text-slate-400">...</span>}
                            <button
                              onClick={() => setCurrentPage(page)}
                              className={`px-3 py-1 rounded font-medium transition ${
                                currentPage === page
                                  ? 'bg-blue-600 text-white border border-blue-600'
                                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {page}
                            </button>
                          </React.Fragment>
                        );
                      })}

                    <button
                      onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages || totalPages === 0}
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

      {/* MODAL LIMIT BULANAN */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm">
                {limitInfo ? 'Ubah Limit Bulanan' : 'Tetapkan Limit Bulanan'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveLimit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Periode Bulan</label>
                <input
                  type="text"
                  value={selectedBulanPeriode}
                  disabled
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-slate-600 font-semibold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Batas Maksimal Honor Bulanan (Rp) *</label>
                <input
                  type="number"
                  min={1}
                  value={formData.batas_maksimal}
                  onChange={(e) => setFormData({ ...formData, batas_maksimal: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-semibold text-slate-800"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ambang Peringatan (%) *</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={formData.persen_peringatan}
                  onChange={(e) => setFormData({ ...formData, persen_peringatan: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-semibold transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-sm transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}