// @ts-check
'use strict';

import { faviconCounter, formatTimestamp } from './util.mjs';
import { assertIsComponent, ComponentError, formatComponent, initializeObfuscation } from './message_parsing.mjs';
import { parseModServerMessage } from './message_types.mjs';
/** @typedef {import('./message_parsing.mjs').Component} Component */

/** @type {WebSocket | null} */
let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 300; // TODO: add a reconnect button after automatic retries are done.

// Store the page title on load so we can manipulate it based on events and always restore it.
const baseTitle = document.title;

// Used for the favicon
let messageCount = 0;

// Used to keep track of messages already shown. To prevent possible duplication on server join.
/** @type {Set<string>} */
const displayedMessageIds = new Set();

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        messageCount = 0;
        faviconCounter(0);
    }
});


/**
 * Add a message to chat
 * @param {Component} chatComponent
 * @param {number} timestamp
 */
function displayChatMessage(chatComponent, timestamp, history = false) {
    requestAnimationFrame(() => {
        const div = document.createElement('div');
        div.className = 'message';

        // Create timestamp outside of try block. That way errors can be timestamped as well for the moment they did happen.
        const { timeString, fullDateTime } = formatTimestamp(timestamp);
        const timeElement = document.createElement('time');
        timeElement.dateTime = new Date(timestamp).toISOString();
        timeElement.textContent = timeString;
        timeElement.title = fullDateTime;
        timeElement.className = 'message-time';
        div.appendChild(timeElement);

        try {
            // Format the chat message - this uses the Component format from message_parsing
            const chatContent = formatComponent(chatComponent);
            div.appendChild(chatContent);
        } catch (e) {
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

        const messages = /** @type {HTMLDivElement | null} */ (document.getElementById('messages'));
        if (!messages) {
            return;
        }

        // Starting with naive approach
        if (history) {
            messages.appendChild(div);
        } else {
            messages.insertBefore(div, messages.firstChild);
        }
    });
}

/**
 * Update status elements
 * @param {'connected' | 'disconnected' | 'error'} connectionStatus
 */
function updateConnectionStatus(connectionStatus) {
    const statusContainer = /** @type {HTMLDivElement | null} */ (document.getElementById('status'));
    const statusText = /** @type {HTMLSpanElement | null} */ (document.querySelector('#status .connection-status'));


    if (!statusContainer || !statusText) {
        return;
    }

    // Update connection status if provided
    if (connectionStatus) {
        switch (connectionStatus) {
            case 'connected':
                statusContainer.className = 'status-connected';
                statusText.textContent = 'Connected';
                break;
            case 'disconnected':
                statusContainer.className = 'status-disconnected';
                statusText.textContent = 'Disconnected';
                break;
            case 'error':
                statusContainer.className = 'status-disconnected';
                statusText.textContent = 'Error: see browser console';
                break;
        }
    }
}

/**
 * Update server name value in status element and page title with
 * @param {String} [addition=null]
 */
function updateServerName(addition) {
    document.title = addition ? `${baseTitle} - ${addition}` : baseTitle;

    const serverNameElement = /** @type {HTMLSpanElement | null} */ (document.querySelector('#status .server-name'));
    if (!serverNameElement) {
        return;
    }
    serverNameElement.textContent = addition ? ` to ${addition}` : 'No server';
}


function connect() {
    ws = new WebSocket(`ws://${location.host}/chat`);

    ws.onopen = function () {
        console.log('Connected to server');
        updateConnectionStatus('connected');
    };

    ws.onclose = function () {
        updateConnectionStatus('disconnected');
        console.log('Connection closed. Attempting to reconnect...');

        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            setTimeout(connect, 2000);
        }
    };

    ws.onerror = function (error) {
        console.error('WebSocket error:', error);
        updateConnectionStatus('error');
    };

    ws.onmessage = function (event) {
        if (document.visibilityState !== 'visible') {
            messageCount++;
            faviconCounter(messageCount);
        }

        /** @type {string} */
        const rawJson = event.data;
        console.log(rawJson);
        try {
            const message = parseModServerMessage(rawJson);
            // For now we only handle chat messages
            if (message.type === 'chatMessage') {
                // Skip if we've already seen this message
                if (displayedMessageIds.has(message.payload.uuid)) {
                    return;
                }
                displayedMessageIds.add(message.payload.uuid);
                displayChatMessage(message.payload.component, message.timestamp, message.payload.history);
            }
            if (message.type === 'serverConnectionState') {
                switch (message.payload) {
                    case 'init':
                        // TODO: got to clear message history here.
                        console.log('it is something, init?');
                        break;
                    case 'join':
                        // TODO: Request history
                        // TODO: update server indicator somewhere. at the very least update page title to include server name.
                        console.log('welcome welcome!');
                        updateServerName(message.server.name);
                        break;
                    case 'disconnect':
                        // TODO:
                        console.log('sad to see you go');

                        // Clear title
                        updateServerName();
                        break;
                }
                console.log(message);
            }
        } catch (e) {
            console.error('Error processing message:', e);
        }
    };
}

function sendMessage() {
    const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('messageInput'));
    if (!input) {
        return;
    }

    console.log(ws);
    console.log(ws?.readyState);
    console.log(input.value);
    if (ws && ws.readyState === WebSocket.OPEN && input.value.trim()) {
        ws.send(input.value);
        input.value = '';
    } else if (!input.value.trim()) {
        return;
    } else {
        console.log('WebSocket is not connected');
        const status = /** @type {HTMLDivElement | null} */ (document.getElementById('status'));
        if (!status) {
            return;
        }

        status.textContent = 'Not connected - message not sent';
        status.className = 'status-disconnected';
    }
}

// Start connection and load stored messages when page loads
connect();
initializeObfuscation();

// Allow Enter key to send messages
const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('messageInput'));
if (input) {
    // Focus input on load
    input.focus();

    input.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendMessage();
        }
    });
}
