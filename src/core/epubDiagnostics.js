const DEFAULT_MIN_TEXT_CHARS = 500;
const DEFAULT_IMAGE_HEAVY_RATIO = 0.45;

function countWords(text) {
  const normalized = typeof text === "string" ? text.trim() : "";

  if (!normalized) {
    return 0;
  }

  return normalized.split(/\s+/u).filter(Boolean).length;
}

export function createEpubContentSample(input = {}) {
  const text = typeof input.text === "string" ? input.text.replace(/\s+/gu, " ").trim() : "";
  const textLength = typeof input.textLength === "number" && Number.isFinite(input.textLength)
    ? Math.max(0, input.textLength)
    : text.length;
  const wordCount = typeof input.wordCount === "number" && Number.isFinite(input.wordCount)
    ? Math.max(0, input.wordCount)
    : countWords(text);

  return {
    textLength,
    wordCount,
    imageCount: Math.max(0, Number(input.imageCount) || 0),
    mediaCount: Math.max(0, Number(input.mediaCount) || 0),
    spineItemCount: Math.max(0, Number(input.spineItemCount) || 0)
  };
}

export function summarizeEpubContent(samples = [], options = {}) {
  const normalizedSamples = Array.isArray(samples)
    ? samples.map((sample) => createEpubContentSample(sample))
    : [];
  const summary = normalizedSamples.reduce(
    (total, sample) => ({
      textLength: total.textLength + sample.textLength,
      wordCount: total.wordCount + sample.wordCount,
      imageCount: total.imageCount + sample.imageCount,
      mediaCount: total.mediaCount + sample.mediaCount,
      spineItemCount: total.spineItemCount + sample.spineItemCount
    }),
    {
      textLength: 0,
      wordCount: 0,
      imageCount: 0,
      mediaCount: 0,
      spineItemCount: 0
    }
  );
  const minTextChars = typeof options.minTextChars === "number"
    ? options.minTextChars
    : DEFAULT_MIN_TEXT_CHARS;
  const imageHeavyRatio = typeof options.imageHeavyRatio === "number"
    ? options.imageHeavyRatio
    : DEFAULT_IMAGE_HEAVY_RATIO;
  const contentSignals = summary.textLength + summary.imageCount + summary.mediaCount;
  const visualRatio = contentSignals > 0
    ? (summary.imageCount + summary.mediaCount) / contentSignals
    : 0;
  const warnings = [];

  if (summary.textLength > 0 && summary.textLength < minTextChars) {
    warnings.push({
      code: "low-text",
      message: "This EPUB has very little selectable text."
    });
  }

  if (summary.textLength === 0 && (summary.imageCount || summary.mediaCount)) {
    warnings.push({
      code: "image-only",
      message: "This EPUB appears to be image-only, so text-only mode may hide most content."
    });
  } else if (visualRatio >= imageHeavyRatio && summary.imageCount + summary.mediaCount >= 5) {
    warnings.push({
      code: "image-heavy",
      message: "This EPUB contains many visual elements, so it may load slowly or use more memory."
    });
  }

  return {
    ...summary,
    visualRatio,
    warnings
  };
}
