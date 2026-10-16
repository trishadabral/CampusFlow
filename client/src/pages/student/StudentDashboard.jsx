// Student dashboard — "My journey": every application as a visual pipeline.
// Applied → Test session → Result → Interview. The student always knows
// exactly where they stand and what happens next. Nothing to book, ever.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { student as studentApi, drives as drivesApi, errMsg } from '../../api.js';
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

function JourneyCard({ item, index }) {
  const meta = STATUS_META[item.application.status] ?? STATUS_META.applied;
  const canTakeTest = item.testSession && !item.result;
  return (
    <div className={`cf-card cf-rise cf-rise-${index % 3}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <div className="text-xs text-slate-500 font-medium">{item.drive.company}</div>
          <Link to={`/student/drives/${item.drive.id}`} className="text-lg font-bold text-slate-900 hover:text-indigo-700">
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
          <div className="cf-chip bg-indigo-50 text-indigo-700">
            📍 {item.testSession.title} · {formatDate(item.testSession.starts_at)}
          </div>
        )}
        {item.interview && (
          <div className="cf-chip bg-emerald-50 text-emerald-700">
            🎤 Interview · Panel {item.interview.panel}{item.interview.venue ? ` · ${item.interview.venue}` : ''} · {formatDate(item.interview.starts_at)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function StudentDashboard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [journey, setJourney] = useState([]);
  const [eligibleCount, setEligibleCount] = useState(0);

  useEffect(() => {
    (async () => {
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
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="text-sm text-slate-500 py-10 text-center">Loading your journey…</div>;

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <div className="space-y-6">
      <div className="cf-hero cf-rise">
        <div className="relative z-10">
          <h2 className="text-2xl font-bold">Hey {firstName} 👋</h2>
          <p className="text-indigo-100 text-sm mt-1 max-w-xl">
            {journey.length === 0
              ? 'No applications yet. Find a drive you’re eligible for and apply in one click — we handle every test and interview schedule.'
              : `You have ${journey.length} active application${journey.length !== 1 ? 's' : ''}. Follow each pipeline below — your test venues and interview slots appear here automatically.`}
          </p>
          <div className="flex gap-3 mt-4 flex-wrap">
            <Link to="/student/drives" className="bg-white text-indigo-700 font-bold text-sm rounded-xl px-5 py-2.5 shadow-lg hover:-translate-y-px transition-transform">
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
            title="Your journey starts here"
            message="Apply to a drive and watch your pipeline grow: test session → result → interview, all scheduled for you."
            action={<Link to="/student/drives" className="cf-btn-primary">Browse drives</Link>}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {journey.map((item, i) => <JourneyCard key={item.application.id} item={item} index={i} />)}
        </div>
      )}
    </div>
  );
}
