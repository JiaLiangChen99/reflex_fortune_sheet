import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Workbook } from "@fortune-sheet/react";
import "@fortune-sheet/react/dist/index.css";
import {
  exportToolBarItem,
  importToolBarItem,
  transformExcelToFortune,
  transformFortuneToExcel,
} from "@corbe30/fortune-excel";

const DEFAULT_SHEETS = [
  {
    name: "Sheet1",
    row: 36,
    column: 18,
    celldata: [],
  },
];

/**
 * FortuneSheet calls onOp inside a setState updater. Under Reflex + React
 * StrictMode the same Op[] can be emitted twice across separate turns /
 * remounts. Gate is keyed by component instanceId on globalThis so HMR /
 * remount still dedupe without colliding across multiple sheets on one page.
 * Not multi-client idempotency — use clientOpId for collab.
 */
const OP_DEDUPE_WINDOW_MS = 200;
const OP_DEDUPE_GLOBAL_KEY = "__reflexFortuneSheetOpDedupeById";
/** Ops that are not safe to content-dedupe (same payload can be two real edits). */
const OP_DEDUPE_SKIP_KINDS = new Set([
  "insertRowCol",
  "deleteRowCol",
  "addSheet",
  "deleteSheet",
]);

function newInstanceId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `fs_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getOpDedupeGate(instanceId) {
  const g = typeof globalThis !== "undefined" ? globalThis : window;
  if (!g[OP_DEDUPE_GLOBAL_KEY]) {
    g[OP_DEDUPE_GLOBAL_KEY] = Object.create(null);
  }
  const map = g[OP_DEDUPE_GLOBAL_KEY];
  if (!map[instanceId]) {
    map[instanceId] = { finger: "", at: 0 };
  }
  return map[instanceId];
}

function opsContainNonIdempotent(ops) {
  return ops.some(
    (op) => op && typeof op === "object" && OP_DEDUPE_SKIP_KINDS.has(op.op),
  );
}

function shouldDropDuplicateOps(instanceId, ops) {
  if (opsContainNonIdempotent(ops)) {
    return false;
  }
  const finger = JSON.stringify(ops);
  const now = Date.now();
  const gate = getOpDedupeGate(instanceId);
  if (finger === gate.finger && now - gate.at < OP_DEDUPE_WINDOW_MS) {
    return true;
  }
  gate.finger = finger;
  gate.at = now;
  return false;
}

/** FortuneExcel has no i18n; we map UI strings by Workbook `lang`. */
const EXCEL_UI_I18N = {
  zh: {
    importTooltip: "导入文件",
    exportTooltip: "导出…",
    exportXlsx: "导出为 .xlsx",
    exportCsv: "导出为 .csv",
  },
  zh_tw: {
    importTooltip: "匯入檔案",
    exportTooltip: "匯出…",
    exportXlsx: "匯出為 .xlsx",
    exportCsv: "匯出為 .csv",
  },
  en: {
    importTooltip: "Import file",
    exportTooltip: "Export …",
    exportXlsx: "Export as .xlsx",
    exportCsv: "Export as .csv",
  },
  es: {
    importTooltip: "Importar archivo",
    exportTooltip: "Exportar …",
    exportXlsx: "Exportar como .xlsx",
    exportCsv: "Exportar como .csv",
  },
};

function resolveExcelUi(lang) {
  const key = String(lang || "zh").toLowerCase();
  if (key === "zh_tw" || key === "zh-tw") {
    return EXCEL_UI_I18N.zh_tw;
  }
  if (key.startsWith("zh")) {
    return EXCEL_UI_I18N.zh;
  }
  if (key.startsWith("es")) {
    return EXCEL_UI_I18N.es;
  }
  return EXCEL_UI_I18N.en;
}

function normalizeSheets(data) {
  if (Array.isArray(data) && data.length > 0) {
    return data;
  }
  return DEFAULT_SHEETS;
}

function newSheetId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `sheet_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function toFiniteNumber(value, fallback) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Drop null/NaN entries that break FortuneSheet layout math (visibledatacolumn). */
function sanitizeNumericMap(map) {
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    return {};
  }
  const out = {};
  Object.keys(map).forEach((key) => {
    const n = toFiniteNumber(map[key], null);
    if (n != null && n >= 0) {
      out[key] = n;
    }
  });
  return out;
}

