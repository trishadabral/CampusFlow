// M4 — Reports: placement funnel per drive (applied → shortlisted → selected)
// from aggregate queries, with simple funnel bars.

import React, { useEffect, useState } from 'react';
import { reports as reportsApi, admin as adminApi, errMsg } from '../../api.js';
import { formatDate } from '../../utils.js';
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

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [rosterDrive, setRosterDrive] = useState(null);
  const [roster, setRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);

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
      try {
        const { data } = await reportsApi.placementStats();
        setStats(data ?? null);
      } catch {
        // Statistics are a bonus panel — a failure here never blocks the report.
        setStats(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const downloadCsv = async (kind, driveId, filename) => {
    try {
      const { data } =
        kind === 'placement'
          ? await reportsApi.exportPlacementCsv()
          : kind === 'drive'
            ? await reportsApi.exportDriveCsv(driveId)
            : await reportsApi.exportRosterCsv(driveId);
      downloadBlob(data, filename);
      toast('Download started.', 'success');
    } catch (err) {
      toast(errMsg(err, 'Could not download the file.'), 'error');
    }
  };

  const viewRoster = async (row) => {
    if (rosterDrive?.drive_id === row.drive_id) {
      setRosterDrive(null);
      setRoster([]);
      return;
    }
    setRosterDrive(row);
    setRosterLoading(true);
    try {
      const { data } = await adminApi.roster(row.drive_id);
      setRoster(data ?? []);
    } catch (err) {
      toast(errMsg(err, 'Could not load the student list.'), 'error');
      setRosterDrive(null);
    } finally {
      setRosterLoading(false);
    }
  };

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
      {/* Placement statistics (Phase 2, M4) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h2 className="font-semibold text-slate-900 mb-1">Placement statistics</h2>
        <p className="text-xs text-slate-500 mb-4">How each graduating year is doing, and which companies are hiring the most.</p>
        {!stats ? (
          <EmptyState title="No statistics yet" message="Once students and selections exist, the year-wise numbers appear here." />
        ) : (
          <div className="space-y-5">
            <div>
              <span className="text-xs text-slate-500">Average package offered (all years)</span>
              <div className="text-2xl font-bold text-slate-900 mt-0.5">
                {stats.overall_avg_package_lpa != null ? `₹${Number(stats.overall_avg_package_lpa).toFixed(2)} LPA` : 'No offers yet'}
              </div>
            </div>
            {(stats.by_year ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No students on record yet.</p>
            ) : (
              <div className="space-y-3">
                {(stats.by_year ?? []).map((y) => (
                  <div key={y.graduation_year}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-slate-900">Class of {y.graduation_year}</span>
                      <span className="text-slate-500">
                        {y.selected} of {y.total_students} placed ({y.placement_pct}%)
                        {y.avg_package_lpa != null ? ` · avg ₹${Number(y.avg_package_lpa).toFixed(2)} LPA` : ' · no offers yet'}
                      </span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, y.placement_pct || 0)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div>
              <h3 className="text-sm font-bold text-slate-700 mb-2">Top recruiters</h3>
              {(stats.top_recruiters ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No students placed yet — the top recruiters will show up here once selections are made.</p>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {(stats.top_recruiters ?? []).map((r) => (
                    <li key={r.company} className="py-2 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-900">{r.company}</span>
                      <span className="text-slate-500">{r.placed} student{r.placed === 1 ? '' : 's'} placed · {r.drives} drive{r.drives === 1 ? '' : 's'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-slate-900 mb-1">Placement progress — all drives</h2>
            <p className="text-xs text-slate-500 mb-4">Aggregated from the database with GROUP BY joins, per drive.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => downloadCsv('placement', null, 'placement-report.csv')} className="cf-btn-secondary">Download CSV</button>
            <button onClick={() => window.print()} className="cf-btn-secondary">Print</button>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-4">For one drive at a time — test scores, shortlist rate by branch and where students drop off — open that drive as its recruiter: each drive page has a “How this drive is doing” section.</p>
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
            { key: 'list', label: 'List', render: (r) => (
              <div className="flex flex-col gap-1 items-start whitespace-nowrap">
                <button
                  onClick={() => viewRoster(r)}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                  title="See every applicant for this drive — session, result and status"
                >
                  {rosterDrive?.drive_id === r.drive_id ? 'Hide list' : 'View list'}
                </button>
                <button
                  onClick={() => downloadCsv('roster', r.drive_id, `drive-${r.drive_id}-roster.csv`)}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                  title="Download this drive's student list as a spreadsheet file"
                >
                  Download list (CSV)
                </button>
                <button
                  onClick={() => downloadCsv('drive', r.drive_id, `drive-${r.drive_id}-report.csv`)}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                  title="Download this drive's placement numbers as a spreadsheet file"
                >
                  Download drive report (CSV)
                </button>
              </div>
            )},
          ]}
          rows={rows}
        />
      </div>

      {rosterDrive && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
          <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-semibold text-slate-900">Student list — {rosterDrive.drive_title}</h2>
              <p className="text-xs text-slate-500 mt-0.5">Everyone who applied, with their test session, result and interview slot.</p>
            </div>
            <button onClick={() => { setRosterDrive(null); setRoster([]); }} className="text-xs font-semibold text-slate-500 hover:text-slate-800">Close ✕</button>
          </div>
          {rosterLoading ? (
            <p className="text-sm text-slate-500 py-10 text-center">Loading list…</p>
          ) : (
            <DataTable
              emptyHint="No applicants for this drive yet."
              columns={[
                { key: 'student', label: 'Student', render: (r) => <span className="font-medium text-slate-900">{r.name}</span> },
                { key: 'roll', label: 'Roll no', render: (r) => r.roll_no ?? '—' },
                { key: 'branch', label: 'Branch', render: (r) => r.branch ?? '—' },
                { key: 'cgpa', label: 'CGPA', render: (r) => r.cgpa ?? '—' },
                { key: 'status', label: 'Status', render: (r) => (r.status ?? '—').replace('_', ' ') },
                { key: 'score', label: 'Test %', render: (r) => r.test_percentage != null ? `${Number(r.test_percentage).toFixed(1)}%` : '—' },
                { key: 'test', label: 'Test session', render: (r) => r.test_session ? `${r.test_session} · ${formatDate(r.test_at)}${r.test_venue ? ` · ${r.test_venue}` : ''}` : '—' },
                { key: 'interview', label: 'Interview', render: (r) => r.interview_slot ? `${r.interview_slot} · ${formatDate(r.interview_at)}${r.interview_venue ? ` · ${r.interview_venue}` : ''}` : '—' },
              ]}
              rows={roster}
            />
          )}
        </div>
      )}
    </div>
  );
}
