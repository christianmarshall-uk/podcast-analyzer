import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { podcastApi, analysisApi } from '../api/client'
import SummaryView from '../components/SummaryView'
import LoadingSpinner from '../components/LoadingSpinner'

function PodcastDetail() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const didAutoSelect = useRef(false)
  const [podcast, setPodcast] = useState(null)
  const [selectedEpisode, setSelectedEpisode] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [aiImageUrl, setAiImageUrl] = useState(null)
  const [generatingArtwork, setGeneratingArtwork] = useState(false)
  const [artworkError, setArtworkError] = useState(false)

  const fetchPodcast = useCallback(async () => {
    try {
      const response = await podcastApi.get(id)
      setPodcast(response.data)
      if (response.data.ai_image_url) setAiImageUrl(response.data.ai_image_url)

      if (!selectedEpisode && response.data.episodes?.length > 0 && !didAutoSelect.current) {
        didAutoSelect.current = true
        const epParam = searchParams.get('episode')
        const target = epParam
          ? response.data.episodes.find(e => e.id === parseInt(epParam))
          : null
        setSelectedEpisode(target || response.data.episodes[0])
      } else if (selectedEpisode) {
        const updated = response.data.episodes.find(e => e.id === selectedEpisode.id)
        if (updated) setSelectedEpisode(updated)
      }

      setError('')
    } catch (err) {
      setError('Failed to load podcast')
    } finally {
      setLoading(false)
    }
  }, [id, selectedEpisode])

  useEffect(() => {
    fetchPodcast()
  }, [id])

  useEffect(() => {
    if (selectedEpisode?.status !== 'processing') return

    const interval = setInterval(async () => {
      try {
        const response = await analysisApi.getSummary(selectedEpisode.id)
        setSelectedEpisode(response.data)

        if (podcast) {
          setPodcast({
            ...podcast,
            episodes: podcast.episodes.map(e =>
              e.id === response.data.id ? response.data : e
            )
          })
        }
      } catch (err) {
        // Ignore polling errors
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [selectedEpisode?.id, selectedEpisode?.status])

  const handleGenerateArtwork = async () => {
    setGeneratingArtwork(true)
    setArtworkError(false)
    try {
      const res = await podcastApi.generateArtwork(id)
      setAiImageUrl(res.data.ai_image_url)
      setPodcast(prev => prev ? { ...prev, ai_image_prompt: res.data.ai_image_prompt } : prev)
    } catch {
      setArtworkError(true)
      setTimeout(() => setArtworkError(false), 3000)
    } finally {
      setGeneratingArtwork(false)
    }
  }

  const handleAnalyze = async () => {
    if (!selectedEpisode) return

    try {
      await analysisApi.analyze(id, selectedEpisode.id)
      setSelectedEpisode({ ...selectedEpisode, status: 'processing' })
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to start analysis')
    }
  }

  // Extract artist name from stored prompt
  const artworkArtistMatch = podcast?.ai_image_prompt?.match(/in the style of ([^.]+)\./)
  const artworkArtist = artworkArtistMatch ? artworkArtistMatch[1].trim() : null

  if (loading) {
    return (
      <div className="py-16">
        <LoadingSpinner message="Loading podcast..." />
      </div>
    )
  }

  if (error || !podcast) {
    return (
      <div className="panel p-8 text-center">
        <div className="indicator indicator-error mx-auto mb-3" />
        <p style={{ color: 'var(--error)' }}>{error || 'Podcast not found'}</p>
        <Link to="/" className="btn btn-ghost mt-4 inline-flex" style={{ color: 'var(--accent-500)' }}>
          &larr; Back to studio
        </Link>
      </div>
    )
  }

  const statusConfig = {
    pending: { tag: 'tag', label: 'pending' },
    processing: { tag: 'tag-warning', label: 'processing' },
    completed: { tag: 'tag-success', label: 'completed' },
    failed: { tag: 'tag-error', label: 'failed' }
  }

  return (
    <div className="animate-fade-in">
      {/* Back link */}
      <Link
        to="/"
        className="inline-flex items-center gap-2 mb-6 text-sm font-medium transition-colors hover:underline"
        style={{ color: 'var(--accent-500)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="19" y1="12" x2="5" y2="12"/>
          <polyline points="12 19 5 12 12 5"/>
        </svg>
        Back to studio
      </Link>

      {/* Podcast header */}
      <div className="panel mb-8 overflow-hidden">
        {/* AI artwork hero */}
        {aiImageUrl ? (
          <div className="relative" style={{ height: 'clamp(160px, 40vw, 280px)' }}>
            <img src={aiImageUrl} alt="AI artwork" className="w-full h-full object-cover" />
            <div className="absolute inset-0" style={{
              background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)'
            }} />
            <button
              onClick={handleGenerateArtwork}
              disabled={generatingArtwork}
              title={artworkArtist ? `Regenerate — currently ${artworkArtist}` : 'Generate artwork'}
              className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all"
              style={{
                backgroundColor: artworkError ? 'rgba(220,38,38,0.9)' : 'rgba(255,255,255,0.9)',
                color: artworkError ? 'white' : 'var(--accent-500)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              }}
            >
              {generatingArtwork ? <LoadingSpinner size="sm" /> : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                  <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                </svg>
              )}
            </button>
            <div className="absolute bottom-0 left-0 right-0 p-5 flex items-end gap-4">
              {podcast.image_url && (
                <img src={podcast.image_url} alt={podcast.title}
                  className="w-16 h-16 rounded-xl object-cover shrink-0"
                  style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }} />
              )}
              <div className="flex-1 min-w-0">
                <h1 className="heading-xl" style={{ color: 'white', fontFamily: 'var(--font-display)', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                  {podcast.title}
                </h1>
                <div className="flex items-center gap-3 mt-1">
                  <span className="tag text-xs">{podcast.episodes?.length || 0} episodes</span>
                  {artworkArtist && <span className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>{artworkArtist}</span>}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <div className="flex items-start gap-5">
              {podcast.image_url && (
                <img src={podcast.image_url} alt={podcast.title}
                  className="w-24 h-24 rounded-xl object-cover shrink-0"
                  style={{ boxShadow: 'var(--shadow-elevated)' }} />
              )}
              <div className="flex-1 min-w-0">
                <h1 className="heading-xl" style={{ fontFamily: 'var(--font-display)' }}>{podcast.title}</h1>
                {podcast.description && (
                  <p className="text-body mt-2 line-clamp-2">{podcast.description}</p>
                )}
                <div className="flex items-center gap-3 mt-3">
                  <span className="tag text-xs">{podcast.episodes?.length || 0} episodes</span>
                  <button
                    onClick={handleGenerateArtwork}
                    disabled={generatingArtwork}
                    className="btn btn-secondary text-xs flex items-center gap-1.5"
                  >
                    {generatingArtwork ? <LoadingSpinner size="sm" /> : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                    )}
                    {generatingArtwork ? 'Generating…' : 'Generate artwork'}
                  </button>
                  {artworkError && <span className="text-xs" style={{ color: 'var(--error)' }}>Failed, try again</span>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Episode list */}
        <div className="lg:col-span-1">
          <h2 className="text-micro mb-3">Episodes</h2>
          <div
            className="panel overflow-hidden divide-y max-h-48 lg:max-h-[640px] overflow-y-auto"
            style={{ '--tw-divide-color': 'var(--border-subtle)' }}
          >
            {podcast.episodes?.map((episode) => {
              const isSelected = selectedEpisode?.id === episode.id
              const status = statusConfig[episode.status] || statusConfig.pending

              return (
                <button
                  key={episode.id}
                  onClick={() => setSelectedEpisode(episode)}
                  className="w-full text-left p-4 transition-all hover:bg-white/[0.02]"
                  style={{
                    backgroundColor: isSelected ? 'var(--accent-50)' : 'transparent',
                    borderLeft: isSelected ? '3px solid var(--accent-400)' : '3px solid transparent'
                  }}
                >
                  <p className="font-medium text-sm truncate" style={{
                    color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'
                  }}>
                    {episode.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`${status.tag} text-xs flex items-center gap-1`}>
                      {episode.status === 'processing' && (
                        <div className="indicator indicator-processing" style={{ width: '4px', height: '4px' }} />
                      )}
                      {status.label}
                    </span>
                    {episode.published_at && (
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {new Date(episode.published_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Summary view */}
        <div className="lg:col-span-2">
          {selectedEpisode ? (
            <SummaryView episode={selectedEpisode} onAnalyze={handleAnalyze} autoShowTranscript={searchParams.get('transcript') === '1'} />
          ) : (
            <div className="panel p-12 text-center">
              <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)' }}>
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" x2="12" y1="19" y2="22"/>
                </svg>
              </div>
              <p className="text-body">Select an episode to view its analysis</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default PodcastDetail
