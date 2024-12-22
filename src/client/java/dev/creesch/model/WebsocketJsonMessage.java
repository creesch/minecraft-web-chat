package dev.creesch.model;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.annotations.SerializedName;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

@Data
@Builder
public class WebsocketJsonMessage {
    private long timestamp;
    private ChatServerInfo server;
    private MessageType type;
    private String minecraftVersion;
    private Object payload;


    @Data
    @Builder
    public static class ChatServerInfo {
        private String name;
        private String identifier;
    }


    public enum MessageType {
        @SerializedName("chatMessage")
        CHAT_MESSAGE,
        @SerializedName("serverConnectionState")
        SERVER_CONNECTION_STATE
    }

    /**
     *  Using same naming as used by {@link net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents}
     */
    public enum ServerConnectionStates {
        @SerializedName("init")
        INIT,
        @SerializedName("join")
        JOIN,
        @SerializedName("disconnect")
        DISCONNECT
    }

    // Private constructor to force use of factory methods
    private WebsocketJsonMessage(
            long timestamp,
            ChatServerInfo server,
            MessageType type,
            Object payload,
            String minecraftVersion
    ) {
        this.timestamp = timestamp;
        this.server = server;
        this.type = type;
        this.payload = payload;
        this.minecraftVersion = minecraftVersion;
    }

    public static WebsocketJsonMessage createChatMessage(
            long timestamp,
            ChatServerInfo server,
            ChatMessagePayload message,
            String minecraftVersion
    ) {
        return WebsocketJsonMessage.builder()
            .timestamp(timestamp)
            .server(server)
            .type(MessageType.CHAT_MESSAGE)
            .payload(message)
            .minecraftVersion(minecraftVersion)
            .build();
    }

    public static WebsocketJsonMessage createServerConnectionStateMessage(
        long timestamp,
        ChatServerInfo server,
        ServerConnectionStates state,
        String minecraftVersion
    ) {
        return WebsocketJsonMessage.builder()
            .timestamp(timestamp)
            .server(server)
            .type(MessageType.SERVER_CONNECTION_STATE)
            .payload(state)
            .minecraftVersion(minecraftVersion)
            .build();
    }
}
