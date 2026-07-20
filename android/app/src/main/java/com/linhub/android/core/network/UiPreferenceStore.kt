package com.linhub.android.core.network

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.linhub.android.core.model.FontSizePreset
import com.linhub.android.core.model.ThemeMode
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID

private val Context.linhubUiDataStore by preferencesDataStore(name = "linhub_ui")

class UiPreferenceStore(context: Context) {
    private val dataStore = context.applicationContext.linhubUiDataStore
    private val json = Json { ignoreUnknownKeys = true }

    val defaultStyleId: Flow<String?> = dataStore.data.map { preferences ->
        preferences[KEY_DEFAULT_STYLE_ID]
    }

    val modelThinkingEfforts: Flow<Map<String, String>> = dataStore.data.map { preferences ->
        decodeThinkingEfforts(preferences[KEY_MODEL_THINKING_EFFORTS], json)
    }

    val messageRailEnabled: Flow<Boolean> = dataStore.data.map { preferences ->
        preferences[KEY_MESSAGE_RAIL_ENABLED] ?: true
    }

    val themeMode: Flow<ThemeMode> = dataStore.data.map { preferences ->
        decodeThemeMode(preferences[KEY_THEME_MODE])
    }

    val fontSizePreset: Flow<FontSizePreset> = dataStore.data.map { preferences ->
        decodeFontSizePreset(preferences[KEY_FONT_SIZE_PRESET])
    }

    val collapsedProjectIds: Flow<Set<String>> = dataStore.data.map { preferences ->
        sanitizeProjectIds(preferences[KEY_COLLAPSED_PROJECT_IDS])
    }

    val pinnedProjectIds: Flow<Set<String>> = dataStore.data.map { preferences ->
        sanitizeProjectIds(preferences[KEY_PINNED_PROJECT_IDS])
    }

    suspend fun setDefaultStyleId(id: String) {
        dataStore.edit { it[KEY_DEFAULT_STYLE_ID] = id }
    }

    suspend fun setModelThinkingEffort(modelId: String, effort: String) {
        require(modelId.isNotBlank() && effort in THINKING_EFFORTS)
        dataStore.edit { preferences ->
            val current = decodeThinkingEfforts(preferences[KEY_MODEL_THINKING_EFFORTS], json)
            preferences[KEY_MODEL_THINKING_EFFORTS] = json.encodeToString(current + (modelId to effort))
        }
    }

    suspend fun resetModelThinkingEffort(modelId: String) {
        dataStore.edit { preferences ->
            val current = decodeThinkingEfforts(preferences[KEY_MODEL_THINKING_EFFORTS], json)
            preferences[KEY_MODEL_THINKING_EFFORTS] = json.encodeToString(current - modelId)
        }
    }

    suspend fun setMessageRailEnabled(enabled: Boolean) {
        dataStore.edit { it[KEY_MESSAGE_RAIL_ENABLED] = enabled }
    }

    suspend fun setThemeMode(mode: ThemeMode) {
        dataStore.edit { it[KEY_THEME_MODE] = mode.storageValue }
    }

    suspend fun setFontSizePreset(preset: FontSizePreset) {
        dataStore.edit { it[KEY_FONT_SIZE_PRESET] = preset.storageValue }
    }

    suspend fun setCollapsedProjectIds(ids: Set<String>) {
        dataStore.edit { it[KEY_COLLAPSED_PROJECT_IDS] = sanitizeProjectIds(ids) }
    }

    suspend fun setPinnedProjectIds(ids: Set<String>) {
        dataStore.edit { it[KEY_PINNED_PROJECT_IDS] = sanitizeProjectIds(ids) }
    }

    /** 未知结果（超时、进程终止）后复用同一操作键，避免手动重试创建第二笔订单。 */
    suspend fun getOrCreateBillingOrderIdempotencyKey(signature: String): String {
        require(signature.isNotBlank())
        var resolved = ""
        dataStore.edit { preferences ->
            resolved = reusableBillingOrderIdempotencyKey(
                requestedSignature = signature,
                storedSignature = preferences[KEY_BILLING_ORDER_SIGNATURE],
                storedKey = preferences[KEY_BILLING_ORDER_IDEMPOTENCY_KEY],
            ) ?: "android-${UUID.randomUUID()}"
            preferences[KEY_BILLING_ORDER_SIGNATURE] = signature
            preferences[KEY_BILLING_ORDER_IDEMPOTENCY_KEY] = resolved
        }
        return resolved
    }

    suspend fun clearBillingOrderIdempotencyKey(idempotencyKey: String) {
        dataStore.edit { preferences ->
            if (preferences[KEY_BILLING_ORDER_IDEMPOTENCY_KEY] == idempotencyKey) {
                preferences.remove(KEY_BILLING_ORDER_SIGNATURE)
                preferences.remove(KEY_BILLING_ORDER_IDEMPOTENCY_KEY)
            }
        }
    }

    private companion object {
        val KEY_DEFAULT_STYLE_ID = stringPreferencesKey("default_reply_style_id")
        val KEY_MODEL_THINKING_EFFORTS = stringPreferencesKey("model_thinking_efforts")
        val KEY_MESSAGE_RAIL_ENABLED = booleanPreferencesKey("message_rail_enabled")
        val KEY_THEME_MODE = stringPreferencesKey("theme_mode")
        val KEY_FONT_SIZE_PRESET = stringPreferencesKey("font_size_preset")
        val KEY_COLLAPSED_PROJECT_IDS = stringSetPreferencesKey("collapsed_project_ids")
        val KEY_PINNED_PROJECT_IDS = stringSetPreferencesKey("pinned_project_ids")
        val KEY_BILLING_ORDER_SIGNATURE = stringPreferencesKey("billing_order_signature")
        val KEY_BILLING_ORDER_IDEMPOTENCY_KEY = stringPreferencesKey("billing_order_idempotency_key")
    }
}

internal fun decodeThemeMode(raw: String?): ThemeMode =
    ThemeMode.entries.firstOrNull { it.storageValue == raw } ?: ThemeMode.SYSTEM

internal fun decodeFontSizePreset(raw: String?): FontSizePreset =
    FontSizePreset.entries.firstOrNull { it.storageValue == raw } ?: FontSizePreset.MEDIUM

internal fun sanitizeProjectIds(ids: Set<String>?): Set<String> =
    ids.orEmpty().filterTo(linkedSetOf(), String::isNotBlank)

internal fun reusableBillingOrderIdempotencyKey(
    requestedSignature: String,
    storedSignature: String?,
    storedKey: String?,
): String? = storedKey?.takeIf {
    requestedSignature.isNotBlank() && storedSignature == requestedSignature &&
        it.startsWith("android-") && it.length in 16..128
}

internal fun decodeThinkingEfforts(
    raw: String?,
    json: Json = Json { ignoreUnknownKeys = true },
): Map<String, String> = runCatching {
    json.decodeFromString<Map<String, String>>(raw.orEmpty())
        .filter { (modelId, effort) -> modelId.isNotBlank() && effort in THINKING_EFFORTS }
}.getOrDefault(emptyMap())

private val THINKING_EFFORTS = setOf("minimal", "low", "medium", "high", "xhigh", "max")
