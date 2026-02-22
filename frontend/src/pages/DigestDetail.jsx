import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { digestApi } from '../api/client'
import DigestView from '../components/DigestView'
import LoadingSpinner from '../components/LoadingSpinner'

function DigestDetail() {
  const { id } = useParams()
  const [digest, setDigest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchDigest = async () => {
    try {
      const response = await digestApi.get(id)
      setDigest(response.data)
      setError('')
    } catch (err) {
      setError('Failed to load digest')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDigest()
  }, [id])

  useEffect(() => {
    if (digest?.status !== 'processing') return

    const interval = setInterval(fetchDigest, 2000)
    return () => clearInterval(interval)
  }, [digest?.status])

  if (loading) {
    return (
      <div className="py-16">
        <LoadingSpinner message="Loading digest..." />
      </div>
    )
  }

  if (error || !digest) {
    return (
      <div className="panel p-8 text-center">
        <div className="indicator indicator-error mx-auto mb-3" />
        <p style={{ color: 'var(--error)' }}>{error || 'Digest not found'}</p>
        <Link
          to="/"
          className="btn btn-ghost mt-4 inline-flex"
          style={{ color: 'var(--accent-500)' }}
        >
          &larr; Back to digests
        </Link>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <Link
        to="/"
        className="inline-flex items-center gap-2 mb-6 text-sm font-medium transition-colors hover:underline"
        style={{ color: 'var(--accent-500)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="19" y1="12" x2="5" y2="12"/>
          <polyline points="12 19 5 12 12 5"/>
        </svg>
        Back to digests
      </Link>

      <DigestView digest={digest} />
    </div>
  )
}

export default DigestDetail
