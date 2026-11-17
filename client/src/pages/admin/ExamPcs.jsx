// Exam PCs — manage the enrolled exam computers, allocate exam
// sessions to them, and keep the list of blocked processes. Creating a
// computer sends `resource_id` (the server rejects `lab_resource_id`
// with a 400).
import React, { useCallback, useEffect, useState } from 'react';
import { examMonitoring, users, drives, resources, errMsg } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import Badge from '../../components/Badge.jsx';
import DataTable from '../../components/DataTable.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Spinner from '../../components/Spinner.jsx';
import Modal from '../../components/Modal.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

export default function ExamPcs() {
  const { toast } = useToast();
  const [computers, setComputers] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [labs, setLabs] = useState([]);
  const [students, setStudents] = useState([]);
  const [driveOptions, setDriveOptions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showAddPc, setShowAddPc] = useState(false);
  const [newPc, setNewPc] = useState({ resource_id: '', pc_code: '' });
  const [showAllocate, setShowAllocate] = useState(false);
  const [allocate, setAllocate] = useState({ computer_id: '', student_id: '', drive_id: '', exam_window_keyword: 'CampusFlow' });
  const [newProcess, setNewProcess] = useState('');
  const [removeProcessId, setRemoveProcessId] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [pcRes, procRes, resRes, userRes, driveRes] = await Promise.all([
        examMonitoring.computers(),
        examMonitoring.prohibitedProcesses(),
        resources.list(),
        users.list(),
        drives.list(),
      ]);
      // These list endpoints return bare arrays, not { computers: [...] } wrappers.
      setComputers(pcRes.data ?? []);
      setProcesses(procRes.data ?? []);
      setLabs((resRes.data ?? []).filter((r) => r.type === 'lab'));
      setStudents((userRes.data ?? []).filter((u) => u.role === 'student'));
      setDriveOptions(driveRes.data ?? []);
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const createComputer = async (e) => {
    e.preventDefault();
    if (!newPc.resource_id || !newPc.pc_code.trim()) return;
    setBusy(true);
    try {
      const res = await examMonitoring.createComputer({ resource_id: Number(newPc.resource_id), pc_code: newPc.pc_code.trim() });
      // POST /admin/computers returns the computer flat, not { computer: {...} }.
      toast(`Computer added. Enrolment code: ${res.data.enrollment_code}`, 'success');
      setShowAddPc(false);
      setNewPc({ resource_id: '', pc_code: '' });
      load();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async (id) => {
    setBusy(true);
    try {
      const res = await examMonitoring.regenerateEnrollment(id);
      toast(`New enrolment code: ${res.data.enrollment_code}`, 'success');
      load();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const allocateSession = async (e) => {
    e.preventDefault();
    if (!allocate.computer_id || !allocate.student_id) return;
    setBusy(true);
    try {
      await examMonitoring.allocateSession({
        computer_id: Number(allocate.computer_id),
        student_id: Number(allocate.student_id),
        drive_id: allocate.drive_id ? Number(allocate.drive_id) : undefined,
        exam_window_keyword: allocate.exam_window_keyword || 'CampusFlow',
      });
      toast('Session allocated. Start it from Exam Monitoring.', 'success');
      setShowAllocate(false);
      setAllocate({ computer_id: '', student_id: '', drive_id: '', exam_window_keyword: 'CampusFlow' });
      load();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const addProcess = async (e) => {
    e.preventDefault();
    if (!newProcess.trim()) return;
    setBusy(true);
    try {
      await examMonitoring.addProhibitedProcess({ process_name: newProcess.trim() });
      toast('Process added to the blocked list.', 'success');
      setNewProcess('');
      load();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const removeProcess = async () => {
    if (!removeProcessId) return;
    setBusy(true);
    try {
      await examMonitoring.removeProhibitedProcess(removeProcessId);
      toast('Process removed from the blocked list.', 'success');
      setRemoveProcessId(null);
      load();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Spinner text="Loading exam computers…" />;

  const availablePcs = computers.filter((c) => c.status === 'available');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-100">Exam PCs</h1>
          <p className="text-sm text-slate-400 mt-1">
            Computers enrolled for proctored exams. The Windows agent on each computer signs in with its enrolment code.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="cf-btn-secondary" onClick={() => setShowAllocate(true)}>Allocate session</button>
          <button type="button" className="cf-btn-primary" onClick={() => setShowAddPc(true)}>Add computer</button>
        </div>
      </div>

      <section>
        <h2 className="cf-section-title mb-3">Computers ({computers.length})</h2>
        <div className="cf-card">
          <DataTable
            emptyHint="No exam computers yet. Add one to get its enrolment code."
            columns={[
              { key: 'pc_code', label: 'Computer', render: (c) => <span className="font-semibold text-slate-100">{c.pc_code}</span> },
              { key: 'resource_name', label: 'Lab', render: (c) => c.lab_name ?? '—' },
              { key: 'status', label: 'Status', render: (c) => <Badge variant={c.status === 'available' ? 'success' : c.status === 'allocated' ? 'info' : 'warning'}>{c.status}</Badge> },
              { key: 'enrollment_code', label: 'Enrolment code', render: (c) => <span className="font-mono-tight text-xs">{c.enrollment_code}</span> },
              {
                key: 'actions',
                label: '',
                render: (c) => (
                  <button type="button" className="cf-btn-secondary" disabled={busy} onClick={() => regenerate(c.id)}>
                    New enrolment code
                  </button>
                ),
              },
            ]}
            rows={computers}
          />
        </div>
      </section>

      <section>
        <h2 className="cf-section-title mb-3">Blocked processes</h2>
        <p className="text-sm text-slate-400 mb-3">
          If the agent sees one of these running during an exam session, it raises a flag for review.
        </p>
        <div className="cf-card p-4">
          {processes.length === 0 ? (
            <EmptyState title="No blocked processes" message="Add the apps students should not open during an exam." />
          ) : (
            <div className="flex flex-wrap gap-2">
              {processes.map((p) => (
                <span key={p.id} className="cf-chip bg-[#151B30] text-slate-200">
                  <span className="font-mono-tight">{p.process_name}</span>
                  <button
                    type="button"
                    className="ml-1 text-slate-400 hover:text-rose-400"
                    aria-label={`Remove ${p.process_name}`}
                    onClick={() => setRemoveProcessId(p.id)}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          <form onSubmit={addProcess} className="flex gap-2 mt-4">
            <input
              className="cf-input flex-1"
              placeholder="e.g. discord.exe"
              value={newProcess}
              onChange={(e) => setNewProcess(e.target.value)}
            />
            <button type="submit" className="cf-btn-primary" disabled={busy || !newProcess.trim()}>
              Add
            </button>
          </form>
        </div>
      </section>

      <Modal isOpen={showAddPc} onClose={() => setShowAddPc(false)} title="Add computer">
        <form onSubmit={createComputer} className="space-y-4">
          <div>
            <label className="cf-label" htmlFor="pc-lab">Lab</label>
            <select id="pc-lab" className="cf-input" value={newPc.resource_id} onChange={(e) => setNewPc({ ...newPc, resource_id: e.target.value })} required>
              <option value="">Choose a lab…</option>
              {labs.map((l) => (
                <option key={l.id} value={l.id}>{l.name}{l.location ? ` — ${l.location}` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="cf-label" htmlFor="pc-code">Computer code</label>
            <input id="pc-code" className="cf-input" placeholder="e.g. LAB-A-PC01" value={newPc.pc_code} onChange={(e) => setNewPc({ ...newPc, pc_code: e.target.value })} required />
            <p className="cf-hint">Shown on the monitoring screen. The enrolment code is generated for you.</p>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="cf-btn-secondary" onClick={() => setShowAddPc(false)}>Cancel</button>
            <button type="submit" className="cf-btn-primary" disabled={busy}>Add computer</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showAllocate} onClose={() => setShowAllocate(false)} title="Allocate exam session">
        <form onSubmit={allocateSession} className="space-y-4">
          <div>
            <label className="cf-label" htmlFor="al-pc">Computer</label>
            <select id="al-pc" className="cf-input" value={allocate.computer_id} onChange={(e) => setAllocate({ ...allocate, computer_id: e.target.value })} required>
              <option value="">Choose an available computer…</option>
              {availablePcs.map((c) => (
                <option key={c.id} value={c.id}>{c.pc_code} — {c.lab_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="cf-label" htmlFor="al-student">Student</label>
            <select id="al-student" className="cf-input" value={allocate.student_id} onChange={(e) => setAllocate({ ...allocate, student_id: e.target.value })} required>
              <option value="">Choose a student…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="cf-label" htmlFor="al-drive">Drive (optional)</label>
            <select id="al-drive" className="cf-input" value={allocate.drive_id} onChange={(e) => setAllocate({ ...allocate, drive_id: e.target.value })}>
              <option value="">No drive linked</option>
              {driveOptions.map((d) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="cf-label" htmlFor="al-keyword">Exam window keyword</label>
            <input id="al-keyword" className="cf-input" value={allocate.exam_window_keyword} onChange={(e) => setAllocate({ ...allocate, exam_window_keyword: e.target.value })} />
            <p className="cf-hint">The agent watches for a window whose title contains this text.</p>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="cf-btn-secondary" onClick={() => setShowAllocate(false)}>Cancel</button>
            <button type="submit" className="cf-btn-primary" disabled={busy}>Allocate session</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={removeProcessId != null}
        onClose={() => setRemoveProcessId(null)}
        onConfirm={removeProcess}
        title="Remove blocked process?"
        message="The agent will no longer flag this app during exam sessions."
        confirmText="Remove"
        loading={busy}
      />
    </div>
  );
}
