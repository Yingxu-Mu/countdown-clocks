import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent, type UIEvent } from 'react'

const ITEM = 36

type NumberWheelProps = {
  label: string
  value: number
  max: number
  onChange: (value: number) => void
}

type Drag = {
  y: number
  scroll: number
  moved: boolean
}

export function NumberWheel({ label, value, max, onChange }: NumberWheelProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const dragging = useRef(false)
  const onChangeRef = useRef(onChange)
  const values = Array.from({ length: max + 1 }, (_, index) => index)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useLayoutEffect(() => {
    const node = scroller.current
    if (!node || dragging.current) return
    const top = value * ITEM
    if (Math.abs(node.scrollTop - top) < 1) return
    node.scrollTop = top
  }, [value])

  useEffect(() => {
    const node = scroller.current
    if (!node) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const direction = event.deltaY === 0 ? 0 : event.deltaY > 0 ? 1 : -1
      if (direction === 0) return
      const index = clamp(Math.round(node.scrollTop / ITEM) + direction, 0, max)
      node.scrollTo({ top: index * ITEM, behavior: 'smooth' })
      onChangeRef.current(index)
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [max])

  function onScroll(event: UIEvent<HTMLDivElement>) {
    const index = clamp(Math.round(event.currentTarget.scrollTop / ITEM), 0, max)
    if (index !== value) onChangeRef.current(index)
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging.current = true
    drag.current = { y: event.clientY, scroll: event.currentTarget.scrollTop, moved: false }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (!current) return
    const delta = event.clientY - current.y
    if (!current.moved && Math.abs(delta) < 3) return
    current.moved = true
    event.currentTarget.scrollTop = current.scroll - delta
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current
    drag.current = null
    dragging.current = false
    if (!current) return
    const node = event.currentTarget
    if (!current.moved) {
      const contentY = event.clientY - node.getBoundingClientRect().top + node.scrollTop
      const index = clamp(Math.floor((contentY - ITEM) / ITEM), 0, max)
      node.scrollTo({ top: index * ITEM, behavior: 'smooth' })
      if (index !== value) onChangeRef.current(index)
      return
    }
    const index = clamp(Math.round(node.scrollTop / ITEM), 0, max)
    node.scrollTo({ top: index * ITEM, behavior: 'smooth' })
    if (index !== value) onChangeRef.current(index)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let next = value
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = value - 1
    else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = value + 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = max
    else return
    event.preventDefault()
    next = clamp(next, 0, max)
    scroller.current?.scrollTo({ top: next * ITEM, behavior: 'smooth' })
    if (next !== value) onChangeRef.current(next)
  }

  return (
    <div className="wheel">
      <div className="wheel-window">
        <div className="wheel-band" aria-hidden="true" />
        <div
          ref={scroller}
          className="wheel-scroller"
          role="spinbutton"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={`${value} ${label}`}
          onScroll={onScroll}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        >
          {values.map((item) => (
            <div
              key={item}
              className="wheel-item"
              aria-hidden="true"
              data-selected={item === value ? 'true' : 'false'}
            >
              {String(item).padStart(2, '0')}
            </div>
          ))}
        </div>
      </div>
      <span className="wheel-caption">{label}</span>
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
