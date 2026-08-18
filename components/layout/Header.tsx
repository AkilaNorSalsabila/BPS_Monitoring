'use client';

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
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

      <div className="flex items-center gap-2.5">
        <div className="hidden text-right sm:block">
          <div className="text-[10px] font-semibold text-slate-800">Admin</div>
          <div className="text-[10px] text-slate-400">Administrator</div>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-gradient-to-br from-amber-100 via-orange-100 to-slate-200 text-[10px] font-bold text-slate-600 shadow-sm">
          A
        </div>
      </div>
    </header>
  );
}
