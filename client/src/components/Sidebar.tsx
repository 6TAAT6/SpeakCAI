import type { Session } from '../types.ts';
import type { Scene, CorrectionMode } from '@shared/types.ts';

const sceneEmoji: Record<string, string> = { daily: '💬', interview: '💼', ordering: '🍽️', meeting: '📊', travel: '✈️', shopping: '🛍️', hotel: '🏨' };
const modeEmoji: Record<string, string> = { immersive: '🌊', coach: '🎯' };

function formatLocalTime(utcStr: string): string {
  const iso = utcStr.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return utcStr;
  return d.toLocaleString();
}

interface Props {
  sessions: Session[];
  selectedSession: string | null;
  batchMode: boolean;
  selectedIds: Set<string>;
  scene: Scene;
  correctionMode: CorrectionMode;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (e: React.MouseEvent, id: string) => void;
  onToggleBatchMode: () => void;
  onToggleSelectId: (id: string) => void;
  onSelectAllIds: (ids: string[]) => void;
  onBatchDelete: () => void;
  onProgress: () => void;
}

export function Sidebar(props: Props) {
  const allIds = props.sessions.map(s => s.session_id);

  return (
    <aside className="sidebar">
      {/* 新建对话 */}
      <button onClick={props.onNewChat} className="sidebar-new-btn">
        ＋ 新建对话
      </button>
      <button onClick={props.onProgress} className="sidebar-new-btn" style={{ marginTop: 4 }}>
        📈 成长曲线
      </button>

      {/* 批量工具栏 */}
      <div className="sidebar-toolbar">
        <button
          onClick={props.onToggleBatchMode}
          className={`sidebar-tool-btn${props.batchMode ? ' active' : ''}`}
        >
          {props.batchMode ? '✕ 取消' : '☑ 批量'}
        </button>
        {props.batchMode && allIds.length > 0 && (
          <label className="sidebar-select-all">
            <input
              type="checkbox"
              checked={props.selectedIds.size === allIds.length && allIds.length > 0}
              onChange={() => props.onSelectAllIds(allIds)}
            />
            {props.selectedIds.size}/{allIds.length}
          </label>
        )}
      </div>

      {props.batchMode && props.selectedIds.size > 0 && (
        <button onClick={props.onBatchDelete} className="sidebar-delete-btn">
          🗑 删除选中 ({props.selectedIds.size})
        </button>
      )}

      {/* 历史列表 */}
      <div className="sidebar-list">
        {props.sessions.length === 0 ? (
          <p className="sidebar-empty">暂无对话记录</p>
        ) : (
          props.sessions.map((s) => {
            return (
              <div
                key={s.session_id}
                className={`sidebar-item${props.selectedSession === s.session_id ? ' active' : ''}${props.batchMode && props.selectedIds.has(s.session_id) ? ' batch-selected' : ''}`}
                onClick={() => {
                  if (props.batchMode) {
                    props.onToggleSelectId(s.session_id);
                  } else {
                    props.onSelectSession(s.session_id);
                  }
                }}
              >
                {props.batchMode && (
                  <input
                    type="checkbox"
                    checked={props.selectedIds.has(s.session_id)}
                    onChange={() => props.onToggleSelectId(s.session_id)}
                    onClick={(e) => e.stopPropagation()}
                    className="batch-checkbox"
                  />
                )}
                <div className="sidebar-item-content">
                  <div className="sidebar-item-top">
                    <span className="sidebar-scene">{sceneEmoji[s.scene] || '❓'} {s.scene}</span>
                    <span className="sidebar-mode">{modeEmoji[s.mode] || '❓'}</span>
                    {s.has_report ? <span className="sidebar-report-dot">📊</span> : null}
                  </div>
                  <span className="sidebar-date">{formatLocalTime(s.created_at)}</span>
                </div>
                {!props.batchMode && (
                  <button
                    onClick={(e) => props.onDeleteSession(e, s.session_id)}
                    className="sidebar-item-del"
                    title="删除"
                  >
                    🗑
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
