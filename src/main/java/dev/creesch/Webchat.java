package dev.creesch;

import net.fabricmc.api.ModInitializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class Webchat implements ModInitializer {

    public static final String MOD_ID = "web-chat";
    public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    @Override
    public void onInitialize() {
        // Nothing to do here, since this is a client only mod everything can be found `src/client/java`
        LOGGER.info(MOD_ID);
    }
}
