export type ScannerKind = 'reward' | 'penalty' | 'clue' | 'decoy' | 'neutral';

/** Only reward and penalty scanners may affect the score. Penalties always subtract. */
export function scoreDelta(kind: ScannerKind, points: number): number {
  const amount = Math.min(1000, Math.max(0, Math.trunc(Math.abs(points))));
  if (kind === 'reward') return amount;
  if (kind === 'penalty') return -amount;
  return 0;
}

