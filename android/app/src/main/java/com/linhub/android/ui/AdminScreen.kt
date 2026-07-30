package com.linhub.android.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.AccountBalanceWallet
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.CloudDownload
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Science
import androidx.compose.material3.ButtonDefaults




import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.linhub.android.core.model.AdminModelRequest
import com.linhub.android.core.model.AdminPlanRequest
import com.linhub.android.core.model.AdminProviderRequest
import com.linhub.android.core.model.AdminSettingsPatch
import com.linhub.android.core.model.AdminUserDetail
import com.linhub.android.core.model.EngineConfig
import com.linhub.android.core.model.EngineTestRequest
import com.linhub.android.core.model.McpServer
import com.linhub.android.core.model.McpServerRequest
import com.linhub.android.core.model.LedgerEntry
import com.linhub.android.core.model.Model
import com.linhub.android.core.model.Plan
import com.linhub.android.core.model.Provider
import com.linhub.android.core.model.Skill
import com.linhub.android.core.model.User
import com.linhub.android.core.model.UsageRecord
import com.linhub.android.ui.design.LinHubSwitch
import java.util.Locale
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Duration
import java.time.Instant

private enum class UserDetailSection(val label: String) {
    Usage("用量记录"), Ledger("余额流水"),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminScreen(
    state: AdminUiState,
    currentUserId: String?,
    loading: Boolean,
    onOpenMenu: () -> Unit,
    onRefresh: () -> Unit,
    onSelectSection: (AdminSection) -> Unit,
    onSaveProvider: (AdminProviderRequest) -> Unit,
    onDeleteProvider: (Provider) -> Unit,
    onLoadRemoteModels: (Provider) -> Unit,
    onAddRemoteModels: (Provider, List<String>) -> Unit,
    onSaveModel: (AdminModelRequest) -> Unit,
    onDeleteModel: (Model) -> Unit,
    onTestModel: (Model) -> Unit,
    onSavePlan: (AdminPlanRequest) -> Unit,
    onDeletePlan: (Plan) -> Unit,
    onLoadUser: (User) -> Unit,
    onGrantBalance: (User, Int, String) -> Unit,
    onUpdateSubscription: (User, String?, Int) -> Unit,
    onDeleteUser: (User) -> Unit,
    onReviewSkill: (Skill, Boolean) -> Unit,
    onImportSkillPackage: (Uri) -> Unit,
    onSaveSettings: (AdminSettingsPatch) -> Unit,
    onTestEngine: (EngineTestRequest) -> Unit,
    onSaveMcp: (McpServerRequest) -> Unit,
    onTestMcp: (McpServer) -> Unit,
    onDeleteMcp: (McpServer) -> Unit,
    onGenerateCodes: (Int, Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val section = state.selectedSection
    val sectionLoaded = isAdminSectionLoaded(section, state.loadedResources)
    val sectionLoading = loading || isAdminSectionLoading(section, state.loadingResources)
    val skillPackagePicker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) { uri ->
        uri?.let(onImportSkillPackage)
    }
    Scaffold(
        modifier = modifier,
        contentWindowInsets = WindowInsets(0),
        topBar = {
            WebPageHeader(
                title = "管理后台",
                description = "供应商、模型计价、套餐与系统设置 — 普通用户即开即用",
                onOpenMenu = onOpenMenu,
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            WebTabRow(
                labels = AdminSection.entries.map(AdminSection::label),
                selectedIndex = section.ordinal,
                onSelect = { onSelectSection(AdminSection.entries[it]) },
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )
            if (sectionLoading && !sectionLoaded) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(strokeWidth = 2.dp)
                }
            } else if (!sectionLoaded) {
                AdminSectionLoadFailure(onRefresh)
            } else {
                when (section) {
                    AdminSection.Providers -> AdminProviders(
                        state, sectionLoading, onSaveProvider, onDeleteProvider,
                        onLoadRemoteModels, onAddRemoteModels,
                    )
                    AdminSection.Models -> AdminModels(
                        state, sectionLoading, onSaveModel, onDeleteModel, onTestModel,
                    )
                    AdminSection.Plans -> AdminPlans(
                        state, sectionLoading, onSavePlan, onDeletePlan,
                    )
                    AdminSection.Users -> AdminUsers(
                        state, currentUserId, sectionLoading, onLoadUser, onGrantBalance,
                        onUpdateSubscription, onDeleteUser,
                    )
                    AdminSection.Skills -> AdminSkills(
                        skills = state.pendingSkills,
                        loading = sectionLoading,
                        onReview = onReviewSkill,
                        onImport = {
                            skillPackagePicker.launch(
                                arrayOf("application/zip", "application/octet-stream"),
                            )
                        },
                    )
                    AdminSection.Settings -> AdminSettings(
                        state, sectionLoading, onSaveSettings, onTestEngine,
                    )
                    AdminSection.Mcp -> AdminMcp(
                        state.globalMcpServers, sectionLoading,
                        onSaveMcp, onTestMcp, onDeleteMcp,
                    )
                    AdminSection.Codes -> AdminCodes(
                        state, sectionLoading, onGenerateCodes,
                    )
                    AdminSection.Usage -> AdminUsage(state)
                }
            }
        }
    }
}

@Composable
private fun AdminSectionLoadFailure(onRetry: () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text("当前标签加载失败", fontWeight = FontWeight.SemiBold)
            Text(
                "请检查网络后重试，其他已加载标签不会受影响。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedButton(onClick = onRetry) { Text("重试") }
        }
    }
}

@Composable
private fun AdminProviders(
    state: AdminUiState,
    loading: Boolean,
    onSave: (AdminProviderRequest) -> Unit,
    onDelete: (Provider) -> Unit,
    onLoadRemote: (Provider) -> Unit,
    onAddRemote: (Provider, List<String>) -> Unit,
) {
    var editor by remember { mutableStateOf<Provider?>(null) }
    var creating by remember { mutableStateOf(false) }
    var remoteProvider by remember { mutableStateOf<Provider?>(null) }
    AdminList(addLabel = "添加供应商", loading = loading, onAdd = { creating = true }) {
        items(state.providers, key = Provider::id) { provider ->
            AdminCard {
                BoxWithConstraints(Modifier.fillMaxWidth()) {
                    if (maxWidth < 600.dp) {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                ProviderSummary(provider, Modifier.weight(1f))
                                ProviderEnabledSwitch(provider, loading, onSave)
                            }
                            ProviderActionButtons(
                                provider = provider,
                                loading = loading,
                                modifier = Modifier.fillMaxWidth(),
                                onTest = { onLoadRemote(provider) },
                                onFetch = {
                                    remoteProvider = provider
                                    onLoadRemote(provider)
                                },
                                onEdit = { editor = provider },
                            )
                        }
                    } else {
                        Row(
                            modifier = Modifier.fillMaxWidth().heightIn(min = 96.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            ProviderSummary(provider, Modifier.weight(1f))
                            ProviderActionButtons(
                                provider = provider,
                                loading = loading,
                                onTest = { onLoadRemote(provider) },
                                onFetch = {
                                    remoteProvider = provider
                                    onLoadRemote(provider)
                                },
                                onEdit = { editor = provider },
                            )
                            ProviderEnabledSwitch(provider, loading, onSave)
                        }
                    }
                }
            }
        }
    }
    if (creating || editor != null) {
        ProviderEditor(editor, onDismiss = { creating = false; editor = null }, onSave = onSave)
    }
    remoteProvider?.let { provider ->
        RemoteModelsDialog(
            provider = provider,
            models = state.remoteModels[provider.id].orEmpty(),
            loading = loading,
            onDismiss = { remoteProvider = null },
            onAdd = { onAddRemote(provider, it) },
        )
    }
}

