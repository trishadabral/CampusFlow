// M2 — Student dashboard: eligible drives, my applications, my bookings + upcoming list.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { drives as drivesApi, bookings as bookingsApi, errMsg } from '../../api.js';
import { formatDate } from '../../utils.js';
import { useToast } from '../../components/Toast.jsx';
import StatCard from '../../components/StatCard.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';

const ICON = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

export default function StudentDashboard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [eligibleCount, setEligibleCount] = useState(0);
  const [appliedCount, setAppliedCount] = useState(0);
  const [upcoming, setUpcoming] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        // Eligibility verdicts come from the drive detail endpoint (per contract:
        // { drive, criteria, counts } + eligibility info for the signed-in student).
        const { data: open } = await drivesApi.list({ status: 'open' });
        const details = await Promise.all(open.map((d) => drivesApi.get(d.id).then((r) => r.data).catch(() => null)));
        let eligible = 0, applied = 0;
        for (const det of details) {
          if (!det) continue;
          if (det.my_application) applied += 1;
          else if (det.eligibility?.eligible) eligible += 1;
        }
        setEligibleCount(eligible);
        setAppliedCount(applied);

        const { data: mine } = await bookingsApi.mine();
        const now = Date.now();
        setUpcoming(
          (mine ?? [])
            .filter((b) => b.slot?.starts_at && new Date(b.slot.starts_at).getTime() >= now)
            .sort((a, b) => new Date(a.slot.starts_at) - new Date(b.slot.starts_at))
        );
      } catch (err) {
        toast(errMsg(err, 'Could not load your dashboard.'), 'error');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="text-sm text-slate-500 py-10 text-center">Loading your dashboard…</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Eligible drives" value={eligibleCount} accent="emerald" icon={ICON} />
        <StatCard label="My applications" value={appliedCount} accent="indigo" icon={ICON} />
        <StatCard label="Upcoming bookings" value={upcoming.length} accent="amber" icon={ICON} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Upcoming bookings</h2>
          <Link to="/student/bookings" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">View all</Link>
        </div>
        {upcoming.length === 0 ? (
          <EmptyState
            title="No bookings yet"
            message="Browse open drives and grab a test or interview slot before they fill up."
            action={<Link to="/student/drives" className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl px-4 py-2 inline-block">Browse drives</Link>}
          />
        ) : (
          <ul className="divide-y divide-slate-50">
            {upcoming.slice(0, 5).map((b) => (
              <li key={b.id} className="px-5 py-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 truncate">{b.slot?.title ?? 'Slot'}</div>
                  <div className="text-sm text-slate-500">{formatDate(b.slot?.starts_at)} → {formatDate(b.slot?.ends_at)}</div>
                </div>
                <Badge variant="info">{b.slot?.type ?? 'slot'}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
