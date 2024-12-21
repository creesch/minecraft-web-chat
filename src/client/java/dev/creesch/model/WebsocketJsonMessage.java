package dev.creesch.model;

import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
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
        CHAT_MESSAGE
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
            String message,
            String minecraftVersion
    ) {
        // Because we need to serialize the Text object with mine
        JsonElement parsedMessage = JsonParser.parseString(message);
        return new WebsocketJsonMessage(timestamp, server, MessageType.CHAT_MESSAGE, parsedMessage, minecraftVersion);
    }
}
