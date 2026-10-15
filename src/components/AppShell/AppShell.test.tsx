import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { renderWithTheme } from "@/test/renderWithTheme";
import { useToast } from "@/components/Toast";

vi.mock("@/components/Player", () => ({
  PlayerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PlayerBar: () => null,
}));
vi.mock("@/lib/auth/actions", () => ({ signOut: vi.fn() }));
let pathname = "/feed";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

afterEach(() => {
  pathname = "/feed";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

import { AppShell } from "./AppShell";

describe("AppShell desktop account menu", () => {
  const account = { name: "Pat", email: "pat@example.com" };
  const openMenu = () => {
    const trigger = screen.getByRole("button", { name: "Account: Pat" });
    fireEvent.click(trigger);
    return trigger;
  };

  it("shows the name (or the email when no name is set) and starts closed", () => {
    const { unmount } = renderWithTheme(<AppShell account={account}>content</AppShell>);
    expect(screen.getByRole("button", { name: "Account: Pat" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("pat@example.com")).toBeNull();
    unmount();
    renderWithTheme(<AppShell account={{ name: null, email: "pat@example.com" }}>content</AppShell>);
    expect(screen.getByRole("button", { name: "Account: pat@example.com" })).toBeInTheDocument();
  });

  it("opens to the email, Admin for label members, and Sign out", () => {
    renderWithTheme(<AppShell isLabelMember account={account}>content</AppShell>);
    expect(openMenu()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("pat@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("hides Admin for everyone else", () => {
    renderWithTheme(<AppShell account={account}>content</AppShell>);
    openMenu();
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
  });

  it("closes on Escape (focus back on the name) and on an outside click", () => {
    renderWithTheme(<AppShell account={account}>content</AppShell>);
    const trigger = openMenu();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
    openMenu();
    fireEvent.pointerDown(screen.getByText("content"));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes when focus leaves it, and after navigating", () => {
    const { rerender } = renderWithTheme(
      <AppShell account={account}>
        <button type="button">elsewhere</button>
      </AppShell>,
    );
    const trigger = openMenu();
    fireEvent.focusIn(screen.getByRole("button", { name: "elsewhere" }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    openMenu();
    pathname = "/admin";
    rerender(
      <AppShell account={account}>
        <button type="button">elsewhere</button>
      </AppShell>,
    );
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("only points aria-controls at the panel while it exists", () => {
    renderWithTheme(<AppShell account={account}>content</AppShell>);
    const trigger = screen.getByRole("button", { name: "Account: Pat" });
    expect(trigger).not.toHaveAttribute("aria-controls");
    fireEvent.click(trigger);
    const id = trigger.getAttribute("aria-controls");
    expect(id && document.getElementById(id)).toBeTruthy();
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

describe("AppShell account + mobile drawer", () => {
  const account = { name: null, email: "pat@example.com" };

  // The hamburger sits in a phones-only wrapper; jsdom ignores media queries,
  // so it reads as display:none here (hence hidden: true).
  it("opens a drawer with the email, Admin for label members, and Sign out", () => {
    renderWithTheme(<AppShell isLabelMember account={account}>content</AppShell>);
    expect(screen.queryByRole("dialog")).toBeNull();
    const toggle = screen.getByRole("button", { name: "Open menu", hidden: true });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const drawer = within(screen.getByRole("dialog", { name: "Menu" }));
    expect(drawer.getByText("pat@example.com")).toBeInTheDocument();
    expect(drawer.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
    expect(drawer.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(drawer.getByRole("button", { name: "Close menu" })).toHaveFocus();
  });

  it("leaves Admin out of the drawer for everyone else", () => {
    renderWithTheme(<AppShell account={account}>content</AppShell>);
    fireEvent.click(screen.getByRole("button", { name: "Open menu", hidden: true }));
    expect(within(screen.getByRole("dialog")).queryByRole("link", { name: "Admin" })).toBeNull();
  });

  it("closes on Escape and returns focus to the menu button", () => {
    vi.useFakeTimers();
    renderWithTheme(<AppShell account={account}>content</AppShell>);
    const toggle = screen.getByRole("button", { name: "Open menu", hidden: true });
    fireEvent.click(toggle);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lets taps through while sliding out, then unmounts", () => {
    vi.useFakeTimers();
    renderWithTheme(<AppShell account={account}>content</AppShell>);
    fireEvent.click(screen.getByRole("button", { name: "Open menu", hidden: true }));
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    // Still mounted for the slide-out, but no longer catching pointer events.
    const overlay = screen.getByRole("dialog").parentElement!;
    expect(getComputedStyle(overlay).pointerEvents).toBe("none");
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("unmounts immediately under reduced motion", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("prefers-reduced-motion"),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    renderWithTheme(<AppShell account={account}>content</AppShell>);
    fireEvent.click(screen.getByRole("button", { name: "Open menu", hidden: true }));
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes when the overlay is tapped, not when the panel is", () => {
    renderWithTheme(<AppShell account={account}>content</AppShell>);
    const toggle = screen.getByRole("button", { name: "Open menu", hidden: true });
    fireEvent.click(toggle);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(dialog.parentElement!);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("wraps Tab and Shift+Tab inside the drawer", () => {
    renderWithTheme(<AppShell isLabelMember account={account}>content</AppShell>);
    fireEvent.click(screen.getByRole("button", { name: "Open menu", hidden: true }));
    const drawer = within(screen.getByRole("dialog"));
    const close = drawer.getByRole("button", { name: "Close menu" });
    const signOut = drawer.getByRole("button", { name: "Sign out" });
    signOut.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(signOut).toHaveFocus();
  });

  it("closes after navigating", () => {
    const { rerender } = renderWithTheme(<AppShell isLabelMember account={account}>content</AppShell>);
    const toggle = screen.getByRole("button", { name: "Open menu", hidden: true });
    fireEvent.click(toggle);
    pathname = "/admin";
    rerender(<AppShell isLabelMember account={account}>content</AppShell>);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
