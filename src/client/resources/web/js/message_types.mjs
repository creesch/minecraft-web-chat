// @ts-check
'use strict';

/**
 * Server information matching ChatServerInfo on server
 * @typedef {Object} ServerInfo
 * @property {string} name
 * @property {string} identifier
 */

/**
 * Base message interface matching WebsocketJsonMessage on server
 * @typedef {Object} BaseModServerMessage
 * @property {number} timestamp
 * @property {ServerInfo} server
 * @property {string} minecraftVersion
 */

/**
 * Chat message from Minecraft
 * @typedef {Object} ChatMessage
 * @property {'chatMessage'} type
 * @property {import('./message_parsing.mjs').Component} payload
 */

/**
 * @typedef {BaseModServerMessage & ChatMessage} ModServerMessage
 */

/**
 * Minimal type guard for TypeScript type narrowing.
 * No complete validation because the server (mod) and client (this) are tightly coupled in one package.
 * @param {unknown} message
 * @returns {message is ModServerMessage}
 */
export function isModServerMessage(message) {
    if (typeof message !== 'object' || message === null) {
        return false;
    }
    if (!('type' in message)) {
        return false;
    }

    return message.type === 'chatMessage';
}

/**
 * Parse message from WebSocket
 * @param {string} rawMessage
 * @returns {ModServerMessage}
 */
export function parseModServerMessage(rawMessage) {
    const message = JSON.parse(rawMessage);
    
    if (!isModServerMessage(message)) {
        throw new Error('Invalid message type');
    }
    
    return message;
}