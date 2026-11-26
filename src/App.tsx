// The clock list, the 100ms tick, and every mutation of a clock.
//
// Two time bases live on each clock and are updated independently:
//   countdown — `remainingMs` while paused, `endsAt` while running
//   stopwatch — `elapsedMs` while paused, `elapsedMs + (now - runStartedAt)` while running
// Flipping pauses the face that was showing and does not copy one base into the
// other. Resetting the stopwatch sets `elapsedMs` to 0. Resetting the countdown
// restores `durationMs` and leaves the stopwatch alone.
//
// New clocks are appended, start paused, and begin at five minutes. Editing the
// dial never starts a clock by itself.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { createId, nextLabel, settleClocks, summarize } from './clocks'
import { ArchiveSection } from './components/ArchiveList'
import { ClockCard } from './components/ClockCard'
import { DraftClock } from './components/DraftClock'
import { SoundSwitch } from './components/SoundSwitch'
import { StyleSwitch } from './components/StyleSwitch'
import { DEFAULT_CLOCK_ICON } from './icons'
import { freshLedger, noteEdit, noteFlip, noteFocus, noteKind, notePause, noteReset, noteStart, repairUncountedFinish } from './ledger'
import { playSound, prepareSound, primeAudio, unlockSound } from './sounds'
import { indexUnderPoint, type FrozenSlot } from './reorder'
import { loadClocks, loadSettings, saveClocks, saveSettings, subscribeStorage } from './storage'
import { MAX_DURATION_MS, finiteMs, rememberDuration } from './time'
import type { Clock, ClockKind, SoundId, ThemeId } from './types'

// Painted into `<meta name="theme-color">` so the browser chrome matches the theme.
const THEME_COLOR: Record<ThemeId, string> = {
  paper: '#f3efe6',
  signal: '#101114',
  tide: '#d7ebe7',
  ink: '#161310',
  chalk: '#1c2822',
  ember: '#3b1520',
  ledger: '#f7f4ec',
}

// The card being dragged, positioned `fixed` so the grid cell it left behind
// can keep its height and the other cards do not jump.
type DragBox = {
  id: string
  left: number
  top: number
  width: number
  height: number
}

// One in-progress drag. Pointer listeners live on `window` (capture) because
// the card itself moves out from under the cursor. `slots` is frozen on the
// first real movement so layout shifts do not retarget the drop.
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

// What the plus button creates. The user can change it on the dial afterwards.
const DEFAULT_DURATION_MS = 5 * 60 * 1000

// Read the grid as it is laid out right now. The plus cell is index -1 so a
// drop on it means "move to the end, just before the plus".
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

