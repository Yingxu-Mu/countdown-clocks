export const FLIP_MOTIONS = [
  { id: 'plain', label: 'Plain', note: 'A sideways turn that leans in and settles', out: 380, inn: 480 },
  { id: 'lift', label: 'Lift', note: 'Rises off the card, fades at the edge, then settles', out: 300, inn: 400 },
  { id: 'crystal', label: 'Crystal', note: 'Only the ring turns, and the time crossfades', out: 280, inn: 320 },
  { id: 'card', label: 'Card', note: 'The whole card turns, with a light streak', out: 320, inn: 360 },
] as const

export type FlipMotion = (typeof FLIP_MOTIONS)[number]['id']

export function isFlipMotion(value: string | null): value is FlipMotion {
  return FLIP_MOTIONS.some((item) => item.id === value)
}
