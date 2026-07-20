package com.linhub.android.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.Lifecycle

@Composable
fun LinHubApp(viewModel: LinHubViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val workspaceShell = remember(
        state.destination,
        state.drawerOpenRequest,
        state.user,
        state.conversations,
        state.projects,
        state.selectedConversationId,
        state.pinnedProjectIds,
        state.collapsedProjectIds,
        state.failedConversationRenames,
        state.conversationSearch,
        state.searchResults,
        state.themeMode,
        state.fontSizePreset,
    ) {
        workspaceShellState(state)
    }
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current
    val openExternalLink: (String) -> Unit = { url ->
        when (launchExternalLink(context, url)) {
            ExternalLinkLaunchResult.Opened -> Unit
            ExternalLinkLaunchResult.CopiedFallback ->
                viewModel.showComposerError("无法打开链接，地址已复制")
            ExternalLinkLaunchResult.Rejected ->
                viewModel.showComposerError("链接格式不受支持")
        }
    }
    MediaThumbnailPrefetch(
        assets = state.mediaAssets,
        enabled = state.phase == AppPhase.Chat &&
            !state.workspaceRefreshing &&
            !state.isOffline,
    )

    LifecycleEventEffect(Lifecycle.Event.ON_START) {
        viewModel.onAppForegrounded()
    }
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) {
        viewModel.onAppBackgrounded()
    }

    LaunchedEffect(state.message) {
        state.message?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeMessage()
        }
    }
    LaunchedEffect(state.pendingShareUrl) {
        val url = state.pendingShareUrl ?: return@LaunchedEffect
        if (launchArtifactShare(context, url) == ArtifactShareLaunchResult.CopiedFallback) {
            viewModel.showComposerError("无法打开系统分享，链接已复制")
        }
        viewModel.consumeShareUrl()
    }
    LaunchedEffect(state.pendingPaymentUrl) {
        val url = state.pendingPaymentUrl ?: return@LaunchedEffect
        val paymentPageOpened = runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        }.onFailure {
            viewModel.showComposerError("无法打开支付页面，请稍后重试")
        }.isSuccess
        viewModel.consumePaymentUrl(paymentPageOpened)
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        contentWindowInsets = WindowInsets(0),
    ) { padding ->
        AnimatedContent(
            targetState = state.phase,
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            transitionSpec = {
                (fadeIn(spring(stiffness = 420f)) + scaleIn(initialScale = 0.985f)) togetherWith
                    (fadeOut(spring(stiffness = 520f)) + scaleOut(targetScale = 1.01f))
            },
            contentKey = { it },
            label = "app-phase",
        ) { phase ->
            when (phase) {
                AppPhase.Loading -> LoadingScreen(
                    error = state.bootstrapError,
                    onRetry = viewModel::retryBootstrap,
                )
                AppPhase.Authentication -> AuthScreen(
                    mode = state.authMode,
                    submitting = state.authSubmitting,
                    onModeChange = viewModel::setAuthMode,
                    onSubmit = viewModel::authenticate,
                )
                AppPhase.Chat -> WorkspaceScaffold(
                    state = workspaceShell,
                    onDestinationChange = viewModel::selectDestination,
                    onNewConversation = viewModel::newConversation,
                    onOpenConversation = {
                        viewModel.openConversation(it.id, it.searchMatchLeafId)
                    },
                    onConversationSearch = viewModel::updateConversationSearch,
                    onRenameConversation = viewModel::renameConversation,
                    onConsumeFailedConversationRename = viewModel::consumeFailedConversationRename,
                    onTogglePinned = viewModel::togglePinned,
                    onToggleArchived = viewModel::toggleArchived,
                    onMoveConversation = viewModel::moveConversation,
                    onDeleteConversation = viewModel::deleteConversation,
                    onToggleProjectCollapsed = viewModel::toggleProjectCollapsed,
                    onToggleProjectPinned = viewModel::toggleProjectPinned,
                    onStartProjectConversation = viewModel::startProjectConversation,
                    onEditProject = viewModel::openProjectEditor,
                    onDeleteProject = viewModel::deleteProject,
                    onThemeModeChange = viewModel::setThemeMode,
                    onFontSizePresetChange = viewModel::setFontSizePreset,
                    onSignOut = viewModel::signOut,
                ) { workspacePadding, openDrawer ->
                    when (state.destination) {
                        WorkspaceDestination.Chat -> Box(
                            Modifier
                                .fillMaxSize()
                                .padding(workspacePadding),
                        ) {
                            ChatScreen(
                                state = state,
                                onOpenDrawer = openDrawer,
                                onNewConversation = viewModel::newConversationFromHeader,
                                onOpenProject = viewModel::openProjectDetails,
                                onRenameConversation = viewModel::renameConversation,
                                onDraftChange = viewModel::updateDraft,
                                onSelectModel = viewModel::selectModel,
                                onSetDefaultModel = viewModel::setDefaultModel,
                                onSelectThinkingEffort = viewModel::selectThinkingEffort,
                                onResetThinkingEffort = viewModel::resetThinkingEffort,
                                onSelectStyle = viewModel::selectChatStyle,
                                onSend = viewModel::sendMessage,
                                onStop = viewModel::stopGeneration,
                                onRetryStream = viewModel::retryStream,
                                onRetryFailedSend = viewModel::retryFailedSend,
                                onEditResend = viewModel::editAndResend,
                                onRegenerate = viewModel::regenerate,
                                onFeedback = viewModel::setFeedback,
                                onQuote = viewModel::quoteMessage,
                                onClearQuote = viewModel::clearQuote,
                                onSwitchBranch = viewModel::switchBranch,
                                onUploadAttachment = viewModel::uploadChatAttachment,
                                onRemoveAttachment = viewModel::removePendingAttachment,
                                onEditPendingAttachmentImage = viewModel::editPendingAttachmentImage,
                                onRetryAttachmentUpload = viewModel::retryChatAttachmentUpload,
                                onRemoveAttachmentUpload = viewModel::removeChatAttachmentUpload,
                                onUpdateTools = viewModel::updateChatTools,
                                onRequestToolOptions = viewModel::requestChatToolOptions,
                                onComposerError = viewModel::showComposerError,
                                onOpenExternalLink = openExternalLink,
                                onTranscribeAudio = viewModel::transcribeAudio,
                                onToggleSpeech = viewModel::toggleSpeech,
                                onDownloadImage = viewModel::downloadImage,
                                onEditMessageImage = viewModel::editMessageImage,
                                onOpenArtifact = viewModel::openArtifact,
                                onCloseArtifact = viewModel::closeArtifact,
                                onShareArtifact = viewModel::shareArtifact,
                                onSaveArtifact = viewModel::saveArtifact,
                            )
                        }
                        WorkspaceDestination.Projects -> ProjectsScreen(
                            projects = state.projects,
                            requestedEditorProjectId = state.projectEditorRequestId,
                            requestedConversationProjectId = state.projectConversationRequestId,
                            conversations = state.conversations,
                            projectConversations = state.projectConversations,
                            loadingProjectConversationIds = state.loadingProjectConversationIds,
                            knowledgeBases = state.knowledgeBases,
                            knowledgeBasesLoaded = state.knowledgeBasesLoaded,
                            knowledgeBasesLoading = WorkspaceDestination.Knowledge in
                                state.loadingDestinations,
                            models = state.models,
                            loading = WorkspaceDestination.Projects in state.loadingDestinations,
                            uploadProgress = state.projectUploadProgress,
                            onStartConversation = viewModel::startProjectConversation,
                            onOpenConversation = { viewModel.openConversation(it) },
                            onLoadProjectConversations = viewModel::loadProjectConversations,
                            onPrepareEditor = viewModel::prepareProjectEditor,
                            onSave = viewModel::saveProject,
                            onDelete = viewModel::deleteProject,
                            onUploadFiles = viewModel::uploadProjectFiles,
                            onDeleteFile = viewModel::deleteProjectFile,
                            onEditorRequestConsumed = viewModel::consumeProjectEditorRequest,
                            onConversationRequestConsumed = viewModel::consumeProjectConversationRequest,
                            onOpenMenu = openDrawer,
                            modifier = Modifier.padding(workspacePadding),
                        )
                        WorkspaceDestination.Knowledge -> KnowledgeScreen(
                            knowledgeBases = state.knowledgeBases,
                            selectedId = state.selectedKnowledgeBaseId,
                            documents = state.knowledgeDocuments,
                            loading = WorkspaceDestination.Knowledge in state.loadingDestinations,
                            uploadProgress = state.knowledgeUploadProgress,
                            onSelect = viewModel::selectKnowledgeBase,
                            onSave = viewModel::saveKnowledgeBase,
                            onDelete = viewModel::deleteKnowledgeBase,
                            onUploadDocuments = viewModel::uploadKnowledgeDocuments,
                            onDeleteDocument = viewModel::deleteKnowledgeDocument,
                            onOpenMenu = openDrawer,
                            modifier = Modifier.padding(workspacePadding),
                        )
                        WorkspaceDestination.Files -> FilesScreen(
                            assets = state.mediaAssets,
                            kind = state.mediaKind,
                            query = state.mediaQuery,
                            hasMore = state.mediaNextCursor != null,
                            loading = WorkspaceDestination.Files in state.loadingDestinations,
                            preview = state.mediaPreview,
                            downloadingIds = state.downloadingMediaIds,
                            editingIds = state.editingMediaIds,
                            onKindChange = viewModel::updateMediaKind,
                            onQueryChange = viewModel::updateMediaQuery,
                            onLoadMore = viewModel::loadMoreMedia,
                            onOpenPreview = viewModel::openMediaPreview,
                            onClosePreview = viewModel::closeMediaPreview,
                            onDownload = viewModel::downloadMediaAsset,
                            onEditImage = viewModel::editMediaImage,
                            onOpenConversation = viewModel::openConversation,
                            onOpenExternalLink = openExternalLink,
                            onDelete = viewModel::deleteMediaAsset,
                            onOpenMenu = openDrawer,
                            modifier = Modifier.padding(workspacePadding),
                        )
                        WorkspaceDestination.Skills -> SkillsScreen(
                            mySkills = state.mySkills,
                            marketSkills = state.marketSkills,
                            models = state.models,
                            loading = WorkspaceDestination.Skills in state.loadingDestinations,
                            onOpenMenu = openDrawer,
                            onRefresh = viewModel::refreshSkills,
                            onStartConversation = viewModel::startSkillConversation,
                            onSave = viewModel::saveSkill,
                            onDelete = viewModel::deleteSkill,
                            modifier = Modifier.padding(workspacePadding),
                        )
                        WorkspaceDestination.Billing -> BillingScreen(
                            user = state.user,
                            plans = state.plans,
                            usageRecords = state.usageRecords,
                            ledgerEntries = state.ledgerEntries,
                            selectedSection = state.selectedBillingSection,
                            loadedResources = state.billingLoadedResources,
                            loadingResources = state.billingLoadingResources,
                            loading = WorkspaceDestination.Billing in state.loadingDestinations,
                            redeemSuccessEvent = state.billingRedeemSuccessEvent,
                            onOpenMenu = openDrawer,
                            onRefresh = viewModel::refreshBilling,
                            onSelectSection = viewModel::selectBillingSection,
                            onSubscribe = viewModel::subscribe,
                            onRecharge = viewModel::createRecharge,
                            onRedeem = viewModel::redeemCode,
                            modifier = Modifier.padding(workspacePadding),
                        )
                        WorkspaceDestination.Settings -> SettingsScreen(
                            state = state,
                            loading = WorkspaceDestination.Settings in state.loadingDestinations,
                            onOpenMenu = openDrawer,
                            onRefresh = viewModel::refreshSettings,
                            onSelectSection = viewModel::selectSettingsSection,
                            onSaveName = viewModel::updateProfileName,
                            onUpdateAvatar = viewModel::updateAvatar,
                            onExportData = viewModel::exportAccountData,
                            onError = viewModel::showComposerError,
                            onSetMessageRailEnabled = viewModel::setMessageRailEnabled,
                            onSaveMemory = viewModel::saveMemory,
                            onDeleteMemory = viewModel::deleteMemory,
                            onSaveStyle = viewModel::saveStyle,
                            onDeleteStyle = viewModel::deleteStyle,
                            onSetDefaultStyle = viewModel::setDefaultStyle,
                            onSaveMcpServer = viewModel::saveMcpServer,
                            onToggleMcpServer = viewModel::toggleMcpServer,
                            onTestMcpServer = viewModel::testMcpServer,
                            onDeleteMcpServer = viewModel::deleteMcpServer,
                            modifier = Modifier.padding(workspacePadding),
                        )
                        WorkspaceDestination.Admin -> AdminScreen(
                            state = state.admin,
                            currentUserId = state.user?.id,
                            loading = WorkspaceDestination.Admin in state.loadingDestinations,
                            onOpenMenu = openDrawer,
                            onRefresh = viewModel::refreshAdmin,
                            onSelectSection = viewModel::selectAdminSection,
                            onSaveProvider = viewModel::saveAdminProvider,
                            onDeleteProvider = viewModel::deleteAdminProvider,
                            onLoadRemoteModels = viewModel::loadAdminRemoteModels,
                            onAddRemoteModels = viewModel::addAdminRemoteModels,
                            onSaveModel = viewModel::saveAdminModel,
                            onDeleteModel = viewModel::deleteAdminModel,
                            onTestModel = viewModel::testAdminModel,
                            onSavePlan = viewModel::saveAdminPlan,
                            onDeletePlan = viewModel::deleteAdminPlan,
                            onLoadUser = viewModel::loadAdminUserDetail,
                            onGrantBalance = viewModel::grantAdminBalance,
                            onUpdateSubscription = viewModel::updateAdminSubscription,
                            onDeleteUser = viewModel::deleteAdminUser,
                            onReviewSkill = viewModel::reviewAdminSkill,
                            onSaveSettings = viewModel::saveAdminSettings,
                            onTestEngine = viewModel::testAdminEngine,
                            onSaveMcp = viewModel::saveAdminMcpServer,
                            onTestMcp = viewModel::testAdminMcpServer,
                            onDeleteMcp = viewModel::deleteAdminMcpServer,
                            onGenerateCodes = viewModel::generateAdminRedeemCodes,
                            modifier = Modifier.padding(workspacePadding),
                        )
                    }
                }
            }
        }
    }
    state.sharedArtifact?.let { artifact ->
        ArtifactDialog(
            artifact = artifact,
            loading = state.sharedArtifactLoading,
            onDismiss = viewModel::closeSharedArtifact,
            onShare = viewModel::shareOpenedSharedArtifact,
            onSave = viewModel::saveArtifact,
            onOpenLink = openExternalLink,
        )
    }
}

@Composable
private fun LoadingScreen(error: String?, onRetry: () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.padding(32.dp),
        ) {
            BrandMark()
            if (error == null) {
                CircularProgressIndicator(strokeWidth = 2.dp)
                Text("正在载入工作区", style = MaterialTheme.typography.bodyMedium)
            } else {
                Text(error, style = MaterialTheme.typography.bodyMedium)
                Button(onClick = onRetry) { Text("重试") }
            }
        }
    }
}
