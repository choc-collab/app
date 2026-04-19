import { describe, expect, it } from "vitest";
import {
  parseSteps,
  serializeSteps,
  insertStepAt,
  removeStepAt,
  updateStepAt,
  moveStep,
} from "./steps";

describe("parseSteps", () => {
  it("returns empty array for undefined / null / empty", () => {
    expect(parseSteps(undefined)).toEqual([]);
    expect(parseSteps(null)).toEqual([]);
    expect(parseSteps("")).toEqual([]);
  });

  it("returns empty array for whitespace-only", () => {
    expect(parseSteps("   \n  \n\n")).toEqual([]);
  });

  it("splits a newline-separated list with no markers", () => {
    expect(parseSteps("Heat cream\nPour over chocolate\nEmulsify")).toEqual([
      "Heat cream",
      "Pour over chocolate",
      "Emulsify",
    ]);
  });

  it("strips leading ordered-list markers (single digit)", () => {
    expect(parseSteps("1. Heat cream\n2. Pour\n3. Emulsify")).toEqual([
      "Heat cream",
      "Pour",
      "Emulsify",
    ]);
  });

  it("strips leading ordered-list markers (multi-digit)", () => {
    expect(parseSteps("10. ten\n11. eleven\n12. twelve")).toEqual([
      "ten",
      "eleven",
      "twelve",
    ]);
  });

  it("strips parenthesis-style ordered markers", () => {
    expect(parseSteps("1) first\n2) second")).toEqual(["first", "second"]);
  });

  it("strips bullet markers (-, *, •)", () => {
    expect(parseSteps("- item a\n* item b\n• item c")).toEqual([
      "item a",
      "item b",
      "item c",
    ]);
  });

  it("strips leading whitespace before markers", () => {
    expect(parseSteps("   1. indented\n\t2. also indented")).toEqual([
      "indented",
      "also indented",
    ]);
  });

  it("preserves inline content that just happens to contain digits and dots", () => {
    expect(parseSteps("Heat to 80.5°C\nCool to 32.5°C")).toEqual([
      "Heat to 80.5°C",
      "Cool to 32.5°C",
    ]);
  });

  it("drops blank lines between non-empty lines", () => {
    expect(parseSteps("one\n\ntwo\n\n\nthree")).toEqual(["one", "two", "three"]);
  });

  it("handles CRLF line endings", () => {
    expect(parseSteps("one\r\ntwo\r\nthree")).toEqual(["one", "two", "three"]);
  });

  it("does not strip a dot that isn't part of a numbered marker", () => {
    // "1.5 cups" — `1.5` isn't followed by a space, not a list marker
    expect(parseSteps("1.5 cups cream")).toEqual(["1.5 cups cream"]);
  });
});

describe("serializeSteps", () => {
  it("returns empty string for empty array", () => {
    expect(serializeSteps([])).toBe("");
  });

  it("joins steps with single newlines and no numbering", () => {
    expect(serializeSteps(["one", "two", "three"])).toBe("one\ntwo\nthree");
  });

  it("trims individual steps", () => {
    expect(serializeSteps(["  one  ", "two\t", " three"])).toBe("one\ntwo\nthree");
  });

  it("drops empty and whitespace-only steps", () => {
    expect(serializeSteps(["one", "", "   ", "two"])).toBe("one\ntwo");
  });
});

describe("round-trip stability", () => {
  it("parse → serialize → parse is stable", () => {
    const stored = "Heat cream\nPour over chocolate\nEmulsify";
    const parsed = parseSteps(stored);
    const serialized = serializeSteps(parsed);
    const reparsed = parseSteps(serialized);
    expect(reparsed).toEqual(parsed);
    expect(serialized).toBe(stored);
  });

  it("legacy numbered input normalises on first round-trip", () => {
    const legacy = "1. Heat cream\n2. Pour\n3. Emulsify";
    const normalised = serializeSteps(parseSteps(legacy));
    expect(normalised).toBe("Heat cream\nPour\nEmulsify");
    // Second round-trip stable
    expect(serializeSteps(parseSteps(normalised))).toBe(normalised);
  });
});

describe("insertStepAt", () => {
  it("inserts at the start", () => {
    expect(insertStepAt(["b", "c"], 0, "a")).toEqual(["a", "b", "c"]);
  });

  it("inserts in the middle (the motivating case — no renumbering needed)", () => {
    expect(insertStepAt(["one", "three"], 1, "two")).toEqual(["one", "two", "three"]);
  });

  it("inserts at the end", () => {
    expect(insertStepAt(["a", "b"], 2, "c")).toEqual(["a", "b", "c"]);
  });

  it("clamps out-of-range index", () => {
    expect(insertStepAt(["a"], 99, "x")).toEqual(["a", "x"]);
    expect(insertStepAt(["a"], -5, "x")).toEqual(["x", "a"]);
  });

  it("inserts empty string by default", () => {
    expect(insertStepAt(["a", "b"], 1)).toEqual(["a", "", "b"]);
  });

  it("does not mutate input", () => {
    const input = ["a", "b"];
    insertStepAt(input, 1, "x");
    expect(input).toEqual(["a", "b"]);
  });
});

describe("removeStepAt", () => {
  it("removes the step at the given index", () => {
    expect(removeStepAt(["a", "b", "c"], 1)).toEqual(["a", "c"]);
  });

  it("is a no-op for out-of-range indices", () => {
    expect(removeStepAt(["a", "b"], 5)).toEqual(["a", "b"]);
    expect(removeStepAt(["a", "b"], -1)).toEqual(["a", "b"]);
  });

  it("does not mutate input", () => {
    const input = ["a", "b", "c"];
    removeStepAt(input, 1);
    expect(input).toEqual(["a", "b", "c"]);
  });
});

describe("updateStepAt", () => {
  it("replaces the step at the given index", () => {
    expect(updateStepAt(["a", "b", "c"], 1, "B!")).toEqual(["a", "B!", "c"]);
  });

  it("is a no-op for out-of-range indices", () => {
    expect(updateStepAt(["a"], 5, "x")).toEqual(["a"]);
  });
});

describe("moveStep", () => {
  it("moves an item down", () => {
    expect(moveStep(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("moves an item up", () => {
    expect(moveStep(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("is a no-op when from === to", () => {
    expect(moveStep(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });

  it("is a no-op for out-of-range indices", () => {
    expect(moveStep(["a", "b"], 0, 5)).toEqual(["a", "b"]);
    expect(moveStep(["a", "b"], -1, 0)).toEqual(["a", "b"]);
  });
});
