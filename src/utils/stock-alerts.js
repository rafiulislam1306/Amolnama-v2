// src/utils/stock-alerts.js

export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

/**
 * Normalizes a global threshold value into a non-negative integer.
 * 0 disables default low-stock warnings; invalid/empty values fall back safely.
 */
export function normalizeThreshold(value, fallback = DEFAULT_LOW_STOCK_THRESHOLD) {
    if (value === null || value === undefined || value === '') {
        return fallback;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return fallback;
    }
    return Math.floor(parsed);
}

/**
 * Parses an optional per-item threshold input.
 * Empty string / null / undefined -> null (inherit global default).
 * Valid non-negative number -> floored integer (0 disables warning for this item).
 * Negative or non-numeric -> NaN (signals invalid user input).
 */
export function parseOptionalItemThreshold(rawValue) {
    if (rawValue === null || rawValue === undefined) return null;
    const trimmed = String(rawValue).trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) return NaN;
    return Math.floor(parsed);
}

/**
 * Resolves the effective low-stock threshold for a catalog item.
 * Per-item threshold (including 0 to disable) overrides the global default.
 */
export function resolveItemLowStockThreshold(item, globalThreshold = DEFAULT_LOW_STOCK_THRESHOLD) {
    const safeGlobal = normalizeThreshold(globalThreshold, DEFAULT_LOW_STOCK_THRESHOLD);
    if (item && item.lowStockThreshold !== null && item.lowStockThreshold !== undefined && item.lowStockThreshold !== '') {
        const itemVal = Number(item.lowStockThreshold);
        if (Number.isFinite(itemVal) && itemVal >= 0) {
            return Math.floor(itemVal);
        }
    }
    return safeGlobal;
}

/**
 * Evaluates a product's stock state against its resolved low-stock threshold.
 * Triggers low-stock warning when stock > 0 and stock < threshold (strictly below).
 */
export function getItemStockStatus(stock, threshold = DEFAULT_LOW_STOCK_THRESHOLD) {
    const resolvedThreshold = normalizeThreshold(threshold, DEFAULT_LOW_STOCK_THRESHOLD);
    if (!Number.isFinite(stock)) {
        return { level: 'untracked', isOutOfStock: false, isLowStock: false, threshold: resolvedThreshold };
    }
    if (stock <= 0) {
        return { level: 'out', isOutOfStock: true, isLowStock: false, threshold: resolvedThreshold };
    }
    if (resolvedThreshold > 0 && stock < resolvedThreshold) {
        return { level: 'low', isOutOfStock: false, isLowStock: true, threshold: resolvedThreshold };
    }
    return { level: 'ok', isOutOfStock: false, isLowStock: false, threshold: resolvedThreshold };
}
