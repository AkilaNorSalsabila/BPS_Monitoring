'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';

// Initializing Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface KegiatanData {
  id: string;
  kode_kegiatan: string;
  nama_kegiatan: string;
  bulan_kegiatan: string;
  pagu_anggaran: number;
}

export default function KegiatanPage() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [kegiatanList, setKegiatanList] = useState<KegiatanData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // State Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);

  // State Modal Form
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form State
  const [formData, setFormData] = useState({
    kode_kegiatan: '',
    nama_kegiatan: '',
    bulan_kegiatan: 'Agustus 2026',
    pagu_anggaran: 0,
  });

  // Format Rupiah
  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  // Fetch Data Kegiatan dari Supabase
  const fetchKegiatan = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('kegiatan').select('*').order('created_at', { ascending: false });

      if (searchKeyword) {
        query = query.or(`nama_kegiatan.ilike.%${searchKeyword}%,kode_kegiatan.ilike.%${searchKeyword}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      setKegiatanList(data || []);
      setCurrentPage(1);
    } catch (err: any) {
      console.error('Error fetching kegiatan:', err);
    } finally {
      setLoading(false);
    }
  }, [searchKeyword]);

  useEffect(() => {
    fetchKegiatan();
  }, [fetchKegiatan]);

  // Logika Pagination Data
  const totalItems = kegiatanList.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  const currentData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return kegiatanList.slice(start, start + itemsPerPage);
  }, [kegiatanList, currentPage, itemsPerPage]);

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  // Open Modal Tambah
  const handleOpenAddModal = () => {
    setIsEditMode(false);
    setSelectedId(null);
    setFormData({
      kode_kegiatan: `KED-00${kegiatanList.length + 1}`,
      nama_kegiatan: '',
      bulan_kegiatan: 'Agustus 2026',
      pagu_anggaran: 0,
    });
    setIsModalOpen(true);
  };

  // Open Modal Edit
  const handleOpenEditModal = (item: KegiatanData) => {
    setIsEditMode(true);
    setSelectedId(item.id);
    setFormData({
      kode_kegiatan: item.kode_kegiatan,
      nama_kegiatan: item.nama_kegiatan,
      bulan_kegiatan: item.bulan_kegiatan || 'Agustus 2026',
      pagu_anggaran: item.pagu_anggaran || 0,
    });
    setIsModalOpen(true);
  };

  // Simpan Form Data (Tambah / Edit)
  const handleSaveKegiatan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nama_kegiatan.trim()) {
      alert('Nama Kegiatan wajib diisi!');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditMode && selectedId) {
        const { error } = await supabase
          .from('kegiatan')
          .update({
            kode_kegiatan: formData.kode_kegiatan,
            nama_kegiatan: formData.nama_kegiatan,
            bulan_kegiatan: formData.bulan_kegiatan,
            pagu_anggaran: Number(formData.pagu_anggaran),
          })
          .eq('id', selectedId);

        if (error) throw error;
        alert('Kegiatan berhasil diperbarui.');
      } else {
        const { error } = await supabase.from('kegiatan').insert([
          {
            kode_kegiatan: formData.kode_kegiatan,
            nama_kegiatan: formData.nama_kegiatan,
            bulan_kegiatan: formData.bulan_kegiatan,
            pagu_anggaran: Number(formData.pagu_anggaran),
          },
        ]);

        if (error) throw error;
        alert('Kegiatan baru berhasil ditambahkan.');
      }

      setIsModalOpen(false);
      fetchKegiatan();
    } catch (err: any) {
      console.error('Error saving kegiatan:', err);
      alert('Gagal menyimpan kegiatan: ' + (err.message || 'Terjadi kesalahan'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Hapus Kegiatan
  const handleDeleteKegiatan = async (id: string, nama: string) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus kegiatan "${nama}"?`)) return;

    try {
      const { error } = await supabase.from('kegiatan').delete().eq('id', id);
      if (error) throw error;

      alert('Kegiatan berhasil dihapus.');
      fetchKegiatan();
    } catch (err: any) {
      console.error('Error deleting kegiatan:', err);
      alert('Gagal menghapus kegiatan: ' + (err.message || 'Terjadi kesalahan'));
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans">
      <Sidebar mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />

      <div className="min-h-screen lg:pl-[230px]">
        <Header onMenuClick={() => setMobileSidebarOpen(true)} />

        <main className="p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1400px]">
            {/* JUDUL HALAMAN */}
            <h1 className="text-xl font-bold text-slate-800 mb-6">Data Kegiatan</h1>

            {/* SEARCH & TOMBOL TAMBAH KEGIATAN */}
            <div className="mb-6 flex flex-wrap justify-between items-center gap-4">
              <div className="relative w-full max-w-sm">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400 text-sm">
                  🔍
                </span>
                <input
                  type="text"
                  placeholder="Cari Kegiatan"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 shadow-sm"
                />
              </div>

              <button
                onClick={handleOpenAddModal}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition"
              >
                <span>➕</span> Tambah Kegiatan
              </button>
            </div>

            {/* TABEL DATA KEGIATAN */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50/50 border-b border-slate-200 font-bold text-slate-700">
                    <tr>
                      <th className="py-3.5 px-6 text-center w-16">No</th>
                      <th className="py-3.5 px-6">Kode</th>
                      <th className="py-3.5 px-6">Nama Kegiatan</th>
                      <th className="py-3.5 px-6">Periode</th>
                      <th className="py-3.5 px-6">Pagu Anggaran</th>
                      <th className="py-3.5 px-6 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          Memuat data kegiatan...
                        </td>
                      </tr>
                    ) : currentData.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          Belum ada data kegiatan. Klik tombol <strong>Tambah Kegiatan</strong> untuk membuat baru.
                        </td>
                      </tr>
                    ) : (
                      currentData.map((item, index) => (
                        <tr key={item.id || index} className="hover:bg-slate-50/60 transition">
                          <td className="py-4 px-6 text-center font-medium text-slate-400">
                            {(currentPage - 1) * itemsPerPage + index + 1}
                          </td>
                          <td className="py-4 px-6 font-medium text-slate-600">{item.kode_kegiatan}</td>
                          <td className="py-4 px-6 font-semibold text-slate-800">{item.nama_kegiatan}</td>
                          <td className="py-4 px-6 text-slate-600">{item.bulan_kegiatan || 'Agustus 2026'}</td>
                          <td className="py-4 px-6 font-semibold text-slate-800">
                            {formatRupiah(item.pagu_anggaran || 0)}
                          </td>
                          <td className="py-4 px-6 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {/* View Detail */}
                              <Link
                                href={`/kegiatan/${item.id}`}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-md transition"
                                title="Lihat Detail"
                              >
                                👁️
                              </Link>
                              {/* Edit */}
                              <button
                                onClick={() => handleOpenEditModal(item)}
                                className="p-1.5 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-md transition"
                                title="Edit Kegiatan"
                              >
                                ✏️
                              </button>
                              {/* Delete */}
                              <button
                                onClick={() => handleDeleteKegiatan(item.id, item.nama_kegiatan)}
                                className="p-1.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-md transition"
                                title="Hapus Kegiatan"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* PAGINATION FOOTER */}
              <div className="px-6 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-white">
                <div className="text-xs text-slate-500">
                  Menampilkan <span className="font-semibold text-slate-700">{startItem}</span> -{' '}
                  <span className="font-semibold text-slate-700">{endItem}</span> dari{' '}
                  <span className="font-semibold text-slate-700">{totalItems}</span> data
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
            </div>
          </div>
        </main>
      </div>

      {/* MODAL FORM TAMBAH / EDIT KEGIATAN */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm">
                {isEditMode ? 'Edit Data Kegiatan' : 'Tambah Kegiatan Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveKegiatan} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Kode Kegiatan *</label>
                <input
                  type="text"
                  value={formData.kode_kegiatan}
                  onChange={(e) => setFormData({ ...formData, kode_kegiatan: e.target.value })}
                  placeholder="KED-001"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Kegiatan *</label>
                <input
                  type="text"
                  value={formData.nama_kegiatan}
                  onChange={(e) => setFormData({ ...formData, nama_kegiatan: e.target.value })}
                  placeholder="Contoh: Pendataan Sosial"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Periode Bulan/Tahun</label>
                <input
                  type="text"
                  value={formData.bulan_kegiatan}
                  onChange={(e) => setFormData({ ...formData, bulan_kegiatan: e.target.value })}
                  placeholder="Contoh: Agustus 2026"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Pagu Anggaran (Rp) *</label>
                <input
                  type="number"
                  value={formData.pagu_anggaran}
                  onChange={(e) => setFormData({ ...formData, pagu_anggaran: Number(e.target.value) })}
                  placeholder="150000000"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-semibold text-slate-800"
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
                  {isSubmitting ? 'Menyimpan...' : 'Simpan Kegiatan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}