#!/usr/bin/env node
/**
 * Copy the upstream Superpowers skills into this plugin and pin the source
 * commit. Run it after updating your obra/superpowers checkout.
 *
 *   node scripts/sync-skills.mjs /path/to/superpowers
 */

import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const destination = path.join(root, "skills")
const source = process.argv[2]

if (!source) {
  console.error("usage: node scripts/sync-skills.mjs <path-to-superpowers-checkout>")
  process.exit(1)
}

const sourceSkills = path.join(path.resolve(source), "skills")
if (!fs.existsSync(sourceSkills)) {
  console.error(`not found: ${sourceSkills}`)
  process.exit(1)
}

fs.rmSync(destination, { recursive: true, force: true })
fs.cpSync(sourceSkills, destination, { recursive: true })

let commit = "unknown"
try {
  commit = execFileSync("git", ["-C", path.resolve(source), "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim()
} catch {
  // Source is not a git checkout; keep "unknown".
}

fs.writeFileSync(
  path.join(root, "UPSTREAM.json"),
  JSON.stringify(
    {
      source: "https://github.com/obra/superpowers",
      commit,
      syncedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + "\n",
)

console.log(`synced skills from ${sourceSkills}`)
console.log(`upstream commit: ${commit}`)
