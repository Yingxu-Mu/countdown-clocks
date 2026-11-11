import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { createId, nextLabel, settleClocks, summarize } from './clocks'
import { ClockCard } from './components/ClockCard'
import { DraftClock } from './components/DraftClock'
import { SoundSwitch } from './components/SoundSwitch'
import { StyleSwitch } from './components/StyleSwitch'
import { playSound, prepareSound, primeAudio, unlockSound } from './sounds'
import { loadClocks, loadSettings, saveClocks, saveSettings, subscribeStorage } from './storage'
import { MAX_DURATION_MS, quickSetSeconds, rememberDuration } from './time'
import type { Clock, SoundId, ThemeId } from './types'

const THEME_COLOR: Record<ThemeId, string> = {
  paper: '#f3efe6',
  signal: '#101114',
  tide: '#e4f1ee',
}

type DragBox = {
  id: string
  left: number
  top: number
  width: number
  height: number
}

type Reorder = {
  id: string
  pointerId: number
  offsetX: number
  offsetY: number
  width: number
  height: number
  moved: boolean
  startX: number
  startY: number
}

function initialRecentSeconds(): number[] {
  const stored = loadSettings().recentSeconds
  if (stored.length > 0) return stored
  let recent: number[] = []
  for (const clock of loadClocks()) {
    recent = rememberDuration(recent, clock.durationMs)
  }
  return recent
}

