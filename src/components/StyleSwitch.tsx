import { useRef, type KeyboardEvent } from 'react'
import { THEMES, type ThemeId } from '../types'

type StyleSwitchProps = {
  theme: ThemeId
  onChange: (theme: ThemeId) => void
}

export function StyleSwitch({ theme, onChange }: StyleSwitchProps) {
  const buttons = useRef<Partial<Record<ThemeId, HTMLButtonElement | null>>>({})
  const active = THEMES.find((item) => item.id === theme) ?? THEMES[0]

  function move(delta: number) {
    const current = THEMES.findIndex((item) => item.id === theme)
    const next = THEMES[(current + delta + THEMES.length) % THEMES.length]
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
      <span id="style-label" className="setting-label">
        Style
      </span>
      <div
        role="radiogroup"
        aria-labelledby="style-label"
        className="segment"
        onKeyDown={onKeyDown}
      >
        {THEMES.map((item) => (
          <button
            key={item.id}
            ref={(node) => {
              buttons.current[item.id] = node
            }}
            type="button"
            role="radio"
            aria-checked={item.id === theme}
            tabIndex={item.id === theme ? 0 : -1}
            onClick={() => onChange(item.id)}
          >
            <span className={`swatch swatch-${item.id}`} aria-hidden="true" />
            {item.label}
          </button>
        ))}
      </div>
      <p className="setting-note">{active.note}</p>
    </div>
  )
}
