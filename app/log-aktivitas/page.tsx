'use client';

// =========================================================
// LOKASI FILE INI: app/log-aktivitas/page.tsx
// =========================================================

import React, { useMemo, useState } from 'react';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { useActivityLog, AksiLog } from '@/lib/hooks/useActivityLog';

const AKSI_META: Record<AksiLog, { label: string; style: string; icon: string }> = {
  tambah: { label: 'Tambah', style: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: '➕' },
  ubah: { label: 'Ubah', style: 'bg-blue-50 text-blue-700 border-blue-200', icon: '✏️' },
  hapus: { label: 'Hapus', style: 'bg-rose-50 text-rose-700 border-rose-200', icon: '🗑️' },
};

const formatWaktu = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function LogAktivitasPage() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { rows, loading, refetch } = useActivityLog(200);

  const [aksiFilter, setAksiFilter] = useState<string>('Semua Aksi');
  const [entitasFilter, setEntitasFilter] = useState<string>('Semua Entitas');
  const [searchKeyword, setSearchKeyword] = useState('');

  const entitasOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.entitas));
    return Array.from(set).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (aksiFilter !== 'Semua Aksi' && r.aksi !== aksiFilter) return false;
      if (entitasFilter !== 'Semua Entitas' && r.entitas !== entitasFilter) return false;
      if (searchKeyword.trim()) {
        const kw = searchKeyword.trim().toLowerCase();
        if (
          !r.deskripsi.toLowerCase().includes(kw) &&
          !(r.user_name || '').toLowerCase().includes(kw) &&
          !(r.user_email || '').toLowerCase().includes(kw)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [rows, aksiFilter, entitasFilter, searchKeyword]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans">
      <Sidebar mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />

      <div className="min-h-screen lg:pl-[230px]">
        <Header onMenuClick={() => setMobileSidebarOpen(true)} />

        <main className="p-3 sm:p-4 lg:p-5">
          <div className="mx-auto max-w-[1200px]">
            <div className="mb-4 flex flex-wrap justify-between items-center gap-3">
              <div>
                <h1 className="text-lg font-bold text-slate-800">Log Aktivitas</h1>
                <p className="text-[11px] text-slate-500">Riwayat siapa menambah, mengubah, atau menghapus data di sistem ini</p>
              </div>
              <button
                onClick={refetch}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-md transition cursor-pointer"
              >
                🔄 Muat Ulang
              </button>
            </div>

            <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 mb-4 flex flex-wrap gap-2.5 items-center">
              <input
                type="text"
                placeholder="Cari deskripsi / nama pengguna"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-blue-400 min-w-[240px]"
              />
              <select
                value={aksiFilter}
                onChange={(e) => setAksiFilter(e.target.value)}
                className="py-1.5 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400 cursor-pointer"
              >
                <option>Semua Aksi</option>
                <option value="tambah">Tambah</option>
                <option value="ubah">Ubah</option>
                <option value="hapus">Hapus</option>
              </select>
              <select
                value={entitasFilter}
                onChange={(e) => setEntitasFilter(e.target.value)}
                className="py-1.5 px-2 text-xs border border-slate-200 rounded bg-white text-slate-600 outline-none focus:border-blue-400 cursor-pointer"
              >
                <option>Semua Entitas</option>
                {entitasOptions.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50/60 border-b border-slate-100 text-slate-500 font-semibold">
                  <tr>
                    <th className="py-2 px-3.5">Waktu</th>
                    <th className="py-2 px-3.5">Pengguna</th>
                    <th className="py-2 px-3.5 text-center">Aksi</th>
                    <th className="py-2 px-3.5">Entitas</th>
                    <th className="py-2 px-3.5">Deskripsi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        Memuat log aktivitas...
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        Belum ada aktivitas yang tercatat.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => {
                      const meta = AKSI_META[row.aksi] || AKSI_META.ubah;
                      return (
                        <tr key={row.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-500">{formatWaktu(row.created_at)}</td>
                          <td className="py-2.5 px-3.5">
                            <div className="font-medium text-slate-800">{row.user_name || '-'}</div>
                            <div className="text-[10px] text-slate-400">{row.user_email || '-'}</div>
                          </td>
                          <td className="py-2.5 px-3.5 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${meta.style}`}>
                              {meta.icon} {meta.label}
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5 capitalize text-slate-600">{row.entitas.replace('_', ' ')}</td>
                          <td className="py-2.5 px-3.5 text-slate-700">{row.deskripsi}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-[10px] text-slate-400">
              Menampilkan {filteredRows.length} dari {rows.length} aktivitas terbaru (maks. 200 baris).
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}