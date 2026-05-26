import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Mic } from 'lucide-react'
import './index.css'

function Overlay() {
  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center text-[#F7F1EA]">
      <div
        className="w-[300px] rounded-2xl border border-white/15 px-4 py-3"
        style={{
          background: 'rgba(40, 35, 32, 0.88)',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.28)',
          backdropFilter: 'blur(18px)',
        }}
      >
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[#D15F54]">
            <span className="absolute inset-0 rounded-full bg-[#D15F54] opacity-35 animate-ping" />
            <Mic size={18} strokeWidth={1.8} className="relative" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight">Recording...</div>
            <div className="mt-0.5 text-xs text-[#D8CEC6]">Press Ctrl+Shift+Space again or Esc</div>
          </div>
          <div className="ml-auto text-sm tabular-nums text-[#D8CEC6]">00:00</div>
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
)
