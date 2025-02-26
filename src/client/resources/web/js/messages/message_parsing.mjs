// @ts-check
'use strict';

import { fallbackTranslations } from './fallback_translations.mjs';
import { querySelectorWithAssertion } from '../utils.mjs';

// Minecraft JSON message parsing to HTML.
// A lot of the code below has been inspired (though not directly copied) by prismarine-chat: https://github.com/PrismarineJS/prismarine-chat

// These limits prevent DoS attacks and stack overflow issues from maliciously crafted messages
const MAX_CHAT_LENGTH = 4096;
const MAX_CHAT_DEPTH = 8;

// Minecraft's standard color palette - used for legacy color code compatibility
/** @type {Record<string, string>} */
const COLOR_CODES = {
    0: 'black',
    1: 'dark_blue',
    2: 'dark_green',
    3: 'dark_aqua',
    4: 'dark_red',
    5: 'dark_purple',
    6: 'gold',
    7: 'gray',
    8: 'dark_gray',
    9: 'blue',
    a: 'green',
    b: 'aqua',
    c: 'red',
    d: 'light_purple',
    e: 'yellow',
    f: 'white',
};

/** @type {Record<string, string>} */
const FORMATTING_CODES = {
    r: 'reset',
    k: 'obfuscated',
    l: 'bold',
    m: 'strikethrough',
    n: 'underlined',
    o: 'italic',
};

/** @type {Record<string, string>} */
const TEXT_CODES = { ...COLOR_CODES, ...FORMATTING_CODES };
export const TEXT_CODES_PATTERN = `§([${Object.keys(TEXT_CODES).join('')}])`;

const VALID_HOVER_EVENTS = ['show_text', 'show_item', 'show_entity'];
const VALID_CLICK_EVENTS = [
    'open_url',
    'open_file',
    'run_command',
    'suggest_command',
    'change_page',
    'copy_to_clipboard',
];

/**
 * @typedef {Object} Component
 * @property {string} [text] - Text content
 * @property {string} [translate] - Translation key
 * @property {(number | string | Component)[]} [with] - Translation parameters
 * @property {(number | string | Component)[]} [extra] - Additional components to append
 * @property {string} [color] - Text color - can be a named color or hex value
 * @property {boolean} [bold] - Whether text should be bold
 * @property {boolean} [italic] - Whether text should be italic
 * @property {boolean} [underlined] - Whether text should be underlined
 * @property {boolean} [strikethrough] - Whether text should be struck through
 * @property {boolean} [obfuscated] - Whether text should be obfuscated (randomly changing characters)
 * @property {string} [insertion] - String to insert when the component is shift-clicked
 * @property {HoverEvent} [hoverEvent] - Hover event
 * @property {ClickEvent} [clickEvent] - Click event
 */

/**
 * @typedef {ShowTextHoverEvent | ShowItemHoverEvent | ShowEntityHoverEvent} HoverEvent
 */

/**
 * @typedef {Object} ShowTextHoverEvent
 * @property {'show_text'} action - Displays a text tooltip
 * @property {number | string | Component | (number | string | Component)[]} [contents] - The text content to show in the tooltip
 * @property {number | string | Component | (number | string | Component)[]} [value] - Deprecated: The text content to show in the tooltip
 */

/**
 * @typedef {Object} ShowItemHoverEvent
 * @property {'show_item'} action - Displays an item's tooltip
 * @property {{ id: string, count?: number, tag?: string }} [contents] - The item data to show
 * @property {string} [value] - Deprecated: SNBT representation of the item data to show.
 */

/**
 * @typedef {Object} ShowEntityHoverEvent
 * @property {'show_entity'} action - Displays entity information
 * @property {{ type: string, id: unknown, name?: string | Component }} [contents] - The entity data to show
 * @property {string} [value] - Deprecated: SNBT representation of the entity data to show.
 */

/**
 * @typedef {Object} ClickEvent
 * @property {'open_url' | 'open_file' | 'run_command' | 'suggest_command' | 'change_page' | 'copy_to_clipboard'} action - The action to perform when clicked
 * @property {string} value - The value to pass to the action
 */

/**
 * Error class for component validation errors.
 * @class
 * @extends {Error}
 */
