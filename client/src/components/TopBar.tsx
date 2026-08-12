import { useState, useEffect } from 'react';
import type { Scene, CorrectionMode } from '@shared/types.ts';
import type { FontSize, Theme } from '../types.ts';

const themeIcons: Record<Theme, string> = { auto: '🌓', dark: '🌙', light: '☀️' };
const themeLabels: Record<Theme, string> = { auto: '自动', dark: '深色', light: '浅色' };
const fontSizeLabels: Record<FontSize, string> = { sm: '小', md: '中', lg: '大' };

const scenes: { key: Scene; emoji: string; label: string }[] = [
  { key: 'daily', emoji: '💬', label: '日常' },
  { key: 'interview', emoji: '💼', label: '面试' },
  { key: 'ordering', emoji: '🍽️', label: '点餐' },
  { key: 'meeting', emoji: '📊', label: '会议' },
  { key: 'travel', emoji: '✈️', label: '旅游' },
  { key: 'shopping', emoji: '🛍️', label: '购物' },
  { key: 'hotel', emoji: '🏨', label: '酒店' },
];

const modes: { key: CorrectionMode; emoji: string; label: string }[] = [
  { key: 'coach', emoji: '🎯', label: '教练' },
  { key: 'immersive', emoji: '🌊', label: '沉浸' },
];

interface Props {
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
  fontSize: FontSize;
  pickFontSize: (f: FontSize) => void;
  theme: Theme;
  pickTheme: (t: Theme) => void;
  scene: Scene;
  correctionMode: CorrectionMode;
  updateConfig: (s: Scene, m: CorrectionMode) => void;
  statusEmoji: string;
  statusText: string;
  statusColor: string;
}

export function TopBar(props: Props) {
  const [showSceneMenu, setShowSceneMenu] = useState(false);

  const currentScene = scenes.find((s) => s.key === props.scene);
  const currentMode = modes.find((m) => m.key === props.correctionMode);

  // 点击外部关闭场景面板
  useEffect(() => {
    if (!showSceneMenu) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.scene-wrap')) setShowSceneMenu(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showSceneMenu]);

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <span className="brand">SpeakCAI</span>
      </div>

      <div className="top-bar-center">
        <div className="config-selectors">
          <div className="scene-wrap">
            <button
              aria-expanded={showSceneMenu}
              aria-haspopup="menu"
              onClick={(e) => {
                e.stopPropagation();
                setShowSceneMenu(!showSceneMenu);
              }}
              className="scene-trigger"
            >
              {currentScene?.emoji} {currentScene?.label} · {currentMode?.emoji}{' '}
              {currentMode?.label} ▾
            </button>
            {showSceneMenu && (
              <div className="scene-panel">
                <span className="scene-section-label">场景</span>
                <div className="scene-section">
                  {scenes.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => {
                        props.updateConfig(s.key, props.correctionMode);
                        setShowSceneMenu(false);
                      }}
                      className={`scene-opt ${props.scene === s.key ? 'active' : ''}`}
                    >
                      {s.emoji} {s.label}
                    </button>
                  ))}
                </div>
                <div className="scene-divider" />
                <span className="scene-section-label">模式</span>
                <div className="scene-section">
                  {modes.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => {
                        props.updateConfig(props.scene, m.key);
                        setShowSceneMenu(false);
                      }}
                      className={`scene-opt ${props.correctionMode === m.key ? 'active' : ''}`}
                    >
                      {m.emoji} {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="top-bar-right">
        <div className="settings-wrap">
          <button
            aria-expanded={props.showSettings}
            aria-haspopup="menu"
            onClick={(e) => {
              e.stopPropagation();
              props.setShowSettings(!props.showSettings);
            }}
            className="settings-btn"
          >
            ⚙ 设置
          </button>
          {props.showSettings && (
            <div className="settings-panel">
              <div className="settings-section">
                <span className="settings-label">字体大小</span>
                <div className="settings-options">
                  {(Object.entries(fontSizeLabels) as [FontSize, string][]).map(([f, label]) => (
                    <button
                      key={f}
                      onClick={() => props.pickFontSize(f)}
                      className={`settings-opt ${props.fontSize === f ? 'active' : ''}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-section">
                <span className="settings-label">主题模式</span>
                <div className="settings-options">
                  {(Object.entries(themeIcons) as [Theme, string][]).map(([t, icon]) => (
                    <button
                      key={t}
                      onClick={() => props.pickTheme(t)}
                      className={`settings-opt ${props.theme === t ? 'active' : ''}`}
                    >
                      {icon} {themeLabels[t]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        <span
          className="status-badge"
          style={{ color: props.statusColor }}
          title={props.statusText}
        >
          {props.statusEmoji}
          <span className="status-text">{props.statusText}</span>
        </span>
      </div>
    </header>
  );
}
