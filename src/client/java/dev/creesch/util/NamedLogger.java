package dev.creesch.util;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * A {@link Logger} wrapper that always prints the name of the logger regardless of configuration.
 */
public final class NamedLogger {

    private final Logger inner;
    private final String name;

    public NamedLogger(Class<?> clazz) {
        this(LoggerFactory.getLogger(clazz));
    }

    public NamedLogger(String name) {
        this(LoggerFactory.getLogger(name));
    }

    private NamedLogger(Logger inner) {
        this.inner = inner;
        this.name = inner.getName();
    }

    private String formatMessage(String message) {
        return "[" + name + "] " + message;
    }

    public void error(String message) {
        this.inner.error(formatMessage(message));
    }

    public void error(String message, Throwable error) {
        this.inner.error(formatMessage(message), error);
    }

    public void error(String message, Object... args) {
        this.inner.error(formatMessage(message), args);
    }

    public void debug(String message) {
        if (inner.isDebugEnabled()) {
            this.inner.debug(formatMessage(message));
        }
    }

    public void debug(String message, Object... args) {
        if (inner.isDebugEnabled()) {
            this.inner.debug(formatMessage(message), args);
        }
    }

    public void info(String message) {
        this.inner.info(formatMessage(message));
    }

    public void info(String message, Object... args) {
        this.inner.info(formatMessage(message), args);
    }

    public void warn(String message) {
        this.inner.warn(formatMessage(message));
    }

    public void warn(String message, Object... args) {
        this.inner.warn(formatMessage(message), args);
    }
}
