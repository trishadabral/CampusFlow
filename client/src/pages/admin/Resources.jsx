// M4 — Resources: inventory grouped by type + allocation board with the
// Banker's safety check. Unsafe requests are refused WITH an explanation.

import React, { useEffect, useState } from 'react';
import { resources as resourcesApi, allocations as allocationsApi, errMsg } from '../../api.js';
import { formatDate, titleCase } from '../../utils.js';
import { useToast } from '../../components/Toast.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';

const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';
const labelCls = 'block text-sm font-medium text-slate-700 mb-1.5';

const TYPE_BADGE = { lab: 'info', room: 'success', interviewer: 'warning', computer: 'neutral' };

export default function Resources() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState([]);
  const [allocs, setAllocs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [verdict, setVerdict] = useState(null); // { ok, message, explanation }
  const [form, setForm] = useState({ resource_id: '', purpose: '', seats_needed: '10', starts_at: '', ends_at: '' });

  const load = async () => {
    try {
      const [{ data: r }, { data: a }] = await Promise.all([resourcesApi.list(), allocationsApi.list()]);
      setResources(r ?? []);
      setAllocs(a ?? []);
      if ((r ?? []).length && !form.resource_id) setForm((f) => ({ ...f, resource_id: String(r[0].id) }));
    } catch (err) {
      toast(errMsg(err, 'Could not load resources.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const allocate = async (e) => {
    e.preventDefault();
    if (!form.purpose.trim() || !form.starts_at || !form.ends_at) {
      toast('Fill in purpose, start and end time.', 'error');
      return;
    }
    setSaving(true);
    setVerdict(null);
    try {
      // Contract fields only: resource_id, purpose, starts_at, ends_at.
      await allocationsApi.create({
        resource_id: Number(form.resource_id),
        purpose: form.purpose.trim(),
        starts_at: form.starts_at,
        ends_at: form.ends_at,
      });
      setVerdict({ ok: true, message: 'Allocation granted — the safety check found a safe sequence.' });
      setForm((f) => ({ ...f, purpose: '', starts_at: '', ends_at: '' }));
      load();
    } catch (err) {
      if (err?.response?.status === 409) {
        // The Banker's check said no — surface its explanation, not a raw error.
        const explanation = err?.response?.data?.explanation || err?.response?.data?.error;
        setVerdict({ ok: false, message: 'Allocation refused by the safety check.', explanation });
      } else {
        toast(errMsg(err, 'Could not create the allocation.'), 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-slate-500 py-10 text-center">Loading resources…</div>;

  const grouped = resources.reduce((m, r) => {
    const t = r.type ?? 'other';
    (m[t] = m[t] || []).push(r);
    return m;
  }, {});

  return (
    <div className="space-y-6">
      {/* Allocate form */}
      <form onSubmit={allocate} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h2 className="font-semibold text-slate-900 mb-1">New allocation</h2>
        <p className="text-xs text-slate-500 mb-4">
          Every request runs a <span className="font-semibold">Banker's-algorithm safety check</span> first.
          Unsafe requests are refused — with the reason why.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Resource</label>
            <select value={form.resource_id} onChange={(e) => setForm({ ...form, resource_id: e.target.value })} className={inputCls}>
              {resources.map((r) => <option key={r.id} value={r.id}>{r.name} ({titleCase(r.type)}, cap {r.capacity})</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Purpose</label>
            <input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="Aptitude test — Batch A" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Seats needed</label>
            <input type="number" min="1" value={form.seats_needed} onChange={(e) => setForm({ ...form, seats_needed: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Starts</label>
            <input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Ends</label>
            <input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} className={inputCls} />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={saving || resources.length === 0}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl px-5 py-2.5 w-full">
              {saving ? 'Checking safety…' : 'Request allocation'}
            </button>
          </div>
        </div>

        {verdict && (
          <div className={`mt-4 rounded-xl px-4 py-3 text-sm border ${verdict.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
            <div className="font-semibold">{verdict.message}</div>
            {verdict.explanation && <p className="mt-1 text-[13px]">{verdict.explanation}</p>}
          </div>
        )}
      </form>

      {/* Inventory grouped by type */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h2 className="font-semibold text-slate-900 mb-4">Inventory</h2>
        {resources.length === 0 ? (
          <EmptyState title="No resources registered" message="Labs, rooms, interviewers and computers will be listed here once added." />
        ) : (
          <div className="space-y-5">
            {Object.entries(grouped).map(([type, list]) => (
              <div key={type}>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-slate-700">{titleCase(type)}s</h3>
                  <Badge variant={TYPE_BADGE[type] ?? 'neutral'}>{list.length}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {list.map((r) => (
                    <div key={r.id} className="border border-slate-100 rounded-xl px-4 py-3">
                      <div className="font-medium text-slate-900">{r.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Capacity {r.capacity}{r.location ? ` · ${r.location}` : ''}
                      </div>
                      <div className="mt-2">
                        <Badge variant={r.status === 'available' ? 'success' : 'warning'}>{r.status ?? 'available'}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Allocation board */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h2 className="font-semibold text-slate-900 mb-4">Allocation board</h2>
        {allocs.length === 0 ? (
          <p className="text-sm text-slate-500">No allocations yet.</p>
        ) : (
          <ul className="space-y-2">
            {allocs.map((a) => (
              <li key={a.id} className="border border-slate-100 rounded-xl px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <span className="font-medium text-slate-900">{a.purpose}</span>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {a.resource?.name ?? 'Resource'} · {formatDate(a.starts_at)} → {formatDate(a.ends_at)}
                  </div>
                </div>
                <Badge variant="info">allocated</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
