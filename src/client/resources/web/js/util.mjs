// @ts-check
'use strict';

/**
 * Render a favicon with a counter and a ping indicator.
 * @param {number} count
 * @param {boolean} hasPing
 */
export function updateFavicon(count, hasPing) {
    const sizes = [16, 32];

    sizes.forEach((size) => {
        /** @type {HTMLLinkElement | null} */
        const link = document.querySelector(
            `link[rel="icon"][sizes="${size}x${size}"]`,
        );
        if (!link) {
            return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }

        const img = new Image();

        // Pings should not happen without a count
        if (hasPing && count > 0) {
            img.src = `img/icon_${size}_ping.png`;
        } else if (count > 0) {
            img.src = `img/icon_${size}_blank.png`;
        } else {
            // Default image, will restore the favicon.
            img.src = `img/icon_${size}.png`;
        }

        img.onload = () => {
            ctx.drawImage(img, 0, 0, size, size);

            if (count > 0) {
                const x = size / 2;
                const y = size / 2 - size * 0.05; // The middle of the chat icon is not exactly in the center.

                ctx.font = `bold ${size * 0.5}px "Arial Black"`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#000000';
                ctx.fillText(count > 99 ? '99+' : `${count}`, x, y);
            }

            link.href = canvas.toDataURL();
        };
    });
}

/**
 * Format a timestamp into a human readable format
 * @param {number} timestamp - Timestamp in milliseconds
 * @returns {{ timeString: string, fullDateTime: string }}
 */
export function formatTimestamp(timestamp) {
    const date = new Date(timestamp);

    // Format HH:MM for display
    const timeString = date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });

    // Full date and time for tooltip
    const fullDateTime = date.toLocaleString([], {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });

    return { timeString, fullDateTime };
}

/** @type {string} Default Steve head texture as base64 */
export const STEVE_HEAD_BASE64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAAXNSR0IArs4c6QAAANNJREFUKFNjNFYR/M/AwMDAw8YCouDgy68/DD9+/WFgVJHg+M/PwwmWgCkCSYLYIJpRW473f4GrDYOEmCgDCxcvw59vnxm+//zN8PHjB4aZh04yMM5O9vzPzy/AwMnOCjYFJAkDIEWMq4oi/4f2LmMItutiiDC9ANa5/ZYDw9pDZQyri6MQJoB0HTh3HazZwUgTTINNmBBp//8/63+GXccvMejJqoIlTt++yuDraMLw6etvBsYpCXb/337+zXDw1EUGdg42hp8/foFpCz1NBj5uVgYAzxRTZRWSVwUAAAAASUVORK5CYII=';

/** @type {number} Timeout in milliseconds for texture fetching */
const FETCH_TIMEOUT = 1000;

/**
 * Fetches a minecraft texture
 * @param {string} url - The URL to fetch the texture from
 * @returns {Promise<Blob>} The fetched texture as a Blob
 */
async function fetchTexture(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.blob();
    } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof Error) {
            throw error.name === 'AbortError'
                ? new Error(`Request timed out after ${FETCH_TIMEOUT}ms`)
                : error;
        }
        throw new Error(`Unknown error occurred: ${String(error)}`);
    }
}

/**
 * Extracts the head portion of a Minecraft skin texture
 * @param {string} textureUrl - The URL of the full skin texture
 * @returns {Promise<string>} Base64 encoded PNG of the player's head. Or Steve's head if there's an error
 */
export async function getPlayerHead(textureUrl) {
    try {
        const blob = await fetchTexture(textureUrl);
        const arrayBuffer = await blob.arrayBuffer();
        const base64 = btoa(
            new Uint8Array(arrayBuffer).reduce(
                (data, byte) => data + String.fromCharCode(byte),
                '',
            ),
        );

        const img = new Image();
        img.src = `data:${blob.type};base64,${base64}`;

        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error('Failed to load image'));
        });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            throw new Error('Failed to get canvas context');
        }

        canvas.width = 8;
        canvas.height = 8;

        // The head is located in the top left corner 8 pixels from both sides.
        ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8);

        // Draw the head overlay layer
        ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8);

        return canvas.toDataURL('image/png');
    } catch (error) {
        console.warn(
            'Error processing player head, using Steve head as fallback:',
            error,
        );
        return STEVE_HEAD_BASE64;
    }
}
