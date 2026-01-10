import { expect, test, beforeAll, beforeEach } from 'vitest';
import {
    MAX_CHAT_DEPTH,
    assertIsComponent,
    formatMessage,
} from '~/messages/message_parsing.mjs';
/**
 * @typedef {import('~/messages/message_parsing.mjs').Component} Component
 */

/**
 * Create a deeply nested component for testing.
 * @param {number} depth
 * @returns {Component}
 */
function nestedComponent(depth) {
    if (depth <= 1) {
        return { text: `level ${depth}` };
    }

    // Depth is measured by JSON path, so subtract 2 because the sub-path
    // we're adding is ["extra"][0]
    return { text: `level ${depth}`, extra: [nestedComponent(depth - 2)] };
}

// Save copy of the DOM before any tests run
/** @type {Document} */
let originalDocument;

beforeAll(() => {
    // Clone the document before any tests run
    originalDocument = /** @type {Document} */ (document.cloneNode(true));
});

/**
 * @type {readonly [string, unknown, string | undefined][]}
 */
const COMPONENT_VALIDATION_TESTS = [
    // Basic validation
    [
        'empty object is not a component',
        {},
        'Component does not have a text, translate, or extra property',
    ],
    ['object with text is a component', { text: 'test' }, undefined],
    ['object with translate is a component', { translate: 'test' }, undefined],
    ['object with extra is a component', { extra: ['test'] }, undefined],

    // Text property validation
    ['text must be string', { text: 42 }, 'Component.text is not a string'],
    ['text can be empty string', { text: '' }, undefined],

    // Translate property validation
    [
        'translate must be string',
        { translate: 42 },
        'Component.translate is not a string',
    ],
    ['translate can be empty string', { translate: '' }, undefined],

    // Color validation
    [
        'color must be string',
        { text: 'test', color: 42 },
        'Component.color is not a string',
    ],
    [
        'color can be any string',
        { text: 'test', color: 'invalid_color' },
        undefined,
    ],

    // Boolean property validation
    [
        'bold must be boolean',
        { text: 'test', bold: 'true' },
        'Component.bold is not a boolean',
    ],
    [
        'italic must be boolean',
        { text: 'test', italic: 'true' },
        'Component.italic is not a boolean',
    ],
    [
        'underlined must be boolean',
        { text: 'test', underlined: 'true' },
        'Component.underlined is not a boolean',
    ],
    [
        'strikethrough must be boolean',
        { text: 'test', strikethrough: 'true' },
        'Component.strikethrough is not a boolean',
    ],
    [
        'obfuscated must be boolean',
        { text: 'test', obfuscated: 'true' },
        'Component.obfuscated is not a boolean',
    ],

    // Extra array validation
    [
        'extra must be array',
        { text: 'test', extra: 'not array' },
        'Component.extra is not an array',
    ],
    [
        'extra can contain strings',
        { text: 'test', extra: ['string'] },
        undefined,
    ],
    [
        'extra can contain valid components',
        { text: 'test', extra: [{ text: 'nested' }] },
        undefined,
    ],
    [
        'extra cannot contain invalid components',
        { text: 'test', extra: [{ invalid: true }] },
        'Component does not have a text, translate, or extra property',
    ],
    ['extra can contain numbers', { text: 'test', extra: [42] }, undefined],

    // With array validation
    [
        'with must be array',
        { translate: 'test', with: 'not array' },
        'Component.with is not an array',
    ],
    [
        'with can contain strings',
        { translate: 'test', with: ['string'] },
        undefined,
    ],
    [
        'with can contain valid components',
        { translate: 'test', with: [{ text: 'param' }] },
        undefined,
    ],
    [
        'with cannot contain invalid components',
        { translate: 'test', with: [{ invalid: true }] },
        'Component does not have a text, translate, or extra property',
    ],
    ['with can contain numbers', { translate: 'test', with: [42] }, undefined],

    // Hover event validation
    [
        'hover_event must be object',
        { text: 'test', hover_event: 'not object' },
        'HoverEvent is not an object',
    ],
    [
        'hover_event requires action',
        { text: 'test', hover_event: {} },
        'HoverEvent.action is not present',
    ],
    [
        'hover_event action must be string',
        { text: 'test', hover_event: { action: 42 } },
        'HoverEvent.action is not a string',
    ],
    [
        'hover_event action must be one of show_text, show_item, show_entity',
        { text: 'test', hover_event: { action: 'invalid' } },
        'HoverEvent.action is not a valid hover event: invalid',
    ],

    // show_text hover event validation
    [
        'show_text requires contents or value',
        { text: 'test', hover_event: { action: 'show_text' } },
        'HoverEvent does not have a contents or value property',
    ],
    [
        'show_text contents can be string',
        {
            text: 'test',
            hover_event: { action: 'show_text', contents: 'hover' },
        },
        undefined,
    ],
    [
        'show_text contents can be component',
        {
            text: 'test',
            hover_event: { action: 'show_text', contents: { text: 'hover' } },
        },
        undefined,
    ],
    [
        'show_text contents can be an array',
        {
            text: 'test',
            hover_event: { action: 'show_text', contents: ['hover', 'test'] },
        },
        undefined,
    ],
    [
        'show_text value can be a component',
        {
            text: 'test',
            hover_event: { action: 'show_text', value: { text: 'hover' } },
        },
        undefined,
    ],
    [
        'show_text value can be a string',
        { text: 'test', hover_event: { action: 'show_text', value: 'hover' } },
        undefined,
    ],
    [
        'show_text value can be an array',
        {
            text: 'test',
            hover_event: { action: 'show_text', value: ['hover', 'test'] },
        },
        undefined,
    ],
    [
        'show_text contents can be number',
        { text: 'test', hover_event: { action: 'show_text', contents: 42 } },
        undefined,
    ],
    [
        'show_text value can be number',
        { text: 'test', hover_event: { action: 'show_text', value: 42 } },
        undefined,
    ],

    // show_item hover event validation
    [
        'show_item contents requires id',
        { text: 'test', hover_event: { action: 'show_item' } },
        'HoverEvent.id is not present',
    ],
    [
        'show_item id must be string',
        {
            text: 'test',
            hover_event: { action: 'show_item', id: 42 },
        },
        'HoverEvent.id is not a string',
    ],

    // show_entity hover event validation
    [
        'show_entity id is required',
        {
            text: 'test',
            hover_event: { action: 'show_entity' },
        },
        'HoverEvent.id is not present',
    ],
    [
        'show_entity contents requires type',
        { text: 'test', hover_event: { action: 'show_entity' } },
        'HoverEvent.id is not present',
    ],
    [
        'show_entity id must be string',
        {
            text: 'test',
            hover_event: { action: 'show_entity', id: 23 },
        },
        'HoverEvent.id is not a string',
    ],
    [
        'show_entity value can be a string',
        {
            text: 'test',
            hover_event: {
                action: 'show_entity',
                id: 'minecraft:pig',
                value: 'hover',
            },
        },
        undefined,
    ],

    // Component depth
    [
        'component is too deep',
        nestedComponent(MAX_CHAT_DEPTH + 2),
        'Maximum chat depth exceeded',
    ],
    [
        'component is deep but not too deep :D',
        nestedComponent(MAX_CHAT_DEPTH),
        undefined,
    ],
];

