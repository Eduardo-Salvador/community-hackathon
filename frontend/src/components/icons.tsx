import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number; color?: string; weight?: number };

function Icon({ size = 18, color = 'currentColor', weight = 2, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const MicIcon = (props: IconProps) => (
  <Icon size={22} {...props}>
    <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
    <path d="M19 11a7 7 0 0 1-14 0" />
    <path d="M12 18v3" />
  </Icon>
);

export const ArrowIcon = (props: IconProps) => (
  <Icon size={22} weight={2.5} {...props}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const CheckIcon = (props: IconProps) => (
  <Icon size={14} weight={2.5} {...props}>
    <path d="M5 12l5 5L20 7" />
  </Icon>
);

export const ClockIcon = (props: IconProps) => (
  <Icon size={14} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

export const AlertIcon = (props: IconProps) => (
  <Icon size={14} {...props}>
    <path d="M12 3l9 16H3z" />
    <path d="M12 10v4M12 17h.01" />
  </Icon>
);

export const LockIcon = (props: IconProps) => (
  <Icon size={14} {...props}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Icon>
);

export const DownloadIcon = (props: IconProps) => (
  <Icon weight={2.2} {...props}>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </Icon>
);

export const ShareIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
  </Icon>
);

export const ChatBubbleIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.4A9 9 0 1 1 21 12z" />
  </Icon>
);

export const MailIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </Icon>
);

export const LinkIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
    <path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
  </Icon>
);

export const CopyIcon = (props: IconProps) => (
  <Icon weight={2.2} {...props}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
  </Icon>
);

export const KeyboardIcon = (props: IconProps) => (
  <Icon size={20} {...props}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon size={20} weight={2.5} {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export function BrazilFlag() {
  return (
    <svg width="30" height="21" viewBox="0 0 30 21" aria-hidden="true">
      <rect width="30" height="21" fill="#009C3B" />
      <path d="M15 2.5L27 10.5L15 18.5L3 10.5Z" fill="#FFDF00" />
      <circle cx="15" cy="10.5" r="4.6" fill="#002776" />
      <path d="M10.6 9.6C13.5 9 16.8 9.6 19.3 11.3" stroke="#FFFFFF" strokeWidth="0.9" fill="none" />
    </svg>
  );
}
