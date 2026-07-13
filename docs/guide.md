# Usage guide

## Installation

```bash
pip install -e .   # from this repository
```

Requires Python `>=3.13` and Reflex `>=0.9.6`.

The component declares:

```text
@fortune-sheet/react@1.0.4
@corbe30/fortune-excel@2.3.3
```

Reflex installs these when compiling the frontend.

## Minimal example

```python
import reflex as rx
from reflex_fortune_sheet import fortune_sheet


class State(rx.State):
    sheets: list[dict] = [
        {
            "name": "Sheet1",
            "row": 36,
            "column": 18,
            "celldata": [],
        }
    ]
    revision: int = 0

    @rx.event
    def on_change(self, data: list[dict]):
        self.sheets = data  # persist snapshot only

    @rx.event
    def on_op(self, ops: list[dict]):
        ...  # audit / sync

    @rx.event
    def reset(self):
        self.sheets = [{"name": "Sheet1", "row": 36, "column": 18, "celldata": []}]
        self.revision += 1  # required to remount


def index():
    return fortune_sheet(
        data=State.sheets,
        revision=State.revision,
        lang="en",
        width="100%",
        height="70vh",
        on_change=State.on_change,
        on_op=State.on_op,
    )
```

## Data contract

### Why `revision` exists

FortuneSheet is effectively **uncontrolled** after mount. If Python fed every keystroke back as controlled `data`, you would remount or fight the canvas on every update.

| Action | Result |
|--------|--------|
| User edits cells | Workbook updates internally; `on_op` / `on_change` fire |
| `on_change` writes `State.sheets` | Python state updates; **Workbook does not remount** |
| `State.revision += 1` (with desired `data`) | Workbook remounts with prepared sheets |

**Rule:** never bump `revision` inside `on_change`.

### Sheet payload shape

Prefer FortuneSheet’s `celldata` form for initial / remount input:

```python
{
    "name": "Sheet1",
    "id": "optional-stable-id",
    "row": 36,
    "column": 18,
    "celldata": [
        {"r": 0, "c": 0, "v": {"v": "Hello", "m": "Hello", "ct": {"fa": "General", "t": "g"}}},
    ],
}
```

Notes:

- Missing `id` is assigned on prepare (UUID).
- Runtime `on_change` snapshots often include a `data` matrix; on remount the shim converts `data` → `celldata` when needed and prefers remounting from `celldata`.
- Broken Excel import fields (NaN widths, bad selection ranges) are sanitized before remount.

## Choosing `on_change` vs `on_op`

| Use case | Prefer |
|----------|--------|
| Save whole workbook to DB / file | `on_change` |
| Undo-ish audit log | `on_op` |
| Multiplayer sync / server apply | `on_op` (+ your own `clientOpId`) |
| Know “what changed” | `on_op` |

`on_change` is debounced (~400ms) and ignores selection/scroll-only noise via a content fingerprint.

`on_op` forwards FortuneSheet’s Op arrays. See [Ops & collaboration](ops.md).

## Import / export

Set `enable_import` / `enable_export` (default `True`).

- Import: file picker → FortuneExcel transform → remount + **immediate** `on_change`
- Export: toolbar menu → `.xlsx` / `.csv`

Toolbar tooltips follow `lang` (`zh`, `zh_tw`, `en`, `es`). FortuneExcel itself has no i18n API; localization is done in the shim.

## Language

```python
fortune_sheet(..., lang="zh")  # or zh_tw / en / es
```

`lang` is passed through to Workbook and used for the Excel toolbar strings.

## Multiple instances on one page

Supported. Each instance has its own:

- Workbook remount `key`
- `on_op` dedupe gate (keyed by instance id)
- Export menu DOM ref (no shared `querySelector`)

## Demo app

This repository ships `reflex_fortune_sheet_demo`:

```bash
reflex run
```

See `reflex_fortune_sheet_demo/reflex_fortune_sheet_demo.py` for a working `on_change` / `on_op` / reset pattern.
