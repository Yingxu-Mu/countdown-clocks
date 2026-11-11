import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { DEFAULT_CLOCK_ICON } from '../icons'
import { MAX_DURATION_MS, formatClock, formatLength } from '../time'
import { ClockIcon } from './ClockIcon'
import { IconChooser } from './IconChooser'

const SIZE = 120
const STROKE = 8
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const CENTER = SIZE / 2
const MAX_SECONDS = MAX_DURATION_MS / 1000

type DraftClockProps = {
  suggestedLabel: string
  presets: readonly number[]
  onAdd: (input: { label: string; durationMs: number; icon: string }) => void
}

type Drag = {
  angle: number
  seconds: number
  moved: boolean
  ready: boolean
  x: number
  y: number
}

export function DraftClock({ suggestedLabel, presets, onAdd }: DraftClockProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const [label, setLabel] = useState('')
  const [icon, setIcon] = useState(DEFAULT_CLOCK_ICON)
  const [editingIcon, setEditingIcon] = useState(false)
  const [seconds, setSeconds] = useState(5 * 60)
  const [error, setError] = useState('')

  const minuteFraction = seconds > 0 && seconds % 3600 === 0 ? 1 : (seconds % 3600) / 3600
  const knob = polar(minuteFraction, RADIUS)

  useEffect(() => {
    if (!editingIcon) return
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setEditingIcon(false)
    }
    const onPointer = (event: globalThis.PointerEvent) => {
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

  function commit(nextSeconds: number) {
    const clamped = clampSeconds(nextSeconds)
    setSeconds(clamped)
    if (clamped > 0) setError('')
  }

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    const angle = pointerAngle(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      angle: angle ?? 0,
      seconds,
      moved: false,
      ready: angle != null,
      x: event.clientX,
      y: event.clientY,
    }
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current
    if (!drag) return
    const angle = pointerAngle(event)
    if (angle == null) return
    if (!drag.ready) {
      drag.angle = angle
      drag.ready = true
      return
    }
    if (!drag.moved) {
      const dx = event.clientX - drag.x
      const dy = event.clientY - drag.y
      if (dx * dx + dy * dy < 16) return
      drag.moved = true
    }
    let delta = angle - drag.angle
    if (delta > 180) delta -= 360
    if (delta < -180) delta += 360
    drag.angle = angle
    drag.seconds = clampSeconds(drag.seconds + (delta / 360) * 3600)
    setSeconds(Math.round(drag.seconds))
    if (drag.seconds > 0) setError('')
  }

  function onPointerUp() {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag || !drag.ready || drag.moved) return
    const pointedMinutes = Math.round(drag.angle / 6) % 60
    commit(Math.floor(drag.seconds / 3600) * 3600 + pointedMinutes * 60)
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    const step = event.shiftKey ? 15 * 60 : 60
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault()
      commit(seconds + step)
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault()
      commit(seconds - step)
    }
  }

  function add() {
    if (seconds <= 0) {
      setError('Drag the dial to set a duration.')
      return
    }
    onAdd({ label: label.trim(), durationMs: seconds * 1000, icon })
    setLabel('')
    setError('')
  }

  return (
    <article className="card card-draft" aria-label="New clock">
      <div className="card-top">
        <div className="card-heading">
          <div className="icon-editor" ref={editorRef}>
            <button
              type="button"
              className="icon-edit"
              aria-expanded={editingIcon}
              aria-label="Choose an icon"
              onClick={() => setEditingIcon((open) => !open)}
            >
              <ClockIcon icon={icon} className="card-icon" />
            </button>
            {editingIcon ? (
              <div className="icon-editor-panel" role="dialog" aria-label="Icon">
                <IconChooser
                  icon={icon}
                  showPreview={false}
                  onChange={(next) => {
                    setIcon(next)
                    setEditingIcon(false)
                  }}
                />
              </div>
            ) : null}
          </div>
          <h3 className="card-label">
            <input
              className="title-input"
              value={label}
              maxLength={40}
              placeholder={suggestedLabel}
              aria-label="Name"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setLabel(event.target.value)}
            />
          </h3>
        </div>
      </div>

      <div className="face">
        <svg
          className="dial"
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="slider"
          tabIndex={0}
          aria-label="Duration"
          aria-valuemin={0}
          aria-valuemax={MAX_SECONDS}
          aria-valuenow={seconds}
          aria-valuetext={formatLength(seconds * 1000)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        >
          {Array.from({ length: 12 }, (_, index) => {
            const inner = polar(index / 12, RADIUS - (index % 3 === 0 ? 12 : 8))
            const outer = polar(index / 12, RADIUS - 2)
            return (
              <line
                key={index}
                className="dial-tick"
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
              />
            )
          })}
          <circle className="ring-track" cx={CENTER} cy={CENTER} r={RADIUS} strokeWidth={STROKE} />
          <circle
            className="ring-value"
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            strokeWidth={STROKE}
            strokeLinecap={minuteFraction > 0.02 && minuteFraction < 0.985 ? 'round' : 'butt'}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - minuteFraction)}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
          />
          <circle className="dial-knob" cx={knob.x} cy={knob.y} r={6} />
        </svg>
      </div>

      <div className="readout">
        <p className="time">{formatClock(seconds * 1000)}</p>
        <p className="status">Drag the dial</p>
      </div>

      <div className="presets">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            className="chip"
            aria-pressed={seconds === preset}
            onClick={() => commit(preset)}
          >
            {formatLength(preset * 1000)}
          </button>
        ))}
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="actions">
        <button type="button" className="btn btn-primary span" onClick={add}>
          Add clock
        </button>
      </div>
    </article>
  )
}

function polar(turn: number, radius: number) {
  const angle = (turn - 0.25) * Math.PI * 2
  return {
    x: CENTER + Math.cos(angle) * radius,
    y: CENTER + Math.sin(angle) * radius,
  }
}

function pointerAngle(event: PointerEvent<SVGSVGElement>): number | null {
  const rect = event.currentTarget.getBoundingClientRect()
  const x = event.clientX - (rect.left + rect.width / 2)
  const y = event.clientY - (rect.top + rect.height / 2)
  if (Math.hypot(x, y) < rect.width * 0.18) return null
  const degrees = (Math.atan2(y, x) * 180) / Math.PI + 90
  return (degrees + 360) % 360
}

function clampSeconds(value: number): number {
  return Math.min(MAX_SECONDS, Math.max(0, value))
}
