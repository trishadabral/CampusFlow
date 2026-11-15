// CSV export helper (Phase 2) — RFC 4180, no dependencies.
//
// toCSV(columns, rows)
//   columns: [{ key, header }] — key picks the field off each row object,
//            header is the human-readable column title.
//   rows: plain objects.
// Fields containing a comma, quote, or newline are wrapped in double
// quotes, and any double quote inside a field is doubled. Lines end CRLF.

function escapeField(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
}

function toCSV(columns, rows) {
  const header = columns.map((c) => escapeField(c.header)).join(',');
  const lines = (rows || []).map((row) =>
    columns.map((c) => escapeField(row[c.key])).join(',')
  );
  return [header, ...lines].join('\r\n') + '\r\n';
}

module.exports = { toCSV };
