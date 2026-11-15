// Shared loading indicator: a small spinner + plain-language message.
// Used on first render while a page's data is still loading, so the page
// never looks blank or wrongly empty.

import React from 'react';

export default function Spinner({ text = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-sm text-slate-400" role="status">
      <span className="w-5 h-5 rounded-full border-2 border-white/10 border-t-[#FF5C38] animate-spin" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}
