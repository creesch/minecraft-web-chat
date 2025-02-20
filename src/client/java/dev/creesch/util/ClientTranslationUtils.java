package dev.creesch.util;

import java.util.HashMap;
import java.util.Map;
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
                    keys.putIfAbsent(stringArg, null); // Treat plain strings as potential keys
                }
            }
        }

        // Collect keys from siblings (e.g., appended text)
        for (Text sibling : text.getSiblings()) {
            collectTranslationKeys(sibling, keys);
        }
    }

    private static void populateTranslations(Map<String, String> keys) {
        Language language = Language.getInstance(); // Client-side Language instance
        for (Map.Entry<String, String> entry : keys.entrySet()) {
            entry.setValue(language.get(entry.getKey(), entry.getKey())); // Fallback to key if translation is missing
        }
    }
}
