// =========================================================
// LOKASI FILE INI: lib/hooks/useActivityLog.ts
//
// Hook untuk membaca isi tabel activity_log (dibuat lewat SQL), dipakai
// oleh halaman app/log-aktivitas/page.tsx. Menulis log dilakukan lewat
// helper terpisah: lib/logActivity.ts (dipanggil dari halaman lain
// setelah aksi tambah/ubah/hapus berhasil).
// =========================================================

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export type AksiLog = 'tambah' | 'ubah' | 'hapus';

export interface ActivityLogRow {
  id: number;
  created_at: string;
  user_email: string | null;
  user_name: string | null;
  aksi: AksiLog;
  entitas: string;
  deskripsi: string;
  referensi_id: number | null;
}

export function useActivityLog(limit: number = 200) {
  const [rows, setRows] = useState<ActivityLogRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchLog = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase
        .from('activity_log')
        .select('id, created_at, user_email, user_name, aksi, entitas, deskripsi, referensi_id')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      setRows(data || []);
    } catch (err: any) {
      console.error('Gagal memuat log aktivitas:', err.message);
      setErrorMsg(err.message || 'Gagal memuat log aktivitas');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchLog();
  }, [fetchLog]);

  return { rows, loading, errorMsg, refetch: fetchLog };
}