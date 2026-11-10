import type { Clock } from './types'

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `clock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function nextLabel(clocks: readonly Clock[]): string {
  const used = new Set(clocks.map((clock) => clock.label))
  let index = 1
  while (used.has(`Clock ${index}`)) index += 1
  return `Clock ${index}`
}

export function settleClocks(clocks: readonly Clock[], now: number): Clock[] {
  let changed = false
  const next = clocks.map((clock) => {
    if (clock.status === 'running' && clock.endsAt != null && clock.endsAt <= now) {
      changed = true
      return { ...clock, status: 'done' as const, remainingMs: 0, endsAt: null }
    }
    return clock
  })
  return changed ? next : (clocks as Clock[])
}

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
