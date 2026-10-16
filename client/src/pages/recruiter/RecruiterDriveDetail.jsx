// M2 — Recruiter drive detail: criteria summary, one-click eligibility engine
// (sp_generate_shortlist), shortlist results with per-student reasons, applications, slots.

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { drives as drivesApi, slots as slotsApi, errMsg } from '../../api.js';
import { formatDate } from '../../utils.js';
import { useToast } from '../../components/Toast.jsx';
import Badge from '../../components/Badge.jsx';
import DataTable from '../../components/DataTable.jsx';

const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';
const labelCls = 'block text-sm font-medium text-slate-700 mb-1.5';

export default function RecruiterDriveDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [drive, setDrive] = useState(null);
  const [apps, setApps] = useState([]);
  const [slotList, setSlotList] = useState([]);
  const [running, setRunning] = useState(false);
  const [shortlistedCount, setShortlistedCount] = useState(null);
  const [savingSlot, setSavingSlot] = useState(false);
  const [slotForm, setSlotForm] = useState({ type: 'test', title: '', starts_at: '', ends_at: '', capacity: '30' });

  const load = async () => {
    try {
      const [{ data: d }, { data: a }, { data: s }] = await Promise.all([
        drivesApi.get(id), drivesApi.applications(id), slotsApi.list(id),
      ]);
      setDrive(d.drive ?? d);
      setApps(a ?? []);
      setSlotList(s ?? []);
    } catch (err) {
      toast(errMsg(err, 'Could not load this drive.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const runEngine = async () => {
    setRunning(true);
    setShortlistedCount(null);
    try {
      const { data } = await drivesApi.shortlist(id);
      setShortlistedCount(data.shortlisted ?? 0);
      toast(`Eligibility engine shortlisted ${data.shortlisted ?? 0} students.`, 'success');
      const { data: a } = await drivesApi.applications(id);
      setApps(a ?? []);
    } catch (err) {
      toast(errMsg(err, 'The eligibility engine failed to run.'), 'error');
    } finally {
      setRunning(false);
    }
  };

  const createSlot = async (e) => {
    e.preventDefault();
    if (!slotForm.title.trim() || !slotForm.starts_at || !slotForm.ends_at) {
      toast('Fill in the slot title, start and end time.', 'error');
      return;
    }
    setSavingSlot(true);
    try {
      await slotsApi.create({
        drive_id: Number(id),
        type: slotForm.type,
        title: slotForm.title.trim(),
        starts_at: slotForm.starts_at,
        ends_at: slotForm.ends_at,
        capacity: Number(slotForm.capacity),
      });
      toast('Slot published. Students can book it now.', 'success');
      setSlotForm({ type: 'test', title: '', starts_at: '', ends_at: '', capacity: '30' });
      const { data: s } = await slotsApi.list(id);
      setSlotList(s ?? []);
    } catch (err) {
      toast(errMsg(err, 'Could not create the slot.'), 'error');
    } finally {
      setSavingSlot(false);
    }
  };

  if (loading) return <div className="text-sm text-slate-500 py-10 text-center">Loading drive…</div>;
  if (!drive) return <div className="text-sm text-slate-500 py-10 text-center">Drive not found.</div>;

  const passCount = apps.filter((a) => a.eligible).length;

  return (
    <div className="space-y-6">
      {/* Header + criteria */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-sm text-slate-500">{drive.company?.name}</div>
            <h2 className="text-xl font-bold text-slate-900">{drive.title}</h2>
          </div>
          <Badge variant={drive.status === 'open' ? 'success' : 'neutral'}>{drive.status}</Badge>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-4">
          {[
            ['Minimum CGPA', drive.min_cgpa ?? '—'],
            ['Max backlogs', drive.max_backlogs ?? '—'],
            ['Graduation year', drive.graduation_year ?? '—'],
            ['Branches', (drive.allowed_branches ?? []).join(', ') || 'All'],
          ].map(([k, v]) => (
            <div key={k} className="bg-slate-50 rounded-xl px-4 py-3">
              <div className="text-xs text-slate-500 uppercase tracking-wide">{k}</div>
              <div className="font-semibold text-slate-900 mt-0.5">{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Eligibility engine */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
          <div>
            <h3 className="font-semibold text-slate-900">Eligibility engine</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              Runs <span className="font-mono-tight">sp_generate_shortlist()</span> — a single indexed query
              that evaluates every applicant and records why each one passed or failed.
            </p>
          </div>
          <button onClick={runEngine} disabled={running}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl px-5 py-2.5 transition-colors">
            {running ? 'Running…' : 'Run eligibility engine'}
          </button>
        </div>
        {shortlistedCount !== null && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800">
            <span className="font-bold text-lg">{shortlistedCount}</span> students shortlisted
            <span className="text-emerald-600"> — the table below shows the per-student verdict and reasons.</span>
          </div>
        )}
        <DataTable
          emptyHint="No applications yet — students haven't applied to this drive."
          columns={[
            { key: 'student', label: 'Student', render: (a) => <span className="font-medium text-slate-900">{a.student?.name ?? '—'}</span> },
            { key: 'branch', label: 'Branch', render: (a) => a.student?.branch ?? '—' },
            { key: 'cgpa', label: 'CGPA', render: (a) => a.student?.cgpa ?? '—' },
            { key: 'verdict', label: 'Verdict', render: (a) => a.eligible ? <Badge variant="success">Pass</Badge> : <Badge variant="danger">Fail</Badge> },
            { key: 'reasons', label: 'Reasons', render: (a) => <span className="text-slate-500 text-[13px]">{(a.fail_reasons ?? []).join('; ') || (a.eligible ? 'Meets all criteria' : '—')}</span>, className: 'max-w-xs' },
            { key: 'status', label: 'Status', render: (a) => <Badge variant={a.status === 'shortlisted' ? 'success' : 'neutral'}>{a.status}</Badge> },
          ]}
          rows={apps}
        />
        {apps.length > 0 && <p className="text-xs text-slate-400 mt-3">{passCount} of {apps.length} applicants pass the criteria.</p>}
      </div>

      {/* Slot management */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h3 className="font-semibold text-slate-900 mb-4">Manage slots</h3>
        <form onSubmit={createSlot} className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-6">
          <div className="md:col-span-2">
            <label className={labelCls}>Title</label>
            <input value={slotForm.title} onChange={(e) => setSlotForm({ ...slotForm, title: e.target.value })} placeholder="Aptitude test — Batch A" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Type</label>
            <select value={slotForm.type} onChange={(e) => setSlotForm({ ...slotForm, type: e.target.value })} className={inputCls}>
              <option value="test">Test</option>
              <option value="interview">Interview</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Starts</label>
            <input type="datetime-local" value={slotForm.starts_at} onChange={(e) => setSlotForm({ ...slotForm, starts_at: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Ends</label>
            <input type="datetime-local" value={slotForm.ends_at} onChange={(e) => setSlotForm({ ...slotForm, ends_at: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Capacity</label>
            <input type="number" min="1" value={slotForm.capacity} onChange={(e) => setSlotForm({ ...slotForm, capacity: e.target.value })} className={inputCls} />
          </div>
          <div className="md:col-span-6">
            <button type="submit" disabled={savingSlot} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl px-5 py-2.5">
              {savingSlot ? 'Publishing…' : 'Publish slot'}
            </button>
          </div>
        </form>
        {slotList.length === 0 ? (
          <p className="text-sm text-slate-500">No slots yet. Publish the first one above.</p>
        ) : (
          <ul className="space-y-2">
            {slotList.map((s) => (
              <li key={s.id} className="border border-slate-100 rounded-xl px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <span className="font-medium text-slate-900">{s.title}</span>
                  <span className="ml-2"><Badge variant={s.type === 'interview' ? 'info' : 'neutral'}>{s.type}</Badge></span>
                  <div className="text-xs text-slate-500 mt-0.5">{formatDate(s.starts_at)} → {formatDate(s.ends_at)}</div>
                </div>
                <span className="text-sm text-slate-500">{s.booked_count ?? 0}/{s.capacity} booked</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
