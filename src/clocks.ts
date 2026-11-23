import { noteDone, notePause } from './ledger'
import { MAX_DURATION_MS, finiteMs } from './time'
import type { Clock } from './types'

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `clock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// "Clock 1", "Clock 2", … skipping any label the user has already kept,
// including ones they renamed onto those words.
export function nextLabel(clocks: readonly Clock[]): string {
  const used = new Set(clocks.map((clock) => clock.label))
  let index = 1
  while (used.has(`Clock ${index}`)) index += 1
  return `Clock ${index}`
}

// Close clocks whose deadline passed while the tab was in the background or
// between the 100ms ticks. Returns the same array when nothing changed so
// React can skip the render.
//
// A stopwatch that reaches 99:59:59 is paused, not marked done, and it does
// not chime. A countdown whose `endsAt` has passed is the only path that
// counts an Unbroken success, and only when that run had focus on. The finish
// sound plays afterwards.
export function settleClocks(clocks: readonly Clock[], now: number): Clock[] {
  let changed = false
  const next = clocks.map((clock) => {
    if (clock.mode === 'up' && clock.status === 'running' && clock.runStartedAt != null) {
      const elapsed = finiteMs(clock.elapsedMs) + Math.max(0, now - clock.runStartedAt)
      if (elapsed >= MAX_DURATION_MS) {
        changed = true
        // Bank the ledger at the instant the cap was hit, not at `now`, so a
        // late tick does not add time past 99:59:59.
        const capAt = clock.runStartedAt + Math.max(0, MAX_DURATION_MS - finiteMs(clock.elapsedMs))
        return {
          ...notePause(clock, capAt),
          status: 'paused' as const,
          elapsedMs: MAX_DURATION_MS,
          runStartedAt: null,
        }
      }
    } else if (clock.mode !== 'up' && clock.status === 'running' && clock.endsAt != null && clock.endsAt <= now) {
      changed = true
      return {
        ...noteDone(clock, clock.endsAt),
        status: 'done' as const,
        remainingMs: 0,
        endsAt: null,
      }
    }
    return clock
  })
  return changed ? next : (clocks as Clock[])
}

// The line under "Your clocks": "2 running · 1 paused". Empty sections are
// omitted so a list of fresh clocks does not read "0 done".
export function summarize(clocks: readonly Clock[]): string {
  if (clocks.length === 0) return 'No clocks yet'
  const counts = { running: 0, paused: 0, done: 0 }
  for (const clock of clocks) counts[clock.status] += 1
  const parts: string[] = []
  if (counts.running > 0) parts.push(`${counts.running} running`)
  if (counts.paused > 0) parts.push(`${counts.paused} paused`)
  if (counts.done > 0) parts.push(`${counts.done} done`)
  return parts.join(' · ')
}
