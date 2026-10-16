// M4 — Admin dashboard: fleet-wide stat cards from /monitor/stats + recent activity feed.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { monitor as monitorApi, errMsg } from '../../api.js';
import { timeAgo } from '../../utils.js';
import { useToast } from '../../components/Toast.jsx';
import StatCard from '../../components/StatCard.jsx';

export default function AdminDashboard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: s }, { data: a }] = await Promise.all([monitorApi.stats(), monitorApi.activity(10)]);
        setStats(s);
        setActivity(a ?? []);
      } catch (err) {
        toast(errMsg(err, 'Could not load the dashboard.'), 'error');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="text-sm text-slate-500 py-10 text-center">Loading dashboard…</div>;

  const cards = [
    ['Students', stats?.students ?? 0, 'indigo'],
    ['Drives', stats?.drives ?? 0, 'emerald'],
    ['Applications', stats?.applications ?? 0, 'amber'],
    ['Bookings', stats?.bookings ?? 0, 'rose'],
    ['Resources', stats?.resources ?? 0, 'slate'],
    ['Active locks', stats?.active_locks ?? 0, 'indigo'],
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {cards.map(([label, value, accent]) => (
          <StatCard key={label} label={label} value={value} accent={accent} icon={null} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Recent activity</h2>
            <Link to="/admin/monitor" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">Kernel Monitor</Link>
          </div>
          {activity.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">No activity recorded yet.</div>
          ) : (
            <ul className="divide-y divide-slate-50">
              {activity.map((a) => (
                <li key={a.id} className="px-5 py-3 text-sm">
                  <span className="font-medium text-slate-800">{a.action}</span>
                  <span className="text-slate-500"> · {a.entity}{a.entity_id ? ` #${a.entity_id}` : ''}</span>
                  <span className="block text-xs text-slate-400 mt-0.5">{timeAgo(a.created_at)}{a.details ? ` — ${a.details}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="font-semibold text-slate-900 mb-2">The demos that sell this project</h2>
          <ul className="space-y-3 text-sm text-slate-600">
            <li><Link to="/admin/monitor" className="text-indigo-600 font-medium hover:underline">Kernel Monitor</Link> — live lock table, process queues, transaction log.</li>
            <li><Link to="/admin/scheduling" className="text-indigo-600 font-medium hover:underline">Scheduling Lab</Link> — FCFS vs Priority vs Round-Robin on real interview data, with Gantt charts.</li>
            <li><Link to="/admin/resources" className="text-indigo-600 font-medium hover:underline">Resources</Link> — Banker's safety check refuses unsafe allocations with an explanation.</li>
          </ul>
          <p className="text-xs text-slate-400 mt-4">Tip: run the Concurrency Stress Test on the Kernel Monitor page and watch exactly the right number of seats get confirmed.</p>
        </div>
      </div>
    </div>
  );
}
