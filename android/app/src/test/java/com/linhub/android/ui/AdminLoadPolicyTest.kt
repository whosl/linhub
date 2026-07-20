package com.linhub.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AdminLoadPolicyTest {
    @Test
    fun `首次供应商标签只需要一个资源`() {
        assertEquals(
            setOf(AdminResource.Providers),
            adminResourcesForSection(AdminSection.Providers),
        )
    }

    @Test
    fun `用户和系统设置保留跨域依赖`() {
        assertEquals(
            setOf(AdminResource.Users, AdminResource.Plans),
            adminResourcesForSection(AdminSection.Users),
        )
        assertEquals(
            setOf(AdminResource.Settings, AdminResource.Models),
            adminResourcesForSection(AdminSection.Settings),
        )
    }

    @Test
    fun `每个标签都有明确资源且合计覆盖全部管理资源`() {
        val dependencies = AdminSection.entries.associateWith(::adminResourcesForSection)

        assertTrue(dependencies.values.all(Set<AdminResource>::isNotEmpty))
        assertEquals(AdminResource.entries.toSet(), dependencies.values.flatten().toSet())
    }

    @Test
    fun `标签必须等所有依赖成功才算加载完成`() {
        assertFalse(isAdminSectionLoaded(AdminSection.Users, setOf(AdminResource.Users)))
        assertTrue(
            isAdminSectionLoaded(
                AdminSection.Users,
                setOf(AdminResource.Users, AdminResource.Plans),
            ),
        )
        assertTrue(
            isAdminSectionLoading(AdminSection.Settings, setOf(AdminResource.Models)),
        )
        assertFalse(
            isAdminSectionLoading(AdminSection.Settings, setOf(AdminResource.Users)),
        )
    }
}
