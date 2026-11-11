import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { hasKey } from '..';

/** Every file under src (except tests and the catalogs themselves). */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/^(en|ru|fa)\.ts$/.test(name) ? [path] : [];
  });
}

describe('translation keys used in the code', () => {
  it('all exist in every language (no raw "section.key" shown to users)', () => {
    const missing: string[] = [];
    for (const file of sourceFiles(join(__dirname, '..', '..'))) {
      const text = readFileSync(file, 'utf8');
      // t('a.b.c') and t("a.b.c"): only plain literals; keys built with ${...} are checked by their own tests
      for (const match of text.matchAll(/\bt\(\s*['"]([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)['"]/g)) {
        for (const lang of ['en', 'ru', 'fa'] as const) if (!hasKey(lang, match[1])) missing.push(`${file.split('/src/')[1]}: ${lang} ${match[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
