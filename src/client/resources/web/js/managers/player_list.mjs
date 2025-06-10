// @ts-check
'use strict';

import { directMessageManager } from './direct_message.mjs';
import { querySelectorWithAssertion } from '../utils.mjs';

/**
 * @typedef {import('../messages/message_types.mjs').PlayerInfo} PlayerInfo
 */

/**
 * Extends PlayerInfo to include their DOM element.
 * @typedef {PlayerInfo & {
 *   element: HTMLLIElement, // Player's element in the player list.
 * }} StoredPlayerInfo
 */

/**
 * Checks if two player info objects are equal.
 * @param {PlayerInfo} a
 * @param {PlayerInfo} b
 * @returns {boolean} True if the player info objects are equal, false otherwise.
 */
function playerInfoEquals(a, b) {
    return (
        a.playerId === b.playerId &&
        a.playerName === b.playerName &&
        a.playerDisplayName === b.playerDisplayName &&
        a.playerTextureUrl === b.playerTextureUrl
    );
}

const sidebarContainerElement = /** @type {HTMLDivElement} */ (
    querySelectorWithAssertion('#player-list-container')
);
const sidebarToggleElement = /** @type {HTMLImageElement} */ (
    querySelectorWithAssertion('#sidebar-toggle')
);

/**
 * Toggle the sidebar in mobile mode.
 * @param {boolean} [open] - Whether to open or close the sidebar. If not provided, the sidebar will be toggled.
 */
export function toggleSidebar(open = undefined) {
    const nowOpen = sidebarContainerElement.classList.toggle(
        'mobile-menu-open',
        open,
    );

    sidebarToggleElement.src = nowOpen
        ? 'img/heroicons/x-mark.svg'
        : 'img/heroicons/bars-3.svg';
    sidebarToggleElement.ariaLabel = nowOpen ? 'Close sidebar' : 'Open sidebar';
}

/**
 * Manages the player list UI component, handling player data storage, DOM updates and player head image caching.
 */
class PlayerList {
    /** @type {Map<string, StoredPlayerInfo>} */
    #players = new Map();

    /** @type {HTMLElement} */
    #playerListElement;

    /** @type {HTMLSpanElement} */
    #playerCountElement;

    /**
     * @param {HTMLElement} playerListElement
     * @param {HTMLSpanElement} playerCountElement
     */
    constructor(playerListElement, playerCountElement) {
        this.#playerListElement = playerListElement;
        this.#playerCountElement = playerCountElement;
    }

    /**
     * Updates the player list. Makes sure that player info is updated,
     * new players are added, and removed players are cleaned up.
     *
     * @param {PlayerInfo[]} newPlayerList - The new list of players.
     */
    updatePlayerList(newPlayerList) {
        if (!Array.isArray(newPlayerList)) {
            console.warn('Invalid player list data');
            return;
        }

        // Identify players that need to be updated or added.
        const updatedPlayers = newPlayerList.filter((player) => {
            if (!player.playerId || !player.playerName) {
                console.warn(`Invalid player data: ${JSON.stringify(player)}`);
                return false;
            }

            const existingPlayer = this.#players.get(player.playerId);
            if (!existingPlayer) {
                // We need to update if the player doesn't exist in the map.
                return true;
            }

            // We need to update if the player info has changed.
            return !playerInfoEquals(existingPlayer, player);
        });

        const removedPlayers = new Set(this.#players.keys());
        for (const player of newPlayerList) {
            removedPlayers.delete(player.playerId);
        }

        // Create a document fragment to hold the new elements.
        const fragment = document.createDocumentFragment();
        for (const player of updatedPlayers) {
            const existingPlayer = this.#players.get(player.playerId);
            const element = existingPlayer
                ? this.#updatePlayerElement(existingPlayer)
                : fragment.appendChild(this.#createPlayerElement(player));

            this.#players.set(player.playerId, {
                ...player,
                element,
            });
        }

        // Append all new elements to the DOM in one operation.
        if (fragment.childNodes.length > 0) {
            this.#playerListElement.appendChild(fragment);
        }

        // Remove players that are no longer in the list.
        for (const playerId of removedPlayers) {
            this.#removePlayerElement(playerId);
        }

        // Update the header with the player count
        this.#playerCountElement.textContent = `(${this.getPlayerCount()})`;
    }

    /**
     * Updates a player's DOM element.
     *
     * @param {StoredPlayerInfo} player - The player data to update.
     * @returns {HTMLLIElement} The updated element.
     */
    #updatePlayerElement(player) {
        // Update the existing element if properties have changed.
        const headContainer = /** @type {HTMLDivElement | null} */ (
            player.element.querySelector('.player-head-container')
        );
        if (headContainer) {
            headContainer.title = `${player.playerDisplayName}'s head`;
        }

