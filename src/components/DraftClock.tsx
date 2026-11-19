// The plus at the end of the clock list. Clicking it creates a real paused
// clock immediately; there is no separate draft form.

type DraftClockProps = {
  onAdd: () => void
}

export function DraftClock({ onAdd }: DraftClockProps) {
  return (
    <button type="button" className="draft-prompt" aria-label="Add a clock" onClick={onAdd}>
      <span className="draft-plus" aria-hidden="true">
        +
      </span>
    </button>
  )
}
