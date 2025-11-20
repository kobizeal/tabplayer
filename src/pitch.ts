// Simple autocorrelation-based pitch detection.
// Works best for single notes on an electric guitar with clean input.

export function detectPitch(
  buffer: Float32Array,
  sampleRate: number
): number | null {
  const SIZE = buffer.length;

  // 1) RMS check for silence
  let sumSquares = 0;
  for (let i = 0; i < SIZE; i++) {
    const v = buffer[i];
    sumSquares += v * v;
  }
  const rms = Math.sqrt(sumSquares / SIZE);
  if (rms < 0.005) {
    // too quiet
    return null;
  }

  // 2) Restrict search to guitar-ish range
  // Standard tuning low E ≈ 82 Hz, high E ≈ 1319 Hz
  const MIN_FREQUENCY = 70;   // a bit below low E
  const MAX_FREQUENCY = 1200; // slightly conservative high end

  const minLag = Math.floor(sampleRate / MAX_FREQUENCY);
  const maxLag = Math.min(
    Math.floor(sampleRate / MIN_FREQUENCY),
    Math.floor(SIZE / 2)
  );

  if (maxLag <= minLag) return null;

  let bestLag = -1;
  let bestCorr = 0;

  // 3) Autocorrelation only in that lag window
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < SIZE - lag; i++) {
      corr += buffer[i] * buffer[i + lag];
    }

    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  if (bestLag === -1 || bestCorr <= 0) return null;

  let freq = sampleRate / bestLag;

  // 4) Octave correction for “too low” results
  // If frequency is below the allowed range, keep doubling
  while (freq < MIN_FREQUENCY && freq * 2 <= MAX_FREQUENCY) {
    freq *= 2;
  }

  // sanity check again
  if (freq < MIN_FREQUENCY || freq > MAX_FREQUENCY) {
    return null;
  }

  return freq;
}
