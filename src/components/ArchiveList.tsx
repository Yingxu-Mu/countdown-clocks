// Filed projects. Collapsed until opened, so finished clocks stay out of the
// working grid while their ledgers remain readable. Newest archive first.
// Restore returns a project to the end of the working grid, still paused.

import { useState } from 'react'
import { displayAccrued, priorDay, todayAccrued } from '../ledger'
import { formatKept } from '../time'
import type { Clock } from '../types'
import { DeleteButton } from './ClockBack'
import { ClockIcon } from './ClockIcon'

type ArchiveSectionProps = {
  clocks: Clock[]
  now: number
  onRestore: (id: string) => void
  onDelete: (id: string) => void
}

export function ArchiveSection({ clocks, now, onRestore, onDelete }: ArchiveSectionProps) {
  const [open, setOpen] = useState(false)
  if (clocks.length === 0) return null
  const count = clocks.length === 1 ? '1 project' : `${clocks.length} projects`

  return (
    <section className="archive" aria-labelledby="archive-heading">
      <button
        type="button"
        className="archive-head"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="archive-title">
          <svg className="archive-chevron" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 6.5 15.5 12 9 17.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h2 id="archive-heading">Archive</h2>
        </span>
        <span className="summary">{count}</span>
      </button>
      {open ? (
        <ul className="archive-list">
          {clocks.map((clock) => (
            <li key={clock.id}>
              <ArchiveRow clock={clock} now={now} onRestore={() => onRestore(clock.id)} onDelete={() => onDelete(clock.id)} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function ArchiveRow({
  clock,
  now,
  onRestore,
  onDelete,
}: {
  clock: Clock
  now: number
  onRestore: () => void
  onDelete: () => void
}) {
  const attempts = clock.successes + clock.failures
  const rate = attempts === 0 ? null : Math.round((clock.successes / attempts) * 100)
  const prior = priorDay(clock, now)

  return (
    <article className="archive-row" aria-label={`${clock.label}, archived`}>
      <ClockIcon icon={clock.icon} className="card-icon" />
      <div className="archive-copy">
        <h3 className="archive-name">{clock.label}</h3>
        <p className="archive-meta">
          {formatKept(displayAccrued(clock, now))} kept
          {rate == null ? '' : ` · ${rate}% unbroken`}
        </p>
        <p className="archive-meta">
          Today {formatKept(todayAccrued(clock, now))} · {prior.label} {formatKept(prior.ms)}
        </p>
        {attempts > 0 ? (
          <p className="archive-meta">
            {clock.successes} completed · {clock.failures} stopped
          </p>
        ) : null}
      </div>
      <div className="archive-actions">
        <button type="button" className="btn btn-quiet" aria-label={`Restore ${clock.label}`} onClick={onRestore}>
          Restore
        </button>
        <DeleteButton label={clock.label} onDelete={onDelete} />
      </div>
    </article>
  )
}
