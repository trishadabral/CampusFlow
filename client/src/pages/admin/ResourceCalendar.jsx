// Room calendar — week view of every lab and room: system sessions
// (read-only blocks) plus hand-added bookings (drag them to move).
// Plain week grid: 7 day columns, hourly rows 8:00–18:00. Click an empty
// cell to add a booking; drag a hand-added booking onto another cell.

import React, { useEffect, useMemo, useState } from 'react';
import { resources as resourcesApi, errMsg } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import EmptyState from '../../components/EmptyState.jsx';

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17]; // rows: 8:00–18:00
const ROW_REM = 3.5;

function startOfWeek(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const dow = (date.getDay() + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - dow);
  return date;
}
function addDays(d, n) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseDT(v) {
  return new Date(String(v).replace(' ', 'T'));
}
function toInputValue(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtTime(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function fmtDay(d) {
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function ResourceCalendar() {
  const { toast } = useToast();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState([]);
  const [events, setEvents] = useState([]);
  const [resourceFilter, setResourceFilter] = useState('all');
  const [form, setForm] = useState(null); // { resourceId, title, startsAt, endsAt }
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const from = dateKey(days[0]);
  const to = dateKey(days[6]);

  const load = async () => {
    try {
      const { data } = await resourcesApi.calendar(from, to);
      setResources(data?.resources ?? []);
      setEvents(data?.events ?? []);
    } catch (err) {
      toast(errMsg(err, 'Could not load the calendar.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setLoading(true); load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from, to]);

  const visibleEvents = events.filter((e) => resourceFilter === 'all' || String(e.resource_id) === resourceFilter);

  const eventsAt = (day, hour) =>
    visibleEvents.filter((e) => {
      const s = parseDT(e.starts_at);
      return dateKey(s) === dateKey(day) && s.getHours() === hour;
    });

  const openForm = (day, hour) => {
    const start = new Date(day);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setHours(hour + 1);
    setForm({
      resourceId: resourceFilter !== 'all' ? resourceFilter : String(resources[0]?.id ?? ''),
      title: '',
      startsAt: toInputValue(start),
      endsAt: toInputValue(end),
    });
  };

  const saveForm = async (e) => {
    e.preventDefault();
    if (!form.resourceId || !form.title.trim() || !form.startsAt || !form.endsAt) {
      toast('Fill in the room, a title, start and end time.', 'error');
      return;
    }
    setSaving(true);
    try {
      await resourcesApi.manualEvents.create({
        resourceId: Number(form.resourceId),
        title: form.title.trim(),
        startsAt: form.startsAt.replace('T', ' '),
        endsAt: form.endsAt.replace('T', ' '),
      });
      toast('Booking added to the calendar.', 'success');
      setForm(null);
      load();
    } catch (err) {
      toast(errMsg(err, 'Could not add the booking.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async (ev) => {
    try {
      await resourcesApi.manualEvents.remove(ev.manual_event_id);
      toast('Booking removed.', 'success');
      load();
    } catch (err) {
      toast(errMsg(err, 'Could not remove the booking.'), 'error');
    }
  };

  const moveEvent = async (ev, day, hour) => {
    const oldStart = parseDT(ev.starts_at);
    const oldEnd = parseDT(ev.ends_at);
    const durationMs = oldEnd - oldStart;
    const start = new Date(day);
    start.setHours(hour, oldStart.getMinutes(), 0, 0);
    const end = new Date(start.getTime() + durationMs);
    try {
      await resourcesApi.manualEvents.update(ev.manual_event_id, {
        startsAt: toInputValue(start).replace('T', ' '),
        endsAt: toInputValue(end).replace('T', ' '),
      });
      toast('Booking moved.', 'success');
      load();
    } catch (err) {
      toast(errMsg(err, 'Could not move the booking.'), 'error');
    }
  };

  const onDropCell = (day, hour) => (e) => {
    e.preventDefault();
    const ev = visibleEvents.find((x) => x.kind === 'manual' && String(x.manual_event_id) === String(dragId));
    setDragId(null);
    if (ev) moveEvent(ev, day, hour);
  };

  if (loading) return <div className="text-sm text-slate-500 py-10 text-center">Loading calendar…</div>;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">Room calendar</h2>
            <p className="text-xs text-slate-500 mt-1">
              Week of {fmtDay(days[0])} – {fmtDay(days[6])}. Click an empty slot to add a booking; drag a hand-added booking to move it. Sessions from drives can't be moved here.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={resourceFilter}
              onChange={(e) => setResourceFilter(e.target.value)}
              className="cf-input !w-auto"
              aria-label="Show room"
            >
              <option value="all">All labs &amp; rooms</option>
              {resources.map((r) => (
                <option key={r.id} value={String(r.id)}>{r.name} ({r.type})</option>
              ))}
            </select>
            <button onClick={() => setWeekStart((w) => addDays(w, -7))} className="cf-btn-secondary">← Previous week</button>
            <button onClick={() => setWeekStart(startOfWeek(new Date()))} className="cf-btn-secondary">Today</button>
            <button onClick={() => setWeekStart((w) => addDays(w, 7))} className="cf-btn-secondary">Next week →</button>
          </div>
        </div>

        {form && (
          <form onSubmit={saveForm} className="mt-4 p-5 bg-indigo-50/60 border border-indigo-100 rounded-2xl grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className="cf-label">Title</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Workshop — Batch A" className="cf-input" />
            </div>
            <div>
              <label className="cf-label">Room</label>
              <select value={form.resourceId} onChange={(e) => setForm({ ...form, resourceId: e.target.value })} className="cf-input">
                {resources.map((r) => <option key={r.id} value={String(r.id)}>{r.name} ({r.type})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3 md:col-span-2">
              <div>
                <label className="cf-label">Starts</label>
                <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className="cf-input" />
              </div>
              <div>
                <label className="cf-label">Ends</label>
                <input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className="cf-input" />
              </div>
            </div>
            <div className="md:col-span-4 flex items-center gap-3">
              <button type="submit" disabled={saving} className="cf-btn-primary !py-2">{saving ? 'Adding…' : 'Add booking'}</button>
              <button type="button" onClick={() => setForm(null)} className="cf-btn-secondary">Cancel</button>
            </div>
          </form>
        )}

        {resources.length === 0 ? (
          <div className="mt-4"><EmptyState title="No labs or rooms yet" message="Add labs and interview rooms on the Resources page first — the calendar shows them here." /></div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <div className="min-w-[900px] grid" style={{ gridTemplateColumns: '56px repeat(7, minmax(0, 1fr))' }}>
              <div />
              {days.map((d) => (
                <div key={dateKey(d)} className="px-2 py-2 text-center text-xs font-bold text-slate-700 border-b border-slate-200">
                  {fmtDay(d)}
                </div>
              ))}
              {HOURS.map((hour) => (
                <React.Fragment key={hour}>
                  <div className="pr-2 py-1 text-right text-[11px] text-slate-400" style={{ height: `${ROW_REM}rem` }}>
                    {String(hour).padStart(2, '0')}:00
                  </div>
                  {days.map((day) => {
                    const cellEvents = eventsAt(day, hour);
                    return (
                      <div
                        key={`${dateKey(day)}-${hour}`}
                        className="relative border-t border-l border-slate-100 hover:bg-indigo-50/50 cursor-pointer"
                        style={{ height: `${ROW_REM}rem` }}
                        onClick={() => openForm(day, hour)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={onDropCell(day, hour)}
                      >
                        {cellEvents.map((ev) => {
                          const s = parseDT(ev.starts_at);
                          const en = parseDT(ev.ends_at);
                          const topRem = (s.getMinutes() / 60) * ROW_REM;
                          const heightRem = Math.max(1, ((en - s) / 3600000)) * ROW_REM;
                          const full = ev.kind === 'slot' && Number(ev.booked_count) >= Number(ev.capacity);
                          return (
                            <div
                              key={ev.id}
                              draggable={ev.kind === 'manual'}
                              onDragStart={(e) => {
                                e.stopPropagation();
                                setDragId(ev.manual_event_id);
                                e.dataTransfer.effectAllowed = 'move';
                              }}
                              onClick={(e) => e.stopPropagation()}
                              title={ev.kind === 'manual' ? 'Hand-added booking — drag to move' : 'Session from a drive — cannot be moved here'}
                              className={`absolute left-1 right-1 rounded-lg px-2 py-1 text-[11px] leading-tight overflow-hidden z-10 ${
                                ev.kind === 'manual'
                                  ? 'bg-amber-100 border border-amber-300 text-amber-900 cursor-move'
                                  : full
                                    ? 'bg-rose-100 border border-rose-300 text-rose-900'
                                    : 'bg-indigo-100 border border-indigo-300 text-indigo-900'
                              }`}
                              style={{ top: `${topRem}rem`, height: `${heightRem - 0.15}rem` }}
                            >
                              <div className="font-bold truncate">{ev.title}</div>
                              <div className="truncate opacity-80">
                                {fmtTime(s)}–{fmtTime(en)}
                                {resourceFilter === 'all' ? ` · ${ev.resource_name}` : ''}
                                {ev.kind === 'slot' ? ` · ${ev.booked_count}/${ev.capacity} booked${full ? ' · Full' : ''}` : ''}
                              </div>
                              {ev.kind === 'manual' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); deleteEvent(ev); }}
                                  className="absolute top-0.5 right-1 font-bold text-amber-700 hover:text-rose-600"
                                  title="Remove this booking"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
        <p className="text-xs text-slate-400 mt-3">
          Blue blocks are sessions from drives (booked seats shown). Amber blocks are hand-added bookings — drag one to another day or time to move it.
        </p>
      </div>
    </div>
  );
}
