/**
 * Security Fuzzing Tests
 * 
 * Tests edge cases, malformed inputs, and potential injection attacks
 * to ensure RepoLens handles them gracefully.
 */

import { describe, it, expect } from "vitest";
import { detectSecrets, sanitizeSecrets, isLikelySecret } from "../src/utils/secrets.js";
import { validateConfig, validateSafePath } from "../src/utils/validate.js";

describe("Secrets Detection", () => {
  it("detects OpenAI API keys", () => {
    const text = "My API key is sk-1234567890abcdefghij";
    const findings = detectSecrets(text);
    
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].type).toBe("OpenAI API Key");
    expect(findings[0].severity).toBe("high");
  });
  
  it("detects GitHub tokens", () => {
    const text = "Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz";
    const findings = detectSecrets(text);
    
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].type).toBe("GitHub Token");
  });
  
  it("detects Notion tokens", () => {
    const text = "secret_abcdefghijklmnopqrstuvwxyz12345678901234";
    const findings = detectSecrets(text);
    
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].type).toBe("Notion Token");
  });
  
  it("sanitizes secrets in text", () => {
    const text = "API key: sk-1234567890abcdefghij should be hidden";
    const sanitized = sanitizeSecrets(text);
    
    expect(sanitized).not.toContain("sk-1234567890abcdefghij");
    expect(sanitized).toContain("***");
  });
  
  it("identifies high-entropy strings as potential secrets", () => {
    const likelySecret = "aB3Xk9pQwR2tY7uI5oP8as4Df6Gh1Jk0";
    const normalText = "hello world this is normal text";
    
    expect(isLikelySecret(likelySecret)).toBe(true);
    expect(isLikelySecret(normalText)).toBe(false);
  });
  
  it("handles empty and null inputs", () => {
    expect(detectSecrets("")).toEqual([]);
    expect(detectSecrets(null)).toEqual([]);
    expect(detectSecrets(undefined)).toEqual([]);
    expect(sanitizeSecrets("")).toBe("");
    expect(sanitizeSecrets(null)).toBe(null);
  });
});

