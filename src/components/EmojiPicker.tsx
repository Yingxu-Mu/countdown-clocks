import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { loadEmojiCatalog, type CatalogGroup } from '../emojiCatalog'
import { isImageIcon, isQuickEmoji } from '../icons'

const SKIN_TONES = [
  { label: 'Default', sample: '👋' },
  { label: 'Light', sample: '👋🏻' },
  { label: 'Medium-light', sample: '👋🏼' },
  { label: 'Medium', sample: '👋🏽' },
  { label: 'Medium-dark', sample: '👋🏾' },
  { label: 'Dark', sample: '👋🏿' },
] as const

const SEARCH_ALIASES: Record<string, readonly string[]> = {
  girl: ['woman', 'female'],
  boy: ['man', 'male'],
  tech: ['technologist', 'computer', 'laptop', 'coder', 'software', 'developer'],
  code: ['coder', 'developer', 'programmer', 'software', 'technologist'],
  focus: ['target', 'brain'],
}

type EmojiPickerProps = {
  selected: string
  onSelect: (emoji: string) => void
}

export function EmojiPicker({ selected, onSelect }: EmojiPickerProps) {
  const pickerId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [tone, setTone] = useState(0)
  const [groups, setGroups] = useState<CatalogGroup[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [groupId, setGroupId] = useState<string | null>(null)

  const customEmoji = !isImageIcon(selected) && !isQuickEmoji(selected)

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => searchRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (!open || groups || failed) return
    let cancelled = false
    loadEmojiCatalog()
      .then((catalog) => {
        if (!cancelled) setGroups(catalog)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [open, groups, failed])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const visibleGroups = useMemo(() => {
    if (!groups) return []
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return groups
    return groups
      .map((group) => ({
        ...group,
        emojis: group.emojis.filter((emoji) => tokens.every((token) => matchesToken(emoji.search, token))),
      }))
      .filter((group) => group.emojis.length > 0)
  }, [groups, query])

  function choose(emoji: string) {
    onSelect(emoji)
    setOpen(false)
  }

  const searching = query.trim() !== ''
  const activeGroupId = groupId ?? groups?.[0]?.id
  const shownGroups = searching ? visibleGroups : visibleGroups.filter((group) => group.id === activeGroupId)

  return (
    <div className="emoji-picker-root" ref={rootRef}>
      <button
        type="button"
        className="upload-btn"
        aria-expanded={open}
        aria-controls={pickerId}
        aria-pressed={open || customEmoji}
        onClick={() => {
          setFailed(false)
          setOpen((current) => !current)
        }}
      >
        All emojis
      </button>
      {open ? (
        <div className="emoji-picker" id={pickerId} role="dialog" aria-label="All emojis">
          <input
            ref={searchRef}
            className="emoji-search"
            type="text"
            value={query}
            placeholder="Search all emojis"
            aria-label="Search all emojis"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.preventDefault()
            }}
          />
          <div className="emoji-tones" role="group" aria-label="Skin tone">
            {SKIN_TONES.map((option, index) => (
              <button
                key={option.label}
                type="button"
                className="emoji-btn tone-btn"
                aria-pressed={tone === index}
                aria-label={option.label}
                onClick={() => setTone(index)}
              >
                {option.sample}
              </button>
            ))}
          </div>
          {groups && !searching ? (
            <div className="emoji-categories" role="group" aria-label="Emoji categories">
              {groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className="chip"
                  aria-pressed={group.id === activeGroupId}
                  onClick={() => setGroupId(group.id)}
                >
                  {group.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="emoji-browser">
            {!groups && !failed ? <p className="emoji-status">Loading emojis…</p> : null}
            {failed ? <p className="emoji-status">The emoji list could not be loaded.</p> : null}
            {groups && shownGroups.length === 0 ? (
              <p className="emoji-status">No emoji matches that search.</p>
            ) : null}
            {groups
              ? shownGroups.map((group) => (
                  <section key={group.id} data-group={group.id} className="emoji-group">
                    <h3>{group.label}</h3>
                    <div className="emoji-browser-grid">
                      {group.emojis.map((emoji) => {
                        const native = emoji.skins[tone] ?? emoji.skins[0]
                        if (!native) return null
                        const toneName = tone > 0 ? SKIN_TONES[tone]?.label : undefined
                        return (
                          <button
                            key={emoji.id}
                            type="button"
                            className="emoji-btn"
                            aria-pressed={selected === native}
                            aria-label={toneName ? `${emoji.name}, ${toneName}` : emoji.name}
                            onClick={() => choose(native)}
                          >
                            {native}
                          </button>
                        )
                      })}
                    </div>
                  </section>
                ))
              : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function matchesToken(haystack: string, token: string): boolean {
  if (haystack.includes(token)) return true
  const aliases = SEARCH_ALIASES[token]
  return aliases?.some((alias) => haystack.includes(alias)) ?? false
}
