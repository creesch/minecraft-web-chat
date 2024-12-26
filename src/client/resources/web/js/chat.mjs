// @ts-check
'use strict';

import { updateFavicon, formatTimestamp } from './util.mjs';
import { assertIsComponent, ComponentError, formatComponent, initializeObfuscation } from './message_parsing.mjs';
import { parseModServerMessage } from './message_types.mjs';

/**
 * Import all types we might need
 * @typedef {import('./message_parsing.mjs').Component} Component
 * @typedef {import('./message_types.mjs').ChatMessage} ChatMessage
 * @typedef {import('./message_types.mjs').HistoryMetaData} HistoryMetaData
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

// Used for the favicon
let messageCount = 0;
let hasPing = false;

// Used to keep track of messages already shown. To prevent possible duplication on server join.
/** @type {Set<string>} */
const displayedMessageIds = new Set();

/**
 * Server information and related methods.
 * @type {{
 *   name: string | undefined;
 *   id: string | undefined;
 *   baseTitle: string;
 *   update: (name: string , id: string) => void;
 *   clear: () => void;
 *   getId: () => string | undefined;
 *   getName: () => string | undefined;
 * }}
 */
const serverInfo = {
    name: undefined,
    id: undefined,
    baseTitle: document.title, // Store the page title on load so we can manipulate it based on events and always restore it.

    /**
     * Updates server information and UI elements.
     * @param {string} name - The server's name.
     * @param {string} id - The server's identifier.
     */
    update(name, id) {
        if (!name || !id) {
            console.error('Invalid server information: Both name and id must be provided.');
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
    }
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

const statusContainerElement = /** @type {HTMLDivElement } */ (querySelectorWithAssertion('#status'));
const statusTextElement = /** @type {HTMLSpanElement} */ (querySelectorWithAssertion('#status .connection-status'));
const serverNameElement = /** @type {HTMLSpanElement} */ (querySelectorWithAssertion('#status .server-name'));

const messagesElement = /** @type {HTMLDivElement} */ (querySelectorWithAssertion('#messages'));
const loadMoreContainerElement = /** @type {HTMLDivElement} */ (querySelectorWithAssertion('#load-more-container'));
const loadMoreButtonElement = /** @type {HTMLButtonElement } */ (querySelectorWithAssertion('#load-more-button'));

const chatInputElement = /** @type {HTMLTextAreaElement} */ (querySelectorWithAssertion('#message-input'));
const messageSendButtonElement = /** @type {HTMLButtonElement} */ (querySelectorWithAssertion('#message-send-button'));


/**
 * ======================
 *  Event listeners and handlers
 * ======================
 */

// Favicon updates if tab is not in focus
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        messageCount = 0;
        hasPing = false;
        updateFavicon(0, false);
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
   const maybeTimestamp = Number(loadMoreContainerElement.dataset['oldestMessageTimestamp'] ?? '');
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
        before
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
        messageCount++;
        hasPing = hasPing || message.payload.isPing;
        updateFavicon(messageCount, hasPing);
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
                    })
                );
            } else {
                console.error('Error parsing message:', e);
                div.appendChild(
                    formatComponent({
                        text: 'Error parsing message',
                        color: 'red',
                    })
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
    messageElements.forEach(element => {
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
        loadMoreContainerElement.dataset['oldestMessageTimestamp'] = message.payload.oldestMessageTimestamp.toString();
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

            // First clear whatever is in history so the slate is clean.
            // Note: the join event often comes after the client already received messages.
            // This is not a problem as they are stored in the message history and will loaded again once history is requested.
            // Doing it in a different way would make things more complex than needed.
            clearMessageHistory();

            // Then we update server info.
            serverInfo.update(message.server.name, message.server.identifier)

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

    ws.onmessage = function (event) {
        /** @type {string} */
        const rawJson = event.data;
        console.log('Got websocket message:', rawJson);
        try {
            const message = parseModServerMessage(rawJson);
            switch(message.type) {
                case 'chatMessage':
                    handleChatMessage(message);
                    break;
                case 'historyMetaData':
                    handleHistoryMetaData(message);
                    break;
                case 'serverConnectionState':
                    handleMinecraftServerConnectionState(message);
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

    ws.send(JSON.stringify({
        type,
        payload
    }));
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
