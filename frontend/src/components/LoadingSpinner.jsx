function LoadingSpinner({ size = 'md', message }) {
  const sizeConfig = {
    sm: { container: 'h-5 w-5', bars: 3, barWidth: 2 },
    md: { container: 'h-8 w-8', bars: 5, barWidth: 3 },
    lg: { container: 'h-12 w-12', bars: 7, barWidth: 4 }
  }

  const config = sizeConfig[size]

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      {/* Animated waveform spinner */}
      <div className="flex items-center gap-0.5" style={{ height: size === 'sm' ? '20px' : size === 'md' ? '32px' : '48px' }}>
        {Array.from({ length: config.bars }).map((_, i) => (
          <div
            key={i}
            className="rounded-full"
            style={{
              width: `${config.barWidth}px`,
              background: 'linear-gradient(to top, var(--accent-500), var(--accent-300))',
              animation: `wave 1s ease-in-out infinite`,
              animationDelay: `${i * 0.1}s`,
              height: '30%'
            }}
          />
        ))}
      </div>
      {message && (
        <p className="text-small animate-pulse">{message}</p>
      )}
      <style>{`
        @keyframes wave {
          0%, 100% { height: 30%; opacity: 0.5; }
          50% { height: 100%; opacity: 1; }
        }
      `}</style>
    </div>
  )
}

export default LoadingSpinner
