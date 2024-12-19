package dev.creesch.config;

import dev.isxander.yacl3.api.*;
import dev.isxander.yacl3.api.controller.IntegerFieldControllerBuilder;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.text.Text;

public class ModConfigScreen {
    public static Screen createScreen(Screen parent) {
        return YetAnotherConfigLib.createBuilder()
                .title(Text.literal("Web Chat Configuration"))
                .category(ConfigCategory.createBuilder()
                        .name(Text.literal("Network Settings"))
                        .group(OptionGroup.createBuilder()
                                .name(Text.literal("Port Settings"))
                                .option(Option.<Integer>createBuilder()
                                        .name(Text.literal("HTTP Port"))
                                        .description(OptionDescription.of(Text.literal("""
                                                Port number used to serve the web interface.
                                                Make sure that both this port and the one above it (+1) are available.
                                                
                                                IMPORTANT: You need to restart minecraft for this to take effect.""")))
                                        .binding(
                                                ModConfig.HANDLER.defaults().httpPortNumber,
                                                () -> ModConfig.HANDLER.instance().httpPortNumber,
                                                val -> ModConfig.HANDLER.instance().httpPortNumber = val
                                        )
                                        .controller(opt -> IntegerFieldControllerBuilder.create(opt)
                                                .range(1024, 65535)
                                                .formatValue(value -> Text.literal(String.valueOf(value)))
                                        )


                                        .build())
                                .build())
                        .build())
                .save(() -> ModConfig.HANDLER.save())
                .build()
                .generateScreen(parent);
    }
}
