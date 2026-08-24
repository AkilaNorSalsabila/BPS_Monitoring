'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';

// ============================================
// SUPABASE CLIENT
// (Idealnya pindahkan ke lib/supabase.ts lalu import di sini)
// ============================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabasePublishableKey);

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // ============================================
  // AMBIL DATA USER YANG SEDANG LOGIN (hanya untuk ditampilkan)
  // ============================================

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) setUser(data.user);
    };

    getUser();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // ============================================
  // TUTUP DROPDOWN SAAT KLIK DI LUAR
  // ============================================

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ============================================
  // HELPER: nama tampilan, inisial, role, foto
  // ============================================

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Pengguna';
  const displayRole = user?.user_metadata?.role || 'Administrator';
  const avatarUrl = user?.user_metadata?.avatar_url || '';

  const initials = displayName
    .trim()
    .split(' ')
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // ============================================
  // LOGOUT
  // ============================================

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  // ============================================
  // UI
  // ============================================

  return (
    <header className="sticky top-0 z-20 flex h-[62px] items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Buka menu"
          className="rounded-md p-1.5 text-slate-600 transition hover:bg-slate-100 lg:hidden"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <button type="button" className="hidden rounded-md p-1 text-slate-500 hover:bg-slate-100 lg:block" aria-label="Toggle sidebar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 6h16M4 12h10M4 18h16" />
          </svg>
        </button>
        <span className="text-[16px] font-semibold text-slate-800">Dashboard</span>
      </div>

      {/* ============================================ */}
      {/* PROFILE DROPDOWN */}
      {/* ============================================ */}
      <div className="relative flex items-center gap-2.5" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen((prev) => !prev)}
          className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition hover:bg-slate-50 focus:outline-none"
        >
          <div className="hidden text-right sm:block">
            <div className="text-[10px] font-semibold text-slate-800">{displayName}</div>
            <div className="text-[10px] text-slate-400">{displayRole}</div>
          </div>
          <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-gradient-to-br from-amber-100 via-orange-100 to-slate-200 text-[10px] font-bold text-slate-600 shadow-sm">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              initials || 'U'
            )}
          </div>
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 top-[46px] w-60 rounded-xl border border-slate-200 bg-white py-2 shadow-lg">
            {/* Detail Profile (ringkas) */}
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-gradient-to-br from-amber-100 via-orange-100 to-slate-200 text-xs font-bold text-slate-600">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  initials || 'U'
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-slate-800">{displayName}</div>
                <div className="truncate text-[11px] text-slate-400">{user?.email}</div>
                <div className="mt-0.5 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                  {displayRole}
                </div>
              </div>
            </div>

            {/* PENGATURAN -> navigasi ke halaman /settings */}
            <Link
              href="/settings"
              onClick={() => setDropdownOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-slate-700 transition hover:bg-slate-50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
                <path d="m19.4 15 .1.1a2 2 0 0 1-2.8 2.8l-.1-.1a2 2 0 0 0-3.4 1.4v.2a2 2 0 0 1-4 0v-.2a2 2 0 0 0-3.4-1.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A2 2 0 0 0 1.7 12a2 2 0 0 0 1.3-1.9 2 2 0 0 1 4 0A2 2 0 0 0 10.4 8.7l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1A2 2 0 0 0 16.6 4.5V4a2 2 0 0 1 4 0v.2a2 2 0 0 0 1.4 3.4h.2a2 2 0 0 1 0 4H22a2 2 0 0 0-1.4 3.4Z" />
              </svg>
              Pengaturan
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-red-600 transition hover:bg-red-50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
