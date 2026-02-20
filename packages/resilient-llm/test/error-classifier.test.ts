import { describe, it, expect } from "vitest";
import { builtinClassifyError, createClassifier } from "../src/error-classifier.js";

describe("builtinClassifyError", () => {
  describe("rate limit", () => {
    it("classifies 429 status", () => {
      const err = { status: 429, message: "Too many requests" };
      expect(builtinClassifyError(err).reason).toBe("rate_limit");
    });

    it("classifies rate limit message", () => {
      expect(builtinClassifyError(new Error("rate limit exceeded")).reason).toBe("rate_limit");
      expect(builtinClassifyError(new Error("Too many requests")).reason).toBe("rate_limit");
      expect(builtinClassifyError(new Error("exceeded your current quota")).reason).toBe("rate_limit");
      expect(builtinClassifyError(new Error("resource_exhausted")).reason).toBe("rate_limit");
    });
  });

  describe("auth", () => {
    it("classifies 401 status", () => {
      expect(builtinClassifyError({ status: 401, message: "bad" }).reason).toBe("auth");
    });

    it("classifies 403 status", () => {
      expect(builtinClassifyError({ status: 403, message: "bad" }).reason).toBe("auth");
    });

    it("classifies auth error messages", () => {
      expect(builtinClassifyError(new Error("invalid api key")).reason).toBe("auth");
      expect(builtinClassifyError(new Error("unauthorized")).reason).toBe("auth");
      expect(builtinClassifyError(new Error("access denied")).reason).toBe("auth");
      expect(builtinClassifyError(new Error("token has expired")).reason).toBe("auth");
    });
  });

  describe("billing", () => {
    it("classifies 402 status", () => {
      expect(builtinClassifyError({ status: 402, message: "pay" }).reason).toBe("billing");
    });

    it("classifies billing messages", () => {
      expect(builtinClassifyError(new Error("payment required")).reason).toBe("billing");
      expect(builtinClassifyError(new Error("insufficient credits")).reason).toBe("billing");
      expect(builtinClassifyError(new Error("insufficient balance")).reason).toBe("billing");
    });
  });

  describe("context overflow", () => {
    it("classifies context overflow errors", () => {
      expect(builtinClassifyError(new Error("context length exceeded")).reason).toBe("context_overflow");
      expect(builtinClassifyError(new Error("prompt is too long")).reason).toBe("context_overflow");
      expect(builtinClassifyError(new Error("request_too_large")).reason).toBe("context_overflow");
      expect(builtinClassifyError(new Error("exceeds model context window")).reason).toBe("context_overflow");
    });
  });

  describe("thinking unsupported", () => {
    it("classifies thinking level errors", () => {
      expect(
        builtinClassifyError(new Error("thinking: supported values are: 'low', 'medium'")).reason,
      ).toBe("thinking_unsupported");
    });
  });

  describe("timeout", () => {
    it("classifies timeout errors", () => {
      expect(builtinClassifyError(new Error("timeout")).reason).toBe("timeout");
      expect(builtinClassifyError(new Error("ETIMEDOUT")).reason).toBe("timeout");
      expect(builtinClassifyError(new Error("socket hang up")).reason).toBe("timeout");
    });

    it("classifies transient HTTP errors", () => {
      expect(builtinClassifyError({ status: 502, message: "bad gateway" }).reason).toBe("timeout");
      expect(builtinClassifyError({ status: 503, message: "unavailable" }).reason).toBe("timeout");
    });
  });

  describe("unknown", () => {
    it("returns unknown for unrecognized errors", () => {
      const result = builtinClassifyError(new Error("something weird"));
      expect(result.reason).toBe("unknown");
      expect(result.retryable).toBe(false);
    });
  });

  describe("nested error shapes", () => {
    it("extracts message from error.error.message", () => {
      const err = { error: { message: "rate limit exceeded" } };
      expect(builtinClassifyError(err).reason).toBe("rate_limit");
    });

    it("handles string errors", () => {
      expect(builtinClassifyError("rate limit").reason).toBe("rate_limit");
    });
  });
});

describe("createClassifier", () => {
  it("uses custom classifier when it returns a result", () => {
    const custom = (err: unknown) => {
      if (err instanceof Error && err.message.includes("custom")) {
        return { reason: "billing" as const, message: err.message, retryable: true };
      }
      return null;
    };
    const classify = createClassifier(custom);
    expect(classify(new Error("custom error")).reason).toBe("billing");
    expect(classify(new Error("rate limit")).reason).toBe("rate_limit"); // falls through to builtin
  });

  it("uses builtin when no custom provided", () => {
    const classify = createClassifier();
    expect(classify(new Error("rate limit")).reason).toBe("rate_limit");
  });
});
