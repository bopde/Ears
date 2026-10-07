interface IconProps {
  size?: number;
  className?: string;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
});

export const PlayIcon = ({ size = 20 }: IconProps) => (
  <svg {...base(size)} fill="currentColor" stroke="none">
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
);

export const ReplayIcon = ({ size = 20 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M3 12a9 9 0 1 0 2.6-6.4" />
    <path d="M3 4v5h5" />
  </svg>
);

export const HintIcon = ({ size = 20 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M12 3a6 6 0 0 0-3.4 10.9c.5.4.9 1 .9 1.7V17h5v-1.4c0-.7.3-1.3.9-1.7A6 6 0 0 0 12 3Z" />
    <path d="M10 20.5h4" />
  </svg>
);

export const NextIcon = ({ size = 20 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M5 12h13" />
    <path d="m12.5 6 6 6-6 6" />
  </svg>
);

export const BackIcon = ({ size = 22 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M19 12H6" />
    <path d="m11.5 6-6 6 6 6" />
  </svg>
);

export const CloseIcon = ({ size = 22 }: IconProps) => (
  <svg {...base(size)}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const ChartIcon = ({ size = 22 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);

export const TuneIcon = ({ size = 22 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2.2" />
    <circle cx="10" cy="17" r="2.2" />
  </svg>
);

export const CheckIcon = ({ size = 20 }: IconProps) => (
  <svg {...base(size)} strokeWidth={2.4}>
    <path d="m4.5 12.5 5 5 10-11" />
  </svg>
);

export const CrossIcon = ({ size = 20 }: IconProps) => (
  <svg {...base(size)} strokeWidth={2.4}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const FlameIcon = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M12 3c.6 3 2.2 3.8 3.6 5.4A6.9 6.9 0 0 1 17.5 13a5.5 5.5 0 0 1-11 0c0-1.7.8-3 1.7-4.2.3 1 .9 1.6 1.7 1.9-.3-2.7.6-5.5 2.1-7.7Z" />
  </svg>
);

export const ClockIcon = ({ size = 18 }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.2l3.2 2" />
  </svg>
);

export const NoteIcon = ({ size = 22 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M9 18V6l10-2.5V15" />
    <ellipse cx="6.5" cy="18" rx="2.5" ry="2" />
    <ellipse cx="16.5" cy="15" rx="2.5" ry="2" />
  </svg>
);
