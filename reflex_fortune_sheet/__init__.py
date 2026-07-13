"""Reflex wrapper for FortuneSheet + FortuneExcel import/export.

Docs:
- FortuneSheet: https://ruilisi.github.io/fortune-sheet-docs/guide/
- FortuneExcel: https://github.com/Corbe30/FortuneExcel

Data flow contract:
- `data` is initial / revision-scoped input only. Live edits stay inside the
  React Workbook; `on_change` snapshots do NOT remount the sheet by themselves.
- To force-reload workbook contents from Python, bump `revision` (and set
  `data` to the desired sheets). Changing `data` alone has no effect until
  `revision` changes — this avoids controlled-data feedback loops.
"""

from __future__ import annotations

from typing import Any

import reflex as rx
from reflex.components.component import NoSSRComponent

_jsx_path = rx.asset("./fortune_sheet.jsx", shared=True)



class FortuneSheet(NoSSRComponent):
    """Wrap local `FortuneSheetWithExcel` (Workbook + FortuneExcel toolbar).

    Must use NoSSRComponent: the sheet uses canvas / window / document and
    is not SSR-safe.

    `data` is initial / revision-scoped input. Edits live inside the React
    Workbook; bump `revision` when Python needs to force-reload workbook data.
    """

    library = f"$/public{_jsx_path}"
    tag = "FortuneSheetWithExcel"

    lib_dependencies: list[str] = [
        "@fortune-sheet/react@1.0.4",
        "@corbe30/fortune-excel@2.3.3",
    ]

    data: rx.Var[list[dict[str, Any]]]
    # Bump to force React remount with current `data` (avoid controlled-data loops).
    # Changing `data` without bumping `revision` does not reload the Workbook.
    revision: rx.Var[int] = 0
    lang: rx.Var[str] = "zh"
    # `lang` also drives FortuneExcel UI strings we localize in fortune_sheet.jsx
    # (plugin itself has no i18n). Supported: zh / zh_tw / en / es.
    column: rx.Var[int] = 60
    row: rx.Var[int] = 84
    show_toolbar: rx.Var[bool] = True
    show_formula_bar: rx.Var[bool] = True
    show_sheet_tabs: rx.Var[bool] = True
    default_font_size: rx.Var[int] = 11

    # Do NOT name these width/height — Reflex treats those as CSS style props
    # and can end up applying NaN when FortuneSheet selection metrics are null.
    sheet_width: rx.Var[str] = "100%"
    sheet_height: rx.Var[str] = "70vh"

    enable_import: rx.Var[bool] = True
    enable_export: rx.Var[bool] = True

    # Drop duplicate onOp from StrictMode (same Op[] within ~200ms, per
    # component instance). Skips insert/delete row-col/sheet batches.
    # Does NOT replace clientOpId / server idempotency for multi-client sync.
    # Set False only to debug raw upstream ops.
    dedupe_ops: rx.Var[bool] = True

    # Full workbook snapshot when content fingerprint changes (selection ignored).
    # Prefer for save/export; not suitable for knowing "what changed".
    on_change: rx.EventHandler[lambda data: [data]]

    # Fine-grained ops from FortuneSheet (`onOp`). Payload is list[Op]:
    #   {"op": "replace"|"add"|"remove"|"insertRowCol"|..., "id": sheet_id,
    #    "path": [...], "value": ...}
    # Prefer for audit logs and collaboration sync.
    # Docs: https://ruilisi.github.io/fortune-sheet-docs/guide/op.html
    # Collab: assign your own clientOpId server-side; do not key idempotency on
    # op content alone. Remote apply should not re-emit through on_op.
    on_op: rx.EventHandler[lambda ops: [ops]]

    @classmethod
    def create(cls, *children, **props):
        # Map convenient width/height kwargs onto non-conflicting prop names.
        if "width" in props and "sheet_width" not in props:
            props["sheet_width"] = props.pop("width")
        if "height" in props and "sheet_height" not in props:
            props["sheet_height"] = props.pop("height")
        props.setdefault("sheet_width", "100%")
        props.setdefault("sheet_height", "70vh")
        # props.setdefault("data", DEFAULT_SHEETS)
        props.setdefault("revision", 0)
        props.setdefault("dedupe_ops", True)
        return super().create(*children, **props)


fortune_sheet = FortuneSheet.create
