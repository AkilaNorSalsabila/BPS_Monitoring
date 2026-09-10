'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { createClient } from '@supabase/supabase-js';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';

// =========================================================
// SUPABASE
// =========================================================

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || '';

const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

const supabase = createClient(
  supabaseUrl,
  supabaseKey
);

// =========================================================
// INTERFACE
// =========================================================

interface Profile {
  id: string;
  nip: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  jabatan: string | null;
  avatar_url: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

type StatusFilter =
  | 'semua'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'nonaktif';

// =========================================================
// HELPER
// =========================================================

const formatTanggal = (
  value: string | null
) => {
  if (!value) return '-';

  try {
    return new Date(value).toLocaleDateString(
      'id-ID',
      {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }
    );
  } catch {
    return '-';
  }
};

const formatWaktu = (
  value: string | null
) => {
  if (!value) return '-';

  try {
    return new Date(value).toLocaleString(
      'id-ID',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }
    );
  } catch {
    return '-';
  }
};

// =========================================================
// STATUS BADGE
// =========================================================

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const normalized =
    status.toLowerCase().trim();

  if (normalized === 'approved') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
        <span>✓</span>
        Disetujui
      </span>
    );
  }

  if (normalized === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700">
        <span>✕</span>
        Ditolak
      </span>
    );
  }

  if (normalized === 'nonaktif') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
        <span>●</span>
        Nonaktif
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
      <span>●</span>
      Menunggu Persetujuan
    </span>
  );
}

// =========================================================
// PAGE
// =========================================================

