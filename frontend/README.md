# Mobile app

Expo SDK 58 · Expo Router · React Native · TypeScript (strict). Runs in Expo Go on a phone and in the browser for quick checks.
Design and rationale: [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md#frontend-structure).

## Run

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go. The app finds the API from the Expo dev server's address (phone and computer on the same network);
to point at another server set `EXPO_PUBLIC_API_URL`, e.g. `EXPO_PUBLIC_API_URL=https://bank.example.com npx expo start`.
Web: press `w` (the API must allow the origin, see `CORS_ORIGINS` in the backend).

## Checks

```bash
npx tsc --noEmit && npx expo lint && npx jest
```

## Structure

```
src/app/(app)/      signed-in screens; (tabs)/ = Home, History, Payments, News, Settings
src/app/            sign-in, sign-up, root layout (providers, fonts, direction)
src/components/     design system: Text, Button, Card, Glass, PatternBackground, AmountText, Select, DateField ...
src/<feature>/      logic and small components per feature (accounts, cards, certificates, history, rates, send, ...)
src/api/            API client with automatic token refresh, response types
src/i18n/           en.ts (source of truth), ru.ts, fa.ts, errors, digits, fonts
src/lib/            pure helpers: money, calendar, Jalali, fit-text, uuid
```

## Conventions

- **Pure logic goes in plain `.ts` files with tests** (`__tests__` next to them); components stay thin.
- **No user-facing string in a component.** Use `useI18n().t('section.key')`; server errors go through `useErrors()`.
- **Colours and spacing come from `constants/theme`**, never literals. Text/background pairs are contrast-tested.
- **Do not set `textAlign: 'right'`** for Persian; leave alignment natural.
- Money is an integer in minor units; format with `lib/money.ts`.
- **A spinner is only ever shown while a request is really running.** "Not loaded yet" places use `<Loading error={...} />` (a spinner, or
  the reason the request failed), never a bare `ActivityIndicator`. Lists that load older lines in pages use `usePagedList`
  (`components/paged-list.tsx`): it loads at the end of the list, keeps loading while the list is too short to scroll, and stops on an
  empty page or an error. Do not hand-write cursor logic in a screen.
- **Files (PDFs) go through one place.** A screen that offers a document builds its HTML with `renderPage` (`certificates/document.ts`),
  hands it to `usePdfDocument` (view, save, share, print) and draws `<PdfCard>`. Certificates, insurance policies and receipts all do this,
  so a fix to saving or sharing lands everywhere. Never call `expo-print`, `expo-sharing` or the file system from a screen.
- Use only modules that ship with Expo Go (otherwise a screen crashes on import on the phone).

## Add a screen

1. Create `src/app/(app)/my-screen.tsx` (file name = route; typed routes regenerate while Metro runs).
2. Load data with `useFocusData(() => api.get(...))`.
3. Add strings to `en.ts` first; `ru.ts` and `fa.ts` will not compile until they have the same keys.
4. Link to it with `router.push('/my-screen')`.

## Add a language

Create `src/i18n/xx.ts` typed against `en.ts`, register it in `src/i18n/index.ts` and `provider.tsx`, add its font/direction in `fonts.ts`/`direction.ts`,
and the parity test will tell you what is missing.
