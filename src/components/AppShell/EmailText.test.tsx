import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { EmailText } from "./EmailText";

describe("EmailText", () => {
  it("puts the only break opportunity before the @", () => {
    const { container } = render(<p><EmailText email="someone.long@example.com" /></p>);
    expect(container.textContent).toBe("someone.long@example.com");
    expect(container.querySelector("p")!.innerHTML).toBe("someone.long<wbr>@example.com");
  });

  it("leaves a string without an @ alone", () => {
    const { container } = render(<p><EmailText email="nobody" /></p>);
    expect(container.querySelector("p")!.innerHTML).toBe("nobody");
  });
});
