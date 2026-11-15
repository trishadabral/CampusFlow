// Recruiter drive detail — the pipeline command view.
// A drive flows: Applications → Test scheduled → Results → Interviews.
// The recruiter watches it move and presses exactly two buttons; the system
// does everything else. Tabs: eligible students, test sessions, results.

import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { drives as drivesApi, reports as reportsApi, slots as slotsApi, resources as resourcesApi, errMsg } from '../../api.js';
import { formatDate } from '../../utils.js';
import { useToast } from '../../components/Toast.jsx';
import Badge from '../../components/Badge.jsx';
import DataTable from '../../components/DataTable.jsx';
import Stepper from '../../components/Stepper.jsx';
import EmptyState from '../../components/EmptyState.jsx';

const STAGE_META = {
  open: { label: 'Accepting applications', variant: 'success' },
  testing: { label: 'Test scheduled', variant: 'info' },
  interviews: { label: 'Interviews scheduled', variant: 'warning' },
  closed: { label: 'Closed', variant: 'neutral' },
  draft: { label: 'Draft', variant: 'neutral' },
};

const STATUS_VARIANT = {
  applied: 'info', test_taken: 'warning', shortlisted: 'success',
  rejected: 'danger', selected: 'success',
};

// Plain div bar chart (no chart library): width proportional to the value,
// with the number printed next to it.
function Bar({ label, value, max, color, suffix = '' }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400 w-24 shrink-0">{label}</span>
      <div className="flex-1 h-2.5 bg-[#151B30] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-300 w-12 text-right">{value}{suffix}</span>
    </div>
  );
}

