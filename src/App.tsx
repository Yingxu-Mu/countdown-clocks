import { useEffect, useRef, useState } from 'react'
import { createId, nextLabel, settleClocks, summarize } from './clocks'
import { ClockCard } from './components/ClockCard'
import { ClockForm } from './components/ClockForm'
import { SoundSwitch } from './components/SoundSwitch'
import { StyleSwitch } from './components/StyleSwitch'
import { playSound, prepareSound, primeAudio, unlockSound } from './sounds'
import { loadClocks, loadSettings, saveClocks, saveSettings, subscribeStorage } from './storage'
import { quickSetSeconds, rememberDuration } from './time'
import type { Clock, SoundId, ThemeId } from './types'

const THEME_COLOR: Record<ThemeId, string> = {
  paper: '#f3efe6',
  signal: '#101114',
  tide: '#e4f1ee',
}

function initialRecentSeconds(): number[] {
  const stored = loadSettings().recentSeconds
  if (stored.length > 0) return stored
  const clocks = loadClocks()
  let recent: number[] = []
  for (let index = clocks.length - 1; index >= 0; index -= 1) {
    const clock = clocks[index]
    if (clock) recent = rememberDuration(recent, clock.durationMs)
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
      return [clock, ...current]
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

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <h1 className="wordmark">Clocks</h1>
          <p className="lede">
            Add as many countdowns as you need. A new clock waits until you start it, and each one pauses on its own.
          </p>
        </div>
        <div className="settings">
          <StyleSwitch theme={theme} onChange={setTheme} />
          <SoundSwitch sound={sound} onChange={setSound} />
        </div>
      </header>

      <main className="stack">
        <section className="panel" aria-labelledby="add-heading">
          <h2 id="add-heading">Add a clock</h2>
          <ClockForm
            suggestedLabel={nextLabel(clocks)}
            presets={quickSetSeconds(recentSeconds)}
            onAdd={addClock}
          />
        </section>

        <section aria-labelledby="list-heading">
          <div className="section-head">
            <h2 id="list-heading">Your clocks</h2>
            <p className="summary">{summarize(clocks)}</p>
          </div>
          {clocks.length === 0 ? (
            <div className="empty">
              <strong>Nothing counting yet</strong>
              <p>Set a name and a duration, then add your first clock.</p>
            </div>
          ) : (
            <ul className="clock-grid">
              {clocks.map((clock) => (
                <li key={clock.id}>
                  <ClockCard
                    clock={clock}
                    now={now}
                    onPause={() => pauseClock(clock.id)}
                    onResume={() => resumeClock(clock.id)}
                    onRestart={() => restartClock(clock.id)}
                    onDelete={() => deleteClock(clock.id)}
                    onIconChange={(icon) => updateIcon(clock.id, icon)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <p className="footnote">
        Saved in this browser. A running clock keeps its deadline if you leave the tab. Sound plays the
        finish tone you picked when a clock ends.
      </p>
    </div>
  )
}
