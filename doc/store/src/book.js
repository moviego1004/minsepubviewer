// Shared open-book mark for the 모두리더 store images.
// Drawn on a 1024×1024 grid; callers scale it with an SVG transform.
// Colours follow the MinsScan set: blue-700 background, white paper,
// blue-300 text lines, blue-200 fold/shade, amber-400 accent.
window.bookMark = function bookMark() {
  return `
  <g>
    <path fill="#BFDBFE" d="M512 352 C430 316 330 306 224 316 L224 748 C330 738 430 748 512 784 C594 748 694 738 800 748 L800 316 C694 306 594 316 512 352 Z"/>
    <path fill="#FFFFFF" d="M500 340 C420 304 324 294 236 302 L236 724 C324 716 420 726 500 762 Z"/>
    <path fill="#FFFFFF" d="M524 340 C604 304 700 294 788 302 L788 724 C700 716 604 726 524 762 Z"/>
    <g stroke-linecap="round" stroke-width="24" fill="none">
      <path stroke="#93C5FD" d="M300 424 L436 444"/>
      <path stroke="#93C5FD" d="M300 484 L436 504"/>
      <path stroke="#93C5FD" d="M300 544 L436 564"/>
      <path stroke="#93C5FD" d="M300 604 L392 616"/>
      <path stroke="#93C5FD" d="M588 444 L652 434"/>
      <path stroke="#FBBF24" d="M588 504 L724 484"/>
      <path stroke="#93C5FD" d="M588 564 L724 544"/>
      <path stroke="#93C5FD" d="M588 624 L680 610"/>
    </g>
    <path fill="#FBBF24" d="M688 296 L740 296 L740 420 L714 396 L688 420 Z"/>
  </g>`;
};
