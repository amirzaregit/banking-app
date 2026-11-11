import Constants from 'expo-constants';

/**
 * Release builds must talk to the server over HTTPS. Plain http would let anyone on the same
 * Wi-Fi read or alter banking traffic. Dev builds may use http (your laptop on the LAN).
 * Failing at startup is deliberate: a misconfigured release must not quietly run insecurely.
 */
export function assertSecureApiUrl(url: string, isDev: boolean): string {
  if (!isDev && !url.startsWith('https://')) {
    throw new Error(`Release builds need an https:// API URL (got "${url}"). Set EXPO_PUBLIC_API_URL.`);
  }
  return url;
}

/**
 * Where the backend lives.
 *
 * On a physical phone "localhost" is the PHONE, not your computer. Expo's dev server
 * already knows your computer's LAN address (hostUri = "192.168.1.20:8081"), so we
 * reuse that host and swap the port for the API's. Override with EXPO_PUBLIC_API_URL.
 */
function devHost(): string {
  const hostUri = Constants.expoConfig?.hostUri;
  return hostUri ? hostUri.split(':')[0] : 'localhost';
}

export const API_URL: string = assertSecureApiUrl(
  process.env.EXPO_PUBLIC_API_URL ?? `http://${devHost()}:8100`,
  __DEV__,
);
