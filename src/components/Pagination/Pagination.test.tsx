import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithTheme } from "@/test/renderWithTheme";
import { Pagination } from "./Pagination";
import { pageHref } from "./pageHref";

describe("pageHref", () => {
  it("preserves the query and omits page=1", () => {
    expect(pageHref("/artists", "mara", 1)).toBe("/artists?q=mara");
    expect(pageHref("/artists", "mara", 3)).toBe("/artists?q=mara&page=3");
    expect(pageHref("/feed", "", 2)).toBe("/feed?page=2");
    expect(pageHref("/feed", "", 1)).toBe("/feed");
  });
});

describe("Pagination", () => {
  it("shows position and links; no prev on the first page", () => {
    renderWithTheme(<Pagination basePath="/feed" query="" page={1} totalPages={3} />);
    expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /prev/i })).toBeNull();
    expect(screen.getByRole("link", { name: /next/i })).toHaveAttribute("href", "/feed?page=2");
  });

  it("keeps the search in both links", () => {
    renderWithTheme(<Pagination basePath="/feed" query="wav" page={2} totalPages={3} />);
    expect(screen.getByRole("link", { name: /prev/i })).toHaveAttribute("href", "/feed?q=wav");
    expect(screen.getByRole("link", { name: /next/i })).toHaveAttribute("href", "/feed?q=wav&page=3");
  });

  it("renders nothing when there is a single page", () => {
    const { container } = renderWithTheme(
      <Pagination basePath="/feed" query="" page={1} totalPages={1} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
