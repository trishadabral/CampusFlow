// Code runner — grades one coding question by running the student's code
// and comparing what it prints with the expected output.
//
// Dependency-free (Node's child_process only): JavaScript runs on the same
// Node binary as the server, Python on `python3` falling back to `python`.
// The code is written to a temp file, run with a 5 second timeout, and the
// temp folder is always removed afterwards — even on a crash.
//
// Scoring is deliberately strict: exact trimmed stdout match earns full
// marks; anything else earns 0 for that question — wrong output, a runtime
// error, a timeout, or no runner installed at all.
//
// Honest limitation, worth knowing for the viva: this runs student code
// un-sandboxed, exactly as the local lab agent runs on the same machine.
// It is fine for a campus lab setup where students are trusted, but it is
// NOT a safe way to run untrusted code on a shared or public server.

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RUN_TIMEOUT_MS = 5000;
const MAX_OUTPUT_BYTES = 1024 * 1024;

// One run, captured. Never throws: every failure mode is reported as
// { error, stdout } so the caller can score it 0.
function execCapture(cmd, args) {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { timeout: RUN_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, windowsHide: true },
      (err, stdout) => resolve({ error: err || null, stdout: stdout || '' })
    );
  });
}

// Run the code once and return { error, stdout }. `error` is set for a
// runtime error, a timeout (err.killed), output over the cap, or a missing
// runner (err.code === 'ENOENT') — the python fallback handles that last
// one by retrying with `python`.
async function runCode(language, code) {
  const ext = language === 'python' ? '.py' : '.js';
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'campusflow-code-'));
  const file = path.join(dir, `solution${ext}`);
  try {
    await fs.promises.writeFile(file, String(code ?? ''), 'utf8');
    if (language === 'python') {
      let result = await execCapture('python3', [file]);
      if (result.error && result.error.code === 'ENOENT') {
        result = await execCapture('python', [file]);
      }
      return result;
    }
    // JavaScript runs on this server's own Node binary — always present.
    return await execCapture(process.execPath, [file]);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// gradeCoding({ language, code, expectedOutput }) — true when the code earns
// its marks: it ran cleanly and printed exactly the expected output
// (ignoring leading/trailing whitespace). Anything else is false (0 marks).
async function gradeCoding({ language, code, expectedOutput }) {
  try {
    const { error, stdout } = await runCode(language, code);
    if (error) return false;
    return stdout.trim() === String(expectedOutput ?? '').trim();
  } catch {
    return false;
  }
}

module.exports = { gradeCoding, runCode, RUN_TIMEOUT_MS };