@Composable
private fun ProviderSummary(provider: Provider, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        Icon(
            Icons.Rounded.Key,
            contentDescription = null,
            modifier = Modifier.size(16.dp).padding(top = 2.dp),
            tint = MaterialTheme.colorScheme.primary,
        )
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                provider.name,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
            )
            Text(
                provider.kind,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                buildString {
                    append(provider.apiKeyMasked ?: "未配置密钥")
                    provider.baseUrl?.let { append(" · ").append(it) }
                },
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun ProviderActionButtons(
    provider: Provider,
    loading: Boolean,
    modifier: Modifier = Modifier,
    onTest: () -> Unit,
    onFetch: () -> Unit,
    onEdit: () -> Unit,
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.End,
    ) {
        val canConnect = !loading && !provider.apiKeyMasked.isNullOrBlank()
        OutlinedButton(
            onClick = onTest,
            enabled = canConnect,
            modifier = Modifier.heightIn(min = 32.dp),
            shape = RoundedCornerShape(8.dp),
            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp),
            colors = ButtonDefaults.outlinedButtonColors(
                disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.68f),
            ),
        ) {
            Icon(Icons.Rounded.CheckCircle, contentDescription = null, modifier = Modifier.size(15.dp))
            Text("测试", style = MaterialTheme.typography.labelMedium)
        }
        Spacer(Modifier.size(6.dp))
        OutlinedButton(
            onClick = onFetch,
            enabled = canConnect,
            modifier = Modifier.heightIn(min = 32.dp),
            shape = RoundedCornerShape(8.dp),
            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp),
            colors = ButtonDefaults.outlinedButtonColors(
                disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.68f),
            ),
        ) {
            Icon(Icons.Rounded.CloudDownload, contentDescription = null, modifier = Modifier.size(15.dp))
            Text("获取模型", style = MaterialTheme.typography.labelMedium)
        }
        IconButton(onClick = onEdit, enabled = !loading, modifier = Modifier.size(40.dp)) {
            Icon(Icons.Rounded.Edit, contentDescription = "编辑供应商", modifier = Modifier.size(17.dp))
        }
    }
}

@Composable
private fun ProviderEnabledSwitch(
    provider: Provider,
    loading: Boolean,
    onSave: (AdminProviderRequest) -> Unit,
) {
    LinHubSwitch(
        checked = provider.enabled,
        onCheckedChange = { onSave(provider.toRequest(enabled = it)) },
        enabled = !loading,
        modifier = Modifier.scale(0.72f),
    )
}

