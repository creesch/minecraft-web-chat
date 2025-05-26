// @ts-check
'use strict';

import { querySelectorWithAssertion } from '../utils.mjs';

/**
 * @typedef {import('../messages/message_types.mjs').PlayerInfo} PlayerInfo
 */

/**
 * Manages the direct message recipient UI component and state.
 */
class DirectMessageManager {
    /** @type {PlayerInfo | null} */
    #currentPlayer = null;

    /** @type {HTMLImageElement} */
    #clearButton;

    /** @type {HTMLTextAreaElement} */
    #chatInputElement;

    /** @type {string} */
    #startingInputPlaceholder = '';

    /** @type {(() => void) | null} */
    #resetCallback = null;

    /**
     * @param {HTMLImageElement} clearButton
     * @param {HTMLTextAreaElement} chatInputElement
     */
    constructor(clearButton, chatInputElement) {
        this.#clearButton = clearButton;
        this.#chatInputElement = chatInputElement;
        this.#startingInputPlaceholder = this.#chatInputElement.placeholder;
    }

    /**
     * Sets the current direct message recipient.
     * @param {PlayerInfo} player - The player to set as recipient
     * @param {() => void} [onReset] - Optional callback to call when the recipient is reset
     */
    setPlayer(player, onReset) {
        if (this.#resetCallback) {
            this.#resetCallback();
            this.#resetCallback = null;
        }

        this.#chatInputElement.placeholder = `Message ${player.playerDisplayName}...`;
        this.#chatInputElement.focus();
        this.#currentPlayer = player;
        this.#clearButton.style.display = 'block';
        this.#clearButton.title = `Stop chat with ${player.playerDisplayName}`;

        if (onReset) {
            this.#resetCallback = onReset;
        }
    }

    /**
     * Gets the current direct message recipient.
     * @returns {PlayerInfo | null} The current recipient, or null if none
     */
    getPlayer() {
        return this.#currentPlayer;
    }

    /**
     * Clears the current direct message recipient.
     */
    clearPlayer() {
        if (this.#resetCallback) {
            this.#resetCallback();
            this.#resetCallback = null;
        }

        this.#currentPlayer = null;
        this.#chatInputElement.placeholder = this.#startingInputPlaceholder;
        this.#clearButton.style.display = 'none';
        this.#clearButton.title = '';
    }
}

// Create and export a singleton instance
const clearButton = /** @type {HTMLImageElement} */ (
    querySelectorWithAssertion('#direct-message-clear')
);

const chatInputElement = /** @type {HTMLTextAreaElement} */ (
    querySelectorWithAssertion('#message-input')
);

export const directMessageManager = new DirectMessageManager(
    clearButton,
    chatInputElement,
);
