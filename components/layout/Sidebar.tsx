'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

type IconName =
  | 'dashboard'
  | 'users'
  | 'activity'
  | 'clipboard'
  | 'monitor'
  | 'file'
  | 'report'
  | 'table'
  | 'settings';

/**
 * Komponen icon SVG untuk menu sidebar.
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
 * Menu Dashboard.
 *
 * Dashboard berdiri sendiri dan tidak masuk ke dalam
 * kategori Data Master maupun Penugasan.
 */
const dashboardItem = {
  label: 'Dashboard',
  href: '/dashboard',
  icon: 'dashboard' as IconName,
};

/**
 * Menu Data Master.
 */
const dataMasterItems = [
  {
    label: 'Mitra',
    href: '/mitra',
    icon: 'users' as IconName,
  },
  {
    label: 'Kegiatan',
    href: '#',
    icon: 'activity' as IconName,
  },
];

/**
 * Menu Penugasan.
 */
const assignmentItems = [
  {
    label: 'Penugasan Pegawai',
    href: '#',
    icon: 'clipboard' as IconName,
  },
  {
    label: 'Monitoring Limit',
    href: '#',
    icon: 'monitor' as IconName,
  },
];

/**
 * Menu Laporan.
 */
const reportItems = [
  {
    label: 'Rekap',
    href: '#',
    icon: 'table' as IconName,
  },
  {
    label: 'Laporan',
    href: '#',
    icon: 'file' as IconName,
  },
];

export default function Sidebar({
  mobileOpen,
  onClose,
}: SidebarProps) {
  const pathname = usePathname();

  /**
   * Komponen untuk menampilkan satu item menu.
   *
   * Dibuat sebagai function agar style menu
   * tidak perlu ditulis berulang-ulang.
   */
  const renderMenuItem = (
    item: {
      label: string;
      href: string;
      icon: IconName;
    },
  ) => {
    const active = pathname === item.href;

    return (
      <Link
        key={item.label}
        href={item.href}
        onClick={item.href !== '#' ? onClose : undefined}
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

  return (
    <>
      {/* Overlay untuk tampilan mobile */}
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

        {/* =========================
            LOGO BPS
        ========================== */}
        <div className="flex h-[70px] items-center justify-center border-b border-white/15 px-4">
          <Link
            href="/dashboard"
            onClick={onClose}
            className="flex items-center justify-center"
          >
            <img
              src="/Rectangle 10.png"
              alt="BPS Kota Mojokerto"
              className="w-auto max-w-[190px] max-h-[50px] object-contain"
            />
          </Link>
        </div>

        {/* =========================
            NAVIGASI SIDEBAR
        ========================== */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-3 text-[14px]">

          {/* =========================
              DASHBOARD
          ========================== */}
          <div className="mb-3">
            {renderMenuItem(dashboardItem)}
          </div>

          {/* =========================
              DATA MASTER
          ========================== */}
          <div className="mb-3">
            <div className="mb-1 px-2 text-[12px] font-medium text-white/80">
              Data Master
            </div>

            <div className="space-y-0.5">
              {dataMasterItems.map((item) =>
                renderMenuItem(item)
              )}
            </div>
          </div>

          {/* =========================
              PENUGASAN
          ========================== */}
          <div className="mb-3">
            <div className="mb-1 px-2 text-[12px] font-medium text-white/80">
              Penugasan
            </div>

            <div className="space-y-0.5">
              {assignmentItems.map((item) =>
                renderMenuItem(item)
              )}
            </div>
          </div>

          {/* =========================
              LAPORAN
          ========================== */}
          <div>
            <div className="mb-1 px-2 text-[12px] font-medium text-white/80">
              Laporan
            </div>

            <div className="space-y-0.5">
              {reportItems.map((item) =>
                renderMenuItem(item)
              )}
            </div>
          </div>
        </nav>

        {/* =========================
            PENGATURAN
        ========================== */}
        <div className="border-t border-white/10 p-2.5">
          <Link
            href="#"
            className="flex items-center gap-2 rounded-md px-2 py-2 text-[11px] text-white/95 hover:bg-white/10"
          >
            <Icon name="settings" />
            <span>Pengaturan</span>
          </Link>
        </div>
      </aside>
    </>
  );
}