// Company profile — the recruiter's own company and its drives.
// Merged from Ishika's repo 2026-11-16 and rewritten in this app's dark
// theme. Fixes in the port: no invented fallback company and no
// "VERIFIED PARTNER" badge — if no company is linked to the account, the
// page says so instead of making one up.
import React, { useCallback, useEffect, useState } from 'react';
import { recruiter, errMsg } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import StatCard from '../../components/StatCard.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Spinner from '../../components/Spinner.jsx';

export default function RecruiterCompany() {
  const { toast } = useToast();
  const [company, setCompany] = useState(null);
  const [drives, setDrives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await recruiter.getCompany();
      setCompany(res.data.company ?? null);
      setDrives(res.data.drives ?? []);
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = () => {
    setForm({
      name: company?.name ?? '',
      website: company?.website ?? '',
      sector: company?.sector ?? '',
      description: company?.description ?? '',
      location: company?.location ?? '',
      industry: company?.industry ?? '',
      hr_contact_email: company?.hr_contact_email ?? '',
    });
    setEditing(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await recruiter.updateCompany(form);
      toast('Company profile updated.', 'success');
      setEditing(false);
      load();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner text="Loading company…" />;

  if (!company) {
    return (
      <div className="cf-card">
        <EmptyState
          title="No company linked yet"
          message="Your account is not linked to a company. Ask an admin to link one so you can manage its drives and applicants."
        />
      </div>
    );
  }

  const totalApplied = drives.reduce((n, d) => n + Number(d.counts?.applied || 0), 0);
  const totalShortlisted = drives.reduce((n, d) => n + Number(d.counts?.shortlisted || 0), 0);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-100">{company.name}</h1>
          <p className="text-sm text-slate-400 mt-1">
            {company.sector ? `${company.sector} · ` : ''}{company.location ?? ''}{company.website ? ` · ${company.website}` : ''}
          </p>
        </div>
        {!editing && (
          <button type="button" className="cf-btn-secondary" onClick={startEdit}>Edit profile</button>
        )}
      </div>

      {company.description && !editing && (
        <p className="text-sm text-slate-300 max-w-2xl">{company.description}</p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Drives" value={drives.length} accent="cyan" />
        <StatCard label="Applicants" value={totalApplied} accent="coral" />
        <StatCard label="Shortlisted" value={totalShortlisted} accent="success" />
      </div>

      {editing ? (
        <form onSubmit={save} className="cf-card p-5 space-y-4">
          <h2 className="cf-section-title">Edit company profile</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="cf-label" htmlFor="c-name">Company name</label>
              <input id="c-name" className="cf-input" value={form.name} onChange={set('name')} required />
            </div>
            <div>
              <label className="cf-label" htmlFor="c-website">Website</label>
              <input id="c-website" className="cf-input" value={form.website} onChange={set('website')} placeholder="https://…" />
            </div>
            <div>
              <label className="cf-label" htmlFor="c-sector">Sector</label>
              <input id="c-sector" className="cf-input" value={form.sector} onChange={set('sector')} placeholder="e.g. IT Services" />
            </div>
            <div>
              <label className="cf-label" htmlFor="c-industry">Industry</label>
              <input id="c-industry" className="cf-input" value={form.industry} onChange={set('industry')} placeholder="e.g. Technology" />
            </div>
            <div>
              <label className="cf-label" htmlFor="c-location">Location</label>
              <input id="c-location" className="cf-input" value={form.location} onChange={set('location')} placeholder="e.g. Dehradun" />
            </div>
            <div>
              <label className="cf-label" htmlFor="c-hr">HR contact email</label>
              <input id="c-hr" type="email" className="cf-input" value={form.hr_contact_email} onChange={set('hr_contact_email')} placeholder="hr@company.com" />
            </div>
          </div>
          <div>
            <label className="cf-label" htmlFor="c-desc">About the company</label>
            <textarea id="c-desc" className="cf-input" rows={3} value={form.description} onChange={set('description')} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="cf-btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
            <button type="submit" className="cf-btn-primary" disabled={busy}>Save changes</button>
          </div>
        </form>
      ) : (
        <section>
          <h2 className="cf-section-title mb-3">Drives</h2>
          {drives.length === 0 ? (
            <div className="cf-card"><EmptyState title="No drives yet" message="Create your first drive from the My Drives page." /></div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {drives.map((d) => (
                <div key={d.id} className="cf-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-100">{d.title}</span>
                    <Badge variant={d.status === 'open' ? 'success' : d.status === 'closed' ? 'neutral' : 'info'}>{d.status}</Badge>
                  </div>
                  <div className="text-sm text-slate-400 mt-2">
                    {Number(d.counts?.applied || 0)} applicants · {Number(d.counts?.shortlisted || 0)} shortlisted
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
