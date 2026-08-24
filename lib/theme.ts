/* ============================================
   THEME (Terang / Gelap)
   Dipakai oleh Sidebar.tsx & SettingsPage.tsx.
   Disimpan di localStorage perangkat, dan disiarkan lewat
   CustomEvent supaya komponen lain (mis. Sidebar) yang sudah
   ter-render ikut update tanpa perlu reload halaman.
============================================ */

export type ThemeName = 'terang' | 'gelap';

interface ThemeColorSet {
  label: string;
  swatch: string;
  sidebarBg: string;
  sidebarBorder: string;
  sidebarActiveBg: string;
}

export const THEME_COLORS: Record<ThemeName, ThemeColorSet> = {
  terang: {
    label: 'Terang',
    swatch: '#1D4ED8', // biru, sesuai warna sidebar default sebelumnya
    sidebarBg: '#1D4ED8',
    sidebarBorder: 'rgba(255,255,255,0.15)',
    sidebarActiveBg: 'rgba(255,255,255,0.16)',
  },
  gelap: {
    label: 'Gelap',
    swatch: '#0F172A', // slate-900
    sidebarBg: '#0F172A',
    sidebarBorder: 'rgba(255,255,255,0.08)',
    sidebarActiveBg: 'rgba(255,255,255,0.10)',
  },
};

const STORAGE_KEY = 'app_theme';
const THEME_EVENT = 'app-theme-change';

/**
 * Ambil tema yang tersimpan di localStorage perangkat ini.
 * Default ke 'terang' kalau belum pernah diset / saat SSR.
 */
export function getStoredTheme(): ThemeName {
  if (typeof window === 'undefined') return 'terang';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'gelap' ? 'gelap' : 'terang';
}

/**
 * Simpan tema ke localStorage DAN siarkan perubahan lewat
 * CustomEvent, supaya komponen lain (mis. Sidebar) yang sudah
 * ter-render bisa langsung ikut berubah tanpa reload.
 */
export function setStoredTheme(theme: ThemeName) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, theme);
  window.dispatchEvent(new CustomEvent<ThemeName>(THEME_EVENT, { detail: theme }));
}

/**
 * Berlangganan perubahan tema. Mengembalikan fungsi unsubscribe,
 * dipakai lewat useEffect(() => subscribeThemeChange(setTheme), []).
 */
export function subscribeThemeChange(callback: (theme: ThemeName) => void) {
  if (typeof window === 'undefined') return () => {};

  const handler = (e: Event) => {
    const custom = e as CustomEvent<ThemeName>;
    callback(custom.detail);
  };

  window.addEventListener(THEME_EVENT, handler);
  return () => window.removeEventListener(THEME_EVENT, handler);
}
