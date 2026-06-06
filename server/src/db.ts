// ===== SQLite 数据库 — 对话持久化 =====
// 为课后报告、对话历史、量化追踪提供数据基础

import Database from 'better-sqlite3';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../data');
const DB_PATH = resolve(DATA_DIR, 'speakcai.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  session_id  TEXT PRIMARY KEY,
  scene       TEXT NOT NULL DEFAULT 'interview',
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
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id);
CREATE INDEX IF NOT EXISTS idx_pron_session ON pronunciations(session_id);
`;

export interface SessionRow {
  session_id: string;
  scene: string;
  mode: string;
  created_at: string;
  ended_at: string | null;
}

export interface TurnRow {
  id: number;
  session_id: string;
  role: 'user' | 'assistant';
  text: string;
  created_at: string;
}

export interface PronunciationRow {
  id: number;
  session_id: string;
  text: string;
  total_score: number;
  accuracy_score: number;
  fluency_score: number;
  integrity_score: number;
  created_at: string;
}

let db: Database.Database | null = null;

export function getDB(): Database.Database {
  if (!db) {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA);
    console.log(`🗄️  SQLite 已就绪 → ${DB_PATH}`);
  }
  return db;
}

export function closeDB(): void {
  db?.close();
  db = null;
}

// ---- Session CRUD ----

export function createSession(sessionId: string, scene = 'interview', mode = 'coach'): void {
  const d = getDB();
  d.prepare('INSERT OR IGNORE INTO sessions (session_id, scene, mode) VALUES (?, ?, ?)').run(sessionId, scene, mode);
}

export function updateSessionConfig(sessionId: string, scene: string, mode: string): void {
  const d = getDB();
  d.prepare('UPDATE sessions SET scene = ?, mode = ? WHERE session_id = ?').run(scene, mode, sessionId);
}

export function endSession(sessionId: string): void {
  const d = getDB();
  d.prepare('UPDATE sessions SET ended_at = datetime(\'now\') WHERE session_id = ?').run(sessionId);
}

export function getSessions(limit = 50): SessionRow[] {
  const d = getDB();
  return d.prepare('SELECT * FROM sessions WHERE session_id IN (SELECT DISTINCT session_id FROM turns) ORDER BY created_at DESC LIMIT ?').all(limit) as SessionRow[];
}

// ---- Turn CRUD ----

export function addTurn(sessionId: string, role: 'user' | 'assistant', text: string): void {
  const d = getDB();
  d.prepare('INSERT INTO turns (session_id, role, text) VALUES (?, ?, ?)').run(sessionId, role, text);
}

export function getTurns(sessionId: string): TurnRow[] {
  const d = getDB();
  return d.prepare('SELECT * FROM turns WHERE session_id = ? ORDER BY id').all(sessionId) as TurnRow[];
}

// ---- Pronunciation CRUD ----

export function addPronunciation(
  sessionId: string,
  text: string,
  total: number,
  accuracy: number,
  fluency: number,
  integrity: number,
): void {
  const d = getDB();
  d.prepare('INSERT INTO pronunciations (session_id, text, total_score, accuracy_score, fluency_score, integrity_score) VALUES (?, ?, ?, ?, ?, ?)').run(sessionId, text, total, accuracy, fluency, integrity);
}

export function getPronunciations(sessionId: string): PronunciationRow[] {
  const d = getDB();
  return d.prepare('SELECT * FROM pronunciations WHERE session_id = ? ORDER BY id').all(sessionId) as PronunciationRow[];
}
