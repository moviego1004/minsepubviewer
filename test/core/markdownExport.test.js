import test from "node:test";
import assert from "node:assert/strict";
import {
  createMarkdownDocument,
  createMarkdownFileName,
  documentToMarkdown,
  normalizeMarkdown
} from "../../src/core/markdownExport.js";

function text(value) {
  return {
    nodeType: 3,
    textContent: value
  };
}

function element(tagName, children = [], attributes = {}) {
  const node = {
    nodeType: 1,
    tagName,
    nodeName: tagName,
    childNodes: children,
    children: children.filter((child) => child.nodeType === 1),
    textContent: children.map((child) => child.textContent || "").join(""),
    getAttribute(name) {
      return attributes[name] || "";
    }
  };

  return node;
}

test("normalizes markdown whitespace", () => {
  assert.equal(normalizeMarkdown(" A  \n\n\n B \r\n "), "A\n\nB");
});

test("creates a markdown file name from a book title", () => {
  assert.equal(createMarkdownFileName("My Book: Chapter 1"), "My-Book-Chapter-1.md");
  assert.equal(createMarkdownFileName(""), "book.md");
});

test("converts document blocks and inline markup to markdown", () => {
  const document = {
    body: element("body", [
      element("h1", [text("Chapter One")]),
      element("p", [
        text("Hello "),
        element("strong", [text("world")]),
        text(" and "),
        element("a", [text("link")], { href: "chapter.xhtml" })
      ]),
      element("ul", [
        element("li", [text("First")]),
        element("li", [text("Second")])
      ])
    ])
  };

  assert.equal(
    documentToMarkdown(document, { title: "Section" }),
    "## Section\n\n# Chapter One\n\nHello **world** and [link](chapter.xhtml)\n\n- First\n- Second"
  );
});

test("combines markdown sections into a book document", () => {
  assert.equal(
    createMarkdownDocument({
      title: "Book",
      sections: ["Chapter A", "", "Chapter B"]
    }),
    "# Book\n\nChapter A\n\n---\n\nChapter B"
  );
});
