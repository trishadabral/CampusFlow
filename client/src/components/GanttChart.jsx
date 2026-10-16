// M2 — Gantt chart for the Scheduling Lab.
// Renders schedule segments as proportional horizontal bars with labels.

const PALETTE = [
  'bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
  'bg-sky-500', 'bg-violet-500', 'bg-orange-500', 'bg-teal-500',
];

export default function GanttChart({ gantt = [] }) {
  if (!gantt.length) return null;
  const total = Math.max(...gantt.map((g) => g.end), 1);
  const colorFor = (i, id) => PALETTE[(id ?? i) % PALETTE.length];

  return (
    <div>
      <div className="relative h-14 bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
        {gantt.map((g, i) => {
          const left = (g.start / total) * 100;
          const width = Math.max(((g.end - g.start) / total) * 100, 0.5);
          return (
            <div
              key={`${g.id}-${i}`}
              title={`${g.label}: ${g.start} → ${g.end}`}
              className={`absolute top-2 bottom-2 rounded-lg flex items-center justify-center text-xs font-semibold text-white ${colorFor(i, g.id)}`}
              style={{ left: `${left}%`, width: `calc(${width}% - 2px)` }}
            >
              <span className="truncate px-1">{g.label}</span>
            </div>
          );
        })}
      </div>
      <div className="relative h-5 mt-1 text-[11px] text-slate-400 font-mono-tight">
        <span className="absolute left-0">0</span>
        <span className="absolute left-1/2 -translate-x-1/2">{Math.round(total / 2)}</span>
        <span className="absolute right-0">{total} units</span>
      </div>
    </div>
  );
}
