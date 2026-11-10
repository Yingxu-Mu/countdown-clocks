import { useId, useRef, useState, type FormEvent } from 'react'
import { formatLength } from '../time'

type ClockFormProps = {
  suggestedLabel: string
  presets: readonly number[]
  onAdd: (input: { label: string; durationMs: number }) => void
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function parsePart(value: string, max: number): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return 0
  if (!/^\d{1,2}$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  if (parsed > max) return null
  return parsed
}

export function ClockForm({ suggestedLabel, presets, onAdd }: ClockFormProps) {
  const nameId = useId()
  const errorId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const [label, setLabel] = useState('')
  const [hours, setHours] = useState('00')
  const [minutes, setMinutes] = useState('05')
  const [seconds, setSeconds] = useState('00')
  const [error, setError] = useState('')

  const totalSeconds =
    (Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60 + (Number(seconds) || 0)

  function applyPreset(durationSeconds: number) {
    const nextHours = Math.floor(durationSeconds / 3600)
    const nextMinutes = Math.floor((durationSeconds % 3600) / 60)
    const nextSeconds = durationSeconds % 60
    setHours(pad(nextHours))
    setMinutes(pad(nextMinutes))
    setSeconds(pad(nextSeconds))
    setError('')
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsedHours = parsePart(hours, 99)
    const parsedMinutes = parsePart(minutes, 59)
    const parsedSeconds = parsePart(seconds, 59)
    if (parsedHours == null || parsedMinutes == null || parsedSeconds == null) {
      setError('Use hours, minutes, and seconds as numbers.')
      return
    }
    const durationMs = ((parsedHours * 60 + parsedMinutes) * 60 + parsedSeconds) * 1000
    if (durationMs <= 0) {
      setError('Set a duration of at least one second.')
      return
    }
    onAdd({ label: label.trim(), durationMs })
    setLabel('')
    setError('')
    nameRef.current?.focus()
  }

  return (
    <form className="composer" onSubmit={onSubmit}>
      <div className="form-row">
        <label className="name-field" htmlFor={nameId}>
          <span>Name</span>
          <input
            id={nameId}
            ref={nameRef}
            type="text"
            value={label}
            maxLength={40}
            placeholder={suggestedLabel}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <div className="duration" role="group" aria-label="Duration">
          <PartField label="Hours" value={hours} max={99} onChange={setHours} onEdit={() => setError('')} />
          <PartField
            label="Minutes"
            value={minutes}
            max={59}
            onChange={setMinutes}
            onEdit={() => setError('')}
          />
          <PartField
            label="Seconds"
            value={seconds}
            max={59}
            onChange={setSeconds}
            onEdit={() => setError('')}
          />
        </div>
        <button type="submit" className="btn btn-primary add-button">
          Add clock
        </button>
      </div>
      <div className="presets">
        <span className="presets-label">Quick set</span>
        {presets.map((seconds) => (
          <button
            key={seconds}
            type="button"
            className="chip"
            aria-pressed={totalSeconds === seconds}
            onClick={() => applyPreset(seconds)}
          >
            {formatLength(seconds * 1000)}
          </button>
        ))}
      </div>
      {error ? (
        <p id={errorId} className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}

function PartField({
  label,
  value,
  max,
  onChange,
  onEdit,
}: {
  label: string
  value: string
  max: number
  onChange: (value: string) => void
  onEdit: () => void
}) {
  const id = useId()
  return (
    <label className="part" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, '').slice(0, 2)
          onEdit()
          if (digits === '') {
            onChange('')
            return
          }
          onChange(String(Math.min(max, Number(digits))))
        }}
        onBlur={() => onChange(value === '' ? '00' : value.padStart(2, '0'))}
      />
    </label>
  )
}
