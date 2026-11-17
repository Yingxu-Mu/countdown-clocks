import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { createId, nextLabel, settleClocks, summarize } from './clocks'
import { ClockCard } from './components/ClockCard'
import { DraftClock } from './components/DraftClock'
import { SoundSwitch } from './components/SoundSwitch'
import { StyleSwitch } from './components/StyleSwitch'
import { DEFAULT_CLOCK_ICON } from './icons'
import { freshLedger, noteEdit, noteFlip, noteKind, notePause, noteReset, noteStart } from './ledger'
import { playSound, prepareSound, primeAudio, unlockSound } from './sounds'
import { indexUnderPoint, type FrozenSlot } from './reorder'
import { loadClocks, loadSettings, saveClocks, saveSettings, subscribeStorage } from './storage'
import { MAX_DURATION_MS, finiteMs, rememberDuration } from './time'
import type { Clock, ClockKind, SoundId, ThemeId } from './types'

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
  cardHeight: number
  slots: FrozenSlot[]
  slot: number | null
  moved: boolean
  startX: number
  startY: number
  point: { x: number; y: number } | null
  frame: number
  stop: (() => void) | null
}

const DEFAULT_DURATION_MS = 5 * 60 * 1000

function gridSlots(): FrozenSlot[] {
  const slots: FrozenSlot[] = []
  let index = 0
  for (const node of document.querySelectorAll('.clock-grid > li')) {
    if (!(node instanceof HTMLElement)) continue
    const rect = node.getBoundingClientRect()
    const draft = node.dataset.draft != null
    if (!draft && !node.dataset.clockId) continue
    slots.push({
      index: draft ? -1 : index,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    })
    if (!draft) index += 1
  }
  return slots
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

  useEffect(
    () => () => {
      const active = reorder.current
      if (active?.frame) window.cancelAnimationFrame(active.frame)
      active?.stop?.()
    },
    [],
  )

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
      } else if (!(clock.mode === 'up' && clock.remainingMs <= 0)) {
        seen.delete(clock.id)
      }
    }
    if (justFinished) playSound(sound)
  }, [clocks, sound])

  function addClock() {
    const time = Date.now()
    setNow(time)
    setClocks((current) => {
      const clock: Clock = {
        id: createId(),
        label: nextLabel(current),
        icon: DEFAULT_CLOCK_ICON,
        mode: 'down',
        durationMs: DEFAULT_DURATION_MS,
        remainingMs: DEFAULT_DURATION_MS,
        endsAt: null,
        elapsedMs: 0,
        runStartedAt: null,
        status: 'paused',
        ...freshLedger(),
      }
      return [...current, clock]
    })
    setRecentSeconds((current) => rememberDuration(current, DEFAULT_DURATION_MS))
  }

  function pauseClock(id: string) {
    const time = Date.now()
    setNow(time)
    setClocks((current) =>
      current.map((clock) => {
        if (clock.id !== id || clock.status !== 'running') return clock
        const noted = notePause(clock, time)
        if (clock.mode === 'up') {
          if (clock.runStartedAt == null) return clock
          return {
            ...noted,
            status: 'paused',
            elapsedMs: Math.min(MAX_DURATION_MS, finiteMs(clock.elapsedMs) + Math.max(0, time - clock.runStartedAt)),
            runStartedAt: null,
          }
        }
        if (clock.endsAt == null) return clock
        return {
          ...noted,
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
        if (clock.mode === 'up') {
          if (finiteMs(clock.elapsedMs) >= MAX_DURATION_MS) return clock
          return { ...noteStart(clock, time), status: 'running', runStartedAt: time }
        }
        if (clock.remainingMs <= 0) {
          return { ...clock, status: 'done', remainingMs: 0, endsAt: null }
        }
        return { ...noteStart(clock, time), status: 'running', endsAt: time + clock.remainingMs }
      }),
    )
  }

  function resetClock(id: string) {
    unlockSound()
    const time = Date.now()
    setNow(time)
    setClocks((current) =>
      current.map((clock) => {
        if (clock.id !== id) return clock
        const running = clock.status === 'running'
        const noted = noteReset(clock, time, running)
        if (clock.mode === 'up') {
          return {
            ...noted,
            status: running ? 'running' : 'paused',
            elapsedMs: 0,
            runStartedAt: running ? time : null,
          }
        }
        return {
          ...noted,
          status: running ? 'running' : 'paused',
          remainingMs: clock.durationMs,
          endsAt: running ? time + clock.durationMs : null,
        }
      }),
    )
  }

  function flipClock(id: string) {
    const time = Date.now()
    setNow(time)
    setClocks((current) =>
      current.map((clock) => {
        if (clock.id !== id) return clock
        const noted = noteFlip(clock, time)
        if (clock.mode === 'up') {
          const elapsedMs =
            clock.status === 'running' && clock.runStartedAt != null
              ? Math.min(MAX_DURATION_MS, finiteMs(clock.elapsedMs) + Math.max(0, time - clock.runStartedAt))
              : finiteMs(clock.elapsedMs)
          return {
            ...noted,
            mode: 'down',
            elapsedMs,
            runStartedAt: null,
            endsAt: null,
            status: clock.remainingMs <= 0 ? 'done' : 'paused',
          }
        }
        const remainingMs =
          clock.status === 'running' && clock.endsAt != null
            ? Math.max(0, clock.endsAt - time)
            : clock.remainingMs
        return {
          ...noted,
          mode: 'up',
          remainingMs: finiteMs(remainingMs),
          elapsedMs: finiteMs(clock.elapsedMs),
          endsAt: null,
          runStartedAt: null,
          status: 'paused',
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
        if (clock.mode === 'up') {
          const elapsedMs = next
          if (elapsedMs >= MAX_DURATION_MS) {
            return { ...noteEdit(clock, time, false), elapsedMs: MAX_DURATION_MS, runStartedAt: null, status: 'paused' }
          }
          if (clock.status === 'running') {
            return { ...noteEdit(clock, time, true), elapsedMs, runStartedAt: time, status: 'running' }
          }
          return { ...noteEdit(clock, time, false), elapsedMs, runStartedAt: null, status: 'paused' }
        }
        if (next <= 0) return { ...noteEdit(clock, time, false), remainingMs: 0, endsAt: null, status: 'done' }
        const fresh =
          clock.status === 'done' || (clock.status === 'paused' && clock.remainingMs === clock.durationMs)
        const durationMs = fresh ? next : Math.max(clock.durationMs, next)
        if (clock.status === 'running') {
          return { ...noteEdit(clock, time, true), durationMs, remainingMs: next, endsAt: time + next, status: 'running' }
        }
        return { ...noteEdit(clock, time, false), durationMs, remainingMs: next, endsAt: null, status: 'paused' }
      }),
    )
  }

  function updateKind(id: string, kind: ClockKind) {
    setClocks((current) => current.map((clock) => (clock.id === id ? noteKind(clock, kind) : clock)))
  }

  function updateTitle(id: string, label: string) {
    const next = label.trim().slice(0, 40)
    if (!next) return
    setClocks((current) => current.map((clock) => (clock.id === id ? { ...clock, label: next } : clock)))
  }

  function finishReorder() {
    const active = reorder.current
    if (active?.frame) window.cancelAnimationFrame(active.frame)
    active?.stop?.()
    reorder.current = null
    setDrag(null)
  }

  function applyReorder(id: string, clientX: number, clientY: number) {
    const current = reorder.current
    if (!current || current.id !== id) return
    const dx = clientX - current.startX
    const dy = clientY - current.startY
    if (!current.moved) {
      if (dx * dx + dy * dy < 16) return
      current.moved = true
      current.slots = gridSlots()
    }
    const left = clientX - current.offsetX
    const top = clientY - current.offsetY
    setDrag({
      id,
      left,
      top,
      width: current.width,
      height: current.height,
    })
    const slot = indexUnderPoint(
      current.slots,
      left + current.width / 2,
      top + current.cardHeight / 2,
    )
    if (slot == null || slot === current.slot) return
    current.slot = slot
    setClocks((clocks) => {
      const from = clocks.findIndex((clock) => clock.id === id)
      if (from < 0) return clocks
      const next = [...clocks]
      const [clock] = next.splice(from, 1)
      if (!clock) return clocks
      next.splice(Math.min(slot < 0 ? next.length : slot, next.length), 0, clock)
      if (next.every((item, index) => item.id === clocks[index]?.id)) return clocks
      return next
    })
  }

  function queueReorder(id: string, pointerId: number, clientX: number, clientY: number) {
    const current = reorder.current
    if (!current || current.id !== id || current.pointerId !== pointerId) return
    current.point = { x: clientX, y: clientY }
    if (current.frame) return
    current.frame = window.requestAnimationFrame(() => {
      const latest = reorder.current
      if (!latest || latest.id !== id) return
      latest.frame = 0
      const point = latest.point
      if (!point) return
      applyReorder(id, point.x, point.y)
    })
  }

  function onReorderPointerDown(id: string, event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    const card = event.currentTarget.closest('article')
    const item = event.currentTarget.closest('li')
    if (!(card instanceof HTMLElement) || !(item instanceof HTMLElement)) return
    event.preventDefault()
    const rect = card.getBoundingClientRect()
    const itemRect = item.getBoundingClientRect()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // A fast drag still follows the pointer through the window listener.
    }
    finishReorder()
    const pointerId = event.pointerId
    const onMove = (native: globalThis.PointerEvent) => {
      if (native.pointerId !== pointerId) return
      queueReorder(id, pointerId, native.clientX, native.clientY)
    }
    const onUp = (native: globalThis.PointerEvent) => {
      if (native.pointerId !== pointerId) return
      const active = reorder.current
      if (active?.frame) {
        window.cancelAnimationFrame(active.frame)
        active.frame = 0
      }
      if (active?.point) applyReorder(id, active.point.x, active.point.y)
      finishReorder()
    }
    reorder.current = {
      id,
      pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: itemRect.height,
      cardHeight: rect.height,
      slots: gridSlots(),
      slot: null,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      point: null,
      frame: 0,
      stop: () => {
        window.removeEventListener('pointermove', onMove, true)
        window.removeEventListener('pointerup', onUp, true)
        window.removeEventListener('pointercancel', onUp, true)
      },
    }
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)
  }

  function onReorderPointerMove(id: string, event: PointerEvent<HTMLButtonElement>) {
    queueReorder(id, event.pointerId, event.clientX, event.clientY)
  }

  function onReorderPointerUp(id: string, event: PointerEvent<HTMLButtonElement>) {
    const current = reorder.current
    if (!current || current.id !== id || current.pointerId !== event.pointerId) return
    if (current.frame) {
      window.cancelAnimationFrame(current.frame)
      current.frame = 0
    }
    if (current.point) applyReorder(id, current.point.x, current.point.y)
    finishReorder()
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
            Add as many countdowns as you need. Each new clock starts paused at five minutes.
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
                  onReset={() => resetClock(clock.id)}
                  onDelete={() => deleteClock(clock.id)}
                  onIconChange={(icon) => updateIcon(clock.id, icon)}
                  onTitleChange={(label) => updateTitle(clock.id, label)}
                  onTimeChange={(totalSeconds) => updateTime(clock.id, totalSeconds)}
                  onFlip={() => flipClock(clock.id)}
                  onKind={(kind) => updateKind(clock.id, kind)}
                  onReorderPointerDown={(event) => onReorderPointerDown(clock.id, event)}
                  onReorderPointerMove={(event) => onReorderPointerMove(clock.id, event)}
                  onReorderPointerUp={(event) => onReorderPointerUp(clock.id, event)}
                  onReorderKeyDown={(event) => onReorderKeyDown(clock.id, event)}
                />
              </li>
            ))}
            <li data-draft="true">
              <DraftClock onAdd={addClock} />
            </li>
          </ul>
        </section>
      </main>

      <p className="footnote">
        Saved in this browser. A running clock keeps its deadline if you leave the tab. Time spent
        running stays on the back of each clock. Sound plays the finish tone you picked when a clock ends.
      </p>
    </div>
  )
}