export default function App() {
  const [clocks, setClocks] = useState<Clock[]>(loadClocks)
  const [now, setNow] = useState(() => Date.now())
  const [theme, setTheme] = useState<ThemeId>(() => loadSettings().theme)
  const [sound, setSound] = useState<SoundId>(() => loadSettings().sound)
  const [recentSeconds, setRecentSeconds] = useState<number[]>(initialRecentSeconds)
  const finishedIds = useRef<Set<string> | null>(null)
  const reorder = useRef<Reorder | null>(null)
  const [drag, setDrag] = useState<DragBox | null>(null)

  if (finishedIds.current === null) {
    finishedIds.current = new Set(
      clocks.filter((clock) => clock.status === 'done').map((clock) => clock.id),
    )
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', THEME_COLOR[theme])
    saveSettings({ theme, sound, recentSeconds })
  }, [theme, sound, recentSeconds])

  useEffect(() => {
    saveClocks(clocks)
  }, [clocks])

  useEffect(() => {
    const sync = () => {
      const time = Date.now()
      setNow(time)
      setClocks((current) => settleClocks(current, time))
    }
    sync()
    const id = window.setInterval(sync, 100)
    document.addEventListener('visibilitychange', sync)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])

  useEffect(() => {
    return subscribeStorage(
      () => {
        const next = loadClocks()
        const seen = finishedIds.current
        if (seen) {
          for (const clock of next) {
            if (clock.status === 'done') seen.add(clock.id)
          }
        }
        setClocks(next)
      },
      () => {
        const next = loadSettings()
        setTheme(next.theme)
        setSound(next.sound)
        setRecentSeconds(next.recentSeconds)
      },
    )
  }, [])

  useEffect(() => {
    prepareSound(sound)
  }, [sound])

  useEffect(() => {
    const prime = () => primeAudio()
    window.addEventListener('pointerdown', prime)
    window.addEventListener('keydown', prime)
    return () => {
      window.removeEventListener('pointerdown', prime)
      window.removeEventListener('keydown', prime)
    }
  }, [])

  useEffect(() => {
    const seen = finishedIds.current
    if (!seen) return
    const liveIds = new Set(clocks.map((clock) => clock.id))
    for (const id of seen) {
      if (!liveIds.has(id)) seen.delete(id)
    }
    let justFinished = false
    for (const clock of clocks) {
      if (clock.status === 'done') {
        if (!seen.has(clock.id)) {
          seen.add(clock.id)
          justFinished = true
        }
      } else {
        seen.delete(clock.id)
      }
    }
    if (justFinished) playSound(sound)
  }, [clocks, sound])

  function addClock(input: { label: string; durationMs: number; icon: string }) {
    const time = Date.now()
    setNow(time)
    setClocks((current) => {
      const clock: Clock = {
        id: createId(),
        label: input.label || nextLabel(current),
        icon: input.icon,
        durationMs: input.durationMs,
        remainingMs: input.durationMs,
        endsAt: null,
        status: 'paused',
      }
      return [...current, clock]
    })
    setRecentSeconds((current) => rememberDuration(current, input.durationMs))
  }

  function pauseClock(id: string) {
    const time = Date.now()
    setNow(time)
    setClocks((current) =>
      current.map((clock) => {
        if (clock.id !== id || clock.status !== 'running' || clock.endsAt == null) return clock
        return {
          ...clock,
          status: 'paused',
          remainingMs: Math.max(0, clock.endsAt - time),
          endsAt: null,
        }
      }),
    )
  }

  function resumeClock(id: string) {
    unlockSound()
    const time = Date.now()
    setNow(time)
    setClocks((current) =>
      current.map((clock) => {
        if (clock.id !== id || clock.status !== 'paused') return clock
        if (clock.remainingMs <= 0) {
          return { ...clock, status: 'done', remainingMs: 0, endsAt: null }
        }
        return { ...clock, status: 'running', endsAt: time + clock.remainingMs }
      }),
    )
  }

  function restartClock(id: string) {
    unlockSound()
    const time = Date.now()
    setNow(time)
    setClocks((current) =>
      current.map((clock) => {
        if (clock.id !== id) return clock
        return {
          ...clock,
          status: 'running',
          remainingMs: clock.durationMs,
          endsAt: time + clock.durationMs,
        }
      }),
    )
  }

  function deleteClock(id: string) {
    setClocks((current) => current.filter((clock) => clock.id !== id))
  }

  function updateIcon(id: string, icon: string) {
    setClocks((current) => current.map((clock) => (clock.id === id ? { ...clock, icon } : clock)))
  }

  function updateTime(id: string, totalSeconds: number) {
    const time = Date.now()
    setNow(time)
    const next = Math.min(MAX_DURATION_MS, Math.max(0, Math.round(totalSeconds) * 1000))
    setClocks((current) =>
      current.map((clock) => {
        if (clock.id !== id) return clock
        if (next <= 0) return { ...clock, remainingMs: 0, endsAt: null, status: 'done' }
        const fresh =
          clock.status === 'done' || (clock.status === 'paused' && clock.remainingMs === clock.durationMs)
        const durationMs = fresh ? next : Math.max(clock.durationMs, next)
        if (clock.status === 'running') return { ...clock, durationMs, remainingMs: next, endsAt: time + next }
        return { ...clock, durationMs, remainingMs: next, endsAt: null, status: 'paused' }
      }),
    )
  }

  function updateTitle(id: string, label: string) {
    const next = label.trim().slice(0, 40)
    if (!next) return
    setClocks((current) => current.map((clock) => (clock.id === id ? { ...clock, label: next } : clock)))
  }

  function onReorderPointerDown(id: string, event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    const card = event.currentTarget.closest('article')
    const item = event.currentTarget.closest('li')
    if (!(card instanceof HTMLElement) || !(item instanceof HTMLElement)) return
    const rect = card.getBoundingClientRect()
    const itemRect = item.getBoundingClientRect()
    event.currentTarget.setPointerCapture(event.pointerId)
    reorder.current = {
      id,
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: itemRect.height,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
    }
  }

  function onReorderPointerMove(id: string, event: PointerEvent<HTMLButtonElement>) {
    const current = reorder.current
    if (!current || current.id !== id || current.pointerId !== event.pointerId) return
    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    if (!current.moved) {
      if (dx * dx + dy * dy < 16) return
      current.moved = true
    }
    setDrag({
      id,
      left: event.clientX - current.offsetX,
      top: event.clientY - current.offsetY,
      width: current.width,
      height: current.height,
    })
    const slot = document.elementsFromPoint(event.clientX, event.clientY).find((node) => {
      if (!(node instanceof HTMLElement)) return false
      const item = node.closest('li')
      if (!(item instanceof HTMLElement) || !item.parentElement?.classList.contains('clock-grid')) return false
      return item.dataset.clockId !== id
    })
    if (!(slot instanceof HTMLElement)) return
    const item = slot.closest('li')
    if (!(item instanceof HTMLElement)) return
    const targetId = item.dataset.draft != null ? null : item.dataset.clockId
    if (item.dataset.draft == null && !targetId) return
    setClocks((current) => {
      const toIndex = targetId == null ? current.length - 1 : current.findIndex((clock) => clock.id === targetId)
      const from = current.findIndex((clock) => clock.id === id)
      if (from < 0 || toIndex < 0 || toIndex >= current.length || from === toIndex) return current
      const next = [...current]
      const [clock] = next.splice(from, 1)
      if (!clock) return current
      next.splice(toIndex, 0, clock)
      return next
    })
  }

  function onReorderPointerUp(id: string, event: PointerEvent<HTMLButtonElement>) {
    const current = reorder.current
    if (!current || current.id !== id || current.pointerId !== event.pointerId) return
    reorder.current = null
    setDrag(null)
  }

  function onReorderKeyDown(id: string, event: KeyboardEvent<HTMLButtonElement>) {
    const direction =
      event.key === 'ArrowUp' || event.key === 'ArrowLeft'
        ? -1
        : event.key === 'ArrowDown' || event.key === 'ArrowRight'
          ? 1
          : 0
    if (direction === 0) return
    event.preventDefault()
    setClocks((current) => {
      const from = current.findIndex((clock) => clock.id === id)
      const toIndex = from + direction
      if (from < 0 || toIndex < 0 || toIndex >= current.length) return current
      const next = [...current]
      const [clock] = next.splice(from, 1)
      if (!clock) return current
      next.splice(toIndex, 0, clock)
      return next
    })
  }

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <h1 className="wordmark">Clocks</h1>
          <p className="lede">
            Add as many countdowns as you need. Set the next one on the wheels, and each clock pauses on its own.
          </p>
        </div>
        <div className="settings">
          <StyleSwitch theme={theme} onChange={setTheme} />
          <SoundSwitch sound={sound} onChange={setSound} />
        </div>
      </header>

      <main className="stack">
        <section aria-labelledby="list-heading">
          <div className="section-head">
            <h2 id="list-heading">Your clocks</h2>
            <p className="summary">{summarize(clocks)}</p>
          </div>
          <ul className="clock-grid">
            {clocks.map((clock) => (
              <li
                key={clock.id}
                data-clock-id={clock.id}
                data-dragging={drag?.id === clock.id ? 'true' : 'false'}
                style={drag?.id === clock.id ? { height: drag.height } : undefined}
              >
                <ClockCard
                  clock={clock}
                  now={now}
                  dragging={drag?.id === clock.id}
                  dragStyle={
                    drag?.id === clock.id
                      ? { position: 'fixed', left: drag.left, top: drag.top, width: drag.width, zIndex: 5 }
                      : undefined
                  }
                  onPause={() => pauseClock(clock.id)}
                  onResume={() => resumeClock(clock.id)}
                  onRestart={() => restartClock(clock.id)}
                  onDelete={() => deleteClock(clock.id)}
                  onIconChange={(icon) => updateIcon(clock.id, icon)}
                  onTitleChange={(label) => updateTitle(clock.id, label)}
                  onTimeChange={(totalSeconds) => updateTime(clock.id, totalSeconds)}
                  onReorderPointerDown={(event) => onReorderPointerDown(clock.id, event)}
                  onReorderPointerMove={(event) => onReorderPointerMove(clock.id, event)}
                  onReorderPointerUp={(event) => onReorderPointerUp(clock.id, event)}
                  onReorderKeyDown={(event) => onReorderKeyDown(clock.id, event)}
                />
              </li>
            ))}
            <li data-draft="true">
              <DraftClock
                suggestedLabel={nextLabel(clocks)}
                presets={quickSetSeconds(recentSeconds)}
                onAdd={addClock}
              />
            </li>
          </ul>
        </section>
      </main>

      <p className="footnote">
        Saved in this browser. A running clock keeps its deadline if you leave the tab. Sound plays the
        finish tone you picked when a clock ends.
      </p>
    </div>
  )
}
