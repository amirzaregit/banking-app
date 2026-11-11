import type { en } from './en';

type DeepStrings<T> = { [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]> };

/** The exact shape every language must have: derived from English. */
export type Messages = DeepStrings<typeof en>;

type Paths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Paths<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Every valid translation key, e.g. "errors.pin_invalid". Typos are compile errors. */
export type MessageKey = Paths<Messages>;
