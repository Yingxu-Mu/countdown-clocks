import { normalizeIcon } from './icons'
import { reconcileStored } from './ledger'
import { MAX_DURATION_MS, rememberDuration } from './time'
import { isSoundId, isThemeId, type Clock, type ClockKind, type ClockMode, type ClockStatus, type Settings, type SoundId } from './types'

const CLOCKS_KEY = 'countdown-clocks.clocks.v1'
const SETTINGS_KEY = 'countdown-clocks.settings.v1'

const DEFAULT_SETTINGS: Settings = { theme: 'paper', sound: 'bell', recentSeconds: [] }

function normalizeSound(value: unknown): SoundId {
  if (value === false) return 'off'
  if (isSoundId(value)) return value
  return DEFAULT_SETTINGS.sound
}

function normalizeRecent(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  let recent: number[] = []
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const item = value[index]
    if (typeof item !== 'number' || !Number.isInteger(item)) continue
    recent = rememberDuration(recent, item * 1000)
  }
  return recent
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeClock(value: unknown, now: number): Clock | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || value.id.length === 0 || value.id.length > 80) return null
  if (typeof value.label !== 'string') return null
  if (typeof value.durationMs !== 'number' || !Number.isFinite(value.durationMs)) return null
  if (typeof value.remainingMs !== 'number' || !Number.isFinite(value.remainingMs)) return null
  if (value.status !== 'running' && value.status !== 'paused' && value.status !== 'done') return null

  const mode: ClockMode = value.mode === 'up' ? 'up' : 'down'
  const durationMs = Math.min(MAX_DURATION_MS, Math.max(1000, Math.round(value.durationMs)))
  let remainingMs = Math.min(durationMs, Math.max(0, Math.round(value.remainingMs)))
  let elapsedMs =
    typeof value.elapsedMs === 'number' && Number.isFinite(value.elapsedMs)
      ? Math.min(MAX_DURATION_MS, Math.max(0, Math.round(value.elapsedMs)))
      : 0
  let status: ClockStatus = value.status
  let endsAt: number | null =
    typeof value.endsAt === 'number' && Number.isFinite(value.endsAt) ? value.endsAt : null
  let runStartedAt: number | null =
    typeof value.runStartedAt === 'number' && Number.isFinite(value.runStartedAt) ? value.runStartedAt : null
  const kind: ClockKind = value.kind === 'continuous' ? 'continuous' : 'accumulate'
  const accruedMs = accruedOf(value.accruedMs)
  let accruedFrom =
    typeof value.accruedFrom === 'number' && Number.isFinite(value.accruedFrom) ? value.accruedFrom : null
  let successes = countOf(value.successes)
  let failures = countOf(value.failures)
  let attemptOpen = value.attemptOpen === true
  let finishedAt: number | null = null

  if (mode === 'up') {
    endsAt = null
    if (status === 'running') {
      if (runStartedAt == null) {
        status = 'paused'
      } else {
        const elapsed = elapsedMs + Math.max(0, now - runStartedAt)
        if (elapsed >= MAX_DURATION_MS) {
          status = 'paused'
          elapsedMs = MAX_DURATION_MS
          runStartedAt = null
        }
      }
    } else {
      status = 'paused'
      runStartedAt = null
    }
  } else if (status === 'running') {
    runStartedAt = null
    if (endsAt == null) {
      status = remainingMs <= 0 ? 'done' : 'paused'
    } else if (endsAt <= now) {
      finishedAt = endsAt
      status = 'done'
      remainingMs = 0
      endsAt = null
    } else {
      remainingMs = Math.min(durationMs, endsAt - now)
    }
  } else if (status === 'paused') {
    endsAt = null
    runStartedAt = null
    if (remainingMs <= 0) {
      status = 'done'
      remainingMs = 0
    }
  } else {
    status = 'done'
    remainingMs = 0
    endsAt = null
    runStartedAt = null
  }

  return reconcileStored(
    {
      id: value.id,
      label: value.label.trim().slice(0, 40) || 'Clock',
      icon: normalizeIcon(value.icon),
      mode,
      kind,
      durationMs,
      remainingMs,
      endsAt,
      elapsedMs,
      runStartedAt,
      accruedMs,
      accruedFrom,
      successes,
      failures,
      attemptOpen,
      status,
    },
    now,
    finishedAt,
  )
}

function countOf(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return 0
  return Math.min(value, 1_000_000)
}

function accruedOf(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0
  return Math.min(Math.round(value), 1000 * 60 * 60 * 24 * 365 * 10)
}

export function loadClocks(): Clock[] {
  try {
    const raw = localStorage.getItem(CLOCKS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const now = Date.now()
    return parsed.flatMap((item) => {
      const clock = normalizeClock(item, now)
      return clock ? [clock] : []
    })
  } catch {
    return []
  }
}

export function saveClocks(clocks: readonly Clock[]) {
  try {
    localStorage.setItem(CLOCKS_KEY, JSON.stringify(clocks))
  } catch {
    // Private mode or a full disk can reject storage; the session still runs.
  }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return DEFAULT_SETTINGS
    return {
      theme: isThemeId(parsed.theme) ? parsed.theme : DEFAULT_SETTINGS.theme,
      sound: normalizeSound(parsed.sound),
      recentSeconds: normalizeRecent(parsed.recentSeconds),
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Ignore storage failures and keep the in-memory choice.
  }
}

export function subscribeStorage(onClocks: () => void, onSettings: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === CLOCKS_KEY) onClocks()
    else if (event.key === SETTINGS_KEY) onSettings()
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}
