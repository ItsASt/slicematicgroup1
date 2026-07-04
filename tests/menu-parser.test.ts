import { describe, it, expect } from "vitest";
import { parseMenuLine, parseMenuFile } from "@/lib/menu-parser";

describe("parseMenuLine", () => {
  it("parses a valid line with padding whitespace", () => {
    expect(parseMenuLine("  B1 ; Thin Crust ; 149  ")).toEqual({
      id: "B1",
      name: "Thin Crust",
      price: 149,
    });
  });

  it("returns null when the price field is missing", () => {
    expect(parseMenuLine("B1 ; Thin Crust")).toBeNull();
  });

  it("returns null when price is not a number", () => {
    expect(parseMenuLine("B1 ; Thin Crust ; cheap")).toBeNull();
  });

  it("returns null when price is zero or negative", () => {
    expect(parseMenuLine("B1 ; Thin Crust ; 0")).toBeNull();
    expect(parseMenuLine("B1 ; Thin Crust ; -20")).toBeNull();
  });

  it("returns null when any field is empty", () => {
    expect(parseMenuLine(" ; Thin Crust ; 149")).toBeNull();
    expect(parseMenuLine("B1 ;  ; 149")).toBeNull();
  });
});

describe("parseMenuFile", () => {
  it("collects valid lines and reports skipped ones", () => {
    const content = "B1 ; Thin Crust ; 149\n\nBAD LINE\nB2 ; Thick Crust ; 169\n";
    const result = parseMenuFile(content);
    expect(result.items).toHaveLength(2);
    expect(result.skipped).toEqual(["BAD LINE"]);
  });

  it("handles CRLF line endings", () => {
    const result = parseMenuFile("B1 ; Thin Crust ; 149\r\nB2 ; Thick Crust ; 169\r\n");
    expect(result.items).toHaveLength(2);
  });

  it("returns empty results for empty content", () => {
    expect(parseMenuFile("")).toEqual({ items: [], skipped: [] });
  });
});
