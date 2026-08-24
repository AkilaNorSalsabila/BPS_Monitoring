'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export interface DisbursementDataPoint {
  periode: string; // contoh: "Agustus 2026"
  total: number; // total pencairan (Rp) pada periode tsb
}

interface DisbursementChartProps {
  data: DisbursementDataPoint[];
  loading?: boolean;
}

const formatRupiahShort = (val: number) => {
  if (val >= 1_000_000_000) return `Rp${(val / 1_000_000_000).toFixed(1)}M`;
  if (val >= 1_000_000) return `Rp${(val / 1_000_000).toFixed(1)}jt`;
  if (val >= 1_000) return `Rp${(val / 1_000).toFixed(0)}rb`;
  return `Rp${val}`;
};

const formatRupiahFull = (val: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

export default function DisbursementChart({ data, loading }: DisbursementChartProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-sm font-bold text-slate-800">Grafik Pencairan</h2>
        <p className="text-[11px] text-slate-500">Total pencairan honor per periode (6 bulan terakhir)</p>
      </div>

      <div className="h-[280px]">
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            Memuat data pencairan...
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            Belum ada data pencairan.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="periode"
                tick={{ fontSize: 10, fill: '#64748b' }}
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatRupiahShort}
                width={56}
              />
              <Tooltip
                formatter={(value: any) => [formatRupiahFull(Number(value)), 'Total Pencairan']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
              />
              <Bar dataKey="total" fill="#2563eb" radius={[6, 6, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
