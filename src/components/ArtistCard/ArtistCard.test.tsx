import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithTheme } from "@/test/renderWithTheme";
import { ArtistCard, initials } from "./ArtistCard";

describe("initials", () => {
  it("takes the first letters of the first two words, uppercased", () => {
    expect(initials("night kalm")).toBe("NK");
    expect(initials("Odalys")).toBe("O");
  });
});

describe("ArtistCard", () => {
  it("links to the artist and shows a pluralized track count", () => {
    renderWithTheme(
      <ArtistCard id="abc" name="Mara Sol" photoUrl={null} trackCount={1} />,
    );
    const link = screen.getByRole("link", { name: /Mara Sol/ });
    expect(link).toHaveAttribute("href", "/artists/abc");
    expect(screen.getByText("1 track")).toBeInTheDocument();
  });

  it("renders an initials tile when there is no photo", () => {
    renderWithTheme(
      <ArtistCard id="x" name="Cass Vetiver" photoUrl={null} trackCount={3} />,
    );
    expect(screen.getByText("CV")).toBeInTheDocument();
    expect(screen.getByText("3 tracks")).toBeInTheDocument();
  });
});
