import type { EmojiMartData } from '@emoji-mart/data'

export type CatalogEmoji = {
  id: string
  name: string
  search: string
  skins: readonly string[]
}

export type CatalogGroup = {
  id: string
  label: string
  emojis: readonly CatalogEmoji[]
}

const GROUP_LABELS: Record<string, string> = {
  people: 'Smileys',
  nature: 'Nature',
  foods: 'Food',
  activity: 'Activity',
  places: 'Places',
  objects: 'Objects',
  symbols: 'Symbols',
  flags: 'Flags',
}

let catalogPromise: Promise<CatalogGroup[]> | null = null

export function loadEmojiCatalog(): Promise<CatalogGroup[]> {
  catalogPromise ??= import('@emoji-mart/data')
    .then((module) => buildCatalog(unwrapData(module)))
    .catch((error: unknown) => {
      catalogPromise = null
      throw error
    })
  return catalogPromise
}

function unwrapData(module: unknown): EmojiMartData {
  if (isData(module)) return module
  if (module && typeof module === 'object' && 'default' in module && isData(module.default)) {
    return module.default
  }
  throw new Error('Could not load emojis.')
}

function isData(value: unknown): value is EmojiMartData {
  return typeof value === 'object' && value !== null && 'categories' in value && 'emojis' in value
}

function buildCatalog(data: EmojiMartData): CatalogGroup[] {
  return data.categories.flatMap((category) => {
    const emojis = category.emojis.flatMap((id) => {
      const emoji = data.emojis[id]
      const skins = emoji?.skins.map((skin) => skin.native).filter((native) => native.length > 0)
      if (!emoji || !skins || skins.length === 0) return []
      return [
        {
          id: emoji.id,
          name: emoji.name,
          search: `${emoji.name} ${emoji.keywords.join(' ')}`.toLowerCase(),
          skins,
        },
      ]
    })
    if (emojis.length === 0) return []
    return [{ id: category.id, label: GROUP_LABELS[category.id] ?? category.id, emojis }]
  })
}
