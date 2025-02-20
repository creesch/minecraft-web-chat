package dev.creesch.model;

import com.google.gson.JsonObject;
import java.util.Map;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ChatMessagePayload {

    private boolean history;
    private String uuid;
    private JsonObject component;
    private Map<String, String> translations;
    private boolean isPing;
}
