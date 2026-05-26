export function calculateMaxTokens(inputText) {
  const inputWordCount = inputText.split(/\s+/).filter(Boolean).length
  return Math.min(768, Math.max(96, Math.ceil(inputWordCount * 1.5)))
}
