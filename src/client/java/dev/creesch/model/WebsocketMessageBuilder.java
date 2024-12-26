package dev.creesch.model;

import com.google.gson.Gson;
import com.google.gson.JsonObject;

import dev.creesch.config.ModConfig;
import dev.creesch.util.MinecraftServerIdentifier;
import net.minecraft.SharedConstants;
import net.minecraft.client.MinecraftClient;
import net.minecraft.text.Text;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

public class WebsocketMessageBuilder {
    private static final Gson gson = new Gson();

    /**
     * Processes both chat and game messages, converting them to the appropriate format
     *
     * @param message The Minecraft text message to process
     * @param client The Minecraft client instance
     */
    public static WebsocketJsonMessage createLiveChatMessage(Text message, MinecraftClient client) {
        if (client.world == null) {
            throw new MessageBuildException("Cannot create chat message: client world is null");
        }

        // Can't use GSON for Text serialization easily, using Minecraft's own serializer.
        String minecraftChatJson = Text.Serialization.toJsonString(message, client.world.getRegistryManager());

        // Explicitly use UTC time for consistency across different timezones
        long timestamp = Instant.now(Clock.systemUTC()).toEpochMilli();
        WebsocketJsonMessage.ChatServerInfo serverInfo = MinecraftServerIdentifier.getCurrentServerInfo();
        String minecraftVersion = SharedConstants.getGameVersion().getName();
        // UUID used to prevent duplicates when doing
        String messageUUID = UUID.nameUUIDFromBytes((timestamp + minecraftChatJson).getBytes()).toString();

        // Back to objects we go
        ChatMessagePayload messageObject = ChatMessagePayload.builder()
            .history(false)
            .uuid(messageUUID)
            .component(gson.fromJson(
                minecraftChatJson,
                JsonObject.class
            ))
            .isPing(isPing(message, client))
            .build();

        return WebsocketJsonMessage.createChatMessage(
            timestamp,
            serverInfo,
            messageObject,
            minecraftVersion
        );
    }


    /**
     * Checks if the message is a ping.
     *
     * @param message The minecraft text message to process
     * @param client The Minecraft client instance
     * @return True if the message is a ping, false otherwise   
     */
    private static boolean isPing(Text message, MinecraftClient client) {
        String messageString = message.getString();
        ModConfig config = ModConfig.HANDLER.instance();

        if (config.pingOnUsername && client.player != null) {
            String playerName = client.player.getName().getString();
            if (pingPattern(playerName).matcher(messageString).find()) {
                return true;
            }
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
    private static Pattern pingPattern(String pingKeyword) {
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

    /**
     * Processes both chat and game messages, converting them to the appropriate format.
     */
    public static WebsocketJsonMessage createHistoricChatMessage(
            long timestamp,
            String serverId,
            String serverName,
            String messageId,
            String messageJson,
            String minecraftVersion
        ) {

        // Back to objects we go
        ChatMessagePayload messageObject = ChatMessagePayload.builder()
            .history(true)
            .uuid(messageId)
            .component(gson.fromJson(
                messageJson,
                JsonObject.class
            ))
            .isPing(false)
            .build();

        WebsocketJsonMessage.ChatServerInfo serverInfo = new WebsocketJsonMessage.ChatServerInfo(serverName, serverId);

        return WebsocketJsonMessage.createChatMessage(
            timestamp,
            serverInfo,
            messageObject,
            minecraftVersion
        );
    }

    /**
     * Processes server state changes to create the correct message
     *
     * @param state The server connection state to use
     */
    public static WebsocketJsonMessage createConnectionStateMessage(WebsocketJsonMessage.ServerConnectionStates state) {
        long timestamp = Instant.now(Clock.systemUTC()).toEpochMilli();
        WebsocketJsonMessage.ChatServerInfo serverInfo = MinecraftServerIdentifier.getCurrentServerInfo();
        String minecraftVersion = SharedConstants.getGameVersion().getName();

        return WebsocketJsonMessage.createServerConnectionStateMessage(
            timestamp,
            serverInfo,
            state,
            minecraftVersion
        );
    }

    public static WebsocketJsonMessage createHistoryMetaDataMessage(List<WebsocketJsonMessage> historyMessages, int requestedLimit) {
        boolean moreHistoryAvailable = false;
        if (historyMessages.size() > requestedLimit) {
            moreHistoryAvailable = true;
            // Array index, so -1 is the original limit
            historyMessages.remove(requestedLimit);
        }

        // Get oldest timestamp
        int lastIndex = historyMessages.size() - 1;
        long oldestTimestamp = historyMessages.isEmpty()
            ? 0L
            : historyMessages.get(lastIndex).getTimestamp();

        // Explicitly use UTC time for consistency across different timezones
        long timestamp = Instant.now(Clock.systemUTC()).toEpochMilli();
        WebsocketJsonMessage.ChatServerInfo serverInfo = MinecraftServerIdentifier.getCurrentServerInfo();
        String minecraftVersion = SharedConstants.getGameVersion().getName();

        return WebsocketJsonMessage.createHistoryMetaDataMessage(
            timestamp,
            serverInfo,
            oldestTimestamp,
            moreHistoryAvailable,
            minecraftVersion
        );
    }
}
