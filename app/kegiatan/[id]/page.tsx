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
  limit_bulanan: number | null;
  detail_limit_per_bulan?: { bulan: string; limit: number }[];
  hak_honor: number;
}

interface RiwayatPencairan {
  id: number;
  tgl_pencairan: string;
  catatan?: string;
  bulan_pencairan?: string;
  nominal_dicairkan: number;
  sobat_id?: string;
  nama_mitra?: string;
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

      // Ambil bulan kegiatan dari data lokal hasil fetch
      let limitBulanIni: number | null = null;
      let detailLimitPerBulan: { bulan: string; limit: number }[] = [];
      const bulanKegiatanVal = dataKegiatan?.bulan_kegiatan;

      if (bulanKegiatanVal) {
        const bulanKegiatanStr = bulanKegiatanVal.toLowerCase();

        const { data: allLimits, error: errAllLimit } = await supabase
          .from('limit_honor')
          .select('bulan_periode, batas_maksimal');

        if (!errAllLimit && allLimits) {
          const daftarBulan = [
            'januari', 'februari', 'maret', 'april', 'mei', 'juni',
            'juli', 'agustus', 'september', 'oktober', 'november', 'desember'
          ];

          if (bulanKegiatanStr.includes('s.d.')) {
            const parts = bulanKegiatanStr.split('s.d.');
            const startMonthStr = parts[0]?.trim() || '';
            const endMonthStr = parts[1]?.trim() || '';

            const startIndex = daftarBulan.findIndex(b => startMonthStr.includes(b));
            const endIndex = daftarBulan.findIndex(b => endMonthStr.includes(b));

            if (startIndex !== -1 && endIndex !== -1 && startIndex <= endIndex) {
              const activeMonths = daftarBulan.slice(startIndex, endIndex + 1);

              activeMonths.forEach(mName => {
                const foundMatch = allLimits.find(item => 
                  item.bulan_periode && item.bulan_periode.toLowerCase().includes(mName)
                );
                if (foundMatch) {
                  detailLimitPerBulan.push({
                    bulan: foundMatch.bulan_periode,
                    limit: Number(foundMatch.batas_maksimal) || 0
                  });
                }
              });

              // Default limitBulanIni diambil dari bulan pertama di rentang jika dibutuhkan untuk tampilan tunggal
              if (detailLimitPerBulan.length > 0) {
                limitBulanIni = detailLimitPerBulan[0].limit;
              }
            } else {
              const matchedLimits = allLimits.filter((item) => 
                item.bulan_periode && bulanKegiatanStr.includes(item.bulan_periode.toLowerCase())
              );
              if (matchedLimits.length > 0) {
                limitBulanIni = Number(matchedLimits[0].batas_maksimal) || 0;
                detailLimitPerBulan = matchedLimits.map(item => ({
                  bulan: item.bulan_periode,
                  limit: Number(item.batas_maksimal) || 0
                }));
              }
            }
          } else {
            const found = allLimits.find((item) => 
              item.bulan_periode && bulanKegiatanStr.includes(item.bulan_periode.toLowerCase())
            );

            if (found) {
              limitBulanIni = Number(found.batas_maksimal) || 0;
              detailLimitPerBulan = [{
                bulan: found.bulan_periode,
                limit: limitBulanIni
              }];
            }
          }
        }
      }

