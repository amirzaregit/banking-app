import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Image, PanResponder, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n/provider';

import { BRANCHES, type BranchId } from './data';
import { KREMLIN, RINGS, RIVER } from './schematic';
import { clampZoom, fitBounds, MAX_ZOOM, MIN_ZOOM, panCenter, toViewport, visibleTiles, type LatLon, type Point } from './map-math';

type Props = {
  height: number;
  selected: BranchId | null;
  onSelect: (id: BranchId) => void;
  /** Bump this number to re-centre and fit every branch again ("show all on the map"). */
  fitSignal: number;
  /** A branch to centre on (set when the user picks one from the list). */
  focus: BranchId | null;
};

// Identifies the app to the tile server (native only; browsers set their own).
const TILE_HEADERS = { 'User-Agent': 'BankingDemo/1.0 (portfolio demo app)' };
const POINTS = BRANCHES.map((b) => ({ lat: b.lat, lon: b.lon }));

/** Turns finger movement into per-step (dx, dy) deltas. Kept outside the component because it holds mutable gesture state. */
function makePan(onDelta: (dx: number, dy: number) => void) {
  let lastX = 0;
  let lastY = 0;
  return PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > 4,
    onPanResponderTerminationRequest: () => false, // keep the drag even if a list wants the touch
    onPanResponderGrant: () => {
      lastX = 0;
      lastY = 0;
    },
    onPanResponderMove: (_e, g) => {
      onDelta(g.dx - lastX, g.dy - lastY);
      lastX = g.dx;
      lastY = g.dy;
    },
  });
}

/**
 * A small slippy map built from OpenStreetMap tiles: drag to pan, +/- to zoom, tap a marker to select it.
 * Built from plain React Native views so it works in Expo Go without any native map module or API key.
 */
export function BranchMap({ height, selected, onSelect, fitSignal, focus }: Props) {
  const theme = useTheme();
  const { t } = useI18n();
  const dark = useColorScheme() === 'dark';
  const [width, setWidth] = useState(0);
  const [view, setView] = useState<{ center: LatLon; zoom: number } | null>(null);
  const [seen, setSeen] = useState({ fitSignal, focus });

  // Re-fit or re-centre when the parent asks (derived-state pattern: compare during render instead of an effect).
  if (width > 0 && (!view || seen.fitSignal !== fitSignal || seen.focus !== focus)) {
    setSeen({ fitSignal, focus });
    const branch = focus && seen.focus !== focus && seen.fitSignal === fitSignal ? BRANCHES.find((b) => b.id === focus) : undefined;
    setView(branch ? { center: { lat: branch.lat, lon: branch.lon }, zoom: Math.max(view?.zoom ?? 14, 14) } : fitBounds(POINTS, width, height));
  }

  // Created once; it reports each drag step and we move the centre with a functional setState.
  const pan = useMemo(() => makePan((dx, dy) => setView((v) => (v ? { center: panCenter(v.center, v.zoom, dx, dy), zoom: v.zoom } : v))), []);

  const zoomBy = (delta: number) => setView((v) => (v ? { ...v, zoom: clampZoom(v.zoom + delta) } : v));

  const tiles = view && width > 0 ? visibleTiles(view.center, view.zoom, width, height, dark) : [];

  return (
    // direction 'ltr': the map is geography, not text. Tiles and markers are positioned with physical coordinates.
    <View style={[styles.map, { height, backgroundColor: theme.backgroundSelected, borderColor: theme.border, direction: 'ltr' }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={StyleSheet.absoluteFill} {...pan.panHandlers}>
        {view && width > 0 ? <Schematic center={view.center} zoom={view.zoom} width={width} height={height} /> : null}
        {tiles.map((tile) => {
          const place = { position: 'absolute' as const, left: tile.left, top: tile.top, width: 256, height: 256 };
          const key = `${tile.z}/${tile.x}/${tile.y}/${tile.left}`;
          return (
            <View key={key} style={place}>
              <Image source={{ uri: tile.url, headers: TILE_HEADERS }} style={styles.tile} />
              <Image source={{ uri: tile.labelsUrl, headers: TILE_HEADERS }} style={styles.tile} />
            </View>
          );
        })}
      </View>

      {view
        ? BRANCHES.map((b) => {
            const p = toViewport(b, view.center, view.zoom, width, height);
            if (p.x < -20 || p.x > width + 20 || p.y < -40 || p.y > height + 20) return null;
            const active = b.id === selected;
            return (
              <Pressable
                key={b.id}
                accessibilityRole="button"
                accessibilityLabel={t(`branches.items.${b.id}.name`)}
                onPress={() => onSelect(b.id)}
                hitSlop={8}
                style={[styles.marker, { left: p.x - 18, top: p.y - 36, zIndex: active ? 2 : 1 }]}>
                <Ionicons name="location-sharp" size={active ? 42 : 36} color={active ? theme.gold : theme.hero} style={styles.pinShadow} />
              </Pressable>
            );
          })
        : null}

      <View style={styles.zoom}>
        <ZoomButton icon="add" label={t('branches.zoomIn')} disabled={!view || view.zoom >= MAX_ZOOM} onPress={() => zoomBy(1)} />
        <ZoomButton icon="remove" label={t('branches.zoomOut')} disabled={!view || view.zoom <= MIN_ZOOM} onPress={() => zoomBy(-1)} />
      </View>
      <View style={[styles.credit, { backgroundColor: 'rgba(255,255,255,0.8)' }]}>
        <Text style={{ fontSize: 10, color: '#333' }} lang="en">
          {'Tiles © Esri, HERE, Garmin, © OpenStreetMap contributors'}
        </Text>
      </View>
    </View>
  );
}

/** One straight piece of a line, drawn as a thin rotated rectangle. */
function Segment({ a, b, thickness, color }: { a: Point; b: Point; thickness: number; color: string }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: (a.x + b.x) / 2 - length / 2,
        top: (a.y + b.y) / 2 - thickness / 2,
        width: length + thickness * 0.4, // a little overlap hides the gaps at the corners
        height: thickness,
        borderRadius: thickness / 2,
        backgroundColor: color,
        transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
      }}
    />
  );
}

