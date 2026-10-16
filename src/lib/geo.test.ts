import { describe, expect, test } from 'vitest'
import fieldsJson from '../../data/fields.json'
import type { Field } from '../data/types'
import { kmBetween, utmToLatLon } from './geo'

const location = (fieldsJson as unknown as { fields: Field[] }).fields.find((f) => f.id === 'location')!
const groups = location.groups!
const points = groups.flatMap((g) => g.points ?? [])
const collars = location.settled_by!.collars!
const backed = location.settled_by!.side!

describe('UTM to latitude and longitude', () => {
  test('matches what pyproj gave build_data.py for every UTM point on the file', () => {
    const utm = points.filter((p) => p.how.startsWith('UTM'))
    expect(utm.length).toBeGreaterThan(0)
    for (const p of utm) {
      const [e, n] = (p.written.match(/\d{6,7}/g) ?? []).map(Number)
      const got = utmToLatLon(10, e, n)
      expect(got.lat).toBeCloseTo(p.lat, 4)
      expect(got.lon).toBeCloseTo(p.lon, 4)
    }
  })
})

describe('what the location map draws', () => {
  test('its gap label, the nearest pair across the two sides, is the 62.0 km on the file', () => {
    let best = Infinity
    for (const a of groups[0].points!) for (const b of groups[1].points!) best = Math.min(best, kmBetween(a, b))
    expect(best.toFixed(1)).toBe(location.distance_km!.toFixed(1))
  })

  test('all 26 collars it draws sit within the 2.6 km of side A that code found, and 61.1 km or more from side B', () => {
    const cs = collars.map((c) => utmToLatLon(10, Number(c.easting), Number(c.northing)))
    expect(cs).toHaveLength(26)
    const near = (c: { lat: number; lon: number }, side: number) => Math.min(...groups[side].points!.map((p) => kmBetween(c, p)))
    const farthest = Math.max(...cs.map((c) => near(c, backed)))
    const other = Math.min(...cs.map((c) => near(c, 1 - backed)))
    expect(farthest.toFixed(1)).toBe(location.settled_by!.farthest_km!.toFixed(1))
    expect(other.toFixed(1)).toBe(location.settled_by!.other_km!.toFixed(1))
  })
})
