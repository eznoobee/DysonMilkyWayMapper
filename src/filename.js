import { MODE_COMBAT, MODE_PEACE, MODE_SANDBOX } from './address.js';

// mwdump_{starCount}_{resCode}_{suffix}_{start}-{end}.csv
const RE = /mwdump_(\d+)_(\d+)_(\d+)_(\d+)-(\d+)\.csv$/i;

// Returns { starCount, resourceMultiplier, mode, fogDifficulty, seedStart, seedEnd }
// or null when the filename doesn't follow the dump plugin's pattern.
export function parseDumpFilename(name) {
  const m = RE.exec(name);
  if (!m) return null;
  const starCount = parseInt(m[1], 10);
  const rc = parseInt(m[2], 10);
  const suffix = parseInt(m[3], 10);

  let mode, fogDifficulty = 0;
  if (suffix === 999) mode = MODE_SANDBOX;
  else if (suffix >= 100 && suffix <= 199) {
    mode = MODE_COMBAT;
    fogDifficulty = (suffix - 100) / 10;
  } else mode = MODE_PEACE;

  return {
    starCount,
    resourceMultiplier: rc === 99 ? Infinity : rc / 10,
    mode,
    fogDifficulty,
    seedStart: parseInt(m[4], 10),
    seedEnd: parseInt(m[5], 10),
  };
}
