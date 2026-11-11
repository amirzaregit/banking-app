import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const subscribe = () => () => {};

/**
 * Web renders once without knowing the OS theme, then must switch on the client.
 * useSyncExternalStore returns the server value (false) during hydration and the
 * client value (true) afterwards, with no setState-in-effect needed.
 */
export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const colorScheme = useRNColorScheme();
  return hasHydrated ? colorScheme : 'light';
}
