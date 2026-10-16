// M4 — Reports: placement funnel per drive (applied → shortlisted → selected)
// from aggregate queries, with simple funnel bars.

import React, { useEffect, useState } from 'react';
import { reports as reportsApi, errMsg } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import DataTable from '../../components/DataTable.jsx';
import EmptyState from '../../components/EmptyState.jsx';

function Funnel({ applied, shortlisted, selected }) {
  const max = Math.max(applied, 1);
  const bars = [
    ['Applied', applied, 'bg-indigo-500'],
    ['Shortlisted', shortlisted, 'bg-amber-500'],
    ['Selected', selected, 'bg-emerald-500'],
  ];
  return (
    <div className="space-y-1.5 min-w-[180px]">
      {bars.map(([label, n, color]) => (
        <div key={label} className="flex items-center gap-2">
          <span className="text-xs text-slate-500 w-20 shrink-0">{label}</span>
          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${(n / max) * 100}%` }} />
          </div>
          <span className="text-xs font-semibold text-slate-700 w-8 text-right">{n}</span>
        </div>
      ))}
    </div>
  );
}

export default function Reports() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await reportsApi.placement();
        setRows(data ?? []);
      } catch (err) {
        toast(errMsg(err, 'Could not load the report.'), 'error');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="text-sm text-slate-500 py-10 text-center">Loading report…</div>;

  const totals = rows.reduce(
    (t, r) => ({
      applied: t.applied + (r.applied ?? 0),
      shortlisted: t.shortlisted + (r.shortlisted ?? 0),
      selected: t.selected + (r.selected ?? 0),
    }),
    { applied: 0, shortlisted: 0, selected: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h2 className="font-semibold text-slate-900 mb-1">Placement progress — all drives</h2>
        <p className="text-xs text-slate-500 mb-4">Aggregated from the database with GROUP BY joins, per drive.</p>
        {rows.length === 0 ? (
          <EmptyState title="No data yet" message="Once drives collect applications, the progress bars appear here." />
        ) : (
          <Funnel {...totals} />
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Drive report</h2>
        </div>
        <DataTable
          emptyHint="No drives to report on yet."
          columns={[
            { key: 'drive', label: 'Drive', render: (r) => <span className="font-medium text-slate-900">{r.drive_title}</span> },
            { key: 'company', label: 'Company', render: (r) => r.company ?? '—' },
            { key: 'progress', label: 'Progress', render: (r) => <Funnel applied={r.applied ?? 0} shortlisted={r.shortlisted ?? 0} selected={r.selected ?? 0} /> },
            { key: 'avg', label: 'Avg CGPA (shortlisted)', render: (r) => (r.avg_cgpa_shortlisted != null ? Number(r.avg_cgpa_shortlisted).toFixed(2) : '—') },
          ]}
          rows={rows}
        />
      </div>
    </div>
  );
}
