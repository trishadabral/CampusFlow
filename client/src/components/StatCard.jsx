// Stat card: big number + small label + tiny SVG icon. Used on every dashboard.

export default function StatCard({ label, value, icon, accent = 'coral' }) {
  const accents = {
    coral: 'bg-[#FF5C38]/10 text-[#FF5C38]',
    cyan: 'bg-cyan-500/10 text-cyan-300',
    emerald: 'bg-emerald-500/10 text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-400',
    rose: 'bg-rose-500/10 text-rose-400',
    slate: 'bg-[#151B30] text-slate-400',
  };
  return (
    <div className="bg-[#12172A] rounded-2xl shadow-sm border border-white/10 p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${accents[accent] ?? accents.coral}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="font-display text-2xl font-bold text-slate-100 leading-tight">{value ?? '—'}</div>
        <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</div>
      </div>
    </div>
  );
}
