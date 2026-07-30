package com.linhub.android.ui

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.tween
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.aspectRatio
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
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items as gridItems
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Description as DescriptionOutlined
import androidx.compose.material.icons.outlined.Folder as FolderOutlined
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Chat
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Menu
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.AdminPanelSettings
import androidx.compose.material.icons.rounded.Storage
import androidx.compose.material.icons.rounded.UploadFile
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalLocale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.graphics.toColorInt
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.linhub.android.BuildConfig
import com.linhub.android.core.model.KnowledgeBase
import com.linhub.android.core.model.KnowledgeDocument
import com.linhub.android.core.model.Conversation
import com.linhub.android.core.model.FontSizePreset
import com.linhub.android.core.model.MediaAsset
import com.linhub.android.core.model.Model
import com.linhub.android.core.model.Project
import com.linhub.android.core.model.ProjectFile
import com.linhub.android.core.model.ThemeMode
import java.io.ByteArrayOutputStream
import java.time.Duration
import java.time.Instant
import kotlinx.coroutines.launch

internal suspend fun closeDrawerThenRun(
    closeDrawer: suspend () -> Unit,
    action: () -> Unit,
) {
    closeDrawer()
    action()
}

@Composable
fun WorkspaceScaffold(
    state: WorkspaceShellState,
    onDestinationChange: (WorkspaceDestination) -> Unit,
    onNewConversation: () -> Unit,
    onOpenConversation: (Conversation) -> Unit,
    onConversationSearch: (String) -> Unit,
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
    content: @Composable (PaddingValues, () -> Unit) -> Unit,
) {
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val closeDrawer: () -> Unit = {
        scope.launch { drawerState.close() }
        Unit
    }
    val closeThenRun: (() -> Unit) -> Unit = { action ->
        scope.launch {
            closeDrawerThenRun(
                closeDrawer = { drawerState.close() },
                action = action,
            )
        }
        Unit
    }
    val openDrawer: () -> Unit = {
        scope.launch { drawerState.open() }
        Unit
    }

    LaunchedEffect(state.drawerOpenRequest) {
        if (state.drawerOpenRequest != 0L) drawerState.open()
    }

    BackHandler(enabled = drawerState.isOpen) {
        closeDrawer()
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        gesturesEnabled = true,
        drawerContent = {
            ConversationDrawer(
                state = state,
                destination = state.destination,
                onCloseDrawer = closeDrawer,
                onDestinationChange = {
                    closeThenRun { onDestinationChange(it) }
                },
                onNewConversation = {
                    closeThenRun(onNewConversation)
                },
                onOpenConversation = {
                    closeThenRun { onOpenConversation(it) }
                },
                onSearch = onConversationSearch,
                onRenameConversation = onRenameConversation,
                onConsumeFailedConversationRename = onConsumeFailedConversationRename,
                onTogglePinned = onTogglePinned,
                onToggleArchived = onToggleArchived,
                onMoveConversation = onMoveConversation,
                onDeleteConversation = onDeleteConversation,
                onToggleProjectCollapsed = onToggleProjectCollapsed,
                onToggleProjectPinned = onToggleProjectPinned,
                onStartProjectConversation = {
                    closeThenRun { onStartProjectConversation(it) }
                },
                onEditProject = {
                    closeThenRun { onEditProject(it) }
                },
                onDeleteProject = onDeleteProject,
                onThemeModeChange = onThemeModeChange,
                onFontSizePresetChange = onFontSizePresetChange,
                onSignOut = onSignOut,
            )
        },
    ) {
        Scaffold(contentWindowInsets = WindowInsets(0)) { padding ->
            content(padding, openDrawer)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProjectsScreen(
    projects: List<Project>,
    requestedEditorProjectId: String?,
    requestedConversationProjectId: String?,
    conversations: List<Conversation>,
    projectConversations: Map<String, List<Conversation>>,
    loadingProjectConversationIds: Set<String>,
    knowledgeBases: List<KnowledgeBase>,
    knowledgeBasesLoaded: Boolean,
    knowledgeBasesLoading: Boolean,
    models: List<Model>,
    loading: Boolean,
    uploadProgress: ProjectUploadProgress?,
    onStartConversation: (Project) -> Unit,
    onOpenConversation: (String) -> Unit,
    onLoadProjectConversations: (Project) -> Unit,
    onPrepareEditor: () -> Unit,
    onSave: (Project?, String, String, String, String?, String?, List<String>) -> Unit,
    onDelete: (Project) -> Unit,
    onUploadFiles: (Project, List<Uri>, String?) -> Unit,
    onDeleteFile: (Project, ProjectFile) -> Unit,
    onEditorRequestConsumed: (String) -> Unit,
    onConversationRequestConsumed: (String) -> Unit,
    onOpenMenu: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var editor by remember { mutableStateOf<Project?>(null) }
    var creating by remember { mutableStateOf(false) }
    var deleteTarget by remember { mutableStateOf<Project?>(null) }
    var uploadTarget by remember { mutableStateOf<Project?>(null) }
    var selectedProjectId by remember { mutableStateOf<String?>(null) }
    var selectedSection by remember { mutableStateOf(ProjectDetailSection.Conversations) }
    var uploadMirrorKnowledgeBaseId by remember { mutableStateOf<String?>(null) }
    val selectedProject = projects.firstOrNull { it.id == selectedProjectId }

    LaunchedEffect(requestedEditorProjectId, projects) {
        val projectId = requestedEditorProjectId ?: return@LaunchedEffect
        val requestedProject = projects.firstOrNull { it.id == projectId } ?: return@LaunchedEffect
        selectedProjectId = requestedProject.id
        selectedSection = ProjectDetailSection.Settings
        creating = false
        editor = requestedProject
        onEditorRequestConsumed(projectId)
    }
    LaunchedEffect(requestedConversationProjectId, projects) {
        val projectId = requestedConversationProjectId ?: return@LaunchedEffect
        val requestedProject = projects.firstOrNull { it.id == projectId } ?: return@LaunchedEffect
        selectedProjectId = requestedProject.id
        selectedSection = ProjectDetailSection.Conversations
        creating = false
        editor = null
        onConversationRequestConsumed(projectId)
    }
    LaunchedEffect(selectedProjectId, projects) {
        if (selectedProjectId != null && selectedProject == null) selectedProjectId = null
    }
    BackHandler(enabled = selectedProject != null) {
        selectedProjectId = null
        selectedSection = ProjectDetailSection.Conversations
    }
    val filePicker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments(),
    ) { uris ->
        val project = uploadTarget
        uploadTarget = null
        val mirrorKnowledgeBaseId = uploadMirrorKnowledgeBaseId
        uploadMirrorKnowledgeBaseId = null
        if (uris.isNotEmpty() && project != null) {
            onUploadFiles(project, uris, mirrorKnowledgeBaseId)
        }
    }

    AnimatedContent(
        targetState = selectedProjectId,
        modifier = modifier.fillMaxSize(),
        transitionSpec = {
            val direction = if (targetState == null) -1 else 1
            (slideInHorizontally(tween(180)) { it / 5 * direction } + fadeIn(tween(150))) togetherWith
                (slideOutHorizontally(tween(180)) { -it / 6 * direction } + fadeOut(tween(120)))
        },
        label = "项目列表与详情",
    ) { targetProjectId ->
        val targetProject = projects.firstOrNull { it.id == targetProjectId }
        if (targetProject == null) {
            ProjectsListContent(
                projects = projects,
                loading = loading,
                onOpenMenu = onOpenMenu,
                onCreate = {
                    creating = true
                    editor = null
                },
                onOpenProject = { project ->
                    selectedProjectId = project.id
                    selectedSection = ProjectDetailSection.Conversations
                    onLoadProjectConversations(project)
                },
            )
        } else {
            ProjectDetailContent(
                project = targetProject,
                section = selectedSection,
                conversations = projectConversations[targetProject.id]
                    ?: conversations.filter { it.projectId == targetProject.id && !it.archived },
                conversationsLoading = targetProject.id in loadingProjectConversationIds,
                knowledgeBases = knowledgeBases,
                knowledgeBasesLoaded = knowledgeBasesLoaded,
                knowledgeBasesLoading = knowledgeBasesLoading,
                models = models,
                loading = loading,
                uploadProgress = uploadProgress?.takeIf { it.projectId == targetProject.id },
                onBack = {
                    selectedProjectId = null
                    selectedSection = ProjectDetailSection.Conversations
                },
                onSelectSection = { section ->
                    selectedSection = section
                    if (section == ProjectDetailSection.Files) onPrepareEditor()
                },
                onEdit = {
                    onPrepareEditor()
                    editor = targetProject
                },
                onStartConversation = { onStartConversation(targetProject) },
                onOpenConversation = onOpenConversation,
                onSaveModel = { modelId ->
                    onSave(
                        targetProject,
                        targetProject.name,
                        targetProject.description.orEmpty(),
                        targetProject.instructions.orEmpty(),
                        targetProject.color,
                        modelId,
                        targetProject.knowledgeBaseIds,
                    )
                },
                onSaveInstructions = { instructions ->
                    onSave(
                        targetProject,
                        targetProject.name,
                        targetProject.description.orEmpty(),
                        instructions,
                        targetProject.color,
                        targetProject.modelId,
                        targetProject.knowledgeBaseIds,
                    )
                },
                onToggleKnowledgeBase = { knowledgeBaseId, checked ->
                    onSave(
                        targetProject,
                        targetProject.name,
                        targetProject.description.orEmpty(),
                        targetProject.instructions.orEmpty(),
                        targetProject.color,
                        targetProject.modelId,
                        projectKnowledgeBaseIdsAfterToggle(
                            targetProject.knowledgeBaseIds,
                            knowledgeBaseId,
                            checked,
                        ),
                    )
                },
                onUpload = {
                    uploadTarget = targetProject
                    uploadMirrorKnowledgeBaseId = null
                    filePicker.launch(arrayOf("*/*"))
                },
                onDeleteFile = { onDeleteFile(targetProject, it) },
                onDelete = { deleteTarget = targetProject },
            )
        }
    }

    if (creating) {
        ProjectCreateDialog(
            onDismiss = { creating = false },
            onSave = { name, description ->
                onSave(null, name, description, "", PROJECT_COLORS.first(), null, emptyList())
                creating = false
            },
        )
    }
    editor?.let { requested ->
        val project = projects.firstOrNull { it.id == requested.id } ?: requested
        ProjectMetaEditorDialog(
            project = project,
            onDismiss = { editor = null },
            onSave = { name, description, color ->
                onSave(
                    project,
                    name,
                    description,
                    project.instructions.orEmpty(),
                    color,
                    project.modelId,
                    project.knowledgeBaseIds,
                )
                editor = null
            },
        )
    }
    deleteTarget?.let { project ->
        DeleteDialog(
            title = "删除项目",
            body = "确定删除项目「${project.name}」？项目里的会话不会被删除。",
            onDismiss = { deleteTarget = null },
            onConfirm = {
                onDelete(project)
                deleteTarget = null
                if (selectedProjectId == project.id) selectedProjectId = null
            },
        )
    }
}

@Composable
private fun ProjectsListContent(
    projects: List<Project>,
    loading: Boolean,
    onOpenMenu: () -> Unit,
    onCreate: () -> Unit,
    onOpenProject: (Project) -> Unit,
) {
    Scaffold(
        contentWindowInsets = WindowInsets(0),
        topBar = {
            WebPageHeader(
                title = "项目",
                description = "用项目组织会话，共享项目文件、关联知识库与专属指令",
                onOpenMenu = onOpenMenu,
                action = {
                    WebHeaderAction(
                        label = "新建项目",
                        icon = Icons.Rounded.Add,
                        onClick = onCreate,
                    )
                },
            )
        },
    ) { padding ->
        when {
            loading && projects.isEmpty() -> LoadingContent(Modifier.padding(padding))
            projects.isEmpty() -> WebEmptyState(
                icon = Icons.Outlined.FolderOutlined,
                title = "还没有项目",
                description = "项目里的会话共享同一组文件、关联知识库和自定义指令，适合长期进行的工作。",
                actionLabel = "创建第一个项目",
                onAction = onCreate,
                modifier = Modifier
                    .padding(padding)
                    .padding(horizontal = 16.dp),
            )
            else -> LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(projects, key = Project::id, contentType = { "project" }) { project ->
                    ProjectRow(
                        project = project,
                        onOpen = { onOpenProject(project) },
                        modifier = Modifier.animateItem(),
                    )
                }
            }
        }
    }
}

@Composable
private fun ProjectRow(
    project: Project,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .clickable(
                onClickLabel = "打开项目「${project.name}」",
                role = Role.Button,
                onClick = onOpen,
            )
            .clearAndSetSemantics {
                contentDescription = "打开项目「${project.name}」"
                role = Role.Button
                onClick(label = "打开项目「${project.name}」") {
                    onOpen()
                    true
                }
            },
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        shadowElevation = 1.dp,
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .background(project.color.asComposeColor(), RoundedCornerShape(10.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Rounded.Folder,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(18.dp),
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    project.name + if (project.clientMutationState == "pending") " · 创建中…" else "",
                    style = MaterialTheme.typography.titleMedium,
                )
                project.description?.takeIf(String::isNotBlank)?.let { description ->
                    Text(
                        description,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ProjectMetric(Icons.AutoMirrored.Rounded.Chat, "${project.conversationCount} 个会话")
                ProjectMetric(Icons.Rounded.Description, "${project.files.size} 个文件")
                ProjectMetric(Icons.Rounded.Storage, "${project.knowledgeBaseIds.size} 个知识库")
                Spacer(Modifier.weight(1f))
                Text(
                    formatProjectRelativeTime(project.updatedAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun ProjectMetric(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(13.dp),
        )
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
        )
    }
}

@Composable
private fun ProjectDetailContent(
    project: Project,
    section: ProjectDetailSection,
    conversations: List<Conversation>,
    conversationsLoading: Boolean,
    knowledgeBases: List<KnowledgeBase>,
    knowledgeBasesLoaded: Boolean,
    knowledgeBasesLoading: Boolean,
    models: List<Model>,
    loading: Boolean,
    uploadProgress: ProjectUploadProgress?,
    onBack: () -> Unit,
    onSelectSection: (ProjectDetailSection) -> Unit,
    onEdit: () -> Unit,
    onStartConversation: () -> Unit,
    onOpenConversation: (String) -> Unit,
    onSaveModel: (String?) -> Unit,
    onSaveInstructions: (String) -> Unit,
    onToggleKnowledgeBase: (String, Boolean) -> Unit,
    onUpload: () -> Unit,
    onDeleteFile: (ProjectFile) -> Unit,
    onDelete: () -> Unit,
) {
    var deleteFileTarget by remember { mutableStateOf<ProjectFile?>(null) }
    Column(modifier = Modifier.fillMaxSize()) {
        ProjectDetailHeader(
            project = project,
            onBack = onBack,
            onEdit = onEdit,
        )
        ProjectDetailTabs(
            selected = section,
            onSelect = onSelectSection,
        )
        HorizontalDivider()
        when (section) {
            ProjectDetailSection.Conversations -> ProjectConversationsContent(
                conversations = conversations,
                loading = conversationsLoading,
                onStartConversation = onStartConversation,
                onOpenConversation = onOpenConversation,
            )
            ProjectDetailSection.Files -> ProjectFilesContent(
                project = project,
                knowledgeBases = knowledgeBases,
                knowledgeBasesLoaded = knowledgeBasesLoaded,
                knowledgeBasesLoading = knowledgeBasesLoading,
                loading = loading,
                uploadProgress = uploadProgress,
                onToggleKnowledgeBase = onToggleKnowledgeBase,
                onUpload = onUpload,
                onDeleteFile = { deleteFileTarget = it },
            )
            ProjectDetailSection.Settings -> ProjectSettingsContent(
                project = project,
                models = models,
                loading = loading,
                onSaveModel = onSaveModel,
                onSaveInstructions = onSaveInstructions,
                onDelete = onDelete,
            )
        }
    }
    deleteFileTarget?.let { file ->
        DeleteDialog(
            title = "删除文件",
            body = "确定删除文件「${file.name}」？删除后无法撤销。",
            onDismiss = { deleteFileTarget = null },
            onConfirm = {
                onDeleteFile(file)
                deleteFileTarget = null
            },
        )
    }
}

@Composable
private fun ProjectDetailHeader(
    project: Project,
    onBack: () -> Unit,
    onEdit: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .windowInsetsPadding(WindowInsets.statusBars)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        TextButton(onClick = onBack, contentPadding = PaddingValues(0.dp)) {
            Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = null)
            Text("全部项目")
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Surface(
                modifier = Modifier.size(48.dp),
                shape = RoundedCornerShape(12.dp),
                color = project.color.asComposeColor(),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        project.name.take(1),
                        color = Color.White,
                        style = MaterialTheme.typography.titleMedium,
                    )
                }
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    project.name,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.titleLarge,
                )
                project.description?.takeIf(String::isNotBlank)?.let { description ->
                    Text(
                        description,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Row(
                    modifier = Modifier.padding(top = 5.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    ProjectCountBadge("${project.files.size} 个项目文件")
                    ProjectCountBadge("${project.knowledgeBaseIds.size} 个关联知识库")
                }
            }
        }
        OutlinedButton(onClick = onEdit) {
            Icon(Icons.Rounded.Edit, contentDescription = null, modifier = Modifier.size(16.dp))
            Text("编辑")
        }
    }
}

@Composable
private fun ProjectCountBadge(label: String) {
    Surface(
        shape = RoundedCornerShape(50),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        color = MaterialTheme.colorScheme.surface,
    ) {
        Text(
            label,
            modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun ProjectDetailTabs(
    selected: ProjectDetailSection,
    onSelect: (ProjectDetailSection) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .background(
                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.65f),
                RoundedCornerShape(10.dp),
            )
            .padding(3.dp),
    ) {
        ProjectDetailSection.entries.forEach { section ->
            Surface(
                modifier = Modifier
                    .weight(1f)
                    .clickable { onSelect(section) },
                shape = RoundedCornerShape(8.dp),
                color = if (selected == section) {
                    MaterialTheme.colorScheme.surface
                } else {
                    Color.Transparent
                },
                shadowElevation = if (selected == section) 1.dp else 0.dp,
            ) {
                Text(
                    section.label,
                    modifier = Modifier.padding(vertical = 8.dp),
                    textAlign = TextAlign.Center,
                    style = MaterialTheme.typography.labelLarge,
                    color = if (selected == section) {
                        MaterialTheme.colorScheme.onSurface
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }
        }
    }
}

@Composable
private fun ProjectConversationsContent(
    conversations: List<Conversation>,
    loading: Boolean,
    onStartConversation: () -> Unit,
    onOpenConversation: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("全部对话", style = MaterialTheme.typography.labelLarge)
                    Text(
                        "${conversations.size} 个",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Button(onClick = onStartConversation) {
                    Icon(Icons.Rounded.Add, contentDescription = null)
                    Text("新对话")
                }
            }
        }
        when {
            loading && conversations.isEmpty() -> item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(40.dp),
                    contentAlignment = Alignment.Center,
                ) { CircularProgressIndicator(strokeWidth = 2.dp) }
            }
            conversations.isEmpty() -> item {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                ) {
                    Column(
                        modifier = Modifier.padding(22.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text("项目里还没有会话", style = MaterialTheme.typography.titleSmall)
                        Text(
                            "从这个项目发起的会话会自动携带项目文件、关联知识库与指令。",
                            modifier = Modifier.padding(top = 5.dp),
                            textAlign = TextAlign.Center,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            else -> item {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    color = MaterialTheme.colorScheme.surface,
                ) {
                    Column {
                        conversations.forEachIndexed { index, conversation ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { onOpenConversation(conversation.id) }
                                    .padding(horizontal = 14.dp, vertical = 13.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Text(
                                    conversation.title,
                                    modifier = Modifier.weight(1f),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Medium,
                                )
                                Text(
                                    formatProjectRelativeTime(conversation.updatedAt),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            if (index != conversations.lastIndex) HorizontalDivider()
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ProjectFilesContent(
    project: Project,
    knowledgeBases: List<KnowledgeBase>,
    knowledgeBasesLoaded: Boolean,
    knowledgeBasesLoading: Boolean,
    loading: Boolean,
    uploadProgress: ProjectUploadProgress?,
    onToggleKnowledgeBase: (String, Boolean) -> Unit,
    onUpload: () -> Unit,
    onDeleteFile: (ProjectFile) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        item {
            ProjectDetailSectionCard(
                title = "关联知识库",
                supportingText = "已关联 ${project.knowledgeBaseIds.size} 个",
            ) {
                when {
                    knowledgeBasesLoading && knowledgeBases.isEmpty() -> Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                        Text("正在加载知识库…", style = MaterialTheme.typography.bodySmall)
                    }
                    knowledgeBasesLoaded && knowledgeBases.isEmpty() -> Text(
                        "暂无可关联知识库。长期复用的资料可以先放进知识库，再挂载到项目。",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    else -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        knowledgeBases.forEach { knowledgeBase ->
                            val checked = knowledgeBase.id in project.knowledgeBaseIds
                            Surface(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable(enabled = !loading) {
                                        onToggleKnowledgeBase(knowledgeBase.id, !checked)
                                    },
                                shape = RoundedCornerShape(10.dp),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                                color = MaterialTheme.colorScheme.background,
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Checkbox(checked = checked, onCheckedChange = null, enabled = !loading)
                                    Icon(
                                        Icons.Rounded.Storage,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(17.dp),
                                    )
                                    Column(
                                        modifier = Modifier
                                            .weight(1f)
                                            .padding(start = 8.dp),
                                    ) {
                                        Text(knowledgeBase.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        Text(
                                            "${knowledgeBase.documentCount} 个文档 · ${knowledgeBase.totalChunks} 个片段",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                    if (checked) ProjectCountBadge("已挂载")
                                }
                            }
                        }
                    }
                }
            }
        }
        item {
            ProjectDetailSectionCard(
                title = "项目文件",
                supportingText = "${project.files.size} 个文件",
                action = {
                    OutlinedButton(onClick = onUpload, enabled = uploadProgress == null && !loading) {
                        Icon(Icons.Rounded.UploadFile, contentDescription = null, modifier = Modifier.size(16.dp))
                        Text(if (uploadProgress == null) "上传" else "上传中")
                    }
                },
            ) {
                uploadProgress?.let { progress ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                        Text(
                            "正在上传 ${progress.completed + 1}/${progress.total} · ${progress.currentName}",
                            modifier = Modifier.weight(1f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.labelSmall,
                        )
                    }
                }
                if (project.files.isEmpty()) {
                    Text(
                        "上传的文件会作为项目内所有会话的共享上下文。",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        project.files.forEach { file ->
                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp),
                                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                                color = MaterialTheme.colorScheme.background,
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                                ) {
                                    Icon(
                                        Icons.Rounded.Description,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(18.dp),
                                    )
                                    Column(Modifier.weight(1f)) {
                                        Text(file.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        Text(
                                            buildString {
                                                append(formatBytes(file.size))
                                                when (file.clientMutationState) {
                                                    "pending" -> append(" · 上传中…")
                                                    "failed" -> append(" · 上传失败")
                                                }
                                            },
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                    IconButton(onClick = { onDeleteFile(file) }, enabled = !loading) {
                                        Icon(Icons.Rounded.Delete, contentDescription = "删除文件「${file.name}」")
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ProjectDetailSectionCard(
    title: String,
    supportingText: String,
    action: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        color = MaterialTheme.colorScheme.surface,
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(title, style = MaterialTheme.typography.labelLarge)
                    Text(
                        supportingText,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                action?.invoke()
            }
            content()
        }
    }
}

@Composable
private fun ProjectSettingsContent(
    project: Project,
    models: List<Model>,
    loading: Boolean,
    onSaveModel: (String?) -> Unit,
    onSaveInstructions: (String) -> Unit,
    onDelete: () -> Unit,
) {
    var modelMenuOpen by remember { mutableStateOf(false) }
    var editingInstructions by remember { mutableStateOf(false) }
    var instructionDraft by remember(project.id) { mutableStateOf(project.instructions.orEmpty()) }
    LaunchedEffect(project.id, project.instructions, editingInstructions) {
        if (!editingInstructions) instructionDraft = project.instructions.orEmpty()
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        item {
            ProjectDetailSectionCard(title = "默认模型", supportingText = "") {
                Box {
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(enabled = !loading) { modelMenuOpen = true },
                        shape = RoundedCornerShape(10.dp),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                        color = MaterialTheme.colorScheme.background,
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 11.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                models.firstOrNull { it.id == project.modelId }?.displayName
                                    ?: "跟随全局默认",
                                modifier = Modifier.weight(1f),
                            )
                            Icon(Icons.Rounded.ChevronRight, contentDescription = "选择默认模型")
                        }
                    }
                    DropdownMenu(
                        expanded = modelMenuOpen,
                        onDismissRequest = { modelMenuOpen = false },
                    ) {
                        DropdownMenuItem(
                            text = { Text("跟随全局默认") },
                            onClick = {
                                modelMenuOpen = false
                                onSaveModel(null)
                            },
                        )
                        models.filterNot { "image-generation" in it.capabilities }.forEach { model ->
                            DropdownMenuItem(
                                text = { Text(model.displayName) },
                                onClick = {
                                    modelMenuOpen = false
                                    onSaveModel(model.id)
                                },
                            )
                        }
                    }
                }
            }
        }
        item {
            ProjectDetailSectionCard(
                title = "项目指令",
                supportingText = "",
                action = if (!editingInstructions) {
                    {
                        TextButton(onClick = { editingInstructions = true }) {
                            Icon(Icons.Rounded.Edit, contentDescription = null, modifier = Modifier.size(15.dp))
                            Text("编辑")
                        }
                    }
                } else {
                    null
                },
            ) {
                if (editingInstructions) {
                    OutlinedTextField(
                        value = instructionDraft,
                        onValueChange = { instructionDraft = it },
                        minLines = 5,
                        maxLines = 8,
                        placeholder = { Text("这个项目里的所有会话都会遵循这里的指令…") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End,
                    ) {
                        TextButton(onClick = { editingInstructions = false }) { Text("取消") }
                        Button(
                            onClick = {
                                onSaveInstructions(instructionDraft)
                                editingInstructions = false
                            },
                            enabled = !loading,
                        ) { Text("保存") }
                    }
                } else {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                        color = MaterialTheme.colorScheme.background,
                    ) {
                        Text(
                            project.instructions?.takeIf(String::isNotBlank)
                                ?: "尚未设置。项目指令会注入到项目内每个会话的系统提示词。",
                            modifier = Modifier.padding(12.dp),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
        item {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.25f)),
                color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.22f),
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        "删除项目",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.error,
                    )
                    Text(
                        "删除后会移除项目资料与设置，项目里的会话不会被删除。",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Button(
                        onClick = onDelete,
                        enabled = !loading,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Rounded.Delete, contentDescription = null)
                        Text("删除项目")
                    }
                }
            }
        }
    }
}

@Composable
private fun ProjectCreateDialog(
    onDismiss: () -> Unit,
    onSave: (String, String) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("新建项目") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("项目名称") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("项目描述（可选）") },
                    maxLines = 3,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(name.trim(), description.trim()) },
                enabled = name.isNotBlank(),
            ) { Text("创建") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

@Composable
private fun ProjectMetaEditorDialog(
    project: Project,
    onDismiss: () -> Unit,
    onSave: (String, String, String) -> Unit,
) {
    var name by remember(project.id) { mutableStateOf(project.name) }
    var description by remember(project.id) { mutableStateOf(project.description.orEmpty()) }
    var color by remember(project.id) { mutableStateOf(project.color ?: PROJECT_COLORS.first()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("编辑项目信息") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("项目名称") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("描述（可选）") },
                    maxLines = 3,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text("项目颜色", style = MaterialTheme.typography.labelLarge)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PROJECT_COLORS.forEach { value ->
                        Surface(
                            modifier = Modifier
                                .size(if (color == value) 34.dp else 30.dp)
                                .clickable { color = value },
                            shape = RoundedCornerShape(8.dp),
                            color = value.asComposeColor(),
                            border = if (color == value) {
                                BorderStroke(2.dp, MaterialTheme.colorScheme.onSurface)
                            } else {
                                null
                            },
                            content = {},
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(name.trim(), description.trim(), color) },
                enabled = name.isNotBlank(),
            ) { Text("保存") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KnowledgeScreen(
    knowledgeBases: List<KnowledgeBase>,
    selectedId: String?,
    documents: Map<String, List<KnowledgeDocument>>,
    loading: Boolean,
    uploadProgress: KnowledgeUploadProgress?,
    onSelect: (String?) -> Unit,
    onSave: (KnowledgeBase?, String, String) -> Unit,
    onDelete: (KnowledgeBase) -> Unit,
    onUploadDocuments: (String, List<Uri>) -> Unit,
    onDeleteDocument: (String, KnowledgeDocument) -> Unit,
    onOpenMenu: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val selected = knowledgeBases.firstOrNull { it.id == selectedId }
    var editor by remember { mutableStateOf<KnowledgeBase?>(null) }
    var creating by remember { mutableStateOf(false) }
    var deleteTarget by remember { mutableStateOf<KnowledgeBase?>(null) }
    var deleteDocumentTarget by remember { mutableStateOf<KnowledgeDocument?>(null) }
    val documentPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments(),
    ) { uris ->
        val knowledgeBase = selected ?: return@rememberLauncherForActivityResult
        if (uris.isNotEmpty()) onUploadDocuments(knowledgeBase.id, uris)
    }

    Scaffold(
        modifier = modifier,
        contentWindowInsets = WindowInsets(0),
        topBar = {
            WebPageHeader(
                title = "知识库",
                description = "长期资料库，可被聊天、项目和技能挂载检索",
                onOpenMenu = onOpenMenu,
                action = {
                    WebHeaderAction(
                        label = "新建知识库",
                        icon = Icons.Rounded.Add,
                        onClick = { creating = true },
                    )
                },
            )
        },
    ) { padding ->
        if (loading && knowledgeBases.isEmpty()) {
            LoadingContent(Modifier.padding(padding))
        } else if (knowledgeBases.isEmpty()) {
            WebEmptyState(
                icon = Icons.AutoMirrored.Outlined.MenuBook,
                title = "还没有知识库",
                description = "支持 PDF / Word / PPT / Excel / CSV / 文本 / 代码 / 图片，之后可在项目或聊天中作为资料源检索。",
                actionLabel = "创建第一个知识库",
                onAction = { creating = true },
                modifier = Modifier
                    .padding(padding)
                    .padding(horizontal = 16.dp),
            )
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            ) {
                LazyRow(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp),
                    contentPadding = PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(knowledgeBases, key = KnowledgeBase::id) { knowledgeBase ->
                        KnowledgeBaseCard(
                            knowledgeBase = knowledgeBase,
                            selected = knowledgeBase.id == selectedId,
                            onSelect = { onSelect(knowledgeBase.id) },
                            onEdit = { editor = knowledgeBase },
                            onDelete = { deleteTarget = knowledgeBase },
                            modifier = Modifier.animateItem(),
                        )
                    }
                }
                AnimatedContent(
                    targetState = selected?.id,
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    transitionSpec = {
                        (fadeIn(tween(180)) + slideInHorizontally(tween(180)) { it / 12 }) togetherWith
                            (fadeOut(tween(140)) + slideOutHorizontally(tween(140)) { -it / 16 })
                    },
                    label = "knowledge-detail",
                ) { selectedKnowledgeBaseId ->
                    val active = knowledgeBases.firstOrNull { it.id == selectedKnowledgeBaseId }
                    if (active == null) {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.TopCenter,
                        ) {
                            WebEmptyState(
                                icon = Icons.AutoMirrored.Outlined.MenuBook,
                                title = "选择一个知识库",
                                description = "点击上方知识库查看和管理文档。",
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 20.dp),
                            )
                        }
                    } else {
                        KnowledgeDetail(
                            knowledgeBase = active,
                            documents = documents[active.id].orEmpty(),
                            loading = loading,
                            uploadProgress = uploadProgress,
                            onUploadDocuments = {
                                documentPicker.launch(arrayOf("*/*"))
                            },
                            onDeleteDocument = { deleteDocumentTarget = it },
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                }
            }
        }
    }

    if (creating || editor != null) {
        KnowledgeEditorDialog(
            knowledgeBase = editor,
            onDismiss = { creating = false; editor = null },
            onSave = { name, description ->
                onSave(editor, name, description)
                creating = false
                editor = null
            },
        )
    }
    deleteTarget?.let { knowledgeBase ->
        KnowledgeDeleteDialog(
            title = "删除知识库",
            body = "将删除知识库「${knowledgeBase.name}」及其全部文档，此操作不可撤销。",
            onDismiss = { deleteTarget = null },
            onConfirm = { onDelete(knowledgeBase); deleteTarget = null },
        )
    }
    deleteDocumentTarget?.let { document ->
        KnowledgeDeleteDialog(
            title = "删除文档",
            body = "将删除文档「${document.name}」，此操作不可撤销。",
            onDismiss = { deleteDocumentTarget = null },
            onConfirm = {
                onDeleteDocument(document.knowledgeBaseId, document)
                deleteDocumentTarget = null
            },
        )
    }
}

@Composable
private fun KnowledgeBaseCard(
    knowledgeBase: KnowledgeBase,
    selected: Boolean,
    onSelect: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var menuExpanded by remember(knowledgeBase.id) { mutableStateOf(false) }
    val borderColor by animateColorAsState(
        targetValue = if (selected) {
            MaterialTheme.colorScheme.primary.copy(alpha = 0.7f)
        } else {
            MaterialTheme.colorScheme.outlineVariant
        },
        label = "knowledge-card-border",
    )
    Surface(
        modifier = modifier
            .width(256.dp)
            .heightIn(min = 120.dp)
            .semantics {
                contentDescription = "选择知识库「${knowledgeBase.name}」"
                this.selected = selected
            }
            .clickable(role = Role.Button, onClick = onSelect),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(if (selected) 1.5.dp else 1.dp, borderColor),
        shadowElevation = if (selected) 2.dp else 1.dp,
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top,
            ) {
                Icon(
                    Icons.AutoMirrored.Outlined.MenuBook,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp),
                    tint = MaterialTheme.colorScheme.primary,
                )
                Spacer(Modifier.weight(1f))
                Box {
                    IconButton(
                        onClick = { menuExpanded = true },
                        modifier = Modifier.size(32.dp),
                    ) {
                        Icon(
                            Icons.Rounded.MoreVert,
                            contentDescription = "管理知识库「${knowledgeBase.name}」",
                            modifier = Modifier.size(17.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    DropdownMenu(
                        expanded = menuExpanded,
                        onDismissRequest = { menuExpanded = false },
                    ) {
                        DropdownMenuItem(
                            text = { Text("编辑") },
                            leadingIcon = { Icon(Icons.Rounded.Edit, contentDescription = null) },
                            onClick = {
                                menuExpanded = false
                                onEdit()
                            },
                        )
                        DropdownMenuItem(
                            text = { Text("删除") },
                            leadingIcon = { Icon(Icons.Rounded.Delete, contentDescription = null) },
                            onClick = {
                                menuExpanded = false
                                onDelete()
                            },
                        )
                    }
                }
            }
            Text(
                knowledgeBase.name + if (
                    knowledgeBase.clientMutationState == "pending"
                ) " · 创建中…" else "",
                modifier = Modifier.padding(top = 4.dp),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            knowledgeBase.description?.takeIf(String::isNotBlank)?.let { description ->
                Text(
                    description,
                    modifier = Modifier.padding(top = 2.dp),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                "${knowledgeBase.documentCount} 个文档 · ${knowledgeBase.totalChunks} 个片段",
                modifier = Modifier.padding(top = 8.dp),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun KnowledgeDetail(
    knowledgeBase: KnowledgeBase,
    documents: List<KnowledgeDocument>,
    loading: Boolean,
    uploadProgress: KnowledgeUploadProgress?,
    onUploadDocuments: () -> Unit,
    onDeleteDocument: (KnowledgeDocument) -> Unit,
    modifier: Modifier,
) {
    if (loading && documents.isEmpty() && uploadProgress == null) {
        LoadingContent(modifier)
        return
    }
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                color = MaterialTheme.colorScheme.surface,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                shadowElevation = 1.dp,
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            knowledgeBase.name,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Medium,
                        )
                        Text(
                            KNOWLEDGE_FILE_TYPES,
                            modifier = Modifier.padding(top = 2.dp),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    WebHeaderAction(
                        label = if (uploadProgress == null) "上传文档" else "上传中",
                        icon = Icons.Rounded.UploadFile,
                        enabled = uploadProgress == null,
                        onClick = onUploadDocuments,
                    )
                }
            }
        }
        uploadProgress?.let { progress ->
            item(key = "upload-progress") {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    shadowElevation = 1.dp,
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 14.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                        Column(Modifier.weight(1f)) {
                            Text("正在上传 ${progress.completed + 1}/${progress.total}")
                            Text(
                                progress.currentName,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
        if (documents.isEmpty()) {
            item {
                WebEmptyState(
                    icon = Icons.Rounded.UploadFile,
                    title = "还没有文档",
                    description = "点击上传文档，解析完成后即可在聊天和项目中检索。",
                    actionLabel = "上传文档",
                    onAction = onUploadDocuments,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
        itemsIndexed(documents, key = { _, document -> document.id }) { index, document ->
            KnowledgeDocumentRow(
                document = document,
                index = index,
                onDelete = { onDeleteDocument(document) },
                modifier = Modifier.animateItem(),
            )
        }
    }
}

@Composable
private fun KnowledgeDocumentRow(
    document: KnowledgeDocument,
    index: Int,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val presentation = knowledgeDocumentPresentation(document)
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shadowElevation = 1.dp,
    ) {
        Row(
            modifier = Modifier.padding(start = 14.dp, top = 12.dp, bottom = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Rounded.Description,
                contentDescription = null,
                modifier = Modifier.size(20.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
            Column(Modifier.weight(1f)) {
                Text(
                    document.name,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    presentation.metadata,
                    modifier = Modifier.padding(top = 2.dp),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            KnowledgeStatusBadge(presentation)
            IconButton(onClick = onDelete) {
                Icon(
                    Icons.Rounded.Delete,
                    contentDescription = "删除第 ${index + 1} 个文档「${document.name}」",
                    modifier = Modifier.size(18.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun KnowledgeStatusBadge(presentation: KnowledgeDocumentPresentation) {
    val foreground = when (presentation.tone) {
        KnowledgeDocumentTone.Success -> Color(0xFF2F9E6E)
        KnowledgeDocumentTone.Warning -> Color(0xFFD97706)
        KnowledgeDocumentTone.Error -> MaterialTheme.colorScheme.error
    }
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = foreground.copy(alpha = 0.1f),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (presentation.tone == KnowledgeDocumentTone.Warning) {
                CircularProgressIndicator(
                    modifier = Modifier.size(11.dp),
                    strokeWidth = 1.5.dp,
                    color = foreground,
                )
            }
            Text(
                presentation.statusLabel,
                style = MaterialTheme.typography.labelSmall,
                color = foreground,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun KnowledgeEditorDialog(
    knowledgeBase: KnowledgeBase?,
    onDismiss: () -> Unit,
    onSave: (String, String) -> Unit,
) {
    var name by remember(knowledgeBase?.id) { mutableStateOf(knowledgeBase?.name.orEmpty()) }
    var description by remember(knowledgeBase?.id) {
        mutableStateOf(knowledgeBase?.description.orEmpty())
    }
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
            shadowElevation = 8.dp,
        ) {
            Column(Modifier.padding(24.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        if (knowledgeBase == null) "新建知识库" else "编辑知识库",
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    IconButton(
                        onClick = onDismiss,
                        modifier = Modifier.size(32.dp),
                    ) {
                        Icon(
                            Icons.Rounded.Close,
                            contentDescription = "关闭",
                            modifier = Modifier.size(17.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    placeholder = { Text("知识库名称") },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 16.dp),
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    placeholder = { Text("描述（可选）") },
                    minLines = 2,
                    maxLines = 3,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 10.dp),
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 16.dp),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(onClick = onDismiss) { Text("取消") }
                    Button(
                        onClick = { onSave(name.trim(), description.trim()) },
                        enabled = name.isNotBlank(),
                        modifier = Modifier.padding(start = 8.dp),
                    ) {
                        Text(if (knowledgeBase == null) "创建" else "保存")
                    }
                }
            }
        }
    }
}

@Composable
private fun KnowledgeDeleteDialog(
    title: String,
    body: String,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
            shadowElevation = 8.dp,
        ) {
            Column(Modifier.padding(24.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        title,
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    IconButton(
                        onClick = onDismiss,
                        modifier = Modifier.size(32.dp),
                    ) {
                        Icon(
                            Icons.Rounded.Close,
                            contentDescription = "关闭",
                            modifier = Modifier.size(17.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Text(
                    body,
                    modifier = Modifier.padding(top = 12.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 18.dp),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OutlinedButton(onClick = onDismiss) { Text("取消") }
                    Button(
                        onClick = onConfirm,
                        modifier = Modifier.padding(start = 8.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.error,
                            contentColor = MaterialTheme.colorScheme.onError,
                        ),
                    ) {
                        Icon(
                            Icons.Rounded.Delete,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                        )
                        Text("删除", modifier = Modifier.padding(start = 6.dp))
                    }
                }
            }
        }
    }
}

private const val KNOWLEDGE_FILE_TYPES =
    "支持 PDF / Word / PPT / Excel / CSV / 文本 / 代码 / 图片"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FilesScreen(
    assets: List<MediaAsset>,
    kind: String,
    query: String,
    hasMore: Boolean,
    loading: Boolean,
    preview: MediaPreviewUiState?,
    downloadingIds: Set<String>,
    editingIds: Set<String>,
    onKindChange: (String) -> Unit,
    onQueryChange: (String) -> Unit,
    onLoadMore: () -> Unit,
    onOpenPreview: (MediaAsset) -> Unit,
    onClosePreview: () -> Unit,
    onDownload: (MediaAsset, Uri) -> Unit,
    onEditImage: (MediaAsset, String, ByteArray?) -> Unit,
    onOpenConversation: (String) -> Unit,
    onOpenExternalLink: (String) -> Unit,
    onDelete: (MediaAsset) -> Unit,
    onOpenMenu: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var deleteTarget by remember { mutableStateOf<MediaAsset?>(null) }
    Scaffold(
        modifier = modifier,
        contentWindowInsets = WindowInsets(0),
        topBar = {
            WebPageHeader(
                title = "文件",
                description = "查看上传与生成的图片、文档等媒体资产",
                onOpenMenu = onOpenMenu,
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            WebFilterRow(
                labels = MEDIA_FILTERS.map { it.second },
                selectedIndex = MEDIA_FILTERS.indexOfFirst { it.first == kind }.coerceAtLeast(0),
                onSelect = { index -> onKindChange(MEDIA_FILTERS[index].first) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 2.dp),
            )
            if (loading && assets.isEmpty()) {
                LoadingContent(Modifier.weight(1f))
            } else if (assets.isEmpty()) {
                WebEmptyState(
                    icon = Icons.Outlined.DescriptionOutlined,
                    title = "还没有文件",
                    description = "上传附件或让模型生成图片后，会显示在这里。",
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 22.dp),
                )
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(148.dp),
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    gridItems(assets, key = MediaAsset::id, contentType = { it.kind }) { asset ->
                        MediaAssetTile(
                            asset = asset,
                            onOpen = { onOpenPreview(asset) },
                            onDelete = { deleteTarget = asset },
                            modifier = Modifier.animateItem(),
                        )
                    }
                    if (hasMore) {
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            Button(
                                onClick = onLoadMore,
                                enabled = !loading,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 8.dp),
                            ) {
                                if (loading) {
                                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                                } else {
                                    Text("加载更多")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    preview?.let { state ->
        val asset = state.asset
        val openConversation = asset.conversationId?.let { conversationId ->
            {
                onClosePreview()
                onOpenConversation(conversationId)
            }
        }
        if (asset.mimeType.startsWith("image/")) {
            ImageLightboxDialog(
                url = asset.url,
                alt = asset.name,
                editing = asset.id in editingIds,
                onDismiss = onClosePreview,
                onDownload = { destination, _ -> onDownload(asset, destination) },
                onEdit = { prompt, mask ->
                    onEditImage(asset, prompt, mask)
                },
                onOpenConversation = openConversation,
            )
        } else {
            MediaPreviewDialog(
                state = state,
                downloading = asset.id in downloadingIds,
                onDismiss = onClosePreview,
                onDownload = { destination -> onDownload(asset, destination) },
                onOpenConversation = openConversation,
                onOpenLink = onOpenExternalLink,
            )
        }
    }
    deleteTarget?.let { asset ->
        DeleteDialog(
            title = "删除文件",
            body = "将永久删除「${asset.name}」。",
            onDismiss = { deleteTarget = null },
            onConfirm = { onDelete(asset); deleteTarget = null },
        )
    }
}

@Composable
private fun MediaAssetTile(
    asset: MediaAsset,
    onOpen: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen),
        shape = RoundedCornerShape(8.dp),
        tonalElevation = 1.dp,
    ) {
        Column {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1.35f)
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center,
            ) {
                if (asset.mimeType.startsWith("image/")) {
                    AsyncImage(
                        model = ImageRequest.Builder(context)
                            .data(workspaceMediaUrl(asset.url))
                            .crossfade(true)
                            .build(),
                        contentDescription = asset.name,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop,
                    )
                } else {
                    Icon(
                        Icons.Rounded.Description,
                        contentDescription = null,
                        modifier = Modifier.size(34.dp),
                        tint = MaterialTheme.colorScheme.primary,
                    )
                }
            }
            Row(
                modifier = Modifier.padding(start = 10.dp, top = 7.dp, bottom = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(asset.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        mediaKindLabel(asset.kind),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                IconButton(onClick = onDelete, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.Rounded.Delete, contentDescription = "删除文件", modifier = Modifier.size(18.dp))
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountScreen(
    state: LinHubUiState,
    onOpenSkills: () -> Unit,
    onOpenBilling: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenAdmin: () -> Unit,
    onSignOut: () -> Unit,
    onOpenMenu: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val locale = LocalLocale.current.platformLocale
    val context = LocalContext.current
    Scaffold(
        modifier = modifier,
        contentWindowInsets = WindowInsets(0),
        topBar = {
            TopAppBar(
                title = { Text("账户") },
                navigationIcon = {
                    IconButton(onClick = onOpenMenu) {
                        Icon(Icons.Rounded.Menu, contentDescription = "打开侧栏")
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(16.dp),
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.primaryContainer,
                    ) {
                        Box(Modifier.size(54.dp), contentAlignment = Alignment.Center) {
                            val user = state.user
                            if (user?.avatarUrl.isNullOrBlank()) {
                                Text(user?.name.orEmpty().take(1), style = MaterialTheme.typography.titleLarge)
                            } else {
                                AsyncImage(
                                    model = ImageRequest.Builder(context)
                                        .data(workspaceMediaUrl(checkNotNull(user?.avatarUrl)))
                                        .crossfade(true)
                                        .build(),
                                    contentDescription = "${user.name}的头像",
                                    modifier = Modifier.fillMaxSize(),
                                    contentScale = ContentScale.Crop,
                                )
                            }
                        }
                    }
                    Column(Modifier.padding(start = 12.dp)) {
                        Text(state.user?.name.orEmpty(), style = MaterialTheme.typography.headlineSmall)
                        Text(
                            state.user?.email.orEmpty(),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 22.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column {
                        Text("余额", style = MaterialTheme.typography.labelLarge)
                        Text(
                            "¥${String.format(locale, "%.2f", (state.user?.balance ?: 0) / 100.0)}",
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text("套餐", style = MaterialTheme.typography.labelLarge)
                        Text(
                            state.user?.subscription?.planName ?: "免费版",
                            style = MaterialTheme.typography.titleMedium,
                        )
                    }
                }
            }
            item { HorizontalDivider() }
            if (state.user?.role == "admin") {
                item {
                    ListItem(
                        headlineContent = { Text("管理后台") },
                        supportingContent = { Text("供应商、模型、用户、套餐与全局引擎") },
                        leadingContent = {
                            Icon(Icons.Rounded.AdminPanelSettings, contentDescription = null)
                        },
                        trailingContent = {
                            Icon(Icons.Rounded.ChevronRight, contentDescription = null)
                        },
                        modifier = Modifier.clickable(onClick = onOpenAdmin),
                    )
                }
                item { HorizontalDivider() }
            }
            item {
                ListItem(
                    headlineContent = { Text("技能") },
                    supportingContent = { Text("我的技能与技能广场") },
                    leadingContent = {
                        Icon(Icons.Rounded.AutoAwesome, contentDescription = null)
                    },
                    trailingContent = {
                        Icon(Icons.Rounded.ChevronRight, contentDescription = null)
                    },
                    modifier = Modifier.clickable(onClick = onOpenSkills),
                )
            }
            item { HorizontalDivider() }
            item {
                ListItem(
                    headlineContent = { Text("设置") },
                    supportingContent = { Text("账户、记忆、回复风格与连接器") },
                    leadingContent = {
                        Icon(Icons.Rounded.Settings, contentDescription = null)
                    },
                    trailingContent = {
                        Icon(Icons.Rounded.ChevronRight, contentDescription = null)
                    },
                    modifier = Modifier.clickable(onClick = onOpenSettings),
                )
            }
            item { HorizontalDivider() }
            item {
                ListItem(
                    headlineContent = { Text("用量与订阅") },
                    supportingContent = { Text("余额、套餐、消费明细") },
                    leadingContent = {
                        Icon(Icons.AutoMirrored.Rounded.ReceiptLong, contentDescription = null)
                    },
                    trailingContent = {
                        Icon(Icons.Rounded.ChevronRight, contentDescription = null)
                    },
                    modifier = Modifier.clickable(onClick = onOpenBilling),
                )
            }
            item { HorizontalDivider() }
            item {
                TextButton(
                    onClick = onSignOut,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 14.dp),
                ) {
                    Icon(Icons.AutoMirrored.Rounded.Logout, contentDescription = null)
                    Spacer(Modifier.size(8.dp))
                    Text("退出登录")
                }
            }
        }
    }
}

@Composable
private fun LoadingContent(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(strokeWidth = 2.dp)
    }
}

@Composable
private fun EmptyDomainContent(
    title: String,
    action: String,
    onAction: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(title, style = MaterialTheme.typography.titleLarge)
        Button(onClick = onAction, modifier = Modifier.padding(top = 16.dp)) { Text(action) }
    }
}

@Composable
private fun DeleteDialog(
    title: String,
    body: String,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(body) },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text("删除", color = MaterialTheme.colorScheme.error)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

private fun String?.asComposeColor(): Color = runCatching {
    Color((this ?: PROJECT_COLORS.first()).toColorInt())
}.getOrDefault(Color(0xFF4F6BED))

private val PROJECT_COLORS = listOf(
    "#4F6BED",
    "#23856D",
    "#B06A00",
    "#B7475A",
    "#7657B5",
)

internal data class PickedFile(val name: String, val mimeType: String, val bytes: ByteArray)

internal fun readPickedFile(context: Context, uri: Uri, maxBytes: Int): PickedFile {
    var name = uri.lastPathSegment ?: "文件"
    var declaredSize = -1L
    context.contentResolver.query(
        uri,
        arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE),
        null,
        null,
        null,
    )?.use { cursor ->
        if (cursor.moveToFirst()) {
            cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME).takeIf { it >= 0 }?.let { index ->
                name = cursor.getString(index) ?: name
            }
            cursor.getColumnIndex(OpenableColumns.SIZE).takeIf { it >= 0 }?.let { index ->
                if (!cursor.isNull(index)) declaredSize = cursor.getLong(index)
            }
        }
    }
    require(declaredSize <= maxBytes || declaredSize < 0) {
        "文件不能超过 ${maxBytes / 1024 / 1024}MB"
    }
    val bytes = context.contentResolver.openInputStream(uri)?.use { input ->
        val output = ByteArrayOutputStream(minOf(declaredSize.coerceAtLeast(0L), maxBytes.toLong()).toInt())
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        var total = 0
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            total += count
            require(total <= maxBytes) { "文件不能超过 ${maxBytes / 1024 / 1024}MB" }
            output.write(buffer, 0, count)
        }
        output.toByteArray()
    } ?: error("无法读取文件")
    return PickedFile(
        name = name,
        mimeType = context.contentResolver.getType(uri) ?: "application/octet-stream",
        bytes = bytes,
    )
}

private val MEDIA_FILTERS = listOf(
    "all" to "全部",
    "upload" to "上传",
    "generated" to "生成",
)

private fun mediaKindLabel(kind: String): String = when (kind) {
    "upload" -> "上传"
    "generated" -> "生成"
    "edited" -> "编辑"
    else -> kind
}

private fun workspaceMediaUrl(url: String): String = when {
    url.startsWith("/") -> BuildConfig.API_BASE_URL.trimEnd('/') + url
    else -> url
}

private fun formatBytes(size: Long): String = when {
    size >= 1024L * 1024L -> formatTenths(size * 10 / (1024L * 1024L), "MB")
    size >= 1024L -> formatTenths(size * 10 / 1024L, "KB")
    else -> "$size B"
}

private fun formatTenths(value: Long, unit: String): String = "${value / 10}.${value % 10} $unit"

private fun formatProjectRelativeTime(timestamp: String): String = runCatching {
    val elapsed = Duration.between(Instant.parse(timestamp), Instant.now()).seconds.coerceAtLeast(0L)
    when {
        elapsed < 60L -> "刚刚"
        elapsed < 3_600L -> "${elapsed / 60L} 分钟前"
        elapsed < 86_400L -> "${elapsed / 3_600L} 小时前"
        elapsed < 604_800L -> "${elapsed / 86_400L} 天前"
        else -> "${elapsed / 604_800L} 周前"
    }
}.getOrDefault("")
