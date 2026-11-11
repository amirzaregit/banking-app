import * as SecureStore from 'expo-secure-store';

// iOS Keychain / Android Keystore.
export const kv = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
};
