import { useCallback, useMemo, useState } from 'react';

import { useI18n } from '@/i18n/provider';

import { monthRows } from './months';

/** Month headers + items for a newest-first list, and `toggle(month)` to fold a month. All months start open. */
export function useMonthRows<T extends { created_at: string }>(items: T[], idOf: (item: T) => string | number) {
  const { lang } = useI18n();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggle = useCallback(
    (month: string) =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (!next.delete(month)) next.add(month);
        return next;
      }),
    [],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- idOf is always a stable top-level function
  const rows = useMemo(() => monthRows(items, lang, collapsed, idOf), [items, lang, collapsed]);
  return { rows, toggle };
}
