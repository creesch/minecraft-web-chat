package dev.creesch.config;

import dev.creesch.WebchatClient;
import dev.isxander.yacl3.api.*;
import dev.isxander.yacl3.api.controller.BooleanControllerBuilder;
import dev.isxander.yacl3.api.controller.IntegerFieldControllerBuilder;
import dev.isxander.yacl3.api.controller.StringControllerBuilder;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.text.Text;

public class ModConfigScreen {

    public static Screen createScreen(Screen parent) {
        YetAnotherConfigLib.Builder builder =
            YetAnotherConfigLib.createBuilder()
                .title(Text.literal("Web Chat Configuration"));

        builder.category(
            ConfigCategory.createBuilder()
                .name(Text.literal("Message Settings"))
                .group(
                    OptionGroup.createBuilder()
                        .name(Text.literal("Ping Settings"))
                        .option(
                            Option.<Boolean>createBuilder()
                                .name(Text.literal("Ping on Username"))
                                .description(
                                    OptionDescription.of(
                                        Text.literal(
                                            "Enable ping on username.\n" +
                                            "This will ping the browser window any time a player's username appears in the chat " +
                                            "(case insensitive)."
                                        )
                                    )
                                )
                                .binding(
                                    ModConfig.HANDLER.defaults().pingOnUsername,
                                    () ->
                                        ModConfig.HANDLER.instance()
                                            .pingOnUsername,
                                    val ->
                                        ModConfig.HANDLER.instance()
                                            .pingOnUsername = val
                                )
                                .controller(BooleanControllerBuilder::create)
                                .build()
                        )
                        .build()
                )
                .group(
                    ListOption.<String>createBuilder()
                        .name(Text.literal("Extra Ping Keywords"))
                        .description(
                            OptionDescription.of(
                                Text.literal(
                                    "Extra keywords to ping on.\n" +
                                    "This will ping the browser window any time one of these words appear in the chat " +
                                    "(case insensitive)."
                                )
                            )
                        )
                        .binding(
                            ModConfig.HANDLER.defaults().pingKeywords,
                            () -> ModConfig.HANDLER.instance().pingKeywords,
                            val ->
                                ModConfig.HANDLER.instance().pingKeywords = val
                        )
                        .controller(StringControllerBuilder::create)
                        .initial("")
                        .build()
                )
                .build()
        );

        builder.category(
            ConfigCategory.createBuilder()
                .name(Text.literal("Network Settings"))
                .group(
                    OptionGroup.createBuilder()
                        .name(Text.literal("Port Settings"))
                        .option(
                            Option.<Integer>createBuilder()
                                .name(Text.literal("HTTP Port"))
                                .description(
                                    OptionDescription.of(
                                        Text.literal(
                                            "Port number used to serve the web interface.\n" +
                                            "Make sure that this port is available."
                                        )
                                    )
                                )
                                .binding(
                                    ModConfig.HANDLER.defaults().httpPortNumber,
                                    () ->
                                        ModConfig.HANDLER.instance()
                                            .httpPortNumber,
                                    val ->
                                        ModConfig.HANDLER.instance()
                                            .httpPortNumber = val
                                )
                                .controller(opt ->
                                    IntegerFieldControllerBuilder.create(opt)
                                        .range(1024, 65535)
                                        .formatValue(value ->
                                            Text.literal(String.valueOf(value))
                                        )
                                )
                                .build()
                        )
                        .build()
                )
                .build()
        );

        if (ModConfig.HANDLER.instance().developmentMode) {
            builder.category(
                ConfigCategory.createBuilder()
                    .name(Text.literal("Development Settings"))
                    .group(
                        OptionGroup.createBuilder()
                            .name(Text.literal("Static Files Path"))
                            .option(
                                Option.<String>createBuilder()
                                    .name(Text.literal("Path"))
                                    .description(
                                        OptionDescription.of(
                                            Text.literal(
                                                "Path to the static files for the web interface.\n" +
                                                "Leave blank to use files included in the mod jar."
                                            )
                                        )
                                    )
                                    .binding(
                                        ModConfig.HANDLER.defaults()
                                            .staticFilesPath,
                                        () ->
                                            ModConfig.HANDLER.instance()
                                                .staticFilesPath,
                                        val ->
                                            ModConfig.HANDLER.instance()
                                                .staticFilesPath = val
                                    )
                                    .controller(StringControllerBuilder::create)
                                    .build()
                            )
                            .build()
                    )
                    .build()
            );
        }

        builder.save(() -> {
            ModConfig.HANDLER.save();
            WebchatClient.onConfigChanged();
        });

        return builder.build().generateScreen(parent);
    }
}