@Composable
private fun ProviderEditor(
    provider: Provider?,
    onDismiss: () -> Unit,
    onSave: (AdminProviderRequest) -> Unit,
) {
    var name by remember(provider?.id) { mutableStateOf(provider?.name.orEmpty()) }
    var kind by remember(provider?.id) { mutableStateOf(provider?.kind ?: "openai") }
    var baseUrl by remember(provider?.id) { mutableStateOf(provider?.baseUrl.orEmpty()) }
    var apiKey by remember(provider?.id) { mutableStateOf("") }
    var enabled by remember(provider?.id) { mutableStateOf(provider?.enabled ?: true) }
    var store by remember(provider?.id) { mutableStateOf(provider?.storeEnabled ?: true) }
    AdminEditorDialog(
        title = if (provider == null) "添加供应商" else "编辑供应商",
        onDismiss = onDismiss,
        canSave = name.isNotBlank(),
        onSave = {
            onSave(AdminProviderRequest(
                id = provider?.id,
                kind = kind,
                name = name.trim(),
                baseUrl = baseUrl.trim().takeIf(String::isNotEmpty),
                apiKey = apiKey.trim().takeIf(String::isNotEmpty),
                enabled = enabled,
                storeEnabled = store,
            ))
            onDismiss()
        },
    ) {
        OutlinedTextField(name, { name = it }, label = { Text("名称") }, modifier = Modifier.fillMaxWidth())
        Text("类型", style = MaterialTheme.typography.labelMedium)
        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            items(PROVIDER_KINDS) { value ->
                FilterChip(selected = kind == value, onClick = { kind = value }, label = { Text(value) })
            }
        }
        OutlinedTextField(baseUrl, { baseUrl = it }, label = { Text("Base URL") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(
            apiKey,
            { apiKey = it },
            label = { Text("API Key") },
            placeholder = { Text(provider?.apiKeyMasked ?: "输入新密钥") },
            modifier = Modifier.fillMaxWidth(),
        )
        ToggleLine("启用供应商", enabled) { enabled = it }
        if (kind == "openai") {
            ToggleLine("Responses API 持久化", store) { store = it }
            Text(
                "中转网关不兼容多步工具时请关闭。",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun RemoteModelsDialog(
    provider: Provider,
    models: List<com.linhub.android.core.model.RemoteModel>,
    loading: Boolean,
    onDismiss: () -> Unit,
    onAdd: (List<String>) -> Unit,
) {
    var selected by remember(provider.id, models) { mutableStateOf(emptySet<String>()) }
    var filter by remember(provider.id) { mutableStateOf("") }
    val visibleModels = models.filter {
        val query = filter.trim()
        query.isEmpty() || it.slug.contains(query, ignoreCase = true) ||
            it.displayName?.contains(query, ignoreCase = true) == true
    }
    val visibleAddable = visibleModels.filterNot { it.added }.map { it.slug }.toSet()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("${provider.name} · 远端模型") },
        text = {
            if (loading && models.isEmpty()) {
                Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(strokeWidth = 2.dp)
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = filter,
                        onValueChange = { filter = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("筛选模型") },
                        placeholder = { Text("输入模型名或 slug") },
                        singleLine = true,
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            "共 ${visibleModels.size} 个 · 已选 ${selected.size} 个",
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        TextButton(
                            onClick = { selected = selected + visibleAddable },
                            enabled = visibleAddable.isNotEmpty(),
                        ) { Text("全选未添加") }
                        TextButton(onClick = { selected = emptySet() }, enabled = selected.isNotEmpty()) {
                            Text("清空")
                        }
                    }
                    LazyColumn(Modifier.heightIn(max = 360.dp)) {
                    if (visibleModels.isEmpty()) {
                        item {
                            Text(
                                "没有匹配的模型",
                                modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    items(visibleModels, key = { it.slug }) { model ->
                        val checked = model.slug in selected
                        Row(
                            Modifier.fillMaxWidth().clickable(enabled = !model.added) {
                                selected = if (checked) selected - model.slug else selected + model.slug
                            }.padding(vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(model.displayName ?: model.slug)
                                Text(model.slug, style = MaterialTheme.typography.labelSmall)
                            }
                            FilterChip(
                                selected = checked || model.added,
                                enabled = !model.added,
                                onClick = {
                                    selected = if (checked) selected - model.slug else selected + model.slug
                                },
                                label = { Text(if (model.added) "已添加" else if (checked) "已选" else "选择") },
                            )
                        }
                    }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onAdd(selected.toList()) }, enabled = selected.isNotEmpty() && !loading) {
                Text("添加 ${selected.size} 个")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("关闭") } },
    )
}

@Composable
private fun AdminModels(
    state: AdminUiState,
    loading: Boolean,
    onSave: (AdminModelRequest) -> Unit,
    onDelete: (Model) -> Unit,
    onTest: (Model) -> Unit,
) {
    var editor by remember { mutableStateOf<Model?>(null) }
    var creating by remember { mutableStateOf(false) }
    var deleteTarget by remember { mutableStateOf<Model?>(null) }
    AdminList("添加模型", loading, { creating = true }) {
        items(state.models, key = Model::id) { model ->
            AdminCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(model.displayName, fontWeight = FontWeight.SemiBold)
                        Text(
                            "${model.providerKind} · ${model.slug} · ${model.tier} · 入 ${model.inputPricePerM}/出 ${model.outputPricePerM} 分/M",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    LinHubSwitch(
                        model.enabled,
                        { onSave(AdminModelRequest(id = model.id, enabled = it)) },
                        modifier = Modifier.scale(0.72f),
                    )
                }
                Row {
                    TextButton(onClick = { editor = model }) { Icon(Icons.Rounded.Edit, null); Text("编辑") }
                    TextButton(onClick = { onTest(model) }, enabled = model.id !in state.testingModelIds) {
                        if (model.id in state.testingModelIds) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                        else Icon(Icons.Rounded.Science, null)
                        Text("测试")
                    }
                    TextButton(onClick = { deleteTarget = model }) { Icon(Icons.Rounded.Delete, null); Text("删除") }
                }
            }
        }
    }
    if (creating || editor != null) {
        ModelEditor(editor, state.providers, { creating = false; editor = null }, onSave)
    }
    deleteTarget?.let { model ->
        AdminConfirm(
            "删除模型",
            "确定删除「${model.displayName}」？删除后历史用量记录会保留。",
            { deleteTarget = null },
        ) {
            onDelete(model); deleteTarget = null
        }
    }
}

@Composable
private fun ModelEditor(
    model: Model?,
    providers: List<Provider>,
    onDismiss: () -> Unit,
    onSave: (AdminModelRequest) -> Unit,
) {
    var providerId by remember(model?.id) { mutableStateOf(model?.providerId ?: providers.firstOrNull()?.id.orEmpty()) }
    var providerMenu by remember { mutableStateOf(false) }
    var slug by remember(model?.id) { mutableStateOf(model?.slug.orEmpty()) }
    var name by remember(model?.id) { mutableStateOf(model?.displayName.orEmpty()) }
    var description by remember(model?.id) { mutableStateOf(model?.description.orEmpty()) }
    var inputPrice by remember(model?.id) { mutableStateOf((model?.inputPricePerM ?: 0).toString()) }
    var outputPrice by remember(model?.id) { mutableStateOf((model?.outputPricePerM ?: 0).toString()) }
    var imagePrice by remember(model?.id) { mutableStateOf(model?.pricePerImage?.toString().orEmpty()) }
    var context by remember(model?.id) { mutableStateOf((model?.contextWindow ?: 128000).toString()) }
    var maxOutput by remember(model?.id) { mutableStateOf(model?.maxOutputTokens?.toString().orEmpty()) }
    var sortOrder by remember(model?.id) { mutableStateOf((model?.sortOrder ?: 0).toString()) }
    var tier by remember(model?.id) { mutableStateOf(model?.tier ?: "free") }
    var enabled by remember(model?.id) { mutableStateOf(model?.enabled ?: false) }
    var capabilities by remember(model?.id) { mutableStateOf(model?.capabilities?.toSet().orEmpty()) }
    val numericValid = listOf(inputPrice, outputPrice, context, sortOrder).all { it.toIntOrNull() != null }
    AdminEditorDialog(
        if (model == null) "添加模型" else "编辑模型",
        onDismiss,
        providerId.isNotBlank() && slug.isNotBlank() && name.isNotBlank() && numericValid,
        {
            onSave(AdminModelRequest(
                id = model?.id,
                providerId = providerId,
                slug = slug.trim(),
                displayName = name.trim(),
                description = description.trim().takeIf(String::isNotEmpty),
                capabilities = capabilities.toList(),
                enabled = enabled,
                inputPricePerM = inputPrice.toInt(),
                outputPricePerM = outputPrice.toInt(),
                pricePerImage = imagePrice.toIntOrNull(),
                contextWindow = context.toInt(),
                maxOutputTokens = maxOutput.toIntOrNull(),
                tier = tier,
                sortOrder = sortOrder.toInt(),
                descriptionSpecified = model != null,
                pricePerImageSpecified = model != null,
                maxOutputTokensSpecified = model != null,
            )); onDismiss()
        },
    ) {
        Box {
            TextButton(onClick = { providerMenu = true }) {
                Text(providers.firstOrNull { it.id == providerId }?.name ?: "选择供应商")
            }
            DropdownMenu(providerMenu, { providerMenu = false }) {
                providers.forEach { provider ->
                    DropdownMenuItem({ Text(provider.name) }, { providerId = provider.id; providerMenu = false })
                }
            }
        }
        OutlinedTextField(slug, { slug = it }, label = { Text("模型 slug") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(name, { name = it }, label = { Text("展示名称") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(description, { description = it }, label = { Text("描述") }, modifier = Modifier.fillMaxWidth())
        Text("能力", style = MaterialTheme.typography.labelMedium)
        LazyRow(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            items(MODEL_CAPABILITIES) { capability ->
                FilterChip(
                    selected = capability in capabilities,
                    onClick = {
                        capabilities = if (capability in capabilities) capabilities - capability else capabilities + capability
                    },
                    label = { Text(capability) },
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            NumberField("输入分/M", inputPrice, { inputPrice = it }, Modifier.weight(1f))
            NumberField("输出分/M", outputPrice, { outputPrice = it }, Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            NumberField("图片单价", imagePrice, { imagePrice = it }, Modifier.weight(1f))
            NumberField("上下文", context, { context = it }, Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            NumberField("最大输出", maxOutput, { maxOutput = it }, Modifier.weight(1f))
            NumberField("排序", sortOrder, { sortOrder = it }, Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(tier == "free", { tier = "free" }, { Text("Free") })
            FilterChip(tier == "pro", { tier = "pro" }, { Text("Pro") })
        }
        ToggleLine("启用模型", enabled) { enabled = it }
    }
}

@Composable
private fun AdminPlans(
    state: AdminUiState,
    loading: Boolean,
    onSave: (AdminPlanRequest) -> Unit,
    onDelete: (Plan) -> Unit,
) {
    var editor by remember { mutableStateOf<Plan?>(null) }
    var creating by remember { mutableStateOf(false) }
    AdminList("添加套餐", loading, { creating = true }) {
        items(state.plans, key = Plan::id) { plan ->
            AdminCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(plan.name, fontWeight = FontWeight.SemiBold)
                        Text(
                            "¥${formatCents(plan.priceCentsPerMonth)}/月 · 额度 ${if (plan.monthlyQuotaCents < 0) "无限" else "¥${formatCents(plan.monthlyQuotaCents)}"} · ${plan.modelTier}",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    LinHubSwitch(
                        plan.enabled,
                        { onSave(plan.toRequest(enabled = it)) },
                        modifier = Modifier.scale(0.72f),
                    )
                }
                Row {
                    TextButton(onClick = { editor = plan }) { Icon(Icons.Rounded.Edit, null); Text("编辑") }
                    TextButton(onClick = { onDelete(plan) }, enabled = plan.enabled) { Text("停用") }
                }
            }
        }
    }
    if (creating || editor != null) {
        PlanEditor(editor, { creating = false; editor = null }, onSave)
    }
}

@Composable
private fun PlanEditor(plan: Plan?, onDismiss: () -> Unit, onSave: (AdminPlanRequest) -> Unit) {
    var name by remember(plan?.id) { mutableStateOf(plan?.name.orEmpty()) }
    var description by remember(plan?.id) { mutableStateOf(plan?.description.orEmpty()) }
    var price by remember(plan?.id) { mutableStateOf((plan?.priceCentsPerMonth ?: 0).toString()) }
    var quota by remember(plan?.id) { mutableStateOf((plan?.monthlyQuotaCents ?: 0).toString()) }
    var features by remember(plan?.id) { mutableStateOf(plan?.features?.joinToString("\n").orEmpty()) }
    var tier by remember(plan?.id) { mutableStateOf(plan?.modelTier ?: "free") }
    var enabled by remember(plan?.id) { mutableStateOf(plan?.enabled ?: true) }
    AdminEditorDialog(
        if (plan == null) "添加套餐" else "编辑套餐", onDismiss,
        name.isNotBlank() && price.toIntOrNull() != null && quota.toIntOrNull() != null,
        {
            onSave(AdminPlanRequest(
                plan?.id, name.trim(), description.trim(), price.toInt(), quota.toInt(), tier,
                features.lineSequence().map(String::trim).filter(String::isNotEmpty).toList(), enabled,
            )); onDismiss()
        },
    ) {
        OutlinedTextField(name, { name = it }, label = { Text("名称") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(description, { description = it }, label = { Text("描述") }, modifier = Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            NumberField("月价（分）", price, { price = it }, Modifier.weight(1f))
            NumberField("月额度（分，-1 无限）", quota, { quota = it }, Modifier.weight(1f))
        }
        OutlinedTextField(features, { features = it }, label = { Text("功能（每行一项）") }, minLines = 3, modifier = Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(tier == "free", { tier = "free" }, { Text("Free") })
            FilterChip(tier == "pro", { tier = "pro" }, { Text("Pro") })
        }
        ToggleLine("启用套餐", enabled) { enabled = it }
    }
}

@Composable
private fun AdminUsers(
    state: AdminUiState,
    currentUserId: String?,
    loading: Boolean,
    onLoad: (User) -> Unit,
    onGrant: (User, Int, String) -> Unit,
    onSubscription: (User, String?, Int) -> Unit,
    onDelete: (User) -> Unit,
) {
    var selectedUserId by rememberSaveable { mutableStateOf<String?>(null) }
    AnimatedContent(
        targetState = selectedUserId,
        transitionSpec = {
            val direction = if (targetState == null) -1 else 1
            (slideInHorizontally(tween(180)) { it / 5 * direction } + fadeIn(tween(150))) togetherWith
                (slideOutHorizontally(tween(160)) { -it / 6 * direction } + fadeOut(tween(120)))
        },
        label = "管理后台用户详情",
    ) { userId ->
        if (userId == null) {
            AdminList(null, loading, null) {
                items(state.users, key = User::id) { user ->
                    AdminUserListRow(user) {
                        selectedUserId = user.id
                        onLoad(user)
                    }
                }
            }
        } else {
            val fallback = state.users.firstOrNull { it.id == userId }
                ?: state.userDetails[userId]?.user
            if (fallback == null) {
                LaunchedEffect(userId) { selectedUserId = null }
            } else {
                AdminUserDetailPage(
                    user = state.userDetails[userId]?.user ?: fallback,
                    detail = state.userDetails[userId],
                    plans = state.plans,
                    loading = loading,
                    canDelete = userId != currentUserId,
                    userStillPresent = state.users.any { it.id == userId },
                    onBack = { selectedUserId = null },
                    onRetry = { onLoad(fallback) },
                    onGrant = { amount, note -> onGrant(fallback, amount, note) },
                    onSubscription = { planId, days -> onSubscription(fallback, planId, days) },
                    onDelete = { onDelete(fallback) },
                )
            }
        }
    }
}

@Composable
private fun AdminUserListRow(user: User, onOpen: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onOpen),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        color = MaterialTheme.colorScheme.surface,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            UserInitial(user.name)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(user.name, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (user.role == "admin") {
                        Surface(
                            shape = RoundedCornerShape(999.dp),
                            color = MaterialTheme.colorScheme.primaryContainer,
                        ) {
                            Text(
                                "管理员",
                                modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                                style = MaterialTheme.typography.labelSmall,
                            )
                        }
                    }
                }
                Text(
                    user.email,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    user.subscription?.planName ?: "无订阅",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("余额", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("¥${formatCents(user.balance)}", fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun UserInitial(name: String) {
    Surface(
        modifier = Modifier.size(44.dp),
        shape = RoundedCornerShape(999.dp),
        color = MaterialTheme.colorScheme.primaryContainer,
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(name.trim().firstOrNull()?.uppercase() ?: "用", fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun AdminUserDetailPage(
    user: User,
    detail: AdminUserDetail?,
    plans: List<Plan>,
    loading: Boolean,
    canDelete: Boolean,
    userStillPresent: Boolean,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onGrant: (Int, String) -> Unit,
    onSubscription: (String?, Int) -> Unit,
    onDelete: () -> Unit,
) {
    var grantOpen by rememberSaveable(user.id) { mutableStateOf(false) }
    var grantYuan by rememberSaveable(user.id) { mutableStateOf("10") }
    var grantNote by rememberSaveable(user.id) { mutableStateOf("") }
    var grantBaseline by remember(user.id) { mutableStateOf<Int?>(null) }
    var deleteOpen by rememberSaveable(user.id) { mutableStateOf(false) }
    var deleteRequested by remember(user.id) { mutableStateOf(false) }
    var selectedPlan by remember(user.id, user.subscription?.planId) {
        mutableStateOf(user.subscription?.planId)
    }
    var days by remember(user.id, user.subscription?.expiresAt) {
        mutableStateOf(subscriptionDaysRemaining(user).toString())
    }
    var planMenu by remember { mutableStateOf(false) }
    var historySection by rememberSaveable(user.id) { mutableStateOf(UserDetailSection.Usage) }

    LaunchedEffect(user.balance, grantBaseline) {
        if (grantBaseline != null && user.balance != grantBaseline) {
            grantOpen = false
            grantBaseline = null
            grantYuan = "10"
            grantNote = ""
        }
    }
    LaunchedEffect(userStillPresent, deleteRequested) {
        if (deleteRequested && !userStillPresent) onBack()
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedButton(onClick = onBack, enabled = !loading) {
                    Icon(Icons.AutoMirrored.Rounded.ArrowBack, null, Modifier.size(17.dp))
                    Text("返回用户列表")
                }
                OutlinedButton(onClick = { grantOpen = true }, enabled = !loading) {
                    Icon(Icons.Rounded.AccountBalanceWallet, null, Modifier.size(17.dp))
                    Text("赠送余额")
                }
            }
        }
        item {
            AdminCard {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    UserInitial(user.name)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(user.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Text(user.email, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("注册于 ${user.createdAt}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text("余额", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("¥${formatCents(user.balance)}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
        item {
            AdminCard {
                Text("订阅", fontWeight = FontWeight.SemiBold)
                Text(
                    subscriptionSummary(user),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Box {
                    TextButton(onClick = { planMenu = true }) {
                        Text(plans.firstOrNull { it.id == selectedPlan }?.name ?: "无订阅")
                    }
                    DropdownMenu(planMenu, { planMenu = false }) {
                        DropdownMenuItem({ Text("无订阅") }, { selectedPlan = null; planMenu = false })
                        plans.forEach { plan ->
                            DropdownMenuItem({ Text(plan.name) }, { selectedPlan = plan.id; planMenu = false })
                        }
                    }
                }
                if (selectedPlan != null) {
                    NumberField("订阅有效天数", days, { days = it }, Modifier.fillMaxWidth())
                }
                Button(
                    onClick = { onSubscription(selectedPlan, days.toIntOrNull() ?: 30) },
                    enabled = !loading && (selectedPlan == null || days.toIntOrNull() in 1..3650),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (loading) "保存中…" else "保存订阅")
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                UserDetailSection.entries.forEach { section ->
                    FilterChip(
                        selected = historySection == section,
                        onClick = { historySection = section },
                        label = { Text(section.label) },
                    )
                }
            }
        }
        if (detail == null) {
            item {
                AdminCard {
                    if (loading) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                            Text("正在读取用户详情…")
                        }
                    } else {
                        Text("无法读取用户详情", fontWeight = FontWeight.SemiBold)
                        Text("请检查网络后重试。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        OutlinedButton(onClick = onRetry) { Text("重试") }
                    }
                }
            }
        } else if (historySection == UserDetailSection.Usage) {
            val records = detail.usageRecords
            if (records.isEmpty()) item { AdminCard { EmptyUserHistory("暂无用量记录") } }
            items(records, key = UsageRecord::id) { record -> UsageHistoryRow(record) }
        } else {
            val entries = detail.ledger
            if (entries.isEmpty()) item { AdminCard { EmptyUserHistory("暂无余额流水") } }
            items(entries, key = LedgerEntry::id) { entry -> LedgerHistoryRow(entry) }
        }
        item {
            AdminCard {
                Text("危险操作", fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.error)
                Text(
                    "删除用户会同时删除该用户的会话、文件、知识库、余额流水和登录会话。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(
                    onClick = { deleteOpen = true },
                    enabled = canDelete && !loading,
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                ) {
                    Icon(Icons.Rounded.Delete, null)
                    Text("删除用户")
                }
                if (!canDelete) {
                    Text("当前登录账号不能在这里删除。", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }

    if (grantOpen) {
        AlertDialog(
            onDismissRequest = { if (!loading) grantOpen = false },
            title = { Text("赠送余额") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("为用户「${user.name}」赠送余额，金额以元为单位。")
                    MoneyField("金额（元）", grantYuan) { grantYuan = it }
                    OutlinedTextField(
                        grantNote,
                        { grantNote = it },
                        label = { Text("备注（可选）") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        val cents = parseYuanToCents(grantYuan) ?: return@TextButton
                        grantBaseline = user.balance
                        onGrant(cents, grantNote)
                    },
                    enabled = !loading && parseYuanToCents(grantYuan) != null,
                ) { Text(if (loading) "赠送中…" else "赠送") }
            },
            dismissButton = {
                TextButton(onClick = { grantOpen = false }, enabled = !loading) { Text("取消") }
            },
        )
    }

    if (deleteOpen) {
        AlertDialog(
            onDismissRequest = { if (!loading) deleteOpen = false },
            title = { Text("删除用户") },
            text = { Text("确定删除用户「${user.name}」？删除后无法撤销。") },
            confirmButton = {
                TextButton(
                    onClick = {
                        deleteRequested = true
                        onDelete()
                    },
                    enabled = !loading,
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) { Text(if (loading) "删除中…" else "删除") }
            },
            dismissButton = {
                TextButton(onClick = { deleteOpen = false }, enabled = !loading) { Text("取消") }
            },
        )
    }
}

private fun subscriptionDaysRemaining(user: User): Int {
    val expiresAt = user.subscription?.expiresAt ?: return 30
    return runCatching {
        Duration.between(Instant.now(), Instant.parse(expiresAt)).toDays().coerceIn(1, 3650).toInt()
    }.getOrDefault(30)
}

internal fun parseYuanToCents(value: String): Int? = runCatching {
    BigDecimal(value.trim())
        .movePointRight(2)
        .setScale(0, RoundingMode.HALF_UP)
        .intValueExact()
        .takeIf { it > 0 }
}.getOrNull()

@Composable
private fun MoneyField(label: String, value: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = { next ->
            if (next.length <= 12 && (next.isEmpty() || next.matches(Regex("\\d*(\\.\\d{0,2})?")))) {
                onChange(next)
            }
        },
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
    )
}

private fun subscriptionSummary(user: User): String {
    val subscription = user.subscription ?: return "当前没有有效订阅"
    val quota = if (subscription.monthlyQuotaCents < 0) {
        "无限额度 · 本月已用 ¥${formatCents(subscription.usedQuotaCents)}"
    } else {
        "已用 ¥${formatCents(subscription.usedQuotaCents)} / ¥${formatCents(subscription.monthlyQuotaCents)}"
    }
    return "${subscription.planName} · $quota · ${subscription.expiresAt.substringBefore('T')} 到期"
}

@Composable
private fun EmptyUserHistory(label: String) {
    Text(
        label,
        modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun UsageHistoryRow(record: UsageRecord) {
    Surface(
        shape = RoundedCornerShape(7.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
    ) {
        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row {
                Text(
                    record.modelName,
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.labelLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text("¥${formatCents(record.costCents)}", style = MaterialTheme.typography.labelLarge)
            }
            Text(
                "${adminUsageCapabilityLabel(record.capability)} · 输入 ${record.inputTokens} · 输出 ${record.outputTokens}" +
                    (record.imageCount?.takeIf { it > 0 }?.let { " · 图片 $it" } ?: ""),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(record.createdAt, style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun LedgerHistoryRow(entry: LedgerEntry) {
    Surface(
        shape = RoundedCornerShape(7.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
    ) {
        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row {
                Text(
                    entry.description.ifBlank { adminLedgerReasonLabel(entry.reason) },
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.labelLarge,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    "${if (entry.amountCents >= 0) "+" else ""}¥${formatCents(entry.amountCents)}",
                    style = MaterialTheme.typography.labelLarge,
                    color = if (entry.amountCents >= 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                )
            }
            Text(
                "${adminLedgerReasonLabel(entry.reason)} · 余额 ¥${formatCents(entry.balanceAfterCents)}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(entry.createdAt, style = MaterialTheme.typography.labelSmall)
        }
    }
}

private fun adminUsageCapabilityLabel(capability: String?): String = when (capability) {
    "image-generation" -> "图片生成"
    "web-search" -> "联网搜索"
    "spreadsheet-analysis" -> "表格分析"
    "tts" -> "语音合成"
    "asr" -> "语音识别"
    else -> "聊天"
}

private fun adminLedgerReasonLabel(reason: String): String = when (reason) {
    "recharge" -> "充值"
    "usage" -> "消费"
    "grant" -> "赠送"
    "refund" -> "退款"
    "redeem" -> "兑换"
    else -> reason
}

@Composable
private fun AdminSkills(
    skills: List<Skill>,
    loading: Boolean,
    onReview: (Skill, Boolean) -> Unit,
    onImport: () -> Unit,
) {
    AdminList("导入 Skill 包", loading, onImport) {
        item {
            Text(
                "选择不超过 20 MB 的 .zip Skill 包。导入后先保存为私有草稿，审核后才能执行脚本或公开发布。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (skills.isEmpty()) item { EmptyAdmin("暂无待审核技能") }
        items(skills, key = Skill::id) { skill ->
            AdminCard {
                Text("${skill.emoji} ${skill.name}", fontWeight = FontWeight.SemiBold)
                Text(skill.description, style = MaterialTheme.typography.bodySmall)
                Text(skill.systemPrompt, maxLines = 4, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.labelSmall)
                Row {
                    Button(onClick = { onReview(skill, true) }, enabled = !loading) {
                        Icon(Icons.Rounded.CheckCircle, null); Text("通过")
                    }
                    TextButton(onClick = { onReview(skill, false) }, enabled = !loading) { Text("拒绝") }
                }
            }
        }
    }
}

@Composable
private fun AdminSettings(
    state: AdminUiState,
    loading: Boolean,
    onSave: (AdminSettingsPatch) -> Unit,
    onTest: (EngineTestRequest) -> Unit,
) {
    val settings = state.settings ?: return EmptyAdmin("设置尚未加载")
    var siteName by remember(settings) { mutableStateOf(settings.siteName) }
    var defaultModel by remember(settings) { mutableStateOf(settings.defaultChatModelId.orEmpty()) }
    var imageBase by remember(settings) { mutableStateOf(settings.imageGenBaseUrl.orEmpty()) }
    var imageModel by remember(settings) { mutableStateOf(settings.imageGenModel.orEmpty()) }
    var imageKey by remember(settings) { mutableStateOf("") }
    var ttsBase by remember(settings) { mutableStateOf(settings.ttsBaseUrl.orEmpty()) }
    var ttsModel by remember(settings) { mutableStateOf(settings.ttsModel.orEmpty()) }
    var ttsVoice by remember(settings) { mutableStateOf(settings.mimoTtsVoice.orEmpty()) }
    var ttsKey by remember(settings) { mutableStateOf("") }
    var asrBase by remember(settings) { mutableStateOf(settings.asrBaseUrl.orEmpty()) }
    var asrModel by remember(settings) { mutableStateOf(settings.asrModel.orEmpty()) }
    var asrKey by remember(settings) { mutableStateOf("") }
    var searchBase by remember(settings) { mutableStateOf(settings.searchBaseUrl.orEmpty()) }
    var searchKey by remember(settings) { mutableStateOf("") }
    val basicsDirty = siteName.trim() != settings.siteName ||
        defaultModel.trim() != settings.defaultChatModelId.orEmpty()
    val imageDirty = imageBase.trim() != settings.imageGenBaseUrl.orEmpty() ||
        imageModel.trim() != settings.imageGenModel.orEmpty() || imageKey.isNotBlank()
    val ttsDirty = ttsBase.trim() != settings.ttsBaseUrl.orEmpty() ||
        ttsModel.trim() != settings.ttsModel.orEmpty() ||
        ttsVoice.trim() != settings.mimoTtsVoice.orEmpty() || ttsKey.isNotBlank()
    val asrDirty = asrBase.trim() != settings.asrBaseUrl.orEmpty() ||
        asrModel.trim() != settings.asrModel.orEmpty() || asrKey.isNotBlank()
    val searchDirty = searchBase.trim() != settings.searchBaseUrl.orEmpty() || searchKey.isNotBlank()
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            AdminCard {
                Text("站点与默认模型", fontWeight = FontWeight.SemiBold)
                OutlinedTextField(siteName, { siteName = it }, label = { Text("站点名称") }, modifier = Modifier.fillMaxWidth())
                ModelIdField("默认聊天模型 ID", defaultModel, { defaultModel = it }, state.models)
                if (basicsDirty) {
                    Text("有未保存更改", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
                }
                Button(
                    onClick = {
                        onSave(AdminSettingsPatch(
                            siteName = siteName.trim(),
                            defaultChatModelId = defaultModel.trim(),
                        ))
                    },
                    enabled = basicsDirty && !loading && siteName.isNotBlank(),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (loading) "保存中…" else "保存") }
            }
        }
        item {
            AdminCard {
                Text("辅助模型", fontWeight = FontWeight.SemiBold)
                ModelIdField(
                    "辅助识图模型（供无视觉模型使用）",
                    settings.visionHelperModelId.orEmpty(),
                    { onSave(AdminSettingsPatch(visionHelperModelId = it)) },
                    state.models.filter { "vision" in it.capabilities },
                )
                ModelIdField(
                    "智能工具路由模型",
                    settings.toolRouterModelId.orEmpty(),
                    { onSave(AdminSettingsPatch(toolRouterModelId = it)) },
                    state.models.filterNot { "image-generation" in it.capabilities },
                )
                ModelIdField(
                    "Embedding 模型（记忆与知识库）",
                    settings.embeddingModelId.orEmpty(),
                    { onSave(AdminSettingsPatch(embeddingModelId = it)) },
                    state.models,
                )
            }
        }
        item {
            Text("引擎配置", fontWeight = FontWeight.SemiBold)
            Text(
                "每个能力域独立保存与测试，互不覆盖。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        item {
            EngineCard(
                engine = "image", title = "图像生成",
                description = "用于 generate_image / edit_image；测试会真实生成测试图。",
                base = imageBase, onBase = { imageBase = it }, model = imageModel,
                onModel = { imageModel = it }, key = imageKey, onKey = { imageKey = it },
                voice = null, onVoice = {}, masked = settings.imageGenApiKeyMasked,
                dirty = imageDirty, loading = loading, testing = state.testingEngines,
                onSave = {
                    onSave(AdminSettingsPatch(
                        imageGenBaseUrl = imageBase.trim(), imageGenModel = imageModel.trim(),
                        imageGenApiKey = imageKey.trim().takeIf(String::isNotEmpty),
                    ))
                },
                onTest = onTest,
            )
        }
        item {
            EngineCard(
                engine = "tts", title = "语音合成（TTS）",
                description = "用于把文本合成为语音，兼容旧 MiMo Key 回退。",
                base = ttsBase, onBase = { ttsBase = it }, model = ttsModel,
                onModel = { ttsModel = it }, key = ttsKey, onKey = { ttsKey = it },
                voice = ttsVoice, onVoice = { ttsVoice = it }, masked = settings.ttsApiKeyMasked,
                dirty = ttsDirty, loading = loading, testing = state.testingEngines,
                onSave = {
                    onSave(AdminSettingsPatch(
                        ttsBaseUrl = ttsBase.trim(), ttsModel = ttsModel.trim(),
                        ttsApiKey = ttsKey.trim().takeIf(String::isNotEmpty),
                        mimoTtsVoice = ttsVoice.trim(),
                    ))
                },
                onTest = onTest,
            )
        }
        item {
            EngineCard(
                engine = "asr", title = "语音识别（ASR）",
                description = "用于录音转写，兼容旧 MiMo Key 回退。",
                base = asrBase, onBase = { asrBase = it }, model = asrModel,
                onModel = { asrModel = it }, key = asrKey, onKey = { asrKey = it },
                voice = null, onVoice = {}, masked = settings.asrApiKeyMasked,
                dirty = asrDirty, loading = loading, testing = state.testingEngines,
                onSave = {
                    onSave(AdminSettingsPatch(
                        asrBaseUrl = asrBase.trim(), asrModel = asrModel.trim(),
                        asrApiKey = asrKey.trim().takeIf(String::isNotEmpty),
                    ))
                },
                onTest = onTest,
            )
        }
        item {
            EngineCard(
                engine = "search", title = "联网搜索（Tavily）",
                description = "用于 web_search / web_read / web_crawl。",
                base = searchBase, onBase = { searchBase = it }, model = "", onModel = {},
                key = searchKey, onKey = { searchKey = it }, voice = null, onVoice = {},
                masked = settings.tavilyApiKeyMasked, dirty = searchDirty, loading = loading,
                testing = state.testingEngines,
                onSave = {
                    onSave(AdminSettingsPatch(
                        searchBaseUrl = searchBase.trim(),
                        tavilyApiKey = searchKey.trim().takeIf(String::isNotEmpty),
                    ))
                },
                onTest = onTest,
            )
        }
        item {
            AdminCard {
                Text("注册与广场", fontWeight = FontWeight.SemiBold)
                ToggleLine("开放注册", settings.registrationEnabled) {
                    onSave(AdminSettingsPatch(registrationEnabled = it))
                }
                ToggleLine("技能广场需要审核", settings.skillMarketRequiresReview) {
                    onSave(AdminSettingsPatch(skillMarketRequiresReview = it))
                }
                Text(
                    "第一个注册的用户自动成为管理员；普通用户看不到密钥配置。",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun EngineCard(
    engine: String,
    title: String,
    description: String,
    base: String,
    onBase: (String) -> Unit,
    model: String,
    onModel: (String) -> Unit,
    key: String,
    onKey: (String) -> Unit,
    voice: String?,
    onVoice: (String) -> Unit,
    masked: String?,
    dirty: Boolean,
    loading: Boolean,
    testing: Set<String>,
    onSave: () -> Unit,
    onTest: (EngineTestRequest) -> Unit,
) {
    AdminCard {
        Text(title, fontWeight = FontWeight.SemiBold)
        Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (dirty) {
            Text("有未保存更改", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
        }
        OutlinedTextField(base, onBase, label = { Text("Base URL") }, modifier = Modifier.fillMaxWidth())
        if (engine != "search") OutlinedTextField(model, onModel, label = { Text("模型") }, modifier = Modifier.fillMaxWidth())
        voice?.let { OutlinedTextField(it, onVoice, label = { Text("音色") }, modifier = Modifier.fillMaxWidth()) }
        OutlinedTextField(key, onKey, label = { Text("API Key") }, placeholder = { Text(masked ?: "留空沿用") }, modifier = Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                onClick = {
                onTest(EngineTestRequest(
                    engine,
                    EngineConfig(
                        base.takeIf(String::isNotBlank),
                        model.takeIf(String::isNotBlank),
                        voice?.takeIf(String::isNotBlank),
                        key.takeIf(String::isNotBlank),
                    ),
                ))
                },
                enabled = !loading && engine !in testing,
            ) {
                if (engine in testing) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                else Icon(Icons.Rounded.PlayArrow, null)
                Text("测试连接")
            }
            Button(onClick = onSave, enabled = dirty && !loading) {
                Text(if (loading) "保存中…" else "保存")
            }
        }
    }
}

@Composable
private fun AdminMcp(
    servers: List<McpServer>,
    loading: Boolean,
    onSave: (McpServerRequest) -> Unit,
    onTest: (McpServer) -> Unit,
    onDelete: (McpServer) -> Unit,
) {
    var editor by remember { mutableStateOf<McpServer?>(null) }
    var creating by remember { mutableStateOf(false) }
    var deleteTarget by remember { mutableStateOf<McpServer?>(null) }
    AdminList("添加全局 MCP", loading, { creating = true }) {
        if (servers.isEmpty()) {
            item { EmptyAdmin("还没有全局 MCP 服务器。") }
        }
        items(servers, key = McpServer::id) { server ->
            AdminCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(server.name, fontWeight = FontWeight.SemiBold)
                        Text("${server.url} · ${server.status} · ${server.tools.size} 个工具", style = MaterialTheme.typography.bodySmall)
                    }
                    LinHubSwitch(
                        server.enabled,
                        {
                            onSave(McpServerRequest(
                            id = server.id,
                            scope = "global",
                            name = server.name,
                            url = server.url,
                            transport = server.transport,
                            enabled = it,
                            defaultEnabled = server.defaultEnabled,
                            ))
                        },
                        modifier = Modifier.scale(0.72f),
                    )
                }
                Row {
                    TextButton(onClick = { editor = server }) { Text("编辑") }
                    TextButton(onClick = { onTest(server) }) { Text("测试") }
                    TextButton(onClick = { deleteTarget = server }) { Text("删除") }
                }
                if (server.tools.isNotEmpty()) {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        items(server.tools, key = { it.name }) { tool ->
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                            ) {
                                Text(
                                    tool.name,
                                    modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp),
                                    style = MaterialTheme.typography.labelSmall,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
    if (creating || editor != null) {
        AdminMcpEditor(editor, { creating = false; editor = null }, onSave)
    }
    deleteTarget?.let { server ->
        AdminConfirm(
            title = "删除全局 MCP 服务器",
            body = "将删除全局 MCP 服务器「${server.name}」。此操作不可撤销。",
            onDismiss = { deleteTarget = null },
            confirmLabel = "删除",
            destructive = true,
            onConfirm = {
                onDelete(server)
                deleteTarget = null
            },
        )
    }
}

@Composable
private fun AdminMcpEditor(server: McpServer?, onDismiss: () -> Unit, onSave: (McpServerRequest) -> Unit) {
    var name by remember(server?.id) { mutableStateOf(server?.name.orEmpty()) }
    var url by remember(server?.id) { mutableStateOf(server?.url.orEmpty()) }
    var transport by remember(server?.id) { mutableStateOf(server?.transport ?: "streamable-http") }
    var headerText by remember(server?.id) { mutableStateOf("") }
    var clearHeaders by remember(server?.id) { mutableStateOf(false) }
    var enabled by remember(server?.id) { mutableStateOf(server?.enabled ?: false) }
    var defaultEnabled by remember(server?.id) { mutableStateOf(server?.defaultEnabled ?: false) }
    var error by remember(server?.id) { mutableStateOf<String?>(null) }
    AdminEditorDialog(
        if (server == null) "添加全局 MCP" else "编辑全局 MCP", onDismiss,
        name.isNotBlank() && url.isNotBlank(),
        {
            val parsed = when {
                clearHeaders -> emptyMap()
                headerText.isBlank() -> null
                else -> runCatching { parseMcpHeaderLines(headerText) }
                    .onFailure { error = it.message ?: "请求头格式无效" }
                    .getOrNull() ?: return@AdminEditorDialog
            }
            onSave(McpServerRequest(
                id = server?.id,
                scope = "global",
                name = name.trim(),
                url = url.trim(),
                transport = transport,
                headers = parsed,
                enabled = enabled,
                defaultEnabled = defaultEnabled,
            ))
            onDismiss()
        },
    ) {
        OutlinedTextField(name, { name = it }, label = { Text("名称") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(url, { url = it }, label = { Text("URL") }, modifier = Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(transport == "streamable-http", { transport = "streamable-http" }, { Text("HTTP") })
            FilterChip(transport == "sse", { transport = "sse" }, { Text("SSE") })
        }
        OutlinedTextField(
            headerText,
            { headerText = it; error = null },
            label = { Text("请求头密钥（每行 名称: 值）") },
            placeholder = { Text("Authorization: Bearer …") },
            enabled = !clearHeaders,
            supportingText = {
                Text(
                    when {
                        error != null -> error.orEmpty()
                        server?.headersMasked?.isNotEmpty() == true -> {
                            "已保存：" + server.headersMasked.entries.joinToString { (key, value) ->
                                "$key=$value"
                            } + "；留空保持不变"
                        }
                        else -> "密钥仅加密保存，客户端不会再次读取明文"
                    },
                )
            },
            isError = error != null,
            minLines = 3,
            maxLines = 6,
            modifier = Modifier.fillMaxWidth(),
        )
        if (server?.headersMasked?.isNotEmpty() == true) {
            TextButton(onClick = {
                clearHeaders = !clearHeaders
                headerText = ""
                error = null
            }) {
                Text(if (clearHeaders) "取消清除请求头" else "清除已有请求头")
            }
        }
        ToggleLine("启用", enabled) { enabled = it }
        ToggleLine("对用户默认启用", defaultEnabled) { defaultEnabled = it }
    }
}

@Composable
private fun AdminCodes(state: AdminUiState, loading: Boolean, onGenerate: (Int, Int) -> Unit) {
    var amount by remember { mutableStateOf("1000") }
    var count by remember { mutableStateOf("1") }
    val parsedAmount = amount.toIntOrNull()
    val parsedCount = count.toIntOrNull()
    val amountValid = parsedAmount != null && parsedAmount >= 100
    val countValid = parsedCount != null && parsedCount in 1..50
    val canGenerate = amountValid && countValid && !loading
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            AdminCard {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    NumberField("面额（分）", amount, { amount = it }, Modifier.weight(1f))
                    NumberField("数量（1-50）", count, { count = it }, Modifier.weight(1f))
                }
                if (!amountValid) {
                    Text(
                        "面额至少 1 元",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                if (!countValid) {
                    Text(
                        "数量必须为 1–50",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                Button(
                    onClick = { onGenerate(parsedAmount ?: return@Button, parsedCount ?: return@Button) },
                    enabled = canGenerate,
                ) {
                    Icon(Icons.Rounded.Add, null); Text("生成兑换码")
                }
                if (state.generatedCodes.isNotEmpty()) {
                    Text(state.generatedCodes.joinToString("\n"), fontFamily = FontFamily.Monospace)
                }
            }
        }
        items(state.redeemCodes, key = { it.code }) { code ->
            AdminCard {
                Text(code.code, fontFamily = FontFamily.Monospace)
                Text("¥${formatCents(code.amountCents)} · ${if (code.used) "已使用" else "未使用"}", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun AdminUsage(state: AdminUiState) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(14.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
        item {
            val total = state.usage.sumOf { it.costCents }
            Text("${state.usage.size} 条记录 · 总成本 ¥${formatCents(total)}", fontWeight = FontWeight.SemiBold)
        }
        items(state.usage, key = { it.id }) { usage ->
            AdminCard {
                Text("${usage.modelName} · ¥${formatCents(usage.costCents)}")
                Text("${usage.capability ?: "chat"} · 用户 ${usage.userId} · ${usage.createdAt}", style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

@Composable
private fun AdminList(
    addLabel: String?,
    loading: Boolean,
    onAdd: (() -> Unit)?,
    content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(14.dp),
        verticalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        if (addLabel != null && onAdd != null) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                ) {
                    Button(onClick = onAdd, enabled = !loading) {
                        Icon(Icons.Rounded.Add, null); Text(addLabel)
                    }
                }
            }
        }
        content()
    }
}

@Composable
private fun AdminCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 1.dp,
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(7.dp), content = content)
    }
}

@Composable
private fun AdminEditorDialog(
    title: String,
    onDismiss: () -> Unit,
    canSave: Boolean,
    onSave: () -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            LazyColumn(Modifier.heightIn(max = 560.dp)) {
                item { Column(verticalArrangement = Arrangement.spacedBy(9.dp), content = content) }
            }
        },
        confirmButton = { TextButton(onClick = onSave, enabled = canSave) { Text("保存") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

@Composable
private fun AdminConfirm(
    title: String,
    body: String,
    onDismiss: () -> Unit,
    confirmLabel: String = "确认",
    destructive: Boolean = false,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(body) },
        confirmButton = {
            TextButton(
                onClick = onConfirm,
                colors = ButtonDefaults.textButtonColors(
                    contentColor = if (destructive) {
                        MaterialTheme.colorScheme.error
                    } else {
                        MaterialTheme.colorScheme.primary
                    },
                ),
            ) { Text(confirmLabel) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

@Composable
private fun ToggleLine(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, modifier = Modifier.weight(1f))
        LinHubSwitch(checked, onChange, modifier = Modifier.scale(0.72f))
    }
}

@Composable
private fun NumberField(label: String, value: String, onChange: (String) -> Unit, modifier: Modifier) {
    OutlinedTextField(
        value,
        { next -> if (next.isEmpty() || next == "-" || next.toIntOrNull() != null) onChange(next) },
        label = { Text(label) },
        modifier = modifier,
        singleLine = true,
    )
}

@Composable
private fun ModelIdField(label: String, value: String, onChange: (String) -> Unit, models: List<Model>) {
    var menu by remember { mutableStateOf(false) }
    Box {
        OutlinedTextField(
            value,
            onChange,
            label = { Text(label) },
            modifier = Modifier.fillMaxWidth(),
            trailingIcon = { TextButton(onClick = { menu = true }) { Text("选择") } },
        )
        DropdownMenu(menu, { menu = false }) {
            DropdownMenuItem({ Text("清除") }, { onChange(""); menu = false })
            models.forEach { model ->
                DropdownMenuItem({ Text(model.displayName) }, { onChange(model.id); menu = false })
            }
        }
    }
}

@Composable
private fun EmptyAdmin(message: String) {
    Box(Modifier.fillMaxWidth().padding(28.dp), contentAlignment = Alignment.Center) {
        Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private fun Provider.toRequest(enabled: Boolean = this.enabled) = AdminProviderRequest(
    id, kind, name, baseUrl, null, enabled, storeEnabled,
)

private fun Plan.toRequest(enabled: Boolean = this.enabled) = AdminPlanRequest(
    id, name, description, priceCentsPerMonth, monthlyQuotaCents, modelTier, features, enabled,
)

private fun formatCents(cents: Int): String = String.format(Locale.CHINA, "%.2f", cents / 100.0)

private val PROVIDER_KINDS = listOf(
    "openai", "anthropic", "google", "zhipu", "deepseek", "xiaomi", "xiaomi-token-plan",
)
private val MODEL_CAPABILITIES = listOf(
    "vision", "reasoning", "tools", "image-generation", "web-search-native",
)
