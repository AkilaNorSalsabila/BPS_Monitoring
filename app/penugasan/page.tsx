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

interface PenugasanData {
  id?: number;
  sobat_id: string;
  kegiatan_id: number;
  peran?: string;
  total_honor?: number;
  jumlah_dicairkan?: number;
  status_penugasan?: string;
  created_at?: string;
  // Relasi Data Join
  mitra?: {
    nama_mitra: string;
    posisi_mitra?: string;
    kab_kota?: string;
    no_hp?: string;
  };
  kegiatan?: {
    nama_kegiatan: string;
    kode_kegiatan: string;
    bulan_kegiatan: string;
  };
}

interface LimitHonor {
  id: number;
  tahun_bulan: string;
  batas_maksimal: number;
  persen_peringatan: number;
}

interface MitraOption {
  sobat_id: string;
  nama_mitra: string;
  posisi_mitra?: string;
}

interface KegiatanOption {
  id: number;
  nama_kegiatan: string;
  kode_kegiatan: string;
  bulan_kegiatan: string;
}

// Data yang ditampilkan di popup blokir "Pegawai Sudah Limit"
interface LimitBlockedInfo {
  namaMitra: string;
  periode: string;
  limitBulanan: number;
  hakHonorAlokasi: number; // total honor yang sudah teralokasi dari penugasan LAIN di PERIODE YANG SAMA
  sudahDicairkan: number;
  sisaLimit: number;
  persenTerpakai: number;
}

// Data yang ditampilkan di popup blokir "Mitra Sudah Ditugaskan"
interface DuplicateBlockedInfo {
  namaMitra: string;
  namaKegiatan: string;
}

const STATUS_OPTIONS = ['Semua Status', 'Ditugaskan', 'Berjalan', 'Selesai', 'Dibatalkan'];

