'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface KegiatanDetail {
  id: number;
  nama_kegiatan: string;
  bulan_kegiatan?: string;
  pagu_anggaran?: number;
}

interface MitraPenugasan {
  id: string;
  nama_mitra: string;
  limit_bulanan: number | null; // null = belum diatur di tabel limit_honor
  hak_honor: number;
}

interface RiwayatPencairan {
  id: number;
  tgl_pencairan: string;
  catatan?: string;
  bulan_pencairan?: string;
  nominal_dicairkan: number;
}

export default function DetailKegiatanPage() {
  const params = useParams();
  const router = useRouter();

  const rawId = params?.id;
  const kegiatanId = Array.isArray(rawId) ? rawId[0] : rawId;

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'mitra' | 'riwayat'>('mitra');
  const [loading, setLoading] = useState<boolean>(true);

  const [kegiatan, setKegiatan] = useState<KegiatanDetail | null>(null);
  const [mitraList, setMitraList] = useState<MitraPenugasan[]>([]);
  const [pencairanList, setPencairanList] = useState<RiwayatPencairan[]>([]);

  // Pagination untuk masing-masing tab (independen satu sama lain)
  const [mitraPage, setMitraPage] = useState<number>(1);
  const [riwayatPage, setRiwayatPage] = useState<number>(1);
  const itemsPerPage = 10;

  const fetchDetailKegiatan = useCallback(async () => {
    if (!kegiatanId) return;
    setLoading(true);

    try {
      const targetId = Number(kegiatanId);

      // 1. Fetch Detail Kegiatan
      const { data: dataKegiatan, error: errKegiatan } = await supabase
        .from('kegiatan')
        .select('id, nama_kegiatan, bulan_kegiatan, pagu_anggaran')
        .eq('id', targetId)
        .maybeSingle();

      if (errKegiatan) {
        console.error('Error fetching kegiatan:', errKegiatan.message);
      }
      if (dataKegiatan) {
        setKegiatan(dataKegiatan);
      }

      // 2. Fetch Penugasan & Mitra khusus untuk kegiatanId ini saja
      const { data: dataPenugasan, error: errPenugasan } = await supabase
        .from('penugasan')
        .select(`
          id,
          total_honor,
          sobat_id,
          mitra!inner (
            sobat_id,
            nama_mitra
          )
        `)
        .eq('kegiatan_id', targetId);

      if (errPenugasan) {
        console.error('Gagal fetch penugasan:', errPenugasan.message);
        setMitraList([]);
        setPencairanList([]);
      } else if (dataPenugasan && dataPenugasan.length > 0) {
        // 2b. Fetch limit_honor berdasarkan PERIODE (bulan_kegiatan), BUKAN kegiatan_id.
        // Limit honor bersifat bulanan & berlaku sama untuk semua mitra/kegiatan pada
        // periode yang sama — ini kunci yang sama dipakai di halaman Pengaturan Limit
        // dan halaman Penugasan.
        let limitBulanIni: number | null = null;
        const periodeKegiatan = dataKegiatan?.bulan_kegiatan?.trim() || '';

        if (periodeKegiatan) {
          const { data: limitRow, error: errLimit } = await supabase
            .from('limit_honor')
            .select('batas_maksimal')
            .eq('bulan_periode', periodeKegiatan)
            .maybeSingle();

          if (errLimit) {
            console.error('Error fetching limit_honor:', errLimit.message);
          } else if (limitRow && limitRow.batas_maksimal !== undefined) {
            limitBulanIni = Number(limitRow.batas_maksimal);
          }
        }

        // Format list mitra yang benar-benar ditugaskan
        const formattedMitra: MitraPenugasan[] = dataPenugasan.map((item: any) => {
          const dataMitra = Array.isArray(item.mitra) ? item.mitra[0] : item.mitra;
          const sobatId = dataMitra?.sobat_id || item.sobat_id || String(item.id);
          return {
            id: sobatId,
            nama_mitra: dataMitra?.nama_mitra || 'Tanpa Nama',
            limit_bulanan: limitBulanIni,
            hak_honor: Number(item.total_honor) || 0,
          };
        });

        setMitraList(formattedMitra);
        setMitraPage(1);

        // Ambil daftar penugasan_id untuk fetching pencairan
        const penugasanIds = dataPenugasan.map((item: any) => item.id);

        // 3. Fetch Pencairan Honor berdasarkan penugasan_id
        const { data: dataPencairan, error: errPencairan } = await supabase
          .from('pencairan_honor')
          .select('id, tgl_pencairan, catatan, bulan_pencairan, nominal_dicairkan')
          .in('penugasan_id', penugasanIds)
          .order('tgl_pencairan', { ascending: false });

        if (errPencairan) {
          console.error('Error fetching pencairan_honor:', errPencairan.message);
          setPencairanList([]);
        } else if (dataPencairan) {
          setPencairanList(dataPencairan);
          setRiwayatPage(1);
        }
      } else {
        // Jika belum ada penugasan sama sekali pada kegiatan ini
        setMitraList([]);
        setPencairanList([]);
        setMitraPage(1);
        setRiwayatPage(1);
      }
    } catch (err: any) {
      console.error('Detail Error:', err?.message || err);
    } finally {
      setLoading(false);
    }
  }, [kegiatanId]);

  useEffect(() => {
    fetchDetailKegiatan();
  }, [fetchDetailKegiatan]);

  // Kalkulasi Ringkasan
  const totalPagu = kegiatan?.pagu_anggaran ?? 0;
  const totalTerpakai = useMemo(() => {
    return mitraList.reduce((acc, curr) => acc + (curr.hak_honor || 0), 0);
  }, [mitraList]);
  const sisaAnggaran = totalPagu - totalTerpakai;
  const jumlahMitra = mitraList.length;

  // Logika Pagination - Tab Mitra Ditugaskan
  const totalMitraPages = Math.ceil(mitraList.length / itemsPerPage) || 1;
  const currentMitraData = useMemo(() => {
    const start = (mitraPage - 1) * itemsPerPage;
    return mitraList.slice(start, start + itemsPerPage);
  }, [mitraList, mitraPage]);
  const mitraStartItem = mitraList.length === 0 ? 0 : (mitraPage - 1) * itemsPerPage + 1;
  const mitraEndItem = Math.min(mitraPage * itemsPerPage, mitraList.length);

  // Logika Pagination - Tab Riwayat Pencairan
  const totalRiwayatPages = Math.ceil(pencairanList.length / itemsPerPage) || 1;
  const currentRiwayatData = useMemo(() => {
    const start = (riwayatPage - 1) * itemsPerPage;
    return pencairanList.slice(start, start + itemsPerPage);
  }, [pencairanList, riwayatPage]);
  const riwayatStartItem = pencairanList.length === 0 ? 0 : (riwayatPage - 1) * itemsPerPage + 1;
  const riwayatEndItem = Math.min(riwayatPage * itemsPerPage, pencairanList.length);

  // Komponen pagination footer
  const renderPaginationFooter = (
    startItem: number,
    endItem: number,
    totalItems: number,
    currentPage: number,
    totalPages: number,
    onPageChange: (page: number) => void
  ) => (
    <div className="px-6 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-white">
      <div className="text-xs text-slate-500">
        Menampilkan <span className="font-semibold text-slate-700">{startItem}</span> -{' '}
        <span className="font-semibold text-slate-700">{endItem}</span> dari{' '}
        <span className="font-semibold text-slate-700">{totalItems}</span> data
      </div>

      <div className="flex items-center gap-1.5 text-xs">
        <button
          onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
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
                  onClick={() => onPageChange(page)}
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
          onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
          disabled={currentPage === totalPages || totalPages === 0}
          className="px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          ›
        </button>
      </div>
    </div>
  );

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans">
      <Sidebar mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />

      <div className="min-h-screen lg:pl-[230px]">
        <Header title="Detail Kegiatan" onMenuClick={() => setMobileSidebarOpen(true)} />

        <main className="p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1400px]">
            {/* KEMBALI */}
            <button
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-900 hover:text-indigo-700 mb-4 transition"
            >
              <span>←</span> Kembali
            </button>

            {/* HEADER DETAIL */}
            <div className="flex items-center gap-3 mb-6">
              <h1 className="text-xl font-bold text-slate-800">
                {loading ? 'Memuat...' : kegiatan?.nama_kegiatan || 'Kegiatan Tidak Ditemukan'}
              </h1>
              {kegiatan?.bulan_kegiatan && (
                <span className="px-2.5 py-0.5 bg-purple-100 text-purple-600 text-[11px] font-semibold rounded-full uppercase tracking-wider">
                  {kegiatan.bulan_kegiatan}
                </span>
              )}
            </div>

            {/* CARD METRIK */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-semibold text-slate-500 mb-3">Total Pagu</span>
                <span className="text-xl font-extrabold text-slate-800">{formatRupiah(totalPagu)}</span>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-semibold text-slate-500 mb-3">Terpakai</span>
                <span className="text-xl font-extrabold text-slate-800">{formatRupiah(totalTerpakai)}</span>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-semibold text-slate-500 mb-3">Sisa Anggaran</span>
                <span className="text-xl font-extrabold text-emerald-500">{formatRupiah(sisaAnggaran)}</span>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-semibold text-slate-500 mb-3">Jumlah Mitra</span>
                <span className="text-xl font-extrabold text-slate-800">{jumlahMitra}</span>
              </div>
            </div>

            {/* TAB NAVIGASI */}
            <div className="border-b border-slate-200 mb-6 flex gap-8">
              <button
                onClick={() => setActiveTab('mitra')}
                className={`pb-3 text-xs font-semibold transition relative ${
                  activeTab === 'mitra'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                1. Mitra Ditugaskan
              </button>
              <button
                onClick={() => setActiveTab('riwayat')}
                className={`pb-3 text-xs font-semibold transition relative ${
                  activeTab === 'riwayat'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                2. Riwayat Pencairan
              </button>
            </div>

            {/* TAB 1: MITRA DITUGASKAN */}
            {activeTab === 'mitra' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50/50 border-b border-slate-200 font-bold text-slate-700">
                      <tr>
                        <th className="py-3.5 px-6 text-center w-16">No</th>
                        <th className="py-3.5 px-6">Nama Mitra</th>
                        <th className="py-3.5 px-6">Limit Bulanan</th>
                        <th className="py-3.5 px-6">Hak Honor (Alokasi)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loading ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-400">
                            Memuat data penugasan mitra...
                          </td>
                        </tr>
                      ) : mitraList.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-400">
                            Belum ada mitra yang ditugaskan pada kegiatan ini.
                          </td>
                        </tr>
                      ) : (
                        currentMitraData.map((item, index) => (
                          <tr key={item.id || index} className="hover:bg-slate-50/60 transition">
                            <td className="py-4 px-6 text-center text-slate-400 font-medium">
                              {(mitraPage - 1) * itemsPerPage + index + 1}
                            </td>
                            <td className="py-4 px-6 font-semibold text-slate-800">
                              {item.nama_mitra}
                            </td>
                            <td className="py-4 px-6 text-slate-600 font-medium">
                              {item.limit_bulanan !== null ? (
                                formatRupiah(item.limit_bulanan)
                              ) : (
                                <span className="text-slate-400 italic font-normal">Belum diatur</span>
                              )}
                            </td>
                            <td className="py-4 px-6 text-slate-600 font-medium">
                              {formatRupiah(item.hak_honor)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {mitraList.length > 0 &&
                  renderPaginationFooter(
                    mitraStartItem,
                    mitraEndItem,
                    mitraList.length,
                    mitraPage,
                    totalMitraPages,
                    setMitraPage
                  )}
              </div>
            )}

            {/* TAB 2: RIWAYAT PENCAIRAN */}
            {activeTab === 'riwayat' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50/50 border-b border-slate-200 font-bold text-slate-700">
                      <tr>
                        <th className="py-3.5 px-6 text-center w-16">No</th>
                        <th className="py-3.5 px-6">Tanggal Pencairan</th>
                        <th className="py-3.5 px-6">Catatan / Keterangan</th>
                        <th className="py-3.5 px-6">Nominal Dicairkan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loading ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-400">
                            Memuat riwayat pencairan...
                          </td>
                        </tr>
                      ) : pencairanList.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-400">
                            Belum ada riwayat pencairan untuk kegiatan ini.
                          </td>
                        </tr>
                      ) : (
                        currentRiwayatData.map((item, index) => (
                          <tr key={item.id || index} className="hover:bg-slate-50/60 transition">
                            <td className="py-4 px-6 text-center text-slate-400 font-medium">
                              {(riwayatPage - 1) * itemsPerPage + index + 1}
                            </td>
                            <td className="py-4 px-6 text-slate-800 font-semibold">
                              {item.tgl_pencairan || '-'}
                            </td>
                            <td className="py-4 px-6 text-slate-600">
                              {item.catatan || item.bulan_pencairan || '-'}
                            </td>
                            <td className="py-4 px-6 text-emerald-600 font-semibold">
                              {formatRupiah(Number(item.nominal_dicairkan) || 0)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {pencairanList.length > 0 &&
                  renderPaginationFooter(
                    riwayatStartItem,
                    riwayatEndItem,
                    pencairanList.length,
                    riwayatPage,
                    totalRiwayatPages,
                    setRiwayatPage
                  )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
