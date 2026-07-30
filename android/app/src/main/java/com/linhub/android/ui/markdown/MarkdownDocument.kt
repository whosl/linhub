package com.linhub.android.ui.markdown

import org.commonmark.Extension
import org.commonmark.ext.autolink.AutolinkExtension
import org.commonmark.ext.gfm.strikethrough.Strikethrough
import org.commonmark.ext.gfm.strikethrough.StrikethroughExtension
import org.commonmark.ext.gfm.tables.TableBlock
import org.commonmark.ext.gfm.tables.TableBody
import org.commonmark.ext.gfm.tables.TableCell
import org.commonmark.ext.gfm.tables.TableHead
import org.commonmark.ext.gfm.tables.TableRow
import org.commonmark.ext.gfm.tables.TablesExtension
import org.commonmark.node.BlockQuote
import org.commonmark.node.BulletList
import org.commonmark.node.Code
import org.commonmark.node.Document
import org.commonmark.node.Emphasis
import org.commonmark.node.FencedCodeBlock
import org.commonmark.node.HardLineBreak
import org.commonmark.node.Heading
import org.commonmark.node.HtmlInline
import org.commonmark.node.Image
import org.commonmark.node.IndentedCodeBlock
import org.commonmark.node.Link
import org.commonmark.node.ListItem
import org.commonmark.node.Node
import org.commonmark.node.OrderedList
import org.commonmark.node.Paragraph
import org.commonmark.node.SoftLineBreak
import org.commonmark.node.StrongEmphasis
import org.commonmark.node.Text
import org.commonmark.node.ThematicBreak
import org.commonmark.parser.Parser

data class MarkdownDocument(val blocks: List<MarkdownBlock>)

data class MarkdownFootnote(
    val label: String,
    val blocks: List<MarkdownBlock>,
)

sealed interface MarkdownBlock {
    data class Paragraph(val content: List<MarkdownInline>) : MarkdownBlock
    data class Heading(val level: Int, val content: List<MarkdownInline>) : MarkdownBlock
    data class Code(val language: String?, val literal: String) : MarkdownBlock
    data class Quote(val blocks: List<MarkdownBlock>) : MarkdownBlock
    data class ListBlock(
        val ordered: Boolean,
        val startNumber: Int,
        val items: List<List<MarkdownBlock>>,
    ) : MarkdownBlock
    data class Table(
        val header: List<List<MarkdownInline>>,
        val rows: List<List<List<MarkdownInline>>>,
    ) : MarkdownBlock
    data class Math(val latex: String) : MarkdownBlock
    data class Footnotes(val entries: List<MarkdownFootnote>) : MarkdownBlock
    data object Divider : MarkdownBlock
}

sealed interface MarkdownInline {
    data class Text(val value: String) : MarkdownInline
    data class Emphasis(val content: List<MarkdownInline>) : MarkdownInline
    data class Strong(val content: List<MarkdownInline>) : MarkdownInline
    data class Strike(val content: List<MarkdownInline>) : MarkdownInline
    data class Code(val value: String) : MarkdownInline
    data class Link(val destination: String, val content: List<MarkdownInline>) : MarkdownInline
    data class Image(val destination: String, val description: List<MarkdownInline>) : MarkdownInline
    data class Math(val latex: String) : MarkdownInline
    data class Footnote(val label: String) : MarkdownInline
    data class Raw(val value: String) : MarkdownInline
    data object SoftBreak : MarkdownInline
    data object HardBreak : MarkdownInline
}

object MarkdownEngine {
    private const val MAX_CACHE_ENTRIES = 512
    private const val MAX_CACHE_SOURCE_CHARS = 2_000_000
    private val extensions: List<Extension> = listOf(
        TablesExtension.create(),
        StrikethroughExtension.create(),
        AutolinkExtension.create(),
    )
    private val parsers = ThreadLocal.withInitial {
        Parser.builder().extensions(extensions).build()
    }
    private val cacheLock = Any()
    private val cache = LinkedHashMap<String, MarkdownDocument>(MAX_CACHE_ENTRIES, 0.75f, true)
    private var cachedSourceChars = 0

