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
 * - Phones (below the `sm` breakpoint) use compact but readable widths so one long name does not
 *   push the other columns far off-screen: the name column (the first column that may wrap, so a
 *   "#" or date column first does not take the space) keeps 11rem, other columns that wrap keep
 *   7rem (so text wraps onto two or three lines, never one word per line), other minimum widths
 *   are capped at 11rem, and truncated text is cut at 11rem. From `sm` up nothing changes.
 *
 * Column options: `label`, `render`, `className` (th), `cellClass` (td),
 *   `nowrap` (keep on one line), `truncate` (one line, shortened with "…"; the full text is in a
 *   tooltip; give a string via `title(row)` or it uses the rendered text), `align: 'right' | 'center'`,
 *   `minWidth` (e.g. '14rem').
 */
export function DataTable({ columns, rows, rowKey = (r) => r.id, caption, onRowClick, empty }) {
  if (!rows?.length) return empty ?? null;
  const nameIndex = Math.max(0, columns.findIndex((c) => !c.nowrap));
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
                const widths = minWidths(c, i, nameIndex);
                const title = c.truncate ? (c.title ? c.title(row) : typeof content === 'string' || typeof content === 'number' ? String(content) : undefined) : undefined;
                return (
                  <td
                    key={c.key}
                    style={widths ? { '--dt-min': widths.wide, '--dt-min-phone': widths.phone } : undefined}
                    className={`px-3 py-2.5 align-middle ${widths ? 'min-w-(--dt-min-phone) sm:min-w-(--dt-min)' : ''} ${alignClass(c)} ${c.nowrap ? 'whitespace-nowrap' : ''} ${i === 0 ? 'pl-4' : ''} ${c.cellClass || ''}`}
                  >
                    {c.truncate ? (
                      <span className="block max-w-[11rem] truncate sm:max-w-[16rem]" title={title}>
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

/**
 * Minimum column widths. `wide` (sm and up) is exactly the original rule: the column's own
 * minWidth, or 12rem for the first column. `phone` is the compact version described above.
 */
function minWidths(c, i, nameIndex) {
  const wide = c.minWidth ?? (i === 0 ? '12rem' : null);
  const phone = c.minWidth ? `min(${c.minWidth}, 11rem)` : i === nameIndex ? '11rem' : c.nowrap || c.truncate ? null : '7rem';
  if (!wide && !phone) return null;
  return { wide: wide ?? '0px', phone: phone ?? '0px' };
}

function alignClass(c) {
  return c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : '';
}
