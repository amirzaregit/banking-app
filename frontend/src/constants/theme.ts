/**
 * Design tokens. The brand is TEAL #00A5AC + GOLD #DEAD61 on soft paper #F7F7F7 (never pure white).
 *
 * The brand colors cannot be used everywhere as-is: measured against WCAG, teal text on paper is
 * 2.8:1 and gold text 1.9:1 (4.5:1 is readable). So each color has a ROLE:
 *   primary      teal fill for buttons, icons, selected states (text ON it is dark ink: 5.1:1)
 *   primaryText  a deeper teal for links and small text
 *   hero         a deep teal surface for the balance card (paper text on it: 5.7:1)
 *   gold         accent chips (with dark ink on top, 7:1) and decoration. Never text.
 * `src/constants/__tests__/theme.test.ts` fails the build if any pairing drops below readable contrast.
 */

export type Palette = {
  background: string; // page
  backgroundElement: string; // cards and inputs
  backgroundSelected: string;
  text: string;
  textSecondary: string;
  border: string;
  primary: string;
  onPrimary: string; // text/icons ON a primary fill
  primaryText: string; // teal text/links on background or cards
  hero: string;
  onHero: string;
  onHeroMuted: string;
  gold: string;
  goldSoft: string; // soft chip background
  onGoldSoft: string; // text on a soft chip
  onGold: string; // text on a SOLID gold fill
  danger: string;
  success: string;
};

export const Colors: { light: Palette; dark: Palette } = {
  light: {
    background: '#F7F7F7',
    backgroundElement: '#EDF3F3',
    backgroundSelected: '#DCE8E8',
    text: '#13292B',
    textSecondary: '#4F6769',
    border: '#D5E0E0',
    primary: '#00A5AC',
    onPrimary: '#04292B',
    primaryText: '#00686E',
    hero: '#006D73',
    onHero: '#F7F7F7',
    onHeroMuted: '#CFE9EA',
    gold: '#DEAD61',
    goldSoft: '#F3E3C3',
    onGoldSoft: '#6B4400',
    onGold: '#3D2700',
    danger: '#C62828',
    success: '#167441',
  },
  dark: {
    background: '#0C1314',
    backgroundElement: '#152123',
    backgroundSelected: '#1F3033',
    text: '#EAF2F2',
    textSecondary: '#9DB3B5',
    border: '#263A3C',
    primary: '#2BC4CB',
    onPrimary: '#04292B',
    primaryText: '#5ADDE3',
    hero: '#0F4E52',
    onHero: '#F2F8F8',
    onHeroMuted: '#B7D4D6',
    gold: '#E8BE7B',
    goldSoft: '#3A2F18',
    onGoldSoft: '#F0D9A8',
    onGold: '#2A1B00',
    danger: '#FF8A80',
    success: '#5ED596',
  },
};

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = { sm: 10, md: 16, lg: 22, pill: 999 } as const;

export const MaxContentWidth = 800;
