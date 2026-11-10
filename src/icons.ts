export const DEFAULT_CLOCK_ICON = '⏱️'

export const EMOJI_OPTIONS = [
  { emoji: '⏱️', label: 'Timer' },
  { emoji: '🍅', label: 'Pomodoro' },
  { emoji: '👩‍💻', label: 'Woman technologist' },
  { emoji: '💻', label: 'Laptop' },
  { emoji: '🧹', label: 'Chores' },
  { emoji: '🧠', label: 'Deep work' },
  { emoji: '🎯', label: 'Goal' },
  { emoji: '📝', label: 'Notes' },
  { emoji: '📚', label: 'Reading' },
  { emoji: '💡', label: 'Idea' },
  { emoji: '☕', label: 'Coffee' },
  { emoji: '📊', label: 'Project' },
  { emoji: '🎨', label: 'Design' },
  { emoji: '🇪🇸', label: 'Spanish' },
  { emoji: '🇫🇷', label: 'French' },
  { emoji: '🔍', label: 'Review' },
] as const

const MAX_ICON_CHARS = 250_000
const MAX_EMOJI_CHARS = 32

const QUICK_EMOJIS = new Set<string>(EMOJI_OPTIONS.map((option) => option.emoji))

export function isImageIcon(icon: string): boolean {
  return icon.startsWith('data:image/') || icon.startsWith('http://') || icon.startsWith('https://')
}

export function isQuickEmoji(icon: string): boolean {
  return QUICK_EMOJIS.has(icon)
}

function isEmojiIcon(icon: string): boolean {
  if (icon.length > MAX_EMOJI_CHARS || icon.includes('<')) return false
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(icon)]
  if (graphemes.length !== 1) return false
  return (
    /\p{Extended_Pictographic}/u.test(icon) ||
    /\p{Regional_Indicator}/u.test(icon) ||
    icon.includes('\u20E3')
  )
}

export function normalizeIcon(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_CLOCK_ICON
  const icon = value.trim()
  if (!icon || icon.length > MAX_ICON_CHARS) return DEFAULT_CLOCK_ICON
  if (icon.startsWith('data:image/')) return icon
  if (icon.startsWith('http://') || icon.startsWith('https://')) return icon
  if (isEmojiIcon(icon)) return icon
  return DEFAULT_CLOCK_ICON
}

export function prepareIconFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) return Promise.reject(new Error('Choose an image file.'))
  if (file.size > 8 * 1024 * 1024) return Promise.reject(new Error('Choose an image under 8 MB.'))

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that image.'))
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Could not read that image.'))
        return
      }
      const source = reader.result
      const image = new Image()
      image.onload = () => {
        const size = 96
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext('2d')
        if (!context) {
          resolve(source)
          return
        }
        const scale = Math.max(size / image.width, size / image.height)
        const width = image.width * scale
        const height = image.height * scale
        context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      image.onerror = () => reject(new Error('Could not read that image.'))
      image.src = source
    }
    reader.readAsDataURL(file)
  })
}
