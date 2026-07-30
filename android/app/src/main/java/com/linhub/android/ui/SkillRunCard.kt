package com.linhub.android.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AttachFile
import androidx.compose.material.icons.rounded.Cancel
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material.icons.rounded.HourglassTop
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.StopCircle
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.linhub.android.core.model.PptStudioBriefRequest
import com.linhub.android.core.model.SkillRunAttachment
import com.linhub.android.core.model.SkillRunSnapshot
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive

private val pptThemes = listOf(
    "theme01" to "轻拟态 · 产品汇报",
    "theme02" to "紫绿炫光 · 科技发布",
    "theme03" to "深浅代码 · 技术方案",
    "theme04" to "玻璃糖果 · 创意品牌",
    "theme05" to "色谱图表 · 数据报告",
    "theme06" to "深色图谱 · 战略分析",
    "theme07" to "冷白调研 · 白皮书",
    "theme08" to "黑金实验 · 高端发布",
    "theme09" to "深蓝杂志 · 品牌故事",
    "theme10" to "金色指数 · 金融投资",
    "theme11" to "高能增长 · 商业路演",
    "theme12" to "声波霓虹 · 娱乐潮流",
)

private data class PptBriefDraft(
    val topic: String,
    val audience: String,
    val pageCount: String,
    val theme: String,
    val mediaPreference: String,
    val language: String,
    val outputFormat: String,
    val additionalInstructions: String,
)

@Composable
internal fun SkillRunPanel(
    runId: String,
    fallbackSkillName: String,
    initialTopic: String,
    snapshot: SkillRunSnapshot?,
    loading: Boolean,
    mutating: Boolean,
    error: String?,
    onObserve: (String) -> Unit,
    onStopObserving: (String) -> Unit,
    onRefresh: (String) -> Unit,
    onCancel: (String) -> Unit,
    onRetry: (String) -> Unit,
    onSubmitPptBrief: (String, PptStudioBriefRequest) -> Unit,
    onDownload: (Uri, String) -> Unit,
) {
    DisposableEffect(runId) {
        onObserve(runId)
        onDispose { onStopObserving(runId) }
    }

    when {
        snapshot == null -> SkillRunPlaceholder(
            skillName = fallbackSkillName,
            loading = loading,
            error = error,
            onRefresh = { onRefresh(runId) },
        )
        snapshot.kind == "ppt-studio" && snapshot.status == "waiting_input" ->
            PptStudioBriefCard(
                snapshot = snapshot,
                initialTopic = initialTopic,
                mutating = mutating,
                error = error,
                onCancel = { onCancel(runId) },
                onSubmit = { onSubmitPptBrief(runId, it) },
            )
        else -> DurableSkillRunCard(
            snapshot = snapshot,
            mutating = mutating,
            error = error,
            onCancel = { onCancel(runId) },
            onRetry = { onRetry(runId) },
            onDownload = onDownload,
        )
    }
}

@Composable
private fun SkillRunPlaceholder(
    skillName: String,
    loading: Boolean,
    error: String?,
    onRefresh: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (loading) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
            else Icon(Icons.Rounded.ErrorOutline, contentDescription = null)
            Column(Modifier.weight(1f)) {
                Text(skillName, style = MaterialTheme.typography.labelLarge)
                Text(
                    error ?: "正在连接任务…",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (!loading && error != null) {
                IconButton(onClick = onRefresh) {
                    Icon(Icons.Rounded.Refresh, contentDescription = "重新读取任务")
                }
            }
        }
    }
}

