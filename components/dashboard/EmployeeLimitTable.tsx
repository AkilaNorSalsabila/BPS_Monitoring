'use client';

export type StatusLimit = 'Mendekati Limit' | 'Limit Terlampaui';

export interface EmployeeLimitRow {
  sobatId: string;
  namaMitra: string;
  terpakai: number;
  limit: number;
  presentase: number;
  status: StatusLimit;
}

interface EmployeeLimitTableProps {
  data: EmployeeLimitRow[];
  loading?: boolean;
}

const formatRupiah = (val: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

function statusBadge(status: StatusLimit) {
  if (status === 'Limit Terlampaui') {
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
        Limit Terlampaui
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
      Mendekati Limit
    </span>
  );
}

export default function EmployeeLimitTable({ data, loading }: EmployeeLimitTableProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-sm font-bold text-slate-800">Mitra Mendekati / Sudah Limit</h2>
        <p className="text-[11px] text-slate-500">Mitra yang perlu diperhatikan pada periode berjalan</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
            <tr>
              <th className="py-2 px-2.5">Nama Mitra</th>
              <th className="py-2 px-2.5 text-right">Terpakai</th>
              <th className="py-2 px-2.5 text-right">Limit</th>
              <th className="py-2 px-2.5 text-center">Presentase</th>
              <th className="py-2 px-2.5 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-400">
                  Memuat data...
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-400">
                  Tidak ada Mitra yang mendekati atau melebihi limit saat ini.
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={row.sobatId}
                  className={`hover:bg-slate-50/70 transition ${
                    row.status === 'Limit Terlampaui' ? 'bg-rose-50/40' : ''
                  }`}
                >
                  <td className="py-2 px-2.5">
                    <div className="font-semibold text-slate-800">{row.namaMitra}</div>
                    <div className="text-[10px] font-mono text-blue-600">{row.sobatId}</div>
                  </td>
                  <td className="py-2 px-2.5 text-right font-medium">{formatRupiah(row.terpakai)}</td>
                  <td className="py-2 px-2.5 text-right font-medium text-slate-500">
                    {formatRupiah(row.limit)}
                  </td>
                  <td
                    className={`py-2 px-2.5 text-center font-semibold ${
                      row.status === 'Limit Terlampaui' ? 'text-rose-600' : 'text-amber-600'
                    }`}
                  >
                    {row.presentase}%
                  </td>
                  <td className="py-2 px-2.5 text-center">{statusBadge(row.status)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
