
'use client';

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { logActivity } from '@/lib/logActivity';

// ============================================================
// SUPABASE
// ============================================================

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || '';

const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

const supabase = createClient(
  supabaseUrl,
  supabaseKey
);

// ============================================================
// TYPES
// ============================================================

interface MitraData {
  sobat_id: string;
  nama_mitra: string;
  posisi_mitra?: string;
  alamat?: string;
  kab_kota?: string;
  no_hp?: string;
  email?: string;
  status_keaktifan?: string;
  tim_id?: number | null;
  created_at?: string;
}

interface TimData {
  id: number;
  nama_tim: string;
}

interface ProfileData {
  id: string;
  role: 'admin' | 'pegawai';
  status: string;
  tim_id: number | null;
  full_name?: string | null;
}

// ============================================================
// CONSTANTS
// ============================================================

const BULAN_OPTIONS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const TAHUN_OPTIONS = Array.from(
  { length: 5 },
  (_, i) =>
    String(new Date().getFullYear() - 2 + i)
);

// ============================================================
// HELPER PERIODE KEGIATAN
// ============================================================

const hitungDurasiBulanKegiatan = (
  bulanMulai: string,
  tahunMulai: string,
  bulanSelesai: string,
  tahunSelesai: string
) => {
  const idxMulai =
    BULAN_OPTIONS.indexOf(bulanMulai);

  const idxSelesai =
    BULAN_OPTIONS.indexOf(bulanSelesai);

  const yearMulai =
    parseInt(tahunMulai, 10);

  const yearSelesai =
    parseInt(tahunSelesai, 10);

  const totalBulan =
    (yearSelesai - yearMulai) * 12 +
    (idxSelesai - idxMulai) +
    1;

  return totalBulan > 0
    ? totalBulan
    : 1;
};

const formatPeriodeKegiatan = (
  bulanMulai: string,
  tahunMulai: string,
  bulanSelesai: string,
  tahunSelesai: string
) => {
  const durasiBulan =
    hitungDurasiBulanKegiatan(
      bulanMulai,
      tahunMulai,
      bulanSelesai,
      tahunSelesai
    );

  if (
    bulanMulai === bulanSelesai &&
    tahunMulai === tahunSelesai
  ) {
    return `${bulanMulai} ${tahunMulai} (1 Bulan)`;
  }

  return `${bulanMulai} ${tahunMulai} s.d. ${bulanSelesai} ${tahunSelesai} (${durasiBulan} Bulan)`;
};

// ============================================================
// PAGE
// ============================================================

