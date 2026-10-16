// M2 — Drives list: open placement drives with per-student eligibility badges.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { drives as drivesApi, errMsg } from '../../api.js';
import { formatDay } from '../../utils.js';
import { useToast } from '../../components/Toast.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';

export default function Drives() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [drives, setDrives] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await drivesApi.list({ status: 'open' });
        // Enrich each drive with the student's eligibility verdict + application state.
        const enriched = await Promise.all(
          (data ?? []).map(async (d) => {
            try {
              const { data: det } = await drivesApi.get(d.id);
              return { ...d, eligibility: det.eligibility, my_application: det.my_application };
            } catch {
              return d;
            }
          })
        );
        setDrives(enriched);
      } catch (err) {
        toast(errMsg(err, 'Could not load drives.'), 'error');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="text-sm text-slate-500 py-10 text-center">Loading drives…</div>;

  if (!drives.length) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <EmptyState title="No open drives right now" message="Check back soon — new placement drives appear here as recruiters publish them." />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {drives.map((d) => {
        const applied = !!d.my_application;
        const eligible = d.eligibility?.eligible;
        return (
          <Link
            key={d.id}
            to={`/student/drives/${d.id}`}
            className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 hover:shadow-md hover:border-indigo-200 transition-all"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <div className="font-semibold text-slate-900">{d.title}</div>
                <div className="text-sm text-slate-500">{d.company?.name}</div>
              </div>
              {applied ? (
                <Badge variant="info">Applied</Badge>
              ) : eligible === true ? (
                <Badge variant="success">Eligible</Badge>
              ) : eligible === false ? (
                <Badge variant="danger">Not eligible</Badge>
              ) : (
                <Badge variant="neutral">Check eligibility</Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-500 mt-3">
              <span className="bg-slate-50 rounded-lg px-2.5 py-1">CGPA ≥ {d.min_cgpa ?? '—'}</span>
              <span className="bg-slate-50 rounded-lg px-2.5 py-1">Backlogs ≤ {d.max_backlogs ?? '—'}</span>
              {d.graduation_year && <span className="bg-slate-50 rounded-lg px-2.5 py-1">Class of {d.graduation_year}</span>}
            </div>
            <div className="flex items-center justify-between mt-4 text-xs text-slate-400">
              <span>Deadline {formatDay(d.application_deadline)}</span>
              <span>{d.counts?.applied ?? 0} applied</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
