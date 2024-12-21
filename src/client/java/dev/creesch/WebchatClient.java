package dev.creesch;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
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

public class WebchatClient implements ClientModInitializer {
    private static final NamedLogger LOGGER = new NamedLogger("web-chat");
    private WebInterface webInterface;

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
        String minecraftChatJson = Text.Serialization.toJsonString(message, client.world.getRegistryManager());
        // Explicitly use UTC time for consistency across different timezones
        long timestamp = Instant.now(Clock.systemUTC()).toEpochMilli();
        ChatServerInfo serverInfo = MinecraftServerIdentifier.getCurrentServerInfo();
        String minecraftVersion = SharedConstants.getGameVersion().getName();

        WebsocketJsonMessage chatMessage = WebsocketJsonMessage.createChatMessage(
                timestamp,
                serverInfo,
                minecraftChatJson,
                minecraftVersion
        );

        Gson gson = new GsonBuilder()
                .setPrettyPrinting()
                .create();

        LOGGER.info(gson.toJson(chatMessage));
        webInterface.broadcastMessage(minecraftChatJson);
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
