package com.linhub.android.ui

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas as AndroidCanvas
import android.graphics.Color as AndroidColor
import android.graphics.Paint as AndroidPaint
import android.graphics.Path as AndroidPath
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.net.Uri
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.interaction.DragInteraction
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AddComment
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.automirrored.outlined.ViewSidebar
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.automirrored.rounded.Chat
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.automirrored.rounded.VolumeOff
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AdminPanelSettings
import androidx.compose.material.icons.rounded.Archive
import androidx.compose.material.icons.rounded.ArrowUpward
import androidx.compose.material.icons.rounded.AttachFile
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Brush
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.ChevronLeft
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.Computer
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.DarkMode
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material.icons.rounded.FormatQuote
import androidx.compose.material.icons.rounded.FormatSize
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.LightMode
import androidx.compose.material.icons.rounded.Menu
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.PushPin
import androidx.compose.material.icons.rounded.Psychology
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.SmartToy
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material.icons.rounded.Storage
import androidx.compose.material.icons.rounded.Terminal
import androidx.compose.material.icons.rounded.ThumbDown
import androidx.compose.material.icons.rounded.ThumbUp
import androidx.compose.material.icons.rounded.Unarchive
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.ZoomIn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLocale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.Dialog
import com.linhub.android.R
import com.linhub.android.core.model.ChatMessage
import com.linhub.android.core.model.Artifact
import com.linhub.android.core.model.ChatStyle
import com.linhub.android.core.model.ChatToolToggles
import com.linhub.android.core.model.Conversation
import com.linhub.android.core.model.FontSizePreset
import com.linhub.android.core.model.KnowledgeBase
import com.linhub.android.core.model.McpServer
import com.linhub.android.core.model.Model
import com.linhub.android.core.model.Project
import com.linhub.android.core.model.Skill
import com.linhub.android.core.model.ThemeMode
import com.linhub.android.core.model.UploadedAttachment
import com.linhub.android.core.audio.WavAudioRecorder
import com.linhub.android.data.ChatTranscript
import com.linhub.android.data.string
import com.linhub.android.data.type
import com.linhub.android.ui.markdown.MarkdownText
import com.linhub.android.ui.markdown.MarkdownEngine
import com.linhub.android.BuildConfig
import coil.compose.AsyncImage
import coil.request.ImageRequest
import java.time.Duration
import java.time.Instant
import java.io.ByteArrayOutputStream
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.Lifecycle

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    state: LinHubUiState,
    onOpenDrawer: () -> Unit,
    onNewConversation: () -> Unit,
    onOpenProject: (Project) -> Unit,
    onRenameConversation: (Conversation, String) -> Unit,
    onDraftChange: (String) -> Unit,
    onSelectModel: (String) -> Unit,
    onSetDefaultModel: (String) -> Unit,
    onSelectThinkingEffort: (String) -> Unit,
    onResetThinkingEffort: () -> Unit,
    onSelectStyle: (String) -> Unit,
    onSend: () -> Unit,
    onStop: () -> Unit,
    onRetryStream: () -> Unit,
    onRetryFailedSend: (String) -> Unit,
    onEditResend: (ChatMessage, String) -> Unit,
    onRegenerate: (String, String?) -> Unit,
    onFeedback: (String, String?) -> Unit,
    onQuote: (ChatMessage) -> Unit,
    onClearQuote: () -> Unit,
    onSwitchBranch: (String, String) -> Unit,
    onUploadAttachment: (String, String, ByteArray) -> Unit,
    onRemoveAttachment: (String) -> Unit,
    onEditPendingAttachmentImage: (String, String, ByteArray?) -> Unit,
    onRetryAttachmentUpload: (String) -> Unit,
    onRemoveAttachmentUpload: (String) -> Unit,
    onUpdateTools: (ChatToolToggles) -> Unit,
    onRequestToolOptions: () -> Unit,
    onComposerError: (String) -> Unit,
    onOpenExternalLink: (String) -> Unit,
    onTranscribeAudio: (ByteArray) -> Unit,
    onToggleSpeech: (ChatMessage) -> Unit,
    onDownloadImage: (Uri, String) -> Unit,
    onEditMessageImage: (String, String, String, ByteArray?) -> Unit,
    onOpenArtifact: (String) -> Unit,
    onCloseArtifact: () -> Unit,
    onShareArtifact: (Artifact) -> Unit,
    onSaveArtifact: (Uri, String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val recorder = remember { WavAudioRecorder() }
    var recording by remember { mutableStateOf(false) }
    val attachmentPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments(),
    ) { uris ->
        scope.launch {
            uris.forEach { uri ->
                runCatching {
                    withContext(Dispatchers.IO) {
                        readPickedFile(context = context, uri = uri, maxBytes = 20 * 1024 * 1024)
                    }
                }.onSuccess { file ->
                    onUploadAttachment(file.name, file.mimeType, file.bytes)
                }.onFailure { error ->
                    onComposerError(error.message ?: "无法读取文件")
                }
            }
        }
    }
    val startRecording: () -> Unit = {
        runCatching { recorder.start() }
            .onSuccess { recording = true }
            .onFailure { onComposerError(it.message ?: "无法开始录音") }
        Unit
    }
    val microphonePermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) startRecording() else onComposerError("需要麦克风权限才能使用语音输入")
    }
    val stopRecording: () -> Unit = {
        if (recording) {
            recording = false
            scope.launch {
                runCatching { withContext(Dispatchers.IO) { recorder.stop() } }
                    .onSuccess(onTranscribeAudio)
                    .onFailure { onComposerError(it.message ?: "录音失败") }
            }
        }
    }
    val toggleRecording: () -> Unit = {
        if (recording) {
            stopRecording()
        } else if (
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            startRecording()
        } else {
            microphonePermission.launch(Manifest.permission.RECORD_AUDIO)
        }
    }
    DisposableEffect(recorder) {
        onDispose { recorder.cancel() }
    }
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) {
        if (recording) stopRecording()
    }
    LaunchedEffect(recording) {
        if (recording) {
            delay(MAX_VOICE_RECORDING_MILLIS)
            if (recording) {
                stopRecording()
                onComposerError("录音已达到 5 分钟上限，正在转写")
            }
        }
    }
    val selectedConversation = state.conversations.firstOrNull {
        it.id == state.selectedConversationId
    }
    val activeSkill = state.activeSkill
    val pendingProject = state.pendingProjectId?.let { projectId ->
        state.projects.firstOrNull { it.id == projectId }
    }
    val activeProject = pendingProject ?: selectedConversation?.projectId?.let { projectId ->
        state.projects.firstOrNull { it.id == projectId }
    }
    val headerNewConversationLabel = if (
        state.selectedConversationId == null && pendingProject != null
    ) {
        "发起临时对话"
    } else {
        "新增对话"
    }
    val landingVisible = state.transcript.messages.isEmpty() &&
        state.selectedConversationId !in state.loadingConversationIds
    val composer: @Composable () -> Unit = {
        ChatComposer(
            value = state.draft,
            quotedText = state.quotedText,
            attachments = state.pendingAttachments,
            attachmentUploads = state.attachmentUploads,
            activeSkill = activeSkill,
            pendingProject = pendingProject,
            editingPendingAttachmentIds = state.editingPendingAttachmentIds,
            uploadingAttachmentCount = state.uploadingAttachmentCount,
            tools = state.chatTools,
            isAdmin = state.user?.role == "admin",
            knowledgeBases = state.knowledgeBases,
            mcpServers = state.mcpServers.filter(McpServer::enabled),
            toolOptionsLoading = state.chatToolOptionsLoading,
            recording = recording,
            transcribing = state.voiceTranscribing,
            isStreaming = state.transcript.isStreaming || state.startingNewConversation,
            enabled = state.selectedConversationId !in state.loadingConversationIds,
            modelSelector = {
                ModelMenu(
                    models = state.models,
                    selectedModelId = state.selectedModelId,
                    defaultModelId = state.defaultModelId,
                    thinkingEffort = state.thinkingEffort,
                    hasThinkingOverride = state.selectedModelId in state.modelThinkingEfforts,
                    onSelectModel = onSelectModel,
                    onSetDefaultModel = onSetDefaultModel,
                    onSelectThinkingEffort = onSelectThinkingEffort,
                    onResetThinkingEffort = onResetThinkingEffort,
                )
            },
            onValueChange = onDraftChange,
            onClearQuote = onClearQuote,
            onPickAttachments = { attachmentPicker.launch(arrayOf("*/*")) },
            onRemoveAttachment = onRemoveAttachment,
            onEditPendingAttachmentImage = onEditPendingAttachmentImage,
            onDownloadImage = onDownloadImage,
            onRetryAttachmentUpload = onRetryAttachmentUpload,
            onRemoveAttachmentUpload = onRemoveAttachmentUpload,
            onUpdateTools = onUpdateTools,
            onRequestToolOptions = onRequestToolOptions,
            onToggleRecording = toggleRecording,
            onSend = onSend,
            onStop = onStop,
        )
    }

    Scaffold(
            contentWindowInsets = WindowInsets(0),
            topBar = {
                TopAppBar(
                    modifier = Modifier
                        .statusBarsPadding()
                        .height(60.dp),
                    title = {
                        if (selectedConversation != null || activeSkill != null || activeProject != null) {
                            ConversationTitle(
                                conversation = selectedConversation,
                                pendingTitle = activeSkill?.let { "${it.emoji} ${it.name}" },
                                project = activeProject,
                                modelName = null,
                                isOffline = state.isOffline,
                                onOpenProject = onOpenProject,
                                onRename = onRenameConversation,
                            )
                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = onOpenDrawer) {
                            Icon(
                                Icons.Rounded.Menu,
                                contentDescription = "打开侧栏",
                                modifier = Modifier.size(16.dp),
                            )
                        }
                    },
                    actions = {
                        Surface(
                            modifier = Modifier.padding(end = 12.dp),
                            shape = RoundedCornerShape(12.dp),
                            color = MaterialTheme.colorScheme.surface,
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                            shadowElevation = 5.dp,
                        ) {
                            Row(
                                modifier = Modifier.padding(4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                IconButton(onClick = onNewConversation, modifier = Modifier.size(28.dp)) {
                                    Icon(
                                        Icons.Outlined.AddComment,
                                        contentDescription = headerNewConversationLabel,
                                        modifier = Modifier.size(14.dp),
                                    )
                                }
                                state.selectedConversationId?.let { conversationId ->
                                    state.artifacts[conversationId]?.lastOrNull()?.let { artifact ->
                                        IconButton(onClick = { onOpenArtifact(artifact.id) }, modifier = Modifier.size(28.dp)) {
                                            Icon(Icons.Rounded.Code, contentDescription = "打开作品", modifier = Modifier.size(14.dp))
                                        }
                                    }
                                }
                                if (state.styles.isNotEmpty()) {
                                    StyleMenu(
                                        styles = state.styles,
                                        selectedStyleId = state.selectedStyleId,
                                        onSelectStyle = onSelectStyle,
                                    )
                                } else {
                                    IconButton(
                                        onClick = {},
                                        enabled = false,
                                        modifier = Modifier.size(28.dp),
                                    ) {
                                        Icon(
                                            Icons.Rounded.MoreHoriz,
                                            contentDescription = "对话设置",
                                            modifier = Modifier.size(14.dp),
                                        )
                                    }
                                }
                            }
                        }
                    },
                    colors = androidx.compose.material3.TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                    ),
                    windowInsets = WindowInsets(0),
                )
            },
            bottomBar = {
                if (!landingVisible) composer()
            },
        ) { padding ->
            ChatBody(
                transcript = state.transcript,
                models = state.models,
                currentLeafId = state.selectedConversationId?.let(state.leafOverrides::get)
                    ?: selectedConversation?.currentLeafId,
                conversationId = state.selectedConversationId,
                userName = state.user?.name.orEmpty(),
                activeSkill = activeSkill,
                pendingProject = pendingProject,
                temporaryProjectChat = state.temporaryProjectChat,
                editingImageMessageIds = state.editingImageMessageIds,
                speechMessageId = state.speechMessageId,
                speechLoading = state.speechLoading,
                messageRailEnabled = state.messageRailEnabled,
                isLoading = state.selectedConversationId in state.loadingConversationIds,
                modifier = Modifier.padding(padding),
                onPrompt = { prompt ->
                    onDraftChange(prompt)
                    onSend()
                },
                onRetry = onSend,
                onRetryStream = onRetryStream,
                onRetryFailedSend = onRetryFailedSend,
                onEditResend = onEditResend,
                onRegenerate = onRegenerate,
                onFeedback = onFeedback,
                onQuote = onQuote,
                onSwitchBranch = onSwitchBranch,
                onDownloadImage = onDownloadImage,
                onEditMessageImage = onEditMessageImage,
                onOpenArtifact = onOpenArtifact,
                onOpenLink = onOpenExternalLink,
                onToggleSpeech = onToggleSpeech,
                emptyComposer = composer,
            )
    }
    state.selectedArtifact?.let { artifact ->
        ArtifactDialog(
            artifact = artifact,
            loading = state.artifactLoading,
            onDismiss = onCloseArtifact,
            onShare = { onShareArtifact(artifact) },
            onSave = onSaveArtifact,
            onOpenLink = onOpenExternalLink,
        )
    }
}

