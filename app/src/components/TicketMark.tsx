interface Props {
  size?: number;
  className?: string;
}

/** Drawn ticket-stub mark — the app's recurring signature shape. */
export function TicketMark({ size = 20, className }: Props) {
  return (
    <svg
      width={size}
      height={size * (18 / 28)}
      viewBox="0 0 28 18"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect x="1" y="1" width="26" height="16" rx="3" fill="currentColor" />
      <circle cx="14" cy="1" r="5" fill="var(--bg)" />
      <circle cx="14" cy="17" r="5" fill="var(--bg)" />
      <line
        x1="14" y1="7" x2="14" y2="11"
        stroke="var(--bg)"
        strokeWidth="1.6"
        strokeDasharray="1.6 2"
        strokeLinecap="round"
      />
    </svg>
  );
}
