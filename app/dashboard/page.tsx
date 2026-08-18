'use client';

import { useState } from 'react';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import StatsCard from '@/components/dashboard/StatsCard';
import DisbursementChart from '@/components/dashboard/DisbursementChart';
import EmployeeLimitTable from '@/components/dashboard/EmployeeLimitTable';

export default function DashboardPage() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800">
      <Sidebar mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />

      <div className="min-h-screen lg:pl-[230px]">
        <Header onMenuClick={() => setMobileSidebarOpen(true)} />

        <main className="p-3 sm:p-4 lg:p-5">
          <div className="mx-auto max-w-[1500px]">
            <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
              <span className="text-[8px] text-slate-400">Periode</span>
              <select className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-[8px] text-slate-500 shadow-sm outline-none focus:border-blue-400" defaultValue="Agustus 2026" aria-label="Periode dashboard">
                <option>Agustus 2026</option>
                <option>Juli 2026</option>
                <option>Juni 2026</option>
              </select>
            </div>

            <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              <StatsCard title="Total Pegawai" value="125" helper="Pegawai aktif" tone="blue" icon="users" />
              <StatsCard title="Sudah Limit" value="38" helper="30,4% dari total" tone="red" icon="limit" />
              <StatsCard title="Masih Tersedia" value="87" helper="69,6% dari total" tone="green" icon="available" />
              <StatsCard title="Total Pencairan" value="Rp25.500.000" helper="Total bulan ini" tone="indigo" icon="money" />
            </section>

            <section className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1.06fr]">
              <DisbursementChart />
              <EmployeeLimitTable />
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
