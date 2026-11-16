// My Journey — every drive the student applied to, as a step-by-step
// timeline, with offers to answer and applications to withdraw.
// Merged from Ishika's repo 2026-11-16 and rewritten in this app's dark
// theme, driven by this app's own /student/journey endpoint (which
// returns per-item `steps` rendered here with the shared Stepper).
import React, { useCallback, useEffect, useState } from 'react';
import { student, offers, errMsg } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Spinner from '../../components/Spinner.jsx';
import Stepper from '../../components/Stepper.jsx';
import { formatDate } from '../../utils.js';

const STATUS_BADGE = {
  applied: 'info',
  test_taken: 'info',
  shortlisted: 'success',
  selected: 'success',
  rejected: 'danger',
  withdrawn: 'neutral',
};

export default function StudentJourney() {
  const { toast } = useToast();
  const [journey, setJourney] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await student.journey();
      setJourney(res.data.journey ?? []);
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const answerOffer = async (offerId, decision) => {
    setBusy(offerId);
    try {
      await offers.respond(offerId, decision);
      toast(decision === 'accepted' ? 'Offer accepted. Congratulations!' : 'Offer declined.', 'success');
      load();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async (applicationId) => {
    setBusy(applicationId);
    try {
      await student.withdrawApplication(applicationId);
      toast('Application withdrawn.', 'success');
      load();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <Spinner text="Loading your journey…" />;

  const q = query.trim().toLowerCase();
  const shown = journey.filter((j) => {
    if (!q) return true;
    return `${j.drive.title} ${j.drive.company}`.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-100">My Journey</h1>
        <p className="text-sm text-slate-400 mt-1">
          Every drive you applied to — applied, test, result, interview — in one place.
        </p>
      </div>

      <input
        className="cf-input max-w-md"
        placeholder="Search by drive or company…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {shown.length === 0 ? (
        <div className="cf-card">
          <EmptyState
            title={journey.length === 0 ? 'No applications yet' : 'Nothing matches that search'}
            message={journey.length === 0 ? 'Find a drive and apply — your journey will appear here.' : 'Try a different drive or company name.'}
          />
        </div>
      ) : (
        shown.map((j) => (
          <article key={j.application.id} className="cf-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-lg text-slate-100">{j.drive.title}</h2>
                <p className="text-sm text-slate-400 mt-0.5">
                  {j.drive.company} · Applied {formatDate(j.application.applied_at)}
                </p>
              </div>
              <Badge variant={STATUS_BADGE[j.application.status] ?? 'neutral'}>
                {j.application.status.replace('_', ' ')}
              </Badge>
            </div>

            <div className="mt-5">
              <Stepper steps={j.steps} />
            </div>

            {j.result && (
              <p className="text-sm text-slate-300 mt-4">
                Test score: <strong>{Number(j.result.percentage).toFixed(1)}%</strong> ({j.result.score}/{j.result.total})
                {j.result.tab_switches > 0 ? ` · ${j.result.tab_switches} tab switch${j.result.tab_switches === 1 ? '' : 'es'} during the test` : ''}
              </p>
            )}
            {j.interview && (
              <p className="text-sm text-slate-300 mt-2">
                Interview: {j.interview.title}
                {j.interview.venue ? ` · ${j.interview.venue}` : ''}
                {' · '}
                {formatDate(j.interview.starts_at)}
              </p>
            )}

            {j.offer && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="text-sm text-slate-300">
                  Offer: <strong>{j.offer.package_lpa != null ? `${j.offer.package_lpa} LPA` : 'Package to be confirmed'}</strong>
                  {j.offer.joining_date ? ` · Joining ${formatDate(j.offer.joining_date)}` : ''}
                  {' · '}
                  <Badge variant={j.offer.status === 'accepted' ? 'success' : j.offer.status === 'declined' ? 'danger' : j.offer.status === 'withdrawn' ? 'neutral' : 'info'}>
                    {j.offer.status}
                  </Badge>
                </div>
                {j.offer.status === 'pending' && (
                  <div className="flex gap-2 mt-3">
                    <button type="button" className="cf-btn-primary" disabled={busy === j.offer.id} onClick={() => answerOffer(j.offer.id, 'accepted')}>
                      Accept offer
                    </button>
                    <button type="button" className="cf-btn-secondary" disabled={busy === j.offer.id} onClick={() => answerOffer(j.offer.id, 'declined')}>
                      Decline
                    </button>
                  </div>
                )}
              </div>
            )}

            {(j.application.status === 'applied' || j.application.status === 'test_taken') && (
              <div className="mt-4">
                <button
                  type="button"
                  className="text-sm text-slate-400 hover:text-rose-400"
                  disabled={busy === j.application.id}
                  onClick={() => withdraw(j.application.id)}
                >
                  Withdraw application
                </button>
              </div>
            )}
          </article>
        ))
      )}
    </div>
  );
}
