/**
 * Seasonal Events — themed seasonal decorations and events for retention.
 * Detects the current season and generates themed decoration placements.
 */

export interface SeasonalEvent {
  eventName: string;
  theme: string;
  icon: string;
  description: string;
  decorations: { type: string; x: number; y: number; sprite: string }[];
}

const SEASONS = [
  { name: "Spring Festival", theme: "spring", icon: "🌸", months: [3, 4, 5], description: "Cherry blossoms and fresh beginnings. New agents get a spring bonus!", decorations: [
    { type: "plant", x: 3, y: 2, sprite: "🌸" },
    { type: "plant", x: 7, y: 3, sprite: "🌷" },
    { type: "plant", x: 11, y: 2, sprite: "🌺" },
    { type: "wall_decor", x: 5, y: 0, sprite: "🦋" },
  ]},
  { name: "Summer Bash", theme: "summer", icon: "☀️", months: [6, 7, 8], description: "Sun's out, agents out! Boosted task throughput all season.", decorations: [
    { type: "lighting", x: 4, y: 1, sprite: "🌞" },
    { type: "furniture", x: 8, y: 3, sprite: "🏖️" },
    { type: "plant", x: 2, y: 4, sprite: "🌴" },
  ]},
  { name: "Autumn Harvest", theme: "autumn", icon: "🍂", months: [9, 10, 11], description: "Gather your harvest. Extra XP for completed pipelines.", decorations: [
    { type: "plant", x: 3, y: 2, sprite: "🍁" },
    { type: "plant", x: 9, y: 3, sprite: "🍂" },
    { type: "furniture", x: 6, y: 4, sprite: "🦃" },
    { type: "wall_decor", x: 5, y: 0, sprite: "🌾" },
  ]},
  { name: "Winter Wonderland", theme: "winter", icon: "❄️", months: [12, 1, 2], description: "Cozy up your office. Return streaks give double aspiration signals.", decorations: [
    { type: "lighting", x: 4, y: 1, sprite: "🎄" },
    { type: "plant", x: 8, y: 3, sprite: "⛄" },
    { type: "wall_decor", x: 5, y: 0, sprite: "🦌" },
    { type: "flooring", x: 6, y: 4, sprite: "❄️" },
  ]},
];

/** Special events that override seasonal ones for a limited time. */
const SPECIAL_EVENTS: { name: string; theme: string; icon: string; description: string; startDate: string; endDate: string; decorations: { type: string; x: number; y: number; sprite: string }[] }[] = [
  {
    name: "Halloween Spooktacular",
    theme: "halloween",
    icon: "🎃",
    description: "Spooky agents get +50% XP. Don't let the bugs bite!",
    startDate: "10-25",
    endDate: "11-02",
    decorations: [
      { type: "wall_decor", x: 5, y: 0, sprite: "🎃" },
      { type: "lighting", x: 3, y: 1, sprite: "🕯️" },
      { type: "plant", x: 9, y: 3, sprite: "🕸️" },
      { type: "furniture", x: 7, y: 4, sprite: "💀" },
    ],
  },
  {
    name: "New Year Celebration",
    theme: "newyear",
    icon: "🎉",
    description: "New year, new agents! All hires get bonus aspiration signals.",
    startDate: "12-30",
    endDate: "01-02",
    decorations: [
      { type: "lighting", x: 5, y: 1, sprite: "🎆" },
      { type: "wall_decor", x: 3, y: 0, sprite: "🎊" },
      { type: "plant", x: 9, y: 3, sprite: "🎈" },
    ],
  },
];

/** Get the current active seasonal event. */
export function getCurrentSeasonalEvent(): SeasonalEvent {
  const now = new Date();
  const month = now.getMonth() + 1;
  const monthDay = `${String(month).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // Check special events first
  for (const special of SPECIAL_EVENTS) {
    if (monthDay >= special.startDate && monthDay <= special.endDate) {
      return {
        eventName: special.name,
        theme: special.theme,
        icon: special.icon,
        description: special.description,
        decorations: special.decorations,
      };
    }
  }

  // Fall back to seasonal
  const season = SEASONS.find((s) => s.months.includes(month)) ?? SEASONS[0];
  return {
    eventName: season.name,
    theme: season.theme,
    icon: season.icon,
    description: season.description,
    decorations: season.decorations,
  };
}
