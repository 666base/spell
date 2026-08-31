import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  publishedPageHtml,
  sanitizePublishedHtml,
} from "./publishedPage";

describe("publishedPage", () => {
  it("escapes titles used in the document head", () => {
    expect(escapeHtml('A & B <script>"')).toBe(
      "A &amp; B &lt;script&gt;&quot;",
    );
  });

  it("strips scripts and unsafe urls", () => {
    const html = sanitizePublishedHtml(
      `<p onclick="alert(1)">Hi</p><script>alert(1)</script><a href="javascript:alert(1)">bad</a><img src="asset://local.png"><img src="https://example.com/a.png">`,
    );
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("asset://");
    expect(html).toContain('src="https://example.com/a.png"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("disables checkboxes so a published page is read-only", () => {
    const html = sanitizePublishedHtml(
      `<ul data-type="taskList"><li><label><input type="checkbox" checked><span></span></label><div>Buy milk</div></li></ul>`,
    );
    expect(html).toContain("disabled");
    expect(html).toContain("Buy milk");
  });

  it("wraps the note in a self-contained page", () => {
    const page = publishedPageHtml(
      "Meeting notes",
      "<p>Hello <strong>team</strong></p>",
    );
    expect(page).toContain("<!DOCTYPE html>");
    expect(page).toContain("<title>Meeting notes</title>");
    expect(page).toContain("<p>Hello <strong>team</strong></p>");
    expect(page).toContain("Published from Spell");
  });
});
