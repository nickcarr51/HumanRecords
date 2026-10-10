import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithTheme } from "@/test/renderWithTheme";
import { ArtistsTable } from "./ArtistsTable";

const rows = [
  { id: "a1", name: "Halcyon", createdAt: "2026-10-01T00:00:00Z", trackCount: 3, albumCount: 1, linkedUser: { id: "u1", name: "Ada", email: "ada@x.co" } },
  { id: "a2", name: "Ember", createdAt: "2026-10-02T00:00:00Z", trackCount: 0, albumCount: 0, linkedUser: null },
];

describe("ArtistsTable", () => {
  it("links each name to its edit page and shows counts and linked user", () => {
    renderWithTheme(<ArtistsTable artists={rows} query="" />);
    expect(screen.getByRole("link", { name: "Halcyon" })).toHaveAttribute("href", "/admin/artists/a1");
    const r = within(screen.getByText("Halcyon").closest("tr")!);
    expect(r.getByText("Ada (ada@x.co)")).toBeInTheDocument();
    expect(r.getByText("3")).toBeInTheDocument();
    expect(within(screen.getByText("Ember").closest("tr")!).getByText("—")).toBeInTheDocument();
  });

  it("shows the right empty state", () => {
    const { rerender } = renderWithTheme(<ArtistsTable artists={[]} query="" />);
    expect(screen.getByText("No artists yet.")).toBeInTheDocument();
    rerender(<ArtistsTable artists={[]} query="zz" />);
    expect(screen.getByText('No artists match "zz".')).toBeInTheDocument();
  });
});