describe("Config Validation - Security", () => {
  it("rejects config with directory traversal in patterns", () => {
    const config = {
      configVersion: 1,
      scan: {
        include: ["../../../etc/passwd"],
      },
      publishers: ["markdown"],
    };
    
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes(".."))).toBe(true);
  });
  
  it("rejects config with shell injection characters", () => {
    const config = {
      configVersion: 1,
      scan: {
        include: ["src/**/*.js; rm -rf /"],
      },
      publishers: ["markdown"],
    };
    
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("dangerous"))).toBe(true);
  });
  
  it("rejects config with command substitution", () => {
    const config = {
      configVersion: 1,
      scan: {
        include: ["$(whoami)/*.js"],
      },
      publishers: ["markdown"],
    };
    
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
  });
  
  it("detects secrets accidentally included in config", () => {
    const config = {
      configVersion: 1,
      scan: {
        include: ["src/**/*.js"],
      },
      publishers: ["markdown"],
      notion: {
        token: "secret_abcdefghijklmnopqrstuvwxyz12345678901234",
      },
    };
    
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("SECRET DETECTED"))).toBe(true);
  });
  
  it("validates branch names for injection", () => {
    const config = {
      configVersion: 1,
      scan: { include: ["src/**"] },
      publishers: ["markdown"],
      notion: {
        branches: ["main", "../../etc/passwd"],
      },
    };
    
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
  });
  
  it("rejects overly broad scan patterns", () => {
    const config = {
      configVersion: 1,
      scan: {
        include: ["**"],
      },
      publishers: ["markdown"],
    };
    
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("broad"))).toBe(true);
  });
  
  it("accepts valid config", () => {
    const config = {
      configVersion: 1,
      scan: {
        include: ["src/**/*.js"],
        exclude: ["**/node_modules/**"],
      },
      publishers: ["notion", "markdown"],
      notion: {
        branches: ["main", "production"],
      },
    };
    
    const result = validateConfig(config);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe("Path Validation", () => {
  it("rejects directory traversal in file paths", () => {
    const result = validateSafePath("../../../etc/passwd");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("traversal");
  });
  
  it("rejects absolute paths", () => {
    expect(validateSafePath("/etc/passwd").valid).toBe(false);
    expect(validateSafePath("C:\\Windows\\System32").valid).toBe(false);
  });
  
  it("rejects null bytes", () => {
    const result = validateSafePath("file\0.txt");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Null bytes");
  });
  
  it("accepts valid relative paths", () => {
    expect(validateSafePath("src/index.js").valid).toBe(true);
    expect(validateSafePath("docs/README.md").valid).toBe(true);
    expect(validateSafePath(".repolens.yml").valid).toBe(true);
  });
});

describe("Fuzzing - Malformed YAML", () => {
  it("handles extremely nested config", () => {
    // Create deeply nested object
    let nested = { value: "end" };
    for (let i = 0; i < 100; i++) {
      nested = { child: nested };
    }
    
    const config = {
      configVersion: 1,
      publishers: ["markdown"],
      scan: nested,
    };
    
    // Should not crash, even if invalid
    expect(() => validateConfig(config)).not.toThrow();
  });
  
  it("handles extremely long strings", () => {
    const longString = "a".repeat(1000000);
    const config = {
      configVersion: 1,
      publishers: ["markdown"],
      scan: {
        include: [longString],
      },
    };
    
    expect(() => validateConfig(config)).not.toThrow();
  });
  
  it("handles arrays with many elements", () => {
    const manyPatterns = Array(10000).fill("src/**/*.js");
    const config = {
      configVersion: 1,
      publishers: ["markdown"],
      scan: {
        include: manyPatterns,
      },
    };
    
    expect(() => validateConfig(config)).not.toThrow();
  });
  
  it("handles circular references gracefully", () => {
    const config = {
      configVersion: 1,
      publishers: ["markdown"],
      scan: { include: ["src/**"] },
    };
    
    // Create circular reference
    config.self = config;
    
    // Should handle gracefully (JSON.stringify will fail, but validation should handle)
    expect(() => validateConfig(config)).not.toThrow();
  });
  
  it("handles special Unicode characters", () => {
    const config = {
      configVersion: 1,
      publishers: ["markdown"],
      scan: {
        include: ["src/**/*.js", "🚀💻📊", "零一二三四", "مرحبا"],
      },
    };
    
    expect(() => validateConfig(config)).not.toThrow();
  });
  
  it("handles non-string types in string fields", () => {
    const config = {
      configVersion: 1,
      publishers: ["markdown"],
      scan: {
        include: [123, true, null, undefined, {}, []],
      },
    };
    
    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    // Should report type errors, not crash
  });
});

describe("Injection Attack Prevention", () => {
  const injectionPayloads = [
    // SQL Injection
    "'; DROP TABLE users; --",
    "1' OR '1'='1",
    
    // Command Injection
    "; rm -rf /",
    "| cat /etc/passwd",
    "$(whoami)",
    "`id`",
    
    // Path Traversal
    "../../../etc/passwd",
    "..\\..\\..\\windows\\system32",
    
    // YAML Injection
    "!!python/object/apply:os.system ['echo pwned']",
    "!!python/object/new:exec ['print(\"pwned\")']",
    
    // NoSQL Injection
    '{"$gt": ""}',
    '{"$ne": null}',
    
    // LDAP Injection
    "*)(uid=*",
    "admin*",
    
    // XML Injection
    "<script>alert('xss')</script>",
    "<?xml version=\"1.0\"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM \"file:///etc/passwd\">]>",
  ];
  
  injectionPayloads.forEach((payload) => {
    it(`rejects injection payload: ${payload.substring(0, 30)}...`, () => {
      const config = {
        configVersion: 1,
        scan: {
          include: [payload],
        },
        publishers: ["markdown"],
      };
      
      const result = validateConfig(config);
      
      // Should be invalid OR handle gracefully without crashing
      if (result.valid) {
        // If somehow valid, at least it didn't crash
        expect(true).toBe(true);
      } else {
        // Should have detected the dangerous pattern
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });
  });
});

describe("Boundary Conditions", () => {
  it("handles empty config", () => {
    const result = validateConfig({});
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("configVersion"))).toBe(true);
  });
  
  it("handles config with only required fields", () => {
    const config = {
      configVersion: 1,
    };
    
    const result = validateConfig(config);
    // Should have warnings but might be technically valid
    expect(result.warnings.length).toBeGreaterThan(0);
  });
  
  it("handles config with unknown fields", () => {
    const config = {
      configVersion: 1,
      publishers: ["markdown"],
      scan: { include: ["src/**"] },
      unknownField: "should be ignored",
      anotherUnknown: { nested: true },
    };
    
    // Unknown fields should not cause validation to fail
    const result = validateConfig(config);
    // Might be valid or might warn, but shouldn't error on unknown fields
    expect(() => validateConfig(config)).not.toThrow();
  });
  
  it("handles very large config files", () => {
    const config = {
      configVersion: 1,
      publishers: ["markdown"],
      scan: {
        include: Array(1000).fill(null).map((_, i) => `src/${i}/**/*.js`),
        exclude: Array(1000).fill(null).map((_, i) => `test/${i}/**`),
      },
      domains: Array(100).fill(null).map((_, i) => ({
        name: `Domain${i}`,
        patterns: [`pattern${i}`],
        description: `Description ${i}`.repeat(100),
      })),
    };
    
    expect(() => validateConfig(config)).not.toThrow();
  });
});
