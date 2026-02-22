import { useState, useEffect, useRef } from 'react'
import { analysisApi } from '../api/client'

const STEP_LABELS = {
  starting: 'Starting up',
  downloading: 'Downloading audio',
  transcribing: 'Transcribing',
  analyzing: 'Analysing with Claude',
}

function RevCounter() {
  const animRef = useRef(null)
  const currentRef = useRef(0)
  const targetRef = useRef(0)
  const mounted = useRef(true)
  const [displayLoad, setDisplayLoad] = useState(0)
  const [processing, setProcessing] = useState([])
  const [counts, setCounts] = useState({})
  const [minimised, setMinimised] = useState(false)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await analysisApi.getProgress()
        const proc = res.data?.counts?.processing ?? 0
        targetRef.current = Math.min(proc / 3, 1)
        setProcessing(res.data?.episodes?.filter(e => e.status === 'processing') ?? [])
        setCounts(res.data?.counts ?? {})
      } catch {
        // ignore transient errors
      }
    }
    poll()
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [])

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

  const cx = 24, cy = 20, r = 14
  const startDeg = 135
  const sweepDeg = 270
  const toRad = d => d * Math.PI / 180
  const pt = (deg, rad) => ({
    x: cx + rad * Math.cos(toRad(deg)),
    y: cy + rad * Math.sin(toRad(deg)),
  })
  const arcD = (from, to, rad) => {
    const s = pt(from, rad)
    const e = pt(to, rad)
    const span = ((to - from) % 360 + 360) % 360
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${rad} ${rad} 0 ${span > 180 ? 1 : 0} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`
  }

  const activeEndDeg = startDeg + displayLoad * sweepDeg
  const needlePt = pt(activeEndDeg, r - 3)
  const arcColor = displayLoad < 0.4 ? '#3b82f6' : displayLoad < 0.7 ? '#e8a317' : '#d95050'
  const active = displayLoad > 0.05

  if (!active) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-50 rounded-2xl shadow-lg overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        width: '280px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      }}
    >
      {/* Header bar */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        style={{ borderBottom: minimised ? 'none' : '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-secondary)' }}
        onClick={() => setMinimised(v => !v)}
      >
        {/* Mini gauge */}
        <svg width="48" height="34" viewBox="0 0 48 34" style={{ overflow: 'visible', flexShrink: 0 }}>
          <path d={arcD(startDeg, startDeg + sweepDeg, r)} fill="none" stroke="#e2e8f0" strokeWidth="2.5" strokeLinecap="round" />
          {displayLoad > 0.02 && (
            <path d={arcD(startDeg, activeEndDeg, r)} fill="none" stroke={arcColor} strokeWidth="2.5" strokeLinecap="round" />
          )}
          <circle cx={cx} cy={cy} r="2.5" fill={arcColor} />
          <line x1={cx} y1={cy} x2={needlePt.x.toFixed(2)} y2={needlePt.y.toFixed(2)} stroke="#0f172a" strokeWidth="1.2" strokeLinecap="round" />
        </svg>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
            {processing.length} episode{processing.length !== 1 ? 's' : ''} processing
          </p>
          {counts.completed > 0 && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {counts.completed} done
              {counts.failed > 0 && `, ${counts.failed} failed`}
            </p>
          )}
        </div>

        {/* Chevron */}
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ color: 'var(--text-muted)', transform: minimised ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </div>

      {/* Episode list */}
      {!minimised && (
        <div className="overflow-y-auto" style={{ maxHeight: '220px' }}>
          {processing.length === 0 ? (
            <p className="px-3 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>Wrapping up…</p>
          ) : (
            processing.map(ep => (
              <div key={ep.id} className="flex items-start gap-2.5 px-3 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="indicator indicator-processing shrink-0" style={{ width: '6px', height: '6px', marginTop: '4px' }} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>{ep.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: arcColor }}>
                    {ep.step ? STEP_LABELS[ep.step] || ep.step : 'Queued'}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default RevCounter
