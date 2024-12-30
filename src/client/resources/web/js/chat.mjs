// @ts-check
'use strict';

import {
    updateFavicon,
    formatTimestamp,
    getPlayerHead,
    STEVE_HEAD_BASE64,
} from './util.mjs';
import {
    assertIsComponent,
    ComponentError,
    formatComponent,
    initializeObfuscation,
} from './message_parsing.mjs';
import { parseModServerMessage } from './message_types.mjs';

/**
 * Import all types we might need
 * @typedef {import('./message_parsing.mjs').Component} Component
 * @typedef {import('./message_types.mjs').ChatMessage} ChatMessage
 * @typedef {import('./message_types.mjs').HistoryMetaData} HistoryMetaData
 * @typedef {import('./message_types.mjs').PlayerInfo} PlayerInfo
 * @typedef {import('./message_types.mjs').ServerConnectionState} ServerConnectionState
 */

/**
 * ======================
 *  Constants & Globals
 * ======================
 */

// WebSocket Management
/** @type {number} */
const maxReconnectAttempts = 300; // TODO: add a reconnect button after automatic retries are done.
/** @type {WebSocket | null} */
let ws = null;
/** @type {number} */
let reconnectAttempts = 0;

// Message History Management
const messageHistoryLimit = 50;
let isLoadingHistory = false;

const faviconInfo = {
    messageCount: 0,
    hasPing: false,

    clear() {
        this.messageCount = 0;
        this.hasPing = false;
        updateFavicon(this.messageCount, this.hasPing);
    },

    /**
     * Update the favicon
     * @param {number} messageCount
     * @param {boolean} hasPing
     */
    update(messageCount, hasPing) {
        this.messageCount = messageCount;
        this.hasPing = hasPing;

        updateFavicon(this.messageCount, this.hasPing);
    },

    getMessageCount() {
        return this.messageCount;
    },

    getHasPing() {
        return this.hasPing;
    },
};

// Used to keep track of messages already shown. To prevent possible duplication on server join.
/** @type {Set<string>} */
const displayedMessageIds = new Set();

/**
 * Server information and related methods.
 */
const serverInfo = {
    name: /** @type {string | undefined} */ (undefined),
    id: /** @type {string | undefined} */ (undefined),
    baseTitle: document.title, // Store the page title on load so we can manipulate it based on events and always restore it.

    /**
     * Updates server information and UI elements.
     * @param {string} name - The server's name.
     * @param {string} id - The server's identifier.
     */
    update(name, id) {
        if (!name || !id) {
            console.error(
                'Invalid server information: Both name and id must be provided.',
            );
            return;
        }

        this.name = name;
        this.id = id;

        // Update the page title
        document.title = `${this.baseTitle} - ${name}`;

        // Update the status element
        serverNameElement.textContent = name;
    },

    /**
     * Clears the current server information from both variables and UI.
     */
    clear() {
        this.name = undefined;
        this.id = undefined;
        document.title = this.baseTitle;
        serverNameElement.textContent = 'No server';
    },

    /**
     * Retrieves the server's ID.
     * @returns {string | undefined} The server's ID.
     */
    getId() {
        return this.id;
    },

    /**
     * Retrieves the server's name.
     * @returns {string | undefined} The server's name.
     */
    getName() {
        return this.name;
    },
};

/**
 * Player list
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

/**
 * Creates a player list manager that handles both data storage and DOM updates.
 * @param {HTMLElement} listContainer - The container element where player elements will be rendered.
 * @returns {PlayerListManager} An object with methods to manage the player list.
 */
