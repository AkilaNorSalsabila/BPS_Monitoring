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

// Warna avatar inisial dirotasi berdasarkan nama, supaya tiap pengguna
// punya warna konsisten tanpa perlu disimpan di database.
const AVATAR_PALETTE = [
  'bg-blue-100 text-blue-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-teal-100 text-teal-700',
  'bg-rose-100 text-rose-700',
  'bg-indigo-100 text-indigo-700',
];

const getAvatarStyle = (key: string) => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
};

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const formatTanggal = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

const formatJam = (iso: string) =>
  new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

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

  // Ringkasan cepat untuk 3 kartu di atas — dihitung dari seluruh log yang
  // sudah dimuat (bukan hasil filter), supaya konsisten sebagai "total".
  const ringkasan = useMemo(() => {
    const perAksi: Record<AksiLog, number> = { tambah: 0, ubah: 0, hapus: 0 };
    rows.forEach((r) => {
      if (perAksi[r.aksi] !== undefined) perAksi[r.aksi] += 1;
    });
    return { total: rows.length, ...perAksi };
  }, [rows]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans">
      <Sidebar mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />

      <div className="min-h-screen lg:pl-[230px]">
        <Header title="Log Aktivitas" onMenuClick={() => setMobileSidebarOpen(true)} />

        <main className="p-3 sm:p-4 lg:p-5">
          <div className="mx-auto max-w-[1200px]">
            <div className="mb-4 flex flex-wrap justify-between items-center gap-3">
              <div>
                <h1 className="text-lg font-bold text-slate-800">Log Aktivitas</h1>
                <p className="text-[11px] text-slate-500">
                  Riwayat siapa menambah, mengubah, atau menghapus data di sistem ini
                </p>
              </div>
              <button
                onClick={refetch}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-md transition cursor-pointer"
              >
                🔄 Muat Ulang
              </button>
            </div>

            {/* KARTU RINGKASAN */}
            <section className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
              <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm">
                <span className="text-[11px] font-medium text-slate-400">Total Aktivitas</span>
                <div className="text-xl font-bold text-slate-800 mt-1">{loading ? '...' : ringkasan.total}</div>
              </div>
              <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm">
                <span className="text-[11px] font-medium text-emerald-500">Tambah</span>
                <div className="text-xl font-bold text-slate-800 mt-1">{loading ? '...' : ringkasan.tambah}</div>
              </div>
              <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm">
                <span className="text-[11px] font-medium text-blue-500">Ubah</span>
                <div className="text-xl font-bold text-slate-800 mt-1">{loading ? '...' : ringkasan.ubah}</div>
              </div>
              <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-sm">
                <span className="text-[11px] font-medium text-rose-500">Hapus</span>
                <div className="text-xl font-bold text-slate-800 mt-1">{loading ? '...' : ringkasan.hapus}</div>
              </div>
            </section>

            {/* FILTER */}
            <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 mb-4 flex flex-wrap gap-2.5 items-center">
              <div className="relative min-w-[240px] flex-1">
                <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400 text-xs">
                  🔍
                </span>
                <input
                  type="text"
                  placeholder="Cari deskripsi / nama pengguna"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-blue-400"
                />
              </div>
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
                    {e.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>

            {/* TABEL */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3.5 whitespace-nowrap">Waktu</th>
                      <th className="py-2.5 px-3.5">Pengguna</th>
                      <th className="py-2.5 px-3.5 text-center">Aksi</th>
                      <th className="py-2.5 px-3.5">Entitas</th>
                      <th className="py-2.5 px-3.5">Deskripsi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-slate-400">
                          <div className="flex flex-col items-center gap-1.5">
                            <span className="text-lg">⏳</span>
                            <span>Memuat log aktivitas...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-slate-400">
                          <div className="flex flex-col items-center gap-1.5">
                            <span className="text-lg">🗂️</span>
                            <span>
                              {rows.length === 0
                                ? 'Belum ada aktivitas yang tercatat.'
                                : 'Tidak ada aktivitas yang cocok dengan filter ini.'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((row) => {
                        const meta = AKSI_META[row.aksi] || AKSI_META.ubah;
                        const nama = row.user_name || 'Tidak diketahui';

                        return (
                          <tr key={row.id} className="hover:bg-slate-50/70 transition align-top">
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              <div className="font-medium text-slate-700">{formatTanggal(row.created_at)}</div>
                              <div className="text-[10px] text-slate-400">{formatJam(row.created_at)}</div>
                            </td>
                            <td className="py-3 px-3.5">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${getAvatarStyle(
                                    nama
                                  )}`}
                                >
                                  {getInitials(nama)}
                                </span>
                                <div className="min-w-0">
                                  <div className="font-medium text-slate-800 truncate">{nama}</div>
                                  <div className="text-[10px] text-slate-400 truncate">{row.user_email || '-'}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3.5 text-center">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${meta.style}`}
                              >
                                {meta.icon} {meta.label}
                              </span>
                            </td>
                            <td className="py-3 px-3.5">
                              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 capitalize whitespace-nowrap">
                                {row.entitas.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="py-3 px-3.5 text-slate-700 max-w-[420px]">{row.deskripsi}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
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