import { MAX_DURATION_MS, finiteMs } from './time'
import type { Clock, ClockKind } from './types'

// Both ledgers start empty. `kind` is only the view on the back of the card:
// Accumulate shows the time totals, Unbroken shows the success rate. Accumulate
// records every running minute. Unbroken records a countdown only while focus
// is on.

export function freshLedger(): Pick<
  Clock,
  'kind' | 'accruedMs' | 'accruedFrom' | 'accruedDays' | 'successes' | 'failures' | 'attemptOpen' | 'focus'
> {
  return {
    kind: 'accumulate',
    accruedMs: 0,
    accruedFrom: null,
    accruedDays: {},
    successes: 0,
    failures: 0,
    attemptOpen: false,
    focus: true,
  }
}

// Where the open running segment should stop being counted.
// A countdown cannot accrue past its deadline. A stopwatch cannot accrue past
// the 99:59:59 cap. Anything else counts up to `now`.
function segmentEnd(clock: Clock, now: number): number {
  if (clock.mode !== 'up' && clock.endsAt != null) return Math.min(now, clock.endsAt)
  if (clock.mode === 'up' && clock.runStartedAt != null) {
    const room = MAX_DURATION_MS - finiteMs(clock.elapsedMs)
    return Math.min(now, clock.runStartedAt + Math.max(0, room))
  }
  return now
}

// Total running time, including the segment that is still open. This can be
// larger than the sum of `accruedDays` because time saved before day keys
// existed has no day attached.
export function displayAccrued(clock: Clock, now: number): number {
  const accruedMs = Math.max(0, clock.accruedMs)
  if (clock.status !== 'running' || clock.accruedFrom == null) return accruedMs
  return accruedMs + Math.max(0, segmentEnd(clock, now) - clock.accruedFrom)
}

// Close the open segment into `accruedMs` and into the per-day map, then clear
// `accruedFrom`. Safe to call when nothing is open; it just clears the marker.
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

// A single calendar day is capped so a corrupted timestamp cannot paint
// "36 hours" as a normal work day. The cap is above 24h to survive DST and a
// clock change without dropping a real session.
const DAY_MS_CAP = 36 * 60 * 60 * 1000

// Local calendar day, not UTC. "Yesterday" follows the machine's midnight.
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

// The next local midnight after `ms`. `setHours(24, 0, 0, 0)` rolls the date
// forward. If that somehow does not move (a bad date), jump an hour so the
// slice loop below cannot spin.
function nextMidnight(ms: number): number {
  const date = new Date(ms)
  date.setHours(24, 0, 0, 0)
  const boundary = date.getTime()
  return boundary > ms ? boundary : ms + 60 * 60 * 1000
}

// Add the half-open interval [start, end) to the day map, splitting anywhere
// it crosses local midnight. A segment is at most ~99 hours, so 8 slices is
// a hard stop rather than a limit the user can hit.
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

// Stored days plus the open segment, so Today updates while the clock runs
// and a session that started yesterday already shows on Yesterday before pause.
function liveDays(clock: Clock, now: number): Record<string, number> {
  const stored = clock.accruedDays ?? {}
  if (clock.status !== 'running' || clock.accruedFrom == null) return stored
  return addInterval(stored, clock.accruedFrom, segmentEnd(clock, now))
}

export function todayAccrued(clock: Clock, now: number): number {
  return liveDays(clock, now)[dayKey(now)] ?? 0
}

// The second day line under the total.
// Yesterday wins whenever that calendar day has time. Otherwise the latest
// earlier day that has time is shown as "Last Friday" (2–6 days ago) or
// "Last Nov 14". A clock with no earlier work still says "Yesterday" and 0,
// so the line does not disappear on a brand-new project.
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
  // Compare local midnights and round, so a DST shift still lands on the
  // calendar day instead of off-by-one from a raw 24h subtraction.
  const diff = Math.round((todayDate.getTime() - date.getTime()) / 86_400_000)
  const when =
    diff > 1 && diff < 7
      ? date.toLocaleDateString(undefined, { weekday: 'long' })
      : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return { label: `Last ${when}`, ms: days[last] ?? 0 }
}

// --- Unbroken attempts -------------------------------------------------------
//
// A success is one focused countdown that starts at its full length and reaches
// zero without a pause, reset, time edit, or flip to the stopwatch. Stopping
// early is a failure. The stopwatch never creates a success: it has no natural
// end except the 99h cap, which only pauses. A countdown with focus off never
// opens an attempt, so it can neither succeed nor fail.
//
// An attempt opens in `noteStart` when focus is on and the countdown being
// started still has `remainingMs === durationMs`. Editing the time before the
// first start does not fail, because no attempt is open yet. Turning focus off
// drops an open attempt without counting it.

function fail(clock: Clock): Clock {
  if (!clock.attemptOpen) return clock
  return { ...clock, attemptOpen: false, failures: clock.failures + 1 }
}

