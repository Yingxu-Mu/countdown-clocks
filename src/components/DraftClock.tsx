import { useEffect, useRef, useState } from 'react'
import { DEFAULT_CLOCK_ICON } from '../icons'
import { formatLength } from '../time'
import { ClockIcon } from './ClockIcon'
import { IconChooser } from './IconChooser'
import { NumberWheel } from './NumberWheel'

type DraftClockProps = {
  suggestedLabel: string
  presets: readonly number[]
  onAdd: (input: { label: string; durationMs: number; icon: string }) => void
}

export function DraftClock({ suggestedLabel, presets, onAdd }: DraftClockProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [label, setLabel] = useState('')
  const [icon, setIcon] = useState(DEFAULT_CLOCK_ICON)
  const [editingIcon, setEditingIcon] = useState(false)
  const [seconds, setSeconds] = useState(5 * 60)
  const [error, setError] = useState('')

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remain = seconds % 60

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

  function setPart(part: 'hours' | 'minutes' | 'seconds', next: number) {
    const total =
      (part === 'hours' ? next : hours) * 3600 +
      (part === 'minutes' ? next : minutes) * 60 +
      (part === 'seconds' ? next : remain)
    setSeconds(total)
    if (total > 0) setError('')
  }

  function add() {
    if (seconds <= 0) {
      setError('Set a duration.')
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

      <div className="wheels" role="group" aria-label="Duration">
        <NumberWheel label="Hours" value={hours} max={99} onChange={(next) => setPart('hours', next)} />
        <NumberWheel label="Minutes" value={minutes} max={59} onChange={(next) => setPart('minutes', next)} />
        <NumberWheel label="Seconds" value={remain} max={59} onChange={(next) => setPart('seconds', next)} />
      </div>

      <div className="presets">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            className="chip"
            aria-pressed={seconds === preset}
            onClick={() => {
              setSeconds(preset)
              setError('')
            }}
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
