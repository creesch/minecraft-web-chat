// @ts-check
'use strict';

import {
    STEVE_HEAD_BASE64,
    getPlayerHead,
    querySelectorWithAssertion,
} from '../utils.mjs';

/**
 * @typedef {import('../messages/message_types.mjs').PlayerInfo} PlayerInfo
 */

/**
 * Extends PlayerInfo to include the cached player head image and DOM element.
 * @typedef {PlayerInfo & {
 *   playerHead?: string | null, // Cached base64 image data for the player's head.
 *   element?: HTMLElement | null, // Cached reference to the player's DOM element.
 *   playerClickHandler?: EventListener // Reference to the click event handler for cleanup.
 * }} StoredPlayerInfo
 */

/**
 * Interface for the player list manager.
 * @typedef {Object} PlayerListManager
 * @property {Map<string, StoredPlayerInfo>} players - Map of player IDs to player data.
 * @property {(newPlayerList: PlayerInfo[]) => Promise<void>} updatePlayerList - Updates the player list.
 * @property {(player: StoredPlayerInfo, existingPlayer?: StoredPlayerInfo) => HTMLElement | null} updatePlayerElement - Updates a player's DOM element.
 * @property {(playerId: string) => void} removePlayerElement - Removes a player's DOM element.
 * @property {(playerId: string) => StoredPlayerInfo | null} getPlayer - Gets a player by ID.
 * @property {() => StoredPlayerInfo[]} getAllPlayers - Gets all players.
 * @property {() => number} getPlayerCount - Gets the total player count.
 * @property {() => void} clearAll - Removes all players and clears the DOM.
 */

class PlayerList {
    /** @type {Map<string, StoredPlayerInfo>} */
    #players = new Map();

    /** @type {HTMLElement} */
    #listContainer;

    /** @type {HTMLTextAreaElement} */
    #chatInput;

    /** @type {HTMLSpanElement} */
    #playerCountElement;

    /**
     * Flag to indicate if an update is in progress if set to true updating will be skipped.
     * This shouldn't be too big of an issue once the initial playerlist is created as updates will be send every few seconds.
     * @type {boolean}
     */
    #isUpdating = false;

    /**
     * @param {HTMLElement} listContainer
     * @param {HTMLTextAreaElement} chatInput
     * @param {HTMLSpanElement} playerCountElement
     */
    constructor(listContainer, chatInput, playerCountElement) {
        this.#listContainer = listContainer;
        this.#chatInput = chatInput;
        this.#playerCountElement = playerCountElement;
    }