function succeed(clock: Clock): Clock {
  if (!clock.attemptOpen) return clock
  return { ...clock, attemptOpen: false, successes: clock.successes + 1 }
}

// A countdown that has not been shortened, paused, or partly consumed.
function fullCountdown(clock: Clock): boolean {
  return clock.mode !== 'up' && clock.remainingMs === clock.durationMs && clock.remainingMs > 0
}

// The only shape that may open an Unbroken attempt: focus on, and a countdown
// that is still showing its full length.
function focusAttempt(clock: Clock): boolean {
  return clock.focus && fullCountdown(clock)
}

// Begin a running segment. Opens an Unbroken attempt only for a focused full
// countdown. A stopwatch start, a countdown with focus off, or resuming a
// countdown that is already part-way keeps whatever attempt flag was already
// there (normally false).
export function noteStart(clock: Clock, now: number): Clock {
  return {
    ...clock,
    accruedFrom: now,
    attemptOpen: focusAttempt(clock) ? true : clock.attemptOpen,
  }
}

// Pause banks the open segment and fails an open attempt.
export function notePause(clock: Clock, now: number): Clock {
  return fail(bank(clock, now))
}

// Reset banks time and fails an open attempt.
// `stillRunning` means the reset is restarting the same face immediately
// (the button was pressed while the clock was running). A focused countdown
// restart opens a new attempt because reset puts it back on its full length.
// A stopwatch restart, or a countdown with focus off, does not. A reset while
// paused or done only closes the books.
export function noteReset(clock: Clock, now: number, stillRunning: boolean): Clock {
  const interrupted = clock.status !== 'done' && clock.attemptOpen
  let next = interrupted ? fail(bank(clock, now)) : bank(clock, now)
  if (!stillRunning) return next
  next = { ...next, accruedFrom: now }
  if (clock.focus && clock.mode !== 'up') next = { ...next, attemptOpen: true }
  return next
}

// Switching between countdown and stopwatch pauses the current face. An open
// attempt dies here, because the countdown did not reach zero on its own.
export function noteFlip(clock: Clock, now: number): Clock {
  return fail(bank(clock, now))
}

// Editing the dial banks the open segment and fails an open attempt. If the
// clock stays running, a new segment starts at `now` but the attempt stays
// closed: the edit itself broke the uninterrupted run.
export function noteEdit(clock: Clock, now: number, stillRunning: boolean): Clock {
  const next = fail(bank(clock, now))
  if (!stillRunning) return next
  return { ...next, accruedFrom: now }
}

// Natural expiry of a countdown. Counts a success when focus is on and an
// attempt was open, and also when focus is on and the snapshot is still a full
// countdown. The second case covers a finish whose start note was lost (for
// example a stale timer closure) so the first clean focused run is not dropped.
// `attemptOpen` is forced on before `succeed` so that fallback actually
// increments. Focus off never earns a success.
export function noteDone(clock: Clock, now: number): Clock {
  const earned = clock.focus && (clock.attemptOpen || fullCountdown(clock))
  return succeed(bank({ ...clock, status: 'running', attemptOpen: earned }, now))
}

// Safety net used by App after a render. If a focused countdown went from
// running to done and neither successes nor failures moved, the completion
// path forgot to count a clean run. Add the success. Manual zero is excluded
// by the caller, which seeds `finishedIds` before committing that edit.
export function repairUncountedFinish(before: Clock, after: Clock): Clock {
  if (before.mode === 'up' || after.mode === 'up') return after
  if (before.status !== 'running' || after.status !== 'done') return after
  if (after.successes !== before.successes || after.failures !== before.failures) return after
  if (!before.focus) return after
  if (!before.attemptOpen && !fullCountdown(before)) return after
  return { ...after, attemptOpen: false, successes: after.successes + 1 }
}

// Focus is the gate on Unbroken. Turning it on does not adopt a run that has
// already started; the next full countdown start is what opens an attempt.
// Turning it off drops an open attempt without a success or a failure, and
// the clock keeps running.
export function noteFocus(clock: Clock, focus: boolean): Clock {
  if (clock.focus === focus) return clock
  if (!focus) return { ...clock, focus: false, attemptOpen: false }
  return { ...clock, focus: true }
}

// Switching Accumulate / Unbroken is a view change only. Totals and the
// attempt counters are left alone.
export function noteKind(clock: Clock, kind: ClockKind): Clock {
  if (kind === clock.kind) return clock
  return { ...clock, kind }
}

// Finish reconciling a clock just loaded from storage.
// `finishedAt` is set when a countdown's deadline passed while the tab was
// closed; that still counts as a real finish when focus is on. A paused clock
// that still had an attempt open is a failure. A running focused full
// countdown is armed again so the reload itself is not an interruption.
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
  if (clock.focus && fullCountdown(clock)) return { ...clock, accruedFrom, attemptOpen: true }
  return { ...clock, accruedFrom }
}
