# superpowers-opencode-v2

Bản port plugin **Superpowers** ([obra/superpowers](https://github.com/obra/superpowers)) sang chuẩn plugin **OpenCode V2**.

Bản V1 (`.opencode/plugins/superpowers.js`) không chạy được trên `opencode2` vì V2 đổi Plugin API:

```
failed to load plugin: Plugin must export a default definition with an id and an effect or setup function.
```

Plugin này làm đúng 2 việc như bản gốc, bằng API V2:

1. Đăng ký toàn bộ skill qua `ctx.skill.transform(...)`.
2. Thêm nội dung `using-superpowers` vào system instructions mỗi request qua `ctx.session.hook("context", ...)`.

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
bun install                       # cài dependency superpowers
node scripts/sync-skills.mjs /path/to/superpowers   # refresh bản fallback
```

## V1 → V2 mapping

| Bản V1 | Bản V2 |
| --- | --- |
| `SuperpowersPlugin = async (...) => ({...})` | `default { id, setup(ctx) }` |
| Hook `config` → `config.skills.paths.push(dir)` | `ctx.skill.transform(editor => editor.add(skill))` |
| `experimental.chat.messages.transform` (user message) | `ctx.session.hook("context", event => event.system.push(...))` |

## Tool mapping (OpenCode V2)

| Hành động | Tool V2 |
| --- | --- |
| Create/update todo | OpenCode V2 không có tool TODO — ghi vào plan/TODO file |
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

- **`SystemPart` shape**: `event.system` validate bằng `LLM.SystemPart`, bắt buộc `{ type: "text", text }` — chỉ `{ text }` sẽ làm fail cả request (`Failed to drain Session`).
- **Trùng `brainstorming`**: skill global `~/.config/opencode/skill/brainstorming` có precedence cao hơn transform của plugin; xóa bản global nếu muốn dùng bản mới.
- **TODO tool**: V2 cố ý bỏ; xem tool mapping ở trên.
