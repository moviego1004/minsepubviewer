// Symbols that Hangul documents keep in Private Use Area codes, which phones have no glyphs for.
// - U+F020-F0FF: a character of a symbol font (code 0x20-0xFF). Hangul keeps them when a document
//   came from Word, often under an ordinary font name. They are read as Wingdings unless the
//   character's font names Symbol, Wingdings 2/3 or Webdings: in real documents U+F09E sits in
//   "OS·DB" and "운영·관리" and U+F06D, U+F075 start list items, which only Wingdings explains.
//   Tables: Unicode WG2 N4384 (Wingdings/Webdings, 2012) and unicode.org ADOBE/symbol.txt.
// - U+F0000 and up: Hancom's own symbol plane (the 문자표 of Hangul). There is no public table;
//   the entries below were read from the glyphs of HCR Batang (함초롬바탕, shipped with Hangul)
//   and checked by matching each glyph against the letters it should hold. Circled and boxed
//   letters that Unicode lacks become marked-up spans (.hwp-sym) holding the plain letter.
// Other Private Use Area codes (Hanyang old Hangul, other Hancom symbols) are left as they are.

const FONT_TABLES = {
  symbol: "20 21 2200 23 2203 25 26 220b 28 29 2217 2b 2c 2212 2e 2f 30 31 32 33 34 35 36 37 38 39 3a 3b 3c 3d 3e 3f 2245 391 392 3a7 394 395 3a6 393 397 399 3d1 39a 39b 39c 39d 39f 3a0 398 3a1 3a3 3a4 3a5 3c2 3a9 39e 3a8 396 5b 2234 5d 22a5 5f - 3b1 3b2 3c7 3b4 3b5 3c6 3b3 3b7 3b9 3d5 3ba 3bb b5 3bd 3bf 3c0 3b8 3c1 3c3 3c4 3c5 3d6 3c9 3be 3c8 3b6 7b 7c 7d 223c - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 20ac 3d2 2032 2264 2044 221e 192 2663 2666 2665 2660 2194 2190 2191 2192 2193 b0 b1 2033 2265 d7 221d 2202 2022 f7 2260 2261 2248 2026 - - 21b5 2135 2111 211c 2118 2297 2295 2205 2229 222a 2283 2287 2284 2282 2286 2208 2209 2220 2207 - - - 220f 221a 22c5 ac 2227 2228 21d4 21d0 21d1 21d2 21d3 25ca 2329 - - - 2211 - - - - - - - - - - - 232a 222b 2320 - 2321 - - - - - - - - - -",
  wingdings: "- 1f589 2702 2701 1f453 1f56d 1f56e 1f56f 1f57f 2706 1f582 1f583 1f4ea 1f4eb 1f4ec 1f4ed 1f5c0 1f5c1 1f5ce 1f5cf 1f5d0 1f5c4 23f3 1f5ae 1f5b0 1f5b2 1f5b3 1f5b4 1f5ab 1f5ac 2707 270d 1f58e 270c 1f58f 1f44d 1f44e 261c 261e 261d 1f597 1f590 263a 1f610 2639 1f4a3 1f571 1f3f3 1f3f1 2708 263c 1f322 2744 1f546 271e 1f548 2720 2721 262a 262f 1f549 2638 2648 2649 264a 264b 264c 264d 264e 264f 2650 2651 2652 2653 1f670 1f675 26ab 1f53e 25fc 1f78f 1f790 2751 2752 1f79f 29eb 25c6 2756 1f799 2327 2bb9 2318 1f3f5 1f3f6 1f676 1f677 - 1f10b 2780 2781 2782 2783 2784 2785 2786 2787 2788 2789 1f10c 278a 278b 278c 278d 278e 278f 2790 2791 2792 2793 1f662 1f660 1f661 1f663 1f65e 1f65c 1f65d 1f65f 2219 2022 2b1d 2b58 1f786 1f788 1f78a 1f78b 1f53f 25aa 1f78e 1f7c1 1f7c5 2605 1f7cb 1f7cf 1f7d3 1f7d1 2bd0 2316 2bce 2bcf 2bd1 272a 2730 1f550 1f551 1f552 1f553 1f554 1f555 1f556 1f557 1f558 1f559 1f55a 1f55b 2bb0 2bb1 2bb2 2bb3 2bb4 2bb5 2bb6 2bb7 1f66a 1f66b 1f655 1f654 1f657 1f656 1f650 1f651 1f652 1f653 232b 2326 2b98 2b9a 2b99 2b9b 2b88 2b8a 2b89 2b8b 1f868 1f86a 1f869 1f86b 1f86c 1f86d 1f86f 1f86e 1f878 1f87a 1f879 1f87b 1f87c 1f87d 1f87f 1f87e 21e6 21e8 21e7 21e9 2b04 21f3 2b01 2b00 2b03 2b02 1f8ac 1f8ad 1f5f6 2713 1f5f7 1f5f9 -",
  wingdings2: "- 1f58a 1f58b 1f58c 1f58d 2704 2700 1f57e 1f57d 1f5c5 1f5c6 1f5c7 1f5c8 1f5c9 1f5ca 1f5cb 1f5cc 1f5cd 1f4cb 1f5d1 1f5d4 1f5b5 1f5b6 1f5b7 1f5b8 1f5ad 1f5af 1f5b1 1f592 1f593 1f598 1f599 1f59a 1f59b 1f448 1f449 1f59c 1f59d 1f59e 1f59f 1f5a0 1f5a1 1f446 1f447 1f5a2 1f5a3 1f591 1f5f4 1f5f8 1f5f5 2611 2bbd 2612 2bbe 2bbf 1f6c7 29b8 1f671 1f674 1f672 1f673 203d 1f679 1f67a 1f67b 1f666 1f664 1f665 1f667 1f65a 1f658 1f659 1f65b 24ea 2460 2461 2462 2463 2464 2465 2466 2467 2468 2469 24ff 2776 2777 2778 2779 277a 277b 277c 277d 277e 277f - 2609 1f315 263d 263e 2e3f 271d 1f547 1f55c 1f55d 1f55e 1f55f 1f560 1f561 1f562 1f563 1f564 1f565 1f566 1f567 1f668 1f669 22c5 1f784 2981 25cf 25cb 1f785 1f787 1f789 2299 29bf 1f78c 1f78d 25fe 25a0 25a1 1f791 1f792 1f793 1f794 25a3 1f795 1f796 1f797 1f798 2b29 2b25 25c7 1f79a 25c8 1f79b 1f79c 1f79d 1f79e 2b2a 2b27 25ca 1f7a0 25d6 25d7 2bca 2bcb 2bc0 2bc1 2b1f 2bc2 2b23 2b22 2bc3 2bc4 1f7a1 1f7a2 1f7a3 1f7a4 1f7a5 1f7a6 1f7a7 1f7a8 1f7a9 1f7aa 1f7ab 1f7ac 1f7ad 1f7ae 1f7af 1f7b0 1f7b1 1f7b2 1f7b3 1f7b4 1f7b5 1f7b6 1f7b7 1f7b8 1f7b9 1f7ba 1f7bb 1f7bc 1f7bd 1f7be 1f7bf 1f7c0 1f7c2 1f7c4 1f7c6 1f7c9 1f7ca 2736 1f7cc 1f7ce 1f7d0 1f7d2 2739 1f7c3 1f7c7 272f 1f7cd 1f7d4 2bcc 2bcd 203b 2042 - - - - - -",
  wingdings3: "- 2b60 2b62 2b61 2b63 2b66 2b67 2b69 2b68 2b70 2b72 2b71 2b73 2b76 2b78 2b7b 2b7d 2b64 2b65 2b6a 2b6c 2b6b 2b6d 2b4d 2ba0 2ba1 2ba2 2ba3 2ba4 2ba5 2ba6 2ba7 2b90 2b91 2b92 2b93 2b80 2b83 2b7e 2b7f 2b84 2b86 2b85 2b87 2b8f 2b8d 2b8e 2b8c 2b6e 2b6f 238b 2324 2303 2325 - - 21ea 2bb8 1f8a0 1f8a1 1f8a2 1f8a3 1f8a4 1f8a5 1f8a6 1f8a7 1f8a8 1f8a9 1f8aa 1f8ab 1f850 1f852 - - 1f854 1f855 1f857 1f856 1f858 - 25b2 25bc 25b3 25bd 25c0 25b6 25c1 25b7 25e3 25e2 25e4 25e5 - - 1f781 - 1f783 2bc5 2bc6 2bc7 2bc8 2b9c 2b9e 2b9d 2b9f 1f810 1f812 - - 1f814 1f816 - - 1f818 1f81a - - 1f81c 1f81e 1f81d 1f81f 1f800 1f802 - - 1f804 1f806 1f805 1f807 1f808 1f80a 1f809 1f80b 1f820 1f822 1f824 1f826 1f828 1f82a 1f82c - - - - 1f82e 1f830 1f832 1f834 1f836 - - 1f839 1f83b 1f898 1f89a - - - - 1f83d 1f83f - - 1f841 1f843 1f844 1f846 1f845 1f847 2ba8 2ba9 2baa 2bab 2bac 2bad 2bae 2baf 1f860 1f862 1f861 1f863 1f864 1f865 1f867 1f866 1f870 1f872 1f871 1f873 1f874 1f875 1f877 1f876 1f880 1f882 1f881 1f883 1f884 1f885 1f887 1f886 - - - - - - - - - - - - - - - - - - - - - - -",
  webdings: "- 1f577 1f578 1f572 1f576 1f3c6 1f396 1f587 1f5e8 1f5e9 1f5f0 1f5f1 1f336 1f397 1f67e 1f67c 1f5d5 1f5d6 1f5d7 23f4 23f5 23f6 23f7 23ea 23e9 23ee 23ed 23f8 23f9 23fa 1f5da 1f5f3 1f6e0 1f3d7 1f3d8 1f3d9 1f3da 1f3dc 1f3ed 1f3db 1f3e0 1f3d6 1f3dd 1f6e3 1f50d 1f3d4 1f441 1f442 1f3de 1f3d5 1f6e4 1f3df 1f6f3 1f56c 1f56b 1f568 1f508 1f394 1f395 1f5ec 1f67d 1f5ed 1f5ea 1f5eb 2b94 2714 1f6b2 2b1c 1f6e1 1f4e6 1f6f1 2b1b 1f691 1f6c8 1f6e9 1f6f0 1f7c8 1f574 2b24 1f6e5 1f694 1f5d8 1f5d9 2753 1f6f2 1f687 1f68d 26f3 29b8 2296 1f6ad 1f5ee 23d0 1f5ef 1f5f2 - 1f6b9 1f6ba 1f6c9 1f6ca 1f6bc 1f47d 1f3cb 26f7 1f3c2 1f3cc 1f3ca 1f3c4 1f3cd 1f3ce 1f698 1f5e0 1f6e2 1f4b0 1f3f7 1f4b3 1f46a 1f5e1 1f5e2 1f5e3 272f 1f584 1f585 1f583 1f586 1f5b9 1f5ba 1f5bb 1f575 1f570 1f5bd 1f5be 1f4cb 1f5d2 1f5d3 1f56e 1f4da 1f5de 1f5df 1f5c3 1f5c2 1f5bc 1f3ad 1f39c 1f398 1f399 1f3a7 1f4bf 1f39e 1f4f7 1f39f 1f3ac 1f4fd 1f4f9 1f4fe 1f4fb 1f39a 1f39b 1f4fa 1f4bb 1f5a5 1f5a6 1f5a7 1f579 1f3ae 1f57b 1f57c 1f4df 1f581 1f580 1f5a8 1f5a9 1f5bf 1f5aa 1f5dc 1f512 1f513 1f5dd 1f4e5 1f4e4 1f573 1f323 1f324 1f325 1f326 2601 1f328 1f327 1f329 1f32a 1f32c 1f32b 1f31c 1f321 1f6cb 1f6cf 1f37d 1f378 1f6ce 1f6cd 24c5 267f 1f6c6 1f588 1f393 1f5e4 1f5e5 1f5e6 1f5e7 1f6ea 1f43f 1f426 1f41f 1f415 1f408 1f66c 1f66e 1f66d 1f66f 1f5fa 1f30d 1f30f 1f30e 1f54a",
};

