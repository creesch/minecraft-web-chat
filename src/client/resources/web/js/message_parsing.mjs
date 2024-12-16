// @ts-check
'use strict';

import { translations } from './translations.mjs';

// Minecraft JSON message parsing to HTML. 
// A lot of the code below has been inspired (though not directly copied) by prismarine-chat: https://github.com/PrismarineJS/prismarine-chat 

// These limits prevent DoS attacks and stack overflow issues from maliciously crafted messages 
const MAX_CHAT_LENGTH = 4096;
const MAX_CHAT_DEPTH = 8;

// Minecraft's standard color palette - used for legacy color code compatibility
const VALID_COLORS = [
    'black',
    'dark_blue',
    'dark_green',
    'dark_aqua',
    'dark_red',
    'dark_purple',
    'gold',
    'gray',
    'dark_gray',
    'blue',
    'green',
    'aqua',
    'red',
    'light_purple',
    'yellow',
    'white',
    'reset'
];

/**
 * @typedef {Object} BaseComponent
 * @property {string} [text] - Text content
 * @property {string} [translate] - Translation key
 * @property {Array<string|Component>} [with] - Translation parameters
 * @property {Array<Component>} [extra] - Additional components to append
 * @property {string} [color] - Text color - can be a named color or hex value
 * @property {boolean} [bold] - Whether text should be bold
 * @property {boolean} [italic] - Whether text should be italic
 * @property {boolean} [underlined] - Whether text should be underlined
 * @property {boolean} [strikethrough] - Whether text should be struck through
 * @property {boolean} [obfuscated] - Whether text should be obfuscated (randomly changing characters)
 */

/**
 * @typedef {BaseComponent & {
 *   name: string
 * }} HoverEventContents
 */

/**
 * @typedef {Object} HoverEvent
 * @property {HoverEventContents} [contents] - The hover event contents
 * @property {string} [value] - Legacy hover value
 */

/**
 * @typedef {BaseComponent & {
 *   hoverEvent?: HoverEvent
 * }} Component
 */

/**
 * Supports both legacy named colors and modern hex colors while preventing XSS via color values.
 * @param {string} color
 * @returns {boolean}
 */
function isValidColor(color) {
    if (!color) {
        return false;
    }
    color = color.toLowerCase();
    if (VALID_COLORS.includes(color)) {
        return true;
    }
    return /^#[0-9a-fA-F]{6}$/.test(color); // Allow valid hex colors (e.g., #FF0000)
} 

