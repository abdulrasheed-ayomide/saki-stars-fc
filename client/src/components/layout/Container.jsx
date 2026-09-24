/**
 * Page-width wrapper. Side padding starts at 8px so content keeps its width on
 * 240px screens, and grows with the viewport.
 */
export function Container({ as: Tag = 'div', className = '', children }) {
  return <Tag className={`mx-auto w-full max-w-7xl px-2 xs:px-4 sm:px-6 lg:px-8 ${className}`}>{children}</Tag>;
}
