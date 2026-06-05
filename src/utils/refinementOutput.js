export function cleanRefinementOutput(text) {
  if (!text) return text

  return text
    .trim()
    .replace(/^(refined (?:text|bullet list|output)|output|result)\s*:\s*/i, '')
    .replace(/^here(?:'s| is)\s+(?:the\s+)?(?:refined|cleaned|rewritten)\s+(?:text|transcript|bullet list|output)\s*:\s*/i, '')
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

export function finalizeTransformOutput(text) {
  if (!text) return text

  const cleaned = cleanSpeechArtifacts(cleanRefinementOutput(text))
  const lines = cleaned.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const bulletLines = lines.filter(line => /^([-*]|\d+[.)])\s+/.test(line))
  if (bulletLines.length >= 2) return cleaned
  if (/[.!?)]$/.test(cleaned)) return cleaned
  if (!/[a-z0-9]$/i.test(cleaned)) return cleaned

  return `${cleaned}.`
}