/** The self-drawn map: soft background, the river, three ring roads and the Kremlin. Always visible, tiles cover it when they load. */
function Schematic({ center, zoom, width, height }: { center: LatLon; zoom: number; width: number; height: number }) {
  const theme = useTheme();
  const scale = 2 ** (zoom - 11); // line widths grow as you zoom in
  const lines: { key: string; pts: Point[]; thickness: number; color: string }[] = [
    { key: 'river', pts: RIVER.map((p) => toViewport(p, center, zoom, width, height)), thickness: Math.max(4, 9 * scale), color: theme.primary + '55' },
    ...RINGS.map((r) => ({ key: r.id, pts: r.line.map((p) => toViewport(p, center, zoom, width, height)), thickness: Math.max(2, r.width * Math.min(scale, 2.5)), color: theme.background })),
  ];
  const kremlin = toViewport(KREMLIN, center, zoom, width, height);
  const visible = (p: Point) => p.x > -200 && p.x < width + 200 && p.y > -200 && p.y < height + 200;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {lines.map((l) =>
        l.pts.slice(1).map((b, i) => {
          const a = l.pts[i];
          return visible(a) || visible(b) ? <Segment key={`${l.key}${i}`} a={a} b={b} thickness={l.thickness} color={l.color} /> : null;
        }),
      )}
      <View style={{ position: 'absolute', left: kremlin.x - 7, top: kremlin.y - 7, width: 14, height: 14, borderRadius: 7, backgroundColor: theme.gold, opacity: 0.8 }} />
    </View>
  );
}

function ZoomButton({ icon, label, disabled, onPress }: { icon: 'add' | 'remove'; label: string; disabled: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.zoomBtn, { backgroundColor: theme.background, borderColor: theme.border, opacity: disabled ? 0.45 : 1 }]}>
      <Ionicons name={icon} size={22} color={theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  map: { borderRadius: 20, overflow: 'hidden', borderWidth: 1 },
  marker: { position: 'absolute', width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  tile: { position: 'absolute', left: 0, top: 0, width: 256, height: 256 },
  pinShadow: { textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  zoom: { position: 'absolute', right: Spacing.two, top: Spacing.two, gap: Spacing.two },
  zoomBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  credit: { position: 'absolute', left: 0, bottom: 0, paddingHorizontal: 6, paddingVertical: 2, borderTopRightRadius: 6 },
});
