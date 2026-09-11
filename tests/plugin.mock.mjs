// Mock-context test for the Superpowers V2 plugin.
// Run: node tests/plugin.mock.mjs
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const plugin = (await import(pathToFileURL(path.join(ROOT, "index.js")).href)).default

assert.equal(plugin.id, "superpowers", "plugin id")
assert.equal(typeof plugin.setup, "function", "setup is a function")

// --- mock ctx ---
const skills = []
const tools = []
const hooks = {}
const store = new Map()

const ctx = {
  skill: {
    async transform(cb) {
      cb({ list: () => [], get: () => undefined, add: (s) => skills.push(s), update: () => {}, remove: () => {} })
    },
  },
  tool: {
    async transform(cb) {
      cb({
        list: () => [],
        get: () => undefined,
        add: (t) => tools.push(t),
        namespace: () => {},
        update: () => {},
        remove: () => {},
      })
    },
  },
  session: {
    async hook(name, cb) {
      hooks[name] = cb
    },
  },
  storage: {
    async get(key) {
      return store.get(key)
    },
    async set(key, value) {
      store.set(key, value)
    },
    async remove(key) {
      store.delete(key)
    },
    async scan({ prefix }) {
      return {
        entries: [...store.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, value]) => ({ key, value })),
      }
    },
  },
}

await plugin.setup(ctx)

// --- skills ---
const vendored = fs
  .readdirSync(path.join(ROOT, "skills"), { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(ROOT, "skills", e.name, "SKILL.md")))
  .map((e) => e.name)

assert.equal(skills.length, vendored.length, "all vendored skills registered")
for (const s of skills) {
  assert.ok(s.id && s.name && s.location && s.content, `${s.id} has required fields`)
  assert.ok(s.description, `${s.id} has a description`)
  assert.ok(!s.content.startsWith("---"), `${s.id} body has no frontmatter`)
}
assert.ok(skills.some((s) => s.id === "using-superpowers"), "using-superpowers registered")
console.log(`  [PASS] ${skills.length} skills registered`)

// --- todo tools ---
const todowrite = tools.find((t) => t.name === "todowrite")
const todoread = tools.find((t) => t.name === "todoread")
assert.ok(todowrite, "todowrite tool registered")
assert.ok(todoread, "todoread tool registered")
assert.ok(todowrite.input?.properties?.todos, "todowrite input schema present")
console.log("  [PASS] todowrite + todoread registered")

const list = [
  { content: "task A", status: "in_progress", priority: "high" },
  { content: "task B", status: "pending", priority: "low" },
]
const writeOut = await todowrite.execute({ todos: list }, { sessionID: "ses_a" })
assert.deepEqual(JSON.parse(writeOut.content), list, "todowrite returns the list")
assert.deepEqual(JSON.parse((await todoread.execute({}, { sessionID: "ses_a" })).content), list, "todoread returns the list")
assert.deepEqual(JSON.parse((await todoread.execute({}, { sessionID: "ses_b" })).content), [], "todos are session scoped")
console.log("  [PASS] todowrite/todoread persist per session")

// --- bootstrap injection ---
assert.equal(typeof hooks.context, "function", "context hook registered")
assert.equal(typeof hooks.compaction, "function", "compaction hook registered")

const firstEvent = {
  sessionID: "ses_a",
  messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
}
await hooks.context(firstEvent)
const userContent = firstEvent.messages[0].content
assert.ok(userContent[0].text.includes("You have superpowers."), "bootstrap prepended")
assert.equal(userContent.at(-1).text, "hello", "original text preserved after bootstrap")

await hooks.context(firstEvent)
assert.equal(firstEvent.messages[0].content.length, 2, "bootstrap not injected twice")
console.log("  [PASS] bootstrap injected once, guarded")

// --- compaction reminder ---
await hooks.compaction({ sessionID: "ses_a" })
const afterCompact = {
  sessionID: "ses_a",
  messages: [{ role: "user", content: [{ type: "text", text: "continue" }] }],
}
await hooks.context(afterCompact)
const parts = afterCompact.messages[0].content
assert.ok(parts[0].text.includes("You have superpowers."), "bootstrap first after compaction")
assert.ok(parts.some((p) => p.text.includes("restored after compaction")), "todo reminder injected after compaction")
assert.ok(parts.some((p) => p.text.includes("task A")), "reminder includes todo content")

// second context without new compaction must not re-add the reminder
await hooks.context(afterCompact)
assert.equal(afterCompact.messages[0].content.filter((p) => p.text.includes("restored after compaction")).length, 1)
console.log("  [PASS] todo reminder injected once after compaction")

console.log("")
console.log("All mock tests passed")
