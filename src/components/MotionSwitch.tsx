// Keyboard-roving radio for the flip-motion choices. Arrow keys move the
// selection and the focus together, which is what a radiogroup expects when
// only the checked button is in the tab order.

import { useRef, type KeyboardEvent } from 'react'
import { FLIP_MOTIONS, type FlipMotion } from '../flipMotion'

type MotionSwitchProps = {
  motion: FlipMotion
  onChange: (motion: FlipMotion) => void
}

export function MotionSwitch({ motion, onChange }: MotionSwitchProps) {
  const buttons = useRef<Partial<Record<FlipMotion, HTMLButtonElement | null>>>({})
  const active = FLIP_MOTIONS.find((item) => item.id === motion) ?? FLIP_MOTIONS[0]

  function move(delta: number) {
    const current = FLIP_MOTIONS.findIndex((item) => item.id === motion)
    const next = FLIP_MOTIONS[(current + delta + FLIP_MOTIONS.length) % FLIP_MOTIONS.length]
    if (!next) return
    onChange(next.id)
    queueMicrotask(() => buttons.current[next.id]?.focus())
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      move(1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      move(-1)
    }
  }

  return (
    <div className="style-setting">
      <span id="motion-label" className="setting-label">
        Flip
      </span>
      <div role="radiogroup" aria-labelledby="motion-label" className="segment" onKeyDown={onKeyDown}>
        {FLIP_MOTIONS.map((item) => (
          <button
            key={item.id}
            ref={(node) => {
              buttons.current[item.id] = node
            }}
            type="button"
            role="radio"
            aria-checked={item.id === motion}
            tabIndex={item.id === motion ? 0 : -1}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="setting-note">{active.note}</p>
    </div>
  )
}
