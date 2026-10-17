// Student drives — every open drive, with your eligibility checked on each one.
// A drive you just published always shows up here; eligibility never hides it.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { drives as drivesApi, errMsg } from '../../api.js';
import { formatDate } from '../../utils.js';
import { useToast } from '../../components/Toast.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';

function DriveCard({ detail, index, onApplied }) {
  const { drive, eligibility, my_application, questions_count } = detail;
  const [applying, setApplying] = useState(false);
  const { toast } = useToast();
  const eligible = eligibility?.eligible ?? false;

  const apply = async () => {
    setApplying(true);
    try {
      await drivesApi.apply(drive.id);
      toast('Applied! Track it under My Applications.', 'success');
      onApplied(drive.id);
    } catch (err) {
      toast(errMsg(err, 'Could not apply.'), 'error');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className={`cf-card cf-card-hover cf-rise cf-rise-${index % 3}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-slate-500 font-medium">{drive.company?.name}</div>
          <Link to={`/student/drives/${drive.id}`} className="text-lg font-bold text-slate-900 hover:text-indigo-700 leading-snug">
            {drive.title}
          </Link>
        </div>
        {my_application
          ? <Badge variant="info">Applied ✓</Badge>
          : eligible
            ? <Badge variant="success">You're eligible</Badge>
            : <Badge variant="neutral">Not eligible</Badge>}
      </div>
      {drive.description && <p className="text-sm text-slate-500 mt-2 line-clamp-2">{drive.description}</p>}
      <div className="flex flex-wrap gap-2 mt-3">
        <span className="cf-chip bg-slate-100 text-slate-600">CGPA ≥ {drive.min_cgpa}</span>
        <span className="cf-chip bg-slate-100 text-slate-600">{(drive.allowed_branches ?? []).join(', ')}</span>
        <span className="cf-chip bg-slate-100 text-slate-600">{questions_count ?? 0} test questions</span>
      </div>
      {!my_application && !eligible && (eligibility?.reasons?.length > 0) && (
        <p className="text-xs text-slate-400 mt-2">Why not: {eligibility.reasons[0]}</p>
      )}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
        <span className="text-xs text-slate-400">Apply by {formatDate(drive.application_deadline)}</span>
        {my_application ? (
          <Link to={`/student/drives/${drive.id}`} className="cf-btn-secondary !py-2">Track →</Link>
        ) : eligible ? (
          <button onClick={apply} disabled={applying} className="cf-btn-primary !py-2">
            {applying ? 'Applying…' : 'Apply in 1 click'}
          </button>
        ) : (
          <Link to={`/student/drives/${drive.id}`} className="cf-btn-secondary !py-2">See why →</Link>
        )}
      </div>
    </div>
  );
}

export default function Drives() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  const load = async () => {
    try {
      const { data: open } = await drivesApi.list({ status: 'open' });
      // Every open drive shows up — eligibility is a badge, never a filter.
      const details = await Promise.all(open.map((d) => drivesApi.get(d.id).then((r) => r.data).catch(() => null)));
      setItems(details.filter((d) => d && d.drive));
    } catch (err) {
      toast(errMsg(err, 'Could not load drives.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const markApplied = (driveId) => {
    setItems((list) => list.map((d) => d.drive.id === driveId ? { ...d, my_application: { status: 'applied' } } : d));
  };

  if (loading) return <div className="text-sm text-slate-500 py-10 text-center">Finding drives for you…</div>;

  return (
    <div className="space-y-6">
      <div className="cf-hero cf-rise">
        <div className="relative z-10">
          <h2 className="text-2xl font-bold">Open placement drives</h2>
          <p className="text-indigo-100 text-sm mt-1">
            {items.length === 0
              ? 'Nothing open right now — check back soon.'
              : `${items.length} drive${items.length !== 1 ? 's' : ''} open. Your eligibility is checked on each one.`}
          </p>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="cf-card">
          <EmptyState title="No open drives" message="When a recruiter publishes a drive, it appears here right away." />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((d, i) => <DriveCard key={d.drive.id} detail={d} index={i} onApplied={markApplied} />)}
        </div>
      )}
    </div>
  );
}
