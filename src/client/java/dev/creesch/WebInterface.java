package dev.creesch;

import dev.creesch.config.ModConfig;
import dev.creesch.util.NamedLogger;
import io.javalin.Javalin;
import io.javalin.http.staticfiles.Location;
import io.javalin.websocket.WsContext;
import lombok.Getter;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.ClientPlayerEntity;

import java.util.Collections;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

public class WebInterface {
    // Server related things
    @Getter
    private final Javalin server;
    private final Set<WsContext> connections = Collections.newSetFromMap(new ConcurrentHashMap<>());

    private static final NamedLogger LOGGER = new NamedLogger("web-chat");
    ModConfig config = ModConfig.HANDLER.instance();

    private static final Pattern ILLEGAL_CHARACTERS = Pattern.compile("[\\n\\r§\u00A7\\u0000-\\u001F\\u200B-\\u200F\\u2028-\\u202F]");
    public WebInterface() {
        server = createServer();
        setupWebSocket();

        server.start(config.httpPortNumber);
        LOGGER.info("Web interface started on port {}", config.httpPortNumber);
    }

    private Javalin createServer() {
        return Javalin.create(config -> {
            config.staticFiles.add("/web", Location.CLASSPATH);
            config.http.defaultContentType = "text/plain";
        }).before(ctx -> {
            // Note, most things that are set here are overkill as users are _supposed_ to only uses this on their local machine through localhost.
            // Or if we are being generous through a device on their own network.
            // But, as we can't be sure that someone doesn't (accidentally) opens this up to the internet we take the better safe than sorry route.
            String uri = ctx.path();

            // Allow access to the root directory ("/") but block subdirectories ending with "/"
            if (!uri.equals("/") && uri.endsWith("/")) {
                LOGGER.warn("Unauthorized attempt to access subdirectory: " + uri);
                ctx.status(401).result("Unauthorized access");
                return;
            }

            // Reject requests containing `..` (path traversal attack)
            // Javelin also does this, this is just to be extra secure
            if (uri.contains("..")) {
                LOGGER.warn("Invalid path detected: " + uri);
                ctx.status(400).result("Invalid path");
                return;
            }

            // Security headers
            ctx.header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self';");
            ctx.header("X-Frame-Options", "DENY"); // Prevent clickjacking
            ctx.header("X-Content-Type-Options", "nosniff"); // Prevent MIME type sniffin
        });
    }

    private void setupWebSocket() {
        server.ws("/chat", ws -> {
            ws.onConnect(ctx -> {
                // For localhost connections pinging likely isn't needed.
                // But if someone wants to use the mod on their phone or something it might be useful to include it.
                ctx.enableAutomaticPings(15, TimeUnit.SECONDS);
                LOGGER.info("New WebSocket connection from {}", ctx.session.getRemoteAddress() != null ? ctx.session.getRemoteAddress() : "unknown remote address");
                connections.add(ctx);
            });

            ws.onClose(ctx -> {
                LOGGER.info("WebSocket connection closed: {} with status {} and reason: {}", ctx.session.getRemoteAddress(), ctx.status(), ctx.reason());
                connections.remove(ctx);
            });

            ws.onMessage(ctx -> {
                String message = ctx.message();

                if (message.trim().isEmpty()) {
                    LOGGER.warn("Received an empty message from {}", ctx.session.getRemoteAddress());
                    return;
                }
                LOGGER.info("Received WebSocket message: {}", message);

                // Sanitize the message
                message = sanitizeMessage(message);

                // Send the sanitized message to Minecraft chat
                sendMinecraftMessage(message);
            });

            ws.onError(ctx -> {
                LOGGER.error("WebSocket error: ", ctx.error());
                connections.remove(ctx);
            });
        });
    }

    public void shutdown() {
        // Try to avoid log spam from connections that are not gracefully closed.
        connections.forEach(ctx -> {
            try {
                ctx.session.close(); // Close the WebSocket session
            } catch (Exception e) {
                LOGGER.warn("Failed to close WebSocket connection: {}", ctx.session.getRemoteAddress(), e);
            }
        });
        connections.clear();
        if (server != null) {
            LOGGER.info("Shutting down web interface");
            server.stop();
        }
    }

    private String sanitizeMessage(String message) {
        // Replace known illegal characters like linebreaks, control characters, zero width characters, etc
        return ILLEGAL_CHARACTERS.matcher(message).replaceAll("");
    }

    private void sendMinecraftMessage(String message) {
        MinecraftClient client = MinecraftClient.getInstance();
        // Probably an edge case, if even possible but client can potentially be null
        if (client == null) {
            LOGGER.warn("MinecraftClient instance is null. Cannot send message.");
            return;
        }
        client.execute(() -> {
            ClientPlayerEntity player = client.player;
            if (player != null) {
                // Break long messages into smaller chunks
                int maxLength = 256;
                if (message.length() > maxLength) {
                    for (int i = 0; i < message.length(); i += maxLength) {
                        int end = Math.min(i + maxLength, message.length());
                        player.networkHandler.sendChatMessage(message.substring(i, end));
                    }
                } else {
                    player.networkHandler.sendChatMessage(message);
                }
            } else {
                LOGGER.warn("Player value is null. Cannot send message.");
            }
        });
    }

    public void broadcastMessage(String message) {
        connections.forEach(ctx -> {
            try {
                ctx.send(message);
            } catch (Exception e) {
                LOGGER.warn("Failed to send message to connection: {}", ctx.session.getRemoteAddress(), e);
            }
        });
    }
}