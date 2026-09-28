import { build } from "esbuild";
import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
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
  target: "es2022",
  legalComments: "eof"
});
console.log("Android web assets built: dist/mobile");
