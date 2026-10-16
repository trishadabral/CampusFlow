// Pill badge for statuses (drives, bookings, locks, applications...).
// variant: success | warning | danger | info | neutral

const STYLES = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200',
  info: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export default function Badge({ variant = 'neutral', children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset whitespace-nowrap ${STYLES[variant] ?? STYLES.neutral}`}
    >
      {children}
    </span>
  );
}