/**
 * HTML escaping including backticks and backslashes to prevent template literal and escape sequence exploits.
 * @param {unknown} unsafe
 * @returns {string}
 */
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') {
        return '';
    }
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/`/g, '&#x60;')
        .replace(/\\/g, '&#x5c;');
}

// Imitates Minecraft's obfuscated text. 
export function initializeObfuscation() {
    const chars = `
        ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789
        ¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿
        ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏ
        ☠☮☯☪☭☢☣☤☥☦☧☨☩☪☫☬☭
        ☰☱☲☳☴☵☶☷
        ☸☹☺☻☼☽☾☿
        ✈✉✎✏✐✑✒✓✔✕✖✗✘✙✚✛✜✝✞✟
        ℃℉℗℘ℙℚℛℜℝ℞℟
        ™Ⓡ©
    `.replace(/[\n\s]/g, ''); // Remove unnecessary whitespace and newlines so we can have a nicely formated template literal.
    const charsLength = chars.length;
    const maxElements = 100; // Limit number of obfuscated elements

    /** @type {number | null} */
    let animationFrameId = null;
    let lastUpdate = 0;

    const updateInterval = 50; // Rate limiting updates to 50ms intervals to balance animation smoothness with performance

    /**
     * @param {number} timestamp
     */
    function updateObfuscatedText(timestamp) {
        // Uses requestAnimationFrame with timestamp checking for efficient rate limiting
        // that automatically pauses when tab is inactive
        if (timestamp - lastUpdate >= updateInterval) {
            const elements = document.getElementsByClassName('minecraft-obfuscated');
            const elementsToProcess = Math.min(elements.length, maxElements);

            for (let i = 0; i < elementsToProcess; i++) {
                const element = elements[i];
                const length = element.textContent ? element.textContent.length : 0;
                let result = '';

                for (let j = 0; j < length; j++) {
                    result += chars.charAt(Math.floor(Math.random() * charsLength));
                }

                element.textContent = result;
            }

            lastUpdate = timestamp;
        }

        animationFrameId = requestAnimationFrame(updateObfuscatedText);
    }

    animationFrameId = requestAnimationFrame(updateObfuscatedText);

    return () => {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
    };
}

/**
 * Handles URL detection and conversion while maintaining XSS protection.
 * @param {string} text
 * @returns {string}
 */
function linkifyText(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, url => {
        try {
            // Basic URL validation, if it can't parse it as a url it will throw an error landing us in the catch block. 
            new URL(url);
            const sanitizedUrl = escapeHtml(url);
            return `<a href="${sanitizedUrl}" 
                      target="_blank" 
                      rel="noopener noreferrer">${sanitizedUrl}</a>`;
        } catch {
            return escapeHtml(url);
        }
    });
}

/**
 * Supports both numbered (%1$s) and sequential (%s) placeholder formats.
 * @param {string} key
 * @param {any[]} args
 * @returns {string}
 */
function formatTranslation(key, args) {
    if (!key) {
        console.warn('Translation key is missing');
        return '';
    }

    // Handle placeholder keys like "%s" directly
    if (key === '%s') {
        if (!Array.isArray(args) || args.length === 0) {
            console.warn(`Missing arguments for placeholder key: ${key}`);
            return key;
        }

        return args.map(formatComponent).join('');
    }

    /** @type {string} */
    const template = translations[key] || key;
    if (!template) {
        console.warn(`Missing translation for key: ${key}`);
        return key;
    }

    if (!Array.isArray(args)) {
        console.warn(`Invalid arguments for translation key ${key}: `, args);
        return template;
    }

    try {
        // Handle numbered placeholders (%1$s, %2$s, etc.)
        if (template.includes('$s')) {
            return template.replace(/%(\d+)\$s/g, (match, num) => {
                const index = parseInt(num) - 1;
                return index < args.length ? formatComponent(args[index]) : match;
            });
        }

        // Handle simple %s placeholders
        let index = 0;
        return template.replace(/%s/g, () => {
            if (index >= args.length) {
                console.warn(`Missing argument ${index} for translation ${key}`);
                    return '%s';
            }
            return formatComponent(args[index++]);
        });
    } catch (error) {
        console.error(`Error formatting translation ${key}:`, error);
        return key;
    }
}

/**
 * Separate plain text formatter for hover events where HTML isn't needed.
 * @param {Component} component
 * @returns {string}
 */
function formatComponentPlainText(component) {
    if (typeof component === 'string') {
        return component;
    }

    if (!component || typeof component !== 'object') {
        return '';
    }

    let result = '';

    if (component.text) {
        result += component.text;
    } else if (component.translate) {
        const params = Array.isArray(component.with) ? component.with : [];
        result += formatTranslation(component.translate, params);
    }

    if (Array.isArray(component.extra)) {
        result += component.extra
            .map(formatComponentPlainText)
            .join('');
    }

    return result;
}

/**
 * Formats a Minecraft component into HTML.
 * @param {Component} component
 * @param {number} depth
 * @returns {string}
 */
function formatComponent(component, depth = 0) {
    // Depth tracking prevents stack overflow from circular references in malicious messages
    if (depth > MAX_CHAT_DEPTH) {
        console.warn('Maximum chat depth exceeded, truncating');
        return '';
    }

    if (typeof component === 'string') {
        return linkifyText(escapeHtml(component)).slice(0, MAX_CHAT_LENGTH);
    }

    if (!component || typeof component !== 'object') {
        return '';
    }

    let result = '';
    let classes = [];
    let attributes = '';

    try {
        // Using CSS classes for standard colors for consistency with Minecrafts palette
        // Direct style attributes only used for hex colors
        if (component.color) {
            if (!isValidColor(component.color)) {
                console.warn('Invalid color format:', component.color);
            } else if (component.color.startsWith('#')) {
                attributes += ` style="color: ${component.color}"`;
            } else {
                classes.push(`mc-${component.color.replace(/_/g, '-')}`);
            }
        }

        if (component.bold) {
            classes.push('mc-bold');
        }
        if (component.italic) {
            classes.push('mc-italic');
        }
        if (component.underlined) {
            classes.push('mc-underlined');
        }
        if (component.strikethrough) {
            classes.push('mc-strikethrough');
        }
        if (component.obfuscated) {
            classes.push('minecraft-obfuscated');
        }

        if (classes.length > 0) {
            attributes += ` class="${classes.join(' ')}"`;
        }

        // Hover events are implemented as titles for simplicity and broad browser compatibility
        if (component.hoverEvent) {
            let hoverContent = '';
            if (component.hoverEvent.contents) {
                if (component.hoverEvent.contents.name) {
                    hoverContent = typeof component.hoverEvent.contents.name === 'string' 
                        ? component.hoverEvent.contents.name 
                        : formatComponentPlainText(component.hoverEvent.contents.name);
                } else if (typeof component.hoverEvent.contents === 'object') {
                    // Handle translation objects in hover content
                    hoverContent = formatComponentPlainText(component.hoverEvent.contents);
                } else {
                    hoverContent = JSON.stringify(component.hoverEvent.contents);
                }
            } else if (component.hoverEvent.value) {
                hoverContent = component.hoverEvent.value;
            }
            if (hoverContent) {
                attributes += ` title="${escapeHtml(hoverContent)}"`;
            }
        }

        result = `<span${attributes}>`;

        if (component.text) {
            result += linkifyText(escapeHtml(component.text));
        } else if (component.translate) {
            const params = Array.isArray(component.with) ? component.with : [];
            result += formatTranslation(component.translate, params);
        }

        if (Array.isArray(component.extra)) {
            result += component.extra
                .map(e => formatComponent(e, depth + 1))
                .join('');
        }

        result += '</span>';

        if (result.length > MAX_CHAT_LENGTH) {
            console.warn('Chat message exceeded maximum length, truncating');
            return escapeHtml(component.text || '').slice(0, MAX_CHAT_LENGTH);
        }

        return result;
    } catch (error) {
        console.error('Error formatting component:', error);
        return escapeHtml(String(component.text || '')).slice(0, MAX_CHAT_LENGTH);
    }
}

/**
 * Main entry point that handles both string and object inputs for flexibility.
 * @param {string | Component} json
 * @returns {string}
 */
export function parseMinecraftText(json) {
    try {
        /** @type {Component} */
        const component = (typeof json === 'string' ? JSON.parse(json) : json);
        const result = formatComponent(component);

        if (result.length > MAX_CHAT_LENGTH) {
            return escapeHtml(String(component.text || '')).slice(0, MAX_CHAT_LENGTH);
        }

        return result;
    } catch (error) {
        console.error('Error parsing Minecraft text:', error);
        return escapeHtml(String(json)).slice(0, MAX_CHAT_LENGTH);
    }
}