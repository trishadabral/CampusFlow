// Stepper — horizontal step indicator used by the recruiter wizard and the
// student journey cards. Each step: { key, label, state: 'done'|'current'|'todo', detail? }.

import React from 'react';

function StepCircle({ state, index }) {
  if (state === 'done') {
    return (
      <span className="w-8 h-8 rounded-full flex items-center justify-center bg-emerald-500 text-white shrink-0">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  }
  if (state === 'current') {
    return (
      <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
        style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 4px 12px -2px rgba(79,70,229,.5)' }}>
        {index + 1}
      </span>
    );
  }
  return (
    <span className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-100 text-slate-400 text-sm font-bold shrink-0 border border-slate-200">
      {index + 1}
    </span>
  );
}

export default function Stepper({ steps, vertical = false }) {
  if (vertical) {
    return (
      <ol className="space-y-0">
        {steps.map((s, i) => (
          <li key={s.key} className="flex gap-4">
            <div className="flex flex-col items-center">
              <StepCircle state={s.state} index={i} />
              {i < steps.length - 1 && (
                <span className={`w-0.5 flex-1 min-h-[28px] ${s.state === 'done' ? 'bg-emerald-300' : 'bg-slate-200'}`} />
              )}
            </div>
            <div className="pb-6 -mt-0.5">
              <div className={`text-sm font-semibold ${s.state === 'todo' ? 'text-slate-400' : 'text-slate-900'}`}>
                {s.label}
              </div>
              {s.detail && <div className="text-[13px] text-slate-500 mt-0.5">{s.detail}</div>}
            </div>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ol className="flex items-start">
      {steps.map((s, i) => (
        <li key={s.key} className={`flex items-start ${i < steps.length - 1 ? 'flex-1' : ''}`}>
          <div className="flex flex-col items-center text-center shrink-0 w-20">
            <StepCircle state={s.state} index={i} />
            <div className={`text-xs font-semibold mt-2 leading-tight ${s.state === 'todo' ? 'text-slate-400' : 'text-slate-800'}`}>
              {s.label}
            </div>
            {s.detail && <div className="text-[11px] text-slate-400 mt-0.5 leading-tight">{s.detail}</div>}
          </div>
          {i < steps.length - 1 && (
            <div className={`h-0.5 flex-1 mt-4 mx-1 rounded ${s.state === 'done' ? 'bg-emerald-400' : 'bg-slate-200'}`} />
          )}
        </li>
      ))}
    </ol>
  );
}
