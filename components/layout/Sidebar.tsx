'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

type UserRole = 'admin' | 'pegawai' | 'staff' | null;

type IconName =
  | 'dashboard'
  | 'users'
  | 'activity'
  | 'clipboard'
  | 'monitor'
  | 'file'
  | 'report'
  | 'table'
  | 'settings'
  | 'history';

/**
 * ============================================
 * SUPABASE CLIENT
 * ============================================
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(
  supabaseUrl!,
  supabasePublishableKey!
);

/**
 * ============================================
 * KOMPONEN ICON
 * ============================================
 */

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (name) {
    case 'dashboard':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );

    case 'users':
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );

    case 'activity':
      return (
        <svg {...common}>
          <path d="M3 12h4l3-8 4 16 3-8h4" />
        </svg>
      );

    case 'clipboard':
      return (
        <svg {...common}>
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h3" />
        </svg>
      );

    case 'monitor':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M8 21h8M12 17v4" />
          <path d="m8 11 2.5 2L16 8" />
        </svg>
      );

    case 'file':
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M8 13h8M8 17h6" />
        </svg>
      );

    case 'table':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 9h18" />
          <path d="M9 9v11" />
          <path d="M15 9v11" />
        </svg>
      );

    case 'report':
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8" />
          <path d="M8 17h5" />
          <path d="M8 9h2" />
        </svg>
      );

    case 'history':
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v4h4" />
          <path d="M12 7v5l3.5 2" />
        </svg>
      );

    case 'settings':
      return (
        <svg {...common}>
          <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
          <path
            d="m19.4 15 .1.1a2 2 0 0 1-2.8 2.8l-.1-.1a2 2 0 0 0-3.4 1.4v.2a2 2 0 0 1-4 0v-.2a2 2 0 0 0-3.4-1.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A2 2 0 0 0 1.7 12a2 2 0 0 0 1.3-1.9 2 2 0 0 1 4 0A2 2 0 0 0 10.4 8.7l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1A2 2 0 0 0 16.6 4.5V4a2 2 0 0 1 4 0v.2a2 2 0 0 0 1.4 3.4h.2a2 2 0 0 1 0 4H22a2 2 0 0 0-1.4 3.4Z"
            transform="scale(.78) translate(3.4 3.4)"
          />
        </svg>
      );
  }
}

/**
 * ============================================
 * MENU DASHBOARD
 * ============================================
 */

const dashboardAdminItem = {
  label: 'Dashboard',
  href: '/dashboard',
  icon: 'dashboard' as IconName,
};

const dashboardStaffItem = {
  label: 'Dashboard',
  href: '/dashboard/staff',
  icon: 'dashboard' as IconName,
};

/**
 * ============================================
 * MENU DATA MASTER
 * HANYA ADMIN
 * ============================================
 */

const dataMasterItems = [
  {
    label: 'Mitra',
    href: '/mitra',
    icon: 'users' as IconName,
  },
  {
    label: 'Kegiatan',
    href: '/kegiatan',
    icon: 'activity' as IconName,
  },
];

/**
 * ============================================
 * MENU PENUGASAN
 * HANYA ADMIN
 * ============================================
 */

const assignmentItems = [
  {
    label: 'Pengaturan Limit',
    href: '/pengaturan-limit',
    icon: 'settings' as IconName,
  },
  {
    label: 'Penugasan Pegawai',
    href: '/penugasan',
    icon: 'clipboard' as IconName,
  },
  {
    label: 'Pencairan Honor',
    href: '/pencairan',
    icon: 'report' as IconName,
  },
  {
    label: 'Monitoring Limit',
    href: '/monitoring-limit',
    icon: 'monitor' as IconName,
  },
];

/**
 * ============================================
 * MENU LAPORAN
 * ADMIN & PEGAWAI
 * ============================================
 */

const reportItems = [
  {
    label: 'Rekap',
    href: '/rekap',
    icon: 'table' as IconName,
  },
  {
    label: 'Laporan',
    href: '/laporan-mitra',
    icon: 'file' as IconName,
  },
];

/**
 * ============================================
 * MENU SISTEM
 * ============================================
 */

const systemItems = [
  {
    label: 'Log Aktivitas',
    href: '/log-aktivitas',
    icon: 'history' as IconName,
  },
];

