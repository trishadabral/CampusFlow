// My profile — the student's editable profile.
// Name, skills, photo and resume PDF. Roll number, branch, CGPA, backlogs
// and graduation year come from admission records, so they are shown
// read-only here. Photo/resume go up as base64 inside JSON (FileReader) —
// no file-upload library involved.

import React, { useEffect, useRef, useState } from 'react';
import { student as studentApi, errMsg } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_RESUME_BYTES = 5 * 1024 * 1024;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

export default function StudentProfile() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState('');
  const [skills, setSkills] = useState('');
  const [photo, setPhoto] = useState(null); // data URL preview (or null = no photo)
  const [photoChanged, setPhotoChanged] = useState(false);
  const [resumeName, setResumeName] = useState(null);
  const [resumeData, setResumeData] = useState(null); // new upload, data URL
  const [resumeChanged, setResumeChanged] = useState(false);
  const photoInput = useRef(null);
  const resumeInput = useRef(null);

  useEffect(() => {
    studentApi.profile()
      .then(({ data }) => {
        setProfile(data);
        setName(data.name ?? '');
        setSkills(data.skills ?? '');
        setPhoto(data.photo_data ?? null);
        setResumeName(data.resume_filename ?? null);
      })
      .catch((err) => toast(errMsg(err, 'Could not load your profile.'), 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickPhoto = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Please pick an image file (JPG or PNG).', 'error');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast('That photo is bigger than 2 MB. Please pick a smaller one.', 'error');
      return;
    }
    try {
      setPhoto(await readFileAsDataUrl(file));
      setPhotoChanged(true);
    } catch (err) {
      toast(errMsg(err, 'Could not read that photo.'), 'error');
    }
  };

  const pickResume = async (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast('Your resume must be a PDF file.', 'error');
      return;
    }
    if (file.size > MAX_RESUME_BYTES) {
      toast('That resume is bigger than 5 MB. Please pick a smaller file.', 'error');
      return;
    }
    try {
      setResumeData(await readFileAsDataUrl(file));
      setResumeName(file.name);
      setResumeChanged(true);
    } catch (err) {
      toast(errMsg(err, 'Could not read that file.'), 'error');
    }
  };

  const save = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast('Your name cannot be empty.', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = { name: name.trim(), skills };
      if (photoChanged) payload.photo_data = photo;
      if (resumeChanged) payload.resume_data = resumeData;
      if (resumeChanged) payload.resume_filename = resumeName;
      const { data } = await studentApi.updateProfile(payload);
      setProfile(data);
      setPhoto(data.photo_data ?? null);
      setResumeName(data.resume_filename ?? null);
      setPhotoChanged(false);
      setResumeChanged(false);
      setResumeData(null);
      toast('Profile saved.', 'success');
    } catch (err) {
      toast(errMsg(err, 'Could not save your profile.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const downloadResume = async () => {
    try {
      const { data } = await studentApi.resume();
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = resumeName || 'resume.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(errMsg(err, 'Could not download your resume.'), 'error');
    }
  };

  if (loading) return <div className="text-sm text-slate-400 py-10 text-center">Loading your profile…</div>;
  if (!profile) return <div className="text-sm text-slate-400 py-10 text-center">Your profile could not be loaded.</div>;

  const inputCls = 'w-full rounded-xl border border-white/10 bg-[#12172A] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400';

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="cf-hero cf-rise">
        <div className="relative z-10">
          <h2 className="font-display text-2xl font-bold">My profile</h2>
          <p className="text-cyan-100 text-sm mt-1">
            Recruiters see this when they look at your applications. Keep it up to date.
          </p>
        </div>
      </div>

      <form onSubmit={save} className="cf-card space-y-6">
        {/* Photo */}
        <div className="flex items-center gap-5">
          {photo ? (
            <img src={photo} alt="Your profile photo" className="w-20 h-20 rounded-2xl object-cover border border-white/10" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-[#FF5C38]/15 text-[#FF5C38] flex items-center justify-center font-display text-2xl font-bold">
              {(name || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="font-semibold text-slate-100 text-sm">Profile photo</div>
            <p className="text-xs text-slate-400 mt-0.5">JPG or PNG, smaller than 2 MB.</p>
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={() => photoInput.current?.click()} className="cf-btn-secondary !py-1.5 !px-3 text-xs">
                {photo ? 'Change photo' : 'Add a photo'}
              </button>
              {photo && (
                <button
                  type="button"
                  onClick={() => { setPhoto(null); setPhotoChanged(true); }}
                  className="text-xs font-medium text-rose-400 hover:text-rose-300 px-2 py-1.5"
                >
                  Remove
                </button>
              )}
            </div>
            <input
              ref={photoInput} type="file" accept="image/*" className="hidden"
              onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }}
            />
          </div>
        </div>

        {/* Name + email */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Full name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
            <input type="email" value={profile.email ?? ''} disabled className={`${inputCls} bg-[#0B0E1A] text-slate-400`} />
          </div>
        </div>

        {/* Academic record (read-only) */}
        <div>
          <div className="text-sm font-medium text-slate-300 mb-1.5">Your academic record</div>
          <div className="flex flex-wrap gap-2">
            <span className="cf-chip bg-[#151B30] text-slate-400">Roll no. {profile.roll_no}</span>
            <span className="cf-chip bg-[#151B30] text-slate-400">{profile.branch}</span>
            <span className="cf-chip bg-[#151B30] text-slate-400">CGPA {profile.cgpa}</span>
            <span className="cf-chip bg-[#151B30] text-slate-400">{profile.backlogs ?? 0} backlogs</span>
            <span className="cf-chip bg-[#151B30] text-slate-400">Class of {profile.graduation_year}</span>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">These come from your admission record — ask the placement office if anything looks wrong.</p>
        </div>

        {/* Skills */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Skills</label>
          <input
            type="text" value={skills} onChange={(e) => setSkills(e.target.value)}
            placeholder="e.g. Java, SQL, communication"
            className={inputCls}
          />
          <p className="text-xs text-slate-400 mt-1.5">Separate skills with commas.</p>
        </div>

        {/* Resume */}
        <div>
          <div className="text-sm font-medium text-slate-300 mb-1.5">Resume</div>
          {resumeName ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="cf-chip bg-emerald-500/10 text-emerald-300">📄 {resumeName}</span>
              {!resumeChanged && (
                <button type="button" onClick={downloadResume} className="text-xs font-semibold text-[#FF5C38] hover:text-[#FF8A6B]">
                  Download
                </button>
              )}
              <button
                type="button"
                onClick={() => { setResumeData(null); setResumeName(null); setResumeChanged(true); }}
                className="text-xs font-medium text-rose-400 hover:text-rose-300"
              >
                Remove
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No resume uploaded yet.</p>
          )}
          <button type="button" onClick={() => resumeInput.current?.click()} className="cf-btn-secondary !py-2 mt-3">
            {resumeName ? 'Replace with a new PDF' : 'Upload your resume (PDF, up to 5 MB)'}
          </button>
          <input
            ref={resumeInput} type="file" accept="application/pdf,.pdf" className="hidden"
            onChange={(e) => { pickResume(e.target.files?.[0]); e.target.value = ''; }}
          />
          {resumeChanged && resumeName && (
            <p className="text-xs text-amber-400 mt-2">New file picked — save below to upload it.</p>
          )}
        </div>

        <div className="pt-2 border-t border-white/10">
          <button type="submit" disabled={saving} className="cf-btn-primary disabled:opacity-60">
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
    </div>
  );
}
