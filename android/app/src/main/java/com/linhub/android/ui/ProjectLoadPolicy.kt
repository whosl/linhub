package com.linhub.android.ui

internal enum class ProjectSurface {
    List,
    Editor,
    Conversations,
}

internal enum class ProjectResource {
    Projects,
    KnowledgeBases,
}

internal enum class ProjectDetailSection(val label: String) {
    Conversations("对话"),
    Files("项目文件"),
    Settings("项目设置"),
}

internal fun projectResourcesForSurface(surface: ProjectSurface): Set<ProjectResource> =
    when (surface) {
        ProjectSurface.List,
        ProjectSurface.Conversations,
        -> setOf(ProjectResource.Projects)

        ProjectSurface.Editor -> setOf(
            ProjectResource.Projects,
            ProjectResource.KnowledgeBases,
        )
    }

internal fun projectResourcesToLoad(
    surface: ProjectSurface,
    projectsLoaded: Boolean,
    knowledgeBasesLoaded: Boolean,
): Set<ProjectResource> = projectResourcesForSurface(surface).filterTo(linkedSetOf()) { resource ->
    when (resource) {
        ProjectResource.Projects -> !projectsLoaded
        ProjectResource.KnowledgeBases -> !knowledgeBasesLoaded
    }
}

internal fun projectKnowledgeBaseIdsAfterToggle(
    currentIds: List<String>,
    knowledgeBaseId: String,
    checked: Boolean,
): List<String> = if (checked) {
    (currentIds + knowledgeBaseId).distinct()
} else {
    currentIds.filterNot { it == knowledgeBaseId }
}
