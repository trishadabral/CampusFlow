// Interview Scheduler — pick a drive, and the system builds the interview timetable:
// shortlisted students → ordered by the chosen rule → lab reserved → real slots created.
// No manual candidate entry: priority comes from the students' marks.

import React, { useEffect, useState } from 'react';
import { schedule as scheduleApi, drives as drivesApi, errMsg } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import { formatDate } from '../../utils.js';
import Badge from '../../components/Badge.jsx';

const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';
const labelCls = 'block text-xs font-medium text-slate-600 mb-1.5';

const ALGOS = [
  { id: 'priority', label: 'Highest marks first', desc: 'The top CGPA interviews first' },
  { id: 'fcfs', label: 'Application order', desc: 'Whoever applied first, interviews first' },
];

function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function SchedulingLab() {
  const { toast } = useToast();
  const [drives, setDrives] = useState([]);
  const [driveId, setDriveId] = useState('');
  const [algo, setAlgo] = useState('priority');
  const [minutes, setMinutes] = useState(15);
  const [startsAt, setStartsAt] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [compare, setCompare] = useState(null);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await drivesApi.list();
        const list = data ?? [];
        setDrives(list);
        const first = list.find((d) => (d.counts?.shortlisted ?? 0) > 0) ?? list[0];
        if (first) {
          setDriveId(String(first.id));
          setMinutes(first.interview_duration_min || 15);
          const base = first.interview_date ? new Date(first.interview_date) : new Date();
          base.setHours(10, 0, 0, 0);
          setStartsAt(toLocalInput(base));
        }
      } catch (err) {
        toast(errMsg(err, 'Could not load drives.'), 'error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = drives.find((d) => String(d.id) === String(driveId));

  const generate = async () => {
    if (!driveId) return;
    setRunning(true);
    setResult(null);
    setCompare(null);
    try {
      const { data } = await scheduleApi.auto({
        drive_id: Number(driveId),
        algorithm: algo,
        interview_minutes: Number(minutes),
        starts_at: startsAt ? new Date(startsAt).toISOString() : undefined,
      });
      setResult(data);
      toast(`Timetable ready — ${data.timeline.length} interviews scheduled.`, 'success');
    } catch (err) {
      const status = err?.response?.status;
      if (status === 409) {
        // A timetable already exists — load it so the admin can see it.
        try {
          const { data: existing } = await scheduleApi.getAuto(driveId);
          setResult({ existing: existing.slots ?? [], already: true });
        } catch (_) { /* ignore */ }
      }
      toast(errMsg(err, 'Could not generate the timetable.'), 'error');
    } finally {
      setRunning(false);
    }
  };

  const compareAlgos = async () => {
    if (!result?.students?.length) return;
    setComparing(true);
    try {
      const mk = (a) =>
        result.students.map((s, i) => ({
          id: i + 1,
          label: s.name,
          burst: result.interview_minutes,
          priority: a === 'priority' ? Math.round((10 - s.cgpa) * 100) : 0,
          arrival: a === 'fcfs' ? i : 0,
        }));
      const [p, f] = await Promise.all([
        scheduleApi.simulate({ algorithm: 'priority', interviews: mk('priority') }),
        scheduleApi.simulate({ algorithm: 'fcfs', interviews: mk('fcfs') }),
      ]);
      setCompare([
        { id: 'priority', label: 'Highest marks first', avg: p.data.avg_waiting_time },
        { id: 'fcfs', label: 'Application order', avg: f.data.avg_waiting_time },
      ]);
    } catch (err) {
      toast(errMsg(err, 'Comparison failed.'), 'error');
    } finally {
      setComparing(false);
    }
  };

  const startOver = async () => {
    if (!driveId || !window.confirm('Delete this timetable and its lab booking? You can generate a new one after.')) return;
    try {
      await scheduleApi.clearAuto(driveId);
      setResult(null);
      setCompare(null);
      toast('Timetable cleared. Set your options and generate again.', 'success');
    } catch (err) {
      toast(errMsg(err, 'Could not clear the timetable.'), 'error');
    }
  };

  const labBanner = () => {
    const lab = result?.lab;
    if (!lab) return null;
    if (lab.status === 'reserved') {
      return (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm">
          <span className="font-semibold text-emerald-800">✓ {lab.resource_name} reserved</span>
          <span className="text-emerald-700"> — {lab.seats} seats for the whole interview window.</span>
        </div>
      );
    }
    return (
      <div className={`${lab.status === 'refused' ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'} border rounded-xl px-4 py-3 text-sm`}>
        <span className={`font-semibold ${lab.status === 'refused' ? 'text-rose-800' : 'text-amber-800'}`}>
          {lab.status === 'refused' ? 'Lab booking refused' : 'No lab booked'}
        </span>
        <p className={`mt-1 ${lab.status === 'refused' ? 'text-rose-700' : 'text-amber-700'}`}>{lab.explanation}</p>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Setup */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-5">
          <div>
            <h2 className="font-semibold text-slate-900 mb-1">1. Pick a drive</h2>
            <p className="text-xs text-slate-500 mb-3">Only shortlisted students get interview slots — no typing names.</p>
            <label className={labelCls}>Drive</label>
            <select value={driveId} onChange={(e) => setDriveId(e.target.value)} className={inputCls}>
              {drives.map((d) => (
                <option key={d.id} value={d.id} disabled={(d.counts?.shortlisted ?? 0) === 0}>
                  {d.title} — {d.counts?.shortlisted ?? 0} shortlisted
                  {(d.counts?.shortlisted ?? 0) === 0 ? ' (shortlist first)' : ''}
                </option>
              ))}
            </select>
            {selected && (
              <div className="flex gap-2 mt-2">
                <Badge variant="info">{selected.status}</Badge>
                <span className="text-xs text-slate-500 self-center">{selected.company?.name}</span>
              </div>
            )}
          </div>

          <div>
            <h2 className="font-semibold text-slate-900 mb-2">2. How should interviews be ordered?</h2>
            <div className="space-y-2">
              {ALGOS.map((a) => (
                <label key={a.id} className={`flex items-center gap-3 border rounded-xl px-4 py-2.5 cursor-pointer text-sm ${algo === a.id ? 'border-indigo-500 bg-indigo-50/60' : 'border-slate-200'}`}>
                  <input type="radio" name="algo" checked={algo === a.id} onChange={() => setAlgo(a.id)} className="accent-indigo-600" />
                  <span className="font-semibold text-slate-800">{a.label}</span>
                  <span className="text-slate-500 text-xs">{a.desc}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Minutes per interview</label>
              <input type="number" min="5" max="120" value={minutes} onChange={(e) => setMinutes(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Interviews start at</label>
              <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputCls} />
            </div>
          </div>

          <button onClick={generate} disabled={running || !driveId}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition-colors">
            {running ? 'Building timetable…' : 'Generate interview timetable'}
          </button>
          <p className="text-xs text-slate-400">This creates real interview slots and reserves a lab — students will see their interview time.</p>
        </div>

        {/* Result */}
        <div className="lg:col-span-3 space-y-4">
          {!result ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-10 text-center">
              <p className="text-sm text-slate-400">Pick a drive and generate — the timetable, lab booking and comparison appear here.</p>
            </div>
          ) : result.already ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <h2 className="font-semibold text-slate-900 mb-1">Timetable already exists</h2>
              <p className="text-sm text-slate-500 mb-4">This drive already has {result.existing.length} interview slots.</p>
              <div className="space-y-1.5 max-h-96 overflow-y-auto slim-scroll">
                {result.existing.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm border-b border-slate-50 py-2">
                    <span className="font-medium text-slate-800">{s.title.replace(/^Interview — /, '')}</span>
                    <span className="text-xs text-slate-500">{formatDate(s.starts_at)}{s.venue ? ` · ${s.venue}` : ''}</span>
                  </div>
                ))}
              </div>
              <button onClick={startOver} className="mt-4 border border-rose-200 text-rose-700 hover:bg-rose-50 text-sm font-semibold rounded-xl px-4 py-2 transition-colors">
                Start over (delete timetable)
              </button>
            </div>
          ) : (
            <>
              {labBanner()}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-slate-900">Interview timetable — {result.drive.title}</h2>
                  <div className="flex gap-2">
                    <button onClick={compareAlgos} disabled={comparing}
                      className="border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-60 text-slate-700 text-xs font-semibold rounded-xl px-3 py-1.5 transition-colors">
                      {comparing ? 'Comparing…' : 'Compare ordering rules'}
                    </button>
                    <button onClick={startOver} className="border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold rounded-xl px-3 py-1.5 transition-colors">
                      Start over
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5 max-h-[420px] overflow-y-auto slim-scroll pr-1">
                  {result.timeline.map((t, i) => (
                    <div key={t.student_id} className="flex items-center gap-3 border border-slate-100 rounded-xl px-3 py-2 hover:bg-slate-50/60">
                      <span className="w-7 h-7 shrink-0 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-900 truncate">{t.name}</div>
                        <div className="text-xs text-slate-400">{formatDate(t.start)} – {formatDate(t.end)}</div>
                      </div>
                      <span className="text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg px-2 py-1 shrink-0">CGPA {t.cgpa.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
                  <div className="bg-slate-50 rounded-xl px-4 py-3">
                    <div className="text-xs text-slate-500 uppercase tracking-wide">Interviews</div>
                    <div className="font-semibold text-slate-900 mt-0.5">{result.timeline.length}</div>
                  </div>
                  <div className="bg-slate-50 rounded-xl px-4 py-3">
                    <div className="text-xs text-slate-500 uppercase tracking-wide">Avg waiting time</div>
                    <div className="font-semibold text-slate-900 mt-0.5">{Number(result.avg_waiting_time ?? 0).toFixed(1)} min</div>
                  </div>
                  <div className="bg-slate-50 rounded-xl px-4 py-3">
                    <div className="text-xs text-slate-500 uppercase tracking-wide">Ordering rule</div>
                    <div className="font-semibold text-slate-900 mt-0.5">{result.algorithm === 'priority' ? 'Highest marks first' : 'Application order'}</div>
                  </div>
                </div>
              </div>
              {compare && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
                  <h2 className="font-semibold text-slate-900 mb-3">Which ordering rule is fairer?</h2>
                  <div className="grid grid-cols-2 gap-3">
                    {compare.map((c) => (
                      <div key={c.id} className="border border-slate-100 rounded-xl p-4">
                        <div className="text-sm font-semibold text-slate-900">{c.label}</div>
                        <div className="text-2xl font-bold text-slate-900 mt-1">{Number(c.avg).toFixed(1)}<span className="text-sm font-normal text-slate-500"> min avg wait</span></div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    {compare[0].avg <= compare[1].avg
                      ? 'Highest marks first keeps the average wait lower here.'
                      : 'Application order keeps the average wait lower here.'}{' '}
                    Same students, same interviews — only the order changes.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
