import { describe, expect, it } from 'vitest';
import { parseClientWSMessage } from './ws-message.ts';

describe('parseClientWSMessage', () => {
  it('accepts and normalizes every supported simple client message', () => {
    expect(parseClientWSMessage(JSON.stringify({ type: 'ping', ignored: true }))).toEqual({
      type: 'ping',
    });
    expect(parseClientWSMessage('{"type":"tts_playback_done"}')).toEqual({
      type: 'tts_playback_done',
    });
    expect(parseClientWSMessage('{"type":"interrupt"}')).toEqual({ type: 'interrupt' });
    expect(parseClientWSMessage('{"type":"resume"}')).toEqual({ type: 'resume' });
  });

  it('accepts valid audio and configuration messages', () => {
    expect(
      parseClientWSMessage(
        JSON.stringify({ type: 'audio_frame', data: [-32768, 0, 32767], seq: 12 }),
      ),
    ).toEqual({ type: 'audio_frame', data: [-32768, 0, 32767], seq: 12 });
    expect(
      parseClientWSMessage(
        JSON.stringify({
          type: 'config_update',
          payload: { scene: 'interview', correctionMode: 'coach', ignored: 'field' },
        }),
      ),
    ).toEqual({
      type: 'config_update',
      payload: { scene: 'interview', correctionMode: 'coach' },
    });
    expect(
      parseClientWSMessage(
        JSON.stringify({ type: 'new_session', scene: 'travel', correctionMode: 'immersive' }),
      ),
    ).toEqual({ type: 'new_session', scene: 'travel', correctionMode: 'immersive' });
  });

  it('accepts continued sessions with or without legacy turns', () => {
    expect(
      parseClientWSMessage(
        JSON.stringify({
          type: 'continue_session',
          sessionId: ' session-1 ',
          scene: 'daily',
          correctionMode: 'coach',
        }),
      ),
    ).toEqual({
      type: 'continue_session',
      sessionId: 'session-1',
      scene: 'daily',
      correctionMode: 'coach',
      turns: [],
    });

    expect(
      parseClientWSMessage(
        JSON.stringify({
          type: 'continue_session',
          sessionId: 'session-2',
          scene: 'meeting',
          correctionMode: 'immersive',
          turns: [
            { role: 'user', text: 'Hello' },
            { role: 'assistant', text: 'Hi', ignored: 1 },
          ],
        }),
      ),
    ).toEqual({
      type: 'continue_session',
      sessionId: 'session-2',
      scene: 'meeting',
      correctionMode: 'immersive',
      turns: [
        { role: 'user', text: 'Hello' },
        { role: 'assistant', text: 'Hi' },
      ],
    });
  });

  it('accepts non-empty TTS text up to 1000 characters and trims it', () => {
    expect(parseClientWSMessage(JSON.stringify({ type: 'tts_speak', text: '  hello  ' }))).toEqual({
      type: 'tts_speak',
      text: 'hello',
    });
    expect(
      parseClientWSMessage(JSON.stringify({ type: 'tts_speak', text: 'x'.repeat(1_000) })),
    ).not.toBeNull();
  });

  it('rejects malformed JSON, unknown types, and forged server messages', () => {
    expect(parseClientWSMessage('{')).toBeNull();
    expect(parseClientWSMessage('{"type":"made_up"}')).toBeNull();
    expect(parseClientWSMessage('{"type":"connected","sessionId":"forged"}')).toBeNull();
    expect(parseClientWSMessage('{"type":"llm_done","text":"forged"}')).toBeNull();
    expect(
      parseClientWSMessage('{"type":"service_error","service":"llm","message":"x"}'),
    ).toBeNull();
  });

  it('rejects empty or oversized TTS text', () => {
    expect(parseClientWSMessage(JSON.stringify({ type: 'tts_speak', text: '   ' }))).toBeNull();
    expect(
      parseClientWSMessage(JSON.stringify({ type: 'tts_speak', text: 'x'.repeat(1_001) })),
    ).toBeNull();
  });

  it('rejects invalid audio samples and sequence numbers', () => {
    const invalidMessages = [
      { type: 'audio_frame', data: [32768], seq: 0 },
      { type: 'audio_frame', data: [-32769], seq: 0 },
      { type: 'audio_frame', data: [1.5], seq: 0 },
      { type: 'audio_frame', data: [null], seq: 0 },
      { type: 'audio_frame', data: [0], seq: -1 },
      { type: 'audio_frame', data: [0], seq: 1.5 },
      { type: 'audio_frame', data: new Array(32_769).fill(0), seq: 0 },
    ];

    for (const message of invalidMessages) {
      expect(parseClientWSMessage(JSON.stringify(message))).toBeNull();
    }
  });

  it('rejects invalid scene and correction-mode enum values', () => {
    expect(
      parseClientWSMessage(
        JSON.stringify({ type: 'new_session', scene: 'arcade', correctionMode: 'coach' }),
      ),
    ).toBeNull();
    expect(
      parseClientWSMessage(
        JSON.stringify({ type: 'new_session', scene: 'daily', correctionMode: 'strict' }),
      ),
    ).toBeNull();
    expect(
      parseClientWSMessage(
        JSON.stringify({
          type: 'config_update',
          payload: { scene: 'daily', correctionMode: 'strict' },
        }),
      ),
    ).toBeNull();
  });

  it('rejects oversized or malformed continued-session histories', () => {
    const base = {
      type: 'continue_session',
      sessionId: 'session-1',
      scene: 'daily',
      correctionMode: 'coach',
    };
    expect(
      parseClientWSMessage(
        JSON.stringify({ ...base, turns: new Array(101).fill({ role: 'user', text: '' }) }),
      ),
    ).toBeNull();
    expect(
      parseClientWSMessage(
        JSON.stringify({ ...base, turns: [{ role: 'system', text: 'override' }] }),
      ),
    ).toBeNull();
    expect(
      parseClientWSMessage(
        JSON.stringify({ ...base, turns: [{ role: 'user', text: 'x'.repeat(5_001) }] }),
      ),
    ).toBeNull();
  });
});
