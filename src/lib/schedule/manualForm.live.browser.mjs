// Live React interaction QA using installed React, Next/SWC and Playwright.
// No server/database or downloaded packages. Actions invoke production validation.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import swc from "next/dist/build/swc/index.js";
import { normalizeManualInput, deriveManualSchedule } from "./manualInput.js";
import { manualBookingFailure } from "./manualBookingErrors.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(import.meta.url);
await swc.loadBindings();
// Small fixture-only CommonJS loader: compile actual application sources, bundle
// existing React dependencies, and replace only navigation/actions and initial state.
const modules = new Map();
function bundle(path) {
  if (modules.has(path)) return;
  modules.set(path, "");
  const code = swc.transformSync(readFileSync(path, "utf8"), { filename: path,
    jsc: { target: "es2022", parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } }).code;
  const dependencies = {};
  for (const [, name] of code.matchAll(/require\(["']([^"']+)["']\)/g)) {
    if (["next/link", "next/navigation", "../actions"].includes(name)) { dependencies[name] = name; continue; }
    const base = name.startsWith("@/") ? resolve(root, "src", name.slice(2)) : name.startsWith(".") ? resolve(dirname(path), name) : null;
    const target = base ? [base, `${base}.js`, `${base}.jsx`].find(existsSync) : createRequire(path).resolve(name);
    assert.ok(target, `Missing local dependency ${name}`);
    dependencies[name] = target;
    bundle(target);
  }
  modules.set(path, `[function(module,exports,require){\n${code}\n},${JSON.stringify(dependencies)}]`);
}
const formPath = resolve(root, "src/app/dashboard/schedule/new/ManualBookingForm.jsx");
const foundationPath = resolve(root, "src/components/ui/Foundation.jsx");
const reactPath = require.resolve("react"), domPath = require.resolve("react-dom/client");
for (const path of [formPath, foundationPath, reactPath, domPath]) bundle(path);
const script = `(() => {
  const process = {env:{NODE_ENV:"development"}};
  const modules = {${[...modules].map(([key, value]) => `${JSON.stringify(key)}:${value}`).join(",")}}, cache = {};
  let cursor = 0;
  const special = {
    "next/navigation": {useRouter:()=>({push(){},refresh(){}})},
    "next/link": {__esModule:true,default:({children,...props})=>React.createElement("a",props,children)},
    "../actions": {reviewManualBooking:(input)=>window.reviewFixture(input),saveManualBooking:()=>{throw Error("Unexpected save")},searchScheduleClients:async()=>({ok:true,clients:[]})}
  };
  function load(path) {
    if (special[path]) return special[path];
    if (cache[path]) return cache[path].exports;
    const module = cache[path] = {exports:{}};
    const [run,deps] = modules[path];
    run(module,module.exports,(name)=> {
      if(path===${JSON.stringify(formPath)} && name==="react") return {...React,useState(initial){const i=cursor++;return React.useState(Object.hasOwn(window.fixtureOverrides,i)?window.fixtureOverrides[i]:initial)}};
      return load(deps[name]);
    });
    return module.exports;
  }
  const React=load(${JSON.stringify(reactPath)}), Form=load(${JSON.stringify(formPath)}).default;
  const {PageShell}=load(${JSON.stringify(foundationPath)});
  function LiveForm(){cursor=0;return Form(window.fixtureProps)}
  load(${JSON.stringify(domPath)}).createRoot(document.getElementById("root")).render(React.createElement(PageShell,{containerClassName:"max-w-2xl"},React.createElement(LiveForm)));
})();`;
const cssRoot = resolve(root, ".next/static");
const css = readdirSync(cssRoot, { recursive: true }).filter((p) => p.endsWith(".css")).map((p) => readFileSync(resolve(cssRoot, p), "utf8")).join("\n");
const props = { initialDate: "2027-01-05", sitterName: "Synthetic Sitter", clients: [{ id: "synthetic", name: "Synthetic Client", pets: [] }], services: [
  { code: "WALK", name: "Synthetic walk", category: "WALK", durationMinutes: 30, basePriceCents: 2500 },
  { code: "EXTRA", name: "Synthetic extra", category: "EXTRA", basePriceCents: 800 },
  { code: "OTHER", name: "Synthetic other extra", category: "EXTRA", basePriceCents: 800 },
] };
const output = process.env.SCHEDULE_VISUAL_OUTPUT && resolve(process.env.SCHEDULE_VISUAL_OUTPUT);
if (output) { assert.ok(relative(root, output).startsWith("..")); mkdirSync(output, { recursive: true }); }
const { chromium } = await import(pathToFileURL(process.env.SCHEDULE_BROWSER_MODULE).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.SCHEDULE_BROWSER_EXECUTABLE });
let cases = 0;
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: "block" });
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let generalCode = null;
    await page.exposeFunction("reviewFixture", (input) => {
      try {
        if (generalCode) throw Object.assign(new Error("Existing commitment."), { code: generalCode });
        const intent = normalizeManualInput(input);
        deriveManualSchedule(intent.schedule, { durationMinutes: 30, offering: { billingUnit: "VISIT", scheduleKind: "TIMED_VISIT" } });
        return { ok: true, token: "synthetic", summary: { service: "Synthetic walk", quantity: 1, unit: "visit", extras: [], unitPriceCents: 2500, clientTotalCents: 2500, platformFeeCents: 250, sitterPayoutCents: 2250 } };
      } catch (error) { return manualBookingFailure(error, input); }
    });
    async function mount(overrides = {}, fixtureProps = props) {
      await page.setContent(`<html lang="en" data-theme="taskwhisker"><head><style>${css}</style></head><body><div id="root"></div></body></html>`);
      await page.evaluate(({ props, overrides }) => { window.fixtureProps = props; window.fixtureOverrides = overrides; }, { props: fixtureProps, overrides });
      await page.addScriptTag({ content: script });
      await page.locator("#service").waitFor();
      // Exercise server rejection even for values native constraints would catch.
      await page.locator("form").evaluate((form) => { form.noValidate = true; });
    }
    const submit = () => page.getByRole("button", { name: "Review booking total" }).click();
    async function invalid(id, yes = true) {
      await page.waitForFunction(({ id, yes }) => document.getElementById(id)?.getAttribute("aria-invalid") === String(yes), { id, yes });
      if (yes) {
        assert.equal(await page.locator(`#${id}`).getAttribute("aria-describedby"), `${id}-error`);
        assert.ok(await page.locator(`#${id}-error`).isVisible());
      }
    }
    async function check(name) {
      assert.deepEqual(errors, [], "React/browser runtime errors");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), viewport.width, `${name}: overflow`);
      if (output) await page.screenshot({ path: resolve(output, `${viewport.width}-live-${name}.png`), fullPage: true });
      cases++; console.log(JSON.stringify({ viewport, case: name, liveReact: true, result: "pass" }));
    }
    await mount();
    await page.getByRole("button", { name: "New client", exact: true }).click();
    await page.locator("#client-name").fill(" ");
    const address = page.locator("details").filter({ hasText: "Address (optional)" });
    await address.locator("summary").click();
    await page.locator("#client-addressLine1").fill(" "); await page.locator("#client-city").fill(" ");
    await address.locator("summary").click();
    await submit(); await invalid("client-name"); await invalid("client-addressLine1"); await invalid("client-city");
    assert.ok(await page.getByRole("alert").isVisible()); await check("multi-error");
    await page.locator("#client-addressLine1").fill("A"); await invalid("client-addressLine1", false); await invalid("client-name");
    assert.equal(await address.getAttribute("open"), "");
    assert.ok(!(await page.getByRole("alert").innerText()).includes("street address"));
    await page.locator("#client-name").fill("Synthetic Client"); await invalid("client-city");
    await page.locator("#client-city").fill("Synthetic City"); assert.equal(await page.getByRole("alert").count(), 0);
    await address.locator("summary").focus(); await page.keyboard.press("Enter"); assert.equal(await address.getAttribute("open"), null);
    await page.keyboard.press("Enter"); assert.equal(await address.getAttribute("open"), "");
    assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), "solid"); await check("address-recovery-keyboard");

    // Initial state only supplies quantities that HTML max ordinarily prevents;
    // server validation and every subsequent edit run through production code.
    await mount({ 2: "synthetic", 9: { EXTRA: 367, OTHER: 368 } });
    await submit(); await invalid("extra-EXTRA"); await invalid("extra-OTHER");
    const extras = page.locator("details").filter({ hasText: "Extras (optional)" });
    await page.locator("#extra-EXTRA").fill("0"); await invalid("extra-EXTRA", false); await invalid("extra-OTHER");
    assert.equal(await extras.getAttribute("open"), ""); assert.ok(await page.getByRole("alert").isVisible());
    await extras.locator("summary").click(); await submit(); await invalid("extra-OTHER");
    assert.equal(await extras.getAttribute("open"), "");
    await page.locator("#extra-OTHER").fill("1"); assert.equal(await page.getByRole("alert").count(), 0); assert.equal(await extras.getAttribute("open"), ""); await check("extras-recovery");

    await mount({ 2: "synthetic", 7: { arrivalDate: "2027-03-13", departureDate: "2027-03-15", arrivalTime: "02:30", departureTime: "02:30" } }, { ...props, services: [{ ...props.services[0], category: "OVERNIGHT" }] });
    await submit(); await invalid("arrivalTime"); await invalid("departureTime");
    const dstMessage = await page.locator("#departureTime-error").innerText();
    assert.equal(await page.locator("#arrivalTime-error").innerText(), dstMessage);
    await page.locator("#arrivalTime").fill("03:30"); await invalid("arrivalTime", false); await invalid("departureTime");
    assert.ok((await page.getByRole("alert").innerText()).includes(dstMessage));
    await page.locator("#departureTime").focus(); await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), "solid");
    await check("overnight-dst-partial-correction");
    await page.locator("#departureTime").fill("03:30"); await invalid("departureTime", false);
    assert.equal(await page.getByRole("alert").count(), 0);
    await check("overnight-dst-final-correction");

    const visits = [{ date: "2027-01-07", startTime: "09:00", endTime: "09:30" }, { date: "2027-01-05", startTime: "09:00", endTime: "10:00" }, { date: "2027-01-06", startTime: "09:00", endTime: "10:00" }];
    for (const count of [2, 3]) {
      await mount({ 2: "synthetic", 6: visits.slice(0, count) }); await submit();
      await invalid("time-0", false); await invalid("date-1", false); await invalid("time-1"); await invalid("end-1");
      if (count === 3) await invalid("time-2");
      await page.getByRole("button", { name: "Add another visit" }).click(); await invalid("time-1"); await invalid(`time-${count}`, false);
      await page.getByRole("button", { name: "Remove visit 1", exact: true }).click(); await invalid("time-0"); await invalid(`time-${count - 1}`, false);
      await page.locator("#time-0").fill("10:00"); await invalid("time-0", false); if (count === 3) await invalid("time-1");
      await page.locator("#time-0").focus(); await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), "solid"); await check(`duration-${count}-rows`);
    }
    for (const code of ["INVALID_SCHEDULE", "SCHEDULE_CONFLICT", "P2002"]) {
      generalCode = code; await mount({ 2: "synthetic" }); await submit(); await page.getByRole("alert").waitFor();
      assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
      await page.locator("#notes").fill("Synthetic note"); assert.ok(await page.getByRole("alert").isVisible()); await check(`general-${code}`);
    }
    generalCode = null;
    await context.close();
  }
} finally { await browser.close(); }
console.log(`${cases} live interaction cases passed`);
