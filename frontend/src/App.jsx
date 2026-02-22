import { useState, useEffect } from 'react'
import { Routes, Route, Link, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import PodcastDetail from './pages/PodcastDetail'
import DigestDetail from './pages/DigestDetail'
import RevCounter from './components/RevCounter'

// Corporate blue waveform colors
const sageColors = ['#bfdbfe', '#93c5fd', '#3b82f6', '#bae6fd', '#c7d2fe']

function Waveform({ bars = 5 }) {
  const heights = [40, 70, 100, 60, 80]
  return (
    <div className="waveform">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className="waveform-bar"
          style={{ height: `${heights[i % heights.length]}%`, background: sageColors[i % sageColors.length] }}
        />
      ))}
    </div>
  )
}

function App() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header
        className="sticky top-0 z-50 transition-all duration-300"
        style={{
          backgroundColor: 'rgba(241, 245, 249, 0.95)',
          backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${scrolled ? 'var(--border-subtle)' : 'rgba(226,232,240,0.4)'}`,
        }}
      >
        <div className="container-wide">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 group">
              <div className="relative">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shadow-sm"
                  style={{ background: 'linear-gradient(135deg, var(--accent-400), var(--accent-500))' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" x2="12" y1="19" y2="22"/>
                  </svg>
                </div>
                <div
                  className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 animate-pulse"
                  style={{ backgroundColor: 'var(--success)', borderColor: 'rgba(241,245,249,0.95)' }}
                />
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-sm tracking-tight" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                  Podcast Intelligence
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Whisper + Claude
                </span>
              </div>
            </Link>

            {/* Right side: waveform decoration */}
            <div className="flex items-center gap-4">
              <Waveform bars={5} />
            </div>
          </div>
        </div>
      </header>

      <RevCounter />

      {/* Main Content */}
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/podcast/:id" element={
            <div className="container-wide py-8">
              <PodcastDetail />
            </div>
          } />
          <Route path="/digests" element={<Navigate to="/" replace />} />
          <Route path="/digest/:id" element={
            <div className="container-wide py-8">
              <DigestDetail />
            </div>
          } />
        </Routes>
      </main>
    </div>
  )
}

export default App
