// The back of a project card.
//
// Accumulate is the default view. Today is the large figure, the previous day
// sits under it, and the total is the smallest. Unbroken is the other view:
// the rate of focused countdowns that reached zero without a pause, reset,
// edit, or flip. The radio only switches the view. Accumulate records every
// running minute. Unbroken records a countdown only while focus is on.
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
  onArchive: () => void
  onTurn: () => void
  onTitleChange: (label: string) => void
}

export function ClockBack({ clock, now, onKind, onArchive, onTurn, onTitleChange }: ClockBackProps) {
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
          <ClockTitle label={clock.label} onChange={onTitleChange} />
        </div>
      </div>

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

      <div className="insight">
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
            <div className="kept kept-today">
              <p className="insight-value">{formatKept(today)}</p>
              <p className="insight-caption">Today</p>
            </div>
            <div className="kept kept-yesterday">
              <p className="insight-mid">{formatKept(prior.ms)}</p>
              <p className="insight-caption">{prior.label}</p>
            </div>
            <div className="kept kept-total">
              <p className="insight-small">{formatKept(kept)}</p>
              <p className="insight-caption">Total time</p>
            </div>
          </>
        )}
      </div>
      <div className="actions">
        <button
          type="button"
          className="btn btn-secondary"
          aria-label={`Show the clock for ${clock.label}`}
          onClick={onTurn}
        >
          Flip
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          aria-label={`Archive ${clock.label}`}
          onClick={onArchive}
        >
          Archive
        </button>
      </div>
    </div>
  )
}

export function ClockTitle({ label, onChange }: { label: string; onChange: (label: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(label)
  const cancel = useRef(false)

  function commit() {
    if (cancel.current) {
      cancel.current = false
      return
    }
    const next = draft.trim().slice(0, 40)
    setEditing(false)
    if (next && next !== label) onChange(next)
    else setDraft(label)
  }

  return (
    <h3 className="card-label">
      {editing ? (
        <input
          className="title-input"
          value={draft}
          maxLength={40}
          aria-label={`Name for ${label}`}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              cancel.current = true
              setDraft(label)
              setEditing(false)
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="title-button"
          title={`Rename ${label}`}
          aria-label={`Rename ${label}`}
          onClick={() => {
            setDraft(label)
            setEditing(true)
          }}
        >
          {label}
        </button>
      )}
    </h3>
  )
}

// First click arms the button. A second click deletes the filed project.
// Escape, or a press anywhere else, cancels it.
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

  return (
    <button
      ref={ref}
      type="button"
      className="btn btn-quiet"
      data-armed={armed ? 'true' : 'false'}
      aria-label={armed ? `Confirm delete ${label}` : `Delete ${label}`}
      onClick={() => {
        if (!armed) {
          setArmed(true)
          return
        }
        onDelete()
      }}
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

// Swaps countdown and stopwatch. The mark is the two circling arrows.
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
      <svg className="flip-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4.5 8.4c2.3-2.5 5.4-3.7 8.4-3.2 2.3.4 4.2 1.7 5.3 3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <path
          d="M15.4 6.4 18.5 8.8 15.6 11.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M19.5 15.6c-2.3 2.5-5.4 3.7-8.4 3.2-2.3-.4-4.2-1.7-5.3-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <path
          d="M8.6 17.6 5.5 15.2 8.4 12.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

function rateLabel(count: number, attempts: number): string {
  if (attempts === 0) return '—'
  return `${Math.round((count / attempts) * 100)}%`
}
