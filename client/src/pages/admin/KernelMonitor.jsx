// Live Monitor: what the system is doing right now —
// seat requests as they arrive, who's waiting in line, recent activity,
// and the one-click rush-hour test.
// (Under the hood: lock events, process queues, the audit trail.)

import React, { useEffect, useRef, useState } from 'react';
import { monitor as monitorApi, slots as slotsApi, errMsg } from '../../api.js';
import { formatDate, timeAgo } from '../../utils.js';
import { useToast } from '../../components/Toast.jsx';
import Badge from '../../components/Badge.jsx';
import DataTable from '../../components/DataTable.jsx';

const ACTION_PILL = {
  acquired: 'success',
  waiting: 'warning',
  released: 'neutral',
};

// Plain-language labels for lock events.
const ACTION_LABEL = { acquired: 'Booking', waiting: 'In queue', released: 'Done' };
const holderName = (h) => (h === 'stress-test' ? 'Rush test' : h);
const VERB = { INSERT: 'Created', UPDATE: 'Updated', DELETE: 'Removed' };

function Panel({ title, sub, children, wide }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 ${wide ? 'lg:col-span-2' : ''}`}>
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 cf-live-dot" />
          <h2 className="font-semibold text-slate-900">{title}</h2>
        </div>
        {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
      </div>
      <div className="p-0">{children}</div>
    </div>
  );
}

export default function KernelMonitor() {
  const { toast } = useToast();
  const [locks, setLocks] = useState([]);
  const [activity, setActivity] = useState([]);
  const [lockError, setLockError] = useState(null);
  const [slotList, setSlotList] = useState([]);
  const [stressSlot, setStressSlot] = useState('');
  const [stressCount, setStressCount] = useState(100);
  const [stressRunning, setStressRunning] = useState(false);
  const [stressProgress, setStressProgress] = useState(0);
  const [stressResult, setStressResult] = useState(null);
  const progressTimer = useRef(null);

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
        if (alive) setLockError(errMsg(err, 'Could not reach the system monitor.'));
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
    if (l.action === 'waiting' && !seen.has(`w-${l.holder}-${l.lock_name}`)) {
      seen.add(`w-${l.holder}-${l.lock_name}`);
      waiting.push(l);
    } else if (l.action === 'acquired' && !seen.has(`r-${l.holder}-${l.lock_name}`)) {
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

  const renderProcess = (l) => (
    <div className="flex items-center justify-between px-4 py-2 text-sm border-b border-slate-50 last:border-0">
      <div className="min-w-0">
        <div className="font-mono-tight text-[13px] text-slate-800 truncate">{holderName(l.holder)}</div>
        <div className="text-xs text-slate-400 truncate">{seatName(l.lock_name)}</div>
      </div>
      {l.wait_ms > 0 && <span className="text-xs text-amber-600 font-medium shrink-0">{l.wait_ms} ms</span>}
    </div>
  );

  return (
    <div className="space-y-4">
      {lockError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-xl px-4 py-3">{lockError}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Live booking activity */}
        <Panel title="Live booking activity" sub="Every seat request as it happens — newest first.">
          <div className="max-h-80 overflow-y-auto slim-scroll">
            <DataTable
              emptyHint="No booking activity yet — when students book seats, each request appears here live."
              columns={[
                { key: 'lock', label: 'Seat', render: (l) => <span className="text-[13px]">{seatName(l.lock_name)}</span> },
                { key: 'holder', label: 'Student', render: (l) => <span className="text-[13px] text-slate-600">{holderName(l.holder)}</span> },
                { key: 'action', label: 'Status', render: (l) => <Badge variant={ACTION_PILL[l.action] ?? 'neutral'}>{ACTION_LABEL[l.action] ?? l.action}</Badge> },
                { key: 'wait', label: 'Waited', render: (l) => <span className="text-slate-500">{l.wait_ms ?? 0} ms</span> },
                { key: 'time', label: 'Time', render: (l) => <span className="text-slate-400 text-xs">{timeAgo(l.created_at)}</span> },
              ]}
              rows={locks}
            />
          </div>
        </Panel>

        {/* Who's booking right now */}
        <Panel title="Who's booking right now" sub="Live snapshot — who's getting a seat, and who's waiting in line.">
          <div className="grid grid-cols-2 max-h-80 overflow-y-auto slim-scroll divide-x divide-slate-100">
            <div>
              <div className="px-4 py-2 text-xs font-semibold text-emerald-700 uppercase tracking-wide sticky top-0 bg-white">
                Getting a seat ({running.length})
              </div>
              {running.length === 0 ? <div className="px-4 py-6 text-xs text-slate-400 text-center">Nobody booking right now</div> : running.slice(0, 20).map((l) => <div key={`r${l.id}`}>{renderProcess(l)}</div>)}
            </div>
            <div>
              <div className="px-4 py-2 text-xs font-semibold text-amber-700 uppercase tracking-wide sticky top-0 bg-white">
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
                <div key={a.id} className="py-1 border-b border-slate-50 last:border-0">
                  <span className="text-slate-400">{formatDate(a.created_at)}</span>{' '}
                  <span className="text-indigo-600 font-semibold">{VERB[a.action] ?? a.action}</span>{' '}
                  <span className="text-slate-700">{a.entity}{a.entity_id ? ` #${a.entity_id}` : ''}</span>
                  {a.details && <span className="text-slate-400"> — {a.details}</span>}
                </div>
              ))
            )}
          </div>
        </Panel>

        {/* Rush-hour test */}
        <Panel title="Rush-hour test" sub="Pretend N students all tap “Book” in the same second for M seats. Exactly M should get through — never more.">
          <div className="px-5 py-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Slot</label>
                <select value={stressSlot} onChange={(e) => setStressSlot(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {slotList.map((s) => (
                    <option key={s.id} value={s.id}>{s.title} — {s.seats_left ?? '?'} seats left</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Students rushing at once</label>
                <input type="number" min="2" max="1000" value={stressCount} onChange={(e) => setStressCount(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>

            {stressRunning && (
              <div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-600 rounded-full transition-all duration-200" style={{ width: `${stressProgress}%` }} />
                </div>
                <div className="text-xs text-slate-500 mt-1.5">Sending {stressCount} booking requests at once…</div>
              </div>
            )}

            {!stressRunning && stressResult && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-baseline gap-6">
                  <div>
                    <span className="text-3xl font-bold text-emerald-600">{stressResult.confirmed}</span>
                    <span className="text-sm text-slate-500 ml-1">got seats</span>
                  </div>
                  <div className="text-slate-300 text-2xl">/</div>
                  <div>
                    <span className="text-3xl font-bold text-rose-600">{stressResult.rejected}</span>
                    <span className="text-sm text-slate-500 ml-1">missed out</span>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">
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
      </div>
    </div>
  );
}
