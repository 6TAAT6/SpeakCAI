// ===== Unit tests: extractWeakPhones — 弱音素提取逻辑 =====
import { describe, it, expect } from 'vitest';
import { extractWeakPhones } from './pronounce.ts';

describe('extractWeakPhones', () => {
  it('returns empty array for empty input', () => {
    expect(extractWeakPhones([])).toEqual([]);
  });

  it('marks phoneme with deducted_score > 0 as weak', () => {
    const phones = [
      { phone: 'th', score: 80, deducted_score: 10 },
      { phone: 'r', score: 90, deducted_score: 0 },
    ];
    const result = extractWeakPhones(phones);
    expect(result).toContain('th');
    expect(result).not.toContain('r');
  });

  it('marks phoneme with score < 70 as weak', () => {
    const phones = [
      { phone: 'l', score: 55, deducted_score: 0 },
      { phone: 'm', score: 85, deducted_score: 0 },
    ];
    const result = extractWeakPhones(phones);
    expect(result).toContain('l');
    expect(result).not.toContain('m');
  });

  it('marks phoneme with both low score and deduction', () => {
    const phones = [
      { phone: 'r', score: 50, deducted_score: 20 },
    ];
    expect(extractWeakPhones(phones)).toContain('r');
  });

  it('does not mark phoneme with score >= 70 and no deduction', () => {
    const phones = [
      { phone: 's', score: 70, deducted_score: 0 },
      { phone: 'z', score: 95, deducted_score: 0 },
    ];
    expect(extractWeakPhones(phones)).toEqual([]);
  });

  it('returns multiple weak phonemes from mixed input', () => {
    const phones = [
      { phone: 'th', score: 50, deducted_score: 15 },
      { phone: 'r', score: 85, deducted_score: 0 },
      { phone: 'l', score: 90, deducted_score: 5 },
      { phone: 's', score: 60, deducted_score: 0 },
    ];
    const result = extractWeakPhones(phones);
    expect(result).toEqual(['th', 'l', 's']);
  });

  it('uses phn field when phoneme field is absent', () => {
    const phones = [
      { phn: 'th', score: 45, deducted_score: 0 },
    ];
    expect(extractWeakPhones(phones)).toContain('th');
  });

  it('uses phoneme field when both are absent', () => {
    const phones = [
      { phoneme: 'ae', score: 55, deducted_score: 0 },
    ];
    expect(extractWeakPhones(phones)).toContain('ae');
  });

  it('skips entries with empty name', () => {
    const phones = [
      { score: 30, deducted_score: 20 },
    ];
    expect(extractWeakPhones(phones)).toEqual([]);
  });

  it('handles score exactly at threshold (70)', () => {
    const phones = [
      { phone: 'p', score: 70, deducted_score: 0 },
    ];
    expect(extractWeakPhones(phones)).toEqual([]);
  });

  it('preserves order of weak phonemes from input', () => {
    const phones = [
      { phone: 'a', score: 50, deducted_score: 0 },
      { phone: 'b', score: 85, deducted_score: 0 },
      { phone: 'c', score: 40, deducted_score: 0 },
    ];
    expect(extractWeakPhones(phones)).toEqual(['a', 'c']);
  });
});
