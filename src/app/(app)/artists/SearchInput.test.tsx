import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithTheme } from "@/test/renderWithTheme";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/artists",
  useSearchParams: () => new URLSearchParams(),
}));

import { SearchInput } from "./SearchInput";

afterEach(() => {
  replace.mockClear();
  vi.useRealTimers();
});

describe("SearchInput", () => {
  it("pushes a debounced q param to the URL and resets page", () => {
    vi.useFakeTimers();
    renderWithTheme(<SearchInput initialQuery="" />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "mara" } });
    expect(replace).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(replace).toHaveBeenCalledWith("/artists?q=mara");
  });
});
