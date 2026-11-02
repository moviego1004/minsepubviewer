import { build } from "esbuild";
import { cp, mkdir, copyFile, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve("dist/mobile");
await mkdir(resolve(output, "web/vendor"), { recursive: true });
await mkdir(resolve(output, "vendor"), { recursive: true });
for (const name of ["styles.css", "mobile.css"]) {
  await copyFile(`web/${name}`, resolve(output, "web", name));
}
for (const name of ["toastui-editor-bundle.js", "toastui-editor-bundle.css", "toastui-editor-bundle.js.LEGAL.txt", "toastui-editor-bundle.css.LEGAL.txt"]) {
  await copyFile(`web/vendor/${name}`, resolve(output, "web/vendor", name));
}
await copyFile("node_modules/jszip/dist/jszip.min.js", resolve(output, "vendor/jszip.min.js"));
await copyFile("node_modules/epubjs/dist/epub.min.js", resolve(output, "vendor/epub.min.js"));
// PDF.js legacy build: it carries the polyfills older Android WebViews need.
const pdfjs = resolve(output, "vendor/pdfjs");
await rm(pdfjs, { recursive: true, force: true });
await mkdir(resolve(pdfjs, "build"), { recursive: true });
await mkdir(resolve(pdfjs, "web"), { recursive: true });
for (const name of ["pdf.min.mjs", "pdf.worker.min.mjs"]) {
  await copyFile(`node_modules/pdfjs-dist/legacy/build/${name}`, resolve(pdfjs, "build", name));
}
for (const name of ["pdf_viewer.mjs", "pdf_viewer.css"]) {
  await copyFile(`node_modules/pdfjs-dist/legacy/web/${name}`, resolve(pdfjs, "web", name));
}
await cp("node_modules/pdfjs-dist/legacy/web/images", resolve(pdfjs, "web/images"), { recursive: true });
for (const name of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  await cp(`node_modules/pdfjs-dist/${name}`, resolve(pdfjs, name), { recursive: true });
}
await copyFile("node_modules/pdfjs-dist/LICENSE", resolve(pdfjs, "LICENSE"));
// DOCX converters, loaded only when a DOCX file is opened: docx-preview (styled), mammoth (fallback).
await mkdir(resolve(output, "vendor/docx-preview"), { recursive: true });
await copyFile("node_modules/docx-preview/dist/docx-preview.min.js", resolve(output, "vendor/docx-preview/docx-preview.min.js"));
await copyFile("node_modules/docx-preview/LICENSE", resolve(output, "vendor/docx-preview/LICENSE"));
await mkdir(resolve(output, "vendor/mammoth"), { recursive: true });
await copyFile("node_modules/mammoth/mammoth.browser.min.js", resolve(output, "vendor/mammoth/mammoth.browser.min.js"));
await copyFile("node_modules/mammoth/LICENSE", resolve(output, "vendor/mammoth/LICENSE"));
// HWP 5.0 section decompression (see web/document-convert.js).
// HWP page view (web/hwp-wasm.js): hwpjs's parser built by scripts/build-hwp-wasm.cjs.
await mkdir(resolve(output, "vendor/hwp"), { recursive: true });
await copyFile("web/vendor/hwp/hwp_core.wasm", resolve(output, "vendor/hwp/hwp_core.wasm"));
await copyFile("web/vendor/hwp/LICENSE.hwpjs.txt", resolve(output, "vendor/hwp/LICENSE.hwpjs.txt"));
await mkdir(resolve(output, "vendor/pako"), { recursive: true });
await copyFile("node_modules/pako/dist/pako_inflate.min.js", resolve(output, "vendor/pako/pako_inflate.min.js"));
await copyFile("node_modules/pako/LICENSE", resolve(output, "vendor/pako/LICENSE"));
// Bundled Korean fonts for converted documents (see web/document-reader.js): one Korean subset
// per weight, regular and bold.
for (const id of ["nanum-gothic", "nanum-myeongjo"]) {
  const fonts = resolve(output, "vendor/fonts", id);
  await rm(fonts, { recursive: true, force: true });
  await mkdir(resolve(fonts, "files"), { recursive: true });
  for (const weight of [400, 700]) {
    const file = `${id}-korean-${weight}-normal.woff2`;
    await copyFile(`node_modules/@fontsource/${id}/files/${file}`, resolve(fonts, "files", file));
  }
  await copyFile(`node_modules/@fontsource/${id}/LICENSE`, resolve(fonts, "LICENSE"));
}
// Symbols for Wingdings characters (src/core/hwpSymbols.js): the symbols subset only.
{
  const id = "noto-sans-symbols-2";
  const fonts = resolve(output, "vendor/fonts", id);
  await rm(fonts, { recursive: true, force: true });
  await mkdir(resolve(fonts, "files"), { recursive: true });
  const file = `${id}-symbols-400-normal.woff2`;
  await copyFile(`node_modules/@fontsource/${id}/files/${file}`, resolve(fonts, "files", file));
  await copyFile(`node_modules/@fontsource/${id}/LICENSE`, resolve(fonts, "LICENSE"));
}
const html = (await readFile("web/index.html", "utf8"))
  .replace('src="/node_modules/jszip/dist/jszip.min.js"', 'src="/vendor/jszip.min.js"')
  .replace('src="/node_modules/epubjs/dist/epub.min.js"', 'src="/vendor/epub.min.js"')
  .replace('src="/web/app.js"', 'src="/web/mobile.js"')
  .replace("</head>", '  <link rel="stylesheet" href="/web/mobile.css">\n  </head>');
await writeFile(resolve(output, "index.html"), html);
await build({
  entryPoints: ["src/platform/android.js"],
  outfile: resolve(output, "web/mobile.js"),
  bundle: true,
  format: "esm",
  // Older Android System WebViews (83 on an un-updated Android 11 image) reject `||=`; esbuild lowers it.
  target: "chrome80",
  legalComments: "eof"
});
console.log("Android web assets built: dist/mobile");
