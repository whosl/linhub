package com.linhub.android.ui

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.Psychology
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.linhub.android.core.model.ChatStyle
import com.linhub.android.core.model.McpServer
import com.linhub.android.core.model.MemoryEntry
import com.linhub.android.BuildConfig
import coil.compose.AsyncImage
import coil.request.ImageRequest
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    state: LinHubUiState,
    loading: Boolean,
    onOpenMenu: () -> Unit,
    onRefresh: () -> Unit,
    onSelectSection: (SettingsSection) -> Unit,
    onSaveName: (String) -> Unit,
    onUpdateAvatar: (String, String, ByteArray) -> Unit,
    onExportData: (Uri) -> Unit,
    onError: (String) -> Unit,
    onSetMessageRailEnabled: (Boolean) -> Unit,
    onSaveMemory: (String) -> Unit,
    onDeleteMemory: (MemoryEntry) -> Unit,
    onSaveStyle: (String, String, String) -> Unit,
    onDeleteStyle: (ChatStyle) -> Unit,
    onSetDefaultStyle: (String) -> Unit,
    onSaveMcpServer: (McpServer?, String, String, String, Map<String, String>?) -> Unit,
    onToggleMcpServer: (McpServer) -> Unit,
    onTestMcpServer: (McpServer) -> Unit,
    onDeleteMcpServer: (McpServer) -> Unit,
    modifier: Modifier = Modifier,
) {
    val section = state.selectedSettingsSection
    val sectionLoaded = isSettingsSectionLoaded(
        section,
        state.settingsLoadedResources,
        userAvailable = state.user != null,
    )
    val sectionLoading = loading || isSettingsSectionLoading(
        section,
        state.settingsLoadingResources,
    )
    Scaffold(
        modifier = modifier,
        contentWindowInsets = WindowInsets(0),
        topBar = {
            WebPageHeader(
                title = "设置",
                description = "账户、界面、记忆、回复风格与连接器",
                onOpenMenu = onOpenMenu,
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            WebTabRow(
                labels = listOf("账户", "记忆", "回复风格", "MCP 连接器"),
                selectedIndex = section.ordinal,
                onSelect = { onSelectSection(SettingsSection.entries[it]) },
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )
            if (sectionLoading && !sectionLoaded) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(strokeWidth = 2.dp)
                }
            } else if (!sectionLoaded) {
                SettingsSectionLoadFailure(onRefresh)
            } else {
                AnimatedContent(
                    targetState = section,
                    modifier = Modifier.weight(1f),
                    transitionSpec = {
                        fadeIn(spring(stiffness = 520f)) togetherWith
                            fadeOut(spring(stiffness = 620f))
                    },
                    label = "settings-section",
                ) { selected ->
                    when (selected) {
                        SettingsSection.Account -> AccountSettings(
                            state = state,
                            loading = sectionLoading,
                            onSaveName = onSaveName,
                            onUpdateAvatar = onUpdateAvatar,
                            onExportData = onExportData,
                            onError = onError,
                            onSetMessageRailEnabled = onSetMessageRailEnabled,
                        )
                        SettingsSection.Memory -> MemorySettings(
                            memories = state.memories,
                            loading = sectionLoading,
                            onSave = onSaveMemory,
                            onDelete = onDeleteMemory,
                        )
                        SettingsSection.Styles -> StyleSettings(
                            styles = state.styles,
                            defaultStyleId = state.defaultStyleId,
                            loading = sectionLoading,
                            onSave = onSaveStyle,
                            onDelete = onDeleteStyle,
                            onSetDefault = onSetDefaultStyle,
                        )
                        SettingsSection.Mcp -> McpSettings(
                            servers = state.mcpServers.filter { it.scope == "user" },
                            testingIds = state.testingMcpServerIds,
                            loading = sectionLoading,
                            onSave = onSaveMcpServer,
                            onToggle = onToggleMcpServer,
                            onTest = onTestMcpServer,
                            onDelete = onDeleteMcpServer,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SettingsSectionLoadFailure(onRetry: () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text("当前标签加载失败", fontWeight = FontWeight.SemiBold)
            Text(
                "请检查网络后重试，其他已加载设置不会受影响。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedButton(onClick = onRetry) { Text("重试") }
        }
    }
}

@Composable
private fun AccountSettings(
    state: LinHubUiState,
    loading: Boolean,
    onSaveName: (String) -> Unit,
    onUpdateAvatar: (String, String, ByteArray) -> Unit,
    onExportData: (Uri) -> Unit,
    onError: (String) -> Unit,
    onSetMessageRailEnabled: (Boolean) -> Unit,
) {
    val user = state.user ?: return
    var name by remember(user.id, user.name) { mutableStateOf(user.name) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val avatarPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        scope.launch {
            runCatching { withContext(Dispatchers.IO) { readAvatar(context, uri) } }
                .onSuccess { avatar -> onUpdateAvatar(avatar.name, avatar.mimeType, avatar.bytes) }
                .onFailure { onError(it.message ?: "无法读取头像") }
        }
    }
    val exportLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json"),
    ) { uri -> uri?.let(onExportData) }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Surface(
                shape = RoundedCornerShape(16.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                modifier = Modifier.fillMaxWidth(),
                shadowElevation = 1.dp,
            ) {
                Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
                    Surface(
                        shape = androidx.compose.foundation.shape.CircleShape,
                        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                        modifier = Modifier
                            .semantics { contentDescription = "更换头像" }
                            .clickable(enabled = !loading) {
                                avatarPicker.launch(arrayOf("image/*"))
                            },
                    ) {
                        Box(Modifier.size(56.dp), contentAlignment = Alignment.Center) {
                            if (user.avatarUrl.isNullOrBlank()) {
                                Text(user.name.take(1), style = MaterialTheme.typography.titleLarge)
                            } else {
                                AsyncImage(
                                    model = ImageRequest.Builder(context)
                                        .data(settingsMediaUrl(user.avatarUrl))
                                        .crossfade(true)
                                        .build(),
                                    contentDescription = null,
                                    modifier = Modifier.fillMaxSize(),
                                    contentScale = ContentScale.Crop,
                                )
                            }
                        }
                    }
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .padding(start = 12.dp),
                    ) {
                        Text(user.name, fontWeight = FontWeight.SemiBold)
                        Text(
                            user.email,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (user.role == "admin") {
                        Surface(
                            shape = androidx.compose.foundation.shape.CircleShape,
                            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                        ) {
                            Text(
                                "管理员",
                                modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
                                color = MaterialTheme.colorScheme.primary,
                                style = MaterialTheme.typography.labelSmall,
                            )
                        }
                    }
                }
            }
        }
        item {
            Surface(
                shape = RoundedCornerShape(16.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                modifier = Modifier.fillMaxWidth(),
                shadowElevation = 1.dp,
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("昵称", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        singleLine = true,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(56.dp),
                    )
                    Button(
                        onClick = { onSaveName(name) },
                        enabled = name.isNotBlank() && name.trim() != user.name && !loading,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            disabledContainerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.45f),
                            disabledContentColor = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.75f),
                        ),
                    ) { Text("保存") }
                    Text("修改密码", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    OutlinedButton(onClick = { onError("Web 当前版本尚未接入修改密码") }) {
                        Text("修改密码")
                    }
                }
            }
        }
        item {
            Surface(
                shape = RoundedCornerShape(16.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                modifier = Modifier.fillMaxWidth(),
                shadowElevation = 1.dp,
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text("界面", style = MaterialTheme.typography.labelLarge)
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.32f),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text("聊天消息导航条", style = MaterialTheme.typography.labelLarge)
                                Text(
                                    "在聊天页右侧显示消息导航，点击可跳转到对应用户消息。",
                                    modifier = Modifier.padding(top = 2.dp),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Switch(
                                checked = state.messageRailEnabled,
                                onCheckedChange = onSetMessageRailEnabled,
                                modifier = Modifier.scale(0.72f),
                            )
                        }
                    }
                }
            }
        }
        item {
            Surface(
                shape = RoundedCornerShape(16.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                modifier = Modifier.fillMaxWidth(),
                shadowElevation = 1.dp,
            ) {
                Column(Modifier.padding(20.dp)) {
                    Text("数据", style = MaterialTheme.typography.labelLarge)
                    Row(
                        modifier = Modifier.padding(top = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedButton(
                            onClick = { exportLauncher.launch("linhub-account-export.json") },
                            enabled = !loading,
                        ) {
                            Icon(Icons.Rounded.Download, contentDescription = null)
                            Text("导出数据")
                        }
                        OutlinedButton(
                            onClick = { onError("Web 当前版本尚未接入删除账户") },
                            enabled = !loading,
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = MaterialTheme.colorScheme.error,
                            ),
                        ) {
                            Icon(Icons.Rounded.Delete, contentDescription = null)
                            Text("删除账户")
                        }
                    }
                }
            }
        }
    }
}

