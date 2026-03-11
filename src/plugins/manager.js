// Plugin manager — registry and lifecycle orchestration for loaded plugins

import { info, warn } from "../utils/logger.js";

/**
 * PluginManager holds loaded plugins and provides access to their
 * renderers, publishers, and lifecycle hooks.
 *
 * Usage:
 *   const pm = new PluginManager(loadedPlugins);
 *   pm.getRenderers()   → { key: { title, render, ... }, ... }
 *   pm.getPublishers()  → { key: { publish, ... }, ... }
 *   await pm.runHook("afterScan", scanResult)
 */
export class PluginManager {
  constructor(plugins = []) {
    this._plugins = plugins;
    this._renderers = {};
    this._publishers = {};

    for (const plugin of plugins) {
      this._registerPlugin(plugin);
    }
  }

  _registerPlugin(plugin) {
    // Merge renderers (last plugin wins on conflict)
    for (const [key, renderer] of Object.entries(plugin.renderers)) {
      if (this._renderers[key]) {
        warn(`Plugin "${plugin.name}" overrides renderer "${key}" from a previous plugin`);
      }
      this._renderers[key] = {
        ...renderer,
        _pluginName: plugin.name,
      };
    }

    // Merge publishers (last plugin wins on conflict)
    for (const [key, publisher] of Object.entries(plugin.publishers)) {
      if (this._publishers[key]) {
        warn(`Plugin "${plugin.name}" overrides publisher "${key}" from a previous plugin`);
      }
      this._publishers[key] = {
        ...publisher,
        _pluginName: plugin.name,
      };
    }
  }

  /** Returns all plugin-provided renderers keyed by document type. */
  getRenderers() {
    return { ...this._renderers };
  }

  /** Returns all plugin-provided publishers keyed by publisher name. */
  getPublishers() {
    return { ...this._publishers };
  }

  /** True if any plugins are loaded. */
  hasPlugins() {
    return this._plugins.length > 0;
  }

  /** Number of loaded plugins. */
  get count() {
    return this._plugins.length;
  }

  /** List plugin names. */
  get names() {
    return this._plugins.map(p => p.name);
  }

  /**
   * Run a named hook across all plugins (in load order).
   * Hooks receive the value and can return a transformed version.
   * If a hook returns undefined/null, the original value is kept.
   *
   * @param {string} hookName - "afterScan" | "afterRender" | "afterPublish"
   * @param {*} value - The value to pass through the hook chain
   * @returns {Promise<*>} Possibly-transformed value
   */
  async runHook(hookName, value) {
    let current = value;

    for (const plugin of this._plugins) {
      const hookFn = plugin.hooks[hookName];
      if (!hookFn) continue;

      try {
        const result = await hookFn(current);
        if (result !== undefined && result !== null) {
          current = result;
        }
      } catch (err) {
        warn(`Plugin "${plugin.name}" hook "${hookName}" failed: ${err.message}`);
      }
    }

    return current;
  }
}
