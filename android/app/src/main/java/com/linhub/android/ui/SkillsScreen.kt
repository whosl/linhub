package com.linhub.android.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome as AutoAwesomeOutlined
import androidx.compose.material.icons.automirrored.rounded.Chat
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Menu
import androidx.compose.material.icons.rounded.SmartToy
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.linhub.android.core.model.Model
import com.linhub.android.core.model.Skill

private enum class SkillSection { Mine, Market }

private val SKILL_EMOJIS = listOf(
    "\uD83E\uDD16",
    "\uD83D\uDD0D",
    "\uD83C\uDF10",
    "\uD83C\uDF93",
    "\u2728",
    "\u270D\uFE0F",
    "\uD83D\uDCBB",
    "\uD83D\uDCCA",
    "\uD83C\uDFA8",
    "\uD83E\uDDE0",
    "\uD83D\uDCDA",
    "\u26A1\uFE0F",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SkillsScreen(
    mySkills: List<Skill>,
    marketSkills: List<Skill>,
    models: List<Model>,
    loading: Boolean,
    onOpenMenu: () -> Unit,
    onRefresh: () -> Unit,
    onStartConversation: (Skill) -> Unit,
    onSave: (Skill?, String, String, String, String, String, String?, Boolean) -> Unit,
    onDelete: (Skill) -> Unit,
    modifier: Modifier = Modifier,
) {
    var section by rememberSaveable { mutableStateOf(SkillSection.Mine) }
    var editorOpen by rememberSaveable { mutableStateOf(false) }
    var editing by remember { mutableStateOf<Skill?>(null) }
    var deleteTarget by remember { mutableStateOf<Skill?>(null) }
    var detailTarget by remember { mutableStateOf<Skill?>(null) }

    Scaffold(
        modifier = modifier,
        contentWindowInsets = WindowInsets(0),
        topBar = {
            WebPageHeader(
                title = "技能",
                description = "自定义助手：专属提示词、模型、工具与知识库",
                onOpenMenu = onOpenMenu,
                action = {
                    WebHeaderAction(
                        label = "创建技能",
                        icon = Icons.Rounded.Add,
                        enabled = !loading,
                        onClick = { editing = null; editorOpen = true },
                    )
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            WebTabRow(
                labels = listOf("我的技能", "技能广场"),
                selectedIndex = section.ordinal,
                onSelect = { section = SkillSection.entries[it] },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
            )
            AnimatedContent(
                targetState = section,
                modifier = Modifier.weight(1f),
                transitionSpec = {
                    fadeIn(spring(stiffness = 500f)) togetherWith fadeOut(spring(stiffness = 600f))
                },
                label = "skill-section",
            ) { targetSection ->
                val targetSkills = if (targetSection == SkillSection.Mine) mySkills else marketSkills
                when {
                    loading && targetSkills.isEmpty() -> Box(
                        Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(strokeWidth = 2.dp)
                    }
                    targetSkills.isEmpty() -> Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.TopCenter,
                    ) {
                        EmptySkills(
                            market = targetSection == SkillSection.Market,
                            onCreate = { editing = null; editorOpen = true },
                        )
                    }
                    else -> LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        items(targetSkills, key = Skill::id) { skill ->
                            SkillItem(
                                skill = skill,
                                editable = targetSection == SkillSection.Mine && skill.kind != "pack",
                                onStartConversation = { onStartConversation(skill) },
                                onOpenDetails = { detailTarget = skill },
                                onEdit = { editing = skill; editorOpen = true },
                                onDelete = { deleteTarget = skill },
                                modifier = Modifier.animateItem(),
                            )
                        }
                    }
                }
            }
        }
    }

    if (editorOpen) {
        SkillEditorDialog(
            skill = editing,
            models = models.filterNot { "image-generation" in it.capabilities },
            onDismiss = { editorOpen = false },
            onSave = { name, emoji, description, prompt, greeting, modelId, share ->
                onSave(editing, name, emoji, description, prompt, greeting, modelId, share)
                editorOpen = false
            },
        )
    }
    detailTarget?.let { skill ->
        SkillPackDetailsDialog(
            skill = skill,
            onDismiss = { detailTarget = null },
            onStartConversation = {
                detailTarget = null
                onStartConversation(skill)
            },
        )
    }
    deleteTarget?.let { skill ->
        AlertDialog(
            onDismissRequest = { deleteTarget = null },
            title = { Text("删除技能") },
            text = { Text("确定删除技能「${skill.name}」？删除后无法撤销。") },
            confirmButton = {
                TextButton(onClick = { onDelete(skill); deleteTarget = null }) { Text("删除") }
            },
            dismissButton = { TextButton(onClick = { deleteTarget = null }) { Text("取消") } },
        )
    }
}

@Composable
private fun SkillItem(
    skill: Skill,
    editable: Boolean,
    onStartConversation: () -> Unit,
    onOpenDetails: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 1.dp,
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(skill.emoji, fontSize = 30.sp, modifier = Modifier.padding(end = 12.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        skill.name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (skill.description.isNotBlank()) {
                        Text(
                            skill.description,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                if (editable) {
                    IconButton(onClick = onEdit, modifier = Modifier.size(40.dp)) {
                        Icon(Icons.Rounded.Edit, contentDescription = "编辑技能")
                    }
                    IconButton(onClick = onDelete, modifier = Modifier.size(40.dp)) {
                        Icon(Icons.Rounded.Delete, contentDescription = "删除技能")
                    }
                }
            }
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (skill.kind == "pack") item { SkillBadge("技能包") }
                if (skill.clientMutationState == "pending") item { SkillBadge("保存中…") }
                when (skill.visibility) {
                    "public" -> item { SkillBadge("已公开") }
                    "pending" -> item { SkillBadge("审核中") }
                }
                if (skill.reviewStatus == "rejected") item { SkillBadge("未通过") }
                if (skill.kind == "pack") {
                    item { SkillBadge("v${skill.version}") }
                    if (skill.resourceRefs.isNotEmpty()) {
                        item { SkillBadge("${skill.resourceRefs.size} 个资源") }
                    }
                    if (skill.scriptPolicy.enabled) item { SkillBadge("含脚本") }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "${skill.usageCount} 次使用",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                if (skill.kind == "pack") {
                    TextButton(onClick = onOpenDetails) {
                        Icon(Icons.Rounded.Info, contentDescription = null)
                        Spacer(Modifier.size(6.dp))
                        Text("详情")
                    }
                }
                Button(onClick = onStartConversation) {
                    Icon(Icons.AutoMirrored.Rounded.Chat, contentDescription = null)
                    Spacer(Modifier.size(8.dp))
                    Text("对话")
                }
            }
        }
    }
}

@Composable
private fun SkillPackDetailsDialog(
    skill: Skill,
    onDismiss: () -> Unit,
    onStartConversation: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("${skill.emoji} ${skill.name}") },
        text = {
            LazyColumn(
                modifier = Modifier.heightIn(max = 560.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    Text(
                        skill.description.ifBlank { "该技能包没有补充说明。" },
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        SkillBadge("v${skill.version}")
                        skill.source?.takeIf(String::isNotBlank)?.let { SkillBadge(it) }
                        if (skill.scriptPolicy.enabled) SkillBadge("含脚本")
                    }
                }
                val tools = (skill.requiredTools + skill.enabledTools).distinct()
                if (tools.isNotEmpty()) {
                    item { DetailSectionTitle("工具能力") }
                    item {
                        Text(
                            tools.joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                if (skill.resourceRefs.isNotEmpty()) {
                    item { DetailSectionTitle("资源（${skill.resourceRefs.size}）") }
                    items(skill.resourceRefs, key = { it.id }) { resource ->
                        SkillResourceCard(resource)
                    }
                } else {
                    item {
                        Text(
                            "此技能包没有公开资源。",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                if (skill.scriptPolicy.enabled) {
                    item { DetailSectionTitle("脚本策略") }
                    item {
                        val timeout = skill.scriptPolicy.timeoutMs?.let { " · 超时 ${it}ms" }.orEmpty()
                        val network = when (skill.scriptPolicy.network) {
                            true -> " · 可联网"
                            false -> " · 禁止联网"
                            null -> ""
                        }
                        val scripts = skill.scriptPolicy.allowedScripts
                            .takeIf(List<String>::isNotEmpty)
                            ?.joinToString("、")
                            ?.let { "\n允许脚本：$it" }
                            .orEmpty()
                        Text(
                            "受限脚本执行$timeout$network$scripts",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        },
        confirmButton = { Button(onClick = onStartConversation) { Text("开始对话") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("关闭") } },
    )
}

@Composable
private fun DetailSectionTitle(title: String) {
    Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
}

@Composable
private fun SkillResourceCard(resource: com.linhub.android.core.model.SkillResourceRef) {
    var expanded by remember(resource.id) { mutableStateOf(false) }
    val content = resource.content?.takeIf(String::isNotBlank)
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = content != null) { expanded = !expanded },
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
    ) {
        Column(Modifier.padding(11.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(resource.name, style = MaterialTheme.typography.labelLarge)
                    Text(
                        listOfNotNull(
                            resource.kind,
                            resource.mimeType,
                            resource.size?.let(::formatResourceBytes),
                        ).joinToString(" · ").ifBlank { resource.id },
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (content != null) Text(if (expanded) "收起" else "查看", style = MaterialTheme.typography.labelSmall)
            }
            resource.description?.takeIf(String::isNotBlank)?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (expanded && content != null) {
                Text(
                    content.take(12_000),
                    modifier = Modifier.padding(top = 6.dp),
                    style = MaterialTheme.typography.bodySmall,
                )
                if (content.length > 12_000) {
                    Text(
                        "内容过长，已显示前 12,000 个字符",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

private fun formatResourceBytes(value: Long): String = when {
    value >= 1024L * 1024L -> formatResourceTenths(value * 10 / (1024L * 1024L), "MB")
    value >= 1024L -> formatResourceTenths(value * 10 / 1024L, "KB")
    else -> "$value B"
}

private fun formatResourceTenths(value: Long, unit: String) = "${value / 10}.${value % 10} $unit"

@Composable
private fun SkillBadge(label: String) {
    Surface(
        shape = RoundedCornerShape(6.dp),
        color = MaterialTheme.colorScheme.secondaryContainer,
        contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
    ) {
        Text(label, modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp), fontSize = 11.sp)
    }
}

@Composable
private fun EmptySkills(market: Boolean, onCreate: () -> Unit) {
    WebEmptyState(
        icon = Icons.Outlined.AutoAwesomeOutlined,
        title = if (market) "技能广场暂时为空" else "还没有自定义技能",
        description = if (market) {
            "公开技能通过审核后，会显示在这里。"
        } else {
            "把常用的提示词、模型与工具组合保存为技能，一键发起对话。"
        },
        actionLabel = if (market) null else "创建第一个技能",
        onAction = if (market) null else onCreate,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
    )
}

@Composable
private fun SkillEditorDialog(
    skill: Skill?,
    models: List<Model>,
    onDismiss: () -> Unit,
    onSave: (String, String, String, String, String, String?, Boolean) -> Unit,
) {
    var name by remember(skill?.id) { mutableStateOf(skill?.name.orEmpty()) }
    var emoji by remember(skill?.id) { mutableStateOf(skill?.emoji ?: SKILL_EMOJIS.first()) }
    var description by remember(skill?.id) { mutableStateOf(skill?.description.orEmpty()) }
    var prompt by remember(skill?.id) { mutableStateOf(skill?.systemPrompt.orEmpty()) }
    var greeting by remember(skill?.id) { mutableStateOf(skill?.greeting.orEmpty()) }
    var modelId by remember(skill?.id) { mutableStateOf(skill?.defaultModelId) }
    var shareToMarket by remember(skill?.id) {
        mutableStateOf(skill?.visibility == "public" || skill?.visibility == "pending")
    }
    var modelMenu by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (skill == null) "创建技能" else "编辑技能") },
        text = {
            LazyColumn(
                modifier = Modifier.heightIn(max = 560.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item {
                    Text("图标", style = MaterialTheme.typography.labelLarge)
                    LazyRow(
                        modifier = Modifier.padding(top = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        items(SKILL_EMOJIS) { choice ->
                            Surface(
                                modifier = Modifier
                                    .size(42.dp)
                                    .clickable { emoji = choice },
                                shape = RoundedCornerShape(8.dp),
                                color = if (emoji == choice) {
                                    MaterialTheme.colorScheme.primaryContainer
                                } else {
                                    MaterialTheme.colorScheme.surfaceVariant
                                },
                            ) {
                                Box(contentAlignment = Alignment.Center) { Text(choice, fontSize = 21.sp) }
                            }
                        }
                    }
                }
                item {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text("名称 *") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                item {
                    OutlinedTextField(
                        value = description,
                        onValueChange = { description = it },
                        label = { Text("描述") },
                        maxLines = 3,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                item {
                    OutlinedTextField(
                        value = prompt,
                        onValueChange = { prompt = it },
                        label = { Text("系统提示词 *") },
                        minLines = 4,
                        maxLines = 8,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                item {
                    OutlinedTextField(
                        value = greeting,
                        onValueChange = { greeting = it },
                        label = { Text("开场白") },
                        maxLines = 3,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                item {
                    Box {
                        TextButton(onClick = { modelMenu = true }) {
                            Text(models.firstOrNull { it.id == modelId }?.displayName ?: "跟随当前模型")
                        }
                        DropdownMenu(expanded = modelMenu, onDismissRequest = { modelMenu = false }) {
                            DropdownMenuItem(
                                text = { Text("跟随当前模型") },
                                onClick = { modelId = null; modelMenu = false },
                            )
                            models.forEach { model ->
                                DropdownMenuItem(
                                    text = { Text(model.displayName) },
                                    onClick = { modelId = model.id; modelMenu = false },
                                )
                            }
                        }
                    }
                }
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { shareToMarket = !shareToMarket }
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text("分享到技能广场", style = MaterialTheme.typography.bodyMedium)
                            Text(
                                "通过管理员审核后对所有用户可见",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Checkbox(checked = shareToMarket, onCheckedChange = null)
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    onSave(name, emoji, description, prompt, greeting, modelId, shareToMarket)
                },
                enabled = name.isNotBlank() && prompt.isNotBlank(),
            ) { Text("保存") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}
