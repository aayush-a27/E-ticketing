import { PlatformSettings, DEFAULT_SETTINGS } from '../models/PlatformSettings.js';

/**
 * Settings are read on nearly every pricing call, so they are cached briefly
 * rather than fetched each time. The TTL is short enough that an admin change
 * takes effect within seconds without needing cache invalidation plumbing.
 */
let cached = null;
let cachedAt = 0;
const CACHE_TTL_MS = 10_000;

export async function getSettings({ fresh = false } = {}) {
  if (!fresh && cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;

  let settings = await PlatformSettings.findOne({ key: 'platform' });
  if (!settings) {
    // First run: materialize the defaults so an admin has something to edit.
    settings = await PlatformSettings.findOneAndUpdate(
      { key: 'platform' },
      { $setOnInsert: DEFAULT_SETTINGS },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  }

  cached = settings;
  cachedAt = Date.now();
  return settings;
}

export async function updateSettings(patch) {
  const settings = await getSettings({ fresh: true });

  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) settings[key] = value;
  }
  await settings.save();

  clearSettingsCache();
  return settings;
}

export function clearSettingsCache() {
  cached = null;
  cachedAt = 0;
}
