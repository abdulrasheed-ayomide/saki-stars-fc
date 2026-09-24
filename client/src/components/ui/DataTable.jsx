/**
 * Simple accessible table. On narrow screens it scrolls sideways inside its own box
 * (the page itself never scrolls horizontally).
 */
export function DataTable({ columns, rows, rowKey = (r) => r.id, caption, onRowClick, empty }) {
  if (!rows?.length) return empty ?? null;
  return (
    <div className="relative overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`px-3 py-2.5 ${c.className || ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={rowKey(row)} className={onRowClick ? 'cursor-pointer hover:bg-brand-50/50' : ''} onClick={onRowClick ? () => onRowClick(row) : undefined}>
              {columns.map((c) => (
                <td key={c.key} className={`px-3 py-2.5 align-middle ${c.cellClass || ''}`}>
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
