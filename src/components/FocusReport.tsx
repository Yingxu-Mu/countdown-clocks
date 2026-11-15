import type { FocusSummary } from '../focus'
import { formatLength } from '../time'

type FocusReportProps = {
  label: string
  summary: FocusSummary | null
}

export function FocusReport({ label, summary }: FocusReportProps) {
  return (
    <section className="focus-report" aria-label={`Focus for ${label}`}>
      {summary ? <Report summary={summary} /> : <p className="focus-note">No sessions yet.</p>}
    </section>
  )
}

function Report({ summary }: { summary: FocusSummary }) {
  const density = summary.density == null ? null : Math.round(summary.density * 100)
  const perHour =
    summary.density != null && summary.density > 0 && summary.density < 0.995
      ? formatLength((60 / summary.density) * 60 * 1000)
      : null
  const pauseLabel = `${summary.pauses} ${summary.pauses === 1 ? 'pause' : 'pauses'}`
  const rate =
    summary.pausesPerHour == null ? null : `${formatRate(summary.pausesPerHour)} per focused hour`
  const sessionLabel = `${summary.sessions} ${summary.sessions === 1 ? 'session' : 'sessions'}`

  return (
    <>
      <p className="focus-stat" title="Active time divided by the time from the first start to the stop.">
        <strong>{density == null ? '—' : `${density}%`}</strong> density
        {perHour ? <span> · {perHour} per focused hour</span> : null}
      </p>
      <p className="focus-stat" title="How often the clock was paused, compared across sessions of different lengths.">
        <strong>{pauseLabel}</strong>
        {rate ? <span> · {rate}</span> : null}
      </p>
      <p className="focus-stat" title="Uninterrupted stretches while the clock was running.">
        {summary.longestMs == null || summary.medianMs == null ? (
          'No stretches yet'
        ) : (
          <>
            <strong>{formatLength(summary.longestMs)}</strong> longest ·{' '}
            <strong>{formatLength(summary.medianMs)}</strong> median
          </>
        )}
      </p>
      <p className="focus-note">
        {sessionLabel} · {formatLength(summary.activeMs)} focused
        {summary.open ? ' · in progress' : ''}
      </p>
    </>
  )
}

function formatRate(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}