    /**
     * Updates the player list. Makes sure that player info is updated,
     * new players are added, and removed players are cleaned up.
     *
     * @param {PlayerInfo[]} newPlayerList - The new list of players.
     * @returns {Promise<void>} Resolves when the update process is complete.
     */
    async updatePlayerList(newPlayerList) {
        if (!Array.isArray(newPlayerList)) {
            console.warn('Invalid player list data');
            return;
        }

        if (this.#isUpdating) {
            // Note: due to the use of requestAnimationFrame this will happen more often when a tab is in the background.
            // Updates will pick up again once the tab is in focus.
            console.warn('Update already in progress');
            return;
        }
        this.#isUpdating = true;

        try {
            const currentPlayers = new Set(this.#players.keys());

            // Identify players that need to be updated or added.
            const playersNeedingUpdate = newPlayerList.filter((player) => {
                if (!player.playerId || !player.playerName) {
                    console.warn(
                        `Invalid player data: ${JSON.stringify(player)}`,
                    );
                    return false;
                }

                const existingPlayer = this.#players.get(player.playerId);

                // Conditions for requiring an update:
                // 1. Player does not exist in the map
                // 2. Player name, display name, or texture URL has changed. Note: It seems unlikely this happens with vanilla servers. Just accounting for potential modded servers.
                return (
                    !existingPlayer ||
                    existingPlayer.playerName !== player.playerName ||
                    existingPlayer.playerDisplayName !==
                        player.playerDisplayName ||
                    existingPlayer.playerTextureUrl !== player.playerTextureUrl
                );
            });

            for (const player of newPlayerList) {
                currentPlayers.delete(player.playerId);
            }

            // Fetch or reuse player head images. Using promises for parallel processing.
            const fetchPromises = playersNeedingUpdate.map(async (player) => {
                const existingPlayer = this.#players.get(player.playerId);

                if (
                    existingPlayer &&
                    existingPlayer.playerTextureUrl === player.playerTextureUrl
                ) {
                    // Reuse existing head if the texture URL hasn't changed.
                    return {
                        ...player,
                        playerHead: existingPlayer.playerHead,
                    };
                }

                try {
                    const playerHead = await getPlayerHead(
                        player.playerTextureUrl,
                    );
                    return {
                        ...player,
                        playerHead,
                    };
                } catch (error) {
                    console.error(
                        `Failed to get player head for ${player.playerName}, using default:`,
                        error,
                    );
                    return {
                        ...player,
                        playerHead: STEVE_HEAD_BASE64,
                    };
                }
            });

            // Wait for all asynchronous fetches to complete.
            const updatedPlayers = await Promise.all(fetchPromises);

            // Batch DOM updates within the next animation frame for efficiency.
            // Note: likely overkill for most small servers, just making sure that bigger servers with lots of users don't tank browser performance.
            await new Promise(
                (/** @type {(value: void) => void} */ resolve) => {
                    requestAnimationFrame(() => {
                        // Also use document fragment to for off screen dom building first.
                        const fragment = document.createDocumentFragment();

                        for (const player of updatedPlayers) {
                            const existingPlayer = this.#players.get(
                                player.playerId,
                            );
                            const element = this.#updatePlayerElement(
                                player,
                                existingPlayer,
                            );

                            // Store the updated player data in the map.
                            this.#players.set(player.playerId, player);

                            // Add new elements to the document fragment.
                            if (element) {
                                fragment.appendChild(element);
                            }
                        }

                        // Append all new elements to the DOM in one operation.
                        if (fragment.childNodes.length > 0) {
                            this.#listContainer.appendChild(fragment);
                        }

                        // Remove players that are no longer in the list.
                        for (const playerId of currentPlayers) {
                            this.removePlayerElement(playerId);
                        }

                        // Update the header with the player count
                        this.#playerCountElement.textContent = `(${this.getPlayerCount()})`;

                        resolve(); // Mark the update process as complete.
                    });
                },
            );
        } finally {
            this.#isUpdating = false;
        }
    }

    /**
     * Creates or updates a player's DOM element.
     *
     * @param {StoredPlayerInfo} player - The player data to update.
     * @param {StoredPlayerInfo} [existingPlayer] - The previous state of the player (if any).
     * @returns {HTMLElement|null} Returns the element if newly created, null if updated.
     */
    #updatePlayerElement(player, existingPlayer) {
        let playerElement = player.element;

        if (!playerElement) {
            // Create a new DOM element if none exists for the player.
            playerElement = document.createElement('li');
            playerElement.setAttribute('role', 'listitem');
            playerElement.setAttribute('data-player-id', player.playerId);

            // Create and configure the player's head image.
            const headImg = document.createElement('img');
            headImg.className = 'player-head';
            headImg.src = player.playerHead || STEVE_HEAD_BASE64;
            headImg.alt = `${player.playerDisplayName}'s head`;
            headImg.setAttribute('aria-hidden', 'true');

            // Create and configure the player's display name span.
            const nameSpan = document.createElement('span');
            nameSpan.className = 'player-name';
            nameSpan.textContent = player.playerDisplayName;
            nameSpan.title = player.playerName;

            // Specifically for aria labels show both playerDisplayName and playerName if they are different.
            if (player.playerDisplayName !== player.playerName) {
                nameSpan.setAttribute(
                    'aria-label',
                    `Display name: ${player.playerDisplayName}, Username: ${player.playerName}`,
                );
            } else {
                nameSpan.setAttribute(
                    'aria-label',
                    `Player name: ${player.playerDisplayName}`,
                );
            }

            // Add click event to insert the player name into the chat input
            const playerClickHandler = () => {
                const cursorPos = this.#chatInput.selectionStart;
                const textBefore = this.#chatInput.value.substring(
                    0,
                    cursorPos,
                );
                const textAfter = this.#chatInput.value.substring(cursorPos);
                this.#chatInput.value = `${textBefore}${player.playerDisplayName}${textAfter}`;
                this.#chatInput.focus();
                this.#chatInput.selectionStart = this.#chatInput.selectionEnd =
                    cursorPos + player.playerDisplayName.length;
            };

            playerElement.addEventListener('click', playerClickHandler);

            // Store the click handler for cleanup
            player.playerClickHandler = playerClickHandler;

            // Assemble the player element.
            playerElement.appendChild(headImg);
            playerElement.appendChild(nameSpan);

            // Cache the created element in the player object for future use.
            player.element = playerElement;
            return playerElement;
        }

        // Update the existing element if properties have changed.
        const headImg = /** @type {HTMLImageElement | null} */ (
            playerElement.querySelector('.player-head')
        );
        const nameSpan = /** @type {HTMLSpanElement | null} */ (
            playerElement.querySelector('.player-name')
        );

        if (
            headImg &&
            existingPlayer?.playerTextureUrl !== player.playerTextureUrl
        ) {
            headImg.src = player.playerHead || STEVE_HEAD_BASE64;
            headImg.alt = `${player.playerDisplayName}'s head`;
        }

        if (nameSpan) {
            if (
                existingPlayer?.playerDisplayName !== player.playerDisplayName
            ) {
                nameSpan.textContent = player.playerDisplayName;
            }

            if (existingPlayer?.playerName !== player.playerName) {
                nameSpan.title = player.playerName;
            }
        }

        // No new element created. Any updates to the existing element have been done. So return null.
        return null;
    }

    /**
     * Removes a player's DOM element and cleans up the map entry.
     *
     * @param {string} playerId - The ID of the player to remove.
     */
    removePlayerElement(playerId) {
        const player = this.#players.get(playerId);
        if (!player || !player.element) {
            return;
        }

        if (player.playerClickHandler) {
            player.element.removeEventListener(
                'click',
                player.playerClickHandler,
            );
            delete player.playerClickHandler; // Remove the reference to the handler
        }

        player.element.remove(); // Remove the element from the DOM.
        player.element = null; // Clear the cached reference to the element.
        this.#players.delete(playerId); // Remove the player from the map.
    }

    /**
     * Removes all players and clears the DOM.
     */
    clearAll() {
        // Get all player IDs first since we'll be modifying the map while iterating
        const playerIds = Array.from(this.#players.keys());

        for (const playerId of playerIds) {
            this.removePlayerElement(playerId);
        }

        // Clear the map as a safety net in case any players weren't properly removed
        this.#players.clear();
        this.#playerCountElement.textContent = '(0)';
    }

    /**
     * Retrieves a player's data by their ID.
     *
     * @param {string} playerId - The ID of the player to retrieve.
     * @returns {StoredPlayerInfo|null} The player's data, or null if not found.
     */
    getPlayer(playerId) {
        return this.#players.get(playerId) || null;
    }

    /**
     * Retrieves all players as an array.
     *
     * @returns {StoredPlayerInfo[]} An array of all players' data.
     */
    getAllPlayers() {
        return Array.from(this.#players.values());
    }

    /**
     * Retrieves the total number of players.
     *
     * @returns {number} The total player count.
     */
    getPlayerCount() {
        return this.#players.size;
    }
}

// Create and export a singleton instance since we only need one player list manager
const listContainer = /** @type {HTMLElement} */ (
    querySelectorWithAssertion('#player-list')
);
const chatInput = /** @type {HTMLTextAreaElement} */ (
    querySelectorWithAssertion('#message-input')
);
const playerCountElement = /** @type {HTMLSpanElement} */ (
    querySelectorWithAssertion('#player-count')
);

export const playerList = new PlayerList(
    listContainer,
    chatInput,
    playerCountElement,
);