const createPlayerList = (listContainer) => {
    /**
     * Flag to indicate if an update is in progress if set to true updating will be skipped.
     * This shouldn't be too big of an issue once the initial playerlist is created as updates will be send every few seconds.
     */
    let isUpdating = false;

    return {
        /** @type {Map<string, StoredPlayerInfo>} */
        players: new Map(),

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

            if (isUpdating) {
                // Note: due to the use of requestAnimationFrame this will happen more often when a tab is in the background.
                // Updates will pick up again once the tab is in focus.
                console.warn('Update already in progress');
                return;
            }
            isUpdating = true;

            try {
                const currentPlayers = new Set(this.players.keys());

                // Identify players that need to be updated or added.
                const playersNeedingUpdate = newPlayerList.filter((player) => {
                    if (!player.playerId || !player.playerName) {
                        console.warn(
                            `Invalid player data: ${JSON.stringify(player)}`,
                        );
                        return false;
                    }

                    const existingPlayer = this.players.get(player.playerId);

                    // Conditions for requiring an update:
                    // 1. Player does not exist in the map
                    // 2. Player name, display name, or texture URL has changed. Note: It seems unlikely this happens with vanilla servers. Just accounting for potential modded servers.
                    return (
                        !existingPlayer ||
                        existingPlayer.playerName !== player.playerName ||
                        existingPlayer.playerDisplayName !==
                            player.playerDisplayName ||
                        existingPlayer.playerTextureUrl !==
                            player.playerTextureUrl
                    );
                });

                for (const player of newPlayerList) {
                    currentPlayers.delete(player.playerId);
                }

                // Fetch or reuse player head images. Using promises for parallel processing.
                const fetchPromises = playersNeedingUpdate.map(
                    async (player) => {
                        const existingPlayer = this.players.get(
                            player.playerId,
                        );

                        if (
                            existingPlayer &&
                            existingPlayer.playerTextureUrl ===
                                player.playerTextureUrl
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
                            console.log(playerHead);
                            console.log(player);
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
                    },
                );

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
                                const existingPlayer = this.players.get(
                                    player.playerId,
                                );
                                const element = this.updatePlayerElement(
                                    player,
                                    existingPlayer,
                                );

                                // Store the updated player data in the map.
                                this.players.set(player.playerId, player);

                                // Add new elements to the document fragment.
                                if (element) {
                                    fragment.appendChild(element);
                                }
                            }

                            // Append all new elements to the DOM in one operation.
                            if (fragment.childNodes.length > 0) {
                                listContainer.appendChild(fragment);
                            }

                            // Remove players that are no longer in the list.
                            for (const playerId of currentPlayers) {
                                this.removePlayerElement(playerId);
                            }

                            // Update the header with the player count
                            playerListCountElement.textContent = `(${this.getPlayerCount()})`;

                            resolve(); // Mark the update process as complete.
                        });
                    },
                );
            } finally {
                isUpdating = false;
            }
        },

        /**
         * Creates or updates a player's DOM element.
         *
         * @param {StoredPlayerInfo} player - The player data to update.
         * @param {StoredPlayerInfo} [existingPlayer] - The previous state of the player (if any).
         * @returns {HTMLElement|null} Returns the element if newly created, null if updated.
         */
        updatePlayerElement(player, existingPlayer) {
            let playerElement = player.element;

            if (!playerElement) {
                // Create a new DOM element if none exists for the player.
                playerElement = document.createElement('li');
                playerElement.setAttribute('data-player-id', player.playerId);

                // Create and configure the player's head image.
                const headImg = document.createElement('img');
                headImg.className = 'player-head';
                headImg.src = player.playerHead || STEVE_HEAD_BASE64;
                headImg.alt = `${player.playerDisplayName}'s head`;

                // Create and configure the player's display name span.
                const nameSpan = document.createElement('span');
                nameSpan.className = 'player-name';
                nameSpan.textContent = player.playerDisplayName;
                nameSpan.title = player.playerName;

                // Add click event to insert the player name into the chat input
                const playerClickHandler = () => {
                    const cursorPos = chatInputElement.selectionStart;
                    const textBefore = chatInputElement.value.substring(
                        0,
                        cursorPos,
                    );
                    const textAfter =
                        chatInputElement.value.substring(cursorPos);
                    chatInputElement.value = `${textBefore}${player.playerDisplayName}${textAfter}`;
                    chatInputElement.focus();
                    chatInputElement.selectionStart =
                        chatInputElement.selectionEnd =
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
                    existingPlayer?.playerDisplayName !==
                    player.playerDisplayName
                ) {
                    nameSpan.textContent = player.playerDisplayName;
                }

                if (existingPlayer?.playerName !== player.playerName) {
                    nameSpan.title = player.playerName;
                }
            }

            // No new element created. Any updates to the existing element have been done. So return null.
            return null;
        },

        /**
         * Removes a player's DOM element and cleans up the map entry.
         *
         * @param {string} playerId - The ID of the player to remove.
         */
        removePlayerElement(playerId) {
            const player = this.players.get(playerId);
            if (player && player.element) {
                if (player.playerClickHandler) {
                    player.element.removeEventListener(
                        'click',
                        player.playerClickHandler,
                    );
                    delete player.playerClickHandler; // Remove the reference to the handler
                }

                player.element.remove(); // Remove the element from the DOM.
                player.element = null; // Clear the cached reference to the element.
                this.players.delete(playerId); // Remove the player from the map.
            }
        },

        /**
         * Removes all players and clears the DOM.
         */
        clearAll() {
            // Remove all DOM elements.
            for (const player of this.players.values()) {
                if (player.element) {
                    if (player.playerClickHandler) {
                        player.element.removeEventListener(
                            'click',
                            player.playerClickHandler,
                        );
                        delete player.playerClickHandler; // Remove the reference to the handler
                    }

                    player.element.remove();
                    player.element = null;
                }
            }

            // Reset the player count header
            playerListCountElement.textContent = '(0)';

            // Clear the map of players.
            this.players.clear();
        },

        /**
         * Retrieves a player's data by their ID.
         *
         * @param {string} playerId - The ID of the player to retrieve.
         * @returns {StoredPlayerInfo|null} The player's data, or null if not found.
         */
        getPlayer(playerId) {
            return this.players.get(playerId) || null;
        },

        /**
         * Retrieves all players as an array.
         *
         * @returns {StoredPlayerInfo[]} An array of all players' data.
         */
        getAllPlayers() {
            return Array.from(this.players.values());
        },

        /**
         * Retrieves the total number of players.
         *
         * @returns {number} The total player count.
         */
        getPlayerCount() {
            return this.players.size;
        },
    };
};

