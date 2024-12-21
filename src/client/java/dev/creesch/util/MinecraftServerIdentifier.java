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
     * - name: The world save folder name
     * - identifier: UUID generated from relative path to world save
     *
     * For multiplayer servers:
     * - name: Server name or address if name is not available
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

        // For single player the most straightforward method seems to be use the relative safe path.
        // Even more unique would be the absolute path.
        // But that would potentially mess with people restoring minecraft on a different computer.
        if (client.isInSingleplayer()) {
            IntegratedServer server = client.getServer();
            if (server == null) {
                return DISCONNECTED;
            }


            Path minecraftDir = client.runDirectory.toPath();
            LOGGER.info("Minecraft dir: {}", minecraftDir);
            Path savePath = server.getSavePath(WorldSavePath.ROOT);
            LOGGER.info("savePath : {}", savePath);

            String worldName = savePath.getFileName().toString();
            LOGGER.info("worldName : {}", worldName);
            String rawIdentifier = minecraftDir.relativize(savePath).toString();
            LOGGER.info("rawIdentifier : {}", rawIdentifier);

            return new WebsocketJsonMessage.ChatServerInfo(
                    worldName,
                    UUID.nameUUIDFromBytes(rawIdentifier.getBytes()).toString()
            );

        } else {
            ServerInfo serverInfo = client.getCurrentServerEntry();
            if (serverInfo == null) {
                return DISCONNECTED;
            }

            return new WebsocketJsonMessage.ChatServerInfo(
                    serverInfo.name != null ? serverInfo.name : serverInfo.address,
                    UUID.nameUUIDFromBytes(serverInfo.address.getBytes()).toString()
            );
        }
    }
}
