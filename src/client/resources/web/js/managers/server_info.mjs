// @ts-check
'use strict';

import { querySelectorWithAssertion } from '../utils.mjs';
import {
    formatPlainText,
    TEXT_CODES_PATTERN,
} from '../messages/message_parsing.mjs';

/**
 * Class to manage server information and related UI updates
 */

class ServerInfo {
    /** @type {string | undefined} */
    #name;

    /** @type {string | undefined} */
    #id;

    /** @type {string} */
    #baseTitle;

    /** @type {HTMLDivElement} */
    #statusElement;

    /**
     *
     * @param {HTMLDivElement} statusElement
     */
    constructor(statusElement) {
        this.#name = undefined;
        this.#id = undefined;
        this.#baseTitle = document.title;
        this.#statusElement = statusElement;
    }

    /**
     * Updates server information and UI elements
     * @param {string} name - The server's name
     * @param {string} id - The server's identifier
     */
    update(name, id) {
        if (!name || !id) {
            console.error(
                'Invalid server information: Both name and id must be provided.',
            );
            return;
        }

        this.#name = name;
        this.#id = id;

        document.title = `${this.#baseTitle} - ${name.replace(
            new RegExp(TEXT_CODES_PATTERN, 'g'),
            '',
        )}`;
        this.#statusElement.textContent = name;
        this.#statusElement.dataset['status'] = 'in-game';

        formatPlainText(this.#statusElement);
    }

    /**
     * Clears the current server information from both variables and UI
     */
    clear() {
        this.#name = undefined;
        this.#id = undefined;
        document.title = this.#baseTitle;
        this.#statusElement.textContent = 'Join a server to chat';
        this.#statusElement.dataset['status'] = 'connected';
    }

    /**
     * Gets the server's ID
     * @returns {string | undefined}
     */
    getId() {
        return this.#id;
    }

    /**
     * Gets the server's name
     * @returns {string | undefined}
     */
    getName() {
        return this.#name;
    }
}

const statusElement = /** @type {HTMLDivElement} */ (
    querySelectorWithAssertion('#status')
);

// Export a singleton instance since we only need one serverInfo instance.
export const serverInfo = new ServerInfo(statusElement);
