import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithTheme } from "@/test/renderWithTheme";

vi.mock("@/components/Player", () => ({
  PlayerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PlayerBar: () => null,
}));
vi.mock("@/lib/auth/actions", () => ({ signOut: vi.fn() }));

import { AppShell } from "./AppShell";

describe("AppShell admin link", () => {
  it("shows Admin for label members", () => {
    renderWithTheme(<AppShell isLabelMember>content</AppShell>);
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
  });

  it("hides Admin for everyone else", () => {
    renderWithTheme(<AppShell>content</AppShell>);
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
  });
});
