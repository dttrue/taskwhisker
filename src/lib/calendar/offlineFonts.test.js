import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { surfaceLoader } from "../bookings/surfaceTestSupport.js";

test("root layout renders its children without remote font imports or preload requests", () => {
  const source = readFileSync(new URL("../../app/layout.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /next\/font\/google|fonts\.google/);
  const Layout = surfaceLoader(null, "synthetic", { dependencies: {
    "./globals.css": {}, "leaflet/dist/leaflet.css": {},
  } }).load("app/layout.js").default;
  const html = renderToStaticMarkup(React.createElement(Layout, null, React.createElement("p", null, "Calendar content")));
  assert.match(html, /<html lang="en" data-theme="taskwhisker">/);
  assert.match(html, /Calendar content/);
  assert.doesNotMatch(html, /<link|undefined|fonts\.google/);
});

test("both existing font variables resolve to offline system stacks", () => {
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /--font-geist-sans:\s*ui-sans-serif,\s*system-ui[^;]+sans-serif;/);
  assert.match(css, /--font-geist-mono:\s*ui-monospace,[^;]+monospace;/);
  assert.match(css, /font-family:\s*var\(--font-geist-sans\)/);
  assert.doesNotMatch(css, /fonts\.(googleapis|gstatic)\.com/);
});
