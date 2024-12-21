package dev.creesch;

import com.google.gson.Gson;
import com.google.gson.JsonObject;

import dev.creesch.config.ModConfig;
import dev.creesch.model.WebsocketJsonMessage;
import dev.creesch.model.WebsocketJsonMessage.ChatServerInfo;
import dev.creesch.util.MinecraftServerIdentifier;
import dev.creesch.util.NamedLogger;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.message.v1.ClientReceiveMessageEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.minecraft.SharedConstants;
import net.minecraft.client.MinecraftClient;
import net.minecraft.text.ClickEvent;

import net.minecraft.text.Text;
import net.minecraft.util.Formatting;

import java.time.Clock;
import java.time.Instant;
import java.util.regex.Pattern;

public class WebchatClient implements ClientModInitializer {
    private static final NamedLogger LOGGER = new NamedLogger("web-chat");
    private WebInterface webInterface;
    private final Gson gson = new Gson();

    /**
     * Processes both chat and game messages, converting them to the appropriate format
     * and broadcasting them to connected web clients.
     *
     * @param message The Minecraft text message to process
     * @param client The Minecraft client instance
     */
    private void handleMessage(Text message, MinecraftClient client) {
        if (client.world == null) {
            return;
        }

        // Can't use GSON for Text serialization easily, using Minecraft's own serializer.
        JsonObject minecraftChatJsonObject = gson.fromJson(
            Text.Serialization.toJsonString(message, client.world.getRegistryManager()),
            JsonObject.class
        );
        // Explicitly use UTC time for consistency across different timezones
        long timestamp = Instant.now(Clock.systemUTC()).toEpochMilli();
        ChatServerInfo serverInfo = MinecraftServerIdentifier.getCurrentServerInfo();
        String minecraftVersion = SharedConstants.getGameVersion().getName();

        String playerName = client.player != null ? client.player.getName().getString() : "";
        JsonObject messageObject = new JsonObject();
        messageObject.addProperty("ping", isPing(message, playerName));
        messageObject.add("component", minecraftChatJsonObject);
        String jsonMessage = gson.toJson(messageObject);

        WebsocketJsonMessage chatMessage = WebsocketJsonMessage.createChatMessage(
                timestamp,
                serverInfo,
                jsonMessage,
                minecraftVersion
        );

        String jsonChatMessage = gson.toJson(chatMessage);
        LOGGER.info(jsonChatMessage);
        webInterface.broadcastMessage(jsonChatMessage);
    }

    /**
     * Checks if the message is a ping.
     * 
     * @param message The minecraft text message to process
     * @param playerName The name of the player
     * @return True if the message is a ping, false otherwise   
     */
    private boolean isPing(Text message, String playerName) {
        String messageString = message.getString();
        ModConfig config = ModConfig.HANDLER.instance();

        if (config.pingOnUsername && pingPattern(playerName).matcher(messageString).find()) {
            return true;
        }

        for (String pingKeyword : config.pingKeywords) {
            if (pingPattern(pingKeyword).matcher(messageString).find()) {
                return true;
            }
        }

        return false;
    }

    /**
     * Creates a pattern for a ping keyword.
     * 
     * @param pingKeyword The keyword to ping for
     * @return The pattern for the ping keyword
     */
    private Pattern pingPattern(String pingKeyword) {
        StringBuilder patternBuilder = new StringBuilder();
        // Eats the standard minecraft chat formatting which starts with <username>.
        // We don't want to ping based on usernames in that metadata, otherwise users
        // will be pinged when they send messages because their messages are echoed back
        // to them.
        patternBuilder.append("^<[^>]+>");
        // Allow for any amount of characters before the ping keyword.
        patternBuilder.append(".*");
        // Check for a word boundary before the ping keyword.
        patternBuilder.append("\\b");
        // Add the ping keyword.
        patternBuilder.append(Pattern.quote(pingKeyword));
        // Check for a word boundary after the ping keyword.
        patternBuilder.append("\\b");

        return Pattern.compile(patternBuilder.toString());
    }

    @Override
    public void onInitializeClient() {
        ModConfig.init();
        webInterface = new WebInterface();
        ModConfig config = ModConfig.HANDLER.instance();

        LOGGER.info("web chat loaded");

        // Chat messages from users.
        ClientReceiveMessageEvents.CHAT.register((message, signedMessage, sender, params, receptionTimestamp) -> {
            handleMessage(message, MinecraftClient.getInstance());
        });

        // System messages (joins, leaves, deaths, etc.)
        ClientReceiveMessageEvents.GAME.register((message, overlay) -> {
            handleMessage(message, MinecraftClient.getInstance());
        });

        // When joining a server, send a clickable message with the web interface URL
        ClientPlayConnectionEvents.JOIN.register((handler, sender, client) -> {
            client.execute(() -> {
                if (client.player == null) {
                    return;
                }

                String webchatPort = String.valueOf(config.httpPortNumber);
                Text message = Text.literal("Web chat: ")
                        .append(Text.literal("http://localhost:" + webchatPort)
                            .formatted(Formatting.BLUE, Formatting.UNDERLINE)
                            .styled(style -> style.withClickEvent(
                                    new ClickEvent(ClickEvent.Action.OPEN_URL, "http://localhost:" + webchatPort)
                        )));
                client.player.sendMessage(message, false);
            });
        });

        // Properly handle minecraft shutting down.
        ClientLifecycleEvents.CLIENT_STOPPING.register(client -> {
            if (webInterface == null) {
                return;
            }

            webInterface.shutdown();
        });
    }
}
