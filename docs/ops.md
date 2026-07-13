# Ops & collaboration

## FortuneSheet Op format

Each user edit emits an array of Ops through `onOp` → this library’s `on_op`.

Official reference: [FortuneSheet Operation](https://ruilisi.github.io/fortune-sheet-docs/guide/op.html)

### Common shape

```json
{
  "op": "replace",
  "id": "<sheet-id>",
  "path": ["data", 1, 0, "bl"],
  "value": 1
}
```

| Field | Meaning |
|-------|---------|
| `op` | `add` \| `remove` \| `replace` \| `insertRowCol` \| `deleteRowCol` \| `addSheet` \| `deleteSheet` |
| `id` | Sheet id |
| `path` | Path into sheet / workbook structure |
| `value` | New value (shape depends on `op` / `path`) |

One cell edit often produces **multiple** Ops (for example `m`, `ct`, and `v` on the same cell).

### Special ops

`insertRowCol`, `deleteRowCol`, `addSheet`, and `deleteSheet` use dedicated `value` payloads (see upstream docs). They are intentionally **excluded** from this library’s content-based `on_op` dedupe.

## Why duplicates can appear

FortuneSheet emits `onOp` from inside a React `setState` updater. Under **React StrictMode** (Reflex enables it by default in development), the same Op batch may be emitted more than once.

This library’s default `dedupe_ops=True` collapses identical batches within a short per-instance window (~200ms).

Production builds typically do not double-invoke updaters the same way; dedupe remains a cheap safety net.

## What dedupe does *not* cover

| Scenario | Handled by `dedupe_ops`? |
|----------|--------------------------|
| StrictMode double emit (same batch) | Yes |
| Two sheets on one page | Isolated per instance |
| Two clients writing the same cell | **No** — separate browsers |
| Network retry / server replay | **No** — use `clientOpId` |
| Two real `insertRowCol` with identical params | **No** — skipped by design |

## Recommended collaboration pattern

```text
Client A (local edit)
  → on_op (+ attach clientOpId)
  → Server (auth, order, persist, idempotent by opId)
  → Broadcast
  → Client B applies remote patches with origin=remote
       (do not re-emit those applies through on_op)
```

Guidelines:

1. **Identity:** generate a UUID `clientOpId` when forwarding Ops; do not use Op content equality as a global idempotency key.
2. **Origin:** when applying remote Ops locally, suppress outbound `on_op` (or ignore remote-origin events server-side).
3. **Snapshots:** use `on_change` for checkpoints / reconnect hydration; use `on_op` for incremental sync.
4. **Reload:** after authoritative server snapshot, set `data` and bump `revision` once.

## Python-side typing (optional)

Wire payloads remain `list[dict]`. For app code you may annotate with `TypedDict`:

```python
from typing import Any, Literal, NotRequired, TypedDict

OpName = Literal[
    "add", "remove", "replace",
    "insertRowCol", "deleteRowCol", "addSheet", "deleteSheet",
]

class FortuneOp(TypedDict):
    op: OpName
    id: str
    path: list[Any]
    value: NotRequired[Any]
```

Keep the Reflex event boundary as plain dicts; parse into richer models only inside your sync layer if needed.

## Debugging raw Ops

```python
fortune_sheet(..., dedupe_ops=False, on_op=State.on_op)
```

Use this temporarily to inspect upstream double-emits. Prefer leaving `dedupe_ops=True` in applications.
