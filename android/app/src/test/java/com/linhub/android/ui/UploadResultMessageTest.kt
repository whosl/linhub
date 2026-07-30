package com.linhub.android.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class UploadResultMessageTest {
    @Test
    fun `项目批次部分失败保留成功数和真实文件名`() {
        assertEquals(
            "已上传 1 个项目文件，1 个步骤失败\n" +
                "android-project-batch-invalid.linhub-invalid：不支持的文件类型「.linhub-invalid」",
            projectUploadResultMessage(
                successCount = 1,
                failures = listOf(
                    "android-project-batch-invalid.linhub-invalid：" +
                        "不支持的文件类型「.linhub-invalid」",
                ),
                mirrored = false,
            ),
        )
    }

    @Test
    fun `项目批次成功同步知识库时使用同步结果文案`() {
        assertEquals(
            "已上传 2 个项目资料并同步到知识库",
            projectUploadResultMessage(
                successCount = 2,
                failures = emptyList(),
                mirrored = true,
            ),
        )
    }
}
