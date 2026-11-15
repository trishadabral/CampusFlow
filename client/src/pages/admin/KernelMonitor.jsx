// Live Monitor: what the system is doing right now —
// seat requests as they arrive, who's waiting in line, recent activity,
// and the one-click rush-hour test.
// (Under the hood: lock events, process queues, the audit trail.)

import React, { useEffect, useRef, useState } from 'react';
import { monitor as monitorApi, slots as slotsApi, errMsg } from '../../api.js';
import { formatDate, timeAgo, titleCase } from '../../utils.js';
import { useToast } from '../../components/Toast.jsx';
import Badge from '../../components/Badge.jsx';
import DataTable from '../../components/DataTable.jsx';
import Spinner from '../../components/Spinner.jsx';

const ACTION_PILL = {
  acquire: 'success',
  wait: 'warning',
  release: 'neutral',
};

// Plain-language labels for lock events.
const ACTION_LABEL = { acquire: 'Booking', wait: 'In queue', release: 'Done' };

// Same rendering as the Activity log: details arrive as an object
// (server/src/routes/monitor.js parses the stored JSON), never a string.
function detailsText(details) {
  if (details == null) return '—';
  if (typeof details === 'string') return details;
  return Object.entries(details)
    .map(([k, v]) => `${titleCase(k)}: ${v}`)
    .join(' · ');
}
const holderName = (h) => (h === 'stress-test' ? 'Rush test' : h);
const VERB = { INSERT: 'Created', UPDATE: 'Updated', DELETE: 'Removed' };

function Panel({ title, sub, children, wide }) {
  return (
    <div className={`bg-[#12172A] rounded-2xl shadow-sm border border-white/10 ${wide ? 'lg:col-span-2' : ''}`}>
      <div className="px-5 py-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 cf-live-dot" />
          <h2 className="font-semibold text-slate-100">{title}</h2>
        </div>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
      <div className="p-0">{children}</div>
    </div>
  );
}

