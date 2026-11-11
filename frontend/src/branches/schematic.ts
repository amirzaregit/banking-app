// A hand-made, simplified Moscow: the Moskva river and three ring roads. It is drawn under the map tiles, so the
// map is never empty: with no internet (or a blocked tile server) the user still sees a clean map with the branches.
// Coordinates are approximate on purpose: this is a schematic, not a survey.

import type { LatLon } from './map-math';

export const KREMLIN: LatLon = { lat: 55.752, lon: 37.6175 };

/** The Moskva river, west to south-east, as a polyline. */
export const RIVER: LatLon[] = [
  { lat: 55.83, lon: 37.37 },
  { lat: 55.815, lon: 37.41 },
  { lat: 55.795, lon: 37.45 },
  { lat: 55.775, lon: 37.47 },
  { lat: 55.76, lon: 37.5 },
  { lat: 55.748, lon: 37.52 },
  { lat: 55.74, lon: 37.55 },
  { lat: 55.727, lon: 37.555 },
  { lat: 55.715, lon: 37.575 },
  { lat: 55.722, lon: 37.595 },
  { lat: 55.735, lon: 37.607 },
  { lat: 55.745, lon: 37.612 },
  { lat: 55.7455, lon: 37.625 },
  { lat: 55.74, lon: 37.642 },
  { lat: 55.727, lon: 37.65 },
  { lat: 55.71, lon: 37.655 },
  { lat: 55.69, lon: 37.665 },
  { lat: 55.665, lon: 37.67 },
  { lat: 55.645, lon: 37.69 },
  { lat: 55.62, lon: 37.72 },
];

/** A closed oval around the centre: the Garden Ring, Third Ring and MKAD are close enough to ovals for a schematic. */
function oval(rLat: number, rLon: number, steps = 40, center: LatLon = { lat: 55.752, lon: 37.62 }): LatLon[] {
  const pts: LatLon[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push({ lat: center.lat + rLat * Math.sin(a), lon: center.lon + rLon * Math.cos(a) });
  }
  return pts;
}

export const RINGS: { id: 'garden' | 'third' | 'mkad'; line: LatLon[]; width: number }[] = [
  { id: 'garden', line: oval(0.021, 0.037), width: 5 },
  { id: 'third', line: oval(0.05, 0.088), width: 6 },
  { id: 'mkad', line: oval(0.16, 0.27, 72), width: 8 },
];
