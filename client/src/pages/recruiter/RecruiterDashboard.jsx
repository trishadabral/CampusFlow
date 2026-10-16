// M2 — Recruiter dashboard: pipeline at a glance across all drives.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { drives as drivesApi, errMsg } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import StatCard from '../../components/StatCard.jsx';
import Badge from '../../components/Badge.jsx';

export default function RecruiterDashboard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [drives, setDrives] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await drivesApi.list({});
        setDrives(data ?? []);
      } catch (err) {
        toast(errMsg(err, 'Could not load drives.'), 'error');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="text-sm text-slate-500 py-10 text-center">Loading dashboard…</div>;

  const applied = drives.reduce((n, d) => n + (d.counts?.applied ?? 0), 0);
  const shortlisted = drives.reduce((n, d) => n + (d.counts?.shortlisted ?? 0), 0);
  const open = drives.filter((d) => d.status === 'open').length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Drives" value={drives.length} accent="indigo" icon={null} />
        <StatCard label="Open drives" value={open} accent="emerald" icon={null} />
        <StatCard label="Applications" value={applied} accent="amber" icon={null} />
        <StatCard label="Shortlisted" value={shortlisted} accent="rose" icon={null} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Drive pipeline</h2>
          <Link to="/recruiter/drives" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">Manage drives</Link>
        </div>
        {drives.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">
            No drives yet. Create your first drive to start collecting applications.
          </div>
        ) : (
          <ul className="divide-y divide-slate-50">
            {drives.map((d) => (
              <li key={d.id}>
                <Link to={`/recruiter/drives/${d.id}`} className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{d.title}</div>
                    <div className="text-sm text-slate-500">{d.company?.name}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={d.status === 'open' ? 'success' : 'neutral'}>{d.status}</Badge>
                    <span className="text-xs text-slate-500">{d.counts?.applied ?? 0} applied · {d.counts?.shortlisted ?? 0} shortlisted</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
