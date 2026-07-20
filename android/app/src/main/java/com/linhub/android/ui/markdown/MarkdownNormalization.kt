package com.linhub.android.ui.markdown

private val fenceOpenPattern = Regex("^ {0,3}(`{3,}|~{3,})")
private val thematicBreakPattern = Regex("^ {0,3}-{3,}[\\t ]*$")
private val explicitBlockquotePattern = Regex("^ {0,3}>")
private val frontmatterFieldPattern = Regex("^[A-Za-z0-9_-]+:[\\t ]*")

/**
 * 正文中的独占连字符线统一视为分隔线，且只有显式以 `>` 开头的行属于引用。
 * 避免 CommonMark 在模型漏写空行时误合并块边界；代码、表格和 frontmatter 不受影响。
 */
internal fun normalizeMarkdownBlockBoundaries(source: String): String {
    val newline = if (source.contains("\r\n")) "\r\n" else "\n"
    val lines = source.split(Regex("\\r?\\n"))
    val normalized = mutableListOf<String>()
    val possibleFrontmatterEnd = if (lines.firstOrNull()?.trim() == "---") {
        lines.withIndex()
            .drop(1)
            .firstOrNull { (_, line) -> line.trim() == "---" }
            ?.index
            ?: -1
    } else {
        -1
    }
    val firstFrontmatterField = lines.subList(1, possibleFrontmatterEnd.coerceAtLeast(1))
        .firstOrNull { line -> line.isNotBlank() && !line.trimStart().startsWith("#") }
    val frontmatterEnd = if (
        possibleFrontmatterEnd > 1 &&
        firstFrontmatterField != null &&
        frontmatterFieldPattern.containsMatchIn(firstFrontmatterField)
    ) {
        possibleFrontmatterEnd
    } else {
        -1
    }
    var fenceMarker: Char? = null
    var fenceLength = 0
    var previousWasExplicitBlockquote = false

    lines.forEachIndexed { index, line ->
        if (index <= frontmatterEnd) {
            normalized += line
            previousWasExplicitBlockquote = false
            return@forEachIndexed
        }

        val fence = fenceOpenPattern.find(line)
        val activeFence = fenceMarker
        if (activeFence != null) {
            normalized += line
            previousWasExplicitBlockquote = false
            val trimmed = line.trim()
            if (trimmed.length >= fenceLength && trimmed.all { it == activeFence }) {
                fenceMarker = null
                fenceLength = 0
            }
            return@forEachIndexed
        }

        val isExplicitBlockquote = explicitBlockquotePattern.containsMatchIn(line)
        if (!isExplicitBlockquote && line.isNotBlank() && previousWasExplicitBlockquote) {
            normalized += ""
        }

        if (fence != null) {
            val marker = fence.groupValues[1]
            fenceMarker = marker.first()
            fenceLength = marker.length
            normalized += line
            previousWasExplicitBlockquote = false
            return@forEachIndexed
        }

        if (thematicBreakPattern.matches(line) && normalized.lastOrNull()?.isNotBlank() == true) {
            normalized += ""
        }
        normalized += line
        previousWasExplicitBlockquote = isExplicitBlockquote
    }

    return normalized.joinToString(newline)
}
