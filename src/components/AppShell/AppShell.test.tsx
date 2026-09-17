import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithTheme } from "@/test/renderWithTheme";

vi.mock("@/lib/auth/actions", () => ({ signOut: vi.fn() }));

import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("renders the brand, an Artists link, and a sign-out control around its children", () => {
    renderWithTheme(
      <AppShell>
        <p>child content</p>
      </AppShell>,
    );
    expect(screen.getByRole("link", { name: /Artists/ })).toHaveAttribute("href", "/artists");
    expect(screen.getByRole("button", { name: /Sign out/ })).toBeInTheDocument();
    expect(screen.getByText("child content")).toBeInTheDocument();
  });
});
