// Theme radios. Three names show at a time, in the same pill the header used
// when there were only Paper, Signal, and Tide. The chevrons slide that window.
// Arrow keys still move the selection, and the window follows so the chosen
// theme stays on screen.

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { THEMES, type ThemeId } from '../types'

const WINDOW = 3

type StyleSwitchProps = {
  theme: ThemeId
  onChange: (theme: ThemeId) => void
}

export function StyleSwitch({ theme, onChange }: StyleSwitchProps) {
  const buttons = useRef<Partial<Record<ThemeId, HTMLButtonElement | null>>>({})
  const trackRef = useRef<HTMLDivElement>(null)
  const windowRef = useRef<HTMLDivElement>(null)
  const active = THEMES.find((item) => item.id === theme) ?? THEMES[0]
  const [start, setStart] = useState(() => windowStart(theme))
  const maxStart = Math.max(THEMES.length - WINDOW, 0)

  useLayoutEffect(() => {
    const track = trackRef.current
    const frame = windowRef.current
    if (!track || !frame) return

    const measure = () => {
      const boxes = THEMES.map((item) => buttons.current[item.id]?.getBoundingClientRect() ?? null)
      if (boxes.some((box) => box === null)) return
      const trackBox = track.getBoundingClientRect()
      const current = boxes[start]
      if (current) track.style.setProperty('--style-offset', `${current.left - trackBox.left}px`)
      // The frame stays the widest trio, so shorter names do not shrink the pill.
      const count = Math.min(WINDOW, boxes.length)
      let widest = 0
      for (let index = 0; index <= boxes.length - count; index += 1) {
        const from = boxes[index]
        const to = boxes[index + count - 1]
        if (!from || !to) continue
        widest = Math.max(widest, to.right - from.left)
      }
      frame.style.width = `${Math.ceil(widest)}px`
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    return () => observer.disconnect()
  }, [start])

  function reveal(index: number) {
    setStart((current) => {
      if (index < current) return index
      if (index > current + WINDOW - 1) return Math.min(index - WINDOW + 1, maxStart)
      return current
    })
  }

  function move(delta: number) {
    const current = THEMES.findIndex((item) => item.id === theme)
    const next = THEMES[(current + delta + THEMES.length) % THEMES.length]
    if (!next) return
    onChange(next.id)
    reveal(THEMES.findIndex((item) => item.id === next.id))
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

  function choose(id: ThemeId) {
    onChange(id)
    reveal(THEMES.findIndex((item) => item.id === id))
  }

  return (
    <div className="style-setting">
      <span id="style-label" className="setting-label">
        Style
      </span>
      <div className="style-switch">
        <button
          type="button"
          className="style-nudge"
          aria-label="Show earlier styles"
          disabled={start === 0}
          onClick={() => setStart((current) => Math.max(current - 1, 0))}
        >
          <Chevron direction="left" />
        </button>
        <div
          ref={windowRef}
          role="radiogroup"
          aria-labelledby="style-label"
          className="style-window"
          onKeyDown={onKeyDown}
        >
          <div ref={trackRef} className="style-track">
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
                onClick={() => choose(item.id)}
              >
                <span className={`swatch swatch-${item.id}`} aria-hidden="true" />
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="style-nudge"
          aria-label="Show later styles"
          disabled={start >= maxStart}
          onClick={() => setStart((current) => Math.min(current + 1, maxStart))}
        >
          <Chevron direction="right" />
        </button>
      </div>
      <p className="setting-note">{active.note}</p>
    </div>
  )
}

function windowStart(theme: ThemeId) {
  const index = Math.max(0, THEMES.findIndex((item) => item.id === theme))
  const maxStart = Math.max(THEMES.length - WINDOW, 0)
  return Math.min(Math.max(index - 1, 0), maxStart)
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg className="style-chevron" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M10 3.5 5.5 8 10 12.5' : 'M6 3.5 10.5 8 6 12.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
