import type { Session } from '../types.ts';
import type { Scene, CorrectionMode } from '@shared/types.ts';
import { Icon } from './Icon.tsx';

const sceneLabel: Record<string, string> = {
  daily: '日常对话',
  interview: '求职面试',
  ordering: '餐厅点餐',
  meeting: '工作会议',
  travel: '旅行交流',
  shopping: '购物沟通',
  hotel: '酒店入住',
};
const sceneCode: Record<string, string> = {
  daily: 'DAY',
  interview: 'JOB',
  ordering: 'EAT',
  meeting: 'MTG',
  travel: 'TRP',
  shopping: 'BUY',
  hotel: 'HTL',
};
const modeLabel: Record<string, string> = { immersive: '沉浸', coach: '教练' };

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
  const allIds = props.sessions.map((s) => s.session_id);

  return (
    <aside className="sidebar">
      <div className="sidebar-heading">
        <span>练习带</span>
        <small>{props.sessions.length} SESSIONS</small>
      </div>
      {/* 新建对话 */}
      <button onClick={props.onNewChat} className="sidebar-new-btn">
        <Icon name="add" /> 新建对话
      </button>
      <button onClick={props.onProgress} className="sidebar-progress-btn">
        <Icon name="chart" /> 成长曲线 <span>查看</span>
      </button>
      {/* 批量工具栏 */}
      <div className="sidebar-toolbar">
        <button
          onClick={props.onToggleBatchMode}
          className={`sidebar-tool-btn${props.batchMode ? ' active' : ''}`}
        >
          <Icon name={props.batchMode ? 'close' : 'check'} size={15} />
          {props.batchMode ? '取消' : '整理'}
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
          <Icon name="trash" size={16} />
          删除选中 ({props.selectedIds.size})
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
                role="button"
                tabIndex={0}
                className={`sidebar-item${props.selectedSession === s.session_id ? ' active' : ''}${props.batchMode && props.selectedIds.has(s.session_id) ? ' batch-selected' : ''}`}
                onClick={() => {
                  if (props.batchMode) {
                    props.onToggleSelectId(s.session_id);
                  } else {
                    props.onSelectSession(s.session_id);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  props.batchMode
                    ? props.onToggleSelectId(s.session_id)
                    : props.onSelectSession(s.session_id);
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
                    <span className="sidebar-scene">
                      <span>{sceneCode[s.scene] || 'GEN'}</span>
                      {sceneLabel[s.scene] || s.scene}
                    </span>
                    <span className="sidebar-mode">{modeLabel[s.mode] || s.mode}</span>
                    {s.has_report ? (
                      <span className="sidebar-report-dot" title="已有学习报告">
                        <Icon name="chart" size={13} />
                      </span>
                    ) : null}
                  </div>
                  <span className="sidebar-date">{formatLocalTime(s.created_at)}</span>
                </div>
                {!props.batchMode && (
                  <button
                    onClick={(e) => props.onDeleteSession(e, s.session_id)}
                    className="sidebar-item-del"
                    aria-label="删除这条对话"
                  >
                    <Icon name="trash" size={15} />
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
