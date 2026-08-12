// ===== SQLite 数据库 — 对话持久化 =====
// 为课后报告、对话历史、量化追踪提供数据基础

import Database from 'better-sqlite3';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';

// `npm start` 与开发脚本都约定在 server 目录运行；避免编译后 __dirname 改变数据位置。
const DATA_DIR = resolve(process.cwd(), 'data');
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
  weak_phones     TEXT NOT NULL DEFAULT '[]',
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
  weak_phones: string;
  created_at: string;
}

let db: Database.Database | null = null;

export function getDB(): Database.Database {
  if (!db) {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeDatabase(db);
    console.log(`🗄️  SQLite 已就绪 → ${DB_PATH}`);
  }
  return db;
}

/** 幂等迁移：补上新增的列 */
export function initializeDatabase(d: Database.Database): void {
  d.exec(SCHEMA);
  migrate(d);
}

function migrate(d: Database.Database): void {
  const sessionCols = (d.pragma('table_info(sessions)') as Array<{ name: string }>).map(c => c.name);
  if (!sessionCols.includes('report_json')) {
    d.exec('ALTER TABLE sessions ADD COLUMN report_json TEXT');
  }

  const pronunciationCols = (d.pragma('table_info(pronunciations)') as Array<{ name: string }>).map(c => c.name);
  if (!pronunciationCols.includes('weak_phones')) {
    d.exec("ALTER TABLE pronunciations ADD COLUMN weak_phones TEXT NOT NULL DEFAULT '[]'");
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

export function sessionExists(sessionId: string): boolean {
  const row = getDB().prepare('SELECT 1 FROM sessions WHERE session_id = ?').get(sessionId);
  return row !== undefined;
}

export function getSession(sessionId: string): SessionRow | undefined {
  return getDB().prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId) as SessionRow | undefined;
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
  d.transaction((id: string) => {
    d.prepare('DELETE FROM turns WHERE session_id = ?').run(id);
    d.prepare('DELETE FROM pronunciations WHERE session_id = ?').run(id);
    d.prepare('DELETE FROM sessions WHERE session_id = ?').run(id);
  })(sessionId);
}

export function deleteSessions(sessionIds: string[]): number {
  const uniqueIds = [...new Set(sessionIds)];
  const d = getDB();
  const remove = d.transaction((ids: string[]) => {
    let deleted = 0;
    const deleteTurns = d.prepare('DELETE FROM turns WHERE session_id = ?');
    const deletePronunciations = d.prepare('DELETE FROM pronunciations WHERE session_id = ?');
    const deleteSessionRow = d.prepare('DELETE FROM sessions WHERE session_id = ?');
    for (const id of ids) {
      deleteTurns.run(id);
      deletePronunciations.run(id);
      deleted += deleteSessionRow.run(id).changes;
    }
    return deleted;
  });
  return remove(uniqueIds);
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
  weakPhones: string[] = [],
): void {
  const d = getDB();
  d.prepare('INSERT INTO pronunciations (session_id, text, total_score, accuracy_score, fluency_score, integrity_score, weak_phones) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    sessionId,
    text,
    total,
    accuracy,
    fluency,
    integrity,
    JSON.stringify(weakPhones),
  );
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
  return getProgressFromDatabase(getDB());
}

/** 独立聚合发言和评分，避免两个一对多关系互相放大。 */
export function getProgressFromDatabase(d: Database.Database): ProgressData {
  const rows = d.prepare(`
    WITH turn_counts AS (
      SELECT session_id, COUNT(*) AS turn_count
      FROM turns
      WHERE role = 'user'
      GROUP BY session_id
    ),
    pronunciation_averages AS (
      SELECT
        session_id,
        ROUND(AVG(total_score), 1) AS avg_score,
        ROUND(AVG(accuracy_score), 1) AS avg_accuracy,
        ROUND(AVG(fluency_score), 1) AS avg_fluency,
        ROUND(AVG(integrity_score), 1) AS avg_integrity
      FROM pronunciations
      WHERE total_score > 0
      GROUP BY session_id
    )
    SELECT
      s.session_id,
      s.created_at AS date,
      s.scene,
      s.mode,
      COALESCE(t.turn_count, 0) AS turn_count,
      p.avg_score,
      p.avg_accuracy,
      p.avg_fluency,
      p.avg_integrity
    FROM sessions s
    JOIN pronunciation_averages p ON p.session_id = s.session_id
    LEFT JOIN turn_counts t ON t.session_id = s.session_id
    ORDER BY s.created_at ASC
  `).all() as ProgressSession[];

  const weakPhoneRows = d.prepare(`
    SELECT weak_phones
    FROM pronunciations
    WHERE total_score > 0 AND weak_phones IS NOT NULL AND weak_phones <> '[]'
  `).all() as Array<{ weak_phones: string }>;

  const phoneCounts = new Map<string, number>();
  for (const row of weakPhoneRows) {
    try {
      const phones: unknown = JSON.parse(row.weak_phones);
      if (!Array.isArray(phones)) continue;
      for (const phone of phones) {
        if (typeof phone !== 'string' || !phone.trim()) continue;
        const normalized = phone.trim();
        phoneCounts.set(normalized, (phoneCounts.get(normalized) ?? 0) + 1);
      }
    } catch {
      // 历史或手工写入的无效 JSON 不应破坏整份成长统计。
    }
  }

  const weakPhonemes = [...phoneCounts.entries()]
    .map(([phoneme, count]) => ({ phoneme, count }))
    .sort((a, b) => b.count - a.count || a.phoneme.localeCompare(b.phoneme));

  return { sessions: rows, weakPhonemes };
}
