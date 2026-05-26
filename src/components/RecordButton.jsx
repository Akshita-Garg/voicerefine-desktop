import { useEffect } from 'react'
import { Mic, Square } from 'lucide-react'
import { useAudioRecorder } from '../hooks/useAudioRecorder'

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function RecordButton({ onAudioReady, isProcessing, onRecordingChange, disabled }) {
  const { state, countdown, audioBlob, error, toggle } = useAudioRecorder()

  useEffect(() => {
    if (audioBlob) onAudioReady?.(audioBlob)
  }, [audioBlob, onAudioReady])

  useEffect(() => {
    onRecordingChange?.(state === 'recording')
  }, [state, onRecordingChange])

  const isRecording = state === 'recording'
  const isBlocked   = disabled || isProcessing

  const buttonStyle = isRecording
    ? { background: '#7FAF8F', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }
    : { background: 'rgba(213, 120, 105, 0.12)', boxShadow: '0 2px 4px rgba(58,47,42,0.06)' }

  const buttonClass = isRecording
    ? 'ring-4 ring-[#7FAF8F]/35'
    : isBlocked
      ? 'border-2 border-[rgba(213,120,105,0.4)] opacity-40 cursor-not-allowed'
      : 'border-2 border-[rgba(213,120,105,0.4)] hover:scale-105'

  const iconColor = isRecording ? '#F4F7F5' : '#8A766E'

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={toggle}
        disabled={isBlocked}
        style={buttonStyle}
        className={`
          relative w-20 h-20 rounded-full
          flex items-center justify-center transition-all duration-200
          ${buttonClass}
        `}
        aria-label={isRecording ? 'Stop recording' : 'Start recording'}
      >
        <span className={isProcessing ? 'animate-spin-slow' : ''}>
          {isRecording
            ? <Square size={28} strokeWidth={1.75} color={iconColor} fill={iconColor} />
            : <Mic size={28} strokeWidth={1.75} color={iconColor} />
          }
        </span>
        {isRecording && (
          <span className="absolute inset-0 rounded-full animate-ping bg-[#7FAF8F] opacity-20" />
        )}
      </button>

      <div className="text-[13px] text-[#8A766E] h-5 tabular-nums">
        {isProcessing
          ? 'Transcribing...'
          : isRecording
            ? `${formatTime(countdown)} / 03:00`
            : 'Click to record'}
      </div>

      {error === 'permission_denied' && (
        <p className="text-red-700 text-sm text-center max-w-xs">
          Microphone access denied. Allow microphone access in system settings and reload.
        </p>
      )}
      {error === 'unavailable' && (
        <p className="text-red-700 text-sm text-center max-w-xs">
          Could not access your microphone. Make sure it is connected and try again.
        </p>
      )}
    </div>
  )
}
