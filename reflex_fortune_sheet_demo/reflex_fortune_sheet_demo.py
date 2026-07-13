"""Welcome to Reflex! This file outlines the steps to create a basic app."""

import reflex as rx

from reflex_fortune_sheet import fortune_sheet
from typing import Any

def _summarize_op(op: dict[str, Any]) -> str:
    """Human-readable one-line summary of a FortuneSheet Op."""
    kind = str(op.get("op") or "?")
    sheet_id = str(op.get("id") or "")
    path = op.get("path") or []
    value = op.get("value")

    if kind in {"insertRowCol", "deleteRowCol"} and isinstance(value, dict):
        return f"{kind} sheet={sheet_id} {value}"
    if kind in {"addSheet", "deleteSheet"}:
        return f"{kind} sheet={sheet_id} value={value!r}"

    # Typical cell path: ["data", row, col, field]
    if (
        isinstance(path, list)
        and len(path) >= 3
        and path[0] == "data"
        and isinstance(path[1], int)
        and isinstance(path[2], int)
    ):
        row, col = path[1], path[2]
        field = path[3] if len(path) > 3 else "v"
        return f"{kind} sheet={sheet_id} cell=({row},{col}).{field} -> {value!r}"

    return f"{kind} sheet={sheet_id} path={path} value={value!r}"


class FortuneSheetTestState(rx.State):
    sheets: list[dict[str, Any]] = [
        {
            "name": "Sheet1",
            "row": 36,
            "column": 18,
            "celldata": [
                {
                    "r": 0,
                    "c": 0,
                    "v": {"v": "Hello", "m": "Hello", "ct": {"fa": "General", "t": "g"}},
                },
                {
                    "r": 0,
                    "c": 1,
                    "v": {
                        "v": "FortuneSheet",
                        "m": "FortuneSheet",
                        "ct": {"fa": "General", "t": "g"},
                    },
                },
            ],
        }
    ]
    # Bump to force the React shim to reload `sheets` (e.g. reset).
    revision: int = 0
    change_count: int = 0
    op_count: int = 0
    last_ops_summary: list[str] = []

    @rx.event
    def on_sheet_change(self, data: list[dict[str, Any]]):
        # Snapshot only — never bump revision here.
        self.sheets = data
        self.change_count += 1

    @rx.event
    def on_sheet_op(self, ops: list[dict[str, Any]]):
        """Receive FortuneSheet Op[] for audit / future collaboration sync."""
        if not ops:
            return
        self.op_count += len(ops)
        summaries = [_summarize_op(op) for op in ops if isinstance(op, dict)]
        # Keep newest first, cap UI list.
        self.last_ops_summary = (summaries + self.last_ops_summary)[:20]
        # Server-side persistence hook point (replace with DB write later).
        print("[FortuneSheet on_op]", summaries)

    @rx.event
    def reset_sheets(self):
        self.sheets = [
            {
                "name": "Sheet1",
                "row": 36,
                "column": 18,
                "celldata": [],
            }
        ]
        self.change_count = 0
        self.op_count = 0
        self.last_ops_summary = []
        self.revision += 1


def index() -> rx.Component:
    return rx.fragment(
        rx.el.div(
            rx.el.div(
                rx.el.h1(
                    "FortuneSheet 封装测试",
                    class_name="text-2xl font-bold text-gray-800",
                ),
                rx.el.p(
                    rx.fragment(
                        "快照变更：",
                        FortuneSheetTestState.change_count,
                        "　操作数：",
                        FortuneSheetTestState.op_count,
                    ),
                    class_name="text-sm text-gray-500",
                ),
                rx.el.button(
                    "重置表格",
                    on_click=FortuneSheetTestState.reset_sheets,
                    class_name=(
                        "px-3 py-1.5 text-sm rounded-md border border-gray-300 "
                        "bg-white hover:bg-gray-50"
                    ),
                ),
                class_name="flex items-center gap-4 mb-4 flex-wrap",
            ),
            rx.el.div(
                rx.el.p("最近操作 (on_op)", class_name="text-sm font-medium text-gray-700 mb-1"),
                rx.el.ul(
                    rx.foreach(
                        FortuneSheetTestState.last_ops_summary,
                        lambda line: rx.el.li(
                            line,
                            class_name="text-xs text-gray-600 font-mono truncate",
                        ),
                    ),
                    class_name="list-disc pl-5 space-y-0.5 max-h-28 overflow-auto mb-3",
                ),
            ),
            rx.box(
                fortune_sheet(
                    data=FortuneSheetTestState.sheets,
                    revision=FortuneSheetTestState.revision,
                    lang="zh",
                    enable_import=True,
                    enable_export=True,
                    on_change=FortuneSheetTestState.on_sheet_change,
                    on_op=FortuneSheetTestState.on_sheet_op,
                    height="70vh",
                    width="100%",
                ),
                width="100%",
                height="70vh",
                border="1px solid #e5e7eb",
                border_radius="8px",
                overflow="hidden",
            ),
            class_name="p-4 h-full",
        )
    )



app = rx.App()
app.add_page(index)
