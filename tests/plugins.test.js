import { describe, it, expect, vi, beforeEach } from "vitest";
import { PluginManager } from "../src/plugins/manager.js";

// --- PluginManager tests ---

describe("PluginManager", () => {
  it("initialises with no plugins", () => {
    const pm = new PluginManager([]);
    expect(pm.hasPlugins()).toBe(false);
    expect(pm.count).toBe(0);
    expect(pm.names).toEqual([]);
    expect(pm.getRenderers()).toEqual({});
    expect(pm.getPublishers()).toEqual({});
  });

  it("registers renderers from plugins", () => {
    const plugin = {
      name: "test-plugin",
      version: "1.0.0",
      renderers: {
        custom_doc: {
          title: "Custom Document",
          render: async () => "# Custom",
        },
      },
      publishers: {},
      hooks: {},
    };

    const pm = new PluginManager([plugin]);
    expect(pm.hasPlugins()).toBe(true);
    expect(pm.count).toBe(1);
    expect(pm.names).toEqual(["test-plugin"]);

    const renderers = pm.getRenderers();
    expect(renderers.custom_doc).toBeDefined();
    expect(renderers.custom_doc.title).toBe("Custom Document");
    expect(typeof renderers.custom_doc.render).toBe("function");
  });

  it("registers publishers from plugins", () => {
    const publishFn = vi.fn();
    const plugin = {
      name: "pub-plugin",
      version: "0.1.0",
      renderers: {},
      publishers: {
        obsidian: { publish: publishFn },
      },
      hooks: {},
    };

    const pm = new PluginManager([plugin]);
    const publishers = pm.getPublishers();
    expect(publishers.obsidian).toBeDefined();
    expect(publishers.obsidian.publish).toBe(publishFn);
  });

  it("last plugin wins on renderer key conflict", () => {
    const plugin1 = {
      name: "plugin-a",
      version: "1.0.0",
      renderers: {
        my_doc: { title: "From A", render: async () => "A" },
      },
      publishers: {},
      hooks: {},
    };
    const plugin2 = {
      name: "plugin-b",
      version: "1.0.0",
      renderers: {
        my_doc: { title: "From B", render: async () => "B" },
      },
      publishers: {},
      hooks: {},
    };

    const pm = new PluginManager([plugin1, plugin2]);
    expect(pm.getRenderers().my_doc.title).toBe("From B");
  });

  it("runs hooks in load order", async () => {
    const order = [];
    const plugin1 = {
      name: "hook-a",
      version: "1.0.0",
      renderers: {},
      publishers: {},
      hooks: {
        afterScan: async (v) => {
          order.push("a");
          return { ...v, extra: "a" };
        },
      },
    };
    const plugin2 = {
      name: "hook-b",
      version: "1.0.0",
      renderers: {},
      publishers: {},
      hooks: {
        afterScan: async (v) => {
          order.push("b");
          return { ...v, extra2: "b" };
        },
      },
    };

    const pm = new PluginManager([plugin1, plugin2]);
    const result = await pm.runHook("afterScan", { original: true });

    expect(order).toEqual(["a", "b"]);
    expect(result).toEqual({ original: true, extra: "a", extra2: "b" });
  });

  it("hook returning undefined preserves value", async () => {
    const plugin = {
      name: "noop",
      version: "1.0.0",
      renderers: {},
      publishers: {},
      hooks: {
        afterScan: async () => undefined,
      },
    };

    const pm = new PluginManager([plugin]);
    const result = await pm.runHook("afterScan", { preserved: true });
    expect(result).toEqual({ preserved: true });
  });

  it("hook errors are caught and value is preserved", async () => {
    const plugin = {
      name: "bad-hook",
      version: "1.0.0",
      renderers: {},
      publishers: {},
      hooks: {
        afterPublish: async () => {
          throw new Error("hook crashed");
        },
      },
    };

    const pm = new PluginManager([plugin]);
    const result = await pm.runHook("afterPublish", { safe: true });
    expect(result).toEqual({ safe: true });
  });

  it("runHook with no matching hooks returns original value", async () => {
    const pm = new PluginManager([]);
    const result = await pm.runHook("afterRender", [1, 2, 3]);
    expect(result).toEqual([1, 2, 3]);
  });
});

// --- Plugin loader validation tests (using manager directly) ---