    fun parse(source: String): MarkdownDocument {
        synchronized(cacheLock) { cache[source] }?.let { return it }
        val parser = requireNotNull(parsers.get())
        val footnotes = extractFootnotes(normalizeMarkdownBlockBoundaries(source))
        val extracted = extractDisplayMath(footnotes.markdown)
        val root = parser.parse(extracted.markdown)
        val blocks = parseBlocks(root, extracted.blocks, footnotes.definitions).toMutableList()
        if (footnotes.definitions.isNotEmpty()) {
            blocks += MarkdownBlock.Footnotes(
                footnotes.definitions.map { (label, definition) ->
                    val nestedMath = extractDisplayMath(definition)
                    MarkdownFootnote(
                        label = label,
                        blocks = parseBlocks(
                            parser.parse(nestedMath.markdown),
                            nestedMath.blocks,
                            emptyMap(),
                        ),
                    )
                },
            )
        }
        val document = MarkdownDocument(blocks)
        if (source.length <= MAX_CACHE_SOURCE_CHARS) {
            synchronized(cacheLock) {
                cache[source]?.let { return it }
                cache[source] = document
                cachedSourceChars += source.length
                trimCache()
            }
        }
        return document
    }

    internal fun prewarm(sources: Iterable<String>) {
        sources.forEach(::parse)
    }

    internal fun isCached(source: String): Boolean = synchronized(cacheLock) {
        cache.containsKey(source)
    }

    fun clearCache() {
        synchronized(cacheLock) {
            cache.clear()
            cachedSourceChars = 0
        }
    }

    private fun trimCache() {
        val iterator = cache.entries.iterator()
        while (
            iterator.hasNext() &&
            (cache.size > MAX_CACHE_ENTRIES || cachedSourceChars > MAX_CACHE_SOURCE_CHARS)
        ) {
            val eldest = iterator.next()
            cachedSourceChars -= eldest.key.length
            iterator.remove()
        }
    }
}

private fun parseBlocks(
    parent: Node,
    displayMath: Map<String, String>,
    footnotes: Map<String, String>,
): List<MarkdownBlock> = parent.childSequence().mapNotNull { node ->
    when (node) {
        is Paragraph -> {
            val inlines = parseInlines(node, footnotes)
            val placeholder = (inlines.singleOrNull() as? MarkdownInline.Text)?.value
            displayMath[placeholder]?.let(MarkdownBlock::Math)
                ?: MarkdownBlock.Paragraph(inlines)
        }
        is Heading -> MarkdownBlock.Heading(node.level, parseInlines(node, footnotes))
        is FencedCodeBlock -> MarkdownBlock.Code(node.info?.trim()?.takeIf(String::isNotEmpty), node.literal)
        is IndentedCodeBlock -> MarkdownBlock.Code(null, node.literal)
        is BlockQuote -> MarkdownBlock.Quote(parseBlocks(node, displayMath, footnotes))
        is BulletList -> MarkdownBlock.ListBlock(
            ordered = false,
            startNumber = 1,
            items = node.childSequence().filterIsInstance<ListItem>()
                .map { parseBlocks(it, displayMath, footnotes) }
                .toList(),
        )
        is OrderedList -> MarkdownBlock.ListBlock(
            ordered = true,
            startNumber = node.markerStartNumber,
            items = node.childSequence().filterIsInstance<ListItem>()
                .map { parseBlocks(it, displayMath, footnotes) }
                .toList(),
        )
        is ThematicBreak -> MarkdownBlock.Divider
        is TableBlock -> parseTable(node, footnotes)
        is Document,
        is ListItem,
        -> null
        else -> parseBlocks(node, displayMath, footnotes).firstOrNull()
    }
}.toList()

private fun parseTable(
    table: TableBlock,
    footnotes: Map<String, String>,
): MarkdownBlock.Table {
    var header = emptyList<List<MarkdownInline>>()
    val rows = mutableListOf<List<List<MarkdownInline>>>()
    table.childSequence().forEach { section ->
        when (section) {
            is TableHead -> header = section.childSequence()
                .filterIsInstance<TableRow>()
                .firstOrNull()
                ?.cells(footnotes)
                .orEmpty()
            is TableBody -> section.childSequence()
                .filterIsInstance<TableRow>()
                .mapTo(rows) { it.cells(footnotes) }
        }
    }
    return MarkdownBlock.Table(header = header, rows = rows)
}

