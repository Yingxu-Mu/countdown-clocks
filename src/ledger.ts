import { MAX_DURATION_MS, finiteMs } from './time'
import type { Clock, ClockKind } from './types'

export function freshLedger(): Pick<
  Clock,
  'kind' | 'accruedMs' | 'accruedFrom' | 'successes' | 'failures' | 'attemptOpen'
> {
  return {
    kind: 'accumulate',
    accruedMs: 0,
    accruedFrom: null,
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
  return {
    ...clock,
    accruedMs: Math.max(0, clock.accruedMs) + Math.max(0, end - clock.accruedFrom),
    accruedFrom: null,
  }
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
