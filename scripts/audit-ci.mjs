#!/usr/bin/env node
/**
 * `npm audit` for CI, with an auditable allowlist.
 *
 * The gate this gives us is "nothing high or critical ships to production, and
 * anything we knowingly accept is written down with a reason and a way out".
 *
 * Why not plain `npm audit --audit-level=high`: it fails today on an advisory
 * we have decided to accept (see ALLOWED below), and there is no way to accept
 * one advisory without lowering the bar for all of them.
 *
 * Why not `npm audit --audit-level=high --omit=dev`, the obvious alternative:
 * it does not work here. `@prisma/client` is a production dependency and
 * declares `peerDependencies: { "prisma": "*" }`, so npm records the prisma CLI
 * as `devOptional` rather than `dev` — reachable from the production graph —
 * and refuses to omit it. `--omit=peer` and `--omit=optional` do not change
 * that either; all four combinations were tried and all still exit 1.
 *
 * An allowlist is also the stricter choice: omitting dev dependencies wholesale
 * would silently accept every future dev-side advisory, whereas an unknown one
 * still fails here.
 */

import { execFileSync } from "node:child_process";

/**
 * Advisories we have accepted, keyed by GHSA id.
 *
 * Each entry must say what it is, why it does not reach production, and what
 * would let us delete it. An entry that no longer fires is reported as stale so
 * this list cannot quietly rot.
 */
const ALLOWED = {
  "GHSA-ggr8-5vv4-36mx": {
    package: "deepmerge-ts@7.1.5",
    reason:
      "Stack exhaustion when merging recursive object graphs. Reached only via " +
      "prisma (a devDependency) -> @prisma/config, which the Prisma CLI uses to " +
      "read prisma.config.ts at build time. It is not in the deployed bundle: no " +
      "traced file in .next/server references prisma or deepmerge-ts, and nothing " +
      "in src/ imports the CLI. The only fix npm offers is prisma@6.12.0, a major " +
      "downgrade. prisma 7.9.1 is current and still pins deepmerge-ts 7.x.",
    removeWhen:
      "prisma ships a release depending on deepmerge-ts >= 8. Check with " +
      "`npm ls deepmerge-ts` after a prisma upgrade, then delete this entry.",
  },
};

const BLOCKING = new Set(["high", "critical"]);

let report;
try {
  // npm audit exits non-zero when it finds anything, so capture rather than throw.
  report = execFileSync("npm", ["audit", "--json"], { encoding: "utf8" });
} catch (e) {
  if (!e.stdout) throw e;
  report = e.stdout;
}

const { vulnerabilities = {} } = JSON.parse(report);

// One advisory usually surfaces as several entries — the vulnerable package
// plus every dependent that pulls it in. Collapse them by GHSA id so the
// allowlist stays a list of advisories rather than a list of package names.
const advisories = new Map();
for (const vuln of Object.values(vulnerabilities)) {
  for (const via of vuln.via) {
    if (typeof via === "string" || !BLOCKING.has(via.severity)) continue;
    const id = via.url?.split("/").pop() ?? via.url;
    if (!advisories.has(id)) {
      advisories.set(id, { id, title: via.title, url: via.url, severity: via.severity, packages: new Set() });
    }
    advisories.get(id).packages.add(via.name);
  }
}

const blocking = [...advisories.values()].filter((a) => !(a.id in ALLOWED));
const accepted = [...advisories.values()].filter((a) => a.id in ALLOWED);
const stale = Object.keys(ALLOWED).filter((id) => !advisories.has(id));

for (const a of accepted) {
  console.log(`ACCEPTED  ${a.id}  ${a.severity}  ${[...a.packages].join(", ")}`);
  console.log(`          ${ALLOWED[a.id].reason}`);
  console.log(`          Remove when: ${ALLOWED[a.id].removeWhen}`);
}

for (const id of stale) {
  console.log(
    `STALE     ${id} is allowlisted but no longer reported — remove it from ` +
      `scripts/audit-ci.mjs (${ALLOWED[id].package}).`,
  );
}

if (blocking.length === 0) {
  console.log(
    `\nNo unaccepted high or critical advisories ` +
      `(${accepted.length} accepted, ${stale.length} stale).`,
  );
  process.exit(0);
}

console.error("");
for (const a of blocking) {
  console.error(`BLOCKING  ${a.id}  ${a.severity}  ${[...a.packages].join(", ")}`);
  console.error(`          ${a.title}`);
  console.error(`          ${a.url}`);
}
console.error(
  `\n${blocking.length} unaccepted high/critical ` +
    `${blocking.length === 1 ? "advisory" : "advisories"}. Upgrade the package, ` +
    `or add the advisory to ALLOWED in scripts/audit-ci.mjs with a reason it ` +
    `cannot reach production and a condition for removing it.`,
);
process.exit(1);
