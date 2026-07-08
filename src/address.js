// DSP seedKey packing and cluster-address formatting.
// Ported byte-exactly from decompiled GameDesc.seedKey64 / GameDesc.clusterString
// (game ~0.10.34.x). Do not "fix" the quirks — they must match the game.

export const MODE_COMBAT = 'combat';
export const MODE_PEACE = 'peace';
export const MODE_SANDBOX = 'sandbox';

// Resource multiplier choices offered by the game UI. Infinity encodes as resCode 99.
export const RESOURCE_MULTIPLIERS = [0.1, 0.5, 0.8, 1, 1.5, 2, 3, 5, 8, Infinity];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// GameDesc: combatModeDifficultyNumber = (int)(difficulty*10 + 0.001);
// if 0 && difficulty > 0.001 -> 1; cap 99
export function fogDifficultyNumber(difficulty) {
  let n = Math.floor(difficulty * 10 + 0.001);
  if (n === 0 && difficulty > 0.001) n = 1;
  return clamp(n, 0, 99);
}

export function resCode(resourceMultiplier) {
  if (resourceMultiplier > 9.95) return 99; // "Infinite"
  return clamp(Math.round(resourceMultiplier * 10), 1, 99);
}

// suffix: 0 peace | 100 + fogNumber combat | 999 sandbox
export function suffixFor(mode, fogDifficulty) {
  if (mode === MODE_SANDBOX) return 999;
  if (mode === MODE_COMBAT) return 100 + fogDifficultyNumber(fogDifficulty || 0);
  return 0;
}

// seedKey = galaxySeed*1e8 + starCount*1e5 + resCode*1e3 + suffix
// Exceeds 2^53 for no valid input (max ~9.99e15 < 2^53? 2^53≈9.007e15) —
// max seed 99999999 gives 9.9999e15 which is > 2^53, so use BigInt to be safe.
export function packSeedKey(galaxySeed, starCount, resourceCode, suffix) {
  const sc = clamp(starCount | 0, 1, 999);
  const rc = clamp(resourceCode | 0, 1, 99);
  return (
    BigInt(galaxySeed) * 100000000n +
    BigInt(sc) * 100000n +
    BigInt(rc) * 1000n +
    BigInt(suffix)
  );
}

const pad = (n, w) => String(n).padStart(w, '0');

// settings: { starCount, resourceMultiplier, mode, fogDifficulty }
export function clusterString(seed, settings) {
  const s8 = pad(seed, 8);
  const res2 = pad(resCode(settings.resourceMultiplier), 2);
  const stars = clamp(settings.starCount | 0, 1, 999);
  switch (settings.mode) {
    case MODE_SANDBOX:
      return `${s8}-${stars}S${res2}`;
    case MODE_COMBAT: {
      const fog2 = pad(fogDifficultyNumber(settings.fogDifficulty || 0), 2);
      return `${s8}-${stars}-Z${res2}-${fog2}`;
    }
    default:
      return `${s8}-${stars}-A${res2}`;
  }
}

export function seedKeyFor(seed, settings) {
  return packSeedKey(
    seed,
    settings.starCount,
    resCode(settings.resourceMultiplier),
    suffixFor(settings.mode, settings.fogDifficulty)
  );
}

// Labels used in exports and the UI.
export function resourceLabel(mult) {
  return mult > 9.95 ? 'infinite' : String(mult);
}

export function modeLabel(mode) {
  if (mode === MODE_SANDBOX) return 'sandbox';
  if (mode === MODE_COMBAT) return 'combat/dark fog';
  return 'peace';
}
