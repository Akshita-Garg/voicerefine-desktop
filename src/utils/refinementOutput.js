export function cleanRefinementOutput(text) {
  if (!text) return text

  return text
    .trim()
    .replace(/^(refined (?:text|bullet list|output)|output|result)\s*:\s*/i, '')
    .replace(/^here(?:'s| is)\s+(?:the\s+)?(?:refined|cleaned|rewritten)\s+(?:text|transcript|bullet list|output)\s*:\s*/i, '')
    .trim()
}
