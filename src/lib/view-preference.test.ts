import assert from "node:assert/strict";
import test from "node:test";

import {
  SIDEBAR_COLLAPSED_KEY,
  getSidebarCollapsed,
  getStoredPreference,
  getViewPreference,
  setSidebarCollapsed,
  setStoredPreference,
  setViewPreference,
  viewStorageKey,
} from "./view-preference.ts";

const memory = new Map<string, string>();

function installLocalStorage(): void {
  memory.clear();
  const localStorage = {
    getItem(key: string) {
      return memory.has(key) ? memory.get(key)! : null;
    },
    setItem(key: string, value: string) {
      memory.set(key, String(value));
    },
    removeItem(key: string) {
      memory.delete(key);
    },
    clear() {
      memory.clear();
    },
    key() {
      return null;
    },
    get length() {
      return memory.size;
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: localStorage,
  });
}

function uninstallLocalStorage(): void {
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "localStorage");
  memory.clear();
}

test("viewStorageKey uses e3.view.<page> pattern", () => {
  assert.equal(viewStorageKey("playlists"), "e3.view.playlists");
  assert.equal(viewStorageKey("campaigns"), "e3.view.campaigns");
});

test("getViewPreference returns fallback when nothing stored", () => {
  installLocalStorage();
  try {
    assert.equal(getViewPreference("playlists", ["list", "grid"] as const, "list"), "list");
    assert.equal(getViewPreference("media", ["grid", "list"] as const, "grid"), "grid");
  } finally {
    uninstallLocalStorage();
  }
});

test("setViewPreference persists until changed", () => {
  installLocalStorage();
  try {
    setViewPreference("playlists", "grid");
    assert.equal(getStoredPreference("e3.view.playlists"), "grid");
    assert.equal(getViewPreference("playlists", ["list", "grid"] as const, "list"), "grid");

    setViewPreference("playlists", "list");
    assert.equal(getViewPreference("playlists", ["list", "grid"] as const, "list"), "list");
  } finally {
    uninstallLocalStorage();
  }
});

test("getViewPreference ignores invalid stored values", () => {
  installLocalStorage();
  try {
    setStoredPreference("e3.view.screens", "cards");
    assert.equal(getViewPreference("screens", ["table", "grid"] as const, "table"), "table");
  } finally {
    uninstallLocalStorage();
  }
});

test("sidebar defaults to collapsed when unset", () => {
  installLocalStorage();
  try {
    assert.equal(getSidebarCollapsed(true), true);
    setSidebarCollapsed(false);
    assert.equal(getStoredPreference(SIDEBAR_COLLAPSED_KEY), "false");
    assert.equal(getSidebarCollapsed(true), false);
    setSidebarCollapsed(true);
    assert.equal(getSidebarCollapsed(true), true);
  } finally {
    uninstallLocalStorage();
  }
});
