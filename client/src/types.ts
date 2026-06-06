/** 前端共享类型 — 消除组件间类型重复定义 */

export interface Turn { role: 'user' | 'ai'; text: string; score?: number; accuracy?: number; fluency?: number; integrity?: number; weakPhones?: string[]; tips?: string; tryAgain?: string }

export type Theme = 'auto' | 'dark' | 'light';

export type FontSize = 'sm' | 'md' | 'lg';

export interface Session { session_id: string; scene: string; mode: string; created_at: string; ended_at: string | null; report_json?: string; has_report?: number }

export interface TurnRow { id: number; session_id: string; role: string; text: string; created_at: string }
