import { useState } from 'react'
import { podcastApi } from '../api/client'
import LoadingSpinner from './LoadingSpinner'

function PodcastForm({ onSuccess }) {
  const [feedUrl, setFeedUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await podcastApi.addFromFeed(feedUrl)
      setFeedUrl('')
      if (onSuccess) onSuccess()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add podcast')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card-flat p-6">
      <h2 className="heading-md mb-4">Add Podcast</h2>

      <div className="flex gap-3">
        <input
          type="url"
          value={feedUrl}
          onChange={(e) => setFeedUrl(e.target.value)}
          placeholder="Enter RSS feed URL..."
          className="flex-1 px-4 py-2 rounded-lg focus:outline-none focus:ring-2"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)'
          }}
          required
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary flex items-center gap-2"
        >
          {loading ? (
            <>
              <LoadingSpinner size="sm" />
              Adding...
            </>
          ) : (
            <>
              <span>➕</span>
              Add Podcast
            </>
          )}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-sm" style={{ color: 'var(--error)' }}>{error}</p>
      )}
    </form>
  )
}

export default PodcastForm
