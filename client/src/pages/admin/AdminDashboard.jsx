// Admin control center — the entire placement operation at a glance.
// Per-drive pipeline: stage, funnel counts, readiness, and the two system
// actions (schedule tests / publish results). Below: the master timetable
// of every test & interview session across all drives.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { admin as adminApi, drives as drivesApi, errMsg } from '../../api.js';
import { formatDate } from '../../utils.js';
import { useToast } from '../../components/Toast.jsx';
import Badge from '../../components/Badge.jsx';
import DataTable from '../../components/DataTable.jsx';
import EmptyState from '../../components/EmptyState.jsx';

const STAGE_META = {
  open: { label: 'Applications', variant: 'success' },
  testing: { label: 'Testing', variant: 'info' },
  interviews: { label: 'Interviews', variant: 'warning' },
  closed: { label: 'Closed', variant: 'neutral' },
  draft: { label: 'Draft', variant: 'neutral' },
};

const NEXT_ACTION_LABEL = {
  schedule_tests: '⚙️ Schedule tests',
  publish_results: '📊 Publish results',
};

export default function AdminDashboard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [drives, setDrives] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    try {
      const [{ data: o }, { data: s }] = await Promise.all([adminApi.overview(), adminApi.schedule()]);
      setDrives(o ?? []);
      setSchedule(s ?? []);
    } catch (err) {
      toast(errMsg(err, 'Could not load the control center.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const runAction = async (drive, action) => {
    setBusy(`${action}:${drive.id}`);
    try {
      if (action === 'schedule_tests') {
        const { data } = await drivesApi.scheduleTests(drive.id);
        toast(`Scheduled ${data.sessions} session${data.sessions !== 1 ? 's' : ''} for ${data.assigned} students.`, 'success');
      } else {
        const { data } = await drivesApi.publishResults(drive.id);
        toast(`Shortlisted ${data.shortlisted}, built ${data.interviews} interview slots.`, 'success');
      }
      load();
    } catch (err) {
      toast(errMsg(err, 'Action failed.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="text-sm text-slate-500 py-10 text-center">Loading control center…</div>;

  const totals = drives.reduce((m, d) => ({
    applied: m.applied + d.applied,
    tests_taken: m.tests_taken + d.tests_taken,
    shortlisted: m.shortlisted + d.shortlisted,
    interviews: m.interviews + d.interview_slots,
  }), { applied: 0, tests_taken: 0, shortlisted: 0, interviews: 0 });

  const upcomingSessions = schedule.filter((s) => new Date(s.starts_at).getTime() >= Date.now()).slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="cf-hero cf-rise">
        <div className="relative z-10">
          <h2 className="text-2xl font-bold">Control center</h2>
          <p className="text-indigo-100 text-sm mt-1">
            Every drive's pipeline, every test session, every interview — scheduled by the system, overseen by you.
          </p>
          <div className="flex gap-6 mt-4">
            {[
              [totals.applied, 'applications'],
              [totals.tests_taken, 'tests taken'],
              [totals.shortlisted, 'shortlisted'],
              [totals.interviews, 'interview slots'],
            ].map(([v, l]) => (
              <div key={l}>
                <div className="text-2xl font-black">{v}</div>
                <div className="text-xs text-indigo-200 font-medium">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Drive pipelines */}
      <div className="cf-card cf-rise !p-2">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <h3 className="cf-section-title">All drives</h3>
          <Link to="/admin/resources" className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">Manage resources →</Link>
        </div>
        {drives.length === 0 ? (
          <EmptyState title="No drives yet" message="Drives appear here once recruiters publish them." />
        ) : (
          <DataTable
            columns={[
              { key: 'drive', label: 'Drive', render: (d) => (
                <span className="font-semibold text-slate-900">{d.title}<span className="block text-xs font-normal text-slate-400">{d.company}</span></span>
              )},
              { key: 'stage', label: 'Stage', render: (d) => <Badge variant={STAGE_META[d.stage]?.variant ?? 'neutral'}>{STAGE_META[d.stage]?.label ?? d.stage}</Badge> },
              { key: 'progress', label: 'Progress', render: (d) => (
                <span className="text-[13px] text-slate-600 whitespace-nowrap">
                  <b className="text-slate-900">{d.applied}</b> applied → <b className="text-slate-900">{d.tests_taken}</b> tested → <b className="text-slate-900">{d.shortlisted}</b> shortlisted
                </span>
              )},
              { key: 'sessions', label: 'Scheduled', render: (d) => <span className="text-[13px]">{d.test_sessions} tests · {d.interview_slots} interviews</span> },
              {
                key: 'action', label: 'Next step', render: (d) => d.next_action ? (
                  <button
                    onClick={() => runAction(d, d.next_action)}
                    disabled={!!busy}
                    className="cf-btn-primary !py-1.5 !px-4 !text-xs whitespace-nowrap"
                  >
                    {busy === `${d.next_action}:${d.id}` ? 'Working…' : NEXT_ACTION_LABEL[d.next_action]}
                  </button>
                ) : <span className="text-xs text-slate-300">—</span>,
              },
            ]}
            rows={drives}
          />
        )}
        <p className="px-5 pb-4 text-xs text-slate-400">
          Readiness: “Schedule tests” needs applicants + test questions; “Publish results” needs submitted tests.
          Interview config (panels, cutoff, shortlist cap) comes from the recruiter's drive setup.
        </p>
      </div>

      {/* Master timetable */}
      <div className="cf-card cf-rise">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="cf-section-title">Full schedule</h3>
            <p className="cf-section-sub">Every upcoming test & interview session, across all drives.</p>
          </div>
          <Link to="/admin/resources" className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">Resources →</Link>
        </div>
        {upcomingSessions.length === 0 ? (
          <p className="text-sm text-slate-500">No sessions scheduled yet.</p>
        ) : (
          <ul className="space-y-2">
            {upcomingSessions.map((s) => (
              <li key={s.id} className="border border-slate-100 rounded-xl px-4 py-3 flex items-center gap-4 flex-wrap">
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${s.type === 'test' ? 'bg-indigo-100' : 'bg-emerald-100'}`}>
                  {s.type === 'test' ? '📝' : '🎤'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900 text-sm truncate">{s.title}</div>
                  <div className="text-xs text-slate-500">{s.drive_title} · {s.company_name}</div>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <div className="font-semibold text-slate-700">{formatDate(s.starts_at)}</div>
                  <div>{s.venue ?? 'TBA'} · {s.booked_count}/{s.capacity} seats</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
