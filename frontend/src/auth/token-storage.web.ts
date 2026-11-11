// Web fallback (SecureStore doesn't exist in browsers). Metro picks this file
// automatically on web because of the ".web.ts" suffix. Dev/testing convenience only:
// localStorage is NOT secure storage, and the real targets are iOS and Android.
const KEY = 'refresh_token';

export const tokenStorage = {
  getRefreshToken: async () => window.localStorage.getItem(KEY),
  setRefreshToken: async (token: string) => window.localStorage.setItem(KEY, token),
  clear: async () => window.localStorage.removeItem(KEY),
};
