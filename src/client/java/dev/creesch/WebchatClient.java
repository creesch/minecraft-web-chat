package dev.creesch;

import dev.creesch.config.ModConfig;
import dev.creesch.model.WebsocketJsonMessage;
import dev.creesch.model.WebsocketMessageBuilder;
import dev.creesch.storage.ChatMessageRepository;
import dev.creesch.util.NamedLogger;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.message.v1.ClientReceiveMessageEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.minecraft.client.MinecraftClient;
import net.minecraft.text.ClickEvent;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;


public class WebchatClient implements ClientModInitializer {
    private static final NamedLogger LOGGER = new NamedLogger("web-chat");
    private WebInterface webInterface;
    private ChatMessageRepository messageRepository;

    @Override
    public void onInitializeClient() {
        ModConfig.init();
        messageRepository = new ChatMessageRepository();
        webInterface = new WebInterface(messageRepository);
        ModConfig config = ModConfig.HANDLER.instance();

        LOGGER.info("web chat loaded");

        // Chat messages from users.
        ClientReceiveMessageEvents.CHAT.register((message, signedMessage, sender, params, receptionTimestamp) -> {
            WebsocketJsonMessage chatMessage = WebsocketMessageBuilder.createLiveChatMessage(message, MinecraftClient.getInstance());
            messageRepository.saveMessage(chatMessage);
            webInterface.broadcastMessage(chatMessage);
        });

        // System messages (joins, leaves, deaths, etc.)
        ClientReceiveMessageEvents.GAME.register((message, overlay) -> {
            WebsocketJsonMessage chatMessage = WebsocketMessageBuilder.createLiveChatMessage(message, MinecraftClient.getInstance());
            messageRepository.saveMessage(chatMessage);
            webInterface.broadcastMessage(chatMessage);
        });

        // Send state to client so history can be cleared
        ClientPlayConnectionEvents.INIT.register((handler, client) -> {
            webInterface.broadcastMessage(
                WebsocketMessageBuilder.createConnectionStateMessage(WebsocketJsonMessage.ServerConnectionStates.INIT)
            );
        });

        // When joining a server:
        //  1. Send state to clients
        //  2. Send a clickable message with the web interface URL
        ClientPlayConnectionEvents.JOIN.register((handler, sender, client) -> {
            client.execute(() -> {
                if (client.player == null) {
                    return;
                }

                webInterface.broadcastMessage(
                    WebsocketMessageBuilder.createConnectionStateMessage(WebsocketJsonMessage.ServerConnectionStates.JOIN)
                );

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

        // Send state to client
        ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> {
            webInterface.broadcastMessage(
                WebsocketMessageBuilder.createConnectionStateMessage(WebsocketJsonMessage.ServerConnectionStates.DISCONNECT)
            );
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
