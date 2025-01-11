package dev.creesch.model;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.authlib.GameProfile;
import com.mojang.authlib.properties.Property;
import dev.creesch.config.ModConfig;
import dev.creesch.util.MinecraftServerIdentifier;
import dev.creesch.util.NamedLogger;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import net.minecraft.SharedConstants;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.ClientPlayNetworkHandler;
import net.minecraft.text.Text;

public class WebsocketMessageBuilder {

    private static final Gson gson = new Gson();
    private static final NamedLogger LOGGER = new NamedLogger("web-chat");

    /**
     * Processes both chat and game messages, converting them to the appropriate format
     *
     * @param message The Minecraft text message to process
     * @param fromSelf Whether the message is from the local player
     * @param client The Minecraft client instance
     */
    public static WebsocketJsonMessage createLiveChatMessage(
        Text message,
        boolean fromSelf,
        MinecraftClient client
    ) {
        if (client.world == null) {
            throw new MessageBuildException(
                "Cannot create chat message: client world is null"
            );
        }

        // Can't use GSON for Text serialization easily, using Minecraft's own serializer.
        String minecraftChatJson = Text.Serialization.toJsonString(
            message,
            client.world.getRegistryManager()
        );

        // Explicitly use UTC time for consistency across different timezones
        long timestamp = Instant.now(Clock.systemUTC()).toEpochMilli();
        WebsocketJsonMessage.ChatServerInfo serverInfo =
            MinecraftServerIdentifier.getCurrentServerInfo();
        String minecraftVersion = SharedConstants.getGameVersion().getName();
        // UUID used to prevent duplicates when doing
        String messageUUID = UUID.nameUUIDFromBytes(
            (timestamp + minecraftChatJson).getBytes()
        ).toString();

        // Back to objects we go
        ChatMessagePayload messageObject = ChatMessagePayload.builder()
            .history(false)
            .uuid(messageUUID)
            .component(gson.fromJson(minecraftChatJson, JsonObject.class))
            .isPing(!fromSelf && isPing(message, client))
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

            if (client.player.getDisplayName() != null) {
                String displayName = client.player.getDisplayName().getString();
                if (pingPattern(displayName).matcher(messageString).find()) {
                    return true;
                }
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

        return Pattern.compile(
            patternBuilder.toString(),
            Pattern.CASE_INSENSITIVE
        );
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
        boolean isPing,
        String minecraftVersion
    ) {
        // Back to objects we go
        ChatMessagePayload messageObject = ChatMessagePayload.builder()
            .history(true)
            .uuid(messageId)
            .component(gson.fromJson(messageJson, JsonObject.class))
            .isPing(isPing)
            .build();

        WebsocketJsonMessage.ChatServerInfo serverInfo =
            new WebsocketJsonMessage.ChatServerInfo(serverName, serverId);

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
    public static WebsocketJsonMessage createConnectionStateMessage(
        WebsocketJsonMessage.ServerConnectionStates state
    ) {
        long timestamp = Instant.now(Clock.systemUTC()).toEpochMilli();
        WebsocketJsonMessage.ChatServerInfo serverInfo =
            MinecraftServerIdentifier.getCurrentServerInfo();
        String minecraftVersion = SharedConstants.getGameVersion().getName();

        return WebsocketJsonMessage.createServerConnectionStateMessage(
            timestamp,
            serverInfo,
            state,
            minecraftVersion
        );
    }

    public static WebsocketJsonMessage createHistoryMetaDataMessage(
        List<WebsocketJsonMessage> historyMessages,
        int requestedLimit
    ) {
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
        WebsocketJsonMessage.ChatServerInfo serverInfo =
            MinecraftServerIdentifier.getCurrentServerInfo();
        String minecraftVersion = SharedConstants.getGameVersion().getName();

        return WebsocketJsonMessage.createHistoryMetaDataMessage(
            timestamp,
            serverInfo,
            oldestTimestamp,
            moreHistoryAvailable,
            minecraftVersion
        );
    }

    private static final Pattern MINECRAFT_TEXTURE_URL_PATTERN =
        Pattern.compile("^https?://textures\\.minecraft\\.net/texture/.+");

    private static String getPlayerTextureUrl(GameProfile profile) {
        Collection<Property> textures = profile.getProperties().get("textures");
        if (textures.isEmpty()) {
            return "unknown";
        }

        // Generally there should only be one texture.
        // But, it is apparently possible for modified servers and such to add multiple.
        // Mojang signs textures, but that seems overkill.
        // Instead, simply grab the first texture that is minecraft hosted. Fingers crossed there aren't multiple hostnames for textures.
        for (Property property : textures) {
            try {
                String decodedValue = new String(
                    Base64.getDecoder().decode(property.value()),
                    StandardCharsets.UTF_8
                );
                JsonObject textureJson = JsonParser.parseString(
                    decodedValue
                ).getAsJsonObject();
                JsonObject texturesObj = textureJson.getAsJsonObject(
                    "textures"
                );

                if (texturesObj.has("SKIN")) {
                    String textureURL = texturesObj
                        .getAsJsonObject("SKIN")
                        .get("url")
                        .getAsString();

                    if (
                        MINECRAFT_TEXTURE_URL_PATTERN.matcher(
                            textureURL
                        ).matches()
                    ) {
                        // Replace http with https to ensure secure URLs
                        textureURL = textureURL.replaceFirst(
                            "^http://",
                            "https://"
                        );
                        return textureURL;
                    }
                }
            } catch (Exception e) {
                LOGGER.error(
                    "Error decoding skin texture for player {}",
                    profile.getName(),
                    e
                );
            }
        }

        return "unknown";
    }

    /**
     * Uses the networkHandler to fetch a playerlist and create a ServerPlayerListMessage.
     *
     * @param client MinecraftClient
     */
    public static WebsocketJsonMessage createPlayerList(
        MinecraftClient client
    ) {
        ClientPlayNetworkHandler networkHandler = client.getNetworkHandler();

        List<PlayerListInfoEntry> playerList = new ArrayList<>();

        if (networkHandler == null) {
            return null;
        }
        networkHandler
            .getPlayerList()
            .forEach(player -> {
                GameProfile profile = player.getProfile(); // Contains UUID and name
                String playerId = profile.getId().toString();
                String playerName = profile.getName();
                String playerDisplayName = player.getDisplayName() != null
                    ? player.getDisplayName().getString()
                    : playerName;

                // To get the texture we need to digg a little bit deeper.
                // Note: This retrieves the texture URL. In theory, it is possible to fetch player textures from minecraft.
                // In practice this is a messy afair because of how texture loading works. So it is easier to let the web client.
                // Fetch the texture from mojang directly and cut the head out of it.
                String playerTextureUrl = getPlayerTextureUrl(profile);

                PlayerListInfoEntry playerInfo = PlayerListInfoEntry.builder()
                    .playerId(playerId)
                    .playerName(playerName)
                    .playerDisplayName(playerDisplayName)
                    .playerTextureUrl(playerTextureUrl)
                    .build();

                playerList.add(playerInfo);
            });

        // Explicitly use UTC time for consistency across different timezones
        long timestamp = Instant.now(Clock.systemUTC()).toEpochMilli();
        WebsocketJsonMessage.ChatServerInfo serverInfo =
            MinecraftServerIdentifier.getCurrentServerInfo();
        String minecraftVersion = SharedConstants.getGameVersion().getName();

        return WebsocketJsonMessage.createServerPlayerListMessage(
            timestamp,
            serverInfo,
            playerList,
            minecraftVersion
        );
    }
}
