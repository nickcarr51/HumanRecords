import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "@/test/renderWithTheme";

vi.mock("@/lib/admin/artists-actions", () => ({ searchLinkableUsers: vi.fn() }));

import { UserCombobox } from "./UserCombobox";

const ada = { id: "u1", name: "Ada", email: "ada@x.co", linkedArtist: null };
const grace = { id: "u2", name: "Grace", email: "grace@x.co", linkedArtist: { id: "a9", name: "Halcyon" } };

function setup(value: { id: string; name: string | null; email: string } | null = null) {
  const onChange = vi.fn();
  const search = vi.fn().mockResolvedValue({ users: [ada, grace], error: null });
  renderWithTheme(
    <UserCombobox id="link" label="Linked user" value={value} onChange={onChange} artistId="a1" search={search} />,
  );
  return { onChange, search };
}

describe("UserCombobox", () => {
  it("searches after typing and picks an available user", async () => {
    const { onChange, search } = setup();
    await userEvent.type(screen.getByRole("combobox", { name: "Linked user" }), "a");
    expect(await screen.findByRole("option", { name: /Ada \(ada@x\.co\)/ })).toBeInTheDocument();
    expect(search).toHaveBeenCalledWith("a", "a1");
    await userEvent.click(screen.getByRole("option", { name: /Ada/ }));
    expect(onChange).toHaveBeenCalledWith({ id: "u1", name: "Ada", email: "ada@x.co" });
  });

  it("shows users linked to another artist as disabled and ignores picks", async () => {
    const { onChange } = setup();
    await userEvent.type(screen.getByRole("combobox"), "g");
    const opt = await screen.findByRole("option", { name: /linked to Halcyon/ });
    expect(opt).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(opt);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the current pick with a Clear button", async () => {
    const { onChange } = setup({ id: "u1", name: "Ada", email: "ada@x.co" });
    expect(screen.getByText("Ada (ada@x.co)")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Clear linked user" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("tells the user when search fails", async () => {
    const onChange = vi.fn();
    const search = vi.fn().mockResolvedValue({ users: [], error: "Search failed." });
    renderWithTheme(<UserCombobox id="l" label="Linked user" value={null} onChange={onChange} search={search} />);
    await userEvent.type(screen.getByRole("combobox"), "x");
    expect(await screen.findByText("Couldn't search users.")).toBeInTheDocument();
  });
});
