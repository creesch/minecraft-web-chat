package dev.creesch.model;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import dev.creesch.util.MinecraftServerIdentifier;
import net.minecraft.SharedConstants;
import net.minecraft.client.MinecraftClient;
import net.minecraft.text.Text;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

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
            .build();

        return WebsocketJsonMessage.createChatMessage(
            timestamp,
            serverInfo,
            messageObject,
            minecraftVersion
        );
    }

    /**
     * Processes both chat and game messages, converting them to the appropriate format
     *

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
}
