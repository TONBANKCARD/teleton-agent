#!/usr/bin/env node
/**
 * i18n translation parity check.
 *
 * Verifies that every locale under web/src/locales provides exactly the same
 * set of translation keys as the reference locale (English), and that
 * interpolation placeholders ({{var}}) match for each key.
 *
 * Exits with a non-zero status (failing CI) when any locale is missing keys,
 * has extra keys, or has mismatched placeholders. Run via `npm run check:i18n`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REFERENCE_LOCALE = 'en';
const TRANSLATION_FILE = 'translation.json';

const here = dirname(fileURLToPath(import.meta.url));
const localesDir = join(here, '..', 'src', 'locales');

/** Recursively flatten a nested object into dot-separated key paths. */
function flatten(obj, prefix = '') {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flatten(value, path));
    } else {
      out[path] = value;
    }
  }
  return out;
}

/** Extract the set of {{placeholder}} names from a translation string. */
function placeholders(value) {
  if (typeof value !== 'string') return new Set();
  const matches = value.match(/\{\{\s*([\w-]+)\s*\}\}/g) || [];
  return new Set(matches.map((m) => m.replace(/[{}\s]/g, '')));
}

function loadLocale(locale) {
  const file = join(localesDir, locale, TRANSLATION_FILE);
  const raw = readFileSync(file, 'utf8');
  return flatten(JSON.parse(raw));
}

function listLocales() {
  return readdirSync(localesDir).filter((entry) => {
    try {
      return statSync(join(localesDir, entry, TRANSLATION_FILE)).isFile();
    } catch {
      return false;
    }
  });
}

const locales = listLocales();
if (!locales.includes(REFERENCE_LOCALE)) {
  console.error(`✗ Reference locale "${REFERENCE_LOCALE}" not found in ${localesDir}`);
  process.exit(1);
}

const reference = loadLocale(REFERENCE_LOCALE);
const referenceKeys = Object.keys(reference).sort();
let failed = false;

console.log(`i18n parity check — reference locale "${REFERENCE_LOCALE}" (${referenceKeys.length} keys)`);

for (const locale of locales) {
  if (locale === REFERENCE_LOCALE) continue;

  const translation = loadLocale(locale);
  const keys = new Set(Object.keys(translation));

  const missing = referenceKeys.filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !(k in reference)).sort();

  const placeholderMismatches = [];
  for (const key of referenceKeys) {
    if (!keys.has(key)) continue;
    const expected = placeholders(reference[key]);
    const actual = placeholders(translation[key]);
    const diff =
      expected.size !== actual.size ||
      [...expected].some((p) => !actual.has(p));
    if (diff) {
      placeholderMismatches.push(
        `${key}: expected {${[...expected].join(', ')}}, got {${[...actual].join(', ')}}`
      );
    }
  }

  if (missing.length === 0 && extra.length === 0 && placeholderMismatches.length === 0) {
    console.log(`✓ ${locale} — 100% parity (${keys.size} keys)`);
    continue;
  }

  failed = true;
  console.error(`✗ ${locale} — parity issues:`);
  if (missing.length) {
    console.error(`  Missing ${missing.length} key(s):`);
    for (const k of missing) console.error(`    - ${k}`);
  }
  if (extra.length) {
    console.error(`  Extra ${extra.length} key(s) not in reference:`);
    for (const k of extra) console.error(`    + ${k}`);
  }
  if (placeholderMismatches.length) {
    console.error(`  Placeholder mismatch in ${placeholderMismatches.length} key(s):`);
    for (const m of placeholderMismatches) console.error(`    ! ${m}`);
  }
}

if (failed) {
  console.error('\ni18n parity check FAILED — translations are out of sync.');
  process.exit(1);
}

console.log('\ni18n parity check passed — all locales are in sync.');
