import type { SoundId } from './types'

const SAMPLE_RATE = 22_050

type Wave = 'sine' | 'square'

let output: HTMLAudioElement | null = null
let primer: HTMLAudioElement | null = null
let live = false
let selected: SoundId = 'bell'

const clips: Record<Exclude<SoundId, 'off'>, string> = {
  bell: wavUrl(renderBell()),
  alarm: wavUrl(renderAlarm()),
  chime: wavUrl(renderChime()),
}

const silent = wavUrl(new Float32Array(SAMPLE_RATE / 50))

function player(): HTMLAudioElement {
  if (!output) {
    output = new Audio()
    output.preload = 'auto'
  }
  return output
}

export function prepareSound(id: SoundId) {
  selected = id
}

export function primeAudio() {
  if (!primer) {
    primer = new Audio(silent)
    primer.preload = 'auto'
  }
  void primer
    .play()
    ?.then(() => primer?.pause())
    .catch(() => {
      // A later click can unlock playback.
    })
}

export function unlockSound() {
  if (selected === 'off' || live) return
  const audio = player()
  const clip = clips[selected]
  if (audio.src !== clip) audio.src = clip
  audio.volume = 0
  void audio
    .play()
    ?.then(() => {
      if (live) {
        audio.volume = 1
        return
      }
      audio.pause()
      try {
        audio.currentTime = 0
      } catch {
        // The clip may still be loading.
      }
    })
    .catch(() => {
      // Playback can start on the next click.
    })
}

export function playSound(id: SoundId) {
  if (id === 'off') return
  const audio = player()
  live = true
  const clip = clips[id]
  if (audio.src !== clip) audio.src = clip
  try {
    audio.currentTime = 0
  } catch {
    // The clip is not loaded yet; play() starts at the beginning.
  }
  audio.volume = 1
  void audio.play().catch(() => {
    live = false
  })
}

function renderBell(): Float32Array {
  const samples = buffer(0.85)
  addWave(samples, 880, 0, 0.34, 0.55, 'sine')
  addWave(samples, 1760, 0, 0.2, 0.18, 'sine')
  addWave(samples, 1174.66, 0.16, 0.36, 0.5, 'sine')
  addWave(samples, 1567.98, 0.34, 0.48, 0.48, 'sine')
  return samples
}

function renderAlarm(): Float32Array {
  const samples = buffer(1.05)
  for (let index = 0; index < 6; index += 1) {
    addWave(samples, index % 2 === 0 ? 960 : 640, index * 0.16, 0.12, 0.62, 'square')
  }
  return samples
}

function renderChime(): Float32Array {
  const samples = buffer(0.55)
  addWave(samples, 523.25, 0, 0.32, 0.16, 'sine')
  addWave(samples, 783.99, 0.08, 0.4, 0.12, 'sine')
  return samples
}

function buffer(seconds: number): Float32Array {
  return new Float32Array(Math.ceil(seconds * SAMPLE_RATE))
}

function addWave(
  samples: Float32Array,
  frequency: number,
  start: number,
  duration: number,
  peak: number,
  wave: Wave,
) {
  const from = Math.floor(start * SAMPLE_RATE)
  const count = Math.floor(duration * SAMPLE_RATE)
  const attack = Math.max(1, Math.floor(0.012 * SAMPLE_RATE))
  for (let index = 0; index < count; index += 1) {
    const position = from + index
    if (position >= samples.length) break
    const env = Math.min(1, index / attack) * (1 - index / count)
    const phase = (2 * Math.PI * frequency * index) / SAMPLE_RATE
    const raw = wave === 'square' ? (Math.sin(phase) >= 0 ? 1 : -1) : Math.sin(phase)
    samples[position] = (samples[position] ?? 0) + raw * peak * env
  }
}

function wavUrl(samples: Float32Array): string {
  const dataBytes = samples.length * 2
  const bytes = new Uint8Array(44 + dataBytes)
  const view = new DataView(bytes.buffer)
  writeText(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeText(view, 8, 'WAVE')
  writeText(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(view, 36, 'data')
  view.setUint32(40, dataBytes, true)
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0))
    view.setInt16(44 + index * 2, Math.round(sample * 0x7fff), true)
  }
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
}

function writeText(view: DataView, offset: number, text: string) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index))
  }
}
