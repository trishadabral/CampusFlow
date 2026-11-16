// TestTaker — the student's aptitude test. One timed attempt, one question
// at a time, auto-submit on timeout, instant auto-graded result.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { drives as drivesApi, errMsg } from '../../api.js';
import { formatDate } from '../../utils.js';
import { useToast } from '../../components/Toast.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

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
  // Tab-switch detection: while the test is in progress, leaving the tab
  // (or the window) counts as a switch. 3 switches auto-submit the test.
  const TAB_SWITCH_LIMIT = 3;
  const [tabSwitches, setTabSwitches] = useState(0);
  const tabSwitchesRef = useRef(0);
  const answersRef = useRef({});
  const submitRef = useRef(null);
  const inTestRef = useRef(false);
  const lastSwitchRef = useRef(0);
  // Fullscreen + submit confirmation (merged from Ishika's repo 2026-11-16).
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

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
    // Leave fullscreen so the result screen is not stuck in it.
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { /* already exited */ }
    }
    try {
      // Answers and the tab-switch count come from refs: the timer and the
      // tab-switch listener call the submit captured at an earlier render,
      // so reading state directly here would send stale (even empty) answers.
      const { data } = await drivesApi.submitTest(driveId, finalAnswers ?? answersRef.current, tabSwitchesRef.current);
      setResult(data);
      toast('Test submitted and graded.', 'success');
    } catch (err) {
      toast(errMsg(err, 'Could not submit the test.'), 'error');
      setSubmitting(false);
    }
  };

  // Keep the refs current after every render — the timer callback and the
  // tab-switch listener always call through them.
  useEffect(() => {
    answersRef.current = answers;
    submitRef.current = submit;
  });

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

  // Fullscreen toggle (merged from Ishika's repo 2026-11-16). Entering or
  // leaving fullscreen does not blur the window, so it never counts as a
  // tab switch; Esc exits fullscreen and is also safe.
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      toast('Fullscreen is not available in this browser.', 'error');
    }
  };

  // "Test in progress" as a ref, so the switch listener below always sees
  // the current state without re-registering.
  useEffect(() => {
    inTestRef.current = started && !result;
  }, [started, result]);

  // Tab-switch detection — only while a test is in progress (not before
  // start, not after submit). visibilitychange catches switching tabs and
  // minimising; blur catches switching to another window. One real switch
  // can fire both within milliseconds, so at most one counts per second.
  useEffect(() => {
    if (!started || result) return undefined;
    const onSwitch = () => {
      if (!inTestRef.current) return;
      const now = Date.now();
      if (now - lastSwitchRef.current < 1000) return;
      lastSwitchRef.current = now;
      tabSwitchesRef.current += 1;
      const count = tabSwitchesRef.current;
      setTabSwitches(count);
      if (count >= TAB_SWITCH_LIMIT) {
        toast('Too many tab switches — submitting your test now.', 'error');
        submitRef.current?.();
      }
    };
    const onVisibility = () => { if (document.hidden) onSwitch(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onSwitch);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onSwitch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, result]);

  if (loading) return <div className="text-sm text-slate-400 py-10 text-center">Loading your test…</div>;
  if (!paper) return null;

  // --- already submitted: result screen ---
  if (result) {
    const pct = Number(result.percentage);
    const passed = pct >= Number(paper.drive?.min_test_score ?? 50);
    return (
      <div className="max-w-xl mx-auto">
        <div className="cf-card cf-rise text-center py-10">
          <div className="text-5xl mb-4">{result.already ? '📋' : passed ? '🎉' : '📊'}</div>
          <h2 className="font-display text-2xl font-bold text-slate-100">
            {result.already ? 'Test already submitted' : 'Test submitted!'}
          </h2>
          <div className={`text-5xl font-black mt-4 ${passed ? 'text-emerald-400' : 'text-slate-300'}`}>
            {pct.toFixed(1)}%
          </div>
          <p className="text-sm text-slate-400 mt-2">
            {Number(result.score)}/{Number(result.total)} marks
            {result.submitted_at && ` · submitted ${formatDate(result.submitted_at)}`}
          </p>
          {Number(result.tab_switches) > 0 && (
            <p className="text-sm text-amber-300 mt-2">
              ⚠ {Number(result.tab_switches)} tab switch{Number(result.tab_switches) !== 1 && 'es'} recorded during this test.
            </p>
          )}
          {!result.already && (
            <p className="text-sm text-slate-400 mt-4 bg-[#0B0E1A] rounded-xl px-4 py-3 inline-block">
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
        <p className="text-sm text-slate-400">This drive has no questions yet.</p>
        <Link to={`/student/drives/${driveId}`} className="cf-btn-secondary mt-4">Back to drive</Link>
      </div></div>
    );
  }

  // --- pre-start: instructions ---
  if (!started) {
    const mode = paper.drive?.test_mode || 'aptitude';
    const aptCount = questions.filter((qq) => (qq.type || 'aptitude') === 'aptitude').length;
    const codeCount = questions.filter((qq) => qq.type === 'coding').length;
    const testKind = mode === 'coding' ? 'Coding Test' : mode === 'both' ? 'Aptitude + Coding Test' : 'Aptitude Test';
    return (
      <div className="max-w-xl mx-auto">
        <div className="cf-card cf-rise">
          <h2 className="text-xl font-bold text-slate-100">{paper.drive?.title} — {testKind}</h2>
          {paper.session && (
            <p className="text-sm text-slate-400 mt-1">
              📍 {paper.session.title} · {formatDate(paper.session.starts_at)}
            </p>
          )}
          <ul className="mt-5 space-y-2.5 text-sm text-slate-400">
            {aptCount > 0 && <li className="flex gap-2"><span>📝</span> {aptCount} multiple-choice question{aptCount !== 1 && 's'} — pick one answer.</li>}
            {codeCount > 0 && <li className="flex gap-2"><span>💻</span> {codeCount} coding question{codeCount !== 1 && 's'} — write your code in the box; it is run and checked for you.</li>}
            <li className="flex gap-2"><span>⏱️</span> {paper.drive?.test_duration_min} minutes on the clock — auto-submits at zero.</li>
            <li className="flex gap-2"><span>🎯</span> Grading is instant and automatic.</li>
            <li className="flex gap-2"><span>🔒</span> One attempt only — you can&rsquo;t retake this test.</li>
            <li className="flex gap-2"><span>⚠️</span> Stay on this tab — switching away is recorded, and 3 switches submit your test automatically.</li>
            <li className="flex gap-2"><span>⚠️</span> Don&rsquo;t refresh mid-test; your answers are kept only on submit.</li>
          </ul>
          <button onClick={start} className="cf-btn-primary w-full mt-6 !py-3.5 !text-base">Start test →</button>
        </div>
      </div>
    );
  }

  // --- in test ---
  const q = questions[index];
  // Aptitude counts once an option is picked (index 0 counts too); coding
  // counts once the student has typed something in the box.
  const answered = questions.filter((qq) => {
    const a = answers[qq.id];
    return qq.type === 'coding'
      ? typeof a === 'string' && a.trim().length > 0
      : a !== undefined && a !== null;
  }).length;
  const urgent = secondsLeft < 300;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="cf-card !py-4 flex items-center justify-between gap-4 sticky top-20 z-10">
        <div>
          <div className="text-xs text-slate-400 font-semibold uppercase tracking-wide">
            Question {index + 1} of {questions.length}
          </div>
          <div className="h-2 w-48 bg-[#151B30] rounded-full mt-1.5 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${((index + 1) / questions.length) * 100}%`, background: '#FF5C38' }} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleFullscreen}
            className="cf-btn-secondary !px-3 !py-2"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? '⤢ Exit' : '⛶ Fullscreen'}
          </button>
          {tabSwitches > 0 && (
            <span className="font-mono-tight text-sm font-bold px-3 py-2 rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/30">
              ⚠ {tabSwitches}/{TAB_SWITCH_LIMIT} tab switches
            </span>
          )}
          <div className={`font-mono-tight text-xl font-bold px-4 py-2 rounded-xl ${urgent ? 'bg-rose-500/10 text-rose-300 animate-pulse' : 'bg-[#151B30] text-slate-300'}`}>
            ⏱ {mmss(secondsLeft)}
          </div>
        </div>
      </div>

      {tabSwitches > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          ⚠ Tab switch detected — this is being recorded. {tabSwitches} of {TAB_SWITCH_LIMIT} — {TAB_SWITCH_LIMIT} switches will submit your test automatically.
        </div>
      )}

      <div className="cf-card cf-rise" key={q.id}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-100 leading-snug">{q.text}</h3>
          <span className="cf-chip bg-[#151B30] text-slate-400 shrink-0">{q.marks} mark{q.marks !== 1 && 's'}</span>
        </div>
        {q.type === 'coding' ? (
          <div className="space-y-3 mt-5">
            <div className="flex items-center gap-2">
              <span className="cf-chip bg-[#151B30] text-slate-400">{q.language === 'python' ? 'Python' : 'JavaScript'}</span>
              <span className="text-xs text-slate-400">Write your code below — it will be run and checked for you.</span>
            </div>
            <textarea
              value={answers[q.id] ?? q.starter_code ?? ''}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              rows={12}
              spellCheck={false}
              className="cf-input font-mono !text-[13px] !leading-relaxed"
              placeholder="Write your code here…"
            />
          </div>
        ) : (
          <div className="space-y-2.5 mt-5">
            {q.options.map((opt, oi) => (
              <button
                key={oi}
                onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                className={`w-full text-left rounded-xl border-2 px-4 py-3.5 text-sm font-medium transition-all ${answers[q.id] === oi ? 'border-[#FF5C38] bg-[#FF5C38]/10 text-[#FF8A6B] shadow-md shadow-black/30' : 'border-white/10 bg-[#12172A] text-slate-300 hover:border-[#FF5C38]/40'}`}
              >
                <span className={`inline-flex w-7 h-7 rounded-lg items-center justify-center text-xs font-bold mr-3 ${answers[q.id] === oi ? 'bg-[#FF5C38] text-white' : 'bg-[#151B30] text-slate-400'}`}>
                  {String.fromCharCode(65 + oi)}
                </span>
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} className="cf-btn-secondary disabled:opacity-40">← Previous</button>
        <span className="text-xs text-slate-400 font-medium">{answered}/{questions.length} answered</span>
        {index < questions.length - 1 ? (
          <button onClick={() => setIndex((i) => i + 1)} className="cf-btn-primary">Next →</button>
        ) : (
          <button onClick={() => setShowSubmitConfirm(true)} disabled={submitting} className="cf-btn-success">
            {submitting ? 'Submitting…' : '✓ Submit test'}
          </button>
        )}
      </div>

      <ConfirmDialog
        isOpen={showSubmitConfirm}
        onClose={() => setShowSubmitConfirm(false)}
        onConfirm={() => {
          setShowSubmitConfirm(false);
          submit();
        }}
        title="Submit your test?"
        message={`You have answered ${answered} of ${questions.length} questions. You cannot change answers after submitting.`}
        confirmText="Submit test"
        variant="primary"
        loading={submitting}
      />
    </div>
  );
}
