// @ts-check
'use strict';

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
    if (stored) {
        /** @type {any[]} */
        const messages = JSON.parse(stored);
        // Reverse the array to show messages in correct order
        messages.reverse().forEach(msg => addMessage(msg, false));
    }
}

/**
 * Store messages in localStorage.
 * @param {any[]} json
 */
function storeMessage(json) {
    try {
        let messages = [];
        const stored = localStorage.getItem('chatMessagesJSON');
        if (stored) {
            messages = /** @type {any[]} */ (JSON.parse(stored));
        }

        messages.unshift(json); // Add new message at start

        // Keep only the last maxStoredMessages messages
        if (messages.length > maxStoredMessages) {
            messages = messages.slice(0, maxStoredMessages);
        }

        localStorage.setItem('chatMessagesJSON', JSON.stringify(messages));
    } catch (e) {
        console.warn('Failed to store message:', e);
    }
}

/**
 * Add a message to the chat.
 * @param {any} json
 * @param {boolean} store
 */
function addMessage(json, store = true) {
    console.log(json);
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = parseMinecraftText(json);
    const messages = /** @type {HTMLDivElement | null} */ (document.getElementById('messages'));
    if (!messages) return;

    messages.insertBefore(div, messages.firstChild);

    if (store) {
        // Note, we store the original text as on reload all messages go through this function again anyway. 
        storeMessage(json);
    }
}

function connect() {
    ws = new WebSocket(`ws://${location.host}/chat`);

    ws.onopen = function () {
        console.log('Connected to server');
        const status = /** @type {HTMLDivElement | null} */ (document.getElementById('status'));
        if (!status) return;

        status.textContent = 'Connected';
        status.className = 'status-connected';
        reconnectAttempts = 0;
    };

    ws.onclose = function () {
        const status = /** @type {HTMLDivElement | null} */ (document.getElementById('status'));
        if (!status) return;

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
        if (!status) return;

        status.textContent = 'Error: ' + error;
    };

    ws.onmessage = function (event) {
        if (document.visibilityState !== 'visible') {
            messageCount++;
            faviconCounter(messageCount);
        }
        addMessage(event.data);
    };
}

function sendMessage() {
    const input = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('messageInput'));
    if (!input) return;

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
        if (!status) return;

        status.textContent = 'Not connected - message not sent';
        status.className = 'status-disconnected';
    }
}

// Start connection and load stored messages when page loads
connect();
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
