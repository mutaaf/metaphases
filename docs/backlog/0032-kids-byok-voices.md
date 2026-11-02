---
id: 0032
title: Kids read-aloud — friendlier voices on a grown-up's own OpenAI or Gemini key
status: shipped
priority: P2
size: M
lens: user-value
created: 2026-11-02
pr: 0
by: operator
---

## Why
The operator: "allow for bring your own key for better friendlier voices". Early readers lean on "Read it to me", and many devices' built-in voices sound robotic. A warm storyteller voice makes Luna feel like a friend.

## What
- `POST /api/ai/speak` (`worker/ai/speak.ts`): OpenAI `gpt-4o-mini-tts` (coral, nova, fable, shimmer, sage) with a warm-storyteller instruction, streamed as mp3; Gemini `gemini-2.5-flash-preview-tts` (Leda, Puck, Aoede, Zephyr, Kore), PCM wrapped as WAV. Key only via `x-mp-key`; fixed URLs and voice allowlists; text 1–600 characters; friendly errors; loose per-IP cap.
- `src/lib/voice.ts`: device mode picks the friendliest English voice; BYOK mode fetches, caches up to 30 clips in memory, stops previous playback, and falls back to the device voice on any error. Text a kid typed is never sent.
- Grown-up corner "Luna's voice": device / OpenAI / Gemini, a masked saved key, a voice picker, "Hear a sample", "Forget key", and one-tap reuse of a key already saved in Metaphases AI settings.
- Luna's chat stays on the free brain only.

## Acceptance criteria
- [x] Device voice is the default and makes no voice-service request
- [x] A configured key is sent only as `x-mp-key` on `/api/ai/speak`, never echoed or logged (unit)
- [x] Ask Luna's chat never sends a key; kid-typed text never reaches a voice provider (e2e)
- [x] The setup lives behind the parental gate, fits 390×844, and the key field is a password field

## Test plan
Unit: `tests/unit/speak.test.ts` covers validation, provider routing, the WAV header, key leaks, kid-typed detection and device-voice picking. E2E: `tests/e2e/kids-voice.spec.ts` covers default device voice, OpenAI setup, read-aloud and sample using the key, chat staying keyless, typed-text fallback and forgetting the key.

## Out of scope
Server-side voice caching, voices for the grown-up site, a free hosted neural voice.
