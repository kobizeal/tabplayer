// Simple autocorrelation-based pitch detection.
// Works best for single notes on an electric guitar with clean input.

export function detectPitch(
  buffer: Float32Array,
  sampleRate: number
): number | null {
  const SIZE = buffer.length;

  // 1) Compute RMS to check if there's enough signal
  let sumSquares = 0;
  for (let i = 0; i < SIZE; i++) {
    const val = buffer[i];
    sumSquares += val * val;
  }
  const rms = Math.sqrt(sumSquares / SIZE);
  if (rms < 0.005) {
    // too quiet / silence
    return null;
  }

  // 2) Autocorrelation
  const MAX_SHIFT = Math.floor(SIZE / 2);
  const correlations = new Float32Array(MAX_SHIFT);

  for (let shift = 0; shift < MAX_SHIFT; shift++) {
    let sum = 0;
    for (let i = 0; i < MAX_SHIFT; i++) {
      sum += buffer[i] * buffer[i + shift];
    }
    correlations[shift] = sum;
  }

  // 3) Find the best peak after the first drop
  let bestShift = -1;
  let bestCorr = 0;
  const CORR_THRESHOLD = 0.9 * correlations[0];

  for (let shift = 1; shift < MAX_SHIFT; shift++) {
    const corr = correlations[shift];

    // make sure we passed first minimum
    if (corr > bestCorr && corr > CORR_THRESHOLD) {
      bestCorr = corr;
      bestShift = shift;
    }
  }

  if (bestShift <= 0) {
    return null;
  }

  const fundamentalFreq = sampleRate / bestShift;

  // sanity bounds for guitar range
  if (fundamentalFreq < 40 || fundamentalFreq > 2000) {
    return null;
  }

  return fundamentalFreq;
}
