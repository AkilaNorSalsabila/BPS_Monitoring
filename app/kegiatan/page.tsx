'use client';

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';

import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
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
// INTERFACE
// ============================================================

interface KegiatanData {
  id: string;
  kode_kegiatan: string;
  nama_kegiatan: string;
  bulan_kegiatan: string;
  pagu_anggaran: number;
  tim_id: number | null;
}

interface Tim {
  id: number;
  nama_tim: string;
}

// ============================================================
// CONSTANT
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

const generateTahunOptions = () => {
  const currentYear = new Date().getFullYear();

  const years: string[] = [];

  for (
    let i = currentYear - 2;
    i <= currentYear + 5;
    i++
  ) {
    years.push(i.toString());
  }

  return years;
};

const TAHUN_OPTIONS = generateTahunOptions();

const CURRENT_YEAR_STR =
  new Date().getFullYear().toString();

// ============================================================
// COMPONENT
// ============================================================

export default function KegiatanPage() {
  // ============================================================
  // SIDEBAR
  // ============================================================

  const [
    mobileSidebarOpen,
    setMobileSidebarOpen,
  ] = useState(false);

  // ============================================================
  // USER / ROLE / TEAM
  // ============================================================

  const [userRole, setUserRole] =
    useState<'admin' | 'pegawai' | null>(null);

  const [userTimId, setUserTimId] =
    useState<number | null>(null);

  const [profileLoading, setProfileLoading] =
    useState(true);

  // ============================================================
  // TIM
  // ============================================================

  const [timList, setTimList] =
    useState<Tim[]>([]);

  const [timLoading, setTimLoading] =
    useState(true);

  // ============================================================
  // DATA KEGIATAN
  // ============================================================

  const [kegiatanList, setKegiatanList] =
    useState<KegiatanData[]>([]);

  const [loading, setLoading] =
    useState<boolean>(true);

  const [searchKeyword, setSearchKeyword] =
    useState<string>('');

  // ============================================================
  // PAGINATION
  // ============================================================

  const [currentPage, setCurrentPage] =
    useState<number>(1);

  const [itemsPerPage, setItemsPerPage] =
    useState<number>(10);

  // ============================================================
  // MODAL
  // ============================================================

  const [isModalOpen, setIsModalOpen] =
    useState<boolean>(false);

  const [isEditMode, setIsEditMode] =
    useState<boolean>(false);

  const [selectedId, setSelectedId] =
    useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] =
    useState<boolean>(false);

  // ============================================================
  // VALIDASI KODE
  // ============================================================

  const [checkingKode, setCheckingKode] =
    useState<boolean>(false);

  const [kodeSudahDigunakan, setKodeSudahDigunakan] =
    useState<boolean>(false);

  // ============================================================
  // FORM
  // ============================================================

  const [formData, setFormData] = useState({
    kode_kegiatan: '',
    nama_kegiatan: '',
    bulanMulai: 'Januari',
    tahunMulai: CURRENT_YEAR_STR,
    bulanSelesai: 'Desember',
    tahunSelesai: CURRENT_YEAR_STR,
    pagu_anggaran: 0,
    tim_id: null as number | null,
  });

  // ============================================================
  // GET PROFILE USER
  // ============================================================

  useEffect(() => {
    const loadProfile = async () => {
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
          setUserRole(null);
          setUserTimId(null);
          return;
        }

        const {
          data: profile,
          error: profileError,
        } = await supabase
          .from('profiles')
          .select(
            'id, role, status, tim_id'
          )
          .eq('id', user.id)
          .single();

        if (profileError) {
          throw profileError;
        }

        if (profile.status !== 'approved') {
          alert(
            'Akun Anda belum disetujui atau tidak aktif.'
          );

          setUserRole(null);
          setUserTimId(null);

          return;
        }

        if (
          profile.role !== 'admin' &&
          profile.role !== 'pegawai'
        ) {
          alert(
            'Role akun tidak valid.'
          );

          setUserRole(null);
          setUserTimId(null);

          return;
        }

        setUserRole(profile.role);

        setUserTimId(
          profile.tim_id ?? null
        );
      } catch (error: any) {
        console.error(
          'Error loading profile:',
          error
        );

        alert(
          'Gagal membaca profil pengguna: ' +
            (error?.message ||
              'Terjadi kesalahan')
        );
      } finally {
        setProfileLoading(false);
      }
    };

    loadProfile();
  }, []);

  // ============================================================
  // FETCH TIM
  // ============================================================

  useEffect(() => {
    const fetchTim = async () => {
      setTimLoading(true);

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

        setTimList(data ?? []);
      } catch (error: any) {
        console.error(
          'Error fetching tim:',
          error
        );

        alert(
          'Gagal memuat daftar tim: ' +
            (error?.message ||
              'Terjadi kesalahan')
        );
      } finally {
        setTimLoading(false);
      }
    };

    fetchTim();
  }, []);

  // ============================================================
  // GENERATE KODE KEGIATAN
  // ============================================================

  const generateNextKodeKegiatan =
    useCallback(async () => {
      try {
        const {
          data,
          error,
        } = await supabase.rpc(
          'get_next_kode_kegiatan'
        );

        if (error) {
          console.error(
            'Error generate kode kegiatan:',
            error
          );

          return null;
        }

        return data as string;
      } catch (error) {
        console.error(
          'Error generate kode kegiatan:',
          error
        );

        return null;
      }
    }, []);

  // ============================================================
  // CEK KODE KEGIATAN
  // ============================================================

  const checkKodeKegiatan =
    useCallback(
      async (
        kode: string,
        excludeId?: string | null
      ) => {
        const cleanKode =
          kode.trim();

        if (!cleanKode) {
          setKodeSudahDigunakan(false);
          return false;
        }

        setCheckingKode(true);

        try {
          const excludeNumber =
            excludeId
              ? Number(excludeId)
              : null;

          const {
            data,
            error,
          } = await supabase.rpc(
            'check_kode_kegiatan_exists',
            {
              p_kode: cleanKode,
              p_exclude_id:
                excludeNumber &&
                !Number.isNaN(
                  excludeNumber
                )
                  ? excludeNumber
                  : null,
            }
          );

          if (error) {
            console.error(
              'Error checking kode kegiatan:',
              error
            );

            setKodeSudahDigunakan(false);

            return false;
          }

          const exists =
            data === true;

          setKodeSudahDigunakan(
            exists
          );

          return exists;
        } catch (error) {
          console.error(
            'Error checking kode kegiatan:',
            error
          );

          setKodeSudahDigunakan(false);

          return false;
        } finally {
          setCheckingKode(false);
        }
      },
      []
    );

  // ============================================================
  // HELPER DURASI
  // ============================================================

  const hitungDurasiBulan = (
    bMulai: string,
    tMulai: string,
    bSelesai: string,
    tSelesai: string
  ) => {
    const idxMulai =
      BULAN_OPTIONS.indexOf(
        bMulai
      );

    const idxSelesai =
      BULAN_OPTIONS.indexOf(
        bSelesai
      );

    const yearMulai =
      parseInt(tMulai, 10);

    const yearSelesai =
      parseInt(tSelesai, 10);

    const totalBulan =
      (yearSelesai -
        yearMulai) *
        12 +
      (idxSelesai -
        idxMulai) +
      1;

    return totalBulan > 0
      ? totalBulan
      : 1;
  };

  // ============================================================
  // PARSE PERIODE
  // ============================================================

  const parsePeriodeToForm = (
    periodeStr: string
  ) => {
    if (!periodeStr) {
      return {
        bulanMulai: 'Januari',
        tahunMulai:
          CURRENT_YEAR_STR,
        bulanSelesai: 'Desember',
        tahunSelesai:
          CURRENT_YEAR_STR,
      };
    }

    const cleanPeriode =
      periodeStr
        .replace(
          /\s*\(\d+\s*Bulan\)/i,
          ''
        )
        .trim();

    if (
      cleanPeriode.includes(
        ' - '
      ) ||
      cleanPeriode.includes(
        ' s.d. '
      )
    ) {
      const separator =
        cleanPeriode.includes(
          ' - '
        )
          ? ' - '
          : ' s.d. ';

      const [
        mulai,
        selesai,
      ] =
        cleanPeriode.split(
          separator
        );

      const [
        bMulai,
        tMulai,
      ] =
        mulai.split(' ');

      const [
        bSelesai,
        tSelesai,
      ] =
        selesai.split(' ');

      return {
        bulanMulai:
          bMulai ||
          'Januari',

        tahunMulai:
          tMulai ||
          CURRENT_YEAR_STR,

        bulanSelesai:
          bSelesai ||
          'Desember',

        tahunSelesai:
          tSelesai ||
          CURRENT_YEAR_STR,
      };
    }

    const parts =
      cleanPeriode.split(
        ' '
      );

    const bln =
      parts[0] ||
      'Januari';

    const thn =
      parts[1] ||
      CURRENT_YEAR_STR;

    return {
      bulanMulai: bln,
      tahunMulai: thn,
      bulanSelesai: bln,
      tahunSelesai: thn,
    };
  };

  // ============================================================
  // FORMAT RUPIAH
  // ============================================================

  const formatRupiah = (
    val: number
  ) => {
    return new Intl.NumberFormat(
      'id-ID',
      {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
      }
    ).format(val);
  };

  // ============================================================
  // GET NAMA TIM
  // ============================================================

  const getNamaTim = (
    timId: number | null
  ) => {
    if (!timId) {
      return 'Admin';
    }

    const tim =
      timList.find(
        (item) =>
          item.id === timId
      );

    return (
      tim?.nama_tim ||
      'Tim tidak ditemukan'
    );
  };

  // ============================================================
  // FETCH KEGIATAN
  // ============================================================

  const fetchKegiatan =
    useCallback(
      async () => {
        setLoading(true);

        try {
          let query =
            supabase
              .from('kegiatan')
              .select('*')
              .order(
                'created_at',
                {
                  ascending:
                    false,
                }
              );

          if (searchKeyword) {
            query =
              query.or(
                `nama_kegiatan.ilike.%${searchKeyword}%,kode_kegiatan.ilike.%${searchKeyword}%`
              );
          }

          const {
            data,
            error,
          } = await query;

          if (error) {
            throw error;
          }

          setKegiatanList(
            (data ??
              []) as KegiatanData[]
          );

          setCurrentPage(1);
        } catch (err: any) {
          console.error(
            'Error fetching kegiatan:',
            err
          );

          alert(
            'Gagal memuat data kegiatan: ' +
              (err?.message ||
                err?.details ||
                err?.hint ||
                'Terjadi kesalahan')
          );
        } finally {
          setLoading(false);
        }
      },
      [searchKeyword]
    );

  useEffect(() => {
    if (
      !profileLoading &&
      userRole
    ) {
      fetchKegiatan();
    }
  }, [
    fetchKegiatan,
    profileLoading,
    userRole,
  ]);

  // ============================================================
  // PAGINATION
  // ============================================================

  const totalItems =
    kegiatanList.length;

  const totalPages =
    Math.ceil(
      totalItems /
        itemsPerPage
    ) || 1;

  const currentData =
    useMemo(() => {
      const start =
        (currentPage -
          1) *
        itemsPerPage;

      return kegiatanList.slice(
        start,
        start +
          itemsPerPage
      );
    }, [
      kegiatanList,
      currentPage,
      itemsPerPage,
    ]);

  const startItem =
    totalItems === 0
      ? 0
      : (currentPage -
          1) *
          itemsPerPage +
        1;

  const endItem =
    Math.min(
      currentPage *
        itemsPerPage,
      totalItems
    );

  // ============================================================
  // EXPORT PDF
  // ============================================================

  const handleExportPDF =
    () => {
      if (
        kegiatanList.length ===
        0
      ) {
        alert(
          'Tidak ada data kegiatan untuk diekspor.'
        );

        return;
      }

      const doc =
        new jsPDF(
          'landscape',
          'mm',
          'a4'
        );

      doc.setFontSize(15);

      doc.setFont(
        'helvetica',
        'bold'
      );

      doc.text(
        'BADAN PUSAT STATISTIK KOTA MOJOKERTO',
        14,
        15
      );

      doc.setFontSize(11);

      doc.setFont(
        'helvetica',
        'normal'
      );

      doc.text(
        'Daftar Data Kegiatan',
        14,
        22
      );

      doc.setFontSize(8);

      doc.setTextColor(100);

      doc.text(
        `Tanggal Cetak: ${new Date().toLocaleDateString(
          'id-ID'
        )}`,
        14,
        28
      );

      if (searchKeyword) {
        doc.text(
          `Pencarian: ${searchKeyword}`,
          14,
          33
        );
      }

      const tableBody =
        kegiatanList.map(
          (
            item,
            index
          ) => [
            index + 1,
            item.kode_kegiatan ||
              '-',
            item.nama_kegiatan ||
              '-',
            getNamaTim(
              item.tim_id
            ),
            item.bulan_kegiatan ||
              '-',
            formatRupiah(
              item.pagu_anggaran ||
                0
            ),
          ]
        );

      autoTable(doc, {
        startY:
          searchKeyword
            ? 39
            : 34,

        head: [
          [
            'No',
            'Kode Kegiatan',
            'Nama Kegiatan',
            'Tim',
            'Periode',
            'Pagu Anggaran',
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
          halign:
            'center',
          valign:
            'middle',
        },

        bodyStyles: {
          fontSize: 8,
          textColor: [
            40,
            40,
            40,
          ],
          valign:
            'middle',
        },

        alternateRowStyles: {
          fillColor: [
            248,
            250,
            252,
          ],
        },

        columnStyles: {
          0: {
            cellWidth: 12,
            halign:
              'center',
          },

          1: {
            cellWidth: 30,
          },

          2: {
            cellWidth: 85,
          },

          3: {
            cellWidth: 45,
          },

          4: {
            cellWidth: 45,
          },

          5: {
            cellWidth: 55,
            halign:
              'right',
          },
        },

        margin: {
          left: 14,
          right: 14,
        },
      });

      const pageCount =
        doc.getNumberOfPages();

      for (
        let i = 1;
        i <= pageCount;
        i++
      ) {
        doc.setPage(i);

        const pageHeight =
          doc.internal
            .pageSize
            .height;

        doc.setFontSize(8);

        doc.setTextColor(
          120
        );

        doc.text(
          `Halaman ${i} dari ${pageCount}`,
          14,
          pageHeight -
            10
        );

        doc.text(
          'Sistem Monitoring Penugasan Mitra BPS Kota Mojokerto',
          150,
          pageHeight -
            10,
          {
            align:
              'center',
          }
        );
      }

      const tanggal =
        new Date()
          .toISOString()
          .slice(
            0,
            10
          );

      doc.save(
        `Data_Kegiatan_BPS_Mojokerto_${tanggal}.pdf`
      );
    };

  // ============================================================
  // TAMBAH KEGIATAN
  // ============================================================

  const handleOpenAddModal =
    async () => {
      if (!userRole) {
        alert(
          'Profil pengguna belum siap.'
        );

        return;
      }

      // Pegawai WAJIB mempunyai tim
      if (
        userRole ===
          'pegawai' &&
        !userTimId
      ) {
        alert(
          'Akun pegawai Anda belum memiliki tim. Silakan hubungi admin.'
        );

        return;
      }

      setIsEditMode(false);
      setSelectedId(null);

      setKodeSudahDigunakan(
        false
      );

      // ========================================================
      // AMBIL KODE BERIKUTNYA DARI DATABASE
      // ========================================================

      const nextKode =
        await generateNextKodeKegiatan();

      if (!nextKode) {
        alert(
          'Gagal membuat kode kegiatan otomatis.'
        );

        return;
      }

      setFormData({
        kode_kegiatan:
          nextKode,

        nama_kegiatan:
          '',

        bulanMulai:
          'Januari',

        tahunMulai:
          CURRENT_YEAR_STR,

        bulanSelesai:
          'Desember',

        tahunSelesai:
          CURRENT_YEAR_STR,

        pagu_anggaran:
          0,

        tim_id:
          userRole ===
          'pegawai'
            ? userTimId
            : null,
      });

      setIsModalOpen(true);
    };

  // ============================================================
  // EDIT KEGIATAN
  // ============================================================

  const handleOpenEditModal =
    (
      item: KegiatanData
    ) => {
      if (
        userRole ===
          'pegawai' &&
        item.tim_id !==
          userTimId
      ) {
        alert(
          'Anda tidak memiliki akses ke kegiatan ini.'
        );

        return;
      }

      setIsEditMode(true);

      setSelectedId(item.id);

      setKodeSudahDigunakan(
        false
      );

      const parsedPeriode =
        parsePeriodeToForm(
          item.bulan_kegiatan
        );

      setFormData({
        kode_kegiatan:
          item.kode_kegiatan,

        nama_kegiatan:
          item.nama_kegiatan,

        ...parsedPeriode,

        pagu_anggaran:
          item.pagu_anggaran ||
          0,

        tim_id:
          item.tim_id,
      });

      setIsModalOpen(true);
    };

  // ============================================================
  // HANDLE PERUBAHAN KODE
  // ============================================================

  const handleKodeChange =
    async (
      value: string
    ) => {
      setFormData(
        (prev) => ({
          ...prev,
          kode_kegiatan:
            value,
        })
      );

      setKodeSudahDigunakan(
        false
      );

      if (!value.trim()) {
        return;
      }

      await checkKodeKegiatan(
        value,
        isEditMode
          ? selectedId
          : null
      );
    };

  // ============================================================
  // SIMPAN KEGIATAN
  // ============================================================

  const handleSaveKegiatan =
    async (
      e: React.FormEvent
    ) => {
      e.preventDefault();

      // ========================================================
      // VALIDASI NAMA
      // ========================================================

      if (
        !formData.nama_kegiatan.trim()
      ) {
        alert(
          'Nama Kegiatan wajib diisi!'
        );

        return;
      }

      // ========================================================
      // VALIDASI KODE
      // ========================================================

      const kode =
        formData.kode_kegiatan.trim();

      if (!kode) {
        alert(
          'Kode Kegiatan wajib diisi!'
        );

        return;
      }

      // Cek ulang langsung ke database
      // sebelum INSERT / UPDATE.
      const kodeExists =
        await checkKodeKegiatan(
          kode,
          isEditMode
            ? selectedId
            : null
        );

      if (kodeExists) {
        alert(
          `Kode kegiatan "${kode}" sudah digunakan. Silakan gunakan kode kegiatan lainnya.`
        );

        return;
      }

      // ========================================================
      // VALIDASI TIM
      // ========================================================

      let finalTimId =
        formData.tim_id;

      // Pegawai HARUS menggunakan tim sendiri
      if (
        userRole ===
        'pegawai'
      ) {
        if (!userTimId) {
          alert(
            'Akun Anda belum memiliki tim. Silakan hubungi admin.'
          );

          return;
        }

        finalTimId =
          userTimId;
      }

      // Admin boleh NULL.
      // Jika diisi harus merupakan tim yang valid.
      if (
        userRole ===
          'admin' &&
        finalTimId !== null
      ) {
        const timValid =
          timList.some(
            (tim) =>
              tim.id ===
              finalTimId
          );

        if (!timValid) {
          alert(
            'Tim yang dipilih tidak valid.'
          );

          return;
        }
      }

      // ========================================================
      // DEBUG GET MY TIM
      // ========================================================

      const {
        data: testTimId,
        error: testTimError,
      } = await supabase.rpc(
        'get_my_tim_id'
      );

      console.log(
        'DEBUG get_my_tim_id:',
        {
          testTimId,
          testTimError,
          userTimId,
          finalTimId,
          userRole,
        }
      );

      // ========================================================
      // SUBMIT
      // ========================================================

      setIsSubmitting(true);

      const durasiBulan =
        hitungDurasiBulan(
          formData.bulanMulai,
          formData.tahunMulai,
          formData.bulanSelesai,
          formData.tahunSelesai
        );

      // ========================================================
      // PERIODE
      // ========================================================

      let finalPeriode =
        '';

      if (
        formData.bulanMulai ===
          formData.bulanSelesai &&
        formData.tahunMulai ===
          formData.tahunSelesai
      ) {
        finalPeriode =
          `${formData.bulanMulai} ${formData.tahunMulai} (1 Bulan)`;
      } else {
        finalPeriode =
          `${formData.bulanMulai} ${formData.tahunMulai} s.d. ${formData.bulanSelesai} ${formData.tahunSelesai} (${durasiBulan} Bulan)`;
      }

      try {
        // ======================================================
        // UPDATE
        // ======================================================

        if (
          isEditMode &&
          selectedId
        ) {
          const {
            error,
          } =
            await supabase
              .from(
                'kegiatan'
              )
              .update({
                kode_kegiatan:
                  kode,

                nama_kegiatan:
                  formData.nama_kegiatan,

                bulan_kegiatan:
                  finalPeriode,

                pagu_anggaran:
                  Number(
                    formData.pagu_anggaran
                  ),

                tim_id:
                  finalTimId,
              })
              .eq(
                'id',
                selectedId
              );

          if (error) {
            // Duplicate constraint
            if (
              error.code ===
              '23505'
            ) {
              alert(
                `Kode kegiatan "${kode}" sudah digunakan oleh kegiatan lain.`
              );

              setKodeSudahDigunakan(
                true
              );

              return;
            }

            throw error;
          }

          await logActivity({
            aksi: 'ubah',

            entitas:
              'kegiatan',

            deskripsi:
              `Memperbarui kegiatan "${formData.nama_kegiatan}" (${kode}) — tim ${getNamaTim(
                finalTimId
              )}, periode ${finalPeriode}, pagu ${formatRupiah(
                Number(
                  formData.pagu_anggaran
                )
              )}`,

            referensiId:
              selectedId,
          });

          alert(
            'Kegiatan berhasil diperbarui.'
          );
        }

        // ======================================================
        // INSERT
        // ======================================================

        else {
          const {
            data: inserted,
            error,
          } =
            await supabase
              .from(
                'kegiatan'
              )
              .insert([
                {
                  kode_kegiatan:
                    kode,

                  nama_kegiatan:
                    formData.nama_kegiatan,

                  bulan_kegiatan:
                    finalPeriode,

                  pagu_anggaran:
                    Number(
                      formData.pagu_anggaran
                    ),

                  tim_id:
                    finalTimId,
                },
              ])
              .select(
                'id'
              )
              .single();

          if (error) {
            // ==================================================
            // DATABASE UNIQUE CONSTRAINT
            // ==================================================

            if (
              error.code ===
              '23505'
            ) {
              alert(
                `Kode kegiatan "${kode}" baru saja digunakan oleh pengguna lain. Sistem akan mengambil kode berikutnya.`
              );

              // Ambil kode terbaru
              const nextKode =
                await generateNextKodeKegiatan();

              if (nextKode) {
                setFormData(
                  (
                    prev
                  ) => ({
                    ...prev,
                    kode_kegiatan:
                      nextKode,
                  })
                );

                setKodeSudahDigunakan(
                  false
                );
              }

              return;
            }

            throw error;
          }

          await logActivity({
            aksi: 'tambah',

            entitas:
              'kegiatan',

            deskripsi:
              `Menambahkan kegiatan baru "${formData.nama_kegiatan}" (${kode}) — tim ${getNamaTim(
                finalTimId
              )}, periode ${finalPeriode}, pagu ${formatRupiah(
                Number(
                  formData.pagu_anggaran
                )
              )}`,

            referensiId:
              inserted?.id,
          });

          alert(
            'Kegiatan baru berhasil ditambahkan.'
          );
        }

        // ======================================================
        // CLOSE MODAL
        // ======================================================

        setIsModalOpen(
          false
        );

        setKodeSudahDigunakan(
          false
        );

        await fetchKegiatan();
      } catch (err: any) {
        console.error(
          'Error saving kegiatan:',
          err
        );

        alert(
          'Gagal menyimpan kegiatan: ' +
            (err?.message ||
              'Terjadi kesalahan')
        );
      } finally {
        setIsSubmitting(
          false
        );
      }
    };

  // ============================================================
  // DELETE
  // ============================================================

  const handleDeleteKegiatan =
    async (
      id: string,
      nama: string
    ) => {
      if (
        !window.confirm(
          `Apakah Anda yakin ingin menghapus kegiatan "${nama}"?`
        )
      ) {
        return;
      }

      try {
        const {
          error,
        } =
          await supabase
            .from(
              'kegiatan'
            )
            .delete()
            .eq(
              'id',
              id
            );

        if (error) {
          throw error;
        }

        await logActivity({
          aksi: 'hapus',

          entitas:
            'kegiatan',

          deskripsi:
            `Menghapus kegiatan "${nama}"`,

          referensiId:
            id,
        });

        alert(
          'Kegiatan berhasil dihapus.'
        );

        await fetchKegiatan();
      } catch (err: any) {
        console.error(
          'Error deleting kegiatan:',
          err
        );

        alert(
          'Gagal menghapus kegiatan: ' +
            (err?.message ||
              'Terjadi kesalahan')
        );
      }
    };

  // ============================================================
  // LOADING PROFILE
  // ============================================================

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="text-sm text-slate-500">
          Memuat profil pengguna...
        </div>
      </div>
    );
  }

  // ============================================================
  // RETURN
  // ============================================================

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans">

      {/* SIDEBAR */}

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

        {/* HEADER */}

        <Header
          onMenuClick={() =>
            setMobileSidebarOpen(
              true
            )
          }
        />

        <main className="p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1400px]">

            {/* TITLE */}

            <div className="mb-6">
              <h1 className="text-xl font-bold text-slate-800">
                Data Kegiatan
              </h1>

              <p className="mt-1 text-xs text-slate-500">
                {userRole ===
                'admin'
                  ? 'Admin dapat mengelola kegiatan seluruh tim.'
                  : `Menampilkan kegiatan untuk tim ${getNamaTim(
                      userTimId
                    )}.`}
              </p>
            </div>

            {/* SEARCH & BUTTON */}

            <div className="mb-6 flex flex-wrap justify-between items-center gap-4">

              <div className="relative w-full max-w-sm">

                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400 text-sm">
                  🔍
                </span>

                <input
                  type="text"
                  placeholder="Cari Kegiatan"
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
                  className="w-full pl-10 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 shadow-sm"
                />

              </div>

              <div className="flex items-center gap-2">

                <button
                  onClick={
                    handleOpenAddModal
                  }
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition"
                >
                  <span>
                    ➕
                  </span>

                  Tambah Kegiatan
                </button>

                <button
                  onClick={
                    handleExportPDF
                  }
                  className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-sm transition"
                >
                  <span>
                    📄
                  </span>

                  Export PDF
                </button>

              </div>
            </div>

            {/* TABLE */}

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">

              <div className="overflow-x-auto">

                <table className="w-full text-left text-xs text-slate-700">

                  <thead className="bg-slate-50/50 border-b border-slate-200 font-bold text-slate-700">

                    <tr>

                      <th className="py-3.5 px-6 text-center w-16">
                        No
                      </th>

                      <th className="py-3.5 px-6">
                        Kode
                      </th>

                      <th className="py-3.5 px-6">
                        Nama Kegiatan
                      </th>

                      <th className="py-3.5 px-6">
                        Tim
                      </th>

                      <th className="py-3.5 px-6">
                        Periode
                      </th>

                      <th className="py-3.5 px-6">
                        Pagu Anggaran
                      </th>

                      <th className="py-3.5 px-6 text-center">
                        Aksi
                      </th>

                    </tr>

                  </thead>

                  <tbody className="divide-y divide-slate-100">

                    {loading ? (

                      <tr>
                        <td
                          colSpan={
                            7
                          }
                          className="py-8 text-center text-slate-400"
                        >
                          Memuat data kegiatan...
                        </td>
                      </tr>

                    ) : currentData.length ===
                      0 ? (

                      <tr>
                        <td
                          colSpan={
                            7
                          }
                          className="py-8 text-center text-slate-400"
                        >
                          Belum ada data kegiatan.
                          Klik tombol{' '}
                          <strong>
                            Tambah Kegiatan
                          </strong>{' '}
                          untuk membuat baru.
                        </td>
                      </tr>

                    ) : (

                      currentData.map(
                        (
                          item,
                          index
                        ) => (

                          <tr
                            key={
                              item.id ||
                              index
                            }
                            className="hover:bg-slate-50/60 transition"
                          >

                            <td className="py-4 px-6 text-center font-medium text-slate-400">
                              {(currentPage -
                                1) *
                                itemsPerPage +
                                index +
                                1}
                            </td>

                            <td className="py-4 px-6 font-medium text-slate-600">
                              {
                                item.kode_kegiatan
                              }
                            </td>

                            <td className="py-4 px-6 font-semibold text-slate-800">
                              {
                                item.nama_kegiatan
                              }
                            </td>

                            <td className="py-4 px-6">

                              <span
                                className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                                  item.tim_id
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {getNamaTim(
                                  item.tim_id
                                )}
                              </span>

                            </td>

                            <td className="py-4 px-6 text-slate-600 whitespace-pre-line">
                              {
                                item.bulan_kegiatan ||
                                '-'
                              }
                            </td>

                            <td className="py-4 px-6 font-semibold text-slate-800">
                              {formatRupiah(
                                item.pagu_anggaran ||
                                  0
                              )}
                            </td>

                            <td className="py-4 px-6 text-center">

                              <div className="flex items-center justify-center gap-2">

                                {/* DETAIL */}

                                <Link
                                  href={`/kegiatan/${item.id}`}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-md transition"
                                  title="Lihat Detail"
                                >
                                  👁️
                                </Link>

                                {/* EDIT */}

                                <button
                                  onClick={() =>
                                    handleOpenEditModal(
                                      item
                                    )
                                  }
                                  className="p-1.5 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-md transition"
                                  title="Edit Kegiatan"
                                >
                                  ✏️
                                </button>

                                {/* DELETE */}

                                <button
                                  onClick={() =>
                                    handleDeleteKegiatan(
                                      item.id,
                                      item.nama_kegiatan
                                    )
                                  }
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

                        )
                      )

                    )}

                  </tbody>

                </table>

              </div>

              {/* PAGINATION */}

              <div className="px-6 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-white">

                <div className="text-xs text-slate-500">

                  Menampilkan{' '}

                  <span className="font-semibold text-slate-700">
                    {startItem}
                  </span>

                  {' - '}

                  <span className="font-semibold text-slate-700">
                    {endItem}
                  </span>

                  {' dari '}

                  <span className="font-semibold text-slate-700">
                    {totalItems}
                  </span>

                  {' data'}

                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500">

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
                    className="py-1.5 px-2 border border-slate-200 rounded-md bg-white text-slate-700 outline-none focus:border-blue-500"
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
                    data
                  </span>

                </div>

                <div className="flex items-center gap-1.5 text-xs">

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
                              <span className="px-1 text-slate-400">
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
                                  ? 'bg-blue-600 text-white border border-blue-600'
                                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {
                                page
                              }
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
                        totalPages ||
                      totalPages ===
                        0
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
          MODAL
          ======================================================== */}

      {isModalOpen && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">

          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in duration-200">

            {/* HEADER MODAL */}

            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">

              <h3 className="font-bold text-slate-800 text-sm">
                {isEditMode
                  ? 'Edit Data Kegiatan'
                  : 'Tambah Kegiatan Baru'}
              </h3>

              <button
                onClick={() => {
                  setIsModalOpen(
                    false
                  );

                  setKodeSudahDigunakan(
                    false
                  );
                }}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>

            </div>

            {/* FORM */}

            <form
              onSubmit={
                handleSaveKegiatan
              }
              className="p-6 space-y-4 text-xs"
            >

              {/* KODE */}

              <div>

                <label className="block font-semibold text-slate-700 mb-1">
                  Kode Kegiatan *
                </label>

                <input
                  type="text"
                  value={
                    formData.kode_kegiatan
                  }
                  onChange={(
                    e
                  ) =>
                    handleKodeChange(
                      e.target
                        .value
                    )
                  }
                  placeholder="KD-001"
                  className={`w-full px-3 py-2 border rounded-lg outline-none focus:ring-1 ${
                    kodeSudahDigunakan
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                      : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100'
                  }`}
                  required
                />

                {/* STATUS CEK KODE */}

                {checkingKode && (
                  <p className="mt-1 text-[10px] text-slate-400">
                    Memeriksa kode kegiatan...
                  </p>
                )}

                {!checkingKode &&
                  kodeSudahDigunakan && (
                    <div className="mt-1.5 flex items-start gap-1.5 text-[10px] text-red-600 font-medium">
                      <span>
                        ⚠️
                      </span>

                      <span>
                        Kode kegiatan "
                        {
                          formData.kode_kegiatan
                        }
                        " sudah digunakan.
                        Silakan gunakan kode lainnya.
                      </span>
                    </div>
                  )}

                {!checkingKode &&
                  !kodeSudahDigunakan &&
                  formData.kode_kegiatan && (
                    <p className="mt-1 text-[10px] text-emerald-600">
                      ✓ Kode kegiatan tersedia.
                    </p>
                  )}

                {!isEditMode && (
                  <p className="mt-1 text-[10px] text-slate-500">
                    Kode dibuat otomatis.
                  </p>
                )}

              </div>

              {/* NAMA */}

              <div>

                <label className="block font-semibold text-slate-700 mb-1">
                  Nama Kegiatan *
                </label>

                <input
                  type="text"
                  value={
                    formData.nama_kegiatan
                  }
                  onChange={(
                    e
                  ) =>
                    setFormData({
                      ...formData,
                      nama_kegiatan:
                        e.target
                          .value,
                    })
                  }
                  placeholder="Contoh: Pendataan Sosial"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                  required
                />

              </div>

              {/* TIM */}

              <div>

                <label className="block font-semibold text-slate-700 mb-1">
                  Tim Kegiatan *
                </label>

                {userRole ===
                'pegawai' ? (

                  <>

                    <div className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-slate-700 font-semibold">

                      {getNamaTim(
                        userTimId
                      )}

                    </div>

                    <p className="mt-1 text-[10px] text-slate-500">
                      Tim kegiatan otomatis mengikuti tim akun Anda.
                    </p>

                  </>

                ) : (

                  <>

                    <select
                      value={
                        formData.tim_id ===
                        null
                          ? ''
                          : String(
                              formData.tim_id
                            )
                      }
                      onChange={(
                        e
                      ) => {
                        const value =
                          e.target
                            .value;

                        setFormData({
                          ...formData,
                          tim_id:
                            value ===
                            ''
                              ? null
                              : Number(
                                  value
                                ),
                        });
                      }}
                      disabled={
                        timLoading
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-blue-500"
                    >

                      <option value="">
                        Admin
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

                    <p className="mt-1 text-[10px] text-slate-500">
                      Admin dapat membuat kegiatan umum atau kegiatan milik tim tertentu.
                    </p>

                  </>

                )}

              </div>

              {/* PERIODE */}

              <div className="space-y-2">

                <label className="block font-semibold text-slate-700">
                  Periode Kegiatan
                  (Rentang Bulan) *
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
                          formData.bulanMulai
                        }
                        onChange={(
                          e
                        ) =>
                          setFormData({
                            ...formData,
                            bulanMulai:
                              e.target
                                .value,
                          })
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
                          formData.tahunMulai
                        }
                        onChange={(
                          e
                        ) =>
                          setFormData({
                            ...formData,
                            tahunMulai:
                              e.target
                                .value,
                          })
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
                          formData.bulanSelesai
                        }
                        onChange={(
                          e
                        ) =>
                          setFormData({
                            ...formData,
                            bulanSelesai:
                              e.target
                                .value,
                          })
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
                          formData.tahunSelesai
                        }
                        onChange={(
                          e
                        ) =>
                          setFormData({
                            ...formData,
                            tahunSelesai:
                              e.target
                                .value,
                          })
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

              </div>

              {/* PAGU */}

              <div>

                <label className="block font-semibold text-slate-700 mb-1">
                  Pagu Anggaran (Rp) *
                </label>

                <input
                  type="number"
                  value={
                    formData.pagu_anggaran
                  }
                  onChange={(
                    e
                  ) =>
                    setFormData({
                      ...formData,
                      pagu_anggaran:
                        Number(
                          e.target
                            .value
                        ),
                    })
                  }
                  placeholder="150000000"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-semibold text-slate-800"
                  required
                />

              </div>

              {/* BUTTON */}

              <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">

                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(
                      false
                    );

                    setKodeSudahDigunakan(
                      false
                    );
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-semibold transition"
                >
                  Batal
                </button>

                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    timLoading ||
                    checkingKode ||
                    kodeSudahDigunakan
                  }
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting
                    ? 'Menyimpan...'
                    : 'Simpan Kegiatan'}
                </button>

              </div>

            </form>

          </div>

        </div>

      )}

    </div>
  );
}