export default function PengaturanAkunPage() {
  // =======================================================
  // STATE
  // =======================================================

  const [
    mobileSidebarOpen,
    setMobileSidebarOpen,
  ] = useState(false);

  const [profiles, setProfiles] =
    useState<Profile[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [processingId, setProcessingId] =
    useState<string | null>(null);

  const [searchKeyword, setSearchKeyword] =
    useState('');

  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>('semua');

  // =======================================================
  // STATE MODAL EDIT
  // =======================================================

  const [editingProfile, setEditingProfile] =
    useState<Profile | null>(null);

  const [editName, setEditName] =
    useState('');

  const [editNip, setEditNip] =
    useState('');

  const [editEmail, setEditEmail] =
    useState('');

  const [editPhone, setEditPhone] =
    useState('');

  const [editJabatan, setEditJabatan] =
    useState('');

  // =======================================================
  // CEK ADMIN
  // =======================================================

  const checkAdmin = useCallback(
    async () => {
      const {
        data: {
          user,
        },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        return {
          isAdmin: false,
          userId: null,
        };
      }

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from('profiles')
        .select(
          'id, role, status'
        )
        .eq('id', user.id)
        .single();

      if (
        profileError ||
        !profile
      ) {
        return {
          isAdmin: false,
          userId: user.id,
        };
      }

      const isAdmin =
        profile.role === 'admin' &&
        profile.status === 'approved';

      return {
        isAdmin,
        userId: user.id,
      };
    },
    []
  );

  // =======================================================
  // FETCH PROFILES
  // =======================================================

  const fetchProfiles =
    useCallback(async () => {
      setLoading(true);

      try {
        const {
          isAdmin,
        } = await checkAdmin();

        if (!isAdmin) {
          alert(
            'Anda tidak memiliki akses ke halaman Manajemen Akun.'
          );

          setProfiles([]);

          return;
        }

        const {
          data,
          error,
        } = await supabase
          .from('profiles')
          .select(
            `
            id,
            nip,
            full_name,
            email,
            phone,
            role,
            jabatan,
            avatar_url,
            status,
            approved_by,
            approved_at,
            created_at,
            updated_at
          `
          )
          .order(
            'created_at',
            {
              ascending: false,
            }
          );

        if (error) {
          throw error;
        }

        setProfiles(
          (data as Profile[]) || []
        );
      } catch (error) {
        console.error(
          'Error fetching profiles:',
          error
        );

        setProfiles([]);

        alert(
          error instanceof Error
            ? error.message
            : 'Gagal mengambil data akun.'
        );
      } finally {
        setLoading(false);
      }
    }, [checkAdmin]);

  // =======================================================
  // LOAD DATA
  // =======================================================

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  // =======================================================
  // STATISTIK
  // =======================================================

  const statistics = useMemo(() => {
    return {
      pending: profiles.filter(
        (item) =>
          item.status === 'pending'
      ).length,

      approved: profiles.filter(
        (item) =>
          item.status === 'approved'
      ).length,

      rejected: profiles.filter(
        (item) =>
          item.status === 'rejected'
      ).length,

      nonaktif: profiles.filter(
        (item) =>
          item.status === 'nonaktif'
      ).length,

      semua: profiles.length,
    };
  }, [profiles]);

  // =======================================================
  // FILTER DATA
  // =======================================================

  const filteredProfiles =
    useMemo(() => {
      const keyword =
        searchKeyword
          .trim()
          .toLowerCase();

      return profiles.filter(
        (profile) => {
          const matchStatus =
            statusFilter === 'semua' ||
            profile.status === statusFilter;

          const matchSearch =
            !keyword ||
            (
              profile.full_name || ''
            )
              .toLowerCase()
              .includes(keyword) ||
            (
              profile.nip || ''
            )
              .toLowerCase()
              .includes(keyword) ||
            (
              profile.email || ''
            )
              .toLowerCase()
              .includes(keyword) ||
            (
              profile.jabatan || ''
            )
              .toLowerCase()
              .includes(keyword);

          return (
            matchStatus &&
            matchSearch
          );
        }
      );
    }, [
      profiles,
      searchKeyword,
      statusFilter,
    ]);

  // =======================================================
  // APPROVE PEGAWAI
  // =======================================================

  const handleApprove =
    async (profile: Profile) => {
      const nama =
        profile.full_name ||
        profile.email ||
        'pegawai ini';

      const confirmed =
        window.confirm(
          `Apakah Anda yakin ingin menyetujui akun ${nama}?`
        );

      if (!confirmed) {
        return;
      }

      setProcessingId(profile.id);

      try {
        const {
          isAdmin,
          userId,
        } = await checkAdmin();

        if (
          !isAdmin ||
          !userId
        ) {
          throw new Error(
            'Anda tidak memiliki hak sebagai admin.'
          );
        }

        const now =
          new Date().toISOString();

        const {
          data,
          error,
        } = await supabase
          .from('profiles')
          .update({
            status: 'approved',
            approved_by: userId,
            approved_at: now,
            updated_at: now,
          })
          .eq(
            'id',
            profile.id
          )
          .in(
            'status',
            ['pending', 'rejected']
          )
          .select()
          .single();

        if (error) {
          throw error;
        }

        if (!data) {
          throw new Error(
            'Data pegawai tidak berhasil diperbarui.'
          );
        }

        alert(
          `Akun ${nama} berhasil disetujui.`
        );

        await fetchProfiles();
      } catch (error) {
        console.error(
          'Error approving profile:',
          error
        );

        alert(
          error instanceof Error
            ? error.message
            : 'Gagal menyetujui akun pegawai.'
        );
      } finally {
        setProcessingId(null);
      }
    };

  // =======================================================
  // REJECT PEGAWAI
  // =======================================================

  const handleReject =
    async (profile: Profile) => {
      const nama =
        profile.full_name ||
        profile.email ||
        'pegawai ini';

      const confirmed =
        window.confirm(
          `Apakah Anda yakin ingin menolak pendaftaran ${nama}?`
        );

      if (!confirmed) {
        return;
      }

      setProcessingId(profile.id);

      try {
        const {
          isAdmin,
        } = await checkAdmin();

        if (!isAdmin) {
          throw new Error(
            'Anda tidak memiliki hak sebagai admin.'
          );
        }

        const {
          data,
          error,
        } = await supabase
          .from('profiles')
          .update({
            status: 'rejected',
            approved_by: null,
            approved_at: null,
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            'id',
            profile.id
          )
          .eq(
            'status',
            'pending'
          )
          .select()
          .single();

        if (error) {
          throw error;
        }

        if (!data) {
          throw new Error(
            'Data pegawai tidak berhasil diperbarui.'
          );
        }

        alert(
          `Pendaftaran ${nama} ditolak.`
        );

        await fetchProfiles();
      } catch (error) {
        console.error(
          'Error rejecting profile:',
          error
        );

        alert(
          error instanceof Error
            ? error.message
            : 'Gagal menolak akun pegawai.'
        );
      } finally {
        setProcessingId(null);
      }
    };

  // =======================================================
  // BUKA MODAL EDIT
  // =======================================================

  const handleEdit = (
    profile: Profile
  ) => {
    setEditingProfile(profile);

    setEditName(
      profile.full_name || ''
    );

    setEditNip(
      profile.nip || ''
    );

    setEditEmail(
      profile.email || ''
    );

    setEditPhone(
      profile.phone || ''
    );

    setEditJabatan(
      profile.jabatan || ''
    );
  };

  // =======================================================
  // TUTUP MODAL
  // =======================================================

  const handleCloseEdit = () => {
    if (
      processingId
    ) {
      return;
    }

    setEditingProfile(null);

    setEditName('');
    setEditNip('');
    setEditEmail('');
    setEditPhone('');
    setEditJabatan('');
  };

  // =======================================================
  // SIMPAN EDIT
  // =======================================================

  const handleSaveEdit =
    async () => {
      if (!editingProfile) {
        return;
      }

      if (!editName.trim()) {
        alert(
          'Nama pegawai tidak boleh kosong.'
        );

        return;
      }

      setProcessingId(
        editingProfile.id
      );

      try {
        const {
          isAdmin,
        } = await checkAdmin();

        if (!isAdmin) {
          throw new Error(
            'Anda tidak memiliki hak sebagai admin.'
          );
        }

        const {
          error,
        } = await supabase
          .from('profiles')
          .update({
            full_name:
              editName.trim(),

            nip:
              editNip.trim() || null,

            email:
              editEmail.trim() || null,

            phone:
              editPhone.trim() || null,

            jabatan:
              editJabatan.trim() || null,

            updated_at:
              new Date().toISOString(),
          })
          .eq(
            'id',
            editingProfile.id
          );

        if (error) {
          throw error;
        }

        alert(
          'Data akun berhasil diperbarui.'
        );

        setEditingProfile(null);

        setEditName('');
        setEditNip('');
        setEditEmail('');
        setEditPhone('');
        setEditJabatan('');

        await fetchProfiles();
      } catch (error) {
        console.error(
          'Error saving profile:',
          error
        );

        alert(
          error instanceof Error
            ? error.message
            : 'Gagal memperbarui data akun.'
        );
      } finally {
        setProcessingId(null);
      }
    };

  // =======================================================
  // APPROVE DARI MODAL EDIT
  // KHUSUS REJECTED
  // =======================================================

  const handleApproveFromEdit =
    async () => {
      if (!editingProfile) {
        return;
      }

      const nama =
        editingProfile.full_name ||
        editingProfile.email ||
        'pegawai ini';

      const confirmed =
        window.confirm(
          `Apakah Anda yakin ingin menyetujui akun ${nama}?`
        );

      if (!confirmed) {
        return;
      }

      setProcessingId(
        editingProfile.id
      );

      try {
        const {
          isAdmin,
          userId,
        } = await checkAdmin();

        if (
          !isAdmin ||
          !userId
        ) {
          throw new Error(
            'Anda tidak memiliki hak sebagai admin.'
          );
        }

        const now =
          new Date().toISOString();

        const {
          data,
          error,
        } = await supabase
          .from('profiles')
          .update({
            status: 'approved',
            approved_by: userId,
            approved_at: now,
            updated_at: now,
          })
          .eq(
            'id',
            editingProfile.id
          )
          .eq(
            'status',
            'rejected'
          )
          .select()
          .single();

        if (error) {
          throw error;
        }

        if (!data) {
          throw new Error(
            'Akun tidak berhasil disetujui.'
          );
        }

        alert(
          `Akun ${nama} berhasil disetujui.`
        );

        setEditingProfile(null);

        setEditName('');
        setEditNip('');
        setEditEmail('');
        setEditPhone('');
        setEditJabatan('');

        await fetchProfiles();
      } catch (error) {
        console.error(
          'Error approving rejected profile:',
          error
        );

        alert(
          error instanceof Error
            ? error.message
            : 'Gagal menyetujui akun.'
        );
      } finally {
        setProcessingId(null);
      }
    };

  // =======================================================
  // DELETE AKUN
  // =======================================================

  const handleDelete =
    async (profile: Profile) => {
      const nama =
        profile.full_name ||
        profile.email ||
        'pegawai ini';

      const confirmed =
        window.confirm(
          `Apakah Anda yakin ingin menghapus akun ${nama}?\n\n` +
          `Akun login Supabase Auth dan data profile pegawai akan dihapus secara permanen.\n\n` +
          `Tindakan ini tidak dapat dibatalkan.`
        );

      if (!confirmed) {
        return;
      }

      setProcessingId(
        profile.id
      );

      try {
        const {
          isAdmin,
        } = await checkAdmin();

        if (!isAdmin) {
          throw new Error(
            'Anda tidak memiliki hak sebagai admin.'
          );
        }

        const {
          data: currentUserData,
        } =
          await supabase.auth.getUser();

        if (
          currentUserData.user?.id ===
          profile.id
        ) {
          throw new Error(
            'Admin tidak dapat menghapus akun sendiri.'
          );
        }

        const {
          error,
        } = await supabase.rpc(
          'delete_user_account',
          {
            target_user_id:
              profile.id,
          }
        );

        if (error) {
          throw error;
        }

        alert(
          `Akun ${nama} berhasil dihapus secara permanen.`
        );

        await fetchProfiles();
      } catch (error) {
        console.error(
          'Error deleting account:',
          error
        );

        alert(
          error instanceof Error
            ? error.message
            : 'Gagal menghapus akun pegawai.'
        );
      } finally {
        setProcessingId(null);
      }
    };

  // =======================================================
  // RESET FILTER
  // =======================================================

  const handleReset = () => {
    setSearchKeyword('');
    setStatusFilter('semua');
  };

  // =======================================================
  // RENDER
  // =======================================================

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-800">

      {/* ================================================= */}
      {/* SIDEBAR */}
      {/* ================================================= */}

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

      {/* ================================================= */}
      {/* CONTENT */}
      {/* ================================================= */}

      <div className="min-h-screen lg:pl-[230px]">

        {/* ================================================= */}
        {/* HEADER */}
        {/* ================================================= */}

        <Header
          onMenuClick={() =>
            setMobileSidebarOpen(
              true
            )
          }
        />

        {/* ================================================= */}
        {/* MAIN */}
        {/* ================================================= */}

        <main className="p-4 sm:p-6 lg:p-8">

          <div className="mx-auto max-w-[1400px]">

            {/* ================================================= */}
            {/* JUDUL */}
            {/* ================================================= */}

            <div className="mb-5">

              <h1 className="text-base font-bold text-slate-800">
                Manajemen Akun
              </h1>

              <p className="mt-1 text-xs text-slate-500">
                Kelola akun pegawai dan
                persetujuan pendaftaran pengguna
                sistem.
              </p>

            </div>

            {/* ================================================= */}
            {/* STATISTIK */}
            {/* ================================================= */}

            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">

              {/* PENDING */}

              <button
                type="button"
                onClick={() =>
                  setStatusFilter(
                    statusFilter ===
                      'pending'
                      ? 'semua'
                      : 'pending'
                  )
                }
                className={`rounded-xl border bg-white p-4 text-left shadow-sm transition ${
                  statusFilter ===
                  'pending'
                    ? 'border-amber-400 ring-1 ring-amber-200'
                    : 'border-slate-200 hover:border-amber-300'
                }`}
              >
                <div className="flex items-center justify-between">

                  <div>
                    <p className="text-[11px] font-medium text-slate-500">
                      Menunggu Persetujuan
                    </p>

                    <p className="mt-1 text-xl font-bold text-amber-600">
                      {statistics.pending}
                    </p>
                  </div>

                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                    ⏳
                  </div>

                </div>
              </button>

              {/* APPROVED */}

              <button
                type="button"
                onClick={() =>
                  setStatusFilter(
                    statusFilter ===
                      'approved'
                      ? 'semua'
                      : 'approved'
                  )
                }
                className={`rounded-xl border bg-white p-4 text-left shadow-sm transition ${
                  statusFilter ===
                  'approved'
                    ? 'border-emerald-400 ring-1 ring-emerald-200'
                    : 'border-slate-200 hover:border-emerald-300'
                }`}
              >
                <div className="flex items-center justify-between">

                  <div>
                    <p className="text-[11px] font-medium text-slate-500">
                      Disetujui
                    </p>

                    <p className="mt-1 text-xl font-bold text-emerald-600">
                      {statistics.approved}
                    </p>
                  </div>

                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    ✓
                  </div>

                </div>
              </button>

              {/* REJECTED */}

              <button
                type="button"
                onClick={() =>
                  setStatusFilter(
                    statusFilter ===
                      'rejected'
                      ? 'semua'
                      : 'rejected'
                  )
                }
                className={`rounded-xl border bg-white p-4 text-left shadow-sm transition ${
                  statusFilter ===
                  'rejected'
                    ? 'border-rose-400 ring-1 ring-rose-200'
                    : 'border-slate-200 hover:border-rose-300'
                }`}
              >
                <div className="flex items-center justify-between">

                  <div>
                    <p className="text-[11px] font-medium text-slate-500">
                      Ditolak
                    </p>

                    <p className="mt-1 text-xl font-bold text-rose-600">
                      {statistics.rejected}
                    </p>
                  </div>

                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                    ✕
                  </div>

                </div>
              </button>

              {/* NONAKTIF */}

              <button
                type="button"
                onClick={() =>
                  setStatusFilter(
                    statusFilter ===
                      'nonaktif'
                      ? 'semua'
                      : 'nonaktif'
                  )
                }
                className={`rounded-xl border bg-white p-4 text-left shadow-sm transition ${
                  statusFilter ===
                  'nonaktif'
                    ? 'border-slate-400 ring-1 ring-slate-200'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">

                  <div>
                    <p className="text-[11px] font-medium text-slate-500">
                      Nonaktif
                    </p>

                    <p className="mt-1 text-xl font-bold text-slate-600">
                      {statistics.nonaktif}
                    </p>
                  </div>

                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    ●
                  </div>

                </div>
              </button>

            </div>

            {/* ================================================= */}
            {/* FILTER */}
            {/* ================================================= */}

            <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">

              <div className="flex flex-wrap items-center gap-2">

                {/* SEARCH */}

                <div className="relative min-w-[260px] flex-1">

                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-xs text-slate-400">
                    🔍
                  </span>

                  <input
                    type="text"
                    value={
                      searchKeyword
                    }
                    onChange={(e) =>
                      setSearchKeyword(
                        e.target.value
                      )
                    }
                    placeholder="Cari nama, NIP, email, atau jabatan"
                    className="w-full rounded-md border border-slate-200 py-1.5 pl-8 pr-3 text-xs outline-none transition focus:border-blue-400"
                  />

                </div>

                {/* STATUS */}

                <select
                  value={
                    statusFilter
                  }
                  onChange={(e) =>
                    setStatusFilter(
                      e.target
                        .value as StatusFilter
                    )
                  }
                  className="cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600 outline-none focus:border-blue-400"
                >

                  <option value="semua">
                    Semua Status
                  </option>

                  <option value="pending">
                    Menunggu Persetujuan
                  </option>

                  <option value="approved">
                    Disetujui
                  </option>

                  <option value="rejected">
                    Ditolak
                  </option>

                  <option value="nonaktif">
                    Nonaktif
                  </option>

                </select>

                {/* RESET */}

                <button
                  type="button"
                  onClick={
                    handleReset
                  }
                  className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-200"
                >
                  Reset
                </button>

                {/* REFRESH */}

                <button
                  type="button"
                  onClick={
                    fetchProfiles
                  }
                  disabled={
                    loading
                  }
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ↻ Refresh
                </button>

              </div>

            </div>

            {/* ================================================= */}
            {/* INFO */}
            {/* ================================================= */}

            {!loading && (
              <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-700">

                {statusFilter ===
                'pending'
                  ? `Terdapat ${statistics.pending} akun yang menunggu persetujuan admin.`
                  : statusFilter ===
                    'approved'
                  ? `Terdapat ${statistics.approved} akun yang telah disetujui.`
                  : statusFilter ===
                    'rejected'
                  ? `Terdapat ${statistics.rejected} akun yang ditolak.`
                  : statusFilter ===
                    'nonaktif'
                  ? `Terdapat ${statistics.nonaktif} akun yang nonaktif.`
                  : `Menampilkan ${filteredProfiles.length} dari ${statistics.semua} akun.`}

              </div>
            )}

            {/* ================================================= */}
            {/* TABLE */}
            {/* ================================================= */}

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

              <div className="overflow-x-auto">

                <table className="w-full text-left text-xs text-slate-700">

                  <thead className="border-b border-slate-200 bg-slate-50 font-bold text-slate-700">

                    <tr>

                      <th className="w-12 px-4 py-3 text-center">
                        No
                      </th>

                      <th className="px-4 py-3">
                        Pegawai
                      </th>

                      {/* <th className="px-4 py-3">
                        NIP
                      </th> */}

                      <th className="px-4 py-3">
                        Email
                      </th>

                      {/* <th className="px-4 py-3">
                        Jabatan
                      </th> */}

                      <th className="px-4 py-3 text-center">
                        Role
                      </th>

                      <th className="px-4 py-3">
                        Tanggal Daftar
                      </th>

                      <th className="px-4 py-3 text-center">
                        Status
                      </th>

                      <th className="px-4 py-3 text-center">
                        Aksi
                      </th>

                    </tr>

                  </thead>

                  <tbody className="divide-y divide-slate-100">

                    {loading ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="py-10 text-center text-slate-400"
                        >
                          Memuat data akun...
                        </td>
                      </tr>
                    ) : filteredProfiles.length === 0 ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="py-10 text-center text-slate-400"
                        >

                          <div className="text-2xl">
                            👤
                          </div>

                          <div className="mt-2 text-xs">
                            Tidak ada akun yang
                            sesuai.
                          </div>

                        </td>
                      </tr>
                    ) : (
                      filteredProfiles.map(
                        (
                          profile,
                          index
                        ) => {

                          const isProcessing =
                            processingId ===
                            profile.id;

                          return (
                            <tr
                              key={
                                profile.id
                              }
                              className="transition hover:bg-slate-50/70"
                            >

                              {/* NO */}

                              <td className="px-4 py-3.5 text-center font-medium text-slate-400">
                                {index + 1}
                              </td>

                              {/* PEGAWAI */}

                              <td className="px-4 py-3.5">

                                <div className="font-semibold text-slate-700">
                                  {profile.full_name ||
                                    '-'}
                                </div>

                                {profile.phone && (
                                  <div className="mt-0.5 text-[10px] text-slate-400">
                                    {
                                      profile.phone
                                    }
                                  </div>
                                )}

                              </td>

                              {/* NIP */}

                              {/* <td className="px-4 py-3.5 font-mono text-[11px] text-blue-600">
                                {profile.nip ||
                                  '-'}
                              </td> */}

                              {/* EMAIL */}

                              <td className="px-4 py-3.5 text-slate-600">
                                {profile.email ||
                                  '-'}
                              </td>

                              {/* JABATAN */}

                              {/* <td className="px-4 py-3.5 text-slate-600">
                                {profile.jabatan || '-'}
                              </td> */}

                              {/* ROLE */}

                              <td className="px-4 py-3.5 text-center">
                                {profile.role === 'admin' ? (
                                  <span className="inline-flex items-center rounded-md border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-semibold text-purple-700">
                                    Admin
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                                    Pegawai
                                  </span>
                                )}
                              </td>

                              {/* TANGGAL */}

                              <td className="px-4 py-3.5 text-slate-500">

                                <div>
                                  {formatTanggal(
                                    profile.created_at
                                  )}
                                </div>

                                <div className="mt-0.5 text-[10px] text-slate-400">
                                  {formatWaktu(
                                    profile.created_at
                                  )}
                                </div>

                              </td>

                              {/* STATUS */}

                              <td className="px-4 py-3.5 text-center">

                                <StatusBadge
                                  status={
                                    profile.status
                                  }
                                />

                              </td>

                              {/* AKSI */}

                              <td className="px-4 py-3.5">

                                {/* PENDING */}

                                {profile.status ===
                                'pending' ? (

                                  <div className="flex items-center justify-center gap-1.5">

                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleApprove(
                                          profile
                                        )
                                      }
                                      disabled={
                                        isProcessing
                                      }
                                      className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {isProcessing
                                        ? '...'
                                        : '✓ Setujui'}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleReject(
                                          profile
                                        )
                                      }
                                      disabled={
                                        isProcessing
                                      }
                                      className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {isProcessing
                                        ? '...'
                                        : '✕ Tolak'}
                                    </button>

                                  </div>

                                ) : (

                                  /* APPROVED / REJECTED / NONAKTIF */

                                  <div className="flex items-center justify-center gap-1.5">

                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleEdit(
                                          profile
                                        )
                                      }
                                      disabled={
                                        isProcessing
                                      }
                                      className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {isProcessing
                                        ? '...'
                                        : 'Edit'}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDelete(
                                          profile
                                        )
                                      }
                                      disabled={
                                        isProcessing
                                      }
                                      className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {isProcessing
                                        ? '...'
                                        : 'Delete'}
                                    </button>

                                  </div>
                                )}

                              </td>

                            </tr>
                          );
                        }
                      )
                    )}

                  </tbody>

                </table>

              </div>

              {/* ================================================= */}
              {/* FOOTER */}
              {/* ================================================= */}

              {!loading &&
                filteredProfiles.length >
                  0 && (

                  <div className="border-t border-slate-200 bg-white px-6 py-3">

                    <div className="flex items-center justify-between">

                      <div className="text-[11px] text-slate-500">

                        Menampilkan{' '}

                        <span className="font-semibold text-slate-700">
                          {
                            filteredProfiles.length
                          }
                        </span>{' '}

                        dari{' '}

                        <span className="font-semibold text-slate-700">
                          {
                            profiles.length
                          }
                        </span>{' '}

                        akun

                      </div>

                      <div className="text-[10px] text-slate-400">

                        Filter:{' '}

                        {statusFilter ===
                        'semua'
                          ? 'Semua Status'
                          : statusFilter ===
                            'pending'
                          ? 'Menunggu Persetujuan'
                          : statusFilter ===
                            'approved'
                          ? 'Disetujui'
                          : statusFilter ===
                            'rejected'
                          ? 'Ditolak'
                          : 'Nonaktif'}

                      </div>

                    </div>

                  </div>

                )}

            </div>

          </div>

        </main>

      </div>

      {/* ===================================================== */}
      {/* MODAL EDIT AKUN */}
      {/* ===================================================== */}

      {editingProfile && (

        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">

          <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl">

            {/* HEADER MODAL */}

            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">

              <div>

                <h2 className="text-sm font-bold text-slate-800">
                  Edit Akun Pegawai
                </h2>

                <p className="mt-1 text-[11px] text-slate-500">
                  Perbarui informasi akun pegawai.
                </p>

              </div>

              <button
                type="button"
                onClick={
                  handleCloseEdit
                }
                disabled={
                  processingId ===
                  editingProfile.id
                }
                className="flex h-7 w-7 items-center justify-center rounded-md text-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ×
              </button>

            </div>

            {/* BODY */}

            <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">

              {/* STATUS */}

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">

                <div className="flex items-center justify-between">

                  <div>

                    <p className="text-[11px] font-semibold text-slate-600">
                      Status Akun
                    </p>

                    <p className="mt-0.5 text-[10px] text-slate-400">
                      Status saat ini
                    </p>

                  </div>

                  <StatusBadge
                    status={
                      editingProfile.status
                    }
                  />

                </div>

              </div>

              {/* NAMA */}

              <div>

                <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                  Nama Lengkap
                </label>

                <input
                  type="text"
                  value={
                    editName
                  }
                  onChange={(e) =>
                    setEditName(
                      e.target.value
                    )
                  }
                  placeholder="Masukkan nama lengkap"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-xs outline-none transition focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                />

              </div>

              {/* NIP */}

              {/* <div>

                <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                  NIP
                </label>

                <input
                  type="text"
                  value={
                    editNip
                  }
                  onChange={(e) =>
                    setEditNip(
                      e.target.value
                    )
                  }
                  placeholder="Masukkan NIP"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-xs outline-none transition focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                />

              </div> */}

              {/* EMAIL */}

              <div>

                <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                  Email
                </label>

                <input
                  type="email"
                  value={
                    editEmail
                  }
                  onChange={(e) =>
                    setEditEmail(
                      e.target.value
                    )
                  }
                  placeholder="Masukkan email"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-xs outline-none transition focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                />

                <p className="mt-1 text-[10px] text-slate-400">
                  Email di sini memperbarui data
                  profile.
                </p>

              </div>

              {/* PHONE */}

              <div>

                <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                  No. Telepon
                </label>

                <input
                  type="text"
                  value={
                    editPhone
                  }
                  onChange={(e) =>
                    setEditPhone(
                      e.target.value
                    )
                  }
                  placeholder="Masukkan nomor telepon"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-xs outline-none transition focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                />

              </div>

              {/* JABATAN */}

              {/* <div>

                <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                  Jabatan
                </label>

                <input
                  type="text"
                  value={
                    editJabatan
                  }
                  onChange={(e) =>
                    setEditJabatan(
                      e.target.value
                    )
                  }
                  placeholder="Masukkan jabatan"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-xs outline-none transition focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                />

              </div> */}

            </div>

            {/* FOOTER MODAL */}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-4">

              {/* BATAL */}

              <button
                type="button"
                onClick={
                  handleCloseEdit
                }
                disabled={
                  processingId ===
                  editingProfile.id
                }
                className="rounded-md bg-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Batal
              </button>

              <div className="flex items-center gap-2">

                {/* APPROVE KHUSUS REJECTED */}

                {editingProfile.status ===
                  'rejected' && (

                  <button
                    type="button"
                    onClick={
                      handleApproveFromEdit
                    }
                    disabled={
                      processingId ===
                      editingProfile.id
                    }
                    className="rounded-md bg-emerald-600 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {processingId ===
                    editingProfile.id
                      ? 'Memproses...'
                      : '✓ Setujui Akun'}
                  </button>

                )}

                {/* SIMPAN */}

                <button
                  type="button"
                  onClick={
                    handleSaveEdit
                  }
                  disabled={
                    processingId ===
                    editingProfile.id
                  }
                  className="rounded-md bg-blue-600 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {processingId ===
                  editingProfile.id
                    ? 'Menyimpan...'
                    : 'Simpan Perubahan'}
                </button>

              </div>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}