const WORDS = "감관귀글금남낮높단답대도동뒤끝말명목문미반범변보복부북비상서소속수신압약여역영예오원월유의음인일입전접조존주준중참토특표해형화활";
const VOWELS = "ㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ";

// [first code, frame, letters]: the letters take consecutive codes. An empty frame is plain text.
const HANCOM_RANGES = [
  [0xf0094, "circle", "검우"],
  [0xf0097, "circle", "품전인"],
  [0xf009b, "box", "가나다라마바사아자차카타파하"],
  [0xf00a9, "box", VOWELS],
  [0xf00b3, "box", WORDS],
  [0xf00f3, "circle", VOWELS],
  [0xf00fd, "circle", WORDS],
  [0xf0288, "", "⓪①②③④⑤⑥⑦⑧⑨"],
  [0xf0292, "", "0123456789"],
  [0xf029c, "", "⓿❶❷❸❹❺❻❼❽❾"],
  [0xf02b0, "box", "0123456789"],
  [0xf02ba, "box", "123456789"],
  [0xf02c3, "", "0123456789"],
  [0xf02cd, "box-black", "0123456789"],
  [0xf02d7, "box-black", "123456789"],
  // A heavy double rule; Hangul repeats it to draw a line. ═ is the nearest Unicode character.
  [0xf0832, "", "═"]
];

