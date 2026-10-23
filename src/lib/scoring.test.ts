import { describe, expect, it } from 'vitest';
import { scoreDelta } from './scoring';

describe('server scoring semantics mirrored for UI previews', () => {
  it('awards points only to reward signals', () => { expect(scoreDelta('reward', 5)).toBe(5); });
  it('always subtracts penalties regardless of configured sign', () => { expect(scoreDelta('penalty', 5)).toBe(-5); expect(scoreDelta('penalty', -5)).toBe(-5); });
  it('keeps clues, decoys, and neutral signals score-neutral', () => { expect(scoreDelta('clue', 50)).toBe(0); expect(scoreDelta('decoy', 50)).toBe(0); expect(scoreDelta('neutral', 50)).toBe(0); });
  it('normalizes and bounds numeric values', () => { expect(scoreDelta('reward', -5)).toBe(5); expect(scoreDelta('reward', 2001)).toBe(1000); });
});

