package com.linhub.android.core.cache

import androidx.room.testing.MigrationTestHelper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CacheMigrationTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        LinHubCacheDatabase::class.java,
    )

    @Before
    fun removeStaleDatabase() {
        context.deleteDatabase(DATABASE_NAME)
    }

    @After
    fun cleanUpDatabase() {
        context.deleteDatabase(DATABASE_NAME)
    }

    @Test
    fun migrate1To2_preservesLegacyWorkspaceAndAddsPayloadCache() {
        helper.createDatabase(DATABASE_NAME, 1).apply {
            execSQL(
                """
                INSERT INTO cached_users (
                    id, email, name, avatar_url, role, created_at_epoch_millis,
                    balance_cents, default_model_id, subscription_plan_id,
                    subscription_plan_name, subscription_model_tier,
                    subscription_started_at_epoch_millis,
                    subscription_expires_at_epoch_millis,
                    subscription_used_quota_cents,
                    subscription_monthly_quota_cents, cached_at_epoch_millis
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """.trimIndent(),
                arrayOf<Any?>(
                    USER_ID, "migration@linhub.test", "迁移用户", null, "user", 10L,
                    321, MODEL_ID, "plan-pro", "Pro", "pro", 11L, 12L, 13, 14, 15L,
                ),
            )
            execSQL(
                """
                INSERT INTO cached_models (
                    id, provider_id, provider_kind, slug, display_name, description,
                    capabilities_json, enabled, input_price_per_m, output_price_per_m,
                    price_per_image, context_window, max_output_tokens, tier, sort_order,
                    cached_at_epoch_millis
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """.trimIndent(),
                arrayOf<Any?>(
                    MODEL_ID, "provider-e2e", "openai", "migration-model", "迁移模型", null,
                    "[\"text\"]", 1, 2, 3, null, 4096, 512, "pro", 7, 16L,
                ),
            )
            execSQL(
                """
                INSERT INTO cached_conversations (
                    id, title, project_id, skill_id, model_id, style_id, pinned, archived,
                    current_leaf_id, search_match_leaf_id, created_at_epoch_millis,
                    updated_at_epoch_millis, is_listed, cached_at_epoch_millis
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """.trimIndent(),
                arrayOf<Any?>(
                    CONVERSATION_ID, "迁移会话", "project-e2e", "skill-e2e", MODEL_ID,
                    "style-normal", 1, 0, MESSAGE_ID, null, 20L, 21L, 1, 22L,
                ),
            )
            execSQL(
                """
                INSERT INTO cached_messages (
                    id, conversation_id, parent_id, role, parts_json, plain_text, model_id,
                    created_at_epoch_millis, feedback, usage_input_tokens,
                    usage_output_tokens, usage_cost_cents, quoted_text, status,
                    detail_generation, cached_at_epoch_millis
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """.trimIndent(),
                arrayOf<Any?>(
                    MESSAGE_ID, CONVERSATION_ID, null, "assistant",
                    "[{\"type\":\"text\",\"text\":\"MIGRATION-PRESERVED\"}]",
                    "MIGRATION-PRESERVED", MODEL_ID, 23L, "up", 24, 25, 26,
                    "迁移引用", "complete", 27L, 28L,
                ),
            )
            execSQL(
                """
                INSERT INTO cache_sync_state (
                    key, last_attempt_at_epoch_millis, last_success_at_epoch_millis,
                    stale_after_epoch_millis, generation, next_cursor, end_reached, last_error
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """.trimIndent(),
                arrayOf<Any?>("workspace", 30L, 31L, 32L, 33L, "cursor-e2e", 1, null),
            )
            close()
        }

        val migrated = helper.runMigrationsAndValidate(
            DATABASE_NAME,
            2,
            true,
            CacheDatabaseManager.MIGRATION_1_2,
        )

        migrated.query("SELECT name, balance_cents FROM cached_users WHERE id = '$USER_ID'")
            .use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertEquals("迁移用户", cursor.getString(0))
                assertEquals(321, cursor.getInt(1))
            }
        migrated.query("SELECT display_name FROM cached_models WHERE id = '$MODEL_ID'")
            .use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertEquals("迁移模型", cursor.getString(0))
            }
        migrated.query(
            "SELECT title, current_leaf_id FROM cached_conversations " +
                "WHERE id = '$CONVERSATION_ID'",
        ).use { cursor ->
            assertTrue(cursor.moveToFirst())
            assertEquals("迁移会话", cursor.getString(0))
            assertEquals(MESSAGE_ID, cursor.getString(1))
        }
        migrated.query("SELECT plain_text, feedback FROM cached_messages WHERE id = '$MESSAGE_ID'")
            .use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertEquals("MIGRATION-PRESERVED", cursor.getString(0))
                assertEquals("up", cursor.getString(1))
            }
        migrated.query("SELECT generation, next_cursor FROM cache_sync_state WHERE key = 'workspace'")
            .use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertEquals(33L, cursor.getLong(0))
                assertEquals("cursor-e2e", cursor.getString(1))
            }

        migrated.execSQL(
            "INSERT INTO cached_payloads (key, payload_json, cached_at_epoch_millis) " +
                "VALUES (?, ?, ?)",
            arrayOf<Any?>("skills", "{\"probe\":\"PAYLOAD-V2-OK\"}", 40L),
        )
        migrated.query("SELECT payload_json FROM cached_payloads WHERE key = 'skills'")
            .use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertEquals("{\"probe\":\"PAYLOAD-V2-OK\"}", cursor.getString(0))
            }
        migrated.close()
    }

    private companion object {
        const val DATABASE_NAME = "linhub-cache-migration-e2e.db"
        const val USER_ID = "user-migration-e2e"
        const val MODEL_ID = "model-migration-e2e"
        const val CONVERSATION_ID = "conversation-migration-e2e"
        const val MESSAGE_ID = "message-migration-e2e"
    }
}
