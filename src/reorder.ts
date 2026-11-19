// Geometry for dragging a clock to a new grid slot.
//
// The slot rectangles are captured when the drag actually starts moving, not
// on pointer-down. They stay frozen for the rest of the gesture so the cards
// shifting around under the pointer do not change which cell a point maps to.

export type FrozenSlot = {
  index: number
  left: number
  top: number
  right: number
  bottom: number
}

// Index of the grid cell under the point. `-1` is the add-clock cell at the
// end, which means "drop after the last clock". `null` means the point is
// too far from every cell to count as a drop.
//
// A cell that contains the point beats a cell the point is merely near. Ties
// go to the cell whose center is closer. The 20px halo lets a drag that slips
// just outside the grid still land in the nearest card.
export function indexUnderPoint(slots: readonly FrozenSlot[], x: number, y: number): number | null {
  let best: FrozenSlot | null = null
  let bestContains = false
  let bestDistance = Infinity
  for (const slot of slots) {
    const contains = x >= slot.left && x < slot.right && y >= slot.top && y < slot.bottom
    const dx = x < slot.left ? slot.left - x : x >= slot.right ? x - slot.right : 0
    const dy = y < slot.top ? slot.top - y : y >= slot.bottom ? y - slot.bottom : 0
    const outside = Math.hypot(dx, dy)
    if (!contains && outside > 20) continue
    const midX = (slot.left + slot.right) / 2
    const midY = (slot.top + slot.bottom) / 2
    const centerDistance = Math.hypot(midX - x, midY - y)
    const closer = contains === bestContains ? centerDistance < bestDistance : contains
    if (!best || closer) {
      best = slot
      bestContains = contains
      bestDistance = centerDistance
    }
  }
  return best ? best.index : null
}