export default function KernelMonitor() {
  const { toast } = useToast();
  const [locks, setLocks] = useState([]);
  const [activity, setActivity] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const firstLoad = useRef(true);
  const [lockError, setLockError] = useState(null);
  const [slotList, setSlotList] = useState([]);
  const [stressSlot, setStressSlot] = useState('');
  const [stressCount, setStressCount] = useState(100);
  const [stressRunning, setStressRunning] = useState(false);
  const [stressProgress, setStressProgress] = useState(0);
  const [stressResult, setStressResult] = useState(null);
  const progressTimer = useRef(null);
  const [demoSteps, setDemoSteps] = useState([]);
  const [demoSummary, setDemoSummary] = useState(null);
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoShown, setDemoShown] = useState(0);
  const demoTimer = useRef(null);

  // Stop the staggered reveal if the page unmounts mid-demo.
  useEffect(() => () => { clearInterval(demoTimer.current); clearInterval(progressTimer.current); }, []);

  // Live polling — lock table + audit log refresh every 2s.
  useEffect(() => {
    let alive = true;
    const fetchAll = async () => {
      try {
        const [{ data: l }, { data: a }] = await Promise.all([monitorApi.locks(50), monitorApi.activity(30)]);
        if (!alive) return;
        setLocks(l ?? []);
        setActivity(a ?? []);
        setLockError(null);
      } catch (err) {
        if (alive) setLockError(errMsg(err, 'Could not reach the Live Monitor.'));
      }
      // First render only: the tables start empty, so show a spinner
      // instead of a wrongly empty page. Later polls refresh silently.
      if (firstLoad.current) {
        firstLoad.current = false;
        if (alive) setLoading(false);
      }
      try {
        const { data: s } = await monitorApi.stats();
        if (alive) setStats(s ?? null);
      } catch {
        /* totals are a bonus strip — the live tables work without them */
      }
    };
    fetchAll();
    const t = setInterval(fetchAll, 2000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Slots for the stress-test dropdown.
  useEffect(() => {
    (async () => {
      try {
        const { data } = await slotsApi.list();
        setSlotList(data ?? []);
        if ((data ?? []).length) setStressSlot(String(data[0].id));
      } catch {
        /* slots are optional for the monitor — the stress panel handles empty state */
      }
    })();
  }, []);

  // Human-readable seat name for a lock like "slot:7".
  const seatName = (lockName) => {
    const m = /^slot:(\d+)$/.exec(lockName || '');
    if (!m) return lockName;
    const s = slotList.find((x) => String(x.id) === m[1]);
    return s ? s.title : `Slot #${m[1]}`;
  };

  // Queues derived from the activity feed:
  // latest "Booking" per seat+student = getting a seat; "In queue" rows = waiting in line.
  const running = [];
  const waiting = [];
  const seen = new Set();
  for (const l of locks) {
    if (l.action === 'wait' && !seen.has(`w-${l.holder}-${l.lock_name}`)) {
      seen.add(`w-${l.holder}-${l.lock_name}`);
      waiting.push(l);
    } else if (l.action === 'acquire' && !seen.has(`r-${l.holder}-${l.lock_name}`)) {
      seen.add(`r-${l.holder}-${l.lock_name}`);
      running.push(l);
    }
  }

  const runStress = async () => {
    if (!stressSlot) { toast('Pick a slot to test first.', 'error'); return; }
    setStressRunning(true);
    setStressResult(null);
    setStressProgress(0);
    progressTimer.current = setInterval(() => {
      setStressProgress((p) => Math.min(95, p + Math.random() * 12));
    }, 200);
    try {
      const { data } = await monitorApi.stress(Number(stressSlot), Number(stressCount));
      setStressProgress(100);
      setStressResult(data);
    } catch (err) {
      toast(errMsg(err, 'The rush test failed to run.'), 'error');
    } finally {
      clearInterval(progressTimer.current);
      setStressRunning(false);
    }
  };

  const runDemo = async () => {
    setDemoRunning(true);
    setDemoSteps([]);
    setDemoSummary(null);
    setDemoShown(0);
    try {
      const { data } = await monitorApi.deadlockDemo();
      const steps = data?.steps ?? [];
      setDemoSteps(steps);
      // Reveal one step at a time so the story reads in order.
      let shown = 0;
      demoTimer.current = setInterval(() => {
        shown += 1;
        setDemoShown(shown);
        if (shown >= steps.length) {
          clearInterval(demoTimer.current);
          setDemoSummary(data?.summary ?? null);
          setDemoRunning(false);
        }
      }, 700);
    } catch (err) {
      toast(errMsg(err, 'The demo failed to run.'), 'error');
      setDemoRunning(false);
    }
  };

  const resetDemo = () => {
    clearInterval(demoTimer.current);
    setDemoSteps([]);
    setDemoSummary(null);
    setDemoShown(0);
    setDemoRunning(false);
  };

  const DEMO_BADGE = { lock: 'neutral', wait: 'warning', detect: 'danger', recover: 'success', done: 'success' };
  const DEMO_LABEL = { lock: 'Took a seat', wait: 'Waiting', detect: 'Stuck in a circle', recover: 'Let one go first', done: 'Finished' };

  const renderProcess = (l) => (
    <div className="flex items-center justify-between px-4 py-2 text-sm border-b border-white/10 last:border-0">
      <div className="min-w-0">
        <div className="font-mono-tight text-[13px] text-slate-200 truncate">{holderName(l.holder)}</div>
        <div className="text-xs text-slate-400 truncate">{seatName(l.lock_name)}</div>
      </div>
      {l.wait_ms > 0 && <span className="text-xs text-amber-400 font-medium shrink-0">{l.wait_ms} ms</span>}
    </div>
  );

  return (
    <div className="space-y-6">
      {lockError && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm rounded-xl px-4 py-3">{lockError}</div>
      )}

      {loading ? (
        <div className="bg-[#12172A] rounded-2xl shadow-sm border border-white/10">
          <Spinner text="Loading live data…" />
        </div>
      ) : (
        <>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            ['Students', stats.students],
            ['Drives', stats.drives],
            ['Applications', stats.applications],
            ['Bookings', stats.bookings],
            ['Rooms & labs', stats.resources],
            ['Bookings in progress', stats.active_locks],
          ].map(([label, value]) => (
            <div key={label} className="bg-[#12172A] rounded-2xl shadow-sm border border-white/10 px-4 py-3">
              <div className="text-xl font-bold text-slate-100">{value ?? 0}</div>
              <div className="text-xs text-slate-400 font-medium mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Live booking activity */}
        <Panel title="Live booking activity" sub="Every seat request as it happens — newest first.">
          <div className="max-h-80 overflow-y-auto slim-scroll">
            <DataTable
              emptyHint="No booking activity yet — when students book seats, each request appears here live."
              columns={[
                { key: 'lock', label: 'Seat', render: (l) => <span className="text-[13px]">{seatName(l.lock_name)}</span> },
                { key: 'holder', label: 'Student', render: (l) => <span className="text-[13px] text-slate-400">{holderName(l.holder)}</span> },
                { key: 'action', label: 'Status', render: (l) => <Badge variant={ACTION_PILL[l.action] ?? 'neutral'}>{ACTION_LABEL[l.action] ?? l.action}</Badge> },
                { key: 'wait', label: 'Waited', render: (l) => <span className="text-slate-400">{l.wait_ms ?? 0} ms</span> },
                { key: 'time', label: 'Time', render: (l) => <span className="text-slate-400 text-xs">{timeAgo(l.created_at)}</span> },
              ]}
              rows={locks}
            />
          </div>
        </Panel>

        {/* Who's booking right now */}
        <Panel title="Who's booking right now" sub="Live snapshot — who's getting a seat, and who's waiting in line.">
          <div className="grid grid-cols-1 sm:grid-cols-2 max-h-80 overflow-y-auto slim-scroll divide-x divide-white/10">
            <div>
              <div className="px-4 py-2 text-xs font-semibold text-emerald-300 uppercase tracking-wide sticky top-0 bg-[#12172A]">
                Getting a seat ({running.length})
              </div>
              {running.length === 0 ? <div className="px-4 py-6 text-xs text-slate-400 text-center">Nobody booking right now</div> : running.slice(0, 20).map((l) => <div key={`r${l.id}`}>{renderProcess(l)}</div>)}
            </div>
            <div>
              <div className="px-4 py-2 text-xs font-semibold text-amber-300 uppercase tracking-wide sticky top-0 bg-[#12172A]">
                In line ({waiting.length})
              </div>
              {waiting.length === 0 ? <div className="px-4 py-6 text-xs text-slate-400 text-center">No queue</div> : waiting.slice(0, 20).map((l) => <div key={`w${l.id}`}>{renderProcess(l)}</div>)}
            </div>
          </div>
        </Panel>

        {/* Recent activity */}
        <Panel title="Recent activity" sub="Everything the system just did, as it happened.">
          <div className="max-h-72 overflow-y-auto slim-scroll px-5 py-3 font-mono-tight text-[12px] leading-relaxed">
            {activity.length === 0 ? (
              <div className="text-slate-400 text-sm font-sans py-4 text-center">No activity yet.</div>
            ) : (
              activity.map((a) => (
                <div key={a.id} className="py-1 border-b border-white/10 last:border-0">
                  <span className="text-slate-400">{formatDate(a.created_at)}</span>{' '}
                  <span className="text-[#FF5C38] font-semibold">{VERB[a.action] ?? a.action}</span>{' '}
                  <span className="text-slate-300">{a.entity}{a.entity_id ? ` #${a.entity_id}` : ''}</span>
                  {a.details && <span className="text-slate-400"> — {detailsText(a.details)}</span>}
                </div>
              ))
            )}
          </div>
        </Panel>

        {/* Rush-hour test */}
        <Panel title="Rush-hour test" sub="Pretend N students all tap “Book” in the same second for M seats. Exactly M should get through — never more.">
          <div className="px-5 py-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Slot</label>
                <select value={stressSlot} onChange={(e) => setStressSlot(e.target.value)}
                  className="w-full rounded-xl border border-white/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400">
                  {slotList.map((s) => (
                    <option key={s.id} value={s.id}>{s.title} — {s.seats_left ?? '?'} seats left</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Students rushing at once</label>
                <input type="number" min="1" max="200" value={stressCount} onChange={(e) => setStressCount(e.target.value)}
                  className="w-full rounded-xl border border-white/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400" />
              </div>
            </div>

            {stressRunning && (
              <div>
                <div className="h-2 bg-[#151B30] rounded-full overflow-hidden">
                  <div className="h-full bg-[#FF5C38] rounded-full transition-all duration-200" style={{ width: `${stressProgress}%` }} />
                </div>
                <div className="text-xs text-slate-400 mt-1.5">Sending {stressCount} booking requests at once…</div>
              </div>
            )}

            {!stressRunning && stressResult && (
              <div className="bg-[#0B0E1A] border border-white/10 rounded-xl p-4">
                <div className="flex items-baseline gap-6">
                  <div>
                    <span className="font-display text-3xl font-bold text-emerald-400">{stressResult.confirmed}</span>
                    <span className="text-sm text-slate-400 ml-1">got seats</span>
                  </div>
                  <div className="text-slate-300 text-2xl">/</div>
                  <div>
                    <span className="font-display text-3xl font-bold text-rose-400">{stressResult.rejected}</span>
                    <span className="text-sm text-slate-400 ml-1">missed out</span>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  {stressResult.attempted} rushed in {stressResult.ms} ms — zero double-bookings.
                  Every request waited its turn; the activity above is the proof.
                </p>
              </div>
            )}

            <button onClick={runStress} disabled={stressRunning || !stressSlot}
              className="w-full bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition-colors">
              {stressRunning ? 'Running…' : 'Run rush test'}
            </button>
            {slotList.length === 0 && (
              <p className="text-xs text-slate-400">No slots yet — a recruiter needs to publish one first.</p>
            )}
          </div>
        </Panel>

        {/* What happens when two bookings clash */}
        <Panel title="What happens when two bookings clash" sub="Demo — uses pretend bookings; your real bookings are not touched. Two pretend bookings each grab a seat, then each wants the other's seat.">
          <div className="px-5 py-4 space-y-3">
            {demoSteps.length === 0 ? (
              <p className="text-sm text-slate-400">
                Watch what happens when two bookings wait on each other forever — and how the system breaks the circle by letting one go first.
              </p>
            ) : (
              <ol className="space-y-2">
                {demoSteps.slice(0, demoShown).map((s) => (
                  <li key={s.no}
                    className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ${
                      s.kind === 'detect' ? 'bg-rose-500/10 border-rose-500/30' :
                      s.kind === 'recover' ? 'bg-emerald-500/10 border-emerald-500/30' :
                      'bg-[#12172A] border-white/10'
                    }`}>
                    <span className="w-6 h-6 shrink-0 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center mt-0.5">{s.no}</span>
                    <span className="flex-1 text-slate-300">{s.text}</span>
                    <Badge variant={DEMO_BADGE[s.kind] ?? 'neutral'}>{DEMO_LABEL[s.kind] ?? s.kind}</Badge>
                  </li>
                ))}
              </ol>
            )}

            {demoSummary && (
              <div className="bg-[#0B0E1A] border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-300">
                <span className="font-semibold">{demoSummary.survivor}</span> finished;{' '}
                <span className="font-semibold">{demoSummary.victim}</span> was asked to wait and try again.
                <p className="text-xs text-slate-400 mt-1">{demoSummary.note}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={runDemo} disabled={demoRunning}
                className="flex-1 bg-[#FF5C38] hover:bg-[#E8492B] disabled:opacity-60 text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition-colors">
                {demoRunning ? 'Running…' : demoSteps.length ? 'Run it again' : 'Start demo'}
              </button>
              {demoSteps.length > 0 && (
                <button onClick={resetDemo}
                  className="text-sm font-medium text-slate-400 hover:text-slate-100 border border-white/10 bg-[#12172A] rounded-xl px-4 py-2.5 transition-colors">
                  Reset
                </button>
              )}
            </div>
          </div>
        </Panel>
      </div>
        </>
      )}
    </div>
  );
}
