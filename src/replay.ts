import { useCallback, useEffect, useRef, useState } from 'react'
import { WALL } from './data/timeline'

export interface Replay {
  /** Seconds since the run started. At WALL the run shows as it finished. */
  t: number
  playing: boolean
  speed: number
  play: () => void
  pause: () => void
  seek: (t: number) => void
  setSpeed: (s: number) => void
}

export const SPEEDS = [10, 30, 60]

/** Replays the logged times at a chosen multiple of real time. Starts only when asked. */
export function useReplay(): Replay {
  const [t, setT] = useState(WALL)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(30)
  const speedRef = useRef(speed)
  speedRef.current = speed
  const tRef = useRef(t)
  tRef.current = t

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      const next = Math.min(WALL, tRef.current + ((now - last) / 1000) * speedRef.current)
      last = now
      tRef.current = next
      setT(next)
      if (next >= WALL) {
        setPlaying(false)
        return
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const play = useCallback(() => {
    if (tRef.current >= WALL) {
      tRef.current = 0
      setT(0)
    }
    setPlaying(true)
  }, [])
  const pause = useCallback(() => setPlaying(false), [])
  const seek = useCallback((v: number) => {
    const c = Math.max(0, Math.min(WALL, v))
    tRef.current = c
    setT(c)
  }, [])
  return { t, playing, speed, play, pause, seek, setSpeed }
}