// Prefer the stored recent list. A first visit with clocks but no settings
// (an older build) seeds it from the clocks that are already there.
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
  // Ids that have already chimed, or that were set to zero by hand. Seeded on
  // the first render with clocks that were already done, so a reload does not
  // replay the finish sound. Null until that first pass so the initializer can
  // read `clocks` without assigning a ref during render (the linter forbids it).
  const finishedIds = useRef<Set<string> | null>(null)
  // Previous clock list, compared after each commit to repair a success that
  // the interval closure forgot to count.
  const clockSnapshot = useRef(clocks)
  // The interval effect is created once. Pointing this ref at the latest
  // `settleClocks` lets a hot reload of the ledger apply on the next tick
  // without restarting the interval.
  const settleRef = useRef(settleClocks)
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

  // First render only. Later done-clocks are added by the sound effect below.
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

  // Every commit, not just when `settleClocks`'s identity changes. The import
  // is a live binding, but the interval below closed over the first function.
  useEffect(() => {
    settleRef.current = settleClocks
  })

  // Runs before paint. If a countdown went running → done without either
  // counter moving, add the missing success. Skip ids already in `finishedIds`:
  // a manual scroll to zero is pre-seeded there so it is not repaired into a
  // success and does not chime.
  useLayoutEffect(() => {
    const previous = clockSnapshot.current
    clockSnapshot.current = clocks
    const seen = finishedIds.current
    if (!seen) return
    let changed = false
    const next = clocks.map((clock) => {
      const before = previous.find((item) => item.id === clock.id)
      if (!before || seen.has(clock.id)) return clock
      const repaired = repairUncountedFinish(before, clock)
      if (repaired !== clock) changed = true
      return repaired
    })
    if (changed) setClocks(next)
  }, [clocks])

  // 100ms is enough for the digits (they show whole seconds) and short enough
  // that a deadline crossed in the background is settled on the next visible
  // frame. `visibilitychange` settles immediately when the tab comes back,
  // instead of waiting for the next interval.
  useEffect(() => {
    const sync = () => {
      const time = Date.now()
      setNow(time)
      setClocks((current) => settleRef.current(current, time))
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

  // Play the finish tone only when a clock newly becomes `done`. A stopwatch
  // whose countdown remaining is already 0 is excluded from the "clear the id"
  // branch so flipping back and forth cannot re-arm the chime. Manual zero
  // calls `heardFinish` before the done state is committed, so this effect
  // finds the id already seen and stays quiet.
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

  // Mark a finish as already heard before React commits it. Used for a dial
  // edit that lands on zero, which is not a natural time-up.
  function heardFinish(id: string) {
    finishedIds.current?.add(id)
  }

  // Append a paused five-minute countdown. The plus stays the last grid cell.
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
        archived: false,
        ...freshLedger(),
      }
      const active = current.filter((item) => !item.archived)
      const archived = current.filter((item) => item.archived)
      return [...active, clock, ...archived]
    })
    setRecentSeconds((current) => rememberDuration(current, DEFAULT_DURATION_MS))
  }

  // Freeze the live value into the stored snapshot and clear the running stamp
  // (`runStartedAt` or `endsAt`) so the next resume starts a new segment.
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

  // Start or resume. The stopwatch keeps its banked `elapsedMs` and only sets
  // a new `runStartedAt`, so a reset-then-start begins at 0 and a resume
  // continues. A countdown with nothing left is marked done here without
  // `noteDone`, so it does not count as an Unbroken success. `unlockSound`
  // runs inside the user gesture so a later finish is allowed to play.
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
          heardFinish(clock.id)
          return { ...clock, status: 'done', remainingMs: 0, endsAt: null }
        }
        return { ...noteStart(clock, time), status: 'running', endsAt: time + clock.remainingMs }
      }),
    )
  }

  // Reset only the face that is showing.
  // Stopwatch: elapsed returns to 0. If it was running, it keeps running from
  // 0; otherwise it stays paused at 0 until Start.
  // Countdown: remaining returns to the set length. The stopwatch's elapsed
  // time is left as it was.
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

  // Swap countdown and stopwatch. Always pauses. The running face's live time
  // is written back into its snapshot first (`elapsedMs` or `remainingMs`) so
  // nothing is lost, and the other face is not modified. Coming back to a
  // countdown that had already reached zero shows Done rather than 00:00:00
  // with a Start button.
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

  // A wheel or typed edit. Does not start a paused clock.
  // Stopwatch: the typed total replaces `elapsedMs`. At the cap, it pauses.
  // Countdown: a fresh or finished clock adopts the typed length as its new
  // duration. A clock already underway keeps the longer of the old duration
  // and the new remaining, so shortening the time left does not shrink the
  // lap the stopwatch ring is measured against. Typing 0 is a manual finish:
  // it is pre-seeded in `finishedIds` so it neither chimes nor counts as a
  // success.
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
        if (next <= 0) {
          heardFinish(id)
          return { ...noteEdit(clock, time, false), remainingMs: 0, endsAt: null, status: 'done' }
        }
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

  function updateFocus(id: string, focus: boolean) {
    setClocks((current) => current.map((clock) => (clock.id === id ? noteFocus(clock, focus) : clock)))
  }

  // File a project out of the working grid. A running clock is paused first,
  // so its open time is banked and an open focus attempt is closed. The
  // ledgers stay on the clock. Newest archives sit at the front of the section.
  function archiveClock(id: string) {
    const time = Date.now()
    setNow(time)
    setClocks((current) => {
      const clock = current.find((item) => item.id === id)
      if (!clock || clock.archived) return current
      let filed = clock
      if (clock.status === 'running') {
        const noted = notePause(clock, time)
        if (clock.mode === 'up' && clock.runStartedAt != null) {
          filed = {
            ...noted,
            status: 'paused',
            elapsedMs: Math.min(MAX_DURATION_MS, finiteMs(clock.elapsedMs) + Math.max(0, time - clock.runStartedAt)),
            runStartedAt: null,
          }
        } else if (clock.mode !== 'up' && clock.endsAt != null) {
          filed = {
            ...noted,
            status: 'paused',
            remainingMs: Math.max(0, clock.endsAt - time),
            endsAt: null,
          }
        }
      }
      filed = { ...filed, archived: true }
      const rest = current.filter((item) => item.id !== id)
      return [...rest.filter((item) => !item.archived), filed, ...rest.filter((item) => item.archived)]
    })
  }

  // Bring a filed project back to the end of the working grid. It stays paused.
  function restoreClock(id: string) {
    setClocks((current) => {
      const clock = current.find((item) => item.id === id)
      if (!clock || !clock.archived) return current
      const rest = current.filter((item) => item.id !== id)
      return [...rest.filter((item) => !item.archived), { ...clock, archived: false }, ...rest.filter((item) => item.archived)]
    })
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

  // Ignore the first few pixels so a click on the grip does not reorder.
  // Once the drag is real, retarget the clock whenever the pointer's card
  // center enters a different frozen slot. The plus slot (-1) appends.
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
      if (!clock || clock.archived) return clocks
      const activeCount = next.filter((item) => !item.archived).length
      const index = slot < 0 ? activeCount : Math.min(slot, activeCount)
      next.splice(index, 0, clock)
      if (next.every((item, index) => item.id === clocks[index]?.id)) return clocks
      return next
    })
  }

  // Coalesce pointermove to one layout read per frame. The latest point wins.
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
      const active = current.filter((clock) => !clock.archived)
      const archived = current.filter((clock) => clock.archived)
      const from = active.findIndex((clock) => clock.id === id)
      const to = from + direction
      if (from < 0 || to < 0 || to >= active.length) return current
      const next = [...active]
      const [clock] = next.splice(from, 1)
      if (!clock) return current
      next.splice(to, 0, clock)
      return [...next, ...archived]
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
            <p className="summary">{summarize(clocks.filter((clock) => !clock.archived))}</p>
          </div>
          <ul className="clock-grid">
            {clocks.filter((clock) => !clock.archived).map((clock) => (
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
                  onIconChange={(icon) => updateIcon(clock.id, icon)}
                  onTitleChange={(label) => updateTitle(clock.id, label)}
                  onTimeChange={(totalSeconds) => updateTime(clock.id, totalSeconds)}
                  onFlip={() => flipClock(clock.id)}
                  onKind={(kind) => updateKind(clock.id, kind)}
                  onFocus={(focus) => updateFocus(clock.id, focus)}
                  onArchive={() => archiveClock(clock.id)}
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
        <ArchiveSection
          clocks={clocks.filter((clock) => clock.archived)}
          now={now}
          onRestore={restoreClock}
          onDelete={deleteClock}
        />
      </main>

      <p className="footnote">
        Saved in this browser. A running clock keeps its deadline if you leave the tab. Time spent
        running stays on the back of each clock. Archiving a project keeps those stats and takes the
        clock off this list. Sound plays the finish tone you picked when a clock ends.
      </p>
    </div>
  )
}
