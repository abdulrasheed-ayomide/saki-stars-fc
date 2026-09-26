/**
 * Accessible table used across the dashboard.
 *
 * Layout rules (the same everywhere):
 * - Headers stay on one line, so they are always readable.
 * - Text wraps only between words; badges, numbers, dates and action buttons never wrap.
 * - The first column (the record's name) keeps a sensible minimum width so long names wrap
 *   onto a second line instead of squeezing to one word per line.
 * - When the columns genuinely do not fit (phones), the table scrolls sideways inside its own
 *   box, with a soft shadow at the edge as a hint. The page itself never scrolls sideways.
 *
 * Column options: `label`, `render`, `className` (th), `cellClass` (td),
 *   `nowrap` (keep on one line), `truncate` (one line, shortened with "…"; the full text is in a
 *   tooltip; give a string via `title(row)` or it uses the rendered text), `align: 'right' | 'center'`,
 *   `minWidth` (e.g. '14rem').
 */
export function DataTable({ columns, rows, rowKey = (r) => r.id, caption, onRowClick, empty }) {
  if (!rows?.length) return empty ?? null;
  return (
    <div className="relative overflow-x-auto rounded-lg border border-slate-200 bg-white [background:linear-gradient(to_right,white_30%,transparent),linear-gradient(to_left,white_30%,transparent)_100%_0,radial-gradient(farthest-side_at_0_50%,rgb(15_23_42/0.12),transparent),radial-gradient(farthest-side_at_100%_50%,rgb(15_23_42/0.12),transparent)_100%_0] [background-attachment:local,local,scroll,scroll] [background-repeat:no-repeat] [background-size:2.5rem_100%,2.5rem_100%,0.875rem_100%,0.875rem_100%]">
      <table className="w-full border-collapse text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
          <tr>
            {columns.map((c, i) => (
              <th key={c.key} scope="col" className={`whitespace-nowrap px-3 py-2.5 align-bottom ${alignClass(c)} ${i === 0 ? 'pl-4' : ''} ${c.className || ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={rowKey(row)} className={onRowClick ? 'cursor-pointer hover:bg-brand-50/50' : ''} onClick={onRowClick ? () => onRowClick(row) : undefined}>
              {columns.map((c, i) => {
                const content = c.render ? c.render(row) : row[c.key];
                const minWidth = c.minWidth ?? (i === 0 ? '12rem' : undefined);
                const title = c.truncate ? (c.title ? c.title(row) : typeof content === 'string' || typeof content === 'number' ? String(content) : undefined) : undefined;
                return (
                  <td
                    key={c.key}
                    style={minWidth ? { minWidth } : undefined}
                    className={`px-3 py-2.5 align-middle ${alignClass(c)} ${c.nowrap ? 'whitespace-nowrap' : ''} ${i === 0 ? 'pl-4' : ''} ${c.cellClass || ''}`}
                  >
                    {c.truncate ? (
                      <span className="block max-w-[16rem] truncate" title={title}>
                        {content}
                      </span>
                    ) : (
                      content
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function alignClass(c) {
  return c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : '';
}
