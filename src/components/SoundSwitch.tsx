import { useRef, type KeyboardEvent } from 'react'
import { playSound } from '../sounds'
import { SOUNDS, type SoundId } from '../types'

type SoundSwitchProps = {
  sound: SoundId
  onChange: (sound: SoundId) => void
}

export function SoundSwitch({ sound, onChange }: SoundSwitchProps) {
  const buttons = useRef<Partial<Record<SoundId, HTMLButtonElement | null>>>({})
  const active = SOUNDS.find((item) => item.id === sound) ?? SOUNDS[0]

  function choose(id: SoundId) {
    onChange(id)
    playSound(id)
  }

  function move(delta: number) {
    const current = SOUNDS.findIndex((item) => item.id === sound)
    const next = SOUNDS[(current + delta + SOUNDS.length) % SOUNDS.length]
    if (!next) return
    choose(next.id)
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
    <div className="sound-setting">
      <span id="sound-label" className="setting-label">
        Sound
      </span>
      <div role="radiogroup" aria-labelledby="sound-label" className="segment" onKeyDown={onKeyDown}>
        {SOUNDS.map((item) => (
          <button
            key={item.id}
            ref={(node) => {
              buttons.current[item.id] = node
            }}
            type="button"
            role="radio"
            aria-checked={item.id === sound}
            tabIndex={item.id === sound ? 0 : -1}
            onClick={() => choose(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="setting-note">{active.note}</p>
    </div>
  )
}