/**
 * ======================
 *  HTML elements
 * ======================
 */

/**
 * Gets element based on selector. Throws error if element is null.
 * @param {string} selector
 */
function querySelectorWithAssertion(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        throw new Error(`Required DOM element not found: ${selector}`);
    }
    return element;
}

const statusContainerElement = /** @type {HTMLDivElement } */ (
    querySelectorWithAssertion('#status')
);
const statusTextElement = /** @type {HTMLSpanElement} */ (
    querySelectorWithAssertion('#status .connection-status')
);
const serverNameElement = /** @type {HTMLSpanElement} */ (
    querySelectorWithAssertion('#status .server-name')
);

const playerListElement = /** @type {HTMLDivElement } */ (
    querySelectorWithAssertion('#player-list')
);
const playerListCountElement = /** @type {HTMLHeadingElement} */ (
    querySelectorWithAssertion('#player-count')
);

const messagesElement = /** @type {HTMLDivElement} */ (
    querySelectorWithAssertion('#messages')
);
const loadMoreContainerElement = /** @type {HTMLDivElement} */ (
    querySelectorWithAssertion('#load-more-container')
);
const loadMoreButtonElement = /** @type {HTMLButtonElement } */ (
    querySelectorWithAssertion('#load-more-button')
);

const chatInputElement = /** @type {HTMLTextAreaElement} */ (
    querySelectorWithAssertion('#message-input')
);
const messageSendButtonElement = /** @type {HTMLButtonElement} */ (
    querySelectorWithAssertion('#message-send-button')
);

/**
 * ======================
 *  Event listeners and handlers
 * ======================
 */

// Favicon updates if tab is not in focus
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        faviconInfo.clear();
    }
});

// Clicked send button
messageSendButtonElement.addEventListener('click', () => {
    sendChatMessage();
});

// Focus input on load
chatInputElement.focus();

// Allow Enter key to send messages
chatInputElement.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendChatMessage();
    }
});

// Load more button clicked
loadMoreButtonElement.addEventListener('click', () => {
    // No matter what, always hide the element.
    loadMoreContainerElement.style.display = 'none';

    // If set to true it means we haven't received new history meta data yet.
    if (isLoadingHistory) {
        return;
    }

    // Make sure we have a number and everything.
    const maybeTimestamp = Number(
        loadMoreContainerElement.dataset['oldestMessageTimestamp'] ?? '',
    );
    if (isFinite(maybeTimestamp)) {
        requestHistory(messageHistoryLimit, maybeTimestamp);
    }
});

