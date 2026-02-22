import { Link } from 'react-router-dom'

function PodcastList({ podcasts, onDelete }) {
  if (podcasts.length === 0) {
    return (
      <div className="card-flat p-12 text-center">
        <p className="text-2xl mb-2">🎙️</p>
        <p className="font-medium" style={{ color: 'var(--text-primary)' }}>No podcasts yet</p>
        <p className="text-small mt-1">Add one using the form above</p>
      </div>
    )
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never'
    return new Date(dateStr).toLocaleString()
  }

  return (
    <div className="space-y-3">
      {podcasts.map((podcast) => (
        <div
          key={podcast.id}
          className="card p-4 flex items-center gap-4"
        >
          {podcast.image_url ? (
            <img
              src={podcast.image_url}
              alt={podcast.title}
              className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
            />
          ) : (
            <div
              className="w-14 h-14 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
            >
              <span className="text-2xl">🎧</span>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <Link
              to={`/podcast/${podcast.id}`}
              className="font-medium hover:underline truncate block"
              style={{ color: 'var(--accent)' }}
            >
              {podcast.title}
            </Link>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-small">{podcast.episode_count} episodes</span>
              <span className="tag text-xs" style={{
                backgroundColor: 'rgba(5, 150, 105, 0.1)',
                color: 'var(--success)'
              }}>
                {podcast.analyzed_count} analyzed
              </span>
              {podcast.auto_analyze && (
                <span className="tag text-xs">
                  Auto-analyze
                </span>
              )}
            </div>
            {podcast.last_checked_at && (
              <p className="text-small mt-1">
                Last checked: {formatDate(podcast.last_checked_at)}
              </p>
            )}
          </div>

          <button
            onClick={() => onDelete(podcast.id)}
            className="btn btn-ghost text-sm"
            style={{ color: 'var(--error)' }}
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  )
}

export default PodcastList
