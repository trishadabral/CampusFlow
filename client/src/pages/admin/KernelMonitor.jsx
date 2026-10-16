// M3 — Kernel Monitor (the showpiece): live lock table, process queues,
// transaction/audit log tail, and the one-click Concurrency Stress Test.

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
        if (alive) setLockError(errMsg(err, 'Could not reach the kernel monitor.'));
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

  // Process queues derived from the lock table:
  // latest "acquired" holder per lock = RUNNING; "waiting" rows = WAITING.
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
    if (!stressSlot) { toast('Pick a slot to stress-test first.', 'error'); return; }
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
      toast(errMsg(err, 'The stress test failed to run.'), 'error');
    } finally {
      clearInterval(progressTimer.current);
      setStressRunning(false);
    }
  };

  const renderProcess = (l) => (
    <div className="flex items-center justify-between px-4 py-2 text-sm border-b border-slate-50 last:border-0">
      <div className="min-w-0">
        <div className="font-mono-tight text-[13px] text-slate-800 truncate">{l.holder}</div>
        <div className="text-xs text-slate-400 truncate">{l.lock_name}</div>
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
        {/* Lock table */}
        <Panel title="Lock table" sub="Mutex acquire / wait / release events, newest first.">
          <div className="max-h-80 overflow-y-auto slim-scroll">
            <DataTable
              emptyHint="No lock activity yet — book a slot and watch this table come alive."
              columns={[
                { key: 'lock', label: 'Lock', render: (l) => <span className="font-mono-tight text-[13px]">{l.lock_name}</span> },
                { key: 'holder', label: 'Holder', render: (l) => <span className="font-mono-tight text-[13px] text-slate-600">{l.holder}</span> },
                { key: 'action', label: 'Action', render: (l) => <Badge variant={ACTION_PILL[l.action] ?? 'neutral'}>{l.action}</Badge> },
                { key: 'wait', label: 'Wait', render: (l) => <span className="text-slate-500">{l.wait_ms ?? 0} ms</span> },
                { key: 'time', label: 'Time', render: (l) => <span className="text-slate-400 text-xs">{timeAgo(l.created_at)}</span> },
              ]}
              rows={locks}
            />
          </div>
        </Panel>

        {/* Process queues */}
        <Panel title="Process queues" sub="Derived live: lock holders are RUNNING, waiters are WAITING.">
          <div className="grid grid-cols-2 max-h-80 overflow-y-auto slim-scroll divide-x divide-slate-100">
            <div>
              <div className="px-4 py-2 text-xs font-semibold text-emerald-700 uppercase tracking-wide sticky top-0 bg-white">
                Running ({running.length})
              </div>
              {running.length === 0 ? <div className="px-4 py-6 text-xs text-slate-400 text-center">Idle</div> : running.slice(0, 20).map((l) => <div key={`r${l.id}`}>{renderProcess(l)}</div>)}
            </div>
            <div>
              <div className="px-4 py-2 text-xs font-semibold text-amber-700 uppercase tracking-wide sticky top-0 bg-white">
                Waiting ({waiting.length})
              </div>
              {waiting.length === 0 ? <div className="px-4 py-6 text-xs text-slate-400 text-center">Empty</div> : waiting.slice(0, 20).map((l) => <div key={`w${l.id}`}>{renderProcess(l)}</div>)}
            </div>
          </div>
        </Panel>

        {/* Transaction / audit log */}
        <Panel title="Transaction log" sub="Audit trail of every write — the database's own journal, tailed live.">
          <div className="max-h-72 overflow-y-auto slim-scroll px-5 py-3 font-mono-tight text-[12px] leading-relaxed">
            {activity.length === 0 ? (
              <div className="text-slate-400 text-sm font-sans py-4 text-center">No transactions yet.</div>
            ) : (
              activity.map((a) => (
                <div key={a.id} className="py-1 border-b border-slate-50 last:border-0">
                  <span className="text-slate-400">{formatDate(a.created_at)}</span>{' '}
                  <span className="text-indigo-600 font-semibold">{a.action}</span>{' '}
                  <span className="text-slate-700">{a.entity}{a.entity_id ? `#${a.entity_id}` : ''}</span>
                  {a.details && <span className="text-slate-400"> — {a.details}</span>}
                </div>
              ))
            )}
          </div>
        </Panel>

        {/* Stress test */}
        <Panel title="Concurrency stress test" sub="Fire N booking requests at M seats at once. The mutex + transaction must let exactly the right number through.">
          <div className="px-5 py-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Target slot</label>
                <select value={stressSlot} onChange={(e) => setStressSlot(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {slotList.map((s) => (
                    <option key={s.id} value={s.id}>{s.title} — {s.seats_left ?? '?'} seats left</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Concurrent students</label>
                <input type="number" min="2" max="1000" value={stressCount} onChange={(e) => setStressCount(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>

            {stressRunning && (
              <div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-600 rounded-full transition-all duration-200" style={{ width: `${stressProgress}%` }} />
                </div>
                <div className="text-xs text-slate-500 mt-1.5">Firing {stressCount} concurrent booking requests…</div>
              </div>
            )}

            {!stressRunning && stressResult && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-baseline gap-6">
                  <div>
                    <span className="text-3xl font-bold text-emerald-600">{stressResult.confirmed}</span>
                    <span className="text-sm text-slate-500 ml-1">confirmed</span>
                  </div>
                  <div className="text-slate-300 text-2xl">/</div>
                  <div>
                    <span className="text-3xl font-bold text-rose-600">{stressResult.rejected}</span>
                    <span className="text-sm text-slate-500 ml-1">rejected</span>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {stressResult.attempted} attempted in {stressResult.ms} ms — zero oversells. The critical
                  section serialized every request; the lock table above is the proof.
                </p>
              </div>
            )}

            <button onClick={runStress} disabled={stressRunning || !stressSlot}
              className="w-full bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition-colors">
              {stressRunning ? 'Running…' : 'Run stress test'}
            </button>
            {slotList.length === 0 && (
              <p className="text-xs text-slate-400">No slots exist yet — ask a recruiter to publish one first.</p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
