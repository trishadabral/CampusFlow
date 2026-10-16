// M2 — My Drives: list + drive creation wizard (criteria builder feeds sp_generate_shortlist).

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { drives as drivesApi, companies as companiesApi, errMsg } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';

const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';
const labelCls = 'block text-sm font-medium text-slate-700 mb-1.5';

export default function MyDrives() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [drives, setDrives] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    company_id: '', title: '', description: '', min_cgpa: '7.0',
    allowed_branches: 'CSE, IT', max_backlogs: '0', graduation_year: '2027', application_deadline: '',
  });

  const load = async () => {
    try {
      const [{ data: d }, { data: c }] = await Promise.all([drivesApi.list({}), companiesApi.list()]);
      setDrives(d ?? []);
      setCompanies(c ?? []);
      if ((c ?? []).length && !form.company_id) setForm((f) => ({ ...f, company_id: String(c[0].id) }));
    } catch (err) {
      toast(errMsg(err, 'Could not load drives.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { toast('Give the drive a title.', 'error'); return; }
    setSaving(true);
    try {
      await drivesApi.create({
        company_id: Number(form.company_id),
        title: form.title.trim(),
        description: form.description.trim(),
        min_cgpa: Number(form.min_cgpa),
        allowed_branches: form.allowed_branches.split(',').map((b) => b.trim().toUpperCase()).filter(Boolean),
        max_backlogs: Number(form.max_backlogs),
        graduation_year: Number(form.graduation_year),
        application_deadline: form.application_deadline || null,
      });
      toast('Drive published. Students can now see it.', 'success');
      setShowForm(false);
      setForm((f) => ({ ...f, title: '', description: '', application_deadline: '' }));
      load();
    } catch (err) {
      toast(errMsg(err, 'Could not create the drive.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-slate-500 py-10 text-center">Loading drives…</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={() => setShowForm((s) => !s)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition-colors">
          {showForm ? 'Close' : '+ New drive'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={create} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4">
          <h3 className="font-semibold text-slate-900">New placement drive</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Company</label>
              <select value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })} className={inputCls}>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Drive title</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. SDE Intern — Summer 2027" className={inputCls} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Role, CTC, process rounds…" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Minimum CGPA</label>
              <input type="number" step="0.1" min="0" max="10" value={form.min_cgpa} onChange={(e) => setForm({ ...form, min_cgpa: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Max backlogs</label>
              <input type="number" min="0" value={form.max_backlogs} onChange={(e) => setForm({ ...form, max_backlogs: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Allowed branches (comma separated)</label>
              <input value={form.allowed_branches} onChange={(e) => setForm({ ...form, allowed_branches: e.target.value })} placeholder="CSE, IT, ECE" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Graduation year</label>
              <input type="number" value={form.graduation_year} onChange={(e) => setForm({ ...form, graduation_year: e.target.value })} className={inputCls} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Application deadline</label>
              <input type="datetime-local" value={form.application_deadline} onChange={(e) => setForm({ ...form, application_deadline: e.target.value })} className={inputCls} />
            </div>
          </div>
          <p className="text-xs text-slate-400">These criteria feed the eligibility engine — <span className="font-mono-tight">sp_generate_shortlist()</span> evaluates every applicant against them.</p>
          <button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl px-5 py-2.5">
            {saving ? 'Publishing…' : 'Publish drive'}
          </button>
        </form>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        {drives.length === 0 ? (
          <EmptyState title="No drives yet" message="Publish your first drive above — students will see it instantly." />
        ) : (
          <ul className="divide-y divide-slate-50">
            {drives.map((d) => (
              <li key={d.id}>
                <Link to={`/recruiter/drives/${d.id}`} className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{d.title}</div>
                    <div className="text-sm text-slate-500">{d.company?.name} · CGPA ≥ {d.min_cgpa} · {d.counts?.applied ?? 0} applied</div>
                  </div>
                  <Badge variant={d.status === 'open' ? 'success' : 'neutral'}>{d.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
