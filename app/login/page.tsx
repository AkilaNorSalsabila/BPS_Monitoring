'use client';

import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
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
// LOGIN PAGE
// ============================================

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // ============================================
  // HANDLE LOGIN
  // ============================================

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setErrorMsg('');
    setSuccessMsg('');

    // Validasi input
    if (!username.trim() || !password) {
      setErrorMsg('Username dan password wajib diisi.');
      return;
    }

    setLoading(true);

    try {
      const cleanInput = username.trim().toLowerCase();
      
      // Jika user memasukkan email lengkap, pakai langsung. 
      // Jika memasukkan username, tambahkan domain default.
      const loginEmail = cleanInput.includes('@')
        ? cleanInput
        : `${cleanInput}@bps.go.id`;

      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: password,
      });

      // ============================================
      // LOGIN GAGAL
      // ============================================

      if (error) {
        console.log('Detail Error Login:', error.message);

        if (
          error.message
            .toLowerCase()
            .includes('invalid login credentials')
        ) {
          setErrorMsg(
            'Username atau password salah. Silakan periksa kembali.'
          );
        } else if (
          error.message
            .toLowerCase()
            .includes('email not confirmed')
        ) {
          setErrorMsg(
            'Email akun belum dikonfirmasi. Silakan konfirmasi email terlebih dahulu.'
          );
        } else {
          setErrorMsg(error.message);
        }

        return;
      }

      // ============================================
      // LOGIN BERHASIL
      // ============================================

      setSuccessMsg('Berhasil masuk! Mengalihkan ke dashboard...');

      if (rememberMe) {
        localStorage.setItem('remember_login', 'true');
      } else {
        localStorage.removeItem('remember_login');
      }

      // Redirect ke dashboard
      setTimeout(() => {
        router.push('/dashboard');
        router.refresh();
      }, 800);

    } catch (error) {
      console.error('Login Error:', error);

      setErrorMsg(
        'Terjadi kesalahan saat menghubungkan ke server. Silakan coba lagi.'
      );
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // UI
  // ============================================

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

        {/* RIGHT SIDE - LOGIN FORM */}
        <div className="bg-white p-6 sm:p-10 md:p-12 flex flex-col justify-center">

          {/* HEADER & LOGO BPS */}
          <div className="flex flex-col items-center mb-6">
            <img
              src="/Rectangle 7.png"
              alt="BPS Kota Mojokerto"
              className="w-auto max-w-[240px] max-h-[90px] object-contain mb-4"
            />
            <div className="w-full text-left">
              <h1 className="text-xl font-bold text-gray-900">Selamat Datang</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Silakan masuk ke akun BPS Anda
              </p>
            </div>
          </div>

          {/* FORM LOGIN */}
          <form
            onSubmit={handleLogin}
            className="space-y-4 w-full"
          >

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

            {/* USERNAME */}
            <div className="space-y-1">
              <label
                htmlFor="username"
                className="block text-xs font-semibold text-gray-700"
              >
                Username / Email
              </label>

              <input
                id="username"
                type="text"
                placeholder="Masukkan username atau email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                disabled={loading}
                className="w-full px-3.5 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent text-xs text-gray-800 placeholder-gray-400 transition disabled:bg-gray-100 disabled:cursor-not-allowed"
                required
              />
            </div>

            {/* PASSWORD WITH EYE TOGGLE */}
            <div className="space-y-1">
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-gray-700"
              >
                Password
              </label>

              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={loading}
                  className="w-full pl-3.5 pr-9 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent text-xs text-gray-800 placeholder-gray-400 transition disabled:bg-gray-100 disabled:cursor-not-allowed"
                  required
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    /* Eye Off Icon */
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.8}
                      stroke="currentColor"
                      className="w-4 h-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
                      />
                    </svg>
                  ) : (
                    /* Eye Icon */
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.8}
                      stroke="currentColor"
                      className="w-4 h-4"
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
                  )}
                </button>
              </div>
            </div>

            {/* INGAT SAYA & LUPA PASSWORD */}
            <div className="flex items-center justify-between pt-0.5">
              <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-gray-700 select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={loading}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-[#3B82F6] focus:ring-[#3B82F6]"
                />
                <span>Ingat Saya</span>
              </label>

              <Link
                href="/forgot-password"
                className="text-xs font-semibold text-[#3B82F6] hover:underline focus:outline-none"
              >
                Lupa Password?
              </Link>
            </div>
            {/* TOMBOL MASUK */}
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
                  Memproses...
                </span>
              ) : (
                'Masuk'
              )}
            </button>

            {/* REGISTER LINK */}
            <div className="text-center pt-1">
              <p className="text-xs text-gray-600">
                Belum punya akun?{' '}
                <Link
                  href="/register"
                  className="font-semibold text-[#3B82F6] hover:underline focus:outline-none focus:ring-1 focus:ring-[#3B82F6] rounded px-0.5"
                >
                  Daftar Sekarang
                </Link>
              </p>
            </div>

          </form>

        </div>

      </div>

    </main>
  );
}