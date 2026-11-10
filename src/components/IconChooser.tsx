import { useState } from 'react'
import { EMOJI_OPTIONS, prepareIconFile } from '../icons'
import { ClockIcon } from './ClockIcon'
import { EmojiPicker } from './EmojiPicker'

type IconChooserProps = {
  icon: string
  onChange: (icon: string) => void
  showPreview?: boolean
}

export function IconChooser({ icon, onChange, showPreview = true }: IconChooserProps) {
  const [error, setError] = useState('')

  function choose(next: string) {
    onChange(next)
    setError('')
  }

  async function onIconFile(file: File | undefined) {
    if (!file) return
    try {
      choose(await prepareIconFile(file))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not use that image.')
    }
  }

  return (
    <div className="icon-field">
      {showPreview ? <span>Icon</span> : null}
      <div className="icon-row">
        {showPreview ? (
          <div className="icon-preview" aria-hidden="true">
            <ClockIcon icon={icon} />
          </div>
        ) : null}
        <div className="emoji-grid" role="group" aria-label="Common icons">
          {EMOJI_OPTIONS.map((option) => (
            <button
              key={option.emoji}
              type="button"
              className="emoji-btn"
              aria-pressed={icon === option.emoji}
              aria-label={option.label}
              onClick={() => choose(option.emoji)}
            >
              {option.emoji}
            </button>
          ))}
        </div>
      </div>
      <div className="icon-actions">
        <label className="upload-btn">
          Upload image
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              void onIconFile(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </label>
        <EmojiPicker selected={icon} onSelect={choose} />
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
