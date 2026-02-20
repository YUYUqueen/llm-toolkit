import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createKeyTracker,
  calculateCooldownMs,
  calculateBillingCooldownMs,
} from "../src/key-tracker.js";

describe("calculateCooldownMs", () => {
  const config = { strategy: "exponential" as const, baseMs: 60_000, maxMs: 3_600_000, factor: 5 };

  it("returns base for first error", () => {
    expect(calculateCooldownMs(1, config)).toBe(60_000); // 1 min
  });

  it("scales exponentially", () => {
    expect(calculateCooldownMs(2, config)).toBe(300_000); // 5 min
    expect(calculateCooldownMs(3, config)).toBe(1_500_000); // 25 min
  });

  it("caps at max", () => {
    expect(calculateCooldownMs(4, config)).toBe(3_600_000); // 1 hour (capped)
    expect(calculateCooldownMs(10, config)).toBe(3_600_000); // still capped
  });

  it("treats 0 and negative as 1", () => {
    expect(calculateCooldownMs(0, config)).toBe(60_000);
    expect(calculateCooldownMs(-5, config)).toBe(60_000);
  });

  it("returns base for fixed strategy", () => {
    const fixed = { strategy: "fixed" as const, baseMs: 30_000, maxMs: 3_600_000, factor: 5 };
    expect(calculateCooldownMs(1, fixed)).toBe(30_000);
    expect(calculateCooldownMs(5, fixed)).toBe(30_000);
  });
});

describe("calculateBillingCooldownMs", () => {
  const config = { baseMs: 18_000_000, maxMs: 86_400_000 };

  it("returns base for first error", () => {
    expect(calculateBillingCooldownMs(1, config)).toBe(18_000_000); // 5 hours
  });

  it("doubles for second error", () => {
    expect(calculateBillingCooldownMs(2, config)).toBe(36_000_000); // 10 hours
  });

  it("caps at max", () => {
    expect(calculateBillingCooldownMs(3, config)).toBe(72_000_000); // 20h
    expect(calculateBillingCooldownMs(4, config)).toBe(86_400_000); // capped at 24h
  });
});

describe("createKeyTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const keys = [
    { id: "k1", provider: "anthropic", label: "main" },
    { id: "k2", provider: "anthropic" },
  ];

  it("starts with all keys healthy", () => {
    const tracker = createKeyTracker({ keys });
    const health = tracker.getHealth();
    expect(health.keys).toHaveLength(2);
    expect(health.keys.every((k) => k.status === "healthy")).toBe(true);
  });

  it("puts key in cooldown after rate limit failure", () => {
    const tracker = createKeyTracker({ keys });
    tracker.markFailure("k1", "rate_limit");
    expect(tracker.isInCooldown("k1")).toBe(true);
    expect(tracker.isInCooldown("k2")).toBe(false);
  });

  it("clears cooldown after time passes", () => {
    const tracker = createKeyTracker({ keys });
    tracker.markFailure("k1", "rate_limit");
    expect(tracker.isInCooldown("k1")).toBe(true);

    vi.advanceTimersByTime(61_000); // past 1 min cooldown
    expect(tracker.isInCooldown("k1")).toBe(false);
  });

  it("uses longer cooldown for billing errors", () => {
    const tracker = createKeyTracker({ keys });
    tracker.markFailure("k1", "billing");

    const health = tracker.getHealth();
    const k1 = health.keys.find((k) => k.id === "k1")!;
    expect(k1.status).toBe("disabled");

    vi.advanceTimersByTime(60_000); // 1 min — should still be disabled
    expect(tracker.isInCooldown("k1")).toBe(true);

    vi.advanceTimersByTime(18_000_000); // 5 hours total
    expect(tracker.isInCooldown("k1")).toBe(false);
  });

  it("resets on success", () => {
    const tracker = createKeyTracker({ keys });
    tracker.markFailure("k1", "rate_limit");
    expect(tracker.isInCooldown("k1")).toBe(true);
    tracker.markSuccess("k1");
    expect(tracker.isInCooldown("k1")).toBe(false);
  });

  it("resetCooldown clears specific key", () => {
    const tracker = createKeyTracker({ keys });
    tracker.markFailure("k1", "rate_limit");
    tracker.markFailure("k2", "auth");
    tracker.resetCooldown("k1");
    expect(tracker.isInCooldown("k1")).toBe(false);
    expect(tracker.isInCooldown("k2")).toBe(true);
  });

  it("resetAll clears everything", () => {
    const tracker = createKeyTracker({ keys });
    tracker.markFailure("k1", "rate_limit");
    tracker.markFailure("k2", "billing");
    tracker.resetAll();
    expect(tracker.isInCooldown("k1")).toBe(false);
    expect(tracker.isInCooldown("k2")).toBe(false);
  });

  it("returns unknown for nonexistent key", () => {
    const tracker = createKeyTracker({ keys });
    expect(tracker.isInCooldown("nonexistent")).toBe(false);
  });
});
