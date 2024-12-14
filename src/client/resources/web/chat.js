let ws;
const wsPort = parseInt(location.port, 10) + 1;
let reconnectAttempts = 0;
const maxReconnectAttempts = 300; // TODO: add a reconnect button after automatic retries are done.

// TODO: probably make max stored messages a config
const maxStoredMessages = 5000; // Max number of messages to keep in storage. 

// Load previous messages when page loads
function loadStoredMessages() {
    const stored = localStorage.getItem('chatMessagesJSON');
    if (stored) {
        const messages = JSON.parse(stored);
        // Reverse the array to show messages in correct order
        messages.reverse().forEach(msg => addMessage(msg, false));
    }
}

// Store messages in localStorage
function storeMessage(json) {
    try {
        let messages = [];
        const stored = localStorage.getItem('chatMessagesJSON');
        if (stored) {
            messages = JSON.parse(stored);
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


function addMessage(json, store = true) {
    console.log(json);
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = parseMinecraftText(json);
    const messages = document.getElementById('messages');
    messages.insertBefore(div, messages.firstChild);

    if (store) {
        // Note, we store the original text as on reload all messages go through this function again anyway. 
        storeMessage(json);
    }
}

function connect() {
    ws = new WebSocket(`ws://localhost:${wsPort}`);

    ws.onopen = function () {
        console.log('Connected to server');
        const status = document.getElementById('status');
        status.textContent = 'Connected';
        status.className = 'status-connected';
        reconnectAttempts = 0;
    };

    ws.onclose = function () {
        const status = document.getElementById('status');
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
        document.getElementById('status').textContent = 'Error: ' + error;
    };

    ws.onmessage = function (event) {
        addMessage(event.data);
    };
}

function sendMessage() {
    // TODO: cut message up if it is too long and send in parts. Possibly do this server side... 
    const input = document.getElementById('messageInput');
    console.log(ws);
    console.log(ws.readyState);
    console.log(input.value);
    if (ws && ws.readyState === WebSocket.OPEN && input.value.trim()) {
        ws.send(input.value);
        input.value = '';
    } else if (!input.value.trim()) {
        return;
    } else {
        console.log('WebSocket is not connected');
        const status = document.getElementById('status');
        status.textContent = 'Not connected - message not sent';
        status.className = 'status-disconnected';
    }
}

// Start connection and load stored messages when page loads
connect();
loadStoredMessages();

// Allow Enter key to send messages
document.getElementById('messageInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Focus input on load
document.getElementById('messageInput').focus();