const tables = new Map();
function fontTable(name) {
  if (!tables.has(name)) {
    tables.set(name, FONT_TABLES[name].split(" ").map((value) => (value === "-" ? 0 : parseInt(value, 16))));
  }
  return tables.get(name);
}

let hancom = null;
function hancomSymbols() {
  if (!hancom) {
    hancom = new Map();
    for (const [first, frame, letters] of HANCOM_RANGES) {
      [...letters].forEach((letter, index) => hancom.set(first + index, { frame, letter }));
    }
  }
  return hancom;
}

// The symbol table for a character whose fonts are fontNames (any order); Wingdings by default.
export function symbolFontTable(fontNames = []) {
  for (const name of fontNames) {
    const value = String(name || "").toLowerCase().replace(/\s+/g, "");
    if (value.includes("wingdings3")) return "wingdings3";
    if (value.includes("wingdings2")) return "wingdings2";
    if (value.includes("wingding")) return "wingdings";
    if (value.includes("webdings")) return "webdings";
    if (value === "symbol" || value === "symbolmt") return "symbol";
  }
  return "wingdings";
}

// CSS unicode-range of the symbols above U+2B00 that the tables produce: most phones lack them,
// so the document reader draws them with a bundled symbol font.
export function symbolFontRange() {
  const codes = [...new Set(Object.keys(FONT_TABLES).flatMap(fontTable))].filter((code) => code >= 0x2b00).sort((a, b) => a - b);
  const ranges = [];
  for (const code of codes) {
    const last = ranges.at(-1);
    if (last && code === last[1] + 1) last[1] = code;
    else ranges.push([code, code]);
  }
  return ranges.map(([first, end]) => `U+${first.toString(16)}${end > first ? `-${end.toString(16)}` : ""}`).join(", ");
}

function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// HTML for a run of document text: escaped, with the symbols above replaced. table is the result
// of symbolFontTable for the run's fonts.
export function symbolHtml(text, table = "wingdings") {
  const value = String(text);
  if (!/[\uf020-\uf0ff\udb80-\udbbf]/.test(value)) return escapeHtml(value);
  let html = "";
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code >= 0xf020 && code <= 0xf0ff) {
      const mapped = code === 0xf020 ? 0x20 : fontTable(table)[code - 0xf020];
      html += mapped ? escapeHtml(String.fromCodePoint(mapped)) : char;
      continue;
    }
    const symbol = code >= 0xf0000 ? hancomSymbols().get(code) : null;
    if (!symbol) html += escapeHtml(char);
    else if (!symbol.frame) html += symbol.letter;
    else html += `<span class="hwp-sym is-${symbol.frame}">${symbol.letter}</span>`;
  }
  return html;
}
