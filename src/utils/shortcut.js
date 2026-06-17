// Shared helpers for capturing and formatting the global recording shortcut.
// Used by both the Settings panel and Onboarding so the rules stay in one place.
// This is a Windows-only build, so there is no macOS Command/Cmd handling.

// Keys that are modifiers on their own. A keydown for one of these means the
// user is mid-combo (e.g. holding Alt before pressing Space) — capture should
// keep waiting rather than treat it as an invalid shortcut.
const MODIFIER_KEYS = ['Control', 'Shift', 'Alt', 'Meta', 'Super']

// Modifiers that count as a "primary" modifier. A valid global shortcut needs
// at least one of these; Shift alone is not enough (the OS rejects it).
const PRIMARY_MODIFIERS = ['Control', 'Alt', 'Super']

// Maps DOM KeyboardEvent.key values to Electron accelerator key names.
const KEY_MAP = {
  ' ': 'Space',
  Spacebar: 'Space',
  Escape: 'Esc',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Delete: 'Delete',
  Backspace: 'Backspace',
  Enter: 'Enter',
  Tab: 'Tab',
}

// True when this keydown is a bare modifier press (no real key yet).
export function isModifierOnlyEvent(event) {
  return MODIFIER_KEYS.includes(event.key)
}

// Resolve the non-modifier key from a keydown event, or null if there isn't one.
export function shortcutKeyFromEvent(event) {
  if (isModifierOnlyEvent(event)) return null
  if (KEY_MAP[event.key]) return KEY_MAP[event.key]
  if (/^F\d{1,2}$/.test(event.key)) return event.key
  if (event.key.length === 1) return event.key.toUpperCase()
  return event.key
}

// Build an Electron accelerator string (e.g. "Alt+Space") from a keydown event.
// Returns null if there is no real key yet or no primary modifier is held.
export function shortcutFromEvent(event) {
  const key = shortcutKeyFromEvent(event)
  if (!key || key === 'Esc') return null

  const modifiers = []
  if (event.ctrlKey) modifiers.push('Control')
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey) modifiers.push('Shift')
  if (event.metaKey) modifiers.push('Super') // Windows key

  const hasPrimaryModifier = modifiers.some(modifier => PRIMARY_MODIFIERS.includes(modifier))
  if (!hasPrimaryModifier) return null

  return [...modifiers, key].join('+')
}

// Turn an accelerator string into a human-friendly label (e.g. "Ctrl + Space").
export function formatShortcutLabel(accelerator) {
  return accelerator
    .replace(/Control/g, 'Ctrl')
    .replace(/Super/g, 'Win')
    .replace(/\+/g, ' + ')
}
