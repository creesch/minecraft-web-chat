package dev.creesch.model;

import com.google.gson.JsonObject;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class PlayerListInfoEntry {

    private String playerId;
    private String playerName;
    private JsonObject playerDisplayName;
    private String playerTextureUrl;
}
