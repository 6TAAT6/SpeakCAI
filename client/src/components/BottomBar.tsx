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
      <div className="bottom-bar-left">
        {props.turnsLen > 0 && (
          <button
            onClick={props.toggleReport}
            className={`ctrl-btn ${props.reportOpen ? 'active' : ''}`}
          >
            {props.reportOpen ? '💬 对话' : '📊 报告'}
          </button>
        )}
      </div>
      <div className="bottom-bar-center">
        {props.isRecording && (
          <span className="record-timer">
            ● {props.frameCount > 0 ? Math.round((props.frameCount * 256) / 1000) : 0}s
          </span>
        )}
        <button
          onClick={props.handleRecordToggle}
          disabled={!props.wsReady}
          className={`record-btn ${props.isRecording ? 'recording' : ''}`}
        >
          {props.isRecording ? '⏹ 停止录音' : '🎤 开始说英语'}
        </button>
      </div>
      <div className="bottom-bar-right">
        {props.showInterrupt && (
          <button onClick={props.handleInterruptToggle} className="ctrl-btn">
            {props.interrupted ? '▶ 继续播报' : '⏸ 暂停播报'}
          </button>
        )}
      </div>
    </footer>
  );
}
