// Pill badge for statuses (drives, bookings, locks, applications...).
// variant: success | warning | danger | info | neutral

const STYLES = {
  success: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40',
  warning: 'bg-amber-500/10 text-amber-300 ring-amber-500/40',
  danger: 'bg-rose-500/10 text-rose-300 ring-rose-500/40',
  info: 'bg-cyan-500/10 text-cyan-300 ring-cyan-500/30',
  neutral: 'bg-[#151B30] text-slate-400 ring-white/10',
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
