// Student dashboard — "My journey": every application as a visual pipeline.
// Applied → Test session → Result → Interview. The student always knows
// exactly where they stand and what happens next. Nothing to book, ever.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { student as studentApi, drives as drivesApi, offers as offersApi, errMsg } from '../../api.js';
import { formatDate } from '../../utils.js';
import { useToast } from '../../components/Toast.jsx';
import Badge from '../../components/Badge.jsx';
import Stepper from '../../components/Stepper.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { useAuth } from '../../auth.jsx';

const STATUS_META = {
  applied: { label: 'Applied', variant: 'info' },
  test_taken: { label: 'Test taken', variant: 'warning' },
  shortlisted: { label: 'Shortlisted 🎉', variant: 'success' },
  rejected: { label: 'Not shortlisted', variant: 'danger' },
  selected: { label: 'Selected 🎉', variant: 'success' },
};

function JourneyCard({ item, index, responding, onRespond }) {
  const meta = STATUS_META[item.application.status] ?? STATUS_META.applied;
  const canTakeTest = item.testSession && !item.result;
  return (
    <div className={`cf-card cf-rise cf-rise-${index % 3}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <div className="text-xs text-slate-400 font-medium">{item.drive.company}</div>
          <Link to={`/student/drives/${item.drive.id}`} className="text-lg font-bold text-slate-100 hover:text-[#FF5C38]">
            {item.drive.title}
          </Link>
        </div>
        <Badge variant={meta.variant}>{meta.label}</Badge>
      </div>

      <Stepper vertical steps={item.steps} />

      <div className="flex gap-2 flex-wrap pt-1">
        {canTakeTest && (
          <Link to={`/student/tests/${item.drive.id}`} className="cf-btn-primary">
            ✍️ Take the test now
          </Link>
        )}
        {item.testSession && (
          <div className="cf-chip bg-[#FF5C38]/10 text-[#FF5C38]">
            📍 {item.testSession.title} · {formatDate(item.testSession.starts_at)}
          </div>
        )}
        {item.interview && (
          <div className="cf-chip bg-emerald-500/10 text-emerald-300">
            🎤 Interview · Panel {item.interview.panel}{item.interview.venue ? ` · ${item.interview.venue}` : ''} · {formatDate(item.interview.starts_at)}
          </div>
        )}
      </div>

      {item.offer && (
        <div className={`rounded-2xl p-4 border mt-3 ${item.offer.status === 'accepted' ? 'bg-emerald-500/10 border-emerald-500/30' : item.offer.status === 'declined' ? 'bg-[#0B0E1A] border-white/10' : 'bg-amber-500/10 border-amber-500/30'}`}>
          <div className="font-bold text-sm text-slate-100">
            {item.offer.status === 'pending' ? '🎉 You have an offer!' : item.offer.status === 'accepted' ? '🎉 Offer accepted' : 'Offer declined'}
          </div>
          <div className="text-sm text-slate-400 mt-0.5">
            {item.offer.package_lpa != null ? `₹${item.offer.package_lpa} LPA` : 'Package to be confirmed'}
            {item.offer.joining_date ? ` · Joining ${formatDate(item.offer.joining_date).split(',')[0]}` : ''}
          </div>
          {item.offer.status === 'pending' ? (
            <div className="flex gap-2 mt-3 flex-wrap">
              <button onClick={() => onRespond(item.offer.id, 'accepted')} disabled={responding} className="cf-btn-success !py-2">
                {responding ? 'Sending…' : 'Accept offer'}
              </button>
              <button
                onClick={() => onRespond(item.offer.id, 'declined')} disabled={responding}
                className="text-sm font-semibold text-rose-300 hover:text-rose-300 border border-rose-500/30 hover:border-rose-500/40 rounded-xl px-4 py-2 bg-[#12172A]"
              >
                Decline
              </button>
            </div>
          ) : (
            <div className="text-sm font-semibold text-slate-300 mt-2">
              You {item.offer.status === 'accepted' ? 'accepted' : 'declined'} this offer
              {item.offer.responded_at ? ` on ${formatDate(item.offer.responded_at).split(',')[0]}` : ''}.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// One "what happens next for you" card, built from the journey: the single
// most pressing next step first, then anything else coming up.
function nextActions(journey) {
  const items = [];
  for (const item of journey) {
    if (item.application.status === 'rejected') continue;
    const interviewStep = (item.steps ?? []).find((s) => s.key === 'interview');
    if (item.offer?.status === 'pending') {
      items.push({
        priority: 1,
        text: `Your offer from ${item.drive.company} is waiting — accept or decline it.`,
        link: `/student/drives/${item.drive.id}`, linkLabel: 'View your offer',
      });
    } else if (item.offer?.status === 'accepted') {
      items.push({
        priority: 6,
        text: `You accepted the offer from ${item.drive.company}${item.offer.joining_date ? ` — joining ${formatDate(item.offer.joining_date).split(',')[0]}` : ''}.`,
        link: `/student/drives/${item.drive.id}`, linkLabel: 'View your offer',
      });
    } else if (item.interview) {
      items.push({
        priority: 2,
        text: `Your interview with ${item.drive.company} is on ${formatDate(item.interview.starts_at)}${item.interview.venue ? ` at ${item.interview.venue}` : ''}.`,
        link: `/student/drives/${item.drive.id}`, linkLabel: 'See details',
      });
    } else if (item.testSession && !item.result) {
      items.push({
        priority: 3,
        text: `Take your test for ${item.drive.company} — ${item.testSession.title} on ${formatDate(item.testSession.starts_at)}.`,
        link: `/student/tests/${item.drive.id}`, linkLabel: 'Take the test now',
      });
    } else if (item.result && (item.application.status === 'shortlisted' || item.application.status === 'selected')) {
      items.push({
        priority: 4,
        text: interviewStep?.detail
          ? `${item.drive.company}: ${interviewStep.detail}`
          : `You were shortlisted by ${item.drive.company} — your interview time will appear here once it is scheduled.`,
        link: `/student/drives/${item.drive.id}`, linkLabel: 'See the drive',
      });
    } else if (item.testSession && item.result) {
      items.push({
        priority: 4,
        text: `You took the test for ${item.drive.company} — your result will appear here once it is published.`,
        link: `/student/drives/${item.drive.id}`, linkLabel: 'See the drive',
      });
    } else if (!item.testSession) {
      items.push({
        priority: 5,
        text: `Your test for ${item.drive.company} will be scheduled once applications close — check back here.`,
        link: `/student/drives/${item.drive.id}`, linkLabel: 'See the drive',
      });
    }
  }
  return items.sort((a, b) => a.priority - b.priority);
}

function NextActionCard({ journey }) {
  const actions = nextActions(journey);
  if (!actions.length) return null;
  const [top, ...rest] = actions;
  return (
    <div className="cf-card cf-rise !border-[#FF5C38]/30 bg-[#FF5C38]/10">
      <h3 className="cf-section-title">What happens next for you</h3>
      <p className="text-sm text-slate-300 mt-2">{top.text}</p>
      <Link to={top.link} className="cf-btn-primary !py-2 mt-3 inline-block">{top.linkLabel}</Link>
      {rest.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-[#FF5C38]/25 pt-3">
          {rest.slice(0, 3).map((a, i) => (
            <li key={i} className="text-sm text-slate-400">• {a.text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function StudentDashboard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [journey, setJourney] = useState([]);
  const [eligibleCount, setEligibleCount] = useState(0);
  const [responding, setResponding] = useState(false);

  const respondOffer = async (offerId, decision) => {
    setResponding(true);
    try {
      await offersApi.respond(offerId, decision);
      toast(decision === 'accepted' ? 'Offer accepted — congratulations! 🎉' : 'Offer declined. The recruiter has been told.', 'success');
      load();
    } catch (err) {
      toast(errMsg(err, 'Could not send your answer.'), 'error');
    } finally {
      setResponding(false);
    }
  };

  const load = async () => {
    try {
      const [{ data: j }, { data: open }] = await Promise.all([
        studentApi.journey(),
        drivesApi.list({ status: 'open' }),
      ]);
      setJourney(j ?? []);
      // Count open drives the student hasn't applied to and is eligible for.
      const appliedIds = new Set((j ?? []).map((x) => x.drive.id));
      const details = await Promise.all(
        open.filter((d) => !appliedIds.has(d.id))
          .map((d) => drivesApi.get(d.id).then((r) => r.data).catch(() => null))
      );
      setEligibleCount(details.filter((d) => d && d.eligibility?.eligible).length);
    } catch (err) {
      toast(errMsg(err, 'Could not load your dashboard.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Live updates: when a test is scheduled, a result is published or an
    // interview is set, refresh right away instead of waiting for a reload.
    const onLive = () => load();
    window.addEventListener('campusflow-live', onLive);
    return () => window.removeEventListener('campusflow-live', onLive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="text-sm text-slate-400 py-10 text-center">Loading your applications…</div>;

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <div className="space-y-6">
      <div className="cf-hero cf-rise">
        <div className="relative z-10">
          <h2 className="font-display text-2xl font-bold">Hey {firstName} 👋</h2>
          <p className="text-cyan-100 text-sm mt-1 max-w-xl">
            {journey.length === 0
              ? 'No applications yet. Find a drive you’re eligible for and apply in one click — we handle every test and interview schedule.'
              : `You have ${journey.length} active application${journey.length !== 1 ? 's' : ''}. Follow each one below — your test venue and time, your result, and your interview slot appear here automatically.`}
          </p>
          <div className="flex gap-3 mt-4 flex-wrap">
            <Link to="/student/drives" className="bg-[#12172A] text-[#FF5C38] font-bold text-sm rounded-xl px-5 py-2.5 shadow-lg hover:-translate-y-px transition-transform">
              Find drives{eligibleCount > 0 && ` (${eligibleCount} for you)`}
            </Link>
            <Link to="/student/bookings" className="bg-white/15 text-white font-semibold text-sm rounded-xl px-5 py-2.5 hover:bg-white/25 transition-colors">
              My schedule
            </Link>
          </div>
        </div>
      </div>

      {journey.length === 0 ? (
        <div className="cf-card">
          <EmptyState
            title="No applications yet"
            message="Apply to a drive and track everything here: your test venue and time, your result, and your interview slot."
            action={<Link to="/student/drives" className="cf-btn-primary">Browse drives</Link>}
          />
        </div>
      ) : (
        <>
          <NextActionCard journey={journey} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {journey.map((item, i) => <JourneyCard key={item.application.id} item={item} index={i} responding={responding} onRespond={respondOffer} />)}
          </div>
        </>
      )}
    </div>
  );
}