export default function MitraPage() {
  // ==========================================================
  // SIDEBAR
  // ==========================================================

  const [mobileSidebarOpen, setMobileSidebarOpen] =
    useState(false);

  // ==========================================================
  // USER / PROFILE / TEAM
  // ==========================================================

  const [userProfile, setUserProfile] =
    useState<ProfileData | null>(null);

  const [userRole, setUserRole] =
    useState<'admin' | 'pegawai' | null>(null);

  const [userTimId, setUserTimId] =
    useState<number | null>(null);

  const [timList, setTimList] =
    useState<TimData[]>([]);

  const [profileLoading, setProfileLoading] =
    useState(true);

  // ==========================================================
  // DATA MITRA
  // ==========================================================

  const [mitraList, setMitraList] =
    useState<MitraData[]>([]);

  const [loading, setLoading] =
    useState<boolean>(true);

  const [searchKeyword, setSearchKeyword] =
    useState<string>('');

  const [statusFilter, setStatusFilter] =
    useState<string>('Semua Status');

  const [bulanFilter, setBulanFilter] =
    useState<string>('Semua Bulan');

  // ==========================================================
  // UPLOAD EXCEL
  // ==========================================================

  const [isUploading, setIsUploading] =
    useState<boolean>(false);

  const [isUploadModalOpen, setIsUploadModalOpen] =
    useState<boolean>(false);

  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);

  const [selectedBulan, setSelectedBulan] =
    useState<string>(
      BULAN_OPTIONS[
        new Date().getMonth()
      ]
    );

  const [selectedTahun, setSelectedTahun] =
    useState<string>(
      String(new Date().getFullYear())
    );

  // Tim yang digunakan saat import Excel oleh ADMIN
  const [uploadTimId, setUploadTimId] =
    useState<number | null>(null);

  // ==========================================================
  // PAGINATION
  // ==========================================================

  const [currentPage, setCurrentPage] =
    useState<number>(1);

  const [itemsPerPage, setItemsPerPage] =
    useState<number>(10);

  // ==========================================================
  // MODAL TAMBAH / EDIT
  // ==========================================================

  const [isModalOpen, setIsModalOpen] =
    useState<boolean>(false);

  const [isEditMode, setIsEditMode] =
    useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] =
    useState<boolean>(false);

  // Tim yang dipilih admin saat tambah/edit
  const [formTimId, setFormTimId] =
    useState<number | null>(null);

  // ==========================================================
  // DETAIL
  // ==========================================================

  const [isDetailModalOpen, setIsDetailModalOpen] =
    useState<boolean>(false);

  const [detailMitra, setDetailMitra] =
    useState<MitraData | null>(null);

  // ==========================================================
  // FORM
  // ==========================================================

  const [formData, setFormData] =
    useState<MitraData>({
      sobat_id: '',
      nama_mitra: '',
      posisi_mitra: '',
      alamat: '',
      kab_kota: '',
      no_hp: '',
      email: '',
      status_keaktifan: 'Aktif',
      tim_id: null,
    });

  // ==========================================================
  // BULK ACTION
  // ==========================================================

  const [selectedIds, setSelectedIds] =
    useState<string[]>([]);

  const [isBulkDeleting, setIsBulkDeleting] =
    useState<boolean>(false);

  const [
    isBulkStatusModalOpen,
    setIsBulkStatusModalOpen,
  ] = useState<boolean>(false);

  const [bulkStatusValue, setBulkStatusValue] =
    useState<string>('Aktif');

  const [
    isBulkStatusSubmitting,
    setIsBulkStatusSubmitting,
  ] = useState<boolean>(false);

  // ==========================================================
  // PERIODE EXCEL
  // ==========================================================

  const [selectedBulanMulai, setSelectedBulanMulai] =
    useState('Januari');

  const [selectedTahunMulai, setSelectedTahunMulai] =
    useState('2026');

  const [selectedBulanSelesai, setSelectedBulanSelesai] =
    useState('Januari');

  const [selectedTahunSelesai, setSelectedTahunSelesai] =
    useState('2026');

  // ==========================================================
  // FETCH PROFILE
  // ==========================================================

  const fetchUserProfile = useCallback(
    async () => {
      setProfileLoading(true);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        if (!user) {
          throw new Error(
            'Sesi login tidak ditemukan.'
          );
        }

        const {
          data: profile,
          error: profileError,
        } = await supabase
          .from('profiles')
          .select(
            'id, role, status, tim_id, full_name'
          )
          .eq('id', user.id)
          .single();

        if (profileError) {
          throw profileError;
        }

        if (!profile) {
          throw new Error(
            'Profil pengguna tidak ditemukan.'
          );
        }

        const normalizedTimId =
          profile.tim_id !== null &&
          profile.tim_id !== undefined
            ? Number(profile.tim_id)
            : null;

        const normalizedRole =
          profile.role === 'admin'
            ? 'admin'
            : 'pegawai';

        const normalizedProfile: ProfileData =
          {
            id: profile.id,
            role: normalizedRole,
            status: profile.status,
            tim_id: normalizedTimId,
            full_name:
              profile.full_name || null,
          };

        setUserProfile(
          normalizedProfile
        );

        setUserRole(
          normalizedRole
        );

        setUserTimId(
          normalizedTimId
        );

        console.log(
          '=== PROFILE MITRA ==='
        );
        console.log(
          'User ID:',
          user.id
        );
        console.log(
          'Role:',
          normalizedRole
        );
        console.log(
          'Status:',
          profile.status
        );
        console.log(
          'Tim ID:',
          normalizedTimId
        );
      } catch (err: any) {
        console.error(
          'Error fetching user profile:',
          err
        );

        alert(
          'Gagal memuat profil pengguna: ' +
            (err?.message ||
              'Terjadi kesalahan')
        );
      } finally {
        setProfileLoading(false);
      }
    },
    []
  );

  // ==========================================================
  // FETCH TIM
  // ==========================================================

  const fetchTimList = useCallback(
    async () => {
      try {
        const {
          data,
          error,
        } = await supabase
          .from('tim')
          .select('id, nama_tim')
          .order('id', {
            ascending: true,
          });

        if (error) {
          throw error;
        }

        setTimList(
          (data || []).map(
            (item) => ({
              id: Number(item.id),
              nama_tim:
                item.nama_tim,
            })
          )
        );
      } catch (err: any) {
        console.error(
          'Error fetching tim:',
          err
        );

        alert(
          'Gagal memuat daftar tim: ' +
            (err?.message ||
              'Terjadi kesalahan')
        );
      }
    },
    []
  );

  // ==========================================================
  // LOAD PROFILE + TIM
  // ==========================================================

  useEffect(() => {
    const loadInitialData =
      async () => {
        await Promise.all([
          fetchUserProfile(),
          fetchTimList(),
        ]);
      };

    loadInitialData();
  }, [
    fetchUserProfile,
    fetchTimList,
  ]);

  // ==========================================================
  // FETCH MITRA
  // ==========================================================

  const fetchMitra = useCallback(
    async () => {
      if (profileLoading) {
        return;
      }

      if (!userRole) {
        return;
      }

      setLoading(true);

      try {
        let query = supabase
          .from('mitra')
          .select('*')
          .order('created_at', {
            ascending: false,
          });

        // ------------------------------------------------------
        // Filter tambahan di frontend/query.
        //
        // RLS tetap menjadi pengaman utama.
        // ------------------------------------------------------

        if (
          userRole === 'pegawai'
        ) {
          if (
            userTimId === null
          ) {
            setMitraList([]);
            return;
          }

          query = query.eq(
            'tim_id',
            userTimId
          );
        }

        if (searchKeyword) {
          query = query.or(
            `nama_mitra.ilike.%${searchKeyword}%,sobat_id.ilike.%${searchKeyword}%`
          );
        }

        if (
          statusFilter !==
          'Semua Status'
        ) {
          query = query.eq(
            'status_keaktifan',
            statusFilter
          );
        }

        const {
          data,
          error,
        } = await query;

        if (error) {
          throw error;
        }

        let filteredData =
          data || [];

        // ------------------------------------------------------
        // Filter bulan
        // ------------------------------------------------------

        if (
          bulanFilter !==
          'Semua Bulan'
        ) {
          const targetMonthIndex =
            BULAN_OPTIONS.indexOf(
              bulanFilter
            );

          if (
            targetMonthIndex !==
            -1
          ) {
            filteredData =
              filteredData.filter(
                (item) => {
                  if (
                    !item.created_at
                  ) {
                    return true;
                  }

                  const date =
                    new Date(
                      item.created_at
                    );

                  return (
                    date.getMonth() ===
                    targetMonthIndex
                  );
                }
              );
          }
        }

        setMitraList(
          filteredData
        );

        setCurrentPage(1);

        setSelectedIds([]);
      } catch (err: any) {
        console.error(
          'Error fetching mitra:',
          err
        );

        alert(
          'Gagal memuat data mitra: ' +
            (err?.message ||
              err?.details ||
              err?.hint ||
              'Terjadi kesalahan')
        );
      } finally {
        setLoading(false);
      }
    },
    [
      profileLoading,
      userRole,
      userTimId,
      searchKeyword,
      statusFilter,
      bulanFilter,
    ]
  );

  useEffect(() => {
    if (
      !profileLoading &&
      userRole
    ) {
      fetchMitra();
    }
  }, [
    profileLoading,
    userRole,
    fetchMitra,
  ]);

  // ==========================================================
  // PAGINATION
  // ==========================================================

  const totalItems =
    mitraList.length;

  const totalPages =
    Math.ceil(
      totalItems /
        itemsPerPage
    ) || 1;

  const currentData =
    useMemo(() => {
      const start =
        (currentPage - 1) *
        itemsPerPage;

      return mitraList.slice(
        start,
        start + itemsPerPage
      );
    }, [
      mitraList,
      currentPage,
      itemsPerPage,
    ]);

  const startItem =
    totalItems === 0
      ? 0
      : (currentPage - 1) *
          itemsPerPage +
        1;

  const endItem = Math.min(
    currentPage *
      itemsPerPage,
    totalItems
  );

  // ==========================================================
  // CHECKLIST
  // ==========================================================

  const isAllCurrentPageSelected =
    currentData.length > 0 &&
    currentData.every(
      (item) =>
        selectedIds.includes(
          item.sobat_id
        )
    );

  const isSomeCurrentPageSelected =
    currentData.some(
      (item) =>
        selectedIds.includes(
          item.sobat_id
        )
    ) &&
    !isAllCurrentPageSelected;

  const handleToggleSelectOne = (
    sobatId: string
  ) => {
    setSelectedIds(
      (prev) =>
        prev.includes(sobatId)
          ? prev.filter(
              (id) =>
                id !== sobatId
            )
          : [
              ...prev,
              sobatId,
            ]
    );
  };

  const handleToggleSelectAllCurrentPage =
    () => {
      const currentPageIds =
        currentData.map(
          (item) =>
            item.sobat_id
        );

      if (
        isAllCurrentPageSelected
      ) {
        setSelectedIds(
          (prev) =>
            prev.filter(
              (id) =>
                !currentPageIds.includes(
                  id
                )
            )
        );
      } else {
        setSelectedIds(
          (prev) =>
            Array.from(
              new Set([
                ...prev,
                ...currentPageIds,
              ])
            )
        );
      }
    };

  const handleClearSelection =
    () => {
      setSelectedIds([]);
    };

  // ==========================================================
  // BULK DELETE
  // ==========================================================

  const handleBulkDelete =
    async () => {
      if (
        selectedIds.length ===
        0
      ) {
        return;
      }

      const confirmDelete =
        window.confirm(
          `Apakah Anda yakin ingin menghapus ${selectedIds.length} data mitra terpilih? Tindakan ini tidak dapat dibatalkan.`
        );

      if (!confirmDelete) {
        return;
      }

      setIsBulkDeleting(true);

      try {
        const mitraTerhapus =
          mitraList.filter(
            (m) =>
              selectedIds.includes(
                m.sobat_id
              )
          );

        const {
          error,
        } = await supabase
          .from('mitra')
          .delete()
          .in(
            'sobat_id',
            selectedIds
          );

        if (error) {
          throw error;
        }

        const daftarNama =
          mitraTerhapus
            .map(
              (m) =>
                `${m.nama_mitra} (${m.sobat_id})`
            )
            .join(', ');

        await logActivity({
          aksi: 'hapus',
          entitas: 'mitra',
          deskripsi: `Menghapus ${selectedIds.length} data mitra sekaligus: ${
            daftarNama ||
            selectedIds.join(
              ', '
            )
          }`,
        });

        alert(
          `${selectedIds.length} data mitra berhasil dihapus.`
        );

        setSelectedIds([]);

        await fetchMitra();
      } catch (err: any) {
        console.error(
          'Error bulk deleting mitra:',
          err
        );

        alert(
          'Gagal menghapus data terpilih: ' +
            (err?.message ||
              'Terjadi kesalahan')
        );
      } finally {
        setIsBulkDeleting(
          false
        );
      }
    };

  // ==========================================================
  // BULK STATUS
  // ==========================================================

  const handleBulkStatusChange =
    async () => {
      if (
        selectedIds.length ===
        0
      ) {
        return;
      }

      setIsBulkStatusSubmitting(
        true
      );

      try {
        const mitraDiubah =
          mitraList.filter(
            (m) =>
              selectedIds.includes(
                m.sobat_id
              )
          );

        const {
          error,
        } = await supabase
          .from('mitra')
          .update({
            status_keaktifan:
              bulkStatusValue,
          })
          .in(
            'sobat_id',
            selectedIds
          );

        if (error) {
          throw error;
        }

        const daftarNama =
          mitraDiubah
            .map(
              (m) =>
                `${m.nama_mitra} (${m.sobat_id})`
            )
            .join(', ');

        await logActivity({
          aksi: 'ubah',
          entitas: 'mitra',
          deskripsi: `Mengubah status ${selectedIds.length} mitra terpilih menjadi "${bulkStatusValue}": ${
            daftarNama ||
            selectedIds.join(
              ', '
            )
          }`,
        });

        alert(
          `Status ${selectedIds.length} mitra terpilih berhasil diubah menjadi "${bulkStatusValue}".`
        );

        setIsBulkStatusModalOpen(
          false
        );

        setSelectedIds([]);

        await fetchMitra();
      } catch (err: any) {
        console.error(
          'Error bulk updating status mitra:',
          err
        );

        alert(
          'Gagal mengubah status terpilih: ' +
            (err?.message ||
              'Terjadi kesalahan')
        );
      } finally {
        setIsBulkStatusSubmitting(
          false
        );
      }
    };

  // ==========================================================
  // EXPORT PDF
  // ==========================================================

  const handleExportPDF =
    () => {
      if (
        mitraList.length ===
        0
      ) {
        alert(
          'Tidak ada data mitra untuk diexport.'
        );
        return;
      }

      const doc = new jsPDF(
        'landscape',
        'mm',
        'a4'
      );

      doc.setFontSize(14);

      doc.text(
        'BADAN PUSAT STATISTIK KOTA MOJOKERTO',
        14,
        15
      );

      doc.setFontSize(10);

      doc.text(
        'Daftar Master Data Mitra Statistik',
        14,
        21
      );

      doc.setFontSize(8);

      doc.text(
        `Tanggal Cetak: ${new Date().toLocaleDateString(
          'id-ID'
        )}`,
        14,
        26
      );

      const tableBody =
        mitraList.map(
          (
            item,
            index
          ) => [
            index + 1,
            item.sobat_id ||
              '-',
            item.nama_mitra ||
              '-',
            item.posisi_mitra ||
              '-',
            item.kab_kota ||
              '-',
            item.alamat ||
              '-',
            item.no_hp ||
              '-',
            item.status_keaktifan ||
              'Aktif',
          ]
        );

      autoTable(doc, {
        startY: 30,

        head: [
          [
            'No',
            'SOBAT ID',
            'Nama Mitra',
            'Posisi',
            'Kab/Kota',
            'Alamat Detail',
            'No. Telp',
            'Status',
          ],
        ],

        body: tableBody,

        theme: 'grid',

        headStyles: {
          fillColor: [
            15,
            23,
            42,
          ],
          textColor: [
            255,
            255,
            255,
          ],
          fontSize: 8,
          fontStyle:
            'bold',
        },

        bodyStyles: {
          fontSize: 8,
        },

        columnStyles: {
          0: {
            cellWidth: 10,
            halign:
              'center',
          },

          1: {
            cellWidth: 30,
          },

          2: {
            cellWidth: 40,
          },

          3: {
            cellWidth: 40,
          },

          4: {
            cellWidth: 30,
          },

          5: {
            cellWidth: 65,
          },

          6: {
            cellWidth: 30,
          },

          7: {
            cellWidth: 20,
            halign:
              'center',
          },
        },
      });

      doc.save(
        `Data_Mitra_BPS_Mojokerto_${new Date()
          .toISOString()
          .slice(
            0,
            10
          )}.pdf`
      );
    };

  // ==========================================================
  // HELPER TEAM UNTUK EXCEL
  // ==========================================================

  const getFinalTimId =
    (): number | null => {
      if (
        userRole ===
        'pegawai'
      ) {
        return userTimId;
      }

      if (
        userRole ===
        'admin'
      ) {
        return uploadTimId;
      }

      return null;
    };

  // ==========================================================
  // PROSES EXCEL
  // ==========================================================

  const handleProcessExcel =
    async () => {
      if (!selectedFile) {
        alert(
          'Pilih file Excel terlebih dahulu!'
        );
        return;
      }

      if (profileLoading) {
        alert(
          'Profil pengguna masih dimuat. Silakan tunggu sebentar.'
        );
        return;
      }

      const finalTimId =
        getFinalTimId();

      if (
        finalTimId ===
          null ||
        !Number.isFinite(
          Number(finalTimId)
        )
      ) {
        if (
          userRole ===
          'pegawai'
        ) {
          alert(
            'Akun pegawai belum memiliki tim. Silakan hubungi admin.'
          );
        } else {
          alert(
            'Silakan pilih tim untuk data Excel terlebih dahulu.'
          );
        }

        return;
      }

      setIsUploading(true);

      const reader =
        new FileReader();

      reader.onload = async (
        evt
      ) => {
        try {
          const buffer =
            evt.target?.result;

          if (!buffer) {
            throw new Error(
              'Gagal membaca file'
            );
          }

          const wb =
            XLSX.read(
              buffer,
              {
                type: 'array',
              }
            );

          const wsname =
            wb.SheetNames[0];

          const ws =
            wb.Sheets[
              wsname
            ];

          const rawData: any[] =
            XLSX.utils.sheet_to_json(
              ws
            );

          const formattedData: MitraData[] =
            rawData
              .map(
                (row) => ({
                  sobat_id:
                    String(
                      row[
                        'SOBAT ID'
                      ] ||
                        row[
                          'Sobat ID'
                        ] ||
                        row[
                          'sobat_id'
                        ] ||
                        ''
                    ).trim(),

                  nama_mitra:
                    String(
                      row[
                        'Nama Lengkap'
                      ] ||
                        row[
                          'Nama'
                        ] ||
                        row[
                          'nama_mitra'
                        ] ||
                        ''
                    ).trim(),

                  posisi_mitra:
                    String(
                      row[
                        'Posisi'
                      ] ||
                        row[
                          'posisi_mitra'
                        ] ||
                        ''
                    ).trim(),

                  alamat:
                    String(
                      row[
                        'Alamat Detail'
                      ] ||
                        row[
                          'Alamat'
                        ] ||
                        ''
                    ).trim(),

                  kab_kota:
                    String(
                      row[
                        'Alamat Kab/Kota'
                      ] ||
                        row[
                          'Kab/Kota'
                        ] ||
                        ''
                    ).trim(),

                  no_hp:
                    String(
                      row[
                        'No Telp'
                      ] ||
                        row[
                          'no_hp'
                        ] ||
                        ''
                    ).trim(),

                  email:
                    String(
                      row[
                        'Email'
                      ] ||
                        row[
                          'email'
                        ] ||
                        ''
                    ).trim(),

                  status_keaktifan:
                    'Aktif',

                  // ------------------------------------
                  // MITRA BARU AKAN MENGGUNAKAN
                  // TIM DARI AKUN / PILIHAN ADMIN
                  // ------------------------------------
                  tim_id:
                    finalTimId,
                })
              )
              .filter(
                (item) =>
                  item.sobat_id &&
                  item.nama_mitra
              );

          if (
            formattedData.length ===
            0
          ) {
            alert(
              'Data kosong atau nama header kolom Excel tidak sesuai.'
            );

            setIsUploading(
              false
            );

            return;
          }

          // ==================================================
          // HILANGKAN DUPLIKAT SOBAT ID
          // ==================================================

          const uniqueMitraMap =
            new Map<
              string,
              MitraData
            >();

          formattedData.forEach(
            (item) => {
              uniqueMitraMap.set(
                item.sobat_id,
                item
              );
            }
          );

          const uniqueFormattedData =
            Array.from(
              uniqueMitraMap.values()
            );

          // ==================================================
          // CEK MITRA YANG SUDAH ADA
          // ==================================================

          const sobatIdsToCheck =
            uniqueFormattedData.map(
              (m) =>
                m.sobat_id
            );

          const {
            data: existingMitraRows,
            error:
              errExistingMitra,
          } =
            await supabase
              .from('mitra')
              .select(
                'sobat_id, tim_id'
              )
              .in(
                'sobat_id',
                sobatIdsToCheck
              );

          if (
            errExistingMitra
          ) {
            throw errExistingMitra;
          }

          const existingMitraMap =
            new Map<
              string,
              number | null
            >();

          (
            existingMitraRows ||
            []
          ).forEach(
            (row) => {
              existingMitraMap.set(
                row.sobat_id,
                row.tim_id !==
                  null &&
                  row.tim_id !==
                    undefined
                  ? Number(
                      row.tim_id
                    )
                  : null
              );
            }
          );

          // ==================================================
          // MITRA BARU
          // ==================================================

          const mitraBaru =
            uniqueFormattedData.filter(
              (m) =>
                !existingMitraMap.has(
                  m.sobat_id
                )
            );

          // ==================================================
          // MITRA LAMA
          //
          // PENTING:
          // - status tidak ditimpa
          // - tim_id tidak dipindahkan
          // ==================================================

          const mitraLama =
            uniqueFormattedData
              .filter(
                (m) =>
                  existingMitraMap.has(
                    m.sobat_id
                  )
              )
              .map(
                ({
                  status_keaktifan,
                  tim_id,
                  ...rest
                }) => rest
              );

          // ==================================================
          // INSERT MITRA BARU
          // ==================================================

          if (
            mitraBaru.length >
            0
          ) {
            const {
              error:
                errInsertBaru,
            } =
              await supabase
                .from('mitra')
                .insert(
                  mitraBaru
                );

            if (
              errInsertBaru
            ) {
              throw errInsertBaru;
            }
          }

          // ==================================================
          // UPDATE MITRA LAMA
          // ==================================================

          if (
            mitraLama.length >
            0
          ) {
            const {
              error:
                errUpdateLama,
            } =
              await supabase
                .from('mitra')
                .upsert(
                  mitraLama,
                  {
                    onConflict:
                      'sobat_id',
                  }
                );

            if (
              errUpdateLama
            ) {
              throw errUpdateLama;
            }
          }

          // ==================================================
          // NAMA KEGIATAN DARI NAMA FILE
          // ==================================================

          const namaKegiatan =
            selectedFile.name
              .replace(
                /\.[^/.]+$/,
                ''
              )
              .split(
                /[-_]/
              )[0]
              .trim()
              .toUpperCase();

          // ==================================================
          // PERIODE KEGIATAN
          // ==================================================

          const bulanMulaiIndex =
            BULAN_OPTIONS.indexOf(
              selectedBulanMulai
            );

          const bulanSelesaiIndex =
            BULAN_OPTIONS.indexOf(
              selectedBulanSelesai
            );

          if (
            bulanMulaiIndex ===
              -1 ||
            bulanSelesaiIndex ===
              -1
          ) {
            throw new Error(
              'Bulan periode kegiatan tidak valid.'
            );
          }

          const periodeMulaiValue =
            Number(
              selectedTahunMulai
            ) *
              12 +
            bulanMulaiIndex;

          const periodeSelesaiValue =
            Number(
              selectedTahunSelesai
            ) *
              12 +
            bulanSelesaiIndex;

          if (
            periodeMulaiValue >
            periodeSelesaiValue
          ) {
            throw new Error(
              'Periode mulai tidak boleh lebih besar dari periode selesai.'
            );
          }

          const bulanKegiatanDisisipkan =
            formatPeriodeKegiatan(
              selectedBulanMulai,
              selectedTahunMulai,
              selectedBulanSelesai,
              selectedTahunSelesai
            );

          // ==================================================
          // CEK KEGIATAN
          //
          // Sekarang berdasarkan:
          // 1. nama kegiatan
          // 2. periode
          // 3. tim
          // ==================================================

          let kegiatanId:
            | number
            | null = null;

          let kegiatanBaruDibuat =
            false;

          const {
            data: existingKegiatan,
            error:
              errCheckKegiatan,
          } =
            await supabase
              .from('kegiatan')
              .select('id')
              .eq(
                'nama_kegiatan',
                namaKegiatan
              )
              .eq(
                'bulan_kegiatan',
                bulanKegiatanDisisipkan
              )
              .eq(
                'tim_id',
                finalTimId
              )
              .maybeSingle();

          if (
            errCheckKegiatan
          ) {
            throw errCheckKegiatan;
          }

          if (
            existingKegiatan
          ) {
            kegiatanId =
              existingKegiatan.id;
          } else {
            // ----------------------------------------------
            // Generate kode kegiatan
            // ----------------------------------------------

            const {
              count,
              error:
                errCount,
            } =
              await supabase
                .from('kegiatan')
                .select(
                  '*',
                  {
                    count:
                      'exact',
                    head: true,
                  }
                );

            if (errCount) {
              throw errCount;
            }

            const nextNumber =
              (count || 0) + 1;

            const kodeBaru =
              `KD-${String(
                nextNumber
              ).padStart(
                3,
                '0'
              )}`;

            // ----------------------------------------------
            // Insert kegiatan
            // ----------------------------------------------

            const {
              data: newKegiatan,
              error: errKeg,
            } =
              await supabase
                .from('kegiatan')
                .insert({
                  nama_kegiatan:
                    namaKegiatan,

                  kode_kegiatan:
                    kodeBaru,

                  bulan_kegiatan:
                    bulanKegiatanDisisipkan,

                  keterangan: `Otomatis diimpor dari file Excel Mitra (${bulanKegiatanDisisipkan})`,

                  pagu_anggaran:
                    0,

                  tim_id:
                    finalTimId,
                })
                .select(
                  'id'
                )
                .single();

            if (errKeg) {
              throw errKeg;
            }

            if (
              !newKegiatan
            ) {
              throw new Error(
                'Kegiatan berhasil dibuat tetapi ID kegiatan tidak ditemukan.'
              );
            }

            kegiatanId =
              newKegiatan.id;

            kegiatanBaruDibuat =
              true;
          }

          // ==================================================
          // INSERT PENUGASAN
          // ==================================================

          if (kegiatanId) {
            const penugasanList =
              uniqueFormattedData.map(
                (m) => ({
                  sobat_id:
                    m.sobat_id,

                  kegiatan_id:
                    kegiatanId,
                })
              );

            const {
              error:
                errPenugasan,
            } =
              await supabase
                .from(
                  'penugasan'
                )
                .upsert(
                  penugasanList,
                  {
                    onConflict:
                      'sobat_id, kegiatan_id',
                  }
                );

            if (
              errPenugasan
            ) {
              throw errPenugasan;
            }
          }

          // ==================================================
          // LOG
          // ==================================================

          await logActivity({
            aksi: 'tambah',
            entitas: 'mitra',

            deskripsi: `Mengunggah Excel: ${uniqueFormattedData.length} data mitra (${mitraBaru.length} baru, ${mitraLama.length} diperbarui) didaftarkan ke kegiatan "${namaKegiatan}" (${bulanKegiatanDisisipkan})${kegiatanBaruDibuat ? ' — kegiatan baru otomatis dibuat' : ''}`,

            referensiId:
              kegiatanId,
          });

          alert(
            `Berhasil!\n- ${uniqueFormattedData.length} data mitra diimpor/diperbarui.\n- ${mitraBaru.length} mitra baru.\n- ${mitraLama.length} mitra lama diperbarui.\n- Otomatis terdaftar pada Kegiatan: "${namaKegiatan}" (${bulanKegiatanDisisipkan}).`
          );

          setIsUploadModalOpen(
            false
          );

          setSelectedFile(
            null
          );

          setUploadTimId(
            userRole ===
              'pegawai'
              ? userTimId
              : null
          );

          await fetchMitra();
        } catch (err: unknown) {
          let errorMessage =
            'Terjadi kesalahan';

          if (
            err instanceof
            Error
          ) {
            errorMessage =
              err.message;
          } else if (
            typeof err ===
              'object' &&
            err !== null
          ) {
            const e =
              err as any;

            errorMessage =
              e.message ||
              e.details ||
              e.hint ||
              e.code ||
              JSON.stringify(
                e
              );
          } else if (
            err != null
          ) {
            errorMessage =
              String(err);
          }

          console.error(
            'Error processing Excel:',
            err
          );

          if (
            typeof err ===
              'object' &&
            err !== null &&
            (err as any)
              .code ===
              '42501'
          ) {
            alert(
              'Gagal mengunggah Excel.\n\nData ditolak oleh Row Level Security (RLS).\n\nPastikan tim akun pegawai sama dengan tim data yang diproses.'
            );
          } else {
            alert(
              'Gagal mengunggah data Excel: ' +
                errorMessage
            );
          }
        } finally {
          setIsUploading(
            false
          );
        }
      };

      reader.readAsArrayBuffer(
        selectedFile
      );
    };

  // ==========================================================
  // OPEN ADD MODAL
  // ==========================================================

  const handleOpenAddModal =
    () => {
      if (profileLoading) {
        alert(
          'Profil pengguna masih dimuat. Silakan tunggu sebentar.'
        );
        return;
      }

      if (!userRole) {
        alert(
          'Role pengguna tidak ditemukan. Silakan login kembali.'
        );
        return;
      }

      // ------------------------------------------------------
      // PEGAWAI
      // ------------------------------------------------------

      if (
        userRole ===
        'pegawai'
      ) {
        if (
          userTimId === null
        ) {
          alert(
            'Akun pegawai belum memiliki tim. Silakan hubungi admin.'
          );
          return;
        }

        setFormTimId(
          userTimId
        );
      }

      // ------------------------------------------------------
      // ADMIN
      // ------------------------------------------------------

      if (
        userRole ===
        'admin'
      ) {
        setFormTimId(
          null
        );
      }

      setIsEditMode(
        false
      );

      setFormData({
        sobat_id: '',
        nama_mitra: '',
        posisi_mitra: '',
        alamat: '',
        kab_kota: '',
        no_hp: '',
        email: '',
        status_keaktifan:
          'Aktif',
        tim_id:
          userRole ===
          'pegawai'
            ? userTimId
            : null,
      });

      setIsModalOpen(
        true
      );
    };

  // ==========================================================
  // OPEN EDIT MODAL
  // ==========================================================

  const handleOpenEditModal =
    (
      mitra: MitraData
    ) => {
      if (
        profileLoading
      ) {
        alert(
          'Profil pengguna masih dimuat.'
        );
        return;
      }

      let editTimId =
        mitra.tim_id ??
        null;

      // Pegawai selalu dikunci ke tim sendiri
      if (
        userRole ===
        'pegawai'
      ) {
        editTimId =
          userTimId;
      }

      // Admin boleh mengubah tim
      if (
        userRole ===
          'pegawai' &&
        userTimId ===
          null
      ) {
        alert(
          'Akun pegawai belum memiliki tim.'
        );
        return;
      }

      setIsEditMode(
        true
      );

      setFormTimId(
        editTimId
      );

      setFormData({
        sobat_id:
          mitra.sobat_id,

        nama_mitra:
          mitra.nama_mitra ||
          '',

        posisi_mitra:
          mitra.posisi_mitra ||
          '',

        alamat:
          mitra.alamat ||
          '',

        kab_kota:
          mitra.kab_kota ||
          '',

        no_hp:
          mitra.no_hp ||
          '',

        email:
          mitra.email ||
          '',

        status_keaktifan:
          mitra.status_keaktifan ||
          'Aktif',

        tim_id:
          editTimId,
      });

      setIsModalOpen(
        true
      );
    };

  // ==========================================================
  // DETAIL
  // ==========================================================

  const handleOpenDetailModal =
    (
      mitra: MitraData
    ) => {
      setDetailMitra(
        mitra
      );

      setIsDetailModalOpen(
        true
      );
    };

  // ==========================================================
  // INPUT CHANGE
  // ==========================================================

  const handleInputChange =
    (
      e: React.ChangeEvent<
        HTMLInputElement |
          HTMLSelectElement |
          HTMLTextAreaElement
      >
    ) => {
      const {
        name,
        value,
      } = e.target;

      setFormData(
        (prev) => ({
          ...prev,
          [name]: value,
        })
      );
    };

  // ==========================================================
  // SAVE MITRA
  // ==========================================================

  const handleSaveMitra =
    async (
      e: React.FormEvent
    ) => {
      e.preventDefault();

      if (
        !formData.sobat_id.trim() ||
        !formData.nama_mitra.trim()
      ) {
        alert(
          'SOBAT ID dan Nama Mitra wajib diisi!'
        );
        return;
      }

      if (
        profileLoading
      ) {
        alert(
          'Profil pengguna masih dimuat. Silakan tunggu sebentar.'
        );
        return;
      }

      setIsSubmitting(
        true
      );

      try {
        // ------------------------------------------------------
        // Ambil user login TERBARU
        // ------------------------------------------------------

        const {
          data: {
            user,
          },
          error:
            userError,
        } =
          await supabase.auth.getUser();

        if (
          userError
        ) {
          throw userError;
        }

        if (!user) {
          throw new Error(
            'Sesi login tidak ditemukan. Silakan login kembali.'
          );
        }

        // ------------------------------------------------------
        // Ambil profile TERBARU
        // ------------------------------------------------------

        const {
          data: profile,
          error:
            profileError,
        } =
          await supabase
            .from('profiles')
            .select(
              'id, role, status, tim_id, full_name'
            )
            .eq(
              'id',
              user.id
            )
            .single();

        if (
          profileError
        ) {
          throw profileError;
        }

        if (!profile) {
          throw new Error(
            'Profil pengguna tidak ditemukan.'
          );
        }

        const currentRole =
          profile.role ===
          'admin'
            ? 'admin'
            : 'pegawai';

        const currentTimId =
          profile.tim_id !==
            null &&
          profile.tim_id !==
            undefined
            ? Number(
                profile.tim_id
              )
            : null;

        // ------------------------------------------------------
        // Tentukan tim final
        // ------------------------------------------------------

        let finalTimId:
          | number
          | null = null;

        if (
          currentRole ===
          'pegawai'
        ) {
          // ----------------------------------------------
          // PEGAWAI TIDAK BOLEH MEMILIH TIM
          // ----------------------------------------------

          if (
            currentTimId ===
            null
          ) {
            throw new Error(
              'Akun pegawai belum memiliki tim. Silakan hubungi admin.'
            );
          }

          finalTimId =
            currentTimId;
        } else {
          // ----------------------------------------------
          // ADMIN MENGGUNAKAN TIM DARI FORM
          // ----------------------------------------------

          finalTimId =
            formTimId !==
              null &&
            formTimId !==
              undefined
              ? Number(
                  formTimId
                )
              : null;

          if (
            finalTimId ===
            null
          ) {
            throw new Error(
              'Tim mitra belum dipilih.'
            );
          }
        }

        if (
          !Number.isFinite(
            Number(
              finalTimId
            )
          )
        ) {
          throw new Error(
            'Tim mitra tidak valid.'
          );
        }

        // ------------------------------------------------------
        // PAYLOAD
        // ------------------------------------------------------

        const payload = {
          sobat_id:
            formData.sobat_id.trim(),

          nama_mitra:
            formData.nama_mitra.trim(),

          posisi_mitra:
            formData.posisi_mitra?.trim() ||
            null,

          alamat:
            formData.alamat?.trim() ||
            null,

          kab_kota:
            formData.kab_kota?.trim() ||
            null,

          no_hp:
            formData.no_hp?.trim() ||
            null,

          email:
            formData.email?.trim() ||
            null,

          status_keaktifan:
            formData.status_keaktifan ||
            'Aktif',

          tim_id:
            finalTimId,
        };

        console.log(
          '================================'
        );

        console.log(
          'DEBUG SAVE MITRA'
        );

        console.log(
          'Role:',
          currentRole
        );

        console.log(
          'Profile tim_id:',
          currentTimId
        );

        console.log(
          'Form tim_id:',
          formTimId
        );

        console.log(
          'Final tim_id:',
          finalTimId
        );

        console.log(
          'Payload:',
          payload
        );

        // ------------------------------------------------------
        // DEBUG get_my_tim_id()
        // ------------------------------------------------------

        if (
          currentRole ===
          'pegawai'
        ) {
          const {
            data: rpcTimId,
            error:
              rpcError,
          } =
            await supabase.rpc(
              'get_my_tim_id'
            );

          console.log(
            'RPC get_my_tim_id:',
            rpcTimId
          );

          console.log(
            'RPC error:',
            rpcError
          );

          if (
            rpcError
          ) {
            console.warn(
              'RPC get_my_tim_id gagal:',
              rpcError
            );
          }
        }

        console.log(
          '================================'
        );

        // ------------------------------------------------------
        // UPDATE
        // ------------------------------------------------------

        if (
          isEditMode
        ) {
          const {
            error,
          } =
            await supabase
              .from('mitra')
              .update({
                nama_mitra:
                  payload.nama_mitra,

                posisi_mitra:
                  payload.posisi_mitra,

                alamat:
                  payload.alamat,

                kab_kota:
                  payload.kab_kota,

                no_hp:
                  payload.no_hp,

                email:
                  payload.email,

                status_keaktifan:
                  payload.status_keaktifan,

                tim_id:
                  finalTimId,
              })
              .eq(
                'sobat_id',
                formData.sobat_id
              );

          if (error) {
            throw error;
          }

          await logActivity({
            aksi: 'ubah',
            entitas: 'mitra',

            deskripsi: `Memperbarui data mitra ${formData.nama_mitra} (${formData.sobat_id})`,

            referensiId:
              formData.sobat_id,
          });

          alert(
            'Data mitra berhasil diperbarui.'
          );
        } else {
          // ----------------------------------------------------
          // INSERT BARU
          // ----------------------------------------------------

          const {
            error,
          } =
            await supabase
              .from('mitra')
              .insert([
                payload,
              ]);

          if (error) {
            console.error(
              'INSERT MITRA DITOLAK:',
              {
                error,
                payload,
                currentRole,
                currentTimId,
                finalTimId,
              }
            );

            throw error;
          }

          await logActivity({
            aksi: 'tambah',
            entitas: 'mitra',

            deskripsi: `Menambahkan mitra baru ${formData.nama_mitra} (${formData.sobat_id})`,

            referensiId:
              formData.sobat_id,
          });

          alert(
            'Mitra baru berhasil ditambahkan.'
          );
        }

        setIsModalOpen(
          false
        );

        await fetchMitra();
      } catch (err: any) {
        console.error(
          'Error saving mitra:',
          err
        );

        if (
          err?.code ===
          '42501'
        ) {
          alert(
            'Gagal menyimpan data.\n\n' +
              'Data ditolak oleh Row Level Security (RLS).\n\n' +
              `Role: ${
                userRole ||
                '-'
              }\n` +
              `Tim akun: ${
                userTimId ??
                '-'
              }\n\n` +
              'Silakan cek hasil get_my_tim_id() pada Console browser.'
          );
        } else {
          alert(
            'Gagal menyimpan data:\n\n' +
              (err?.message ||
                err?.details ||
                err?.hint ||
                'Terjadi kesalahan')
          );
        }
      } finally {
        setIsSubmitting(
          false
        );
      }
    };

  // ==========================================================
  // DELETE MITRA
  // ==========================================================

  const handleDeleteMitra =
    async (
      sobatId: string,
      nama: string
    ) => {
      const confirmDelete =
        window.confirm(
          `Apakah Anda yakin ingin menghapus data mitra "${nama}" (${sobatId})?`
        );

      if (!confirmDelete) {
        return;
      }

      try {
        const {
          error,
        } =
          await supabase
            .from('mitra')
            .delete()
            .eq(
              'sobat_id',
              sobatId
            );

        if (error) {
          throw error;
        }

        await logActivity({
          aksi: 'hapus',
          entitas: 'mitra',

          deskripsi: `Menghapus data mitra ${nama} (${sobatId})`,

          referensiId:
            sobatId,
        });

        alert(
          'Data mitra berhasil dihapus.'
        );

        await fetchMitra();
      } catch (err: any) {
        console.error(
          'Error deleting mitra:',
          err
        );

        if (
          err?.code ===
          '42501'
        ) {
          alert(
            'Data tidak dapat dihapus karena tidak termasuk tim yang boleh Anda kelola.'
          );
        } else {
          alert(
            'Gagal menghapus data: ' +
              (err?.message ||
                'Terjadi kesalahan')
          );
        }
      }
    };

  // ==========================================================
  // HELPER NAMA TIM
  // ==========================================================

  const getTimName = (
    timId:
      | number
      | null
      | undefined
  ) => {
    if (
      timId === null ||
      timId === undefined
    ) {
      return 'Tidak ditentukan';
    }

    const tim =
      timList.find(
        (item) =>
          Number(item.id) ===
          Number(timId)
      );

    return (
      tim?.nama_tim ||
      `Tim #${timId}`
    );
  };

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans">
      <Sidebar
        mobileOpen={
          mobileSidebarOpen
        }
        onClose={() =>
          setMobileSidebarOpen(
            false
          )
        }
      />

      <div className="min-h-screen lg:pl-[230px]">
        <Header
          onMenuClick={() =>
            setMobileSidebarOpen(
              true
            )
          }
        />

        <main className="p-3 sm:p-4 lg:p-5">
          <div className="mx-auto max-w-[1500px]">

            {/* ==================================================
                HEADER
            ================================================== */}

            <div className="mb-4 flex flex-wrap justify-between items-center gap-3">

              <div>
                <h1 className="text-lg font-bold text-slate-800">
                  Data Mitra
                </h1>

                <p className="text-[11px] text-slate-500">
                  Kelola data mitra BPS secara manual atau impor Excel SOBAT
                </p>

                {!profileLoading &&
                  userRole && (
                    <div className="mt-1 text-[10px] text-slate-400">
                      Login sebagai:{' '}
                      <span className="font-semibold text-slate-600">
                        {userRole ===
                        'admin'
                          ? 'Admin'
                          : 'Pegawai'}
                      </span>

                      {userRole ===
                        'pegawai' &&
                        userTimId !==
                          null && (
                          <>
                            {' '}
                            •{' '}
                            {getTimName(
                              userTimId
                            )}
                          </>
                        )}
                    </div>
                  )}
              </div>

              <div className="flex flex-wrap items-center gap-2">

                <button
                  onClick={
                    handleOpenAddModal
                  }
                  disabled={
                    profileLoading
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-md shadow-sm transition"
                >
                  <span>
                    ➕
                  </span>
                  Tambah Mitra
                </button>

                <button
                  onClick={() => {
                    if (
                      userRole ===
                      'pegawai' &&
                      userTimId ===
                        null
                    ) {
                      alert(
                        'Akun pegawai belum memiliki tim.'
                      );
                      return;
                    }

                    setUploadTimId(
                      userRole ===
                        'pegawai'
                        ? userTimId
                        : null
                    );

                    setIsUploadModalOpen(
                      true
                    );
                  }}
                  disabled={
                    profileLoading
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium rounded-md shadow-sm transition"
                >
                  <span>
                    📥
                  </span>
                  Unggah Excel
                </button>

                <button
                  onClick={
                    handleExportPDF
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-md shadow-sm transition"
                >
                  <span>
                    📄
                  </span>
                  Export PDF
                </button>

              </div>
            </div>

            {/* ==================================================
                FILTER
            ================================================== */}

            <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 mb-4 flex flex-wrap gap-2.5 items-center justify-between">

              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">

                <div className="relative min-w-[240px]">

                  <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400 text-xs">
                    🔍
                  </span>

                  <input
                    type="text"
                    placeholder="Cari Mitra (Nama / SOBAT ID)"
                    value={
                      searchKeyword
                    }
                    onChange={(
                      e
                    ) =>
                      setSearchKeyword(
                        e.target
                          .value
                      )
                    }
                    onKeyDown={(
                      e
                    ) =>
                      e.key ===
                        'Enter' &&
                      fetchMitra()
                    }
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-blue-400"
                  />

                </div>

                <select
                  value={
                    statusFilter
                  }
                  onChange={(
                    e
                  ) =>
                    setStatusFilter(
                      e.target
                        .value
                    )
                  }
                  aria-label="Filter status keaktifan mitra"
                  className="py-1.5 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400"
                >
                  <option value="Semua Status">
                    Semua Status
                  </option>

                  <option value="Aktif">
                    Aktif
                  </option>

                  <option value="Nonaktif">
                    Nonaktif
                  </option>
                </select>

                <select
                  value={
                    bulanFilter
                  }
                  onChange={(
                    e
                  ) =>
                    setBulanFilter(
                      e.target
                        .value
                    )
                  }
                  aria-label="Filter bulan mitra"
                  className="py-1.5 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400"
                >
                  <option value="Semua Bulan">
                    Semua Bulan
                  </option>

                  {BULAN_OPTIONS.map(
                    (bln) => (
                      <option
                        key={
                          bln
                        }
                        value={
                          bln
                        }
                      >
                        {bln}
                      </option>
                    )
                  )}
                </select>

                <button
                  onClick={
                    fetchMitra
                  }
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition"
                >
                  Cari
                </button>

                <button
                  onClick={() => {
                    setSearchKeyword(
                      ''
                    );

                    setStatusFilter(
                      'Semua Status'
                    );

                    setBulanFilter(
                      'Semua Bulan'
                    );
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded transition"
                >
                  Reset
                </button>

              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-500">

                <span>
                  Tampilkan:
                </span>

                <select
                  value={
                    itemsPerPage
                  }
                  onChange={(
                    e
                  ) => {
                    setItemsPerPage(
                      Number(
                        e.target
                          .value
                      )
                    );

                    setCurrentPage(
                      1
                    );
                  }}
                  className="py-1 px-2 border border-slate-200 rounded bg-white text-slate-700 outline-none focus:border-blue-400"
                >
                  <option value={5}>
                    5
                  </option>

                  <option value={10}>
                    10
                  </option>

                  <option value={25}>
                    25
                  </option>

                  <option value={50}>
                    50
                  </option>
                </select>

                <span>
                  baris
                </span>

              </div>
            </div>

            {/* ==================================================
                TOOLBAR BULK
            ================================================== */}

            {selectedIds.length >
              0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 mb-4 flex flex-wrap items-center justify-between gap-3">

                <div className="text-xs font-semibold text-blue-700">
                  {selectedIds.length}{' '}
                  mitra dipilih
                </div>

                <div className="flex items-center gap-2">

                  <button
                    onClick={() => {
                      setBulkStatusValue(
                        'Aktif'
                      );

                      setIsBulkStatusModalOpen(
                        true
                      );
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-300 hover:bg-blue-100 text-blue-700 text-xs font-medium rounded-md transition"
                  >
                    🔄 Ubah Status
                  </button>

                  <button
                    onClick={
                      handleBulkDelete
                    }
                    disabled={
                      isBulkDeleting
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-medium rounded-md transition"
                  >
                    🗑️{' '}
                    {isBulkDeleting
                      ? 'Menghapus...'
                      : 'Hapus Terpilih'}
                  </button>

                  <button
                    onClick={
                      handleClearSelection
                    }
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium rounded-md transition"
                  >
                    Batal Pilih
                  </button>

                </div>
              </div>
            )}

            {/* ==================================================
                TABLE
            ================================================== */}

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">

              <div className="overflow-x-auto">

                <table className="w-full text-left text-xs text-slate-700">

                  <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">

                    <tr>

                      <th className="py-3 px-3.5 text-center w-10">
                        <input
                          type="checkbox"
                          checked={
                            isAllCurrentPageSelected
                          }
                          ref={(
                            el
                          ) => {
                            if (
                              el
                            ) {
                              el.indeterminate =
                                isSomeCurrentPageSelected;
                            }
                          }}
                          onChange={
                            handleToggleSelectAllCurrentPage
                          }
                          disabled={
                            currentData.length ===
                            0
                          }
                          className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                          aria-label="Pilih semua mitra di halaman ini"
                        />
                      </th>

                      <th className="py-3 px-3.5 text-center w-10">
                        No
                      </th>

                      <th className="py-3 px-3.5">
                        SOBAT ID
                      </th>

                      <th className="py-3 px-3.5">
                        Nama Mitra
                      </th>

                      <th className="py-3 px-3.5">
                        Posisi
                      </th>

                      <th className="py-3 px-3.5">
                        Kab/Kota
                      </th>

                      <th className="py-3 px-3.5">
                        No. Telp
                      </th>

                      <th className="py-3 px-3.5 text-center">
                        Status
                      </th>

                      <th className="py-3 px-3.5 text-center">
                        Aksi
                      </th>

                    </tr>

                  </thead>

                  <tbody className="divide-y divide-slate-100">

                    {loading ? (
                      <tr>
                        <td
                          colSpan={
                            9
                          }
                          className="py-8 text-center text-slate-400"
                        >
                          Memuat data mitra...
                        </td>
                      </tr>
                    ) : currentData.length ===
                      0 ? (
                      <tr>
                        <td
                          colSpan={
                            9
                          }
                          className="py-8 text-center text-slate-400"
                        >
                          Belum ada data mitra.
                          Silakan klik tombol{' '}
                          <strong>
                            Tambah Mitra
                          </strong>{' '}
                          atau{' '}
                          <strong>
                            Unggah Excel
                          </strong>
                          .
                        </td>
                      </tr>
                    ) : (
                      currentData.map(
                        (
                          item,
                          index
                        ) => {
                          const isChecked =
                            selectedIds.includes(
                              item.sobat_id
                            );

                          return (
                            <tr
                              key={
                                item.sobat_id ||
                                index
                              }
                              className={`hover:bg-slate-50/80 transition ${
                                isChecked
                                  ? 'bg-blue-50/50'
                                  : ''
                              }`}
                            >

                              <td className="py-2.5 px-3.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={
                                    isChecked
                                  }
                                  onChange={() =>
                                    handleToggleSelectOne(
                                      item.sobat_id
                                    )
                                  }
                                  className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"
                                  aria-label={`Pilih ${item.nama_mitra}`}
                                />
                              </td>

                              <td className="py-2.5 px-3.5 text-center font-medium text-slate-400">
                                {(currentPage -
                                  1) *
                                  itemsPerPage +
                                  index +
                                  1}
                              </td>

                              <td className="py-2.5 px-3.5 font-semibold text-blue-600">
                                {item.sobat_id}
                              </td>

                              <td className="py-2.5 px-3.5 font-semibold text-slate-800">
                                {item.nama_mitra}
                              </td>

                              <td className="py-2.5 px-3.5 text-slate-600">
                                {item.posisi_mitra ||
                                  '-'}
                              </td>

                              <td className="py-2.5 px-3.5 text-slate-600">
                                {item.kab_kota ||
                                  '-'}
                              </td>

                              <td className="py-2.5 px-3.5 text-slate-600">
                                {item.no_hp ||
                                  '-'}
                              </td>

                              <td className="py-2.5 px-3.5 text-center">

                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                    item.status_keaktifan ===
                                    'Aktif'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                                  }`}
                                >
                                  {item.status_keaktifan ||
                                    'Aktif'}
                                </span>

                              </td>

                              <td className="py-2.5 px-3.5 text-center">

                                <div className="flex items-center justify-center gap-2">

                                  <button
                                    onClick={() =>
                                      handleOpenDetailModal(
                                        item
                                      )
                                    }
                                    className="p-1.5 text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-md transition"
                                    title="Lihat Detail"
                                  >
                                    👁️
                                  </button>

                                  <button
                                    onClick={() =>
                                      handleOpenEditModal(
                                        item
                                      )
                                    }
                                    className="p-1.5 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-md transition"
                                    title="Edit Mitra"
                                  >
                                    ✏️
                                  </button>

                                  <button
                                    onClick={() =>
                                      handleDeleteMitra(
                                        item.sobat_id,
                                        item.nama_mitra
                                      )
                                    }
                                    className="p-1.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-md transition"
                                    title="Hapus Mitra"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="14"
                                      height="14"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
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
                          );
                        }
                      )
                    )}

                  </tbody>

                </table>

              </div>

              {/* PAGINATION */}

              <div className="px-4 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white">

                <div className="text-xs text-slate-500">
                  Menampilkan{' '}
                  <span className="font-medium text-slate-700">
                    {startItem}
                  </span>{' '}
                  -{' '}
                  <span className="font-medium text-slate-700">
                    {endItem}
                  </span>{' '}
                  dari{' '}
                  <span className="font-medium text-slate-700">
                    {totalItems}
                  </span>{' '}
                  data
                </div>

                <div className="flex items-center gap-1 text-xs">

                  <button
                    onClick={() =>
                      setCurrentPage(
                        (
                          prev
                        ) =>
                          Math.max(
                            prev -
                              1,
                            1
                          )
                      )
                    }
                    disabled={
                      currentPage ===
                      1
                    }
                    className="px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    ‹
                  </button>

                  {Array.from(
                    {
                      length:
                        totalPages,
                    },
                    (
                      _,
                      i
                    ) =>
                      i + 1
                  )
                    .filter(
                      (
                        page
                      ) =>
                        page ===
                          1 ||
                        page ===
                          totalPages ||
                        Math.abs(
                          page -
                            currentPage
                        ) <=
                          1
                    )
                    .map(
                      (
                        page,
                        idx,
                        array
                      ) => {
                        const prevPage =
                          array[
                            idx -
                              1
                          ];

                        const showEllipsis =
                          prevPage &&
                          page -
                            prevPage >
                            1;

                        return (
                          <React.Fragment
                            key={
                              page
                            }
                          >

                            {showEllipsis && (
                              <span className="px-1.5 text-slate-400">
                                ...
                              </span>
                            )}

                            <button
                              onClick={() =>
                                setCurrentPage(
                                  page
                                )
                              }
                              className={`px-3 py-1 rounded font-medium transition ${
                                currentPage ===
                                page
                                  ? 'bg-blue-600 text-white'
                                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {page}
                            </button>

                          </React.Fragment>
                        );
                      }
                    )}

                  <button
                    onClick={() =>
                      setCurrentPage(
                        (
                          prev
                        ) =>
                          Math.min(
                            prev +
                              1,
                            totalPages
                          )
                      )
                    }
                    disabled={
                      currentPage ===
                      totalPages
                    }
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

      {/* ========================================================
          MODAL UNGGAH EXCEL
      ======================================================== */}

      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">

          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">

            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">

              <div>
                <h3 className="font-bold text-sm text-slate-800">
                  Unggah Data Excel SOBAT
                </h3>

                <p className="text-[10px] text-slate-500 mt-0.5">
                  Import mitra dan otomatis membuat penugasan kegiatan
                </p>
              </div>

              <button
                onClick={() => {
                  setIsUploadModalOpen(
                    false
                  );

                  setSelectedFile(
                    null
                  );
                }}
                className="text-slate-400 hover:text-slate-600 text-base"
              >
                ✕
              </button>

            </div>

            <div className="p-5 space-y-4 text-xs">

              {/* FILE */}

              <div>

                <label className="block font-medium text-slate-700 mb-1">
                  Pilih File Excel (.xlsx / .xls)
                </label>

                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={(
                    e
                  ) =>
                    setSelectedFile(
                      e.target.files?.[0] ||
                        null
                    )
                  }
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                />

              </div>

              {/* ==================================================
                  TIM
              ================================================== */}

              <div>

                <label className="block font-medium text-slate-700 mb-1">
                  Tim Data Mitra{' '}
                  <span className="text-rose-500">
                    *
                  </span>
                </label>

                {userRole ===
                'pegawai' ? (
                  <div className="w-full px-3 py-2 border border-slate-200 rounded bg-slate-100 text-slate-700">
                    {userTimId !==
                    null
                      ? getTimName(
                          userTimId
                        )
                      : 'Belum memiliki tim'}
                  </div>
                ) : (
                  <select
                    value={
                      uploadTimId ??
                      ''
                    }
                    onChange={(
                      e
                    ) =>
                      setUploadTimId(
                        e.target
                          .value
                          ? Number(
                              e
                                .target
                                .value
                            )
                          : null
                      )
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded bg-white text-slate-700 outline-none focus:border-blue-500"
                  >
                    <option value="">
                      -- Pilih Tim --
                    </option>

                    {timList.map(
                      (
                        tim
                      ) => (
                        <option
                          key={
                            tim.id
                          }
                          value={
                            tim.id
                          }
                        >
                          {
                            tim.nama_tim
                          }
                        </option>
                      )
                    )}
                  </select>
                )}

              </div>

              {/* ==================================================
                  PERIODE
              ================================================== */}

              <div className="space-y-2">

                <label className="block font-medium text-slate-700">
                  Periode Kegiatan (Rentang Bulan):
                </label>

                <div className="grid grid-cols-2 gap-3">

                  {/* MULAI */}

                  <div>

                    <span className="block text-[10px] text-slate-500 mb-1">
                      Mulai Bulan & Tahun
                    </span>

                    <div className="grid grid-cols-2 gap-1.5">

                      <select
                        value={
                          selectedBulanMulai
                        }
                        onChange={(
                          e
                        ) =>
                          setSelectedBulanMulai(
                            e.target
                              .value
                          )
                        }
                        className="w-full px-2 py-1.5 border border-slate-200 rounded bg-white text-slate-700 outline-none focus:border-blue-500"
                      >
                        {BULAN_OPTIONS.map(
                          (
                            bln
                          ) => (
                            <option
                              key={
                                bln
                              }
                              value={
                                bln
                              }
                            >
                              {
                                bln
                              }
                            </option>
                          )
                        )}
                      </select>

                      <select
                        value={
                          selectedTahunMulai
                        }
                        onChange={(
                          e
                        ) =>
                          setSelectedTahunMulai(
                            e.target
                              .value
                          )
                        }
                        className="w-full px-2 py-1.5 border border-slate-200 rounded bg-white text-slate-700 outline-none focus:border-blue-500"
                      >
                        {TAHUN_OPTIONS.map(
                          (
                            thn
                          ) => (
                            <option
                              key={
                                thn
                              }
                              value={
                                thn
                              }
                            >
                              {
                                thn
                              }
                            </option>
                          )
                        )}
                      </select>

                    </div>

                  </div>

                  {/* SELESAI */}

                  <div>

                    <span className="block text-[10px] text-slate-500 mb-1">
                      Sampai Bulan & Tahun
                    </span>

                    <div className="grid grid-cols-2 gap-1.5">

                      <select
                        value={
                          selectedBulanSelesai
                        }
                        onChange={(
                          e
                        ) =>
                          setSelectedBulanSelesai(
                            e.target
                              .value
                          )
                        }
                        className="w-full px-2 py-1.5 border border-slate-200 rounded bg-white text-slate-700 outline-none focus:border-blue-500"
                      >
                        {BULAN_OPTIONS.map(
                          (
                            bln
                          ) => (
                            <option
                              key={
                                bln
                              }
                              value={
                                bln
                              }
                            >
                              {
                                bln
                              }
                            </option>
                          )
                        )}
                      </select>

                      <select
                        value={
                          selectedTahunSelesai
                        }
                        onChange={(
                          e
                        ) =>
                          setSelectedTahunSelesai(
                            e.target
                              .value
                          )
                        }
                        className="w-full px-2 py-1.5 border border-slate-200 rounded bg-white text-slate-700 outline-none focus:border-blue-500"
                      >
                        {TAHUN_OPTIONS.map(
                          (
                            thn
                          ) => (
                            <option
                              key={
                                thn
                              }
                              value={
                                thn
                              }
                            >
                              {
                                thn
                              }
                            </option>
                          )
                        )}
                      </select>

                    </div>

                  </div>

                </div>

                <p className="text-[10.5px] text-slate-500 bg-slate-50 rounded px-2.5 py-1.5">
                  Periode kegiatan akan tersimpan sebagai:{' '}
                  <strong className="text-slate-700">
                    {formatPeriodeKegiatan(
                      selectedBulanMulai,
                      selectedTahunMulai,
                      selectedBulanSelesai,
                      selectedTahunSelesai
                    )}
                  </strong>
                </p>

              </div>

              {/* BUTTON */}

              <div className="pt-2 flex justify-end gap-2">

                <button
                  type="button"
                  onClick={() => {
                    setIsUploadModalOpen(
                      false
                    );

                    setSelectedFile(
                      null
                    );
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded font-medium transition"
                >
                  Batal
                </button>

                <button
                  type="button"
                  onClick={
                    handleProcessExcel
                  }
                  disabled={
                    isUploading ||
                    !selectedFile ||
                    profileLoading ||
                    (userRole ===
                      'pegawai' &&
                      userTimId ===
                        null) ||
                    (userRole ===
                      'admin' &&
                      uploadTimId ===
                        null)
                  }
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded font-medium transition flex items-center gap-1.5"
                >
                  {isUploading
                    ? 'Proses Impor...'
                    : 'Unggah & Impor'}
                </button>

              </div>

            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL TAMBAH / EDIT MITRA
      ======================================================== */}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">

          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">

            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">

              <h3 className="font-bold text-sm text-slate-800">
                {isEditMode
                  ? 'Edit Data Mitra'
                  : 'Tambah Mitra Baru'}
              </h3>

              <button
                onClick={() =>
                  setIsModalOpen(
                    false
                  )
                }
                className="text-slate-400 hover:text-slate-600 text-base"
              >
                ✕
              </button>

            </div>

            <form
              onSubmit={
                handleSaveMitra
              }
              className="p-5 space-y-3 text-xs"
            >

              {/* SOBAT ID */}

              <div>

                <label className="block font-medium text-slate-700 mb-1">
                  SOBAT ID{' '}
                  <span className="text-rose-500">
                    *
                  </span>
                </label>

                <input
                  type="text"
                  name="sobat_id"
                  value={
                    formData.sobat_id
                  }
                  onChange={
                    handleInputChange
                  }
                  disabled={
                    isEditMode
                  }
                  placeholder="Contoh: 3515000123"
                  className="w-full px-3 py-2 border border-slate-200 rounded outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
                  required
                />

              </div>

              {/* NAMA */}

              <div>

                <label className="block font-medium text-slate-700 mb-1">
                  Nama Lengkap{' '}
                  <span className="text-rose-500">
                    *
                  </span>
                </label>

                <input
                  type="text"
                  name="nama_mitra"
                  value={
                    formData.nama_mitra
                  }
                  onChange={
                    handleInputChange
                  }
                  placeholder="Nama sesuai SOBAT"
                  className="w-full px-3 py-2 border border-slate-200 rounded outline-none focus:border-blue-500"
                  required
                />

              </div>

              {/* TIM */}

              <div>

                <label className="block font-medium text-slate-700 mb-1">
                  Tim{' '}
                  <span className="text-rose-500">
                    *
                  </span>
                </label>

                {userRole ===
                'pegawai' ? (
                  <div className="w-full px-3 py-2 border border-slate-200 rounded bg-slate-100 text-slate-700">
                    {userTimId !==
                    null
                      ? getTimName(
                          userTimId
                        )
                      : 'Belum memiliki tim'}
                  </div>
                ) : (
                  <select
                    value={
                      formTimId ??
                      ''
                    }
                    onChange={(
                      e
                    ) =>
                      setFormTimId(
                        e.target
                          .value
                          ? Number(
                              e
                                .target
                                .value
                            )
                          : null
                      )
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded bg-white text-slate-700 outline-none focus:border-blue-500"
                    required
                  >
                    <option value="">
                      -- Pilih Tim --
                    </option>

                    {timList.map(
                      (
                        tim
                      ) => (
                        <option
                          key={
                            tim.id
                          }
                          value={
                            tim.id
                          }
                        >
                          {
                            tim.nama_tim
                          }
                        </option>
                      )
                    )}
                  </select>
                )}

              </div>

              {/* POSISI + KAB/KOTA */}

              <div className="grid grid-cols-2 gap-3">

                <div>

                  <label className="block font-medium text-slate-700 mb-1">
                    Posisi
                    <span className="text-rose-500">
                      *
                    </span>
                  </label>

                  <input
                    type="text"
                    name="posisi_mitra"
                    value={
                      formData.posisi_mitra
                    }
                    onChange={
                      handleInputChange
                    }
                    placeholder="Pencacah / Pengawas"
                    className="w-full px-3 py-2 border border-slate-200 rounded outline-none focus:border-blue-500"
                    required
                  />

                </div>

                <div>

                  <label className="block font-medium text-slate-700 mb-1">
                    Kab/Kota
                    <span className="text-rose-500">
                      *
                    </span>
                  </label>

                  <input
                    type="text"
                    name="kab_kota"
                    value={
                      formData.kab_kota
                    }
                    onChange={
                      handleInputChange
                    }
                    placeholder="Kab. Mojokerto"
                    className="w-full px-3 py-2 border border-slate-200 rounded outline-none focus:border-blue-500"
                    required
                  />

                </div>

              </div>

              {/* ALAMAT */}

              <div>

                <label className="block font-medium text-slate-700 mb-1">
                  Alamat Detail
                  <span className="text-rose-500">
                    *
                  </span>
                </label>

                <textarea
                  name="alamat"
                  value={
                    formData.alamat
                  }
                  onChange={
                    handleInputChange
                  }
                  rows={2}
                  placeholder="Jl. Raya No. 123..."
                  className="w-full px-3 py-2 border border-slate-200 rounded outline-none focus:border-blue-500"
                  required
                />

              </div>

              {/* NO HP + STATUS */}

              <div className="grid grid-cols-2 gap-3">

                <div>

                  <label className="block font-medium text-slate-700 mb-1">
                    No. Telp / WA
                    <span className="text-rose-500">
                      *
                    </span>
                  </label>

                  <input
                    type="text"
                    name="no_hp"
                    value={
                      formData.no_hp
                    }
                    onChange={
                      handleInputChange
                    }
                    placeholder="081234567890"
                    className="w-full px-3 py-2 border border-slate-200 rounded outline-none focus:border-blue-500"
                    required
                  />

                </div>

                <div>

                  <label className="block font-medium text-slate-700 mb-1">
                    Status
                  </label>

                  <select
                    name="status_keaktifan"
                    value={
                      formData.status_keaktifan
                    }
                    onChange={
                      handleInputChange
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded bg-white outline-none focus:border-blue-500"
                  >
                    <option value="Aktif">
                      Aktif
                    </option>

                    <option value="Nonaktif">
                      Nonaktif
                    </option>
                  </select>

                </div>

              </div>

              {/* BUTTON */}

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">

                <button
                  type="button"
                  onClick={() =>
                    setIsModalOpen(
                      false
                    )
                  }
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded font-medium transition"
                >
                  Batal
                </button>

                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    profileLoading ||
                    (userRole ===
                      'pegawai' &&
                      userTimId ===
                        null) ||
                    (userRole ===
                      'admin' &&
                      formTimId ===
                        null)
                  }
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded font-medium transition"
                >
                  {isSubmitting
                    ? 'Menyimpan...'
                    : 'Simpan Data'}
                </button>

              </div>

            </form>

          </div>
        </div>
      )}

      {/* ========================================================
          MODAL DETAIL
      ======================================================== */}

      {isDetailModalOpen &&
        detailMitra && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">

            <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">

              <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">

                <h3 className="font-bold text-sm text-slate-800">
                  Detail Mitra
                </h3>

                <button
                  onClick={() =>
                    setIsDetailModalOpen(
                      false
                    )
                  }
                  className="text-slate-400 hover:text-slate-600 text-base"
                >
                  ✕
                </button>

              </div>

              <div className="p-5 space-y-3 text-xs">

                <div className="grid grid-cols-3 gap-1">
                  <span className="text-slate-400 font-medium">
                    SOBAT ID
                  </span>

                  <span className="col-span-2 text-slate-800 font-semibold">
                    {
                      detailMitra.sobat_id
                    }
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1">
                  <span className="text-slate-400 font-medium">
                    Nama Lengkap
                  </span>

                  <span className="col-span-2 text-slate-800 font-semibold">
                    {
                      detailMitra.nama_mitra
                    }
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1">
                  <span className="text-slate-400 font-medium">
                    Tim
                  </span>

                  <span className="col-span-2 text-slate-700">
                    {getTimName(
                      detailMitra.tim_id
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1">
                  <span className="text-slate-400 font-medium">
                    Posisi
                  </span>

                  <span className="col-span-2 text-slate-700">
                    {
                      detailMitra.posisi_mitra ||
                      '-'
                    }
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1">
                  <span className="text-slate-400 font-medium">
                    Kab/Kota
                  </span>

                  <span className="col-span-2 text-slate-700">
                    {
                      detailMitra.kab_kota ||
                      '-'
                    }
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1">
                  <span className="text-slate-400 font-medium">
                    Alamat
                  </span>

                  <span className="col-span-2 text-slate-700">
                    {
                      detailMitra.alamat ||
                      '-'
                    }
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1">
                  <span className="text-slate-400 font-medium">
                    No. Telp
                  </span>

                  <span className="col-span-2 text-slate-700">
                    {
                      detailMitra.no_hp ||
                      '-'
                    }
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1">
                  <span className="text-slate-400 font-medium">
                    Email
                  </span>

                  <span className="col-span-2 text-slate-700">
                    {
                      detailMitra.email ||
                      '-'
                    }
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1">
                  <span className="text-slate-400 font-medium">
                    Status
                  </span>

                  <span className="col-span-2">

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        detailMitra.status_keaktifan ===
                        'Aktif'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {
                        detailMitra.status_keaktifan ||
                        'Aktif'
                      }
                    </span>

                  </span>
                </div>

                <div className="pt-3 flex justify-end border-t border-slate-100">

                  <button
                    onClick={() =>
                      setIsDetailModalOpen(
                        false
                      )
                    }
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded font-medium transition"
                  >
                    Tutup
                  </button>

                </div>

              </div>

            </div>
          </div>
        )}

      {/* ========================================================
          MODAL BULK STATUS
      ======================================================== */}

      {isBulkStatusModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">

          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden">

            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">

              <h3 className="font-bold text-sm text-slate-800">
                Ubah Status Massal
              </h3>

              <button
                onClick={() =>
                  setIsBulkStatusModalOpen(
                    false
                  )
                }
                className="text-slate-400 hover:text-slate-600 text-base"
              >
                ✕
              </button>

            </div>

            <div className="p-5 space-y-4 text-xs">

              <p className="text-slate-600">
                Status{' '}
                <strong>
                  {
                    selectedIds.length
                  }{' '}
                  mitra terpilih
                </strong>{' '}
                akan diubah menjadi:
              </p>

              <div>

                <label className="block font-medium text-slate-700 mb-1">
                  Status Baru
                </label>

                <select
                  value={
                    bulkStatusValue
                  }
                  onChange={(
                    e
                  ) =>
                    setBulkStatusValue(
                      e.target
                        .value
                    )
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded bg-white text-slate-700 outline-none focus:border-blue-500"
                >
                  <option value="Aktif">
                    Aktif
                  </option>

                  <option value="Nonaktif">
                    Nonaktif
                  </option>
                </select>

              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">

                <button
                  type="button"
                  onClick={() =>
                    setIsBulkStatusModalOpen(
                      false
                    )
                  }
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded font-medium transition"
                >
                  Batal
                </button>

                <button
                  type="button"
                  onClick={
                    handleBulkStatusChange
                  }
                  disabled={
                    isBulkStatusSubmitting
                  }
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded font-medium transition"
                >
                  {isBulkStatusSubmitting
                    ? 'Menyimpan...'
                    : 'Terapkan'}
                </button>

              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
