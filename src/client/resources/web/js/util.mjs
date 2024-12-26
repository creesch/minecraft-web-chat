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
        img.src = `img/icon_${size}.png`;
        img.onload = () => {
            ctx.drawImage(img, 0, 0, size, size);

            if (count > 0) {
                const x = size / 2;
                const y = (size / 2) - (size * 0.06); // The middle of the chat icon is not exactly in the center.

                ctx.font = `bold ${size * 0.5}px "Arial Black"`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                // Draw the outline
                ctx.strokeStyle = '#56b6c2';
                ctx.lineWidth = size * 0.15;
                ctx.strokeText(count > 99 ? '99+' : `${count}`, x, y);

                // Draw the fill
                ctx.fillStyle = '#000000';
                ctx.fillText(count > 99 ? '99+' : `${count}`, x, y);
            }

            if (hasPing) {
                // Draw a small red circle in the top right corner.
                ctx.beginPath();
                ctx.arc(size * 3 / 4, size / 4, size / 8, 0, 2 * Math.PI);
                ctx.fillStyle = '#ff0000';
                ctx.fill();
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