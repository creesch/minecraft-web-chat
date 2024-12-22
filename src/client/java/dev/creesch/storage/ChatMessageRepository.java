package dev.creesch.storage;

import com.google.gson.JsonObject;
import dev.creesch.model.WebsocketJsonMessage;
import dev.creesch.util.NamedLogger;
import net.fabricmc.loader.api.FabricLoader;
import org.sqlite.SQLiteDataSource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

import static dev.creesch.model.WebsocketMessageBuilder.createHistoricChatMessage;

public class ChatMessageRepository {
    private final SQLiteDataSource dataSource;
    private static final String DB_NAME = "chat_messages.db";
    private static final String DATA_DIR = "web-chat";

    private static final int CURRENT_SCHEMA_VERSION = 1;

    private static final NamedLogger LOGGER = new NamedLogger("web-chat");

    public ChatMessageRepository() {
        Path databasePath = FabricLoader.getInstance()
            .getGameDir()
            .resolve(DATA_DIR)
            .resolve(DB_NAME);

        try {
            Files.createDirectories(databasePath.getParent());
        } catch (IOException e) {
            throw new RuntimeException("Failed to create data for web-chat database directory", e);
        }


        dataSource = new SQLiteDataSource();
        dataSource.setUrl("jdbc:sqlite:" + databasePath);
        initializeDatabase();
    }

    private void initializeDatabase() {
        try (Connection conn = dataSource.getConnection()) {
            conn.createStatement().execute("""
                    CREATE TABLE IF NOT EXISTS messages (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp BIGINT NOT NULL,
                        server_id TEXT NOT NULL,
                        server_name TEXT NOT NULL,
                        message_id TEXT NOT NULL,
                        message_json TEXT NOT NULL,
                        minecraft_version TEXT
                    )
                """);

            // Create composite index for server_id + timestamp queries
            conn.createStatement().execute(
                "CREATE INDEX IF NOT EXISTS idx_server_id_timestamp ON messages(server_id, timestamp DESC)"
            );

            // Version table
            conn.createStatement().execute("""
                    CREATE TABLE IF NOT EXISTS schema_version (
                        version INTEGER PRIMARY KEY
                    )
                """);

            // Check schema
            checkSchemaVersion(conn);
        } catch (SQLException e) {
            LOGGER.error("Failed to initialize chat storage database", e);
            throw new RuntimeException("Failed to initialize chat storage database", e);
        }
    }

    private void checkSchemaVersion(Connection conn) throws SQLException {
        try (var stmt = conn.createStatement();
             var rs = stmt.executeQuery("SELECT version FROM schema_version")) {

            if (!rs.next()) {
                // New database, set current version
                try (var insertStmt = conn.prepareStatement("INSERT INTO schema_version (version) VALUES (?)")) {
                    insertStmt.setInt(1, CURRENT_SCHEMA_VERSION);
                    insertStmt.execute();
                }
                return; // Don't need to do anything else here.
            }

            int dbVersion = rs.getInt("version");

            // Mod was likely downgraded from a version with a newer schema.
            if (dbVersion > CURRENT_SCHEMA_VERSION) {
                LOGGER.error("Database schema version {} is newer than supported version {}", dbVersion, CURRENT_SCHEMA_VERSION);
                throw new RuntimeException("Database schema version " + dbVersion +
                    " is newer than supported version " + CURRENT_SCHEMA_VERSION);
            }

            // Unless someone is messing with the database manually this should not happen yet.
            // If they are messing with the database it likely isn't good. Throw an error.
            // TODO: put in actual migration in the future when needed.
            if (dbVersion < CURRENT_SCHEMA_VERSION) {
                LOGGER.error("Database schema version {} is older than supported version {}. Time travel?", dbVersion, CURRENT_SCHEMA_VERSION);
                throw new RuntimeException("Database schema version " + dbVersion +
                    " is older than supported version " + CURRENT_SCHEMA_VERSION);
            }
        }
    }

    // TODO: keep eye on performance.
    // If needed implement a queuing mechanism to do messages in chuncks and transactions.
    public void saveMessage(WebsocketJsonMessage message) {
        String sql = """
            INSERT INTO messages (
                timestamp,
                server_id,
                server_name,
                message_id,
                message_json,
                minecraft_version
            ) VALUES (?, ?, ?, ?, ?, ?)
            """;

        try (Connection conn = dataSource.getConnection();
             PreparedStatement statement = conn.prepareStatement(sql)) {

            // Cast payload to JsonObject since we need to access some info
            // TODO: Implement payload specific object instead of it being a json object.
            Object rawPayload = message.getPayload();
            if (!(rawPayload instanceof JsonObject payload)) {
                throw new IllegalArgumentException("Message payload is not a JsonObject");
            }

            statement.setLong(1, message.getTimestamp());
            statement.setString(2, message.getServer().getIdentifier());
            statement.setString(3, message.getServer().getName());
            statement.setString(4, payload.get("uuid").getAsString());
            statement.setString(5, payload.get("component").toString());
            statement.setString(6, message.getMinecraftVersion());

            statement.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to save chat message", e);
        }
    }

    public List<WebsocketJsonMessage> getMessages(String serverId, int limit) {
        List<WebsocketJsonMessage> messages = new ArrayList<>();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement stmt = conn.prepareStatement("""
                 SELECT
                     timestamp,
                     server_id,
                     server_name,
                     message_id,
                     message_json,
                     minecraft_version
                 FROM
                     messages
                 WHERE
                     server_id = ?
                 ORDER BY
                     timestamp DESC
                 LIMIT
                     ?
                 """)) {
            stmt.setString(1, serverId);
            stmt.setInt(2, limit);

            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    long timestamp = rs.getLong("timestamp");
                    String serverName = rs.getString("server_name");
                    String messageId = rs.getString("message_id");
                    String messageJson = rs.getString("message_json");
                    String minecraftVersion = rs.getString("minecraft_version");

                    messages.add(
                        createHistoricChatMessage(timestamp, serverId, serverName, messageId, messageJson, minecraftVersion)
                    );

                }
            }
        } catch (SQLException e) {
            // Just throw an error here, no reason to crash the game over this.
            LOGGER.error("Failed to retrieve chat messages for server: {}", serverId);
        }
        return messages;
    }
}
