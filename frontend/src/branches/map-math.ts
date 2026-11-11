// Slippy-map math for OpenStreetMap-style tiles (Web Mercator, 256-px tiles). Pure functions, no React.

export const TILE_SIZE = 256;
export const MIN_ZOOM = 9;
export const MAX_ZOOM = 16; // the gray canvas has no tiles beyond 16

export type LatLon = { lat: number; lon: number };
export type Point = { x: number; y: number };

const MAX_LAT = 85.0511; // Web Mercator cuts off here

/** Pixel position on the whole-world map at `zoom` (the world is 256 * 2^zoom pixels wide). */
export function project({ lat, lon }: LatLon, zoom: number): Point {
  const scale = TILE_SIZE * 2 ** zoom;
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

export function unproject({ x, y }: Point, zoom: number): LatLon {
  const scale = TILE_SIZE * 2 ** zoom;
  const lon = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { lat, lon };
}

export const clampZoom = (z: number): number => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(z)));

export type Tile = { x: number; y: number; z: number; left: number; top: number; url: string; labelsUrl: string };

/** The tiles that cover a viewport of `width` x `height` pixels centred on `center`, with their pixel offsets in that viewport. */
export function visibleTiles(center: LatLon, zoom: number, width: number, height: number, dark = false): Tile[] {
  const c = project(center, zoom);
  const originX = c.x - width / 2; // world pixel at the viewport's top-left corner
  const originY = c.y - height / 2;
  const n = 2 ** zoom;
  const first = { x: Math.floor(originX / TILE_SIZE), y: Math.floor(originY / TILE_SIZE) };
  const last = { x: Math.floor((originX + width) / TILE_SIZE), y: Math.floor((originY + height) / TILE_SIZE) };
  const tiles: Tile[] = [];
  for (let ty = first.y; ty <= last.y; ty++) {
    if (ty < 0 || ty >= n) continue; // no tiles above the north pole or below the south pole
    for (let tx = first.x; tx <= last.x; tx++) {
      const wrapped = ((tx % n) + n) % n; // the world repeats horizontally
      tiles.push({ x: wrapped, y: ty, z: zoom, left: tx * TILE_SIZE - originX, top: ty * TILE_SIZE - originY, url: tileUrl(wrapped, ty, zoom, dark), labelsUrl: labelsUrl(wrapped, ty, zoom, dark) });
    }
  }
  return tiles;
}

// Esri's free light/dark gray canvas basemaps: soft, low-contrast and keyless. A second "reference" layer on top
// adds street and place names. Esri's tile order is z/y/x. (tile.openstreetmap.org refuses apps that do not identify
// themselves and CARTO now requires a key, so neither is used.)
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
export const tileUrl = (x: number, y: number, z: number, dark = false): string =>
  `${ESRI}/Canvas/World_${dark ? 'Dark' : 'Light'}_Gray_Base/MapServer/tile/${z}/${y}/${x}`;
export const labelsUrl = (x: number, y: number, z: number, dark = false): string =>
  `${ESRI}/Canvas/World_${dark ? 'Dark' : 'Light'}_Gray_Reference/MapServer/tile/${z}/${y}/${x}`;

/** Where a marker sits inside the viewport (pixels from its top-left corner). */
export function toViewport(point: LatLon, center: LatLon, zoom: number, width: number, height: number): Point {
  const p = project(point, zoom);
  const c = project(center, zoom);
  return { x: p.x - c.x + width / 2, y: p.y - c.y + height / 2 };
}

/** Move the map by a drag of (dx, dy) screen pixels: dragging right moves the world right, so the centre moves left. */
export function panCenter(center: LatLon, zoom: number, dx: number, dy: number): LatLon {
  const c = project(center, zoom);
  return unproject({ x: c.x - dx, y: c.y - dy }, zoom);
}

/** The centre and zoom that fit all points inside the viewport with some padding. */
export function fitBounds(points: LatLon[], width: number, height: number, padding = 48): { center: LatLon; zoom: number } {
  if (points.length === 0 || width <= 0 || height <= 0) return { center: { lat: 55.7558, lon: 37.6173 }, zoom: 11 };
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const center = { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lon: (Math.min(...lons) + Math.max(...lons)) / 2 };
  for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom--) {
    const xs = points.map((p) => project(p, zoom).x);
    const ys = points.map((p) => project(p, zoom).y);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    if (spanX <= width - padding * 2 && spanY <= height - padding * 2) return { center, zoom };
  }
  return { center, zoom: MIN_ZOOM };
}
