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

  const fetchPodcast = useCallback(async () => {
    try {
      const response = await podcastApi.get(id)
      setPodcast(response.data)

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

  const handleAnalyze = async () => {
    if (!selectedEpisode) return

    try {
      await analysisApi.analyze(id, selectedEpisode.id)
      setSelectedEpisode({ ...selectedEpisode, status: 'processing' })
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to start analysis')
    }
  }

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
      <div className="panel p-6 mb-8">
        <div className="flex items-start gap-5">
          {podcast.image_url && (
            <img
              src={podcast.image_url}
              alt={podcast.title}
              className="w-24 h-24 rounded-xl object-cover shrink-0"
              style={{ boxShadow: 'var(--shadow-elevated)' }}
            />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="heading-xl" style={{ fontFamily: 'var(--font-display)' }}>
              {podcast.title}
            </h1>
            {podcast.description && (
              <p className="text-body mt-2 line-clamp-2">{podcast.description}</p>
            )}
            <div className="flex items-center gap-4 mt-3">
              <span className="tag text-xs">
                {podcast.episodes?.length || 0} episodes
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Episode list */}
        <div className="lg:col-span-1">
          <h2 className="text-micro mb-3">Episodes</h2>
          <div
            className="panel overflow-hidden divide-y max-h-[640px] overflow-y-auto"
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
