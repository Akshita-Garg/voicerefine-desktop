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

function cleanActuallyMakeThat(text) {
  return text.replace(/\b(on|for|at|from)\s+([a-z0-9]+),?\s+actually make that\s+(.+)$/i, (_match, preposition, _oldValue, replacement) => {
    return `${preposition} ${replacement.trim()}`
  }).trim()
}

function removeFormattingCommandLines(text) {
  return text
    .replace(/\bnew thought\b\s*/gi, '')
    .split(/\r?\n/)
    .filter(line => !/^([-*]|\d+[.)])\s+(?:make a list|numbered list|new paragraph)\.?$/i.test(line.trim()))
    .join('\n')
    .trim()
}

function cleanTechnicalNumberPhrases(text) {
  return text
    .replace(/\bfour hundred and four errors\b/gi, '404 errors')
    .replace(/\bfive hundred errors\b/gi, '500 errors')
}

export function capitalizeSentenceStarts(text) {
  if (!text) return text
  return text
    // First letter of the text, and the start of each line (paragraphs/bullets),
    // skipping any leading bullet or number marker.
    .replace(/(^|\n)([ \t]*(?:[-*]\s+|\d+[.)]\s+)?)([a-z])/g, (_m, lead, prefix, ch) => `${lead}${prefix}${ch.toUpperCase()}`)
    // First letter after sentence-ending punctuation (the model often adds the
    // period but leaves the next sentence lowercase).
    .replace(/([.!?][)"']?\s+)([a-z])/g, (_m, boundary, ch) => `${boundary}${ch.toUpperCase()}`)
}

export function finalizeTransformOutput(text) {
  if (!text) return text

  const cleaned = capitalizeSentenceStarts(cleanTechnicalNumberPhrases(removeFormattingCommandLines(cleanActuallyMakeThat(cleanSpeechArtifacts(cleanRefinementOutput(text))))))
  const lines = cleaned.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const bulletLines = lines.filter(line => /^([-*]|\d+[.)])\s+/.test(line))
  if (bulletLines.length >= 2) return cleaned
  if (/[.!?)]$/.test(cleaned)) return cleaned
  if (!/[a-z0-9]$/i.test(cleaned)) return cleaned

  return `${cleaned}.`
}
