// Plugin loader — resolves and imports RepoLens plugins from config

import path from "node:path";
import { log, warn } from "../utils/logger.js";

/**
 * Load all plugins declared in config.
 *
 * Supports:
 *   - Relative paths: "./plugins/my-plugin.js"
 *   - Absolute paths: "/home/user/plugins/my-plugin.js"
 *   - npm packages: "@org/repolens-plugin-foo" or "repolens-plugin-foo"
 *
 * Each plugin module must export a `register` function.
 *
 * @param {string[]} pluginPaths - Array of plugin specifiers from config
 * @param {string} repoRoot - Repository root for resolving relative paths
 * @returns {Promise<object[]>} Array of validated plugin descriptors
 */
export async function loadPlugins(pluginPaths, repoRoot) {
  if (!pluginPaths || !Array.isArray(pluginPaths) || pluginPaths.length === 0) {
    return [];
  }

  const plugins = [];

  for (const specifier of pluginPaths) {
    try {
      const plugin = await loadSinglePlugin(specifier, repoRoot);
      plugins.push(plugin);
      log(`Loaded plugin: ${plugin.name} v${plugin.version || "0.0.0"}`);
    } catch (err) {
      warn(`Failed to load plugin "${specifier}": ${err.message}`);
    }
  }

  return plugins;
}

async function loadSinglePlugin(specifier, repoRoot) {
  if (typeof specifier !== "string" || specifier.length === 0) {
    throw new Error("Plugin specifier must be a non-empty string");
  }

  // Resolve the module path
  let modulePath;
  if (specifier.startsWith("./") || specifier.startsWith("../") || path.isAbsolute(specifier)) {
    // Local file path — resolve relative to repo root
    modulePath = path.resolve(repoRoot, specifier);
  } else {
    // npm package name — let Node resolve it
    modulePath = specifier;
  }

  // Import the module
  const mod = await import(modulePath);

  if (typeof mod.register !== "function") {
    throw new Error(`Plugin "${specifier}" does not export a register() function`);
  }

  // Call register to get the descriptor
  const descriptor = await mod.register();

  // Validate descriptor
  return validateDescriptor(descriptor, specifier);
}

function validateDescriptor(descriptor, specifier) {
  if (!descriptor || typeof descriptor !== "object") {
    throw new Error(`Plugin "${specifier}" register() must return an object`);
  }

  if (!descriptor.name || typeof descriptor.name !== "string") {
    throw new Error(`Plugin "${specifier}" must provide a "name" string`);
  }

  // Validate renderers
  if (descriptor.renderers) {
    if (typeof descriptor.renderers !== "object") {
      throw new Error(`Plugin "${descriptor.name}": renderers must be an object`);
    }
    for (const [key, renderer] of Object.entries(descriptor.renderers)) {
      if (typeof renderer.render !== "function") {
        throw new Error(`Plugin "${descriptor.name}": renderer "${key}" must have a render() function`);
      }
      if (!renderer.title || typeof renderer.title !== "string") {
        throw new Error(`Plugin "${descriptor.name}": renderer "${key}" must have a "title" string`);
      }
    }
  }

  // Validate publishers
  if (descriptor.publishers) {
    if (typeof descriptor.publishers !== "object") {
      throw new Error(`Plugin "${descriptor.name}": publishers must be an object`);
    }
    for (const [key, publisher] of Object.entries(descriptor.publishers)) {
      if (typeof publisher.publish !== "function") {
        throw new Error(`Plugin "${descriptor.name}": publisher "${key}" must have a publish() function`);
      }
    }
  }

  // Validate hooks
  if (descriptor.hooks) {
    if (typeof descriptor.hooks !== "object") {
      throw new Error(`Plugin "${descriptor.name}": hooks must be an object`);
    }
    const validHooks = ["afterScan", "afterRender", "afterPublish"];
    for (const hookName of Object.keys(descriptor.hooks)) {
      if (!validHooks.includes(hookName)) {
        throw new Error(`Plugin "${descriptor.name}": unknown hook "${hookName}". Valid hooks: ${validHooks.join(", ")}`);
      }
      if (typeof descriptor.hooks[hookName] !== "function") {
        throw new Error(`Plugin "${descriptor.name}": hook "${hookName}" must be a function`);
      }
    }
  }

  return {
    name: descriptor.name,
    version: descriptor.version || "0.0.0",
    renderers: descriptor.renderers || {},
    publishers: descriptor.publishers || {},
    hooks: descriptor.hooks || {},
  };
}