function sanitizeSheetConfig(config) {
  const next =
    config && typeof config === "object" && !Array.isArray(config)
      ? { ...config }
      : {};
  if (next.columnlen) {
    next.columnlen = sanitizeNumericMap(next.columnlen);
  }
  if (next.rowlen) {
    next.rowlen = sanitizeNumericMap(next.rowlen);
  }
  if (next.colhidden) {
    next.colhidden = sanitizeNumericMap(next.colhidden);
  }
  if (next.rowhidden) {
    next.rowhidden = sanitizeNumericMap(next.rowhidden);
  }
  return next;
}

/**
 * Workbook init expects `celldata` + a valid active sheet.
 * FortuneExcel often emits status/order as strings and may leave every sheet
 * inactive ("sheet not found"), or emit NaN columnlen / broken selection
 * ranges that make SheetOverlay render CSS width: NaN.
 */
function prepareImportedSheets(sheets) {
  const prepared = normalizeSheets(sheets).map((sheet, index) => {
    const next = { ...sheet };
    const hasCelldata =
      Array.isArray(next.celldata) && next.celldata.length > 0;

    if (!hasCelldata && Array.isArray(next.data)) {
      const celldata = [];
      next.data.forEach((row, r) => {
        if (!Array.isArray(row)) {
          return;
        }
        row.forEach((cell, c) => {
          if (cell != null) {
            celldata.push({ r, c, v: cell });
          }
        });
      });
      next.celldata = celldata;
    } else if (!Array.isArray(next.celldata)) {
      next.celldata = [];
    }

    // Prefer celldata on remount; runtime `data` matrix is rebuilt by Workbook.
    delete next.data;
    // Selection ranges from Excel often have null row/column ends → width NaN.
    delete next.luckysheet_select_save;
    delete next.luckysheet_selection_range;
    delete next.scrollLeft;
    delete next.scrollTop;
    delete next.filter_select;
    delete next.filter;
    delete next.jfgird_select_save;

    next.id = next.id == null || next.id === "" ? newSheetId() : String(next.id);
    next.order = toFiniteNumber(next.order, index);
    next.status = toFiniteNumber(next.status, 0) === 1 ? 1 : 0;
    next.hide = toFiniteNumber(next.hide, 0) === 1 ? 1 : 0;
    next.row = toFiniteNumber(next.row, 36);
    next.column = toFiniteNumber(next.column, 18);
    next.defaultColWidth = toFiniteNumber(next.defaultColWidth, 73);
    next.defaultRowHeight = toFiniteNumber(next.defaultRowHeight, 19);
    next.config = sanitizeSheetConfig(next.config);
    if (!next.name) {
      next.name = `Sheet${index + 1}`;
    }
    return next;
  });

  // Exactly one visible active sheet is required.
  const activeIndex = prepared.findIndex(
    (sheet) => sheet.status === 1 && sheet.hide !== 1,
  );
  if (activeIndex < 0) {
    const firstVisible = prepared.findIndex((sheet) => sheet.hide !== 1);
    const idx = firstVisible >= 0 ? firstVisible : 0;
    prepared.forEach((sheet, i) => {
      sheet.status = i === idx ? 1 : 0;
    });
  } else {
    prepared.forEach((sheet, i) => {
      sheet.status = i === activeIndex ? 1 : 0;
    });
  }

  return prepared;
}

function cssSize(value, fallback) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? `${value}px` : fallback;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === "nan") {
      return fallback;
    }
    return trimmed;
  }
  return fallback;
}

/** Stable content fingerprint — ignore selection / scroll / volatile UI fields. */
function contentSignature(sheets) {
  if (!Array.isArray(sheets)) {
    return "";
  }
  return JSON.stringify(
    sheets.map((sheet) => ({
      id: sheet?.id,
      name: sheet?.name,
      status: sheet?.status,
      order: sheet?.order,
      row: sheet?.row,
      column: sheet?.column,
      celldata: sheet?.celldata,
      data: sheet?.data,
      config: sheet?.config,
      calcChain: sheet?.calcChain,
      filter: sheet?.filter,
      filter_select: sheet?.filter_select,
      luckysheet_conditionformat_save: sheet?.luckysheet_conditionformat_save,
      frozen: sheet?.frozen,
      images: sheet?.images ?? sheet?.image,
    })),
  );
}

const exportMenuStyle = {
  display: "flex",
  flexDirection: "column",
  backgroundColor: "#fff",
  color: "#000",
  textAlign: "start",
  borderRadius: "4px",
  fontSize: "12px",
  position: "fixed",
  zIndex: 1000,
  whiteSpace: "nowrap",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.35)",
};

const exportButtonStyle = {
  width: "100%",
  background: "none",
  border: "none",
  margin: 0,
  font: "inherit",
  color: "inherit",
  cursor: "pointer",
  padding: "6px 12px",
  outline: "none",
  fontFamily: "Arial, Helvetica, sans-serif",
  textAlign: "left",
};

