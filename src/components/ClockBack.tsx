// The back of a project card.
//
// Accumulate is the default view: total running time (both directions), plus
// today and the previous day that actually has time. Unbroken is the other
// view: the rate of focused countdowns that reached zero without a pause,
// reset, edit, or flip. The radio only switches the view. Accumulate records
// every running minute. Unbroken records a countdown only while focus is on.
//
// An open attempt is shown as a provisional success so the rate moves as soon
// as a clean focused run starts, and falls back if that run is interrupted.

import { useEffect, useRef, useState } from 'react'
import { displayAccrued, priorDay, todayAccrued } from '../ledger'
import { formatKept } from '../time'
import type { Clock, ClockKind } from '../types'
import { ClockIcon } from './ClockIcon'

type ClockBackProps = {
  clock: Clock
  now: number
  onKind: (kind: ClockKind) => void
  onFocus: (focus: boolean) => void
  onTurn: () => void
  onDelete: () => void
}

export function ClockBack({ clock, now, onKind, onFocus, onTurn, onDelete }: ClockBackProps) {
  const unbroken = clock.kind === 'continuous'
  // Count the in-progress clean run as a success for the percentage only.
  // The stored `successes` value is not incremented until the countdown ends.
  const live = clock.attemptOpen ? 1 : 0
  const successes = clock.successes + live
  const failures = clock.failures
  const attempts = successes + failures
  const kept = displayAccrued(clock, now)
  const today = todayAccrued(clock, now)
  const prior = priorDay(clock, now)

  return (
    <div className="card card-face card-back">
      <div className="card-top">
        <div className="card-heading">
          <ClockIcon icon={clock.icon} className="card-icon" />
          <h3 className="card-label">{clock.label}</h3>
        </div>
        <div className="card-tools">
          <FocusToggle label={clock.label} pressed={clock.focus} onChange={onFocus} />
          <TurnButton label={`Show the clock for ${clock.label}`} pressed onClick={onTurn} />
          <DeleteButton label={clock.label} onDelete={onDelete} />
        </div>
      </div>

      <div className="insight">
        <div className="segment insight-kind" role="radiogroup" aria-label={`How ${clock.label} keeps time`}>
          <button
            type="button"
            role="radio"
            aria-checked={!unbroken}
            onClick={() => onKind('accumulate')}
          >
            Accumulate
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={unbroken}
            onClick={() => onKind('continuous')}
          >
            Unbroken
          </button>
        </div>

        {unbroken ? (
          <>
            <div className="rates">
              <div>
                <p className="insight-value">{rateLabel(successes, attempts)}</p>
                <p className="insight-caption">Success</p>
              </div>
              <div>
                <p className="insight-value">{rateLabel(failures, attempts)}</p>
                <p className="insight-caption">Failure</p>
              </div>
            </div>
            <p className="insight-note">
              {attempts === 0
                ? 'A countdown counts when focus is on and it reaches the end without a pause.'
                : clock.attemptOpen && clock.successes + clock.failures === 0
                  ? 'This run is still going.'
                  : clock.attemptOpen
                    ? `${clock.successes} completed · ${clock.failures} stopped · this run is still going`
                    : `${clock.successes} completed · ${clock.failures} stopped`}
            </p>
          </>
        ) : (
          <>
            <div className="kept">
              <p className="insight-value">{formatKept(kept)}</p>
              <p className="insight-caption">Total time</p>
            </div>
            <div className="kept-days">
              <div className="kept kept-prior">
                <p className="insight-prior-value">{formatKept(today)}</p>
                <p className="insight-caption">Today</p>
              </div>
              <div className="kept kept-prior">
                <p className="insight-prior-value">{formatKept(prior.ms)}</p>
                <p className="insight-caption">{prior.label}</p>
              </div>
            </div>
            <p className="insight-note">Every minute the clock is running, in either direction.</p>
          </>
        )}
      </div>
    </div>
  )
}

// First click arms the button. It stays armed until a second click deletes
// the project, Escape cancels, or a press lands somewhere else.
export function DeleteButton({ label, onDelete }: { label: string; onDelete: () => void }) {
  const [armed, setArmed] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!armed) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setArmed(false)
    }
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) return
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
    <button
      ref={ref}
      type="button"
      className="btn btn-quiet"
      data-armed={armed ? 'true' : 'false'}
      aria-label={armed ? `Confirm delete ${label}` : `Delete ${label}`}
      onClick={requestDelete}
    >
      {armed ? 'Confirm' : 'Delete'}
    </button>
  )
}

// Checkbox for focus mode. Checked runs can become Unbroken successes or
// failures. Unchecked countdowns keep their time on Accumulate and stay out
// of the Unbroken rate.
export function FocusToggle({
  label,
  pressed,
  onChange,
}: {
  label: string
  pressed: boolean
  onChange: (focus: boolean) => void
}) {
  return (
    <button
      type="button"
      className="focus-toggle"
      role="checkbox"
      aria-checked={pressed}
      aria-label={`Focus mode for ${label}`}
      title={pressed ? 'Focus on' : 'Focus off'}
      onClick={() => onChange(!pressed)}
    >
      <svg className="focus-icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect
          x="4.5"
          y="4.5"
          width="15"
          height="15"
          rx="3"
          fill={pressed ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.7"
        />
        {pressed ? (
          <path
            d="M7.6 12.2l2.9 2.9 6-6.4"
            fill="none"
            stroke="var(--on-accent)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </svg>
    </button>
  )
}

// Same control on both faces. The mark is an itemized list (three bullets and
// three lines), distinct from the circular-arrow button that flips countdown
// and stopwatch.
export function TurnButton({
  label,
  pressed = false,
  onClick,
}: {
  label: string
  pressed?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className="turn-card" aria-pressed={pressed} aria-label={label} onClick={onClick}>
      <svg className="turn-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="5.5" cy="7" r="1.35" fill="currentColor" />
        <circle cx="5.5" cy="12" r="1.35" fill="currentColor" />
        <circle cx="5.5" cy="17" r="1.35" fill="currentColor" />
        <path
          d="M9.5 7H19.5M9.5 12H19.5M9.5 17H19.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    </button>
  )
}

function rateLabel(count: number, attempts: number): string {
  if (attempts === 0) return '—'
  return `${Math.round((count / attempts) * 100)}%`
}
