import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Clock } from '../types'
import { displayRemaining, formatClock, formatLength } from '../time'
import { ClockIcon } from './ClockIcon'
import { IconChooser } from './IconChooser'

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
  onIconChange: (icon: string) => void
  onTitleChange: (label: string) => void
  dragging: boolean
  dragStyle?: CSSProperties
  onReorderPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onReorderPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onReorderPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onReorderKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void
}

export function ClockCard({
  clock,
  now,
  onPause,
  onResume,
  onRestart,
  onDelete,
  onIconChange,
  onTitleChange,
  dragging,
  dragStyle,
  onReorderPointerDown,
  onReorderPointerMove,
  onReorderPointerUp,
  onReorderKeyDown,
}: ClockCardProps) {
  const [editingIcon, setEditingIcon] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(clock.label)
  const cancelTitle = useRef(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const remaining = displayRemaining(clock, now)
  const ratio =
    clock.durationMs === 0 ? 0 : Math.min(1, Math.max(0, remaining / clock.durationMs))
  const urgent = clock.status === 'running' && remaining > 0 && remaining <= 10_000
  const runLabel =
    clock.status === 'running' ? 'Pause' : remaining === clock.durationMs ? 'Start' : 'Resume'
  const statusLabel = urgent ? 'Ending' : clock.status === 'running' ? 'Running' : clock.status === 'paused' ? 'Paused' : 'Done'

  useEffect(() => {
    if (!editingIcon) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEditingIcon(false)
    }
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && editorRef.current?.contains(event.target)) return
      setEditingIcon(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [editingIcon])

  function commitTitle() {
    if (cancelTitle.current) {
      cancelTitle.current = false
      return
    }
    const next = titleDraft.trim().slice(0, 40)
    setEditingTitle(false)
    if (next && next !== clock.label) onTitleChange(next)
    else setTitleDraft(clock.label)
  }

  return (
    <article
      className="card"
      data-status={clock.status}
      data-urgent={urgent ? 'true' : 'false'}
      data-dragging={dragging ? 'true' : 'false'}
      style={dragStyle}
      aria-label={`${clock.label}, ${statusLabel}, ${formatClock(remaining)}`}
    >
      <div className="card-top">
        <button
          type="button"
          className="reorder"
          aria-label={`Reorder ${clock.label}`}
          title="Drag to reorder"
          onPointerDown={onReorderPointerDown}
          onPointerMove={onReorderPointerMove}
          onPointerUp={onReorderPointerUp}
          onPointerCancel={onReorderPointerUp}
          onKeyDown={onReorderKeyDown}
        >
          <span className="reorder-grip" aria-hidden="true" />
        </button>
        <div className="card-heading">
          <div className="icon-editor" ref={editorRef}>
            <button
              type="button"
              className="icon-edit"
              aria-expanded={editingIcon}
              aria-label={`Change icon for ${clock.label}`}
              onClick={() => setEditingIcon((open) => !open)}
            >
              <ClockIcon icon={clock.icon} className="card-icon" />
            </button>
            {editingIcon ? (
              <div className="icon-editor-panel" role="dialog" aria-label={`Icon for ${clock.label}`}>
                <IconChooser
                  icon={clock.icon}
                  showPreview={false}
                  onChange={(icon) => {
                    onIconChange(icon)
                    setEditingIcon(false)
                  }}
                />
              </div>
            ) : null}
          </div>
          <h3 className="card-label">
            {editingTitle ? (
              <input
                className="title-input"
                value={titleDraft}
                maxLength={40}
                aria-label={`Name for ${clock.label}`}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={commitTitle}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commitTitle()
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    cancelTitle.current = true
                    setTitleDraft(clock.label)
                    setEditingTitle(false)
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="title-button"
                title={`Rename ${clock.label}`}
                aria-label={`Rename ${clock.label}`}
                onClick={() => {
                  setTitleDraft(clock.label)
                  setEditingTitle(true)
                }}
              >
                {clock.label}
              </button>
            )}
          </h3>
        </div>
        <button type="button" className="btn btn-quiet" aria-label={`Delete ${clock.label}`} onClick={onDelete}>
          Delete
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
