import { useState, useEffect, useRef } from 'react'
import { analysisApi } from '../api/client'
import LoadingSpinner from './LoadingSpinner'

function SummaryView({ episode, onAnalyze, autoShowTranscript = false }) {
  const [analysis, setAnalysis] = useState(null)
  const [showTranscript, setShowTranscript] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const transcriptRef = useRef(null)

  useEffect(() => {
    if (episode?.status === 'completed') {
      analysisApi.getAnalysis(episode.id)
        .then(res => setAnalysis(res.data))
        .catch(() => setAnalysis(null))
    }
  }, [episode?.id, episode?.status])

  useEffect(() => {
    if (autoShowTranscript && episode?.status === 'completed' && episode?.transcript) {
      setShowTranscript(true)
    }
  }, [autoShowTranscript, episode?.status, episode?.transcript])

  // Scroll transcript to highlighted position
  useEffect(() => {
    if (highlightIdx >= 0 && transcriptRef.current) {
      const ratio = highlightIdx / (episode?.transcript?.length || 1)
      transcriptRef.current.scrollTop = ratio * transcriptRef.current.scrollHeight
    }
  }, [highlightIdx])

  const findBestPassage = (keyPoint) => {
    const transcript = episode?.transcript
    if (!transcript) return -1
    const words = keyPoint.split(/\s+/).filter(w => w.length > 4).map(w => w.toLowerCase())
    if (words.length === 0) return 0
    const windowSize = 300
    let bestIdx = 0
    let bestScore = -1
    for (let i = 0; i < transcript.length - windowSize; i += 50) {
      const window = transcript.substring(i, i + windowSize).toLowerCase()
      const score = words.reduce((acc, w) => acc + (window.includes(w) ? 1 : 0), 0)
      if (score > bestScore) {
        bestScore = score
        bestIdx = i
      }
    }
    return bestIdx
  }

  const handleSourceLink = (text) => {
    const idx = findBestPassage(text)
    setShowTranscript(true)
    setHighlightIdx(idx)
  }

  const renderSourceButton = (text) => (
    <button
      onClick={() => handleSourceLink(text)}
      title="Find in transcript"
      className="ml-1 shrink-0 text-xs rounded px-1 transition-colors"
      style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', lineHeight: '1.4' }}
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent-500)'; e.currentTarget.style.borderColor = 'var(--accent-400)' }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
    >
      🔍
    </button>
  )

  const statusConfig = {
    pending: { tag: 'tag', label: 'Pending' },
    processing: { tag: 'tag-warning', label: 'Processing' },
    completed: { tag: 'tag-success', label: 'Completed' },
    failed: { tag: 'tag-error', label: 'Failed' }
  }

  if (!episode) return null

  const status = statusConfig[episode.status] || statusConfig.pending

  const sections = [
    {
      key: 'key_points',
      data: analysis?.key_points,
      title: 'Key Points',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="8" y1="6" x2="21" y2="6"/>
          <line x1="8" y1="12" x2="21" y2="12"/>
          <line x1="8" y1="18" x2="21" y2="18"/>
          <line x1="3" y1="6" x2="3.01" y2="6"/>
          <line x1="3" y1="12" x2="3.01" y2="12"/>
          <line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
      ),
      render: (items) => (
        <ul className="space-y-2">
          {items.map((point, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="text-xs mt-1 shrink-0" style={{ color: 'var(--accent-500)' }}>{i + 1}.</span>
              <span className="text-body flex-1">{point}</span>
              {episode.transcript && renderSourceButton(point)}
            </li>
          ))}
        </ul>
      )
    },
    {
      key: 'themes',
      data: analysis?.themes,
      title: 'Themes',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
          <line x1="7" y1="7" x2="7.01" y2="7"/>
        </svg>
      ),
      render: (items) => (
        <div className="flex flex-wrap gap-2">
          {items.map((theme, i) => (
            <span key={i} className="tag-accent text-xs">{theme}</span>
          ))}
        </div>
      )
    },
    {
      key: 'predictions',
      data: analysis?.predictions,
      title: 'Predictions',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      ),
      render: (items) => (
        <ul className="space-y-2">
          {items.map((pred, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="shrink-0" style={{ color: 'var(--processing)' }}>&rarr;</span>
              <span className="text-body flex-1">{pred}</span>
              {episode.transcript && renderSourceButton(pred)}
            </li>
          ))}
        </ul>
      )
    },
    {
      key: 'recommendations',
      data: analysis?.recommendations,
      title: 'Recommendations',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      ),
      render: (items) => (
        <ul className="space-y-2">
          {items.map((rec, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="shrink-0" style={{ color: 'var(--success)' }}>&#10003;</span>
              <span className="text-body flex-1">{rec}</span>
              {episode.transcript && renderSourceButton(rec)}
            </li>
          ))}
        </ul>
      )
    },
    {
      key: 'advice',
      data: analysis?.advice,
      title: 'Key Advice',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
      ),
      render: (items) => (
        <ul className="space-y-2">
          {items.map((adv, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="shrink-0" style={{ color: 'var(--warning)' }}>&#8226;</span>
              <span className="text-body flex-1">{adv}</span>
              {episode.transcript && renderSourceButton(adv)}
            </li>
          ))}
        </ul>
      )
    }
  ]

  // Render transcript with optional highlight
  const renderTranscript = () => {
    const transcript = episode.transcript
    if (!transcript) return null
    if (highlightIdx < 0) {
      return <div ref={transcriptRef} className="mt-4 p-4 rounded-lg text-sm whitespace-pre-wrap max-h-96 overflow-y-auto animate-fade-in" style={{ backgroundColor: 'var(--bg-deep)', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>{transcript}</div>
    }
    const before = transcript.substring(0, highlightIdx)
    const match = transcript.substring(highlightIdx, highlightIdx + 200)
    const after = transcript.substring(highlightIdx + 200)
    return (
      <div ref={transcriptRef} className="mt-4 p-4 rounded-lg text-sm whitespace-pre-wrap max-h-96 overflow-y-auto animate-fade-in" style={{ backgroundColor: 'var(--bg-deep)', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
        {before}
        <mark style={{ backgroundColor: 'var(--pastel-wheat)', color: 'var(--text-primary)', borderRadius: '3px', padding: '0 2px' }}>{match}</mark>
        {after}
      </div>
    )
  }

  return (
    <div className="panel overflow-hidden">
      {/* Episode header */}
      <div className="p-5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="heading-lg flex-1" style={{ fontFamily: 'var(--font-display)' }}>
            {episode.title}
          </h2>
          <span className={`${status.tag} text-xs shrink-0`}>{status.label}</span>
        </div>
        {episode.published_at && (
          <p className="text-small mt-2 flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Published: {new Date(episode.published_at).toLocaleDateString()}
          </p>
        )}
      </div>

      <div className="p-5">
        {/* Pending state */}
        {episode.status === 'pending' && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: 'var(--bg-elevated)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)' }}>
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" x2="12" y1="19" y2="22"/>
              </svg>
            </div>
            <p className="text-body mb-4">This episode hasn't been analyzed yet.</p>
            <button onClick={onAnalyze} className="btn btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Analyze Episode
            </button>
          </div>
        )}

        {/* Processing state */}
        {episode.status === 'processing' && (
          <div className="py-12">
            <LoadingSpinner message="Analyzing episode..." />
          </div>
        )}

        {/* Failed state */}
        {episode.status === 'failed' && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: 'var(--error-muted)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--error)' }}>
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--error)' }}>
              {episode.summary || 'Analysis failed'}
            </p>
            <button onClick={onAnalyze} className="btn btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              Retry Analysis
            </button>
          </div>
        )}

        {/* Completed state */}
        {episode.status === 'completed' && (
          <div className="space-y-6 stagger-children">
            {/* Overview */}
            {analysis?.overview && (
              <div>
                <h3 className="text-micro mb-2">Overview</h3>
                <p className="text-body">{analysis.overview}</p>
              </div>
            )}

            {/* Dynamic sections */}
            {sections.map(section => {
              if (!section.data?.length) return null
              return (
                <div key={section.key}>
                  <div className="flex items-center gap-2 mb-3">
                    <span style={{ color: 'var(--text-muted)' }}>{section.icon}</span>
                    <h3 className="text-micro">{section.title}</h3>
                  </div>
                  {section.render(section.data)}
                </div>
              )
            })}

            {/* Notable Quotes */}
            {analysis?.notable_quotes?.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)' }}>
                    <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/>
                    <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
                  </svg>
                  <h3 className="text-micro">Notable Quotes</h3>
                </div>
                <div className="space-y-3">
                  {analysis.notable_quotes.map((quote, i) => (
                    <blockquote
                      key={i}
                      className="pl-4 py-2 text-sm italic"
                      style={{
                        borderLeft: '2px solid var(--accent-400)',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      &ldquo;{quote}&rdquo;
                    </blockquote>
                  ))}
                </div>
              </div>
            )}

            {/* Fallback to plain summary */}
            {!analysis && episode.summary && (
              <div className="whitespace-pre-wrap text-body">{episode.summary}</div>
            )}

            {/* Transcript toggle */}
            {episode.transcript && (
              <div className="pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <button
                  onClick={() => { setShowTranscript(!showTranscript); if (showTranscript) setHighlightIdx(-1) }}
                  className="flex items-center gap-2 font-medium text-sm transition-colors"
                  style={{ color: 'var(--accent-500)' }}
                >
                  <svg
                    width="14" height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="transition-transform"
                    style={{ transform: showTranscript ? 'rotate(90deg)' : 'rotate(0deg)' }}
                  >
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                  {showTranscript ? 'Hide' : 'Show'} Full Transcript
                </button>

                {showTranscript && renderTranscript()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default SummaryView
