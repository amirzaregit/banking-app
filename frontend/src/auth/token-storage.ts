import * as SecureStore from 'expo-secure-store';

// iOS Keychain / Android Keystore. Only the long-lived refresh token is stored;
// the short-lived access token lives in memory.
const KEY = 'refresh_token';

export const tokenStorage = {
  getRefreshToken: () => SecureStore.getItemAsync(KEY),
  setRefreshToken: (token: string) => SecureStore.setItemAsync(KEY, token),
  clear: () => SecureStore.deleteItemAsync(KEY),
};
