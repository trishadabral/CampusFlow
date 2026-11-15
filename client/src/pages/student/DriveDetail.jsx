// Student drive detail — criteria, eligibility verdict, apply, and (once
// applied) your live pipeline: test session venue, result, interview slot.

import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { drives as drivesApi, slots as slotsApi, bookings as bookingsApi, offers as offersApi, errMsg } from '../../api.js';
import { formatDate } from '../../utils.js';
import { useToast } from '../../components/Toast.jsx';
import Badge from '../../components/Badge.jsx';
import Stepper from '../../components/Stepper.jsx';

export default function DriveDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [slots, setSlots] = useState([]);
  const [applying, setApplying] = useState(false);
  const [bookingSlot, setBookingSlot] = useState(null);
  const [responding, setResponding] = useState(false);

  const load = async () => {
    try {
      const { data: d } = await drivesApi.get(id);
      setData(d);
    } catch (err) {
      toast(errMsg(err, 'Could not load this drive.'), 'error');
    } finally {
      setLoading(false);
    }
    try {
      const { data: s } = await slotsApi.list(id);
      setSlots(s ?? []);
    } catch {
      /* sessions are a bonus list — the drive still loads without them */
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const apply = async () => {
    setApplying(true);
    try {
      await drivesApi.apply(id);
      toast('Applied! Track it under My Applications.', 'success');
      load();
    } catch (err) {
      toast(errMsg(err, 'Could not apply.'), 'error');
    } finally {
      setApplying(false);
    }
  };

  const respondOffer = async (decision) => {
    if (!my_offer) return;
    setResponding(true);
    try {
      await offersApi.respond(my_offer.id, decision);
      toast(decision === 'accepted' ? 'Offer accepted — congratulations! 🎉' : 'Offer declined. The recruiter has been told.', 'success');
      load();
    } catch (err) {
      toast(errMsg(err, 'Could not send your answer.'), 'error');
    } finally {
      setResponding(false);
    }
  };

  const bookSeat = async (slot) => {
    setBookingSlot(slot.id);
    try {
      const { data: res } = await bookingsApi.create(slot.id);
      toast(
        res.waitlisted
          ? res.message || `You're #${res.position} on the waiting list.`
          : `Seat booked for ${slot.title}. See you there!`,
        'success'
      );
      load();
    } catch (err) {
      toast(errMsg(err, 'Could not book a seat.'), 'error');
    } finally {
      setBookingSlot(null);
    }
  };

  if (loading) return <div className="text-sm text-slate-500 py-10 text-center">Loading drive…</div>;
  if (!data?.drive) return <div className="text-sm text-slate-500 py-10 text-center">Drive not found.</div>;

  const { drive, eligibility, my_application, my_result, my_sessions = [], my_offer, questions_count } = data;
  const myBookingBySlot = new Map((my_sessions ?? []).map((s) => [s.slot_id, s]));
  const testSession = my_sessions.find((s) => s.type === 'test' && s.status === 'confirmed');
  const interview = my_sessions.find((s) => s.type === 'interview' && s.status === 'confirmed');
  const waitlisted = my_sessions.filter((s) => s.status === 'waitlist');

  const steps = [
    { key: 'applied', label: 'Applied', state: my_application ? 'done' : 'current' },
    { key: 'test', label: 'Test', state: testSession ? (my_result ? 'done' : 'current') : 'todo' },
    { key: 'result', label: 'Result', state: my_result ? 'done' : 'todo' },
    { key: 'interview', label: 'Interview', state: interview ? 'current' : 'todo' },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="cf-card cf-rise">
        <div className="text-sm text-slate-500">{drive.company?.name}</div>
        <h2 className="text-2xl font-bold text-slate-900">{drive.title}</h2>
        {drive.description && <p className="text-sm text-slate-500 mt-2">{drive.description}</p>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 text-sm">
          {[
            ['Minimum CGPA', drive.min_cgpa], ['Branches', (drive.allowed_branches ?? []).join(', ')],
            ['Max backlogs', drive.max_backlogs], ['Apply by', formatDate(drive.application_deadline).split(',')[0]],
          ].map(([k, v]) => (
            <div key={k} className="bg-slate-50 rounded-xl px-4 py-3">
              <div className="text-[11px] text-slate-500 uppercase tracking-wide font-semibold">{k}</div>
              <div className="font-bold text-slate-900 mt-0.5">{v}</div>
            </div>
          ))}
        </div>
      </div>

      {!my_application ? (
        <div className="cf-card cf-rise">
          {eligibility?.eligible ? (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="font-bold text-emerald-700">✓ You're eligible for this drive</div>
                <p className="text-sm text-slate-500 mt-0.5">One click applies you. Test: {questions_count ?? 0} questions, {drive.test_duration_min} min.</p>
              </div>
              <button onClick={apply} disabled={applying} className="cf-btn-primary">
                {applying ? 'Applying…' : 'Apply in 1 click'}
              </button>
            </div>
          ) : (
            <div>
              <div className="font-bold text-rose-700">You're not eligible for this drive</div>
              <ul className="text-sm text-slate-500 mt-2 list-disc pl-5 space-y-0.5">
                {(eligibility?.reasons ?? []).map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
          {/* Why am I eligible? — one plain-words line per rule. */}
          {eligibility?.checks?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">How you match up</div>
              <ul className="space-y-1.5">
                {eligibility.checks.map((c) => (
                  <li key={c.key} className="flex items-start gap-2 text-sm">
                    <span className={c.passed ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'} aria-hidden>
                      {c.passed ? '✓' : '✗'}
                    </span>
                    <span className="text-slate-600">{c.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <>
        <div className="cf-card cf-rise space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="cf-section-title">Your progress</h3>
            <Badge variant="info">{(my_application.status ?? 'applied').replace('_', ' ')}</Badge>
          </div>
          <Stepper steps={steps} />

          {testSession && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
              <div className="font-bold text-indigo-900 text-sm">📍 Your test</div>
              <div className="text-sm text-indigo-800 mt-1">
                {testSession.title} · {formatDate(testSession.starts_at)}
              </div>
              {!my_result && (
                <Link to={`/student/tests/${drive.id}`} className="cf-btn-primary !py-2 mt-3">✍️ Take the test now</Link>
              )}
            </div>
          )}

          {my_result && (
            <div className={`rounded-2xl p-4 border ${Number(my_result.percentage) >= Number(drive.min_test_score) ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="font-bold text-sm text-slate-900">📊 Your result: {Number(my_result.percentage).toFixed(1)}%</div>
              <div className="text-sm text-slate-500 mt-0.5">
                {Number(my_result.score)}/{Number(my_result.total)} marks · cutoff {drive.min_test_score}%
              </div>
            </div>
          )}

          {interview && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
              <div className="font-bold text-emerald-900 text-sm">🎤 Your interview is scheduled</div>
              <div className="text-sm text-emerald-800 mt-1">
                {interview.title}{interview.venue ? ` · ${interview.venue}` : ''} · {formatDate(interview.starts_at)}
              </div>
            </div>
          )}

          {waitlisted.map((s) => (
            <div key={s.id} className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <div className="font-bold text-amber-900 text-sm">⏳ You&apos;re #{s.waitlist_position} on the waiting list</div>
              <div className="text-sm text-amber-800 mt-1">
                {s.title}{s.venue ? ` · ${s.venue}` : ''} · {formatDate(s.starts_at)}
              </div>
              <p className="text-xs text-amber-700 mt-1">We&apos;ll notify you here if a seat opens up.</p>
            </div>
          ))}

          {my_offer && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
              <div className="font-bold text-emerald-900 text-sm">🎉 You have an offer from {drive.company?.name}</div>
              <div className="text-sm text-emerald-800 mt-1">
                {my_offer.package_lpa != null ? `₹${my_offer.package_lpa} LPA` : 'Package to be confirmed'}
                {my_offer.joining_date ? ` · Joining ${formatDate(my_offer.joining_date).split(',')[0]}` : ''}
              </div>
              {my_offer.status === 'pending' ? (
                <div className="flex gap-2 mt-3 flex-wrap">
                  <button onClick={() => respondOffer('accepted')} disabled={responding} className="cf-btn-success !py-2">
                    {responding ? 'Sending…' : 'Accept offer'}
                  </button>
                  <button
                    onClick={() => respondOffer('declined')} disabled={responding}
                    className="text-sm font-semibold text-rose-700 hover:text-rose-900 border border-rose-200 hover:border-rose-300 rounded-xl px-4 py-2 bg-white"
                  >
                    Decline
                  </button>
                </div>
              ) : (
                <div className="text-sm font-semibold text-emerald-900 mt-2">
                  You {my_offer.status === 'accepted' ? 'accepted' : 'declined'} this offer
                  {my_offer.responded_at ? ` on ${formatDate(my_offer.responded_at).split(',')[0]}` : ''}.
                </div>
              )}
            </div>
          )}

          {!testSession && !waitlisted.some((s) => s.type === 'test') && (
            <p className="text-sm text-slate-500 bg-slate-50 rounded-xl px-4 py-3">
              🕐 Your test session will be scheduled automatically and appear here — plus a notification.
            </p>
          )}
        </div>

        {slots.length > 0 && (
          <div className="cf-card cf-rise space-y-3">
            <h3 className="cf-section-title">Sessions — book a seat</h3>
            <p className="text-sm text-slate-500">Pick a session below to reserve your seat. If it&apos;s full, you&apos;ll join the waiting list instead.</p>
            <div className="space-y-2">
              {slots.map((slot) => {
                const mine = myBookingBySlot.get(slot.id);
                return (
                  <div key={slot.id} className="flex items-center justify-between gap-3 border border-slate-100 rounded-xl px-4 py-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">
                        {slot.title}
                        <span className="ml-2 text-xs font-medium text-slate-400">{slot.type === 'test' ? 'Test' : 'Interview'}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {formatDate(slot.starts_at)}{slot.venue ? ` · ${slot.venue}` : ''}
                        {` · ${slot.seats_left > 0 ? `${slot.seats_left} seat${slot.seats_left === 1 ? '' : 's'} left` : 'Full'}`}
                      </div>
                    </div>
                    {mine?.status === 'confirmed' ? (
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">✓ You&apos;re booked in</span>
                    ) : mine?.status === 'waitlist' ? (
                      <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">Waiting list #{mine.waitlist_position}</span>
                    ) : (
                      <button
                        onClick={() => bookSeat(slot)}
                        disabled={bookingSlot != null}
                        className="cf-btn-primary !py-2"
                      >
                        {bookingSlot === slot.id ? 'Booking…' : 'Book a seat'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </>
      )}
    </div>
  );
}
