import type { ReactNode } from 'react';

interface IconProps {
  name:
    | 'add'
    | 'chart'
    | 'check'
    | 'trash'
    | 'settings'
    | 'chevron'
    | 'play'
    | 'pause'
    | 'mic'
    | 'stop'
    | 'volume'
    | 'headphones'
    | 'message'
    | 'spark'
    | 'close'
    | 'arrow';
  size?: number;
  className?: string;
}

const paths: Record<IconProps['name'], ReactNode> = {
  add: <path d="M12 5v14M5 12h14" />,
  chart: (
    <>
      <path d="M4 19V9m6 10V5m6 14v-7m4 7H2" />
      <path d="m4 9 6-4 6 7 4-3" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7" />
      <path d="M10 11v5m4-5v5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  chevron: <path d="m8 10 4 4 4-4" />,
  play: <path d="m9 7 8 5-8 5Z" />,
  pause: <path d="M9 7v10m6-10v10" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0m-7 7v3m-4 0h8" />
    </>
  ),
  stop: <rect x="7" y="7" width="10" height="10" rx="1" />,
  volume: (
    <>
      <path d="M6 10H3v4h3l5 4V6l-5 4Z" />
      <path d="M15 9a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12" />
    </>
  ),
  headphones: (
    <path d="M4 14v-2a8 8 0 0 1 16 0v2m-16 0h3v6H5a1 1 0 0 1-1-1v-5Zm16 0h-3v6h2a1 1 0 0 0 1-1v-5Z" />
  ),
  message: <path d="M4 5h16v11H9l-5 4V5Z" />,
  spark: (
    <path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Zm6 11 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z" />
  ),
  close: <path d="m7 7 10 10M17 7 7 17" />,
  arrow: <path d="M19 12H5m6-6-6 6 6 6" />,
};

export function Icon({ name, size = 18, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
