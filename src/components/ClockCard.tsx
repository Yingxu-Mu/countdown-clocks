import { useEffect, useRef, useState } from 'react'
import type { Clock } from '../types'
import { displayRemaining, formatClock, formatLength } from '../time'

const SIZE = 120
const STROKE = 8
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const CENTER = SIZE / 2

type ClockCardProps = {
  clock: Clock
  now: number
  onPause: () => void
  onResume: () => void
  onRestart: () => void
  onDelete: () => void
}

export function ClockCard({ clock, now, onPause, onResume, onRestart, onDelete }: ClockCardProps) {
  const [armed, setArmed] = useState(false)
  const deleteRef = useRef<HTMLButtonElement>(null)
  const remaining = displayRemaining(clock, now)
  const ratio =
    clock.durationMs === 0 ? 0 : Math.min(1, Math.max(0, remaining / clock.durationMs))
  const urgent = clock.status === 'running' && remaining > 0 && remaining <= 10_000
  const runLabel =
    clock.status === 'running' ? 'Pause' : remaining === clock.durationMs ? 'Start' : 'Resume'
  const statusLabel = urgent ? 'Ending' : clock.status === 'running' ? 'Running' : clock.status === 'paused' ? 'Paused' : 'Done'

  useEffect(() => {
    if (!armed) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setArmed(false)
    }
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && deleteRef.current?.contains(event.target)) return
      setArmed(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [armed])

  function requestDelete() {
    if (!armed) {
      setArmed(true)
      return
    }
    onDelete()
  }

  return (
    <article
      className="card"
      data-status={clock.status}
      data-urgent={urgent ? 'true' : 'false'}
      aria-label={`${clock.label}, ${statusLabel}, ${formatClock(remaining)}`}
    >
      <div className="card-top">
        <h3 className="card-label" title={clock.label}>
          {clock.label}
        </h3>
        <button
          ref={deleteRef}
          type="button"
          className="btn btn-quiet"
          data-armed={armed ? 'true' : 'false'}
          aria-label={armed ? `Confirm delete ${clock.label}` : `Delete ${clock.label}`}
          onClick={requestDelete}
        >
          {armed ? 'Confirm' : 'Delete'}
        </button>
      </div>

      <div className="face" aria-hidden="true">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <circle className="ring-track" cx={CENTER} cy={CENTER} r={RADIUS} strokeWidth={STROKE} />
          <circle
            className="ring-value"
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            strokeWidth={STROKE}
            strokeLinecap={ratio > 0.02 && ratio < 0.985 ? 'round' : 'butt'}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
          />
        </svg>
      </div>

      <div className="readout">
        <p className="time">{formatClock(remaining)}</p>
        <p className="status">
          <span className="dot" aria-hidden="true" />
          {statusLabel}
        </p>
        <p className="length">{formatLength(clock.durationMs)}</p>
      </div>

      <div className="actions">
        {clock.status === 'done' ? (
          <button
            type="button"
            className="btn btn-primary span"
            aria-label={`Restart ${clock.label}`}
            onClick={onRestart}
          >
            Restart
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-primary"
              aria-label={`${runLabel} ${clock.label}`}
              onClick={clock.status === 'running' ? onPause : onResume}
            >
              {runLabel}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              aria-label={`Restart ${clock.label}`}
              onClick={onRestart}
            >
              Restart
            </button>
          </>
        )}
      </div>
    </article>
  )
}
