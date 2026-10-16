// Clean table: sticky header, row hover, optional empty hint.
// columns: [{ key, label, render?: (row) => node, className? }]

export default function DataTable({ columns, rows, emptyHint }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-sm text-slate-400">
        {emptyHint ?? 'Nothing here yet.'}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto slim-scroll">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b border-slate-100 text-left">
            {columns.map((c) => (
              <th key={c.key} className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((row, i) => (
            <tr key={row.id ?? i} className="hover:bg-slate-50/70 transition-colors">
              {columns.map((c) => (
                <td key={c.key} className={`px-5 py-3.5 align-middle ${c.className ?? ''}`}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
