// Maps the font names stored in Hangul documents to fonts a phone actually has.
// HWP stores only font names; phones rarely have 함초롬, 휴먼, HY or 한양 fonts. Names are sorted
// into a few kinds and each kind falls back to the bundled free Nanum fonts (see web/document-reader.js).
// Korean and English aliases follow the table in Polaris Office's engine (doc/POLARIS_OFFICE_ANALYSIS.md).

export const BUNDLED_SANS = "Nanum Gothic";
export const BUNDLED_SERIF = "Nanum Myeongjo";

const SANS_STACK = `"${BUNDLED_SANS}", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
const SERIF_STACK = `"${BUNDLED_SERIF}", "Noto Serif KR", "Noto Serif CJK KR", serif`;
const MONO_STACK = `"D2Coding", "Courier New", "Liberation Mono", monospace, "${BUNDLED_SANS}"`;

const SYMBOL_FONT = /wingding|webdings|symbol|marlett|dingbats|hyhwpeq|stix/i;
const MONO_FONT = /courier|consolas|coding|mono|fixedsys|lucida console|코딩/i;
// Display faces drawn heavier than body text: headline, extra-bold gothic and poster faces.
const HEAVY_FONT = /헤드라인|견고딕|태고딕|굵은|headline|hygothic-extra|hygtre|gothic\s*e\b|arial black|extra\s*bold|black|heavy|엑스포|expo/i;
const SERIF_FONT = new RegExp([
  "명조", "바탕", "궁서", "신명", "태명", "순명", "옛체", "판본", "백송", "목판", "목각", "붓",
  "batang", "myeong", "mjo", "gungs", "hcr batang", "haansoft batang", "pmokgak", "hymprl",
  "times", "georgia", "garamond", "cambria", "constantia", "palatino", "book antiqua", "century schoolbook",
  "minion", "simsun", "songti", "mincho", "song\\b", "^(?!.*sans).*serif"
].join("|"), "i");

function cleanName(name) {
  return String(name || "").replace(/[^\p{L}\p{N} _.-]/gu, "").trim();
}

// Returns the kind ("serif", "sans", "mono" or "symbol") of one font name and whether it is a
// heavy display face.
export function classifyFont(name) {
  const value = cleanName(name);
  const heavy = HEAVY_FONT.test(value);
  if (SYMBOL_FONT.test(value)) return { kind: "symbol", heavy };
  if (MONO_FONT.test(value)) return { kind: "mono", heavy };
  return { kind: SERIF_FONT.test(value) ? "serif" : "sans", heavy };
}

// CSS for a run whose Hangul face is names[0] and Latin face names[1]: the original names first
// (used when the phone has them), then the stack for the Hangul face's kind.
export function fontCss(names) {
  const unique = [...new Set(names.map(cleanName).filter(Boolean))];
  const { kind, heavy } = classifyFont(unique[0]);
  return { family: [...unique.map((name) => `"${name}"`), stackFor(kind)].join(", "), heavy };
}

function stackFor(kind) {
  return kind === "serif" ? SERIF_STACK : kind === "mono" ? MONO_STACK : SANS_STACK;
}

// A CSS font-family value written by another converter (DOCX) with the same fallback stack
// appended. The kind follows the first Hangul face, or the first face when none is Hangul, since
// DOCX lists the Latin face first. Theme variables (var(...)) are kept as they are.
export function withFontFallback(value) {
  const names = String(value || "").split(",").map((part) => part.trim()).filter(Boolean);
  const plain = names.filter((name) => !/^var\(/i.test(name)).map((name) => name.replace(/^["']|["']$/g, ""));
  const lead = plain.find((name) => /\p{Script=Hangul}/u.test(name)) || plain[0];
  return [...names, stackFor(classifyFont(lead).kind)].join(", ");
}
