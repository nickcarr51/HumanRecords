import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithTheme } from "@/test/renderWithTheme";
import { useToast } from "@/components/Toast";

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

function Notifier() {
  const { notify } = useToast();
  return <button type="button" onClick={() => notify("Hello toast", "error")}>notify</button>;
}

describe("AppShell toasts", () => {
  it("provides useToast to page content", async () => {
    renderWithTheme(<AppShell><Notifier /></AppShell>);
    fireEvent.click(screen.getByRole("button", { name: "notify" }));
    expect(await screen.findByText("Hello toast")).toBeInTheDocument();
  });
});
