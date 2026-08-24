interface StatsCardProps {
  title: string;
  value: string;
  helper: string;
  tone: 'blue' | 'red' | 'green' | 'indigo';
  icon: 'users' | 'limit' | 'available' | 'money';
}

const toneMap = {
  blue: {
    border: 'border-blue-200',
    icon: 'bg-blue-50 text-blue-500',
    helper: 'text-slate-400',
  },
  red: {
    border: 'border-red-200',
    icon: 'bg-red-50 text-red-500',
    helper: 'text-red-400',
  },
  green: {
    border: 'border-emerald-200',
    icon: 'bg-emerald-50 text-emerald-500',
    helper: 'text-emerald-500',
  },
  indigo: {
    border: 'border-blue-200',
    icon: 'bg-blue-50 text-blue-500',
    helper: 'text-slate-400',
  },
};

function CardIcon({ icon }: Pick<StatsCardProps, 'icon'>) {
  const common = { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (icon === 'money') return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /><path d="M8 15h.01M12 15h4" /></svg>;
  if (icon === 'limit') return <svg {...common}><circle cx="12" cy="7" r="4" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /><path d="M12 11v5" /></svg>;
  if (icon === 'available') return <svg {...common}><circle cx="8" cy="8" r="3" /><circle cx="16" cy="9" r="3" /><path d="M2.5 20a5.5 5.5 0 0 1 11 0M13 20a5 5 0 0 1 9 0" /></svg>;
  return <svg {...common}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 5.5a3 3 0 0 1 0 5.8M17 14a5.5 5.5 0 0 1 4.5 6" /></svg>;
}

export default function StatsCard({ title, value, helper, tone, icon }: StatsCardProps) {
  const colors = toneMap[tone];
  return (
    <article className={`rounded-lg border ${colors.border} bg-white p-3 shadow-[0_1px_4px_rgba(15,23,42,0.03)]`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${colors.icon}`}>
          <CardIcon icon={icon} />
        </div>
        <div className="min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{title}</div>
          <div className="mt-0.5 text-[19px] font-bold leading-tight text-slate-800">{value}</div>
          <div className={`mt-1 text-[9px] ${colors.helper}`}>{helper}</div>
        </div>
      </div>
    </article>
  );
}