      if (errPenugasan) {
        console.error('Gagal fetch penugasan:', errPenugasan.message);
        setMitraList([]);
        setPencairanList([]);
      } else if (dataPenugasan && dataPenugasan.length > 0) {
        // Map penugasan_id -> info mitra, dipakai untuk melengkapi riwayat pencairan
        const mitraByPenugasanId: Record<number, { sobatId: string; namaMitra: string }> = {};

        const formattedMitra: MitraPenugasan[] = dataPenugasan.map((item: any) => {
          const dataMitra = Array.isArray(item.mitra) ? item.mitra[0] : item.mitra;
          const sobatId = dataMitra?.sobat_id || item.sobat_id || String(item.id);
          const namaMitra = dataMitra?.nama_mitra || 'Tanpa Nama';

          mitraByPenugasanId[item.id] = { sobatId, namaMitra };

          return {
            id: sobatId,
            nama_mitra: namaMitra,
            limit_bulanan: limitBulanIni,
            detail_limit_per_bulan: detailLimitPerBulan,
            hak_honor: Number(item.total_honor) || 0,
          };
        });

        setMitraList(formattedMitra);
        setMitraPage(1);

        const penugasanIds = dataPenugasan.map((item: any) => item.id);

        const { data: dataPencairan, error: errPencairan } = await supabase
          .from('pencairan_honor')
          .select('id, tgl_pencairan, catatan, bulan_pencairan, nominal_dicairkan, penugasan_id, sobat_id')
          .in('penugasan_id', penugasanIds)
          .order('tgl_pencairan', { ascending: false });

        if (errPencairan) {
          console.error('Error fetching pencairan_honor:', errPencairan.message);
          setPencairanList([]);
        } else if (dataPencairan) {
          // Lengkapi setiap baris riwayat pencairan dengan nama mitra & SOBAT ID
          // dari penugasan terkait (pencairan_honor sendiri hanya menyimpan sobat_id mentah).
          const enrichedPencairan: RiwayatPencairan[] = dataPencairan.map((item: any) => {
            const info = mitraByPenugasanId[item.penugasan_id];
            return {
              id: item.id,
              tgl_pencairan: item.tgl_pencairan,
              catatan: item.catatan,
              bulan_pencairan: item.bulan_pencairan,
              nominal_dicairkan: item.nominal_dicairkan,
              sobat_id: info?.sobatId || item.sobat_id || '-',
              nama_mitra: info?.namaMitra || '-',
            };
          });
          setPencairanList(enrichedPencairan);
          setRiwayatPage(1);
        }
      } else {
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

  const totalPagu = kegiatan?.pagu_anggaran ?? 0;
  const totalTerpakai = useMemo(() => {
    return mitraList.reduce((acc, curr) => acc + (curr.hak_honor || 0), 0);
  }, [mitraList]);
  const sisaAnggaran = totalPagu - totalTerpakai;
  const jumlahMitra = mitraList.length;

  const totalMitraPages = Math.ceil(mitraList.length / itemsPerPage) || 1;
  const currentMitraData = useMemo(() => {
    const start = (mitraPage - 1) * itemsPerPage;
    return mitraList.slice(start, start + itemsPerPage);
  }, [mitraList, mitraPage]);
  const mitraStartItem = mitraList.length === 0 ? 0 : (mitraPage - 1) * itemsPerPage + 1;
  const mitraEndItem = Math.min(mitraPage * itemsPerPage, mitraList.length);

  const totalRiwayatPages = Math.ceil(pencairanList.length / itemsPerPage) || 1;
  const currentRiwayatData = useMemo(() => {
    const start = (riwayatPage - 1) * itemsPerPage;
    return pencairanList.slice(start, start + itemsPerPage);
  }, [pencairanList, riwayatPage]);
  const riwayatStartItem = pencairanList.length === 0 ? 0 : (riwayatPage - 1) * itemsPerPage + 1;
  const riwayatEndItem = Math.min(riwayatPage * itemsPerPage, pencairanList.length);

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

  const formatTanggalPendek = (val?: string) => {
    if (!val) return '-';
    try {
      return new Date(val).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return val;
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans">
      <Sidebar mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />

      <div className="min-h-screen lg:pl-[230px]">
        <Header title="Detail Kegiatan" onMenuClick={() => setMobileSidebarOpen(true)} />

        <main className="p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1400px]">
            <button
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-900 hover:text-indigo-700 mb-4 transition"
            >
              <span>←</span> Kembali
            </button>

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
                            <td className="py-4 px-6 font-semibold text-slate-800 align-top">
                              {item.nama_mitra}
                            </td>
                            <td className="py-4 px-6 text-slate-600 font-medium align-top">
                              {item.detail_limit_per_bulan && item.detail_limit_per_bulan.length > 0 ? (
                                item.detail_limit_per_bulan.length > 1 ? (
                                  // Rentang lebih dari 1 bulan -> tampilkan sebagai chip horizontal yang rapi
                                  <div className="flex flex-wrap gap-1.5 max-w-md">
                                    {item.detail_limit_per_bulan.map((dl, idx) => (
                                      <div
                                        key={idx}
                                        className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 rounded-full pl-2 pr-2.5 py-1"
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                                        <span className="text-[9.5px] font-bold text-indigo-500 uppercase tracking-wide whitespace-nowrap">
                                          {dl.bulan}
                                        </span>
                                        <span className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                                          {formatRupiah(dl.limit)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  // Hanya 1 bulan -> tampilan sederhana, tidak perlu chip
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-semibold uppercase">
                                      {item.detail_limit_per_bulan[0].bulan}
                                    </span>
                                    <span>{formatRupiah(item.detail_limit_per_bulan[0].limit)}</span>
                                  </div>
                                )
                              ) : item.limit_bulanan !== null ? (
                                formatRupiah(item.limit_bulanan)
                              ) : (
                                <span className="text-slate-400 italic font-normal">Belum diatur</span>
                              )}
                            </td>
                            <td className="py-4 px-6 text-slate-600 font-medium align-top">
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

            {activeTab === 'riwayat' && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50/50 border-b border-slate-200 font-bold text-slate-700">
                      <tr>
                        <th className="py-3.5 px-6 text-center w-16">No</th>
                        <th className="py-3.5 px-6">Mitra / SOBAT ID</th>
                        <th className="py-3.5 px-6">Tanggal Pencairan</th>
                        <th className="py-3.5 px-6">Catatan / Keterangan</th>
                        <th className="py-3.5 px-6">Nominal Dicairkan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loading ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400">
                            Memuat riwayat pencairan...
                          </td>
                        </tr>
                      ) : pencairanList.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400">
                            Belum ada riwayat pencairan untuk kegiatan ini.
                          </td>
                        </tr>
                      ) : (
                        currentRiwayatData.map((item, index) => (
                          <tr key={item.id || index} className="hover:bg-slate-50/60 transition">
                            <td className="py-4 px-6 text-center text-slate-400 font-medium">
                              {(riwayatPage - 1) * itemsPerPage + index + 1}
                            </td>
                            <td className="py-4 px-6">
                              <div className="font-semibold text-slate-800">{item.nama_mitra || '-'}</div>
                              <div className="text-[10px] font-mono text-blue-600">{item.sobat_id || '-'}</div>
                            </td>
                            <td className="py-4 px-6 text-slate-800 font-semibold">
                              {formatTanggalPendek(item.tgl_pencairan)}
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