for (const [name, component, expectedError] of COMPONENT_VALIDATION_TESTS) {
    test(name, () => {
        if (expectedError) {
            expect(() => assertIsComponent(component)).toThrow(expectedError);
        } else {
            expect(() => assertIsComponent(component)).not.toThrow();
        }
    });
}

beforeEach(() => {
    // Restore the original document before each test
    // eslint-disable-next-line no-global-assign
    document = /** @type {Document} */ (originalDocument.cloneNode(true));
});

/**
 * @type {readonly [string, Component, Record<string, string>, string][]}
 */
const COMPONENT_FORMATTING_TESTS = [
    // Basic text formatting
    ['empty component', { text: '' }, {}, '<span></span>'],
    ['component with text', { text: 'test' }, {}, '<span>test</span>'],
    [
        'component with translation',
        { translate: 'argument.id.invalid' },
        { 'argument.id.invalid': 'Invalid ID' },
        '<span>Invalid ID</span>',
    ],

    // Color formatting
    [
        'named color',
        { text: 'colored', color: 'red' },
        {},
        '<span class="mc-red">colored</span>',
    ],
    [
        'hex color',
        { text: 'hex', color: '#ff0000' },
        {},
        '<span style="color: rgb(255, 0, 0);">hex</span>',
    ],
    [
        'invalid color is ignored',
        { text: 'bad', color: 'invalid' },
        {},
        '<span>bad</span>',
    ],

    // Text styling
    [
        'bold text',
        { text: 'bold', bold: true },
        {},
        '<span class="mc-bold">bold</span>',
    ],
    [
        'italic text',
        { text: 'italic', italic: true },
        {},
        '<span class="mc-italic">italic</span>',
    ],
    [
        'underlined text',
        { text: 'underline', underlined: true },
        {},
        '<span class="mc-underlined">underline</span>',
    ],
    [
        'strikethrough text',
        { text: 'strike', strikethrough: true },
        {},
        '<span class="mc-strikethrough">strike</span>',
    ],
    [
        'obfuscated text',
        { text: 'hidden', obfuscated: true },
        {},
        '<span class="mc-obfuscated">hidden</span>',
    ],

    // Multiple styles
    [
        'multiple styles',
        { text: 'multi', bold: true, italic: true, color: 'blue' },
        {},
        '<span class="mc-blue mc-bold mc-italic">multi</span>',
    ],

    // Extra components
    [
        'extra string',
        { text: 'main', extra: ['extra'] },
        {},
        '<span>mainextra</span>',
    ],
    [
        'extra component',
        { text: 'main', extra: [{ text: 'extra', bold: true }] },
        {},
        '<span>main<span class="mc-bold">extra</span></span>',
    ],
    [
        'multiple extra',
        {
            text: 'main',
            extra: [
                { text: '1', bold: true },
                { text: '2', italic: true },
            ],
        },
        {},
        '<span>main<span class="mc-bold">1</span><span class="mc-italic">2</span></span>',
    ],
    ['extra number', { text: 'main', extra: [42] }, {}, '<span>main42</span>'],

    // Translation with parameters
    [
        'translation with string param',
        { translate: 'argument.id.unknown', with: ['test'] },
        { 'argument.id.unknown': 'Unknown ID: %s' },
        '<span>Unknown ID: test</span>',
    ],
    [
        'translation with component param',
        {
            translate: 'argument.id.unknown',
            with: [{ text: 'test', bold: true }],
        },
        { 'argument.id.unknown': 'Unknown ID: %s' },
        '<span>Unknown ID: <span class="mc-bold">test</span></span>',
    ],
    [
        'translation with number param',
        { translate: 'argument.id.unknown', with: [42] },
        { 'argument.id.unknown': 'Unknown ID: %s' },
        '<span>Unknown ID: 42</span>',
    ],

    // Hover events
    [
        'hover text',
        {
            text: 'hover',
            hover_event: { action: 'show_text', contents: 'tooltip' },
        },
        {},
        '<span aria-label="tooltip">hover</span>',
    ],
    [
        'hover item',
        {
            text: 'item',
            hover_event: {
                action: 'show_item',
                id: 'minecraft:diamond',
            },
        },
        {},
        '<span aria-label="minecraft:diamond">item</span>',
    ],
    [
        'hover item with count',
        {
            text: 'items',
            hover_event: {
                action: 'show_item',
                id: 'minecraft:diamond',
                count: 64,
            },
        },
        {},
        '<span aria-label="64x minecraft:diamond">items</span>',
    ],
    [
        'hover entity',
        {
            text: 'entity',
            hover_event: {
                action: 'show_entity',
                id: 'minecraft:pig',
                name: 'Mr. Pig',
            },
        },
        {},
        '<span aria-label="Mr. Pig">entity</span>',
    ],
    [
        'hover text with number',
        { text: 'hover', hover_event: { action: 'show_text', contents: 42 } },
        {},
        '<span aria-label="42">hover</span>',
    ],

    // Complex nested components
    [
        'complex nested',
        {
            translate: 'argument.entity.selector.allPlayers',
            color: 'gold',
            extra: [
                { text: ' [', color: 'gray' },
                { text: '@a', color: 'aqua', bold: true },
                { text: ']', color: 'gray' },
            ],
        },
        { 'argument.entity.selector.allPlayers': 'All players' },
        '<span class="mc-gold">' +
            'All players' +
            '<span class="mc-gray"> [</span>' +
            '<span class="mc-aqua mc-bold">@a</span>' +
            '<span class="mc-gray">]</span>' +
            '</span>',
    ],
    [
        'deeply nested with multiple styles',
        {
            text: 'Level 1 ',
            color: 'gold',
            extra: [
                {
                    text: 'Level 2 ',
                    bold: true,
                    extra: [
                        {
                            text: 'Level 3',
                            color: 'aqua',
                            italic: true,
                            strikethrough: true,
                        },
                    ],
                },
            ],
        },
        {},
        '<span class="mc-gold">' +
            'Level 1 ' +
            '<span class="mc-bold">' +
            'Level 2 ' +
            '<span class="mc-aqua mc-italic mc-strikethrough">' +
            'Level 3' +
            '</span>' +
            '</span>' +
            '</span>',
    ],
    [
        'complex translation with nested components',
        {
            translate: 'argument.block.property.invalid',
            color: 'red',
            with: [
                { text: 'stone', color: 'gray', italic: true },
                { text: 'waterlogged', bold: true, underlined: true },
                { text: 'enabled', color: 'green' },
            ],
        },
        {
            'argument.block.property.invalid':
                'Block %s does not accept %s for %s property',
        },
        '<span class="mc-red">' +
            'Block ' +
            '<span class="mc-gray mc-italic">stone</span> ' +
            'does not accept ' +
            '<span class="mc-bold mc-underlined">waterlogged</span> ' +
            'for ' +
            '<span class="mc-green">enabled</span> ' +
            'property' +
            '</span>',
    ],
    [
        'mixed text and translation with hover',
        {
            text: 'Found item: ',
            color: 'yellow',
            extra: [
                {
                    translate: 'argument.item.id.invalid',
                    with: [
                        {
                            text: 'diamond_pickaxe',
                            color: 'aqua',
                            hover_event: {
                                action: 'show_item',
                                id: 'minecraft:diamond_pickaxe',
                                count: 1,
                            },
                        },
                    ],
                    italic: true,
                },
            ],
        },
        { 'argument.item.id.invalid': "Unknown item '%s'" },
        '<span class="mc-yellow">' +
            'Found item: ' +
            '<span class="mc-italic">' +
            "Unknown item '" +
            '<span class="mc-aqua" aria-label="1x minecraft:diamond_pickaxe">' +
            'diamond_pickaxe' +
            "</span>'" +
            '</span>' +
            '</span>',
    ],
    [
        'multiple nested translations',
        {
            translate: 'argument.entity.invalid',
            color: 'red',
            extra: [
                { text: ' - ', color: 'gray' },
                {
                    translate: 'argument.player.toomany',
                    color: 'yellow',
                    italic: true,
                },
            ],
        },
        {
            'argument.player.toomany':
                'Only one player is allowed, but the provided selector allows more than one',
            'argument.entity.invalid': 'Invalid name or UUID',
        },
        '<span class="mc-red">' +
            'Invalid name or UUID' +
            '<span class="mc-gray"> - </span>' +
            '<span class="mc-yellow mc-italic">' +
            'Only one player is allowed, but the provided selector allows more than one' +
            '</span>' +
            '</span>',
    ],

    // Legacy color codes
    [
        'legacy color code',
        { text: '§4test' },
        {},
        '<span><span class="mc-dark-red">test</span></span>',
    ],
    [
        'legacy color code with bold',
        { text: '§4§ltest' },
        {},
        '<span><span class="mc-bold mc-dark-red">test</span></span>',
    ],
    [
        'legacy color code with reset',
        { text: '§4§rtest' },
        {},
        '<span>test</span>',
    ],
    [
        'all color codes',
        { text: '§0§1§2§3§4§5§6§7§8§9§a§b§c§d§e§ftest' },
        {},
        '<span><span class="mc-white">test</span></span>',
    ],
    ['invalid color code', { text: '§xtest' }, {}, '<span>§xtest</span>'],
    [
        'legacy color code with bold and reset',
        { text: '§4§ltest§rtest' },
        {},
        '<span><span class="mc-bold mc-dark-red">test</span>test</span>',
    ],
    [
        'complex nested formatting',
        { text: '§4§l[§r§6Warning§4§l]§r: §7Message' },
        {},
        '<span>' +
            '<span class="mc-bold mc-dark-red">[</span>' +
            '<span class="mc-gold">Warning</span>' +
            '<span class="mc-bold mc-dark-red">]</span>' +
            ': <span class="mc-gray">Message</span>' +
            '</span>',
    ],
    [
        'formatting codes within a translation',
        {
            translate: 'argument.item.id.invalid',
            color: 'red',
            with: [{ text: '§4§ltest§r', color: 'blue' }],
        },
        { 'argument.item.id.invalid': "Unknown item '%s'" },
        '<span class="mc-red">Unknown item \'<span class="mc-blue"><span class="mc-bold mc-dark-red">test</span></span>\'</span>',
    ],
];

for (const [
    name,
    component,
    translations,
    expected,
] of COMPONENT_FORMATTING_TESTS) {
    test(name, () => {
        expect(() => assertIsComponent(component)).not.toThrow();

        const element = formatMessage(component, translations);
        if (element instanceof Text) {
            expect(element.textContent).toBe(expected);
        } else {
            expect(element.outerHTML).toBe(expected);
        }
    });
}
