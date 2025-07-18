// @ts-check
'use strict';
/**
 * @typedef {import('./message_parsing.mjs').Component} Component
 */

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
 * @property {string} modVersion
 */

/**
 * Chat message from Minecraft
 * @typedef {BaseModServerMessage & {
 *   type: 'chatMessage',
 *   payload: {
 *     history: boolean,
 *     component: Component,
 *     translations: Record<string, string>,
 *     uuid: string,
 *     isPing: boolean,
 *   }
 * }} ChatMessage
 */

/**
 * HistoryMetaData message from Minecraft
 * @typedef {BaseModServerMessage & {
 *   type: 'historyMetaData',
 *   payload: {
 *     oldestMessageTimestamp: number,
 *     moreHistoryAvailable: boolean,
 *   }
 * }} HistoryMetaData
 */

/**
 * Player information matching PlayerListInfoEntry on server
 * @typedef {Object} PlayerInfo
 * @property {string} playerId
 * @property {string} playerName
 * @property {string} playerDisplayName
 * @property {string} playerTextureUrl
 */

/**
 * ServerPlayerList message from Minecraft
 * @typedef {BaseModServerMessage & {
 *   type: 'serverPlayerList',
 *   payload: PlayerInfo[]
 * }} ServerPlayerList
 */

/**
 * @typedef {'init'| 'join' | 'disconnect'} ServerConnectionStates
 */

/**
 * Server join or leave message from Minecraft
 * @typedef {BaseModServerMessage & {
 *   type: 'serverConnectionState',
 *   payload: ServerConnectionStates
 * }} ServerConnectionState
 */

/**
 * @typedef {BaseModServerMessage & (ChatMessage | ServerConnectionState | HistoryMetaData | ServerPlayerList)} ModServerMessage
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

    return (
        message.type === 'chatMessage' ||
        message.type === 'serverConnectionState' ||
        message.type === 'historyMetaData' ||
        message.type === 'serverPlayerList'
    );
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
