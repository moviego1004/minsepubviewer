// Writes src/core/openSourceNotices.js: the libraries and fonts the app ships with, their
// versions, copyright lines and full license texts, for the in-app "About" dialog.
// Run after adding or updating a shipped library: npm.cmd run notices
// (test/core/openSourceNotices.test.js fails when a version here no longer matches node_modules.)
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "src", "core", "openSourceNotices.js");

const MIT = (copyright) => `MIT License

${copyright}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

// package: read the version from node_modules; version: fixed (code bundled inside another library).
// file: license text in the repository; text: written here when the package has no license file.
const ENTRIES = [
  { name: "Capacitor", package: "@capacitor/core", license: "MIT", copyright: "Copyright (c) 2017-present Drifty Co.", file: "node_modules/@capacitor/core/LICENSE" },
  { name: "Capacitor Android", package: "@capacitor/android", license: "MIT", copyright: "Copyright (c) 2017-present Drifty Co.", file: "node_modules/@capacitor/android/LICENSE" },
  { name: "Capacitor App", package: "@capacitor/app", license: "MIT", copyright: "Copyright 2020-present Ionic", file: "node_modules/@capacitor/app/LICENSE" },
  { name: "PDF.js", package: "pdfjs-dist", license: "Apache-2.0", copyright: "Copyright Mozilla Foundation", file: "node_modules/pdfjs-dist/LICENSE" },
  { name: "docx-preview", package: "docx-preview", license: "Apache-2.0", copyright: "Copyright Volodymyr Baydalka", file: "node_modules/docx-preview/LICENSE" },
  { name: "epub.js", package: "epubjs", license: "BSD-2-Clause", copyright: "Copyright (c) 2013, FuturePress", file: "node_modules/epubjs/license" },
  { name: "mammoth", package: "mammoth", license: "BSD-2-Clause", copyright: "Copyright (c) 2013, Michael Williamson", file: "node_modules/mammoth/LICENSE" },
  // Dual MIT/GPL-3.0: used under MIT, so only the MIT part of the file is shown.
  { name: "JSZip", package: "jszip", license: "MIT", copyright: "Copyright (c) 2009-2016 Stuart Knightley, David Duponchel, Franz Buchinger, António Afonso", file: "node_modules/jszip/LICENSE.markdown", until: "GNU GENERAL PUBLIC LICENSE" },
  { name: "pako", package: "pako", license: "MIT AND Zlib", copyright: "Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn", file: "node_modules/pako/LICENSE" },
  { name: "TOAST UI Editor", package: "@toast-ui/editor", license: "MIT", copyright: "Copyright (c) NHN Cloud Corp.", text: MIT("Copyright (c) NHN Cloud Corp.") },
  { name: "DOMPurify", version: "2.3.3", license: "Apache-2.0 OR MPL-2.0", copyright: "Copyright (c) Cure53 and other contributors", file: "node_modules/dompurify/LICENSE" },
  { name: "tslib", version: "", license: "0BSD", copyright: "Copyright (c) Microsoft Corporation", file: "node_modules/tslib/LICENSE.txt" },
  { name: "fromcodepoint", version: "0.2.1", license: "MIT", copyright: "Copyright Mathias Bynens", text: MIT("Copyright Mathias Bynens <https://mathiasbynens.be/>") },
  { name: "hwpjs (hwp-core)", package: "@ohah/hwpjs", license: "MIT", copyright: "Copyright (c) 2021 ohah", file: "web/vendor/hwp/LICENSE.hwpjs.txt" },
  { name: "Nanum Gothic", package: "@fontsource/nanum-gothic", license: "OFL-1.1", copyright: "Copyright © 2010 NHN Corporation", file: "node_modules/@fontsource/nanum-gothic/LICENSE" },
  { name: "Nanum Myeongjo", package: "@fontsource/nanum-myeongjo", license: "OFL-1.1", copyright: "Copyright © 2010 NHN Corporation", file: "node_modules/@fontsource/nanum-myeongjo/LICENSE" },
  { name: "Noto Sans Symbols 2", package: "@fontsource/noto-sans-symbols-2", license: "OFL-1.1", copyright: "Copyright 2022 The Noto Project Authors", file: "node_modules/@fontsource/noto-sans-symbols-2/LICENSE" },
  { name: "Foxit fonts (PDF.js)", version: "", license: "BSD-3-Clause", copyright: "Copyright 2014 PDFium Authors", file: "node_modules/pdfjs-dist/standard_fonts/LICENSE_FOXIT" },
  { name: "Liberation Sans (PDF.js)", version: "", license: "GPL-2.0 with font exception", copyright: "Copyright Red Hat, Inc.", file: "node_modules/pdfjs-dist/standard_fonts/LICENSE_LIBERATION" }
];

function readLicense(entry) {
  if (entry.text) return entry.text;
  let text = fs.readFileSync(path.join(root, entry.file), "utf8").replace(/\r\n/g, "\n");
  if (entry.until) text = text.slice(0, text.indexOf(entry.until));
  return text.trim();
}

const notices = ENTRIES.map((entry) => ({
  name: entry.name,
  package: entry.package || "",
  version: entry.package ? JSON.parse(fs.readFileSync(path.join(root, "node_modules", entry.package, "package.json"), "utf8")).version : entry.version,
  license: entry.license,
  copyright: entry.copyright,
  text: readLicense(entry)
}));

fs.writeFileSync(out, `// Generated by scripts/build-notices.cjs. Do not edit by hand: run npm.cmd run notices.
export const OPEN_SOURCE_NOTICES = ${JSON.stringify(notices, null, 2)};
`, "utf8");
console.log(`Wrote ${path.relative(root, out)} (${notices.length} entries)`);
