// Admin resources — the physical inventory the pipeline runs on.
// Labs (with capacity) feed the test-session auto-scheduler; interview rooms
// feed the interview timetable. Add them here; the system does the rest.
// The manual allocation board below still runs the Banker's safety check.

import React, { useEffect, useState } from 'react';
import { resources as resourcesApi, allocations as allocationsApi, errMsg } from '../../api.js';
import { formatDate, titleCase } from '../../utils.js';
import { useToast } from '../../components/Toast.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';

const TYPE_BADGE = { lab: 'info', room: 'success', interviewer: 'warning' };
const TYPE_HINT = {
  lab: 'Test sessions are auto-batched into labs by capacity, biggest first.',
  room: 'Interviews are assigned to rooms round-robin.',
  interviewer: 'Named interviewers for manual reference.',
};

export default function Resources() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState([]);
  const [allocs, setAllocs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [allocating, setAllocating] = useState(false);
  const [verdict, setVerdict] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'lab', capacity: '40', location: '' });
  const [allocForm, setAllocForm] = useState({ resource_id: '', purpose: '', seats_needed: '10', starts_at: '', ends_at: '' });

  const load = async () => {
    try {
      const [{ data: r }, { data: a }] = await Promise.all([resourcesApi.list(), allocationsApi.list()]);
      setResources(r ?? []);
      setAllocs(a ?? []);
      if ((r ?? []).length && !allocForm.resource_id) setAllocForm((f) => ({ ...f, resource_id: String(r[0].id) }));
    } catch (err) {
      toast(errMsg(err, 'Could not load resources.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const addResource = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast('Give the resource a name.', 'error'); return; }
    setSaving(true);
    try {
      await resourcesApi.create({
        name: form.name.trim(),
        type: form.type,
        capacity: Math.max(1, Number(form.capacity) || 1),
        location: form.location.trim() || null,
      });
      toast(`${form.name.trim()} added to inventory.`, 'success');
      setForm({ name: '', type: 'lab', capacity: '40', location: '' });
      setShowAdd(false);
      load();
    } catch (err) {
      toast(errMsg(err, 'Could not add the resource.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const allocate = async (e) => {
    e.preventDefault();
    if (!allocForm.purpose.trim() || !allocForm.starts_at || !allocForm.ends_at) {
      toast('Fill in purpose, start and end time.', 'error');
      return;
    }
    setAllocating(true);
    setVerdict(null);
    try {
      await allocationsApi.create({
        resource_id: Number(allocForm.resource_id),
        purpose: allocForm.purpose.trim(),
        starts_at: allocForm.starts_at,
        ends_at: allocForm.ends_at,
      });
      setVerdict({ ok: true, message: 'Booked — the safety check passed.' });
      setAllocForm((f) => ({ ...f, purpose: '', starts_at: '', ends_at: '' }));
      load();
    } catch (err) {
      if (err?.response?.status === 409) {
        const explanation = err?.response?.data?.explanation || err?.response?.data?.error;
        setVerdict({ ok: false, message: 'Booking refused by the safety check.', explanation });
      } else {
        toast(errMsg(err, 'Could not book the resource.'), 'error');
      }
    } finally {
      setAllocating(false);
    }
  };

  if (loading) return <div className="text-sm text-slate-500 py-10 text-center">Loading resources…</div>;

  const grouped = resources.reduce((m, r) => {
    const t = r.type ?? 'other';
    (m[t] = m[t] || []).push(r);
    return m;
  }, {});
  const labSeats = (grouped.lab ?? []).reduce((s, r) => s + Number(r.capacity || 0), 0);

  return (
    <div className="space-y-6">
      {/* Inventory header + add */}
      <div className="cf-card cf-rise">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h2 className="cf-section-title">Inventory</h2>
            <p className="cf-section-sub">
              {grouped.lab?.length ?? 0} labs · <b>{labSeats}</b> test seats · {grouped.room?.length ?? 0} interview rooms.
              The pipeline schedules against this inventory automatically.
            </p>
          </div>
          <button onClick={() => setShowAdd((v) => !v)} className="cf-btn-primary">+ Add resource</button>
        </div>

        {showAdd && (
          <form onSubmit={addResource} className="mt-4 p-5 bg-indigo-50/60 border border-indigo-100 rounded-2xl grid grid-cols-1 md:grid-cols-5 gap-3 cf-rise">
            <div className="md:col-span-2">
              <label className="cf-label">Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Lab C" className="cf-input" />
            </div>
            <div>
              <label className="cf-label">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="cf-input">
                <option value="lab">Lab (test venue)</option>
                <option value="room">Interview room</option>
                <option value="interviewer">Interviewer</option>
              </select>
            </div>
            <div>
              <label className="cf-label">Capacity</label>
              <input type="number" min="1" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className="cf-input" />
            </div>
            <div>
              <label className="cf-label">Location</label>
              <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Block / floor" className="cf-input" />
            </div>
            <div className="md:col-span-5 flex items-center gap-3">
              <button type="submit" disabled={saving} className="cf-btn-primary !py-2">{saving ? 'Adding…' : 'Add to inventory'}</button>
              <span className="text-xs text-slate-500">{TYPE_HINT[form.type]}</span>
            </div>
          </form>
        )}

        <div className="mt-5 space-y-5">
          {resources.length === 0 ? (
            <EmptyState title="No resources registered" message="Add labs and interview rooms above — the pipeline needs them to schedule sessions." />
          ) : (
            Object.entries(grouped).map(([type, list]) => (
              <div key={type}>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-bold text-slate-700">{titleCase(type)}s</h3>
                  <Badge variant={TYPE_BADGE[type] ?? 'neutral'}>{list.length}</Badge>
                </div>
                <p className="text-xs text-slate-400 mb-2">{TYPE_HINT[type]}</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {list.map((r) => (
                    <div key={r.id} className="border border-slate-200 rounded-xl px-4 py-3.5 hover:border-indigo-200 hover:shadow-sm transition-all">
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-slate-900">{r.name}</div>
                        <Badge variant={r.status === 'available' ? 'success' : 'warning'}>{r.status ?? 'available'}</Badge>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {type === 'lab' ? `${r.capacity} seats` : type === 'room' ? '1 room' : `Capacity ${r.capacity}`}{r.location ? ` · ${r.location}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Manual booking with safety check */}
      <div className="cf-card cf-rise">
        <h2 className="cf-section-title">Manual booking</h2>
        <p className="cf-section-sub mb-4">
          For one-off bookings outside the automatic scheduling. Every request is safety-checked first —
          if it would overbook a resource, it's refused with the reason why.
        </p>
        <form onSubmit={allocate} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="cf-label">Resource</label>
            <select value={allocForm.resource_id} onChange={(e) => setAllocForm({ ...allocForm, resource_id: e.target.value })} className="cf-input">
              {resources.map((r) => <option key={r.id} value={r.id}>{r.name} ({titleCase(r.type)}, cap {r.capacity})</option>)}
            </select>
          </div>
          <div>
            <label className="cf-label">Purpose</label>
            <input value={allocForm.purpose} onChange={(e) => setAllocForm({ ...allocForm, purpose: e.target.value })} placeholder="Workshop — Batch A" className="cf-input" />
          </div>
          <div>
            <label className="cf-label">Seats needed</label>
            <input type="number" min="1" value={allocForm.seats_needed} onChange={(e) => setAllocForm({ ...allocForm, seats_needed: e.target.value })} className="cf-input" />
          </div>
          <div>
            <label className="cf-label">Starts</label>
            <input type="datetime-local" value={allocForm.starts_at} onChange={(e) => setAllocForm({ ...allocForm, starts_at: e.target.value })} className="cf-input" />
          </div>
          <div>
            <label className="cf-label">Ends</label>
            <input type="datetime-local" value={allocForm.ends_at} onChange={(e) => setAllocForm({ ...allocForm, ends_at: e.target.value })} className="cf-input" />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={allocating || resources.length === 0} className="cf-btn-primary w-full">
              {allocating ? 'Checking…' : 'Book resource'}
            </button>
          </div>
        </form>
        {verdict && (
          <div className={`mt-4 rounded-xl px-4 py-3 text-sm border ${verdict.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
            <div className="font-semibold">{verdict.message}</div>
            {verdict.explanation && <p className="mt-1 text-[13px]">{verdict.explanation}</p>}
          </div>
        )}
        <div className="cf-divider" />
        <h3 className="text-sm font-bold text-slate-700 mb-3">Booking board</h3>
        {allocs.length === 0 ? (
          <p className="text-sm text-slate-500">No manual bookings yet.</p>
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
                <Badge variant="info">booked</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
