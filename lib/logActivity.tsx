import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export type AksiLog = 'tambah' | 'ubah' | 'hapus';

interface LogActivityParams {
  aksi: AksiLog;
  /** nama entitas/tabel dalam bahasa sederhana, mis. 'penugasan', 'pencairan_honor', 'mitra', 'kegiatan', 'limit_honor' */
  entitas: string;
  /** kalimat singkat & jelas, mis. "Menugaskan Budi ke kegiatan SAKERNAS26" */
  deskripsi: string;
  /** id baris yang terkait, opsional (untuk telusur lebih lanjut kalau perlu) */
  referensiId?: string | number | null;
}

export async function logActivity({ aksi, entitas, deskripsi, referensiId }: LogActivityParams): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    const userName =
      (user?.user_metadata?.full_name as string | undefined) ||
      (user?.user_metadata?.name as string | undefined) ||
      user?.email ||
      'Tidak diketahui';

    const { error } = await supabase.from('activity_log').insert([
      {
        user_email: user?.email || null,
        user_name: userName,
        aksi,
        entitas,
        deskripsi,
        referensi_id: referensiId != null ? Number(referensiId) || null : null,
      },
    ]);

    if (error) {
      console.error('Gagal mencatat log aktivitas:', error.message);
    }
  } catch (err) {
    // Jangan pernah biarkan kegagalan logging mengganggu alur utama.
    console.error('Gagal mencatat log aktivitas:', err);
  }
}