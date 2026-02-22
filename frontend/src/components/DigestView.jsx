import { useState } from 'react'
import { Link } from 'react-router-dom'
import { digestApi } from '../api/client'
import LoadingSpinner from './LoadingSpinner'

function DigestView({ digest }) {
  const [showEpisodes, setShowEpisodes] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const [liveImageUrl, setLiveImageUrl] = useState(digest?.image_url)
  const [refreshing, setRefreshing] = useState(false)

  const handleRefreshImage = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      const res = await digestApi.regenerateImage(digest.id)
      setLiveImageUrl(res.data.image_url)
    } catch {
      // ignore
    } finally {
      setRefreshing(false)
    }
  }

  if (!digest) {
    return (
      <div className="panel p-12 text-center">
        <p className="text-small">No digest selected</p>
      </div>
    )
  }

  if (digest.status === 'processing') {
    const steps = [
      { key: 'collecting_episodes', label: 'Reading Episodes' },
      { key: 'generating_content', label: 'Analysing with Claude' },
      { key: 'generating_image', label: 'Creating Artwork' }
    ]
    const currentIdx = steps.findIndex(s => s.key === digest.processing_step)

    return (
      <div className="panel p-8 space-y-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <LoadingSpinner size="sm" />
          <h2 className="heading-md">Generating Digest</h2>
        </div>

        <div className="space-y-3 mt-2">
          {steps.map((step, i) => {
            const isDone = currentIdx > i
            const isActive = currentIdx === i
            return (
              <div key={step.key} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all" style={{
                  backgroundColor: isDone ? 'var(--success)' : isActive ? 'var(--accent-400)' : 'var(--border-subtle)'
                }}>
                  {isDone ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ) : isActive ? (
                    <div className="w-2 h-2 rounded-full bg-white" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
                  ) : (
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--text-muted)' }} />
                  )}
                </div>
                <span className="text-sm font-medium" style={{
                  color: isDone ? 'var(--success)' : isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  opacity: isActive || isDone ? 1 : 0.4
                }}>
                  {step.label}
                </span>
                {isActive && digest.processing_detail && (
                  <span className="text-xs ml-auto text-right" style={{ color: 'var(--text-muted)', maxWidth: '60%' }}>
                    {digest.processing_detail}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {digest.processing_detail && (
          <div className="rounded-lg px-4 py-3 text-sm" style={{
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            borderLeft: '3px solid var(--accent-300)'
          }}>
            {digest.processing_detail}
          </div>
        )}
      </div>
    )
  }

  if (digest.status === 'failed') {
    return (
      <div className="panel p-12 text-center">
        <div className="indicator indicator-error mx-auto mb-3" />
        <p style={{ color: 'var(--error)' }}>{digest.summary || 'Digest generation failed'}</p>
      </div>
    )
  }

  const formatDateTime = (dateStr) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  // Extract artist name from image prompt
  const getArtistInfo = () => {
    if (!digest.image_prompt) return null
    const artistMatch = digest.image_prompt.match(/style of (\w[\w\s]+?)[\.,]/i)
    return artistMatch ? artistMatch[1].trim() : null
  }

  // Extract scene description from image prompt
  const getSceneDescription = () => {
    if (!digest.image_prompt) return null
    const sceneMatch = digest.image_prompt.match(/Scene:\s*(.+?)(?:\.|$)/i)
    return sceneMatch ? sceneMatch[1].trim() : null
  }

  const artist = getArtistInfo()
  const scene = getSceneDescription()

  const sectionConfig = [
    {
      key: 'action_items',
      data: digest.action_items,
      title: 'Action Items',
      color: 'var(--accent-500)',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
      ),
      bullet: (i) => <span className="text-sm font-bold" style={{ color: 'var(--accent-500)' }}>{i + 1}.</span>
    },
    {
      key: 'key_advice',
      data: digest.key_advice,
      title: 'Key Advice',
      color: 'var(--warning)',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
      ),
      bullet: () => <span style={{ color: 'var(--warning)' }}>&#8226;</span>
    },
    {
      key: 'predictions',
      data: digest.predictions,
      title: 'Predictions',
      color: 'var(--processing)',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      ),
      bullet: () => <span style={{ color: 'var(--processing)' }}>&rarr;</span>
    },
    {
      key: 'recommendations',
      data: digest.recommendations,
      title: 'Recommendations',
      color: 'var(--success)',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      ),
      bullet: () => <span style={{ color: 'var(--success)' }}>&#10003;</span>
    }
  ]

  return (
    <div className="animate-fade-in">
      {/* Header with image */}
      {liveImageUrl && (
        <div className="panel overflow-hidden mb-6">
          <div className="relative" style={{ height: '280px' }}>
            <img
              src={liveImageUrl}
              alt="Digest artwork"
              className="w-full h-full object-cover"
            />
            <button
              onClick={handleRefreshImage}
              disabled={refreshing}
              title="Regenerate artwork with new artist style"
              className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all"
              style={{
                backgroundColor: 'rgba(255,255,255,0.9)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                color: 'var(--accent-500)',
                zIndex: 10,
              }}
            >
              {refreshing ? (
                <LoadingSpinner size="sm" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2v6h-6"/>
                  <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                  <path d="M3 22v-6h6"/>
                  <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                </svg>
              )}
            </button>
            <div className="absolute inset-0" style={{
              background: 'linear-gradient(to top, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.3) 40%, transparent 60%)',
              pointerEvents: 'none'
            }} />
            <div className="absolute bottom-0 left-0 right-0 p-6" style={{ zIndex: 1 }}>
              <h1 className="heading-xl" style={{ color: 'var(--text-primary)' }}>{digest.title}</h1>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {formatDateTime(digest.period_start)} &rarr; {formatDateTime(digest.period_end)}
                </span>
                <button
                  onClick={() => setShowEpisodes(!showEpisodes)}
                  className="tag-accent text-xs hover:opacity-80 transition-opacity cursor-pointer"
                >
                  {digest.episode_count} episodes analysed
                </button>
              </div>
            </div>
          </div>
          {/* Artwork explanation */}
          <div className="px-6 py-4" style={{ borderTop: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-tertiary)' }}>
            <div className="flex items-start gap-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
              <div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {scene && (
                    <span>This artwork depicts <em>{scene}</em> &mdash; a visual metaphor drawn from the key stories and themes discussed across the {digest.episode_count} episodes in this digest. </span>
                  )}
                  {artist && (
                    <span>The image is rendered in the style of <strong>{artist}</strong>.</span>
                  )}
                  {!scene && !artist && digest.image_prompt && (
                    <span className="italic">{digest.image_prompt}</span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Title if no image */}
      {!liveImageUrl && (
        <div className="panel p-6 mb-6 relative overflow-hidden" style={{
          background: 'linear-gradient(135deg, var(--accent-50) 0%, var(--bg-secondary) 50%, var(--accent-50) 100%)'
        }}>
          <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, var(--pastel-peach), transparent 70%)', transform: 'translate(30%, -30%)' }} />
          <h1 className="heading-xl relative z-10">{digest.title}</h1>
          <div className="flex items-center gap-3 mt-2 relative z-10">
            <span className="text-small">
              {formatDateTime(digest.period_start)} &rarr; {formatDateTime(digest.period_end)}
            </span>
            <button
              onClick={() => setShowEpisodes(!showEpisodes)}
              className="tag-accent text-xs hover:opacity-80 transition-opacity cursor-pointer"
            >
              {digest.episode_count} episodes analysed
            </button>
          </div>
        </div>
      )}

      {/* Episodes panel */}
      {showEpisodes && digest.episodes?.length > 0 && (
        <div className="panel p-4 mb-6">
          <h3 className="text-micro mb-3">{digest.episodes.length} episodes analysed</h3>
          <div className="divide-y" style={{ '--tw-divide-color': 'var(--border-subtle)' }}>
            {digest.episodes.map(ep => (
              <div key={ep.id} className="py-2">
                {ep.podcast_id ? (
                  <Link
                    to={`/podcast/${ep.podcast_id}?episode=${ep.id}&transcript=1`}
                    className="flex items-baseline gap-2 text-sm hover:underline"
                    style={{ color: 'var(--accent-500)' }}
                  >
                    <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>{ep.podcast_title}</span>
                    <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>·</span>
                    <span>{ep.title}</span>
                  </Link>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {ep.podcast_title && <span className="text-xs mr-1" style={{ color: 'var(--text-muted)' }}>{ep.podcast_title} ·</span>}
                    {ep.title}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main content: sidebar + article */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <aside className="lg:w-64 shrink-0 space-y-4 lg:order-last">
          {/* Themes */}
          {digest.common_themes?.length > 0 && (
            <div className="panel p-4">
              <h3 className="text-micro mb-3">Themes</h3>
              <div className="flex flex-wrap gap-1.5">
                {digest.common_themes.map((theme, i) => (
                  <span key={i} className="tag text-xs">{theme}</span>
                ))}
              </div>
            </div>
          )}

          {/* Trends */}
          {digest.trends?.length > 0 && (
            <div className="panel p-4">
              <h3 className="text-micro mb-3">Trends</h3>
              <div className="space-y-2.5">
                {digest.trends.map((trend, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-body text-sm flex-1">{trend.trend}</span>
                    {trend.direction && (
                      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                        trend.direction === 'emerging' || trend.direction === 'growing'
                          ? 'tag-accent' : 'tag'
                      }`}>
                        {trend.direction}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contributing Podcasts — grouped by show */}
          {digest.episodes?.length > 0 && (() => {
            const grouped = digest.episodes.reduce((acc, ep) => {
              const key = ep.podcast_title || 'Unknown'
              if (!acc[key]) acc[key] = { podcast_id: ep.podcast_id, episodes: [] }
              acc[key].episodes.push(ep)
              return acc
            }, {})
            return (
              <div className="panel p-4">
                <h3 className="text-micro mb-3">Contributing Podcasts</h3>
                <div className="space-y-3">
                  {Object.entries(grouped).map(([podcastTitle, group]) => (
                    <div key={podcastTitle}>
                      <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                        {podcastTitle}
                        <span className="font-normal ml-1" style={{ color: 'var(--text-muted)' }}>
                          ({group.episodes.length} {group.episodes.length === 1 ? 'episode' : 'episodes'})
                        </span>
                      </p>
                      <div className="space-y-0.5 pl-2">
                        {group.episodes.map((ep) => (
                          <div key={ep.id}>
                            {ep.podcast_id ? (
                              <Link
                                to={`/podcast/${ep.podcast_id}`}
                                className="text-xs hover:underline block truncate"
                                style={{ color: 'var(--accent-500)' }}
                              >
                                • {ep.title}
                              </Link>
                            ) : (
                              <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>• {ep.title}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </aside>

        {/* Main article */}
        <article className="flex-1 min-w-0 panel p-6 lg:p-8 space-y-8">
          {/* Executive Summary */}
          {digest.summary && (
            <section>
              <h2 className="heading-lg mb-4" style={{ fontFamily: 'var(--font-display)' }}>Executive Summary</h2>
              <div className="divider mb-4" />
              <p className="text-body whitespace-pre-wrap leading-relaxed">{digest.summary}</p>
            </section>
          )}

          {/* Insights as sections */}
          {sectionConfig.map(section => {
            if (!section.data?.length) return null
            return (
              <section key={section.key}>
                <div className="flex items-center gap-2.5 mb-4">
                  <span style={{ color: section.color }}>{section.icon}</span>
                  <h2 className="heading-lg" style={{ fontFamily: 'var(--font-display)' }}>{section.title}</h2>
                </div>
                <div className="divider mb-4" />
                <ul className="space-y-3">
                  {section.data.map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="mt-0.5">{section.bullet(i)}</span>
                      <span className="text-body">{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </article>
      </div>
    </div>
  )
}

export default DigestView
