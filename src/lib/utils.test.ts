import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("returns a single class unchanged", () => {
    expect(cn("px-4")).toBe("px-4");
  });

  it("joins multiple classes", () => {
    expect(cn("px-4", "py-2")).toBe("px-4 py-2");
  });

  it("ignores falsy values (undefined, null, false, empty string)", () => {
    expect(cn("px-4", undefined, null, false, "", "py-2")).toBe("px-4 py-2");
  });

  it("resolves conflicting Tailwind classes — last one wins", () => {
    // tailwind-merge keeps the last utility in a conflict group
    expect(cn("p-4", "p-2")).toBe("p-2");
    expect(cn("text-red-500", "text-blue-600")).toBe("text-blue-600");
  });

  it("supports conditional object syntax from clsx", () => {
    expect(cn({ "font-bold": true, italic: false })).toBe("font-bold");
    expect(cn("base", { active: true, disabled: false })).toBe("base active");
  });

  it("handles an array of class values", () => {
    expect(cn(["px-4", "py-2"])).toBe("px-4 py-2");
  });

  it("returns an empty string when given no arguments", () => {
    expect(cn()).toBe("");
  });
});
