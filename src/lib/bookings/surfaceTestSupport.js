import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import React from "react";
import swc from "next/dist/build/swc/index.js";
// Render the real JSX and helpers with the project's compiler. Only framework
// boundaries (auth, database, navigation and write actions) are substituted.
const require = createRequire(import.meta.url);
const src = fileURLToPath(new URL("../../", import.meta.url));
await swc.loadBindings();
export function surfaceLoader(booking, actorId = "sitter", options = {}) {
  const cache = new Map();
  const queries = [];
  const db = {
    booking: {
      async findUnique(args) { queries.push(args); return booking; },
      async findMany() { return []; },
      async findFirst() { return null; },
    },
    user: { async findUnique() { return { id: "sitter", role: "SITTER" }; }, async findMany() { return []; } },
  };
  Object.assign(db, options.db || {});
  const actions = options.actions || new Proxy({}, { get: () => async () => ({ ok: true }) });
  function load(path) {
    if (cache.has(path)) return cache.get(path).exports;
    const evaluatedModule = { exports: {} }; cache.set(path, evaluatedModule);
    const { code } = swc.transformSync(readFileSync(path, "utf8"), {
      filename: path,
      jsc: { target: "es2022", parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
      module: { type: "commonjs" },
    });
    function dependency(name) {
      if (options.dependencies && Object.hasOwn(options.dependencies, name)) return options.dependencies[name];
      if (name === "react" && options.react) return options.react;
      if (name === "next/link") return { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) };
      if (name === "next/navigation") return { redirect(path) { throw new Error(`Redirect: ${path}`); }, notFound() { throw new Error("Not found"); }, useRouter: () => ({ refresh: options.refresh || (() => {}) }), usePathname: () => "/dashboard/sitter" };
      if (name === "@/auth" || name === "@/lib/auth") return { requireRole: async () => ({ user: { id: actorId, email: "sitter@example.invalid" } }), auth: async () => ({ user: { id: actorId, email: "sitter@example.invalid" } }) };
      if (name === "@/lib/db") return { prisma: db };
      if (/\/(?:actions|handoffActions|careActions)(?:\.js)?$/.test(name) || /approveCancellationActions$/.test(name)) return actions;
      if (name.startsWith("@/") || name.startsWith(".")) {
        const base = name.startsWith("@/") ? resolve(src, name.slice(2)) : resolve(dirname(path), name);
        const target = [base, `${base}.js`, `${base}.jsx`].find((p) => existsSync(p));
        if (!target) throw new Error(`Unresolved test dependency: ${name}`);
        return load(target);
      }
      return require(name);
    }
    new Function("require", "module", "exports", code)(dependency, evaluatedModule, evaluatedModule.exports);
    return evaluatedModule.exports;
  }
  return { load: (path) => load(resolve(src, path)), queries };
}
