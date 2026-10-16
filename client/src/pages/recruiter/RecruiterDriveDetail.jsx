// Recruiter drive detail — the pipeline command view.
// A drive flows: Applications → Test scheduled → Results → Interviews.
// The recruiter watches it move and presses exactly two buttons; the system
// does everything else. Tabs: eligible students, test sessions, results.

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { drives as drivesApi, errMsg } from '../../api.js';
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

export default function RecruiterDriveDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [drive, setDrive] = useState(null);
  const [pipeline, setPipeline] = useState(null);
  const [apps, setApps] = useState([]);
  const [tab, setTab] = useState('students');
  const [busy, setBusy] = useState(null);

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
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const scheduleTests = async () => {
    setBusy('tests');
    try {
      const { data } = await drivesApi.scheduleTests(id);
      toast(`Scheduled ${data.sessions} test session${data.sessions !== 1 ? 's' : ''} for ${data.assigned} students.`, 'success');
      load();
    } catch (err) {
      toast(errMsg(err, 'Could not schedule test sessions.'), 'error');
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

  if (loading) return <div className="text-sm text-slate-500 py-10 text-center">Loading drive…</div>;
  if (!drive) return <div className="text-sm text-slate-500 py-10 text-center">Drive not found.</div>;

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
            <div className="text-sm text-slate-500">{drive.company?.name}</div>
            <h2 className="text-2xl font-bold text-slate-900">{drive.title}</h2>
            <div className="flex gap-2 mt-2 flex-wrap">
              <Badge variant={STAGE_META[stage]?.variant ?? 'neutral'}>{STAGE_META[stage]?.label ?? stage}</Badge>
              <span className="cf-chip bg-slate-100 text-slate-600">CGPA ≥ {drive.min_cgpa}</span>
              <span className="cf-chip bg-slate-100 text-slate-600">{(drive.allowed_branches ?? []).join(', ')}</span>
              <span className="cf-chip bg-slate-100 text-slate-600">≤{drive.max_backlogs} backlogs</span>
            </div>
          </div>
          <div className="flex gap-2">
            {stage === 'open' && (
              <button onClick={scheduleTests} disabled={!canScheduleTests || busy} className="cf-btn-primary" title={!canScheduleTests ? 'Needs applicants and test questions first' : ''}>
                {busy === 'tests' ? 'Scheduling…' : '⚙️ Schedule test sessions'}
              </button>
            )}
            {stage === 'testing' && (
              <button onClick={publishResults} disabled={!canPublish || busy} className="cf-btn-success" title={!canPublish ? 'Waiting for students to take the test' : ''}>
                {busy === 'results' ? 'Publishing…' : '📊 Publish results & schedule interviews'}
              </button>
            )}
          </div>
        </div>
        <div className="mt-6 max-w-2xl"><Stepper steps={pipeSteps} /></div>
        {stage === 'open' && (pipeline?.questions ?? 0) === 0 && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-900">
            No test questions yet — add them before scheduling. (Drives created with the wizard always have them.)
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          ['Applied', pipeline?.applied ?? 0, 'indigo'],
          ['Tests taken', pipeline?.tests_taken ?? 0, 'amber'],
          ['Avg score', pipeline?.avg_score != null ? `${pipeline.avg_score}%` : '—', 'violet'],
          ['Shortlisted', pipeline?.shortlisted ?? 0, 'emerald'],
          ['Interviews', pipeline?.interviews ?? 0, 'rose'],
        ].map(([label, value, accent], i) => (
          <div key={label} className={`cf-stat cf-rise cf-rise-${i}`}>
            <div>
              <div className="text-2xl font-bold text-slate-900">{value}</div>
              <div className="text-xs text-slate-500 font-medium mt-0.5">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="cf-card cf-rise">
        <div className="flex gap-1 border-b border-slate-100 mb-5">
          {[
            ['students', `Eligible students (${apps.filter((a) => a.eligible).length})`],
            ['results', 'Test results'],
            ['config', 'Interview config'],
          ].map(([key, label]) => (
            <button
              key={key} onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
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
                { key: 'student', label: 'Student', render: (a) => <span className="font-medium text-slate-900">{a.student?.name}</span> },
                { key: 'roll', label: 'Roll no', render: (a) => a.student?.roll_no ?? '—' },
                { key: 'branch', label: 'Branch', render: (a) => a.student?.branch ?? '—' },
                { key: 'cgpa', label: 'CGPA', render: (a) => a.student?.cgpa ?? '—' },
                { key: 'score', label: 'Test %', render: (a) => a.test_percentage != null ? <span className="font-semibold">{Number(a.test_percentage).toFixed(1)}%</span> : <span className="text-slate-300">—</span> },
                { key: 'status', label: 'Status', render: (a) => <Badge variant={STATUS_VARIANT[a.status] ?? 'neutral'}>{a.status.replace('_', ' ')}</Badge> },
                {
                  key: 'action', label: '', render: (a) => a.status === 'shortlisted' ? (
                    <button onClick={() => markSelected(a.student.id, a.student.name)} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 border border-emerald-200 hover:border-emerald-300 rounded-lg px-3 py-1.5 bg-emerald-50">
                      Mark selected ✓
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
                  { key: 'student', label: 'Student', render: (a) => <span className="font-medium text-slate-900">{a.student?.name}</span> },
                  { key: 'score', label: 'Score', render: (a) => <span className="font-bold text-indigo-700">{Number(a.test_percentage).toFixed(1)}%</span> },
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
              <div key={k} className="bg-slate-50 rounded-xl px-4 py-3">
                <div className="text-xs text-slate-500 uppercase tracking-wide font-semibold">{k}</div>
                <div className="font-bold text-slate-900 mt-0.5">{v}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
