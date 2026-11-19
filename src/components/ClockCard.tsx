// One project card.
//
// The front is the dial: countdown or stopwatch, chosen by the button in the
// middle of the ring. That flip is animated here and applied immediately in
// `onFlip`, so the digits leave the previous face's time at once instead of
// holding it for the length of the animation.
//
// The back (kept time) is a separate 3D turn. Turning the card does not pause
// the clock and does not count as a mode flip. `turned` is local UI state and
// is not saved.
//
// The ring and the digits share one number from `displayClock`. On the
// stopwatch the ring's lap is the countdown's `durationMs` and wraps; the
// digits show the total elapsed, so after Reset they read 00:00:00 while the
// ring starts empty.

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Clock, ClockKind } from '../types'
import { MAX_DURATION_MS, displayClock, formatClock } from '../time'
import { ClockBack, TurnButton } from './ClockBack'
import { ClockIcon } from './ClockIcon'
import { IconChooser } from './IconChooser'
import { NumberWheel } from './NumberWheel'

// The SVG ring is 120px. The CSS face is 148px, and the number wheel is the
// same 148px, so opening the wheel does not change the card height.
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
  onReset: () => void
  onDelete: () => void
  onIconChange: (icon: string) => void
  onTitleChange: (label: string) => void
  onTimeChange: (totalSeconds: number) => void
  onFlip: () => void
  onKind: (kind: ClockKind) => void
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
  onReset,
  onDelete,
  onIconChange,
  onTitleChange,
  onTimeChange,
  onFlip,
  onKind,
  dragging,
  dragStyle,
  onReorderPointerDown,
  onReorderPointerMove,
  onReorderPointerUp,
  onReorderKeyDown,
}: ClockCardProps) {
  const [editingIcon, setEditingIcon] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingPart, setEditingPart] = useState<TimePart | null>(null)
  // `seenMode` lets us notice a countdown/stopwatch swap during render and
  // drop the open wheel before paint. Otherwise one frame would keep showing
  // the previous face's hours, minutes, and seconds.
  const [seenMode, setSeenMode] = useState(clock.mode)
  const countingUp = clock.mode === 'up'
  const [draftParts, setDraftParts] = useState(() => splitTime(clock.remainingMs, countingUp))
  if (clock.mode !== seenMode) {
    setSeenMode(clock.mode)
    setEditingPart(null)
    setDraftParts(splitTime(displayClock(clock, now), countingUp))
  }
  const [titleDraft, setTitleDraft] = useState(clock.label)
  const cancelTitle = useRef(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const faceRef = useRef<HTMLDivElement>(null)
  const timeRef = useRef<HTMLDivElement>(null)
  // Card-turn state. `settled` means the animation finished and the hidden face
  // can ignore pointer events. The front stays in normal flow (visibility
  // hidden when settled) so the card keeps the face height; the back is
  // position:absolute and must not be switched to in-flow.
  const [turned, setTurned] = useState(false)
  const [settled, setSettled] = useState(false)
  const [turning, setTurning] = useState(false)
  const facesRef = useRef<HTMLDivElement>(null)
  const [flipPhase, setFlipPhase] = useState<'out' | 'in' | null>(null)
  const flipTimers = useRef<number[]>([])
  // Set for the commit that follows Reset. A wheel unmount can still emit a
  // scroll-driven onChange in that commit; ignoring it stops the old draft
  // (often the countdown's time) from being written back over the reset.
  const suppressTimeEdit = useRef(false)

  useEffect(() => {
    return () => {
      for (const id of flipTimers.current) window.clearTimeout(id)
    }
  }, [])

  // Cleared after paint, so it covers the reset commit's layout effects and
  // nothing later. A new wheel opened afterwards edits normally.
  useEffect(() => {
    suppressTimeEdit.current = false
  })

  // Disable the transition, snap to the start of the turn, then turn it back
  // on and set the destination on the next frame. Without the double
  // requestAnimationFrame the browser paints the destination immediately and
  // the turn has no animation. Reduced motion skips straight to the back.
  function showBack() {
    const faces = facesRef.current
    if (!faces || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTurning(false)
      setTurned(true)
      setSettled(true)
      return
    }
    faces.style.transition = 'none'
    setSettled(false)
    setTurning(true)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        faces.style.transition = ''
        setTurned(true)
      })
    })
  }

  function showFront() {
    const faces = facesRef.current
    if (!faces || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTurning(false)
      setTurned(false)
      setSettled(false)
      return
    }
    faces.style.transition = 'none'
    setSettled(false)
    setTurning(true)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        faces.style.transition = ''
        setTurned(false)
      })
    })
  }

  // Apply the mode change before the ring animation. Waiting until the "out"
  // animation finished left the countdown digits on screen while the user
  // already thought they were looking at the stopwatch, and a Reset in that
  // window reset the countdown instead of zeroing the stopwatch.
  function flipClock() {
    if (flipPhase) return
    onFlip()
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    for (const id of flipTimers.current) window.clearTimeout(id)
    flipTimers.current = []
    setFlipPhase('out')
    flipTimers.current.push(
      window.setTimeout(() => {
        setFlipPhase('in')
        flipTimers.current.push(window.setTimeout(() => setFlipPhase(null), 480))
      }, 380),
    )
  }
  const shownMs = displayClock(clock, now)
  // One stopwatch lap is the countdown length captured on this clock (at least
  // one second so the ratio cannot divide by zero). The countdown ring is that
  // same length, drawn as remaining / duration.
  const ringMs = countingUp ? Math.max(clock.durationMs, 1000) : clock.durationMs
  const ratio =
    ringMs === 0
      ? 0
      : countingUp
        ? (shownMs % ringMs) / ringMs
        : Math.min(1, Math.max(0, shownMs / ringMs))
  const urgent = !countingUp && clock.status === 'running' && shownMs > 0 && shownMs <= 10_000
  const capped = countingUp && shownMs >= MAX_DURATION_MS
  // Start vs Resume. A stopwatch at 0 is fresh. A countdown is fresh only when
  // it is still showing its full length.
  const fresh = countingUp ? shownMs === 0 : shownMs === clock.durationMs
  const runLabel = clock.status === 'running' ? 'Pause' : fresh ? 'Start' : 'Resume'
  const statusLabel = urgent ? 'Ending' : clock.status === 'running' ? 'Running' : clock.status === 'paused' ? 'Paused' : 'Done'
  // While a wheel is open, the digits show the draft so they track the wheel
  // before the parent state comes back. After a mode change in this same
  // render, `seenMode` is still the old mode until the restart, so the draft
  // is ignored and the new face's live time is shown instead.
  const shown =
    editingPart && clock.mode === seenMode ? draftParts : splitTime(shownMs, countingUp)
  const finished = (!countingUp && clock.status === 'done') || capped

  // Opening a part snapshots the live time into the draft first. Clicking the
  // part that is already open closes the wheel.
  function choosePart(part: TimePart) {
    if (editingPart === null) setDraftParts(splitTime(shownMs, countingUp))
    setEditingPart((current) => (current === part ? null : part))
  }

  function changePart(next: number) {
    if (suppressTimeEdit.current || !editingPart) return
    const parts = { ...draftParts, [editingPart]: next }
    setDraftParts(parts)
    onTimeChange(parts.hours * 3600 + parts.minutes * 60 + parts.seconds)
  }

  // Close the wheel and zero its draft before the parent reset lands, so the
  // label cannot keep showing the previous digits. On the stopwatch that draft
  // is 0. On the countdown it is the set length, which is what reset restores.
  function resetClock() {
    suppressTimeEdit.current = true
    setEditingPart(null)
    setDraftParts(countingUp ? { hours: 0, minutes: 0, seconds: 0 } : splitTime(clock.durationMs, false))
    onReset()
  }

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

  useEffect(() => {
    if (!editingPart) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEditingPart(null)
    }
    const onPointer = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (faceRef.current?.contains(target) || timeRef.current?.contains(target)) return
      setEditingPart(null)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [editingPart])

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
      className="card card-shell"
      data-dragging={dragging ? 'true' : 'false'}
      style={dragStyle}
      aria-label={
        turned
          ? `${clock.label}, kept time`
          : `${clock.label}, ${countingUp ? 'Counting up' : 'Counting down'}, ${statusLabel}, ${formatClock(shownMs, clock.mode)}`
      }
    >
      <div className="card-scene">
        <div
          className="card-faces"
          data-turned={turned ? 'true' : 'false'}
          data-settled={settled ? 'true' : 'false'}
          data-turning={turning ? 'true' : 'false'}
          ref={facesRef}
          onTransitionEnd={(event) => {
            if (event.target !== facesRef.current || event.propertyName !== 'transform') return
            setTurning(false)
            if (turned) setSettled(true)
          }}
        >
          <div
            className="card card-face card-front"
            data-status={clock.status}
            data-mode={clock.mode}
            data-urgent={urgent ? 'true' : 'false'}
            inert={turned}
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
        <div className="card-tools">
          <TurnButton label={`Show kept time for ${clock.label}`} onClick={showBack} />
          <button type="button" className="btn btn-quiet" aria-label={`Delete ${clock.label}`} onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      <div className="clock-stage">
        <div className="clock-body" data-flip={flipPhase ?? undefined}>
          <div className="face" ref={faceRef}>
            {editingPart ? (
              <NumberWheel
                key={editingPart}
                label={PART_LABEL[editingPart]}
                value={draftParts[editingPart]}
                max={editingPart === 'hours' ? 99 : 59}
                onChange={changePart}
              />
            ) : (
              <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
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
            )}
            {editingPart ? null : (
              <button
                type="button"
                className="mode-flip"
                aria-pressed={countingUp}
                aria-label={countingUp ? `Count down for ${clock.label}` : `Count up for ${clock.label}`}
                onClick={flipClock}
              >
                <FlipIcon />
              </button>
            )}
          </div>

          <div className="readout">
            <div className="time" ref={timeRef}>
              {TIME_PARTS.map((part, index) => (
                <span key={part} className="time-group">
                  {index > 0 ? (
                    <span className="time-colon" aria-hidden="true">
                      :
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="time-part"
                    aria-pressed={editingPart === part}
                    aria-label={`${PART_LABEL[part]} for ${clock.label}`}
                    onClick={() => choosePart(part)}
                  >
                    {String(shown[part]).padStart(2, '0')}
                  </button>
                </span>
              ))}
            </div>
            <p className="status">
              <span className="dot" aria-hidden="true" />
              {statusLabel}
            </p>
            <p className="length">{countingUp ? 'Stopwatch' : 'Countdown'}</p>
          </div>
        </div>
      </div>

      <div className="actions">
        {finished ? (
          <button
            type="button"
            className="btn btn-primary span"
            aria-label={`Reset ${clock.label}`}
            onClick={resetClock}
          >
            Reset
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
              aria-label={`Reset ${clock.label}`}
              onClick={resetClock}
            >
              Reset
            </button>
          </>
        )}
      </div>
          </div>
          <div inert={turned ? undefined : true}>
            <ClockBack
              clock={clock}
              now={now}
              onKind={onKind}
              onTurn={showFront}
              onDelete={onDelete}
            />
          </div>
        </div>
      </div>
    </article>
  )
}

type TimePart = 'hours' | 'minutes' | 'seconds'

const TIME_PARTS: readonly TimePart[] = ['hours', 'minutes', 'seconds']

const PART_LABEL: Record<TimePart, string> = {
  hours: 'Hours',
  minutes: 'Minutes',
  seconds: 'Seconds',
}

function FlipIcon() {
  return (
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
  )
}

// Count-up floors, matching `formatClock`, so the button text and the
// accessible name do not disagree by a second. Countdown ceils.
function splitTime(ms: number, countingUp: boolean) {
  const safe = typeof ms === 'number' && Number.isFinite(ms) ? Math.max(0, ms) : 0
  const totalSeconds = countingUp ? Math.floor(safe / 1000) : Math.ceil(safe / 1000)
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  }
}
