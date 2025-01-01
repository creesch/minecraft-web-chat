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
    'reset',
];

const VALID_HOVER_EVENTS = ['show_text', 'show_item', 'show_entity'];

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
 * @property {HoverEvent} [hoverEvent] - Hover event
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
 * @property {{ type: string, id: unknown, name?: string }} [contents] - The entity data to show
 * @property {string} [value] - Deprecated: SNBT representation of the entity data to show.
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
    if (VALID_COLORS.includes(color)) {
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
 * Handles URL detection and conversion while maintaining XSS protection.
 * @param {string} text
 * @returns {(Element | Text)[]}
 */
function linkifyText(text) {
    const result = [];
    const regex = /(https?:\/\/[^\s]+)/g;
    let lastIndex = 0;
    let match = regex.exec(text);

    while (match !== null) {
        // Add text before the URL
        if (lastIndex < match.index) {
            result.push(
                document.createTextNode(text.slice(lastIndex, match.index)),
            );
        }

        const url = /** @type {string} */ (match[1]);
        const a = document.createElement('a');
        a.href = url;
        a.rel = 'noopener noreferrer';
        a.target = '_blank';
        a.textContent = url;
        result.push(a);

        lastIndex = regex.lastIndex;
        match = regex.exec(text);
    }

    // Add remaining text
    if (lastIndex < text.length) {
        result.push(document.createTextNode(text.slice(lastIndex)));
    }

    return result;
}

/**
 * Handles numbered substitution (%1$s, %2$s, etc.)
 * @param {string} template
 * @param {(number | string | Component)[]} args
 * @returns {(Element | Text)[]}
 */
function numberedSubstitution(template, args) {
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
            result.push(formatComponent(value));
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
 * @returns {(Element | Text)[]}
 */
function simpleSubstitution(template, args) {
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
            result.push(formatComponent(value));
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
 * @returns {(Element | Text)[]}
 */
function formatTranslation(key, args) {
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

            return formatComponent(value);
        });
    }

    const template = translations[key];
    if (!template) {
        console.warn(`Missing translation for key: ${key}`);
        return [document.createTextNode(key)];
    }

    try {
        if (template.includes('$s')) {
            return numberedSubstitution(template, args);
        }

        return simpleSubstitution(template, args);
    } catch (error) {
        console.error(`Error formatting translation for key: ${key}`, error);
        return [document.createTextNode(key)];
    }
}

/**
 * Separate plain text formatter for hover events where HTML isn't needed.
 * @param {Component} component
 * @returns {string}
 */
function formatComponentPlainText(component) {
    let result = '';

    if (component.text) {
        result += component.text;
    } else if (component.translate) {
        result += formatTranslation(component.translate, component.with ?? [])
            .map((component) => component.textContent ?? '')
            .join('');
    }

    if (component.extra) {
        result += component.extra
            .map((component) => {
                if (typeof component === 'string') {
                    return component;
                }
                if (typeof component === 'number') {
                    return String(component);
                }

                return formatComponentPlainText(component);
            })
            .join('');
    }

    return result;
}

/**
 * Formats a hover event into a string.
 * @param {HoverEvent} hoverEvent
 * @returns {string}
 */
function formatHoverEvent(hoverEvent) {
    switch (hoverEvent.action) {
        case 'show_text': {
            const contents = hoverEvent.contents ?? hoverEvent.value;
            if (typeof contents === 'undefined') {
                console.warn('HoverEvent.contents is undefined');
                return '';
            }

            if (typeof contents === 'string') {
                return contents;
            }
            if (typeof contents === 'number') {
                return String(contents);
            }

            if (Array.isArray(contents)) {
                return contents
                    .map((component) => {
                        if (typeof component === 'string') {
                            return component;
                        }
                        if (typeof component === 'number') {
                            return String(component);
                        }

                        return formatComponentPlainText(component);
                    })
                    .join('');
            }

            return formatComponentPlainText(contents);
        }
        case 'show_item': {
            if (!hoverEvent.contents) {
                // Don't attempt to parse SNBT data in hoverEvent.value
                console.warn('Unsupported legacy hoverEvent');
                return '';
            }

            if (hoverEvent.contents.count) {
                return `${hoverEvent.contents.count}x ${hoverEvent.contents.id}`;
            }

            return hoverEvent.contents.id;
        }

        case 'show_entity': {
            if (!hoverEvent.contents) {
                // Don't attempt to parse SNBT data in hoverEvent.value
                console.warn('Unsupported legacy hoverEvent');
                return '';
            }

            return hoverEvent.contents.name || 'Unnamed Entity';
        }
    }
}

/**
 * Formats a Minecraft component into HTML.
 * @param {Component} component
 * @returns {Element | Text}
 */
export function formatComponent(component) {
    const result = document.createElement('span');

    try {
        // Using CSS classes for standard colors for consistency with Minecrafts palette
        // Direct style attributes only used for hex colors
        if (component.color) {
            if (!isValidColor(component.color)) {
                console.warn('Invalid color format:', component.color);
            } else if (component.color.startsWith('#')) {
                result.style.color = component.color;
            } else {
                result.classList.add(
                    `mc-${component.color.replace(/_/g, '-')}`,
                );
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

        // Hover events are implemented as titles for simplicity and broad browser compatibility
        if (component.hoverEvent) {
            result.title = formatHoverEvent(component.hoverEvent);
        }

        if (component.text) {
            linkifyText(component.text).forEach((component) =>
                result.appendChild(component),
            );
        } else if (component.translate) {
            formatTranslation(
                component.translate,
                component.with ?? [],
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

                    return formatComponent(component);
                })
                .forEach((component) => result.appendChild(component));
        }

        if (result.textContent && result.textContent.length > MAX_CHAT_LENGTH) {
            console.warn('Chat message exceeded maximum length, truncating');
            result.textContent = result.textContent.slice(0, MAX_CHAT_LENGTH);
        }

        return result;
    } catch (error) {
        console.error('Error formatting component:', error);
        return document.createTextNode(
            String(component.text ?? '').slice(0, MAX_CHAT_LENGTH),
        );
    }
}
