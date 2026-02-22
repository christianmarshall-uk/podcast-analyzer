import { useState, useEffect, useRef } from 'react'
import { analysisApi, digestApi } from '../api/client'
import LoadingSpinner from './LoadingSpinner'

function BatchAnalysisForm({ podcasts, onComplete, compact = false }) {
  const [period, setPeriod] = useState('week')
  const [selectedPodcasts, setSelectedPodcasts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(null)
  const [logs, setLogs] = useState([])
  const [isPolling, setIsPolling] = useState(false)
  const logRef = useRef(null)
  const pollingRef = useRef(null)
  const digestPollRef = useRef(null)
  const seenSteps = useRef(new Set())

  useEffect(() => {
    if (podcasts?.length > 0 && selectedPodcasts.length === 0) {
      setSelectedPodcasts(podcasts.map(p => p.id))
    }
  }, [podcasts])

  const togglePodcast = (id) => {
    setSelectedPodcasts(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }

  const toggleAll = () => {
    if (selectedPodcasts.length === podcasts?.length) {
      setSelectedPodcasts([])
    } else {
      setSelectedPodcasts(podcasts?.map(p => p.id) || [])
    }
  }

  const getSelectedIds = () => {
    if (selectedPodcasts.length === podcasts?.length) return null
    return selectedPodcasts.length > 0 ? selectedPodcasts : null
  }

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [...prev.slice(-20), { timestamp, message, type }])
  }

  const pollProgress = async (episodeIds) => {
    try {
      const response = await analysisApi.getProgress(episodeIds)
      setProgress(response.data)

      response.data.episodes.forEach(ep => {
        const stepKey = `${ep.id}-${ep.step}-${ep.status}`
        if (seenSteps.current.has(stepKey)) return
        seenSteps.current.add(stepKey)

        if (ep.status === 'processing' && ep.step) {
          const stepMessages = {
            'starting': 'Starting',
            'downloading': 'Downloading',
            'transcribing': 'Transcribing',
            'analyzing': 'Analysing'
          }
          addLog(`${ep.title.substring(0, 30)}... ${stepMessages[ep.step] || ep.step}`, 'processing')
        } else if (ep.status === 'completed') {
          addLog(`${ep.title.substring(0, 30)}... Done`, 'success')
        } else if (ep.status === 'failed') {
          addLog(`${ep.title.substring(0, 30)}... Failed`, 'error')
        }
      })

      const { counts } = response.data
      if (counts.processing === 0 && episodeIds) {
        clearInterval(pollingRef.current)
        setIsPolling(false)
        addLog('Complete', 'success')
        if (onComplete) onComplete()
      }
    } catch (err) {
      console.error('Failed to fetch progress:', err)
    }
  }

  const handleAnalyze = async () => {
    setError('')
    setLoading(true)
    setLogs([])
    seenSteps.current = new Set()
    addLog('Starting...', 'info')

    try {
      const response = await analysisApi.batchAnalyze(period, getSelectedIds())
      addLog(`${response.data.total_episodes} episode(s)`, 'info')

      if (response.data.processing > 0) {
        setIsPolling(true)
        pollingRef.current = setInterval(() => {
          pollProgress(response.data.episode_ids)
        }, 3000)
        await pollProgress(response.data.episode_ids)
      } else if (response.data.completed > 0) {
        addLog('Already analysed', 'success')
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed')
      addLog(`Error: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateDigest = async () => {
    setError('')
    setLoading(true)
    setLogs([])
    seenSteps.current = new Set()
    addLog('Creating digest...', 'info')

    try {
      const response = await digestApi.create(period, null, getSelectedIds())
      const digestId = response.data.id
      addLog('Digest queued — watching progress...', 'info')
      setLoading(false)
      setIsPolling(true)

      let lastDetail = null
      digestPollRef.current = setInterval(async () => {
        try {
          const statusRes = await digestApi.get(digestId)
          const d = statusRes.data

          if (d.processing_detail && d.processing_detail !== lastDetail) {
            lastDetail = d.processing_detail
            const stepIcons = {
              collecting_episodes: '📂',
              generating_content: '🤖',
              generating_image: '🎨'
            }
            const icon = stepIcons[d.processing_step] || '⏳'
            addLog(`${icon} ${d.processing_detail}`, 'processing')
          }

          if (d.status === 'completed') {
            clearInterval(digestPollRef.current)
            setIsPolling(false)
            addLog('Digest complete!', 'success')
            if (onComplete) onComplete()
          } else if (d.status === 'failed') {
            clearInterval(digestPollRef.current)
            setIsPolling(false)
            addLog('Digest generation failed', 'error')
            setError('Digest generation failed')
          }
        } catch (pollErr) {
          // ignore transient polling errors
        }
      }, 2000)

    } catch (err) {
      setError(err.response?.data?.detail || 'Failed')
      addLog(`Error: ${err.message}`, 'error')
      setLoading(false)
    }
  }

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
      if (digestPollRef.current) clearInterval(digestPollRef.current)
    }
  }, [])

  const periods = [
    { value: 'latest', label: 'Latest' },
    { value: 'day', label: '24h' },
    { value: 'week', label: 'Week' },
    { value: '2weeks', label: '2 Weeks' },
    { value: '3weeks', label: '3 Weeks' },
    { value: 'month', label: 'Month' }
  ]

  if (compact) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        {/* Period selector */}
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--bg-deep)' }}>
          {periods.map(opt => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                period === opt.value
                  ? 'shadow-sm'
                  : ''
              }`}
              style={{
                backgroundColor: period === opt.value ? 'var(--bg-elevated)' : 'transparent',
                color: period === opt.value ? 'var(--accent-500)' : 'var(--text-muted)'
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
            onClick={handleAnalyze}
            disabled={loading || isPolling}
            className="btn btn-secondary text-sm"
            title="Transcribe and analyse episodes using Whisper + Claude"
          >
            {(loading || isPolling) ? (
              <LoadingSpinner size="sm" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            )}
            Analyse
          </button>

        <button
            onClick={handleCreateDigest}
            disabled={loading || isPolling}
            className="btn btn-primary text-sm"
            title="Generate a cross-episode digest with themes, trends, and artwork"
          >
            {loading ? (
              <LoadingSpinner size="sm" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3v18h18"/>
                <path d="m19 9-5 5-4-4-3 3"/>
              </svg>
            )}
            Create Digest
          </button>

        {progress && progress.counts.processing > 0 && (
          <span className="text-xs flex items-center gap-1.5" style={{ color: 'var(--processing)' }}>
            <div className="indicator indicator-processing" style={{ width: '6px', height: '6px' }} />
            Processing {progress.counts.processing}...
          </span>
        )}

        {error && (
          <span className="text-xs flex items-center gap-1.5" style={{ color: 'var(--error)' }}>
            <div className="indicator indicator-error" style={{ width: '6px', height: '6px' }} />
            {error}
          </span>
        )}
      </div>
    )
  }

  // Full version (for Digests page)
  return (
    <div className="panel p-5 space-y-4">
      {/* Controls row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--bg-deep)' }}>
          {periods.map(opt => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                period === opt.value ? 'shadow-sm' : ''
              }`}
              style={{
                backgroundColor: period === opt.value ? 'var(--bg-elevated)' : 'transparent',
                color: period === opt.value ? 'var(--accent-500)' : 'var(--text-muted)'
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
            onClick={handleAnalyze}
            disabled={loading || isPolling}
            className="btn btn-secondary text-sm"
            title="Transcribe and analyse episodes using Whisper + Claude"
          >
            {(loading || isPolling) ? (
              <LoadingSpinner size="sm" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            )}
            Analyse
          </button>

        <button
            onClick={handleCreateDigest}
            disabled={loading || isPolling}
            className="btn btn-primary text-sm"
            title="Generate a cross-episode digest with themes, trends, and artwork"
          >
            {loading ? (
              <LoadingSpinner size="sm" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3v18h18"/>
                <path d="m19 9-5 5-4-4-3 3"/>
              </svg>
            )}
            Create Digest
          </button>
      </div>

      {/* Podcast Selection */}
      {podcasts?.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={toggleAll}
            className="tag text-xs cursor-pointer transition-colors hover:bg-white/[0.05]"
          >
            {selectedPodcasts.length === podcasts.length ? 'Deselect All' : 'Select All'}
          </button>
          {podcasts.map(p => (
            <label
              key={p.id}
              className="cursor-pointer transition-all text-sm"
            >
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full transition-all"
                style={{
                  backgroundColor: selectedPodcasts.includes(p.id) ? 'var(--accent-50)' : 'var(--bg-elevated)',
                  color: selectedPodcasts.includes(p.id) ? 'var(--accent-500)' : 'var(--text-secondary)',
                  border: `1px solid ${selectedPodcasts.includes(p.id) ? 'var(--border-accent)' : 'var(--border-subtle)'}`
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedPodcasts.includes(p.id)}
                  onChange={() => togglePodcast(p.id)}
                  className="sr-only"
                />
                {selectedPodcasts.includes(p.id) && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
                {p.title}
              </span>
            </label>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2">
          <div className="indicator indicator-error" style={{ width: '6px', height: '6px' }} />
          <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>
        </div>
      )}

      {/* Progress */}
      {progress && progress.counts.processing > 0 && (
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5" style={{ color: 'var(--processing)' }}>
            <div className="indicator indicator-processing" style={{ width: '6px', height: '6px' }} />
            Processing: {progress.counts.processing}
          </span>
          <span className="flex items-center gap-1.5" style={{ color: 'var(--success)' }}>
            <div className="indicator indicator-success" style={{ width: '6px', height: '6px' }} />
            Done: {progress.counts.completed}
          </span>
        </div>
      )}

      {/* Terminal log */}
      {logs.length > 0 && (
        <div className="terminal">
          <div className="terminal-header">
            <div className="terminal-dot" style={{ backgroundColor: '#ff5f57' }} />
            <div className="terminal-dot" style={{ backgroundColor: '#febc2e' }} />
            <div className="terminal-dot" style={{ backgroundColor: '#28c840' }} />
            <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>analysis log</span>
          </div>
          <div ref={logRef} className="terminal-content">
            {logs.map((log, i) => (
              <div key={i} style={{
                color: log.type === 'error' ? 'var(--error)' :
                       log.type === 'success' ? 'var(--success)' :
                       log.type === 'processing' ? 'var(--processing)' : 'var(--text-muted)'
              }}>
                <span style={{ color: 'var(--text-muted)' }}>[{log.timestamp}]</span> {log.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default BatchAnalysisForm
