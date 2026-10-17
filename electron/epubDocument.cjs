const { mkdir, readFile, rm, stat, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
// The self-contained build keeps jszip's own dependencies out of the packaged app.
const JSZip = require("jszip/dist/jszip.min.js");

const DECORATION_ATTRIBUTES = new Set([
  "align",
  "background",
  "bgcolor",
  "border",
  "cellpadding",
  "cellspacing",
  "class",
  "color",
  "face",
  "height",
  "hspace",
  "style",
  "valign",
  "vspace",
  "width"
]);

function decodeXml(value = "") {
  return String(value)
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripBom(value) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function localName(name = "") {
  return String(name).toLowerCase().split(":").pop();
}

function parseAttributes(source = "") {
  const attributes = {};
  const pattern = /([:\w.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match = pattern.exec(source);

  while (match) {
    attributes[localName(match[1])] = decodeXml(match[3] ?? match[4] ?? "");
    match = pattern.exec(source);
  }

  return attributes;
}

function findElements(xml, name) {
  const elements = [];
  const pattern = /<\s*([:\w.-]+)\b([^>]*)>/g;
  let match = pattern.exec(xml);

  while (match) {
    if (localName(match[1]) === name) {
      elements.push({
        raw: match[0],
        attributes: parseAttributes(match[2] || "")
      });
    }
    match = pattern.exec(xml);
  }

  return elements;
}

function findElementText(xml, name) {
  const pattern = new RegExp(`<\\s*([:\\w.-]+)\\b[^>]*>([\\s\\S]*?)<\\s*\\/\\s*\\1\\s*>`, "gi");
  let match = pattern.exec(xml);

  while (match) {
    if (localName(match[1]) === name) {
      return decodeXml(match[2].replace(/<[^>]+>/g, "").trim());
    }
    match = pattern.exec(xml);
  }

  return "";
}

function stripTags(value = "") {
  return decodeXml(String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function normalizeZipPath(value) {
  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

function joinZipPath(baseDir, href) {
  const decodedHref = decodeURIComponent(String(href).split("#")[0]);
  return normalizeZipPath(path.posix.normalize(path.posix.join(baseDir, decodedHref)));
}

function fileUriForPath(filePath) {
  return pathToFileURL(filePath).href;
}

function resolveExtractedAssetUri(extractRoot, sourceZipPath, value) {
  if (!value || /^(?:[a-z][a-z0-9+.-]*:|#|data:)/i.test(value)) {
    return value;
  }

  const [targetPath, hash = ""] = String(value).split("#");
  const sourceDir = path.posix.dirname(sourceZipPath);
  const assetZipPath = joinZipPath(sourceDir, targetPath);
  // Reference assets relative to the generated document (which sits at the root
  // of the extract folder) so they resolve under whatever origin serves it.
  const uri = assetZipPath.split("/").map(encodeURIComponent).join("/");

  return hash ? `${uri}#${hash}` : uri;
}

function extractBody(html) {
  const bodyMatch = /<\s*(?:[\w.-]+:)?body\b[^>]*>([\s\S]*?)<\s*\/\s*(?:[\w.-]+:)?body\s*>/i.exec(html);

  return bodyMatch ? bodyMatch[1] : html;
}

function extractTagBlocks(xml, name) {
  const blocks = [];
  const pattern = new RegExp(`<\\s*([:\\w.-]+)\\b([^>]*)>([\\s\\S]*?)<\\s*\\/\\s*\\1\\s*>`, "gi");
  let match = pattern.exec(xml);

  while (match) {
    if (localName(match[1]) === name) {
      blocks.push({
        attributes: parseAttributes(match[2] || ""),
        inner: match[3] || "",
        raw: match[0]
      });
    }
    match = pattern.exec(xml);
  }

  return blocks;
}

function findTagBlock(xml, name, predicate = () => true) {
  return extractTagBlocks(xml, name).find((block) => predicate(block));
}

function removePublisherDecoration(html, extractRoot, sourceZipPath) {
  let cleaned = html
    .replace(/<\s*(?:[\w.-]+:)?(?:script|style|link|meta|title)\b[\s\S]*?<\s*\/\s*(?:[\w.-]+:)?(?:script|style|link|meta|title)\s*>/gi, "")
    .replace(/<\s*(?:[\w.-]+:)?(?:link|meta)\b[^>]*\/?\s*>/gi, "")
    .replace(/\s(?:on\w+)\s*=\s*(".*?"|'.*?')/gi, "");

  cleaned = cleaned.replace(/<\s*([:\w.-]+)([^>]*)>/g, (full, tagName, attributeSource) => {
    const tag = localName(tagName);
    if (tag === "svg" || tag === "math") {
      return "";
    }

    const allowed = [];
    const attributes = parseAttributes(attributeSource);

    for (const [name, value] of Object.entries(attributes)) {
      if (DECORATION_ATTRIBUTES.has(name) || name.startsWith("data-") || name.startsWith("aria-")) {
        continue;
      }

      if ((name === "src" || name === "href" || name === "poster") && value) {
        allowed.push(`${name}="${escapeHtml(resolveExtractedAssetUri(extractRoot, sourceZipPath, value))}"`);
        continue;
      }

      if (name === "id" || name === "name") {
        allowed.push(`${name}="${escapeHtml(value)}"`);
        continue;
      }

      if (tag === "img" && (name === "alt" || name === "title")) {
        allowed.push(`${name}="${escapeHtml(value)}"`);
      }
    }

    const closing = /\/\s*>$/.test(full) ? " /" : "";
    return `<${tag}${allowed.length ? ` ${allowed.join(" ")}` : ""}${closing}>`;
  });

  return cleaned
    .replace(/<\s*\/\s*([:\w.-]+)\s*>/g, (_, tagName) => `</${localName(tagName)}>`)
    .replace(/<\/?(?:html|head|body)\b[^>]*>/gi, "");
}

function buildDocumentHtml({ title, sections }) {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title || "EPUB Document")}</title>
    <style>
      :root {
        color-scheme: light;
        background: #ffffff;
        color: #1f2328;
        font-family: "Segoe UI", "Malgun Gothic", system-ui, sans-serif;
        font-size: 16px;
      }

      body {
        margin: 0;
        background: #ffffff;
        color: #1f2328;
      }

      main {
        max-width: 1080px;
        margin: 0;
        padding: 40px 56px 80px;
        line-height: 1.65;
      }

      h1, h2, h3 {
        margin: 1.6em 0 0.65em;
        line-height: 1.25;
        font-weight: 700;
      }

      h1 {
        margin-top: 0;
        padding-bottom: 0.35em;
        border-bottom: 1px solid #d0d7de;
        font-size: 2rem;
      }

      h2 {
        padding-bottom: 0.25em;
        border-bottom: 1px solid #d8dee4;
        font-size: 1.5rem;
      }

      h3 {
        font-size: 1.22rem;
      }

      p, ul, ol, blockquote, pre, table {
        margin: 0 0 1em;
      }

      ul, ol {
        padding-left: 1.6em;
      }

      blockquote {
        padding: 0 1em;
        border-left: 4px solid #d0d7de;
        color: #57606a;
      }

      code, pre {
        font-family: "Cascadia Mono", Consolas, monospace;
        font-size: 0.94em;
      }

      code {
        padding: 0.15em 0.35em;
        border-radius: 4px;
        background: #f6f8fa;
      }

      pre {
        overflow: auto;
        padding: 16px;
        border-radius: 6px;
        background: #f6f8fa;
      }

      pre code {
        padding: 0;
        background: transparent;
      }

      table {
        width: 100%;
        border-spacing: 0;
        border-collapse: collapse;
      }

      th, td {
        padding: 6px 10px;
        border: 1px solid #d0d7de;
        text-align: left;
        vertical-align: top;
      }

      th {
        background: #f6f8fa;
        font-weight: 700;
      }

      img {
        display: block;
        max-width: 100%;
        height: auto;
        margin: 1em 0;
      }

      a {
        color: #0969da;
        text-decoration: none;
      }

      a:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <main>
${sections.map((section) => `<section id="${escapeHtml(section.id)}">\n${section.content}\n</section>`).join("\n<hr>\n")}
    </main>
  </body>
</html>
`;
}

function createSpineHrefMapper(spine, opfDir) {
  const indexByZipPath = new Map(spine.map((item, index) => [item.zipPath, index]));

  return function mapHref(href, baseZipPath) {
    if (!href) {
      return "";
    }

    if (/^(?:[a-z][a-z0-9+.-]*:|data:)/i.test(href)) {
      return href;
    }

    if (href.startsWith("#")) {
      return href;
    }

    const [targetPath, fragment = ""] = String(href).split("#");
    const baseDir = baseZipPath ? path.posix.dirname(baseZipPath) : opfDir;
    const targetZipPath = joinZipPath(baseDir, targetPath);
    const spineIndex = indexByZipPath.get(targetZipPath);

    if (fragment) {
      return `#${fragment}`;
    }

    if (Number.isInteger(spineIndex)) {
      return `#docpart-${spineIndex}`;
    }

    return "";
  };
}

function parseNavDocumentToc(navHtml, navZipPath, mapHref) {
  const navBlock = findTagBlock(navHtml, "nav", (block) => {
    const type = `${block.attributes.type || ""} ${block.attributes["epub:type"] || ""}`.toLowerCase();
    return type.split(/\s+/).includes("toc");
  }) || findTagBlock(navHtml, "nav");
  const source = navBlock?.inner || navHtml;
  const items = [];
  const linkPattern = /<\s*a\b([^>]*)>([\s\S]*?)<\s*\/\s*a\s*>/gi;
  let match = linkPattern.exec(source);

  while (match) {
    const attributes = parseAttributes(match[1] || "");
    const href = mapHref(attributes.href || "", navZipPath);
    const label = stripTags(match[2] || "");

    if (href && label) {
      items.push({ label, href, subitems: [] });
    }
    match = linkPattern.exec(source);
  }

  return items;
}

function parseNcxToc(ncxXml, ncxZipPath, mapHref) {
  const items = [];
  // A navPoint's navLabel and content always precede its nested child
  // navPoints, so the slice between one navPoint open tag and the next
  // contains exactly this entry's label and content. Scanning open tags
  // (instead of a backreference-based block match) avoids both the
  // container-swallowing problem and any chance of a non-advancing loop.
  const openPattern = /<\s*(?:[\w.-]+:)?navpoint\b[^>]*>/gi;
  let openMatch = openPattern.exec(ncxXml);

  while (openMatch) {
    const segmentStart = openPattern.lastIndex;
    const nextMatch = openPattern.exec(ncxXml);
    const segment = ncxXml.slice(segmentStart, nextMatch ? nextMatch.index : ncxXml.length);

    const textMatch = /<\s*(?:[\w.-]+:)?text\b[^>]*>([\s\S]*?)<\s*\/\s*(?:[\w.-]+:)?text\s*>/i.exec(segment);
    const label = textMatch ? stripTags(textMatch[1]) : "Untitled";
    const content = findElements(segment, "content")[0];
    const href = mapHref(content?.attributes?.src || "", ncxZipPath);

    if (href) {
      items.push({ label, href, subitems: [] });
    }

    openMatch = nextMatch;
  }

  return items;
}

async function readToc({ zip, manifest, opfXml, opfDir, spine, mapHref }) {
  const navItem = [...manifest.values()].find((item) => (
    String(item.properties || "").split(/\s+/).includes("nav")
  ));

  if (navItem) {
    const entry = zip.file(navItem.zipPath);
    if (entry) {
      const items = parseNavDocumentToc(stripBom(await entry.async("text")), navItem.zipPath, mapHref);
      if (items.length) {
        return items;
      }
    }
  }

  const spineElement = findElements(opfXml, "spine")[0];
  const ncxId = spineElement?.attributes?.toc || "";
  const ncxItem = manifest.get(ncxId) || [...manifest.values()].find((item) => (
    item.mediaType === "application/x-dtbncx+xml" || /\.ncx$/i.test(item.href)
  ));

  if (ncxItem) {
    const entry = zip.file(ncxItem.zipPath);
    if (entry) {
      const items = parseNcxToc(stripBom(await entry.async("text")), ncxItem.zipPath, mapHref);
      if (items.length) {
        return items;
      }
    }
  }

  return spine.map((item, index) => ({
    label: path.posix.basename(item.href, path.posix.extname(item.href)) || `Section ${index + 1}`,
    href: `#docpart-${index}`,
    subitems: []
  }));
}

async function extractZipFiles(zip, extractRoot) {
  const files = Object.values(zip.files).filter((entry) => !entry.dir);

  for (const entry of files) {
    const destination = path.join(extractRoot, ...normalizeZipPath(entry.name).split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, await entry.async("nodebuffer"));
  }
}

async function removeExtractedDocument(documentInfo) {
  if (!documentInfo?.extractRoot) {
    return;
  }

  await rm(documentInfo.extractRoot, { recursive: true, force: true });
}

async function createEpubDocument(filePath, options = {}) {
  const logger = options.logger || (() => {});
  const source = path.resolve(filePath);
  const fileBytes = await readFile(source);
  const zip = await JSZip.loadAsync(fileBytes);
  const tempBase = options.tempBase;

  if (!tempBase) {
    throw new Error("Missing EPUB temp base path");
  }

  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const extractRoot = path.join(tempBase, id);
  await mkdir(extractRoot, { recursive: true });
  await extractZipFiles(zip, extractRoot);

  const containerEntry = zip.file("META-INF/container.xml");
  if (!containerEntry) {
    throw new Error("EPUB is missing META-INF/container.xml");
  }

  const containerXml = stripBom(await containerEntry.async("text"));
  const rootfile = findElements(containerXml, "rootfile")
    .map((item) => item.attributes["full-path"])
    .find(Boolean);

  if (!rootfile) {
    throw new Error("EPUB container.xml does not point to an OPF file");
  }

  const opfPath = normalizeZipPath(rootfile);
  const opfEntry = zip.file(opfPath);
  if (!opfEntry) {
    throw new Error(`EPUB OPF file was not found: ${opfPath}`);
  }

  const opfXml = stripBom(await opfEntry.async("text"));
  const opfDir = path.posix.dirname(opfPath);
  const manifestItems = findElements(opfXml, "item");
  const manifest = new Map(manifestItems
    .filter((item) => item.attributes.id && item.attributes.href)
    .map((item) => [item.attributes.id, {
      id: item.attributes.id,
      href: item.attributes.href,
      mediaType: item.attributes["media-type"] || "",
      properties: item.attributes.properties || "",
      zipPath: joinZipPath(opfDir, item.attributes.href)
    }]));
  const spine = findElements(opfXml, "itemref")
    .map((item) => manifest.get(item.attributes.idref))
    .filter(Boolean);

  logger("epub.parsed", {
    filePath: source,
    manifestCount: manifest.size,
    spineCount: spine.length
  });

  if (!spine.length) {
    throw new Error("EPUB spine is empty");
  }

  const mapHref = createSpineHrefMapper(spine, opfDir);
  const toc = await readToc({ zip, manifest, opfXml, opfDir, spine, mapHref });
  const sections = [];
  for (const [index, item] of spine.entries()) {
    const entry = zip.file(item.zipPath);
    if (!entry || !/html|xhtml|xml/i.test(item.mediaType || item.zipPath)) {
      continue;
    }

    const html = stripBom(await entry.async("text"));
    const body = extractBody(html);
    const cleaned = removePublisherDecoration(body, extractRoot, item.zipPath).trim();
    if (cleaned) {
      sections.push({
        id: `docpart-${index}`,
        sourcePath: item.zipPath,
        content: cleaned
      });
    }
  }

  if (!sections.length) {
    throw new Error("No readable HTML spine content was found");
  }

  const title = findElementText(opfXml, "title") || path.basename(source, path.extname(source));
  const html = buildDocumentHtml({ title, sections });
  const htmlPath = path.join(extractRoot, "minsepub-document.html");
  await writeFile(htmlPath, html, "utf8");
  const htmlStats = await stat(htmlPath);

  logger("epub.html.created", {
    filePath: source,
    htmlPath,
    bytes: htmlStats.size
  });
  logger("epub.toc.created", {
    filePath: source,
    itemCount: toc.length
  });

  return {
    id,
    title,
    name: path.basename(source),
    path: source,
    size: fileBytes.byteLength,
    htmlPath,
    htmlUri: fileUriForPath(htmlPath),
    extractRoot,
    manifestCount: manifest.size,
    spineCount: spine.length,
    toc,
    htmlSize: htmlStats.size
  };
}

module.exports = {
  createEpubDocument,
  removeExtractedDocument
};
