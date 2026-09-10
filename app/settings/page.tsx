'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';

// ============================================
// SUPABASE CLIENT
// ============================================

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || '';

const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);

// ============================================
// ICON MATA
// ============================================

function EyeIcon({
  open,
}: {
  open: boolean;
}) {
  return open ? (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.8}
      stroke="currentColor"
      className="h-4 w-4"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
      />
    </svg>
  ) : (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.8}
      stroke="currentColor"
      className="h-4 w-4"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12c1.274 4.057 5.065 7 9.542 7 4.477 0 8.268-2.943 9.542-7-1.274-4.057-5.064-7-9.542-7-4.477 0-8.268 2.943-9.542 7Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  );
}

// ============================================
// PAGE
// ============================================

export default function SettingsPage() {
  const [mobileSidebarOpen, setMobileSidebarOpen] =
    useState(false);

  const [user, setUser] =
    useState<User | null>(null);

  // ============================================
  // EDIT AKUN
  // ============================================

  const [fullName, setFullName] =
    useState('');

  const [role, setRole] =
    useState('');

  const [avatarUrl, setAvatarUrl] =
    useState('');

  const [avatarFile, setAvatarFile] =
    useState<File | null>(null);

  const [avatarPreview, setAvatarPreview] =
    useState('');

  const [savingAkun, setSavingAkun] =
    useState(false);

  const [akunError, setAkunError] =
    useState('');

  const [akunSuccess, setAkunSuccess] =
    useState('');

  const fileInputRef =
    useRef<HTMLInputElement>(null);

  // ============================================
  // GANTI PASSWORD
  // ============================================

  const [currentPassword, setCurrentPassword] =
    useState('');

  const [newPassword, setNewPassword] =
    useState('');

  const [confirmPassword, setConfirmPassword] =
    useState('');

  const [showCurrentPassword, setShowCurrentPassword] =
    useState(false);

  const [showNewPassword, setShowNewPassword] =
    useState(false);

  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const [savingPassword, setSavingPassword] =
    useState(false);

  const [passwordError, setPasswordError] =
    useState('');

  const [passwordSuccess, setPasswordSuccess] =
    useState('');

  // ============================================
  // LOAD DATA USER
  // ============================================

  useEffect(() => {
    const getUser = async () => {
      const {
        data,
        error,
      } = await supabase.auth.getUser();

      if (error) {
        console.error(
          'Gagal mengambil data user:',
          error
        );
        return;
      }

      if (data.user) {
        setUser(data.user);

        setFullName(
          data.user.user_metadata?.full_name ||
            ''
        );

        setRole(
          data.user.user_metadata?.role ||
            ''
        );

        setAvatarUrl(
          data.user.user_metadata?.avatar_url ||
            ''
        );
      }
    };

    getUser();
  }, []);

  // ============================================
  // EDIT AKUN
  // PILIH FOTO
  // ============================================

  const handleAvatarChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file =
      e.target.files?.[0];

    if (!file) return;

    setAkunError('');
    setAkunSuccess('');

    // Validasi tipe file
    if (!file.type.startsWith('image/')) {
      setAkunError(
        'File harus berupa gambar (JPG, PNG, dll).'
      );

      return;
    }

    // Validasi ukuran
    if (file.size > 2 * 1024 * 1024) {
      setAkunError(
        'Ukuran foto maksimal 2MB.'
      );

      return;
    }

    setAvatarFile(file);

    setAvatarPreview(
      URL.createObjectURL(file)
    );
  };

  // ============================================
  // EDIT AKUN
  // SIMPAN
  // ============================================

  const handleSaveAkun = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    setAkunError('');
    setAkunSuccess('');

    if (!fullName.trim()) {
      setAkunError(
        'Nama lengkap wajib diisi.'
      );

      return;
    }

    if (!user) {
      setAkunError(
        'Sesi pengguna tidak ditemukan.'
      );

      return;
    }

    setSavingAkun(true);

    try {
      let newAvatarUrl =
        avatarUrl;

      // ==========================================
      // UPLOAD FOTO
      // ==========================================

      if (avatarFile) {
        const fileExt =
          avatarFile.name
            .split('.')
            .pop();

        const filePath =
          `${user.id}/avatar-${Date.now()}.${fileExt}`;

        const {
          error: uploadError,
        } = await supabase.storage
          .from('avatars')
          .upload(
            filePath,
            avatarFile,
            {
              cacheControl: '3600',
              upsert: true,
            }
          );

        if (uploadError) {
          setAkunError(
            `Gagal mengunggah foto: ${uploadError.message}`
          );

          return;
        }

        const {
          data: publicUrlData,
        } = supabase.storage
          .from('avatars')
          .getPublicUrl(
            filePath
          );

        newAvatarUrl =
          publicUrlData.publicUrl;
      }

      // ==========================================
      // UPDATE USER SUPABASE
      // ==========================================

      const {
        data,
        error,
      } = await supabase.auth.updateUser({
        data: {
          full_name:
            fullName.trim(),

          role:
            role.trim(),

          avatar_url:
            newAvatarUrl,
        },
      });

      if (error) {
        setAkunError(
          error.message
        );

        return;
      }

      // ==========================================
      // UPDATE STATE
      // ==========================================

      setUser(data.user);

      setAvatarUrl(
        newAvatarUrl
      );

      setAvatarFile(null);

      setAvatarPreview('');

      setAkunSuccess(
        'Profil berhasil diperbarui.'
      );

      setTimeout(() => {
        setAkunSuccess('');
      }, 2500);

    } catch (error) {
      console.error(
        'Update profile error:',
        error
      );

      setAkunError(
        'Terjadi kesalahan saat menyimpan profil.'
      );

    } finally {
      setSavingAkun(false);
    }
  };

  // ============================================
  // GANTI PASSWORD
  // ============================================

  const handleChangePassword = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    setPasswordError('');
    setPasswordSuccess('');

    // ==========================================
    // VALIDASI
    // ==========================================

    if (
      !currentPassword ||
      !newPassword ||
      !confirmPassword
    ) {
      setPasswordError(
        'Semua field password wajib diisi.'
      );

      return;
    }

    if (newPassword.length < 6) {
      setPasswordError(
        'Password baru minimal 6 karakter.'
      );

      return;
    }

    if (
      newPassword !==
      confirmPassword
    ) {
      setPasswordError(
        'Konfirmasi password baru tidak cocok.'
      );

      return;
    }

    if (
      newPassword ===
      currentPassword
    ) {
      setPasswordError(
        'Password baru harus berbeda dari password saat ini.'
      );

      return;
    }

    if (!user?.email) {
      setPasswordError(
        'Sesi pengguna tidak ditemukan. Silakan muat ulang halaman.'
      );

      return;
    }

    setSavingPassword(true);

    try {
      // ==========================================
      // 1. VERIFIKASI PASSWORD LAMA
      // ==========================================

      const {
        error: verifyError,
      } =
        await supabase.auth.signInWithPassword({
          email:
            user.email,

          password:
            currentPassword,
        });

      if (verifyError) {
        setPasswordError(
          'Password saat ini salah.'
        );

        return;
      }

      // ==========================================
      // 2. UPDATE PASSWORD
      // ==========================================

      const {
        error: updateError,
      } =
        await supabase.auth.updateUser({
          password:
            newPassword,
        });

      if (updateError) {
        setPasswordError(
          updateError.message
        );

        return;
      }

      // ==========================================
      // BERHASIL
      // ==========================================

      setPasswordSuccess(
        'Password berhasil diubah.'
      );

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setTimeout(() => {
        setPasswordSuccess('');
      }, 2500);

    } catch (error) {
      console.error(
        'Gagal mengubah password:',
        error
      );

      setPasswordError(
        'Terjadi kesalahan saat mengubah password.'
      );

    } finally {
      setSavingPassword(false);
    }
  };

  // ============================================
  // DISPLAY USER
  // ============================================

  const displayName =
    fullName ||
    user?.email?.split('@')[0] ||
    'Pengguna';

  const initials =
    displayName
      .trim()
      .split(' ')
      .map(
        (word: string) =>
          word[0]
      )
      .slice(0, 2)
      .join('')
      .toUpperCase();

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-800">

      {/* ======================================== */}
      {/* SIDEBAR */}
      {/* ======================================== */}

      <Sidebar
        mobileOpen={
          mobileSidebarOpen
        }
        onClose={() =>
          setMobileSidebarOpen(
            false
          )
        }
      />

      {/* ======================================== */}
      {/* CONTENT */}
      {/* ======================================== */}

      <div className="min-h-screen lg:pl-[230px]">

        {/* ====================================== */}
        {/* HEADER */}
        {/* ====================================== */}

        <Header
          onMenuClick={() =>
            setMobileSidebarOpen(
              true
            )
          }
        />

        {/* ====================================== */}
        {/* MAIN */}
        {/* ====================================== */}

        <main className="p-4 sm:p-6 lg:p-8">

          <div className="mx-auto max-w-[900px]">

            {/* ================================== */}
            {/* JUDUL */}
            {/* ================================== */}

            <div className="mb-6">

              <h1 className="mb-1 text-xl font-bold text-slate-800">
                Pengaturan
              </h1>

              <p className="text-xs text-slate-500">
                Kelola informasi akun dan
                keamanan akun Anda.
              </p>

            </div>

            {/* ================================== */}
            {/* FORM EDIT AKUN */}
            {/* ================================== */}

            <div className="mb-5 max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">

              <h2 className="mb-1 text-sm font-bold text-slate-800">
                Edit Akun
              </h2>

              <p className="mb-4 text-[11px] text-slate-500">
                Perbarui informasi profil
                akun Anda.
              </p>

              <form
                onSubmit={
                  handleSaveAkun
                }
                className="space-y-4"
              >

                {/* ================================ */}
                {/* ERROR */}
                {/* ================================ */}

                {akunError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-center text-[11px] font-medium text-red-600">
                    ⚠️ {akunError}
                  </div>
                )}

                {/* ================================ */}
                {/* SUCCESS */}
                {/* ================================ */}

                {akunSuccess && (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-center text-[11px] font-medium text-green-600">
                    ✅ {akunSuccess}
                  </div>
                )}

                {/* ================================ */}
                {/* FOTO PROFIL */}
                {/* ================================ */}

                <div className="flex flex-col items-center gap-2 pb-2">

                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-gradient-to-br from-amber-100 via-orange-100 to-slate-200 text-xl font-bold text-slate-600">

                    {avatarPreview ||
                    avatarUrl ? (
                      <img
                        src={
                          avatarPreview ||
                          avatarUrl
                        }
                        alt={
                          displayName
                        }
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      initials ||
                      'U'
                    )}

                  </div>

                  <input
                    ref={
                      fileInputRef
                    }
                    type="file"
                    accept="image/*"
                    onChange={
                      handleAvatarChange
                    }
                    disabled={
                      savingAkun
                    }
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      fileInputRef.current?.click()
                    }
                    disabled={
                      savingAkun
                    }
                    className="rounded-lg border border-slate-300 px-3 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    Ganti Foto
                  </button>

                  <p className="text-center text-[10px] text-slate-400">
                    JPG/PNG, maksimal
                    2MB
                  </p>

                </div>

                {/* ================================ */}
                {/* NAMA */}
                {/* ================================ */}

                <div className="space-y-1">

                  <label
                    htmlFor="fullName"
                    className="block text-[11px] font-semibold text-slate-700"
                  >
                    Nama Lengkap
                  </label>

                  <input
                    id="fullName"
                    type="text"
                    value={
                      fullName
                    }
                    onChange={(e) =>
                      setFullName(
                        e.target.value
                      )
                    }
                    disabled={
                      savingAkun
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800 outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                    required
                  />

                </div>

                {/* ================================ */}
                {/* ROLE */}
                {/* ================================ */}

                <div className="space-y-1">

                  <label
                    htmlFor="role"
                    className="block text-[11px] font-semibold text-slate-700"
                  >
                    Jabatan / Role
                  </label>

                  <input
                    id="role"
                    type="text"
                    value={
                      role
                    }
                    onChange={(e) =>
                      setRole(
                        e.target.value
                      )
                    }
                    disabled={
                      savingAkun
                    }
                    placeholder="Contoh: Administrator"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-800 outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                  />

                </div>

                {/* ================================ */}
                {/* EMAIL */}
                {/* ================================ */}

                <div className="space-y-1">

                  <label className="block text-[11px] font-semibold text-slate-700">
                    Email
                  </label>

                  <input
                    type="text"
                    value={
                      user?.email ||
                      ''
                    }
                    disabled
                    className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-500"
                  />

                </div>

                {/* ================================ */}
                {/* BUTTON SIMPAN */}
                {/* ================================ */}

                <div className="flex justify-end pt-2">

                  <button
                    type="submit"
                    disabled={
                      savingAkun
                    }
                    className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    {savingAkun
                      ? 'Menyimpan...'
                      : 'Simpan Perubahan'}
                  </button>

                </div>

              </form>

            </div>

            {/* ================================== */}
            {/* FORM GANTI PASSWORD */}
            {/* ================================== */}

            <div className="max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">

              <h2 className="mb-1 text-sm font-bold text-slate-800">
                Ganti Password
              </h2>

              <p className="mb-4 text-[11px] text-slate-500">
                Masukkan password saat ini,
                lalu password baru Anda.
              </p>

              <form
                onSubmit={
                  handleChangePassword
                }
                className="space-y-4"
              >

                {/* ================================ */}
                {/* ERROR */}
                {/* ================================ */}

                {passwordError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-center text-[11px] font-medium text-red-600">
                    ⚠️ {passwordError}
                  </div>
                )}

                {/* ================================ */}
                {/* SUCCESS */}
                {/* ================================ */}

                {passwordSuccess && (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-center text-[11px] font-medium text-green-600">
                    ✅ {passwordSuccess}
                  </div>
                )}

                {/* ================================ */}
                {/* PASSWORD SAAT INI */}
                {/* ================================ */}

                <div className="space-y-1">

                  <label
                    htmlFor="currentPassword"
                    className="block text-[11px] font-semibold text-slate-700"
                  >
                    Password Saat Ini
                  </label>

                  <div className="relative">

                    <input
                      id="currentPassword"
                      type={
                        showCurrentPassword
                          ? 'text'
                          : 'password'
                      }
                      value={
                        currentPassword
                      }
                      onChange={(e) =>
                        setCurrentPassword(
                          e.target.value
                        )
                      }
                      disabled={
                        savingPassword
                      }
                      autoComplete="current-password"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-9 text-xs text-slate-800 outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                      required
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowCurrentPassword(
                          (value) =>
                            !value
                        )
                      }
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                      tabIndex={-1}
                    >
                      <EyeIcon
                        open={
                          showCurrentPassword
                        }
                      />
                    </button>

                  </div>

                </div>

                {/* ================================ */}
                {/* PASSWORD BARU */}
                {/* ================================ */}

                <div className="space-y-1">

                  <label
                    htmlFor="newPassword"
                    className="block text-[11px] font-semibold text-slate-700"
                  >
                    Password Baru
                  </label>

                  <div className="relative">

                    <input
                      id="newPassword"
                      type={
                        showNewPassword
                          ? 'text'
                          : 'password'
                      }
                      value={
                        newPassword
                      }
                      onChange={(e) =>
                        setNewPassword(
                          e.target.value
                        )
                      }
                      disabled={
                        savingPassword
                      }
                      autoComplete="new-password"
                      placeholder="Minimal 6 karakter"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-9 text-xs text-slate-800 outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                      required
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowNewPassword(
                          (value) =>
                            !value
                        )
                      }
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                      tabIndex={-1}
                    >
                      <EyeIcon
                        open={
                          showNewPassword
                        }
                      />
                    </button>

                  </div>

                </div>

                {/* ================================ */}
                {/* KONFIRMASI PASSWORD */}
                {/* ================================ */}

                <div className="space-y-1">

                  <label
                    htmlFor="confirmPassword"
                    className="block text-[11px] font-semibold text-slate-700"
                  >
                    Konfirmasi Password Baru
                  </label>

                  <div className="relative">

                    <input
                      id="confirmPassword"
                      type={
                        showConfirmPassword
                          ? 'text'
                          : 'password'
                      }
                      value={
                        confirmPassword
                      }
                      onChange={(e) =>
                        setConfirmPassword(
                          e.target.value
                        )
                      }
                      disabled={
                        savingPassword
                      }
                      autoComplete="new-password"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-9 text-xs text-slate-800 outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                      required
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(
                          (value) =>
                            !value
                        )
                      }
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                      tabIndex={-1}
                    >
                      <EyeIcon
                        open={
                          showConfirmPassword
                        }
                      />
                    </button>

                  </div>

                </div>

                {/* ================================ */}
                {/* BUTTON PASSWORD */}
                {/* ================================ */}

                <div className="flex justify-end pt-2">

                  <button
                    type="submit"
                    disabled={
                      savingPassword
                    }
                    className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    {savingPassword
                      ? 'Menyimpan...'
                      : 'Ubah Password'}
                  </button>

                </div>

              </form>

            </div>

          </div>

        </main>

      </div>

    </div>
  );
}