        const headImg = /** @type {HTMLImageElement | null} */ (
            player.element.querySelector('.player-head')
        );
        if (headImg) {
            headImg.src = player.playerTextureUrl;
        }

        const headOverlay = /** @type {HTMLImageElement | null} */ (
            player.element.querySelector('.player-head-overlay')
        );
        if (headOverlay) {
            headOverlay.src = player.playerTextureUrl;
        }

        const nameSpan = /** @type {HTMLSpanElement | null} */ (
            player.element.querySelector('.player-name')
        );
        if (nameSpan) {
            nameSpan.textContent = player.playerDisplayName;
            nameSpan.title = player.playerName;
        }

        return player.element;
    }

    /**
     * Creates a new player element.
     * @param {PlayerInfo} player
     * @returns {HTMLLIElement}
     */
    #createPlayerElement(player) {
        // Create a new DOM element if none exists for the player.
        const playerElement = document.createElement('li');
        playerElement.setAttribute('role', 'listitem');
        playerElement.setAttribute('data-player-id', player.playerId);
        playerElement.title = `Chat with ${player.playerDisplayName}`;

        const headContainer = document.createElement('div');
        headContainer.className = 'player-head-container';
        headContainer.title = `${player.playerDisplayName}'s head`;

        // Create and configure the player's head image.
        const headImg = document.createElement('img');
        headImg.className = 'player-head';
        headImg.src = player.playerTextureUrl;
        headImg.setAttribute('aria-hidden', 'true');
        headImg.onerror = () => {
            headImg.src = '/img/steve.png';
        };
        headContainer.appendChild(headImg);

        const headOverlay = document.createElement('img');
        headOverlay.className = 'player-head-overlay';
        headOverlay.src = player.playerTextureUrl;
        headOverlay.setAttribute('aria-hidden', 'true');
        headOverlay.onerror = () => {
            headOverlay.src = '/img/steve.png';
        };
        headContainer.appendChild(headOverlay);

        // Create and configure the player's display name span.
        const nameSpan = document.createElement('span');
        nameSpan.className = 'player-name';
        nameSpan.textContent = player.playerDisplayName;

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

        const chatIcon = document.createElement('img');
        chatIcon.className = 'player-chat-icon';
        chatIcon.src = 'img/heroicons/chat-bubble-left-right.svg';

        playerElement.addEventListener('click', () => {
            /**
             * Selects a player and updates the chat icon.
             * @param {PlayerInfo} player
             */
            function selectPlayer(player) {
                toggleSidebar(false);
                directMessageManager.setPlayer(player, deselectPlayer);
                playerElement.setAttribute(
                    'aria-label',
                    'Stop chat with player',
                );
                playerElement.title = `Stop chat with ${player.playerDisplayName}`;
                chatIcon.style.display = 'block';
            }

            function deselectPlayer() {
                playerElement.setAttribute('aria-label', 'Chat with player');
                playerElement.title = `Chat with ${player.playerDisplayName}`;
                chatIcon.style.display = 'none';
            }

            const currentPlayer = directMessageManager.getPlayer();
            if (currentPlayer?.playerId === player.playerId) {
                directMessageManager.clearPlayer();
            } else {
                selectPlayer(player);
            }
        });

        // Assemble the player element.
        playerElement.appendChild(headContainer);
        playerElement.appendChild(nameSpan);
        playerElement.appendChild(chatIcon);

        return playerElement;
    }

    /**
     * Removes a player's DOM element and cleans up the map entry.
     *
     * @param {string} playerId - The ID of the player to remove.
     */
    #removePlayerElement(playerId) {
        const player = this.#players.get(playerId);
        if (!player || !player.element) {
            return;
        }

        player.element.remove(); // Remove the element from the DOM.
        this.#players.delete(playerId); // Remove the player from the map.
    }

    /**
     * Removes all players and clears the DOM.
     */
    clearAll() {
        // Get all player IDs first since we'll be modifying the map while iterating
        const playerIds = Array.from(this.#players.keys());

        for (const playerId of playerIds) {
            this.#removePlayerElement(playerId);
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
     * Retrieves a player's data by their name.
     *
     * @param {string} playerName - The name of the player to retrieve.
     * @returns {StoredPlayerInfo|null} The player's data, or null if not found.
     */
    getPlayerByName(playerName) {
        for (const player of this.#players.values()) {
            if (player.playerName.toLowerCase() === playerName.toLowerCase()) {
                return player;
            }
        }

        return null;
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
const playerListElement = /** @type {HTMLUListElement} */ (
    querySelectorWithAssertion('#player-list')
);
const playerCountElement = /** @type {HTMLSpanElement} */ (
    querySelectorWithAssertion('#player-count')
);

export const playerList = new PlayerList(playerListElement, playerCountElement);
