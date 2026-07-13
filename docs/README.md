# Framework documentation

English documentation for **reflex-fortune-sheet**, a Reflex `NoSSRComponent` wrapping FortuneSheet + FortuneExcel.

## Contents

| Doc | Description |
|-----|-------------|
| [Usage guide](guide.md) | Install, quick start, data contract, patterns |
| [API reference](api.md) | Props, events, defaults |
| [Ops & collaboration](ops.md) | `on_op` payload, dedupe behavior, sync notes |

## What this library is

A thin Reflex bridge around:

- [`@fortune-sheet/react`](https://github.com/ruilisi/fortune-sheet) — canvas spreadsheet
- [`@corbe30/fortune-excel`](https://github.com/Corbe30/FortuneExcel) — import/export helpers + toolbar items

Python owns **state snapshots and events**. The React shim owns **live editing**, import/export UI, and StrictMode-safe `onOp` forwarding.

## What this library is not

- Not a full OT/CRDT collaboration stack (you wire sync on top of `on_op`)
- Not a controlled React spreadsheet: live cell edits are **not** driven by continuous Python `data` updates
- Not a replacement for [FortuneSheet’s own docs](https://ruilisi.github.io/fortune-sheet-docs/guide/)

## Architecture (high level)

```text
Python (Reflex State)
  data + revision ──► FortuneSheetWithExcel (JSX)
                         │
                         ├─ Workbook (@fortune-sheet/react)
                         ├─ Import / Export (FortuneExcel)
                         │
                         ├─ on_change ──► Python snapshot
                         └─ on_op     ──► Python Op[]
```

Reload path: bump `revision` → remount Workbook with prepared `data`.  
Edit path: user edits stay inside Workbook → emit `on_op` / debounced `on_change`.

## Upstream references

- [FortuneSheet Guide](https://ruilisi.github.io/fortune-sheet-docs/guide/)
- [Operation (Op format)](https://ruilisi.github.io/fortune-sheet-docs/guide/op.html)
- [Sheet configuration](https://ruilisi.github.io/fortune-sheet-docs/guide/sheet.html)
