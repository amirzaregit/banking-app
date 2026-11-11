// Links that open a navigator with a route to a branch. Each is a plain URL: web URLs open the app when it is
// installed (Android/iOS app links) and fall back to the website otherwise, so no app-presence detection is needed.

export type Destination = { lat: number; lon: number; label: string };
export type NavigatorId = 'yandex' | 'twoGis' | 'google' | 'apple' | 'osm';

const coord = (n: number) => n.toFixed(6);

export function directionsUrl(nav: NavigatorId, d: Destination): string {
  const { lat, lon } = d;
  switch (nav) {
    case 'yandex': // rtext = from~to; an empty "from" means "my location"
      return `https://yandex.ru/maps/?rtext=~${coord(lat)},${coord(lon)}&rtt=auto`;
    case 'twoGis': // 2GIS takes lon,lat
      return `https://2gis.ru/moscow/directions/points/%7C${coord(lon)},${coord(lat)}`;
    case 'google':
      return `https://www.google.com/maps/dir/?api=1&destination=${coord(lat)},${coord(lon)}`;
    case 'apple':
      return `https://maps.apple.com/?daddr=${coord(lat)},${coord(lon)}&dirflg=d`;
    case 'osm':
      return `https://www.openstreetmap.org/directions?route=%3B${coord(lat)}%2C${coord(lon)}`;
  }
}

/** Android `geo:` link: the system shows a chooser with every navigator the user has installed. */
export function geoUrl(d: Destination): string {
  return `geo:${coord(d.lat)},${coord(d.lon)}?q=${coord(d.lat)},${coord(d.lon)}(${encodeURIComponent(d.label)})`;
}

export const telUrl = (phone: string): string => `tel:${phone.replace(/[^\d+]/g, '')}`;
