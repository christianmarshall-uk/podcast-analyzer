import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { podcastApi, analysisApi, digestApi } from '../api/client'
import DigestView from '../components/DigestView'
import DigestCard from '../components/DigestCard'
import LoadingSpinner from '../components/LoadingSpinner'

const PERIODS = [
  { value: 'latest', label: 'Latest' },
  { value: 'day', label: '24h' },
  { value: 'week', label: 'Week' },
  { value: '2weeks', label: '2W' },
  { value: '3weeks', label: '3W' },
  { value: 'month', label: 'Month' },
]

function Home() {
  // ── Data ──────────────────────────────────────────────────
  const [podcasts, setPodcasts] = useState([])
  const [digests, setDigests] = useState([])
  const [latestDigest, setLatestDigest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ── Analysis controls ─────────────────────────────────────
  const [period, setPeriod] = useState('week')
  const [selectedPodcasts, setSelectedPodcasts] = useState([])
  const [analysisRunning, setAnalysisRunning] = useState(false)
  const [digestRunning, setDigestRunning] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [logs, setLogs] = useState([])
  const [progress, setProgress] = useState(null)

  // ── Add podcast form ──────────────────────────────────────
  const [showAddForm, setShowAddForm] = useState(false)
  const [feedUrl, setFeedUrl] = useState('')
  const [addingPodcast, setAddingPodcast] = useState(false)

  // ── Discover / Search ─────────────────────────────────────
  const [discoverResults, setDiscoverResults] = useState([])
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [discoverOpen, setDiscoverOpen] = useState(false)
  const [addedFeeds, setAddedFeeds] = useState(new Set())
  const [addingFeed, setAddingFeed] = useState({})
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMode, setSearchMode] = useState('keyword')

  // ── Previous digests ──────────────────────────────────────
  const [showAllDigests, setShowAllDigests] = useState(false)

  // ── Refs ──────────────────────────────────────────────────
  const pollingRef = useRef(null)
  const digestPollRef = useRef(null)
  const seenSteps = useRef(new Set())
  const logRef = useRef(null)

  // ─────────────────────────────────────────────────────────
  const fetchData = async () => {
    try {
      const [podcastsRes, digestsRes] = await Promise.all([
        podcastApi.list(),
        digestApi.list(0, 20),
      ])
      setPodcasts(podcastsRes.data)
      setDigests(digestsRes.data)
      if (digestsRes.data.length > 0) {
        const full = await digestApi.get(digestsRes.data[0].id)
        setLatestDigest(full.data)
      } else {
        setLatestDigest(null)
      }
      setError('')
    } catch {
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  // Auto-select all podcasts on load
  useEffect(() => {
    if (podcasts.length > 0 && selectedPodcasts.length === 0) {
      setSelectedPodcasts(podcasts.map(p => p.id))
    }
  }, [podcasts])

  // Poll if latest digest is processing
  useEffect(() => {
    if (latestDigest?.status !== 'processing') return
    const interval = setInterval(fetchData, 2000)
    return () => clearInterval(interval)
  }, [latestDigest?.status])

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
      if (digestPollRef.current) clearInterval(digestPollRef.current)
    }
  }, [])

  // ─────────────────────────────────────────────────────────
  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [...prev.slice(-20), { timestamp, message, type }])
  }

  const getSelectedIds = () => {
    if (selectedPodcasts.length === podcasts.length) return null
    return selectedPodcasts.length > 0 ? selectedPodcasts : null
  }

  const pollProgress = async (episodeIds) => {
    try {
      const res = await analysisApi.getProgress(episodeIds)
      setProgress(res.data)
      res.data.episodes.forEach(ep => {
        const key = `${ep.id}-${ep.step}-${ep.status}`
        if (seenSteps.current.has(key)) return
        seenSteps.current.add(key)
        if (ep.status === 'processing' && ep.step) {
          const labels = { starting: 'Starting', downloading: 'Downloading', transcribing: 'Transcribing', analyzing: 'Analysing' }
          addLog(`${ep.title.substring(0, 30)}… ${labels[ep.step] || ep.step}`, 'processing')
        } else if (ep.status === 'completed') {
          addLog(`${ep.title.substring(0, 30)}… Done`, 'success')
        } else if (ep.status === 'failed') {
          addLog(`${ep.title.substring(0, 30)}… Failed`, 'error')
        }
      })
      if (res.data.counts.processing === 0 && episodeIds) {
        clearInterval(pollingRef.current)
        setIsPolling(false)
        addLog('Complete', 'success')
        fetchData()
      }
    } catch { /* ignore transient */ }
  }

  const handleAnalyze = async () => {
    setError('')
    setAnalysisRunning(true)
    setLogs([])
    seenSteps.current = new Set()
    addLog('Starting…', 'info')
    try {
      const res = await analysisApi.batchAnalyze(period, getSelectedIds())
      addLog(`${res.data.total_episodes} episode(s) found`, 'info')
      if (res.data.processing > 0) {
        setIsPolling(true)
        pollingRef.current = setInterval(() => pollProgress(res.data.episode_ids), 3000)
        await pollProgress(res.data.episode_ids)
      } else if (res.data.completed > 0) {
        addLog('All already analysed', 'success')
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to start analysis')
      addLog(`Error: ${err.message}`, 'error')
    } finally {
      setAnalysisRunning(false)
    }
  }

  const handleCreateDigest = async () => {
    setError('')
    setDigestRunning(true)
    setLogs([])
    seenSteps.current = new Set()
    addLog('Creating digest…', 'info')
    try {
      const res = await digestApi.create(period, null, getSelectedIds())
      const digestId = res.data.id
      addLog('Digest queued — watching progress…', 'info')
      setDigestRunning(false)
      setIsPolling(true)
      let lastDetail = null
      digestPollRef.current = setInterval(async () => {
        try {
          const statusRes = await digestApi.get(digestId)
          const d = statusRes.data
          if (d.processing_detail && d.processing_detail !== lastDetail) {
            lastDetail = d.processing_detail
            const icons = { collecting_episodes: '📂', generating_content: '🤖', generating_image: '🎨' }
            addLog(`${icons[d.processing_step] || '⏳'} ${d.processing_detail}`, 'processing')
          }
          if (d.status === 'completed') {
            clearInterval(digestPollRef.current)
            setIsPolling(false)
            addLog('Digest complete!', 'success')
            fetchData()
          } else if (d.status === 'failed') {
            clearInterval(digestPollRef.current)
            setIsPolling(false)
            addLog('Digest generation failed', 'error')
            setError('Digest generation failed')
          }
        } catch { /* ignore transient */ }
      }, 2000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create digest')
      addLog(`Error: ${err.message}`, 'error')
      setDigestRunning(false)
    }
  }

  const handleAddPodcast = async (e) => {
    e.preventDefault()
    if (!feedUrl.trim()) return
    setAddingPodcast(true)
    try {
      await podcastApi.addFromFeed(feedUrl)
      setFeedUrl('')
      setShowAddForm(false)
      await fetchData()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add podcast')
    } finally {
      setAddingPodcast(false)
    }
  }

  const handleDeletePodcast = async (id) => {
    if (!confirm('Delete this podcast and all its data?')) return
    try {
      await podcastApi.delete(id)
      await fetchData()
    } catch {
      setError('Failed to delete podcast')
    }
  }

  const handleDiscover = async () => {
    setDiscoverLoading(true)
    setSearchMode('similar')
    try {
      const res = await podcastApi.discover()
      setDiscoverResults(res.data)
      setDiscoverOpen(true)
    } catch {
      setError('Failed to fetch podcast suggestions')
    } finally {
      setDiscoverLoading(false)
    }
  }

  const handleSearch = async (e) => {
    e?.preventDefault()
    if (!searchQuery.trim()) return
    setDiscoverLoading(true)
    setSearchMode('keyword')
    try {
      const res = await podcastApi.search(searchQuery.trim())
      setDiscoverResults(res.data)
      setDiscoverOpen(true)
    } catch {
      setError('Failed to search podcasts')
    } finally {
      setDiscoverLoading(false)
    }
  }

  const handleStop = () => {
    clearInterval(pollingRef.current)
    clearInterval(digestPollRef.current)
    setIsPolling(false)
    setAnalysisRunning(false)
    setDigestRunning(false)
    addLog('Stopped.', 'error')
  }

  const handleAddDiscovered = async (podcast) => {
    setAddingFeed(prev => ({ ...prev, [podcast.itunes_id]: true }))
    try {
      await podcastApi.addFromFeed(podcast.feed_url)
      setAddedFeeds(prev => new Set([...prev, podcast.itunes_id]))
      fetchData()
    } catch {
      setError(`Failed to add "${podcast.title}"`)
    } finally {
      setAddingFeed(prev => ({ ...prev, [podcast.itunes_id]: false }))
    }
  }

  const togglePodcast = (id) =>
    setSelectedPodcasts(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])

  const isRunning = analysisRunning || digestRunning || isPolling

  // Digests: latest is digests[0], previous are digests[1..]
  const previousDigests = digests.slice(1)
  const displayedPrevious = showAllDigests ? previousDigests : previousDigests.slice(0, 4)

  // ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 56px)' }}>
        <LoadingSpinner message="Loading…" />
      </div>
    )
  }

  return (
    <div className="flex" style={{ minHeight: 'calc(100vh - 56px)', alignItems: 'flex-start' }}>

      {/* ── LEFT SIDEBAR ─────────────────────────────────── */}
      <aside
        style={{
          width: '288px',
          flexShrink: 0,
          position: 'sticky',
          top: '56px',
          height: 'calc(100vh - 56px)',
          overflowY: 'auto',
          borderRight: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <div className="p-4 space-y-5">

          {/* Library header */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-micro" style={{ color: 'var(--text-muted)' }}>YOUR LIBRARY</span>
            <button
              onClick={fetchData}
              className="btn btn-ghost p-1.5"
              title="Refresh library"
              style={{ color: 'var(--text-muted)' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 2v6h-6"/>
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                <path d="M3 22v-6h6"/>
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
              </svg>
            </button>
          </div>

          {/* Podcast list */}
          {podcasts.length === 0 ? (
            <p className="text-small text-center py-4" style={{ color: 'var(--text-muted)' }}>No podcasts yet</p>
          ) : (
            <div className="space-y-0.5">
              {podcasts.map(p => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 p-2.5 rounded-xl group transition-colors cursor-default"
                  style={{ backgroundColor: 'transparent' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  {/* Thumbnail */}
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.title} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg shrink-0 flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)' }}>
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      </svg>
                    </div>
                  )}
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{p.title}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {p.episode_count} ep
                      {p.analyzed_count > 0 && (
                        <span style={{ color: 'var(--success)' }}> • {p.analyzed_count} analysed</span>
                      )}
                    </p>
                  </div>
                  {/* Actions: link + delete */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link
                      to={`/podcast/${p.id}`}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      title="View details"
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--accent-500)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15 3 21 3 21 9"/>
                        <line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                    </Link>
                    <button
                      onClick={() => handleDeletePodcast(p.id)}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      title="Delete podcast"
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add podcast */}
          <div>
            {!showAddForm ? (
              <button
                onClick={() => setShowAddForm(true)}
                className="w-full flex items-center gap-2 p-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{ color: 'var(--accent-500)', backgroundColor: 'var(--accent-50)' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--accent-100)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--accent-50)'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add podcast from RSS
              </button>
            ) : (
              <form onSubmit={handleAddPodcast} className="space-y-2 animate-fade-in">
                <input
                  type="url"
                  value={feedUrl}
                  onChange={e => setFeedUrl(e.target.value)}
                  placeholder="Paste RSS feed URL…"
                  className="input text-sm"
                  autoFocus
                  disabled={addingPodcast}
                />
                <div className="flex gap-2">
                  <button type="submit" disabled={addingPodcast} className="btn btn-primary text-sm flex-1">
                    {addingPodcast ? <LoadingSpinner size="sm" /> : 'Add'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddForm(false); setFeedUrl('') }}
                    className="btn btn-ghost text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Find Podcasts — keyword search + similar */}
          <div>
            <div className="divider mb-4" />
            <span className="text-micro block mb-3" style={{ color: 'var(--text-muted)' }}>FIND PODCASTS</span>
            <form onSubmit={handleSearch} className="flex gap-1.5 mb-2">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search keywords…"
                className="input text-xs flex-1"
                style={{ padding: '0.5rem 0.75rem' }}
              />
              <button
                type="submit"
                disabled={discoverLoading || !searchQuery.trim()}
                className="btn btn-primary text-xs shrink-0"
                style={{ padding: '0.5rem 0.75rem' }}
              >
                {discoverLoading && searchMode === 'keyword' ? <LoadingSpinner size="sm" /> : 'Search'}
              </button>
            </form>
            {podcasts.length > 0 && (
              <button
                onClick={handleDiscover}
                disabled={discoverLoading}
                className="w-full btn btn-secondary text-xs"
              >
                {discoverLoading && searchMode === 'similar' ? <LoadingSpinner size="sm" /> : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                )}
                Similar to my library
              </button>
            )}

            {discoverOpen && discoverResults.length > 0 && (
              <div className="mt-3 space-y-1.5 animate-fade-in">
                {discoverResults.map(podcast => {
                  const isAdded = addedFeeds.has(podcast.itunes_id)
                  const isAdding = addingFeed[podcast.itunes_id]
                  return (
                    <div
                      key={podcast.itunes_id}
                      className="flex items-center gap-2 p-2 rounded-lg"
                      style={{ backgroundColor: isAdded ? 'var(--success-muted)' : 'var(--bg-tertiary)' }}
                    >
                      {podcast.image_url ? (
                        <img src={podcast.image_url} alt={podcast.title} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)' }}>
                            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                          </svg>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{podcast.title}</p>
                        {podcast.genre && (
                          <span className="tag text-xs" style={{ padding: '0 6px' }}>{podcast.genre}</span>
                        )}
                      </div>
                      <button
                        onClick={() => handleAddDiscovered(podcast)}
                        disabled={isAdded || isAdding}
                        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                        style={{
                          backgroundColor: isAdded ? 'var(--success-muted)' : 'var(--accent-50)',
                          color: isAdded ? 'var(--success)' : 'var(--accent-500)',
                        }}
                        title={isAdded ? 'Added' : `Add ${podcast.title}`}
                      >
                        {isAdding ? (
                          <LoadingSpinner size="sm" />
                        ) : isAdded ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5" y1="12" x2="19" y2="12"/>
                          </svg>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {discoverOpen && discoverResults.length === 0 && !discoverLoading && (
              <p className="text-small mt-3 text-center" style={{ color: 'var(--text-muted)' }}>
                No results found.
              </p>
            )}
          </div>
        </div>
      </aside>

      {/* ── RIGHT MAIN ────────────────────────────────────── */}
      <div className="flex-1 min-w-0" style={{ backgroundColor: 'var(--bg-deep)' }}>
        <div className="p-6 space-y-6" style={{ maxWidth: '860px' }}>

          {/* Error banner */}
          {error && (
            <div
              className="panel p-3 flex items-center gap-3 animate-fade-in"
              style={{ borderColor: 'var(--error)', backgroundColor: 'var(--error-muted)' }}
            >
              <div className="indicator indicator-error" />
              <span className="text-sm" style={{ color: 'var(--error)' }}>{error}</span>
              <button onClick={() => setError('')} className="ml-auto btn btn-ghost p-1" style={{ color: 'var(--error)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          )}

          {/* ── Analysis Controls ───────────────────────── */}
          <div>
            <h2 className="text-micro mb-3" style={{ color: 'var(--text-muted)' }}>ANALYSIS CONTROLS</h2>
            <div className="panel p-4 space-y-3">

              {/* Period selector */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Period:</span>
                <div className="flex items-center gap-0.5 p-1 rounded-lg" style={{ backgroundColor: 'var(--bg-deep)' }}>
                  {PERIODS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setPeriod(opt.value)}
                      className="px-2.5 py-1 rounded-md text-xs font-medium transition-all"
                      style={{
                        backgroundColor: period === opt.value ? 'var(--bg-elevated)' : 'transparent',
                        color: period === opt.value ? 'var(--accent-500)' : 'var(--text-muted)',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Podcast selector */}
              {podcasts.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Podcasts:</span>
                  {podcasts.map(p => (
                    <label key={p.id} className="cursor-pointer">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all"
                        style={{
                          backgroundColor: selectedPodcasts.includes(p.id) ? 'var(--accent-50)' : 'var(--bg-tertiary)',
                          color: selectedPodcasts.includes(p.id) ? 'var(--accent-600)' : 'var(--text-secondary)',
                          border: `1px solid ${selectedPodcasts.includes(p.id) ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedPodcasts.includes(p.id)}
                          onChange={() => togglePodcast(p.id)}
                          className="sr-only"
                        />
                        {selectedPodcasts.includes(p.id) && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                        {p.title}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={handleAnalyze} disabled={isRunning} className="btn btn-secondary">
                  {analysisRunning ? <LoadingSpinner size="sm" /> : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                  )}
                  Analyse Episodes
                </button>
                <button onClick={handleCreateDigest} disabled={isRunning} className="btn btn-primary">
                  {digestRunning ? <LoadingSpinner size="sm" /> : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
                    </svg>
                  )}
                  Create Digest
                </button>
                {isPolling && (
                  <>
                    <span className="text-xs flex items-center gap-1.5" style={{ color: 'var(--processing)' }}>
                      <div className="indicator indicator-processing" style={{ width: '6px', height: '6px' }} />
                      {progress?.counts?.processing
                        ? `Processing ${progress.counts.processing}…`
                        : 'Working…'}
                    </span>
                    <button onClick={handleStop} className="btn btn-ghost" style={{ color: 'var(--error)' }}>
                      ■ Stop
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Terminal log ────────────────────────────── */}
          {logs.length > 0 && (
            <div className="terminal animate-slide-up">
              <div className="terminal-header">
                <div className="terminal-dot" style={{ backgroundColor: '#ff5f57' }} />
                <div className="terminal-dot" style={{ backgroundColor: '#febc2e' }} />
                <div className="terminal-dot" style={{ backgroundColor: '#28c840' }} />
                <span className="text-xs ml-2" style={{ color: 'rgba(255,255,255,0.35)' }}>analysis log</span>
              </div>
              <div ref={logRef} className="terminal-content">
                {logs.map((log, i) => (
                  <div key={i} style={{
                    color: log.type === 'error' ? 'var(--error)'
                      : log.type === 'success' ? 'var(--success)'
                      : log.type === 'processing' ? '#7eb8f7'
                      : '#888'
                  }}>
                    <span style={{ color: '#444' }}>[{log.timestamp}]</span> {log.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Latest Digest ───────────────────────────── */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="heading-md">Latest Digest</h2>
              <div className="flex-1 divider" />
            </div>
            {latestDigest ? (
              <DigestView digest={latestDigest} />
            ) : (
              <div className="panel p-12 text-center">
                <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)' }}>
                    <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
                  </svg>
                </div>
                <p className="heading-md mb-2">No digests yet</p>
                <p className="text-body">Select a period above and click "Create Digest" to generate cross-episode insights</p>
              </div>
            )}
          </div>

          {/* ── Previous Digests ────────────────────────── */}
          {previousDigests.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="heading-md">Previous Digests</h2>
                <div className="flex-1 divider" />
                {previousDigests.length > 4 && (
                  <button
                    onClick={() => setShowAllDigests(!showAllDigests)}
                    className="btn btn-ghost text-xs"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {showAllDigests ? 'Show less' : `View all ${previousDigests.length}`}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {displayedPrevious.map(digest => (
                  <DigestCard
                    key={digest.id}
                    digest={digest}
                    onDelete={async (id) => {
                      if (!confirm('Delete this digest?')) return
                      try { await digestApi.delete(id); fetchData() } catch { setError('Failed to delete') }
                    }}
                  />
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

    </div>
  )
}

export default Home
