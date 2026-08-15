import React, { useId } from "react";

interface LogoProps {
  className?: string;
}

const Logo: React.FC<LogoProps> = ({ className = "h-10 w-10" }) => {
  const gradientId = useId();

  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Stock Scout logo">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="hsl(142, 55%, 22%)" />
          <stop offset="100%" stopColor="hsl(142, 65%, 48%)" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill={`url(#${gradientId})`} />
      <rect x="5" y="14" width="3" height="6" rx="1" fill="#F8FAFC" fillOpacity="0.7" />
      <rect x="10.5" y="10" width="3" height="10" rx="1" fill="#F8FAFC" fillOpacity="0.85" />
      <rect x="16" y="6" width="3" height="14" rx="1" fill="#F8FAFC" />
    </svg>
  );
};

export default Logo;
