/**
 * Superpowers for OpenCode V2
 *
 * V2 port of the OpenCode plugin shipped by obra/superpowers.
 * Original (V1) implementation lived at `.opencode/plugins/superpowers.js` and
 * used the `config` hook plus `experimental.chat.messages.transform`.
 *
 * This port does the same two things with the V2 plugin API:
 *   1. Registers every Superpowers skill through `ctx.skill.transform`.
 *   2. Injects the `using-superpowers` bootstrap into the first user message
 *      through `ctx.session.hook("context", ...)`, matching the official plugin.
 *      A user message belongs to the conversation prefix, so providers cache it
 *      instead of re-tokenizing a system block on every request (#750, #894).
 */

import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url))
const BOOTSTRAP_SKILL = "using-superpowers"
const BOOTSTRAP_MARKER = "You have superpowers."

// Primary source: the `superpowers` package declared as a git dependency, so
// skills update together with the plugin through `opencode2 plugin update`.
// The vendored `./skills` copy is a fallback for offline/local development.
function resolveSkillsDir() {
  const hasBootstrap = (dir) => fs.existsSync(path.join(dir, BOOTSTRAP_SKILL, "SKILL.md"))
  const candidates = []

  try {
    candidates.push(path.join(path.dirname(require.resolve("superpowers/package.json")), "skills"))
  } catch {
    // Package not installed; try the resolved entrypoint below.
  }
  try {
    candidates.push(path.resolve(path.dirname(require.resolve("superpowers")), "..", "..", "skills"))
  } catch {
    // Dependency unavailable.
  }
  candidates.push(path.join(PLUGIN_DIR, "skills"))

  return candidates.find(hasBootstrap) ?? candidates[candidates.length - 1]
}

const SKILLS_DIR = resolveSkillsDir()

const TOOL_MAPPING = `**Tool Mapping for OpenCode V2:**
When skills request actions, substitute OpenCode V2 equivalents:
- Create or update todos → OpenCode V2 has no native TODO tool; keep the list in a plan file or a repo-local TODO file
- "Subagent (general-purpose):" / dispatch a subagent → \`subagent\` with \`agent: "general"\` (use \`"explore"\` for codebase exploration)
- Invoke a skill → OpenCode's native \`skill\` tool
- Read files → \`read\`
- Create a file → \`write\`; edit a file → \`edit\` or \`patch\`; delete a file → \`shell\`
- Run shell commands → \`shell\`
- Search file contents → \`grep\`; find files by name → \`glob\`
- Fetch a URL → \`webfetch\`

Use OpenCode's native \`skill\` tool to list and load skills.`

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

function parseSkillFile(fullPath) {
  const raw = fs.readFileSync(fullPath, "utf8")
  const match = raw.match(FRONTMATTER)

  let name = path.basename(path.dirname(fullPath))
  let description = ""
  let body = raw

  if (match) {
    body = match[2]
    for (const line of match[1].split(/\r?\n/)) {
      const colon = line.indexOf(":")
      if (colon <= 0) continue
      const key = line.slice(0, colon).trim()
      let value = line.slice(colon + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (key === "name" && value) name = value
      if (key === "description" && value) description = value
    }
  }

  return { name, description, body: body.replace(/^\r?\n/, "") }
}

function discoverSkillFiles(dir, found = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) discoverSkillFiles(full, found)
    else if (entry.isFile() && entry.name === "SKILL.md") found.push(full)
  }
  return found
}

function loadSkills() {
  return discoverSkillFiles(SKILLS_DIR).map((file) => {
    const { name, description, body } = parseSkillFile(file)
    return {
      id: path.basename(path.dirname(file)),
      name,
      description,
      slash: true,
      autoinvoke: true,
      location: file,
      content: body,
    }
  })
}

// Read once. SKILL.md does not change while the server is running.
let bootstrapCache

function getBootstrap() {
  if (bootstrapCache !== undefined) return bootstrapCache

  const file = path.join(SKILLS_DIR, BOOTSTRAP_SKILL, "SKILL.md")
  if (!fs.existsSync(file)) {
    bootstrapCache = null
    return null
  }

  const { body } = parseSkillFile(file)
  bootstrapCache = `<EXTREMELY_IMPORTANT>
You have superpowers.

**IMPORTANT: The using-superpowers skill content is included below. It is ALREADY LOADED - you are currently following it. Do NOT use the skill tool to load "using-superpowers" again - that would be redundant.**

${body}

${TOOL_MAPPING}
</EXTREMELY_IMPORTANT>`

  return bootstrapCache
}

function containsBootstrap(content) {
  return (
    Array.isArray(content) &&
    content.some(
      (part) =>
        part &&
        part.type === "text" &&
        typeof part.text === "string" &&
        part.text.includes(BOOTSTRAP_MARKER),
    )
  )
}

export default {
  id: "superpowers",
  async setup(ctx) {
    const skills = loadSkills()
    await ctx.skill.transform((editor) => {
      for (const skill of skills) editor.add(skill)
    })

    const bootstrap = getBootstrap()
    if (!bootstrap) return

    // Official behavior: inject into the first user message. Not a system part,
    // so the provider caches it as part of the conversation prefix and Qwen-style
    // models do not see an extra system message.
    await ctx.session.hook("context", (event) => {
      const firstUser = event.messages.find((message) => message.role === "user")
      if (!firstUser || !Array.isArray(firstUser.content) || !firstUser.content.length) return
      if (containsBootstrap(firstUser.content)) return
      firstUser.content.unshift({ type: "text", text: bootstrap })
    })
  },
}