/**
 * ======================
 *  Chat related functions
 * ======================
 */

/**
 * Request chat history from the server
 * @param {number} limit
 * @param {number} [before]
 */
function requestHistory(limit, before) {
    if (isLoadingHistory) {
        console.log('Already loading history, skipping request.');
        return;
    }

    // Probably disconnected, do nothing.
    const serverId = serverInfo.getId();
    if (!serverId) {
        return;
    }

    isLoadingHistory = true;

    sendWebsocketMessage('history', {
        serverId,
        limit,
        before,
    });
}

/**
 * Handle minecraft chat messages
 * @param {ChatMessage} message
 */
function handleChatMessage(message) {
    // Skip if we've already seen this message
    if (displayedMessageIds.has(message.payload.uuid)) {
        return;
    }

    displayedMessageIds.add(message.payload.uuid);

    if (document.visibilityState !== 'visible') {
        let hasPing = faviconInfo.getHasPing();
        if (!message.payload.history) {
            hasPing ||= message.payload.isPing;
        }

        faviconInfo.update(faviconInfo.getMessageCount() + 1, hasPing);
    }

    requestAnimationFrame(() => {
        const div = document.createElement('div');
        div.classList.add('message');
        if (message.payload.isPing) {
            div.classList.add('ping');
        }

        // Create timestamp outside of try block. That way errors can be timestamped as well for the moment they did happen.
        const { timeString, fullDateTime } = formatTimestamp(message.timestamp);
        const timeElement = document.createElement('time');
        timeElement.dateTime = new Date(message.timestamp).toISOString();
        timeElement.textContent = timeString;
        timeElement.title = fullDateTime;
        timeElement.className = 'message-time';
        div.appendChild(timeElement);

        try {
            // Format the chat message - this uses the Component format from message_parsing
            assertIsComponent(message.payload.component);
            const chatContent = formatComponent(message.payload.component);
            div.appendChild(chatContent);
        } catch (e) {
            console.error(message);
            if (e instanceof ComponentError) {
                console.error('Invalid component:', e.toString());
                div.appendChild(
                    formatComponent({
                        text: 'Invalid message received from server',
                        color: 'red',
                    }),
                );
            } else {
                console.error('Error parsing message:', e);
                div.appendChild(
                    formatComponent({
                        text: 'Error parsing message',
                        color: 'red',
                    }),
                );
            }
        }

        // Storing raw scroll value. To be used to fix the scroll position down the line.
        const scrolledFromTop = messagesElement.scrollTop;

        if (message.payload.history) {
            // Insert the message after the load-more button
            loadMoreContainerElement.before(div);
        } else {
            // For new messages, insert at the start
            messagesElement.insertBefore(div, messagesElement.firstChild);
        }

        // If it is due to the flex column reverse or something else, once the user has scrolled it doesn't "lock" at the bottom.
        // Let's fix that, if the user was near the bottom when a message was inserted we put them back there.
        // Note: the values appear negative due to the flex column shenigans.
        if (scrolledFromTop <= 1 && scrolledFromTop >= -35) {
            messagesElement.scrollTop = 0;
        }
    });
}

function clearMessageHistory() {
    console.log('clearing history.');
    // empty previously seen messages.
    displayedMessageIds.clear();
    // Reset the load more button
    loadMoreContainerElement.style.display = 'none';
    loadMoreContainerElement.dataset['oldestMessageTimestamp'] = '';

    // Only remove messages, leaving the load more button alone.
    const messageElements = messagesElement.querySelectorAll('.message');
    messageElements.forEach((element) => {
        element.remove();
    });
}

/**
 * Handle history meta data
 * @param {HistoryMetaData} message
 */
function handleHistoryMetaData(message) {
    isLoadingHistory = false;

    if (message.payload.moreHistoryAvailable) {
        loadMoreContainerElement.dataset['oldestMessageTimestamp'] =
            message.payload.oldestMessageTimestamp.toString();
        // Show button after delay so people can't spam it and cause issue.
        setTimeout(() => {
            loadMoreContainerElement.style.display = 'block';
        }, 200);
    } else {
        loadMoreContainerElement.style.display = 'none';
    }
}

/**
 * Handle different minecraft server connection states
 * @param {ServerConnectionState} message
 */
