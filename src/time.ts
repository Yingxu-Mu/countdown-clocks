import type { Clock } from './types'

export const MAX_DURATION_MS = (99 * 60 * 60 + 59 * 60 + 59) * 1000
export const STARTER_SECONDS = [5 * 60, 25 * 60, 60 * 60, 2 * 60 * 60, 3 * 60 * 60] as const

const QUICK_SET_LIMIT = 6
const RECENT_LIMIT = 8

export function rememberDuration(recentSeconds: readonly number[], durationMs: number): number[] {
  const seconds = Math.round(durationMs / 1000)
  if (!Number.isInteger(seconds) || seconds <= 0 || seconds > MAX_DURATION_MS / 1000) {
    return [...recentSeconds]
  }
  return [seconds, ...recentSeconds.filter((item) => item !== seconds)].slice(0, RECENT_LIMIT)
}

export function quickSetSeconds(recentSeconds: readonly number[]): number[] {
  const picked: number[] = []
  const seen = new Set<number>()
  for (const seconds of [...recentSeconds, ...STARTER_SECONDS]) {
    if (!Number.isInteger(seconds) || seconds <= 0 || seen.has(seconds)) continue
    seen.add(seconds)
    picked.push(seconds)
    if (picked.length === QUICK_SET_LIMIT) break
  }
  return picked
}

export function displayRemaining(clock: Clock, now: number): number {
  if (clock.status === 'done') return 0
  if (clock.status !== 'running' || clock.endsAt == null) return clock.remainingMs
  return Math.max(0, clock.endsAt - now)
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000)
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
