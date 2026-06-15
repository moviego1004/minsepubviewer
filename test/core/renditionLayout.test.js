import test from "node:test";
import assert from "node:assert/strict";
import {
  getPublicationLayoutMode,
  isPrePaginatedPublication,
  shouldApplyReaderReflowStyles
} from "../../src/core/renditionLayout.js";

test("detects pre-paginated EPUB metadata", () => {
  const book = {
    package: {
      metadata: {
        layout: "pre-paginated"
      }
    }
  };

  assert.equal(getPublicationLayoutMode(book), "pre-paginated");
  assert.equal(isPrePaginatedPublication(book), true);
  assert.equal(shouldApplyReaderReflowStyles(book), false);
});

test("detects legacy fixed-layout display options", () => {
  const book = {
    package: {
      metadata: {
        layout: ""
      }
    },
    displayOptions: {
      fixedLayout: "true"
    }
  };

  assert.equal(getPublicationLayoutMode(book), "pre-paginated");
});

test("treats normal EPUBs as reflowable", () => {
  assert.equal(getPublicationLayoutMode({ package: { metadata: {} } }), "reflowable");
  assert.equal(shouldApplyReaderReflowStyles({ package: { metadata: {} } }), true);
});
