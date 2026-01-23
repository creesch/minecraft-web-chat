package dev.creesch.util;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import net.minecraft.component.type.ItemEnchantmentsComponent;
import net.minecraft.enchantment.Enchantment;
import net.minecraft.item.ItemStack;
import net.minecraft.registry.entry.RegistryEntry;
import net.minecraft.text.HoverEvent;
import net.minecraft.text.Text;
import net.minecraft.text.TranslatableTextContent;
import net.minecraft.util.Language;

public class ClientTranslationUtils {

    /**
     * Extracts all translation keys from a Text object and returns a map of key-value pairs with their translations.
     *
     * @param text The Text object to process.
     * @return A map where keys are translation keys and values are the corresponding translations.
     */
    public static Map<String, String> extractTranslations(Text text) {
        Map<String, String> translations = new HashMap<>();
        collectTranslationKeys(text, translations);

        // Fetch translations for the collected keys
        populateTranslations(translations);

        return translations;
    }

    private static void collectTranslationKeys(
        Text text,
        Map<String, String> keys
    ) {
        if (
            text.getContent() instanceof
                TranslatableTextContent translatableContent
        ) {
            String key = translatableContent.getKey();
            keys.putIfAbsent(key, null);

            // Process arguments of the translation
            for (Object arg : translatableContent.getArgs()) {
                if (arg instanceof Text nestedText) {
                    collectTranslationKeys(nestedText, keys); // Recursively handle nested Text
                } else if (arg instanceof String stringArg) {
                    keys.putIfAbsent(stringArg, null); // Treat plain strings as potential keys. Highly unlikely to ever happen, maybe impossible? Doesn't hurt to account for it.
                }
            }
        }

        // Collect keys from siblings (e.g., appended text)
        for (Text sibling : text.getSiblings()) {
            collectTranslationKeys(sibling, keys);
        }

        // Check hover event for additional text that may contain translation keys
        HoverEvent hoverEvent = text.getStyle().getHoverEvent();
        if (hoverEvent == null) {
            return;
        }

        // Handle different hover event types
        if (hoverEvent instanceof HoverEvent.ShowText(Text value)) {
            if (value != null) {
                collectTranslationKeys(value, keys);
            }
        }

        if (
            hoverEvent instanceof
                HoverEvent.ShowEntity(
                    HoverEvent.EntityContent hoverEventEntityContent
                )
        ) {
            if (hoverEventEntityContent != null) {
                // Collect entity type translation key (e.g., "entity.minecraft.player")
                String entityKey =
                    hoverEventEntityContent.entityType.getTranslationKey();
                keys.putIfAbsent(entityKey, null);

                Optional<Text> entityName = hoverEventEntityContent.name;
                entityName.ifPresent((value) ->
                    collectTranslationKeys(value, keys)
                );
            }
        }

        // Collect translation keys from show_item hover events
        if (hoverEvent instanceof HoverEvent.ShowItem(ItemStack itemStack)) {
            // Collect item translation key (e.g., "item.minecraft.bow")
            String itemKey = itemStack.getItem().getTranslationKey();
            keys.putIfAbsent(itemKey, null);

            // Collect enchantment translation keys
            ItemEnchantmentsComponent enchantments =
                itemStack.getEnchantments();
            for (RegistryEntry<
                Enchantment
            > enchantment : enchantments.getEnchantments()) {
                Text desc = enchantment.value().description();
                collectTranslationKeys(desc, keys);
            }
        }
    }

    private static void populateTranslations(Map<String, String> keys) {
        Language language = Language.getInstance(); // Client-side Language instance
        for (Map.Entry<String, String> entry : keys.entrySet()) {
            entry.setValue(language.get(entry.getKey(), entry.getKey())); // Fallback to key if translation is missing
        }
    }
}
