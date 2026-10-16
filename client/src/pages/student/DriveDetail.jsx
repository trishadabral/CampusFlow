// Student drive detail — criteria, eligibility verdict, apply, and (once
// applied) your live pipeline: test session venue, result, interview slot.

import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { drives as drivesApi, errMsg } from '../../api.js';
import { formatDate } from '../../utils.js';
import { useToast } from '../../components/Toast.jsx';
import Badge from '../../components/Badge.jsx';
import Stepper from '../../components/Stepper.jsx';

export default function DriveDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [applying, setApplying] = useState(false);

  const load = async () => {
    try {
      const { data: d } = await drivesApi.get(id);
      setData(d);
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
      await drivesApi.apply(id);
      toast('Applied! Track your pipeline from the dashboard.', 'success');
      load();
    } catch (err) {
      toast(errMsg(err, 'Could not apply.'), 'error');
    } finally {
      setApplying(false);
    }
  };

  if (loading) return <div className="text-sm text-slate-500 py-10 text-center">Loading drive…</div>;
  if (!data?.drive) return <div className="text-sm text-slate-500 py-10 text-center">Drive not found.</div>;

  const { drive, eligibility, my_application, my_result, my_sessions = [], questions_count } = data;
  const testSession = my_sessions.find((s) => s.type === 'test');
  const interview = my_sessions.find((s) => s.type === 'interview');

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
        </div>
      ) : (
        <div className="cf-card cf-rise space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="cf-section-title">Your pipeline</h3>
            <Badge variant="info">{(my_application.status ?? 'applied').replace('_', ' ')}</Badge>
          </div>
          <Stepper steps={steps} />

          {testSession && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
              <div className="font-bold text-indigo-900 text-sm">📍 Your test session</div>
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

          {!testSession && (
            <p className="text-sm text-slate-500 bg-slate-50 rounded-xl px-4 py-3">
              🕐 Your test session will be scheduled automatically and appear here — plus a notification.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
