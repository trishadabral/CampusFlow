// My Schedule — every test session and interview the system assigned to you.
// Nothing to book or cancel: the pipeline places you, and tells you where.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { bookings as bookingsApi, errMsg } from '../../api.js';
import { formatDate } from '../../utils.js';
import { useToast } from '../../components/Toast.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';

export default function MyBookings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  useEffect(() => {
    bookingsApi.mine()
      .then(({ data }) => {
        const now = Date.now();
        setItems((data ?? []).sort((a, b) => new Date(a.slot.starts_at) - new Date(b.slot.starts_at)));
      })
      .catch((err) => toast(errMsg(err, 'Could not load your schedule.'), 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="text-sm text-slate-500 py-10 text-center">Loading your schedule…</div>;

  const upcoming = items.filter((b) => new Date(b.slot.starts_at).getTime() >= Date.now());
  const past = items.filter((b) => new Date(b.slot.starts_at).getTime() < Date.now());

  const card = (b, i) => (
    <div key={b.id} className={`cf-card cf-rise cf-rise-${i % 3} !p-5 flex items-center gap-4`}>
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 ${b.slot.type === 'test' ? 'bg-indigo-100' : 'bg-emerald-100'}`}>
        {b.slot.type === 'test' ? '📝' : '🎤'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-slate-900 truncate">{b.slot.title}</div>
        <div className="text-sm text-slate-500">{formatDate(b.slot.starts_at)} → {formatDate(b.slot.ends_at)}</div>
      </div>
      <div className="text-right shrink-0">
        <Badge variant={b.slot.type === 'test' ? 'info' : 'success'}>{b.slot.type}</Badge>
        {b.slot.type === 'test' && new Date(b.slot.starts_at).getTime() >= Date.now() && (
          <Link to={`/student/tests/${b.slot.drive_id}`} className="block text-xs font-bold text-indigo-600 hover:text-indigo-800 mt-1.5">
            Take test →
          </Link>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="cf-section-title text-lg">Upcoming</h2>
        <p className="cf-section-sub">Sessions the system scheduled for you. Just show up.</p>
      </div>
      {upcoming.length === 0 ? (
        <div className="cf-card">
          <EmptyState
            title="Nothing scheduled yet"
            message="Apply to a drive and your test session will appear here automatically."
            action={<Link to="/student/drives" className="cf-btn-primary">Find drives</Link>}
          />
        </div>
      ) : (
        <div className="space-y-3">{upcoming.map(card)}</div>
      )}

      {past.length > 0 && (
        <>
          <h2 className="cf-section-title text-lg pt-2">Past</h2>
          <div className="space-y-3 opacity-75">{past.map(card)}</div>
        </>
      )}
    </div>
  );
}
