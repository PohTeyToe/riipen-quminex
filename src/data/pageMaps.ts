// Where each claim's quote sits on its page (data/page_maps.json, from agent/build_page_maps.py): line boxes
// only, no page text or pictures. Loads the first time a claim opens.

export type Box = [number, number, number, number]

export interface PageMap {
  w: number
  h: number
  lines: Box[]
}

export interface Placed {
  page: string
  quote: Box[]
  value: Box[]
  near?: boolean
}

export interface PageMaps {
  pages: Record<string, PageMap>
  claims: Record<string, Placed>
}

let cache: Promise<PageMaps> | null = null

export function loadPageMaps(): Promise<PageMaps> {
  cache ??= import('../../data/page_maps.json').then((m) => m.default as unknown as PageMaps)
  return cache
}
