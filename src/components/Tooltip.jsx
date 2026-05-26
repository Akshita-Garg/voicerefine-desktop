// align="center" (default) — tooltip centered over the trigger
// align="left"   — tooltip anchored to the left edge, good for left-side or inline labels
// align="right"  — tooltip anchored to the right edge, good for right-side controls
// position="top" (default) — tooltip appears above the trigger
// position="bottom"        — tooltip appears below the trigger, useful when top is obscured
export function Tooltip({ text, children, align = 'center', position = 'top' }) {
  const boxPosition   = align === 'left' ? 'left-0' : align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'
  const arrowPosition = align === 'left' ? 'left-4' : align === 'right' ? 'right-4'  : 'left-1/2 -translate-x-1/2'

  const isBottom = position === 'bottom'
  const boxPlacement   = isBottom ? 'top-full mt-2'   : 'bottom-full mb-2'
  const arrowPlacement = isBottom ? 'bottom-full'      : 'top-full'
  const arrowColor     = isBottom ? 'border-b-[#E6CFC7]' : 'border-t-[#E6CFC7]'

  return (
    <div className="relative group inline-block">
      {children}
      <div
        className={`
          absolute ${boxPlacement} z-10 ${boxPosition}
          border border-[rgba(58,47,42,0.08)] text-[#3A2F2A] text-xs rounded-lg
          px-2.5 py-1.5 w-max max-w-xs text-center leading-snug
          opacity-0 group-hover:opacity-100 transition-opacity duration-150
          pointer-events-none
        `}
        style={{ background: '#E6CFC7', boxShadow: '0 2px 8px rgba(58,47,42,0.08)' }}
      >
        {text}
        <div className={`absolute ${arrowPlacement} ${arrowPosition} border-4 border-transparent ${arrowColor}`} />
      </div>
    </div>
  )
}
