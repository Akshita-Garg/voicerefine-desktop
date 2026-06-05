export function cleanRefinementOutput(text) {
  if (!text) return text

  return text
    .trim()
    .replace(/^(refined (?:text|bullet list|output)|output|result)\s*:\s*/i, '')
    .replace(/^here(?:'s| is)\s+(?:the\s+)?(?:refined|cleaned|rewritten)\s+(?:text|transcript|bullet list|output)\s*:\s*/i, '')
    .replace(/^here(?:'s| is)\s+a\s+polished\s+version\s+of\s+the\s+text[^\n]*:\s*/i, '')
    .trim()
}

export function cleanSpeechArtifacts(text) {
  if (!text) return text

  return text
    .replace(/(^|[\s([{])(?:uh|um)[,.;:!?]?(?=\s|$)/gi, '$1')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+$/gm, '')
    .trim()
}

function cleanScratchThat(text) {
  return text.replace(/^.*\bscratch that\b[,.;:!?\s]*(.+)$/i, (_match, replacement) => {
    const trimmed = replacement.trim()
    if (!trimmed) return ''
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  }).trim()
}

function cleanActuallyMakeThat(text) {
  return text.replace(/\b(on|for|at|from)\s+([a-z0-9]+),?\s+actually make that\s+(.+)$/i, (_match, preposition, _oldValue, replacement) => {
    return `${preposition} ${replacement.trim()}`
  }).trim()
}

function removeFormattingCommandLines(text) {
  return text
    .split(/\r?\n/)
    .filter(line => !/^([-*]|\d+[.)])\s+(?:make a list|numbered list|new paragraph)\.?$/i.test(line.trim()))
    .join('\n')
    .trim()
}

function capitalizeFirstTextChar(text) {
  return text.replace(/^[a-z]/, char => char.toUpperCase())
}

export function finalizeTransformOutput(text) {
  if (!text) return text

  const cleaned = capitalizeFirstTextChar(removeFormattingCommandLines(cleanActuallyMakeThat(cleanScratchThat(cleanSpeechArtifacts(cleanRefinementOutput(text))))))
  const lines = cleaned.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const bulletLines = lines.filter(line => /^([-*]|\d+[.)])\s+/.test(line))
  if (bulletLines.length >= 2) return cleaned
  if (/[.!?)]$/.test(cleaned)) return cleaned
  if (!/[a-z0-9]$/i.test(cleaned)) return cleaned

  return `${cleaned}.`
}
