package dev.creesch.model;

import com.google.gson.annotations.SerializedName;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class WebsocketJsonMessage {
    private long timestamp;
    private ChatServerInfo server;
    private MessageType type;
    private String minecraftVersion;
    private Object payload;


    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ChatServerInfo {
        private String name;
        private String identifier;
    }


    public enum MessageType {
        @SerializedName("chatMessage")
        CHAT_MESSAGE,
        @SerializedName("serverConnectionState")
        SERVER_CONNECTION_STATE,
        @SerializedName("historyMetadata")
        HISTORY_META_DATA
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
        return new WebsocketJsonMessage(timestamp, server, MessageType.CHAT_MESSAGE, message, minecraftVersion);
    }

    public static WebsocketJsonMessage createServerConnectionStateMessage(
        long timestamp,
        ChatServerInfo server,
        ServerConnectionStates state,
        String minecraftVersion
    ) {
        return new WebsocketJsonMessage(timestamp, server, MessageType.SERVER_CONNECTION_STATE, state, minecraftVersion);
    }

    public static WebsocketJsonMessage createHistoryMetaDataMessage (
        long timestamp,
        ChatServerInfo server,
        long oldestMessageTimestamp,
        boolean moreHistoryAvailable,
        String minecraftVersion
    ) {

        HistoryMetaDataPayload historyMetaDataPayload = HistoryMetaDataPayload.builder()
            .moreHistoryAvailable(moreHistoryAvailable)
            .oldestMessageTimestamp(oldestMessageTimestamp)
            .build();

        return new WebsocketJsonMessage(timestamp, server, MessageType.CHAT_MESSAGE, historyMetaDataPayload, minecraftVersion);
    }
}
