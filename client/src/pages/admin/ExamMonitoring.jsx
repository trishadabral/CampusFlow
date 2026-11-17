// Exam Monitoring — live view of exam PCs, agent status, and flagged
// events. Merged from Ishika's repo 2026-11-16 and rewritten in this
// app's dark theme. Fixes in the port: the server emits 'agent:status'
// and 'session:update' (not 'agent:heartbeat' / 'session:change'), event
// rows carry `occurred_at`, review actions are only 'reviewed' /
// 'dismissed', and PCs expose `session_id` (not `active_session_id`).
// Flags need human review — they are not proof of cheating.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { examMonitoring, errMsg } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import StatCard from '../../components/StatCard.jsx';
import Badge from '../../components/Badge.jsx';
import DataTable from '../../components/DataTable.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Spinner from '../../components/Spinner.jsx';
import { formatDate, timeAgo, titleCase } from '../../utils.js';

const EVENT_BADGE = {
  FOCUS_LOST: 'warning',
  WINDOW_SWITCH: 'info',
  WINDOW_MINIMIZED: 'info',
  WINDOW_CLOSED: 'warning',
  PROHIBITED_PROCESS: 'danger',
  AGENT_DISCONNECTED: 'danger',
  AGENT_RECONNECTED: 'success',
};

const REVIEW_BADGE = { new: 'warning', reviewed: 'success', dismissed: 'neutral' };

