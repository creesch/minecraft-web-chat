package dev.creesch;


import dev.creesch.config.ModConfig;
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

	@Override
	public void onInitializeClient() {
		ModConfig.init();
		webInterface = new WebInterface();
		ModConfig config = ModConfig.HANDLER.instance();


		LOGGER.info("web chat loaded");

		// Chat messages from users.
		// TODO: extract more information, put in object serialize to json
		ClientReceiveMessageEvents.CHAT.register((message, signedMessage, sender, params, receptionTimestamp) -> {
			MinecraftClient client = MinecraftClient.getInstance();
			if (client.world != null) {
				String json = Text.Serialization.toJsonString(message, client.world.getRegistryManager());
				LOGGER.info("Got chat message as JSON: {}", json);
				webInterface.broadcastMessage(json);
			}
		});

		// System messages (joins, leaves, deaths, etc.)
		// TODO: extract more information, put in object serialize to json
		ClientReceiveMessageEvents.GAME.register((message, overlay) -> {
			MinecraftClient client = MinecraftClient.getInstance();
			if (client.world != null) {
				String json = Text.Serialization.toJsonString(message, client.world.getRegistryManager());
				LOGGER.info("Got game message as JSON: {}", json);
				webInterface.broadcastMessage(json);
			}
		});

		ClientPlayConnectionEvents.JOIN.register((handler, sender, client) -> {
			client.execute(() -> {
				if (client.player != null) {
					String webchatPort = String.valueOf(config.httpPortNumber);
					Text message = Text.literal("Web chat:")
							.append(Text.literal("http://localhost:" + webchatPort)
								.formatted(Formatting.BLUE, Formatting.UNDERLINE)
								.styled(style -> style.withClickEvent(
										new ClickEvent(ClickEvent.Action.OPEN_URL, "http://localhost:" + webchatPort)
							)));
					client.player.sendMessage(message, false);
				}
			});
		});

		// Properly handle minecraft shutting down
		ClientLifecycleEvents.CLIENT_STOPPING.register(client -> {
			if (webInterface != null) {
				webInterface.shutdown();
			}
		});
	}
}