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

  const load = () => {
    bookingsApi.mine()
      .then(({ data }) => {
        setItems((data ?? []).sort((a, b) => new Date(a.slot.starts_at) - new Date(b.slot.starts_at)));
      })
      .catch((err) => toast(errMsg(err, 'Could not load your schedule.'), 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelBooking = async (b, leavingLine) => {
    try {
      const { data } = await bookingsApi.cancel(b.id);
      setItems((prev) => prev.filter((x) => x.id !== b.id));
      toast(
        leavingLine
          ? "You've left the waiting list."
          : data?.promoted
            ? 'Booking cancelled. The next student on the waiting list has been booked in.'
            : 'Booking cancelled.',
        'success'
      );
    } catch (err) {
      toast(errMsg(err, 'Could not cancel this booking.'), 'error');
    }
  };

  if (loading) return <div className="text-sm text-slate-400 py-10 text-center">Loading your schedule…</div>;

  const waiting = items.filter((b) => b.status === 'waitlist');
  const upcoming = items.filter((b) => b.status === 'confirmed' && new Date(b.slot.starts_at).getTime() >= Date.now());
  const past = items.filter((b) => b.status !== 'waitlist' && new Date(b.slot.starts_at).getTime() < Date.now());

  const card = (b, i) => (
    <div key={b.id} className={`cf-card cf-rise cf-rise-${i % 3} !p-5 flex items-center gap-4`}>
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 ${b.slot.type === 'test' ? 'bg-[#FF5C38]/15' : 'bg-emerald-500/15'}`}>
        {b.slot.type === 'test' ? '📝' : '🎤'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-slate-100 truncate">{b.slot.title}</div>
        <div className="text-sm text-slate-400">{formatDate(b.slot.starts_at)} → {formatDate(b.slot.ends_at)}</div>
        {b.status === 'waitlist' && (
          <div className="text-sm text-amber-300 mt-1">
            You're #{b.waitlist_position ?? '—'} in line for this session — we'll let you know if a seat opens up.
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        <Badge variant={b.status === 'waitlist' ? 'warning' : b.slot.type === 'test' ? 'info' : 'success'}>
          {b.status === 'waitlist' ? 'Waiting list' : b.slot.type}
        </Badge>
        {b.status === 'waitlist' ? (
          <button onClick={() => cancelBooking(b, true)} className="block text-xs font-bold text-rose-400 hover:text-rose-300 mt-1.5">
            Leave the line
          </button>
        ) : (
          <>
            {b.slot.type === 'test' && new Date(b.slot.starts_at).getTime() >= Date.now() && (
              <Link to={`/student/tests/${b.slot.drive_id}`} className="block text-xs font-bold text-[#FF5C38] hover:text-[#FF8A6B] mt-1.5">
                Take test →
              </Link>
            )}
            {new Date(b.slot.starts_at).getTime() >= Date.now() && (
              <button onClick={() => cancelBooking(b, false)} className="block text-xs font-bold text-rose-400 hover:text-rose-300 mt-1.5">
                Cancel booking
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      {waiting.length > 0 && (
        <div>
          <h2 className="cf-section-title text-lg">Waiting list</h2>
          <p className="cf-section-sub">Sessions that were full when you joined. If a seat opens up, you're booked in automatically.</p>
          <div className="space-y-3 mt-3">{waiting.map(card)}</div>
        </div>
      )}
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
