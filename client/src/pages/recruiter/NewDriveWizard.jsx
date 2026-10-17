// Recruiter drive wizard — the whole drive setup in one guided flow:
//   1. Drive details (company, eligibility, dates)
//   2. Test questions (the aptitude test students will take)
//   3. Interview setup (panels, cutoff, shortlist cap)
//   4. Review & publish
// The system takes it from there: it schedules test sessions, grades,
// shortlists and timetables interviews automatically.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { drives as drivesApi, companies as companiesApi, errMsg } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import Stepper from '../../components/Stepper.jsx';
import Badge from '../../components/Badge.jsx';

const BRANCHES = ['CSE', 'IT', 'ECE', 'ME', 'CE', 'EE'];

const STEPS = [
  { key: 'details', label: 'Drive details' },
  { key: 'questions', label: 'Test questions' },
  { key: 'interview', label: 'Interview setup' },
  { key: 'review', label: 'Review & publish' },
];

function emptyQuestion() {
  return { text: '', options: ['', '', '', ''], correct_index: null, marks: 1 };
}

export default function NewDriveWizard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [showNewCompany, setShowNewCompany] = useState(false);
  const [newCompany, setNewCompany] = useState({ name: '', website: '', sector: '' });

  const [form, setForm] = useState({
    company_id: '', title: '', description: '',
    min_cgpa: '7.0', allowed_branches: ['CSE', 'IT'], max_backlogs: '0',
    graduation_year: '2027', application_deadline: '',
    test_date: '', interview_date: '',
  });
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const [interview, setInterview] = useState({
    num_interviewers: 2, min_test_score: 50, max_shortlist: 20,
    test_duration_min: 60, interview_duration_min: 20,
  });
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    companiesApi.list().then(({ data }) => {
      setCompanies(data ?? []);
      if ((data ?? []).length && !form.company_id) {
        setForm((f) => ({ ...f, company_id: String(data[0].id) }));
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setI = (k, v) => setInterview((f) => ({ ...f, [k]: v }));

  const toggleBranch = (b) => {
    setForm((f) => ({
      ...f,
      allowed_branches: f.allowed_branches.includes(b)
        ? f.allowed_branches.filter((x) => x !== b)
        : [...f.allowed_branches, b],
    }));
  };

  const addCompany = async () => {
    if (!newCompany.name.trim()) { toast('Company name is required.', 'error'); return; }
    try {
      const { data } = await companiesApi.create(newCompany);
      const c = data.company ?? data;
      setCompanies((list) => [...list, c]);
      setForm((f) => ({ ...f, company_id: String(c.id) }));
      setShowNewCompany(false);
      setNewCompany({ name: '', website: '', sector: '' });
      toast('Company added.', 'success');
    } catch (err) {
      toast(errMsg(err, 'Could not add the company.'), 'error');
    }
  };

  // --- question builder ---
  const setQ = (i, patch) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const setOpt = (i, oi, v) => setQuestions((qs) => qs.map((q, j) => {
    if (j !== i) return q;
    const options = q.options.map((o, k) => (k === oi ? v : o));
    return { ...q, options };
  }));

  const validateStep = () => {
    if (step === 0) {
      if (!form.company_id) return 'Pick a company.';
      if (!form.title.trim()) return 'Give the drive a title.';
      if (!form.allowed_branches.length) return 'Select at least one eligible branch.';
      if (!form.application_deadline) return 'Set an application deadline.';
      if (!form.test_date) return 'Pick a test date — the system schedules sessions on that day.';
      return null;
    }
    if (step === 1) {
      if (!questions.length) return 'Add at least one question.';
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q.text.trim()) return `Question ${i + 1}: write the question text.`;
        if (q.options.some((o) => !o.trim())) return `Question ${i + 1}: fill in all four options.`;
        if (q.correct_index == null) return `Question ${i + 1}: mark the correct option.`;
      }
      return null;
    }
    return null;
  };

  const next = () => {
    const problem = validateStep();
    if (problem) { toast(problem, 'error'); return; }
    setStep((s) => Math.min(s + 1, 3));
    window.scrollTo(0, 0);
  };
  const back = () => { setStep((s) => Math.max(s - 1, 0)); window.scrollTo(0, 0); };

  const loadPreview = async () => {
    try {
      const { data } = await drivesApi.previewEligibility({
        min_cgpa: Number(form.min_cgpa),
        allowed_branches: form.allowed_branches,
        max_backlogs: Number(form.max_backlogs),
        graduation_year: Number(form.graduation_year),
      });
      setPreview(data);
    } catch (_) { /* preview is a nice-to-have */ }
  };

  useEffect(() => { if (step === 3) loadPreview(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [step]);

  const publish = async () => {
    setPublishing(true);
    try {
      const { data } = await drivesApi.create({
        company_id: Number(form.company_id),
        title: form.title.trim(),
        description: form.description.trim() || null,
        min_cgpa: Number(form.min_cgpa),
        allowed_branches: form.allowed_branches,
        max_backlogs: Number(form.max_backlogs),
        graduation_year: Number(form.graduation_year),
        application_deadline: form.application_deadline.replace('T', ' ') + ':00',
        test_date: form.test_date,
        interview_date: form.interview_date || null,
        test_duration_min: Number(interview.test_duration_min),
        interview_duration_min: Number(interview.interview_duration_min),
        num_interviewers: Number(interview.num_interviewers),
        min_test_score: Number(interview.min_test_score),
        max_shortlist: Number(interview.max_shortlist),
      });
      const driveId = data.drive.id;
      await drivesApi.saveQuestions(driveId, questions.map((q) => ({
        text: q.text.trim(),
        options: q.options.map((o) => o.trim()),
        correct_index: q.correct_index,
        marks: Number(q.marks) || 1,
      })));
      toast('Drive published. The system will handle scheduling from here.', 'success');
      navigate(`/recruiter/drives/${driveId}`);
    } catch (err) {
      toast(errMsg(err, 'Could not publish the drive.'), 'error');
    } finally {
      setPublishing(false);
    }
  };

  const stepperSteps = STEPS.map((s, i) => ({
    ...s,
    state: i < step ? 'done' : i === step ? 'current' : 'todo',
  }));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="cf-card cf-rise">
        <Stepper steps={stepperSteps} />
      </div>

      {/* STEP 1 — details */}
      {step === 0 && (
        <div className="cf-card cf-rise space-y-5">
          <div>
            <h2 className="cf-section-title">Drive details</h2>
            <p className="cf-section-sub">The basics. Eligibility decides who can apply — everyone else never sees this drive.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="cf-label">Company</label>
              <div className="flex gap-2">
                <select value={form.company_id} onChange={(e) => set('company_id', e.target.value)} className="cf-input">
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button type="button" onClick={() => setShowNewCompany((v) => !v)} className="cf-btn-secondary whitespace-nowrap">+ New</button>
              </div>
              {showNewCompany && (
                <div className="mt-3 p-4 bg-slate-50 rounded-xl space-y-3">
                  <input value={newCompany.name} onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })} placeholder="Company name" className="cf-input" />
                  <div className="grid grid-cols-2 gap-3">
                    <input value={newCompany.website} onChange={(e) => setNewCompany({ ...newCompany, website: e.target.value })} placeholder="Website" className="cf-input" />
                    <input value={newCompany.sector} onChange={(e) => setNewCompany({ ...newCompany, sector: e.target.value })} placeholder="Sector" className="cf-input" />
                  </div>
                  <button type="button" onClick={addCompany} className="cf-btn-primary !px-4 !py-2">Add company</button>
                </div>
              )}
            </div>
            <div>
              <label className="cf-label">Job title</label>
              <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. SDE Role 2027" className="cf-input" />
            </div>
          </div>
          <div>
            <label className="cf-label">Description</label>
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} placeholder="Role, skills, CTC, location…" className="cf-input" />
          </div>
          <div>
            <label className="cf-label">Eligible branches</label>
            <div className="flex flex-wrap gap-2">
              {BRANCHES.map((b) => (
                <button
                  key={b} type="button" onClick={() => toggleBranch(b)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${form.allowed_branches.includes(b) ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="cf-label">Min CGPA</label>
              <input type="number" step="0.1" min="0" max="10" value={form.min_cgpa} onChange={(e) => set('min_cgpa', e.target.value)} className="cf-input" />
            </div>
            <div>
              <label className="cf-label">Max backlogs</label>
              <input type="number" min="0" value={form.max_backlogs} onChange={(e) => set('max_backlogs', e.target.value)} className="cf-input" />
            </div>
            <div>
              <label className="cf-label">Graduation year</label>
              <input type="number" value={form.graduation_year} onChange={(e) => set('graduation_year', e.target.value)} className="cf-input" />
            </div>
            <div>
              <label className="cf-label">Apply by</label>
              <input type="datetime-local" value={form.application_deadline} onChange={(e) => set('application_deadline', e.target.value)} className="cf-input" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="cf-label">Test date</label>
              <input type="date" value={form.test_date} onChange={(e) => set('test_date', e.target.value)} className="cf-input" />
              <p className="cf-hint">The system auto-creates lab sessions on this day.</p>
            </div>
            <div>
              <label className="cf-label">Interview date <span className="font-normal text-slate-400">(optional)</span></label>
              <input type="date" value={form.interview_date} onChange={(e) => set('interview_date', e.target.value)} className="cf-input" />
              <p className="cf-hint">Leave blank to auto-schedule 3 days after the test.</p>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2 — questions */}
      {step === 1 && (
        <div className="cf-card cf-rise space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="cf-section-title">Test questions</h2>
              <p className="cf-section-sub">Build the aptitude test. Students get one timed attempt; grading is automatic.</p>
            </div>
            <Badge variant="info">{questions.length} question{questions.length !== 1 && 's'}</Badge>
          </div>
          {questions.map((q, i) => (
            <div key={i} className="border border-slate-200 rounded-2xl p-5 bg-slate-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700">Question {i + 1}</span>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500 font-medium">Marks</label>
                  <input type="number" min="1" value={q.marks} onChange={(e) => setQ(i, { marks: e.target.value })} className="cf-input !w-20 !py-1.5" />
                  {questions.length > 1 && (
                    <button type="button" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} className="text-xs font-semibold text-rose-600 hover:text-rose-700 px-2 py-1">Remove</button>
                  )}
                </div>
              </div>
              <input value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} placeholder="Write the question…" className="cf-input" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {q.options.map((opt, oi) => (
                  <label key={oi} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 cursor-pointer transition-all ${q.correct_index === oi ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white hover:border-indigo-300'}`}>
                    <input type="radio" name={`q-${i}`} checked={q.correct_index === oi} onChange={() => setQ(i, { correct_index: oi })} className="accent-emerald-600 w-4 h-4" />
                    <input value={opt} onChange={(e) => setOpt(i, oi, e.target.value)} placeholder={`Option ${oi + 1}`} className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-slate-400" />
                  </label>
                ))}
              </div>
              <p className="cf-hint">Click the radio to mark the correct answer.</p>
            </div>
          ))}
          <button type="button" onClick={() => setQuestions((qs) => [...qs, emptyQuestion()])} className="cf-btn-secondary w-full border-dashed">
            + Add another question
          </button>
        </div>
      )}

      {/* STEP 3 — interview setup */}
      {step === 2 && (
        <div className="cf-card cf-rise space-y-5">
          <div>
            <h2 className="cf-section-title">Interview setup</h2>
            <p className="cf-section-sub">Three numbers. The system plans all the interviews from them.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-slate-200 rounded-2xl p-5">
              <label className="cf-label">Interviewers</label>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setI('num_interviewers', Math.max(1, Number(interview.num_interviewers) - 1))} className="w-9 h-9 rounded-xl border border-slate-200 font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-600">−</button>
                <span className="text-2xl font-bold text-slate-900 w-10 text-center">{interview.num_interviewers}</span>
                <button type="button" onClick={() => setI('num_interviewers', Math.min(10, Number(interview.num_interviewers) + 1))} className="w-9 h-9 rounded-xl border border-slate-200 font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-600">+</button>
              </div>
              <p className="cf-hint">Parallel interview panels the system will run.</p>
            </div>
            <div className="border border-slate-200 rounded-2xl p-5">
              <label className="cf-label">Min score to qualify (%)</label>
              <input type="number" min="0" max="100" value={interview.min_test_score} onChange={(e) => setI('min_test_score', e.target.value)} className="cf-input" />
              <p className="cf-hint">Below this, candidates are auto-rejected.</p>
            </div>
            <div className="border border-slate-200 rounded-2xl p-5">
              <label className="cf-label">Max shortlist</label>
              <input type="number" min="1" value={interview.max_shortlist} onChange={(e) => setI('max_shortlist', e.target.value)} className="cf-input" />
              <p className="cf-hint">Top scorers above the cutoff, capped here.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="cf-label">Test duration (minutes)</label>
              <input type="number" min="10" value={interview.test_duration_min} onChange={(e) => setI('test_duration_min', e.target.value)} className="cf-input" />
            </div>
            <div>
              <label className="cf-label">Interview slot length (minutes)</label>
              <input type="number" min="5" value={interview.interview_duration_min} onChange={(e) => setI('interview_duration_min', e.target.value)} className="cf-input" />
            </div>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-sm text-indigo-900">
            After results, the system assigns each shortlisted student the earliest free slot across {interview.num_interviewers} panel{Number(interview.num_interviewers) !== 1 && 's'},
            rotating through the admin's interview rooms. Nobody books anything manually.
          </div>
        </div>
      )}

      {/* STEP 4 — review */}
      {step === 3 && (
        <div className="cf-card cf-rise space-y-5">
          <div>
            <h2 className="cf-section-title">Review & publish</h2>
            <p className="cf-section-sub">One last look. Publishing opens applications immediately.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-1">Drive</div>
              <div className="font-bold text-slate-900">{form.title || '—'}</div>
              <div className="text-slate-500">{companies.find((c) => String(c.id) === form.company_id)?.name}</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-1">Eligibility</div>
              <div className="text-slate-700">CGPA ≥ {form.min_cgpa} · {form.allowed_branches.join(', ')} · ≤{form.max_backlogs} backlogs · {form.graduation_year}</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-1">Test</div>
              <div className="text-slate-700">{questions.length} questions · {interview.test_duration_min} min · {form.test_date || 'no date'}</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-1">Interviews</div>
              <div className="text-slate-700">{interview.num_interviewers} panels · ≥{interview.min_test_score}% to qualify · top {interview.max_shortlist}</div>
            </div>
          </div>
          {preview && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-sm text-emerald-900">
              <span className="font-bold text-lg">{preview.count}</span> students currently match these criteria
              {preview.sample?.length > 0 && <span className="text-emerald-700"> — e.g. {preview.sample.join(', ')}</span>}
            </div>
          )}
        </div>
      )}

      {/* nav */}
      <div className="flex items-center justify-between">
        <button type="button" onClick={back} disabled={step === 0} className="cf-btn-secondary disabled:opacity-40">← Back</button>
        {step < 3 ? (
          <button type="button" onClick={next} className="cf-btn-primary">Continue →</button>
        ) : (
          <button type="button" onClick={publish} disabled={publishing} className="cf-btn-success">
            {publishing ? 'Publishing…' : '🚀 Publish drive'}
          </button>
        )}
      </div>
    </div>
  );
}
