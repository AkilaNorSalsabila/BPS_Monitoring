
'use client';

import {
  useEffect,
  useState,
} from 'react';

import {
  createClient,
} from '@supabase/supabase-js';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';

import Link from 'next/link';

/**
 * =========================================================
 * SUPABASE
 * =========================================================
 */

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || '';

const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

const supabase = createClient(
  supabaseUrl,
  supabaseKey
);

/**
 * =========================================================
 * INTERFACE PROFILE
 * =========================================================
 */

interface Profile {
  id: string;
  nip: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  jabatan: string | null;
  status: string | null;
}

/**
 * =========================================================
 * PAGE
 * =========================================================
 */

export default function StaffDashboardPage() {
  const [
    mobileSidebarOpen,
    setMobileSidebarOpen,
  ] = useState(false);

  const [profile, setProfile] =
    useState<Profile | null>(null);

  const [loading, setLoading] =
    useState(true);

  /**
   * =======================================================
   * FETCH PROFILE
   * =======================================================
   */

  useEffect(() => {
    let mounted = true;

    const fetchProfile = async () => {
      try {
        setLoading(true);

        /**
         * Ambil user yang sedang login
         */
        const {
          data: {
            user,
          },
          error: userError,
        } =
          await supabase.auth.getUser();

        if (
          userError ||
          !user
        ) {
          console.error(
            'User Error:',
            userError
          );

          return;
        }

        /**
         * Ambil profile dari public.profiles
         */
        const {
          data,
          error,
        } =
          await supabase
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
                status
              `
            )
            .eq(
              'id',
              user.id
            )
            .single();

        if (error) {
          console.error(
            'Profile Error:',
            error
          );

          return;
        }

        if (mounted) {
          setProfile(data);
        }
      } catch (error) {
        console.error(
          'Dashboard Staff Error:',
          error
        );
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchProfile();

    return () => {
      mounted = false;
    };
  }, []);

  /**
   * =======================================================
   * FORMAT ROLE
   * =======================================================
   */

  const formatRole = (
    role: string | null | undefined
  ) => {
    const value =
      String(role || '')
        .trim()
        .toLowerCase();

    if (value === 'admin') {
      return 'Admin';
    }

    if (
      value === 'pegawai' ||
      value === 'staff'
    ) {
      return 'Pegawai';
    }

    return '-';
  };

  /**
   * =======================================================
   * FORMAT STATUS
   * =======================================================
   */

  const formatStatus = (
    status: string | null | undefined
  ) => {
    const value =
      String(status || '')
        .trim()
        .toLowerCase();

    if (value === 'approved') {
      return 'Aktif';
    }

    if (value === 'pending') {
      return 'Menunggu Persetujuan';
    }

    if (value === 'rejected') {
      return 'Ditolak';
    }

    if (value === 'nonaktif') {
      return 'Nonaktif';
    }

    return '-';
  };

  /**
   * =======================================================
   * INITIAL NAMA
   * =======================================================
   */

  const getInitial = () => {
    if (
      !profile?.full_name
    ) {
      return 'P';
    }

    return profile.full_name
      .trim()
      .charAt(0)
      .toUpperCase();
  };

  /**
   * =======================================================
   * RENDER
   * =======================================================
   */

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800">

      {/* ===================================================
          SIDEBAR
      =================================================== */}

      <Sidebar
        mobileOpen={
          mobileSidebarOpen
        }
        onClose={() =>
          setMobileSidebarOpen(false)
        }
      />

      {/* ===================================================
          CONTENT
      =================================================== */}

      <div className="min-h-screen lg:pl-[230px]">

        {/* HEADER */}

        <Header
          onMenuClick={() =>
            setMobileSidebarOpen(true)
          }
        />

        {/* =================================================
            MAIN
        ================================================= */}

        <main className="p-3 sm:p-4 lg:p-5">

          <div className="mx-auto max-w-[1500px]">

            {/* =================================================
                WELCOME
            ================================================= */}

            <section className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">

                <div className="flex items-center gap-4">

                  {/* AVATAR */}

                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#07508f] text-xl font-bold text-white shadow-sm">
                    {loading
                      ? '...'
                      : getInitial()}
                  </div>

                  {/* TEXT */}

                  <div>

                    <p className="text-xs font-medium text-slate-400">
                      Dashboard Pegawai
                    </p>

                    <h1 className="mt-0.5 text-xl font-bold text-slate-800">
                      {loading
                        ? 'Memuat...'
                        : `Selamat Datang, ${
                            profile?.full_name ||
                            'Pegawai'
                          }`}
                    </h1>

                    <p className="mt-1 text-xs text-slate-500">
                      Silakan gunakan menu
                      Rekap dan Laporan
                      untuk melihat data
                      yang tersedia.
                    </p>

                  </div>

                </div>

                {/* ROLE */}

                {!loading &&
                  profile && (
                    <div className="flex items-center gap-2 self-start sm:self-center">

                      <span className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                        {formatRole(
                          profile.role
                        )}
                      </span>

                      <span className="rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
                        {formatStatus(
                          profile.status
                        )}
                      </span>

                    </div>
                  )}

              </div>

            </section>

            {/* =================================================
                INFORMASI AKUN
            ================================================= */}

            <section className="mb-4">

              <div className="mb-2">

                <h2 className="text-sm font-bold text-slate-800">
                  Informasi Akun
                </h2>

                <p className="mt-0.5 text-xs text-slate-400">
                  Informasi akun pegawai yang sedang login.
                </p>

              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">

                {/* NIP */}

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">

                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    NIP
                  </p>

                  <p className="mt-2 truncate text-sm font-semibold text-slate-700">
                    {loading
                      ? '...'
                      : profile?.nip ||
                        '-'}
                  </p>

                </div>

                {/* NAMA */}

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">

                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Nama Lengkap
                  </p>

                  <p className="mt-2 truncate text-sm font-semibold text-slate-700">
                    {loading
                      ? '...'
                      : profile?.full_name ||
                        '-'}
                  </p>

                </div>

                {/* JABATAN */}

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">

                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Jabatan
                  </p>

                  <p className="mt-2 truncate text-sm font-semibold text-slate-700">
                    {loading
                      ? '...'
                      : profile?.jabatan ||
                        '-'}
                  </p>

                </div>

                {/* EMAIL */}

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">

                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Email
                  </p>

                  <p className="mt-2 truncate text-sm font-semibold text-slate-700">
                    {loading
                      ? '...'
                      : profile?.email ||
                        '-'}
                  </p>

                </div>

              </div>

            </section>

            {/* =================================================
                AKSES MENU
            ================================================= */}

            <section>

              <div className="mb-2">

                <h2 className="text-sm font-bold text-slate-800">
                  Akses Menu
                </h2>

                <p className="mt-0.5 text-xs text-slate-400">
                  Menu yang tersedia untuk akun pegawai.
                </p>

              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">

                {/* =================================================
                    REKAP
                ================================================= */}

                <Link
                  href="/rekap"
                  className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
                >

                  <div className="flex items-start justify-between">

                    <div className="flex items-center gap-3">

                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600">

                        <svg
                          width="21"
                          height="21"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect
                            x="3"
                            y="4"
                            width="18"
                            height="16"
                            rx="2"
                          />

                          <path d="M3 9h18" />

                          <path d="M9 9v11" />

                          <path d="M15 9v11" />
                        </svg>

                      </div>

                      <div>

                        <h3 className="text-sm font-bold text-slate-800">
                          Rekap
                        </h3>

                        <p className="mt-0.5 text-xs text-slate-500">
                          Lihat data rekap yang
                          tersedia.
                        </p>

                      </div>

                    </div>

                    <span className="text-slate-300 transition-colors group-hover:text-blue-500">
                      →
                    </span>

                  </div>

                  <div className="mt-4 border-t border-slate-100 pt-3">

                    <span className="text-[11px] font-medium text-blue-600">
                      Buka Rekap →
                    </span>

                  </div>

                </Link>

                {/* =================================================
                    LAPORAN
                ================================================= */}

                <Link
                  href="/laporan-mitra"
                  className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
                >

                  <div className="flex items-start justify-between">

                    <div className="flex items-center gap-3">

                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">

                        <svg
                          width="21"
                          height="21"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />

                          <path d="M14 2v6h6" />

                          <path d="M8 13h8" />

                          <path d="M8 17h5" />

                          <path d="M8 9h2" />
                        </svg>

                      </div>

                      <div>

                        <h3 className="text-sm font-bold text-slate-800">
                          Laporan
                        </h3>

                        <p className="mt-0.5 text-xs text-slate-500">
                          Lihat dan akses laporan
                          yang tersedia.
                        </p>

                      </div>

                    </div>

                    <span className="text-slate-300 transition-colors group-hover:text-blue-500">
                      →
                    </span>

                  </div>

                  <div className="mt-4 border-t border-slate-100 pt-3">

                    <span className="text-[11px] font-medium text-blue-600">
                      Buka Laporan →
                    </span>

                  </div>

                </Link>

              </div>

            </section>

            {/* =================================================
                INFORMASI
            ================================================= */}

            <section className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4">

              <div className="flex gap-3">

                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">

                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                    />

                    <path d="M12 16v-4" />

                    <path d="M12 8h.01" />
                  </svg>

                </div>

                <div>

                  <h3 className="text-xs font-bold text-blue-800">
                    Informasi
                  </h3>

                  <p className="mt-1 text-xs leading-5 text-blue-700">
                    Sebagai pegawai, Anda dapat
                    mengakses menu Rekap dan
                    Laporan melalui sidebar.
                    Menu administrasi dan
                    pengelolaan data hanya
                    tersedia untuk akun Admin.
                  </p>

                </div>

              </div>

            </section>

          </div>

        </main>

      </div>

    </div>
  );
}
