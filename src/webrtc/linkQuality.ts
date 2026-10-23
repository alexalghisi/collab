export type LinkQuality = 'good' | 'fair' | 'poor' | 'down';

/** Maps loss and round-trip time into a label the tile can show. */
export function qualityFromStats(lossRatio: number, rttMs: number): LinkQuality {
  if (!Number.isFinite(lossRatio) || !Number.isFinite(rttMs)) {
    return 'fair';
  }
  if (lossRatio > 0.08 || rttMs > 400) {
    return 'poor';
  }
  if (lossRatio > 0.02 || rttMs > 150) {
    return 'fair';
  }
  return 'good';
}

export function qualityLabel(quality: LinkQuality): string {
  switch (quality) {
    case 'good':
      return 'Good';
    case 'fair':
      return 'Fair';
    case 'poor':
      return 'Poor';
    case 'down':
      return 'Reconnecting';
  }
}
