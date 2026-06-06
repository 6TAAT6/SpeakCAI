interface Props {
  isRecording: boolean;
  frameCount: number;
  wsReady: boolean;
  turnsLen: number;
  reportOpen: boolean;
  showInterrupt: boolean;
  interrupted: boolean;
  handleRecordToggle: () => void;
  toggleReport: () => void;
  handleInterruptToggle: () => void;
}

export function BottomBar(props: Props) {
  return (
    <footer className="bottom-bar">
      {props.isRecording && (
        <span className="record-timer">● {props.frameCount > 0 ? Math.round((props.frameCount * 256) / 1000) : 0}s</span>
      )}
      <button onClick={props.handleRecordToggle} disabled={!props.wsReady} className={`record-btn ${props.isRecording ? 'recording' : ''}`}>
        {props.isRecording ? '⏹ 停止' : '🎤 开始对话'}
      </button>
      {props.turnsLen > 0 && (
        <button onClick={props.toggleReport} className={`ctrl-btn ${props.reportOpen ? 'active' : ''}`}>
          {props.reportOpen ? '💬 对话' : '📊 报告'}
        </button>
      )}
      {props.showInterrupt && (
        <button onClick={props.handleInterruptToggle} className="ctrl-btn">
          {props.interrupted ? '▶ 继续' : '⏹ 打断'}
        </button>
      )}
    </footer>
  );
}
