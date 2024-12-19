package dev.creesch.config;

import dev.isxander.yacl3.config.v2.api.ConfigClassHandler;
import dev.isxander.yacl3.config.v2.api.serializer.GsonConfigSerializerBuilder;
import dev.isxander.yacl3.config.v2.api.SerialEntry;
import net.fabricmc.loader.api.FabricLoader;

import com.google.gson.GsonBuilder;
import net.minecraft.util.Identifier;

public class ModConfig {
    public static ConfigClassHandler<ModConfig> HANDLER = ConfigClassHandler.createBuilder(ModConfig.class)
            .id(Identifier.of("web-chat", "web-config"))
            .serializer(config -> GsonConfigSerializerBuilder.create(config)
                    .setPath(FabricLoader.getInstance().getConfigDir().resolve("web-chat.json5"))
                    .appendGsonBuilder(GsonBuilder::setPrettyPrinting) // not needed, pretty print by default
                    .setJson5(true)
                    .build())
            .build();

    @SerialEntry(comment = "Port number used to serve the webinterface")
    public int httpPortNumber = 8080;

    public static void init() {
        HANDLER.load();
    }
}
