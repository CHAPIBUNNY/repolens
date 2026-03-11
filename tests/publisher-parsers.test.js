import { describe, it, expect } from "vitest";
import { markdownToNotionBlocks, parseInlineRichText } from "../src/publishers/notion.js";
import { markdownToConfluenceStorage } from "../src/publishers/confluence.js";

describe("Notion block parser", () => {
  describe("tables", () => {
    it("parses a simple markdown table into a Notion table block", () => {
      const md = [
        "| Metric | Value |",
        "|--------|-------|",
        "| Files | 56 |",
        "| Modules | 10 |",
      ].join("\n");

      const blocks = markdownToNotionBlocks(md);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("table");
      expect(blocks[0].table.table_width).toBe(2);
      expect(blocks[0].table.has_column_header).toBe(true);
      // Header + 2 data rows = 3 rows
      expect(blocks[0].table.children).toHaveLength(3);
      // First row is header
      expect(blocks[0].table.children[0].table_row.cells[0][0].text.content).toBe("Metric");
      expect(blocks[0].table.children[0].table_row.cells[1][0].text.content).toBe("Value");
      // Second row is data
      expect(blocks[0].table.children[1].table_row.cells[0][0].text.content).toBe("Files");
      expect(blocks[0].table.children[1].table_row.cells[1][0].text.content).toBe("56");
    });

    it("handles table with inline formatting in cells", () => {
      const md = [
        "| Module | Status |",
        "|--------|--------|",
        "| **core** | `active` |",
      ].join("\n");

      const blocks = markdownToNotionBlocks(md);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("table");
      // Data row: bold "core"
      const dataCells = blocks[0].table.children[1].table_row.cells;
      expect(dataCells[0].some(s => s.annotations?.bold)).toBe(true);
      // Data row: code "active"
      expect(dataCells[1].some(s => s.annotations?.code)).toBe(true);
    });

    it("handles table surrounded by other content", () => {
      const md = [
        "# Overview",
        "",
        "Some intro text.",
        "",
        "| Col A | Col B |",
        "|-------|-------|",
        "| 1 | 2 |",
        "",
        "Footer paragraph.",
      ].join("\n");

      const blocks = markdownToNotionBlocks(md);
      expect(blocks[0].type).toBe("heading_1");
      expect(blocks[1].type).toBe("paragraph");                // intro
      const tableBlock = blocks.find(b => b.type === "table");
      expect(tableBlock).toBeDefined();
      expect(tableBlock.table.children).toHaveLength(2);       // header + 1 data row
      expect(blocks[blocks.length - 1].type).toBe("paragraph"); // footer
    });

    it("table_row children do not have object:block", () => {
      const md = "| A | B |\n|---|---|\n| 1 | 2 |";
      const blocks = markdownToNotionBlocks(md);
      for (const row of blocks[0].table.children) {
        expect(row.object).toBeUndefined();
      }
    });
  });

  describe("blockquotes", () => {
    it("parses blockquote into callout block", () => {
      const md = "> This is a callout.";
      const blocks = markdownToNotionBlocks(md);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("callout");
      expect(blocks[0].callout.rich_text[0].text.content).toBe("This is a callout.");
    });
  });

  describe("dividers", () => {
    it("parses --- into divider block", () => {
      const blocks = markdownToNotionBlocks("---");
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("divider");
    });
  });

  describe("numbered lists", () => {
    it("parses numbered list items", () => {
      const md = "1. First\n2. Second\n3. Third";
      const blocks = markdownToNotionBlocks(md);
      expect(blocks).toHaveLength(3);
      blocks.forEach(b => expect(b.type).toBe("numbered_list_item"));
      expect(blocks[0].numbered_list_item.rich_text[0].text.content).toBe("First");
    });
  });

  describe("headings", () => {
    it("parses h1, h2, h3 headings", () => {
      const md = "# H1\n## H2\n### H3";
      const blocks = markdownToNotionBlocks(md);
      expect(blocks[0].type).toBe("heading_1");
      expect(blocks[1].type).toBe("heading_2");
      expect(blocks[2].type).toBe("heading_3");
    });
  });

  describe("inline rich text", () => {
    it("parses bold text", () => {
      const segments = parseInlineRichText("hello **world** end");
      expect(segments).toHaveLength(3);
      expect(segments[1].text.content).toBe("world");
      expect(segments[1].annotations.bold).toBe(true);
    });

    it("parses inline code", () => {
      const segments = parseInlineRichText("use `npm install` here");
      expect(segments).toHaveLength(3);
      expect(segments[1].text.content).toBe("npm install");
      expect(segments[1].annotations.code).toBe(true);
    });

    it("returns plain text when no markers", () => {
      const segments = parseInlineRichText("plain text");
      expect(segments).toHaveLength(1);
      expect(segments[0].text.content).toBe("plain text");
    });
  });

  describe("code blocks", () => {
    it("parses fenced code blocks", () => {
      const md = "```javascript\nconst x = 1;\n```";
      const blocks = markdownToNotionBlocks(md);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("code");
      expect(blocks[0].code.language).toBe("javascript");
    });
  });

  describe("full dependency graph page", () => {
    it("correctly parses a realistic dependency graph markdown", () => {
      const md = [
        "# Dependency Graph",
        "",
        "> 56 files · 108 imports · 10 external packages",
        "",
        "This document maps every import relationship.",
        "",
        "## Overview",
        "",
        "| Metric | Value |",
        "|--------|-------|",
        "| Source files | 56 |",
        "| Import edges | 108 |",
        "| External packages | 10 |",
        "| Circular dependencies | 0 |",
        "| Orphan files | 2 |",
        "",
        "## Hub Modules",
        "",
        "| Module | Imported By |",
        "|--------|-------------|",
        "| `utils/logger.js` | 12 files |",
        "| `core/config.js` | 8 files |",
        "",
        "---",
        "",
        "*Generated by RepoLens.*",
      ].join("\n");

      const blocks = markdownToNotionBlocks(md);

      // Find block types
      const types = blocks.map(b => b.type);
      expect(types).toContain("heading_1");   // # Dependency Graph
      expect(types).toContain("callout");     // > 56 files...
      expect(types).toContain("paragraph");   // intro text
      expect(types).toContain("heading_2");   // ## Overview, ## Hub Modules
      expect(types).toContain("table");       // overview table, hub table
      expect(types).toContain("divider");     // ---

      // Verify overview table
      const tables = blocks.filter(b => b.type === "table");
      expect(tables).toHaveLength(2);

      const overviewTable = tables[0];
      expect(overviewTable.table.table_width).toBe(2);
      expect(overviewTable.table.children).toHaveLength(6); // header + 5 data rows

      // Verify hub table
      const hubTable = tables[1];
      expect(hubTable.table.children).toHaveLength(3); // header + 2 data rows
    });
  });
});