export default function ExamMonitoring() {
  const { toast } = useToast();
  const [pcs, setPcs] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [reviewFilter, setReviewFilter] = useState('new');
  const [selectedPc, setSelectedPc] = useState(null);
  const [busy, setBusy] = useState(null);
  const socketRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [pcsRes, evRes] = await Promise.all([
        examMonitoring.pcs(),
        examMonitoring.events({ limit: 100 }),
      ]);
      // The endpoints return bare arrays, not { pcs: [...] } wrappers.
      setPcs(pcsRes.data ?? []);
      setEvents(evRes.data ?? []);
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates from the agent fleet. The socket authenticates with the
  // same JWT as the REST API.
  useEffect(() => {
    const token = localStorage.getItem('campusflow_token');
    const socket = io('/', { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect', () => setLive(true));
    socket.on('disconnect', () => setLive(false));
    socket.on('agent:status', (data) => {
      if (!data || data.computer_id == null) return;
      // Only online/offline describe the agent itself. Session changes
      // arrive as 'session:update' (which reloads the PC list); a status
      // like 'allocated' must never overwrite the agent's online state.
      if (data.status !== 'online' && data.status !== 'offline') return;
      setPcs((prev) =>
        prev.map((pc) =>
          pc.id === data.computer_id
            ? { ...pc, agent_status: data.status, last_heartbeat_at: data.last_heartbeat_at ?? pc.last_heartbeat_at }
            : pc
        )
      );
    });
    // A session changed: refresh the PC list (the payload carries the
    // session's own `id`, so a full reload is the safe mapping).
    socket.on('session:update', () => load());
    return () => socket.disconnect();
  }, [load]);

  const reviewEvent = async (id, review_status) => {
    setBusy(id);
    try {
      await examMonitoring.reviewEvent(id, { review_status });
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, review_status } : e)));
      toast(review_status === 'reviewed' ? 'Marked as reviewed.' : 'Flag dismissed.', 'success');
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const setSession = async (sessionId, action) => {
    setBusy(sessionId);
    try {
      if (action === 'start') await examMonitoring.startSession(sessionId);
      else await examMonitoring.endSession(sessionId);
      toast(action === 'start' ? 'Session started.' : 'Session ended.', 'success');
      load();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <Spinner text="Loading exam monitoring…" />;

  const online = pcs.filter((p) => p.agent_status === 'online').length;
  const activeSessions = pcs.filter((p) => p.session_id).length;
  const newFlags = events.filter((e) => e.review_status === 'new').length;

  const shownEvents = events.filter((e) => {
    if (selectedPc && e.computer_id !== selectedPc) return false;
    if (reviewFilter !== 'all' && e.review_status !== reviewFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-100">Exam Monitoring</h1>
          <p className="text-sm text-slate-400 mt-1">
            Live view of exam computers and flagged events. Flags need human review — they are not proof of cheating.
          </p>
        </div>
        <Badge variant={live ? 'success' : 'warning'}>{live ? '● Live' : '○ Reconnecting…'}</Badge>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Exam PCs" value={pcs.length} accent="cyan" />
        <StatCard label="Agents online" value={`${online} / ${pcs.length}`} accent="success" />
        <StatCard label="Active sessions" value={activeSessions} accent="coral" />
        <StatCard label="New flags" value={newFlags} accent="amber" />
      </div>

      <section>
        <h2 className="cf-section-title mb-3">Computers</h2>
        {pcs.length === 0 ? (
          <div className="cf-card"><EmptyState title="No exam computers yet" message="Add computers from the Exam PCs page — each one gets an enrolment code for the Windows agent." /></div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pcs.map((pc) => (
              <div key={pc.id} className="cf-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-slate-100">{pc.pc_code}</div>
                  <Badge variant={pc.agent_status === 'online' ? 'success' : 'neutral'}>
                    {pc.agent_status === 'online' ? 'Agent online' : 'Agent offline'}
                  </Badge>
                </div>
                <div className="text-sm text-slate-400 mt-1">{pc.lab_name}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {pc.last_heartbeat_at ? `Last seen ${timeAgo(pc.last_heartbeat_at)}` : 'Never connected'}
                </div>
                {pc.session_id ? (
                  <div className="mt-3 pt-3 border-t border-white/10 text-sm">
                    <div className="text-slate-200">
                      {pc.student_name} {pc.roll_no ? `(${pc.roll_no})` : ''}
                    </div>
                    <div className="text-slate-400 text-xs mt-0.5">
                      {pc.drive_title ?? 'Exam session'} · {pc.session_status}
                    </div>
                    <div className="flex gap-2 mt-3">
                      {pc.session_status === 'scheduled' && (
                        <button className="cf-btn-primary" disabled={busy === pc.session_id} onClick={() => setSession(pc.session_id, 'start')}>
                          Start session
                        </button>
                      )}
                      {pc.session_status === 'active' && (
                        <button className="cf-btn-secondary" disabled={busy === pc.session_id} onClick={() => setSession(pc.session_id, 'end')}>
                          End session
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 pt-3 border-t border-white/10 text-sm text-slate-500">No session on this computer.</div>
                )}
                <button
                  type="button"
                  className="text-xs text-cyan-300 hover:text-cyan-200 mt-3"
                  onClick={() => setSelectedPc(selectedPc === pc.id ? null : pc.id)}
                >
                  {selectedPc === pc.id ? 'Show all events' : `Show events for this PC (${pc.unreviewed_events_count ?? 0})`}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="cf-section-title">Flagged events</h2>
          <div className="flex gap-2">
            {['new', 'reviewed', 'dismissed', 'all'].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setReviewFilter(f)}
                className={`cf-chip ${reviewFilter === f ? 'bg-[#FF5C38] text-white' : 'bg-[#151B30] text-slate-400'}`}
              >
                {f === 'all' ? 'All' : titleCase(f)}
              </button>
            ))}
          </div>
        </div>
        <div className="cf-card">
          <DataTable
            emptyHint="No flagged events match this filter."
            columns={[
              { key: 'occurred_at', label: 'Time', render: (e) => formatDate(e.occurred_at) },
              { key: 'pc_code', label: 'PC', render: (e) => e.pc_code ?? '—' },
              { key: 'student_name', label: 'Student', render: (e) => (e.student_name ? `${e.student_name}${e.roll_no ? ` (${e.roll_no})` : ''}` : '—') },
              { key: 'event_type', label: 'Event', render: (e) => <Badge variant={EVENT_BADGE[e.event_type] ?? 'neutral'}>{titleCase(e.event_type)}</Badge> },
              { key: 'details', label: 'Details', render: (e) => e.window_title || e.process_name || '—' },
              { key: 'review_status', label: 'Review', render: (e) => <Badge variant={REVIEW_BADGE[e.review_status] ?? 'neutral'}>{titleCase(e.review_status)}</Badge> },
              {
                key: 'actions',
                label: '',
                render: (e) =>
                  e.review_status === 'new' ? (
                    <div className="flex gap-2">
                      <button type="button" className="cf-btn-secondary" disabled={busy === e.id} onClick={() => reviewEvent(e.id, 'reviewed')}>
                        Mark reviewed
                      </button>
                      <button type="button" className="cf-btn-secondary" disabled={busy === e.id} onClick={() => reviewEvent(e.id, 'dismissed')}>
                        Dismiss
                      </button>
                    </div>
                  ) : null,
              },
            ]}
            rows={shownEvents}
          />
        </div>
      </section>
    </div>
  );
}
