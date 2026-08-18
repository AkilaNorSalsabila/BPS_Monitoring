interface EmployeeRow {
  name: string;
  disbursement: string;
  limit: string;
  percentage: number;
  status: 'Mendekati Limit' | 'Limit';
}

const rows: EmployeeRow[] = [
  { name: 'Budi Santoso', disbursement: 'Rp2.850.000', limit: 'Rp3.000.000', percentage: 95, status: 'Mendekati Limit' },
  { name: 'Ani Wulandari', disbursement: 'Rp2.650.000', limit: 'Rp3.000.000', percentage: 88, status: 'Mendekati Limit' },
  { name: 'Doni Setiawan', disbursement: 'Rp2.420.000', limit: 'Rp3.000.000', percentage: 80, status: 'Mendekati Limit' },
  { name: 'Siti Nurhasita', disbursement: 'Rp3.000.000', limit: 'Rp3.000.000', percentage: 100, status: 'Limit' },
  { name: 'Rizky Pratama', disbursement: 'Rp3.000.000', limit: 'Rp3.000.000', percentage: 100, status: 'Limit' },
];

function Progress({ percentage }: { percentage: number }) {
  const danger = percentage >= 100;
  return (
    <div className="flex min-w-[90px] items-center gap-2">
      <span className="w-7 text-[7px] text-slate-500">{percentage}%</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${danger ? 'bg-red-500' : 'bg-orange-400'}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

export default function EmployeeLimitTable() {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_4px_rgba(15,23,42,0.03)]">
      <div className="flex items-center justify-between px-3 py-3">
        <h2 className="text-[10px] font-semibold text-slate-700">Pegawai Mendekati / Sudah Limit</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[590px] w-full border-collapse text-left">
          <thead>
            <tr className="border-y border-slate-100 bg-slate-50/60 text-[7px] font-semibold text-slate-500">
              <th className="px-3 py-2 font-semibold">Pegawai</th>
              <th className="px-2 py-2 font-semibold">Terpakai</th>
              <th className="px-2 py-2 font-semibold">Limit</th>
              <th className="px-2 py-2 font-semibold">Persentase</th>
              <th className="px-2 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 text-[7px] font-medium text-slate-600">{row.name}</td>
                <td className="px-2 py-2 text-[7px] text-slate-500">{row.disbursement}</td>
                <td className="px-2 py-2 text-[7px] text-slate-500">{row.limit}</td>
                <td className="px-2 py-2"><Progress percentage={row.percentage} /></td>
                <td className="px-2 py-2">
                  <span className={`inline-flex rounded-full px-2 py-1 text-[6px] font-semibold ${row.status === 'Limit' ? 'bg-red-50 text-red-500' : 'bg-orange-50 text-orange-500'}`}>
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end px-3 py-2.5">
        <a href="#" className="inline-flex items-center gap-1 text-[7px] font-semibold text-blue-500 hover:text-blue-700">
          Lihat semua
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </a>
      </div>
    </section>
  );
}
