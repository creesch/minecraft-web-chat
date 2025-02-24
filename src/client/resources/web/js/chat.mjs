// @ts-check
'use strict';

import { querySelectorWithAssertion, formatTimestamp } from './utils.mjs';
import {
    assertIsComponent,
    ComponentError,
    formatChatMessage,
    initializeObfuscation,
} from './messages/message_parsing.mjs';
import { serverInfo } from './managers/server_info.mjs';
import { playerList } from './managers/player_list.mjs';
import { parseModServerMessage } from './messages/message_types.mjs';
import { faviconManager } from './managers/favicon_manager.mjs';
import { tabListManager } from './managers/tab_list_manager.mjs';

/**
 * Import all types we might need
 * @typedef {import('./messages/message_parsing.mjs').Component} Component
 * @typedef {import('./messages/message_types.mjs').ChatMessage} ChatMessage
 * @typedef {import('./messages/message_types.mjs').HistoryMetaData} HistoryMetaData
 * @typedef {import('./messages/message_types.mjs').PlayerInfo} PlayerInfo
 * @typedef {import('./messages/message_types.mjs').ServerConnectionState} ServerConnectionState
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

// Used to keep track of messages already shown. To prevent possible duplication on server join.
/** @type {Set<string>} */
const displayedMessageIds = new Set();

/**
 * ======================
 *  HTML elements
 * ======================
 */

const statusContainerElement = /** @type {HTMLDivElement} */ (
    querySelectorWithAssertion('#status')
);
const statusTextElement = /** @type {HTMLSpanElement} */ (
    querySelectorWithAssertion('#status .connection-status')
);

const messagesElement = /** @type {HTMLElement} */ (
    querySelectorWithAssertion('#messages')
);
const loadMoreContainerElement = /** @type {HTMLDivElement} */ (
    querySelectorWithAssertion('#load-more-container')
);
const loadMoreButtonElement = /** @type {HTMLButtonElement} */ (
    querySelectorWithAssertion('#load-more-button')
);

const inputAlertElement = /** @type {HTMLDivElement} */ (
    querySelectorWithAssertion('#input-alert')
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

// Clicked send button
messageSendButtonElement.addEventListener('click', () => {
    sendChatMessage();
});

// Focus input on load
chatInputElement.focus();

chatInputElement.addEventListener('keydown', function (e) {
    setChatInputError(false);

    if (tabListManager.visible()) {
        tabListManager.handleInputKeydown(e);
        return;
    }

    switch (e.key) {
        case 'Escape':
            chatInputElement.blur();
            return;
        case 'Tab':
            e.preventDefault();
            tabListManager.openTabList(playerList.getAllPlayers());
            return;
        case 'Enter':
            e.preventDefault();
            sendChatMessage();
            return;
    }
});

chatInputElement.addEventListener('input', function () {
    tabListManager.hide();
    setChatInputError(false);
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

    faviconManager.handleNewMessage(
        message.payload.isPing,
        message.payload.history,
    );

    requestAnimationFrame(() => {
        const messageElement = document.createElement('article');
        messageElement.classList.add('message');

        if (message.payload.isPing) {
            messageElement.classList.add('ping');
        }

        // Create timestamp outside of try block. That way errors can be timestamped as well for the moment they did happen.
        const { timeString, fullDateTime } = formatTimestamp(message.timestamp);
        const timeElement = document.createElement('time');
        timeElement.dateTime = new Date(message.timestamp).toISOString();
        timeElement.textContent = timeString;
        timeElement.title = fullDateTime;
        timeElement.className = 'message-time';
        messageElement.appendChild(timeElement);

        try {
            // Format the chat message - this uses the Component format from message_parsing
            assertIsComponent(message.payload.component);
            const chatContent = formatChatMessage(
                message.payload.component,
                message.payload.translations,
            );
            messageElement.appendChild(chatContent);
        } catch (e) {
            console.error(message);
            if (e instanceof ComponentError) {
                console.error('Invalid component:', e.toString());
                messageElement.appendChild(
                    formatChatMessage(
                        {
                            text: 'Invalid message received from server',
                            color: 'red',
                        },
                        {},
                    ),
                );
            } else {
                console.error('Error parsing message:', e);
                messageElement.appendChild(
                    formatChatMessage(
                        {
                            text: 'Error parsing message',
                            color: 'red',
                        },
                        {},
                    ),
                );
            }
        }

        // Storing raw scroll value. To be used to fix the scroll position down the line.
        const scrolledFromTop = messagesElement.scrollTop;

        if (message.payload.history) {
            // Insert the message after the load-more button
            loadMoreContainerElement.before(messageElement);
        } else {
            // For new messages, insert at the start
            messagesElement.insertBefore(
                messageElement,
                messagesElement.firstChild,
            );
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

    ws.onmessage = function (event) {
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
                    playerList.updatePlayerList(message.payload);
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

/**
 * Set the chat input error state
 * @param {boolean} isError
 */
function setChatInputError(isError) {
    const span = inputAlertElement.querySelector('span');
    if (!span) {
        return;
    }

    if (isError) {
        chatInputElement.classList.add('error');
        chatInputElement.ariaInvalid = 'true';
        inputAlertElement.style.display = 'flex';
        inputAlertElement.ariaHidden = 'false';
        span.textContent =
            'Only /tell, /msg, /w and /me commands are supported.';
    } else {
        chatInputElement.classList.remove('error');
        chatInputElement.ariaInvalid = 'false';
        inputAlertElement.style.display = 'none';
        inputAlertElement.ariaHidden = 'true';
        span.textContent = '';
    }
}

function sendChatMessage() {
    const message = chatInputElement.value;
    if (!message.trim()) {
        return;
    }

    if (message.startsWith('/')) {
        if (!/^\/(tell|msg|w|me)(\s.*|$)/.test(message)) {
            setChatInputError(true);
            return;
        }
    }

    console.log(`Sending chat message: ${message}`);

    sendWebsocketMessage('chat', message);
    chatInputElement.value = '';
}

/**
 * ======================
 *  Init
 * ======================
 */

connect();
initializeObfuscation();
