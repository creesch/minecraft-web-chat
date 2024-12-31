// @ts-check
'use strict';

/**
 * Manages the favicon state and updates including message count and ping status
 */
class FaviconManager {
    /**
     * @type {number}
     */
    #messageCount = 0;

    /**
     * @type {boolean}
     */
    #hasPing = false;

    constructor() {
        // Set up visibility change handler
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.clear();
            }
        });
    }

    /**
     * Clear the favicon state and update the display
     */
    clear() {
        this.#messageCount = 0;
        this.#hasPing = false;
        this.#updateFavicon();
    }

    /**
     * Increment the message count and update ping status if tab is not visible
     * @param {boolean} isPing - Whether this message is a ping
     * @param {boolean} isHistory - Whether this message is from history
     */
    handleNewMessage(isPing, isHistory = false) {
        if (document.visibilityState !== 'visible') {
            if (!isHistory && isPing) {
                this.#hasPing = true;
            }
            this.#messageCount++;
            this.#updateFavicon();
        }
    }

    /**
     * Get the current message count
     * @returns {number}
     */
    getMessageCount() {
        return this.#messageCount;
    }

    /**
     * Get the current ping status
     * @returns {boolean}
     */
    getHasPing() {
        return this.#hasPing;
    }

    /**
     * Render a favicon with the current counter and ping indicator
     */
    #updateFavicon() {
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
            if (this.#hasPing && this.#messageCount > 0) {
                img.src = `img/icon_${size}_ping.png`;
            } else if (this.#messageCount > 0) {
                img.src = `img/icon_${size}_blank.png`;
            } else {
                // Default image, will restore the favicon
                img.src = `img/icon_${size}.png`;
            }

            img.onload = () => {
                ctx.drawImage(img, 0, 0, size, size);

                if (this.#messageCount > 0) {
                    const x = size / 2;
                    const y = size / 2 - size * 0.05; // The middle of the chat icon is not exactly in the center

                    ctx.font = `bold ${size * 0.5}px "Arial Black"`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#000000';
                    ctx.fillText(
                        this.#messageCount > 99
                            ? '99+'
                            : `${this.#messageCount}`,
                        x,
                        y,
                    );
                }

                link.href = canvas.toDataURL();
            };
        });
    }
}

// Export a singleton instance since we only need one favicon manager
export const faviconManager = new FaviconManager();
