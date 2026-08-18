'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// ============================================
// SUPABASE CLIENT
// ============================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Supabase environment variables belum dikonfigurasi. Periksa file .env.local'
  );
}

const supabase = createClient(supabaseUrl, supabasePublishableKey);

// ============================================
// RESET PASSWORD PAGE
// ============================================

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // State toggle visibilitas password
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Supabase secara otomatis menangkap token dari URL email dan membuat sesi sementara
  useEffect(() => {
    const handleAuthSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        console.warn('Sesi pemulihan belum aktif atau tautan telah kedaluwarsa.');
      }
    };
    handleAuthSession();
  }, []);

  // ============================================
  // HANDLE UPDATE PASSWORD
  // ============================================

  const handleUpdatePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!password || !confirmPassword) {
      setErrorMsg('Semua kolom wajib diisi.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password baru minimal harus terdiri dari 6 karakter.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Konfirmasi password tidak cocok dengan password baru.');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        console.error('Update Password Error:', error.message);
        setErrorMsg(error.message);
        return;
      }

      setSuccessMsg(
        'Password baru berhasil disimpan! Anda akan diarahkan ke halaman login...'
      );
      setPassword('');
      setConfirmPassword('');

      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (error) {
      console.error('Unexpected Update Error:', error);
      setErrorMsg(
        'Terjadi kesalahan saat memperbarui password. Silakan coba lagi.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen w-full bg-[#004A8B] flex items-center justify-center p-4 sm:p-6 md:p-10 font-sans">
      
      {/* OUTER CARD */}
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-2 min-h-[580px]">

        {/* LEFT SIDE - ILLUSTRATION */}
        <div className="bg-[#EAF3FA] p-6 md:p-8 flex items-center justify-center min-h-[340px] md:min-h-full">
          <img
            src="/Rectangle 2.png"
            alt="Ilustrasi BPS"
            className="max-h-[460px] w-auto object-contain drop-shadow-sm"
          />
        </div>

        {/* RIGHT SIDE - RESET PASSWORD FORM */}
        <div className="bg-white p-6 sm:p-10 md:p-12 flex flex-col justify-center">

          {/* LOGO BPS */}
          <div className="flex flex-col items-center mb-6">
            <img
              src="/Rectangle 7.png"
              alt="BPS Kota Mojokerto"
              className="w-auto max-w-[240px] max-h-[90px] object-contain mb-6"
            />
            <div className="w-full text-left">
              <h1 className="text-xl font-bold text-gray-900">Buat Password Baru</h1>
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                Buat kata sandi baru yang kuat untuk mengamankan BPS ID Anda.
              </p>
            </div>
          </div>

          {/* FORM UPDATE PASSWORD */}
          <form onSubmit={handleUpdatePassword} className="space-y-4 w-full">

            {/* ERROR MESSAGE */}
            {errorMsg && (
              <div className="p-2.5 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg text-center font-medium">
                ⚠️ {errorMsg}
              </div>
            )}

            {/* SUCCESS MESSAGE */}
            {successMsg && (
              <div className="p-2.5 bg-green-50 border border-green-200 text-green-600 text-xs rounded-lg text-center font-medium">
                ✅ {successMsg}
              </div>
            )}

            {/* FIELD PASSWORD BARU */}
            <div className="space-y-1">
              <label htmlFor="new-password" className="block text-xs font-semibold text-gray-700">
                Password Baru
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Masukkan password baru"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="w-full px-3.5 py-2.5 pr-10 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent text-xs text-gray-800 placeholder-gray-400 transition disabled:bg-gray-100 disabled:cursor-not-allowed"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    /* ICON MATA TERTUTUP */
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" />
                    </svg>
                  ) : (
                    /* ICON MATA TERBUKA */
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* FIELD KONFIRMASI PASSWORD BARU */}
            <div className="space-y-1">
              <label htmlFor="confirm-password" className="block text-xs font-semibold text-gray-700">
                Konfirmasi Password Baru
              </label>
              <div className="relative">
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Ulangi password baru"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  className="w-full px-3.5 py-2.5 pr-10 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent text-xs text-gray-800 placeholder-gray-400 transition disabled:bg-gray-100 disabled:cursor-not-allowed"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
                    /* ICON MATA TERTUTUP */
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" />
                    </svg>
                  ) : (
                    /* ICON MATA TERBUKA */
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* TOMBOL SIMPAN PASSWORD BARU */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 bg-[#3B82F6] hover:bg-[#2563EB] active:bg-[#1D4ED8] text-white font-semibold rounded-lg shadow-sm transition duration-150 ease-in-out disabled:opacity-60 disabled:cursor-not-allowed text-xs focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#3B82F6]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Menyimpan...
                </span>
              ) : (
                'Simpan Password Baru'
              )}
            </button>

            {/* LINK KEMBALI KE LOGIN */}
            <div className="text-center pt-2">
              <p className="text-xs text-gray-600">
                <Link
                  href="/login"
                  className="font-semibold text-[#3B82F6] hover:underline focus:outline-none focus:ring-1 focus:ring-[#3B82F6] rounded px-0.5"
                >
                  Kembali ke Login
                </Link>
              </p>
            </div>

          </form>

        </div>

      </div>

    </main>
  );
}