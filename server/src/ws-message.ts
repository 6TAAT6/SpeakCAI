import type { CorrectionMode, Scene, WSMessage } from '../../shared/types.ts';

const SCENES = new Set<Scene>([
  'daily',
  'interview',
  'ordering',
  'meeting',
  'travel',
  'shopping',
  'hotel',
]);
const CORRECTION_MODES = new Set<CorrectionMode>(['immersive', 'coach']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScene(value: unknown): value is Scene {
  return typeof value === 'string' && SCENES.has(value as Scene);
}

function isCorrectionMode(value: unknown): value is CorrectionMode {
  return typeof value === 'string' && CORRECTION_MODES.has(value as CorrectionMode);
}

function parseText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : null;
}

/**
 * Parse and normalize a browser-to-server WebSocket message.
 *
 * Returning a newly constructed object deliberately drops unknown fields and
 * prevents server-only protocol messages from reaching the message dispatcher.
 */
export function parseClientWSMessage(raw: string): WSMessage | null {
  let input: unknown;
  try {
    input = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }

  if (!isRecord(input) || typeof input.type !== 'string') return null;

  switch (input.type) {
    case 'ping':
      return { type: 'ping' };

    case 'tts_playback_done':
      return { type: 'tts_playback_done' };

    case 'interrupt':
      return { type: 'interrupt' };

    case 'resume':
      return { type: 'resume' };

    case 'audio_frame': {
      if (
        !Array.isArray(input.data) ||
        input.data.length > 32_768 ||
        !input.data.every(
          (sample) =>
            typeof sample === 'number' &&
            Number.isFinite(sample) &&
            Number.isInteger(sample) &&
            sample >= -32_768 &&
            sample <= 32_767,
        ) ||
        typeof input.seq !== 'number' ||
        !Number.isFinite(input.seq) ||
        !Number.isInteger(input.seq) ||
        input.seq < 0
      ) {
        return null;
      }
      return { type: 'audio_frame', data: input.data, seq: input.seq };
    }

    case 'tts_speak': {
      const text = parseText(input.text, 1_000);
      return text === null ? null : { type: 'tts_speak', text };
    }

    case 'config_update': {
      if (
        !isRecord(input.payload) ||
        !isScene(input.payload.scene) ||
        !isCorrectionMode(input.payload.correctionMode)
      ) {
        return null;
      }
      return {
        type: 'config_update',
        payload: {
          scene: input.payload.scene,
          correctionMode: input.payload.correctionMode,
        },
      };
    }

    case 'new_session':
      if (!isScene(input.scene) || !isCorrectionMode(input.correctionMode)) return null;
      return {
        type: 'new_session',
        scene: input.scene,
        correctionMode: input.correctionMode,
      };

    case 'continue_session': {
      const sessionId = parseText(input.sessionId, 100);
      if (
        sessionId === null ||
        !isScene(input.scene) ||
        !isCorrectionMode(input.correctionMode) ||
        (input.turns !== undefined && !Array.isArray(input.turns))
      ) {
        return null;
      }

      const turnsInput = input.turns ?? [];
      if (!Array.isArray(turnsInput) || turnsInput.length > 100) return null;

      const turns: Array<{ role: 'user' | 'assistant'; text: string }> = [];
      for (const turn of turnsInput) {
        if (
          !isRecord(turn) ||
          (turn.role !== 'user' && turn.role !== 'assistant') ||
          typeof turn.text !== 'string' ||
          turn.text.length > 5_000
        ) {
          return null;
        }
        turns.push({ role: turn.role, text: turn.text });
      }

      return {
        type: 'continue_session',
        sessionId,
        scene: input.scene,
        correctionMode: input.correctionMode,
        turns,
      };
    }

    default:
      return null;
  }
}
