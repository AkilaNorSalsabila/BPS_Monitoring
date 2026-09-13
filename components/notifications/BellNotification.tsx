'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMasalahMitra } from '@/lib/hooks/useMasalahMitra';
import type { MasalahGroup } from '@/lib/hooks/useMasalahMitra';

export default function BellNotification() {
  const {
    loading,
    masalahGroups,
    unreadCount,
    markGroupAsRead,
    markAllAsRead,
    isNotificationRead,
  } = useMasalahMitra();

  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const count = masalahGroups.length;

  const getStatusText = (g: MasalahGroup) => {
    if (g.melebihi) return 'Melebihi limit';
    if (g.mencapai) return 'Mencapai limit';
    if (g.adaTerlambat) return 'Ada pencairan yang terlambat';
    if (g.mendekati) return 'Mendekati limit';
    return 'Perlu perhatian';
  };

  const getStatusClass = (g: MasalahGroup) => {
    if (g.melebihi) return 'text-rose-600';
    if (g.mencapai) return 'text-orange-600';
    if (g.adaTerlambat) return 'text-amber-600';
    if (g.mendekati) return 'text-orange-600';
    return 'text-slate-600';
  };

  const getStatusIcon = (g: MasalahGroup) => {
    if (g.melebihi) return '🔴';
    if (g.mencapai) return '🟠';
    if (g.adaTerlambat) return '⏰';
    if (g.mendekati) return '🟡';
    return '•';
  };

  const handleOpenNotification = (group: MasalahGroup) => {
    markGroupAsRead(group);
    setIsOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      {/* Bell */}
      <button
        type="button"
        onClick={() => setIsOpen((p) => !p)}
        className="relative p-2 rounded-full hover:bg-slate-100 transition cursor-pointer"
        title={
          unreadCount > 0
            ? `${unreadCount} notifikasi belum dibaca`
            : 'Notifikasi pencairan'
        }
      >
        <span className="text-lg">🔔</span>

        {!loading && unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-0.5 flex items-center justify-center bg-rose-600 text-white text-[9px] font-bold rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden">
          {/* Header */}
          <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-700">
                  {count > 0 ? `${count} masalah pencairan honor` : 'Notifikasi'}
                </div>

                {count > 0 && (
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {unreadCount > 0
                      ? `${unreadCount} belum dibaca`
                      : 'Semua sudah dibaca'}
                  </div>
                )}
              </div>

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="text-[10px] font-medium text-blue-600 hover:text-blue-700 hover:underline whitespace-nowrap cursor-pointer"
                >
                  Tandai semua dibaca
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="px-3.5 py-4 text-center text-[11px] text-slate-400">
                Memuat...
              </div>
            ) : count === 0 ? (
              <div className="px-3.5 py-5 text-center text-[11px] text-slate-400">
                Semua pencairan aman 🎉
              </div>
            ) : (
              masalahGroups.map((g) => {
                const isRead = isNotificationRead(g.notificationKey);

                return (
                  <div
                    key={g.notificationKey}
                    className="px-3.5 py-3 hover:bg-slate-50 transition"
                  >
                    {/* Nama mitra */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-800">
                          {getStatusIcon(g)} {g.namaMitra}
                        </div>

                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {g.bulan}
                        </div>
                      </div>

                      {/* Status read indicator tidak mengubah isi masalah */}
                      <span className="text-[9px] text-slate-400 whitespace-nowrap">
                        {isRead ? 'Sudah dibaca' : 'Baru'}
                      </span>
                    </div>

                    {/* Status */}
                    <div className="mt-1.5 space-y-0.5">
                      <div
                        className={`text-[10px] font-medium ${getStatusClass(g)}`}
                      >
                        {getStatusIcon(g)} {getStatusText(g)}
                      </div>

                      {g.limit > 0 && (
                        <div className="text-[10px] text-slate-500">
                          Beban:{' '}
                          <span className="font-medium text-slate-700">
                            Rp {g.bebanAktual.toLocaleString('id-ID')}
                          </span>{' '}
                          / Rp {g.limit.toLocaleString('id-ID')}
                        </div>
                      )}

                      {g.mencapai && (
                        <div className="text-[10px] text-orange-600">
                          Limit bulanan tepat mencapai batas.
                        </div>
                      )}

                      {g.adaTerlambat && (
                        <div className="text-[10px] text-amber-600">
                          Rencana belum direalisasikan dan bulan rencananya sudah lewat.
                        </div>
                      )}
                    </div>

                    {/* Tombol Lihat Detail */}
                    <Link
                      href={`/pencairan?detail_sobat_id=${encodeURIComponent(
                        g.sobatId
                      )}&detail_bulan=${encodeURIComponent(g.bulan)}`}
                      onClick={() => handleOpenNotification(g)}
                      className="mt-2 flex items-center justify-between text-[10px] font-medium text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      <span>Lihat detail</span>
                      <span>→</span>
                    </Link>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
