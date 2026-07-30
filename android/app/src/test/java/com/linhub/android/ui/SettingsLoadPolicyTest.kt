package com.linhub.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsLoadPolicyTest {
    @Test
    fun `账户标签复用已登录用户且不发设置请求`() {
        assertEquals(
            emptySet<SettingsResource>(),
            settingsResourcesToLoad(
                SettingsSection.Account,
                emptySet(),
                emptySet(),
                userAvailable = true,
                force = false,
            ),
        )
        assertTrue(
            isSettingsSectionLoaded(
                SettingsSection.Account,
                emptySet(),
                userAvailable = true,
            ),
        )
    }

    @Test
    fun `三个数据标签只请求自身资源`() {
        assertEquals(
            setOf(SettingsResource.Memories),
            settingsResourcesForSection(SettingsSection.Memory),
        )
        assertEquals(
            setOf(SettingsResource.Styles),
            settingsResourcesForSection(SettingsSection.Styles),
        )
        assertEquals(
            setOf(SettingsResource.UserMcp),
            settingsResourcesForSection(SettingsSection.Mcp),
        )
    }

    @Test
    fun `过期快照可见但仍需刷新当前资源`() {
        val loaded = setOf(SettingsResource.Memories)

        assertTrue(isSettingsSectionLoaded(SettingsSection.Memory, loaded, true))
        assertEquals(
            setOf(SettingsResource.Memories),
            settingsResourcesToLoad(
                SettingsSection.Memory,
                loaded,
                freshResources = emptySet(),
                userAvailable = true,
                force = false,
            ),
        )
    }

    @Test
    fun `新鲜标签快速重进不重复请求`() {
        val loaded = SettingsResource.entries.toSet()

        assertEquals(
            emptySet<SettingsResource>(),
            settingsResourcesToLoad(
                SettingsSection.Mcp,
                loaded,
                freshResources = loaded,
                userAvailable = true,
                force = false,
            ),
        )
        assertFalse(
            isSettingsSectionLoading(SettingsSection.Mcp, setOf(SettingsResource.Styles)),
        )
    }

    @Test
    fun `整组缓存要求记忆风格和MCP全部新鲜`() {
        val incomplete = mapOf(
            SettingsResource.Memories to 10_000L,
            SettingsResource.Styles to 10_000L,
        )
        val complete = incomplete + (SettingsResource.UserMcp to 10_000L)

        assertFalse(areSettingsCacheResourcesFresh(incomplete, 20_000L, 60_000L))
        assertTrue(areSettingsCacheResourcesFresh(complete, 69_999L, 60_000L))
        assertFalse(areSettingsCacheResourcesFresh(complete, 70_000L, 60_000L))
    }
}
