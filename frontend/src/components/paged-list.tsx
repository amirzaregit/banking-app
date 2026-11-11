import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View, type LayoutChangeEvent } from 'react-native';

import { ErrorText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useErrors } from '@/i18n/errors';

/** One page from the server: its lines, and the cursor for the next (older) page, or null when it says there is none. */
export type Page<T> = { items: T[]; next_cursor: number | null };

/** Where to continue after `page`. An EMPTY page is always the end, whatever cursor the server sent: asking again could never help. */
export const cursorAfter = <T,>(page: Page<T>): number | null => (page.items.length === 0 ? null : page.next_cursor);

/**
 * Paging for any list that loads "older" lines in pages. The screen loads its first page itself and hands it over with
 * `reset(items, nextCursor)` (on open, on pull-to-refresh, and whenever its filter changes); this hook does the rest:
 *   - loads the next page when the end is reached, one request at a time;
 *   - keeps loading by itself while the list is too short to reach the end of the screen (short lists, folded months), because a
 *     list only asks for more when it is scrolled to the end;
 *   - stops for good on an empty page, and stops on an error (shown at the end of the list, no retry loop);
 *   - ignores a late answer that belongs to a list that was reset in the meantime (the filter changed). `enabled` false holds all of it back (e.g. while the first page is still on its way).
 * Spread `listProps` on the FlatList and render `<PagedFooter paging={...} />` as its footer.
 */
export function usePagedList<T>(fetchMore: (cursor: number) => Promise<Page<T>>, enabled = true) {
  const describe = useErrors();
  const [items, setItems] = useState<T[]>([]);
  const [more, setMore] = useState(false); // the server said there are older lines
  const [loading, setLoading] = useState(false); // a request for older lines is running right now
  const [error, setError] = useState<string | null>(null);

  // What the logic needs to know RIGHT NOW (inside callbacks that outlive a render) lives in a ref; what the screen draws lives in state.
  const live = useRef({ fetchMore, describe, enabled, cursor: null as number | null, busy: false, failed: false, generation: 0, content: 0, view: 0 });
  useEffect(() => {
    live.current.fetchMore = fetchMore;
    live.current.describe = describe;
    live.current.enabled = enabled;
  });

  const control = useMemo(() => {
    const l = live.current;

    async function load() {
      if (!l.enabled || l.cursor === null || l.busy) return;
      l.busy = true;
      l.failed = false;
      setLoading(true);
      setError(null);
      const mine = l.generation;
      try {
        const page = await l.fetchMore(l.cursor);
        if (mine !== l.generation) return; // the list was reset while this was on its way
        l.cursor = cursorAfter(page);
        setItems((prev) => [...prev, ...page.items]);
        setMore(l.cursor !== null);
      } catch (e) {
        if (mine === l.generation) {
          l.failed = true; // stop: no retry loop
          setError(l.describe(e));
        }
      } finally {
        if (mine === l.generation) {
          l.busy = false;
          setLoading(false);
          fillIfShort();
        }
      }
    }

    /** The list asks for more only when scrolled to its end. When it is too short to scroll (or months are folded), nothing would ever ask: so ask here. */
    function fillIfShort() {
      if (l.enabled && l.cursor !== null && !l.busy && !l.failed && l.view > 0 && l.content <= l.view + 48) void load();
    }

    function reset(first: T[], next: number | null) {
      l.generation += 1; // answers to requests started before this are now out of date
      l.busy = false;
      l.failed = false;
      l.cursor = next;
      setItems(first);
      setMore(next !== null);
      setLoading(false);
      setError(null);
    }

    return { load, fillIfShort, reset };
  }, []);

  return {
    items,
    hasMore: enabled && more,
    loading,
    error,
    reset: control.reset,
    listProps: {
      onEndReached: () => void control.load(),
      onEndReachedThreshold: 0.4,
      onLayout: (e: LayoutChangeEvent) => {
        live.current.view = e.nativeEvent.layout.height;
        control.fillIfShort();
      },
      onContentSizeChange: (_width: number, height: number) => {
        live.current.content = height;
        control.fillIfShort();
      },
    },
  };
}

/** The end of a paged list: a spinner while older lines are really being fetched, or why a fetch failed. Nothing otherwise. */
export function PagedFooter({ paging }: { paging: { loading: boolean; error: string | null } }) {
  const theme = useTheme();
  if (!paging.loading && !paging.error) return null;
  return (
    <View style={{ marginVertical: Spacing.three, gap: Spacing.two }}>
      <ErrorText>{paging.error}</ErrorText>
      {paging.loading ? <ActivityIndicator color={theme.primary} /> : null}
    </View>
  );
}
