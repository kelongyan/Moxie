import { describe, expect, it } from "vitest";
import { dirName, formatRelativeTime } from "../src/state/sidebar";

describe("formatRelativeTime", () => {
  const NOW = Date.parse("2026-09-11T18:00:00+08:00");
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  it("shows 刚刚 within a minute", () => {
    expect(formatRelativeTime(NOW - 30_000, NOW)).toBe("刚刚");
  });

  it("shows minutes and hours", () => {
    expect(formatRelativeTime(NOW - 5 * MIN, NOW)).toBe("5 分钟前");
    expect(formatRelativeTime(NOW - 3 * HOUR, NOW)).toBe("3 小时前");
  });

  it("shows days within a week", () => {
    expect(formatRelativeTime(NOW - 2 * DAY, NOW)).toBe("2 天前");
  });

  it("falls back to date beyond a week (same year)", () => {
    const ms = Date.parse("2026-09-01T10:00:00+08:00");
    expect(formatRelativeTime(ms, NOW)).toBe("9月1日");
  });

  it("includes the year for older dates", () => {
    const ms = Date.parse("2025-03-15T10:00:00+08:00");
    expect(formatRelativeTime(ms, NOW)).toBe("2025/3/15");
  });

  it("returns empty string for zero/invalid timestamps", () => {
    expect(formatRelativeTime(0, NOW)).toBe("");
  });
});

describe("dirName", () => {
  it("extracts the parent folder name", () => {
    expect(dirName("D:\\工作\\子目录\\a.md")).toBe("子目录");
    expect(dirName("D:/notes/file.ts")).toBe("notes");
  });

  it("returns empty string near the root", () => {
    expect(dirName("D:\\a.md")).toBe("D:");
    expect(dirName("a.md")).toBe("");
  });
});
