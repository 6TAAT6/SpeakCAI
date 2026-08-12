import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { getProgressFromDatabase, initializeDatabase } from './db.ts';

describe('growth progress aggregation', () => {
  const databases: Database.Database[] = [];

  afterEach(() => {
    for (const database of databases.splice(0)) database.close();
  });

  function createMemoryDatabase(): Database.Database {
    const database = new Database(':memory:');
    initializeDatabase(database);
    databases.push(database);
    return database;
  }

  it('counts user turns once when a session has multiple scores', () => {
    const database = createMemoryDatabase();
    database.prepare("INSERT INTO sessions (session_id, scene, mode, created_at) VALUES ('session-1', 'daily', 'coach', '2026-08-12 10:00:00')").run();

    const addTurn = database.prepare('INSERT INTO turns (session_id, role, text) VALUES (?, ?, ?)');
    addTurn.run('session-1', 'user', 'First answer');
    addTurn.run('session-1', 'assistant', 'First reply');
    addTurn.run('session-1', 'user', 'Second answer');

    const addPronunciation = database.prepare(`
      INSERT INTO pronunciations
        (session_id, text, total_score, accuracy_score, fluency_score, integrity_score, weak_phones)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    addPronunciation.run('session-1', 'First answer', 80, 70, 90, 80, JSON.stringify(['th', 'r']));
    addPronunciation.run('session-1', 'Second answer', 60, 50, 70, 60, JSON.stringify(['th']));

    const progress = getProgressFromDatabase(database);

    expect(progress.sessions).toEqual([
      expect.objectContaining({
        session_id: 'session-1',
        turn_count: 2,
        avg_score: 70,
        avg_accuracy: 60,
        avg_fluency: 80,
        avg_integrity: 70,
      }),
    ]);
    expect(progress.weakPhonemes).toEqual([
      { phoneme: 'th', count: 2 },
      { phoneme: 'r', count: 1 },
    ]);
  });

  it('ignores invalid legacy JSON and sessions without a positive score', () => {
    const database = createMemoryDatabase();
    database.prepare("INSERT INTO sessions (session_id) VALUES ('valid'), ('unscored')").run();
    database.prepare(`
      INSERT INTO pronunciations
        (session_id, text, total_score, accuracy_score, fluency_score, integrity_score, weak_phones)
      VALUES
        ('valid', 'Hello', 90, 90, 90, 90, 'not-json'),
        ('unscored', 'Silent', 0, 0, 0, 0, '["x"]')
    `).run();

    const progress = getProgressFromDatabase(database);

    expect(progress.sessions).toHaveLength(1);
    expect(progress.sessions[0]).toEqual(expect.objectContaining({ session_id: 'valid', turn_count: 0 }));
    expect(progress.weakPhonemes).toEqual([]);
  });
});
