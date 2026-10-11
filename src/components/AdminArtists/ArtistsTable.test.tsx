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
    const link = screen.getByRole("link", { name: "Halcyon" });
    expect(link).toHaveAttribute("href", "/admin/artists/a1");
    expect(link.getAttribute("class")).toBeTruthy();
    const r = within(screen.getByText("Halcyon").closest("tr")!);
    expect(r.getByText("Ada (ada@x.co)")).toBeInTheDocument();
    expect(r.getByText("3")).toBeInTheDocument();
    expect(within(screen.getByText("Ember").closest("tr")!).getByText("—")).toBeInTheDocument();
  });

  it("labels the value cells so phone cards read without the hidden header", () => {
    renderWithTheme(<ArtistsTable artists={rows} query="" />);
    const r = within(screen.getByText("Halcyon").closest("tr")!);
    expect(r.getByText("Ada (ada@x.co)")).toHaveAttribute("data-label", "Linked user");
    expect(r.getByText("3")).toHaveAttribute("data-label", "Tracks");
    expect(r.getByText("1")).toHaveAttribute("data-label", "Albums");
    expect(r.getByText("Oct 1, 2026")).toHaveAttribute("data-label", "Created");
    expect(screen.getByText("Halcyon").closest("td")).not.toHaveAttribute("data-label");
  });

  it("shows the right empty state", () => {
    const { rerender } = renderWithTheme(<ArtistsTable artists={[]} query="" />);
    expect(screen.getByText("No artists yet.")).toBeInTheDocument();
    rerender(<ArtistsTable artists={[]} query="zz" />);
    expect(screen.getByText('No artists match "zz".')).toBeInTheDocument();
  });
});
