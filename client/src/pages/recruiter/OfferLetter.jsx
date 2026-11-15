// Offer letter view — clean printable letter, no app chrome in the printout
// (see the @media print rules in index.css: sidebar, topbar and buttons
// are hidden when printing, so only the letter itself reaches the paper).
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { offers as offersApi, errMsg } from '../../api.js';
import { formatDate } from '../../utils.js';
import { useToast } from '../../components/Toast.jsx';

export default function OfferLetter() {
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [offer, setOffer] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await offersApi.get(id);
        setOffer(data);
      } catch (err) {
        toast(errMsg(err, 'Could not load the offer letter.'), 'error');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <div className="text-sm text-slate-400 py-10 text-center">Loading letter…</div>;
  if (!offer) return <div className="text-sm text-slate-400 py-10 text-center">Offer letter not found.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
        <Link to={`/recruiter/drives/${offer.drive_id}`} className="text-sm font-semibold text-[#FF5C38] hover:text-[#FF8A6B]">← Back to drive</Link>
        <button onClick={() => window.print()} className="cf-btn-primary">Print / save as PDF</button>
      </div>

      <article className="offer-letter bg-white rounded-2xl border border-slate-200/70 p-8 md:p-12 max-w-3xl mx-auto shadow-sm">
        <header className="border-b border-slate-200 pb-5 mb-6">
          <div className="text-lg font-bold text-slate-900">{offer.company_name}</div>
          <div className="text-sm text-slate-500">{offer.drive_title}</div>
        </header>
        <div className="text-sm text-slate-500 mb-6 space-y-0.5">
          <div>To: <span className="font-medium text-slate-800">{offer.student?.name}</span>{offer.student?.email ? ` · ${offer.student.email}` : ''}</div>
          {offer.package_lpa != null && <div>Package: <span className="font-medium text-slate-800">₹{Number(offer.package_lpa)} LPA</span></div>}
          {offer.joining_date && <div>Joining date: <span className="font-medium text-slate-800">{formatDate(offer.joining_date)}</span></div>}
          {offer.generated_at && <div>Letter generated: {formatDate(offer.generated_at)}</div>}
          {offer.status && (
            <div>Student&apos;s answer: <span className="font-medium text-slate-800">
              {offer.status === 'accepted' ? 'Accepted' : offer.status === 'declined' ? 'Declined' : 'Still deciding'}
              {offer.responded_at ? ` on ${formatDate(offer.responded_at)}` : ''}
            </span></div>
          )}
        </div>
        <div className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-line">
          {offer.letter_text}
        </div>
      </article>
    </div>
  );
}
