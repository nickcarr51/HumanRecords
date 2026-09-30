import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderWithTheme } from "@/test/renderWithTheme";

vi.mock("@/lib/admin/actions", () => ({ searchArtists: vi.fn() }));

import { ArtistCombobox, SEARCH_DEBOUNCE_MS } from "./ArtistCombobox";
import { existingChip, newChip, type ArtistChip } from "./upload-reducer";

function setup(overrides: Partial<React.ComponentProps<typeof ArtistCombobox>> = {}) {
  const search = vi.fn(async () => ({ artists: [{ id: "a1", name: "Daye" }], error: null }));
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
    await type(input, "day");
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("day");
  });

  it("shows matches and a Create row; clicking a match adds it and clears the input", async () => {
    const { input, onAdd } = setup();
    await type(input, "day");
    expect(screen.getByRole("option", { name: "Daye" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: 'Create "day"' })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("option", { name: "Daye" }));
    expect(onAdd).toHaveBeenCalledWith(existingChip({ id: "a1", name: "Daye" }));
    expect(input).toHaveValue("");
  });

  it("keyboard: ArrowDown + Enter picks, Escape closes", async () => {
    const { input, onAdd } = setup();
    await type(input, "day");
    fireEvent.keyDown(input, { key: "ArrowDown" }); // highlight option 0 (Daye)
    fireEvent.keyDown(input, { key: "ArrowDown" }); // highlight option 1 (Create "day")
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).toHaveBeenCalledWith(newChip("day"));
    await type(input, "day");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("Enter with no highlight picks the first option", async () => {
    const { input, onAdd } = setup();
    await type(input, "day");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).toHaveBeenCalledWith(existingChip({ id: "a1", name: "Daye" }));
  });

  it("Backspace on an empty input removes the last chip", () => {
    const chips: ArtistChip[] = [newChip("One"), newChip("Two")];
    const { input, onRemove } = setup({ chips });
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(onRemove).toHaveBeenCalledWith(newChip("Two").key);
  });

  it("chips have move and remove buttons and mark new artists", () => {
    const chips: ArtistChip[] = [existingChip({ id: "a1", name: "Daye" }), newChip("Sawcy")];
    const { onMove, onRemove } = setup({ chips });
    expect(screen.getByText("new")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move Sawcy left" }));
    expect(onMove).toHaveBeenCalledWith(newChip("Sawcy").key, -1);
    fireEvent.click(screen.getByRole("button", { name: "Remove Daye" }));
    expect(onRemove).toHaveBeenCalledWith("id:a1");
  });

  it("ignores a stale response that arrives after a newer query", async () => {
    let resolveFirst: (v: { artists: { id: string; name: string }[]; error: null }) => void = () => {};
    const search = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockResolvedValueOnce({ artists: [{ id: "a2", name: "Sawcy" }], error: null });
    const { input } = setup({ search });
    await type(input, "da");
    await type(input, "saw");
    await act(async () => resolveFirst({ artists: [{ id: "a1", name: "Daye" }], error: null }));
    expect(screen.queryByRole("option", { name: "Daye" })).toBeNull();
    expect(screen.getByRole("option", { name: "Sawcy" })).toBeInTheDocument();
  });

  it("resets the highlight when results shrink; Enter does not throw", async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce({ artists: [{ id: "a1", name: "Daye" }], error: null })
      .mockResolvedValueOnce({ artists: [], error: null });
    const { input, onAdd } = setup({ search });
    await type(input, "day");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" }); // Create row
    await type(input, "dayx"); // only the Create row remains
    expect(() => fireEvent.keyDown(input, { key: "Enter" })).not.toThrow();
    expect(onAdd).toHaveBeenCalledWith(newChip("dayx"));
  });

  it("Enter after Escape does nothing", async () => {
    const { input, onAdd } = setup();
    await type(input, "day");
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("shows a status when the search returns an error, keeping Create", async () => {
    const search = vi.fn(async () => ({ artists: [], error: "Search failed." }));
    const { input } = setup({ search });
    await type(input, "day");
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't search artists.");
    expect(screen.getByRole("option", { name: 'Create "day"' })).toBeInTheDocument();
  });

  it("shows a status when the search rejects", async () => {
    const search = vi.fn(async () => {
      throw new Error("boom");
    });
    const { input } = setup({ search });
    await type(input, "day");
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't search artists.");
    fireEvent.change(input, { target: { value: "dayz" } });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("drops old results immediately when the query changes", async () => {
    const { input } = setup();
    await type(input, "day");
    expect(screen.getByRole("option", { name: "Daye" })).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "sawc" } });
    expect(screen.queryByRole("option", { name: "Daye" })).toBeNull();
  });
});
