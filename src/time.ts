import type { Clock } from './types'

// The wheels only go to 99:59:59. Anything past that is clamped, and a running
// stopwatch pauses at this cap instead of wrapping or chiming.
export const MAX_DURATION_MS = (99 * 60 * 60 + 59 * 60 + 59) * 1000

// Drop NaN / Infinity and keep every stored duration inside the wheel range.
export function finiteMs(ms: number): number {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return 0
  return Math.min(MAX_DURATION_MS, Math.max(0, ms))
}

const RECENT_LIMIT = 8

// Move `durationMs` to the front of the recent list and drop duplicates.
// Invalid lengths are ignored so a bad write cannot wipe the list.
export function rememberDuration(recentSeconds: readonly number[], durationMs: number): number[] {
  const seconds = Math.round(durationMs / 1000)
  if (!Number.isInteger(seconds) || seconds <= 0 || seconds > MAX_DURATION_MS / 1000) {
    return [...recentSeconds]
  }
  return [seconds, ...recentSeconds.filter((item) => item !== seconds)].slice(0, RECENT_LIMIT)
}

// Countdown shown on the dial. A running countdown is derived from its
// absolute deadline so a backgrounded tab does not drift. Paused and finished
// clocks use the stored snapshot.
export function displayRemaining(clock: Clock, now: number): number {
  if (clock.status === 'done') return 0
  if (clock.status !== 'running' || clock.endsAt == null || !Number.isFinite(clock.endsAt)) {
    return finiteMs(clock.remainingMs)
  }
  return finiteMs(clock.endsAt - now)
}

// Stopwatch shown on the dial. This is only `elapsedMs` plus the open run.
// It never falls back to the countdown's remaining time or duration, so a
// fresh stopwatch reads 00:00:00 even when the countdown is sitting at 5:00.
export function displayElapsed(clock: Clock, now: number): number {
  const elapsedMs = finiteMs(clock.elapsedMs)
  if (clock.status !== 'running' || clock.runStartedAt == null || !Number.isFinite(clock.runStartedAt)) {
    return elapsedMs
  }
  return Math.min(MAX_DURATION_MS, elapsedMs + Math.max(0, now - clock.runStartedAt))
}

// The face that is currently showing. Callers that need one number for the
// digits, the ring, and the screen-reader label all come through here.
export function displayClock(clock: Clock, now: number): number {
  return clock.mode === 'up' ? displayElapsed(clock, now) : displayRemaining(clock, now)
}

// Countdown rounds up so the last partial second still shows as 1 until the
// deadline. The stopwatch rounds down so it does not claim a second that has
// not finished. Both are zero-padded `HH:MM:SS`.
export function formatClock(ms: number, mode: 'down' | 'up' = 'down'): string {
  const safe = finiteMs(ms)
  const totalSeconds = mode === 'up' ? Math.floor(safe / 1000) : Math.ceil(safe / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}

// Accumulated time on the back of the card. Same layout as the dial, but it
// can grow past 99 hours, so it is not clamped to `MAX_DURATION_MS`.
export function formatKept(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
