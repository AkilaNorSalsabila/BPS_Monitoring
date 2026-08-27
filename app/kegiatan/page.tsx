'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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

const BULAN_OPTIONS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const generateTahunOptions = () => {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let i = currentYear - 2; i <= currentYear + 5; i++) {
    years.push(i.toString());
  }
  return years;
};

const TAHUN_OPTIONS = generateTahunOptions();
const CURRENT_YEAR_STR = new Date().getFullYear().toString();

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

  // Form State dengan pemisahan Rentang Bulan (Mulai & Sampai)
  const [formData, setFormData] = useState({
    kode_kegiatan: '',
    nama_kegiatan: '',
    bulanMulai: 'Januari',
    tahunMulai: CURRENT_YEAR_STR,
    bulanSelesai: 'Desember',
    tahunSelesai: CURRENT_YEAR_STR,
    pagu_anggaran: 0,
  });

  // Helper untuk menghitung total bulan dari rentang mulai dan selesai
  const hitungDurasiBulan = (bMulai: string, tMulai: string, bSelesai: string, tSelesai: string) => {
    const idxMulai = BULAN_OPTIONS.indexOf(bMulai);
    const idxSelesai = BULAN_OPTIONS.indexOf(bSelesai);
    const yearMulai = parseInt(tMulai, 10);
    const yearSelesai = parseInt(tSelesai, 10);

    const totalBulan = (yearSelesai - yearMulai) * 12 + (idxSelesai - idxMulai) + 1;
    return totalBulan > 0 ? totalBulan : 1;
  };

  // Helper untuk memparsing string periode database kembali ke state form dropdown saat Edit
  const parsePeriodeToForm = (periodeStr: string) => {
    if (!periodeStr) {
      return { bulanMulai: 'Januari', tahunMulai: CURRENT_YEAR_STR, bulanSelesai: 'Desember', tahunSelesai: CURRENT_YEAR_STR };
    }

    // Bersihkan string dari tambahan teks seperti "(3 Bulan)" jika ada
    const cleanPeriode = periodeStr.replace(/\s*\(\d+\s*Bulan\)/i, '').trim();

    if (cleanPeriode.includes(' - ') || cleanPeriode.includes(' s.d. ')) {
      const separator = cleanPeriode.includes(' - ') ? ' - ' : ' s.d. ';
      const [mulai, selesai] = cleanPeriode.split(separator);
      const [bMulai, tMulai] = mulai.split(' ');
      const [bSelesai, tSelesai] = selesai.split(' ');
      return {
        bulanMulai: bMulai || 'Januari',
        tahunMulai: tMulai || CURRENT_YEAR_STR,
        bulanSelesai: bSelesai || 'Desember',
        tahunSelesai: tSelesai || CURRENT_YEAR_STR,
      };
    } else {
      const parts = cleanPeriode.split(' ');
      const bln = parts[0] || 'Januari';
      const thn = parts[1] || CURRENT_YEAR_STR;
      return {
        bulanMulai: bln,
        tahunMulai: thn,
        bulanSelesai: bln,
        tahunSelesai: thn,
      };
    }
  };

  // Format Rupiah
  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  // FETCH DATA KEGIATAN
  const fetchKegiatan = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('kegiatan')
        .select('*')
        .order('created_at', { ascending: false });

      if (searchKeyword) {
        query = query.or(
          `nama_kegiatan.ilike.%${searchKeyword}%,kode_kegiatan.ilike.%${searchKeyword}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      setKegiatanList(data || []);
      setCurrentPage(1);
    } catch (err: any) {
  console.error('Error detail:', JSON.stringify(err, null, 2));
  console.error('Error saving kegiatan:', err.message || err.error_description || err.details || err);
  alert('Gagal menyimpan kegiatan: ' + (err.message || err.details || JSON.stringify(err)));
}finally {
      setLoading(false);
    }
  }, [searchKeyword]);

  useEffect(() => {
    fetchKegiatan();
  }, [fetchKegiatan]);

  // PAGINATION
  const totalItems = kegiatanList.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  const currentData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return kegiatanList.slice(start, start + itemsPerPage);
  }, [kegiatanList, currentPage, itemsPerPage]);

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  // EXPORT PDF
  const handleExportPDF = () => {
    if (kegiatanList.length === 0) {
      alert('Tidak ada data kegiatan untuk diekspor.');
      return;
    }

    const doc = new jsPDF('landscape', 'mm', 'a4');

    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text('BADAN PUSAT STATISTIK KOTA MOJOKERTO', 14, 15);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Daftar Data Kegiatan', 14, 22);

    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`, 14, 28);

    if (searchKeyword) {
      doc.text(`Pencarian: ${searchKeyword}`, 14, 33);
    }

    const tableBody = kegiatanList.map((item, index) => [
      index + 1,
      item.kode_kegiatan || '-',
      item.nama_kegiatan || '-',
      item.bulan_kegiatan || '-',
      formatRupiah(item.pagu_anggaran || 0),
    ]);

    autoTable(doc, {
      startY: searchKeyword ? 39 : 34,
      head: [['No', 'Kode Kegiatan', 'Nama Kegiatan', 'Periode', 'Pagu Anggaran']],
      body: tableBody,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [40, 40, 40],
        valign: 'middle',
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 35 },
        2: { cellWidth: 100 },
        3: { cellWidth: 45 },
        4: { cellWidth: 55, halign: 'right' },
      },
      margin: { left: 14, right: 14 },
    });

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      const pageHeight = doc.internal.pageSize.height;
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Halaman ${i} dari ${pageCount}`, 14, pageHeight - 10);
      doc.text('Sistem Monitoring Penugasan Mitra BPS Kota Mojokerto', 150, pageHeight - 10, { align: 'center' });
    }

    const tanggal = new Date().toISOString().slice(0, 10);
    doc.save(`Data_Kegiatan_BPS_Mojokerto_${tanggal}.pdf`);
  };

  const handleOpenAddModal = () => {
    setIsEditMode(false);
    setSelectedId(null);
    setFormData({
      kode_kegiatan: `KD-${String(kegiatanList.length + 1).padStart(3, '0')}`,
      nama_kegiatan: '',
      bulanMulai: 'Januari',
      tahunMulai: CURRENT_YEAR_STR,
      bulanSelesai: 'Desember',
      tahunSelesai: CURRENT_YEAR_STR,
      pagu_anggaran: 0,
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: KegiatanData) => {
    setIsEditMode(true);
    setSelectedId(item.id);
    const parsedPeriode = parsePeriodeToForm(item.bulan_kegiatan);
    setFormData({
      kode_kegiatan: item.kode_kegiatan,
      nama_kegiatan: item.nama_kegiatan,
      ...parsedPeriode,
      pagu_anggaran: item.pagu_anggaran || 0,
    });
    setIsModalOpen(true);
  };

  const handleSaveKegiatan = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nama_kegiatan.trim()) {
      alert('Nama Kegiatan wajib diisi!');
      return;
    }

    setIsSubmitting(true);

    const durasiBulan = hitungDurasiBulan(
      formData.bulanMulai,
      formData.tahunMulai,
      formData.bulanSelesai,
      formData.tahunSelesai
    );

    // Format string sesuai dengan referensi foto (menggunakan "s.d." dan menyertakan keterangan jumlah bulan jika > 1)
    let finalPeriode = '';
    if (formData.bulanMulai === formData.bulanSelesai && formData.tahunMulai === formData.tahunSelesai) {
      finalPeriode = `${formData.bulanMulai} ${formData.tahunMulai} (1 Bulan)`;
    } else {
      finalPeriode = `${formData.bulanMulai} ${formData.tahunMulai} s.d. ${formData.bulanSelesai} ${formData.tahunSelesai} (${durasiBulan} Bulan)`;
    }

    try {
      if (isEditMode && selectedId) {
        const { error } = await supabase
          .from('kegiatan')
          .update({
            kode_kegiatan: formData.kode_kegiatan,
            nama_kegiatan: formData.nama_kegiatan,
            bulan_kegiatan: finalPeriode,
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
            bulan_kegiatan: finalPeriode,
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

  const handleDeleteKegiatan = async (id: string, nama: string) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus kegiatan "${nama}"?`)) {
      return;
    }

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
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />

      <div className="min-h-screen lg:pl-[230px]">
        <Header onMenuClick={() => setMobileSidebarOpen(true)} />

        <main className="p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1400px]">
            <h1 className="text-xl font-bold text-slate-800 mb-6">Data Kegiatan</h1>

            {/* SEARCH & TOMBOL */}
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

              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenAddModal}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition"
                >
                  <span>➕</span> Tambah Kegiatan
                </button>
                <button
                  onClick={handleExportPDF}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-sm transition"
                >
                  <span>📄</span> Export PDF
                </button>
              </div>
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
                          Belum ada data kegiatan. Klik tombol{' '}
                          <strong>Tambah Kegiatan</strong> untuk membuat baru.
                        </td>
                      </tr>
                    ) : (
                      currentData.map((item, index) => (
                        <tr key={item.id || index} className="hover:bg-slate-50/60 transition">
                          <td className="py-4 px-6 text-center font-medium text-slate-400">
                            {(currentPage - 1) * itemsPerPage + index + 1}
                          </td>
                          <td className="py-4 px-6 font-medium text-slate-600">
                            {item.kode_kegiatan}
                          </td>
                          <td className="py-4 px-6 font-semibold text-slate-800">
                            {item.nama_kegiatan}
                          </td>
                          <td className="py-4 px-6 text-slate-600 whitespace-pre-line">
                            {item.bulan_kegiatan || '-'}
                          </td>
                          <td className="py-4 px-6 font-semibold text-slate-800">
                            {formatRupiah(item.pagu_anggaran || 0)}
                          </td>
                          <td className="py-4 px-6 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <Link
                                href={`/kegiatan/${item.id}`}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-md transition"
                                title="Lihat Detail"
                              >
                                👁️
                              </Link>
                              <button
                                onClick={() => handleOpenEditModal(item)}
                                className="p-1.5 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-md transition"
                                title="Edit Kegiatan"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => handleDeleteKegiatan(item.id, item.nama_kegiatan)}
                                className="p-1.5 text-red-600 hover:bg-red-50 border border-red-200 rounded-md transition"
                                title="Hapus Kegiatan"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="text-red-600"
                                >
                                  <path d="M3 6h18" />
                                  <path d="M8 6V4h8v2" />
                                  <path d="M19 6l-1 14H6L5 6" />
                                  <path d="M10 11v5" />
                                  <path d="M14 11v5" />
                                </svg>
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
                  Menampilkan{' '}
                  <span className="font-semibold text-slate-700">{startItem}</span>
                  {' - '}
                  <span className="font-semibold text-slate-700">{endItem}</span>
                  {' dari '}
                  <span className="font-semibold text-slate-700">{totalItems}</span>
                  {' data'}
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>Tampilkan:</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="py-1.5 px-2 border border-slate-200 rounded-md bg-white text-slate-700 outline-none focus:border-blue-500"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                  <span>data</span>
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
                    .filter(
                      (page) =>
                        page === 1 ||
                        page === totalPages ||
                        Math.abs(page - currentPage) <= 1
                    )
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
                <label className="block font-semibold text-slate-700 mb-1">
                  Kode Kegiatan *
                </label>
                <input
                  type="text"
                  value={formData.kode_kegiatan}
                  onChange={(e) =>
                    setFormData({ ...formData, kode_kegiatan: e.target.value })
                  }
                  placeholder="KED-001"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nama Kegiatan *
                </label>
                <input
                  type="text"
                  value={formData.nama_kegiatan}
                  onChange={(e) =>
                    setFormData({ ...formData, nama_kegiatan: e.target.value })
                  }
                  placeholder="Contoh: Pendataan Sosial"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="block font-semibold text-slate-700">
                  Periode Kegiatan (Rentang Bulan) *
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="block text-[10px] text-slate-500 mb-1">Mulai Bulan & Tahun</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <select
                        value={formData.bulanMulai}
                        onChange={(e) =>
                          setFormData({ ...formData, bulanMulai: e.target.value })
                        }
                        className="w-full px-2 py-1.5 border border-slate-200 rounded bg-white text-slate-700 outline-none focus:border-blue-500"
                      >
                        {BULAN_OPTIONS.map((bln) => (
                          <option key={bln} value={bln}>
                            {bln}
                          </option>
                        ))}
                      </select>

                      <select
                        value={formData.tahunMulai}
                        onChange={(e) =>
                          setFormData({ ...formData, tahunMulai: e.target.value })
                        }
                        className="w-full px-2 py-1.5 border border-slate-200 rounded bg-white text-slate-700 outline-none focus:border-blue-500"
                      >
                        {TAHUN_OPTIONS.map((thn) => (
                          <option key={thn} value={thn}>
                            {thn}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <span className="block text-[10px] text-slate-500 mb-1">Sampai Bulan & Tahun</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <select
                        value={formData.bulanSelesai}
                        onChange={(e) =>
                          setFormData({ ...formData, bulanSelesai: e.target.value })
                        }
                        className="w-full px-2 py-1.5 border border-slate-200 rounded bg-white text-slate-700 outline-none focus:border-blue-500"
                      >
                        {BULAN_OPTIONS.map((bln) => (
                          <option key={bln} value={bln}>
                            {bln}
                          </option>
                        ))}
                      </select>

                      <select
                        value={formData.tahunSelesai}
                        onChange={(e) =>
                          setFormData({ ...formData, tahunSelesai: e.target.value })
                        }
                        className="w-full px-2 py-1.5 border border-slate-200 rounded bg-white text-slate-700 outline-none focus:border-blue-500"
                      >
                        {TAHUN_OPTIONS.map((thn) => (
                          <option key={thn} value={thn}>
                            {thn}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Pagu Anggaran (Rp) *
                </label>
                <input
                  type="number"
                  value={formData.pagu_anggaran}
                  onChange={(e) =>
                    setFormData({ ...formData, pagu_anggaran: Number(e.target.value) })
                  }
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