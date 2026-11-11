// Fictional bank branches in Moscow (portfolio demo: the names and street numbers are invented,
// the streets and coordinates are real so the map looks right). Texts live in the i18n catalogs under `branches.items.<id>`.

export type Branch = {
  id: BranchId;
  lat: number;
  lon: number;
  phone: string; // fictional, +7 (495) 555-xx-xx
  hours: 'weekdays' | 'daily';
};

export const BRANCH_IDS = ['tverskaya', 'arbat', 'novyArbat', 'leningradsky', 'kutuzovsky', 'prospektMira', 'pyatnitskaya', 'leninsky'] as const;
export type BranchId = (typeof BRANCH_IDS)[number];

export const BRANCHES: Branch[] = [
  { id: 'tverskaya', lat: 55.7648, lon: 37.6047, phone: '+7 (495) 555-01-12', hours: 'daily' },
  { id: 'arbat', lat: 55.7494, lon: 37.5927, phone: '+7 (495) 555-01-24', hours: 'weekdays' },
  { id: 'novyArbat', lat: 55.7525, lon: 37.5877, phone: '+7 (495) 555-01-15', hours: 'weekdays' },
  { id: 'leningradsky', lat: 55.7894, lon: 37.5586, phone: '+7 (495) 555-01-39', hours: 'daily' },
  { id: 'kutuzovsky', lat: 55.7407, lon: 37.5316, phone: '+7 (495) 555-01-17', hours: 'weekdays' },
  { id: 'prospektMira', lat: 55.7962, lon: 37.6339, phone: '+7 (495) 555-01-95', hours: 'weekdays' },
  { id: 'pyatnitskaya', lat: 55.7405, lon: 37.6264, phone: '+7 (495) 555-01-18', hours: 'daily' },
  { id: 'leninsky', lat: 55.7071, lon: 37.5872, phone: '+7 (495) 555-01-70', hours: 'weekdays' },
];

