const MEDIA_SELECTORS = [
  "img",
  "svg",
  "picture",
  "video",
  "audio",
  "canvas",
  "object",
  "embed",
  "iframe"
];

export function buildTextOnlyCss(options = {}) {
  const keepCaptions = options.keepCaptions !== false;
  const hideCover = Boolean(options.hideCover);
  const hiddenSelectors = [...MEDIA_SELECTORS];

  if (!keepCaptions) {
    hiddenSelectors.push("figure", "figcaption");
  }

  if (hideCover) {
    hiddenSelectors.push("[role='doc-cover']", ".cover", "#cover");
  }

  return [
    `${hiddenSelectors.join(", ")} { display: none !important; }`,
    "* { background-image: none !important; }",
    "body { overflow-wrap: break-word; }"
  ].join("\n");
}

export function createTextOnlyPolicy(settings = {}) {
  const enabled = Boolean(settings.textOnly);

  return {
    enabled,
    css: enabled
      ? buildTextOnlyCss({
          keepCaptions: settings.keepCaptionsInTextOnly,
          hideCover: settings.hideCoverInTextOnly
        })
      : ""
  };
}

