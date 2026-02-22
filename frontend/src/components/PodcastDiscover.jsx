import { useState, useEffect } from 'react'
import { podcastApi } from '../api/client'
import LoadingSpinner from './LoadingSpinner'

function PodcastDiscover({ existingPodcasts, onPodcastAdded }) {
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState({})
  const [added, setAdded] = useState(new Set())
  const [isOpen, setIsOpen] = useState(false)

  const fetchSuggestions = async () => {
    if (suggestions.length > 0) {
      setIsOpen(true)
      return
    }
    setLoading(true)
    setError('')
    try {
      const response = await podcastApi.discover()
      setSuggestions(response.data)
      setIsOpen(true)
    } catch (err) {
      setError('Failed to fetch suggestions')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (podcast) => {
    setAdding(prev => ({ ...prev, [podcast.itunes_id]: true }))
    try {
      await podcastApi.addFromFeed(podcast.feed_url)
      setAdded(prev => new Set([...prev, podcast.itunes_id]))
      if (onPodcastAdded) onPodcastAdded()
    } catch (err) {
      setError(`Failed to add "${podcast.title}"`)
    } finally {
      setAdding(prev => ({ ...prev, [podcast.itunes_id]: false }))
    }
  }

  if (!existingPodcasts?.length) return null

  return (
    <div>
      <button
        onClick={() => {
          if (isOpen) {
            setIsOpen(false)
          } else {
            fetchSuggestions()
          }
        }}
        disabled={loading}
        className="btn btn-secondary text-sm"
      >
        {loading ? (
          <LoadingSpinner size="sm" />
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            <line x1="11" y1="8" x2="11" y2="14"/>
            <line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        )}
        {isOpen ? 'Hide Suggestions' : 'Discover Similar Podcasts'}
      </button>

      {error && (
        <div className="mt-3 flex items-center gap-2">
          <div className="indicator indicator-error" style={{ width: '6px', height: '6px' }} />
          <span className="text-xs" style={{ color: 'var(--error)' }}>{error}</span>
        </div>
      )}

      {isOpen && suggestions.length > 0 && (
        <div className="mt-4 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <p className="text-small">
              Based on your {existingPodcasts.length} subscribed podcast{existingPodcasts.length !== 1 ? 's' : ''}
            </p>
            <span className="text-micro">{suggestions.length} found</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {suggestions.map(podcast => {
              const isAdded = added.has(podcast.itunes_id)
              const isAdding = adding[podcast.itunes_id]

              return (
                <div
                  key={podcast.itunes_id}
                  className="flex items-start gap-3 p-3 rounded-xl transition-all border"
                  style={{
                    backgroundColor: isAdded ? 'var(--success-muted)' : 'var(--bg-deep)',
                    borderColor: isAdded ? 'rgba(60, 179, 113, 0.2)' : 'var(--border-subtle)'
                  }}
                >
                  {podcast.image_url ? (
                    <img
                      src={podcast.image_url}
                      alt={podcast.title}
                      className="w-14 h-14 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg shrink-0 flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)' }}>
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      </svg>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {podcast.title}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                      {podcast.artist}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      {podcast.genre && (
                        <span className="tag text-xs py-0 px-1.5">{podcast.genre}</span>
                      )}
                      {podcast.episode_count > 0 && (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {podcast.episode_count} ep.
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleAdd(podcast)}
                    disabled={isAdded || isAdding}
                    className="shrink-0 mt-0.5"
                    title={isAdded ? 'Added' : `Add "${podcast.title}"`}
                  >
                    {isAdding ? (
                      <LoadingSpinner size="sm" />
                    ) : isAdded ? (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--success-muted)' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--success)' }}>
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                        style={{ backgroundColor: 'var(--accent-50)', color: 'var(--accent-500)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--accent-100)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--accent-50)' }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="12" y1="5" x2="12" y2="19"/>
                          <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                      </div>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {isOpen && suggestions.length === 0 && !loading && (
        <div className="mt-4 text-center py-8">
          <p className="text-small">No suggestions found. Try adding more podcasts first.</p>
        </div>
      )}
    </div>
  )
}

export default PodcastDiscover
