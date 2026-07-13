# API reference

Import:

```python
from reflex_fortune_sheet import fortune_sheet, FortuneSheet
```

`fortune_sheet` is `FortuneSheet.create`.

## Component

`FortuneSheet` extends Reflex `NoSSRComponent` (canvas / `window` / `document` — not SSR-safe).

Convenience kwargs `width` / `height` map to `sheet_width` / `sheet_height` (Reflex reserves `width`/`height` as CSS style props).

## Props

| Prop (Python) | JS prop | Type | Default | Description |
|---------------|---------|------|---------|-------------|
| `data` | `data` | `list[dict]` | required | Initial / revision-scoped sheet list |
| `revision` | `revision` | `int` | `0` | Bump to remount Workbook with current `data` |
| `lang` | `lang` | `str` | `"zh"` | Workbook + Excel UI locale (`zh` / `zh_tw` / `en` / `es`) |
| `column` | `column` | `int` | `60` | Default column count hint for Workbook |
| `row` | `row` | `int` | `84` | Default row count hint for Workbook |
| `show_toolbar` | `showToolbar` | `bool` | `True` | FortuneSheet toolbar |
| `show_formula_bar` | `showFormulaBar` | `bool` | `True` | Formula bar |
| `show_sheet_tabs` | `showSheetTabs` | `bool` | `True` | Sheet tabs |
| `default_font_size` | `defaultFontSize` | `int` | `11` | Default font size |
| `sheet_width` / `width` | `sheetWidth` | `str` | `"100%"` | Host width (CSS size) |
| `sheet_height` / `height` | `sheetHeight` | `str` | `"70vh"` | Host height (CSS size) |
| `enable_import` | `enableImport` | `bool` | `True` | Show import toolbar action |
| `enable_export` | `enableExport` | `bool` | `True` | Show export toolbar action |
| `dedupe_ops` | `dedupeOps` | `bool` | `True` | Drop StrictMode duplicate `on_op` batches |

### `dedupe_ops`

When `True` (default):

- Drops identical Op batches within ~200ms **per component instance**
- Does **not** dedupe batches that contain `insertRowCol`, `deleteRowCol`, `addSheet`, or `deleteSheet`
- Is **not** a substitute for collaboration idempotency (`clientOpId` + server authority)

Set `False` only when debugging raw upstream double-emits.

## Events

| Event (Python) | Payload | Description |
|----------------|---------|-------------|
| `on_change` | `list[dict]` — workbook sheets | Content snapshot after fingerprint change (debounced ~400ms). Import uses an immediate notify path. |
| `on_op` | `list[dict]` — Op array | FortuneSheet `onOp` payload. See [ops.md](ops.md). |

### Event handler shapes

```python
@rx.event
def on_change(self, data: list[dict[str, Any]]):
    ...

@rx.event
def on_op(self, ops: list[dict[str, Any]]):
    ...
```

## Example with common options

```python
fortune_sheet(
    data=State.sheets,
    revision=State.revision,
    lang="en",
    column=60,
    row=84,
    show_toolbar=True,
    show_formula_bar=True,
    show_sheet_tabs=True,
    default_font_size=11,
    enable_import=True,
    enable_export=True,
    dedupe_ops=True,
    width="100%",
    height="70vh",
    on_change=State.on_change,
    on_op=State.on_op,
)
```
