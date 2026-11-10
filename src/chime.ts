let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window.AudioContext === 'undefined') return null
  if (!audioContext) audioContext = new AudioContext()
  return audioContext
}

export function primeAudio() {
  const context = getAudioContext()
  if (context && context.state === 'suspended') void context.resume()
}

function tone(context: AudioContext, frequency: number, start: number, duration: number, peak: number) {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(frequency, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.02)
}

export function playChime() {
  const context = getAudioContext()
  if (!context) return
  if (context.state === 'suspended') {
    void context.resume()
    return
  }
  const start = context.currentTime
  tone(context, 523.25, start, 0.28, 0.05)
  tone(context, 783.99, start + 0.09, 0.38, 0.04)
}
