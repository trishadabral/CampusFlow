// Drive result PDF — builds the per-drive result file with pdfkit.
// Pure layout code: given one placement-report row and that drive's roster,
// it streams a multi-page A4 PDF (header, summary numbers, roster table).
// Kept separate from the route so it can be run standalone with fake data.
const PDFDocument = require('pdfkit');

const MARGIN = 40;
const PAGE_WIDTH = 595.28; // A4
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// "SDE Role 2027" -> "SDE-Role-2027-result.pdf". Anything that is not a
// letter, digit or dash becomes a dash, so the filename is safe to download.
function driveResultFilename(driveTitle) {
  const slug = String(driveTitle || 'drive')
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'drive'}-result.pdf`;
}

function fmtPct(v) {
  return v == null ? '—' : `${Number(v).toFixed(1)}%`;
}

function fmtCgpa(v) {
  return v == null ? '—' : Number(v).toFixed(2);
}

function fmtStatus(v) {
  return v == null ? '—' : String(v).replace(/_/g, ' ');
}

function fmtDate(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Shorten text with an ellipsis so it never overflows its column.
function fitText(doc, text, maxWidth) {
  const s = String(text ?? '');
  if (doc.widthOfString(s) <= maxWidth) return s;
  let out = s;
  while (out.length > 1 && doc.widthOfString(`${out}…`) > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

// Columns for the roster table: [key, header, width]. Widths sum to CONTENT_WIDTH.
const COLUMNS = [
  { key: 'name', header: 'Name', width: 95, lines: 1 },
  { key: 'roll_no', header: 'Roll no.', width: 46, lines: 1 },
  { key: 'branch', header: 'Branch', width: 50, lines: 1 },
  { key: 'cgpa', header: 'CGPA', width: 34, lines: 1 },
  { key: 'status', header: 'Status', width: 65, lines: 1 },
  { key: 'test_percentage', header: 'Test %', width: 40, lines: 1 },
  // Session titles ("Aptitude Test · Batch A") are long, so these two
  // columns may wrap onto a second line instead of being cut off.
  { key: 'test_session', header: 'Test session', width: 96, lines: 2 },
  { key: 'interview_slot', header: 'Interview slot', width: 89, lines: 2 },
];

const ROW_HEIGHT = 26;

function cellText(r, key) {
  switch (key) {
    case 'name': return r.name ?? '—';
    case 'roll_no': return r.roll_no ?? '—';
    case 'branch': return r.branch ?? '—';
    case 'cgpa': return fmtCgpa(r.cgpa);
    case 'status': return fmtStatus(r.status);
    case 'test_percentage': return fmtPct(r.test_percentage);
    case 'test_session': return r.test_session ?? '—';
    case 'interview_slot': return r.interview_slot ?? '—';
    default: return '';
  }
}

function buildDriveResultPdf(drive, roster, out) {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
  doc.pipe(out);

  let pageNo = 1;
  const footer = () => {
    // Keep the footer inside the writable area (page height minus margin),
    // otherwise pdfkit silently starts a new page when the text is drawn.
    doc.fontSize(8).fillColor('#94a3b8')
      .text(`CampusFlow — Drive Result · Page ${pageNo}`, MARGIN, doc.page.height - MARGIN - 12, {
        width: CONTENT_WIDTH, align: 'center',
      })
      .fillColor('#0f172a');
  };

  const drawTableHeader = (y) => {
    doc.save().rect(MARGIN, y, CONTENT_WIDTH, 22).fill('#eef2ff').restore();
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#334155');
    let x = MARGIN;
    for (const col of COLUMNS) {
      doc.text(col.header, x + 4, y + 7, { width: col.width - 8, ellipsis: true });
      x += col.width;
    }
    doc.fillColor('#0f172a');
    return y + 22;
  };

  const drawRow = (y, r, shade) => {
    if (shade) doc.save().rect(MARGIN, y, CONTENT_WIDTH, ROW_HEIGHT).fill('#f8fafc').restore();
    doc.font('Helvetica').fontSize(8.5).fillColor('#1e293b');
    let x = MARGIN;
    for (const col of COLUMNS) {
      // Two-line columns get room for ~2 lines of text before truncating.
      const maxW = col.lines === 2 ? (col.width - 8) * 1.9 : col.width - 8;
      doc.text(fitText(doc, cellText(r, col.key), maxW), x + 4, y + 5, {
        width: col.width - 8,
      });
      x += col.width;
    }
    doc.fillColor('#0f172a');
    return y + ROW_HEIGHT;
  };

  // --- Header -------------------------------------------------------------
  doc.fontSize(10).fillColor('#4f46e5').text('CampusFlow — Drive Result', MARGIN, MARGIN);
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#0f172a')
    .text(drive.drive_title || 'Drive result', MARGIN, MARGIN + 18, { width: CONTENT_WIDTH });
  doc.font('Helvetica').fontSize(11).fillColor('#475569')
    .text(`${drive.company || ''}  ·  Generated ${fmtDate(new Date())}`, MARGIN, MARGIN + 46, { width: CONTENT_WIDTH });

  // --- Summary tiles ------------------------------------------------------
  const tiles = [
    ['Applied', String(Number(drive.applied || 0))],
    ['Shortlisted', String(Number(drive.shortlisted || 0))],
    ['Selected', String(Number(drive.selected || 0))],
    ['Avg CGPA (shortlisted)', fmtCgpa(drive.avg_cgpa_shortlisted)],
  ];
  const tileW = CONTENT_WIDTH / tiles.length;
  const tileY = MARGIN + 72;
  const tileH = 52;
  tiles.forEach(([label, value], i) => {
    const x = MARGIN + i * tileW;
    doc.save().roundedRect(x + 3, tileY, tileW - 6, tileH, 8).fill('#f1f5f9').restore();
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#0f172a')
      .text(value, x + 3, tileY + 9, { width: tileW - 6, align: 'center' });
    doc.font('Helvetica').fontSize(8).fillColor('#64748b')
      .text(label, x + 3, tileY + 33, { width: tileW - 6, align: 'center' });
  });

  // --- Roster table -------------------------------------------------------
  let y = tileY + tileH + 18;
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a')
    .text(`Student list (${roster.length})`, MARGIN, y, { width: CONTENT_WIDTH });
  y += 22;
  y = drawTableHeader(y);
  footer();

  roster.forEach((r, i) => {
    if (y + ROW_HEIGHT > doc.page.height - MARGIN - 24) {
      doc.addPage();
      pageNo += 1;
      y = MARGIN;
      y = drawTableHeader(y);
      footer();
    }
    y = drawRow(y, r, i % 2 === 1);
  });

  if (!roster.length) {
    doc.font('Helvetica').fontSize(10).fillColor('#64748b')
      .text('No applicants for this drive yet.', MARGIN, y + 8, { width: CONTENT_WIDTH });
  }

  doc.end();
  return doc;
}

module.exports = { buildDriveResultPdf, driveResultFilename };
