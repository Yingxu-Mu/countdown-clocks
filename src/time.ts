import type { Clock } from './types'

export const MAX_DURATION_MS = (99 * 60 * 60 + 59 * 60 + 59) * 1000

export function finiteMs(ms: number): number {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return 0
  return Math.min(MAX_DURATION_MS, Math.max(0, ms))
}

const RECENT_LIMIT = 8

export function rememberDuration(recentSeconds: readonly number[], durationMs: number): number[] {
  const seconds = Math.round(durationMs / 1000)
  if (!Number.isInteger(seconds) || seconds <= 0 || seconds > MAX_DURATION_MS / 1000) {
    return [...recentSeconds]
  }
  return [seconds, ...recentSeconds.filter((item) => item !== seconds)].slice(0, RECENT_LIMIT)
}

export function displayRemaining(clock: Clock, now: number): number {
  if (clock.status === 'done') return 0
  if (clock.status !== 'running' || clock.endsAt == null || !Number.isFinite(clock.endsAt)) {
    return finiteMs(clock.remainingMs)
  }
  return finiteMs(clock.endsAt - now)
}

export function displayElapsed(clock: Clock, now: number): number {
  const elapsedMs = finiteMs(clock.elapsedMs)
  if (clock.status !== 'running' || clock.runStartedAt == null || !Number.isFinite(clock.runStartedAt)) {
    return elapsedMs
  }
  return Math.min(MAX_DURATION_MS, elapsedMs + Math.max(0, now - clock.runStartedAt))
}

export function displayClock(clock: Clock, now: number): number {
  return clock.mode === 'up' ? displayElapsed(clock, now) : displayRemaining(clock, now)
}

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

export function formatLength(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours} hr`)
  if (minutes > 0) parts.push(`${minutes} min`)
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds} sec`)
  return parts.join(' ')
}
