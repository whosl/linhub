package com.linhub.android.core.cache

import com.linhub.android.core.model.ChatStyle
import com.linhub.android.core.model.LedgerEntry
import com.linhub.android.core.model.McpServer
import com.linhub.android.core.model.MemoryEntry
import com.linhub.android.core.model.Plan
import com.linhub.android.core.model.Skill
import com.linhub.android.core.model.UsageRecord
import kotlinx.serialization.Serializable

@Serializable
data class CachedBillingPayload(
    val plans: List<Plan>,
    val usage: List<UsageRecord>,
    val ledger: List<LedgerEntry>,
)

@Serializable
data class CachedSettingsPayload(
    val memories: List<MemoryEntry>,
    val styles: List<ChatStyle>,
    val userMcpServers: List<McpServer>,
)

@Serializable
data class CachedSkillsPayload(
    val mine: List<Skill>,
    val market: List<Skill>,
)
