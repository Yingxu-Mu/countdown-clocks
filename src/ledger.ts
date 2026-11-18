import { MAX_DURATION_MS, finiteMs } from './time'
import type { Clock, ClockKind } from './types'

export function freshLedger(): Pick<
  Clock,
  'kind' | 'accruedMs' | 'accruedFrom' | 'accruedDays' | 'successes' | 'failures' | 'attemptOpen'
> {
  return {
    kind: 'accumulate',
    accruedMs: 0,
    accruedFrom: null,
    accruedDays: {},
    successes: 0,
    failures: 0,
    attemptOpen: false,
  }
}

function segmentEnd(clock: Clock, now: number): number {
  if (clock.mode !== 'up' && clock.endsAt != null) return Math.min(now, clock.endsAt)
  if (clock.mode === 'up' && clock.runStartedAt != null) {
    const room = MAX_DURATION_MS - finiteMs(clock.elapsedMs)
    return Math.min(now, clock.runStartedAt + Math.max(0, room))
  }
  return now
}

export function displayAccrued(clock: Clock, now: number): number {
  const accruedMs = Math.max(0, clock.accruedMs)
  if (clock.status !== 'running' || clock.accruedFrom == null) return accruedMs
  return accruedMs + Math.max(0, segmentEnd(clock, now) - clock.accruedFrom)
}

function bank(clock: Clock, now: number): Clock {
  if (clock.status !== 'running' || clock.accruedFrom == null) {
    return { ...clock, accruedFrom: null }
  }
  const end = segmentEnd(clock, now)
  const start = clock.accruedFrom
  return {
    ...clock,
    accruedMs: Math.max(0, clock.accruedMs) + Math.max(0, end - start),
    accruedDays: addInterval(clock.accruedDays ?? {}, start, end),
    accruedFrom: null,
  }
}

const DAY_MS_CAP = 36 * 60 * 60 * 1000

function dayKey(ms: number): string {
  const date = new Date(ms)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1)
}

function nextMidnight(ms: number): number {
  const date = new Date(ms)
  date.setHours(24, 0, 0, 0)
  const boundary = date.getTime()
  return boundary > ms ? boundary : ms + 60 * 60 * 1000
}

function addInterval(
  days: Record<string, number>,
  start: number,
  end: number,
): Record<string, number> {
  if (!(end > start) || !Number.isFinite(start) || !Number.isFinite(end)) return days
  const next = { ...days }
  let cursor = start
  for (let guard = 0; cursor < end && guard < 8; guard += 1) {
    const boundary = nextMidnight(cursor)
    const sliceEnd = Math.min(end, boundary)
    const amount = sliceEnd - cursor
    if (amount > 0) {
      const key = dayKey(cursor)
      next[key] = Math.min(DAY_MS_CAP, (next[key] ?? 0) + amount)
    }
    if (sliceEnd <= cursor) break
    cursor = sliceEnd
  }
  return next
}

function liveDays(clock: Clock, now: number): Record<string, number> {
  const stored = clock.accruedDays ?? {}
  if (clock.status !== 'running' || clock.accruedFrom == null) return stored
  return addInterval(stored, clock.accruedFrom, segmentEnd(clock, now))
}

export function todayAccrued(clock: Clock, now: number): number {
  return liveDays(clock, now)[dayKey(now)] ?? 0
}

export function priorDay(clock: Clock, now: number): { label: string; ms: number } {
  const days = liveDays(clock, now)
  const today = dayKey(now)
  const yesterdayDate = new Date(now)
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterday = dayKey(yesterdayDate.getTime())
  const yesterdayMs = days[yesterday] ?? 0
  if (yesterdayMs > 0) return { label: 'Yesterday', ms: yesterdayMs }

  const earlier = Object.keys(days)
    .filter((key) => key < today && (days[key] ?? 0) > 0)
    .sort()
  const last = earlier[earlier.length - 1]
  if (!last) return { label: 'Yesterday', ms: 0 }

  const date = dateFromKey(last)
  const todayDate = dateFromKey(today)
  const diff = Math.round((todayDate.getTime() - date.getTime()) / 86_400_000)
  const when =
    diff > 1 && diff < 7
      ? date.toLocaleDateString(undefined, { weekday: 'long' })
      : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return { label: `Last ${when}`, ms: days[last] ?? 0 }
}

function fail(clock: Clock): Clock {
  if (!clock.attemptOpen) return clock
  return { ...clock, attemptOpen: false, failures: clock.failures + 1 }
}

function succeed(clock: Clock): Clock {
  if (!clock.attemptOpen) return clock
  return { ...clock, attemptOpen: false, successes: clock.successes + 1 }
}

export function noteStart(clock: Clock, now: number): Clock {
  return {
    ...clock,
    accruedFrom: now,
    attemptOpen: fullCountdown(clock) ? true : clock.attemptOpen,
  }
}

export function notePause(clock: Clock, now: number): Clock {
  return fail(bank(clock, now))
}

export function noteReset(clock: Clock, now: number, stillRunning: boolean): Clock {
  const interrupted = clock.status !== 'done' && clock.attemptOpen
  let next = interrupted ? fail(bank(clock, now)) : bank(clock, now)
  if (!stillRunning) return next
  next = { ...next, accruedFrom: now }
  if (clock.mode !== 'up') next = { ...next, attemptOpen: true }
  return next
}

export function noteFlip(clock: Clock, now: number): Clock {
  return fail(bank(clock, now))
}

export function noteEdit(clock: Clock, now: number, stillRunning: boolean): Clock {
  const next = fail(bank(clock, now))
  if (!stillRunning) return next
  return { ...next, accruedFrom: now }
}

export function noteDone(clock: Clock, now: number): Clock {
  const earned = clock.attemptOpen || fullCountdown(clock)
  return succeed(bank({ ...clock, status: 'running', attemptOpen: earned }, now))
}

// The running snapshot still has the original length. If completion forgot to
// count a clean countdown, keep the success anyway.
export function repairUncountedFinish(before: Clock, after: Clock): Clock {
  if (before.mode === 'up' || after.mode === 'up') return after
  if (before.status !== 'running' || after.status !== 'done') return after
  if (after.successes !== before.successes || after.failures !== before.failures) return after
  if (!before.attemptOpen && !fullCountdown(before)) return after
  return { ...after, attemptOpen: false, successes: after.successes + 1 }
}

function fullCountdown(clock: Clock): boolean {
  return clock.mode !== 'up' && clock.remainingMs === clock.durationMs && clock.remainingMs > 0
}

export function noteKind(clock: Clock, kind: ClockKind): Clock {
  if (kind === clock.kind) return clock
  return { ...clock, kind }
}

export function reconcileStored(clock: Clock, now: number, finishedAt: number | null): Clock {
  if (finishedAt != null) {
    const done = noteDone(
      { ...clock, status: 'running', endsAt: finishedAt, mode: 'down' },
      finishedAt,
    )
    return { ...done, accruedFrom: null }
  }
  if (clock.status !== 'running') {
    const closed = clock.attemptOpen ? fail(clock) : clock
    return { ...closed, accruedFrom: null }
  }
  const accruedFrom = clock.accruedFrom ?? now
  if (fullCountdown(clock)) return { ...clock, accruedFrom, attemptOpen: true }
  return { ...clock, accruedFrom }
}