@Composable
private fun DurableSkillRunCard(
    snapshot: SkillRunSnapshot,
    mutating: Boolean,
    error: String?,
    onCancel: () -> Unit,
    onRetry: () -> Unit,
    onDownload: (Uri, String) -> Unit,
) {
    var expanded by remember(snapshot.id) { mutableStateOf(false) }
    val progress = normalizeSkillRunProgress(snapshot.progress, snapshot.status)
    val animatedProgress by animateFloatAsState(
        targetValue = progress / 100f,
        animationSpec = spring(dampingRatio = 0.82f, stiffness = 600f),
        label = "skill-run-progress",
    )
    val expansionRotation by animateFloatAsState(
        targetValue = if (expanded) 180f else 0f,
        animationSpec = spring(dampingRatio = 0.78f, stiffness = 700f),
        label = "skill-run-expansion",
    )
    val running = snapshot.status == "running" || snapshot.status == "queued"
    val failed = snapshot.status == "failed" || snapshot.status == "error"
    val stopped = snapshot.status == "cancelled" || snapshot.status == "stopped"
    val completed = snapshot.status == "completed" || snapshot.status == "success"
    val statusLabel = when {
        completed -> "已完成"
        failed -> "执行失败"
        stopped -> "已停止"
        snapshot.status == "waiting_input" -> "等待输入"
        running -> "执行中"
        else -> "等待执行"
    }
    val statusColor = when {
        failed -> MaterialTheme.colorScheme.error
        completed -> MaterialTheme.colorScheme.primary
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    val hasDetails = snapshot.steps.isNotEmpty() || snapshot.resultAttachments.isNotEmpty() ||
        snapshot.sourceCount > 0 || !snapshot.error.isNullOrBlank() || !error.isNullOrBlank()

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(
            1.dp,
            if (failed) MaterialTheme.colorScheme.error.copy(alpha = 0.45f)
            else MaterialTheme.colorScheme.outlineVariant,
        ),
    ) {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(enabled = hasDetails) { expanded = !expanded }
                    .padding(14.dp),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                when {
                    running -> CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                    completed -> Icon(Icons.Rounded.CheckCircle, null, tint = statusColor)
                    failed -> Icon(Icons.Rounded.ErrorOutline, null, tint = statusColor)
                    stopped -> Icon(Icons.Rounded.Cancel, null, tint = statusColor)
                    else -> Icon(Icons.Rounded.HourglassTop, null, tint = statusColor)
                }
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            snapshot.skillName,
                            modifier = Modifier.weight(1f, fill = false),
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(statusLabel, style = MaterialTheme.typography.labelSmall, color = statusColor)
                    }
                    Text(
                        snapshot.stageLabel,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    val summary = buildList {
                        if (snapshot.steps.isNotEmpty()) add("${snapshot.steps.size} 个步骤")
                        if (snapshot.sourceCount > 0) add("${snapshot.sourceCount} 个来源")
                    }.joinToString(" · ")
                    if (summary.isNotEmpty()) {
                        Text(
                            summary,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                if (running) {
                    IconButton(onClick = onCancel, enabled = !mutating, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Rounded.StopCircle, contentDescription = "停止 ${snapshot.skillName}")
                    }
                } else if (failed || stopped) {
                    IconButton(onClick = onRetry, enabled = !mutating, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Rounded.Refresh, contentDescription = "重试 ${snapshot.skillName}")
                    }
                }
                if (hasDetails) {
                    Icon(
                        Icons.Rounded.ExpandMore,
                        contentDescription = if (expanded) "收起运行详情" else "展开运行详情",
                        modifier = Modifier.rotate(expansionRotation),
                    )
                }
            }
            if (running || progress > 0) {
                LinearProgressIndicator(
                    progress = { animatedProgress },
                    modifier = Modifier.fillMaxWidth(),
                    color = if (failed) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                )
            }
            AnimatedVisibility(expanded && hasDetails) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    (error ?: snapshot.error)?.takeIf(String::isNotBlank)?.let {
                        Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                    }
                    snapshot.steps.forEachIndexed { index, step ->
                        Surface(
                            shape = MaterialTheme.shapes.medium,
                            color = MaterialTheme.colorScheme.surfaceContainer,
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 9.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.Top,
                            ) {
                                Icon(
                                    when (step.status) {
                                        "completed", "success" -> Icons.Rounded.CheckCircle
                                        "failed", "error" -> Icons.Rounded.ErrorOutline
                                        else -> Icons.Rounded.HourglassTop
                                    },
                                    contentDescription = null,
                                    modifier = Modifier.size(17.dp),
                                    tint = if (step.status == "failed" || step.status == "error") {
                                        MaterialTheme.colorScheme.error
                                    } else {
                                        MaterialTheme.colorScheme.primary
                                    },
                                )
                                Column(Modifier.weight(1f)) {
                                    Text(
                                        "${index + 1}. ${step.label}",
                                        style = MaterialTheme.typography.labelMedium,
                                    )
                                    Text(
                                        buildList {
                                            add(skillStepStatusLabel(step.status))
                                            if (step.sourceCount > 0) add("${step.sourceCount} 个来源")
                                            if (step.attempt > 1) add("已重试 ${step.attempt - 1} 次")
                                        }.joinToString(" · "),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                    step.error?.let {
                                        Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
                                    }
                                }
                            }
                        }
                    }
                    snapshot.resultAttachments.forEach { attachment ->
                        SkillRunAttachmentEntry(attachment, onDownload)
                    }
                }
            }
        }
    }
}