export default function RecruiterDriveDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [drive, setDrive] = useState(null);
  const [pipeline, setPipeline] = useState(null);
  const [apps, setApps] = useState([]);
  const [tab, setTab] = useState('students');
  const [busy, setBusy] = useState(null);
  const [scorecard, setScorecard] = useState([]);
  const [fbPending, setFbPending] = useState(null);
  const [reminding, setReminding] = useState(false);
  const [fbStudent, setFbStudent] = useState('');
  const [fbScore, setFbScore] = useState('');
  const [fbRemarks, setFbRemarks] = useState('');
  const [fbRound, setFbRound] = useState('');
  const [rounds, setRounds] = useState([]);
  const [roundName, setRoundName] = useState('');
  const [roundCutoff, setRoundCutoff] = useState('50');
  const [offerList, setOfferList] = useState([]);
  const [offerPackage, setOfferPackage] = useState('');
  const [offerJoining, setOfferJoining] = useState('');
  const [driveStats, setDriveStats] = useState(null);
  const [driveSlots, setDriveSlots] = useState([]);
  const [slotsError, setSlotsError] = useState(null);
  const [venues, setVenues] = useState([]);
  const [venuesError, setVenuesError] = useState(null);
  const [slotType, setSlotType] = useState('test');
  const [slotTitle, setSlotTitle] = useState('');
  const [slotStarts, setSlotStarts] = useState('');
  const [slotEnds, setSlotEnds] = useState('');
  const [slotCapacity, setSlotCapacity] = useState('30');
  const [slotVenue, setSlotVenue] = useState('');

  const load = async () => {
    try {
      const [{ data: d }, { data: p }, { data: a }] = await Promise.all([
        drivesApi.get(id), drivesApi.pipeline(id), drivesApi.applications(id),
      ]);
      setDrive(d.drive ?? d);
      setPipeline(p);
      setApps(a ?? []);
    } catch (err) {
      toast(errMsg(err, 'Could not load this drive.'), 'error');
    } finally {
      setLoading(false);
    }
    // Interview notes load separately: a failure here must never blank the drive.
    try {
      const { data } = await drivesApi.feedback(id);
      setScorecard(data ?? []);
    } catch (err) { /* no notes yet, or not this drive's recruiter — section stays empty */ }
    try {
      const { data } = await drivesApi.feedbackPending(id);
      setFbPending(data ?? null);
    } catch (err) { /* pending count is a bonus — the notes section works without it */ }
    try {
      const { data } = await drivesApi.rounds(id);
      setRounds(data ?? []);
      // Default the note form to the current round (only when the
      // recruiter hasn't picked one — never override their choice).
      const active = (data ?? []).find((r) => r.status === 'active');
      if (active) setFbRound((cur) => cur || String(active.id));
    } catch (err) { /* no rounds yet — section shows the single-round line */ }
    try {
      const { data } = await drivesApi.offers(id);
      setOfferList(data ?? []);
    } catch (err) { /* no letters yet — section stays empty */ }
    try {
      const { data } = await reportsApi.driveAnalytics(id);
      setDriveStats(data);
    } catch (err) { /* analytics need test data — section stays hidden */ }
    // Sessions + venues load separately: a failure here must never blank the drive.
    try {
      const { data: s } = await slotsApi.list(id);
      setDriveSlots(s ?? []);
      setSlotsError(null);
    } catch (err) { setSlotsError(errMsg(err, 'Could not load sessions.')); }
    try {
      const { data: v } = await resourcesApi.list();
      setVenues(v ?? []);
      setVenuesError(null);
    } catch (err) { setVenuesError(errMsg(err, 'Could not load venues.')); }
  };

  const addSession = async (e) => {
    e.preventDefault();
    if (!slotTitle.trim() || !slotStarts || !slotEnds) return;
    setBusy('session');
    try {
      await slotsApi.create({
        drive_id: Number(id),
        type: slotType,
        title: slotTitle.trim(),
        starts_at: new Date(slotStarts).toISOString(),
        ends_at: new Date(slotEnds).toISOString(),
        capacity: Number(slotCapacity),
        resource_id: slotVenue ? Number(slotVenue) : undefined,
      });
      toast(`Session “${slotTitle.trim()}” added. Students can book a seat from the drive page.`, 'success');
      setSlotTitle('');
      setSlotStarts('');
      setSlotEnds('');
      setSlotVenue('');
      const { data: s } = await slotsApi.list(id);
      setDriveSlots(s ?? []);
    } catch (err) {
      toast(errMsg(err, 'Could not add the session.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const scheduleTests = async () => {
    setBusy('tests');
    try {
      const { data } = await drivesApi.scheduleTests(id);
      toast(`Scheduled ${data.sessions} test session${data.sessions !== 1 ? 's' : ''} for ${data.assigned} students.`, 'success');
      load();
    } catch (err) {
      toast(errMsg(err, 'Could not schedule tests.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const publishResults = async () => {
    setBusy('results');
    try {
      const { data } = await drivesApi.publishResults(id);
      toast(`Shortlisted ${data.shortlisted} students and built ${data.interviews} interview slots.`, 'success');
      load();
    } catch (err) {
      toast(errMsg(err, 'Could not publish results.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const markSelected = async (studentId, name) => {
    try {
      await drivesApi.markSelected(id, studentId);
      toast(`${name} marked as selected.`, 'success');
      const { data: a } = await drivesApi.applications(id);
      setApps(a ?? []);
    } catch (err) {
      toast(errMsg(err, 'Could not mark as selected.'), 'error');
    }
  };

  const interviewed = apps.filter((a) => a.status === 'shortlisted' || a.status === 'selected');

  const saveNote = async (e) => {
    e.preventDefault();
    try {
      await drivesApi.saveFeedback(id, {
        studentId: Number(fbStudent),
        score: Number(fbScore),
        remarks: fbRemarks,
        roundId: fbRound ? Number(fbRound) : undefined,
      });
      toast('Interview note saved.', 'success');
      setFbRemarks('');
      const { data } = await drivesApi.feedback(id);
      setScorecard(data ?? []);
      const { data: pending } = await drivesApi.feedbackPending(id);
      setFbPending(pending ?? null);
    } catch (err) {
      toast(errMsg(err, 'Could not save the note.'), 'error');
    }
  };

  // One nudge per student still missing notes — explicit button, never
  // automatic, so nobody is reminded twice by accident.
  const remindFeedback = async () => {
    setReminding(true);
    try {
      const { data } = await drivesApi.remindFeedback(id);
      toast(data.reminded
        ? `Sent ${data.reminded} reminder${data.reminded !== 1 ? 's' : ''} — check your notifications.`
        : 'Every interviewed student already has a full set of notes.', 'success');
      const { data: pending } = await drivesApi.feedbackPending(id);
      setFbPending(pending ?? null);
    } catch (err) {
      toast(errMsg(err, 'Could not send reminders.'), 'error');
    } finally {
      setReminding(false);
    }
  };

  const addRound = async (e) => {
    e.preventDefault();
    try {
      await drivesApi.addRound(id, { name: roundName, cutoff: Number(roundCutoff) });
      toast(`Round “${roundName}” added.`, 'success');
      setRoundName('');
      const { data } = await drivesApi.rounds(id);
      setRounds(data ?? []);
    } catch (err) {
      toast(errMsg(err, 'Could not add the round.'), 'error');
    }
  };

  const makeRoundActive = async (round) => {
    try {
      await drivesApi.setRoundStatus(id, round.id, 'active');
      toast(`“${round.name}” is now the current round. Its cutoff applies when results are published.`, 'success');
      const { data } = await drivesApi.rounds(id);
      setRounds(data ?? []);
    } catch (err) {
      toast(errMsg(err, 'Could not change the round.'), 'error');
    }
  };

  const selectedCount = apps.filter((a) => a.status === 'selected').length;

  const generateOffers = async (e) => {
    e.preventDefault();
    try {
      const { data } = await drivesApi.generateOffers(id, {
        package_lpa: offerPackage ? Number(offerPackage) : undefined,
        joining_date: offerJoining || undefined,
      });
      toast(data.created ? `Created ${data.created} offer letter${data.created !== 1 ? 's' : ''}.` : 'Everyone selected already has an offer letter.', 'success');
      const { data: list } = await drivesApi.offers(id);
      setOfferList(list ?? []);
    } catch (err) {
      toast(errMsg(err, 'Could not generate offer letters.'), 'error');
    }
  };

  if (loading) return <div className="text-sm text-slate-400 py-10 text-center">Loading drive…</div>;
  if (!drive) return <div className="text-sm text-slate-400 py-10 text-center">Drive not found.</div>;

  const stage = pipeline?.stage ?? drive.status;
  const stageIdx = { open: 0, testing: 1, interviews: 2, closed: 3, draft: 0 }[stage] ?? 0;
  const pipeSteps = [
    { key: 'apply', label: 'Applications', state: stageIdx > 0 ? 'done' : 'current', detail: `${pipeline?.applied ?? 0} applied` },
    { key: 'test', label: 'Test', state: stageIdx > 1 ? 'done' : stageIdx === 1 ? 'current' : 'todo', detail: pipeline?.test_sessions ? `${pipeline.test_sessions} sessions` : drive.test_date ? formatDate(drive.test_date).split(',')[0] : '' },
    { key: 'result', label: 'Results', state: stageIdx > 2 ? 'done' : stageIdx === 2 ? 'current' : 'todo', detail: pipeline?.tests_taken ? `${pipeline.tests_taken} taken` : '' },
    { key: 'interview', label: 'Interviews', state: stageIdx >= 3 ? 'done' : stageIdx === 2 ? 'current' : 'todo', detail: pipeline?.interviews ? `${pipeline.interviews} slots` : '' },
  ];

  const canScheduleTests = stage === 'open' && (pipeline?.applied ?? 0) > 0 && (pipeline?.questions ?? 0) > 0;
  const canPublish = stage === 'testing' && (pipeline?.tests_taken ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="cf-card cf-rise">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-sm text-slate-400">{drive.company?.name}</div>
            <h2 className="font-display text-2xl font-bold text-slate-100">{drive.title}</h2>
            <div className="flex gap-2 mt-2 flex-wrap">
              <Badge variant={STAGE_META[stage]?.variant ?? 'neutral'}>{STAGE_META[stage]?.label ?? stage}</Badge>
              <span className="cf-chip bg-[#151B30] text-slate-400">CGPA ≥ {drive.min_cgpa}</span>
              <span className="cf-chip bg-[#151B30] text-slate-400">{(drive.allowed_branches ?? []).join(', ')}</span>
              <span className="cf-chip bg-[#151B30] text-slate-400">≤{drive.max_backlogs} backlogs</span>
            </div>
          </div>
          <div className="flex gap-2">
            {stage === 'open' && (
              <button onClick={scheduleTests} disabled={!canScheduleTests || busy} className="cf-btn-primary" title={!canScheduleTests ? 'Needs applicants and test questions first' : ''}>
                {busy === 'tests' ? 'Scheduling…' : 'Schedule tests'}
              </button>
            )}
            {stage === 'testing' && (
              <button onClick={publishResults} disabled={!canPublish || busy} className="cf-btn-success" title={!canPublish ? 'Waiting for students to take the test' : ''}>
                {busy === 'results' ? 'Publishing…' : 'Publish results'}
              </button>
            )}
          </div>
        </div>
        <div className="mt-6 max-w-2xl"><Stepper steps={pipeSteps} /></div>
        {stage === 'open' && (pipeline?.questions ?? 0) === 0 && (
          <div className="mt-4 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-300">
            No test questions yet — add them before scheduling. (Drives created with the wizard always have them.)
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          ['Applied', pipeline?.applied ?? 0, 'coral'],
          ['Tests taken', pipeline?.tests_taken ?? 0, 'amber'],
          ['Avg score', pipeline?.avg_score != null ? `${pipeline.avg_score}%` : '—', 'cyan'],
          ['Shortlisted', pipeline?.shortlisted ?? 0, 'emerald'],
          ['Interviews', pipeline?.interviews ?? 0, 'rose'],
        ].map(([label, value, accent], i) => (
          <div key={label} className={`cf-stat cf-rise cf-rise-${i}`}>
            <div>
              <div className="font-display text-2xl font-bold text-slate-100">{value}</div>
              <div className="text-xs text-slate-400 font-medium mt-0.5">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="cf-card cf-rise">
        <div className="flex gap-1 border-b border-white/10 mb-5">
          {[
            ['students', `Eligible students (${apps.filter((a) => a.eligible).length})`],
            ['results', 'Results'],
            ['config', 'Interview settings'],
          ].map(([key, label]) => (
            <button
              key={key} onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === key ? 'border-[#FF5C38] text-[#FF5C38]' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'students' && (
          apps.length === 0 ? (
            <EmptyState title="No applications yet" message="Once students apply, everyone passing your eligibility criteria shows up here automatically." />
          ) : (
            <DataTable
              columns={[
                { key: 'student', label: 'Student', render: (a) => <span className="font-medium text-slate-100">{a.student?.name}</span> },
                { key: 'roll', label: 'Roll no', render: (a) => a.student?.roll_no ?? '—' },
                { key: 'branch', label: 'Branch', render: (a) => a.student?.branch ?? '—' },
                { key: 'cgpa', label: 'CGPA', render: (a) => a.student?.cgpa ?? '—' },
                { key: 'score', label: 'Test %', render: (a) => a.test_percentage != null ? <span className="font-semibold">{Number(a.test_percentage).toFixed(1)}%</span> : <span className="text-slate-300">—</span> },
                { key: 'status', label: 'Status', render: (a) => <Badge variant={STATUS_VARIANT[a.status] ?? 'neutral'}>{a.status.replace('_', ' ')}</Badge> },
                {
                  key: 'action', label: '', render: (a) => a.status === 'shortlisted' ? (
                    <button onClick={() => markSelected(a.student.id, a.student.name)} className="text-xs font-semibold text-emerald-300 hover:text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/40 rounded-lg px-3 py-1.5 bg-emerald-500/10">
                      Select ✓
                    </button>
                  ) : null,
                },
              ]}
              rows={apps}
            />
          )
        )}

        {tab === 'results' && (
          (() => {
            const taken = apps.filter((a) => a.test_percentage != null).sort((x, y) => y.test_percentage - x.test_percentage)
              .map((a, i) => ({ ...a, rank: i + 1 }));
            return taken.length === 0 ? (
              <EmptyState title="No results yet" message="Scores appear here automatically as students submit their tests." />
            ) : (
              <DataTable
                columns={[
                  { key: 'rank', label: '#', render: (a) => <span className="font-bold text-slate-400">{a.rank}</span> },
                  { key: 'student', label: 'Student', render: (a) => <span className="font-medium text-slate-100">{a.student?.name}</span> },
                  { key: 'score', label: 'Score', render: (a) => <span className="font-bold text-[#FF5C38]">{Number(a.test_percentage).toFixed(1)}%</span> },
                  { key: 'cutoff', label: `Cutoff ${drive.min_test_score}%`, render: (a) => a.test_percentage >= drive.min_test_score ? <Badge variant="success">Above</Badge> : <Badge variant="danger">Below</Badge> },
                  { key: 'status', label: 'Status', render: (a) => <Badge variant={STATUS_VARIANT[a.status] ?? 'neutral'}>{a.status.replace('_', ' ')}</Badge> },
                ]}
                rows={taken}
              />
            );
          })()
        )}

        {tab === 'config' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {[
              ['Interview panels', drive.num_interviewers],
              ['Qualifying score', `${drive.min_test_score}%`],
              ['Shortlist cap', drive.max_shortlist],
              ['Interview length', `${drive.interview_duration_min} min`],
              ['Test date', drive.test_date ? formatDate(drive.test_date) : '—'],
              ['Interview date', drive.interview_date ? formatDate(drive.interview_date) : 'auto (test + 3 days)'],
              ['Test duration', `${drive.test_duration_min} min`],
              ['Apply by', formatDate(drive.application_deadline)],
            ].map(([k, v]) => (
              <div key={k} className="bg-[#0B0E1A] rounded-xl px-4 py-3">
                <div className="text-xs text-slate-400 uppercase tracking-wide font-semibold">{k}</div>
                <div className="font-bold text-slate-100 mt-0.5">{v}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sessions — what students book a seat for, plus add one by hand */}
      <div className="cf-card cf-rise">
        <h3 className="cf-section-title">Sessions</h3>
        <p className="cf-section-sub">Test and interview sessions for this drive. Students book a seat from the drive page; a full session puts them on the waiting list.</p>
        {slotsError && (
          <div className="mt-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm rounded-xl px-4 py-3">
            {slotsError} The list below may be out of date — reload the page to try again.
          </div>
        )}
        {driveSlots.length > 0 && (
          <div className="mt-4 space-y-2">
            {driveSlots.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 bg-[#0B0E1A] rounded-xl px-4 py-3 text-sm flex-wrap">
                <div>
                  <span className="font-bold text-slate-100">{s.title}</span>
                  <span className="text-slate-400"> · {s.type === 'test' ? 'Test' : 'Interview'} · {formatDate(s.starts_at)}{s.venue ? ` · ${s.venue}` : ''}</span>
                </div>
                <span className="text-xs font-semibold text-slate-400">{s.booked_count}/{s.capacity} booked</span>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={addSession} className="grid md:grid-cols-3 gap-3 mt-4 items-end">
          <div>
            <label className="cf-label" htmlFor="slot-type">Kind</label>
            <select id="slot-type" className="cf-input" value={slotType} onChange={(e) => setSlotType(e.target.value)}>
              <option value="test">Test</option>
              <option value="interview">Interview</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="cf-label" htmlFor="slot-title">Session name</label>
            <input id="slot-title" className="cf-input" value={slotTitle} onChange={(e) => setSlotTitle(e.target.value)} placeholder="e.g. Morning test — Lab 2" required />
          </div>
          <div>
            <label className="cf-label" htmlFor="slot-starts">Starts</label>
            <input id="slot-starts" type="datetime-local" className="cf-input" value={slotStarts} onChange={(e) => setSlotStarts(e.target.value)} required />
          </div>
          <div>
            <label className="cf-label" htmlFor="slot-ends">Ends</label>
            <input id="slot-ends" type="datetime-local" className="cf-input" value={slotEnds} onChange={(e) => setSlotEnds(e.target.value)} required />
          </div>
          <div>
            <label className="cf-label" htmlFor="slot-capacity">Seats</label>
            <input id="slot-capacity" type="number" min="1" className="cf-input" value={slotCapacity} onChange={(e) => setSlotCapacity(e.target.value)} required />
          </div>
          <div className="md:col-span-2">
            <label className="cf-label" htmlFor="slot-venue">Venue (optional)</label>
            <select id="slot-venue" className="cf-input" value={slotVenue} onChange={(e) => setSlotVenue(e.target.value)}>
              <option value="">No venue yet</option>
              {venues.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.type}, {v.capacity} seats)</option>)}
            </select>
            {venuesError && <p className="cf-hint !text-rose-400">{venuesError} You can still add the session without a venue.</p>}
          </div>
          <button type="submit" disabled={busy === 'session'} className="cf-btn-primary">
            {busy === 'session' ? 'Adding…' : 'Add session'}
          </button>
        </form>
      </div>

      {/* Rounds — several stages, each with its own cutoff */}
      <div className="cf-card cf-rise">
        <h3 className="cf-section-title">Rounds</h3>
        {rounds.length === 0 ? (
          <p className="cf-section-sub">One round — the usual test and interview.</p>
        ) : (
          <p className="cf-section-sub">Each round has its own qualifying score. The current round&apos;s score is the one used when results are published.</p>
        )}
        {rounds.length > 0 && (
          <div className="mt-4 space-y-2">
            {rounds.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 bg-[#0B0E1A] rounded-xl px-4 py-3 text-sm flex-wrap">
                <div>
                  <span className="font-bold text-slate-100">Round {r.round_no} — {r.name}</span>
                  <span className="text-slate-400"> · qualifying score {Number(r.cutoff)}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={r.status === 'active' ? 'success' : r.status === 'done' ? 'neutral' : 'info'}>{r.status === 'active' ? 'Current round' : r.status}</Badge>
                  {r.status !== 'active' && (
                    <button onClick={() => makeRoundActive(r)} className="text-xs font-semibold text-[#FF5C38] hover:text-[#FF8A6B] border border-[#FF5C38]/30 hover:border-[#FF5C38]/40 rounded-lg px-3 py-1.5 bg-[#12172A]">
                      Make current
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={addRound} className="flex gap-3 mt-4 flex-wrap items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="cf-label" htmlFor="round-name">Round name</label>
            <input id="round-name" className="cf-input" value={roundName} onChange={(e) => setRoundName(e.target.value)} placeholder="e.g. Technical round" required />
          </div>
          <div className="w-36">
            <label className="cf-label" htmlFor="round-cutoff">Qualifying score (%)</label>
            <input id="round-cutoff" type="number" min="0" max="100" step="0.5" className="cf-input" value={roundCutoff} onChange={(e) => setRoundCutoff(e.target.value)} required />
          </div>
          <button type="submit" className="cf-btn-secondary">Add round</button>
        </form>
      </div>

      {/* Offer letters — generated for every selected student */}
      <div className="cf-card cf-rise">
        <h3 className="cf-section-title">Offer letters</h3>
        <p className="cf-section-sub">Generate a letter for everyone marked as selected. Running it again only creates letters for newly selected students — nobody gets a duplicate.</p>
        {selectedCount === 0 && offerList.length === 0 ? (
          <p className="text-sm text-slate-400 mt-4">No one is selected yet. Mark shortlisted students as selected from the list above, then come back here.</p>
        ) : (
          <form onSubmit={generateOffers} className="flex gap-3 mt-4 flex-wrap items-end">
            <div className="w-40">
              <label className="cf-label" htmlFor="offer-package">Package (LPA)</label>
              <input id="offer-package" type="number" min="0" step="0.1" className="cf-input" value={offerPackage} onChange={(e) => setOfferPackage(e.target.value)} placeholder={drive.package_lpa != null ? String(drive.package_lpa) : 'e.g. 8.5'} />
              <div className="cf-hint">{drive.package_lpa != null ? `Leave blank to use the drive's ${drive.package_lpa} LPA.` : 'Leave blank if the package is not fixed yet.'}</div>
            </div>
            <div className="w-48">
              <label className="cf-label" htmlFor="offer-joining">Joining date</label>
              <input id="offer-joining" type="date" className="cf-input" value={offerJoining} onChange={(e) => setOfferJoining(e.target.value)} />
              <div className="cf-hint">Leave blank for 30 days from today.</div>
            </div>
            <button type="submit" className="cf-btn-primary" disabled={selectedCount === 0} title={selectedCount === 0 ? 'Select a student first' : ''}>
              Generate offer letters
            </button>
          </form>
        )}
        {offerList.length > 0 && (
          <div className="mt-6">
            <p className="text-sm text-slate-400 mb-3">
              {(() => {
                const accepted = offerList.filter((o) => o.status === 'accepted').length;
                const declined = offerList.filter((o) => o.status === 'declined').length;
                const pending = offerList.filter((o) => o.status !== 'accepted' && o.status !== 'declined').length;
                return `${accepted} accepted · ${declined} declined · ${pending} still deciding`;
              })()}
            </p>
            <DataTable
              columns={[
                { key: 'student', label: 'Student', render: (o) => <span className="font-medium text-slate-100">{o.student_name}</span> },
                { key: 'package', label: 'Package', render: (o) => o.package_lpa != null ? `₹${Number(o.package_lpa)} LPA` : '—' },
                { key: 'joining', label: 'Joining', render: (o) => o.joining_date ? formatDate(o.joining_date) : '—' },
                { key: 'answer', label: "Student's answer", render: (o) => o.status === 'accepted'
                  ? <Badge variant="success">Accepted</Badge>
                  : o.status === 'declined'
                    ? <Badge variant="danger">Declined</Badge>
                    : <Badge variant="neutral">Still deciding</Badge> },
                { key: 'generated', label: 'Generated', render: (o) => o.generated_at ? formatDate(o.generated_at) : '—' },
                { key: 'view', label: '', render: (o) => <Link to={`/recruiter/offers/${o.id}`} className="text-sm font-semibold text-[#FF5C38] hover:text-[#FF8A6B]">View →</Link> },
              ]}
              rows={offerList}
            />
          </div>
        )}
      </div>

      {/* Interview notes — one score per interviewer, averaged into a scorecard */}
      <div className="cf-card cf-rise">
        <h3 className="cf-section-title">Interview notes</h3>
        <p className="cf-section-sub">Score each student you interviewed (0–100) and add a short remark. Saving again updates your earlier score — you only ever have one score per student.</p>
        {fbPending && fbPending.pending_count > 0 && (
          <div className="mt-4 flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex-wrap">
            <p className="text-sm text-amber-300">
              {fbPending.pending_count} student{fbPending.pending_count !== 1 ? 's' : ''} still {fbPending.pending_count !== 1 ? 'need' : 'needs'} interview notes:{' '}
              {fbPending.pending.map((p) => `${p.name} (${p.reviewers} of ${fbPending.needed})`).join(', ')}.
            </p>
            <button onClick={remindFeedback} disabled={reminding} className="cf-btn-secondary !py-2">
              {reminding ? 'Sending…' : 'Send a reminder'}
            </button>
          </div>
        )}
        {interviewed.length === 0 ? (
          <p className="text-sm text-slate-400 mt-4">No one has reached the interview stage yet. Notes open up once students are shortlisted.</p>
        ) : (
          <form onSubmit={saveNote} className="grid md:grid-cols-[1fr_140px] gap-3 mt-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="cf-label" htmlFor="fb-student">Student</label>
                <select id="fb-student" className="cf-input" value={fbStudent} onChange={(e) => setFbStudent(e.target.value)} required>
                  <option value="">Pick a student…</option>
                  {interviewed.map((a) => <option key={a.student.id} value={a.student.id}>{a.student.name} ({a.student.branch})</option>)}
                </select>
              </div>
              <div>
                <label className="cf-label" htmlFor="fb-score">Score (0–100)</label>
                <input id="fb-score" type="number" min="0" max="100" step="0.5" className="cf-input" value={fbScore} onChange={(e) => setFbScore(e.target.value)} placeholder="e.g. 82" required />
              </div>
              {rounds.length > 0 && (
                <div>
                  <label className="cf-label" htmlFor="fb-round">Round</label>
                  <select id="fb-round" className="cf-input" value={fbRound} onChange={(e) => setFbRound(e.target.value)}>
                    <option value="">Whole drive</option>
                    {rounds.map((r) => <option key={r.id} value={r.id}>Round {r.round_no} — {r.name}</option>)}
                  </select>
                </div>
              )}
              <div className="sm:col-span-2">
                <label className="cf-label" htmlFor="fb-remarks">Remarks</label>
                <input id="fb-remarks" className="cf-input" value={fbRemarks} onChange={(e) => setFbRemarks(e.target.value)} placeholder="e.g. Strong on data structures, needs polish on system design" />
              </div>
            </div>
            <div className="flex items-end">
              <button type="submit" className="cf-btn-primary w-full">Save note</button>
            </div>
          </form>
        )}
        {scorecard.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-bold text-slate-100 mb-3">Scorecard</h4>
            <DataTable
              columns={[
                { key: 'student', label: 'Student', render: (r) => <span className="font-medium text-slate-100">{r.name}</span> },
                { key: 'avg', label: 'Average score', render: (r) => <span className="font-bold text-[#FF5C38]">{Number(r.average_score).toFixed(1)} / 100</span> },
                { key: 'reviewers', label: 'Scored by', render: (r) => `${r.reviewers} ${r.reviewers === 1 ? 'person' : 'people'}` },
                { key: 'remarks', label: 'Remarks', render: (r) => r.remarks.length ? (
                  <ul className="space-y-1">{r.remarks.map((m, i) => <li key={i} className="text-sm text-slate-400">“{m.remarks}” <span className="text-slate-400">— {m.reviewer} ({m.score})</span></li>)}</ul>
                ) : <span className="text-slate-300">—</span> },
              ]}
              rows={scorecard}
            />
          </div>
        )}
      </div>

      {/* How this drive is doing — plain bar charts, no chart library */}
      {driveStats && (
        <div className="cf-card cf-rise">
          <h3 className="cf-section-title">How this drive is doing</h3>
          <p className="cf-section-sub">Built from the drive&apos;s test scores and application stages.</p>
          <div className="grid md:grid-cols-3 gap-6 mt-5">
            <div>
              <h4 className="text-sm font-bold text-slate-100 mb-3">Test scores</h4>
              <div className="space-y-2">
                {driveStats.score_distribution.map((b) => (
                  <Bar key={b.bucket} label={`${b.bucket}%`} value={b.count} max={Math.max(...driveStats.score_distribution.map((x) => x.count), 1)} color="bg-[#FF5C38]" />
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2">How many students scored in each range.</p>
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-100 mb-3">Shortlist rate by branch</h4>
              {driveStats.branch_shortlist.length === 0 ? (
                <p className="text-sm text-slate-400">No applications yet.</p>
              ) : (
                <div className="space-y-2">
                  {driveStats.branch_shortlist.map((b) => (
                    <Bar key={b.branch} label={b.branch} value={b.shortlist_rate} max={100} color="bg-emerald-500" suffix="%" />
                  ))}
                </div>
              )}
              <p className="text-xs text-slate-400 mt-2">{driveStats.branch_shortlist.map((b) => `${b.branch}: ${b.shortlisted} of ${b.applied}`).join(' · ')}</p>
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-100 mb-3">Where students drop off</h4>
              <div className="space-y-2">
                {[
                  ['Applied', driveStats.funnel.applied, 'bg-[#FF5C38]'],
                  ['Took the test', driveStats.funnel.test_taken, 'bg-amber-500'],
                  ['Shortlisted', driveStats.funnel.shortlisted, 'bg-cyan-400'],
                  ['Selected', driveStats.funnel.selected, 'bg-emerald-500'],
                ].map(([label, n, color]) => (
                  <Bar key={label} label={label} value={n} max={Math.max(driveStats.funnel.applied, 1)} color={color} />
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2">Each step shows how many students made it that far.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
