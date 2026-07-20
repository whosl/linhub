package com.linhub.android.core.cache

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [
        UserEntity::class,
        ModelEntity::class,
        ConversationEntity::class,
        MessageEntity::class,
        SyncStateEntity::class,
        CachedPayloadEntity::class,
    ],
    version = 2,
    exportSchema = true,
)
abstract class LinHubCacheDatabase : RoomDatabase() {
    abstract fun userDao(): UserDao
    abstract fun modelDao(): ModelDao
    abstract fun conversationDao(): ConversationDao
    abstract fun messageDao(): MessageDao
    abstract fun syncStateDao(): SyncStateDao
    abstract fun cachedPayloadDao(): CachedPayloadDao
}
