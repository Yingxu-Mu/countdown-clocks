export const THEMES = [
  { id: 'paper', label: 'Paper', note: 'Warm ink on cream' },
  { id: 'signal', label: 'Signal', note: 'Acid type on a night grid' },
  { id: 'tide', label: 'Tide', note: 'Sea glass and soft corners' },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export const SOUNDS = [
  { id: 'bell', label: 'Bell', note: 'A clear strike' },
  { id: 'alarm', label: 'Alarm', note: 'A repeating beep' },
  { id: 'chime', label: 'Chime', note: 'A soft pair of notes' },
  { id: 'off', label: 'Off', note: 'Silent when a clock finishes' },
] as const

export type SoundId = (typeof SOUNDS)[number]['id']

export type ClockStatus = 'running' | 'paused' | 'done'

export type Clock = {
  id: string
  label: string
  icon: string
  durationMs: number
  remainingMs: number
  endsAt: number | null
  status: ClockStatus
}

export type Settings = {
  theme: ThemeId
  sound: SoundId
  recentSeconds: number[]
}

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value)
}

export function isSoundId(value: unknown): value is SoundId {
  return SOUNDS.some((sound) => sound.id === value)
}
