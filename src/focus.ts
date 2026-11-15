export const SESSION_GAP_MS = 40 * 60 * 1000
const MIN_RATE_ACTIVE_MS = 5 * 60 * 1000

export type FocusEventType = 'start' | 'pause' | 'resume' | 'stop'

export type FocusEvent = {
  clockId: string
  type: FocusEventType
  at: number
}

export type FocusSummary = {
  sessions: number
  open: boolean
  activeMs: number
  density: number | null
  pauses: number
  pausesPerHour: number | null
  longestMs: number | null
  medianMs: number | null
}

type OpenSession = {
  start: number
  activeMs: number
  pauseCount: number
  stretches: number[]
  runningSince: number | null
  pauseAt: number | null
}

type Session = OpenSession & {
  end: number
  open: boolean
}

export function lastFocusEvent(events: readonly FocusEvent[], clockId: string): FocusEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].clockId === clockId) return events[index]
  }
  return undefined
}

export function recordPause(events: readonly FocusEvent[], clockId: string, at: number): FocusEvent[] {
  const last = lastFocusEvent(events, clockId)
  if (!last || (last.type !== 'start' && last.type !== 'resume')) return events as FocusEvent[]
  return [...events, { clockId, type: 'pause', at }]
}

export function recordRun(events: readonly FocusEvent[], clockId: string, at: number): FocusEvent[] {
  const last = lastFocusEvent(events, clockId)
  if (!last || last.type === 'stop') return [...events, { clockId, type: 'start', at }]
  if (last.type !== 'pause') return events as FocusEvent[]
  const type: FocusEventType = at - last.at > SESSION_GAP_MS ? 'start' : 'resume'
  return [...events, { clockId, type, at }]
}

export function recordStop(events: readonly FocusEvent[], clockId: string, at: number): FocusEvent[] {
  const last = lastFocusEvent(events, clockId)
  if (!last || last.type === 'stop') return events as FocusEvent[]
  if (last.type === 'pause' && at - last.at > SESSION_GAP_MS) return events as FocusEvent[]
  return [...events, { clockId, type: 'stop', at }]
}

export function recordRestart(events: readonly FocusEvent[], clockId: string, at: number): FocusEvent[] {
  return recordRun(recordStop(events, clockId, at), clockId, at)
}

export function withoutClockEvents(events: readonly FocusEvent[], clockId: string): FocusEvent[] {
  if (!events.some((event) => event.clockId === clockId)) return events as FocusEvent[]
  return events.filter((event) => event.clockId !== clockId)
}

export function summarizeFocus(events: readonly FocusEvent[], clockId: string, now: number): FocusSummary | null {
  const sessions = sessionsFor(events, clockId, now)
  if (sessions.length === 0) return null

  let activeMs = 0
  let elapsedMs = 0
  let pauses = 0
  let open = false
  const stretches: number[] = []
  for (const session of sessions) {
    activeMs += session.activeMs
    elapsedMs += Math.max(0, session.end - session.start)
    pauses += session.pauseCount
    stretches.push(...session.stretches.filter((stretch) => stretch > 0))
    if (session.open) open = true
  }

  return {
    sessions: sessions.length,
    open,
    activeMs,
    density: elapsedMs > 0 ? activeMs / elapsedMs : null,
    pauses,
    pausesPerHour: activeMs >= MIN_RATE_ACTIVE_MS ? pauses / (activeMs / 3_600_000) : null,
    longestMs: stretches.length > 0 ? Math.max(...stretches) : null,
    medianMs: median(stretches),
  }
}

function sessionsFor(events: readonly FocusEvent[], clockId: string, now: number): Session[] {
  const ordered = events
    .map((event, index) => ({ event, index }))
    .filter((item) => item.event.clockId === clockId)
    .sort((a, b) => a.event.at - b.event.at || a.index - b.index)
    .map((item) => item.event)

  const sessions: Session[] = []
  let open: OpenSession | null = null

  const finish = (end: number, live: boolean) => {
    if (!open) return
    const session = closeSession(open, end, live)
    open = null
    if (live || session.end > session.start || session.activeMs > 0) sessions.push(session)
  }

  for (const event of ordered) {
    if (!open) {
      if (event.type === 'start' || event.type === 'resume') open = blankSession(event.at)
      continue
    }
    if (event.type === 'start') {
      finish(open.pauseAt ?? event.at, false)
      open = blankSession(event.at)
      continue
    }
    if (event.type === 'pause') {
      if (open.runningSince != null) {
        const stretch = Math.max(0, event.at - open.runningSince)
        open = {
          ...open,
          stretches: [...open.stretches, stretch],
          activeMs: open.activeMs + stretch,
          runningSince: null,
          pauseAt: event.at,
          pauseCount: open.pauseCount + 1,
        }
      }
      continue
    }
    if (event.type === 'resume') {
      if (open.pauseAt != null && event.at - open.pauseAt > SESSION_GAP_MS) {
        finish(open.pauseAt, false)
        open = blankSession(event.at)
      } else if (open.runningSince == null) {
        open = { ...open, runningSince: event.at, pauseAt: null }
      }
      continue
    }
    const endedByGap = open.pauseAt != null && event.at - open.pauseAt > SESSION_GAP_MS
    finish(endedByGap ? open.pauseAt! : event.at, false)
  }

  if (open) {
    if (open.pauseAt != null && now - open.pauseAt > SESSION_GAP_MS) finish(open.pauseAt, false)
    else finish(now, true)
  }

  return sessions
}

function blankSession(at: number): OpenSession {
  return { start: at, activeMs: 0, pauseCount: 0, stretches: [], runningSince: at, pauseAt: null }
}

function closeSession(open: OpenSession, end: number, live: boolean): Session {
  let activeMs = open.activeMs
  let stretches = open.stretches
  if (open.runningSince != null) {
    const stretch = Math.max(0, end - open.runningSince)
    stretches = [...stretches, stretch]
    activeMs += stretch
  }
  return { ...open, stretches, activeMs, end, open: live }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}
