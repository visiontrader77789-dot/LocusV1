/**
 * Icon set. One visual language: 1.5px strokes, 24px grid, round caps/joins.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 16, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: IconProps) => (
  <Base {...p}><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9.5Z" /><path d="M9 21v-7h6v7" /></Base>
);

export const IconPage = (p: IconProps) => (
  <Base {...p}><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20V3.5Z" /><path d="M14 3.5V8h4" /><path d="M9.5 12.5h5M9.5 16h5" /></Base>
);

export const IconTasks = (p: IconProps) => (
  <Base {...p}><rect x="4" y="3.5" width="16" height="17" rx="1.5" /><path d="m8 12 2.2 2.2L16 8.6" /></Base>
);

export const IconFiles = (p: IconProps) => (
  <Base {...p}><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h9A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-10Z" /></Base>
);

export const IconStar = (p: IconProps) => (
  <Base {...p}><path d="m12 4 2.35 4.85 5.3.73-3.85 3.7.94 5.26L12 16l-4.74 2.54.94-5.26-3.85-3.7 5.3-.73L12 4Z" /></Base>
);

export const IconStarFilled = (p: IconProps) => (
  <Base {...p}><path fill="currentColor" stroke="none" d="m12 4 2.35 4.85 5.3.73-3.85 3.7.94 5.26L12 16l-4.74 2.54.94-5.26-3.85-3.7 5.3-.73L12 4Z" /></Base>
);

export const IconSearch = (p: IconProps) => (
  <Base {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.8-3.8" /></Base>
);

export const IconSettings = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.13-1.32l1.9-1.47-2-3.46-2.19.92a7 7 0 0 0-2.28-1.32L13.9 3h-3.8l-.4 2.35a7 7 0 0 0-2.28 1.32l-2.19-.92-2 3.46 1.9 1.47A7 7 0 0 0 5 12c0 .45.05.9.13 1.32l-1.9 1.47 2 3.46 2.19-.92a7 7 0 0 0 2.28 1.32L10.1 21h3.8l.4-2.35a7 7 0 0 0 2.28-1.32l2.19.92 2-3.46-1.9-1.47c.08-.42.13-.87.13-1.32Z" /></Base>
);

export const IconPlus = (p: IconProps) => (
  <Base {...p}><path d="M12 5v14M5 12h14" /></Base>
);

export const IconTrash = (p: IconProps) => (
  <Base {...p}><path d="M5 7h14M10 7V5.5A.5.5 0 0 1 10.5 5h3a.5.5 0 0 1 .5.5V7M6.5 7l.7 12a1 1 0 0 0 1 .9h7.6a1 1 0 0 0 1-.9l.7-12" /><path d="M10 11v6M14 11v6" /></Base>
);

export const IconCopy = (p: IconProps) => (
  <Base {...p}><rect x="9" y="9" width="11" height="11" rx="1.5" /><path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" /></Base>
);

export const IconMore = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="19" r="1" fill="currentColor" /></Base>
);

export const IconChevronRight = (p: IconProps) => (
  <Base {...p}><path d="m9.5 6 6 6-6 6" /></Base>
);

export const IconChevronDown = (p: IconProps) => (
  <Base {...p}><path d="m6 9.5 6 6 6-6" /></Base>
);

export const IconChevronUp = (p: IconProps) => (
  <Base {...p}><path d="m6 14.5 6-6 6 6" /></Base>
);

export const IconChevronLeft = (p: IconProps) => (
  <Base {...p}><path d="m14.5 6-6 6 6 6" /></Base>
);

export const IconLink = (p: IconProps) => (
  <Base {...p}><path d="M10 13.5a4 4 0 0 0 5.66 0l2.83-2.83a4 4 0 0 0-5.66-5.66l-1.41 1.41" /><path d="M14 10.5a4 4 0 0 0-5.66 0L5.5 13.33a4 4 0 0 0 5.66 5.66l1.42-1.41" /></Base>
);

export const IconImage = (p: IconProps) => (
  <Base {...p}><rect x="3.5" y="4.5" width="17" height="15" rx="1.5" /><circle cx="9" cy="10" r="1.6" /><path d="m4.5 18 5-5 3 3 3-3 4 4" /></Base>
);

export const IconUpload = (p: IconProps) => (
  <Base {...p}><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" /><path d="M4 16.5V20a.5.5 0 0 0 .5.5h15a.5.5 0 0 0 .5-.5v-3.5" /></Base>
);

export const IconDownload = (p: IconProps) => (
  <Base {...p}><path d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5" /><path d="M4 16.5V20a.5.5 0 0 0 .5.5h15a.5.5 0 0 0 .5-.5v-3.5" /></Base>
);

export const IconX = (p: IconProps) => (
  <Base {...p}><path d="M6 6l12 12M18 6 6 18" /></Base>
);

export const IconCheck = (p: IconProps) => (
  <Base {...p}><path d="m5 12.5 4.5 4.5L19 7" /></Base>
);

export const IconShield = (p: IconProps) => (
  <Base {...p}><path d="M12 3 5 5.8v5.7c0 4.2 3 7.4 7 9.5 4-2.1 7-5.3 7-9.5V5.8L12 3Z" /><path d="m9 12 2.2 2.2L15.5 9.7" /></Base>
);

export const IconInfo = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5" /><circle cx="12" cy="8" r="0.8" fill="currentColor" /></Base>
);

export const IconAlert = (p: IconProps) => (
  <Base {...p}><path d="M12 4 2.8 19.5h18.4L12 4Z" /><path d="M12 10v4" /><circle cx="12" cy="17" r="0.8" fill="currentColor" /></Base>
);

export const IconSun = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19" /></Base>
);

export const IconMoon = (p: IconProps) => (
  <Base {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></Base>
);

export const IconMonitor = (p: IconProps) => (
  <Base {...p}><rect x="3" y="4.5" width="18" height="12" rx="1.5" /><path d="M8.5 20.5h7M12 16.5v4" /></Base>
);

export const IconGrip = (p: IconProps) => (
  <Base {...p}><circle cx="9" cy="6" r="0.9" fill="currentColor" /><circle cx="15" cy="6" r="0.9" fill="currentColor" /><circle cx="9" cy="12" r="0.9" fill="currentColor" /><circle cx="15" cy="12" r="0.9" fill="currentColor" /><circle cx="9" cy="18" r="0.9" fill="currentColor" /><circle cx="15" cy="18" r="0.9" fill="currentColor" /></Base>
);

export const IconCalendar = (p: IconProps) => (
  <Base {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="1.5" /><path d="M3.5 9.5h17M8 3v3M16 3v3" /></Base>
);

export const IconTag = (p: IconProps) => (
  <Base {...p}><path d="M3 11.5V5.5A.5.5 0 0 1 3.5 5h6l10 10-6 6-10-9.5Z" /><circle cx="7.5" cy="7.5" r="1" fill="currentColor" /></Base>
);

export const IconQuote = (p: IconProps) => (
  <Base {...p}><path d="M9 7H5.5A1.5 1.5 0 0 0 4 8.5V12a1.5 1.5 0 0 0 1.5 1.5H8v2a2 2 0 0 1-2 2" /><path d="M20 7h-3.5A1.5 1.5 0 0 0 15 8.5V12a1.5 1.5 0 0 0 1.5 1.5H19v2a2 2 0 0 1-2 2" /></Base>
);

export const IconCode = (p: IconProps) => (
  <Base {...p}><path d="m8.5 8-4.5 4 4.5 4M15.5 8l4.5 4-4.5 4M13.5 4.5 10.5 19.5" /></Base>
);

export const IconList = (p: IconProps) => (
  <Base {...p}><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" fill="currentColor" /><circle cx="4.5" cy="12" r="1" fill="currentColor" /><circle cx="4.5" cy="18" r="1" fill="currentColor" /></Base>
);

export const IconListNumbered = (p: IconProps) => (
  <Base {...p}><path d="M9.5 6h11M9.5 12h11M9.5 18h11" /><path d="M4 4.5h1.5V8M4.5 10.5h2.5M4.5 12v3.5h2.5M5.5 15.5c-1 0-1.5.7-1.5 1.7 0 .7.4 1.3 1.5 1.8 1.1.5 1.5 1.1 1.5 1.8 0 1-.5 1.7-1.5 1.7" /></Base>
);

export const IconChecklist = (p: IconProps) => (
  <Base {...p}><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="m8 12.2 2 2 5.5-5.7" /></Base>
);

export const IconMinus = (p: IconProps) => (
  <Base {...p}><path d="M4 12h16" /></Base>
);

export const IconTable = (p: IconProps) => (
  <Base {...p}><rect x="3.5" y="4.5" width="17" height="15" rx="1" /><path d="M3.5 10h17M3.5 15h17M9.5 4.5v15M15.5 4.5v15" /></Base>
);

export const IconPen = (p: IconProps) => (
  <Base {...p}><path d="M4 20l.9-3.6L16.3 5l3.7 3.7L8.6 20 4 20Z" /><path d="m13.5 7.7 3.7 3.7" /></Base>
);

export const IconClock = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></Base>
);

export const IconFolder = (p: IconProps) => (
  <Base {...p}><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h9A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-10Z" /></Base>
);

export const IconFolderOpen = (p: IconProps) => (
  <Base {...p}><path d="M3.5 9.5V7A1.5 1.5 0 0 1 5 5.5h4l2 2h6A1.5 1.5 0 0 1 18.5 9" /><path d="M4 9.5h16l-1.6 8.2a1.5 1.5 0 0 1-1.47 1.3H4.5a1.5 1.5 0 0 1-1.5-1.6L4 9.5Z" /></Base>
);

export const IconFolderPlus = (p: IconProps) => (
  <Base {...p}><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h9A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-10Z" /><path d="M12 11.5v5M9.5 14h5" /></Base>
);

export const IconArrowUp = (p: IconProps) => (
  <Base {...p}><path d="M12 20V5m0 0L6.5 10.5M12 5l5.5 5.5" /></Base>
);

export const IconMath = (p: IconProps) => (
  <Base {...p}><path d="M4.5 6.5h15M5 6.5c1.4 4.3 3 8.6 4.2 13h2.6c1.2-4.4 2.8-8.7 4.2-13" /></Base>
);

export const IconHighlighter = (p: IconProps) => (
  <Base {...p}><path d="m9.5 14 7.6-7.6a1.6 1.6 0 0 1 2.3 2.3L11.8 16.3" /><path d="m9.5 14-2 4-4 2 2.5-4" /><path d="m7.5 18 5-5" /></Base>
);

export const IconEmoji = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="8.5" /><path d="M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8" /><path d="M9 9.5h.01M15 9.5h.01" /></Base>
);

export const IconExternal = (p: IconProps) => (
  <Base {...p}><path d="M14 5h5v5M19 5l-8 8" /><path d="M19 14v4.5a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-13a.5.5 0 0 1 .5-.5H10" /></Base>
);

export const IconDatabase = (p: IconProps) => (
  <Base {...p}><ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" /><path d="M4.5 5.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6" /><path d="M4.5 11.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6" /></Base>
);

export const IconWifiOff = (p: IconProps) => (
  <Base {...p}><path d="m2.5 8.5 1.6 1.6M6.8 12.8l1.5 1.5M21.5 8.5l-1.6 1.6" /><path d="M12 20.5h.01" /><path d="M5.5 13a10 10 0 0 1 3.2-2.2M9 9.6A10.5 10.5 0 0 1 12 9c3.6 0 6.8 1.7 8.9 4.3" /></Base>
);

export const IconTriangle = (p: IconProps) => (
  <Base {...p}><path d="M12 5 4 19h16L12 5Z" /></Base>
);

export const IconArrowDown = (p: IconProps) => (
  <Base {...p}><path d="M12 4v15m0 0 5.5-5.5M12 19l-5.5-5.5" /></Base>
);

export const IconPlay = (p: IconProps) => (
  <Base {...p}><path d="M7 4.5v15l12-7.5L7 4.5Z" /></Base>
);

export const IconFileText = (p: IconProps) => (
  <Base {...p}><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20V3.5Z" /><path d="M14 3.5V8h4" /><path d="M9.5 12h5M9.5 15.5h5" /></Base>
);

export const IconFileImage = (p: IconProps) => (
  <Base {...p}><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20V3.5Z" /><path d="M14 3.5V8h4" /><circle cx="10.5" cy="12" r="1.3" /><path d="m8.5 17 3-2.7 2.2 2 1.3-1.2 2 2.4" /></Base>
);

export const IconFileAudio = (p: IconProps) => (
  <Base {...p}><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20V3.5Z" /><path d="M14 3.5V8h4" /><path d="M11.5 16.5v-4l4-1.2v4" /><circle cx="10" cy="16.5" r="1.5" /><circle cx="14" cy="15.3" r="1.5" /></Base>
);

export const IconFileVideo = (p: IconProps) => (
  <Base {...p}><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20V3.5Z" /><path d="M14 3.5V8h4" /><path d="m10.5 12.5 4 2.5-4 2.5v-5Z" /></Base>
);

export const IconFileArchive = (p: IconProps) => (
  <Base {...p}><path d="M8 3.5h8l3.5 3.5V20a.5.5 0 0 1-.5.5H5.5a.5.5 0 0 1-.5-.5V7l3.5-3.5Z" /><path d="M8 3.5v4h8v-4M10 12h4M10 15h4" /></Base>
);

export const IconFileOther = (p: IconProps) => (
  <Base {...p}><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20V3.5Z" /><path d="M14 3.5V8h4" /><circle cx="12" cy="14" r="2.5" /></Base>
);

export const IconMenu = (p: IconProps) => (
  <Base {...p}><path d="M4 6.5h16M4 12h16M4 17.5h16" /></Base>
);

export const IconGear = IconSettings;

export const IconBold = (p: IconProps) => (
  <Base {...p}><path d="M7.5 5.5h5a3.2 3.2 0 0 1 0 6.4h-5v-6.4Z" /><path d="M7.5 11.9h5.8a3.2 3.2 0 0 1 0 6.4H7.5v-6.4Z" /></Base>
);

export const IconItalic = (p: IconProps) => (
  <Base {...p}><path d="M14.5 5h-5M9.5 19h5M13 5l-2 14" /></Base>
);

export const IconUnderline = (p: IconProps) => (
  <Base {...p}><path d="M7 4.5v5a5 5 0 0 0 10 0v-5M5 19.5h14" /></Base>
);

export const IconStrike = (p: IconProps) => (
  <Base {...p}><path d="M8 5.5c0-.3 1.8-1 4-1s4 .7 4 1.7c0 1.6-2.6 2.2-5.2 3.1-1.3.5-2.8.9-2.8 2.7 0 1.5 1.4 2.4 4 2.4 1.6 0 3-.4 4-1" /><path d="M4 12h16M9 18.5c.6.4 1.8.7 3 .7 2.1 0 4-.7 4-1.7" /></Base>
);

export const IconCodeInline = (p: IconProps) => (
  <Base {...p}><path d="m8.5 8.5-3 3.5 3 3.5M15.5 8.5l3 3.5-3 3.5" /></Base>
);

export const IconChart = (p: IconProps) => (
  <Base {...p}><path d="M5 20V12M10 20V5M15 20v-6M20 20V9" /><path d="M3.5 20.5h17" /></Base>
);

export const IconHourglass = (p: IconProps) => (
  <Base {...p}><path d="M7 3.5h10M7 20.5h10" /><path d="M7 3.5v3.4c0 1 .4 2 1.1 2.7L11 12l-2.9 2.4c-.7.7-1.1 1.7-1.1 2.7v3.4M17 3.5v3.4c0 1-.4 2-1.1 2.7L13 12l2.9 2.4c.7.7 1.1 1.7 1.1 2.7v3.4" /></Base>
);

export const IconNoteSticky = (p: IconProps) => (
  <Base {...p}><path d="M5 3.5h14a.5.5 0 0 1 .5.5v11.3l-4.7 4.7H5a.5.5 0 0 1-.5-.5V4A.5.5 0 0 1 5 3.5Z" /><path d="M19.5 15.5h-4.5v4.5M8.5 8.5h7M8.5 12h5" /></Base>
);

export const IconTimer = (p: IconProps) => (
  <Base {...p}><path d="M12 8.5V13l3 1.8" /><circle cx="12" cy="14" r="6.5" /><path d="M9.5 3.5h5M12 3.5V5" /></Base>
);

export const IconWidgets = (p: IconProps) => (
  <Base {...p}><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.5" /><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.5" /><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.5" /><rect x="14" y="14" width="6.5" height="6.5" rx="1.5" /></Base>
);
