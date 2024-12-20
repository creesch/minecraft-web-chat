// @ts-check
'use strict';

/**
 * Render a favicon with a counter.
 * @param {number} count
 */
export function faviconCounter(count) {
    const sizes = [16, 32];

    sizes.forEach(size => {
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

            /** @type {HTMLLinkElement | null} */
            const link = document.querySelector(`link[rel="icon"][sizes="${size}x${size}"]`);
            if (link) {
                link.href = canvas.toDataURL();
            }
        };
    });
}
