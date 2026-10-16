// Recruiter's drive list — compact table with stage and funnel counts.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { drives as drivesApi, errMsg } from '../../api.js';
import { formatDate } from '../../utils.js';
import { useToast } from '../../components/Toast.jsx';
import Badge from '../../components/Badge.jsx';
import DataTable from '../../components/DataTable.jsx';
import EmptyState from '../../components/EmptyState.jsx';

const STAGE_VARIANT = { open: 'success', testing: 'info', interviews: 'warning', closed: 'neutral', draft: 'neutral' };

export default function MyDrives() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [drives, setDrives] = useState([]);

  useEffect(() => {
    drivesApi.list()
      .then(({ data }) => setDrives(data ?? []))
      .catch((err) => toast(errMsg(err, 'Could not load drives.'), 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="text-sm text-slate-500 py-10 text-center">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{drives.length} drive{drives.length !== 1 && 's'} total</p>
        <Link to="/recruiter/drives/new" className="cf-btn-primary">Add Drive</Link>
      </div>
      <div className="cf-card !p-2 cf-rise">
        {drives.length === 0 ? (
          <EmptyState title="No drives yet" message="Add your first drive to get started." />
        ) : (
          <DataTable
            columns={[
              { key: 'title', label: 'Drive', render: (d) => (
                <Link to={`/recruiter/drives/${d.id}`} className="font-semibold text-indigo-700 hover:text-indigo-900">
                  {d.title}<span className="block text-xs font-normal text-slate-400">{d.company?.name}</span>
                </Link>
              )},
              { key: 'stage', label: 'Stage', render: (d) => <Badge variant={STAGE_VARIANT[d.status] ?? 'neutral'}>{d.status}</Badge> },
              { key: 'applied', label: 'Applied', render: (d) => <span className="font-semibold">{d.counts?.applied ?? 0}</span> },
              { key: 'shortlisted', label: 'Shortlisted', render: (d) => d.counts?.shortlisted ?? 0 },
              { key: 'deadline', label: 'Apply by', render: (d) => formatDate(d.application_deadline).split(',')[0] },
              { key: 'open', label: '', render: (d) => <Link to={`/recruiter/drives/${d.id}`} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">Open →</Link> },
            ]}
            rows={drives}
          />
        )}
      </div>
    </div>
  );
}