/**
 * ============================================
 * MENU PENGATURAN
 * ADMIN & PEGAWAI
 * ============================================
 *
 * Pengaturan dapat diakses oleh:
 * - Admin
 * - Pegawai
 *
 * Manajemen Akun tetap hanya Admin.
 */

const settingsItem = {
  label: 'Pengaturan',
  href: '/settings',
  icon: 'settings' as IconName,
};

const accountManagementItem = {
  label: 'Manajemen Akun',
  href: '/pengaturan-akun',
  icon: 'users' as IconName,
};

/**
 * ============================================
 * SIDEBAR
 * ============================================
 */

export default function Sidebar({
  mobileOpen,
  onClose,
}: SidebarProps) {
  const pathname = usePathname();

  const [userRole, setUserRole] =
    useState<UserRole>(null);

  const [loadingRole, setLoadingRole] =
    useState(true);

  /**
   * ============================================
   * AMBIL ROLE USER YANG SEDANG LOGIN
   * ============================================
   */

  useEffect(() => {
    let mounted = true;

    const getUserRole = async () => {
      try {
        setLoadingRole(true);

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          if (mounted) {
            setUserRole(null);
          }

          return;
        }

        const {
          data: profile,
          error: profileError,
        } = await supabase
          .from('profiles')
          .select('role, status')
          .eq('id', user.id)
          .single();

        if (profileError || !profile) {
          console.error(
            'Sidebar Profile Error:',
            profileError
          );

          if (mounted) {
            setUserRole(null);
          }

          return;
        }

        const role = String(
          profile.role ?? ''
        )
          .trim()
          .toLowerCase();

        const status = String(
          profile.status ?? ''
        )
          .trim()
          .toLowerCase();

        /**
         * Hanya akun approved
         * yang dianggap mempunyai akses.
         */

        if (status !== 'approved') {
          if (mounted) {
            setUserRole(null);
          }

          return;
        }

        if (
          role === 'admin' ||
          role === 'pegawai' ||
          role === 'staff'
        ) {
          if (mounted) {
            setUserRole(role as UserRole);
          }
        } else {
          if (mounted) {
            setUserRole(null);
          }
        }
      } catch (error) {
        console.error(
          'Sidebar Role Error:',
          error
        );

        if (mounted) {
          setUserRole(null);
        }
      } finally {
        if (mounted) {
          setLoadingRole(false);
        }
      }
    };

    getUserRole();

    /**
     * Update role/session jika status auth berubah.
     */

    const {
      data: authListener,
    } = supabase.auth.onAuthStateChange(
      () => {
        getUserRole();
      }
    );

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  /**
   * ============================================
   * RENDER MENU ITEM
   * ============================================
   */

  const renderMenuItem = (item: {
    label: string;
    href: string;
    icon: IconName;
  }) => {
    const active =
      pathname === item.href ||
      pathname.startsWith(`${item.href}/`);

    return (
      <Link
        key={item.label}
        href={item.href}
        onClick={onClose}
        className={`flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors ${
          active
            ? 'bg-[#2d84d8] font-semibold shadow-sm'
            : 'text-white/95 hover:bg-white/10'
        }`}
      >
        <Icon name={item.icon} />
        <span>{item.label}</span>
      </Link>
    );
  };

  /**
   * ============================================
   * SIDEBAR
   * ============================================
   */

  return (
    <>
      {/* Overlay mobile */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Tutup menu"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden"
        />
      )}

      {/* Sidebar utama */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[230px] flex-col border-r border-blue-400/60 bg-[#07508f] text-white shadow-xl transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen
            ? 'translate-x-0'
            : '-translate-x-full'
        }`}
      >
        {/* LOGO BPS */}
        <div className="flex h-[62px] items-center justify-center border-b border-white/15 px-4">
          <Link
            href={
              userRole === 'admin'
                ? '/dashboard'
                : '/dashboard/staff'
            }
            onClick={onClose}
            className="flex items-center justify-center"
          >
            <img
              src="/Rectangle 10.png"
              alt="BPS Kota Mojokerto"
              className="w-auto max-w-[190px] max-h-[42px] object-contain"
            />
          </Link>
        </div>

        {/* NAVIGASI */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-3 text-[14px]">

          {/* ==================================
              LOADING ROLE
          ================================== */}

          {loadingRole ? (
            <div className="px-2 py-2 text-xs text-white/60">
              Memuat menu...
            </div>

          ) : userRole === 'admin' ? (

            <>
              {/* ==================================
                  DASHBOARD ADMIN
              ================================== */}

              <div className="mb-3">
                {renderMenuItem(
                  dashboardAdminItem
                )}
              </div>

              {/* ==================================
                  DATA MASTER
              ================================== */}

              <div className="mb-3">
                <div className="mb-1 px-2 text-[12px] font-medium text-white/80">
                  Data Master
                </div>

                <div className="space-y-0.5">
                  {dataMasterItems.map(
                    (item) =>
                      renderMenuItem(item)
                  )}
                </div>
              </div>

              {/* ==================================
                  PENUGASAN
              ================================== */}

              <div className="mb-3">
                <div className="mb-1 px-2 text-[12px] font-medium text-white/80">
                  Penugasan
                </div>

                <div className="space-y-0.5">
                  {assignmentItems.map(
                    (item) =>
                      renderMenuItem(item)
                  )}
                </div>
              </div>

              {/* ==================================
                  LAPORAN
              ================================== */}

              <div className="mb-3">
                <div className="mb-1 px-2 text-[12px] font-medium text-white/80">
                  Laporan
                </div>

                <div className="space-y-0.5">
                  {reportItems.map(
                    (item) =>
                      renderMenuItem(item)
                  )}
                </div>
              </div>

              {/* ==================================
                  SISTEM
              ================================== */}

              <div className="mb-3">
                <div className="mb-1 px-2 text-[12px] font-medium text-white/80">
                  Sistem
                </div>

                <div className="space-y-0.5">
                  {systemItems.map(
                    (item) =>
                      renderMenuItem(item)
                  )}
                </div>
              </div>

              {/* ==================================
                  PENGATURAN ADMIN
              ================================== */}

              <div>
                <div className="mb-1 px-2 text-[12px] font-medium text-white/80">
                  Pengaturan
                </div>

                <div className="space-y-0.5">
                  {/* Pengaturan umum */}
                  {renderMenuItem(
                    settingsItem
                  )}

                  {/* Hanya Admin */}
                  {renderMenuItem(
                    accountManagementItem
                  )}
                </div>
              </div>
            </>

          ) : userRole === 'pegawai' ? (

            <>
              {/* ==================================
                  DASHBOARD PEGAWAI
              ================================== */}

              <div className="mb-3">
                {renderMenuItem(
                  dashboardStaffItem
                )}
              </div>

              {/* ==================================
                  LAPORAN PEGAWAI
              ================================== */}

              <div className="mb-3">
                <div className="mb-1 px-2 text-[12px] font-medium text-white/80">
                  Laporan
                </div>

                <div className="space-y-0.5">
                  {reportItems.map(
                    (item) =>
                      renderMenuItem(item)
                  )}
                </div>
              </div>

              {/* ==================================
                  PENGATURAN PEGAWAI
              ================================== */}

              <div>
                <div className="mb-1 px-2 text-[12px] font-medium text-white/80">
                  Pengaturan
                </div>

                <div className="space-y-0.5">
                  {/* Pegawai hanya dapat
                      mengakses Pengaturan */}
                  {renderMenuItem(
                    settingsItem
                  )}
                </div>
              </div>
            </>

          ) : userRole === 'staff' ? (

            <>
              {/* ==================================
                  DASHBOARD STAFF
              ================================== */}

              <div className="mb-3">
                {renderMenuItem(
                  dashboardStaffItem
                )}
              </div>

              {/* ==================================
                  LAPORAN STAFF
              ================================== */}

              <div>
                <div className="mb-1 px-2 text-[12px] font-medium text-white/80">
                  Laporan
                </div>

                <div className="space-y-0.5">
                  {reportItems.map(
                    (item) =>
                      renderMenuItem(item)
                  )}
                </div>
              </div>
            </>

          ) : (

            <div className="px-2 py-2 text-xs text-white/70">
              Tidak ada menu yang tersedia.
            </div>
          )}

        </nav>
      </aside>
    </>
  );
}