/**
 * Local React shim: FortuneSheet Workbook + FortuneExcel import/export.
 *
 * FortuneExcel has no lang/i18n API. We keep using its transform helpers, but
 * render localized toolbar tooltips + export menu ourselves, driven by `lang`.
 */
export function FortuneSheetWithExcel({
  data,
  revision = 0,
  lang = "zh",
  column = 60,
  row = 84,
  showToolbar = true,
  showFormulaBar = true,
  showSheetTabs = true,
  defaultFontSize = 11,
  enableImport = true,
  enableExport = true,
  // Default on: collapse StrictMode double onOp. Not collab idempotency.
  dedupeOps = true,
  onChange,
  onOp,
  style,
  sheetWidth,
  sheetHeight,
}) {
  const sheetRef = useRef(null);
  const importInputRef = useRef(null);
  const exportMenuRef = useRef(null);
  const instanceIdRef = useRef(null);
  if (instanceIdRef.current == null) {
    instanceIdRef.current = newInstanceId();
  }
  const [key, setKey] = useState(0);
  const [initialSheets, setInitialSheets] = useState(() =>
    prepareImportedSheets(data),
  );
  const [exportMenu, setExportMenu] = useState(null);
  const [importing, setImporting] = useState(false);
  const lastRevisionRef = useRef(revision);
  const lastNotifiedSigRef = useRef(
    contentSignature(prepareImportedSheets(data)),
  );
  const onChangeTimerRef = useRef(null);
  // Keep latest callbacks stable for Workbook (avoids effect churn on onChange).
  const onChangeRef = useRef(onChange);
  const onOpRef = useRef(onOp);
  onChangeRef.current = onChange;
  onOpRef.current = onOp;

  const ui = useMemo(() => resolveExcelUi(lang), [lang]);

  useEffect(() => {
    if (revision === lastRevisionRef.current) {
      return;
    }
    lastRevisionRef.current = revision;
    const next = prepareImportedSheets(data);
    setInitialSheets(next);
    lastNotifiedSigRef.current = contentSignature(next);
    setKey((prev) => prev + 1);
  }, [revision, data]);

  useEffect(() => {
    const instanceId = instanceIdRef.current;
    return () => {
      if (onChangeTimerRef.current) {
        clearTimeout(onChangeTimerRef.current);
      }
      // Drop this instance's dedupe slot so a remounted tree starts clean.
      const g = typeof globalThis !== "undefined" ? globalThis : window;
      if (g[OP_DEDUPE_GLOBAL_KEY] && instanceId) {
        delete g[OP_DEDUPE_GLOBAL_KEY][instanceId];
      }
    };
  }, []);

  useEffect(() => {
    if (!exportMenu) {
      return undefined;
    }
    const onDocMouseDown = (event) => {
      const menu = exportMenuRef.current;
      if (menu && !menu.contains(event.target)) {
        setExportMenu(null);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [exportMenu]);

  const notifyParentIfContentChanged = useCallback((nextSheets) => {
    if (typeof onChangeRef.current !== "function") {
      return;
    }
    const sig = contentSignature(nextSheets);
    if (sig === lastNotifiedSigRef.current) {
      return;
    }
    if (onChangeTimerRef.current) {
      clearTimeout(onChangeTimerRef.current);
    }
    onChangeTimerRef.current = setTimeout(() => {
      const latestSig = contentSignature(nextSheets);
      if (latestSig === lastNotifiedSigRef.current) {
        return;
      }
      lastNotifiedSigRef.current = latestSig;
      onChangeRef.current?.(nextSheets);
    }, 400);
  }, []);

  /** Immediate snapshot push (import / forced reload) — bypasses debounce gate. */
  const notifyParentImmediate = useCallback((nextSheets) => {
    if (onChangeTimerRef.current) {
      clearTimeout(onChangeTimerRef.current);
      onChangeTimerRef.current = null;
    }
    const sig = contentSignature(nextSheets);
    lastNotifiedSigRef.current = sig;
    if (typeof onChangeRef.current === "function") {
      onChangeRef.current(nextSheets);
    }
  }, []);

  const handleChange = useCallback(
    (nextSheets) => {
      notifyParentIfContentChanged(nextSheets);
    },
    [notifyParentIfContentChanged],
  );

  // Fine-grained ops for audit / collaboration. See:
  // https://ruilisi.github.io/fortune-sheet-docs/guide/op.html
  //
  // Dedupe collapses StrictMode duplicate emits of the same Op[] within
  // OP_DEDUPE_WINDOW_MS (per instance). Skips insert/delete row-col/sheet.
  // Not a substitute for collab clientOpId.
  const handleOp = useCallback(
    (ops) => {
      if (typeof onOpRef.current !== "function") {
        return;
      }
      if (!Array.isArray(ops) || ops.length === 0) {
        return;
      }
      if (
        dedupeOps &&
        shouldDropDuplicateOps(instanceIdRef.current, ops)
      ) {
        return;
      }
      onOpRef.current(ops);
    },
    [dedupeOps],
  );

  const applyImportedSheets = (sheets) => {
    const prepared = prepareImportedSheets(sheets);
    setInitialSheets(prepared);
    // Must notify before/without pre-seeding the debounce gate, otherwise
    // notifyParentIfContentChanged no-ops on identical signatures.
    notifyParentImmediate(prepared);
    // Remount once with prepared data. Do not also use FortuneExcel's setKey —
    // a double remount races Workbook init and throws "sheet not found".
    setKey((prev) => prev + 1);
  };

  const handleImportFile = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) {
      return;
    }
    setImporting(true);
    try {
      // FortuneExcel calls setColumnWidth/setRowHeight 1ms after remount.
      // That races Workbook init and throws "sheet not found". Skip those API
      // calls — column/row sizes already live in sheet.config for remount.
      const noopApiRef = {
        current: {
          setColumnWidth() {},
          setRowHeight() {},
        },
      };
      await transformExcelToFortune(
        file,
        applyImportedSheets,
        () => {},
        noopApiRef,
      );
    } catch (err) {
      console.error("FortuneSheet import failed:", err);
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  const handleExport = async (fileType) => {
    try {
      await transformFortuneToExcel(sheetRef, fileType, true);
    } catch (err) {
      console.error("FortuneSheet export failed:", err);
    } finally {
      setExportMenu(null);
    }
  };

  const customToolbarItems = useMemo(() => {
    const items = [];
    if (enableImport) {
      const base = importToolBarItem();
      items.push({
        ...base,
        tooltip: ui.importTooltip,
        onClick: () => {
          if (!importing) {
            importInputRef.current?.click();
          }
        },
      });
    }
    if (enableExport) {
      const base = exportToolBarItem();
      items.push({
        ...base,
        tooltip: ui.exportTooltip,
        onClick: (e) => {
          const anchor =
            e?.currentTarget || e?.target?.closest?.("div") || e?.target;
          const rect = anchor?.getBoundingClientRect?.();
          if (!rect) {
            return;
          }
          setExportMenu((prev) =>
            prev
              ? null
              : {
                  top: Math.round(rect.bottom + 4),
                  left: Math.round(rect.left),
                },
          );
        },
      });
    }
    return items;
  }, [enableImport, enableExport, ui, importing]);

  const acceptTypes = [
    enableImport ? ".xlsx" : null,
    enableImport ? ".csv" : null,
  ]
    .filter(Boolean)
    .join(",");

  const containerStyle = {
    position: "relative",
    width: cssSize(sheetWidth, "100%"),
    height: cssSize(sheetHeight, "70vh"),
    minHeight: cssSize(sheetHeight, "70vh"),
    ...(style || {}),
  };

  return (
    <div className="fortune-sheet-host" style={containerStyle}>
      {enableImport ? (
        <input
          ref={importInputRef}
          type="file"
          accept={acceptTypes || ".xlsx,.csv"}
          onChange={handleImportFile}
          hidden
        />
      ) : null}

      {exportMenu ? (
        <div
          ref={exportMenuRef}
          className="fortune-excel-export-menu"
          style={{
            ...exportMenuStyle,
            top: `${exportMenu.top}px`,
            left: `${exportMenu.left}px`,
          }}
        >
          <button
            type="button"
            style={exportButtonStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#ededed";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#fff";
            }}
            onClick={() => handleExport("xlsx")}
          >
            {ui.exportXlsx}
          </button>
          <button
            type="button"
            style={exportButtonStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#ededed";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#fff";
            }}
            onClick={() => handleExport("csv")}
          >
            {ui.exportCsv}
          </button>
        </div>
      ) : null}

      <Workbook
        key={key}
        ref={sheetRef}
        data={initialSheets}
        lang={lang}
        column={column}
        row={row}
        showToolbar={showToolbar}
        showFormulaBar={showFormulaBar}
        showSheetTabs={showSheetTabs}
        defaultFontSize={defaultFontSize}
        customToolbarItems={customToolbarItems}
        onChange={handleChange}
        onOp={handleOp}
      />
    </div>
  );
}
