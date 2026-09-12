// MuraStream icon set — stroke-based inline SVGs (Feather/Lucide-style).
// All icons inherit `currentColor` and scale via the `size` prop, so they
// follow the site theme like every other UI element. No emoji anywhere.

type IconProps = { size?: number; color?: string; strokeWidth?: number };

function Svg({ size = 16, color = 'currentColor', strokeWidth = 2, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, verticalAlign: 'middle' }}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></Svg>
);

export const FlameIcon = (p: IconProps) => (
  <Svg {...p}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></Svg>
);

export const FilmIcon = (p: IconProps) => (
  <Svg {...p}><rect x="2" y="2" width="20" height="20" rx="2.18" /><path d="M7 2v20" /><path d="M17 2v20" /><path d="M2 12h20" /><path d="M2 7h5" /><path d="M2 17h5" /><path d="M17 17h5" /><path d="M17 7h5" /></Svg>
);

export const TvIcon = (p: IconProps) => (
  <Svg {...p}><rect x="2" y="7" width="20" height="15" rx="2" /><path d="M17 2l-5 5-5-5" /></Svg>
);

export const GlobeIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></Svg>
);

export const HeartIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Svg {...p}>
    <path
      d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
      fill={filled ? 'currentColor' : 'none'}
    />
  </Svg>
);

export const StarIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Svg {...p}>
    <path
      d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"
      fill={filled ? 'currentColor' : 'none'}
    />
  </Svg>
);

export const BookmarkIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Svg {...p}>
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" fill={filled ? 'currentColor' : 'none'} />
  </Svg>
);

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></Svg>
);

export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></Svg>
);

export const UserIcon = (p: IconProps) => (
  <Svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Svg>
);

export const GearIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></Svg>
);

export const VideoIcon = (p: IconProps) => (
  <Svg {...p}><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></Svg>
);

export const BookIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></Svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}><path d="M9 18l6-6-6-6" /></Svg>
);

export const SignOutIcon = (p: IconProps) => (
  <Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></Svg>
);

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></Svg>
);

export const ChartIcon = (p: IconProps) => (
  <Svg {...p}><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></Svg>
);

export const ExportIcon = (p: IconProps) => (
  <Svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M12 18v-6" /><path d="M9 15l3 3 3-3" /></Svg>
);

export const PlayIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Svg {...p}><path d="M5 3l14 9-14 9V3z" fill={filled ? 'currentColor' : 'none'} /></Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 5v14" /><path d="M5 12h14" /></Svg>
);

export const EditIcon = (p: IconProps) => (
  <Svg {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></Svg>
);

export const PackageIcon = (p: IconProps) => (
  <Svg {...p}><path d="M16.5 9.4l-9-5.19" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.27 6.96L12 12.01l8.73-5.05" /><path d="M12 22.08V12" /></Svg>
);

export const SparklesIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.9z" /><path d="M19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z" /></Svg>
);

export const ShuffleIcon = (p: IconProps) => (
  <Svg {...p}><path d="M16 3h5v5" /><path d="M4 20L21 3" /><path d="M21 16v5h-5" /><path d="M15 15l6 6" /><path d="M4 4l5 5" /></Svg>
);

export const PopcornIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 10a3 3 0 0 1-1.6-5.5A3 3 0 0 1 8 1.9 3 3 0 0 1 12 3a3 3 0 0 1 4-1.1 3 3 0 0 1 2.6 2.6A3 3 0 0 1 17 10" />
    <path d="M5 10h14l-1.2 10a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" />
    <path d="M12 10v11.8" />
  </Svg>
);

export const ShareIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4" /><path d="M15.4 6.5l-6.8 4" /></Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}><path d="M20 6L9 17l-5-5" /></Svg>
);

export const FlagIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22v-7" /></Svg>
);

export const ScrollIcon = (p: IconProps) => (
  <Svg {...p}><path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4" /><path d="M19 17V5a2 2 0 0 0-2-2H4" /></Svg>
);
