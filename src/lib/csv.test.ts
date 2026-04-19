import { describe, it, expect } from "vitest";
import { parseCSV } from "./csv";

describe("parseCSV", () => {
  it("returns empty array for a header-only file", () => {
    expect(parseCSV("name,unit")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseCSV("")).toEqual([]);
  });

  it("parses a simple two-column CSV", () => {
    const result = parseCSV("name,unit\nsugar,g\ncream,ml");
    expect(result).toEqual([
      { name: "sugar", unit: "g" },
      { name: "cream", unit: "ml" },
    ]);
  });

  it("trims whitespace from keys and values", () => {
    const result = parseCSV(" name , unit \n sugar , g ");
    expect(result).toEqual([{ name: "sugar", unit: "g" }]);
  });

  it("handles quoted fields containing commas", () => {
    const result = parseCSV('name,notes\n"Valrhona, 70%",dark chocolate');
    expect(result).toEqual([{ name: "Valrhona, 70%", notes: "dark chocolate" }]);
  });

  it("handles escaped double-quotes inside quoted fields", () => {
    const result = parseCSV('name,notes\n"She said ""hello""",test');
    expect(result).toEqual([{ name: 'She said "hello"', notes: "test" }]);
  });

  it("fills missing trailing columns with empty string", () => {
    const result = parseCSV("a,b,c\n1,2");
    expect(result).toEqual([{ a: "1", b: "2", c: "" }]);
  });

  it("handles Windows CRLF line endings without corrupting values", () => {
    const result = parseCSV("name,unit\r\nsugar,g\r\ncream,ml");
    expect(result).toEqual([
      { name: "sugar", unit: "g" },
      { name: "cream", unit: "ml" },
    ]);
  });

  it("handles a single data row with no trailing newline", () => {
    const result = parseCSV("name,unit\nsugar,g");
    expect(result).toEqual([{ name: "sugar", unit: "g" }]);
  });

  it("handles a single-column CSV", () => {
    const result = parseCSV("name\nsugar\ncream");
    expect(result).toEqual([{ name: "sugar" }, { name: "cream" }]);
  });
});
