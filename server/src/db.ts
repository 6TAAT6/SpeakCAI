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
  has_report?: number;
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
    migrate(db);
    console.log(`🗄️  SQLite 已就绪 → ${DB_PATH}`);
  }
  return db;
}

/** 幂等迁移：补上新增的列 */
function migrate(d: Database.Database): void {
  const cols = (d.pragma('table_info(sessions)') as Array<{ name: string }>).map(c => c.name);
  if (!cols.includes('report_json')) {
    d.exec('ALTER TABLE sessions ADD COLUMN report_json TEXT');
  }
}

export function closeDB(): void {
  db?.close();
  db = null;
}

// ---- Session CRUD ----

export function createSession(sessionId: string, scene = 'daily', mode = 'coach'): void {
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
  d.pragma('wal_checkpoint(PASSIVE)');
}

/** 继续历史会话：清除 ended_at，更新场景与模式 */
export function resumeSession(sessionId: string, scene: string, mode: string): void {
  const d = getDB();
  d.prepare('UPDATE sessions SET scene = ?, mode = ?, ended_at = NULL WHERE session_id = ?').run(scene, mode, sessionId);
}

export function deleteSession(sessionId: string): void {
  const d = getDB();
  d.prepare('DELETE FROM turns WHERE session_id = ?').run(sessionId);
  d.prepare('DELETE FROM pronunciations WHERE session_id = ?').run(sessionId);
  d.prepare('DELETE FROM sessions WHERE session_id = ?').run(sessionId);
}

export function getSessions(limit = 50): SessionRow[] {
  const d = getDB();
  return d.prepare('SELECT *, report_json IS NOT NULL as has_report FROM sessions WHERE session_id IN (SELECT DISTINCT session_id FROM turns) ORDER BY created_at DESC LIMIT ?').all(limit) as SessionRow[];
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

// ---- Report CRUD ----

export function saveReport(sessionId: string, reportJson: string): void {
  const d = getDB();
  d.prepare('UPDATE sessions SET report_json = ? WHERE session_id = ?').run(reportJson, sessionId);
}

export function getReport(sessionId: string): string | null {
  const d = getDB();
  const row = d.prepare('SELECT report_json FROM sessions WHERE session_id = ?').get(sessionId) as { report_json: string | null } | undefined;
  return row?.report_json || null;
}

// ---- 成长曲线聚合 ----
export interface ProgressSession {
  session_id: string;
  date: string;
  scene: string;
  mode: string;
  turn_count: number;
  avg_score: number;
  avg_accuracy: number;
  avg_fluency: number;
  avg_integrity: number;
}

export interface ProgressData {
  sessions: ProgressSession[];
  weakPhonemes: Array<{ phoneme: string; count: number }>;
}

export function getProgress(): ProgressData {
  const d = getDB();
  // 按 session 聚合发音评测数据
  const rows = d.prepare(`
    SELECT
      s.session_id,
      s.created_at AS date,
      s.scene,
      s.mode,
      COUNT(t.id) AS turn_count,
      ROUND(AVG(p.total_score), 1) AS avg_score,
      ROUND(AVG(p.accuracy_score), 1) AS avg_accuracy,
      ROUND(AVG(p.fluency_score), 1) AS avg_fluency,
      ROUND(AVG(p.integrity_score), 1) AS avg_integrity
    FROM sessions s
    LEFT JOIN turns t ON t.session_id = s.session_id AND t.role = 'user'
    LEFT JOIN pronunciations p ON p.session_id = s.session_id
    WHERE p.total_score > 0
    GROUP BY s.session_id
    ORDER BY s.created_at ASC
  `).all() as ProgressSession[];

  // 弱音素无法从 DB 聚合（未持久化），返回空数组占位
  const weakPhonemes: Array<{ phoneme: string; count: number }> = [];

  return { sessions: rows, weakPhonemes };
}
