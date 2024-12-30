package dev.creesch.model;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class PlayerListInfoEntry {

    private String playerId;
    private String playerName;
    private String playerDisplayName;
    private String playerTextureUrl;
}
