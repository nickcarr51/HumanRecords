import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithTheme } from "@/test/renderWithTheme";
import { Pagination, pageHref } from "./Pagination";

describe("pageHref", () => {
  it("preserves the query and omits page=1", () => {
    expect(pageHref("mara", 1)).toBe("/artists?q=mara");
    expect(pageHref("mara", 3)).toBe("/artists?q=mara&page=3");
    expect(pageHref("", 2)).toBe("/artists?page=2");
  });
});

describe("Pagination", () => {
  it("shows position and links; no prev on the first page", () => {
    renderWithTheme(<Pagination query="" page={1} totalPages={3} />);
    expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /prev/i })).toBeNull();
    expect(screen.getByRole("link", { name: /next/i })).toHaveAttribute("href", "/artists?page=2");
  });

  it("renders nothing when there is a single page", () => {
    const { container } = renderWithTheme(<Pagination query="" page={1} totalPages={1} />);
    expect(container).toBeEmptyDOMElement();
  });
});
