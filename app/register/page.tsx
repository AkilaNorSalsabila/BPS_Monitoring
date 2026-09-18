
'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// ============================================
// SUPABASE CLIENT
// ============================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Supabase environment variables belum dikonfigurasi. Periksa file .env.local'
  );
}

const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);

// ============================================
// TYPE TIM
// ============================================

interface Tim {
  id: number;
  nama_tim: string;
}

// ============================================
// REGISTER PAGE
// ============================================

export default function RegisterPage() {
  const router = useRouter();

  // ==========================================
  // FORM STATE
  // ==========================================

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [timId, setTimId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] =
    useState('');

  // ==========================================
  // TIM STATE
  // ==========================================

  const [timList, setTimList] = useState<Tim[]>([]);
  const [timLoading, setTimLoading] = useState(true);

  // ==========================================
  // PASSWORD VISIBILITY
  // ==========================================

  const [showPassword, setShowPassword] =
    useState(false);

  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  // ==========================================
  // UI STATE
  // ==========================================

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // ==========================================
  // FETCH DAFTAR TIM
  // ==========================================

  useEffect(() => {
    const fetchTim = async () => {
      setTimLoading(true);

      try {
        const { data, error } = await supabase
          .from('tim')
          .select('id, nama_tim')
          .order('id', { ascending: true });

        if (error) {
          console.error(
            'Error fetching tim:',
            error
          );

          setErrorMsg(
            'Daftar tim gagal dimuat. Silakan coba lagi.'
          );

          setTimList([]);
          return;
        }

        setTimList(data ?? []);
      } catch (error) {
        console.error(
          'Unexpected error fetching tim:',
          error
        );

        setErrorMsg(
          'Terjadi kesalahan saat memuat daftar tim.'
        );

        setTimList([]);
      } finally {
        setTimLoading(false);
      }
    };

    fetchTim();
  }, []);

  // ==========================================
  // HANDLE REGISTER
  // ==========================================

  const handleRegister = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    setErrorMsg('');
    setSuccessMsg('');

    // ========================================
    // CLEAN DATA
    // ========================================

    const cleanFullName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    const cleanUsername =
      username.trim().toLowerCase();

    const cleanTimId = Number(timId);

    // ========================================
    // VALIDASI WAJIB
    // ========================================

    if (
      !cleanFullName ||
      !cleanEmail ||
      !cleanUsername ||
      !timId ||
      !password ||
      !confirmPassword
    ) {
      setErrorMsg(
        'Harap isi semua kolom yang wajib.'
      );

      return;
    }

    // ========================================
    // VALIDASI TIM
    // ========================================

    const selectedTim = timList.find(
      (tim) => tim.id === cleanTimId
    );

    if (!selectedTim) {
      setErrorMsg(
        'Tim yang dipilih tidak valid. Silakan pilih tim yang tersedia.'
      );

      return;
    }

    // ========================================
    // VALIDASI PASSWORD
    // ========================================

    if (password !== confirmPassword) {
      setErrorMsg(
        'Konfirmasi password tidak cocok dengan password Anda.'
      );

      return;
    }

    if (password.length < 6) {
      setErrorMsg(
        'Password minimal terdiri dari 6 karakter.'
      );

      return;
    }

    // ========================================
    // VALIDASI USERNAME
    // ========================================

    const usernameRegex = /^[a-z0-9._-]+$/;

    if (!usernameRegex.test(cleanUsername)) {
      setErrorMsg(
        'Username hanya boleh menggunakan huruf kecil, angka, titik, underscore, dan tanda strip.'
      );

      return;
    }

    // ========================================
    // VALIDASI EMAIL
    // ========================================

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(cleanEmail)) {
      setErrorMsg(
        'Format email tidak valid.'
      );

      return;
    }

    // ========================================
    // START LOADING
    // ========================================

    setLoading(true);

    try {
      // ======================================
      // REGISTER SUPABASE AUTH
      // ======================================

      const { data, error } =
        await supabase.auth.signUp({
          email: cleanEmail,
          password,

          options: {
            data: {
              // ==================================
              // DATA PROFILE
              // ==================================

              full_name: cleanFullName,

              display_name: cleanFullName,

              username: cleanUsername,

              phone: cleanPhone,

              // ==================================
              // TIM YANG DIAJUKAN
              // ==================================

              tim_id: cleanTimId,

              // ==================================
              // PENTING:
              //
              // JANGAN kirim:
              //
              // role
              // status
              //
              // Karena keduanya ditentukan
              // oleh database.
              //
              // role   -> pegawai
              // status -> pending
              // ==================================
            },
          },
        });

      // ======================================
      // HANDLE SUPABASE ERROR
      // ======================================

      if (error) {
        console.error(
          'Supabase Register Error:',
          error
        );

        const errorMessage =
          error.message.toLowerCase();

        // --------------------------------------
        // EMAIL SUDAH TERDAFTAR
        // --------------------------------------

        if (
          errorMessage.includes(
            'already registered'
          ) ||
          errorMessage.includes(
            'already exists'
          )
        ) {
          setErrorMsg(
            'Email tersebut sudah terdaftar. Silakan gunakan email lain atau masuk menggunakan akun yang sudah ada.'
          );
        }

        // --------------------------------------
        // EMAIL INVALID
        // --------------------------------------

        else if (
          errorMessage.includes(
            'invalid email'
          )
        ) {
          setErrorMsg(
            'Format email tidak valid.'
          );
        }

        // --------------------------------------
        // PASSWORD ERROR
        // --------------------------------------

        else if (
          errorMessage.includes(
            'password'
          )
        ) {
          setErrorMsg(
            'Password tidak memenuhi persyaratan Supabase.'
          );
        }

        // --------------------------------------
        // ERROR LAINNYA
        // --------------------------------------

        else {
          setErrorMsg(error.message);
        }

        return;
      }

      // ======================================
      // PASTIKAN USER BERHASIL DIBUAT
      // ======================================

      if (!data.user) {
        setErrorMsg(
          'Registrasi gagal. Data akun tidak berhasil dibuat.'
        );

        return;
      }

      // ======================================
      // SUCCESS
      // ======================================

      setSuccessMsg(
        'Pendaftaran berhasil! Akun Anda sedang menunggu persetujuan admin.'
      );

      // ======================================
      // REDIRECT LOGIN
      // ======================================

      setTimeout(() => {
        router.push('/login');
      }, 2500);
    } catch (error) {
      console.error(
        'Unexpected Register Error:',
        error
      );

      setErrorMsg(
        'Terjadi kesalahan yang tidak terduga saat registrasi. Silakan coba lagi.'
      );
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <main className="min-h-screen w-full bg-[#004A8B] flex items-center justify-center p-4 sm:p-6 md:p-10 font-sans">

      {/* =====================================
          OUTER CARD
      ====================================== */}

      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-2 min-h-[580px]">

        {/* ===================================
            LEFT SIDE - ILLUSTRATION
        ==================================== */}

        <div className="bg-[#EAF3FA] p-6 md:p-8 flex items-center justify-center min-h-[340px] md:min-h-full">

          <img
            src="/Rectangle 2.png"
            alt="Ilustrasi BPS"
            className="max-h-[460px] w-auto object-contain drop-shadow-sm"
          />

        </div>

        {/* ===================================
            RIGHT SIDE - REGISTER FORM
        ==================================== */}

        <div className="bg-white p-6 sm:p-10 md:p-12 flex flex-col justify-center">

          {/* =================================
              HEADER & LOGO BPS
          ================================== */}

          <div className="flex flex-col items-center mb-6">

            <img
              src="/Rectangle 7.png"
              alt="BPS Kota Mojokerto"
              className="w-auto max-w-[240px] max-h-[90px] object-contain mb-4"
            />

            <div className="w-full text-left">

              <h1 className="text-xl font-bold text-gray-900">
                Daftar Akun Baru
              </h1>

              <p className="text-xs text-gray-500 mt-0.5">
                Lengkapi data diri Anda untuk membuat BPS ID
              </p>

            </div>

          </div>

          {/* =================================
              FORM REGISTER
          ================================== */}

          <form
            onSubmit={handleRegister}
            className="space-y-3.5 w-full"
          >

            {/* =================================
                ERROR MESSAGE
            ================================== */}

            {errorMsg && (
              <div className="p-2.5 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg text-center font-medium">
                ⚠️ {errorMsg}
              </div>
            )}

            {/* =================================
                SUCCESS MESSAGE
            ================================== */}

            {successMsg && (
              <div className="p-2.5 bg-green-50 border border-green-200 text-green-600 text-xs rounded-lg text-center font-medium">
                ✅ {successMsg}
              </div>
            )}

            {/* =================================
                NAMA LENGKAP
            ================================== */}

            <div className="space-y-1">

              <label
                htmlFor="fullName"
                className="block text-xs font-semibold text-gray-700"
              >
                Nama Lengkap (Sesuai KTP)
              </label>

              <input
                id="fullName"
                type="text"
                placeholder="Masukkan nama lengkap Anda"
                value={fullName}
                onChange={(e) =>
                  setFullName(e.target.value)
                }
                disabled={loading}
                className="w-full px-3.5 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent text-xs text-gray-800 placeholder-gray-400 transition disabled:bg-gray-100 disabled:cursor-not-allowed"
                required
              />

            </div>

            {/* =================================
                TIM YANG DIAJUKAN
            ================================== */}

            <div className="space-y-1">

              <label
                htmlFor="tim"
                className="block text-xs font-semibold text-gray-700"
              >
                Tim yang Diajukan
              </label>

              <select
                id="tim"
                value={timId}
                onChange={(e) =>
                  setTimId(e.target.value)
                }
                disabled={
                  loading || timLoading
                }
                className="w-full px-3.5 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent text-xs text-gray-800 transition disabled:bg-gray-100 disabled:cursor-not-allowed"
                required
              >

                <option value="">
                  {timLoading
                    ? 'Memuat daftar tim...'
                    : 'Pilih tim yang diajukan'}
                </option>

                {timList.map((tim) => (
                  <option
                    key={tim.id}
                    value={tim.id}
                  >
                    {tim.nama_tim}
                  </option>
                ))}

              </select>

              <p className="text-[10px] text-gray-400">
                Tim yang Anda pilih akan diperiksa dan disahkan oleh admin.
              </p>

            </div>

            {/* =================================
                EMAIL & PHONE
            ================================== */}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              {/* EMAIL */}

              <div className="space-y-1">

                <label
                  htmlFor="email"
                  className="block text-xs font-semibold text-gray-700"
                >
                  Email
                </label>

                <input
                  id="email"
                  type="email"
                  placeholder="nama@email.com"
                  value={email}
                  onChange={(e) =>
                    setEmail(e.target.value)
                  }
                  disabled={loading}
                  className="w-full px-3.5 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent text-xs text-gray-800 placeholder-gray-400 transition disabled:bg-gray-100 disabled:cursor-not-allowed"
                  required
                />

              </div>

              {/* PHONE */}

              <div className="space-y-1">

                <label
                  htmlFor="phone"
                  className="block text-xs font-semibold text-gray-700"
                >
                  Nomor Telepon / WA (Opsional)
                </label>

                <input
                  id="phone"
                  type="tel"
                  placeholder="08xxxxxxxxxx"
                  value={phone}
                  onChange={(e) =>
                    setPhone(e.target.value)
                  }
                  disabled={loading}
                  className="w-full px-3.5 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent text-xs text-gray-800 placeholder-gray-400 transition disabled:bg-gray-100 disabled:cursor-not-allowed"
                />

              </div>

            </div>

            {/* =================================
                USERNAME
            ================================== */}

            <div className="space-y-1">

              <label
                htmlFor="username"
                className="block text-xs font-semibold text-gray-700"
              >
                Username (BPS ID)
              </label>

              <input
                id="username"
                type="text"
                placeholder="Pilih username unik"
                value={username}
                onChange={(e) =>
                  setUsername(
                    e.target.value
                      .toLowerCase()
                      .replace(/\s/g, '')
                  )
                }
                disabled={loading}
                className="w-full px-3.5 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent text-xs text-gray-800 placeholder-gray-400 transition disabled:bg-gray-100 disabled:cursor-not-allowed"
                required
              />

              <p className="text-[10px] text-gray-400">
                Gunakan huruf kecil, angka, titik,
                underscore, atau tanda strip.
              </p>

            </div>

            {/* =================================
                PASSWORD & CONFIRM PASSWORD
            ================================== */}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              {/* PASSWORD */}

              <div className="space-y-1">

                <label
                  htmlFor="password"
                  className="block text-xs font-semibold text-gray-700"
                >
                  Password (Min. 6 karakter)
                </label>

                <div className="relative">

                  <input
                    id="password"
                    type={
                      showPassword
                        ? 'text'
                        : 'password'
                    }
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) =>
                      setPassword(
                        e.target.value
                      )
                    }
                    disabled={loading}
                    className="w-full pl-3.5 pr-9 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent text-xs text-gray-800 placeholder-gray-400 transition disabled:bg-gray-100 disabled:cursor-not-allowed"
                    required
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        !showPassword
                      )
                    }
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                    tabIndex={-1}
                  >

                    {showPassword ? (

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
                          d="M3.98 8.223A10.477 10.477 0 0 1 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
                        />

                      </svg>

                    ) : (

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

              {/* CONFIRM PASSWORD */}

              <div className="space-y-1">

                <label
                  htmlFor="confirmPassword"
                  className="block text-xs font-semibold text-gray-700"
                >
                  Konfirmasi Password
                </label>

                <div className="relative">

                  <input
                    id="confirmPassword"
                    type={
                      showConfirmPassword
                        ? 'text'
                        : 'password'
                    }
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) =>
                      setConfirmPassword(
                        e.target.value
                      )
                    }
                    disabled={loading}
                    className="w-full pl-3.5 pr-9 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent text-xs text-gray-800 placeholder-gray-400 transition disabled:bg-gray-100 disabled:cursor-not-allowed"
                    required
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowConfirmPassword(
                        !showConfirmPassword
                      )
                    }
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                    tabIndex={-1}
                  >

                    {showConfirmPassword ? (

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
                          d="M3.98 8.223A10.477 10.477 0 0 1 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1 4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
                        />

                      </svg>

                    ) : (

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

            </div>

            {/* =================================
                BUTTON DAFTAR
            ================================== */}

            <button
              type="submit"
              disabled={
                loading ||
                timLoading ||
                timList.length === 0
              }
              className="w-full mt-3 py-2.5 px-4 bg-[#3B82F6] hover:bg-[#2563EB] active:bg-[#1D4ED8] text-white font-semibold rounded-lg shadow-sm transition duration-150 ease-in-out disabled:opacity-60 disabled:cursor-not-allowed text-xs focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#3B82F6]"
            >

              {loading ? (

                <span className="flex items-center justify-center gap-2">

                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >

                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />

                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />

                  </svg>

                  Memproses...

                </span>

              ) : (

                'Daftar Sekarang'

              )}

            </button>

            {/* =================================
                LINK LOGIN
            ================================== */}

            <div className="text-center pt-1">

              <p className="text-xs text-gray-600">

                Sudah punya akun?{' '}

                <Link
                  href="/login"
                  className="font-semibold text-[#3B82F6] hover:underline focus:outline-none focus:ring-1 focus:ring-[#3B82F6] rounded px-0.5"
                >
                  Masuk disini
                </Link>

              </p>

            </div>

          </form>

        </div>

      </div>

    </main>
  );
}
