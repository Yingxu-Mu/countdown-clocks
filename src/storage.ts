import { normalizeIcon } from './icons'
import { MAX_DURATION_MS, rememberDuration } from './time'
import { isThemeId, type Clock, type ClockStatus, type Settings } from './types'

const CLOCKS_KEY = 'countdown-clocks.clocks.v1'
const SETTINGS_KEY = 'countdown-clocks.settings.v1'

const DEFAULT_SETTINGS: Settings = { theme: 'paper', sound: true, recentSeconds: [] }

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

  const durationMs = Math.min(MAX_DURATION_MS, Math.max(1000, Math.round(value.durationMs)))
  let remainingMs = Math.min(durationMs, Math.max(0, Math.round(value.remainingMs)))
  let status: ClockStatus = value.status
  let endsAt: number | null =
    typeof value.endsAt === 'number' && Number.isFinite(value.endsAt) ? value.endsAt : null

  if (status === 'running') {
    if (endsAt == null) {
      status = remainingMs <= 0 ? 'done' : 'paused'
    } else if (endsAt <= now) {
      status = 'done'
      remainingMs = 0
      endsAt = null
    } else {
      remainingMs = Math.min(durationMs, endsAt - now)
    }
  } else if (status === 'paused') {
    endsAt = null
    if (remainingMs <= 0) {
      status = 'done'
      remainingMs = 0
    }
  } else {
    status = 'done'
    remainingMs = 0
    endsAt = null
  }

  return {
    id: value.id,
    label: value.label.trim().slice(0, 40) || 'Clock',
    icon: normalizeIcon(value.icon),
    durationMs,
    remainingMs,
    endsAt,
    status,
  }
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
      sound: typeof parsed.sound === 'boolean' ? parsed.sound : DEFAULT_SETTINGS.sound,
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