const BULAN_OPTIONS = [
  'Semua Bulan', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const DEFAULT_LIMIT = 3000000;
const DEFAULT_WARN_PERCENT = 80;

export default function PenugasanPage() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);
  const [penugasanList, setPenugasanList] = useState<PenugasanData[]>([]);

  // ============ Limit sekarang disimpan PER PERIODE, bukan satu baris global ============
  const [limitByPeriode, setLimitByPeriode] = useState<Record<string, LimitHonor>>({});
  // ==========================================================================================

  const [loading, setLoading] = useState<boolean>(true);
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('Semua Status');
  const [bulanFilter, setBulanFilter] = useState<string>('Semua Bulan');

  // State Opsi Relasi Dropdown Form
  const [mitraOptions, setMitraOptions] = useState<MitraOption[]>([]);
  const [kegiatanOptions, setKegiatanOptions] = useState<KegiatanOption[]>([]);

  // State Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);

  // State Modal Tambah / Edit
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // State Modal Detail
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [detailPenugasan, setDetailPenugasan] = useState<PenugasanData | null>(null);

  // State Form Input
  const [formData, setFormData] = useState<PenugasanData>({
    sobat_id: '',
    kegiatan_id: 0,
    total_honor: 0,
    jumlah_dicairkan: 0,
    status_penugasan: 'Ditugaskan',
  });

  // State Checklist & Aksi Massal
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState<boolean>(false);
  const [isBulkStatusModalOpen, setIsBulkStatusModalOpen] = useState<boolean>(false);
  const [bulkStatusValue, setBulkStatusValue] = useState<string>('Selesai');
  const [isBulkStatusSubmitting, setIsBulkStatusSubmitting] = useState<boolean>(false);

  // Popup blokir "Pegawai Sudah Limit"
  const [isLimitBlockedModalOpen, setIsLimitBlockedModalOpen] = useState<boolean>(false);
  const [limitBlockedInfo, setLimitBlockedInfo] = useState<LimitBlockedInfo | null>(null);

  // ============ STATE BARU: Popup blokir "Mitra Sudah Ditugaskan" (duplikat kegiatan) ============
  const [isDuplicateBlockedModalOpen, setIsDuplicateBlockedModalOpen] = useState<boolean>(false);
  const [duplicateBlockedInfo, setDuplicateBlockedInfo] = useState<DuplicateBlockedInfo | null>(null);
  // =====================================================================================================

  // Fetch Master Data Mitra, Kegiatan & SEMUA Limit per periode
  const fetchDropdownData = useCallback(async () => {
    try {
      const { data: resMitra } = await supabase
        .from('mitra')
        .select('sobat_id, nama_mitra, posisi_mitra')
        .order('nama_mitra');
      if (resMitra) setMitraOptions(resMitra);

      const { data: resKegiatan } = await supabase
        .from('kegiatan')
        .select('id, nama_kegiatan, kode_kegiatan, bulan_kegiatan')
        .order('nama_kegiatan');
      if (resKegiatan) setKegiatanOptions(resKegiatan);

      // Ambil SEMUA baris limit_honor (bukan cuma satu), lalu petakan per tahun_bulan
      const { data: resLimit, error: errLimit } = await supabase
        .from('limit_honor')
        .select('id, tahun_bulan, batas_maksimal, persen_peringatan');

      if (errLimit) {
        console.error('Error fetching limit_honor:', errLimit.message);
      } else if (resLimit) {
        const map: Record<string, LimitHonor> = {};
        resLimit.forEach((row: any) => {
          map[row.tahun_bulan] = row;
        });
        setLimitByPeriode(map);
      }
    } catch (err) {
      console.error('Error fetching dropdown & limit options:', err);
    }
  }, []);

  // Fetch Data Penugasan Supabase
  const fetchPenugasan = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('penugasan')
        .select(`
          *,
          mitra:sobat_id (nama_mitra, posisi_mitra, kab_kota, no_hp),
          kegiatan:kegiatan_id (nama_kegiatan, kode_kegiatan, bulan_kegiatan)
        `)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'Semua Status') {
        query = query.eq('status_penugasan', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      let filteredData: PenugasanData[] = data || [];

      if (searchKeyword.trim()) {
        const kw = searchKeyword.toLowerCase();
        filteredData = filteredData.filter(
          (item) =>
            item.sobat_id.toLowerCase().includes(kw) ||
            item.mitra?.nama_mitra?.toLowerCase().includes(kw) ||
            item.mitra?.posisi_mitra?.toLowerCase().includes(kw) ||
            item.kegiatan?.nama_kegiatan?.toLowerCase().includes(kw) ||
            item.kegiatan?.kode_kegiatan?.toLowerCase().includes(kw)
        );
      }

      if (bulanFilter !== 'Semua Bulan') {
        filteredData = filteredData.filter((item) =>
          item.kegiatan?.bulan_kegiatan?.toLowerCase().includes(bulanFilter.toLowerCase())
        );
      }

      setPenugasanList(filteredData);
      setCurrentPage(1);
      setSelectedIds([]);
    } catch (err: any) {
      console.error('Error fetching penugasan:', err);
    } finally {
      setLoading(false);
    }
  }, [searchKeyword, statusFilter, bulanFilter]);

  useEffect(() => {
    fetchDropdownData();
    fetchPenugasan();
  }, [fetchDropdownData, fetchPenugasan]);

  // Helper: ambil limit & warning percent untuk satu periode (fallback ke default kalau belum diatur)
  const getLimitForPeriode = useCallback(
    (periode: string) => {
      const info = limitByPeriode[periode];
      return {
        maxLimit: info?.batas_maksimal ?? DEFAULT_LIMIT,
        warnPercent: info?.persen_peringatan ?? DEFAULT_WARN_PERCENT,
      };
    },
    [limitByPeriode]
  );

  // ============ Akumulasi honor & pencairan PER MITRA *DAN* PER PERIODE (bukan digabung semua periode) ============
  const accumulatedHonorBySobatPeriode = useMemo(() => {
    const map: Record<string, number> = {};
    penugasanList.forEach((item) => {
      const periode = item.kegiatan?.bulan_kegiatan || '';
      const key = `${item.sobat_id}__${periode}`;
      map[key] = (map[key] || 0) + (Number(item.total_honor) || 0);
    });
    return map;
  }, [penugasanList]);

  const accumulatedDicairkanBySobatPeriode = useMemo(() => {
    const map: Record<string, number> = {};
    penugasanList.forEach((item) => {
      const periode = item.kegiatan?.bulan_kegiatan || '';
      const key = `${item.sobat_id}__${periode}`;
      map[key] = (map[key] || 0) + (Number(item.jumlah_dicairkan) || 0);
    });
    return map;
  }, [penugasanList]);
  // ========================================================================================================================

  // Periode yang sedang relevan di form (mengikuti kegiatan yang dipilih)
  const currentFormPeriode = useMemo(() => {
    const kegiatan = kegiatanOptions.find((k) => k.id === formData.kegiatan_id);
    return kegiatan?.bulan_kegiatan || kegiatanOptions[0]?.bulan_kegiatan || '';
  }, [formData.kegiatan_id, kegiatanOptions]);

  // ============ FUNGSI CEK: apakah mitra ini SUDAH mencapai limit PADA PERIODE TERTENTU? ============
  const checkMitraAlreadyAtLimit = useCallback(
    (sobatId: string, periode: string, excludePenugasanId?: number): LimitBlockedInfo | null => {
      if (!sobatId || !periode) return null;

      const { maxLimit } = getLimitForPeriode(periode);

      let existingTotal = 0;
      let existingDicairkan = 0;
      penugasanList.forEach((item) => {
        if (item.sobat_id !== sobatId) return;
        if ((item.kegiatan?.bulan_kegiatan || '') !== periode) return; // hanya periode yang sama
        if (excludePenugasanId && item.id === excludePenugasanId) return; // exclude data yang sedang diedit
        existingTotal += Number(item.total_honor) || 0;
        existingDicairkan += Number(item.jumlah_dicairkan) || 0;
      });

      if (existingTotal >= maxLimit) {
        const mitraInfo = mitraOptions.find((m) => m.sobat_id === sobatId);
        return {
          namaMitra: mitraInfo?.nama_mitra || sobatId,
          periode,
          limitBulanan: maxLimit,
          hakHonorAlokasi: existingTotal,
          sudahDicairkan: existingDicairkan,
          sisaLimit: Math.max(maxLimit - existingTotal, 0),
          persenTerpakai: Math.round((existingTotal / maxLimit) * 100),
        };
      }

      return null;
    },
    [penugasanList, mitraOptions, getLimitForPeriode]
  );
  // =========================================================================================================

  // ============ FUNGSI CEK: apakah mitra ini SUDAH ditugaskan pada kegiatan yang SAMA? ============
  const checkDuplicateAssignment = useCallback(
    (sobatId: string, kegiatanId: number, excludePenugasanId?: number): DuplicateBlockedInfo | null => {
      if (!sobatId || !kegiatanId) return null;

      const existing = penugasanList.find(
        (item) =>
          item.sobat_id === sobatId &&
          item.kegiatan_id === kegiatanId &&
          (!excludePenugasanId || item.id !== excludePenugasanId)
      );

      if (existing) {
        const mitraInfo = mitraOptions.find((m) => m.sobat_id === sobatId);
        const kegiatanInfo = kegiatanOptions.find((k) => k.id === kegiatanId);
        return {
          namaMitra: mitraInfo?.nama_mitra || sobatId,
          namaKegiatan: kegiatanInfo?.nama_kegiatan || 'kegiatan ini',
        };
      }

      return null;
    },
    [penugasanList, mitraOptions, kegiatanOptions]
  );
  // =======================================================================================================

  // Handler saat mitra dipilih di dropdown form
  const handleSelectMitraInForm = (sobatId: string) => {
    const blockedLimit = checkMitraAlreadyAtLimit(sobatId, currentFormPeriode, isEditMode ? formData.id : undefined);
    if (blockedLimit) {
      setLimitBlockedInfo(blockedLimit);
      setIsLimitBlockedModalOpen(true);
      return;
    }

    const blockedDuplicate = checkDuplicateAssignment(sobatId, formData.kegiatan_id, isEditMode ? formData.id : undefined);
    if (blockedDuplicate) {
      setDuplicateBlockedInfo(blockedDuplicate);
      setIsDuplicateBlockedModalOpen(true);
      return;
    }

    setFormData((prev) => ({ ...prev, sobat_id: sobatId }));
  };

  // Handler saat kegiatan dipilih di dropdown form — cek ulang duplikat & limit karena periode ikut berubah
  const handleSelectKegiatanInForm = (kegiatanId: number) => {
    const kegiatanTerpilih = kegiatanOptions.find((k) => k.id === kegiatanId);
    const periodeBaru = kegiatanTerpilih?.bulan_kegiatan || '';

    if (formData.sobat_id) {
      const blockedLimit = checkMitraAlreadyAtLimit(formData.sobat_id, periodeBaru, isEditMode ? formData.id : undefined);
      if (blockedLimit) {
        setLimitBlockedInfo(blockedLimit);
        setIsLimitBlockedModalOpen(true);
        return;
      }

      const blockedDuplicate = checkDuplicateAssignment(formData.sobat_id, kegiatanId, isEditMode ? formData.id : undefined);
      if (blockedDuplicate) {
        setDuplicateBlockedInfo(blockedDuplicate);
        setIsDuplicateBlockedModalOpen(true);
        return;
      }
    }

    setFormData((prev) => ({ ...prev, kegiatan_id: kegiatanId }));
  };

  // Cek Limit Honor untuk Modal Form (kasus "akan melebihi" karena nominal baru — masih boleh di-override)
  const formLimitCheck = useMemo(() => {
    if (!formData.sobat_id || !currentFormPeriode) {
      return { currentTotal: 0, newTotal: 0, isExceeded: false, isWarning: false, maxLimit: DEFAULT_LIMIT, usagePercent: 0 };
    }

    const { maxLimit, warnPercent } = getLimitForPeriode(currentFormPeriode);

    let currentTotal = 0;
    penugasanList.forEach((item) => {
      if (item.sobat_id !== formData.sobat_id) return;
      if ((item.kegiatan?.bulan_kegiatan || '') !== currentFormPeriode) return;
      if (!isEditMode || (isEditMode && item.id !== formData.id)) {
        currentTotal += Number(item.total_honor) || 0;
      }
    });

    const newTotal = currentTotal + (Number(formData.total_honor) || 0);
    const usagePercent = (newTotal / maxLimit) * 100;

    return {
      maxLimit,
      currentTotal,
      newTotal,
      isExceeded: newTotal > maxLimit,
      isWarning: usagePercent >= warnPercent && newTotal <= maxLimit,
      usagePercent,
    };
  }, [formData.sobat_id, formData.total_honor, formData.id, isEditMode, penugasanList, currentFormPeriode, getLimitForPeriode]);

  // Logika Pagination
  const totalItems = penugasanList.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  const currentData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return penugasanList.slice(start, start + itemsPerPage);
  }, [penugasanList, currentPage, itemsPerPage]);

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  // Logika Checklist Table
  const currentItemIds = useMemo(() => currentData.map((item) => item.id!).filter(Boolean), [currentData]);

  const isAllCurrentPageSelected =
    currentItemIds.length > 0 && currentItemIds.every((id) => selectedIds.includes(id));

  const isSomeCurrentPageSelected =
    currentItemIds.some((id) => selectedIds.includes(id)) && !isAllCurrentPageSelected;

  const handleToggleSelectOne = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleToggleSelectAllCurrentPage = () => {
    if (isAllCurrentPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !currentItemIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...currentItemIds])));
    }
  };

  const handleClearSelection = () => setSelectedIds([]);

  // Hapus Massal
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;

    const confirmDelete = window.confirm(
      `Apakah Anda yakin ingin menghapus ${selectedIds.length} penugasan terpilih?`
    );
    if (!confirmDelete) return;

    setIsBulkDeleting(true);
    try {
      const { error } = await supabase.from('penugasan').delete().in('id', selectedIds);
      if (error) throw error;

      alert(`${selectedIds.length} penugasan berhasil dihapus.`);
      setSelectedIds([]);
      fetchPenugasan();
    } catch (err: any) {
      alert('Gagal menghapus penugasan terpilih: ' + (err.message || 'Terjadi kesalahan'));
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Ubah Status Massal
  const handleBulkStatusChange = async () => {
    if (selectedIds.length === 0) return;

    setIsBulkStatusSubmitting(true);
    try {
      const { error } = await supabase
        .from('penugasan')
        .update({ status_penugasan: bulkStatusValue })
        .in('id', selectedIds);

      if (error) throw error;

      alert(`Status ${selectedIds.length} penugasan berhasil diubah menjadi "${bulkStatusValue}".`);
      setIsBulkStatusModalOpen(false);
      setSelectedIds([]);
      fetchPenugasan();
    } catch (err: any) {
      alert('Gagal mengubah status: ' + (err.message || 'Terjadi kesalahan'));
    } finally {
      setIsBulkStatusSubmitting(false);
    }
  };

  // Export PDF
  const handleExportPDF = () => {
    if (penugasanList.length === 0) {
      alert('Tidak ada data penugasan untuk diexport.');
      return;
    }

    const doc = new jsPDF('landscape', 'mm', 'a4');

    doc.setFontSize(14);
    doc.text('BADAN PUSAT STATISTIK KOTA MOJOKERTO', 14, 15);
    doc.setFontSize(10);
    doc.text('Daftar Penugasan Mitra Statistik', 14, 21);
    doc.setFontSize(8);
    doc.text(`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`, 14, 26);

    const tableBody = penugasanList.map((item, index) => [
      index + 1,
      item.sobat_id || '-',
      item.mitra?.nama_mitra || '-',
      item.kegiatan?.nama_kegiatan || '-',
      item.mitra?.posisi_mitra || '-',
      `Rp ${(item.total_honor || 0).toLocaleString('id-ID')}`,
      `Rp ${(item.jumlah_dicairkan || 0).toLocaleString('id-ID')}`,
      `Rp ${((item.total_honor || 0) - (item.jumlah_dicairkan || 0)).toLocaleString('id-ID')}`,
      item.status_penugasan || 'Ditugaskan',
    ]);

    autoTable(doc, {
      startY: 30,
      head: [
        [
          'No',
          'SOBAT ID',
          'Nama Mitra',
          'Kegiatan BPS',
          'Posisi Mitra',
          'Hak Honor Alokasi',
          'Dicairkannya',
          'Sisa Honor',
          'Status',
        ],
      ],
      body: tableBody,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
      },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 25 },
        2: { cellWidth: 45 },
        3: { cellWidth: 55 },
        4: { cellWidth: 35 },
        5: { cellWidth: 30, halign: 'right' },
        6: { cellWidth: 30, halign: 'right' },
        7: { cellWidth: 30, halign: 'right' },
        8: { cellWidth: 20, halign: 'center' },
      },
    });

    doc.save(`Data_Penugasan_BPS_Mojokerto_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // Open Modal Tambah Data
  const handleOpenAddModal = () => {
    setIsEditMode(false);

    const defaultKegiatanId = kegiatanOptions[0]?.id || 0;
    const defaultPeriode = kegiatanOptions[0]?.bulan_kegiatan || '';

    // Cari mitra default pertama yang BELUM mencapai limit di periode kegiatan default
    const firstAvailableMitra = mitraOptions.find(
      (m) => !checkMitraAlreadyAtLimit(m.sobat_id, defaultPeriode)
    );

    setFormData({
      sobat_id: firstAvailableMitra?.sobat_id || '',
      kegiatan_id: defaultKegiatanId,
      total_honor: 0,
      jumlah_dicairkan: 0,
      status_penugasan: 'Ditugaskan',
    });
    setIsModalOpen(true);
  };

  // Open Modal Edit Data
  const handleOpenEditModal = (penugasan: PenugasanData) => {
    setIsEditMode(true);
    setFormData({
      id: penugasan.id,
      sobat_id: penugasan.sobat_id,
      kegiatan_id: penugasan.kegiatan_id,
      total_honor: penugasan.total_honor || 0,
      jumlah_dicairkan: penugasan.jumlah_dicairkan || 0,
      status_penugasan: penugasan.status_penugasan || 'Ditugaskan',
    });
    setIsModalOpen(true);
  };

  // Simpan / Update Penugasan
  const handleSavePenugasan = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.sobat_id || !formData.kegiatan_id) {
      alert('Pilih Mitra dan Kegiatan BPS terlebih dahulu!');
      return;
    }

    // ============ PENGAMAN: cek ulang duplikat sebelum submit ============
    const blockedDuplicate = checkDuplicateAssignment(formData.sobat_id, formData.kegiatan_id, isEditMode ? formData.id : undefined);
    if (blockedDuplicate) {
      setDuplicateBlockedInfo(blockedDuplicate);
      setIsDuplicateBlockedModalOpen(true);
      return;
    }
    // ==========================================================================

    // ============ PENGAMAN: cek ulang blokir limit sebelum submit ============
    const blockedLimit = checkMitraAlreadyAtLimit(formData.sobat_id, currentFormPeriode, isEditMode ? formData.id : undefined);
    if (blockedLimit) {
      setLimitBlockedInfo(blockedLimit);
      setIsLimitBlockedModalOpen(true);
      return;
    }
    // ================================================================================

    // Validasi: Pencairan tidak boleh melebihi Hak Honor Alokasi
    const honorAllocated = Number(formData.total_honor) || 0;
    const honorDisbursed = Number(formData.jumlah_dicairkan) || 0;

    if (honorDisbursed > honorAllocated) {
      alert(
        `Gagal Menyimpan! Jumlah yang dicairkan (Rp ${honorDisbursed.toLocaleString('id-ID')}) ` +
        `tidak boleh melebihi Hak Honor Alokasi (Rp ${honorAllocated.toLocaleString('id-ID')}).`
      );
      return;
    }

    // Cek Limit Total (kasus "akan melebihi" karena nominal baru — masih boleh di-override dengan konfirmasi)
    if (formLimitCheck.isExceeded) {
      const confirmExceed = window.confirm(
        `PERINGATAN: Total honor akumulasi mitra ini di periode ${currentFormPeriode} (Rp ${formLimitCheck.newTotal.toLocaleString('id-ID')}) ` +
        `melebihi batas limit (Rp ${formLimitCheck.maxLimit.toLocaleString('id-ID')}).\n\nYakin ingin menyimpan?`
      );
      if (!confirmExceed) return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        sobat_id: formData.sobat_id,
        kegiatan_id: formData.kegiatan_id,
        total_honor: honorAllocated,
        jumlah_dicairkan: honorDisbursed,
        status_penugasan: formData.status_penugasan,
      };

      if (isEditMode && formData.id) {
        const { error } = await supabase.from('penugasan').update(payload).eq('id', formData.id);
        if (error) throw error;
        alert('Penugasan berhasil diperbarui.');
      } else {
        const { error } = await supabase.from('penugasan').insert([payload]);
        if (error) throw error;
        alert('Penugasan baru berhasil ditambahkan.');
      }

      setIsModalOpen(false);
      fetchPenugasan();
    } catch (err: any) {
      alert('Gagal menyimpan penugasan: ' + (err.message || 'Terjadi kesalahan'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Single Data
  const handleDeletePenugasan = async (id: number, namaMitra: string) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus penugasan untuk "${namaMitra}"?`)) return;

    try {
      const { error } = await supabase.from('penugasan').delete().eq('id', id);
      if (error) throw error;

      alert('Penugasan berhasil dihapus.');
      fetchPenugasan();
    } catch (err: any) {
      alert('Gagal menghapus penugasan: ' + (err.message || 'Terjadi kesalahan'));
    }
  };

  const formatRupiah = (val: number) => `Rp ${val.toLocaleString('id-ID')}`;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans">
      <Sidebar mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />

      <div className="min-h-screen lg:pl-[230px]">
        <Header onMenuClick={() => setMobileSidebarOpen(true)} />

        <main className="p-3 sm:p-4 lg:p-5">
          <div className="mx-auto max-w-[1500px]">
            {/* HEADER JUDUL & TOMBOL ACTION */}
            <div className="mb-4 flex flex-wrap justify-between items-center gap-3">
              <div>
                <h1 className="text-lg font-bold text-slate-800">Penugasan Mitra</h1>
                <p className="text-[11px] text-slate-500">
                  Kelola alokasi penugasan dan akumulasi limit honorarium mitra
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleOpenAddModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md shadow-sm transition cursor-pointer"
                >
                  <span>➕</span> Buat Penugasan
                </button>

                <button
                  onClick={handleExportPDF}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-md shadow-sm transition cursor-pointer"
                >
                  <span>📄</span> Export PDF
                </button>
              </div>
            </div>

            {/* FILTER & PENCARIAN */}
            <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 mb-4 flex flex-wrap gap-2.5 items-center justify-between">
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <div className="relative min-w-[260px]">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400 text-xs">
                    🔍
                  </span>
                  <input
                    type="text"
                    placeholder="Cari (Mitra, SOBAT ID, Kegiatan, Posisi)"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fetchPenugasan()}
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-blue-400"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="py-1.5 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400 cursor-pointer"
                >
                  {STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>

                <select
                  value={bulanFilter}
                  onChange={(e) => setBulanFilter(e.target.value)}
                  className="py-1.5 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400 cursor-pointer"
                >
                  {BULAN_OPTIONS.map((bln) => (
                    <option key={bln} value={bln}>
                      {bln}
                    </option>
                  ))}
                </select>

                <button
                  onClick={fetchPenugasan}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition cursor-pointer"
                >
                  Cari
                </button>

                <button
                  onClick={() => {
                    setSearchKeyword('');
                    setStatusFilter('Semua Status');
                    setBulanFilter('Semua Bulan');
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded transition cursor-pointer"
                >
                  Reset
                </button>
              </div>

              {/* Tampilkan Jumlah Baris */}
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span>Tampilkan:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="py-1 px-2 border border-slate-200 rounded bg-white text-slate-700 outline-none focus:border-blue-400 cursor-pointer"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
                <span>baris</span>
              </div>
            </div>

            {/* TOOLBAR AKSI MASSAL */}
            {selectedIds.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-semibold text-blue-700">
                  {selectedIds.length} penugasan dipilih
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setBulkStatusValue('Selesai');
                      setIsBulkStatusModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-300 hover:bg-blue-100 text-blue-700 text-xs font-medium rounded-md transition cursor-pointer"
                  >
                    🔄 Ubah Status
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    disabled={isBulkDeleting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-medium rounded-md transition cursor-pointer"
                  >
                    🗑️ {isBulkDeleting ? 'Menghapus...' : 'Hapus Terpilih'}
                  </button>
                  <button
                    onClick={handleClearSelection}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium rounded-md transition cursor-pointer"
                  >
                    Batal Pilih
                  </button>
                </div>
              </div>
            )}

            {/* TABEL DATA PENUGASAN */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                    <tr>
                      <th className="py-3 px-3.5 text-center w-10">
                        <input
                          type="checkbox"
                          checked={isAllCurrentPageSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = isSomeCurrentPageSelected;
                          }}
                          onChange={handleToggleSelectAllCurrentPage}
                          disabled={currentData.length === 0}
                          className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                        />
                      </th>
                      <th className="py-3 px-3.5 text-center w-10">No</th>
                      <th className="py-3 px-3.5">Nama Mitra & SOBAT ID</th>
                      <th className="py-3 px-3.5">Posisi / Kegiatan</th>
                      <th className="py-3 px-3.5 text-right">Hak Honor Alokasi</th>
                      <th className="py-3 px-3.5 text-right">Dicairkannya</th>
                      <th className="py-3 px-3.5 text-right">Sisa Honor Kegiatan</th>
                      <th className="py-3 px-3.5 text-right">Sisa Limit Periode</th>
                      <th className="py-3 px-3.5 text-center">Status Limit</th>
                      <th className="py-3 px-3.5 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-slate-400">
                          Memuat data penugasan...
                        </td>
                      </tr>
                    ) : currentData.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-slate-400">
                          Belum ada data penugasan. Klik tombol <strong>Buat Penugasan</strong>.
                        </td>
                      </tr>
                    ) : (
                      currentData.map((item, index) => {
                        const isChecked = selectedIds.includes(item.id!);
                        const periode = item.kegiatan?.bulan_kegiatan || '';
                        const { maxLimit, warnPercent } = getLimitForPeriode(periode);

                        // Total teralokasi mitra ini KHUSUS pada periode kegiatan baris ini
                        const totalAllocated = accumulatedHonorBySobatPeriode[`${item.sobat_id}__${periode}`] || 0;
                        const hakHonorAlokasi = Number(item.total_honor) || 0;
                        const dicairkan = Number(item.jumlah_dicairkan) || 0;
                        const sisaHonorKegiatan = hakHonorAlokasi - dicairkan;
                        const sisaLimit = maxLimit - totalAllocated;

                        const usageRatio = (totalAllocated / maxLimit) * 100;
                        let statusLimitLabel = 'Tersedia';
                        let statusStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200';

                        if (usageRatio >= 100) {
                          statusLimitLabel = 'Limit Terlampaui';
                          statusStyle = 'bg-rose-50 text-rose-700 border-rose-200';
                        } else if (usageRatio >= warnPercent) {
                          statusLimitLabel = 'Mendekati Limit';
                          statusStyle = 'bg-amber-50 text-amber-700 border-amber-200';
                        }

                        return (
                          <tr
                            key={item.id || index}
                            className={`hover:bg-slate-50/80 transition ${isChecked ? 'bg-blue-50/50' : ''}`}
                          >
                            <td className="py-2.5 px-3.5 text-center">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleSelectOne(item.id!)}
                                className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                              />
                            </td>
                            <td className="py-2.5 px-3.5 text-center font-medium text-slate-400">
                              {(currentPage - 1) * itemsPerPage + index + 1}
                            </td>
                            <td className="py-2.5 px-3.5">
                              <div className="font-semibold text-slate-800">
                                {item.mitra?.nama_mitra || 'Mitra Tidak Ditemukan'}
                              </div>
                              <div className="text-[11px] font-mono text-blue-600">{item.sobat_id}</div>
                            </td>
                            <td className="py-2.5 px-3.5">
                              <div className="font-medium text-slate-800">{item.mitra?.posisi_mitra || '-'}</div>
                              <div className="text-[10px] text-slate-400">
                                {item.kegiatan?.nama_kegiatan || '-'} ({periode || '-'})
                              </div>
                            </td>
                            <td className="py-2.5 px-3.5 text-right font-semibold text-blue-600">
                              {formatRupiah(hakHonorAlokasi)}
                            </td>
                            <td className="py-2.5 px-3.5 text-right font-semibold text-emerald-600">
                              {formatRupiah(dicairkan)}
                            </td>
                            <td className="py-2.5 px-3.5 text-right font-medium">
                              {sisaHonorKegiatan <= 0 && hakHonorAlokasi > 0 ? (
                                <span className="text-[10px] bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded border border-emerald-200">
                                  Lunas
                                </span>
                              ) : (
                                <span className="text-amber-600 font-semibold">
                                  {formatRupiah(sisaHonorKegiatan)}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3.5 text-right font-semibold text-slate-700">
                              {formatRupiah(sisaLimit)}
                            </td>
                            <td className="py-2.5 px-3.5 text-center">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${statusStyle}`}>
                                {statusLimitLabel}
                              </span>
                            </td>
                            <td className="py-2.5 px-3.5 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => {
                                    setDetailPenugasan(item);
                                    setIsDetailModalOpen(true);
                                  }}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-md transition cursor-pointer"
                                  title="Detail Penugasan"
                                >
                                  👁️
                                </button>
                                <button
                                  onClick={() => handleOpenEditModal(item)}
                                  className="p-1.5 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-md transition cursor-pointer"
                                  title="Edit"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() => handleDeletePenugasan(item.id!, item.mitra?.nama_mitra || '')}
                                  className="p-1.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-md transition cursor-pointer"
                                  title="Hapus"
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* PAGINATION FOOTER */}
              <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                <div>
                  Menampilkan <strong>{startItem}</strong> - <strong>{endItem}</strong> dari total <strong>{totalItems}</strong> penugasan
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1 border border-slate-200 rounded bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-600 transition cursor-pointer"
                  >
                    Sebelumnya
                  </button>
                  <span className="px-3 py-1 font-medium text-slate-700">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-2.5 py-1 border border-slate-200 rounded bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-600 transition cursor-pointer"
                  >
                    Selanjutnya
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* MODAL INPUT / EDIT PENUGASAN */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm">
                {isEditMode ? 'Edit Penugasan Mitra' : 'Tambah Penugasan Mitra'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePenugasan} className="p-5 space-y-4">
              {(() => {
                const totalHak = Number(formData.total_honor) || 0;
                const totalCair = Number(formData.jumlah_dicairkan) || 0;
                const sisaHonorKegiatan = totalHak - totalCair;
                const isFullyPaid = isEditMode && totalHak > 0 && totalCair >= totalHak;

                return (
                  <>
                    {/* INDICATOR STATUS PELUNASAN */}
                    {isEditMode && (
                      <div className={`p-3 rounded-lg text-xs font-medium border flex items-center justify-between ${
                        isFullyPaid
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}>
                        <div>
                          <span className="font-semibold">
                            {isFullyPaid ? '✅ STATUS: LUNAS' : '⏳ STATUS: BELUM DICARKAN PENUH'}
                          </span>
                          <p className="text-[11px] mt-0.5 text-slate-600">
                            {isFullyPaid
                              ? 'Honor telah dicairkan 100%. Field pencairan dikunci untuk keamanan data.'
                              : `Sisa honor kegiatan yang belum dicairkan: ${formatRupiah(sisaHonorKegiatan)}`
                            }
                          </p>
                        </div>
                      </div>
                    )}

                    {/* SELECT MITRA — dicek limit & duplikat setiap kali dipilih */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Pilih Mitra
                      </label>
                      <select
                        value={formData.sobat_id}
                        onChange={(e) => handleSelectMitraInForm(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 outline-none bg-white"
                        required
                      >
                        <option value="" disabled>-- Pilih Mitra --</option>
                        {mitraOptions.map((m) => {
                          const sudahLimit = !!checkMitraAlreadyAtLimit(
                            m.sobat_id,
                            currentFormPeriode,
                            isEditMode ? formData.id : undefined
                          );
                          const sudahDitugaskan = !!checkDuplicateAssignment(
                            m.sobat_id,
                            formData.kegiatan_id,
                            isEditMode ? formData.id : undefined
                          );
                          const label = sudahLimit
                            ? ' — Sudah Limit'
                            : sudahDitugaskan
                            ? ' — Sudah Ditugaskan di Kegiatan Ini'
                            : '';
                          return (
                            <option key={m.sobat_id} value={m.sobat_id}>
                              {m.nama_mitra} ({m.sobat_id}){label}
                            </option>
                          );
                        })}
                      </select>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Mitra bertanda "Sudah Limit" atau "Sudah Ditugaskan di Kegiatan Ini" tidak dapat dipilih.
                      </p>
                    </div>

                    {/* SELECT KEGIATAN — juga dicek limit & duplikat karena periode ikut berubah */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Pilih Kegiatan BPS
                      </label>
                      <select
                        value={formData.kegiatan_id}
                        onChange={(e) => handleSelectKegiatanInForm(Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 outline-none bg-white"
                        required
                      >
                        <option value={0} disabled>-- Pilih Kegiatan --</option>
                        {kegiatanOptions.map((k) => (
                          <option key={k.id} value={k.id}>
                            {k.nama_kegiatan} ({k.bulan_kegiatan})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* INPUT HAK HONOR ALOKASI */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Hak Honor Alokasi (Rp)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formData.total_honor || 0}
                        onChange={(e) => setFormData({ ...formData, total_honor: Number(e.target.value) })}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 outline-none"
                        required
                      />
                    </div>

                    {/* INPUT DICARKANNYA (DISABLED JIKA LUNAS) */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-xs font-semibold text-slate-700">
                          Jumlah Dicairkan (Rp)
                        </label>
                        {isFullyPaid && (
                          <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-100 px-1.5 py-0.5 rounded">
                            Terkunci (Lunas)
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        min="0"
                        max={formData.total_honor || 0}
                        disabled={isFullyPaid}
                        value={formData.jumlah_dicairkan || 0}
                        onChange={(e) => setFormData({ ...formData, jumlah_dicairkan: Number(e.target.value) })}
                        className={`w-full px-3 py-2 text-xs border rounded-md outline-none transition ${
                          isFullyPaid
                            ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                            : 'border-slate-200 focus:border-blue-500 bg-white'
                        }`}
                        required
                      />
                      {!isFullyPaid && (
                        <p className="text-[10px] text-slate-400 mt-1">
                          Maksimal pencairan: {formatRupiah(formData.total_honor || 0)}
                        </p>
                      )}
                    </div>

                    {/* INPUT STATUS PENUGASAN */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Status Penugasan
                      </label>
                      <select
                        value={formData.status_penugasan}
                        onChange={(e) => setFormData({ ...formData, status_penugasan: e.target.value })}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 outline-none bg-white"
                      >
                        <option value="Ditugaskan">Ditugaskan</option>
                        <option value="Berjalan">Berjalan</option>
                        <option value="Selesai">Selesai</option>
                        <option value="Dibatalkan">Dibatalkan</option>
                      </select>
                    </div>
                  </>
                );
              })()}

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-md transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan Penugasan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DETAIL PENUGASAN */}
      {isDetailModalOpen && detailPenugasan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm">Rincian Penugasan Mitra</h3>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Nama Mitra:</span>
                <span className="font-semibold text-slate-800">{detailPenugasan.mitra?.nama_mitra || '-'}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">SOBAT ID:</span>
                <span className="font-mono text-blue-600 font-semibold">{detailPenugasan.sobat_id}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Kegiatan:</span>
                <span className="font-medium text-slate-800">{detailPenugasan.kegiatan?.nama_kegiatan || '-'}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Hak Honor Alokasi:</span>
                <span className="font-semibold text-blue-600">
                  {formatRupiah(detailPenugasan.total_honor || 0)}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Jumlah Dicairkan:</span>
                <span className="font-semibold text-emerald-600">
                  {formatRupiah(detailPenugasan.jumlah_dicairkan || 0)}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Sisa Honor Kegiatan:</span>
                <span className="font-semibold text-amber-600">
                  {formatRupiah((detailPenugasan.total_honor || 0) - (detailPenugasan.jumlah_dicairkan || 0))}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-500">Status Penugasan:</span>
                <span className="font-medium text-slate-800">{detailPenugasan.status_penugasan || 'Ditugaskan'}</span>
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-medium rounded-md transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL UBAH STATUS MASSAL */}
      {isBulkStatusModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden border border-slate-200">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm">Ubah Status Massal</h3>
              <button
                onClick={() => setIsBulkStatusModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-600">
                Pilih status baru untuk <strong>{selectedIds.length}</strong> penugasan terpilih:
              </p>
              <select
                value={bulkStatusValue}
                onChange={(e) => setBulkStatusValue(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:border-blue-500 outline-none bg-white"
              >
                <option value="Ditugaskan">Ditugaskan</option>
                <option value="Berjalan">Berjalan</option>
                <option value="Selesai">Selesai</option>
                <option value="Dibatalkan">Dibatalkan</option>
              </select>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setIsBulkStatusModalOpen(false)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-md transition cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleBulkStatusChange}
                disabled={isBulkStatusSubmitting}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition cursor-pointer disabled:opacity-50"
              >
                {isBulkStatusSubmitting ? 'Proses...' : 'Terapkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BLOKIR: "PEGAWAI SUDAH LIMIT" (tidak bisa di-override) */}
      {isLimitBlockedModalOpen && limitBlockedInfo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-rose-500 flex items-center justify-center mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </div>

              <h3 className="text-lg font-bold text-rose-600 mb-1.5">Pegawai Sudah Limit</h3>
              <p className="text-sm text-slate-500 mb-5 leading-relaxed">
                Pegawai tidak dapat ditugaskan pada kegiatan baru di periode {limitBlockedInfo.periode}.
              </p>

              <div className="w-full space-y-2.5 text-left text-sm mb-6">
                <div className="flex justify-between">
                  <span className="text-slate-500">Pegawai</span>
                  <span className="font-semibold text-slate-800">{limitBlockedInfo.namaMitra}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Limit Bulanan</span>
                  <span className="font-semibold text-slate-800">
                    {formatRupiah(limitBlockedInfo.limitBulanan)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Hak Honor (Alokasi)</span>
                  <span className="font-semibold text-slate-800">
                    {formatRupiah(limitBlockedInfo.hakHonorAlokasi)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Sudah Dicairkan</span>
                  <span className="font-semibold text-slate-800">
                    {formatRupiah(limitBlockedInfo.sudahDicairkan)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Sisa Limit</span>
                  <span className="font-semibold text-slate-800">
                    {formatRupiah(limitBlockedInfo.sisaLimit)}{' '}
                    <span className="text-rose-600">({limitBlockedInfo.persenTerpakai}%)</span>
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  setIsLimitBlockedModalOpen(false);
                  setLimitBlockedInfo(null);
                }}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition cursor-pointer"
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ MODAL BLOKIR BARU: "MITRA SUDAH DITUGASKAN" (duplikat kegiatan) ============ */}
      {isDuplicateBlockedModalOpen && duplicateBlockedInfo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-amber-500 flex items-center justify-center mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </div>

              <h3 className="text-lg font-bold text-amber-600 mb-1.5">Mitra Sudah Ditugaskan</h3>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                <strong className="text-slate-700">{duplicateBlockedInfo.namaMitra}</strong> sudah memiliki
                penugasan aktif pada kegiatan{' '}
                <strong className="text-slate-700">{duplicateBlockedInfo.namaKegiatan}</strong>. Satu mitra tidak
                bisa ditugaskan dua kali pada kegiatan yang sama — silakan edit penugasan yang sudah ada jika ingin
                mengubah alokasinya.
              </p>

              <button
                onClick={() => {
                  setIsDuplicateBlockedModalOpen(false);
                  setDuplicateBlockedInfo(null);
                }}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition cursor-pointer"
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ==================================================================================================== */}
    </div>
  );
}