// @ts-check
'use strict';

/**
 * Gets element based on selector. Throws error if element is null.
 * @param {string} selector
 */
export function querySelectorWithAssertion(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        throw new Error(`Required DOM element not found: ${selector}`);
    }
    return element;
}

/**
 * Format a timestamp into a human readable format
 * @param {number} timestamp - Timestamp in milliseconds
 * @returns {{ timeString: string, fullDateTime: string }}
 */
export function formatTimestamp(timestamp) {
    const date = new Date(timestamp);

    // Format HH:MM for display
    const timeString = date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });

    // Full date and time for tooltip
    const fullDateTime = date.toLocaleString([], {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });

    return { timeString, fullDateTime };
}
