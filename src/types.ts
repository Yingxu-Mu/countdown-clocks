export const THEMES = [
  { id: 'paper', label: 'Paper', note: 'Warm ink on cream' },
  { id: 'signal', label: 'Signal', note: 'Acid type on a night grid' },
  { id: 'tide', label: 'Tide', note: 'Sea glass and soft corners' },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export type ClockStatus = 'running' | 'paused' | 'done'

export type Clock = {
  id: string
  label: string
  durationMs: number
  remainingMs: number
  endsAt: number | null
  status: ClockStatus
}

export type Settings = {
  theme: ThemeId
  sound: boolean
  recentSeconds: number[]
}

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value)
}
