# superpowers-opencode-v2

Bản port plugin **Superpowers** ([obra/superpowers](https://github.com/obra/superpowers)) sang chuẩn plugin **OpenCode V2**.

Bản V1 (`.opencode/plugins/superpowers.js`) không chạy được trên `opencode2` vì V2 đổi Plugin API:

```
failed to load plugin: Plugin must export a default definition with an id and an effect or setup function.
```

Plugin này làm 3 việc, bằng API V2:

1. Đăng ký toàn bộ skill qua `ctx.skill.transform(...)`.
2. Chèn nội dung `using-superpowers` vào **user message đầu tiên** qua `ctx.session.hook("context", ...)` — giống bản official, để nằm trong conversation prefix (cache-friendly).
3. Cung cấp lại `todowrite`/`todoread` (V2 cố ý bỏ) qua `ctx.tool.transform` + `ctx.storage`, session-scoped.

Skill được đọc từ package **`superpowers`** (git dependency), nên **tự cập nhật** cùng plugin.

## Cài đặt

Thêm vào `plugins` trong `opencode.json(c)` (project hoặc global):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "superpowers-opencode-v2@git+https://github.com/tuancon254/superpowers-opencode-v2.git#main"
  ]
}
```

Hoặc dùng CLI:

```sh
opencode2 plugin add "superpowers-opencode-v2@git+https://github.com/tuancon254/superpowers-opencode-v2.git#main"
```

Restart / reload:

```sh
opencode2 service restart
```

## Cập nhật (chuẩn official)

```sh
opencode2 plugin check
opencode2 plugin update superpowers-opencode-v2
```

- Server startup tự kiểm tra plugin git/npm **chưa pin** và cập nhật.
- `#main` là ref động → có update.
- Muốn cố định: pin tag hoặc commit, ví dụ `...git#v1.0.0` hoặc `...git#<full-commit-hash>` (exact revision bị bỏ qua khi check update).

Vì plugin phụ thuộc `superpowers: github:obra/superpowers`, khi plugin update thì **skills cũng theo upstream**.

### Nếu skills không đổi sau khi update

Cache npm có thể pin dependency ở commit cũ (trong `package-lock.json`). Ép refresh:

```sh
opencode2 plugin remove superpowers-opencode-v2
opencode2 plugin add "superpowers-opencode-v2@git+https://github.com/tuancon254/superpowers-opencode-v2.git#main"
```

Hoặc xóa thư mục cache `~/.cache/opencode/npm/git-superpowers-opencode-v2-*` rồi restart.

## Cấu trúc

```
.
├─ index.js              # plugin V2 (default export { id, setup })
├─ package.json          # khai báo dependency superpowers
├─ skills/               # bản fallback offline (upstream pin)
├─ scripts/sync-skills.mjs
├─ UPSTREAM.json
└─ README.md
```

Nguồn skill theo thứ tự ưu tiên:
1. `node_modules/superpowers/skills` (từ dependency — chính)
2. `./skills` (fallback khi không cài được dependency)

## Dev

```sh
bun install                                          # cài dependency superpowers
node scripts/sync-skills.mjs /path/to/superpowers     # refresh bản fallback
npm test                                             # mock test (không cần opencode)
```

## Todo tools

V2 đã bỏ `todowrite`/`todoread`, nên plugin tự cung cấp lại (schema giống V1, semantics replace-all, session-scoped):

| Tool | Input | Output |
| --- | --- | --- |
| `todowrite` | `{ todos: [{ content, status, priority }] }` | JSON list |
| `todoread` | `{}` | JSON list |

- `status`: `pending \| in_progress \| completed \| cancelled`; `priority`: `high \| medium \| low`.
- Lưu ở `ctx.storage` key `todos/<sessionID>`; tự dọn entry > 30 ngày lúc setup.
- **Sau compaction**: hook `compaction` đánh dấu session, request kế tiếp chèn reminder "restored after compaction" vào user message.
- **Không có TUI panel** (V2 không cho) — chỉ model đọc/ghi được.
- Muốn chặn/duyệt: thêm permission `{ "action": "todowrite", "resource": "*", "effect": "ask" }` (tương tự `todoread`).

## V1 → V2 mapping

| Bản V1 | Bản V2 |
| --- | --- |
| `SuperpowersPlugin = async (...) => ({...})` | `default { id, setup(ctx) }` |
| Hook `config` → `config.skills.paths.push(dir)` | `ctx.skill.transform(editor => editor.add(skill))` |
| `experimental.chat.messages.transform` (chèn user message) | `ctx.session.hook("context")` → chèn vào `firstUser.content` (khớp official) |
| (built-in) `todowrite` | plugin tự đăng ký lại qua `ctx.tool.transform` + `ctx.storage` |

## Tool mapping (OpenCode V2)

| Hành động | Tool V2 |
| --- | --- |
| Create/update todo | `todowrite` (đọc: `todoread`) |
| Dispatch subagent | `subagent` (`agent: "general"` hoặc `"explore"`) |
| Invoke skill | `skill` |
| Read file | `read` |
| Create file | `write` |
| Edit file | `edit` (hoặc `patch`) |
| Delete file | `shell` |
| Run shell | `shell` |
| Search / find files | `grep`, `glob` |
| Fetch URL | `webfetch` |

## Lưu ý

- **Shape**: message content là `LLM.Content.Text` → `{ type: "text", text }`. (Nếu dùng system part thì `LLM.SystemPart` cũng bắt buộc `type: "text"`; chỉ `{ text }` sẽ làm fail cả request — `Failed to drain Session`.)
- **Trùng `brainstorming`**: skill global `~/.config/opencode/skill/brainstorming` có precedence cao hơn transform của plugin; xóa bản global nếu muốn dùng bản mới.
- **TODO tool**: V2 cố ý bỏ nên plugin tự cung cấp `todowrite`/`todoread` (xem mục Todo tools).
