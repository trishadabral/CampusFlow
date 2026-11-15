// Header notification bell: unread badge + dropdown feed of system
// notifications (test sessions, results, interview schedules).

import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { notifications as notifApi, errMsg } from '../api.js';
import { timeAgo } from '../utils.js';

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]);
  const boxRef = useRef(null);

  const load = async (silent = true) => {
    try {
      const { data } = await notifApi.list();
      setUnread(data.unread ?? 0);
      setItems(data.notifications ?? []);
    } catch (err) {
      if (!silent) console.error(errMsg(err));
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    // Live updates are the fast path: refetch the moment something
    // changes instead of waiting for the next 30-second poll.
    const onLive = () => load();
    window.addEventListener('campusflow-live', onLive);
    const onClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => {
      clearInterval(id);
      window.removeEventListener('campusflow-live', onLive);
      document.removeEventListener('mousedown', onClick);
    };
  }, []);

  const markAllRead = async () => {
    try {
      await notifApi.readAll();
      setUnread(0);
      setItems((list) => list.map((n) => ({ ...n, is_read: true })));
    } catch (_) {}
  };

  // Opening one unread item marks just that one read (badge drops by one).
  // The state updates immediately; a failed call is corrected on the next poll.
  const markOneRead = async (n) => {
    if (n.is_read) return;
    setUnread((u) => Math.max(0, u - 1));
    setItems((list) => list.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    try {
      await notifApi.markRead(n.id);
    } catch (_) {}
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => { setOpen((o) => !o); if (!open) load(false); }}
        className="relative w-10 h-10 rounded-xl bg-[#12172A] border border-white/10 flex items-center justify-center text-slate-400 hover:text-[#FF5C38] hover:border-[#FF5C38]/40 transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[380px] max-w-[90vw] bg-[#12172A] rounded-2xl border border-white/10 shadow-xl z-50 overflow-hidden cf-rise">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
            <span className="font-bold text-slate-100 text-sm">Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs font-semibold text-[#FF5C38] hover:text-[#FF5C38]">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto slim-scroll">
            {items.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <div className="text-3xl mb-2">🔕</div>
                <p className="text-sm text-slate-400">Nothing yet. Test sessions, results and interview schedules will land here.</p>
              </div>
            ) : (
              items.map((n) => (
                <Link
                  key={n.id}
                  to={n.link || '#'}
                  onClick={() => { markOneRead(n); setOpen(false); }}
                  className={`block px-5 py-3.5 border-b border-white/10 hover:bg-[#FF5C38]/10 transition-colors ${!n.is_read ? 'bg-[#FF5C38]/10' : ''}`}
                >
                  <div className="flex items-start gap-2.5">
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-[#FF5C38] mt-1.5 shrink-0" />}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-100">{n.title}</div>
                      {n.body && <div className="text-[13px] text-slate-400 mt-0.5 leading-snug">{n.body}</div>}
                      <div className="text-[11px] text-slate-400 mt-1">{timeAgo(n.created_at)}</div>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
