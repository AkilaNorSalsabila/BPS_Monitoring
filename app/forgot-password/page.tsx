'use client';

import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

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
// FORGOT PASSWORD PAGE
// ============================================

export default function ForgotPasswordPage() {
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // ============================================
  // HANDLE RESET PASSWORD
  // ============================================

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setErrorMsg('');
    setSuccessMsg('');

    if (!emailOrUsername.trim()) {
      setErrorMsg('Harap masukkan email atau username Anda.');
      return;
    }

    setLoading(true);

    try {
      const cleanInput = emailOrUsername.trim().toLowerCase();

      // Format email jika pengguna memasukkan username
      const targetEmail = cleanInput.includes('@')
        ? cleanInput
        : `${cleanInput}@bps.go.id`;

      // Mengirim email reset password dari Supabase
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        console.error('Reset Password Error:', error.message);
        setErrorMsg(error.message);
        return;
      }

      setSuccessMsg(
        'Link reset password berhasil dikirim! Silakan periksa kotak masuk atau folder spam email Anda.'
      );
      setEmailOrUsername('');
    } catch (error) {
      console.error('Unexpected Reset Error:', error);
      setErrorMsg(
        'Terjadi kesalahan saat mengoperasikan permintaan. Silakan coba lagi.'
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

        {/* RIGHT SIDE - FORGOT PASSWORD FORM */}
        <div className="bg-white p-6 sm:p-10 md:p-12 flex flex-col justify-center">

          {/* LOGO BPS */}
          <div className="flex flex-col items-center mb-6">
            <img
              src="/Rectangle 7.png"
              alt="BPS Kota Mojokerto"
              className="w-auto max-w-[240px] max-h-[90px] object-contain mb-6"
            />
            <div className="w-full text-left">
              <h1 className="text-xl font-bold text-gray-900">Lupa Password?</h1>
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                Masukkan Email atau Username terdaftar untuk menerima instruksi pemulihan kata sandi Anda.
              </p>
            </div>
          </div>

          {/* FORM RESET */}
          <form onSubmit={handleResetPassword} className="space-y-4 w-full">

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

            {/* FIELD EMAIL / USERNAME */}
            <div className="space-y-1">
              <label htmlFor="email" className="block text-xs font-semibold text-gray-700">
                Email / Username
              </label>
              <input
                id="email"
                type="text"
                placeholder="Masukkan email atau username terdaftar"
                value={emailOrUsername}
                onChange={(e) => setEmailOrUsername(e.target.value)}
                disabled={loading}
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent text-xs text-gray-800 placeholder-gray-400 transition disabled:bg-gray-100 disabled:cursor-not-allowed"
                required
              />
            </div>

            {/* TOMBOL KIRIM LINK RESET */}
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
                  Mengirim Link...
                </span>
              ) : (
                'Kirim Link Reset'
              )}
            </button>

            {/* LINK KEMBALI KE LOGIN */}
            <div className="text-center pt-2">
              <p className="text-xs text-gray-600">
                Ingat password Anda?{' '}
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