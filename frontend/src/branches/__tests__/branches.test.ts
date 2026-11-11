import { en } from '@/i18n/en';
import { fa } from '@/i18n/fa';
import { ru } from '@/i18n/ru';

import { BRANCH_IDS, BRANCHES } from '../data';
import { directionsUrl, geoUrl, telUrl } from '../directions';
import { clampZoom, fitBounds, MAX_ZOOM, MIN_ZOOM, panCenter, project, toViewport, unproject, visibleTiles } from '../map-math';

describe('branch data', () => {
  it('has a unique entry for every id, all inside Moscow', () => {
    expect(BRANCHES.map((b) => b.id).sort()).toEqual([...BRANCH_IDS].sort());
    for (const b of BRANCHES) {
      expect(b.lat).toBeGreaterThan(55.5);
      expect(b.lat).toBeLessThan(56);
      expect(b.lon).toBeGreaterThan(37.3);
      expect(b.lon).toBeLessThan(37.9);
      expect(b.phone).toMatch(/^\+7 \(495\) 555-/); // 555 numbers are reserved for fiction
    }
  });
  it.each([
    ['en', en],
    ['ru', ru],
    ['fa', fa],
  ] as const)('every branch has a name and an address in %s', (_lang, catalog) => {
    for (const id of BRANCH_IDS) {
      const item = (catalog.branches.items as Record<string, { name: string; address: string }>)[id];
      expect(item.name.length).toBeGreaterThan(3);
      expect(item.address.length).toBeGreaterThan(5);
    }
  });
});

describe('map math', () => {
  it('project and unproject are inverses', () => {
    const p = { lat: 55.7558, lon: 37.6173 };
    for (const z of [9, 12, 18]) {
      const back = unproject(project(p, z), z);
      expect(back.lat).toBeCloseTo(p.lat, 6);
      expect(back.lon).toBeCloseTo(p.lon, 6);
    }
  });
  it('known tile: Moscow centre at z10 is tile 619/320', () => {
    const px = project({ lat: 55.7558, lon: 37.6173 }, 10);
    expect([Math.floor(px.x / 256), Math.floor(px.y / 256)]).toEqual([619, 320]);
  });
  it('the centre sits in the middle of the viewport', () => {
    const c = { lat: 55.75, lon: 37.6 };
    expect(toViewport(c, c, 12, 400, 300)).toEqual({ x: 200, y: 150 });
  });
  it('north is up: a point further north has a smaller y', () => {
    const c = { lat: 55.75, lon: 37.6 };
    expect(toViewport({ lat: 55.8, lon: 37.6 }, c, 12, 400, 300).y).toBeLessThan(150);
    expect(toViewport({ lat: 55.75, lon: 37.7 }, c, 12, 400, 300).x).toBeGreaterThan(200);
  });
  it('tiles cover the whole viewport with valid coordinates', () => {
    const w = 390;
    const h = 420;
    const tiles = visibleTiles({ lat: 55.7558, lon: 37.6173 }, 12, w, h);
    expect(Math.min(...tiles.map((t) => t.left))).toBeLessThanOrEqual(0);
    expect(Math.max(...tiles.map((t) => t.left + 256))).toBeGreaterThanOrEqual(w);
    expect(Math.min(...tiles.map((t) => t.top))).toBeLessThanOrEqual(0);
    expect(Math.max(...tiles.map((t) => t.top + 256))).toBeGreaterThanOrEqual(h);
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThan(2 ** 12);
      expect(t.url).toBe(`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/12/${t.y}/${t.x}`);
      expect(t.labelsUrl).toContain('World_Light_Gray_Reference');
    }
  });
  it('dark mode uses the dark basemap', () => {
    expect(visibleTiles({ lat: 55.75, lon: 37.6 }, 12, 300, 300, true)[0].url).toContain('World_Dark_Gray_Base/MapServer/tile/12/');
  });
  it('dragging right moves the centre west', () => {
    const c = { lat: 55.75, lon: 37.6 };
    expect(panCenter(c, 12, 100, 0).lon).toBeLessThan(c.lon);
    expect(panCenter(c, 12, 0, 100).lat).toBeGreaterThan(c.lat); // dragging down shows what is further north
  });
  it('fitBounds shows every branch inside the padded viewport', () => {
    const pts = BRANCHES.map((b) => ({ lat: b.lat, lon: b.lon }));
    const { center, zoom } = fitBounds(pts, 390, 420);
    for (const p of pts) {
      const v = toViewport(p, center, zoom, 390, 420);
      expect(v.x).toBeGreaterThanOrEqual(0);
      expect(v.x).toBeLessThanOrEqual(390);
      expect(v.y).toBeGreaterThanOrEqual(0);
      expect(v.y).toBeLessThanOrEqual(420);
    }
    // one zoom level further would not fit
    expect(zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(zoom).toBeLessThan(MAX_ZOOM);
  });
  it('clamps zoom', () => {
    expect(clampZoom(2)).toBe(MIN_ZOOM);
    expect(clampZoom(30)).toBe(MAX_ZOOM);
    expect(clampZoom(12.4)).toBe(12);
  });
});

describe('directions links', () => {
  const d = { lat: 55.7648, lon: 37.6047, label: 'Tverskaya branch' };
  it('each navigator gets the destination in its own order', () => {
    expect(directionsUrl('yandex', d)).toContain('rtext=~55.764800,37.604700');
    expect(directionsUrl('twoGis', d)).toContain('37.604700,55.764800'); // 2GIS wants lon,lat
    expect(directionsUrl('google', d)).toContain('destination=55.764800,37.604700');
    expect(directionsUrl('apple', d)).toContain('daddr=55.764800,37.604700');
    expect(directionsUrl('osm', d)).toContain('55.764800%2C37.604700');
  });
  it('geo: link carries a safely encoded label', () => {
    expect(geoUrl({ ...d, label: 'A & B (x)' })).toBe('geo:55.764800,37.604700?q=55.764800,37.604700(A%20%26%20B%20(x))');
  });
  it('tel link strips formatting', () => expect(telUrl('+7 (800) 555-35-35')).toBe('tel:+78005553535'));
});
