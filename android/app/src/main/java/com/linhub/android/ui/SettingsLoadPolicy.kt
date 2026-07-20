package com.linhub.android.ui

enum class SettingsSection(val label: String) {
    Account("账户"),
    Memory("记忆"),
    Styles("回复风格"),
    Mcp("MCP 连接器"),
}

enum class SettingsResource {
    User,
    Memories,
    Styles,
    UserMcp,
}

internal val SETTINGS_CACHE_RESOURCES = setOf(
    SettingsResource.Memories,
    SettingsResource.Styles,
    SettingsResource.UserMcp,
)

internal fun settingsResourcesForSection(section: SettingsSection): Set<SettingsResource> =
    when (section) {
        SettingsSection.Account -> setOf(SettingsResource.User)
        SettingsSection.Memory -> setOf(SettingsResource.Memories)
        SettingsSection.Styles -> setOf(SettingsResource.Styles)
        SettingsSection.Mcp -> setOf(SettingsResource.UserMcp)
    }

internal fun settingsResourcesToLoad(
    section: SettingsSection,
    loadedResources: Set<SettingsResource>,
    freshResources: Set<SettingsResource>,
    userAvailable: Boolean,
    force: Boolean,
): Set<SettingsResource> = settingsResourcesForSection(section).filterTo(linkedSetOf()) { resource ->
    when {
        force -> true
        resource == SettingsResource.User -> !userAvailable && resource !in loadedResources
        else -> resource !in loadedResources || resource !in freshResources
    }
}

internal fun isSettingsSectionLoaded(
    section: SettingsSection,
    loadedResources: Set<SettingsResource>,
    userAvailable: Boolean,
): Boolean = settingsResourcesForSection(section).all { resource ->
    resource in loadedResources || (resource == SettingsResource.User && userAvailable)
}

internal fun isSettingsSectionLoading(
    section: SettingsSection,
    loadingResources: Set<SettingsResource>,
): Boolean = settingsResourcesForSection(section).any(loadingResources::contains)

internal fun areSettingsCacheResourcesFresh(
    loadedAtEpochMillis: Map<SettingsResource, Long>,
    nowEpochMillis: Long,
    ttlMillis: Long,
): Boolean = SETTINGS_CACHE_RESOURCES.all { resource ->
    isLoadedSnapshotFresh(
        loadedAtEpochMillis[resource],
        nowEpochMillis,
        ttlMillis,
    )
}