private fun TableRow.cells(footnotes: Map<String, String>): List<List<MarkdownInline>> = childSequence()
    .filterIsInstance<TableCell>()
    .map { parseInlines(it, footnotes) }
    .toList()

private fun parseInlines(
    parent: Node,
    footnotes: Map<String, String>,
): List<MarkdownInline> = parent.childSequence().flatMap { node ->
    when (node) {
        is Text -> parseInlineMath(node.literal)
            .asSequence()
            .flatMap { inline ->
                if (inline is MarkdownInline.Text) {
                    parseInlineFootnotes(inline.value, footnotes).asSequence()
                } else {
                    sequenceOf(inline)
                }
            }
        is Emphasis -> sequenceOf(MarkdownInline.Emphasis(parseInlines(node, footnotes)))
        is StrongEmphasis -> sequenceOf(MarkdownInline.Strong(parseInlines(node, footnotes)))
        is Strikethrough -> sequenceOf(MarkdownInline.Strike(parseInlines(node, footnotes)))
        is Code -> sequenceOf(MarkdownInline.Code(node.literal))
        is Link -> sequenceOf(MarkdownInline.Link(node.destination, parseInlines(node, footnotes)))
        is Image -> sequenceOf(MarkdownInline.Image(node.destination, parseInlines(node, footnotes)))
        is SoftLineBreak -> sequenceOf(MarkdownInline.SoftBreak)
        is HardLineBreak -> sequenceOf(MarkdownInline.HardBreak)
        is HtmlInline -> sequenceOf(MarkdownInline.Raw(node.literal))
        else -> parseInlines(node, footnotes).takeIf(List<MarkdownInline>::isNotEmpty)
            ?.let { sequenceOf(MarkdownInline.Emphasis(it)) }
            ?: emptySequence()
    }
}.toList()

private data class ExtractedFootnotes(
    val markdown: String,
    val definitions: Map<String, String>,
)

private fun extractFootnotes(source: String): ExtractedFootnotes {
    val lines = source.lines()
    val output = mutableListOf<String>()
    val definitions = linkedMapOf<String, String>()
    var fence: Char? = null
    var fenceLength = 0
    var index = 0
    val definitionPattern = Regex("^\\s*\\[\\^([^]]+)]\\s*:\\s*(.*)$")
    while (index < lines.size) {
        val line = lines[index]
        val trimmed = line.trim()
        val fenceMatch = Regex("^(`{3,}|~{3,})").find(trimmed)?.value
        if (fenceMatch != null) {
            val marker = fenceMatch.first()
            if (fence == null) {
                fence = marker
                fenceLength = fenceMatch.length
            } else if (fence == marker && fenceMatch.length >= fenceLength) {
                fence = null
                fenceLength = 0
            }
            output += line
            index += 1
            continue
        }
        val match = if (fence == null) definitionPattern.find(line) else null
        if (match == null) {
            output += line
            index += 1
            continue
        }
        val label = match.groupValues[1]
        val definitionLines = mutableListOf(match.groupValues[2])
        var cursor = index + 1
        while (cursor < lines.size) {
            val continuation = lines[cursor]
            if (!continuation.startsWith("    ") && !continuation.startsWith('\t')) break
            definitionLines += continuation.trimStart()
            cursor += 1
        }
        definitions[label] = definitionLines.joinToString("\n").trim()
        index = cursor
    }
    return ExtractedFootnotes(output.joinToString("\n"), definitions)
}

private data class ExtractedDisplayMath(
    val markdown: String,
    val blocks: Map<String, String>,
)

