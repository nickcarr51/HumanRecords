import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderWithTheme } from "@/test/renderWithTheme";

vi.mock("@/lib/admin/actions", () => ({ searchArtists: vi.fn() }));

import { ArtistCombobox, SEARCH_DEBOUNCE_MS } from "./ArtistCombobox";
import { existingChip, newChip, type ArtistChip } from "./upload-reducer";

function setup(overrides: Partial<React.ComponentProps<typeof ArtistCombobox>> = {}) {
  const search = vi.fn(async () => ({ artists: [{ id: "a1", name: "Nova" }], error: null }));
  const onAdd = vi.fn();
  const onRemove = vi.fn();
  const onMove = vi.fn();
  renderWithTheme(
    <ArtistCombobox
      id="t1-artists"
      label="Artists"
      chips={[]}
      pending={[]}
      onAdd={onAdd}
      onRemove={onRemove}
      onMove={onMove}
      search={search}
      {...overrides}
    />,
  );
  return { search, onAdd, onRemove, onMove, input: screen.getByRole("combobox") };
}

async function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
  await act(async () => {
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ArtistCombobox", () => {
  it("debounces: one search after typing stops", async () => {
    const { search, input } = setup();
    fireEvent.change(input, { target: { value: "d" } });
    fireEvent.change(input, { target: { value: "da" } });
    expect(search).not.toHaveBeenCalled();
    await type(input, "nov");
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("nov");
  });

  it("shows matches and a Create row; clicking a match adds it and clears the input", async () => {
    const { input, onAdd } = setup();
    await type(input, "nov");
    expect(screen.getByRole("option", { name: "Nova" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: 'Create "nov"' })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("option", { name: "Nova" }));
    expect(onAdd).toHaveBeenCalledWith(existingChip({ id: "a1", name: "Nova" }));
    expect(input).toHaveValue("");
  });

  it("keyboard: ArrowDown + Enter picks, Escape closes", async () => {
    const { input, onAdd } = setup();
    await type(input, "nov");
    fireEvent.keyDown(input, { key: "ArrowDown" }); // highlight option 0 (Nova)
    fireEvent.keyDown(input, { key: "ArrowDown" }); // highlight option 1 (Create "nov")
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).toHaveBeenCalledWith(newChip("nov"));
    await type(input, "nov");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("Enter with no highlight picks the first option", async () => {
    const { input, onAdd } = setup();
    await type(input, "nov");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).toHaveBeenCalledWith(existingChip({ id: "a1", name: "Nova" }));
  });

  it("Backspace on an empty input removes the last chip", () => {
    const chips: ArtistChip[] = [newChip("One"), newChip("Two")];
    const { input, onRemove } = setup({ chips });
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(onRemove).toHaveBeenCalledWith(newChip("Two").key);
  });

  it("chips have move and remove buttons and mark new artists", () => {
    const chips: ArtistChip[] = [existingChip({ id: "a1", name: "Nova" }), newChip("Ember")];
    const { onMove, onRemove } = setup({ chips });
    expect(screen.getByText("new")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move Ember left" }));
    expect(onMove).toHaveBeenCalledWith(newChip("Ember").key, -1);
    fireEvent.click(screen.getByRole("button", { name: "Remove Nova" }));
    expect(onRemove).toHaveBeenCalledWith("id:a1");
  });

  it("ignores a stale response that arrives after a newer query", async () => {
    let resolveFirst: (v: { artists: { id: string; name: string }[]; error: null }) => void = () => {};
    const search = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockResolvedValueOnce({ artists: [{ id: "a2", name: "Ember" }], error: null });
    const { input } = setup({ search });
    await type(input, "da");
    await type(input, "emb");
    await act(async () => resolveFirst({ artists: [{ id: "a1", name: "Nova" }], error: null }));
    expect(screen.queryByRole("option", { name: "Nova" })).toBeNull();
    expect(screen.getByRole("option", { name: "Ember" })).toBeInTheDocument();
  });

  it("resets the highlight when results shrink; Enter does not throw", async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce({ artists: [{ id: "a1", name: "Nova" }], error: null })
      .mockResolvedValueOnce({ artists: [], error: null });
    const { input, onAdd } = setup({ search });
    await type(input, "nov");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" }); // Create row
    await type(input, "dayx"); // only the Create row remains
    expect(() => fireEvent.keyDown(input, { key: "Enter" })).not.toThrow();
    expect(onAdd).toHaveBeenCalledWith(newChip("dayx"));
  });

  it("Enter after Escape does nothing", async () => {
    const { input, onAdd } = setup();
    await type(input, "nov");
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("shows a status when the search returns an error, keeping Create", async () => {
    const search = vi.fn(async () => ({ artists: [], error: "Search failed." }));
    const { input } = setup({ search });
    await type(input, "nov");
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't search artists.");
    expect(screen.getByRole("option", { name: 'Create "nov"' })).toBeInTheDocument();
  });

  it("shows a status when the search rejects", async () => {
    const search = vi.fn(async () => {
      throw new Error("boom");
    });
    const { input } = setup({ search });
    await type(input, "nov");
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't search artists.");
    fireEvent.change(input, { target: { value: "dayz" } });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("drops old results immediately when the query changes", async () => {
    const { input } = setup();
    await type(input, "nov");
    expect(screen.getByRole("option", { name: "Nova" })).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "sawc" } });
    expect(screen.queryByRole("option", { name: "Nova" })).toBeNull();
  });
});

describe("ArtistCombobox disabled", () => {
  it("disables the input and chip buttons, and Backspace does not remove", () => {
    const chip = existingChip({ id: "a1", name: "Nova" });
    const { input, onRemove } = setup({ disabled: true, chips: [chip] });
    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove Nova" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Nova left" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Nova right" })).toBeDisabled();
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(onRemove).not.toHaveBeenCalled();
  });
});
