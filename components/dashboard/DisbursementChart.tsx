const data = [
  { month: 'Jan', value: 180 },
  { month: 'Feb', value: 240 },
  { month: 'Mar', value: 210 },
  { month: 'Apr', value: 250 },
  { month: 'Mei', value: 300 },
  { month: 'Jun', value: 270 },
  { month: 'Jul', value: 320 },
  { month: 'Agu', value: 350 },
];

export default function DisbursementChart() {
  const max = 350;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-[0_1px_4px_rgba(15,23,42,0.03)]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[10px] font-semibold text-slate-700">Grafik Pencairan (2026)</h2>
        <select className="rounded border border-slate-200 bg-white px-2 py-1 text-[8px] text-slate-500 outline-none focus:border-blue-400" defaultValue="2026" aria-label="Tahun grafik">
          <option value="2026">2026</option>
          <option value="2025">2025</option>
        </select>
      </div>

      <div className="flex h-[180px] min-w-0">
        <div className="flex w-7 shrink-0 flex-col justify-between pb-5 pt-1 text-[7px] text-slate-400">
          <span>350 J</span>
          <span>250 J</span>
          <span>150 J</span>
          <span>50 J</span>
          <span>0</span>
        </div>
        <div className="relative flex-1">
          <div className="absolute inset-x-0 top-1 bottom-5 flex flex-col justify-between">
            {[0, 1, 2, 3, 4].map((line) => <div key={line} className="border-t border-dashed border-slate-100" />)}
          </div>
          <div className="absolute inset-x-1 bottom-0 top-2 flex items-end justify-between gap-2 px-1 sm:gap-3">
            {data.map((item) => (
              <div key={item.month} className="flex h-full flex-1 flex-col items-center justify-end">
                <div className="flex h-[145px] items-end">
                  <div
                    title={`${item.month}: ${item.value} J`}
                    className="w-3 rounded-t-[2px] bg-[#3478c8] transition-all hover:bg-[#2568b5] sm:w-3.5"
                    style={{ height: `${(item.value / max) * 100}%` }}
                  />
                </div>
                <span className="mt-2 text-[7px] text-slate-400">{item.month}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
