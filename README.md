# reflex-fortune-sheet

Reflex wrapper for [FortuneSheet](https://ruilisi.github.io/fortune-sheet-docs/guide/) with Excel import/export via [FortuneExcel](https://github.com/Corbe30/FortuneExcel).

Reflex 封装的 FortuneSheet 表格组件，并通过 FortuneExcel 支持 Excel 导入/导出。

[English](#english) · [中文](#中文) · [Framework docs (EN)](docs/README.md)

---

## English

### Features

- Spreadsheet UI powered by `@fortune-sheet/react`
- Excel/CSV import & export toolbar (FortuneExcel), with localized tooltips
- `on_change` — full workbook snapshot (save / persist)
- `on_op` — fine-grained Op stream (audit / collaboration hooks)
- `revision` — explicit reload control (avoids controlled-data loops)
- Built-in StrictMode `on_op` dedupe (safe default for library consumers)

### Requirements

- Python `>=3.13`
- [Reflex](https://reflex.dev) `>=0.9.0`

### Install

```bash
# From this repo (editable)
pip install -e .

# Or add as a path / git dependency in your project
```

Frontend packages (`@fortune-sheet/react`, `@corbe30/fortune-excel`) are declared as Reflex `lib_dependencies` and install automatically when the app compiles.

### Quick start

```python
import reflex as rx
from reflex_fortune_sheet import fortune_sheet


class State(rx.State):
    sheets: list[dict] = [
        {
            "name": "Sheet1",
            "row": 36,
            "column": 18,
            "celldata": [
                {"r": 0, "c": 0, "v": {"v": "Hello", "m": "Hello"}},
            ],
        }
    ]
    revision: int = 0

    @rx.event
    def on_change(self, data: list[dict]):
        # Snapshot only — do NOT bump revision here.
        self.sheets = data

    @rx.event
    def on_op(self, ops: list[dict]):
        # Fine-grained ops for audit / sync.
        print(ops)

    @rx.event
    def reload(self):
        # Force Workbook remount with current `sheets`.
        self.revision += 1


def index():
    return fortune_sheet(
        data=State.sheets,
        revision=State.revision,
        lang="en",
        height="70vh",
        width="100%",
        on_change=State.on_change,
        on_op=State.on_op,
    )


app = rx.App()
app.add_page(index)
```

### Run the demo in this repo

```bash
reflex run
```

App module: `reflex_fortune_sheet_demo`.

### Data contract (important)

| Prop / event | Role |
|--------------|------|
| `data` | Initial / revision-scoped input only |
| `revision` | Bump to force-reload Workbook from `data` |
| `on_change` | Content snapshot (selection ignored) |
| `on_op` | Op[] from FortuneSheet (`onOp`) |

Changing `data` **without** bumping `revision` does **not** remount the sheet. That prevents feedback loops when you persist `on_change` back into state.

### Documentation

Full English framework docs:

- [Overview](docs/README.md)
- [Usage guide](docs/guide.md)
- [API reference](docs/api.md)
- [Ops & collaboration](docs/ops.md)

Upstream:

- [FortuneSheet Operation](https://ruilisi.github.io/fortune-sheet-docs/guide/op.html)
- [FortuneSheet Format](https://ruilisi.github.io/fortune-sheet-docs/guide/sheet.html)

### License

See repository license file if present; otherwise treat as project-local until published.

---

## 中文

### 功能

- 基于 `@fortune-sheet/react` 的在线表格
- 通过 FortuneExcel 提供 Excel/CSV 导入导出工具栏（工具提示可随 `lang` 本地化）
- `on_change`：整表快照（适合保存/持久化）
- `on_op`：细粒度 Op 流（适合审计/协同同步）
- `revision`：显式控制重载（避免受控数据回环）
- 默认开启 StrictMode 下的 `on_op` 去重（面向库用户的安全默认）

### 环境要求

- Python `>=3.13`
- [Reflex](https://reflex.dev) `>=0.9.6`

### 安装

```bash
# 本仓库可编辑安装
pip install -e .

# 或在你的项目中以 path / git 依赖引入
```

前端依赖（`@fortune-sheet/react`、`@corbe30/fortune-excel`）已在组件的 `lib_dependencies` 中声明，应用编译时会自动安装。

### 快速开始

```python
import reflex as rx
from reflex_fortune_sheet import fortune_sheet


class State(rx.State):
    sheets: list[dict] = [
        {
            "name": "Sheet1",
            "row": 36,
            "column": 18,
            "celldata": [
                {"r": 0, "c": 0, "v": {"v": "你好", "m": "你好"}},
            ],
        }
    ]
    revision: int = 0

    @rx.event
    def on_change(self, data: list[dict]):
        # 只存快照 —— 这里不要 bump revision。
        self.sheets = data

    @rx.event
    def on_op(self, ops: list[dict]):
        print(ops)

    @rx.event
    def reload(self):
        self.revision += 1


def index():
    return fortune_sheet(
        data=State.sheets,
        revision=State.revision,
        lang="zh",
        height="70vh",
        width="100%",
        on_change=State.on_change,
        on_op=State.on_op,
    )


app = rx.App()
app.add_page(index)
```

### 运行本仓库 Demo

```bash
reflex run
```

应用名：`reflex_fortune_sheet_demo`。

### 数据契约（重要）

| 属性 / 事件 | 作用 |
|-------------|------|
| `data` | 仅作为初始 / revision 作用域输入 |
| `revision` | 递增后强制用当前 `data` 重载 Workbook |
| `on_change` | 内容快照（忽略选区等 UI 状态） |
| `on_op` | FortuneSheet `onOp` 产出的 Op[] |

只改 `data`、**不**增加 `revision`，**不会**重挂载表格。这样你把 `on_change` 写回 State 时不会形成受控回环。

### 文档

英文框架文档：

- [总览](docs/README.md)
- [使用指南](docs/guide.md)
- [API 参考](docs/api.md)
- [Op 与协同](docs/ops.md)

上游文档：

- [FortuneSheet Operation](https://ruilisi.github.io/fortune-sheet-docs/guide/op.html)
- [FortuneSheet 工作表配置](https://ruilisi.github.io/fortune-sheet-docs/guide/sheet.html)
