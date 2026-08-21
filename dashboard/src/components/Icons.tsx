import React from "react";

type IconProps = { className?: string; size?: number };

const wrap = (size: number, children: React.ReactNode, fill = "none", stroke = "currentColor", sw = 2) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className={undefined} xmlns="http://www.w3.org/2000/svg">{children}</svg>
);

export const IconCheck: React.FC<IconProps> = ({ className, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5"/></svg>
);

export const IconCross: React.FC<IconProps> = ({ className, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
);

export const IconCircle: React.FC<IconProps> = ({ className, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9"/></svg>
);

export const IconBlocked: React.FC<IconProps> = ({ className, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>
);

export const IconArrowRight: React.FC<IconProps> = ({ className, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} xmlns="http://www.w3.org/2000/svg"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
);

export const IconArrowLeft: React.FC<IconProps> = ({ className, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} xmlns="http://www.w3.org/2000/svg"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
);

export const IconArrowTurnDown: React.FC<IconProps> = ({ className, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} xmlns="http://www.w3.org/2000/svg"><path d="M9 3v12a3 3 0 0 0 3 3h6"/><path d="M15 13l3 5 3-5"/></svg>
);

export const IconArrowUpDown: React.FC<IconProps> = ({ className, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} xmlns="http://www.w3.org/2000/svg"><path d="M12 3v18"/><path d="M8 7l4-4 4 4"/><path d="M8 17l4 4 4-4"/></svg>
);

export const IconTriangleUp: React.FC<IconProps> = ({ className, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} xmlns="http://www.w3.org/2000/svg"><path d="M12 4l8 14H4z"/></svg>
);

export const IconDiamond: React.FC<IconProps> = ({ className, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} xmlns="http://www.w3.org/2000/svg"><path d="M12 2L22 12l-10 10L2 12z"/></svg>
);

export const IconLightning: React.FC<IconProps> = ({ className, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" className={className} xmlns="http://www.w3.org/2000/svg"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
);

export const IconStar: React.FC<IconProps> = ({ className, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" className={className} xmlns="http://www.w3.org/2000/svg"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
);

export const IconMedalGold: React.FC<IconProps> = ({ className, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="9" r="6" fill="#ffd700" stroke="#b8860b" strokeWidth={1}/><path d="M12 6l1 2 2 .5-1.5 1.5.5 2-2-1-2 1 .5-2L9 8.5l2-.5z" fill="#b8860b"/><path d="M8 14l-2 8 6-3 6 3-2-8" fill="none" stroke="#b8860b" strokeWidth={1.5} strokeLinejoin="round"/></svg>
);

export const IconMedalSilver: React.FC<IconProps> = ({ className, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="9" r="6" fill="#c0c0c0" stroke="#808080" strokeWidth={1}/><path d="M12 6l1 2 2 .5-1.5 1.5.5 2-2-1-2 1 .5-2L9 8.5l2-.5z" fill="#808080"/><path d="M8 14l-2 8 6-3 6 3-2-8" fill="none" stroke="#808080" strokeWidth={1.5} strokeLinejoin="round"/></svg>
);

export const IconMedalBronze: React.FC<IconProps> = ({ className, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="9" r="6" fill="#cd7f32" stroke="#8b4513" strokeWidth={1}/><path d="M12 6l1 2 2 .5-1.5 1.5.5 2-2-1-2 1 .5-2L9 8.5l2-.5z" fill="#8b4513"/><path d="M8 14l-2 8 6-3 6 3-2-8" fill="none" stroke="#8b4513" strokeWidth={1.5} strokeLinejoin="round"/></svg>
);

export const MedalIcon: React.FC<{ tier: string; className?: string; size?: number }> = ({ tier, className, size = 14 }) => {
  if (tier === "gold") return <IconMedalGold className={className} size={size} />;
  if (tier === "silver") return <IconMedalSilver className={className} size={size} />;
  return <IconMedalBronze className={className} size={size} />;
};
