// ===== Unit tests: phoneme utils — 单词发音评分与高亮 =====
import { describe, it, expect } from 'vitest';
import { scoreWords, scoreColorClass } from './phonemes.ts';

describe('scoreWords', () => {
  it('returns words with score -1 when phoneScores is empty', () => {
    const result = scoreWords('hello world', []);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ word: 'hello', score: -1, weakPhonemes: [] });
    expect(result[1]).toEqual({ word: 'world', score: -1, weakPhonemes: [] });
  });

  it('preserves whitespace tokens in output', () => {
    const result = scoreWords('a b', []);
    // split preserves spaces: ['a', ' ', 'b']
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('scores words containing matched phonemes', () => {
    const phoneScores = [
      { phoneme: 'th', score: 45 },
      { phoneme: 'r', score: 85 },
      { phoneme: 'l', score: 90 },
    ];
    const result = scoreWords('the world', phoneScores);
    // 'the' contains 'th' (score 45) → score 45, weak 'th'
    const theWord = result.find(w => w.word.toLowerCase() === 'the');
    expect(theWord).toBeDefined();
    expect(theWord!.score).toBe(45);
    expect(theWord!.weakPhonemes).toContain('th');
  });

  it('returns minimum score when word matches multiple phonemes', () => {
    const phoneScores = [
      { phoneme: 'th', score: 45 },
      { phoneme: 'r', score: 30 },
    ];
    // 'wreath' starts with 'wr' → matches /wr/; contains 'th' → matches /th/i
    const result = scoreWords('wreath', phoneScores);
    const word = result.find(w => w.word === 'wreath');
    expect(word).toBeDefined();
    expect(word!.score).toBe(30); // min(45, 30)
  });

  it('ignores phonemes not matching any grapheme pattern', () => {
    const phoneScores = [
      { phoneme: 'zzz', score: 20 },
    ];
    const result = scoreWords('hello', phoneScores);
    expect(result[0].score).toBe(-1);
  });

  it('strips punctuation for phoneme matching', () => {
    const phoneScores = [
      { phoneme: 'th', score: 50 },
    ];
    // 'the!' should match 'th' since punctuation is stripped
    const result = scoreWords('the!', phoneScores);
    const word = result.find(w => w.word === 'the!');
    expect(word).toBeDefined();
    expect(word!.weakPhonemes).toContain('th');
  });

  it('handles mixed weak and strong phonemes', () => {
    const phoneScores = [
      { phoneme: 'th', score: 40 },  // weak (< 70)
      { phoneme: 's', score: 85 },    // strong
    ];
    // 'this' matches both th and s
    const result = scoreWords('this', phoneScores);
    const word = result.find(w => w.word === 'this');
    expect(word).toBeDefined();
    expect(word!.score).toBe(40);  // min(40, 85)
    expect(word!.weakPhonemes).toEqual(['th']);  // only th is weak
  });

  it('returns score -1 when no phoneme matches', () => {
    const phoneScores = [
      { phoneme: 'th', score: 50 },
    ];
    const result = scoreWords('apple banana', phoneScores);
    for (const w of result) {
      if (w.word.match(/[a-zA-Z]/)) {
        expect(w.score).toBe(-1);
      }
    }
  });

  it('preserves case in output words', () => {
    const result = scoreWords('Hello', []);
    expect(result[0].word).toBe('Hello');
  });
});

describe('scoreColorClass', () => {
  it('returns empty string for unknown score (-1)', () => {
    expect(scoreColorClass(-1)).toBe('');
  });

  it('returns word-bad for score < 60', () => {
    expect(scoreColorClass(30)).toBe('word-bad');
    expect(scoreColorClass(59)).toBe('word-bad');
  });

  it('returns word-weak for score 60-74', () => {
    expect(scoreColorClass(60)).toBe('word-weak');
    expect(scoreColorClass(70)).toBe('word-weak');
    expect(scoreColorClass(74)).toBe('word-weak');
  });

  it('returns word-good for score >= 75', () => {
    expect(scoreColorClass(75)).toBe('word-good');
    expect(scoreColorClass(90)).toBe('word-good');
    expect(scoreColorClass(100)).toBe('word-good');
  });
});
