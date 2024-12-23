package dev.creesch.model;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class HistoryMetaDataPayload {
    private long oldestMessageTimestamp;
    boolean moreHistoryAvailable;
}
