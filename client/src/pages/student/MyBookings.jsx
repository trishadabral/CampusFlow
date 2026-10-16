// M3 — My bookings: table of the student's slot bookings + cancel.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { bookings as bookingsApi, errMsg } from '../../api.js';
import { formatDate } from '../../utils.js';
import { useToast } from '../../components/Toast.jsx';
import DataTable from '../../components/DataTable.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';

export default function MyBookings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [cancelling, setCancelling] = useState(null);

  const load = async () => {
    try {
      const { data } = await bookingsApi.mine();
      setRows(data ?? []);
    } catch (err) {
      toast(errMsg(err, 'Could not load your bookings.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const cancel = async (id) => {
    if (!window.confirm('Cancel this booking? Your seat will be released.')) return;
    setCancelling(id);
    try {
      await bookingsApi.cancel(id);
      toast('Booking cancelled. The seat is now free.', 'success');
      setRows((r) => r.filter((b) => b.id !== id));
    } catch (err) {
      toast(errMsg(err, 'Could not cancel this booking.'), 'error');
    } finally {
      setCancelling(null);
    }
  };

  if (loading) return <div className="text-sm text-slate-500 py-10 text-center">Loading bookings…</div>;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
      {rows.length === 0 ? (
        <EmptyState
          title="No bookings yet"
          message="Your test and interview seats will show up here."
          action={<Link to="/student/drives" className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl px-4 py-2 inline-block">Browse drives</Link>}
        />
      ) : (
        <DataTable
          columns={[
            { key: 'slot', label: 'Slot', render: (b) => <span className="font-medium text-slate-900">{b.slot?.title ?? '—'}</span> },
            { key: 'type', label: 'Type', render: (b) => <Badge variant={b.slot?.type === 'interview' ? 'info' : 'neutral'}>{b.slot?.type ?? '—'}</Badge> },
            { key: 'when', label: 'When', render: (b) => formatDate(b.slot?.starts_at) },
            { key: 'status', label: 'Status', render: (b) => <Badge variant={b.status === 'confirmed' ? 'success' : 'neutral'}>{b.status}</Badge> },
            {
              key: 'actions', label: '', render: (b) => (
                <button
                  onClick={() => cancel(b.id)} disabled={cancelling === b.id}
                  className="text-sm font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50"
                >
                  {cancelling === b.id ? 'Cancelling…' : 'Cancel'}
                </button>
              ),
            },
          ]}
          rows={rows}
        />
      )}
    </div>
  );
}
