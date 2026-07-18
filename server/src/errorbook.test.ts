// ===== Integration tests: Error Book DB functions =====
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';

// 使用内存数据库测试
let db: Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  session_id  TEXT PRIMARY KEY,
  scene       TEXT NOT NULL DEFAULT 'daily',
  mode        TEXT NOT NULL DEFAULT 'coach',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at    TEXT
);

CREATE TABLE IF NOT EXISTS turns (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL REFERENCES sessions(session_id),
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  text        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pronunciations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT NOT NULL REFERENCES sessions(session_id),
  text            TEXT NOT NULL,
  total_score     REAL NOT NULL DEFAULT 0,
  accuracy_score  REAL NOT NULL DEFAULT 0,
  fluency_score   REAL NOT NULL DEFAULT 0,
  integrity_score REAL NOT NULL DEFAULT 0,
  weak_phonemes   TEXT DEFAULT '[]',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id);
CREATE INDEX IF NOT EXISTS idx_pron_session ON pronunciations(session_id);
`;

function addPronunciation(
  sessionId: string, text: string, total: number, accuracy: number,
  fluency: number, integrity: number, weakPhones?: string[],
): void {
  db.prepare(
    'INSERT INTO pronunciations (session_id, text, total_score, accuracy_score, fluency_score, integrity_score, weak_phonemes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(sessionId, text, total, accuracy, fluency, integrity,
    weakPhones && weakPhones.length > 0 ? JSON.stringify(weakPhones) : '[]');
}

function getErrorBook(): Array<{
  phoneme: string; count: number; avgScore: number;
  lowestScore: number; exampleTexts: string[]; lastSeen: string;
}> {
  const rows = db.prepare(`
    SELECT p.text, p.total_score, p.weak_phonemes, p.created_at
    FROM pronunciations p
    WHERE p.weak_phonemes IS NOT NULL AND p.weak_phonemes != '[]'
    ORDER BY p.created_at DESC
  `).all() as Array<{ text: string; total_score: number; weak_phonemes: string; created_at: string }>;

  const agg = new Map<string, { scores: number[]; texts: string[]; lastSeen: string }>();
  for (const row of rows) {
    try {
      const phones: string[] = JSON.parse(row.weak_phonemes);
      for (const p of phones) {
        if (!p) continue;
        const entry = agg.get(p) || { scores: [], texts: [], lastSeen: row.created_at };
        entry.scores.push(row.total_score);
        if (entry.texts.length < 3) entry.texts.push(row.text);
        entry.lastSeen = row.created_at;
        agg.set(p, entry);
      }
    } catch { /* skip */ }
  }

  return Array.from(agg.entries())
    .map(([phoneme, data]) => ({
      phoneme,
      count: data.scores.length,
      avgScore: Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length),
      lowestScore: Math.min(...data.scores),
      exampleTexts: data.texts,
      lastSeen: data.lastSeen,
    }))
    .sort((a, b) => b.count - a.count);
}

describe('ErrorBook DB', () => {
  beforeAll(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA);
    // 创建测试用的 session
    db.prepare("INSERT INTO sessions (session_id, scene, mode) VALUES ('s1', 'daily', 'coach')").run();
    db.prepare("INSERT INTO sessions (session_id, scene, mode) VALUES ('s2', 'interview', 'coach')").run();
  });

  afterAll(() => {
    db.close();
  });

  it('returns empty array when no pronunciations', () => {
    expect(getErrorBook()).toEqual([]);
  });

  it('returns empty array when pronunciations have empty weak_phonemes', () => {
    addPronunciation('s1', 'hello', 85, 90, 80, 85, []);
    expect(getErrorBook()).toEqual([]);
  });

  it('aggregates a single weak phoneme correctly', () => {
    // Clean up from previous tests
    db.exec('DELETE FROM pronunciations');
    addPronunciation('s1', 'the cat', 50, 45, 55, 50, ['th', 'ae']);
    const book = getErrorBook();
    expect(book).toHaveLength(2);

    const th = book.find(e => e.phoneme === 'th');
    expect(th).toBeDefined();
    expect(th!.count).toBe(1);
    expect(th!.avgScore).toBe(50);
    expect(th!.lowestScore).toBe(50);
    expect(th!.exampleTexts).toContain('the cat');
  });

  it('aggregates multiple occurrences of the same phoneme', () => {
    db.exec('DELETE FROM pronunciations');
    addPronunciation('s1', 'three things', 40, 35, 45, 40, ['th', 'r']);
    addPronunciation('s2', 'thank you', 70, 68, 72, 70, ['th']);

    const book = getErrorBook();
    const th = book.find(e => e.phoneme === 'th');
    expect(th).toBeDefined();
    expect(th!.count).toBe(2);
    expect(th!.avgScore).toBe(55); // (40 + 70) / 2
    expect(th!.lowestScore).toBe(40);
  });

  it('limits example texts to 3 per phoneme', () => {
    db.exec('DELETE FROM pronunciations');
    for (let i = 0; i < 5; i++) {
      addPronunciation('s1', `test ${i}`, 60, 55, 65, 60, ['th']);
    }
    const book = getErrorBook();
    expect(book[0].exampleTexts.length).toBeLessThanOrEqual(3);
  });

  it('sorts by count descending', () => {
    db.exec('DELETE FROM pronunciations');
    // th: 3 occurrences, r: 1 occurrence
    addPronunciation('s1', 'three', 50, 45, 55, 50, ['th', 'r']);
    addPronunciation('s1', 'think', 55, 50, 60, 55, ['th']);
    addPronunciation('s1', 'thanks', 60, 55, 65, 60, ['th']);

    const book = getErrorBook();
    expect(book[0].phoneme).toBe('th');
    expect(book[0].count).toBe(3);
  });
});

describe('Progress weakPhoneme aggregation', () => {
  beforeAll(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA);
    db.prepare("INSERT INTO sessions (session_id, scene, mode) VALUES ('s1', 'daily', 'coach')").run();
  });

  afterAll(() => {
    db.close();
  });

  it('aggregates weak phonemes from all pronunciations', () => {
    addPronunciation('s1', 'the cat', 70, 68, 72, 70, ['th', 'ae']);
    addPronunciation('s1', 'red rose', 65, 60, 68, 65, ['r', 'z']);
    addPronunciation('s1', 'three things', 55, 50, 58, 55, ['th', 'r']);

    const rows = db.prepare(
      "SELECT weak_phonemes FROM pronunciations WHERE weak_phonemes IS NOT NULL AND weak_phonemes != '[]'"
    ).all() as Array<{ weak_phonemes: string }>;

    const counter = new Map<string, number>();
    for (const row of rows) {
      const phones: string[] = JSON.parse(row.weak_phonemes);
      for (const p of phones) {
        if (p) counter.set(p, (counter.get(p) || 0) + 1);
      }
    }

    expect(counter.get('th')).toBe(2);
    expect(counter.get('r')).toBe(2);
    expect(counter.get('ae')).toBe(1);
    expect(counter.get('z')).toBe(1);
  });
});