export class ComponentError extends Error {
    /**
     * @param {string} message
     * @param {string[]} path
     */
    constructor(message, path) {
        super(message);
        this.path = path;
    }

    /**
     * @override
     * @returns {string}
     */
    toString() {
        return `${this.message} at .${this.path.join('.')}`;
    }
}

/**
 * Type guard to check if a value is a valid Component object.
 * @param {unknown} component - The value to check
 * @param {string[]} path - The current path into the component
 * @throws If the component is not a valid {@link Component} object.
 */
export function assertIsComponent(component, path = []) {
    // Depth tracking prevents stack overflow from circular references in malicious messages
    if (path.length > MAX_CHAT_DEPTH) {
        throw new ComponentError('Maximum chat depth exceeded', path);
    }

    if (!component || typeof component !== 'object') {
        throw new ComponentError('Component is not an object', path);
    }

    /**
     * Checks if a value is a valid HoverEvent object.
     * @param {unknown} hoverEvent
     * @param {string[]} path
     * @throws If the hoverEvent is not a valid {@link HoverEvent} object.
     */
    function assertIsHoverEvent(hoverEvent, path) {
        if (!hoverEvent || typeof hoverEvent !== 'object') {
            throw new ComponentError('HoverEvent is not an object', path);
        }

        if (!('action' in hoverEvent)) {
            throw new ComponentError('HoverEvent.action is not present', path);
        }

        if (typeof hoverEvent.action !== 'string') {
            throw new ComponentError('HoverEvent.action is not a string', [
                ...path,
                'action',
            ]);
        }

        if (!VALID_HOVER_EVENTS.includes(hoverEvent.action)) {
            throw new ComponentError(
                `HoverEvent.action is not a valid hover event: ${hoverEvent.action}`,
                [...path, 'action'],
            );
        }

        switch (hoverEvent.action) {
            case 'show_text':
                assertIsShowTextHoverEvent(hoverEvent, path);
                break;
            case 'show_item':
                assertIsShowItemHoverEvent(hoverEvent, path);
                break;
            case 'show_entity':
                assertIsShowEntityHoverEvent(hoverEvent, path);
                break;
        }
    }

    /**
     * Checks if a value is a valid show_text hover event.
     * @param {object} hoverEvent
     * @param {string[]} path
     * @throws If the hoverEvent is not a valid {@link ShowTextHoverEvent} object.
     */
    function assertIsShowTextHoverEvent(hoverEvent, path) {
        if (!('contents' in hoverEvent) && !('value' in hoverEvent)) {
            throw new ComponentError(
                'HoverEvent does not have a contents or value property',
                path,
            );
        }

        const contents =
            'contents' in hoverEvent ? hoverEvent.contents : hoverEvent.value;
        if (typeof contents === 'string') {
            return;
        }
        if (typeof contents === 'number') {
            return;
        }

        if (Array.isArray(contents)) {
            contents.forEach((component, index) => {
                if (typeof component === 'string') {
                    return;
                }
                if (typeof component === 'number') {
                    return;
                }

                assertIsComponent(component, [
                    ...path,
                    'contents',
                    index.toString(),
                ]);
            });
        } else {
            assertIsComponent(contents, [...path, 'contents']);
        }
    }

    /**
     * Checks if a value is a valid show_item hover event.
     * @param {object} hoverEvent
     * @param {string[]} path
     * @throws If the hoverEvent is not a valid {@link ShowItemHoverEvent} object.
     */
    function assertIsShowItemHoverEvent(hoverEvent, path) {
        if (!('contents' in hoverEvent) && !('value' in hoverEvent)) {
            throw new ComponentError(
                'HoverEvent does not have a contents or value property',
                path,
            );
        }

        if ('value' in hoverEvent) {
            if (typeof hoverEvent.value !== 'string') {
                throw new ComponentError('HoverEvent.value is not a string', [
                    ...path,
                    'value',
                ]);
            }

            return;
        }

        if (
            typeof hoverEvent.contents !== 'object' ||
            hoverEvent.contents === null
        ) {
            throw new ComponentError('HoverEvent.contents is not an object', [
                ...path,
                'contents',
            ]);
        }

        if (!('id' in hoverEvent.contents)) {
            throw new ComponentError('HoverEvent.contents.id is not present', [
                ...path,
                'contents',
                'id',
            ]);
        }

        if (typeof hoverEvent.contents.id !== 'string') {
            throw new ComponentError('HoverEvent.contents.id is not a string', [
                ...path,
                'contents',
                'id',
            ]);
        }

        if (
            'count' in hoverEvent.contents &&
            typeof hoverEvent.contents.count !== 'number'
        ) {
            throw new ComponentError(
                'HoverEvent.contents.count is not a number',
                [...path, 'contents', 'count'],
            );
        }

        if (
            'tag' in hoverEvent.contents &&
            typeof hoverEvent.contents.tag !== 'string'
        ) {
            throw new ComponentError(
                'HoverEvent.contents.tag is not a string',
                [...path, 'contents', 'tag'],
            );
        }
    }

    /**
     * Checks if a value is a valid show_entity hover event.
     * @param {object} hoverEvent
     * @param {string[]} path
     * @throws If the hoverEvent is not a valid {@link ShowEntityHoverEvent} object.
     */
    function assertIsShowEntityHoverEvent(hoverEvent, path) {
        if (!('contents' in hoverEvent) && !('value' in hoverEvent)) {
            throw new ComponentError(
                'HoverEvent does not have a contents or value property',
                path,
            );
        }

        if ('value' in hoverEvent) {
            if (typeof hoverEvent.value !== 'string') {
                throw new ComponentError('HoverEvent.value is not a string', [
                    ...path,
                    'value',
                ]);
            }

            return;
        }

        if (
            typeof hoverEvent.contents !== 'object' ||
            hoverEvent.contents === null
        ) {
            throw new ComponentError('HoverEvent.contents is not an object', [
                ...path,
                'contents',
            ]);
        }

        if (!('type' in hoverEvent.contents)) {
            throw new ComponentError(
                'HoverEvent.contents.type is not present',
                [...path, 'contents', 'type'],
            );
        }

        if (typeof hoverEvent.contents.type !== 'string') {
            throw new ComponentError(
                'HoverEvent.contents.type is not a string',
                [...path, 'contents', 'type'],
            );
        }

        if (!('id' in hoverEvent.contents)) {
            throw new ComponentError('HoverEvent.contents.id is not present', [
                ...path,
                'contents',
                'id',
            ]);
        }

        if (
            'name' in hoverEvent.contents &&
            hoverEvent.contents.name !== null
        ) {
            if (typeof hoverEvent.contents.name === 'string') {
                return;
            }

            if (typeof hoverEvent.contents.name !== 'object') {
                throw new ComponentError(
                    'HoverEvent.contents.name is not a string or valid component',
                    [...path, 'contents', 'name'],
                );
            }

            assertIsComponent(hoverEvent.contents.name, [
                ...path,
                'contents',
                'name',
            ]);
        }
    }

    /**
     * Checks if a value is a valid click event.
     * @param {unknown} clickEvent
     * @param {string[]} path
     * @throws If the clickEvent is not a valid {@link ClickEvent} object.
     */
    function assertIsClickEvent(clickEvent, path) {
        if (typeof clickEvent !== 'object' || clickEvent === null) {
            throw new ComponentError('ClickEvent is not an object', path);
        }

        if (!('action' in clickEvent) || !('value' in clickEvent)) {
            throw new ComponentError(
                'ClickEvent does not have an action or value property',
                path,
            );
        }

        if (typeof clickEvent.action !== 'string') {
            throw new ComponentError('ClickEvent.action is not a string', [
                ...path,
                'action',
            ]);
        }

        if (!VALID_CLICK_EVENTS.includes(clickEvent.action)) {
            throw new ComponentError(
                `ClickEvent.action is not a valid click event: ${clickEvent.action}`,
                [...path, 'action'],
            );
        }

        if (typeof clickEvent.value !== 'string') {
            throw new ComponentError('ClickEvent.value is not a string', [
                ...path,
                'value',
            ]);
        }
    }

    if (
        !('text' in component) &&
        !('translate' in component) &&
        !('extra' in component)
    ) {
        throw new ComponentError(
            'Component does not have a text, translate, or extra property',
            path,
        );
    }

    if ('text' in component && typeof component.text !== 'string') {
        throw new ComponentError('Component.text is not a string', [
            ...path,
            'text',
        ]);
    }

    if ('translate' in component && typeof component.translate !== 'string') {
        throw new ComponentError('Component.translate is not a string', [
            ...path,
            'translate',
        ]);
    }

    if ('color' in component && typeof component.color !== 'string') {
        throw new ComponentError('Component.color is not a string', [
            ...path,
            'color',
        ]);
    }

    if ('bold' in component && typeof component.bold !== 'boolean') {
        throw new ComponentError('Component.bold is not a boolean', [
            ...path,
            'bold',
        ]);
    }

    if ('italic' in component && typeof component.italic !== 'boolean') {
        throw new ComponentError('Component.italic is not a boolean', [
            ...path,
            'italic',
        ]);
    }

    if (
        'underlined' in component &&
        typeof component.underlined !== 'boolean'
    ) {
        throw new ComponentError('Component.underlined is not a boolean', [
            ...path,
            'underlined',
        ]);
    }

    if (
        'strikethrough' in component &&
        typeof component.strikethrough !== 'boolean'
    ) {
        throw new ComponentError('Component.strikethrough is not a boolean', [
            ...path,
            'strikethrough',
        ]);
    }

    if (
        'obfuscated' in component &&
        typeof component.obfuscated !== 'boolean'
    ) {
        throw new ComponentError('Component.obfuscated is not a boolean', [
            ...path,
            'obfuscated',
        ]);
    }

    if ('extra' in component) {
        if (!Array.isArray(component.extra)) {
            throw new ComponentError('Component.extra is not an array', [
                ...path,
                'extra',
            ]);
        }

        component.extra.forEach((component, index) => {
            if (typeof component === 'string') {
                return;
            }
            if (typeof component === 'number') {
                return;
            }

            assertIsComponent(component, [...path, 'extra', index.toString()]);
        });
    }

    if ('with' in component) {
        if (!Array.isArray(component.with)) {
            throw new ComponentError('Component.with is not an array', [
                ...path,
                'with',
            ]);
        }

        component.with.forEach((component, index) => {
            if (typeof component === 'string') {
                return;
            }
            if (typeof component === 'number') {
                return;
            }

            assertIsComponent(component, [...path, 'with', index.toString()]);
        });
    }

    if ('hoverEvent' in component) {
        assertIsHoverEvent(component.hoverEvent, [...path, 'hoverEvent']);
    }

    if ('clickEvent' in component) {
        assertIsClickEvent(component.clickEvent, [...path, 'clickEvent']);
    }

    if ('insertion' in component) {
        if (typeof component.insertion !== 'string') {
            throw new ComponentError('Component.insertion is not a string', [
                ...path,
                'insertion',
            ]);
        }
    }
}

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
    if (Object.values(COLOR_CODES).includes(color)) {
        return true;
    }

    return /^#[0-9a-fA-F]{6}$/.test(color); // Allow valid hex colors (e.g., #FF0000)
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
    `.replace(/[\n\s]/g, ''); // Remove unnecessary whitespace and newlines so we can have a nicely formatted template literal.
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
            const elements = document.getElementsByClassName('mc-obfuscated');
            const elementsToProcess = Math.min(elements.length, maxElements);

            for (let i = 0; i < elementsToProcess; i++) {
                const element = elements[i];
                if (!element) continue;

                const length = element.textContent
                    ? element.textContent.length
                    : 0;
                let result = '';

                for (let j = 0; j < length; j++) {
                    result += chars.charAt(
                        Math.floor(Math.random() * charsLength),
                    );
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
 * Gets the class name for a § code.
 * @param {string} textCode
 * @returns {string}
 */
function className(textCode) {
    if (COLOR_CODES[textCode]) {
        return `mc-${COLOR_CODES[textCode].replace(/_/g, '-')}`;
    }

    if (FORMATTING_CODES[textCode]) {
        return `mc-${FORMATTING_CODES[textCode]}`;
    }

    return '';
}

/**
 * Creates a formatted element using § codes.
 * @param {string} text
 * @param {string[]} codes
 * @returns {Element | Text}
 */
function createFormattedElement(text, codes) {
    if (codes.length === 0) {
        return document.createTextNode(text);
    }

    const span = document.createElement('span');
    codes.forEach((code) => span.classList.add(className(code)));
    span.textContent = text;
    return span;
}

/**
 * Colorizes text with Minecraft's § codes.
 * @param {string} text
 * @returns {(Element | Text)[]}
 */
function colorizeText(text) {
    const result = [];
    const regex = new RegExp(TEXT_CODES_PATTERN, 'g');
    let lastIndex = 0;
    let match = regex.exec(text);

    /** @type {string | null} */
    let colorCode = null;
    const formatCodes = /** @type {Set<string>} */ (new Set());
    /**
     * List of codes to apply to the text.
     * @param {Set<string>} formatCodes
     * @param {string | null} colorCode
     * @returns {string[]}
     */
    function codes(formatCodes, colorCode) {
        return Array.from(formatCodes).concat(colorCode ? [colorCode] : []);
    }

    while (match !== null) {
        if (lastIndex < match.index) {
            result.push(
                createFormattedElement(
                    text.slice(lastIndex, match.index),
                    codes(formatCodes, colorCode),
                ),
            );
        }

        const code = match[1];
        switch (code) {
            case undefined:
                throw new Error('Unreachable!');
            case 'r':
                colorCode = null;
                formatCodes.clear();
                break;
            default:
                if (code in COLOR_CODES) {
                    colorCode = code;
                } else {
                    formatCodes.add(code);
                }
        }

        lastIndex = regex.lastIndex;
        match = regex.exec(text);
    }

    if (lastIndex < text.length) {
        result.push(
            createFormattedElement(
                text.slice(lastIndex),
                codes(formatCodes, colorCode),
            ),
        );
    }

    return result;
}

/**
 * Handles numbered substitution (%1$s, %2$s, etc.)
 * @param {string} template
 * @param {(number | string | Component)[]} args
 * @param {Record<string, string>} translations
 * @returns {(Element | Text)[]}
 */
function numberedSubstitution(template, args, translations) {
    /** @type {(Element | Text)[]} */
    const result = [];
    const regex = /%(\d+)\$s/g;
    let lastIndex = 0;
    let match = regex.exec(template);

    while (match !== null) {
        // Add text before the placeholder
        if (lastIndex < match.index) {
            result.push(
                document.createTextNode(template.slice(lastIndex, match.index)),
            );
        }

        const index = parseInt(/** @type {string} */ (match[1])) - 1;
        const value = args[index];
        if (!value) {
            console.warn(
                `Missing argument ${index} for template "${template}"`,
            );
            result.push(document.createTextNode(match[0]));
        } else if (typeof value === 'string') {
            result.push(document.createTextNode(value));
        } else if (typeof value === 'number') {
            result.push(document.createTextNode(String(value)));
        } else {
            result.push(formatComponent(value, translations));
        }

        lastIndex = regex.lastIndex;
        match = regex.exec(template);
    }

    // Add remaining text
    if (lastIndex < template.length) {
        result.push(document.createTextNode(template.slice(lastIndex)));
    }

    return result;
}

/**
 * Handles simple %s placeholders.
 * @param {string} template
 * @param {(number | string | Component)[]} args
 * @param {Record<string, string>} translations
 * @returns {(Element | Text)[]}
 */
function simpleSubstitution(template, args, translations) {
    /** @type {(Element | Text)[]} */
    const result = [];
    const regex = /%s/g;
    /** Index into template */
    let lastIndex = 0;

    let match = regex.exec(template);

    /** Index into args */
    let index = 0;
    while (match !== null) {
        // Add text before the placeholder
        if (lastIndex < match.index) {
            result.push(
                document.createTextNode(template.slice(lastIndex, match.index)),
            );
        }

        const value = args[index++];
        if (!value) {
            console.warn(
                `Missing argument ${index} for template "${template}"`,
            );
            result.push(document.createTextNode('%s'));
        } else if (typeof value === 'string') {
            result.push(document.createTextNode(value));
        } else if (typeof value === 'number') {
            result.push(document.createTextNode(String(value)));
        } else {
            result.push(formatComponent(value, translations));
        }

        lastIndex = regex.lastIndex;
        match = regex.exec(template);
    }

    // Add remaining text
    if (lastIndex < template.length) {
        result.push(document.createTextNode(template.slice(lastIndex)));
    }

    return result;
}

/**
 * Supports both numbered (%1$s) and sequential (%s) placeholder formats.
 * @param {string} key
 * @param {(number | string | Component)[]} args
 * @param {Record<string, string>} translations
 * @returns {(Element | Text)[]}
 */
function formatTranslation(key, args, translations) {
    if (!key) {
        console.warn('Translation key is missing');
        return [document.createTextNode(key)];
    }

    // Handle placeholder keys like "%s" directly
    if (key === '%s') {
        if (args.length === 0) {
            console.warn(`Missing arguments for placeholder key: ${key}`);
            return [document.createTextNode(key)];
        }

        return args.map((value) => {
            if (typeof value === 'string') {
                return document.createTextNode(value);
            }
            if (typeof value === 'number') {
                return document.createTextNode(String(value));
            }

            return formatComponent(value, translations);
        });
    }

    const template = translations[key];
    if (!template) {
        console.warn(`Missing translation for key: ${key}`);
        return [document.createTextNode(key)];
    }

    try {
        if (template.includes('$s')) {
            return numberedSubstitution(template, args, translations);
        }

        return simpleSubstitution(template, args, translations);
    } catch (error) {
        console.error(`Error formatting translation for key: ${key}`, error);
        return [document.createTextNode(key)];
    }
}

/**
 * Formats a hover event into a string.
 * @param {HoverEvent} hoverEvent
 * @param {Record<string, string>} translations
 * @returns {(Element | Text)[]}
 */
function formatHoverEvent(hoverEvent, translations) {
    switch (hoverEvent.action) {
        case 'show_text': {
            const contents = hoverEvent.contents ?? hoverEvent.value;
            if (typeof contents === 'undefined') {
                console.warn('HoverEvent.contents is undefined');
                return [];
            }

            if (typeof contents === 'string') {
                return [document.createTextNode(contents)];
            }
            if (typeof contents === 'number') {
                return [document.createTextNode(String(contents))];
            }

            if (Array.isArray(contents)) {
                return contents.map((component) => {
                    if (typeof component === 'string') {
                        return document.createTextNode(component);
                    }
                    if (typeof component === 'number') {
                        return document.createTextNode(String(component));
                    }

                    return formatComponent(component, translations);
                });
            }

            return [formatComponent(contents, translations)];
        }
        case 'show_item': {
            if (!hoverEvent.contents) {
                // Don't attempt to parse SNBT data in hoverEvent.value
                console.warn('Unsupported legacy hoverEvent');
                return [];
            }

            if (hoverEvent.contents.count) {
                return [
                    document.createTextNode(
                        `${hoverEvent.contents.count}x ${hoverEvent.contents.id}`,
                    ),
                ];
            }

            return [document.createTextNode(hoverEvent.contents.id)];
        }

        case 'show_entity': {
            if (!hoverEvent.contents) {
                // Don't attempt to parse SNBT data in hoverEvent.value
                console.warn('Unsupported legacy hoverEvent');
                return [];
            }

            if (typeof hoverEvent.contents.name === 'object') {
                return [
                    formatComponent(hoverEvent.contents.name, translations),
                ];
            }

            return [
                document.createTextNode(
                    hoverEvent.contents.name || 'Unnamed Entity',
                ),
            ];
        }
    }
}

/**
 * Builds a click handler for a click event.
 * @param {ClickEvent} clickEvent
 * @returns {((event: MouseEvent) => void) | null}
 */
function buildClickHandler(clickEvent) {
    switch (clickEvent.action) {
        case 'open_url':
            return (event) => {
                if (event.shiftKey) {
                    return;
                }

                const modalUrlElement = /** @type {HTMLParagraphElement} */ (
                    querySelectorWithAssertion('#modal-content .modal-url')
                );
                const modalContainer = /** @type {HTMLDivElement} */ (
                    querySelectorWithAssertion('#modal-container')
                );
                const modalContent = /** @type {HTMLDivElement} */ (
                    querySelectorWithAssertion('#modal-content')
                );
                const modalCancelButton = /** @type {HTMLButtonElement} */ (
                    querySelectorWithAssertion('#modal-cancel')
                );
                const modalCopyButton = /** @type {HTMLButtonElement} */ (
                    querySelectorWithAssertion('#modal-copy')
                );
                const modalConfirmButton = /** @type {HTMLButtonElement} */ (
                    querySelectorWithAssertion('#modal-confirm')
                );

                modalUrlElement.textContent = clickEvent.value;

                const closeModal = () => {
                    modalContainer.style.display = 'none';
                    modalUrlElement.textContent = '';
                    modalConfirmButton.removeEventListener(
                        'click',
                        confirmHandler,
                    );
                    modalCancelButton.removeEventListener(
                        'click',
                        cancelHandler,
                    );
                    modalCopyButton.removeEventListener('click', copyHandler);
                    modalConfirmButton.removeEventListener(
                        'click',
                        confirmHandler,
                    );
                    modalContainer.removeEventListener('click', closeModal);
                    modalContent.removeEventListener(
                        'click',
                        contentClickHandler,
                    );
                };

                const contentClickHandler = (
                    /** @type {MouseEvent} */ event,
                ) => {
                    event.stopPropagation();
                };

                const cancelHandler = () => {
                    modalUrlElement.textContent = '';
                    closeModal();
                };

                const copyHandler = () => {
                    navigator.clipboard.writeText(clickEvent.value);
                    closeModal();
                };

                const confirmHandler = () => {
                    window.open(
                        clickEvent.value,
                        '_blank',
                        'noopener,noreferrer',
                    );
                    closeModal();
                };

                modalCancelButton.addEventListener('click', cancelHandler);
                modalCopyButton.addEventListener('click', copyHandler);
                modalConfirmButton.addEventListener('click', confirmHandler);
                modalContainer.addEventListener('click', closeModal);
                modalContent.addEventListener('click', contentClickHandler);
                modalContainer.style.display = 'block';
                modalConfirmButton.focus();
            };
        case 'suggest_command':
            return (event) => {
                if (event.shiftKey) {
                    return;
                }

                const chatInputElement = /** @type {HTMLTextAreaElement} */ (
                    querySelectorWithAssertion('#message-input')
                );
                chatInputElement.value = clickEvent.value;
                chatInputElement.focus();
            };
        case 'copy_to_clipboard':
            return (event) => {
                if (event.shiftKey) {
                    return;
                }

                navigator.clipboard.writeText(clickEvent.value);
            };
        case 'run_command':
            return (event) => {
                if (event.shiftKey) {
                    return;
                }

                const chatInputElement = /** @type {HTMLTextAreaElement} */ (
                    querySelectorWithAssertion('#message-input')
                );

                chatInputElement.value = clickEvent.value;
                chatInputElement.focus();

                chatInputElement.dispatchEvent(
                    new KeyboardEvent('keydown', {
                        bubbles: true,
                        cancelable: true,
                        key: 'Enter',
                        code: 'Enter',
                    }),
                );
            };
        case 'open_file':
        case 'change_page':
            return null;
    }
}

/**
 * Transforms component structure into HTML.
 * @param {Component} component
 * @param {Record<string, string>} translations
 * @returns {Element}
 */
function formatComponent(component, translations) {
    const result = document.createElement('span');

    // Using CSS classes for standard colors for consistency with Minecrafts palette
    // Direct style attributes only used for hex colors
    if (component.color) {
        if (!isValidColor(component.color)) {
            console.warn('Invalid color format:', component.color);
        } else if (component.color.startsWith('#')) {
            result.style.color = component.color;
        } else {
            result.classList.add(`mc-${component.color.replace(/_/g, '-')}`);
        }
    }

    if (component.bold) {
        result.classList.add('mc-bold');
    }
    if (component.italic) {
        result.classList.add('mc-italic');
    }
    if (component.underlined) {
        result.classList.add('mc-underlined');
    }
    if (component.strikethrough) {
        result.classList.add('mc-strikethrough');
    }
    if (component.obfuscated) {
        result.classList.add('mc-obfuscated');
    }

    if (component.insertion) {
        const insertion = component.insertion;

        result.addEventListener('click', (event) => {
            if (!event.shiftKey) {
                return;
            }

            const chatInputElement = /** @type {HTMLTextAreaElement} */ (
                querySelectorWithAssertion('#message-input')
            );

            chatInputElement.setRangeText(
                insertion,
                chatInputElement.selectionStart,
                chatInputElement.selectionEnd,
                'end',
            );
            chatInputElement.focus();
        });
    }

    if (component.clickEvent) {
        const clickHandler = buildClickHandler(component.clickEvent);

        if (clickHandler) {
            result.addEventListener('click', clickHandler);
            result.style.cursor = 'pointer';
        }
    }

    if (component.hoverEvent) {
        const hoverContents = formatHoverEvent(
            component.hoverEvent,
            translations,
        );

        if (hoverContents.length > 0) {
            const hoverContainer = /** @type {HTMLDivElement} */ (
                querySelectorWithAssertion('#hover-container')
            );

            result.ariaLabel = hoverContents
                .map((component) => component.textContent)
                .join(' ');

            result.onmouseenter = (event) => {
                hoverContainer.replaceChildren(...hoverContents);
                formatPlainText(hoverContainer);
                if (result.textContent === hoverContainer.textContent) {
                    // Don't show hover container if it shows the same text as
                    // the element that is hovered.
                    return;
                }

                hoverContainer.style.left = `${event.clientX}px`;
                hoverContainer.style.top = `${event.clientY}px`;
                hoverContainer.style.display = 'block';
            };
            result.onmousemove = (event) => {
                hoverContainer.style.left = `${event.clientX}px`;
                hoverContainer.style.top = `${event.clientY}px`;
            };
            result.onmouseleave = () => {
                hoverContainer.style.display = 'none';
                hoverContainer.replaceChildren();
            };
        }
    }

    if (component.text) {
        result.appendChild(document.createTextNode(component.text));
    } else if (component.translate) {
        formatTranslation(
            component.translate,
            component.with ?? [],
            translations,
        ).forEach((component) => result.appendChild(component));
    }

    if (component.extra) {
        component.extra
            .map((component) => {
                if (typeof component === 'string') {
                    return document.createTextNode(component);
                }
                if (typeof component === 'number') {
                    return document.createTextNode(String(component));
                }

                return formatComponent(component, translations);
            })
            .forEach((component) => result.appendChild(component));
    }

    if (result.textContent && result.textContent.length > MAX_CHAT_LENGTH) {
        console.warn('Chat message exceeded maximum length, truncating');
        result.textContent = result.textContent.slice(0, MAX_CHAT_LENGTH);
    }

    return result;
}

/**
 * Transforms text content into HTML using § codes.
 * @param {Element} element
 */
export function formatPlainText(element) {
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
    );

    /** @type {Text[]} */
    const textNodes = [];
    while (walker.nextNode()) {
        textNodes.push(/** @type {Text} */ (walker.currentNode));
    }

    for (const textNode of textNodes) {
        const parent = textNode.parentNode;
        if (!parent) continue;

        const coloredElements = colorizeText(textNode.textContent ?? '');

        const replacement = document.createDocumentFragment();
        for (const element of coloredElements) {
            replacement.appendChild(element);
        }

        parent.replaceChild(replacement, textNode);
    }
}

/**
 * Transforms a Minecraft component into HTML.
 * @param {Component} component
 * @param {Record<string, string>} translations Translation key-value pairs
 * @returns {Element | Text}
 */
export function formatChatMessage(component, translations) {
    // Message payload should come with translations included. If not it likely is a legacy 1.21.1 message and the fallback translation file is used.
    const usedTranslations = Object.keys(translations).length
        ? translations
        : fallbackTranslations;
    /** @type {Element} */
    let element;
    try {
        // First pass: create an HTML element from the component structure
        element = formatComponent(component, usedTranslations);
    } catch (error) {
        console.error('Error formatting component:', error);
        return document.createTextNode(
            String(component.text ?? '').slice(0, MAX_CHAT_LENGTH),
        );
    }

    // Second pass: transform the text content of the element and its children
    formatPlainText(element);

    return element;
}
