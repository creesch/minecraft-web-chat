// @ts-check
'use strict';

import { faviconCounter } from './util.mjs';
import { assertIsComponent, ComponentError, formatComponent, initializeObfuscation } from './message_parsing.mjs';
/** @typedef {import('./message_parsing.mjs').Component} Component */

/** @type {WebSocket | null} */
let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 300; // TODO: add a reconnect button after automatic retries are done.

// TODO: probably make max stored messages a config
const maxStoredMessages = 5000; // Max number of messages to keep in storage. 

// Used for the favicon
let messageCount = 0;

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        messageCount = 0;
        faviconCounter(0);
    }
});

// Load previous messages when page loads
function loadStoredMessages() {
    const stored = localStorage.getItem('chatMessagesJSON');
    if (!stored) {
        return;
    }

    /** @type {string[]} */
    const messages = JSON.parse(stored);
    // Reverse the array to show messages in correct order
    messages.reverse().forEach(rawJson => displayMessage(rawJson));
}

/**
 * Store messages in localStorage.
 * @param {string} rawJson
 */
function storeMessage(rawJson) {
    try {
        /** @type {string[]} */
        let messages = [];
        const stored = localStorage.getItem('chatMessagesJSON');
        if (stored) {
            messages = JSON.parse(stored);
        }

        messages.unshift(rawJson); // Add new message at start

        // Keep only the last maxStoredMessages messages
        if (messages.length > maxStoredMessages) {
            messages = messages.slice(0, maxStoredMessages);
        }

        localStorage.setItem('chatMessagesJSON', JSON.stringify(messages));
    } catch (e) {
        console.error('Failed to store message:', e);
    }
}

/**
 * Add a message to the chat.
 * @param {string} rawJson
 */
function displayMessage(rawJson) {
    console.log(rawJson);
    const div = document.createElement('div');
    div.className = 'message';

    /** @type {unknown} */
    const json = JSON.parse(rawJson);
    try {
        assertIsComponent(json);
        div.appendChild(formatComponent(/** @type {Component} */ (json)));
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

    messages.insertBefore(div, messages.firstChild);
}

function connect() {
    ws = new WebSocket(`ws://${location.host}/chat`);

    ws.onopen = function () {
        console.log('Connected to server');
        const status = /** @type {HTMLDivElement | null} */ (document.getElementById('status'));
        if (!status) {
            return;
        }

        status.textContent = 'Connected';
        status.className = 'status-connected';
        reconnectAttempts = 0;
    };

    ws.onclose = function () {
        const status = /** @type {HTMLDivElement | null} */ (document.getElementById('status'));
        if (!status) {
            return;
        }

        status.textContent = 'Disconnected';
        status.className = 'status-disconnected';
        console.log('Connection closed. Attempting to reconnect...');

        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            setTimeout(connect, 2000);
        }
    };

    ws.onerror = function (error) {
        console.error('WebSocket error:', error);
        const status = /** @type {HTMLDivElement | null} */ (document.getElementById('status'));
        if (!status) {
            return;
        }

        status.textContent = 'Error: ' + error;
    };

    ws.onmessage = function (event) {
        if (document.visibilityState !== 'visible') {
            messageCount++;
            faviconCounter(messageCount);
        }

        /** @type {string} */
        const rawJson = event.data;
        storeMessage(rawJson);
        displayMessage(rawJson);
    };
}

function sendMessage() {
    // TODO: cut message up if it is too long and send in parts. Possibly do this server side... 
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
loadStoredMessages();

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