private data class PickedAvatar(
    val name: String,
    val mimeType: String,
    val bytes: ByteArray,
)

private fun readAvatar(context: Context, uri: Uri): PickedAvatar {
    val resolver = context.contentResolver
    val mimeType = resolver.getType(uri)?.takeIf { it.startsWith("image/") }
        ?: error("请选择图片文件")
    val name = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
        ?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        }
        ?.takeIf(String::isNotBlank)
        ?: "avatar"
    val bytes = resolver.openInputStream(uri)?.use { input ->
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        var total = 0
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            total += count
            if (total > MAX_AVATAR_BYTES) error("头像图片不能超过 5MB")
            output.write(buffer, 0, count)
        }
        output.toByteArray()
    } ?: error("无法读取头像")
    check(bytes.isNotEmpty()) { "头像图片为空" }
    return PickedAvatar(name, mimeType, bytes)
}

private fun settingsMediaUrl(url: String): String = when {
    url.startsWith("/") -> BuildConfig.API_BASE_URL.trimEnd('/') + url
    else -> url
}

private const val MAX_AVATAR_BYTES = 5 * 1024 * 1024

@Composable
private fun MemorySettings(
    memories: List<MemoryEntry>,
    loading: Boolean,
    onSave: (String) -> Unit,
    onDelete: (MemoryEntry) -> Unit,
) {
    var input by rememberSaveable { mutableStateOf("") }
    var deleteTarget by remember { mutableStateOf<MemoryEntry?>(null) }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            Text(
                "模型会在对话中自动记录关于你的偏好与事实，也会在新对话中回忆相关内容。你可以随时删除任何一条。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Column(
                modifier = Modifier.padding(top = 10.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it },
                    placeholder = { Text("手动添加一条记忆，例如：我偏好简洁的回答") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(
                    onClick = { onSave(input); input = "" },
                    enabled = input.isNotBlank() && !loading,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Rounded.Add, contentDescription = null)
                    Text("添加")
                }
            }
        }
        if (memories.isEmpty()) {
            item {
                WebEmptyState(
                    icon = Icons.Rounded.Psychology,
                    title = "还没有记忆",
                    description = "随着对话进行，模型会自动积累对你的了解。",
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        } else {
            items(memories, key = MemoryEntry::id) { memory ->
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    shadowElevation = 1.dp,
                    modifier = Modifier
                        .fillMaxWidth()
                        .animateItem(),
                ) {
                    Row(
                        modifier = Modifier.padding(start = 16.dp, top = 12.dp, bottom = 12.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        Icon(
                            Icons.Rounded.Psychology,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier
                                .padding(top = 3.dp)
                                .size(17.dp),
                        )
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .padding(horizontal = 10.dp),
                        ) {
                            Text(memory.content, style = MaterialTheme.typography.bodySmall)
                            Text(
                                formatSettingsRelativeTime(memory.updatedAt) + if (
                                    memory.clientMutationState == "pending"
                                ) " · 保存中…" else "",
                                modifier = Modifier.padding(top = 2.dp),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        IconButton(onClick = { deleteTarget = memory }) {
                            Icon(
                                Icons.Rounded.Delete,
                                contentDescription = "删除记忆「${memory.content.take(32)}」",
                            )
                        }
                    }
                }
            }
        }
    }
    deleteTarget?.let { memory ->
        ConfirmDelete(
            title = "删除记忆",
            body = "确定删除「${memory.content.take(80)}」？",
            onDismiss = { deleteTarget = null },
            onConfirm = { onDelete(memory); deleteTarget = null },
        )
    }
}

@Composable
private fun StyleSettings(
    styles: List<ChatStyle>,
    defaultStyleId: String,
    loading: Boolean,
    onSave: (String, String, String) -> Unit,
    onDelete: (ChatStyle) -> Unit,
    onSetDefault: (String) -> Unit,
) {
    var editorOpen by remember { mutableStateOf(false) }
    var deleteTarget by remember { mutableStateOf<ChatStyle?>(null) }
    var styleMenu by remember { mutableStateOf(false) }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Column(
                horizontalAlignment = Alignment.Start,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    "风格决定回复的语气与详略，新对话会使用你选择的默认风格。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(onClick = { editorOpen = true }, enabled = !loading) {
                    Icon(Icons.Rounded.Add, contentDescription = null)
                    Text("自定义风格")
                }
            }
        }
        if (styles.isNotEmpty()) {
            item {
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    shadowElevation = 1.dp,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text("默认回复风格", style = MaterialTheme.typography.labelLarge)
                        Box(modifier = Modifier.fillMaxWidth()) {
                            OutlinedButton(
                                onClick = { styleMenu = true },
                                enabled = !loading,
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp),
                                contentPadding = PaddingValues(horizontal = 12.dp),
                            ) {
                                Text(
                                    styles.firstOrNull { it.id == defaultStyleId }?.name ?: "标准",
                                    modifier = Modifier.weight(1f),
                                    color = MaterialTheme.colorScheme.onSurface,
                                )
                                Icon(
                                    Icons.Rounded.KeyboardArrowDown,
                                    contentDescription = "选择默认回复风格",
                                    modifier = Modifier.size(18.dp),
                                )
                            }
                            DropdownMenu(
                                expanded = styleMenu,
                                onDismissRequest = { styleMenu = false },
                                modifier = Modifier.fillMaxWidth(0.86f),
                            ) {
                                styles.forEach { style ->
                                    DropdownMenuItem(
                                        text = { Text(style.name) },
                                        onClick = {
                                            onSetDefault(style.id)
                                            styleMenu = false
                                        },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
        items(styles, key = ChatStyle::id) { style ->
            Surface(
                shape = RoundedCornerShape(16.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                shadowElevation = 1.dp,
                modifier = Modifier
                    .fillMaxWidth()
                    .animateItem(),
            ) {
                Column(Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.Top,
                    ) {
                        Text(
                            style.name + if (style.clientMutationState == "pending") {
                                " · 保存中…"
                            } else "",
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Medium,
                        )
                        if (style.builtIn) {
                            Surface(
                                shape = androidx.compose.foundation.shape.CircleShape,
                                border = BorderStroke(
                                    1.dp,
                                    MaterialTheme.colorScheme.outlineVariant,
                                ),
                                color = MaterialTheme.colorScheme.surface,
                            ) {
                                Text(
                                    "内置",
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        } else {
                            IconButton(onClick = { deleteTarget = style }) {
                                Icon(
                                    Icons.Rounded.Delete,
                                    contentDescription = "删除回复风格「${style.name}」",
                                )
                            }
                        }
                    }
                    Text(
                        style.description,
                        modifier = Modifier.padding(top = 4.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
    if (editorOpen) {
        StyleEditor(
            onDismiss = { editorOpen = false },
            onSave = { name, description, prompt ->
                onSave(name, description, prompt)
                editorOpen = false
            },
        )
    }
    deleteTarget?.let { style ->
        ConfirmDelete(
            title = "删除回复风格",
            body = "确定删除「${style.name}」？",
            onDismiss = { deleteTarget = null },
            onConfirm = { onDelete(style); deleteTarget = null },
        )
    }
}

@Composable
private fun StyleEditor(
    onDismiss: () -> Unit,
    onSave: (String, String, String) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var prompt by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("自定义回复风格") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("风格名称") },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("一句话描述") },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = prompt,
                    onValueChange = { prompt = it },
                    label = { Text("风格指令") },
                    minLines = 4,
                    maxLines = 8,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onSave(name, description, prompt) },
                enabled = name.isNotBlank() && prompt.isNotBlank(),
            ) { Text("创建") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

@Composable
private fun McpSettings(
    servers: List<McpServer>,
    testingIds: Set<String>,
    loading: Boolean,
    onSave: (McpServer?, String, String, String, Map<String, String>?) -> Unit,
    onToggle: (McpServer) -> Unit,
    onTest: (McpServer) -> Unit,
    onDelete: (McpServer) -> Unit,
) {
    var editorOpen by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<McpServer?>(null) }
    var deleteTarget by remember { mutableStateOf<McpServer?>(null) }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(14.dp),
        verticalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "连接个人 MCP 服务器，并在对话工具面板中按需启用。",
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(
                    onClick = { editing = null; editorOpen = true },
                    enabled = !loading,
                ) {
                    Icon(Icons.Rounded.Add, contentDescription = null)
                    Text("添加")
                }
            }
        }
        items(servers, key = McpServer::id) { server ->
            Surface(
                shape = RoundedCornerShape(16.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.Link, contentDescription = null)
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .padding(horizontal = 10.dp),
                        ) {
                            Text(server.name, fontWeight = FontWeight.SemiBold)
                            Text(
                                server.url,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Switch(
                            checked = server.enabled,
                            onCheckedChange = { onToggle(server) },
                            enabled = !loading,
                            modifier = Modifier.scale(0.72f),
                        )
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            buildString {
                                append("${server.transport} · ${server.status} · ${server.tools.size} 个工具")
                                if (server.clientMutationState == "pending") append(" · 保存中…")
                            },
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        TextButton(
                            onClick = { onTest(server) },
                            enabled = server.id !in testingIds,
                        ) {
                            if (server.id in testingIds) {
                                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                            } else {
                                Text("测试")
                            }
                        }
                        IconButton(onClick = { editing = server; editorOpen = true }) {
                            Icon(Icons.Rounded.Edit, contentDescription = "编辑服务器")
                        }
                        IconButton(onClick = { deleteTarget = server }) {
                            Icon(Icons.Rounded.Delete, contentDescription = "删除服务器")
                        }
                    }
                    if (server.tools.isNotEmpty()) {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            items(server.tools, key = { it.name }) { tool ->
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                                    border = BorderStroke(
                                        1.dp,
                                        MaterialTheme.colorScheme.outlineVariant,
                                    ),
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
    }
    if (editorOpen) {
        McpEditor(
            server = editing,
            onDismiss = { editorOpen = false },
            onSave = { name, url, transport, headers ->
                onSave(editing, name, url, transport, headers)
                editorOpen = false
            },
        )
    }
    deleteTarget?.let { server ->
        ConfirmDelete(
            title = "删除 MCP 服务器",
            body = "确定删除「${server.name}」？",
            onDismiss = { deleteTarget = null },
            onConfirm = { onDelete(server); deleteTarget = null },
        )
    }
}

@Composable
private fun McpEditor(
    server: McpServer?,
    onDismiss: () -> Unit,
    onSave: (String, String, String, Map<String, String>?) -> Unit,
) {
    var name by remember(server?.id) { mutableStateOf(server?.name.orEmpty()) }
    var url by remember(server?.id) { mutableStateOf(server?.url.orEmpty()) }
    var transport by remember(server?.id) {
        mutableStateOf(server?.transport ?: "streamable-http")
    }
    var transportMenu by remember { mutableStateOf(false) }
    var headerText by remember(server?.id) { mutableStateOf("") }
    var clearHeaders by remember(server?.id) { mutableStateOf(false) }
    var headerError by remember(server?.id) { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (server == null) "添加 MCP 服务器" else "编辑 MCP 服务器") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("名称") },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    label = { Text("服务器 URL") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Box {
                    TextButton(onClick = { transportMenu = true }) {
                        Text(if (transport == "sse") "SSE" else "Streamable HTTP")
                    }
                    DropdownMenu(
                        expanded = transportMenu,
                        onDismissRequest = { transportMenu = false },
                    ) {
                        listOf("streamable-http" to "Streamable HTTP", "sse" to "SSE")
                            .forEach { (value, label) ->
                                DropdownMenuItem(
                                    text = { Text(label) },
                                    onClick = { transport = value; transportMenu = false },
                                )
                            }
                    }
                }
                OutlinedTextField(
                    value = headerText,
                    onValueChange = { headerText = it; headerError = null },
                    label = { Text("请求头密钥（每行 名称: 值）") },
                    placeholder = { Text("Authorization: Bearer …") },
                    enabled = !clearHeaders,
                    minLines = 3,
                    maxLines = 6,
                    supportingText = {
                        Text(
                            when {
                                headerError != null -> headerError.orEmpty()
                                server?.headersMasked?.isNotEmpty() == true -> {
                                    "已保存：" + server.headersMasked.entries.joinToString { (key, value) ->
                                        "$key=$value"
                                    } + "；留空保持不变"
                                }
                                else -> "密钥仅加密保存，客户端不会再次读取明文"
                            },
                        )
                    },
                    isError = headerError != null,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (server?.headersMasked?.isNotEmpty() == true) {
                    TextButton(onClick = {
                        clearHeaders = !clearHeaders
                        headerText = ""
                        headerError = null
                    }) {
                        Text(if (clearHeaders) "取消清除请求头" else "清除已有请求头")
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val headers = when {
                        clearHeaders -> emptyMap()
                        headerText.isBlank() -> null
                        else -> runCatching { parseMcpHeaderLines(headerText) }
                            .onFailure { headerError = it.message ?: "请求头格式无效" }
                            .getOrNull() ?: return@TextButton
                    }
                    onSave(name, url, transport, headers)
                },
                enabled = name.isNotBlank() && url.isNotBlank(),
            ) { Text("保存") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

internal fun parseMcpHeaderLines(input: String): Map<String, String> {
    val result = linkedMapOf<String, String>()
    input.lineSequence().filter(String::isNotBlank).forEach { line ->
        val separator = line.indexOf(':')
        require(separator > 0) { "每行请求头必须使用“名称: 值”格式" }
        val name = line.substring(0, separator).trim()
        val value = line.substring(separator + 1).trim()
        require(HEADER_NAME.matches(name)) { "请求头名称无效：$name" }
        require(value.length <= 4096 && '\r' !in value && '\n' !in value) {
            "请求头值无效：$name"
        }
        require(name.lowercase() !in FORBIDDEN_MCP_HEADERS) { "不允许设置请求头：$name" }
        require(result.keys.none { it.equals(name, ignoreCase = true) }) { "请求头名称重复：$name" }
        require(result.size < 20) { "请求头不能超过 20 项" }
        result[name] = value
    }
    return result
}

private val HEADER_NAME = Regex("[!#$%&'*+.^_`|~0-9A-Za-z-]+")
private val FORBIDDEN_MCP_HEADERS = setOf("host", "content-length", "connection", "transfer-encoding")

@Composable
private fun ConfirmDelete(
    title: String,
    body: String,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(body) },
        confirmButton = { TextButton(onClick = onConfirm) { Text("删除") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}
