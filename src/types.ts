// Shared shapes for a clock and the two settings that follow it across reloads.
// A clock is one project card. It keeps a countdown and a stopwatch at the same
// time, plus the ledgers shown on the back of the card.

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

// `done` is only reached by a countdown that hits zero. A stopwatch that hits
// the 99:59:59 cap pauses instead, so it can be resumed after a reset.
export type ClockStatus = 'running' | 'paused' | 'done'

// `down` is the countdown. `up` is the stopwatch. Flipping pauses the face
// that was showing and leaves the other face's time where it was.
export type ClockMode = 'down' | 'up'

// Which back-of-card view is showing. Both ledgers record from the moment the
// clock is created; this field only chooses what the back displays.
export type ClockKind = 'accumulate' | 'continuous'

export type Clock = {
  id: string
  label: string
  // A single emoji, or a data/http URL for an uploaded image.
  icon: string
  mode: ClockMode
  kind: ClockKind
  // The countdown's full length. The stopwatch ring uses this as one lap.
  // Editing a fresh or finished countdown replaces it. Editing a countdown
  // that is already underway only grows it, so a shorter edit cannot shrink
  // the lap out from under a running stopwatch.
  durationMs: number
  // Countdown time left while paused or finished. While running, the live
  // value is `endsAt - now`; this field is the snapshot taken at the last pause.
  remainingMs: number
  // Absolute deadline for a running countdown. Null unless that face is running.
  endsAt: number | null
  // Stopwatch time banked at the last pause or edit. While running, add
  // `now - runStartedAt`. Resetting the stopwatch sets this back to 0.
  // Resetting the countdown does not touch it.
  elapsedMs: number
  // When the current stopwatch run began. Null unless that face is running.
  runStartedAt: number | null
  // Total milliseconds the clock has spent running, in either direction,
  // already closed into the ledger. The open run is added at display time.
  accruedMs: number
  // Start of the open running segment, or null when the clock is not running.
  // Both directions share this, because accumulated time counts either way.
  accruedFrom: number | null
  // Closed running time split by local calendar day (`YYYY-MM-DD`). The open
  // segment is merged in when Today / Yesterday are rendered. Time stored
  // before this map existed stays in `accruedMs` only.
  accruedDays: Record<string, number>
  // Countdowns that ran from their full length to zero with focus on and no
  // pause, reset, time edit, or flip to the stopwatch.
  successes: number
  // Those same attempts that were interrupted before zero.
  failures: number
  // True while a focused, full-length countdown is in progress and still
  // eligible to become a success. Count-up never opens an attempt, and a
  // countdown started with focus off never does either.
  attemptOpen: boolean
  // When on, the next full countdown can become an Unbroken success or
  // failure. When off, countdowns still run and still add to Accumulate,
  // but they leave the Unbroken counters alone. Turning it off mid-attempt
  // drops that attempt without counting it.
  focus: boolean
  status: ClockStatus
}

export type Settings = {
  theme: ThemeId
  sound: SoundId
  // Whole seconds of durations the user has set, newest first. The quick-set
  // buttons that used to read this were removed; the list is still stored.
  recentSeconds: number[]
}

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value)
}

export function isSoundId(value: unknown): value is SoundId {
  return SOUNDS.some((sound) => sound.id === value)
}