function handleMinecraftServerConnectionState(message) {
    switch (message.payload) {
        case 'init':
            // Note: Initially used to clear messageHistory. As it turns out init events can also happen when already on a server.
            // Leaving this message in for potential debugging purposes because it can indicate minecraft server or connection issues.
            console.log('Received init event. It is something, init?');
            break;
        case 'join':
            console.log('Received join event. Welcome welcome!');

            // First clear whatever is in history as well as the player list so the slate is clean.
            // Note: the join event often comes after the client already received messages.
            // This is not a problem as they are stored in the message history and will loaded again once history is requested.
            // The player list is also send every few seconds so this is also not an issue.
            // Doing it in a different way would make things more complex than needed.
            playerList.clearAll();
            clearMessageHistory();

            // Then we update server info.
            serverInfo.update(message.server.name, message.server.identifier);

            // Finally request message history
            requestHistory(messageHistoryLimit);

            break;
        case 'disconnect':
            console.log('Received disconnect event. Sad to see you go.');
            serverInfo.clear();
            break;
    }
}

/**
 * ======================
 *  Websocket related functions
 * ======================
 */

/**
 * Update status elements
 * @param {'connected' | 'disconnected' | 'error'} connectionStatus
 */
function updateWebsocketConnectionStatus(connectionStatus) {
    // Update connection status if provided
    if (connectionStatus) {
        switch (connectionStatus) {
            case 'connected':
                statusContainerElement.className = 'status-connected';
                statusTextElement.textContent = 'Connected';
                break;
            case 'disconnected':
                serverInfo.clear();
                statusContainerElement.className = 'status-disconnected';
                statusTextElement.textContent = 'Disconnected';
                break;
            case 'error':
                serverInfo.clear();
                statusContainerElement.className = 'status-disconnected';
                statusTextElement.textContent = 'Error: see browser console';
                break;
        }
    }
}

function connect() {
    ws = new WebSocket(`ws://${location.host}/chat`);

    ws.onopen = function () {
        console.log('Connected to websocket server');
        updateWebsocketConnectionStatus('connected');
        reconnectAttempts = 0; // Reset attempts
    };

    ws.onclose = function () {
        console.log('Websocket connection closed. Attempting to reconnect...');
        updateWebsocketConnectionStatus('disconnected');

        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            setTimeout(connect, 2000);
        }
    };

    ws.onerror = function (error) {
        console.error('WebSocket error:', error);
        updateWebsocketConnectionStatus('error');
    };

    ws.onmessage = async function (event) {
        /** @type {string} */
        const rawJson = event.data;
        console.log('Got websocket message:', rawJson);
        try {
            const message = parseModServerMessage(rawJson);
            switch (message.type) {
                case 'chatMessage':
                    handleChatMessage(message);
                    break;
                case 'historyMetaData':
                    handleHistoryMetaData(message);
                    break;
                case 'serverConnectionState':
                    handleMinecraftServerConnectionState(message);
                    break;
                case 'serverPlayerList':
                    await playerList.updatePlayerList(message.payload);
            }
        } catch (e) {
            console.error('Error processing message:', e);
        }
    };
}

/**
 * History request parameters
 * @typedef {Object} HistoryRequest
 * @property {string} serverId - Unix timestamp
 * @property {number} limit - Number of messages to return
 * @property {number} [before] - Message ID to fetch history before
 */

/**
 * Send a message back to minecraft.
 * @param {'chat' | 'history' } type
 * @param {string | HistoryRequest} payload
 */
function sendWebsocketMessage(type, payload) {
    if (ws?.readyState !== WebSocket.OPEN) {
        console.log('WebSocket is not connected');
        updateWebsocketConnectionStatus('disconnected');
        return;
    }

    ws.send(
        JSON.stringify({
            type,
            payload,
        }),
    );
}

function sendChatMessage() {
    if (!chatInputElement.value.trim()) {
        return;
    }
    console.log(`Sending chat message: ${chatInputElement.value}`);

    sendWebsocketMessage('chat', chatInputElement.value);
    chatInputElement.value = '';
}

/**
 * ======================
 *  Init
 * ======================
 */

connect();
initializeObfuscation();
const playerList = createPlayerList(playerListElement);
