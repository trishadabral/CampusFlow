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
    ['Applied', applied, 'bg-[#FF5C38]'],
    ['Shortlisted', shortlisted, 'bg-amber-500'],
    ['Selected', selected, 'bg-emerald-500'],
  ];
  return (
    <div className="space-y-1.5 min-w-[180px]">
      {bars.map(([label, n, color]) => (
        <div key={label} className="flex items-center gap-2">
          <span className="text-xs text-slate-400 w-20 shrink-0">{label}</span>
          <div className="flex-1 h-2 bg-[#151B30] rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${(n / max) * 100}%` }} />
          </div>
          <span className="text-xs font-semibold text-slate-300 w-8 text-right">{n}</span>
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
  // Interactive viewer state: search text, status filter, column sort.
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterStatus, setRosterStatus] = useState('all');
  const [rosterSort, setRosterSort] = useState({ key: 'test_percentage', dir: 'desc' });

  const closeRoster = () => {
    setRosterDrive(null);
    setRoster([]);
    setRosterSearch('');
    setRosterStatus('all');
  };

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
          : await reportsApi.exportRosterCsv(driveId);
      downloadBlob(data, filename);
      toast('Download started.', 'success');
    } catch (err) {
      toast(errMsg(err, 'Could not download the file.'), 'error');
    }
  };

  const pdfFilename = (drive) =>
    `${String(drive.drive_title || 'drive').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'drive'}-result.pdf`;

  const downloadPdf = async (drive) => {
    try {
      const { data } = await reportsApi.exportDrivePdf(drive.drive_id);
      downloadBlob(data, pdfFilename(drive));
      toast('Download started.', 'success');
    } catch (err) {
      toast(errMsg(err, 'Could not download the file.'), 'error');
    }
  };

  const viewRoster = async (row) => {
    if (rosterDrive?.drive_id === row.drive_id) {
      closeRoster();
      return;
    }
    setRosterDrive(row);
    setRosterSearch('');
    setRosterStatus('all');
    setRosterLoading(true);
    try {
      const { data } = await adminApi.roster(row.drive_id);
      setRoster(data ?? []);
    } catch (err) {
      toast(errMsg(err, 'Could not load the student list.'), 'error');
      closeRoster();
    } finally {
      setRosterLoading(false);
    }
  };

  const toggleSort = (key) =>
    setRosterSort((s) =>
      s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    );

  if (loading) return <div className="text-sm text-slate-400 py-10 text-center">Loading report…</div>;

  const totals = rows.reduce(
    (t, r) => ({
      applied: t.applied + (r.applied ?? 0),
      shortlisted: t.shortlisted + (r.shortlisted ?? 0),
      selected: t.selected + (r.selected ?? 0),
    }),
    { applied: 0, shortlisted: 0, selected: 0 }
  );

  // Interactive viewer: search by name or roll no., filter by status,
  // sort by any column. Students with no value sort last, either way.
  const rosterStatuses = [...new Set(roster.map((r) => r.status).filter(Boolean))];
  const visibleRoster = (() => {
    const q = rosterSearch.trim().toLowerCase();
    const filtered = roster.filter((r) => {
      if (rosterStatus !== 'all' && r.status !== rosterStatus) return false;
      if (!q) return true;
      return (r.name ?? '').toLowerCase().includes(q) || String(r.roll_no ?? '').toLowerCase().includes(q);
    });
    const { key, dir } = rosterSort;
    const val = (r) => {
      switch (key) {
        case 'cgpa': return r.cgpa == null ? null : Number(r.cgpa);
        case 'test_percentage': return r.test_percentage == null ? null : Number(r.test_percentage);
        case 'roll_no': return r.roll_no == null ? null : Number(r.roll_no);
        case 'test_session': return r.test_session ?? null;
        case 'interview_slot': return r.interview_slot ?? null;
        case 'status': return r.status ?? null;
        case 'branch': return r.branch ?? null;
        default: return (r.name ?? '').toLowerCase();
      }
    };
    return [...filtered].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return dir === 'asc' ? cmp : -cmp;
    });
  })();

  return (
    <div className="space-y-6">
      {/* Placement statistics (Phase 2, M4) */}
      <div className="bg-[#12172A] rounded-2xl shadow-sm border border-white/10 p-6">
        <h2 className="font-semibold text-slate-100 mb-1">Placement statistics</h2>
        <p className="text-xs text-slate-400 mb-4">How each graduating year is doing, and which companies are hiring the most.</p>
        {!stats ? (
          <EmptyState title="No statistics yet" message="Once students and selections exist, the year-wise numbers appear here." />
        ) : (
          <div className="space-y-5">
            <div>
              <span className="text-xs text-slate-400">Average package offered (all years)</span>
              <div className="font-display text-2xl font-bold text-slate-100 mt-0.5">
                {stats.overall_avg_package_lpa != null ? `₹${Number(stats.overall_avg_package_lpa).toFixed(2)} LPA` : 'No offers yet'}
              </div>
            </div>
            {(stats.by_year ?? []).length === 0 ? (
              <p className="text-sm text-slate-400">No students on record yet.</p>
            ) : (
              <div className="space-y-3">
                {(stats.by_year ?? []).map((y) => (
                  <div key={y.graduation_year}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-slate-100">Class of {y.graduation_year}</span>
                      <span className="text-slate-400">
                        {y.selected} of {y.total_students} placed ({y.placement_pct}%)
                        {y.avg_package_lpa != null ? ` · avg ₹${Number(y.avg_package_lpa).toFixed(2)} LPA` : ' · no offers yet'}
                      </span>
                    </div>
                    <div className="h-2.5 bg-[#151B30] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, y.placement_pct || 0)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div>
              <h3 className="text-sm font-bold text-slate-300 mb-2">Top recruiters</h3>
              {(stats.top_recruiters ?? []).length === 0 ? (
                <p className="text-sm text-slate-400">No students placed yet — the top recruiters will show up here once selections are made.</p>
              ) : (
                <ul className="divide-y divide-white/10">
                  {(stats.top_recruiters ?? []).map((r) => (
                    <li key={r.company} className="py-2 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-100">{r.company}</span>
                      <span className="text-slate-400">{r.placed} student{r.placed === 1 ? '' : 's'} placed · {r.drives} drive{r.drives === 1 ? '' : 's'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-[#12172A] rounded-2xl shadow-sm border border-white/10 p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-slate-100 mb-1">Placement progress — all drives</h2>
            <p className="text-xs text-slate-400 mb-4">Aggregated from the database with GROUP BY joins, per drive.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => downloadCsv('placement', null, 'placement-report.csv')} className="cf-btn-secondary">Download CSV</button>
            <button onClick={() => window.print()} className="cf-btn-secondary">Print</button>
          </div>
        </div>
        <p className="text-xs text-slate-400 mb-4">For one drive at a time — test scores, shortlist rate by branch and where students drop off — open that drive as its recruiter: each drive page has a “How this drive is doing” section.</p>
        {rows.length === 0 ? (
          <EmptyState title="No data yet" message="Once drives collect applications, the progress bars appear here." />
        ) : (
          <Funnel {...totals} />
        )}
      </div>

      <div className="bg-[#12172A] rounded-2xl shadow-sm border border-white/10">
        <div className="px-5 py-4 border-b border-white/10">
          <h2 className="font-semibold text-slate-100">Drive report</h2>
        </div>
        <DataTable
          emptyHint="No drives to report on yet."
          columns={[
            { key: 'drive', label: 'Drive', render: (r) => <span className="font-medium text-slate-100">{r.drive_title}</span> },
            { key: 'company', label: 'Company', render: (r) => r.company ?? '—' },
            { key: 'progress', label: 'Progress', render: (r) => <Funnel applied={r.applied ?? 0} shortlisted={r.shortlisted ?? 0} selected={r.selected ?? 0} /> },
            { key: 'avg', label: 'Avg CGPA (shortlisted)', render: (r) => (r.avg_cgpa_shortlisted != null ? Number(r.avg_cgpa_shortlisted).toFixed(2) : '—') },
            { key: 'list', label: 'List', render: (r) => (
              <div className="flex flex-col gap-1 items-start whitespace-nowrap">
                <button
                  onClick={() => viewRoster(r)}
                  className="text-xs font-bold text-[#FF5C38] hover:text-[#FF8A6B]"
                  title="See every applicant for this drive — session, result and status"
                >
                  {rosterDrive?.drive_id === r.drive_id ? 'Hide list' : 'View list'}
                </button>
                <button
                  onClick={() => downloadCsv('roster', r.drive_id, `drive-${r.drive_id}-roster.csv`)}
                  className="text-xs font-bold text-[#FF5C38] hover:text-[#FF8A6B]"
                  title="Download this drive's student list as a spreadsheet file"
                >
                  Download list (CSV)
                </button>
                <button
                  onClick={() => downloadPdf(r)}
                  className="text-xs font-bold text-[#FF5C38] hover:text-[#FF8A6B]"
                  title="Download this drive's result as a PDF file"
                >
                  Download result (PDF)
                </button>
              </div>
            )},
          ]}
          rows={rows}
        />
      </div>

      {rosterDrive && (
        <div className="bg-[#12172A] rounded-2xl shadow-sm border border-white/10">
          <div className="px-5 py-4 border-b border-white/10 flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-semibold text-slate-100">Result — {rosterDrive.drive_title}</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {rosterDrive.company ?? ''} · Everyone who applied, with their test result and interview slot.
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <button onClick={() => downloadPdf(rosterDrive)} className="cf-btn-primary">
                Download result (PDF)
              </button>
              <button onClick={closeRoster} className="text-xs font-semibold text-slate-400 hover:text-slate-200 px-2 py-2">Close ✕</button>
            </div>
          </div>

          {/* Summary tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-5 pt-4">
            {[
              ['Applied', rosterDrive.applied ?? 0],
              ['Shortlisted', rosterDrive.shortlisted ?? 0],
              ['Selected', rosterDrive.selected ?? 0],
              ['Avg CGPA (shortlisted)', rosterDrive.avg_cgpa_shortlisted != null ? Number(rosterDrive.avg_cgpa_shortlisted).toFixed(2) : '—'],
            ].map(([label, value]) => (
              <div key={label} className="bg-[#0B0E1A] rounded-xl px-4 py-3">
                <div className="text-xl font-bold text-slate-100">{value}</div>
                <div className="text-xs text-slate-400">{label}</div>
              </div>
            ))}
          </div>

          {/* Search + status filter */}
          <div className="px-5 pt-4 flex items-center gap-3 flex-wrap">
            <input
              value={rosterSearch}
              onChange={(e) => setRosterSearch(e.target.value)}
              placeholder="Search by name or roll no…"
              className="cf-input !w-64"
            />
            <div className="flex gap-1.5 flex-wrap">
              {['all', ...rosterStatuses].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setRosterStatus(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                    rosterStatus === s
                      ? 'bg-[#FF5C38] text-white border-[#FF5C38]'
                      : 'bg-[#12172A] text-slate-400 border-white/10 hover:border-[#FF5C38]/40'
                  }`}
                >
                  {s === 'all' ? 'All' : s.replace('_', ' ')}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-400 ml-auto">
              {visibleRoster.length} of {roster.length} shown
            </span>
          </div>

          {rosterLoading ? (
            <p className="text-sm text-slate-400 py-10 text-center">Loading list…</p>
          ) : visibleRoster.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">
              {roster.length === 0 ? 'No applicants for this drive yet.' : 'Nobody matches that search.'}
            </div>
          ) : (
            <div className="overflow-x-auto slim-scroll mt-2">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#12172A]">
                  <tr className="border-b border-white/10 text-left">
                    {[
                      ['name', 'Student'],
                      ['roll_no', 'Roll no'],
                      ['branch', 'Branch'],
                      ['cgpa', 'CGPA'],
                      ['status', 'Status'],
                      ['test_percentage', 'Test %'],
                      ['test_session', 'Test session'],
                      ['interview_slot', 'Interview'],
                    ].map(([key, label]) => (
                      <th key={key} className="px-5 py-3 text-xs text-slate-400 uppercase tracking-wide whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => toggleSort(key)}
                          className="flex items-center gap-1 font-semibold uppercase hover:text-[#FF5C38]"
                          title="Sort by this column"
                        >
                          {label}
                          <span className={rosterSort.key === key ? 'text-[#FF5C38]' : 'text-slate-300'}>
                            {rosterSort.key === key ? (rosterSort.dir === 'asc' ? '▲' : '▼') : '↕'}
                          </span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {visibleRoster.map((r, i) => (
                    <tr key={r.email ?? i} className="hover:bg-white/5 transition-colors">
                      <td className="px-5 py-3.5 align-middle"><span className="font-medium text-slate-100">{r.name}</span></td>
                      <td className="px-5 py-3.5 align-middle">{r.roll_no ?? '—'}</td>
                      <td className="px-5 py-3.5 align-middle">{r.branch ?? '—'}</td>
                      <td className="px-5 py-3.5 align-middle">{r.cgpa ?? '—'}</td>
                      <td className="px-5 py-3.5 align-middle">{(r.status ?? '—').replace('_', ' ')}</td>
                      <td className="px-5 py-3.5 align-middle">{r.test_percentage != null ? `${Number(r.test_percentage).toFixed(1)}%` : '—'}</td>
                      <td className="px-5 py-3.5 align-middle">{r.test_session ? `${r.test_session} · ${formatDate(r.test_at)}${r.test_venue ? ` · ${r.test_venue}` : ''}` : '—'}</td>
                      <td className="px-5 py-3.5 align-middle">{r.interview_slot ? `${r.interview_slot} · ${formatDate(r.interview_at)}${r.interview_venue ? ` · ${r.interview_venue}` : ''}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
