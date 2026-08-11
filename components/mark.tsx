/**
 * The Locus datum mark.
 *
 * A surveyor's datum: a ring, a point, and eight ticks marking the directions.
 * "Locus" means "a place" — the point is the place. Used as brand mark,
 * favicon, default page icon, and empty-state motif.
 */
export function LocusMark({
  size = 18,
  className,
  strokeWidth = 1.6,
}: {
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="16" cy="16" r="9.2" stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="16" cy="16" r="2" fill="currentColor" />
      {/* cardinal ticks */}
      <line x1="16" y1="1.4" x2="16" y2="4.6" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <line x1="16" y1="27.4" x2="16" y2="30.6" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <line x1="1.4" y1="16" x2="4.6" y2="16" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <line x1="27.4" y1="16" x2="30.6" y2="16" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      {/* intercardinal ticks */}
      <line x1="5.7" y1="5.7" x2="7.9" y2="7.9" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.7" />
      <line x1="24.1" y1="24.1" x2="26.3" y2="26.3" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.7" />
      <line x1="26.3" y1="5.7" x2="24.1" y2="7.9" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.7" />
      <line x1="7.9" y1="24.1" x2="5.7" y2="26.3" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

export function LocusWordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LocusMark size={19} strokeWidth={1.8} className="text-accent" />
      <span
        className="font-display font-semibold tracking-[0.16em] text-[15px]"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        LOCUS
      </span>
    </span>
  );
}
