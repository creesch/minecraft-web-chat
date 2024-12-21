package dev.creesch.util;

import dev.creesch.model.WebsocketJsonMessage;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.ServerInfo;
import net.minecraft.server.integrated.IntegratedServer;
import net.minecraft.util.WorldSavePath;

import java.nio.file.Path;
import java.util.UUID;

/**
 * Utility class for identifying Minecraft servers and worlds.
 * Provides consistent identification for singleplayer (LAN) worlds and multiplayer servers.
 */
public class MinecraftServerIdentifier {
    private static final NamedLogger LOGGER = new NamedLogger("web-chat");
    /**
     * Default server info returned when not connected to any world/server.
     * Should not happen in the current mod setup. But better to account for it.
     * Also allows for sending messages in the future when a user is not connected to a server.
     */
    private static final MinecraftClient client = MinecraftClient.getInstance();
    private static final WebsocketJsonMessage.ChatServerInfo DISCONNECTED =
            new WebsocketJsonMessage.ChatServerInfo("Disconnected", "disconnected");

    /**
     * Gets information about the current server or world the player is connected to.
     *
     * For singleplayer worlds (including LAN):
     * - name: The world name
     * - identifier: UUID generated from relative path to world save
     *
     * For multiplayer servers:
     * - name: Server label or address if label is not available
     * - identifier: UUID generated from server address
     *
     * @return ChatServerInfo containing the name and unique identifier of the current server/world.
     *         Returns DISCONNECTED if not connected to any world or server.
     */
    public static WebsocketJsonMessage.ChatServerInfo getCurrentServerInfo() {

        // World is null, so we can't be on a minecraft server of any kind.
        if (client.world == null) {
            return DISCONNECTED;
        }

        // For single player we can use the levelname for the name.
        // But to ensure a unique identifier we are using the save path as worlds can have the same name.
        if (client.isInSingleplayer()) {
            IntegratedServer server = client.getServer();
            if (server == null) {
                return DISCONNECTED;
            }

            String worldName = server.getSaveProperties().getLevelName();

            // To create a unique identifier use the save path as world names are not unique.
            // Use relative path so users can still move minecraft directories to a different location.
            Path minecraftDir = client.runDirectory.toPath();
            Path savePath = server.getSavePath(WorldSavePath.ROOT);
            String rawIdentifier = minecraftDir.relativize(savePath).toString();

            return new WebsocketJsonMessage.ChatServerInfo(
                    worldName,
                    UUID.nameUUIDFromBytes(rawIdentifier.getBytes()).toString()
            );

        } else {
            ServerInfo serverInfo = client.getCurrentServerEntry();
            if (serverInfo == null) {
                return DISCONNECTED;
            }

            // It is very unlikely that label is null for servers. But just in case fall back to the server address.
            String serverName = serverInfo.label != null ? serverInfo.label.getString() : serverInfo.address;
            String serverIdentifier = UUID.nameUUIDFromBytes((serverName + serverInfo.address).getBytes()).toString();
            return new WebsocketJsonMessage.ChatServerInfo(
                    serverName,
                    serverIdentifier
            );
        }
    }
}
