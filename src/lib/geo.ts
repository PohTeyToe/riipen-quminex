// Map maths for the location field, run in the browser on the run's real points and the reports' collar tables.
// kmBetween is rules.km_between; src/lib/geo.test.ts checks the map's numbers against data/fields.json.

export interface LatLon {
  lat: number
  lon: number
}

const RAD = Math.PI / 180

/** UTM (NAD83, northern hemisphere) to latitude and longitude. GRS80 ellipsoid, Snyder's inverse series. */
export function utmToLatLon(zone: number, easting: number, northing: number): LatLon {
  const a = 6378137
  const f = 1 / 298.257222101
  const k0 = 0.9996
  const e2 = f * (2 - f)
  const ep2 = e2 / (1 - e2)
  const x = easting - 500000
  const m = northing / k0
  const mu = m / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256))
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu)
  const sin1 = Math.sin(phi1)
  const cos1 = Math.cos(phi1)
  const tan1 = Math.tan(phi1)
  const n1 = a / Math.sqrt(1 - e2 * sin1 * sin1)
  const t1 = tan1 * tan1
  const c1 = ep2 * cos1 * cos1
  const r1 = (a * (1 - e2)) / (1 - e2 * sin1 * sin1) ** 1.5
  const d = x / (n1 * k0)
  const lat =
    phi1 -
    ((n1 * tan1) / r1) *
      ((d * d) / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * d ** 6) / 720)
  const lon0 = (zone - 1) * 6 - 180 + 3
  const lon =
    lon0 * RAD +
    (d - ((1 + 2 * t1 + c1) * d ** 3) / 6 + ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * d ** 5) / 120) / cos1
  return { lat: lat / RAD, lon: lon / RAD }
}

/** Great-circle distance in km, with the same Earth radius as rules.py. */
export function kmBetween(p: LatLon, q: LatLon): number {
  const r = 6371.0088
  const p1 = p.lat * RAD
  const p2 = q.lat * RAD
  const dphi = p2 - p1
  const dl = (q.lon - p.lon) * RAD
  const h = Math.sin(dphi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(h))
}

/** A flat projection in km around a centre, north up. Fine at property scale (tens of km). */
export function projector(centre: LatLon) {
  const kx = 111.32 * Math.cos(centre.lat * RAD)
  const ky = 110.57
  return {
    to: (p: LatLon) => ({ x: (p.lon - centre.lon) * kx, y: (centre.lat - p.lat) * ky }),
    back: (x: number, y: number): LatLon => ({ lat: centre.lat - y / ky, lon: centre.lon + x / kx }),
    kmPerDegLon: kx,
    kmPerDegLat: ky,
  }
}