describe("Plugin descriptor validation", () => {
  it("accepts a valid minimal plugin", () => {
    const plugin = {
      name: "minimal",
      version: "0.0.0",
      renderers: {},
      publishers: {},
      hooks: {},
    };
    const pm = new PluginManager([plugin]);
    expect(pm.count).toBe(1);
  });

  it("supports multiple renderers and publishers from one plugin", () => {
    const plugin = {
      name: "multi",
      version: "2.0.0",
      renderers: {
        doc_a: { title: "Doc A", render: async () => "A" },
        doc_b: { title: "Doc B", render: async () => "B" },
      },
      publishers: {
        pub_x: { publish: async () => {} },
        pub_y: { publish: async () => {} },
      },
      hooks: {},
    };

    const pm = new PluginManager([plugin]);
    const rKeys = Object.keys(pm.getRenderers());
    const pKeys = Object.keys(pm.getPublishers());
    expect(rKeys).toEqual(["doc_a", "doc_b"]);
    expect(pKeys).toEqual(["pub_x", "pub_y"]);
  });

  it("renderer render() receives context and returns content", async () => {
    const renderFn = vi.fn().mockResolvedValue("# Generated\n\nContent");
    const plugin = {
      name: "render-test",
      version: "1.0.0",
      renderers: {
        test_doc: { title: "Test", render: renderFn },
      },
      publishers: {},
      hooks: {},
    };

    const pm = new PluginManager([plugin]);
    const result = await pm.getRenderers().test_doc.render({ scanResult: {} });

    expect(renderFn).toHaveBeenCalledWith({ scanResult: {} });
    expect(result).toBe("# Generated\n\nContent");
  });

  it("publisher publish() receives cfg and renderedPages", async () => {
    const publishFn = vi.fn().mockResolvedValue(undefined);
    const plugin = {
      name: "pub-test",
      version: "1.0.0",
      renderers: {},
      publishers: {
        my_pub: { publish: publishFn },
      },
      hooks: {},
    };

    const pm = new PluginManager([plugin]);
    const cfg = { project: { name: "test" } };
    const pages = { system_overview: "# Overview" };
    await pm.getPublishers().my_pub.publish(cfg, pages);

    expect(publishFn).toHaveBeenCalledWith(cfg, pages);
  });
});

// --- Plugin loader import tests ---

describe("Plugin loader", () => {
  // We can't easily test dynamic import without real files,
  // but we can test the loadPlugins function with empty/invalid input.
  
  let loadPlugins;
  
  beforeEach(async () => {
    const mod = await import("../src/plugins/loader.js");
    loadPlugins = mod.loadPlugins;
  });

  it("returns empty array for undefined plugins", async () => {
    const result = await loadPlugins(undefined, "/tmp");
    expect(result).toEqual([]);
  });

  it("returns empty array for empty plugins array", async () => {
    const result = await loadPlugins([], "/tmp");
    expect(result).toEqual([]);
  });

  it("returns empty array for null plugins", async () => {
    const result = await loadPlugins(null, "/tmp");
    expect(result).toEqual([]);
  });

  it("gracefully handles non-existent plugin path", async () => {
    const result = await loadPlugins(["./nonexistent-plugin.js"], "/tmp");
    expect(result).toEqual([]);
  });

  it("gracefully handles non-existent npm package", async () => {
    const result = await loadPlugins(["@nonexistent/repolens-plugin-fake"], "/tmp");
    expect(result).toEqual([]);
  });
});

// --- Config schema validation for plugins ---

describe("Config schema plugins validation", () => {
  let validateConfig;
  
  beforeEach(async () => {
    const mod = await import("../src/core/config-schema.js");
    validateConfig = mod.validateConfig;
  });

  it("accepts config with valid plugins array", () => {
    const config = {
      configVersion: 1,
      project: { name: "test" },
      publishers: ["markdown"],
      scan: { include: ["src/**"], ignore: ["node_modules/**"] },
      outputs: { pages: [{ key: "system_overview", title: "Overview" }] },
      plugins: ["./my-plugin.js", "@org/repolens-plugin-foo"],
    };
    // Should not throw
    expect(() => validateConfig(config)).not.toThrow();
  });

  it("rejects non-array plugins", () => {
    const config = {
      configVersion: 1,
      project: { name: "test" },
      publishers: ["markdown"],
      scan: { include: ["src/**"] },
      plugins: "not-an-array",
    };
    expect(() => validateConfig(config)).toThrow("plugins must be an array");
  });

  it("rejects non-string plugin entries", () => {
    const config = {
      configVersion: 1,
      project: { name: "test" },
      publishers: ["markdown"],
      scan: { include: ["src/**"] },
      plugins: [123],
    };
    expect(() => validateConfig(config)).toThrow("plugins[0]");
  });

  it("accepts custom publisher names for plugin publishers", () => {
    const config = {
      configVersion: 1,
      project: { name: "test" },
      publishers: ["markdown", "obsidian"],
      scan: { include: ["src/**"], ignore: ["node_modules/**"] },
      outputs: { pages: [{ key: "system_overview", title: "Overview" }] },
      plugins: ["./obsidian-plugin.js"],
    };
    // Should not throw — plugin publishers are allowed
    expect(() => validateConfig(config)).not.toThrow();
  });
});
