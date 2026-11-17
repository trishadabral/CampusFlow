// Recruiter inbox — the recruiter's notifications, newest first.
// Notifications here carry only title, body, link and time — there is
// no `type` or `details` field.
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notifications, errMsg } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Spinner from '../../components/Spinner.jsx';
import { timeAgo } from '../../utils.js';

export default function RecruiterInbox() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await notifications.list();
      setItems(res.data.notifications ?? []);
      setUnread(res.data.unread ?? 0);
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const markAllRead = async () => {
    setBusy(true);
    try {
      await notifications.readAll();
      setItems((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      setUnread(0);
      toast('All notifications marked as read.', 'success');
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const open = async (n) => {
    if (!n.is_read) {
      try {
        await notifications.markRead(n.id);
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: 1 } : x)));
        setUnread((u) => Math.max(0, u - 1));
      } catch {
        // Staying on the notification is fine even if the read mark fails.
      }
    }
    if (n.link) navigate(n.link);
  };

  if (loading) return <Spinner text="Loading inbox…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-100">Inbox</h1>
          <p className="text-sm text-slate-400 mt-1">
            {unread > 0 ? `${unread} unread notification${unread === 1 ? '' : 's'}` : 'You are all caught up.'}
          </p>
        </div>
        {unread > 0 && (
          <button type="button" className="cf-btn-secondary" disabled={busy} onClick={markAllRead}>
            Mark all read
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="cf-card">
          <EmptyState title="No notifications yet" message="When students apply, take tests, or accept offers, you will see it here." />
        </div>
      ) : (
        <div className="cf-card divide-y divide-white/10">
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => open(n)}
              className={`w-full text-left px-5 py-4 hover:bg-white/5 transition-colors ${n.is_read ? '' : 'bg-[#FF5C38]/5'}`}
            >
              <div className="flex items-start gap-3">
                {!n.is_read && <span className="mt-2 w-2 h-2 rounded-full bg-[#FF5C38] shrink-0" aria-label="Unread" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold text-slate-100">{n.title}</span>
                    <span className="text-xs text-slate-500 whitespace-nowrap">{timeAgo(n.created_at)}</span>
                  </div>
                  {n.body && <p className="text-sm text-slate-400 mt-1">{n.body}</p>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
