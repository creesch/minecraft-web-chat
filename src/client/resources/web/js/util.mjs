// @ts-check
'use strict';

/**
 * Render a favicon with a counter and a ping indicator.
 * @param {number} count
 * @param {boolean} hasPing
 */
export function updateFavicon(count, hasPing) {
    const sizes = [16, 32];

    sizes.forEach(size => {
        /** @type {HTMLLinkElement | null} */
        const link = document.querySelector(`link[rel="icon"][sizes="${size}x${size}"]`);
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
                const y = (size / 2) - (size * 0.05); // The middle of the chat icon is not exactly in the center.

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
        hour12: false 
    });
    
    // Full date and time for tooltip
    const fullDateTime = date.toLocaleString([], {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    
    return { timeString, fullDateTime };
}