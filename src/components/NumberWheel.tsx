import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type PointerEvent, type UIEvent } from 'react'

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
  const inputRef = useRef<HTMLInputElement>(null)
  const drag = useRef<Drag | null>(null)
  const dragging = useRef(false)
  const onChangeRef = useRef(onChange)
  const [partial, setPartial] = useState<string | null>(null)
  const [tracked, setTracked] = useState(value)
  const values = Array.from({ length: max + 1 }, (_, index) => index)
  const digits = String(max).length

  if (value !== tracked) {
    setTracked(value)
    if (partial != null && (partial === '' || Number(partial) !== value)) setPartial(null)
  }

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus({ preventScroll: true })
    input.select()
  }, [])

  useLayoutEffect(() => {
    const node = scroller.current
    if (!node || dragging.current) return
    const top = value * itemSize(node)
    if (Math.abs(node.scrollTop - top) < 1) return
    node.scrollTop = top
  }, [value])

  useEffect(() => {
    const blockSelect = (event: Event) => {
      if (document.documentElement.hasAttribute('data-wheel-drag')) event.preventDefault()
    }
    document.addEventListener('selectstart', blockSelect)
    return () => {
      document.removeEventListener('selectstart', blockSelect)
      document.documentElement.removeAttribute('data-wheel-drag')
    }
  }, [])

  useEffect(() => {
    const node = scroller.current
    if (!node) return
    const blockSelect = (event: Event) => event.preventDefault()
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const direction = event.deltaY === 0 ? 0 : event.deltaY > 0 ? 1 : -1
      if (direction === 0) return
      const size = itemSize(node)
      const index = clamp(Math.round(node.scrollTop / size) + direction, 0, max)
      node.scrollTo({ top: index * size, behavior: 'smooth' })
      onChangeRef.current(index)
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    node.addEventListener('selectstart', blockSelect)
    return () => {
      node.removeEventListener('wheel', onWheel)
      node.removeEventListener('selectstart', blockSelect)
    }
  }, [max])

  function onScroll(event: UIEvent<HTMLDivElement>) {
    const index = clamp(Math.round(event.currentTarget.scrollTop / itemSize(event.currentTarget)), 0, max)
    if (index !== value) onChangeRef.current(index)
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    const node = event.currentTarget
    node.focus({ preventScroll: true })
    node.setPointerCapture(event.pointerId)
    dragging.current = true
    drag.current = { y: event.clientY, scroll: node.scrollTop, moved: false }
    document.documentElement.setAttribute('data-wheel-drag', '')
    window.getSelection()?.removeAllRanges()
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (!current) return
    event.preventDefault()
    window.getSelection()?.removeAllRanges()
    const delta = event.clientY - current.y
    if (!current.moved && Math.abs(delta) < 3) return
    current.moved = true
    event.currentTarget.scrollTop = current.scroll - delta
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    document.documentElement.removeAttribute('data-wheel-drag')
    const current = drag.current
    drag.current = null
    dragging.current = false
    if (!current) return
    const node = event.currentTarget
    if (current.moved) swallowClick()
    const size = itemSize(node)
    if (!current.moved) {
      const contentY = event.clientY - node.getBoundingClientRect().top + node.scrollTop
      const index = clamp(Math.floor((contentY - padSize(node)) / size), 0, max)
      node.scrollTo({ top: index * size, behavior: 'smooth' })
      if (index !== value) onChangeRef.current(index)
      return
    }
    const index = clamp(Math.round(node.scrollTop / size), 0, max)
    node.scrollTo({ top: index * size, behavior: 'smooth' })
    if (index !== value) onChangeRef.current(index)
  }

  function onType(event: ChangeEvent<HTMLInputElement>) {
    const typed = event.target.value.replace(/\D/g, '').slice(0, digits)
    if (typed === '') {
      setPartial('')
      return
    }
    const next = Number(typed)
    if (next > max) return
    const done = typed.length >= digits || next * 10 > max
    if (done) {
      setPartial(null)
      if (next !== value) onChangeRef.current(next)
      requestAnimationFrame(() => inputRef.current?.select())
      return
    }
    setPartial(typed)
    if (next !== value) onChangeRef.current(next)
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      setPartial(null)
      inputRef.current?.select()
      return
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const base = partial != null && partial !== '' ? Number(partial) : value
      const next = clamp(base + (event.key === 'ArrowUp' ? -1 : 1), 0, max)
      setPartial(null)
      if (next !== value) onChangeRef.current(next)
      requestAnimationFrame(() => inputRef.current?.select())
    }
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
    const node = scroller.current
    node?.scrollTo({ top: next * (node ? itemSize(node) : ITEM), behavior: 'smooth' })
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
          onMouseDown={(event) => event.preventDefault()}
          onDragStart={(event) => event.preventDefault()}
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
        <input
          ref={inputRef}
          className="wheel-input"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          aria-label={`Type ${label.toLowerCase()}`}
          value={partial ?? String(value).padStart(2, '0')}
          onChange={onType}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={() => setPartial(null)}
          onKeyDown={onInputKeyDown}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        />
      </div>
      <span className="wheel-caption">{label}</span>
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function itemSize(node: HTMLElement): number {
  const child = node.firstElementChild
  return child instanceof HTMLElement && child.offsetHeight > 0 ? child.offsetHeight : ITEM
}

function padSize(node: HTMLElement): number {
  return Number.parseFloat(getComputedStyle(node).paddingTop) || 0
}

function swallowClick() {
  const block = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    window.removeEventListener('click', block, true)
  }
  window.addEventListener('click', block, true)
  window.setTimeout(() => window.removeEventListener('click', block, true), 0)
}
