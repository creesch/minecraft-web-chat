// @ts-check
'use strict';

/**
 * Manages browser notifications for new messages
 */
class NotificationManager {
    /**
     * @type {boolean}
     */
    #notificationsEnabled = false;

    constructor() {
        // Check if notifications are supported
        if (!('Notification' in window)) {
            console.warn('This browser does not support notifications');
            return;
        }

        // Check if we already have permission
        if (Notification.permission === 'granted') {
            this.#notificationsEnabled = true;
        }
    }

    /**
     * Enable notifications by requesting permission from the user
     * @returns {Promise<boolean>} Whether notifications were successfully enabled
     */
    async enableNotifications() {
        if (!('Notification' in window)) {
            return false;
        }

        if (Notification.permission === 'granted') {
            this.#notificationsEnabled = true;
            return true;
        }

        if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            this.#notificationsEnabled = permission === 'granted';
            return this.#notificationsEnabled;
        }

        return false;
    }

    /**
     * Send a notification if notifications are enabled and the page is not visible
     * @param {string} text - The text to display in the notification
     */
    sendNotification(text) {
        if (!this.#notificationsEnabled) {
            return;
        }
        if (document.visibilityState === 'visible') {
            return;
        }

        new Notification('Minecraft WebChat', {
            body: text,
            icon: '/img/icon_32.png',
        });
    }

    /**
     * Get whether notifications are currently enabled
     * @returns {boolean}
     */
    isEnabled() {
        return this.#notificationsEnabled;
    }
}

// Export a singleton instance since we only need one notification manager
export const notificationManager = new NotificationManager();
