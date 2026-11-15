// Admin activity log — searchable, filterable view of everything the
// system recorded (bookings, applications, allocations). Click a row to see
// that record's full history. Plain language throughout: "Activity log",
// "What happened", "Which area".

import React, { useEffect, useState } from 'react';
import { audit as auditApi, errMsg } from '../../api.js';
import { formatDate, titleCase } from '../../utils.js';
import { useToast } from '../../components/Toast.jsx';
import Badge from '../../components/Badge.jsx';
import DataTable from '../../components/DataTable.jsx';
import EmptyState from '../../components/EmptyState.jsx';

const VERB = { INSERT: 'Created', UPDATE: 'Updated', DELETE: 'Removed' };
const ACTION_BADGE = { INSERT: 'success', UPDATE: 'info', DELETE: 'danger' };
const PAGE_SIZE = 50;

function detailsText(details) {
  if (details == null) return '—';
  if (typeof details === 'string') return details;
  return Object.entries(details)
    .map(([k, v]) => `${titleCase(k)}: ${v}`)
    .join(' · ');
}

export default function AuditLog() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [summary, setSummary] = useState([]);
  const [filters, setFilters] = useState({ q: '', entity: '', action: '', user_id: '', from: '', to: '' });
  const [applied, setApplied] = useState({ q: '', entity: '', action: '', user_id: '', from: '', to: '' });
  const [selected, setSelected] = useState(null); // { entity, entity_id, history: [] }
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = async (f, off) => {
    setLoading(true);
    try {
      const params = { limit: PAGE_SIZE, offset: off };
      if (f.q.trim()) params.q = f.q.trim();
      if (f.entity) params.entity = f.entity;
      if (f.action) params.action = f.action;
      if (f.user_id.trim()) params.user_id = f.user_id.trim();
      if (f.from) params.from = `${f.from}T00:00:00`;
      if (f.to) params.to = `${f.to}T23:59:59`;
      const { data } = await auditApi.search(params);
      setRows(data?.rows ?? []);
      setTotal(data?.total ?? 0);
      setOffset(data?.offset ?? off);
    } catch (err) {
      toast(errMsg(err, 'Could not load the activity log.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  // Summary strip (counts by what happened) loads once.
  useEffect(() => {
    (async () => {
      try {
        const { data } = await auditApi.summary(7);
        setSummary(data ?? []);
      } catch {
        /* the table works without the summary strip */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // First page loads on mount; later loads run on Apply / pagination.
  useEffect(() => { load(applied, 0); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const applyFilters = (e) => {
    e?.preventDefault();
    setSelected(null);
    setApplied(filters);
    load(filters, 0);
  };

  const clearFilters = () => {
    const empty = { q: '', entity: '', action: '', user_id: '', from: '', to: '' };
    setFilters(empty);
    setApplied(empty);
    setSelected(null);
    load(empty, 0);
  };

  const openHistory = async (row) => {
    if (!row.entity || row.entity_id == null) return;
    setSelected({ entity: row.entity, entity_id: row.entity_id, history: [] });
    setHistoryLoading(true);
    try {
      const { data } = await auditApi.history(row.entity, row.entity_id);
      setSelected({ entity: row.entity, entity_id: row.entity_id, history: data ?? [] });
    } catch (err) {
      toast(errMsg(err, 'Could not load that record’s history.'), 'error');
      setSelected(null);
    } finally {
      setHistoryLoading(false);
    }
  };

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const summaryText = summary
    .slice(0, 6)
    .map((s) => `${VERB[s.action] ?? s.action} ${titleCase(s.entity)}: ${s.events}`)
    .join(' · ');

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h2 className="font-semibold text-slate-900 mb-1">Activity log</h2>
        <p className="text-xs text-slate-500">
          Every change the system recorded — bookings, applications and resource bookings — newest first.
          Click a row to see that record’s full history.
        </p>
        {summaryText && <p className="text-xs text-slate-500 mt-2">Last 7 days — {summaryText}</p>}

        <form onSubmit={applyFilters} className="mt-4 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2">
            <label className="cf-label">Search</label>
            <input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              placeholder="Search what changed…" className="cf-input" />
          </div>
          <div>
            <label className="cf-label">What happened</label>
            <select value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} className="cf-input">
              <option value="">Anything</option>
              <option value="INSERT">Created</option>
              <option value="UPDATE">Updated</option>
              <option value="DELETE">Removed</option>
            </select>
          </div>
          <div>
            <label className="cf-label">Which area</label>
            <select value={filters.entity} onChange={(e) => setFilters({ ...filters, entity: e.target.value })} className="cf-input">
              <option value="">Any area</option>
              <option value="booking">Booking</option>
              <option value="application">Application</option>
              <option value="allocation">Resource booking</option>
            </select>
          </div>
          <div>
            <label className="cf-label">Who (user ID)</label>
            <input value={filters.user_id} onChange={(e) => setFilters({ ...filters, user_id: e.target.value })}
              placeholder="e.g. 12" inputMode="numeric" className="cf-input" />
          </div>
          <div>
            <label className="cf-label">From</label>
            <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="cf-input" />
          </div>
          <div>
            <label className="cf-label">To</label>
            <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="cf-input" />
          </div>
          <div className="lg:col-span-6 flex items-center gap-3">
            <button type="submit" className="cf-btn-primary !py-2">Apply filters</button>
            <button type="button" onClick={clearFilters}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 border border-slate-200 bg-white rounded-xl px-4 py-2 transition-colors">
              Clear
            </button>
            <span className="text-xs text-slate-400">{total} {total === 1 ? 'change' : 'changes'} found</span>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        {loading ? (
          <div className="text-sm text-slate-500 py-10 text-center">Loading activity…</div>
        ) : rows.length === 0 ? (
          <EmptyState title="No activity matches" message="Try clearing a filter or widening the date range." />
        ) : (
          <DataTable
            emptyHint="No activity yet."
            columns={[
              { key: 'when', label: 'When', render: (r) => <span className="text-[13px] text-slate-600 whitespace-nowrap">{formatDate(r.created_at)}</span> },
              { key: 'who', label: 'Who', render: (r) => <span className="text-[13px]">{r.actor_name ?? (r.actor_id ? `User #${r.actor_id}` : 'System')}</span> },
              { key: 'what', label: 'What happened', render: (r) => <Badge variant={ACTION_BADGE[r.action] ?? 'neutral'}>{VERB[r.action] ?? r.action}</Badge> },
              { key: 'record', label: 'Which record', render: (r) => (
                <button onClick={() => openHistory(r)} title="See this record's full history"
                  className="text-[13px] font-medium text-indigo-600 hover:text-indigo-800 hover:underline">
                  {titleCase(r.entity)}{r.entity_id != null ? ` #${r.entity_id}` : ''}
                </button>
              ) },
              { key: 'details', label: 'Details', render: (r) => <span className="text-[13px] text-slate-500">{detailsText(r.details)}</span> },
            ]}
            rows={rows}
          />
        )}
        {rows.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">Page {page} of {pageCount}</span>
            <div className="flex gap-2">
              <button onClick={() => load(applied, Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0 || loading}
                className="text-sm font-medium text-slate-600 border border-slate-200 bg-white rounded-xl px-4 py-2 disabled:opacity-50 transition-colors">
                Previous
              </button>
              <button onClick={() => load(applied, offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total || loading}
                className="text-sm font-medium text-slate-600 border border-slate-200 bg-white rounded-xl px-4 py-2 disabled:opacity-50 transition-colors">
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Full history of the record clicked above — oldest first. */}
      {selected && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="font-semibold text-slate-900 mb-1">
            History — {titleCase(selected.entity)} #{selected.entity_id}
          </h2>
          <p className="text-xs text-slate-500 mb-3">Everything that ever happened to this record, oldest first.</p>
          {historyLoading ? (
            <p className="text-sm text-slate-500">Loading history…</p>
          ) : selected.history.length === 0 ? (
            <p className="text-sm text-slate-500">No history found for this record.</p>
          ) : (
            <ol className="space-y-2">
              {selected.history.map((h) => (
                <li key={h.id} className="flex items-start gap-3 rounded-xl border border-slate-100 px-3 py-2.5 text-sm">
                  <Badge variant={ACTION_BADGE[h.action] ?? 'neutral'}>{VERB[h.action] ?? h.action}</Badge>
                  <span className="flex-1 text-slate-700">{detailsText(h.details)}</span>
                  <span className="text-xs text-slate-400 whitespace-nowrap">{formatDate(h.created_at)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
