// M2 — Scheduling Lab: build an interview set, run FCFS / Priority / Round-Robin,
// see the Gantt chart + averages, and compare all three side by side.

import React, { useState } from 'react';
import { schedule as scheduleApi, errMsg } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import GanttChart from '../../components/GanttChart.jsx';

const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';
const labelCls = 'block text-xs font-medium text-slate-600 mb-1.5';

const ALGOS = [
  { id: 'fcfs', label: 'FCFS', desc: 'First-come, first-served' },
  { id: 'priority', label: 'Priority', desc: 'Highest priority first' },
  { id: 'rr', label: 'Round-Robin', desc: 'Time-sliced, needs quantum' },
];

export default function SchedulingLab() {
  const { toast } = useToast();
  const [rows, setRows] = useState([
    { label: 'Aarav', burst: 6, priority: 2, arrival: 0 },
    { label: 'Diya', burst: 4, priority: 1, arrival: 1 },
    { label: 'Kabir', burst: 5, priority: 3, arrival: 2 },
  ]);
  const [algo, setAlgo] = useState('fcfs');
  const [quantum, setQuantum] = useState(3);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [compare, setCompare] = useState(null);
  const [comparing, setComparing] = useState(false);

  const setRow = (i, key, val) => {
    setRows((r) => r.map((row, j) => (j === i ? { ...row, [key]: val } : row)));
  };
  const addRow = () => setRows((r) => [...r, { label: `P${r.length + 1}`, burst: 4, priority: 1, arrival: 0 }]);
  const removeRow = (i) => setRows((r) => (r.length > 1 ? r.filter((_, j) => j !== i) : r));

  const interviews = rows.map((r, i) => ({
    id: i + 1,
    label: r.label || `P${i + 1}`,
    burst: Math.max(1, Number(r.burst) || 1),
    priority: Number(r.priority) || 0,
    arrival: Math.max(0, Number(r.arrival) || 0),
  }));

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const payload = { algorithm: algo, interviews };
      if (algo === 'rr') payload.quantum = Math.max(1, Number(quantum) || 1);
      const { data } = await scheduleApi.simulate(payload);
      setResult({ ...data, algo });
    } catch (err) {
      toast(errMsg(err, 'The scheduler failed to run.'), 'error');
    } finally {
      setRunning(false);
    }
  };

  const compareAll = async () => {
    setComparing(true);
    setCompare(null);
    try {
      const results = await Promise.all(
        ['fcfs', 'priority', 'rr'].map(async (a) => {
          const payload = { algorithm: a, interviews };
          if (a === 'rr') payload.quantum = Math.max(1, Number(quantum) || 1);
          const { data } = await scheduleApi.simulate(payload);
          return { algo: a, avg_waiting_time: data.avg_waiting_time, avg_turnaround_time: data.avg_turnaround_time };
        })
      );
      setCompare(results);
    } catch (err) {
      toast(errMsg(err, 'Comparison failed.'), 'error');
    } finally {
      setComparing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Builder */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <h2 className="font-semibold text-slate-900 mb-1">Interview set</h2>
          <p className="text-xs text-slate-500 mb-4">Each row is one interview: burst = duration in minutes.</p>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_52px_52px_52px_28px] gap-2 text-xs font-semibold text-slate-500 uppercase">
              <span>Candidate</span><span>Burst</span><span>Prio</span><span>Arr</span><span />
            </div>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_52px_52px_52px_28px] gap-2 items-center">
                <input value={r.label} onChange={(e) => setRow(i, 'label', e.target.value)} className={inputCls} />
                <input type="number" min="1" value={r.burst} onChange={(e) => setRow(i, 'burst', e.target.value)} className={inputCls} />
                <input type="number" min="0" value={r.priority} onChange={(e) => setRow(i, 'priority', e.target.value)} className={inputCls} />
                <input type="number" min="0" value={r.arrival} onChange={(e) => setRow(i, 'arrival', e.target.value)} className={inputCls} />
                <button onClick={() => removeRow(i)} className="text-slate-400 hover:text-rose-600 text-lg leading-none">×</button>
              </div>
            ))}
          </div>
          <button onClick={addRow} className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-700">+ Add interview</button>

          <h2 className="font-semibold text-slate-900 mt-6 mb-2">Algorithm</h2>
          <div className="space-y-2">
            {ALGOS.map((a) => (
              <label key={a.id} className={`flex items-center gap-3 border rounded-xl px-4 py-2.5 cursor-pointer text-sm ${algo === a.id ? 'border-indigo-500 bg-indigo-50/60' : 'border-slate-200'}`}>
                <input type="radio" name="algo" checked={algo === a.id} onChange={() => setAlgo(a.id)} className="accent-indigo-600" />
                <span className="font-semibold text-slate-800 w-24">{a.label}</span>
                <span className="text-slate-500">{a.desc}</span>
              </label>
            ))}
          </div>
          {algo === 'rr' && (
            <div className="mt-3">
              <label className={labelCls}>Time quantum</label>
              <input type="number" min="1" value={quantum} onChange={(e) => setQuantum(e.target.value)} className={inputCls} />
            </div>
          )}

          <div className="flex gap-2 mt-5">
            <button onClick={run} disabled={running}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition-colors">
              {running ? 'Scheduling…' : 'Run schedule'}
            </button>
            <button onClick={compareAll} disabled={comparing}
              className="flex-1 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-60 text-slate-700 text-sm font-semibold rounded-xl px-4 py-2.5 transition-colors">
              {comparing ? 'Comparing…' : 'Compare all'}
            </button>
          </div>
        </div>

        {/* Result */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Gantt chart</h2>
            {!result ? (
              <p className="text-sm text-slate-400 py-8 text-center">Run a schedule to see it drawn here.</p>
            ) : (
              <>
                <GanttChart gantt={result.gantt} />
                <div className="grid grid-cols-3 gap-3 mt-5 text-sm">
                  <div className="bg-slate-50 rounded-xl px-4 py-3">
                    <div className="text-xs text-slate-500 uppercase tracking-wide">Algorithm</div>
                    <div className="font-semibold text-slate-900 mt-0.5">{result.algo.toUpperCase()}</div>
                  </div>
                  <div className="bg-slate-50 rounded-xl px-4 py-3">
                    <div className="text-xs text-slate-500 uppercase tracking-wide">Avg waiting time</div>
                    <div className="font-semibold text-slate-900 mt-0.5">{Number(result.avg_waiting_time ?? 0).toFixed(2)}</div>
                  </div>
                  <div className="bg-slate-50 rounded-xl px-4 py-3">
                    <div className="text-xs text-slate-500 uppercase tracking-wide">Avg turnaround</div>
                    <div className="font-semibold text-slate-900 mt-0.5">{Number(result.avg_turnaround_time ?? 0).toFixed(2)}</div>
                  </div>
                </div>
              </>
            )}
          </div>

          {compare && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <h2 className="font-semibold text-slate-900 mb-3">Algorithm comparison</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-slate-100">
                    <th className="py-2 text-xs font-semibold text-slate-500 uppercase">Algorithm</th>
                    <th className="py-2 text-xs font-semibold text-slate-500 uppercase">Avg waiting</th>
                    <th className="py-2 text-xs font-semibold text-slate-500 uppercase">Avg turnaround</th>
                    <th className="py-2 text-xs font-semibold text-slate-500 uppercase">Winner</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(() => {
                    const best = compare.reduce((m, c) => (Number(c.avg_waiting_time) < Number(m.avg_waiting_time) ? c : m), compare[0]);
                    return compare.map((c) => (
                      <tr key={c.algo} className="hover:bg-slate-50/70">
                        <td className="py-2.5 font-medium text-slate-900">{c.algo.toUpperCase()}{c.algo === 'rr' ? ` (q=${quantum})` : ''}</td>
                        <td className="py-2.5">{Number(c.avg_waiting_time ?? 0).toFixed(2)}</td>
                        <td className="py-2.5">{Number(c.avg_turnaround_time ?? 0).toFixed(2)}</td>
                        <td className="py-2.5">{c.algo === best.algo ? '🏆 lowest wait' : ''}</td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