@Composable
private fun SkillRunAttachmentEntry(
    attachment: SkillRunAttachment,
    onDownload: (Uri, String) -> Unit,
) {
    var pendingUrl by remember(attachment.id) { mutableStateOf<String?>(null) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("*/*")) { uri ->
        val url = pendingUrl
        pendingUrl = null
        if (uri != null && url != null) onDownload(uri, url)
    }
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = !attachment.url.isNullOrBlank()) {
                pendingUrl = attachment.url
                launcher.launch(attachment.name)
            },
        shape = MaterialTheme.shapes.medium,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(9.dp),
        ) {
            Icon(Icons.Rounded.AttachFile, contentDescription = null)
            Column(Modifier.weight(1f)) {
                Text(attachment.name, style = MaterialTheme.typography.labelMedium, maxLines = 1)
                Text(
                    buildString {
                        append(attachment.mimeType ?: "生成文件")
                        attachment.sizeBytes?.let { append(" · ${formatSkillRunFileSize(it)}") }
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (!attachment.url.isNullOrBlank()) {
                Icon(Icons.Rounded.Download, contentDescription = "下载 ${attachment.name}")
            }
        }
    }
}

@Composable
private fun PptStudioBriefCard(
    snapshot: SkillRunSnapshot,
    initialTopic: String,
    mutating: Boolean,
    error: String?,
    onCancel: () -> Unit,
    onSubmit: (PptStudioBriefRequest) -> Unit,
) {
    var draft by remember(snapshot.id) { mutableStateOf(pptDraft(snapshot.input, initialTopic)) }
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(Modifier.animateContentSize()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(14.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Icon(Icons.Rounded.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Column(Modifier.weight(1f)) {
                    Text("PPT 工作室", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                    Text(
                        "填写后开始规划和渲染，退出页面不会丢失任务",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(500.dp)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedTextField(
                    value = draft.topic,
                    onValueChange = { draft = draft.copy(topic = it.take(200)) },
                    label = { Text("演示主题") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = draft.audience,
                    onValueChange = { draft = draft.copy(audience = it.take(200)) },
                    label = { Text("目标受众") },
                    placeholder = { Text("例如：公司管理层") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = draft.pageCount,
                    onValueChange = { value ->
                        if (value.all(Char::isDigit)) draft = draft.copy(pageCount = value.take(2))
                    },
                    label = { Text("页数（3–30）") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                PptChoiceField(
                    label = "视觉主题",
                    value = draft.theme,
                    options = pptThemes,
                    onSelect = { draft = draft.copy(theme = it) },
                )
                PptChoiceField(
                    label = "媒体偏好",
                    value = draft.mediaPreference,
                    options = listOf(
                        "auto" to "自动平衡",
                        "image-heavy" to "图片优先",
                        "text-first" to "文字优先",
                        "no-media" to "不使用媒体",
                    ),
                    onSelect = { draft = draft.copy(mediaPreference = it) },
                )
                PptChoiceField(
                    label = "语言",
                    value = draft.language,
                    options = listOf("zh" to "中文", "en" to "English"),
                    onSelect = { draft = draft.copy(language = it) },
                )
                PptChoiceField(
                    label = "输出格式",
                    value = draft.outputFormat,
                    options = listOf("pptx" to "可编辑 PPTX", "html" to "可编辑 HTML 包"),
                    onSelect = { draft = draft.copy(outputFormat = it) },
                )
                OutlinedTextField(
                    value = draft.additionalInstructions,
                    onValueChange = { draft = draft.copy(additionalInstructions = it.take(1_000)) },
                    label = { Text("补充要求（可选）") },
                    placeholder = { Text("例如：突出增长、减少大段文字、结尾给出行动计划") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                    maxLines = 5,
                )
                error?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onCancel, enabled = !mutating) { Text("取消任务") }
                    Button(
                        modifier = Modifier.weight(1f),
                        enabled = !mutating,
                        onClick = {
                            onSubmit(
                                PptStudioBriefRequest(
                                    topic = draft.topic,
                                    audience = draft.audience,
                                    pageCount = draft.pageCount.toIntOrNull()?.coerceIn(3, 30) ?: 10,
                                    theme = draft.theme,
                                    mediaPreference = draft.mediaPreference,
                                    language = draft.language,
                                    outputFormat = draft.outputFormat,
                                    additionalInstructions = draft.additionalInstructions,
                                ),
                            )
                        },
                    ) {
                        if (mutating) {
                            CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                            Spacer(Modifier.width(8.dp))
                        }
                        Text(if (mutating) "正在提交…" else "提交并开始生成")
                    }
                }
            }
        }
    }
}

@Composable
private fun PptChoiceField(
    label: String,
    value: String,
    options: List<Pair<String, String>>,
    onSelect: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, style = MaterialTheme.typography.labelSmall)
        OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
            Text(
                options.firstOrNull { it.first == value }?.second ?: value,
                modifier = Modifier.weight(1f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Icon(Icons.Rounded.ExpandMore, contentDescription = null)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { (optionValue, optionLabel) ->
                DropdownMenuItem(
                    text = { Text(optionLabel) },
                    onClick = {
                        expanded = false
                        onSelect(optionValue)
                    },
                )
            }
        }
    }
}

private fun pptDraft(input: JsonObject, initialTopic: String): PptBriefDraft = PptBriefDraft(
    topic = input.stringValue("topic") ?: initialTopic,
    audience = input.stringValue("audience").orEmpty(),
    pageCount = input["pageCount"]?.jsonPrimitive?.intOrNull?.coerceIn(3, 30)?.toString() ?: "10",
    theme = input.stringValue("theme")?.takeIf { value -> pptThemes.any { it.first == value } } ?: "theme01",
    mediaPreference = input.stringValue("mediaPreference")
        ?.takeIf { it in setOf("auto", "image-heavy", "text-first", "no-media") } ?: "auto",
    language = input.stringValue("language")?.takeIf { it == "zh" || it == "en" } ?: "zh",
    outputFormat = input.stringValue("outputFormat")?.takeIf { it == "pptx" || it == "html" } ?: "pptx",
    additionalInstructions = input.stringValue("additionalInstructions").orEmpty(),
)

private fun JsonObject.stringValue(key: String): String? =
    get(key)?.jsonPrimitive?.contentOrNull

private fun skillStepStatusLabel(status: String): String = when (status) {
    "running" -> "执行中"
    "completed", "success" -> "已完成"
    "failed", "error" -> "执行失败"
    "cancelled", "stopped", "skipped" -> "已停止"
    else -> "等待执行"
}

private fun formatSkillRunFileSize(bytes: Long): String = when {
    bytes >= 1024L * 1024L -> "%.1f MB".format(bytes / 1024f / 1024f)
    bytes >= 1024L -> "%.1f KB".format(bytes / 1024f)
    else -> "$bytes B"
}
