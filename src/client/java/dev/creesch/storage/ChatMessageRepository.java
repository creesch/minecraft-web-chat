package dev.creesch.storage;

import com.google.gson.JsonObject;
import dev.creesch.model.WebsocketJsonMessage;
import net.fabricmc.loader.api.FabricLoader;
import org.sqlite.SQLiteDataSource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;

public class ChatMessageRepository {
    private final SQLiteDataSource dataSource;
    private static final String DB_NAME = "chat_messages.db";
    private static final String DATA_DIR = "web-chat";

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
        } catch (SQLException e) {
            throw new RuntimeException("Failed to initialize chat storage database", e);
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
}
