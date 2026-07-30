package com.linhub.android.ui

enum class AdminSection(val label: String) {
    Providers("供应商"),
    Models("模型与计价"),
    Plans("套餐"),
    Users("用户"),
    Skills("技能审核"),
    Settings("系统设置"),
    Mcp("全局 MCP"),
    Codes("兑换码"),
    Usage("用量"),
}

enum class AdminResource {
    Providers,
    Models,
    Plans,
    Users,
    PendingSkills,
    Settings,
    GlobalMcp,
    RedeemCodes,
    Usage,
}

/**
 * 管理后台与 Web 一样按当前标签读取数据，避免首次进入同时等待所有管理接口。
 * 用户订阅编辑依赖套餐，系统设置里的模型选择依赖模型列表，因此保留这两组显式依赖。
 */
internal fun adminResourcesForSection(section: AdminSection): Set<AdminResource> = when (section) {
    AdminSection.Providers -> setOf(AdminResource.Providers)
    AdminSection.Models -> setOf(AdminResource.Models)
    AdminSection.Plans -> setOf(AdminResource.Plans)
    AdminSection.Users -> setOf(AdminResource.Users, AdminResource.Plans)
    AdminSection.Skills -> setOf(AdminResource.PendingSkills)
    AdminSection.Settings -> setOf(AdminResource.Settings, AdminResource.Models)
    AdminSection.Mcp -> setOf(AdminResource.GlobalMcp)
    AdminSection.Codes -> setOf(AdminResource.RedeemCodes)
    AdminSection.Usage -> setOf(AdminResource.Usage)
}

internal fun isAdminSectionLoaded(
    section: AdminSection,
    loadedResources: Set<AdminResource>,
): Boolean = loadedResources.containsAll(adminResourcesForSection(section))

internal fun isAdminSectionLoading(
    section: AdminSection,
    loadingResources: Set<AdminResource>,
): Boolean = adminResourcesForSection(section).any(loadingResources::contains)
