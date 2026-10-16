// Recruiter dashboard — every drive as a pipeline card with its next action.
// The whole job, in order: create → questions → schedule tests → publish.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { drives as drivesApi, errMsg } from '../../api.js';
import { formatDate } from '../../utils.js';
import { useToast } from '../../components/Toast.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';

const STAGE_META = {
  open: { label: 'Accepting applications', variant: 'success', hint: 'Share the word — students are applying.' },
  testing: { label: 'Test scheduled', variant: 'info', hint: 'Students are taking the test.' },
  interviews: { label: 'Interviews scheduled', variant: 'warning', hint: 'Panels are meeting candidates.' },
  closed: { label: 'Closed', variant: 'neutral', hint: 'This drive is finished.' },
  draft: { label: 'Draft', variant: 'neutral', hint: 'Not published yet.' },
};

function DriveCard({ drive, index }) {
  const meta = STAGE_META[drive.status] ?? STAGE_META.open;
  return (
    <Link
      to={`/recruiter/drives/${drive.id}`}
      className={`cf-card cf-card-hover cf-rise cf-rise-${index % 3} block`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-slate-500 font-medium">{drive.company?.name}</div>
          <h3 className="font-bold text-slate-900 text-lg leading-snug truncate">{drive.title}</h3>
        </div>
        <Badge variant={meta.variant}>{meta.label}</Badge>
      </div>
      <p className="text-[13px] text-slate-500 mt-1">{meta.hint}</p>
      <div className="flex items-center gap-5 mt-4 text-sm">
        <div><span className="font-bold text-slate-900">{drive.counts?.applied ?? 0}</span> <span className="text-slate-500 text-xs">applied</span></div>
        <div><span className="font-bold text-slate-900">{drive.counts?.shortlisted ?? 0}</span> <span className="text-slate-500 text-xs">shortlisted</span></div>
        <div className="ml-auto text-xs text-slate-400">Apply by {formatDate(drive.application_deadline).split(',')[0]}</div>
      </div>
      <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
        <span className="text-xs text-slate-400">CGPA ≥ {drive.min_cgpa} · {(drive.allowed_branches ?? []).join(', ')}</span>
        <span className="text-sm font-semibold text-indigo-600">Manage →</span>
      </div>
    </Link>
  );
}

export default function RecruiterDashboard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [drives, setDrives] = useState([]);

  useEffect(() => {
    drivesApi.list()
      .then(({ data }) => setDrives(data ?? []))
      .catch((err) => toast(errMsg(err, 'Could not load your drives.'), 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="text-sm text-slate-500 py-10 text-center">Loading…</div>;

  const active = drives.filter((d) => d.status !== 'closed');

  return (
    <div className="space-y-6">
      <div className="cf-hero cf-rise">
        <div className="relative z-10 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold">Hiring dashboard</h2>
            <p className="text-indigo-100 text-sm mt-1 max-w-lg">
              Create a drive, add test questions, set three interview numbers — the system
              schedules every test and interview for you.
            </p>
          </div>
          <Link to="/recruiter/drives/new" className="bg-white text-indigo-700 font-bold text-sm rounded-xl px-5 py-3 shadow-lg hover:-translate-y-px transition-transform">
            Add Drive
          </Link>
        </div>
      </div>

      {drives.length === 0 ? (
        <div className="cf-card">
          <EmptyState
            title="No drives yet"
            message="Your first drive takes about two minutes: details, test questions, interview setup — then publish."
            action={<Link to="/recruiter/drives/new" className="cf-btn-primary">Add your first drive</Link>}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {active.map((d, i) => <DriveCard key={d.id} drive={d} index={i} />)}
          </div>
          {drives.length > active.length && (
            <div className="cf-card">
              <h3 className="cf-section-title mb-3">Closed drives</h3>
              <div className="space-y-2">
                {drives.filter((d) => d.status === 'closed').map((d) => (
                  <Link key={d.id} to={`/recruiter/drives/${d.id}`} className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all">
                    <span className="font-medium text-slate-700">{d.title} <span className="text-slate-400 text-sm">· {d.company?.name}</span></span>
                    <Badge variant="neutral">closed</Badge>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