private fun extractDisplayMath(source: String): ExtractedDisplayMath {
    val lines = source.lines()
    val output = mutableListOf<String>()
    val blocks = linkedMapOf<String, String>()
    var fence: Char? = null
    var fenceLength = 0
    var index = 0
    while (index < lines.size) {
        val line = lines[index]
        val trimmed = line.trim()
        val fenceMatch = Regex("^(`{3,}|~{3,})").find(trimmed)?.value
        if (fenceMatch != null) {
            val marker = fenceMatch.first()
            if (fence == null) {
                fence = marker
                fenceLength = fenceMatch.length
            } else if (fence == marker && fenceMatch.length >= fenceLength) {
                fence = null
                fenceLength = 0
            }
            output += line
            index += 1
            continue
        }
        if (fence != null) {
            output += line
            index += 1
            continue
        }

        val delimiter = when {
            trimmed.startsWith("$$") -> "$$" to "$$"
            trimmed.startsWith("\\[") -> "\\[" to "\\]"
            else -> null
        }
        if (delimiter == null) {
            output += line
            index += 1
            continue
        }

        val (opening, closing) = delimiter
        val afterOpening = trimmed.removePrefix(opening)
        if (afterOpening.endsWith(closing) && afterOpening.length >= closing.length) {
            val latex = afterOpening.removeSuffix(closing).trim()
            if (latex.isNotEmpty()) {
                val placeholder = "LINHUBMATHBLOCK${blocks.size}TOKEN"
                blocks[placeholder] = latex
                output += placeholder
                index += 1
                continue
            }
        }

        val mathLines = mutableListOf<String>()
        afterOpening.takeIf(String::isNotBlank)?.let(mathLines::add)
        var cursor = index + 1
        var foundClosing = false
        while (cursor < lines.size) {
            val candidate = lines[cursor]
            val candidateTrimmed = candidate.trim()
            if (candidateTrimmed.endsWith(closing)) {
                candidateTrimmed.removeSuffix(closing)
                    .takeIf(String::isNotBlank)
                    ?.let(mathLines::add)
                foundClosing = true
                break
            }
            mathLines += candidate
            cursor += 1
        }
        if (!foundClosing || mathLines.joinToString("\n").isBlank()) {
            output += line
            index += 1
            continue
        }
        val placeholder = "LINHUBMATHBLOCK${blocks.size}TOKEN"
        blocks[placeholder] = mathLines.joinToString("\n").trim()
        output += placeholder
        index = cursor + 1
    }
    return ExtractedDisplayMath(output.joinToString("\n"), blocks)
}

private fun parseInlineMath(value: String): List<MarkdownInline> {
    if ('$' !in value) return listOf(MarkdownInline.Text(value))
    val result = mutableListOf<MarkdownInline>()
    var textStart = 0
    var cursor = 0
    while (cursor < value.length) {
        if (
            value[cursor] != '$' ||
            value.getOrNull(cursor + 1) == '$' ||
            value.getOrNull(cursor + 1)?.isWhitespace() != false
        ) {
            cursor += 1
            continue
        }
        var closing = cursor + 1
        while (true) {
            closing = value.indexOf('$', closing)
            if (closing < 0) break
            if (value.getOrNull(closing - 1)?.isWhitespace() == false) break
            closing += 1
        }
        if (closing < 0) break
        if (cursor > textStart) result += MarkdownInline.Text(value.substring(textStart, cursor))
        result += MarkdownInline.Math(value.substring(cursor + 1, closing))
        cursor = closing + 1
        textStart = cursor
    }
    if (textStart < value.length) result += MarkdownInline.Text(value.substring(textStart))
    return result.ifEmpty { listOf(MarkdownInline.Text(value)) }
}

private fun parseInlineFootnotes(
    value: String,
    definitions: Map<String, String>,
): List<MarkdownInline> {
    if (definitions.isEmpty() || "[^" !in value) return listOf(MarkdownInline.Text(value))
    val result = mutableListOf<MarkdownInline>()
    var cursor = 0
    FOOTNOTE_REFERENCE.findAll(value).forEach { match ->
        val label = match.groupValues[1]
        if (label !in definitions) return@forEach
        if (match.range.first > cursor) {
            result += MarkdownInline.Text(value.substring(cursor, match.range.first))
        }
        result += MarkdownInline.Footnote(label)
        cursor = match.range.last + 1
    }
    if (cursor < value.length) result += MarkdownInline.Text(value.substring(cursor))
    return result.ifEmpty { listOf(MarkdownInline.Text(value)) }
}

private val FOOTNOTE_REFERENCE = Regex("\\[\\^([^]]+)]")

private fun Node.childSequence(): Sequence<Node> = sequence {
    var child = firstChild
    while (child != null) {
        yield(child)
        child = child.next
    }
}
