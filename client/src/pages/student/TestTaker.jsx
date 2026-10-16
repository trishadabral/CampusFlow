// TestTaker — the student's aptitude test. One timed attempt, one question
// at a time, auto-submit on timeout, instant auto-graded result.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { drives as drivesApi, errMsg } from '../../api.js';
import { formatDate } from '../../utils.js';
import { useToast } from '../../components/Toast.jsx';

function mmss(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function TestTaker() {
  const { driveId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [paper, setPaper] = useState(null);
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    drivesApi.getTest(driveId)
      .then(({ data }) => {
        setPaper(data);
        if (data.result) setResult({ ...data.result, already: true });
        else setSecondsLeft((data.drive?.test_duration_min ?? 60) * 60);
      })
      .catch((err) => {
        toast(errMsg(err, 'Could not load the test.'), 'error');
        navigate(`/student/drives/${driveId}`);
      })
      .finally(() => setLoading(false));
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveId]);

  const questions = useMemo(() => paper?.questions ?? [], [paper]);

  const submit = async (finalAnswers) => {
    if (submitting) return;
    setSubmitting(true);
    clearInterval(timerRef.current);
    try {
      const { data } = await drivesApi.submitTest(driveId, finalAnswers ?? answers);
      setResult(data);
      toast('Test submitted and graded.', 'success');
    } catch (err) {
      toast(errMsg(err, 'Could not submit the test.'), 'error');
      setSubmitting(false);
    }
  };

  const start = () => {
    setStarted(true);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current);
          submit();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  useEffect(() => () => clearInterval(timerRef.current), []);

  if (loading) return <div className="text-sm text-slate-500 py-10 text-center">Loading your test…</div>;
  if (!paper) return null;

  // --- already submitted: result screen ---
  if (result) {
    const pct = Number(result.percentage);
    const passed = pct >= Number(paper.drive?.min_test_score ?? 50);
    return (
      <div className="max-w-xl mx-auto">
        <div className="cf-card cf-rise text-center py-10">
          <div className="text-5xl mb-4">{result.already ? '📋' : passed ? '🎉' : '📊'}</div>
          <h2 className="text-2xl font-bold text-slate-900">
            {result.already ? 'Test already submitted' : 'Test submitted!'}
          </h2>
          <div className={`text-5xl font-black mt-4 ${passed ? 'text-emerald-600' : 'text-slate-700'}`}>
            {pct.toFixed(1)}%
          </div>
          <p className="text-sm text-slate-500 mt-2">
            {Number(result.score)}/{Number(result.total)} marks
            {result.submitted_at && ` · submitted ${formatDate(result.submitted_at)}`}
          </p>
          {!result.already && (
            <p className="text-sm text-slate-600 mt-4 bg-slate-50 rounded-xl px-4 py-3 inline-block">
              {passed
                ? 'Above the cutoff — you’re in the running for the interview shortlist. Watch your notifications.'
                : 'Below the cutoff this time. More drives are coming — keep going.'}
            </p>
          )}
          <div className="mt-6">
            <Link to={`/student/drives/${driveId}`} className="cf-btn-primary">Back to drive →</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!questions.length) {
    return (
      <div className="max-w-xl mx-auto"><div className="cf-card text-center py-10">
        <p className="text-sm text-slate-500">This drive has no questions yet.</p>
        <Link to={`/student/drives/${driveId}`} className="cf-btn-secondary mt-4">Back to drive</Link>
      </div></div>
    );
  }

  // --- pre-start: instructions ---
  if (!started) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="cf-card cf-rise">
          <h2 className="text-xl font-bold text-slate-900">{paper.drive?.title} — Aptitude Test</h2>
          {paper.session && (
            <p className="text-sm text-slate-500 mt-1">
              📍 {paper.session.title} · {formatDate(paper.session.starts_at)}
            </p>
          )}
          <ul className="mt-5 space-y-2.5 text-sm text-slate-600">
            <li className="flex gap-2"><span>📝</span> {questions.length} multiple-choice questions, one attempt only.</li>
            <li className="flex gap-2"><span>⏱️</span> {paper.drive?.test_duration_min} minutes on the clock — auto-submits at zero.</li>
            <li className="flex gap-2"><span>🎯</span> Grading is instant and automatic.</li>
            <li className="flex gap-2"><span>⚠️</span> Don't refresh mid-test; your answers are kept only on submit.</li>
          </ul>
          <button onClick={start} className="cf-btn-primary w-full mt-6 !py-3.5 !text-base">Start test →</button>
        </div>
      </div>
    );
  }

  // --- in test ---
  const q = questions[index];
  const answered = Object.keys(answers).length;
  const urgent = secondsLeft < 300;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="cf-card !py-4 flex items-center justify-between gap-4 sticky top-20 z-10">
        <div>
          <div className="text-xs text-slate-500 font-semibold uppercase tracking-wide">
            Question {index + 1} of {questions.length}
          </div>
          <div className="h-2 w-48 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${((index + 1) / questions.length) * 100}%`, background: 'linear-gradient(90deg,#4f46e5,#7c3aed)' }} />
          </div>
        </div>
        <div className={`font-mono-tight text-xl font-bold px-4 py-2 rounded-xl ${urgent ? 'bg-rose-50 text-rose-700 animate-pulse' : 'bg-slate-100 text-slate-700'}`}>
          ⏱ {mmss(secondsLeft)}
        </div>
      </div>

      <div className="cf-card cf-rise" key={q.id}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-900 leading-snug">{q.text}</h3>
          <span className="cf-chip bg-slate-100 text-slate-500 shrink-0">{q.marks} mark{q.marks !== 1 && 's'}</span>
        </div>
        <div className="space-y-2.5 mt-5">
          {q.options.map((opt, oi) => (
            <button
              key={oi}
              onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
              className={`w-full text-left rounded-xl border-2 px-4 py-3.5 text-sm font-medium transition-all ${answers[q.id] === oi ? 'border-indigo-600 bg-indigo-50 text-indigo-900 shadow-md shadow-indigo-100' : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'}`}
            >
              <span className={`inline-flex w-7 h-7 rounded-lg items-center justify-center text-xs font-bold mr-3 ${answers[q.id] === oi ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {String.fromCharCode(65 + oi)}
              </span>
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} className="cf-btn-secondary disabled:opacity-40">← Previous</button>
        <span className="text-xs text-slate-400 font-medium">{answered}/{questions.length} answered</span>
        {index < questions.length - 1 ? (
          <button onClick={() => setIndex((i) => i + 1)} className="cf-btn-primary">Next →</button>
        ) : (
          <button onClick={() => submit()} disabled={submitting} className="cf-btn-success">
            {submitting ? 'Submitting…' : '✓ Submit test'}
          </button>
        )}
      </div>
    </div>
  );
}
