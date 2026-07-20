package com.linhub.android.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class ProjectLoadPolicyTest {
    @Test
    fun `项目列表只请求项目资源`() {
        assertEquals(
            setOf(ProjectResource.Projects),
            projectResourcesToLoad(
                ProjectSurface.List,
                projectsLoaded = false,
                knowledgeBasesLoaded = false,
            ),
        )
    }

    @Test
    fun `新建或编辑项目时才请求知识库`() {
        assertEquals(
            setOf(ProjectResource.Projects, ProjectResource.KnowledgeBases),
            projectResourcesToLoad(
                ProjectSurface.Editor,
                projectsLoaded = false,
                knowledgeBasesLoaded = false,
            ),
        )
        assertEquals(
            setOf(ProjectResource.KnowledgeBases),
            projectResourcesToLoad(
                ProjectSurface.Editor,
                projectsLoaded = true,
                knowledgeBasesLoaded = false,
            ),
        )
    }

    @Test
    fun `项目详情对话标签不请求知识库`() {
        assertEquals(
            emptySet<ProjectResource>(),
            projectResourcesToLoad(
                ProjectSurface.Conversations,
                projectsLoaded = true,
                knowledgeBasesLoaded = false,
            ),
        )
    }

    @Test
    fun `知识库已加载时快速重进编辑器不重复请求`() {
        assertEquals(
            emptySet<ProjectResource>(),
            projectResourcesToLoad(
                ProjectSurface.Editor,
                projectsLoaded = true,
                knowledgeBasesLoaded = true,
            ),
        )
    }

    @Test
    fun `项目详情关联知识库切换去重且可移除`() {
        assertEquals(
            listOf("kb-1", "kb-2"),
            projectKnowledgeBaseIdsAfterToggle(
                currentIds = listOf("kb-1", "kb-2", "kb-2"),
                knowledgeBaseId = "kb-2",
                checked = true,
            ),
        )
        assertEquals(
            listOf("kb-1"),
            projectKnowledgeBaseIdsAfterToggle(
                currentIds = listOf("kb-1", "kb-2", "kb-2"),
                knowledgeBaseId = "kb-2",
                checked = false,
            ),
        )
    }
}
