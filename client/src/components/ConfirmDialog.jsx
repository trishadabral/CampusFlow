// Confirm dialog built on Modal. Merged from Ishika's repo 2026-11-16
// and restyled to this app's dark theme. `variant` is 'danger' (coral)
// or 'primary'.
import React from 'react';
import Modal from './Modal';

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  loading = false,
}) {
  const isDanger = variant === 'danger';

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-md" showClose={!loading}>
      <div className="flex items-start gap-4">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
            isDanger
              ? 'bg-red-500/10 text-red-400 border-red-500/30'
              : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
          }`}
        >
          ⚠
        </div>
        <div className="flex-1">
          <h4 className="text-base font-semibold text-white">{title}</h4>
          <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">{message}</p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
        <button
          type="button"
          className="cf-btn-secondary"
          onClick={onClose}
          disabled={loading}
        >
          {cancelText}
        </button>
        <button
          type="button"
          className={isDanger ? 'cf-btn-danger' : 'cf-btn-primary'}
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? 'Please wait…' : confirmText}
        </button>
      </div>
    </Modal>
  );
}
