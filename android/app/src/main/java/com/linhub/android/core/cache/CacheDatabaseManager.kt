package com.linhub.android.core.cache

import android.content.Context
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import java.io.Closeable
import java.security.MessageDigest

class CacheDatabaseManager(context: Context) : Closeable {
    private val appContext = context.applicationContext
    private val lock = Any()

    @Volatile
    private var active: ActiveDatabase? = null

    fun databaseFor(accountId: String): LinHubCacheDatabase {
        require(accountId.isNotBlank()) { "accountId must not be blank" }
        active?.takeIf { it.accountId == accountId }?.let { return it.database }

        return synchronized(lock) {
            active?.takeIf { it.accountId == accountId }?.database ?: run {
                active?.database?.close()
                val database = Room.databaseBuilder(
                    appContext,
                    LinHubCacheDatabase::class.java,
                    databaseName(accountId),
                )
                    .addMigrations(MIGRATION_1_2)
                    .setJournalMode(RoomDatabase.JournalMode.WRITE_AHEAD_LOGGING)
                    .build()
                active = ActiveDatabase(accountId, database)
                database
            }
        }
    }

    fun deleteFor(accountId: String): Boolean = synchronized(lock) {
        active?.takeIf { it.accountId == accountId }?.let {
            it.database.close()
            active = null
        }
        appContext.deleteDatabase(databaseName(accountId))
    }

    override fun close() {
        synchronized(lock) {
            active?.database?.close()
            active = null
        }
    }

    companion object {
        fun databaseName(accountId: String): String {
            require(accountId.isNotBlank()) { "accountId must not be blank" }
            val digest = MessageDigest.getInstance("SHA-256")
                .digest(accountId.toByteArray(Charsets.UTF_8))
            val suffix = buildString(24) {
                repeat(12) { index ->
                    val value = digest[index].toInt() and 0xff
                    append(HEX[value ushr 4])
                    append(HEX[value and 0x0f])
                }
            }
            return "linhub_cache_$suffix.db"
        }

        private const val HEX = "0123456789abcdef"

        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `cached_payloads` (" +
                        "`key` TEXT NOT NULL, `payload_json` TEXT NOT NULL, " +
                        "`cached_at_epoch_millis` INTEGER NOT NULL, PRIMARY KEY(`key`))",
                )
            }
        }
    }

    private data class ActiveDatabase(
        val accountId: String,
        val database: LinHubCacheDatabase,
    )
}
