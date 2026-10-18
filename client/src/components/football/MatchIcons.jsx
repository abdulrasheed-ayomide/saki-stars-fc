/**
 * Small football icons drawn as inline SVG (no extra icon package). They follow the text colour
 * and size like the lucide icons used elsewhere. Decorative by default: the text next to them
 * (or a visually hidden label) says what they mean, so meaning never depends on the icon or colour.
 */
function Svg({ className = 'size-4', title, name, children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      data-icon={name}
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': 'true', focusable: 'false' })}
    >
      {children}
    </svg>
  );
}

/** Soccer ball: marks a goal scorer. */
export function SoccerBallIcon(props) {
  return (
    <Svg {...props} name="soccer-ball">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 8.2l3.6 2.6-1.4 4.2H9.8l-1.4-4.2z" fill="currentColor" stroke="none" />
      <path d="M12 8.2V2.6M15.6 10.8l5.3-1.7M14.2 15l3.3 4.5M9.8 15l-3.3 4.5M8.4 10.8L3.1 9.1" />
    </Svg>
  );
}

/** Football boot with studs: marks the player who provided the assist. */
export function FootballBootIcon(props) {
  return (
    <Svg {...props} name="football-boot">
      <path d="M4 5.5h5.2l1 4.2c2.6.4 5 1.1 7.5 2.2 1.9.8 3.3 2.1 3.3 3.6v.9H3.3l.7-5.4z" />
      <path d="M3.3 16.4h17.7" />
      <path d="M6 16.4v2.2M10 16.4v2.2M14 16.4v2.2M18 16.4v2.2" />
      <path d="M9.6 8.2l1.6 1M8 10.9l3 .3" />
    </Svg>
  );
}
