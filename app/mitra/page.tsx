'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';

// Initializing Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface MitraData {
  sobat_id: string;
  nama_mitra: string;
  posisi_mitra?: string;
  alamat?: string;
  kab_kota?: string;
  no_hp?: string;
  email?: string;
  status_keaktifan?: string;
}

export default function MitraPage() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mitraList, setMitraList] = useState<MitraData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('Semua Status');
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // State Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);

  // State Modal Tambah / Edit
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // State Form
  const [formData, setFormData] = useState<MitraData>({
    sobat_id: '',
    nama_mitra: '',
    posisi_mitra: '',
    alamat: '',
    kab_kota: '',
    no_hp: '',
    email: '',
    status_keaktifan: 'Aktif',
  });

  // Fetch Data Mitra dari Supabase
  const fetchMitra = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('mitra').select('*').order('created_at', { ascending: false });

      if (searchKeyword) {
        query = query.or(`nama_mitra.ilike.%${searchKeyword}%,sobat_id.ilike.%${searchKeyword}%`);
      }

      if (statusFilter !== 'Semua Status') {
        query = query.eq('status_keaktifan', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      setMitraList(data || []);
      setCurrentPage(1); // Reset ke halaman 1 saat filter/pencarian berubah
    } catch (err: any) {
      console.error('Error fetching mitra:', err);
    } finally {
      setLoading(false);
    }
  }, [searchKeyword, statusFilter]);

  useEffect(() => {
    fetchMitra();
  }, [fetchMitra]);

  // Logika Pagination Data
  const totalItems = mitraList.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  const currentData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return mitraList.slice(start, start + itemsPerPage);
  }, [mitraList, currentPage, itemsPerPage]);

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  // Handle Unggah File Excel Otomatisasi (Mitra -> Kegiatan -> Penugasan)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const buffer = evt.target?.result;
        if (!buffer) throw new Error('Gagal membaca file');

        // Membaca array buffer dari FileReader
        const wb = XLSX.read(buffer, { type: 'array' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];

        const rawData: any[] = XLSX.utils.sheet_to_json(ws);

        // 1. Mapping Kolom Excel Export BPS ke Field Supabase
        const formattedData: MitraData[] = rawData
          .map((row) => ({
            sobat_id: String(row['SOBAT ID'] || row['Sobat ID'] || row['sobat_id'] || '').trim(),
            nama_mitra: String(row['Nama Lengkap'] || row['Nama'] || row['nama_mitra'] || '').trim(),
            posisi_mitra: String(row['Posisi'] || row['posisi_mitra'] || '').trim(),
            alamat: String(row['Alamat Detail'] || row['Alamat'] || '').trim(),
            kab_kota: String(row['Alamat Kab/Kota'] || row['Kab/Kota'] || '').trim(),
            no_hp: String(row['No Telp'] || row['no_hp'] || '').trim(),
            email: String(row['Email'] || row['email'] || '').trim(),
            status_keaktifan: 'Aktif',
          }))
          .filter((item) => item.sobat_id && item.nama_mitra);

        if (formattedData.length === 0) {
          alert('Data kosong atau nama header kolom Excel tidak sesuai.');
          setIsUploading(false);
          return;
        }

        // Filter unik sobat_id untuk mencegah error konflik saat batch upsert
        const uniqueMitraMap = new Map<string, MitraData>();
        formattedData.forEach((item) => uniqueMitraMap.set(item.sobat_id, item));
        const uniqueFormattedData = Array.from(uniqueMitraMap.values());

        // 2. Upsert ke tabel 'mitra'
        const { error: errMitra } = await supabase
          .from('mitra')
          .upsert(uniqueFormattedData, { onConflict: 'sobat_id' });

        if (errMitra) throw errMitra;

        // 3. Ekstrak Nama Kegiatan dari Judul File Excel
        const namaKegiatan = file.name.split('-')[0].trim().toUpperCase();

        // 4. Cari atau Buat Record Baru di Tabel 'kegiatan'
        let kegiatanId: number | null = null;

        const { data: existingKegiatan } = await supabase
          .from('kegiatan')
          .select('id')
          .eq('nama_kegiatan', namaKegiatan)
          .maybeSingle();

        if (existingKegiatan) {
          kegiatanId = existingKegiatan.id;
        } else {
          // Hitung total data kegiatan saat ini untuk menentukan nomor urut selanjutnya
          const { count } = await supabase
            .from('kegiatan')
            .select('*', { count: 'exact', head: true });

          const nextNumber = (count || 0) + 1;
          const kodeBaru = `KED-${nextNumber}`; // Menghasilkan KED-1 jika data masih kosong/pertama

          const { data: newKegiatan, error: errKeg } = await supabase
            .from('kegiatan')
            .insert({
              nama_kegiatan: namaKegiatan,
              kode_kegiatan: kodeBaru,
              bulan_kegiatan: new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
              keterangan: 'Otomatis diimpor dari file Excel Mitra',
              pagu_anggaran: 0,
            })
            .select('id')
            .single();

          if (errKeg) throw errKeg;
          kegiatanId = newKegiatan.id;
        }

        // 5. Hubungkan Mitra ke Kegiatan di Tabel 'penugasan'
        if (kegiatanId) {
          const penugasanList = uniqueFormattedData.map((m) => ({
            sobat_id: m.sobat_id,
            kegiatan_id: kegiatanId,
          }));

          const { error: errPenugasan } = await supabase
            .from('penugasan')
            .upsert(penugasanList, { onConflict: 'sobat_id, kegiatan_id' });

          if (errPenugasan) throw errPenugasan;
        }

        alert(
          `Berhasil!\n- ${uniqueFormattedData.length} data mitra diimpor/diperbarui.\n- Otomatis terdaftar pada Kegiatan: "${namaKegiatan}".`
        );
        fetchMitra();
      } catch (err: any) {
        console.error('Error processing Excel:', err);
        alert('Gagal mengunggah data Excel: ' + (err.message || 'Terjadi kesalahan'));
      } finally {
        setIsUploading(false);
        e.target.value = '';
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Open Modal Tambah Data
  const handleOpenAddModal = () => {
    setIsEditMode(false);
    setFormData({
      sobat_id: '',
      nama_mitra: '',
      posisi_mitra: '',
      alamat: '',
      kab_kota: '',
      no_hp: '',
      email: '',
      status_keaktifan: 'Aktif',
    });
    setIsModalOpen(true);
  };

  // Open Modal Edit Data
  const handleOpenEditModal = (mitra: MitraData) => {
    setIsEditMode(true);
    setFormData({
      sobat_id: mitra.sobat_id,
      nama_mitra: mitra.nama_mitra || '',
      posisi_mitra: mitra.posisi_mitra || '',
      alamat: mitra.alamat || '',
      kab_kota: mitra.kab_kota || '',
      no_hp: mitra.no_hp || '',
      email: mitra.email || '',
      status_keaktifan: mitra.status_keaktifan || 'Aktif',
    });
    setIsModalOpen(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveMitra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.sobat_id.trim() || !formData.nama_mitra.trim()) {
      alert('SOBAT ID dan Nama Mitra wajib diisi!');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditMode) {
        const { error } = await supabase
          .from('mitra')
          .update({
            nama_mitra: formData.nama_mitra,
            posisi_mitra: formData.posisi_mitra,
            alamat: formData.alamat,
            kab_kota: formData.kab_kota,
            no_hp: formData.no_hp,
            email: formData.email,
            status_keaktifan: formData.status_keaktifan,
          })
          .eq('sobat_id', formData.sobat_id);

        if (error) throw error;
        alert('Data mitra berhasil diperbarui.');
      } else {
        const { error } = await supabase.from('mitra').insert([formData]);
        if (error) throw error;
        alert('Mitra baru berhasil ditambahkan.');
      }

      setIsModalOpen(false);
      fetchMitra();
    } catch (err: any) {
      console.error('Error saving mitra:', err);
      alert('Gagal menyimpan data: ' + (err.message || 'Terjadi kesalahan'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMitra = async (sobatId: string, nama: string) => {
    const confirmDelete = window.confirm(`Apakah Anda yakin ingin menghapus data mitra "${nama}" (${sobatId})?`);
    if (!confirmDelete) return;

    try {
      const { error } = await supabase.from('mitra').delete().eq('sobat_id', sobatId);
      if (error) throw error;

      alert('Data mitra berhasil dihapus.');
      fetchMitra();
    } catch (err: any) {
      console.error('Error deleting mitra:', err);
      alert('Gagal menghapus data: ' + (err.message || 'Terjadi kesalahan'));
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans">
      <Sidebar mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />

      <div className="min-h-screen lg:pl-[230px]">
        <Header onMenuClick={() => setMobileSidebarOpen(true)} />

        <main className="p-3 sm:p-4 lg:p-5">
          <div className="mx-auto max-w-[1500px]">
            {/* HEADER JUDUL & TOMBOL UPLOAD/TAMBAH */}
            <div className="mb-4 flex flex-wrap justify-between items-center gap-3">
              <div>
                <h1 className="text-lg font-bold text-slate-800">Data Mitra</h1>
                <p className="text-[11px] text-slate-500">
                  Kelola data mitra BPS secara manual atau impor Excel SOBAT
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenAddModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md shadow-sm transition"
                >
                  <span>➕</span> Tambah Mitra
                </button>

                <label
                  className={`cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-md shadow-sm transition ${
                    isUploading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <span>📥</span> {isUploading ? 'Mengunggah...' : 'Unggah Excel'}
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                  />
                </label>
              </div>
            </div>

            {/* FILTER & PENCARIAN */}
            <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 mb-4 flex flex-wrap gap-2.5 items-center justify-between">
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <div className="relative min-w-[240px]">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400 text-xs">
                    🔍
                  </span>
                  <input
                    type="text"
                    placeholder="Cari Mitra (Nama / SOBAT ID)"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fetchMitra()}
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-blue-400"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="Filter status keaktifan mitra"
                  className="py-1.5 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400"
                >
                  <option value="Semua Status">Semua Status</option>
                  <option value="Aktif">Aktif</option>
                  <option value="Nonaktif">Nonaktif</option>
                </select>

                <button
                  onClick={fetchMitra}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition"
                >
                  Cari
                </button>

                <button
                  onClick={() => {
                    setSearchKeyword('');
                    setStatusFilter('Semua Status');
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded transition"
                >
                  Reset
                </button>
              </div>

              {/* Opsi Jumlah Baris per Halaman */}
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span>Tampilkan:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="py-1 px-2 border border-slate-200 rounded bg-white text-slate-700 outline-none focus:border-blue-400"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
                <span>baris</span>
              </div>
            </div>

            {/* TABEL DATA MITRA */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                    <tr>
                      <th className="py-3 px-3.5 text-center w-10">No</th>
                      <th className="py-3 px-3.5">SOBAT ID</th>
                      <th className="py-3 px-3.5">Nama Mitra</th>
                      <th className="py-3 px-3.5">Posisi</th>
                      <th className="py-3 px-3.5">Kab/Kota</th>
                      <th className="py-3 px-3.5">Alamat Detail</th>
                      <th className="py-3 px-3.5">No. Telp</th>
                      <th className="py-3 px-3.5 text-center">Status</th>
                      <th className="py-3 px-3.5 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400">
                          Memuat data mitra...
                        </td>
                      </tr>
                    ) : currentData.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400">
                          Belum ada data mitra. Silakan klik tombol <strong>Tambah Mitra</strong> atau <strong>Unggah Excel</strong>.
                        </td>
                      </tr>
                    ) : (
                      currentData.map((item, index) => (
                        <tr key={item.sobat_id || index} className="hover:bg-slate-50/80 transition">
                          <td className="py-2.5 px-3.5 text-center font-medium text-slate-400">
                            {(currentPage - 1) * itemsPerPage + index + 1}
                          </td>
                          <td className="py-2.5 px-3.5 font-semibold text-blue-600">{item.sobat_id}</td>
                          <td className="py-2.5 px-3.5 font-semibold text-slate-800">{item.nama_mitra}</td>
                          <td className="py-2.5 px-3.5 text-slate-600">{item.posisi_mitra || '-'}</td>
                          <td className="py-2.5 px-3.5 text-slate-600">{item.kab_kota || '-'}</td>
                          <td
                            className="py-2.5 px-3.5 text-slate-600 max-w-[200px] truncate"
                            title={item.alamat}
                          >
                            {item.alamat || '-'}
                          </td>
                          <td className="py-2.5 px-3.5 text-slate-600">{item.no_hp || '-'}</td>
                          <td className="py-2.5 px-3.5 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                item.status_keaktifan === 'Aktif'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {item.status_keaktifan || 'Aktif'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleOpenEditModal(item)}
                                className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded transition"
                                title="Edit Data"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => handleDeleteMitra(item.sobat_id, item.nama_mitra)}
                                className="p-1 text-slate-500 hover:text-rose-600 hover:bg-slate-100 rounded transition"
                                title="Hapus Data"
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

              {/* BARIS PAGINATION BAWAH TABEL */}
              <div className="px-4 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white">
                <div className="text-xs text-slate-500">
                  Menampilkan <span className="font-medium text-slate-700">{startItem}</span> -{' '}
                  <span className="font-medium text-slate-700">{endItem}</span> dari{' '}
                  <span className="font-medium text-slate-700">{totalItems}</span> data
                </div>

                <div className="flex items-center gap-1 text-xs">
                  {/* Tombol Previous */}
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    ‹
                  </button>

                  {/* Tombol Angka Halaman */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((page) => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                    .map((page, idx, array) => {
                      const prevPage = array[idx - 1];
                      const showEllipsis = prevPage && page - prevPage > 1;

                      return (
                        <React.Fragment key={page}>
                          {showEllipsis && <span className="px-1.5 text-slate-400">...</span>}
                          <button
                            onClick={() => setCurrentPage(page)}
                            className={`px-3 py-1 rounded font-medium transition ${
                              currentPage === page
                                ? 'bg-blue-600 text-white'
                                : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {page}
                          </button>
                        </React.Fragment>
                      );
                    })}

                  {/* Tombol Next */}
                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
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

      {/* MODAL TAMBAH / EDIT MITRA */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-sm text-slate-800">
                {isEditMode ? 'Edit Data Mitra' : 'Tambah Mitra Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-base"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMitra} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  SOBAT ID <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  name="sobat_id"
                  value={formData.sobat_id}
                  onChange={handleInputChange}
                  disabled={isEditMode}
                  placeholder="Contoh: 3515000123"
                  className="w-full px-3 py-2 border border-slate-200 rounded outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Nama Lengkap <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  name="nama_mitra"
                  value={formData.nama_mitra}
                  onChange={handleInputChange}
                  placeholder="Nama sesuai SOBAT"
                  className="w-full px-3 py-2 border border-slate-200 rounded outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Posisi</label>
                  <input
                    type="text"
                    name="posisi_mitra"
                    value={formData.posisi_mitra}
                    onChange={handleInputChange}
                    placeholder="Pencacah / Pengawas"
                    className="w-full px-3 py-2 border border-slate-200 rounded outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Kab/Kota</label>
                  <input
                    type="text"
                    name="kab_kota"
                    value={formData.kab_kota}
                    onChange={handleInputChange}
                    placeholder="Kab. Mojokerto"
                    className="w-full px-3 py-2 border border-slate-200 rounded outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Alamat Detail</label>
                <textarea
                  name="alamat"
                  value={formData.alamat}
                  onChange={handleInputChange}
                  rows={2}
                  placeholder="Alamat domisili lengkap"
                  className="w-full px-3 py-2 border border-slate-200 rounded outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">No. Telp / WA</label>
                  <input
                    type="text"
                    name="no_hp"
                    value={formData.no_hp}
                    onChange={handleInputChange}
                    placeholder="08123456789"
                    className="w-full px-3 py-2 border border-slate-200 rounded outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Status Keaktifan</label>
                  <select
                    name="status_keaktifan"
                    value={formData.status_keaktifan}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-200 rounded outline-none focus:border-blue-500 bg-white"
                  >
                    <option value="Aktif">Aktif</option>
                    <option value="Nonaktif">Nonaktif</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium rounded transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded transition disabled:opacity-50"
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