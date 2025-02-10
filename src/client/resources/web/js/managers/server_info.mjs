// @ts-check
'use strict';

import { querySelectorWithAssertion } from '../utils.mjs';
import { formatPlainText } from '../messages/message_parsing.mjs';

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

    /** @type {HTMLSpanElement} */
    #serverNameElement;

    constructor() {
        this.#name = undefined;
        this.#id = undefined;
        this.#baseTitle = document.title;
        this.#serverNameElement = /** @type {HTMLSpanElement} */ (
            querySelectorWithAssertion('#status .server-name')
        );
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

        document.title = `${this.#baseTitle} - ${name}`;
        this.#serverNameElement.textContent = name;

        formatPlainText(this.#serverNameElement, false);
    }

    /**
     * Clears the current server information from both variables and UI
     */
    clear() {
        this.#name = undefined;
        this.#id = undefined;
        document.title = this.#baseTitle;
        this.#serverNameElement.textContent = 'No server';
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

// Export a singleton instance since we only need one serverInfo instance.
export const serverInfo = new ServerInfo();
