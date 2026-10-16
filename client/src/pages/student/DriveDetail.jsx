// M2 — Drive detail: criteria, my eligibility verdict with reasons, apply, slots with booking.

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { drives as drivesApi, slots as slotsApi, bookings as bookingsApi, errMsg } from '../../api.js';
import { formatDate, formatDay } from '../../utils.js';
import { useToast } from '../../components/Toast.jsx';
import Badge from '../../components/Badge.jsx';

export default function DriveDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [drive, setDrive] = useState(null);
  const [eligibility, setEligibility] = useState(null);
  const [myApp, setMyApp] = useState(null);
  const [slotList, setSlotList] = useState([]);
  const [applying, setApplying] = useState(false);
  const [bookingId, setBookingId] = useState(null);

  const load = async () => {
    try {
      const { data } = await drivesApi.get(id);
      setDrive(data.drive ?? data);
      setEligibility(data.eligibility ?? null);
      setMyApp(data.my_application ?? null);
      const { data: s } = await slotsApi.list(id);
      setSlotList(s ?? []);
    } catch (err) {
      toast(errMsg(err, 'Could not load this drive.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const apply = async () => {
    setApplying(true);
    try {
      const { data } = await drivesApi.apply(id);
      setMyApp(data.application ?? data);
      toast('Application submitted. Good luck!', 'success');
      load();
    } catch (err) {
      const reasons = err?.response?.data?.reasons;
      toast(reasons?.length ? `Not eligible: ${reasons.join('; ')}` : errMsg(err, 'Could not submit your application.'), 'error');
    } finally {
      setApplying(false);
    }
  };

  const book = async (slotId) => {
    setBookingId(slotId);
    try {
      await bookingsApi.create(slotId);
      toast('Seat booked — see you there!', 'success');
      load();
    } catch (err) {
      toast(errMsg(err, 'Could not book this slot.'), 'error');
    } finally {
      setBookingId(null);
    }
  };

  if (loading) return <div className="text-sm text-slate-500 py-10 text-center">Loading drive…</div>;
  if (!drive) return <div className="text-sm text-slate-500 py-10 text-center">Drive not found.</div>;

  const eligible = eligibility?.eligible;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-sm text-slate-500">{drive.company?.name}</div>
            <h2 className="text-xl font-bold text-slate-900">{drive.title}</h2>
            <p className="text-sm text-slate-600 mt-2 max-w-2xl">{drive.description}</p>
          </div>
          <Badge variant={drive.status === 'open' ? 'success' : 'neutral'}>{drive.status}</Badge>
        </div>
      </div>

      {/* Eligibility verdict */}
      <div className={`rounded-2xl shadow-sm border p-6 ${eligible === false ? 'bg-rose-50/60 border-rose-100' : eligible ? 'bg-emerald-50/60 border-emerald-100' : 'bg-white border-slate-100'}`}>
        <div className="flex items-center gap-3 mb-3">
          <h3 className="font-semibold text-slate-900">Your eligibility</h3>
          {myApp ? <Badge variant="info">Applied</Badge>
            : eligible === true ? <Badge variant="success">Eligible</Badge>
            : eligible === false ? <Badge variant="danger">Not eligible</Badge>
            : <Badge variant="neutral">Unknown</Badge>}
        </div>
        {eligibility?.reasons?.length > 0 ? (
          <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
            {eligibility.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        ) : eligible === true && (
          <p className="text-sm text-slate-600">You meet every criterion. Go ahead and apply.</p>
        )}
        {!myApp && eligible === true && (
          <button onClick={apply} disabled={applying}
            className="mt-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl px-5 py-2.5 transition-colors">
            {applying ? 'Submitting…' : 'Apply now'}
          </button>
        )}
      </div>

      {/* Criteria */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h3 className="font-semibold text-slate-900 mb-4">Eligibility criteria</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {[
            ['Minimum CGPA', drive.min_cgpa ?? '—'],
            ['Max backlogs', drive.max_backlogs ?? '—'],
            ['Graduation year', drive.graduation_year ?? '—'],
            ['Branches', (drive.allowed_branches ?? []).join(', ') || 'All'],
          ].map(([k, v]) => (
            <div key={k} className="bg-slate-50 rounded-xl px-4 py-3">
              <div className="text-xs text-slate-500 uppercase tracking-wide">{k}</div>
              <div className="font-semibold text-slate-900 mt-0.5">{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Slots */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h3 className="font-semibold text-slate-900 mb-4">Test & interview slots</h3>
        {slotList.length === 0 ? (
          <p className="text-sm text-slate-500">No slots published for this drive yet.</p>
        ) : (
          <ul className="space-y-3">
            {slotList.map((s) => {
              const pct = s.capacity ? Math.round(((s.capacity - (s.seats_left ?? 0)) / s.capacity) * 100) : 0;
              const full = (s.seats_left ?? 0) <= 0;
              return (
                <li key={s.id} className="border border-slate-100 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 flex items-center gap-2">
                      {s.title} <Badge variant={s.type === 'interview' ? 'info' : 'neutral'}>{s.type}</Badge>
                    </div>
                    <div className="text-sm text-slate-500 mt-0.5">{formatDate(s.starts_at)} → {formatDate(s.ends_at)}</div>
                    <div className="mt-2 w-56">
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${full ? 'bg-rose-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-xs text-slate-400 mt-1">{s.seats_left} of {s.capacity} seats left</div>
                    </div>
                  </div>
                  <button
                    onClick={() => book(s.id)} disabled={full || bookingId === s.id}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl px-4 py-2 transition-colors"
                  >
                    {full ? 'Full' : bookingId === s.id ? 'Booking…' : 'Book seat'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-slate-400 mt-4">Deadline to apply: {formatDay(drive.application_deadline)}</p>
      </div>
    </div>
  );
}
