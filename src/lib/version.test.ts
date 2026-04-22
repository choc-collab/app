import { describe, it, expect } from "vitest";
import { compareVersions, decideBanner, parseVersion } from "./version";

describe("parseVersion", () => {
  it("parses three-segment semver", () => {
    expect(parseVersion("0.2.0")).toEqual([0, 2, 0]);
    expect(parseVersion("1.10.3")).toEqual([1, 10, 3]);
  });

  it("pads missing segments with 0", () => {
    expect(parseVersion("1")).toEqual([1, 0, 0]);
    expect(parseVersion("1.2")).toEqual([1, 2, 0]);
  });

  it("strips pre-release and build suffixes", () => {
    expect(parseVersion("1.2.3-rc.1")).toEqual([1, 2, 3]);
    expect(parseVersion("1.2.3+build.42")).toEqual([1, 2, 3]);
  });

  it("coerces non-numeric segments to 0 instead of NaN", () => {
    expect(parseVersion("abc")).toEqual([0, 0, 0]);
    expect(parseVersion("1.x.3")).toEqual([1, 0, 3]);
  });
});

describe("compareVersions", () => {
  it("orders patch, minor, and major correctly", () => {
    expect(compareVersions("0.1.0", "0.2.0")).toBe(-1);
    expect(compareVersions("0.2.0", "0.2.0")).toBe(0);
    expect(compareVersions("0.2.1", "0.2.0")).toBe(1);
    expect(compareVersions("1.0.0", "0.9.9")).toBe(1);
    expect(compareVersions("0.9.9", "0.10.0")).toBe(-1);
  });
});

describe("decideBanner", () => {
  const CURRENT = "0.2.0";

  it("stays in loading while preferences are unresolved", () => {
    expect(
      decideBanner({ currentVersion: CURRENT, lastSeenVersion: undefined, hasUserData: true }),
    ).toEqual({ kind: "loading" });
  });

  it("stays in loading while data-presence check is unresolved", () => {
    expect(
      decideBanner({ currentVersion: CURRENT, lastSeenVersion: null, hasUserData: undefined }),
    ).toEqual({ kind: "loading" });
  });

  it("treats no-version + no-data as a fresh install", () => {
    expect(
      decideBanner({ currentVersion: CURRENT, lastSeenVersion: null, hasUserData: false }),
    ).toEqual({ kind: "fresh-install" });
  });

  it("shows the banner for a pre-banner user who already has data", () => {
    expect(
      decideBanner({ currentVersion: CURRENT, lastSeenVersion: null, hasUserData: true }),
    ).toEqual({ kind: "show", from: null, to: CURRENT });
  });

  it("shows the banner when stored version is older than current", () => {
    expect(
      decideBanner({ currentVersion: CURRENT, lastSeenVersion: "0.1.0", hasUserData: true }),
    ).toEqual({ kind: "show", from: "0.1.0", to: CURRENT });
  });

  it("hides the banner when stored version equals current", () => {
    expect(
      decideBanner({ currentVersion: CURRENT, lastSeenVersion: "0.2.0", hasUserData: true }),
    ).toEqual({ kind: "hide" });
  });

  it("hides the banner when stored version is ahead of current", () => {
    expect(
      decideBanner({ currentVersion: CURRENT, lastSeenVersion: "0.3.0", hasUserData: true }),
    ).toEqual({ kind: "hide" });
  });

  it("ignores hasUserData once lastSeenVersion has ever been written", () => {
    // A user who dismissed the banner, then wiped all their data, should
    // *not* get a fresh-install pass — their preferences row survives.
    expect(
      decideBanner({ currentVersion: CURRENT, lastSeenVersion: "0.2.0", hasUserData: false }),
    ).toEqual({ kind: "hide" });
  });
});
