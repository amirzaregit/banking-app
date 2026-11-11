// Web fallback so the screens can be tried in a browser. NOT secure storage; the real targets
// are iOS and Android. Metro picks this file on web because of the ".web.ts" suffix.
export const kv = {
  get: async (key: string) => window.localStorage.getItem(key),
  set: async (key: string, value: string) => window.localStorage.setItem(key, value),
  remove: async (key: string) => window.localStorage.removeItem(key),
};
