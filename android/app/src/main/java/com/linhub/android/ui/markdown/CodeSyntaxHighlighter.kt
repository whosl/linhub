package com.linhub.android.ui.markdown

internal enum class SyntaxTokenKind { Keyword, String, Number, Comment }

internal data class SyntaxToken(
    val start: Int,
    val endExclusive: Int,
    val kind: SyntaxTokenKind,
)

internal object CodeSyntaxHighlighter {
    private val cache = object : LinkedHashMap<String, List<SyntaxToken>>(256, 0.75f, true) {
        override fun removeEldestEntry(
            eldest: MutableMap.MutableEntry<String, List<SyntaxToken>>?,
        ): Boolean = size > 256
    }

    @Synchronized
    fun highlight(language: String?, source: String): List<SyntaxToken> {
        if (source.isEmpty()) return emptyList()
        val normalizedLanguage = normalizeLanguage(language)
        val key = "$normalizedLanguage\u0000$source"
        return cache.getOrPut(key) { tokenize(normalizedLanguage, source) }
    }

    @Synchronized
    fun clearCache() = cache.clear()

    private fun tokenize(language: String, source: String): List<SyntaxToken> {
        val pattern = tokenPattern(language)
        return pattern.findAll(source).map { match ->
            val kind = when {
                match.groups["comment"] != null -> SyntaxTokenKind.Comment
                match.groups["string"] != null -> SyntaxTokenKind.String
                match.groups["number"] != null -> SyntaxTokenKind.Number
                else -> SyntaxTokenKind.Keyword
            }
            SyntaxToken(match.range.first, match.range.last + 1, kind)
        }.toList()
    }

    private fun tokenPattern(language: String): Regex {
        val comments = when (language) {
            "python", "ruby", "shell", "yaml" -> "#[^\\n]*"
            "sql" -> "--[^\\n]*|/\\*(?s:.*?)\\*/"
            "html", "xml" -> "<!--(?s:.*?)-->"
            else -> "//[^\\n]*|/\\*(?s:.*?)\\*/"
        }
        val strings = when (language) {
            "python" -> "\"\"\"(?s:.*?)\"\"\"|'''(?s:.*?)'''|\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'"
            "shell" -> "\"(?:\\\\.|[^\"\\\\])*\"|'[^']*'"
            else -> "`(?:\\\\.|[^`\\\\])*`|\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'"
        }
        val keywordAlternation = KEYWORDS[language].orEmpty()
            .sortedByDescending(String::length)
            .joinToString("|") { Regex.escape(it) }
            .ifEmpty { "(?!)" }
        val markupTag = if (language == "html" || language == "xml") {
            "|</?[A-Za-z][A-Za-z0-9:_-]*"
        } else {
            ""
        }
        return Regex(
            "(?<comment>$comments)|(?<string>$strings)|" +
                "(?<number>\\b(?:0x[0-9A-Fa-f]+|\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b)|" +
                "(?<keyword>\\b(?:$keywordAlternation)\\b$markupTag)",
        )
    }

    private fun normalizeLanguage(language: String?): String = when (language?.trim()?.lowercase()) {
        "kt", "kts" -> "kotlin"
        "js", "jsx" -> "javascript"
        "ts", "tsx" -> "typescript"
        "py" -> "python"
        "rb" -> "ruby"
        "sh", "bash", "zsh" -> "shell"
        "yml" -> "yaml"
        "htm" -> "html"
        "c++", "cc" -> "cpp"
        "rs" -> "rust"
        else -> language?.trim()?.lowercase().orEmpty()
    }

    private val KEYWORDS = mapOf(
        "kotlin" to words(
            "as break class continue do else false for fun if in interface is null object package " +
                "return super this throw true try typealias typeof val var when while by catch " +
                "constructor delegate dynamic field file finally get import init param property receiver " +
                "set setparam where actual abstract annotation companion const crossinline data enum expect " +
                "external final infix inline inner internal lateinit noinline open operator out override " +
                "private protected public reified sealed suspend tailrec vararg",
        ),
        "java" to words(
            "abstract assert boolean break byte case catch char class const continue default do double " +
                "else enum extends final finally float for goto if implements import instanceof int " +
                "interface long native new package private protected public return short static strictfp " +
                "super switch synchronized this throw throws transient try void volatile while true false null",
        ),
        "javascript" to words(
            "async await break case catch class const continue debugger default delete do else export " +
                "extends false finally for function if import in instanceof let new null of return static " +
                "super switch this throw true try typeof undefined var void while with yield",
        ),
        "typescript" to words(
            "abstract any as async await boolean break case catch class const constructor continue " +
                "declare default delete do else enum export extends false finally for from function get " +
                "if implements import in infer instanceof interface keyof let namespace never new null " +
                "number object of override private protected public readonly return set static string super " +
                "switch symbol this throw true try type typeof undefined unknown var void while yield",
        ),
        "python" to words(
            "and as assert async await break class continue def del elif else except false finally for " +
                "from global if import in is lambda none nonlocal not or pass raise return true try while with yield",
        ),
        "go" to words(
            "break case chan const continue default defer else fallthrough for func go goto if import " +
                "interface map package range return select struct switch type var true false nil",
        ),
        "rust" to words(
            "as async await break const continue crate dyn else enum extern false fn for if impl in let " +
                "loop match mod move mut pub ref return self Self static struct super trait true type " +
                "unsafe use where while",
        ),
        "c" to words(
            "auto break case char const continue default do double else enum extern float for goto if " +
                "inline int long register restrict return short signed sizeof static struct switch typedef " +
                "union unsigned void volatile while",
        ),
        "cpp" to words(
            "alignas alignof auto bool break case catch char class const constexpr continue default " +
                "delete do double else enum explicit export extern false float for friend if inline int " +
                "long namespace new nullptr operator private protected public register reinterpret_cast " +
                "return short signed sizeof static struct switch template this throw true try typedef " +
                "typename union unsigned using virtual void volatile while",
        ),
        "sql" to words(
            "add all alter and any as asc backup between by case check column constraint create database " +
                "default delete desc distinct drop exec exists foreign from full group having in index inner " +
                "insert into is join key left like limit not null offset on or order outer primary procedure " +
                "references right row select set table top truncate union unique update values view where with",
        ),
        "shell" to words(
            "case do done elif else esac fi for function if in select then time until while true false",
        ),
        "yaml" to words("true false null yes no on off"),
    )

    private fun words(value: String): Set<String> = value.split(' ').filter(String::isNotBlank).toSet()
}
