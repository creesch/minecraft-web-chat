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

// Used for the favicon
let messageCount = 0;

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
function displayChatMessage(chatComponent, timestamp) {
    
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
        console.log(rawJson);
		try {
			const message = parseModServerMessage(rawJson);
			// For now we only handle chat messages
			if (message.type === 'chatMessage') {
				displayChatMessage(message.payload, message.timestamp);
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
