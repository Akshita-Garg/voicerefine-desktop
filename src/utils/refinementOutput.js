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
