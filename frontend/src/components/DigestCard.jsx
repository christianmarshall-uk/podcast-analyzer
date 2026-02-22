import { Link } from 'react-router-dom'

function DigestCard({ digest, onDelete }) {
  const statusConfig = {
    pending: { class: 'tag', dot: 'indicator', label: 'Pending' },
    processing: { class: 'tag-warning', dot: 'indicator indicator-processing', label: 'Processing' },
    completed: { class: 'tag-success', dot: 'indicator indicator-success', label: 'Complete' },
    failed: { class: 'tag-error', dot: 'indicator indicator-error', label: 'Failed' }
  }

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatDateTime = (dateStr) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const status = statusConfig[digest.status] || statusConfig.pending

  return (
    <div className="panel p-0 overflow-hidden group transition-all duration-300" style={{ '--hover-border': 'var(--border-accent)' }}>
      {/* Top accent line */}
      <div className="h-0.5 w-full" style={{
        background: digest.status === 'completed'
          ? 'linear-gradient(90deg, var(--accent-500), var(--accent-300), var(--accent-500))'
          : 'var(--border-subtle)'
      }} />

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <Link
              to={`/digest/${digest.id}`}
              className="font-semibold block truncate transition-colors"
              style={{
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-display)'
              }}
            >
              <span className="group-hover:underline">{digest.title}</span>
            </Link>
            <div className="flex items-center gap-2 mt-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)' }}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span className="text-small">
                {formatDate(digest.period_start)} &rarr; {formatDate(digest.period_end)}
              </span>
            </div>
          </div>
          <span className={`${status.class} flex items-center gap-1.5 text-xs`}>
            <span className={status.dot} style={{ width: '6px', height: '6px' }} />
            {status.label}
          </span>
        </div>

        {/* Episode count / progress detail */}
        <div className="mt-3">
          {digest.status === 'processing' && digest.processing_detail ? (
            <span className="text-small flex items-center gap-1.5" style={{ color: 'var(--processing)' }}>
              <div className="indicator indicator-processing" style={{ width: '6px', height: '6px' }} />
              {digest.processing_detail}
            </span>
          ) : (
            <span className="text-small">
              {digest.episode_count} episode{digest.episode_count !== 1 ? 's' : ''} analysed
            </span>
          )}
        </div>

        {/* Themes */}
        {digest.common_themes?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {digest.common_themes.slice(0, 3).map((theme, i) => (
              <span key={i} className="tag text-xs">{theme}</span>
            ))}
            {digest.common_themes.length > 3 && (
              <span className="tag text-xs" style={{ color: 'var(--text-muted)' }}>
                +{digest.common_themes.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div
          className="flex items-center justify-between mt-4 pt-4"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <span className="text-small">Created {formatDateTime(digest.created_at)}</span>
          <button
            onClick={() => onDelete(digest.id)}
            className="btn btn-ghost text-xs p-1.5"
            style={{ color: 'var(--error)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export default DigestCard
