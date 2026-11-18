import { displayAccrued, priorDay, todayAccrued } from '../ledger'
import { formatKept } from '../time'
import type { Clock, ClockKind } from '../types'
import { ClockIcon } from './ClockIcon'

type ClockBackProps = {
  clock: Clock
  now: number
  onKind: (kind: ClockKind) => void
  onTurn: () => void
  onDelete: () => void
}

export function ClockBack({ clock, now, onKind, onTurn, onDelete }: ClockBackProps) {
  const unbroken = clock.kind === 'continuous'
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
          <TurnButton label={`Show the clock for ${clock.label}`} pressed onClick={onTurn} />
          <button type="button" className="btn btn-quiet" aria-label={`Delete ${clock.label}`} onClick={onDelete}>
            Delete
          </button>
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
                ? 'A countdown counts only when it reaches the end without a pause.'
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
