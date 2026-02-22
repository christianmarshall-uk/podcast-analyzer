import { useState, useEffect, useRef } from 'react'
import { analysisApi } from '../api/client'

function RevCounter() {
  const animRef = useRef(null)
  const currentRef = useRef(0)
  const targetRef = useRef(0)
  const mounted = useRef(true)
  const [displayLoad, setDisplayLoad] = useState(0)

  // Track mounted state for cleanup
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  // Poll for analysis progress every 3s
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await analysisApi.getProgress()
        const processing = res.data?.counts?.processing ?? 0
        targetRef.current = Math.min(processing / 3, 1)
      } catch {
        // ignore transient errors
      }
    }
    poll()
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [])

  // Smooth animation loop via requestAnimationFrame
  useEffect(() => {
    const tick = () => {
      const diff = targetRef.current - currentRef.current
      if (Math.abs(diff) > 0.001) {
        currentRef.current += diff * 0.08
        if (mounted.current) setDisplayLoad(currentRef.current)
      }
      if (mounted.current) animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [])

  // SVG geometry: 270° sweep from 135° (bottom-left) to 45° (bottom-right) clockwise
  const cx = 36, cy = 30, r = 22
  const startDeg = 135
  const sweepDeg = 270

  const toRad = d => d * Math.PI / 180

  const pt = (angleDeg, radius) => ({
    x: cx + radius * Math.cos(toRad(angleDeg)),
    y: cy + radius * Math.sin(toRad(angleDeg)),
  })

  const arcD = (fromDeg, toDeg, radius) => {
    const s = pt(fromDeg, radius)
    const e = pt(toDeg, radius)
    const span = ((toDeg - fromDeg) % 360 + 360) % 360
    const laf = span > 180 ? 1 : 0
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${radius} ${radius} 0 ${laf} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`
  }

  const trackEndDeg = startDeg + sweepDeg
  const activeEndDeg = startDeg + displayLoad * sweepDeg
  const needlePt = pt(activeEndDeg, r - 5)

  // Color transitions: blue (idle) → amber (mid) → red (busy)
  const arcColor = displayLoad < 0.4 ? '#1d4ed8' : displayLoad < 0.7 ? '#e8a317' : '#d95050'
  const active = displayLoad > 0.05

  if (!active) return null

  return (
    <div
      className="flex items-center gap-1"
      title={`Analysis load: ${Math.round(displayLoad * 100)}%`}
    >
      <svg width="72" height="52" viewBox="0 0 72 52" style={{ overflow: 'visible' }}>
        {/* Background track */}
        <path
          d={arcD(startDeg, trackEndDeg, r)}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        {/* Active arc */}
        {displayLoad > 0.02 && (
          <path
            d={arcD(startDeg, activeEndDeg, r)}
            fill="none"
            stroke={arcColor}
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        )}
        {/* Center hub */}
        <circle cx={cx} cy={cy} r="3.5" fill={active ? arcColor : '#1d4ed8'} />
        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={needlePt.x.toFixed(2)}
          y2={needlePt.y.toFixed(2)}
          stroke="#0f172a"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Label */}
        <text
          x={cx}
          y="50"
          textAnchor="middle"
          fontSize="7"
          fontWeight="600"
          letterSpacing="0.5"
          fill={arcColor}
          fontFamily="DM Sans, sans-serif"
        >
          ACTIVE
        </text>
      </svg>
    </div>
  )
}

export default RevCounter