@Composable
private fun ConversationTitle(
    conversation: Conversation?,
    pendingTitle: String?,
    project: Project?,
    modelName: String?,
    isOffline: Boolean,
    onOpenProject: (Project) -> Unit,
    onRename: (Conversation, String) -> Unit,
) {
    var editing by remember(conversation?.id) { mutableStateOf(false) }
    var draft by remember(conversation?.id, conversation?.title) {
        mutableStateOf(conversation?.title.orEmpty())
    }
    val focusManager = LocalFocusManager.current
    val commit = {
        conversation?.let { onRename(it, draft) }
        editing = false
        focusManager.clearFocus()
    }

    Column(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            project?.let {
                Text(
                    text = it.name,
                    modifier = Modifier
                        .widthIn(max = 140.dp)
                        .clickable { onOpenProject(it) }
                        .semantics { contentDescription = "进入项目「${it.name}」" }
                        .padding(horizontal = 2.dp, vertical = 2.dp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    "/",
                    modifier = Modifier.padding(horizontal = 4.dp),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (editing && conversation != null) {
                TextField(
                    value = draft,
                    onValueChange = { draft = it.take(100) },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    textStyle = MaterialTheme.typography.titleMedium,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { commit() }),
                    trailingIcon = {
                        IconButton(onClick = { commit() }, enabled = draft.isNotBlank()) {
                            Icon(Icons.Rounded.CheckCircle, contentDescription = "保存标题")
                        }
                    },
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = Color.Transparent,
                        unfocusedContainerColor = Color.Transparent,
                        focusedIndicatorColor = MaterialTheme.colorScheme.primary,
                        unfocusedIndicatorColor = Color.Transparent,
                    ),
                )
            } else {
                Text(
                    text = conversation?.title ?: pendingTitle ?: "新对话",
                    modifier = Modifier
                        .weight(1f)
                        .clickable(enabled = conversation != null) {
                            draft = conversation?.title.orEmpty()
                            editing = true
                        }
                        .then(
                            if (conversation != null) {
                                Modifier.semantics {
                                    contentDescription = "重命名会话「${conversation.title}」"
                                }
                            } else {
                                Modifier
                            },
                        )
                        .padding(horizontal = 2.dp, vertical = 2.dp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.titleMedium,
                )
            }
        }
        (modelName ?: if (isOffline) "离线缓存" else null)?.let {
            Text(
                if (isOffline && modelName != null) "$it · 离线缓存" else it,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
internal fun ConversationDrawer(
    state: WorkspaceShellState,
    destination: WorkspaceDestination,
    onCloseDrawer: () -> Unit,
    onDestinationChange: (WorkspaceDestination) -> Unit,
    onNewConversation: () -> Unit,
    onOpenConversation: (Conversation) -> Unit,
    onSearch: (String) -> Unit,
    onRenameConversation: (Conversation, String) -> Unit,
    onConsumeFailedConversationRename: (String) -> Unit,
    onTogglePinned: (Conversation) -> Unit,
    onToggleArchived: (Conversation) -> Unit,
    onMoveConversation: (Conversation, String?) -> Unit,
    onDeleteConversation: (Conversation) -> Unit,
    onToggleProjectCollapsed: (String) -> Unit,
    onToggleProjectPinned: (String) -> Unit,
    onStartProjectConversation: (Project) -> Unit,
    onEditProject: (Project) -> Unit,
    onDeleteProject: (Project) -> Unit,
    onThemeModeChange: (ThemeMode) -> Unit,
    onFontSizePresetChange: (FontSizePreset) -> Unit,
    onSignOut: () -> Unit,
) {
    var renameTarget by remember { mutableStateOf<Conversation?>(null) }
    var renameDraft by remember { mutableStateOf("") }
    var deleteTarget by remember { mutableStateOf<Conversation?>(null) }
    var projectDeleteTarget by remember { mutableStateOf<Project?>(null) }
    var searchOpen by remember { mutableStateOf(false) }
    var userMenuOpen by remember { mutableStateOf(false) }
    var userMenuView by remember { mutableStateOf(UserMenuView.Root) }
    val projectGroups = remember(state.conversations, state.projects) {
        projectConversationGroups(state.conversations, state.projects)
    }
    val sections = remember(state.conversations, state.projects) {
        conversationSections(state.conversations, state.projects, false)
    }
    val pinnedProjectGroups = projectGroups.filter { it.project.id in state.pinnedProjectIds }
    val regularProjectGroups = projectGroups.filterNot { it.project.id in state.pinnedProjectIds }
    val pinnedConversationSection = sections.firstOrNull { it.key == "pinned" }
    val recentConversationSections = sections.filterNot { it.key == "pinned" }
    val locale = LocalLocale.current.platformLocale
    val context = LocalContext.current
    val dark = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val drawerColor = if (dark) Color(0xFF1F1E1D) else Color(0xFFF5F4EE)
    val user = state.user
    val planLabel = user?.subscription?.planName ?: "免费版"
    val balanceLabel = String.format(locale, "¥%.2f", (user?.balance ?: 0) / 100.0)

    LaunchedEffect(state.failedConversationRenames, state.conversations) {
        val failed = state.failedConversationRenames.entries.firstOrNull() ?: return@LaunchedEffect
        state.conversations.firstOrNull { it.id == failed.key }?.let { conversation ->
            renameTarget = conversation
            renameDraft = failed.value
        }
        onConsumeFailedConversationRename(failed.key)
    }

    Box {
        ModalDrawerSheet(
            modifier = Modifier
                .width(304.dp)
                .fillMaxHeight(),
            drawerShape = RectangleShape,
            drawerContainerColor = drawerColor,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .statusBarsPadding()
                    .padding(horizontal = 12.dp),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp)
                        .padding(horizontal = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Image(
                        painter = painterResource(R.drawable.linhub_logo),
                        contentDescription = null,
                        modifier = Modifier.size(32.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "LinHub",
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.titleLarge,
                    )
                    IconButton(onClick = onCloseDrawer, modifier = Modifier.size(32.dp)) {
                        Icon(
                            Icons.AutoMirrored.Outlined.ViewSidebar,
                            contentDescription = "关闭侧栏",
                            modifier = Modifier.size(17.dp),
                        )
                    }
                }
                // Compose 的 52dp 品牌行比 Web 的内容行高 4px；补 12dp 后净间距与 pt-4 一致。
                Spacer(Modifier.height(12.dp))
                WebDrawerRow(
                    label = "新对话",
                    icon = Icons.Outlined.AddComment,
                    tint = MaterialTheme.colorScheme.primary,
                    onClick = onNewConversation,
                )
                WebDrawerRow(
                    label = "搜索对话",
                    icon = Icons.Outlined.Search,
                    onClick = {
                        onSearch("")
                        searchOpen = true
                    },
                )
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .padding(top = 14.dp),
                    contentPadding = PaddingValues(bottom = 8.dp),
                ) {
                    items(
                        items = PRIMARY_WORKSPACE_DESTINATIONS,
                        key = { "destination-${it.destination}" },
                        contentType = { "destination" },
                    ) { item ->
                        WebDrawerRow(
                            label = item.label,
                            icon = item.icon,
                            selected = destination == item.destination,
                            onClick = { onDestinationChange(item.destination) },
                        )
                    }
                    if (pinnedProjectGroups.isNotEmpty() || pinnedConversationSection != null) {
                        item(key = "pinned-section", contentType = "section") {
                            DrawerSectionLabel("已置顶")
                        }
                        pinnedProjectGroups.forEach { group ->
                            item(
                                key = "pinned-project-${group.project.id}",
                                contentType = "project-group",
                            ) {
                                ProjectDrawerGroup(
                                    group = group,
                                    pinned = true,
                                    collapsed = group.project.id in state.collapsedProjectIds,
                                    selectedConversationId = state.selectedConversationId,
                                    onToggleCollapsed = { onToggleProjectCollapsed(group.project.id) },
                                    onToggleProjectPinned = { onToggleProjectPinned(group.project.id) },
                                    onStartConversation = { onStartProjectConversation(group.project) },
                                    onEditProject = { onEditProject(group.project) },
                                    onDeleteProject = { projectDeleteTarget = group.project },
                                    onOpenConversation = onOpenConversation,
                                    onRenameConversation = { conversation ->
                                        renameTarget = conversation
                                        renameDraft = conversation.title
                                    },
                                    onTogglePinned = onTogglePinned,
                                    onToggleArchived = onToggleArchived,
                                    projects = state.projects,
                                    onMoveConversation = onMoveConversation,
                                    onDeleteConversation = { deleteTarget = it },
                                )
                            }
                        }
                        pinnedConversationSection?.let { section ->
                            items(
                                items = section.conversations,
                                key = { "${section.key}-${it.id}" },
                                contentType = { "conversation" },
                            ) { conversation ->
                                ConversationDrawerItem(
                                    conversation = conversation,
                                    selected = state.selectedConversationId == conversation.id,
                                    onOpen = { onOpenConversation(conversation) },
                                    onRename = {
                                        renameTarget = conversation
                                        renameDraft = conversation.title
                                    },
                                    onTogglePinned = { onTogglePinned(conversation) },
                                    onToggleArchived = { onToggleArchived(conversation) },
                                    projects = state.projects,
                                    onMoveConversation = { projectId ->
                                        onMoveConversation(conversation, projectId)
                                    },
                                    onDelete = { deleteTarget = conversation },
                                    modifier = Modifier.animateItem(),
                                )
                            }
                        }
                    }
                    if (regularProjectGroups.isNotEmpty()) {
                        item(key = "project-section", contentType = "section") {
                            DrawerSectionLabel("项目")
                        }
                        regularProjectGroups.forEach { group ->
                            item(
                                key = "project-${group.project.id}",
                                contentType = "project-group",
                            ) {
                                ProjectDrawerGroup(
                                    group = group,
                                    pinned = false,
                                    collapsed = group.project.id in state.collapsedProjectIds,
                                    selectedConversationId = state.selectedConversationId,
                                    onToggleCollapsed = { onToggleProjectCollapsed(group.project.id) },
                                    onToggleProjectPinned = { onToggleProjectPinned(group.project.id) },
                                    onStartConversation = { onStartProjectConversation(group.project) },
                                    onEditProject = { onEditProject(group.project) },
                                    onDeleteProject = { projectDeleteTarget = group.project },
                                    onOpenConversation = onOpenConversation,
                                    onRenameConversation = { conversation ->
                                        renameTarget = conversation
                                        renameDraft = conversation.title
                                    },
                                    onTogglePinned = onTogglePinned,
                                    onToggleArchived = onToggleArchived,
                                    projects = state.projects,
                                    onMoveConversation = onMoveConversation,
                                    onDeleteConversation = { deleteTarget = it },
                                )
                            }
                        }
                    }
                    recentConversationSections.forEach { section ->
                        item(key = "section-${section.key}", contentType = "section") {
                            DrawerSectionLabel(section.title)
                        }
                        items(
                            items = section.conversations,
                            key = { "${section.key}-${it.id}" },
                            contentType = { "conversation" },
                        ) { conversation ->
                            ConversationDrawerItem(
                                conversation = conversation,
                                selected = state.selectedConversationId == conversation.id,
                                onOpen = { onOpenConversation(conversation) },
                                onRename = {
                                    renameTarget = conversation
                                    renameDraft = conversation.title
                                },
                                onTogglePinned = { onTogglePinned(conversation) },
                                onToggleArchived = { onToggleArchived(conversation) },
                                projects = state.projects,
                                onMoveConversation = { projectId ->
                                    onMoveConversation(conversation, projectId)
                                },
                                onDelete = { deleteTarget = conversation },
                                modifier = Modifier.animateItem(),
                            )
                        }
                    }
                }
                HorizontalDivider(
                    modifier = Modifier
                        .offset(x = (-12).dp)
                        .requiredWidth(304.dp),
                )
                Box {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 12.dp)
                            .height(48.dp)
                            .clickable {
                                userMenuView = UserMenuView.Root
                                userMenuOpen = true
                            }
                            .padding(horizontal = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Surface(
                            modifier = Modifier.size(32.dp),
                            shape = androidx.compose.foundation.shape.CircleShape,
                            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.14f),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                if (user?.avatarUrl.isNullOrBlank()) {
                                    Text(
                                        user?.name?.take(1)?.uppercase().orEmpty(),
                                        color = MaterialTheme.colorScheme.primary,
                                        style = MaterialTheme.typography.bodyMedium,
                                    )
                                } else {
                                    AsyncImage(
                                        model = ImageRequest.Builder(context)
                                            .data(resolveMediaUrl(checkNotNull(user?.avatarUrl)))
                                            .crossfade(true)
                                            .build(),
                                        contentDescription = "${user?.name}的头像",
                                        modifier = Modifier.fillMaxSize(),
                                        contentScale = ContentScale.Crop,
                                    )
                                }
                            }
                        }
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .padding(start = 10.dp),
                        ) {
                            Text(
                                user?.name.orEmpty(),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Medium,
                            )
                            Text(
                                "$planLabel · $balanceLabel",
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontSize = 12.sp,
                                    lineHeight = 16.sp,
                                ),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    DropdownMenu(
                        expanded = userMenuOpen,
                        onDismissRequest = {
                            userMenuOpen = false
                            userMenuView = UserMenuView.Root
                        },
                        modifier = Modifier.width(224.dp),
                        shape = RoundedCornerShape(12.dp),
                        containerColor = MaterialTheme.colorScheme.surface,
                        tonalElevation = 0.dp,
                    ) {
                        when (userMenuView) {
                            UserMenuView.Root -> {
                                Row(
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(
                                        user?.email.orEmpty(),
                                        modifier = Modifier.weight(1f),
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis,
                                        style = MaterialTheme.typography.labelSmall,
                                    )
                                    if (user?.role == "admin") {
                                        Surface(
                                            shape = androidx.compose.foundation.shape.CircleShape,
                                            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                                        ) {
                                            Text(
                                                "管理员",
                                                modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                                                color = MaterialTheme.colorScheme.primary,
                                                style = MaterialTheme.typography.labelSmall,
                                            )
                                        }
                                    }
                                }
                                HorizontalDivider()
                                CompactDropdownItem(
                                    label = "设置",
                                    icon = Icons.Rounded.Settings,
                                    onClick = {
                                        userMenuOpen = false
                                        onDestinationChange(WorkspaceDestination.Settings)
                                    },
                                )
                                CompactDropdownItem(
                                    label = "用量与订阅",
                                    icon = Icons.AutoMirrored.Rounded.ReceiptLong,
                                    onClick = {
                                        userMenuOpen = false
                                        onDestinationChange(WorkspaceDestination.Billing)
                                    },
                                )
                                if (user?.role == "admin") {
                                    CompactDropdownItem(
                                        label = "管理后台",
                                        icon = Icons.Rounded.AdminPanelSettings,
                                        onClick = {
                                            userMenuOpen = false
                                            onDestinationChange(WorkspaceDestination.Admin)
                                        },
                                    )
                                }
                                CompactDropdownItem(
                                    label = "外观",
                                    icon = Icons.Rounded.Brush,
                                    trailingIcon = Icons.Rounded.ChevronRight,
                                    onClick = { userMenuView = UserMenuView.Theme },
                                )
                                CompactDropdownItem(
                                    label = "字号",
                                    icon = Icons.Rounded.FormatSize,
                                    trailingText = fontSizePresetLabel(state.fontSizePreset),
                                    trailingIcon = Icons.Rounded.ChevronRight,
                                    onClick = { userMenuView = UserMenuView.FontSize },
                                )
                                HorizontalDivider()
                                CompactDropdownItem(
                                    label = "退出登录",
                                    icon = Icons.AutoMirrored.Rounded.Logout,
                                    tint = MaterialTheme.colorScheme.error,
                                    onClick = {
                                        userMenuOpen = false
                                        onSignOut()
                                    },
                                )
                            }

                            UserMenuView.Theme -> {
                                CompactDropdownItem(
                                    label = "外观",
                                    icon = Icons.Rounded.ChevronLeft,
                                    onClick = { userMenuView = UserMenuView.Root },
                                )
                                HorizontalDivider()
                                listOf(ThemeMode.LIGHT, ThemeMode.DARK, ThemeMode.SYSTEM).forEach { mode ->
                                    CompactDropdownItem(
                                        label = when (mode) {
                                            ThemeMode.LIGHT -> "浅色"
                                            ThemeMode.DARK -> "深色"
                                            ThemeMode.SYSTEM -> "跟随系统"
                                        },
                                        icon = when (mode) {
                                            ThemeMode.LIGHT -> Icons.Rounded.LightMode
                                            ThemeMode.DARK -> Icons.Rounded.DarkMode
                                            ThemeMode.SYSTEM -> Icons.Rounded.Computer
                                        },
                                        trailingIcon = if (state.themeMode == mode) {
                                            Icons.Rounded.CheckCircle
                                        } else {
                                            null
                                        },
                                        selected = state.themeMode == mode,
                                        selectedContentDescription = "当前主题",
                                        onClick = {
                                            onThemeModeChange(mode)
                                            userMenuOpen = false
                                            userMenuView = UserMenuView.Root
                                        },
                                    )
                                }
                            }

                            UserMenuView.FontSize -> {
                                CompactDropdownItem(
                                    label = "字号",
                                    icon = Icons.Rounded.ChevronLeft,
                                    onClick = { userMenuView = UserMenuView.Root },
                                )
                                HorizontalDivider()
                                FontSizePreset.entries.forEach { preset ->
                                    CompactDropdownItem(
                                        label = fontSizePresetLabel(preset),
                                        icon = Icons.Rounded.FormatSize,
                                        trailingIcon = if (state.fontSizePreset == preset) {
                                            Icons.Rounded.CheckCircle
                                        } else {
                                            null
                                        },
                                        selected = state.fontSizePreset == preset,
                                        selectedContentDescription = "当前字号",
                                        onClick = {
                                            onFontSizePresetChange(preset)
                                            userMenuOpen = false
                                            userMenuView = UserMenuView.Root
                                        },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        if (searchOpen) {
            ConversationSearchDialog(
                query = state.conversationSearch,
                results = state.searchResults.orEmpty(),
                onQueryChange = onSearch,
                onOpenConversation = {
                    searchOpen = false
                    onSearch("")
                    onOpenConversation(it)
                },
                onDismiss = {
                    searchOpen = false
                    onSearch("")
                },
            )
        }

        projectDeleteTarget?.let { project ->
            AlertDialog(
                onDismissRequest = { projectDeleteTarget = null },
                title = { Text("删除项目") },
                text = { Text("将删除「${project.name}」。项目内会话会保留并移回普通会话。") },
                confirmButton = {
                    TextButton(
                        onClick = {
                            onDeleteProject(project)
                            projectDeleteTarget = null
                        },
                    ) { Text("删除", color = MaterialTheme.colorScheme.error) }
                },
                dismissButton = {
                    TextButton(onClick = { projectDeleteTarget = null }) { Text("取消") }
                },
            )
        }

        renameTarget?.let { conversation ->
            AlertDialog(
                onDismissRequest = { renameTarget = null },
                title = { Text("重命名会话") },
                text = {
                    OutlinedTextField(
                        value = renameDraft,
                        onValueChange = { renameDraft = it.take(100) },
                        singleLine = true,
                        label = { Text("会话标题") },
                    )
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            onRenameConversation(conversation, renameDraft)
                            renameTarget = null
                        },
                        enabled = renameDraft.isNotBlank(),
                    ) { Text("保存") }
                },
                dismissButton = {
                    TextButton(onClick = { renameTarget = null }) { Text("取消") }
                },
            )
        }

        deleteTarget?.let { conversation ->
            AlertDialog(
                onDismissRequest = { deleteTarget = null },
                title = { Text("删除会话") },
                text = { Text("将永久删除「${conversation.title}」及其全部消息。") },
                confirmButton = {
                    TextButton(
                        onClick = {
                            onDeleteConversation(conversation)
                            deleteTarget = null
                        },
                    ) { Text("删除", color = MaterialTheme.colorScheme.error) }
                },
                dismissButton = {
                    TextButton(onClick = { deleteTarget = null }) { Text("取消") }
                },
            )
        }
    }
}

private enum class UserMenuView { Root, Theme, FontSize }

private fun fontSizePresetLabel(preset: FontSizePreset): String = when (preset) {
    FontSizePreset.EXTRA_SMALL -> "极小"
    FontSizePreset.SMALL -> "小"
    FontSizePreset.MEDIUM -> "适中"
    FontSizePreset.LARGE -> "大"
    FontSizePreset.EXTRA_LARGE -> "极大"
}

@Composable
private fun DrawerSectionLabel(title: String) {
    Text(
        title,
        modifier = Modifier.padding(start = 8.dp, top = 14.dp, bottom = 4.dp),
        style = MaterialTheme.typography.labelSmall.copy(
            fontSize = 12.sp,
            lineHeight = 16.sp,
        ),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun WebDrawerRow(
    label: String,
    icon: ImageVector,
    onClick: () -> Unit,
    selected: Boolean = false,
    tint: Color? = null,
) {
    val shape = RoundedCornerShape(8.dp)
    val drawerForeground = if (MaterialTheme.colorScheme.background.luminance() < 0.5f) Color(0xFFC2C0B6) else Color(0xFF535146)
    val resolvedTint = tint ?: drawerForeground
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(36.dp)
            .clip(shape)
            .background(
                if (selected) MaterialTheme.colorScheme.surfaceVariant else Color.Transparent,
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp), tint = resolvedTint)
        Spacer(Modifier.width(10.dp))
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium.copy(
                fontSize = 15.sp,
                lineHeight = 22.sp,
            ),
            color = if (resolvedTint == MaterialTheme.colorScheme.primary) {
                resolvedTint
            } else if (selected) {
                MaterialTheme.colorScheme.onSurface
            } else {
                drawerForeground
            },
            fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
        )
    }
}

@Composable
private fun CompactDropdownItem(
    label: String,
    icon: ImageVector,
    onClick: () -> Unit,
    trailingIcon: ImageVector? = null,
    trailingText: String? = null,
    tint: Color = MaterialTheme.colorScheme.onSurface,
    selected: Boolean = false,
    selectedContentDescription: String? = null,
) {
    DropdownMenuItem(
        text = { Text(label, style = MaterialTheme.typography.bodyMedium, color = tint) },
        leadingIcon = {
            Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp), tint = tint)
        },
        trailingIcon = if (trailingIcon != null || trailingText != null) {
            {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    trailingText?.let {
                        Text(
                            it,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    trailingIcon?.let { trailing ->
                        Icon(
                            trailing,
                            contentDescription = if (selected) selectedContentDescription else null,
                            modifier = Modifier.size(15.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        } else {
            null
        },
        onClick = onClick,
        modifier = Modifier
            .height(38.dp)
            .semantics { this.selected = selected },
        contentPadding = PaddingValues(horizontal = 12.dp),
    )
}

@Composable
private fun ConversationSearchDialog(
    query: String,
    results: List<Conversation>,
    onQueryChange: (String) -> Unit,
    onOpenConversation: (Conversation) -> Unit,
    onDismiss: () -> Unit,
) {
    Dialog(onDismissRequest = onDismiss) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 560.dp),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            shadowElevation = 12.dp,
        ) {
            Column(Modifier.padding(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "搜索对话",
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    IconButton(onClick = onDismiss, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Rounded.Close, contentDescription = "关闭搜索")
                    }
                }
                OutlinedTextField(
                    value = query,
                    onValueChange = onQueryChange,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp),
                    placeholder = { Text("搜索标题和消息") },
                    leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
                    singleLine = true,
                    shape = RoundedCornerShape(10.dp),
                )
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 400.dp)
                        .padding(top = 8.dp),
                ) {
                    items(results, key = Conversation::id) { conversation ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .clickable { onOpenConversation(conversation) }
                                .padding(horizontal = 10.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                Icons.AutoMirrored.Rounded.Chat,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                            )
                            Text(
                                conversation.title,
                                modifier = Modifier.padding(start = 10.dp),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                    if (query.isNotBlank() && results.isEmpty()) {
                        item {
                            Text(
                                "没有找到相关会话",
                                modifier = Modifier.padding(12.dp),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}

private data class WorkspaceDrawerDestination(
    val destination: WorkspaceDestination,
    val label: String,
    val icon: ImageVector,
)

private val PRIMARY_WORKSPACE_DESTINATIONS = listOf(
    WorkspaceDrawerDestination(WorkspaceDestination.Projects, "项目", Icons.Outlined.Folder),
    WorkspaceDrawerDestination(WorkspaceDestination.Skills, "技能", Icons.Outlined.AutoAwesome),
    WorkspaceDrawerDestination(WorkspaceDestination.Knowledge, "知识库", Icons.AutoMirrored.Outlined.MenuBook),
    WorkspaceDrawerDestination(WorkspaceDestination.Files, "文件", Icons.Outlined.Description),
)

@Composable
private fun ProjectDrawerGroup(
    group: ProjectConversationGroup,
    pinned: Boolean,
    collapsed: Boolean,
    selectedConversationId: String?,
    onToggleCollapsed: () -> Unit,
    onToggleProjectPinned: () -> Unit,
    onStartConversation: () -> Unit,
    onEditProject: () -> Unit,
    onDeleteProject: () -> Unit,
    onOpenConversation: (Conversation) -> Unit,
    onRenameConversation: (Conversation) -> Unit,
    onTogglePinned: (Conversation) -> Unit,
    onToggleArchived: (Conversation) -> Unit,
    projects: List<Project>,
    onMoveConversation: (Conversation, String?) -> Unit,
    onDeleteConversation: (Conversation) -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    val drawerForeground = if (MaterialTheme.colorScheme.background.luminance() < 0.5f) Color(0xFFC2C0B6) else Color(0xFF535146)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(34.dp)
            .clip(RoundedCornerShape(8.dp)),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight()
                .clickable(onClick = onToggleCollapsed)
                .padding(start = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                if (pinned) Icons.Rounded.PushPin else Icons.Outlined.Folder,
                contentDescription = if (pinned) "已置顶项目" else null,
                modifier = Modifier.size(16.dp),
                tint = drawerForeground,
            )
            Text(
                group.project.name,
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 8.dp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodyMedium.copy(
                    fontSize = 15.sp,
                    lineHeight = 22.sp,
                ),
                color = drawerForeground,
            )
            Icon(
                Icons.Rounded.ChevronRight,
                contentDescription = if (collapsed) "展开项目${group.project.name}" else "收起项目${group.project.name}",
                modifier = Modifier
                    .size(14.dp)
                    .graphicsLayer { rotationZ = if (collapsed) 0f else 90f },
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Box {
            IconButton(
                onClick = { menuOpen = true },
                modifier = Modifier.size(28.dp),
            ) {
                Icon(
                    Icons.Rounded.MoreHoriz,
                    contentDescription = "项目「${group.project.name}」更多操作",
                    modifier = Modifier.size(16.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                DropdownMenuItem(
                    text = { Text(if (pinned) "取消置顶" else "置顶") },
                    leadingIcon = {
                        Icon(Icons.Rounded.PushPin, contentDescription = null)
                    },
                    onClick = {
                        menuOpen = false
                        onToggleProjectPinned()
                    },
                )
                HorizontalDivider()
                DropdownMenuItem(
                    text = { Text("编辑项目") },
                    leadingIcon = { Icon(Icons.Rounded.Edit, contentDescription = null) },
                    onClick = {
                        menuOpen = false
                        onEditProject()
                    },
                )
                DropdownMenuItem(
                    text = { Text("在项目中新对话") },
                    leadingIcon = { Icon(Icons.Outlined.AddComment, contentDescription = null) },
                    onClick = {
                        menuOpen = false
                        onStartConversation()
                    },
                )
                DropdownMenuItem(
                    text = { Text("删除项目", color = MaterialTheme.colorScheme.error) },
                    leadingIcon = {
                        Icon(
                            Icons.Rounded.Delete,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                        )
                    },
                    onClick = {
                        menuOpen = false
                        onDeleteProject()
                    },
                )
            }
        }
    }
    AnimatedVisibility(visible = !collapsed) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(IntrinsicSize.Min),
        ) {
            Box(
                modifier = Modifier
                    .padding(start = 12.dp)
                    .width(1.dp)
                    .fillMaxHeight()
                    .background(MaterialTheme.colorScheme.outlineVariant),
            )
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 8.dp),
            ) {
                group.conversations.forEach { conversation ->
                    ConversationDrawerItem(
                        conversation = conversation,
                        selected = selectedConversationId == conversation.id,
                        onOpen = { onOpenConversation(conversation) },
                        onRename = { onRenameConversation(conversation) },
                        onTogglePinned = { onTogglePinned(conversation) },
                        onToggleArchived = { onToggleArchived(conversation) },
                        projects = projects,
                        onMoveConversation = { projectId ->
                            onMoveConversation(conversation, projectId)
                        },
                        onDelete = { onDeleteConversation(conversation) },
                    )
                }
            }
        }
    }
}

@Composable
private fun ConversationDrawerItem(
    conversation: Conversation,
    selected: Boolean,
    onOpen: () -> Unit,
    onRename: () -> Unit,
    onTogglePinned: () -> Unit,
    onToggleArchived: () -> Unit,
    projects: List<Project>,
    onMoveConversation: (String?) -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val drawerForeground = if (MaterialTheme.colorScheme.background.luminance() < 0.5f) Color(0xFFC2C0B6) else Color(0xFF535146)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(34.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(
                if (selected) MaterialTheme.colorScheme.surfaceVariant else Color.Transparent,
            )
            .clickable(onClick = onOpen)
            .padding(start = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (conversation.pinned) {
            Icon(
                Icons.Rounded.PushPin,
                contentDescription = "已置顶",
                modifier = Modifier.size(12.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.width(6.dp))
        }
        Text(
            conversation.title,
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = MaterialTheme.typography.bodyMedium.copy(
                fontSize = 15.sp,
                lineHeight = 22.sp,
            ),
            color = if (selected) MaterialTheme.colorScheme.onSurface else drawerForeground,
            fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
        )
        Box(Modifier.size(32.dp), contentAlignment = Alignment.Center) {
            ConversationActionsMenu(
                conversation = conversation,
                visible = selected,
                onRename = onRename,
                onTogglePinned = onTogglePinned,
                onToggleArchived = onToggleArchived,
                projects = projects,
                onMoveConversation = onMoveConversation,
                onDelete = onDelete,
            )
        }
    }
}

private data class ConversationSection(
    val key: String,
    val title: String,
    val conversations: List<Conversation>,
)

private data class ProjectConversationGroup(
    val project: Project,
    val conversations: List<Conversation>,
)

private fun projectConversationGroups(
    source: List<Conversation>,
    projects: List<Project>,
): List<ProjectConversationGroup> {
    val byRecent = compareByDescending<Conversation> { it.updatedAt }
    val activeByProject = source
        .filterNot(Conversation::archived)
        .filter { it.projectId != null }
        .groupBy { requireNotNull(it.projectId) }
    return projects.mapNotNull { project ->
        activeByProject[project.id]
            ?.sortedWith(compareByDescending<Conversation> { it.pinned }.then(byRecent))
            ?.takeIf(List<Conversation>::isNotEmpty)
            ?.let { ProjectConversationGroup(project, it) }
    }
}

private fun conversationSections(
    source: List<Conversation>,
    projects: List<Project>,
    searching: Boolean,
): List<ConversationSection> {
    val byRecent = compareByDescending<Conversation> { it.updatedAt }
    if (searching) {
        return source.sortedWith(byRecent).takeIf(List<Conversation>::isNotEmpty)?.let {
            listOf(ConversationSection("search", "搜索结果", it))
        }.orEmpty()
    }

    val sections = mutableListOf<ConversationSection>()
    val knownProjectIds = projects.mapTo(mutableSetOf()) { it.id }
    val active = source.filterNot(Conversation::archived)
    val ungrouped = active.filter { it.projectId == null || it.projectId !in knownProjectIds }

    ungrouped.filter(Conversation::pinned)
        .sortedWith(byRecent)
        .takeIf(List<Conversation>::isNotEmpty)
        ?.let { sections += ConversationSection("pinned", "已置顶", it) }

    val now = Instant.now()
    ungrouped.filterNot(Conversation::pinned)
        .groupBy { conversationTimeGroup(it.updatedAt, now) }
        .let { groups ->
            TIME_GROUPS.forEach { group ->
                groups[group]?.sortedWith(byRecent)?.let { conversations ->
                    sections += ConversationSection("time-$group", group, conversations)
                }
            }
        }

    source.filter(Conversation::archived)
        .sortedWith(byRecent)
        .takeIf(List<Conversation>::isNotEmpty)
        ?.let { sections += ConversationSection("archived", "已归档", it) }
    return sections
}

private fun conversationTimeGroup(updatedAt: String, now: Instant): String {
    val updated = runCatching { Instant.parse(updatedAt) }.getOrDefault(Instant.EPOCH)
    val hours = Duration.between(updated, now).toHours().coerceAtLeast(0L)
    return when {
        hours < 24 -> "今天"
        hours < 48 -> "昨天"
        hours < 24 * 7 -> "近 7 天"
        hours < 24 * 30 -> "近 30 天"
        else -> "更早"
    }
}

private val TIME_GROUPS = listOf("今天", "昨天", "近 7 天", "近 30 天", "更早")

@Composable
private fun ConversationActionsMenu(
    conversation: Conversation,
    visible: Boolean,
    onRename: () -> Unit,
    onTogglePinned: () -> Unit,
    onToggleArchived: () -> Unit,
    projects: List<Project>,
    onMoveConversation: (String?) -> Unit,
    onDelete: () -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { expanded = true }, modifier = Modifier.size(32.dp)) {
            Icon(
                Icons.Rounded.MoreHoriz,
                contentDescription = "会话操作",
                modifier = Modifier.size(16.dp),
                tint = if (visible) MaterialTheme.colorScheme.onSurfaceVariant else Color.Transparent,
            )
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(
                text = { Text("重命名") },
                leadingIcon = { Icon(Icons.Rounded.Edit, contentDescription = null) },
                onClick = { expanded = false; onRename() },
            )
            DropdownMenuItem(
                text = { Text(if (conversation.pinned) "取消置顶" else "置顶") },
                leadingIcon = { Icon(Icons.Rounded.PushPin, contentDescription = null) },
                onClick = { expanded = false; onTogglePinned() },
            )
            DropdownMenuItem(
                text = { Text(if (conversation.archived) "取消归档" else "归档") },
                leadingIcon = {
                    Icon(
                        if (conversation.archived) Icons.Rounded.Unarchive else Icons.Rounded.Archive,
                        contentDescription = null,
                    )
                },
                onClick = { expanded = false; onToggleArchived() },
            )
            if (projects.isNotEmpty()) {
                HorizontalDivider()
                DropdownMenuItem(
                    text = { Text("移动到项目", style = MaterialTheme.typography.labelMedium) },
                    onClick = {},
                    enabled = false,
                )
                if (conversation.projectId != null) {
                    DropdownMenuItem(
                        text = { Text("移出项目") },
                        onClick = {
                            expanded = false
                            onMoveConversation(null)
                        },
                    )
                }
                projects.asSequence()
                    .filter { it.id != conversation.projectId }
                    .take(8)
                    .forEach { project ->
                        DropdownMenuItem(
                            text = { Text(project.name, maxLines = 1) },
                            onClick = {
                                expanded = false
                                onMoveConversation(project.id)
                            },
                        )
                    }
            }
            HorizontalDivider()
            DropdownMenuItem(
                text = { Text("删除", color = MaterialTheme.colorScheme.error) },
                leadingIcon = {
                    Icon(
                        Icons.Rounded.Delete,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.error,
                    )
                },
                onClick = { expanded = false; onDelete() },
            )
        }
    }
}

@Composable
private fun ChatBody(
    transcript: ChatTranscript,
    models: List<Model>,
    currentLeafId: String?,
    conversationId: String?,
    userName: String,
    activeSkill: Skill?,
    pendingProject: Project?,
    temporaryProjectChat: Boolean,
    editingImageMessageIds: Set<String>,
    speechMessageId: String?,
    speechLoading: Boolean,
    messageRailEnabled: Boolean,
    isLoading: Boolean,
    modifier: Modifier = Modifier,
    onPrompt: (String) -> Unit,
    onRetry: () -> Unit,
    onRetryStream: () -> Unit,
    onRetryFailedSend: (String) -> Unit,
    onEditResend: (ChatMessage, String) -> Unit,
    onRegenerate: (String, String?) -> Unit,
    onFeedback: (String, String?) -> Unit,
    onQuote: (ChatMessage) -> Unit,
    onSwitchBranch: (String, String) -> Unit,
    onDownloadImage: (Uri, String) -> Unit,
    onEditMessageImage: (String, String, String, ByteArray?) -> Unit,
    onOpenArtifact: (String) -> Unit,
    onOpenLink: (String) -> Unit,
    onToggleSpeech: (ChatMessage) -> Unit,
    emptyComposer: @Composable () -> Unit,
) {
    if (isLoading && transcript.messages.isEmpty()) {
        Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(strokeWidth = 2.dp)
        }
        return
    }

    val transcriptLastMessage = transcript.messages.lastOrNull()
    val threadTemplate = remember(
        conversationId,
        transcript.messages.size,
        transcriptLastMessage?.id,
        currentLeafId,
        transcript.isStreaming,
    ) {
        visibleThread(transcript.messages, currentLeafId)
    }
    // 流式帧只替换最后一条 assistant 的内容，消息树结构保持不变。复用路径模板可避免
    // 长会话每 24ms 重建 associateBy、父子链和整份可见消息列表。
    val messages: List<ChatMessage> = if (
        transcript.isStreaming &&
        transcriptLastMessage != null &&
        threadTemplate.lastOrNull()?.id == transcriptLastMessage.id
    ) {
        LastItemOverrideList(threadTemplate, transcriptLastMessage)
    } else {
        threadTemplate
    }
    val branchSource = transcript.messages.takeUnless { transcript.isStreaming }
    val branches = remember(branchSource) { branchSource?.let(::MessageBranchIndex) }
    if (messages.isEmpty()) {
        EmptyConversation(
            userName = userName,
            skill = activeSkill,
            project = pendingProject,
            temporaryProjectChat = temporaryProjectChat,
            error = transcript.error,
            modifier = modifier,
            onPrompt = onPrompt,
            onRetry = onRetry.takeIf { transcript.error != null },
            composer = emptyComposer,
        )
        return
    }

    val listState = rememberLazyListState()
    var followStreamingOutput by remember { mutableStateOf(true) }
    val lastProgress = messages.lastOrNull()?.parts?.sumOf { part ->
        part.string("text").orEmpty().length + if (part.type() == "tool-call") 1 else 0
    } ?: 0
    val latestMessages by rememberUpdatedState(messages)
    val latestProgress by rememberUpdatedState(lastProgress)
    val latestStreaming by rememberUpdatedState(transcript.isStreaming)
    val latestFollowStreamingOutput by rememberUpdatedState(followStreamingOutput)
    LaunchedEffect(listState) {
        listState.interactionSource.interactions.collect { interaction ->
            when (interaction) {
                is DragInteraction.Start -> followStreamingOutput = false
                is DragInteraction.Stop,
                is DragInteraction.Cancel,
                -> {
                    do {
                        withFrameNanos { }
                    } while (listState.isScrollInProgress)
                    followStreamingOutput = !listState.canScrollForward
                }
            }
        }
    }
    LaunchedEffect(conversationId) {
        followStreamingOutput = true
    }
    LaunchedEffect(conversationId, messages.lastOrNull()?.id) {
        if (followStreamingOutput && messages.isNotEmpty()) {
            scrollChatToBottom(listState, messages.lastIndex, animate = false)
        }
    }
    LaunchedEffect(conversationId, listState) {
        snapshotFlow { latestProgress }
            .distinctUntilChanged()
            .collect {
                val currentMessages = latestMessages
                if (
                    latestStreaming &&
                    latestFollowStreamingOutput &&
                    currentMessages.isNotEmpty()
                ) {
                    scrollChatToBottom(listState, currentMessages.lastIndex, animate = false)
                }
            }
    }

    val stableStreamingStructure = if (transcript.isStreaming) threadTemplate else messages
    val railItems = remember(stableStreamingStructure) { buildMessageRailItems(messages) }
    val scope = rememberCoroutineScope()
    val showScrollToBottom by remember {
        derivedStateOf { listState.canScrollForward }
    }

    // 历史消息第一次进入视口前在后台准备 Markdown AST，避免滚动帧在主线程解析 CommonMark。
    LaunchedEffect(stableStreamingStructure) {
        prewarmMarkdownSources(markdownSourcesAround(messages, messages.lastIndex))
    }
    LaunchedEffect(conversationId, listState) {
        snapshotFlow { listState.firstVisibleItemIndex }
            .distinctUntilChanged()
            .drop(1)
            .collectLatest { firstVisibleIndex ->
                prewarmMarkdownSources(markdownSourcesAround(latestMessages, firstVisibleIndex))
            }
    }

    Box(modifier = modifier.fillMaxSize()) {
        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxSize()
                .semantics { contentDescription = "聊天消息列表" },
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            items(
                items = messages,
                key = { it.id },
                contentType = { it.role },
            ) { message ->
                MessageItem(
                    message = message,
                    modelName = models.firstOrNull { it.id == message.modelId }?.displayName
                        ?: message.modelId,
                    branch = branches?.info(message),
                    generationInProgress = transcript.isStreaming,
                    onEditResend = { text -> onEditResend(message, text) },
                    onRetryFailedSend = { onRetryFailedSend(message.id) },
                    onRegenerate = { onRegenerate(message.id, message.modelId) },
                    onFeedback = { feedback -> onFeedback(message.id, feedback) },
                    onQuote = { onQuote(message) },
                    onSwitchLeaf = { leafId ->
                        conversationId?.let { onSwitchBranch(it, leafId) }
                    },
                    onDownloadImage = onDownloadImage,
                    onEditMessageImage = onEditMessageImage,
                    imageEditing = message.id in editingImageMessageIds,
                    onOpenArtifact = onOpenArtifact,
                    onOpenLink = onOpenLink,
                    speechActive = speechMessageId == message.id,
                    speechLoading = speechMessageId == message.id && speechLoading,
                    onToggleSpeech = { onToggleSpeech(message) },
                    modifier = Modifier,
                )
            }
            transcript.error?.let { error ->
                item(key = "stream-error", contentType = "error") {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                MaterialTheme.colorScheme.errorContainer,
                                RoundedCornerShape(8.dp),
                            )
                            .padding(12.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Rounded.ErrorOutline, contentDescription = null)
                        Text(
                            error,
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        TextButton(onClick = onRetryStream) { Text("重新连接") }
                    }
                }
            }
        }
        if (messageRailEnabled && railItems.isNotEmpty()) {
            ChatMessageRail(
                items = railItems,
                listState = listState,
                onJump = { item, animate ->
                    followStreamingOutput = false
                    scope.launch {
                        if (animate) listState.animateScrollToItem(item.messageIndex)
                        else listState.scrollToItem(item.messageIndex)
                    }
                },
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .padding(end = 2.dp)
                    .fillMaxHeight(0.34f)
                    .width(48.dp),
            )
        }
        AnimatedVisibility(
            visible = showScrollToBottom,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 10.dp),
            enter = fadeIn() + scaleIn(initialScale = 0.82f),
            exit = fadeOut() + scaleOut(targetScale = 0.82f),
        ) {
            Surface(
                modifier = Modifier
                    .size(40.dp)
                    .semantics { contentDescription = "回到底部" }
                    .clickable {
                        followStreamingOutput = true
                        scope.launch {
                            val target = listState.layoutInfo.totalItemsCount - 1
                            if (target >= 0) {
                                scrollChatToBottom(listState, target, animate = true)
                            }
                        }
                    },
                shape = androidx.compose.foundation.shape.CircleShape,
                color = MaterialTheme.colorScheme.surface,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                shadowElevation = 5.dp,
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        Icons.Rounded.KeyboardArrowDown,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        }
    }
}

private suspend fun scrollChatToBottom(
    listState: LazyListState,
    lastIndex: Int,
    animate: Boolean,
) {
    // LaunchedEffect 会在状态提交后启动，但 LazyList 的新尺寸要到下一帧才可见。
    withFrameNanos { }
    val layoutInfo = listState.layoutInfo
    val lastVisibleItem = layoutInfo.visibleItemsInfo.lastOrNull { it.index == lastIndex }
    if (lastVisibleItem != null) {
        val bottomOverflow = bottomScrollDistance(
            itemOffset = lastVisibleItem.offset,
            itemSize = lastVisibleItem.size,
            afterContentPadding = layoutInfo.afterContentPadding,
            viewportEndOffset = layoutInfo.viewportEndOffset,
        )
        if (bottomOverflow > 0) {
            if (animate) listState.animateScrollBy(bottomOverflow.toFloat())
            else listState.scrollBy(bottomOverflow.toFloat())
        }
        return
    }
    listState.scrollToItem(lastIndex)
    withFrameNanos { }
    if (animate) {
        listState.animateScrollBy(1_000_000f)
    } else {
        listState.scrollBy(1_000_000f)
    }
}

internal fun bottomScrollDistance(
    itemOffset: Int,
    itemSize: Int,
    afterContentPadding: Int,
    viewportEndOffset: Int,
): Int = (itemOffset + itemSize + afterContentPadding - viewportEndOffset).coerceAtLeast(0)

private suspend fun prewarmMarkdownSources(sources: List<String>) {
    withContext(Dispatchers.Default) {
        sources.forEach { source ->
            currentCoroutineContext().ensureActive()
            MarkdownEngine.parse(source)
        }
    }
}

internal fun markdownSourcesAround(
    messages: List<ChatMessage>,
    anchorIndex: Int,
    radius: Int = 48,
): List<String> {
    if (messages.isEmpty()) return emptyList()
    require(radius >= 0)
    val start = (anchorIndex - radius).coerceAtLeast(0)
    val endInclusive = (anchorIndex + radius).coerceAtMost(messages.lastIndex)
    if (start > endInclusive) return emptyList()
    return messages.subList(start, endInclusive + 1)
        .asSequence()
        .filter { it.role == "assistant" && it.status != "streaming" }
        .flatMap { message ->
            message.parts.asSequence()
                .filter { it.type() == "text" }
                .mapNotNull { it.string("text")?.takeIf(String::isNotBlank) }
        }
        .distinct()
        .toList()
}

internal data class MessageRailItem(
    val messageId: String,
    val messageIndex: Int,
    val title: String,
)

internal fun buildMessageRailItems(messages: List<ChatMessage>): List<MessageRailItem> =
    messages.mapIndexedNotNull { index, message ->
        if (message.role != "user") return@mapIndexedNotNull null
        MessageRailItem(
            messageId = message.id,
            messageIndex = index,
            title = message.textContent().trim().replace(Regex("\\s+"), " ").take(40)
                .ifBlank { "用户消息 ${index + 1}" },
        )
    }

internal fun activeMessageRailId(
    items: List<MessageRailItem>,
    firstVisibleMessageIndex: Int,
): String? = items.lastOrNull { it.messageIndex <= firstVisibleMessageIndex }?.messageId
    ?: items.firstOrNull()?.messageId

internal data class MessageRailMarker(
    val item: MessageRailItem,
    val railIndex: Int,
)

internal fun sampleMessageRailMarkers(
    items: List<MessageRailItem>,
    maximumMarkers: Int = 48,
): List<MessageRailMarker> {
    require(maximumMarkers >= 2)
    if (items.size <= maximumMarkers) {
        return items.mapIndexed { index, item -> MessageRailMarker(item, index) }
    }
    return List(maximumMarkers) { markerIndex ->
        val railIndex = (markerIndex * items.lastIndex / (maximumMarkers - 1f)).roundToInt()
        MessageRailMarker(items[railIndex], railIndex)
    }.distinctBy(MessageRailMarker::railIndex)
}

internal fun messageRailItemGapPx(
    itemCount: Int,
    railHeightPx: Float,
    maximumGapPx: Float,
    hitboxPx: Float,
): Float {
    if (itemCount <= 1) return maximumGapPx
    val availableHeight = (railHeightPx - hitboxPx).coerceAtLeast(0f)
    return minOf(maximumGapPx, availableHeight / (itemCount - 1))
}

internal fun messageRailItemOffsetPx(
    index: Int,
    itemCount: Int,
    railHeightPx: Float,
    maximumGapPx: Float,
    hitboxPx: Float,
): Float {
    if (itemCount <= 1) return railHeightPx / 2f
    val gap = messageRailItemGapPx(itemCount, railHeightPx, maximumGapPx, hitboxPx)
    return railHeightPx / 2f + (index - (itemCount - 1) / 2f) * gap
}

internal fun nearestMessageRailIndex(
    pointerY: Float,
    itemCount: Int,
    railHeightPx: Float,
    maximumGapPx: Float,
    hitboxPx: Float,
): Int {
    if (itemCount <= 1) return 0
    val gap = messageRailItemGapPx(itemCount, railHeightPx, maximumGapPx, hitboxPx)
    if (gap <= 0f) return 0
    return ((pointerY - railHeightPx / 2f) / gap + (itemCount - 1) / 2f)
        .roundToInt()
        .coerceIn(0, itemCount - 1)
}

@Composable
private fun ChatMessageRail(
    items: List<MessageRailItem>,
    listState: LazyListState,
    onJump: (MessageRailItem, Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val currentOnJump by rememberUpdatedState(onJump)
    val markers = remember(items) { sampleMessageRailMarkers(items) }
    val activeMessageId by remember(listState, items) {
        derivedStateOf { activeMessageRailId(items, listState.firstVisibleItemIndex) }
    }
    val activeRailIndex = items.indexOfFirst { it.messageId == activeMessageId }.coerceAtLeast(0)
    val activeMarkerIndex = markers.minByOrNull { abs(it.railIndex - activeRailIndex) }?.railIndex
    val inactiveColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.28f)
    val activeColor = MaterialTheme.colorScheme.onSurface
    val density = LocalDensity.current
    val maximumGapPx = with(density) { 14.dp.toPx() }
    val hitboxPx = with(density) { 24.dp.toPx() }

    fun jumpRelative(delta: Int): Boolean {
        val target = items.getOrNull((activeRailIndex + delta).coerceIn(items.indices)) ?: return false
        currentOnJump(target, true)
        return true
    }

    Box(
        modifier = modifier.semantics {
            contentDescription = "消息导航"
            customActions = listOf(
                CustomAccessibilityAction("上一条用户消息") { jumpRelative(-1) },
                CustomAccessibilityAction("下一条用户消息") { jumpRelative(1) },
            )
        },
    ) {
        fun jumpNearest(pointerY: Float, railHeight: Int, animate: Boolean) {
            if (items.isEmpty() || railHeight <= 0) return
            val nearestIndex = nearestMessageRailIndex(
                pointerY = pointerY,
                itemCount = items.size,
                railHeightPx = railHeight.toFloat(),
                maximumGapPx = maximumGapPx,
                hitboxPx = hitboxPx,
            )
            currentOnJump(items[nearestIndex], animate)
        }

        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(items) {
                    awaitEachGesture {
                        val down = awaitFirstDown(requireUnconsumed = false)
                        down.consume()
                        var moved = false
                        while (true) {
                            val event = awaitPointerEvent()
                            val change = event.changes.firstOrNull { it.id == down.id } ?: break
                            if (change.position != change.previousPosition) {
                                moved = true
                                jumpNearest(change.position.y, size.height, animate = false)
                            }
                            change.consume()
                            if (!change.pressed) {
                                if (!moved) jumpNearest(down.position.y, size.height, animate = true)
                                break
                            }
                        }
                    }
                },
        ) {
            markers.forEach { marker ->
                val active = marker.railIndex == activeMarkerIndex
                val width = 8.dp.toPx()
                val y = messageRailItemOffsetPx(
                    index = marker.railIndex,
                    itemCount = items.size,
                    railHeightPx = size.height,
                    maximumGapPx = maximumGapPx,
                    hitboxPx = hitboxPx,
                )
                drawLine(
                    color = if (active) activeColor else inactiveColor,
                    start = Offset(size.width - width, y),
                    end = Offset(size.width, y),
                    strokeWidth = 4.dp.toPx(),
                    cap = StrokeCap.Round,
                )
            }
        }
    }
}

@Composable
private fun PendingProjectHeader(project: Project) {
    val projectColor = remember(project.color) {
        runCatching {
            Color(AndroidColor.parseColor(project.color ?: "#C96442"))
        }.getOrDefault(Color(0xFFC96442))
    }
    Surface(
        modifier = Modifier.size(48.dp),
        shape = RoundedCornerShape(12.dp),
        color = projectColor,
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                project.name.take(1),
                color = Color.White,
                style = MaterialTheme.typography.titleLarge,
            )
        }
    }
    Text(
        project.name,
        modifier = Modifier.padding(top = 12.dp),
        style = MaterialTheme.typography.headlineMedium.copy(
            fontSize = 30.sp,
            lineHeight = 36.sp,
        ),
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
    Text(
        "将在此项目中创建对话",
        modifier = Modifier.padding(top = 8.dp),
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    project.description?.takeIf(String::isNotBlank)?.let { description ->
        Text(
            description.take(120),
            modifier = Modifier.padding(top = 8.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
    val meta = buildList {
        if (project.files.isNotEmpty()) add("${project.files.size} 个项目资料")
        if (project.knowledgeBaseIds.isNotEmpty()) add("${project.knowledgeBaseIds.size} 个关联知识库")
    }.joinToString(" · ")
    if (meta.isNotBlank()) {
        Text(
            meta,
            modifier = Modifier.padding(top = 8.dp),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    project.instructions?.takeIf(String::isNotBlank)?.let { instructions ->
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp),
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        ) {
            Text(
                "项目指令：${instructions.take(100)}",
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
    Spacer(Modifier.height(18.dp))
}

@Composable
private fun EmptyConversation(
    userName: String,
    skill: Skill?,
    project: Project?,
    temporaryProjectChat: Boolean,
    error: String?,
    modifier: Modifier,
    onPrompt: (String) -> Unit,
    onRetry: (() -> Unit)?,
    composer: @Composable () -> Unit,
) {
    val prompts = if (project != null && skill == null) {
        buildList {
            add(
                "📋 总结项目资料" to
                    "请总结本项目已有资料和关联知识库的要点，并列出我可以继续推进的方向。",
            )
            add(
                "🧭 按指令规划下一步" to
                    "请根据本项目的项目指令，帮我规划接下来最值得做的几步，并说明理由。",
            )
            add("📚 基于知识库提问" to "请基于本项目关联的知识库回答：")
            if (project.files.isNotEmpty()) {
                add(
                    "📁 概述项目文件" to
                        "请列出并概述本项目中的文件内容，标出各自用途。",
                )
            }
        }
    } else {
        listOf(
            "✍️ 帮我写作" to "帮我起草一段清晰、有说服力的文字",
            "🔍 联网调研" to "搜索并总结一个最新话题",
            "💻 写个小工具" to "帮我写一个实用的小工具",
            "🎨 画张图" to "帮我生成一张图片",
            "📚 解释概念" to "用清晰易懂的方式解释一个概念",
            "🧮 跑段代码" to "帮我编写并运行一段代码",
        )
    }
    val hour = remember { java.time.LocalTime.now().hour }
    val greeting = when (hour) {
        in 0..5 -> "夜深了"
        in 6..11 -> "早上好"
        in 12..17 -> "下午好"
        else -> "晚上好"
    }
    Column(
        modifier = modifier
            .fillMaxSize()
            .offset(y = 4.dp)
            .padding(horizontal = 16.dp)
            .padding(bottom = 16.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (project != null && skill == null) {
            PendingProjectHeader(project)
        } else if (temporaryProjectChat && skill == null) {
            Text(
                "临时对话",
                modifier = Modifier.padding(bottom = 8.dp),
                style = MaterialTheme.typography.headlineMedium.copy(
                    fontSize = 30.sp,
                    lineHeight = 36.sp,
                ),
            )
            Text(
                "这是临时对话，不会使用项目文件或关联知识库。",
                modifier = Modifier.padding(bottom = 18.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Text(
                skill?.name ?: "$greeting，${userName.ifBlank { "朋友" }}",
                modifier = Modifier.padding(bottom = if (skill == null) 27.dp else 8.dp),
                style = MaterialTheme.typography.headlineMedium.copy(
                    fontSize = 30.sp,
                    lineHeight = 36.sp,
                ),
            )
            skill?.let {
                Text(
                    it.greeting?.takeIf(String::isNotBlank) ?: it.description,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 18.dp),
                )
            }
        }
        error?.let {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .padding(bottom = 8.dp),
                shape = RoundedCornerShape(10.dp),
                color = MaterialTheme.colorScheme.errorContainer,
            ) {
                Row(
                    modifier = Modifier.padding(start = 12.dp, end = 4.dp, top = 5.dp, bottom = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        Icons.Rounded.ErrorOutline,
                        contentDescription = null,
                        modifier = Modifier.size(17.dp),
                    )
                    Text(
                        it,
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    onRetry?.let { retry ->
                        TextButton(onClick = retry) { Text("重试") }
                    }
                }
            }
        }
        composer()
        prompts.chunked(2).forEach { rowPrompts ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .padding(vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                rowPrompts.forEach { (label, prompt) ->
                    OutlinedButton(
                        onClick = { onPrompt(prompt) },
                        modifier = Modifier
                            .weight(1f)
                            .height(38.dp),
                        shape = RoundedCornerShape(12.dp),
                        contentPadding = PaddingValues(horizontal = 12.dp),
                    ) {
                        Text(
                            label,
                            modifier = Modifier.fillMaxWidth(),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.labelLarge.copy(
                                fontSize = 12.sp,
                                lineHeight = 16.sp,
                            ),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MessageItem(
    message: ChatMessage,
    modelName: String?,
    branch: MessageBranchInfo?,
    generationInProgress: Boolean,
    onEditResend: (String) -> Unit,
    onRetryFailedSend: () -> Unit,
    onRegenerate: () -> Unit,
    onFeedback: (String?) -> Unit,
    onQuote: () -> Unit,
    onSwitchLeaf: (String) -> Unit,
    onDownloadImage: (Uri, String) -> Unit,
    onEditMessageImage: (String, String, String, ByteArray?) -> Unit,
    imageEditing: Boolean,
    onOpenArtifact: (String) -> Unit,
    onOpenLink: (String) -> Unit,
    speechActive: Boolean,
    speechLoading: Boolean,
    onToggleSpeech: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val isUser = message.role == "user"
    val userBubbleColor = if (MaterialTheme.colorScheme.background.luminance() < 0.5f) {
        Color(0xFF3A3A35)
    } else {
        Color(0xFFEEE9DF)
    }
    val textContent = remember(message.id, message.parts) { message.textContent() }
    val workParts = remember(message.id, message.parts) {
        message.parts.filter { part ->
            part.type() == "reasoning" || part.type() == "tool-call"
        }
    }
    var editing by remember(message.id) { mutableStateOf(false) }
    var editText by remember(message.id, textContent) { mutableStateOf(textContent) }
    val context = LocalContext.current
    val copyToClipboard = { value: String ->
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("LinHub 消息", value))
    }
    val copyText = { copyToClipboard(textContent) }
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth(if (isUser) 0.85f else 1f)
                .then(
                    if (editing) Modifier.animateContentSize(spring(stiffness = 650f))
                    else Modifier
                ),
            horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (!message.quotedText.isNullOrBlank()) {
                Text(
                    message.quotedText,
                    modifier = Modifier
                        .fillMaxWidth(if (isUser) 0.88f else 1f)
                        .background(
                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                            RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp, bottomStart = 12.dp),
                        )
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    style = MaterialTheme.typography.bodySmall.copy(
                        fontSize = 12.sp,
                        lineHeight = 18.sp,
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (!isUser && workParts.isNotEmpty()) {
                WorkProcessSummary(
                    parts = workParts,
                    streaming = message.status == "streaming",
                    onLink = onOpenLink,
                )
            }
            if (!isUser) {
                workParts.forEach { part ->
                    if (part.type() == "tool-call") {
                        key(part.string("toolCallId") ?: part.toString()) {
                            ToolResultDeliverables(
                                part = part,
                                onOpenArtifact = onOpenArtifact,
                                onDownload = onDownloadImage,
                            )
                        }
                    }
                }
            }
            message.parts.forEachIndexed { index, part ->
                if (!isUser && part in workParts) {
                    return@forEachIndexed
                }
                if (isUser && editing && part.type() == "text") {
                    OutlinedTextField(
                        value = editText,
                        onValueChange = { editText = it },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 2,
                        maxLines = 8,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Default),
                    )
                } else {
                    MessagePart(
                        part = part,
                        key = "${message.id}-$index",
                        renderMarkdown = !isUser && message.status != "streaming",
                        isUser = isUser,
                        userBubbleColor = userBubbleColor,
                        messageStreaming = message.status == "streaming",
                        onLink = onOpenLink,
                        onCopyCode = copyToClipboard,
                        messageId = message.id,
                        imageEditing = imageEditing,
                        onDownloadImage = onDownloadImage,
                        onEditMessageImage = onEditMessageImage,
                        onOpenArtifact = onOpenArtifact,
                    )
                }
            }
            if (isUser && message.status == "sending") {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(11.dp), strokeWidth = 1.5.dp)
                    Text("正在发送…", style = MaterialTheme.typography.labelSmall)
                }
            }
            if (isUser && message.status == "error") {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "发送失败",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                    TextButton(
                        onClick = onRetryFailedSend,
                        contentPadding = PaddingValues(horizontal = 6.dp, vertical = 0.dp),
                    ) { Text("重试", style = MaterialTheme.typography.labelSmall) }
                }
            }
            if (message.status == "streaming" &&
                workParts.isEmpty()
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(12.dp), strokeWidth = 1.5.dp)
                    Text("生成中", style = MaterialTheme.typography.labelSmall)
                }
            }
            if (isUser && !generationInProgress) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (editing) {
                        TextButton(onClick = {
                            editText = textContent
                            editing = false
                        }) { Text("取消") }
                        TextButton(
                            onClick = {
                                onEditResend(editText)
                            },
                            enabled = editText.isNotBlank() && editText.trim() != textContent.trim(),
                        ) { Text("发送") }
                    } else {
                        branch?.let { BranchSwitcher(it, onSwitchLeaf) }
                        IconButton(onClick = { editing = true }, modifier = Modifier.size(34.dp)) {
                            Icon(Icons.Rounded.Edit, contentDescription = "编辑并重发", modifier = Modifier.size(17.dp))
                        }
                        if (textContent.isNotBlank()) {
                            IconButton(onClick = copyText, modifier = Modifier.size(34.dp)) {
                                Icon(Icons.Rounded.ContentCopy, contentDescription = "复制", modifier = Modifier.size(17.dp))
                            }
                        }
                    }
                }
            }
            if (message.role == "assistant" && !generationInProgress && message.status != "streaming") {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (textContent.isNotBlank()) {
                        IconButton(onClick = copyText, modifier = Modifier.size(34.dp)) {
                            Icon(Icons.Rounded.ContentCopy, contentDescription = "复制", modifier = Modifier.size(17.dp))
                        }
                    }
                    IconButton(onClick = onRegenerate, modifier = Modifier.size(34.dp)) {
                        Icon(
                            Icons.Rounded.Refresh,
                            contentDescription = "重新生成",
                            modifier = Modifier.size(18.dp),
                        )
                    }
                    IconButton(
                        onClick = { onFeedback(if (message.feedback == "up") null else "up") },
                        modifier = Modifier.size(34.dp),
                    ) {
                        Icon(
                            Icons.Rounded.ThumbUp,
                            contentDescription = "有帮助",
                            modifier = Modifier.size(17.dp),
                            tint = if (message.feedback == "up") {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                        )
                    }
                    IconButton(
                        onClick = { onFeedback(if (message.feedback == "down") null else "down") },
                        modifier = Modifier.size(34.dp),
                    ) {
                        Icon(
                            Icons.Rounded.ThumbDown,
                            contentDescription = "没有帮助",
                            modifier = Modifier.size(17.dp),
                            tint = if (message.feedback == "down") {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                        )
                    }
                    if (textContent.isNotBlank()) {
                        SpeechButton(
                            active = speechActive,
                            loading = speechLoading,
                            onClick = onToggleSpeech,
                        )
                    }
                    IconButton(onClick = onQuote, modifier = Modifier.size(34.dp)) {
                        Icon(Icons.Rounded.FormatQuote, contentDescription = "引用", modifier = Modifier.size(17.dp))
                    }
                    modelName?.takeIf(String::isNotBlank)?.let { label ->
                        Text(
                            label,
                            modifier = Modifier
                                .padding(start = 4.dp)
                                .widthIn(max = 92.dp),
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 11.sp,
                                lineHeight = 15.sp,
                            ),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Spacer(Modifier.weight(1f))
                    branch?.let { BranchSwitcher(it, onSwitchLeaf) }
                }
            }
        }
    }
}

@Composable
private fun BranchSwitcher(
    branch: MessageBranchInfo,
    onSwitchLeaf: (String) -> Unit,
) {
    IconButton(
        onClick = { branch.previousLeafId?.let(onSwitchLeaf) },
        enabled = branch.previousLeafId != null,
        modifier = Modifier.size(34.dp),
    ) {
        Icon(Icons.Rounded.ChevronLeft, contentDescription = "上一分支")
    }
    Text(
        "${branch.index + 1}/${branch.total}",
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    IconButton(
        onClick = { branch.nextLeafId?.let(onSwitchLeaf) },
        enabled = branch.nextLeafId != null,
        modifier = Modifier.size(34.dp),
    ) {
        Icon(Icons.Rounded.ChevronRight, contentDescription = "下一分支")
    }
}

@Composable
private fun SpeechButton(
    active: Boolean,
    loading: Boolean,
    onClick: () -> Unit,
) {
    IconButton(onClick = onClick, modifier = Modifier.size(34.dp)) {
        if (loading) {
            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
        } else {
            Icon(
                if (active) Icons.AutoMirrored.Rounded.VolumeOff
                else Icons.AutoMirrored.Rounded.VolumeUp,
                contentDescription = if (active) "停止朗读" else "朗读",
                modifier = Modifier.size(18.dp),
                tint = if (active) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
        }
    }
}

@Composable
private fun MessagePart(
    part: JsonObject,
    key: String,
    renderMarkdown: Boolean,
    isUser: Boolean,
    userBubbleColor: Color,
    messageStreaming: Boolean,
    onLink: (String) -> Unit,
    onCopyCode: (String) -> Unit,
    messageId: String,
    imageEditing: Boolean,
    onDownloadImage: (Uri, String) -> Unit,
    onEditMessageImage: (String, String, String, ByteArray?) -> Unit,
    onOpenArtifact: (String) -> Unit,
) {
    when (part.type()) {
        "text" -> if (renderMarkdown) {
            MarkdownText(
                markdown = part.string("text").orEmpty(),
                onLink = onLink,
                onCopyCode = onCopyCode,
            )
        } else if (!isUser && messageStreaming) {
            StreamingPlainText(part.string("text").orEmpty())
        } else {
            Text(
                part.string("text").orEmpty(),
                modifier = if (isUser) {
                    Modifier
                        .background(
                            userBubbleColor,
                            RoundedCornerShape(
                                topStart = 16.dp,
                                topEnd = 16.dp,
                                bottomStart = 16.dp,
                                bottomEnd = 4.dp,
                            ),
                        )
                        .padding(horizontal = 16.dp, vertical = 10.dp)
                } else {
                    Modifier.fillMaxWidth()
                },
                style = MaterialTheme.typography.bodyLarge.copy(
                    fontSize = 15.sp,
                    lineHeight = 26.sp,
                ),
            )
        }
        "reasoning" -> ReasoningPart(part = part, key = key, streaming = messageStreaming)
        "tool-call" -> ToolCallPart(
            part = part,
            onLink = onLink,
            onOpenArtifact = onOpenArtifact,
            onDownload = onDownloadImage,
        )
        "tool-config" -> RoutingDecisionPart(part)
        "image" -> ImageMessagePart(
            part = part,
            messageId = messageId,
            editing = imageEditing,
            onDownload = onDownloadImage,
            onEdit = onEditMessageImage,
        )
        "file" -> AttachmentPart(
            icon = { Icon(Icons.Rounded.AttachFile, contentDescription = null) },
            title = part.string("name") ?: "附件",
        )
    }
}

/**
 * 只在换行边界冻结已完成片段，视觉上仍是连续正文；后续 delta 只会让最后一片重新排版。
 */
@Composable
private fun StreamingPlainText(text: String) {
    val chunks = remember(text) { streamingTextChunks(text) }
    Column(Modifier.fillMaxWidth()) {
        chunks.forEach { chunk ->
            Text(
                text = chunk,
                modifier = Modifier.fillMaxWidth(),
                style = MaterialTheme.typography.bodyLarge.copy(
                    fontSize = 15.sp,
                    lineHeight = 26.sp,
                ),
            )
        }
    }
}

internal fun streamingTextChunks(
    text: String,
    targetSize: Int = 512,
): List<String> {
    require(targetSize > 0)
    if (text.length <= targetSize) return listOf(text)

    val chunks = mutableListOf<String>()
    val current = StringBuilder()
    var linesInCurrent = 0
    text.split('\n').forEach { line ->
        val candidateLength = current.length + if (linesInCurrent == 0) 0 else 1 + line.length
        if (linesInCurrent > 0 && current.length >= targetSize && candidateLength > targetSize) {
            chunks += current.toString()
            current.clear()
            linesInCurrent = 0
        }
        if (linesInCurrent > 0) current.append('\n')
        current.append(line)
        linesInCurrent += 1
    }
    if (linesInCurrent > 0) chunks += current.toString()
    return chunks
}

@Composable
private fun ImageMessagePart(
    part: JsonObject,
    messageId: String,
    editing: Boolean,
    onDownload: (Uri, String) -> Unit,
    onEdit: (String, String, String, ByteArray?) -> Unit,
) {
    val context = LocalContext.current
    val url = part.string("url") ?: return
    val alt = part.string("alt") ?: "LinHub 图片"
    var lightboxOpen by remember(url) { mutableStateOf(false) }
    AsyncImage(
        model = ImageRequest.Builder(context)
            .data(resolveMediaUrl(url))
            .crossfade(true)
            .build(),
        contentDescription = alt,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 120.dp, max = 320.dp)
            .clip(RoundedCornerShape(8.dp))
            .clickable { lightboxOpen = true }
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentScale = ContentScale.Fit,
    )
    if (lightboxOpen) {
        ImageLightboxDialog(
            url = url,
            alt = alt,
            editing = editing,
            onDismiss = { lightboxOpen = false },
            onDownload = onDownload,
            onEdit = { prompt, mask ->
                onEdit(messageId, url, prompt, mask)
            },
        )
    }
}

private enum class ImageLightboxMode { Preview, Edit }
private enum class MaskTool { Brush, Eraser }

private data class MaskStroke(
    val tool: MaskTool,
    val points: List<Offset>,
    val widthFraction: Float,
)

@Composable
internal fun ImageLightboxDialog(
    url: String,
    alt: String,
    editing: Boolean,
    onDismiss: () -> Unit,
    onDownload: (Uri, String) -> Unit,
    onEdit: (String, ByteArray?) -> Unit,
    onOpenConversation: (() -> Unit)? = null,
) {
    var mode by remember(url) { mutableStateOf(ImageLightboxMode.Preview) }
    var scale by remember(url) { mutableFloatStateOf(1f) }
    var translation by remember(url) { mutableStateOf(Offset.Zero) }
    var imageAspect by remember(url) { mutableFloatStateOf(1f) }
    var prompt by remember(url) { mutableStateOf("") }
    var brushSize by remember { mutableFloatStateOf(24f) }
    var maskTool by remember { mutableStateOf(MaskTool.Brush) }
    var strokes by remember(url) { mutableStateOf<List<MaskStroke>>(emptyList()) }
    var preparingMask by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val downloadLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("image/*"),
    ) { uri ->
        uri?.let { onDownload(it, url) }
    }
    val transformState = rememberTransformableState { _, zoom, pan, _ ->
        scale = (scale * zoom).coerceIn(0.5f, 4f)
        translation = if (scale <= 1f) Offset.Zero else translation + pan
    }
    val close = {
        if (mode == ImageLightboxMode.Edit && !editing) mode = ImageLightboxMode.Preview
        else onDismiss()
    }

    Dialog(
        onDismissRequest = close,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false,
        ),
    ) {
        Surface(color = Color.Black, modifier = Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    if (mode == ImageLightboxMode.Preview) {
                        IconButton(onClick = { scale = (scale - 0.25f).coerceAtLeast(0.5f) }) {
                            Icon(Icons.Rounded.Remove, contentDescription = "缩小", tint = Color.White)
                        }
                        Text(
                            "${(scale * 100).roundToInt()}%",
                            color = Color.White.copy(alpha = 0.75f),
                            style = MaterialTheme.typography.labelMedium,
                        )
                        IconButton(onClick = { scale = (scale + 0.25f).coerceAtMost(4f) }) {
                            Icon(Icons.Rounded.ZoomIn, contentDescription = "放大", tint = Color.White)
                        }
                        IconButton(
                            onClick = {
                                mode = ImageLightboxMode.Edit
                                scale = 1f
                                translation = Offset.Zero
                            },
                            enabled = !editing,
                        ) {
                            Icon(Icons.Rounded.Edit, contentDescription = "编辑图片", tint = Color.White)
                        }
                        IconButton(
                            onClick = {
                                val fileName = alt.takeIf { it.contains('.') } ?: "linhub-image.png"
                                downloadLauncher.launch(fileName)
                            },
                        ) {
                            Icon(Icons.Rounded.Download, contentDescription = "下载图片", tint = Color.White)
                        }
                        onOpenConversation?.let { open ->
                            IconButton(onClick = open) {
                                Icon(
                                    Icons.AutoMirrored.Rounded.Chat,
                                    contentDescription = "打开关联会话",
                                    tint = Color.White,
                                )
                            }
                        }
                    } else {
                        IconButton(
                            onClick = { maskTool = MaskTool.Brush },
                        ) {
                            Icon(
                                Icons.Rounded.Brush,
                                contentDescription = "画笔",
                                tint = if (maskTool == MaskTool.Brush) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    Color.White
                                },
                            )
                        }
                        IconButton(
                            onClick = { maskTool = MaskTool.Eraser },
                        ) {
                            Icon(
                                Icons.Rounded.Remove,
                                contentDescription = "橡皮",
                                tint = if (maskTool == MaskTool.Eraser) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    Color.White
                                },
                            )
                        }
                        Slider(
                            value = brushSize,
                            onValueChange = { brushSize = it },
                            valueRange = 5f..60f,
                            modifier = Modifier.width(110.dp),
                        )
                        IconButton(onClick = { strokes = emptyList() }) {
                            Icon(
                                Icons.Rounded.DeleteSweep,
                                contentDescription = "清除蒙版",
                                tint = Color.White,
                            )
                        }
                    }
                    Spacer(Modifier.weight(1f))
                    IconButton(onClick = close, enabled = !preparingMask) {
                        Icon(Icons.Rounded.Close, contentDescription = "关闭", tint = Color.White)
                    }
                }

                if (mode == ImageLightboxMode.Preview) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        contentAlignment = Alignment.Center,
                    ) {
                        AsyncImage(
                            model = ImageRequest.Builder(context)
                                .data(resolveMediaUrl(url))
                                .crossfade(true)
                                .build(),
                            contentDescription = alt,
                            modifier = Modifier
                                .fillMaxSize()
                                .graphicsLayer {
                                    scaleX = scale
                                    scaleY = scale
                                    translationX = translation.x
                                    translationY = translation.y
                                }
                                .transformable(transformState),
                            contentScale = ContentScale.Fit,
                        )
                    }
                } else {
                    BoxWithConstraints(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        contentAlignment = Alignment.Center,
                    ) {
                        val availableAspect = maxWidth.value / maxHeight.value.coerceAtLeast(1f)
                        val canvasWidth = if (imageAspect >= availableAspect) {
                            maxWidth
                        } else {
                            maxHeight * imageAspect
                        }
                        val canvasHeight = if (imageAspect >= availableAspect) {
                            maxWidth / imageAspect
                        } else {
                            maxHeight
                        }
                        Box(Modifier.size(canvasWidth, canvasHeight)) {
                            AsyncImage(
                                model = ImageRequest.Builder(context)
                                    .data(resolveMediaUrl(url))
                                    .listener(
                                        onSuccess = { _, result ->
                                            val width = result.drawable.intrinsicWidth
                                            val height = result.drawable.intrinsicHeight
                                            if (width > 0 && height > 0) {
                                                imageAspect = width.toFloat() / height
                                            }
                                        },
                                    )
                                    .build(),
                                contentDescription = alt,
                                modifier = Modifier.fillMaxSize(),
                                contentScale = ContentScale.FillBounds,
                            )
                            MaskDrawingCanvas(
                                strokes = strokes,
                                tool = maskTool,
                                brushSize = brushSize,
                                onStrokesChange = { strokes = it },
                                modifier = Modifier.fillMaxSize(),
                            )
                        }
                    }
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .imePadding()
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        TextField(
                            value = prompt,
                            onValueChange = { prompt = it },
                            placeholder = { Text("描述要怎么修改") },
                            enabled = !editing && !preparingMask,
                            modifier = Modifier.weight(1f),
                            singleLine = true,
                        )
                        Button(
                            onClick = {
                                preparingMask = true
                                scope.launch {
                                    val mask = withContext(Dispatchers.Default) {
                                        generateMaskPng(strokes, imageAspect)
                                    }
                                    onEdit(prompt.trim(), mask)
                                    preparingMask = false
                                }
                            },
                            enabled = prompt.isNotBlank() && !editing && !preparingMask,
                        ) {
                            if (preparingMask || editing) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(18.dp),
                                    strokeWidth = 2.dp,
                                )
                            } else {
                                Text("编辑")
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MaskDrawingCanvas(
    strokes: List<MaskStroke>,
    tool: MaskTool,
    brushSize: Float,
    onStrokesChange: (List<MaskStroke>) -> Unit,
    modifier: Modifier = Modifier,
) {
    val latestStrokes by rememberUpdatedState(strokes)
    val latestOnStrokesChange by rememberUpdatedState(onStrokesChange)
    Canvas(
        modifier = modifier
            .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
            .pointerInput(tool, brushSize) {
                var baseStrokes = emptyList<MaskStroke>()
                var activeStroke: MaskStroke? = null
                detectDragGestures(
                    onDragStart = { position ->
                        baseStrokes = latestStrokes
                        val normalized = Offset(
                            position.x / size.width.coerceAtLeast(1),
                            position.y / size.height.coerceAtLeast(1),
                        )
                        activeStroke = MaskStroke(
                            tool = tool,
                            points = listOf(normalized),
                            widthFraction = brushSize / minOf(size.width, size.height)
                                .coerceAtLeast(1),
                        )
                        latestOnStrokesChange(baseStrokes + checkNotNull(activeStroke))
                    },
                    onDrag = { change, _ ->
                        change.consume()
                        val current = activeStroke ?: return@detectDragGestures
                        val normalized = Offset(
                            change.position.x / size.width.coerceAtLeast(1),
                            change.position.y / size.height.coerceAtLeast(1),
                        )
                        activeStroke = current.copy(
                            points = current.points + normalized,
                        )
                        latestOnStrokesChange(baseStrokes + checkNotNull(activeStroke))
                    },
                )
            },
    ) {
        strokes.forEach { stroke ->
            val color = if (stroke.tool == MaskTool.Brush) {
                Color.Red.copy(alpha = 0.55f)
            } else {
                Color.Transparent
            }
            val blendMode = if (stroke.tool == MaskTool.Brush) BlendMode.SrcOver else BlendMode.Clear
            val width = stroke.widthFraction * minOf(size.width, size.height)
            if (stroke.points.size == 1) {
                val point = stroke.points.single()
                drawCircle(
                    color = color,
                    radius = width / 2,
                    center = Offset(point.x * size.width, point.y * size.height),
                    blendMode = blendMode,
                )
            } else {
                val path = Path().apply {
                    val first = stroke.points.first()
                    moveTo(first.x * size.width, first.y * size.height)
                    stroke.points.drop(1).forEach { point ->
                        lineTo(point.x * size.width, point.y * size.height)
                    }
                }
                drawPath(
                    path = path,
                    color = color,
                    style = Stroke(width = width, cap = StrokeCap.Round),
                    blendMode = blendMode,
                )
            }
        }
    }
}

private fun generateMaskPng(strokes: List<MaskStroke>, aspect: Float): ByteArray? {
    if (strokes.none { it.tool == MaskTool.Brush }) return null
    val safeAspect = aspect.takeIf { it.isFinite() && it > 0f } ?: 1f
    val width = if (safeAspect >= 1f) 1024 else (1024 * safeAspect).roundToInt().coerceAtLeast(1)
    val height = if (safeAspect >= 1f) (1024 / safeAspect).roundToInt().coerceAtLeast(1) else 1024
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = AndroidCanvas(bitmap)
    canvas.drawColor(AndroidColor.BLACK)
    strokes.forEach { stroke ->
        val paint = AndroidPaint(AndroidPaint.ANTI_ALIAS_FLAG).apply {
            style = AndroidPaint.Style.STROKE
            strokeCap = AndroidPaint.Cap.ROUND
            strokeJoin = AndroidPaint.Join.ROUND
            strokeWidth = stroke.widthFraction * minOf(width, height)
            if (stroke.tool == MaskTool.Brush) {
                xfermode = PorterDuffXfermode(PorterDuff.Mode.CLEAR)
            } else {
                color = AndroidColor.BLACK
                xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC)
            }
        }
        val path = AndroidPath().apply {
            val first = stroke.points.first()
            moveTo(first.x * width, first.y * height)
            stroke.points.drop(1).forEach { point -> lineTo(point.x * width, point.y * height) }
        }
        if (stroke.points.size == 1) {
            val point = stroke.points.single()
            paint.style = AndroidPaint.Style.FILL
            canvas.drawCircle(point.x * width, point.y * height, paint.strokeWidth / 2, paint)
        } else {
            canvas.drawPath(path, paint)
        }
    }
    return ByteArrayOutputStream().use { output ->
        check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) { "蒙版导出失败" }
        bitmap.recycle()
        output.toByteArray()
    }
}

internal fun isWebToolName(toolName: String): Boolean =
    toolName == "web_search" ||
        toolName == "web_read" ||
        toolName == "web_crawl" ||
        toolName.startsWith("tavily_")

internal data class WebToolFeedSummary(
    val label: String,
    val sourceCount: Int,
    val running: Boolean,
)

internal fun summarizeWebToolParts(parts: List<JsonObject>): WebToolFeedSummary {
    val webParts = parts.filter { isWebToolName(it.string("toolName").orEmpty()) }
    val runningPart = webParts.firstOrNull { it.string("state") == "running" }
    val completedPart = webParts.firstOrNull { it.string("state") == "success" }
    val representative = runningPart ?: completedPart ?: webParts.firstOrNull()
    val verb = webToolVerb(representative?.string("toolName").orEmpty())
    val sourceCount = webParts
        .flatMap { it.objectValue("result").objectItems("sources") }
        .mapNotNull { it.string("url")?.takeIf(String::isNotBlank) }
        .distinct()
        .size
    return WebToolFeedSummary(
        label = when {
            runningPart != null -> "正在$verb…"
            completedPart != null -> "已$verb ${webParts.size} 次"
            else -> "${webParts.size} 次工具调用"
        },
        sourceCount = sourceCount,
        running = runningPart != null,
    )
}

private fun webToolVerb(toolName: String): String = when (toolName) {
    "web_search" -> "搜索"
    "web_read" -> "阅读"
    "web_crawl", "tavily_crawl" -> "爬取"
    "tavily_extract" -> "提取"
    "tavily_research" -> "调研"
    else -> "调用"
}

@Composable
private fun WebToolCallsSummary(
    parts: List<JsonObject>,
    onLink: (String) -> Unit,
) {
    var expanded by remember(parts.map { it.string("toolCallId") }) { mutableStateOf(false) }
    val summary = remember(parts) { summarizeWebToolParts(parts) }
    val sources = remember(parts) {
        parts
            .flatMap { it.objectValue("result").objectItems("sources") }
            .distinctBy { it.string("url") }
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .animateContentSize(),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Row(
            modifier = Modifier
                .clickable(role = Role.Button) { expanded = !expanded }
                .padding(vertical = 5.dp),
            horizontalArrangement = Arrangement.spacedBy(7.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (summary.running) {
                CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 1.5.dp)
            } else {
                Icon(
                    Icons.Rounded.Search,
                    contentDescription = null,
                    modifier = Modifier.size(14.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                summary.label,
                style = MaterialTheme.typography.bodySmall.copy(
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                ),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (summary.sourceCount > 0) {
                Text(
                    "· ${summary.sourceCount} 个来源",
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontSize = 12.sp,
                        lineHeight = 17.sp,
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.72f),
                )
            }
            Icon(
                Icons.Rounded.ExpandMore,
                contentDescription = if (expanded) "收起搜索详情" else "展开搜索详情",
                modifier = Modifier
                    .size(14.dp)
                    .graphicsLayer { rotationZ = if (expanded) 180f else 0f },
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        AnimatedVisibility(expanded) {
            Column(
                modifier = Modifier.padding(start = 20.dp, bottom = 4.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                parts.forEach { part ->
                    val state = part.string("state") ?: "running"
                    val args = part.objectValue("args") ?: JsonObject(emptyMap())
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        when (state) {
                            "running" -> CircularProgressIndicator(
                                modifier = Modifier.size(12.dp),
                                strokeWidth = 1.5.dp,
                            )
                            "error" -> Icon(
                                Icons.Rounded.ErrorOutline,
                                contentDescription = null,
                                modifier = Modifier.size(12.dp),
                                tint = MaterialTheme.colorScheme.error,
                            )
                            else -> Icon(
                                Icons.Rounded.CheckCircle,
                                contentDescription = null,
                                modifier = Modifier.size(12.dp),
                                tint = MaterialTheme.colorScheme.primary,
                            )
                        }
                        Text(
                            toolLabel(
                                part.string("toolName").orEmpty(),
                                args,
                                part.string("inputPreview")?.let(::extractToolPreview),
                            ),
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 12.sp,
                                lineHeight = 17.sp,
                            ),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                if (sources.isNotEmpty()) {
                    Row(
                        modifier = Modifier
                            .padding(top = 2.dp)
                            .fillMaxWidth()
                            .height(IntrinsicSize.Min),
                    ) {
                        Box(
                            Modifier
                                .width(1.dp)
                                .fillMaxHeight()
                                .background(MaterialTheme.colorScheme.outlineVariant),
                        )
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .padding(start = 10.dp),
                            verticalArrangement = Arrangement.spacedBy(5.dp),
                        ) {
                            sources.forEach { source ->
                                val url = source.string("url").orEmpty()
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable(enabled = url.startsWith("http")) { onLink(url) }
                                        .padding(vertical = 2.dp),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Icon(
                                        Icons.Rounded.Link,
                                        contentDescription = null,
                                        modifier = Modifier.size(13.dp),
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                    Text(
                                        source.string("title") ?: url,
                                        modifier = Modifier.weight(1f),
                                        style = MaterialTheme.typography.labelSmall.copy(
                                            fontSize = 12.sp,
                                            lineHeight = 17.sp,
                                        ),
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

internal data class WorkFeedSummary(
    val label: String,
    val durationMs: Long?,
    val running: Boolean,
    val errorCount: Int,
)

internal fun summarizeWorkParts(
    parts: List<JsonObject>,
    streaming: Boolean,
): WorkFeedSummary {
    val workParts = parts.filter { it.type() == "reasoning" || it.type() == "tool-call" }
    val reasoningParts = parts.filter { it.type() == "reasoning" }
    val durationMs = reasoningParts
        .asSequence()
        .sumOf { it.int("durationMs")?.toLong() ?: 0L }
        .takeIf { it > 0L }
    val errorCount = workParts.count {
        it.type() == "tool-call" && it.string("state") == "error"
    }

    if (!streaming) {
        val durationLabel = durationMs?.let { " · ${formatThinkingDuration(it)}" }.orEmpty()
        val errorLabel = errorCount.takeIf { it > 0 }?.let { " · $it 个失败" }.orEmpty()
        return WorkFeedSummary(
            label = "工作过程 · ${workParts.size} 个步骤$durationLabel$errorLabel",
            durationMs = durationMs,
            running = false,
            errorCount = errorCount,
        )
    }

    val latest = workParts.lastOrNull()
    val status = when (latest?.type()) {
        "reasoning" -> latestReasoningStatus(latest.string("text").orEmpty())
        "tool-call" -> runningToolStatus(
            toolName = latest.string("toolName").orEmpty(),
            state = latest.string("state").orEmpty(),
        )
        else -> "正在工作…"
    }
    return WorkFeedSummary(
        label = "$status · ${workParts.size} 个步骤",
        durationMs = durationMs,
        running = true,
        errorCount = errorCount,
    )
}

internal fun formatThinkingDuration(durationMs: Long): String {
    val totalSeconds = (durationMs / 1_000f).roundToInt().coerceAtLeast(1)
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return if (minutes > 0) "${minutes}m ${seconds}s" else "${seconds}s"
}

private fun latestReasoningStatus(text: String): String {
    val latestLine = text
        .lineSequence()
        .map(String::trim)
        .filter(String::isNotBlank)
        .lastOrNull()
        ?.removePrefix("- ")
        ?.removePrefix("* ")
        ?.removePrefix("• ")
        .orEmpty()
    if (latestLine.isBlank()) return "思考中…"
    val compact = latestLine.replace(Regex("\\s+"), " ")
    val visible = if (compact.length > 72) "…${compact.takeLast(72)}" else compact
    return "正在思考：$visible"
}

private fun runningToolStatus(toolName: String, state: String): String {
    val action = when {
        isWebToolName(toolName) -> when (toolName) {
            "web_read" -> "阅读网页"
            "web_crawl", "tavily_crawl" -> "浏览网页"
            "tavily_extract" -> "提取网页内容"
            "tavily_research" -> "调研"
            else -> "搜索"
        }
        toolName == "run_code" -> "运行代码"
        toolName == "search_knowledge" -> "检索知识库"
        toolName.startsWith("pptx_") || toolName.startsWith("dashi_") -> "处理演示文稿"
        toolName.contains("artifact", ignoreCase = true) -> "生成作品"
        toolName.contains("image", ignoreCase = true) -> "处理图片"
        else -> "使用工具"
    }
    return when (state) {
        "running", "" -> "正在$action…"
        "error" -> "${action}遇到问题，正在继续…"
        else -> "正在整理${action}结果…"
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WorkProcessSummary(
    parts: List<JsonObject>,
    streaming: Boolean,
    onLink: (String) -> Unit,
) {
    var detailsOpen by remember(parts.map { it.string("toolCallId") }, streaming) {
        mutableStateOf(false)
    }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val summary = remember(parts, streaming) { summarizeWorkParts(parts, streaming) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(role = Role.Button) { detailsOpen = true }
            .padding(vertical = 5.dp),
        horizontalArrangement = Arrangement.spacedBy(7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (summary.running) {
            CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 1.5.dp)
        } else {
            Icon(
                if (summary.errorCount > 0) Icons.Rounded.ErrorOutline else Icons.Rounded.Psychology,
                contentDescription = null,
                modifier = Modifier.size(15.dp),
                tint = if (summary.errorCount > 0) {
                    MaterialTheme.colorScheme.error
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
        }
        Text(
            summary.label,
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.bodySmall.copy(
                fontSize = 13.sp,
                lineHeight = 19.sp,
            ),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Icon(
            Icons.Rounded.ExpandMore,
            contentDescription = "展开工作过程",
            modifier = Modifier.size(15.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }

    if (detailsOpen) {
        ModalBottomSheet(
            onDismissRequest = { detailsOpen = false },
            sheetState = sheetState,
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .fillMaxHeight(0.92f),
            ) {
                Text(
                    buildString {
                        append(if (streaming) "工作中" else "工作过程")
                        append(" · ${parts.size} 个步骤")
                        summary.durationMs?.let { append(" · ${formatThinkingDuration(it)}") }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 24.dp, vertical = 6.dp),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentPadding = PaddingValues(
                        start = 22.dp,
                        end = 22.dp,
                        top = 20.dp,
                        bottom = 36.dp,
                    ),
                ) {
                    itemsIndexed(
                        items = parts,
                        key = { index, part ->
                            part.string("toolCallId") ?: "${part.type()}-$index"
                        },
                    ) { index, part ->
                        WorkTimelineItem(
                            part = part,
                            isLast = index == parts.lastIndex,
                            onLink = onLink,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun WorkTimelineItem(
    part: JsonObject,
    isLast: Boolean,
    onLink: (String) -> Unit,
) {
    val isReasoning = part.type() == "reasoning"
    val state = part.string("state").orEmpty()
    val toolName = part.string("toolName").orEmpty()
    val args = part.objectValue("args") ?: JsonObject(emptyMap())
    val result = part.objectValue("result")
    val sources = result.objectItems("sources")
    val chunks = result.objectItems("chunks")
    val sheets = result.objectItems("sheets")
    val slides = result.objectItems("slides")
    val layouts = result.objectItems("layouts")
    val slideCount = result?.int("slideCount")
    val error = part.string("errorMessage")
    val resultText = result?.string("text")
    val title = if (isReasoning) {
        "思考"
    } else {
        val base = toolLabel(toolName, args, part.string("inputPreview")?.let(::extractToolPreview))
        when (state) {
            "running", "" -> "正在$base"
            "error" -> "$base · 失败"
            else -> base
        }
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
    ) {
        Box(
            modifier = Modifier
                .width(28.dp)
                .height(72.dp),
        ) {
            if (!isLast) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .padding(top = 25.dp)
                        .width(1.dp)
                        .height(47.dp)
                        .background(MaterialTheme.colorScheme.outlineVariant),
                )
            }
            Surface(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .size(24.dp),
                shape = androidx.compose.foundation.shape.CircleShape,
                color = MaterialTheme.colorScheme.surfaceContainerLow,
            ) {
                Box(contentAlignment = Alignment.Center) {
                    when {
                        !isReasoning && state == "running" -> CircularProgressIndicator(
                            modifier = Modifier.size(15.dp),
                            strokeWidth = 1.5.dp,
                        )
                        !isReasoning && state == "error" -> Icon(
                            Icons.Rounded.ErrorOutline,
                            contentDescription = null,
                            modifier = Modifier.size(17.dp),
                            tint = MaterialTheme.colorScheme.error,
                        )
                        isReasoning -> Icon(
                            Icons.Rounded.Psychology,
                            contentDescription = null,
                            modifier = Modifier.size(17.dp),
                        )
                        else -> Icon(
                            toolIcon(toolName),
                            contentDescription = null,
                            modifier = Modifier.size(17.dp),
                        )
                    }
                }
            }
        }
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = 10.dp, bottom = if (isLast) 4.dp else 20.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            if (isReasoning) {
                part.string("text")?.takeIf(String::isNotBlank)?.let { reasoning ->
                    Text(
                        reasoning,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                if (!error.isNullOrBlank()) {
                    Text(
                        error,
                        modifier = Modifier
                            .background(
                                MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.65f),
                                RoundedCornerShape(8.dp),
                            )
                            .padding(horizontal = 10.dp, vertical = 7.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                }
                if (!resultText.isNullOrBlank()) {
                    Text(
                        resultText,
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                MaterialTheme.colorScheme.surfaceContainer,
                                RoundedCornerShape(8.dp),
                            )
                            .padding(10.dp),
                        style = MaterialTheme.typography.bodySmall.copy(
                            fontFamily = if (toolName == "run_code") FontFamily.Monospace else FontFamily.Default,
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 12,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (sources.isNotEmpty()) {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        items(
                            items = sources.take(12),
                            key = { it.string("url") ?: it.toString() },
                        ) { source ->
                            val url = source.string("url").orEmpty()
                            val host = runCatching { Uri.parse(url).host }.getOrNull()
                            Surface(
                                modifier = Modifier.clickable(enabled = url.startsWith("http")) {
                                    onLink(url)
                                },
                                shape = RoundedCornerShape(50),
                                color = MaterialTheme.colorScheme.surfaceContainer,
                            ) {
                                Text(
                                    host ?: source.string("title") ?: "来源",
                                    modifier = Modifier.padding(horizontal = 11.dp, vertical = 6.dp),
                                    style = MaterialTheme.typography.labelMedium,
                                    maxLines = 1,
                                )
                            }
                        }
                    }
                }
                if (chunks.isNotEmpty()) {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        chunks.take(12).forEach { chunk ->
                            val score = chunk.double("score")
                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(8.dp),
                                color = MaterialTheme.colorScheme.surfaceContainer,
                            ) {
                                Column(Modifier.padding(10.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(
                                            chunk.string("documentName") ?: "知识库片段",
                                            modifier = Modifier.weight(1f),
                                            style = MaterialTheme.typography.labelMedium,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                        score?.let {
                                            Text(
                                                "${(it * 100).roundToInt()}% 相关",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                    }
                                    Text(
                                        chunk.string("snippet").orEmpty(),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 4,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                        }
                    }
                }
                if (sheets.isNotEmpty()) {
                    SpreadsheetToolResult(sheets)
                }
                if (slides.isNotEmpty() || layouts.isNotEmpty()) {
                    PresentationToolResult(
                        slides = slides.ifEmpty { layouts },
                        slideCount = slideCount,
                    )
                }
            }
        }
    }
}

@Composable
private fun ToolResultDeliverables(
    part: JsonObject,
    onOpenArtifact: (String) -> Unit,
    onDownload: (Uri, String) -> Unit,
) {
    if (part.string("state") != "success") return
    val result = part.objectValue("result") ?: return
    val artifactId = result.string("artifactId")
    val attachments = result.objectItems("attachments")
    if (artifactId.isNullOrBlank() && attachments.isEmpty()) return

    var pendingDownloadUrl by remember(part.string("toolCallId")) { mutableStateOf<String?>(null) }
    val attachmentDownload = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("*/*"),
    ) { destination ->
        val url = pendingDownloadUrl
        pendingDownloadUrl = null
        if (destination != null && url != null) onDownload(destination, url)
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        artifactId?.takeIf(String::isNotBlank)?.let { artifact ->
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onOpenArtifact(artifact) },
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                color = MaterialTheme.colorScheme.surface,
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(11.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Surface(
                        shape = RoundedCornerShape(9.dp),
                        color = MaterialTheme.colorScheme.primaryContainer,
                    ) {
                        Icon(
                            Icons.Rounded.Code,
                            contentDescription = null,
                            modifier = Modifier.padding(9.dp).size(18.dp),
                            tint = MaterialTheme.colorScheme.onPrimaryContainer,
                        )
                    }
                    Column(Modifier.weight(1f)) {
                        Text(
                            result.string("artifactTitle") ?: "作品 $artifact",
                            style = MaterialTheme.typography.labelLarge,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            "点击打开 · 可预览、运行与下载",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Icon(
                        Icons.Rounded.ExpandMore,
                        contentDescription = "打开作品",
                        modifier = Modifier.graphicsLayer { rotationZ = -90f },
                    )
                }
            }
        }

        attachments.forEach { attachment ->
            val url = attachment.string("url")
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(enabled = !url.isNullOrBlank()) {
                        pendingDownloadUrl = url
                        attachmentDownload.launch(attachment.string("name") ?: "linhub-file")
                    },
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                color = MaterialTheme.colorScheme.surface,
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(11.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Rounded.AttachFile, contentDescription = null)
                    Column(Modifier.weight(1f)) {
                        Text(
                            attachment.string("name") ?: "生成文件",
                            style = MaterialTheme.typography.labelLarge,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            attachment.string("mimeType")?.takeIf(String::isNotBlank) ?: "生成文件",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    if (!url.isNullOrBlank()) {
                        Icon(Icons.Rounded.Download, contentDescription = "下载生成文件")
                    }
                }
            }
        }
    }
}

@Composable
private fun ReasoningPart(part: JsonObject, key: String, streaming: Boolean) {
    var expanded by remember(key) { mutableStateOf(streaming) }
    LaunchedEffect(streaming) {
        if (!streaming) expanded = false
    }
    val durationSeconds = part.int("durationMs")?.let { duration ->
        (duration / 1_000f).roundToInt().coerceAtLeast(1)
    }
    val label = if (streaming) {
        "思考中…"
    } else {
        "已深度思考${durationSeconds?.let { "（用时 $it 秒）" }.orEmpty()}"
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .animateContentSize(),
    ) {
        Row(
            modifier = Modifier
                .clickable(role = Role.Button) { expanded = !expanded }
                .padding(vertical = 5.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Rounded.Psychology,
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                label,
                style = MaterialTheme.typography.bodySmall.copy(
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                ),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Icon(
                Icons.Rounded.ExpandMore,
                contentDescription = if (expanded) "收起思考过程" else "展开思考过程",
                modifier = Modifier
                    .size(14.dp)
                    .graphicsLayer { rotationZ = if (expanded) 180f else 0f },
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        AnimatedVisibility(expanded) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(IntrinsicSize.Min)
                    .padding(start = 14.dp, top = 2.dp, bottom = 4.dp),
            ) {
                Box(
                    Modifier
                        .width(2.dp)
                        .fillMaxHeight()
                        .background(MaterialTheme.colorScheme.outlineVariant),
                )
                Text(
                    part.string("text").orEmpty(),
                    modifier = Modifier
                        .weight(1f)
                        .padding(start = 12.dp),
                    style = MaterialTheme.typography.bodySmall.copy(
                        fontSize = 13.sp,
                        lineHeight = 20.sp,
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun ToolCallPart(
    part: JsonObject,
    onLink: (String) -> Unit,
    onOpenArtifact: (String) -> Unit,
    onDownload: (Uri, String) -> Unit,
) {
    val state = part.string("state") ?: "running"
    val toolName = part.string("toolName") ?: "unknown"
    val args = part.objectValue("args") ?: JsonObject(emptyMap())
    val result = part.objectValue("result")
    val sources = result.objectItems("sources")
    val chunks = result.objectItems("chunks")
    val attachments = result.objectItems("attachments")
    val sheets = result.objectItems("sheets")
    val slides = result.objectItems("slides")
    val layouts = result.objectItems("layouts")
    val slideCount = result?.int("slideCount")
    val resultText = result?.string("text")
    val artifactId = result?.string("artifactId")
    val error = part.string("errorMessage")
    val hasDetail = sources.isNotEmpty() || chunks.isNotEmpty() || attachments.isNotEmpty() ||
        sheets.isNotEmpty() || slides.isNotEmpty() || layouts.isNotEmpty() ||
        !resultText.isNullOrBlank() || !artifactId.isNullOrBlank() || !error.isNullOrBlank()
    var expanded by remember(part.string("toolCallId")) { mutableStateOf(state == "error") }
    val inputPreview = part.string("inputPreview")?.let(::extractToolPreview)
    val label = toolLabel(toolName, args, inputPreview)
    var pendingDownloadUrl by remember(part.string("toolCallId")) { mutableStateOf<String?>(null) }
    val attachmentDownload = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("*/*"),
    ) { destination ->
        val url = pendingDownloadUrl
        pendingDownloadUrl = null
        if (destination != null && url != null) onDownload(destination, url)
    }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = hasDetail) { expanded = !expanded }
            .animateContentSize(),
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(
            1.dp,
            if (state == "error") {
                MaterialTheme.colorScheme.error.copy(alpha = 0.55f)
            } else {
                MaterialTheme.colorScheme.outlineVariant
            },
        ),
        color = Color.Transparent,
    ) {
        Column(Modifier.padding(11.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(9.dp),
            ) {
                if (state == "running") {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Icon(
                        if (state == "error") Icons.Rounded.ErrorOutline else toolIcon(toolName),
                        contentDescription = null,
                        tint = if (state == "error") {
                            MaterialTheme.colorScheme.error
                        } else {
                            MaterialTheme.colorScheme.primary
                        },
                        modifier = Modifier.size(18.dp),
                    )
                }
                Column(Modifier.weight(1f)) {
                    Text(
                        label,
                        style = MaterialTheme.typography.labelLarge,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    toolResultSummary(sources.size, chunks.size, attachments.size)?.let {
                        Text(
                            it,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    when {
                        sheets.isNotEmpty() -> Text(
                            "${sheets.size} 个工作表",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        slideCount != null -> Text(
                            "$slideCount 页演示文稿",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                when {
                    hasDetail -> Icon(
                        Icons.Rounded.ExpandMore,
                        contentDescription = if (expanded) "收起工具结果" else "展开工具结果",
                        modifier = Modifier.size(18.dp),
                    )
                    state == "success" -> Icon(
                        Icons.Rounded.CheckCircle,
                        contentDescription = "工具执行完成",
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
            AnimatedVisibility(expanded && hasDetail) {
                Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    error?.takeIf(String::isNotBlank)?.let {
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = MaterialTheme.colorScheme.errorContainer,
                        ) {
                            Text(
                                it,
                                modifier = Modifier.padding(9.dp),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onErrorContainer,
                            )
                        }
                    }
                    sources.forEach { source ->
                        val url = source.string("url").orEmpty()
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable(enabled = url.startsWith("http")) { onLink(url) },
                            shape = RoundedCornerShape(6.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                        ) {
                            Row(
                                modifier = Modifier.padding(9.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.Top,
                            ) {
                                Icon(
                                    Icons.Rounded.Link,
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp),
                                )
                                Column(Modifier.weight(1f)) {
                                    Text(
                                        source.string("title") ?: url,
                                        style = MaterialTheme.typography.labelMedium,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    source.string("snippet")?.takeIf(String::isNotBlank)?.let {
                                        Text(
                                            it,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            maxLines = 3,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    }
                                }
                            }
                        }
                    }
                    chunks.forEach { chunk ->
                        val score = chunk.double("score")
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                        ) {
                            Column(Modifier.padding(9.dp)) {
                                Row {
                                    Text(
                                        chunk.string("documentName") ?: "知识库片段",
                                        modifier = Modifier.weight(1f),
                                        style = MaterialTheme.typography.labelMedium,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    score?.let {
                                        Text(
                                            "${(it * 100).roundToInt()}% 相关",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                                Text(
                                    chunk.string("snippet").orEmpty(),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 4,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                    attachments.forEach { attachment ->
                        val url = attachment.string("url")
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable(enabled = !url.isNullOrBlank()) {
                                    pendingDownloadUrl = url
                                    attachmentDownload.launch(
                                        attachment.string("name") ?: "linhub-file",
                                    )
                                }
                                .background(
                                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                                    RoundedCornerShape(6.dp),
                                )
                                .padding(9.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Rounded.AttachFile, contentDescription = null)
                            Column(Modifier.weight(1f)) {
                                Text(
                                    attachment.string("name") ?: "生成文件",
                                    style = MaterialTheme.typography.labelMedium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    attachment.string("mimeType").orEmpty(),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            if (!url.isNullOrBlank()) {
                                Icon(Icons.Rounded.Download, contentDescription = "下载生成文件")
                            }
                        }
                    }
                    if (sheets.isNotEmpty()) {
                        SpreadsheetToolResult(sheets)
                    }
                    if (slides.isNotEmpty() || layouts.isNotEmpty()) {
                        PresentationToolResult(
                            slides = slides.ifEmpty { layouts },
                            slideCount = slideCount,
                        )
                    }
                    artifactId?.let { artifact ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onOpenArtifact(artifact) }
                                .background(
                                    MaterialTheme.colorScheme.primaryContainer,
                                    RoundedCornerShape(6.dp),
                                )
                                .padding(9.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Rounded.Code, contentDescription = null)
                            Text(
                                result?.string("artifactTitle") ?: "作品 $artifact",
                                style = MaterialTheme.typography.labelMedium,
                            )
                        }
                    }
                    resultText?.takeIf(String::isNotBlank)?.let {
                        ToolTextResult(toolName = toolName, text = it)
                    }
                }
            }
        }
    }
}

@Composable
private fun SpreadsheetToolResult(sheets: List<JsonObject>) {
    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        sheets.take(12).forEach { sheet ->
            val headers = sheet.stringItems("headers")
            val rows = sheet.arrayItems("sampleRows")
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(7.dp),
                color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.48f),
            ) {
                Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.Storage, contentDescription = null, modifier = Modifier.size(16.dp))
                        Text(
                            sheet.string("name") ?: "工作表",
                            modifier = Modifier.weight(1f).padding(horizontal = 7.dp),
                            style = MaterialTheme.typography.labelLarge,
                        )
                        sheet.int("rowCount")?.let {
                            Text("$it 行", style = MaterialTheme.typography.labelSmall)
                        }
                    }
                    if (headers.isNotEmpty()) {
                        Text(
                            headers.take(12).joinToString("  ·  "),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSecondaryContainer,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    rows.take(3).forEachIndexed { index, row ->
                        val values = row.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
                        Text(
                            "${index + 1}. ${values.take(8).joinToString("  |  ")}",
                            style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
        if (sheets.size > 12) {
            Text(
                "另有 ${sheets.size - 12} 个工作表，请查看下方完整摘要。",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun PresentationToolResult(slides: List<JsonObject>, slideCount: Int?) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(7.dp),
        color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.48f),
    ) {
        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.AutoAwesome, contentDescription = null, modifier = Modifier.size(16.dp))
                Text(
                    "演示文稿结构",
                    modifier = Modifier.weight(1f).padding(horizontal = 7.dp),
                    style = MaterialTheme.typography.labelLarge,
                )
                (slideCount ?: slides.size).takeIf { it > 0 }?.let {
                    Text("$it 页", style = MaterialTheme.typography.labelSmall)
                }
            }
            slides.take(10).forEachIndexed { index, slide ->
                val number = slide.int("index") ?: index + 1
                val title = slide.string("title") ?: "第 $number 页"
                val textCount = slide.stringItems("texts").size.takeIf { it > 0 }
                    ?: slide.int("textBlockCount")
                Text(
                    buildString {
                        append(number).append(". ").append(title)
                        textCount?.let { append(" · ").append(it).append(" 个文本块") }
                        if (slide.stringItems("notes").isNotEmpty() || slide.boolean("hasNotes") == true) {
                            append(" · 含备注")
                        }
                    },
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (slides.size > 10) {
                Text(
                    "其余 ${slides.size - 10} 页已折叠",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                )
            }
        }
    }
}

@Composable
private fun ToolTextResult(toolName: String, text: String) {
    val title = when (toolName) {
        "run_code" -> "运行输出"
        "analyze_spreadsheet" -> "完整分析摘要"
        "pptx_extract_text" -> "提取文本"
        "pptx_analyze_template" -> "模板分析"
        else -> null
    }
    val visibleText = text.take(12_000)
    val collapsedLines = if (toolName == "run_code") 24 else 40
    val canExpand = remember(visibleText, collapsedLines) {
        visibleText.lineSequence().take(collapsedLines + 1).count() > collapsedLines
    }
    var showAll by remember(toolName, visibleText) { mutableStateOf(false) }
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(6.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
    ) {
        Column(Modifier.padding(9.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            title?.let {
                Text(it, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
            }
            SelectionContainer {
                Text(
                    visibleText,
                    style = MaterialTheme.typography.bodySmall.copy(
                        fontFamily = if (toolName == "run_code") FontFamily.Monospace else FontFamily.Default,
                    ),
                    maxLines = if (showAll) Int.MAX_VALUE else collapsedLines,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (canExpand) {
                TextButton(onClick = { showAll = !showAll }) {
                    Text(if (showAll) "收起结果" else "展开完整结果")
                }
            }
            if (text.length > 12_000) {
                Text(
                    "结果过长，已显示前 12,000 个字符",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun RoutingDecisionPart(part: JsonObject) {
    val routing = part.objectValue("routing") ?: return
    val labels = routing.stringItems("labels")
    if (labels.isEmpty()) return
    val reasons = routing.stringItems("reasons")
    var expanded by remember(routing) { mutableStateOf(false) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(6.dp))
            .clickable(enabled = reasons.isNotEmpty()) { expanded = !expanded }
            .padding(horizontal = 10.dp, vertical = 8.dp)
            .animateContentSize(),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                Icons.Rounded.AutoAwesome,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(16.dp),
            )
            Text(
                "已自动选择：${labels.joinToString("、")}",
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 7.dp),
                style = MaterialTheme.typography.labelMedium,
                maxLines = if (expanded) 4 else 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (reasons.isNotEmpty()) {
                Icon(
                    Icons.Rounded.ExpandMore,
                    contentDescription = if (expanded) "收起选择原因" else "展开选择原因",
                    modifier = Modifier.size(17.dp),
                )
            }
        }
        AnimatedVisibility(expanded && reasons.isNotEmpty()) {
            Column(Modifier.padding(start = 23.dp, top = 6.dp)) {
                reasons.forEach { reason ->
                    Text(
                        "· $reason",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

private fun toolIcon(name: String): ImageVector = when {
    name == "web_search" || name.contains("read") || name.startsWith("tavily_") ->
        Icons.Rounded.Search
    name.contains("image") -> Icons.Rounded.Image
    name.contains("code") || name.contains("script") -> Icons.Rounded.Terminal
    name.contains("knowledge") || name.contains("resource") || name.contains("spreadsheet") ||
        name.startsWith("pptx_") ->
        Icons.Rounded.Storage
    name.contains("artifact") -> Icons.Rounded.Code
    else -> Icons.Rounded.AutoAwesome
}

private fun toolLabel(name: String, args: JsonObject, preview: String?): String {
    val value = preview ?: args.string("query") ?: args.string("url") ?: args.string("title")
    return when (name) {
        "web_search" -> value?.let { "搜索「$it」" } ?: "联网搜索"
        "web_read" -> value?.let { "阅读 ${shortHost(it)}" } ?: "阅读网页"
        "web_crawl", "tavily_crawl" -> value?.let { "爬取 ${shortHost(it)}" } ?: "爬取网页"
        "tavily_extract" -> value?.let { "提取 ${shortHost(it)}" } ?: "提取网页"
        "tavily_research" -> "深度调研"
        "generate_image" -> "生成图片"
        "edit_image" -> "编辑图片"
        "analyze_image" -> "识别图片"
        "analyze_spreadsheet" -> "分析表格"
        "run_code" -> "运行代码"
        "save_memory" -> "记录记忆"
        "search_memory" -> "检索记忆"
        "search_knowledge" -> value?.let { "检索知识库「$it」" } ?: "检索知识库"
        "create_artifact" -> value?.let { "创建作品「$it」" } ?: "创建作品"
        "update_artifact" -> value?.let { "更新作品「$it」" } ?: "更新作品"
        "list_skill_resources" -> "查看技能资源"
        "read_skill_resource" -> args.string("resourceId")?.let { "读取资源「$it」" } ?: "读取技能资源"
        "run_skill_script" -> "运行技能脚本"
        "pptx_extract_text" -> "提取 PPT 内容"
        "pptx_analyze_template" -> "分析 PPT 模板"
        "pptx_create_deck" -> value?.let { "生成 PPT「$it」" } ?: "生成 PPT"
        else -> name
    }
}

private fun extractToolPreview(raw: String): String? = Regex(
    "\"[^\"]+\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)",
).find(raw)?.groupValues?.getOrNull(1)?.replace("\\\"", "\"")?.take(100)

private fun shortHost(value: String): String = runCatching {
    java.net.URI(value).host ?: value.take(40)
}.getOrDefault(value.take(40))

private fun toolResultSummary(sources: Int, chunks: Int, attachments: Int): String? = buildList {
    if (sources > 0) add("$sources 个来源")
    if (chunks > 0) add("$chunks 个片段")
    if (attachments > 0) add("$attachments 个文件")
}.takeIf(List<String>::isNotEmpty)?.joinToString(" · ")

@Composable
private fun AttachmentPart(
    icon: @Composable () -> Unit,
    title: String,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp))
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        icon()
        Text(title, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun ChatComposer(
    value: String,
    quotedText: String?,
    attachments: List<UploadedAttachment>,
    attachmentUploads: List<AttachmentUploadUi>,
    activeSkill: Skill?,
    pendingProject: Project?,
    editingPendingAttachmentIds: Set<String>,
    uploadingAttachmentCount: Int,
    tools: ChatToolToggles,
    isAdmin: Boolean,
    knowledgeBases: List<KnowledgeBase>,
    mcpServers: List<McpServer>,
    toolOptionsLoading: Boolean,
    recording: Boolean,
    transcribing: Boolean,
    isStreaming: Boolean,
    enabled: Boolean,
    modelSelector: @Composable () -> Unit,
    onValueChange: (String) -> Unit,
    onClearQuote: () -> Unit,
    onPickAttachments: () -> Unit,
    onRemoveAttachment: (String) -> Unit,
    onEditPendingAttachmentImage: (String, String, ByteArray?) -> Unit,
    onDownloadImage: (Uri, String) -> Unit,
    onRetryAttachmentUpload: (String) -> Unit,
    onRemoveAttachmentUpload: (String) -> Unit,
    onUpdateTools: (ChatToolToggles) -> Unit,
    onRequestToolOptions: () -> Unit,
    onToggleRecording: () -> Unit,
    onSend: () -> Unit,
    onStop: () -> Unit,
) {
    val focusManager = LocalFocusManager.current
    var toolsOpen by remember { mutableStateOf(false) }
    val hasContent = value.isNotBlank() || attachments.isNotEmpty()
    val canSend = enabled && hasContent && uploadingAttachmentCount == 0
    val isPptxSkill = activeSkill?.let { skill ->
        skill.id == "skill-pptx-native" || skill.requiredTools.any { it.startsWith("pptx_") }
    } == true
    val hasPptxFile = attachments.any {
        it.name.endsWith(".pptx", ignoreCase = true) ||
            it.mimeType == "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    }
    Box {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .imePadding()
                .padding(start = 16.dp, top = 8.dp, end = 16.dp, bottom = 24.dp),
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 0.dp,
            shadowElevation = 2.dp,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        ) {
            Column(Modifier.fillMaxWidth()) {
                AnimatedVisibility(!quotedText.isNullOrBlank()) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 12.dp, top = 8.dp, end = 6.dp)
                            .background(
                                MaterialTheme.colorScheme.surfaceVariant,
                                RoundedCornerShape(6.dp),
                            )
                            .padding(start = 10.dp, top = 7.dp, bottom = 7.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            Icons.Rounded.FormatQuote,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(
                            quotedText.orEmpty(),
                            modifier = Modifier
                                .weight(1f)
                                .padding(horizontal = 8.dp),
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.bodySmall,
                        )
                        IconButton(onClick = onClearQuote, modifier = Modifier.size(32.dp)) {
                            Icon(
                                Icons.Rounded.Close,
                                contentDescription = "取消引用",
                                modifier = Modifier.size(17.dp),
                            )
                        }
                    }
                }
                AnimatedVisibility(attachments.isNotEmpty() || attachmentUploads.isNotEmpty()) {
                    Column(Modifier.fillMaxWidth()) {
                        if (attachments.isNotEmpty() || attachmentUploads.isNotEmpty()) {
                            LazyRow(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 10.dp, vertical = 8.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                items(attachments, key = UploadedAttachment::id) { attachment ->
                                    ComposerAttachment(
                                        attachment = attachment,
                                        editing = attachment.id in editingPendingAttachmentIds,
                                        onRemove = { onRemoveAttachment(attachment.id) },
                                        onDownload = onDownloadImage,
                                        onEdit = { prompt, mask ->
                                            onEditPendingAttachmentImage(attachment.id, prompt, mask)
                                        },
                                    )
                                }
                                items(attachmentUploads, key = AttachmentUploadUi::id) { upload ->
                                    ComposerAttachmentUpload(
                                        upload = upload,
                                        onRetry = { onRetryAttachmentUpload(upload.id) },
                                        onRemove = { onRemoveAttachmentUpload(upload.id) },
                                    )
                                }
                            }
                        }
                    }
                }
                AnimatedVisibility(isPptxSkill && hasPptxFile) {
                    Text(
                        "PPT 技能已识别附件，可直接总结、改写或基于模板生成新版。",
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                TextField(
                    value = value,
                    onValueChange = onValueChange,
                    enabled = enabled,
                    modifier = Modifier
                        .fillMaxWidth()
                        .animateContentSize(),
                    placeholder = {
                        Text(
                            pendingProject?.let { "在「${it.name}」中发消息…" }
                                ?: "给 LinHub 发消息…",
                            style = MaterialTheme.typography.bodyLarge.copy(
                                fontSize = 15.sp,
                                lineHeight = 22.sp,
                            ),
                        )
                    },
                    textStyle = MaterialTheme.typography.bodyLarge.copy(
                        fontSize = 15.sp,
                        lineHeight = 22.sp,
                    ),
                    minLines = 1,
                    maxLines = 6,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(onSend = {
                        focusManager.clearFocus()
                        onSend()
                    }),
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = Color.Transparent,
                        unfocusedContainerColor = Color.Transparent,
                        disabledContainerColor = Color.Transparent,
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent,
                    ),
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 6.dp, end = 7.dp, bottom = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(
                        onClick = onPickAttachments,
                        enabled = enabled && !isStreaming,
                        modifier = Modifier.size(32.dp),
                    ) {
                        Icon(Icons.Rounded.AttachFile, contentDescription = "上传文件或图片", modifier = Modifier.size(16.dp))
                    }
                    IconButton(
                        onClick = {
                            onRequestToolOptions()
                            toolsOpen = true
                        },
                        enabled = enabled,
                        modifier = Modifier.size(32.dp),
                    ) {
                        Icon(Icons.Rounded.Tune, contentDescription = "工具", modifier = Modifier.size(16.dp))
                    }
                    Spacer(Modifier.weight(1f))
                    modelSelector()
                    IconButton(
                        onClick = onToggleRecording,
                        enabled = enabled && !isStreaming && !transcribing,
                        modifier = Modifier.size(32.dp),
                    ) {
                        if (transcribing) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        } else {
                            Icon(
                                if (recording) Icons.Rounded.Stop else Icons.Rounded.Mic,
                                contentDescription = if (recording) "停止录音" else "语音输入",
                                modifier = Modifier.size(16.dp),
                                tint = if (recording) {
                                    MaterialTheme.colorScheme.error
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                },
                            )
                        }
                    }
                    AnimatedContent(
                        targetState = isStreaming,
                        transitionSpec = {
                            (fadeIn() + scaleIn(initialScale = 0.8f)) togetherWith
                                (fadeOut() + scaleOut(targetScale = 0.8f))
                        },
                        label = "send-stop",
                    ) { streaming ->
                        IconButton(
                            onClick = if (streaming) onStop else onSend,
                            enabled = streaming || canSend,
                            modifier = Modifier.size(32.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(26.dp)
                                    .background(
                                    if (streaming) {
                                        MaterialTheme.colorScheme.onSurface
                                    } else if (canSend) {
                                        MaterialTheme.colorScheme.primary
                                    } else {
                                        MaterialTheme.colorScheme.surfaceVariant
                                    },
                                    RoundedCornerShape(50),
                                ),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    if (streaming) Icons.Rounded.Stop else Icons.Rounded.ArrowUpward,
                                    contentDescription = if (streaming) "停止生成" else "发送",
                                    tint = if (streaming) {
                                        MaterialTheme.colorScheme.surface
                                    } else if (canSend) {
                                        MaterialTheme.colorScheme.onPrimary
                                    } else {
                                        MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.55f)
                                    },
                                    modifier = Modifier.size(13.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
        if (toolsOpen) {
            ToolControlsDialog(
                tools = tools,
                isAdmin = isAdmin,
                knowledgeBases = knowledgeBases,
                mcpServers = mcpServers,
                loading = toolOptionsLoading,
                onToolsChange = onUpdateTools,
                onDismiss = { toolsOpen = false },
            )
        }
    }
}

@Composable
private fun ComposerAttachmentUpload(
    upload: AttachmentUploadUi,
    onRetry: () -> Unit,
    onRemove: () -> Unit,
) {
    Surface(
        modifier = Modifier.width(210.dp),
        shape = RoundedCornerShape(8.dp),
        color = if (upload.error == null) {
            MaterialTheme.colorScheme.surfaceVariant
        } else {
            MaterialTheme.colorScheme.errorContainer
        },
    ) {
        Row(
            modifier = Modifier.padding(start = 10.dp, top = 7.dp, bottom = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (upload.error == null) {
                CircularProgressIndicator(
                    progress = { upload.progress },
                    modifier = Modifier.size(22.dp),
                    strokeWidth = 2.dp,
                )
            } else {
                Icon(
                    Icons.Rounded.ErrorOutline,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(22.dp),
                )
            }
            Column(Modifier.weight(1f)) {
                Text(upload.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    upload.error ?: "已上传 ${(upload.progress * 100).roundToInt()}%",
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (upload.error == null) {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    } else {
                        MaterialTheme.colorScheme.onErrorContainer
                    },
                )
            }
            if (upload.error != null) {
                IconButton(onClick = onRetry, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Rounded.Refresh, contentDescription = "重试上传")
                }
            }
            IconButton(onClick = onRemove, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Rounded.Close, contentDescription = "取消上传")
            }
        }
    }
}

@Composable
private fun ComposerAttachment(
    attachment: UploadedAttachment,
    editing: Boolean,
    onRemove: () -> Unit,
    onDownload: (Uri, String) -> Unit,
    onEdit: (String, ByteArray?) -> Unit,
) {
    val context = LocalContext.current
    var lightboxOpen by remember(attachment.id, attachment.url) { mutableStateOf(false) }
    Surface(
        modifier = Modifier.width(150.dp),
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (attachment.mimeType.startsWith("image/") && attachment.url != null) {
                AsyncImage(
                    model = ImageRequest.Builder(context)
                        .data(resolveMediaUrl(attachment.url))
                        .crossfade(true)
                        .build(),
                    contentDescription = attachment.name,
                    modifier = Modifier
                        .size(48.dp)
                        .clickable { lightboxOpen = true }
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                    contentScale = ContentScale.Crop,
                )
            } else {
                Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) {
                    Icon(Icons.Rounded.AttachFile, contentDescription = null)
                }
            }
            Text(
                attachment.name,
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 6.dp),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.labelSmall,
            )
            IconButton(onClick = onRemove, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Rounded.Close, contentDescription = "移除附件", modifier = Modifier.size(16.dp))
            }
        }
    }
    if (lightboxOpen && attachment.url != null) {
        ImageLightboxDialog(
            url = attachment.url,
            alt = attachment.name,
            editing = editing,
            onDismiss = { lightboxOpen = false },
            onDownload = onDownload,
            onEdit = { prompt, mask ->
                onEdit(prompt, mask)
            },
        )
    }
}

@Composable
private fun ToolControlsDialog(
    tools: ChatToolToggles,
    isAdmin: Boolean,
    knowledgeBases: List<KnowledgeBase>,
    mcpServers: List<McpServer>,
    loading: Boolean,
    onToolsChange: (ChatToolToggles) -> Unit,
    onDismiss: () -> Unit,
) {
    var view by remember { mutableStateOf(ToolControlsView.Root) }
    val globalServers = mcpServers.filter { it.scope == "global" }
    val userServers = mcpServers.filter { it.scope == "user" }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            when (view) {
                ToolControlsView.Root -> Text("工具")
                ToolControlsView.Knowledge -> SecondaryMenuHeader("资料检索") {
                    view = ToolControlsView.Root
                }
                ToolControlsView.Tools -> SecondaryMenuHeader("工具设置") {
                    view = ToolControlsView.Root
                }
            }
        },
        text = {
            AnimatedContent(
                targetState = view,
                transitionSpec = {
                    (fadeIn() + scaleIn(initialScale = 0.98f)) togetherWith
                        (fadeOut() + scaleOut(targetScale = 0.98f))
                },
                label = "tool-secondary-menu",
            ) { activeView ->
                LazyColumn(
                    modifier = Modifier.heightIn(max = 520.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    when (activeView) {
                    ToolControlsView.Root -> {
                        item {
                            ToolToggleRow(
                                icon = { Icon(Icons.Rounded.SmartToy, contentDescription = null) },
                                label = "智能选择",
                                checked = tools.autoRouting,
                                onChange = { onToolsChange(tools.copy(autoRouting = it)) },
                            )
                        }
                        item {
                            ToolToggleRow(
                                icon = { Icon(Icons.Rounded.Search, contentDescription = null) },
                                label = "联网搜索",
                                checked = tools.webSearch,
                                onChange = { onToolsChange(tools.copy(webSearch = it)) },
                            )
                        }
                        item {
                            ToolToggleRow(
                                icon = { Icon(Icons.Rounded.Image, contentDescription = null) },
                                label = "生成或编辑图片",
                                checked = tools.imageGeneration,
                                onChange = { onToolsChange(tools.copy(imageGeneration = it)) },
                            )
                        }
                        item {
                            ToolNavigationRow(
                                icon = { Icon(Icons.Rounded.Storage, contentDescription = null) },
                                label = "资料检索",
                                value = if (tools.knowledgeBaseIds.isEmpty()) "全部知识库" else "已选 1 个",
                                onClick = { view = ToolControlsView.Knowledge },
                            )
                        }
                        item {
                            ToolNavigationRow(
                                icon = { Icon(Icons.Rounded.Link, contentDescription = null) },
                                label = "工具设置",
                                value = if (tools.mcpServerIds.isEmpty()) "全部工具" else "已选 1 个",
                                onClick = { view = ToolControlsView.Tools },
                            )
                        }
                    }

                    ToolControlsView.Knowledge -> {
                        item {
                            ToolToggleRow(
                                icon = { Icon(Icons.Rounded.Storage, contentDescription = null) },
                                label = "开启资料检索",
                                checked = tools.knowledgeSearch,
                                onChange = { onToolsChange(tools.copy(knowledgeSearch = it)) },
                            )
                        }
                        if (loading) {
                            item { ToolOptionsLoading() }
                        } else if (knowledgeBases.isEmpty()) {
                            item { EmptyToolOptions("暂无可检索的知识库") }
                        } else {
                            items(knowledgeBases, key = { "tool-kb-${it.id}" }) { knowledgeBase ->
                                val specificallySelected = knowledgeBase.id in tools.knowledgeBaseIds
                                ToolChoiceRow(
                                    title = knowledgeBase.name,
                                    subtitle = "${knowledgeBase.documentCount} 个文档 · ${knowledgeBase.totalChunks} 个片段",
                                    state = when {
                                        tools.knowledgeBaseIds.isEmpty() -> ToolChoiceState.Default
                                        specificallySelected -> ToolChoiceState.Selected
                                        else -> ToolChoiceState.Off
                                    },
                                    enabled = tools.knowledgeSearch,
                                    icon = { Icon(Icons.Rounded.Storage, contentDescription = null) },
                                    onSelect = {
                                        onToolsChange(
                                            tools.copy(
                                                knowledgeBaseIds = exclusiveToolSelection(
                                                    tools.knowledgeBaseIds,
                                                    knowledgeBase.id,
                                                ),
                                            ),
                                        )
                                    },
                                )
                            }
                        }
                    }

                    ToolControlsView.Tools -> {
                        item {
                            ToolToggleRow(
                                icon = { Icon(Icons.Rounded.Terminal, contentDescription = null) },
                                label = "开启代码运行",
                                checked = tools.codeRunner,
                                onChange = { onToolsChange(tools.copy(codeRunner = it)) },
                            )
                        }
                        if (loading) {
                            item { ToolOptionsLoading() }
                        } else {
                            if (isAdmin) {
                                items(globalServers, key = { "tool-global-mcp-${it.id}" }) { server ->
                                    ToolChoiceRow(
                                        title = server.name,
                                        subtitle = "全局自动启用 · ${server.tools.size} 个工具",
                                        state = ToolChoiceState.Locked,
                                        enabled = false,
                                        icon = { Icon(Icons.Rounded.Link, contentDescription = null) },
                                        onSelect = {},
                                    )
                                }
                            }
                            items(userServers, key = { "tool-user-mcp-${it.id}" }) { server ->
                                val specificallySelected = server.id in tools.mcpServerIds
                                ToolChoiceRow(
                                    title = server.name,
                                    subtitle = "我的 · ${server.tools.size} 个工具",
                                    state = when {
                                        tools.mcpServerIds.isEmpty() -> ToolChoiceState.Default
                                        specificallySelected -> ToolChoiceState.Selected
                                        else -> ToolChoiceState.Off
                                    },
                                    icon = { Icon(Icons.Rounded.Link, contentDescription = null) },
                                    onSelect = {
                                        onToolsChange(
                                            tools.copy(
                                                mcpServerIds = exclusiveToolSelection(
                                                    tools.mcpServerIds,
                                                    server.id,
                                                ),
                                            ),
                                        )
                                    },
                                )
                            }
                            if (userServers.isEmpty() && (!isAdmin || globalServers.isEmpty())) {
                                item { EmptyToolOptions("暂无可配置的个人 MCP 服务器") }
                            }
                        }
                    }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("完成") } },
    )
}

private enum class ToolControlsView { Root, Knowledge, Tools }

private enum class ToolChoiceState { Default, Selected, Off, Locked }

@Composable
private fun SecondaryMenuHeader(label: String, onBack: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onBack, modifier = Modifier.size(36.dp)) {
            Icon(Icons.Rounded.ChevronLeft, contentDescription = "返回上一级")
        }
        Text(label, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun ToolNavigationRow(
    icon: @Composable () -> Unit,
    label: String,
    value: String,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        icon()
        Text(label, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Text(value, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Icon(Icons.Rounded.ChevronRight, contentDescription = null, modifier = Modifier.size(18.dp))
    }
}

@Composable
private fun ToolOptionsLoading() {
    Box(
        modifier = Modifier.fillMaxWidth().padding(18.dp),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
    }
}

@Composable
private fun EmptyToolOptions(message: String) {
    Text(
        message,
        modifier = Modifier.fillMaxWidth().padding(18.dp),
        textAlign = TextAlign.Center,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun ToolToggleRow(
    icon: @Composable () -> Unit,
    label: String,
    checked: Boolean,
    onChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onChange(!checked) }
            .padding(horizontal = 10.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        icon()
        Text(label, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@Composable
private fun ToolChoiceRow(
    title: String,
    subtitle: String,
    state: ToolChoiceState,
    enabled: Boolean = true,
    icon: @Composable () -> Unit,
    onSelect: () -> Unit,
) {
    val checked = state != ToolChoiceState.Off
    val checkBackground by animateColorAsState(
        targetValue = when (state) {
            ToolChoiceState.Selected -> MaterialTheme.colorScheme.primary
            ToolChoiceState.Default, ToolChoiceState.Locked -> MaterialTheme.colorScheme.surfaceVariant
            ToolChoiceState.Off -> Color.Transparent
        },
        label = "tool-choice-background",
    )
    val checkForeground by animateColorAsState(
        targetValue = if (state == ToolChoiceState.Selected) {
            MaterialTheme.colorScheme.onPrimary
        } else {
            MaterialTheme.colorScheme.onSurfaceVariant
        },
        label = "tool-choice-foreground",
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled, onClick = onSelect)
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        icon()
        Column(Modifier.weight(1f)) {
            Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                subtitle,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Surface(
            modifier = Modifier.size(20.dp),
            shape = RoundedCornerShape(6.dp),
            color = checkBackground,
            border = if (state == ToolChoiceState.Off) {
                BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
            } else {
                null
            },
        ) {
            AnimatedContent(
                targetState = checked,
                transitionSpec = {
                    (fadeIn() + scaleIn(initialScale = 0.72f)) togetherWith
                        (fadeOut() + scaleOut(targetScale = 0.72f))
                },
                label = "tool-choice-check",
            ) { showCheck ->
                if (showCheck) {
                    Icon(
                        Icons.Rounded.Check,
                        contentDescription = null,
                        tint = checkForeground,
                        modifier = Modifier.padding(3.dp),
                    )
                } else {
                    Spacer(Modifier.fillMaxSize())
                }
            }
        }
    }
}

@Composable
private fun ModelMenu(
    models: List<Model>,
    selectedModelId: String?,
    defaultModelId: String?,
    thinkingEffort: String,
    hasThinkingOverride: Boolean,
    onSelectModel: (String) -> Unit,
    onSetDefaultModel: (String) -> Unit,
    onSelectThinkingEffort: (String) -> Unit,
    onResetThinkingEffort: () -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    var view by remember { mutableStateOf(ModelSecondaryMenuView.Root) }
    val selectedName = models.firstOrNull { it.id == selectedModelId }?.displayName ?: "选择模型"
    val selectedModel = models.firstOrNull { it.id == selectedModelId }
    Box {
        TextButton(
            onClick = {
                view = ModelSecondaryMenuView.Root
                expanded = true
            },
            modifier = Modifier.height(34.dp),
            contentPadding = PaddingValues(horizontal = 7.dp),
        ) {
            Text(
                selectedName,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Icon(
                Icons.Rounded.ExpandMore,
                contentDescription = "选择模型",
                modifier = Modifier.size(15.dp),
            )
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = {
                expanded = false
                view = ModelSecondaryMenuView.Root
            },
            modifier = Modifier.widthIn(min = 280.dp, max = 340.dp),
        ) {
            AnimatedContent(
                targetState = view,
                transitionSpec = {
                    (fadeIn() + scaleIn(initialScale = 0.98f)) togetherWith
                        (fadeOut() + scaleOut(targetScale = 0.98f))
                },
                label = "model-secondary-menu",
            ) { activeView ->
                Column(Modifier.widthIn(min = 280.dp, max = 340.dp)) {
                    when (activeView) {
                        ModelSecondaryMenuView.Root -> {
                            Text(
                                "模型与思考",
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            ToolNavigationRow(
                                icon = { Icon(Icons.Rounded.SmartToy, contentDescription = null) },
                                label = "选择模型",
                                value = selectedName,
                                onClick = { view = ModelSecondaryMenuView.Models },
                            )
                            if (selectedModel?.capabilities?.contains("reasoning") == true) {
                                ToolNavigationRow(
                                    icon = { Icon(Icons.Rounded.Psychology, contentDescription = null) },
                                    label = "选择思考强度",
                                    value = THINKING_LABELS[thinkingEffort] ?: thinkingEffort,
                                    onClick = { view = ModelSecondaryMenuView.Thinking },
                                )
                            }
                        }

                        ModelSecondaryMenuView.Models -> {
                            SecondaryMenuHeader("选择模型") { view = ModelSecondaryMenuView.Root }
                            HorizontalDivider()
                            models.filterNot { "image-generation" in it.capabilities }
                                .groupBy(Model::providerKind)
                                .toList()
                                .sortedBy { (provider) ->
                                    MODEL_PROVIDER_ORDER.indexOf(provider).let {
                                        if (it < 0) Int.MAX_VALUE else it
                                    }
                                }
                                .forEachIndexed { providerIndex, (provider, providerModels) ->
                                    if (providerIndex > 0) HorizontalDivider()
                                    DropdownMenuItem(
                                        text = {
                                            Text(
                                                modelProviderLabel(provider),
                                                style = MaterialTheme.typography.labelMedium,
                                            )
                                        },
                                        onClick = {},
                                        enabled = false,
                                    )
                                    providerModels.sortedWith(
                                        compareBy<Model> { it.sortOrder }.thenBy(Model::displayName),
                                    ).forEach { model ->
                                        ModelMenuRow(
                                            model = model,
                                            selected = model.id == selectedModelId,
                                            default = model.id == defaultModelId,
                                            onSelect = {
                                                onSelectModel(model.id)
                                                expanded = false
                                                view = ModelSecondaryMenuView.Root
                                            },
                                            onSetDefault = { onSetDefaultModel(model.id) },
                                        )
                                    }
                                }
                        }

                        ModelSecondaryMenuView.Thinking -> {
                            SecondaryMenuHeader("选择思考强度") {
                                view = ModelSecondaryMenuView.Root
                            }
                            HorizontalDivider()
                            selectedModel?.let { model ->
                                supportedThinkingEfforts(model).forEach { effort ->
                                    DropdownMenuItem(
                                        text = { Text(THINKING_LABELS.getValue(effort)) },
                                        onClick = {
                                            onSelectThinkingEffort(effort)
                                            expanded = false
                                            view = ModelSecondaryMenuView.Root
                                        },
                                        trailingIcon = if (effort == thinkingEffort) {
                                            {
                                                Icon(
                                                    Icons.Rounded.CheckCircle,
                                                    contentDescription = "当前思考强度",
                                                )
                                            }
                                        } else {
                                            null
                                        },
                                    )
                                }
                                if (hasThinkingOverride) {
                                    HorizontalDivider()
                                    DropdownMenuItem(
                                        text = { Text("恢复模型推荐值") },
                                        onClick = {
                                            onResetThinkingEffort()
                                            expanded = false
                                            view = ModelSecondaryMenuView.Root
                                        },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private enum class ModelSecondaryMenuView { Root, Models, Thinking }

@Composable
private fun ModelMenuRow(
    model: Model,
    selected: Boolean,
    default: Boolean,
    onSelect: () -> Unit,
    onSetDefault: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            modifier = Modifier
                .weight(1f)
                .clip(RoundedCornerShape(4.dp))
                .clickable(role = Role.Button, onClick = onSelect)
                .padding(horizontal = 8.dp, vertical = 8.dp),
        ) {
            Text(model.displayName)
            Text(
                "${model.tier} · ${model.contextWindow / 1_000}K 上下文",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(8.dp))
                .clickable(role = Role.Button, onClick = onSetDefault)
                .semantics {
                    contentDescription = if (default) "默认模型" else "设为默认"
                },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Rounded.StarBorder,
                contentDescription = null,
                modifier = Modifier.size(17.dp),
                tint = if (default) {
                    Color(0xFFF59E0B)
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
        }
        if (selected) {
            Box(Modifier.size(28.dp), contentAlignment = Alignment.Center) {
                Icon(
                    Icons.Rounded.CheckCircle,
                    contentDescription = "当前模型",
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}

@Composable
private fun StyleMenu(
    styles: List<ChatStyle>,
    selectedStyleId: String,
    onSelectStyle: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { expanded = true }, modifier = Modifier.size(28.dp)) {
            Icon(Icons.Rounded.MoreHoriz, contentDescription = "对话设置", modifier = Modifier.size(14.dp))
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            styles.forEach { style ->
                DropdownMenuItem(
                    text = {
                        Column {
                            Text(style.name)
                            Text(
                                style.description,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    },
                    onClick = {
                        onSelectStyle(style.id)
                        expanded = false
                    },
                    trailingIcon = if (style.id == selectedStyleId) {
                        { Icon(Icons.Rounded.CheckCircle, contentDescription = "当前风格") }
                    } else {
                        null
                    },
                )
            }
        }
    }
}

private val THINKING_LABELS = mapOf(
    "minimal" to "短",
    "low" to "中",
    "medium" to "长",
    "high" to "最长",
    "xhigh" to "极高",
    "max" to "最大",
)

private val MODEL_PROVIDER_ORDER = listOf(
    "openai",
    "anthropic",
    "google",
    "deepseek",
    "zhipu",
    "xiaomi",
    "xiaomi-token-plan",
)

private fun modelProviderLabel(provider: String): String = when (provider) {
    "openai" -> "OpenAI"
    "anthropic" -> "Anthropic"
    "google" -> "Google"
    "deepseek" -> "DeepSeek"
    "zhipu" -> "智谱"
    "xiaomi", "xiaomi-token-plan" -> "小米"
    else -> provider
}

private const val MAX_VOICE_RECORDING_MILLIS = 5 * 60_000L

private fun visibleThread(messages: List<ChatMessage>, requestedLeafId: String?): List<ChatMessage> {
    if (messages.isEmpty()) return emptyList()
    val byId = messages.associateBy { it.id }
    var current = requestedLeafId?.let(byId::get) ?: messages.last()
    val chain = ArrayDeque<ChatMessage>()
    while (true) {
        chain.addFirst(current)
        current = current.parentId?.let(byId::get) ?: break
    }
    return chain.toList()
}

/** O(1) 替换流式路径最后一项，同时复用此前已经解析好的树路径。 */
private class LastItemOverrideList<T>(
    private val source: List<T>,
    private val lastItem: T,
) : AbstractList<T>() {
    override val size: Int get() = source.size

    override fun get(index: Int): T {
        if (index !in indices) throw IndexOutOfBoundsException("index=$index, size=$size")
        return if (index == lastIndex) lastItem else source[index]
    }
}

private data class MessageBranchInfo(
    val index: Int,
    val total: Int,
    val previousLeafId: String?,
    val nextLeafId: String?,
)

private class MessageBranchIndex(messages: List<ChatMessage>) {
    private val siblingsByParent = messages.groupBy(ChatMessage::parentId)
    private val deepestLeafById = mutableMapOf<String, String>()

    fun info(message: ChatMessage): MessageBranchInfo? {
        val siblings = siblingsByParent[message.parentId].orEmpty()
        if (siblings.size <= 1) return null
        val index = siblings.indexOfFirst { it.id == message.id }
        if (index < 0) return null
        return MessageBranchInfo(
            index = index,
            total = siblings.size,
            previousLeafId = siblings.getOrNull(index - 1)?.let(::deepestLeaf),
            nextLeafId = siblings.getOrNull(index + 1)?.let(::deepestLeaf),
        )
    }

    private fun deepestLeaf(root: ChatMessage): String = deepestLeafById.getOrPut(root.id) {
        var current = root
        var children = siblingsByParent[current.id].orEmpty()
        while (children.isNotEmpty()) {
            current = children.last()
            children = siblingsByParent[current.id].orEmpty()
        }
        current.id
    }
}

private fun ChatMessage.textContent(): String = parts
    .filter { it.type() == "text" }
    .mapNotNull { it.string("text") }
    .joinToString("\n")

private fun resolveMediaUrl(url: String): String = when {
    url.startsWith("/") -> BuildConfig.API_BASE_URL.trimEnd('/') + url
    else -> url
}

private fun JsonObject.objectValue(key: String): JsonObject? = get(key) as? JsonObject

private fun JsonObject?.objectItems(key: String): List<JsonObject> =
    (this?.get(key) as? JsonArray)?.mapNotNull { it as? JsonObject }.orEmpty()

private fun JsonObject.stringItems(key: String): List<String> =
    (get(key) as? JsonArray)?.mapNotNull {
        (it as? JsonPrimitive)?.contentOrNull
    }.orEmpty()

private fun JsonObject.arrayItems(key: String): List<JsonArray> =
    (get(key) as? JsonArray)?.mapNotNull { it as? JsonArray }.orEmpty()

private fun JsonObject.int(key: String): Int? =
    (get(key) as? JsonPrimitive)?.intOrNull

private fun JsonObject.boolean(key: String): Boolean? =
    (get(key) as? JsonPrimitive)?.contentOrNull?.toBooleanStrictOrNull()

private fun JsonObject.double(key: String): Double? =
    (get(key) as? JsonPrimitive)?.doubleOrNull
