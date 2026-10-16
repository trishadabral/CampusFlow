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
    const onClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => {
      clearInterval(id);
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

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => { setOpen((o) => !o); if (!open) load(false); }}
        className="relative w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:border-indigo-300 transition-colors"
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
        <div className="absolute right-0 mt-2 w-[380px] max-w-[90vw] bg-white rounded-2xl border border-slate-200 shadow-xl z-50 overflow-hidden cf-rise">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <span className="font-bold text-slate-900 text-sm">Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto slim-scroll">
            {items.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <div className="text-3xl mb-2">🔕</div>
                <p className="text-sm text-slate-500">Nothing yet. Test sessions, results and interview schedules will land here.</p>
              </div>
            ) : (
              items.map((n) => (
                <Link
                  key={n.id}
                  to={n.link || '#'}
                  onClick={() => setOpen(false)}
                  className={`block px-5 py-3.5 border-b border-slate-50 hover:bg-indigo-50/40 transition-colors ${!n.is_read ? 'bg-indigo-50/60' : ''}`}
                >
                  <div className="flex items-start gap-2.5">
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 shrink-0" />}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{n.title}</div>
                      {n.body && <div className="text-[13px] text-slate-500 mt-0.5 leading-snug">{n.body}</div>}
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
