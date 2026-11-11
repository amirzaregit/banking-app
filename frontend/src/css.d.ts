// Lets TypeScript accept `import '@/global.css'` without depending on the file Expo generates
// (expo-env.d.ts exists only after `expo start` / `expo export` has run once).
declare module '*.css';