describe("Confluence storage parser", () => {
  describe("tables", () => {
    it("converts markdown table to HTML table", () => {
      const md = [
        "| Name | Value |",
        "|------|-------|",
        "| Files | 56 |",
        "| Modules | 10 |",
      ].join("\n");

      const html = markdownToConfluenceStorage(md);
      expect(html).toContain("<table><tbody>");
      expect(html).toContain("<th>Name</th>");
      expect(html).toContain("<th>Value</th>");
      expect(html).toContain("<td>Files</td>");
      expect(html).toContain("<td>56</td>");
      expect(html).toContain("</tbody></table>");
    });

    it("handles inline formatting in table cells", () => {
      const md = [
        "| Module | Status |",
        "|--------|--------|",
        "| **core** | `active` |",
      ].join("\n");

      const html = markdownToConfluenceStorage(md);
      expect(html).toContain("<strong>core</strong>");
      expect(html).toContain("<code>active</code>");
    });
  });

  describe("code blocks", () => {
    it("converts code blocks to Confluence macro without escaping", () => {
      const md = "```javascript\nconst x = 1;\n```";
      const html = markdownToConfluenceStorage(md);
      expect(html).toContain("ac:name=\"code\"");
      expect(html).toContain("CDATA[const x = 1;]");
      // Should NOT have escaped HTML entities inside code
      expect(html).not.toContain("&lt;");
    });
  });

  describe("blockquotes", () => {
    it("converts blockquote to info panel", () => {
      const md = "> Important note here.";
      const html = markdownToConfluenceStorage(md);
      expect(html).toContain("ac:name=\"info\"");
      expect(html).toContain("Important note here.");
    });
  });

  describe("lists", () => {
    it("merges consecutive list items into single ul", () => {
      const md = "- Item one\n- Item two\n- Item three";
      const html = markdownToConfluenceStorage(md);
      // Should be ONE <ul> with 3 <li> items
      const ulCount = (html.match(/<ul>/g) || []).length;
      expect(ulCount).toBe(1);
      expect(html).toContain("<li>Item one</li>");
      expect(html).toContain("<li>Item two</li>");
      expect(html).toContain("<li>Item three</li>");
    });

    it("merges consecutive ordered list items into single ol", () => {
      const md = "1. First\n2. Second\n3. Third";
      const html = markdownToConfluenceStorage(md);
      const olCount = (html.match(/<ol>/g) || []).length;
      expect(olCount).toBe(1);
    });
  });

  describe("headings and inline", () => {
    it("converts headings with inline formatting", () => {
      const md = "## Overview\n\nSome **bold** and `code` text.";
      const html = markdownToConfluenceStorage(md);
      expect(html).toContain("<h2>Overview</h2>");
      expect(html).toContain("<strong>bold</strong>");
      expect(html).toContain("<code>code</code>");
    });
  });

  describe("full page rendering", () => {
    it("correctly converts a realistic dependency graph page", () => {
      const md = [
        "# Dependency Graph",
        "",
        "> 56 files · 108 imports",
        "",
        "## Overview",
        "",
        "| Metric | Value |",
        "|--------|-------|",
        "| Source files | 56 |",
        "| Import edges | 108 |",
        "",
        "---",
        "",
        "*Generated by RepoLens.*",
      ].join("\n");

      const html = markdownToConfluenceStorage(md);
      expect(html).toContain("<h1>Dependency Graph</h1>");
      expect(html).toContain("ac:name=\"info\"");
      expect(html).toContain("<h2>Overview</h2>");
      expect(html).toContain("<table><tbody>");
      expect(html).toContain("<th>Metric</th>");
      expect(html).toContain("<td>Source files</td>");
      expect(html).toContain("<hr />");
      expect(html).toContain("<em>Generated by RepoLens.</em>");
    });
  });
});
