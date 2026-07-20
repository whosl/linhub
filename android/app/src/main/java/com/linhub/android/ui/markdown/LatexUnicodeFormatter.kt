package com.linhub.android.ui.markdown

internal object LatexUnicodeFormatter {
    fun format(latex: String): String {
        var result = latex.trim()
        repeat(4) {
            result = FRACTION.replace(result) { match ->
                "${match.groupValues[1]}⁄${match.groupValues[2]}"
            }
            result = SQRT.replace(result) { match -> "√(${match.groupValues[1]})" }
            result = TEXT_COMMAND.replace(result) { match -> match.groupValues[1] }
        }
        COMMANDS.forEach { (command, replacement) ->
            result = result.replace("\\$command", replacement)
        }
        result = SCRIPT.replace(result) { match ->
            val marker = match.groupValues[1]
            val raw = match.groupValues[2].ifEmpty { match.groupValues[3] }
            val converted = raw.map { character ->
                if (marker == "^") SUPERSCRIPT[character] else SUBSCRIPT[character]
            }
            if (converted.all { it != null }) {
                converted.joinToString("") { it.toString() }
            } else {
                "$marker($raw)"
            }
        }
        return result
            .replace("\\left", "")
            .replace("\\right", "")
            .replace(Regex("\\\\[,;:!]"), " ")
            .replace("{", "")
            .replace("}", "")
            .replace(Regex("\\s+"), " ")
            .trim()
    }

    private val FRACTION = Regex("\\\\frac\\{([^{}]+)}\\{([^{}]+)}")
    private val SQRT = Regex("\\\\sqrt\\{([^{}]+)}")
    private val TEXT_COMMAND = Regex("\\\\(?:text|mathrm|mathbf|mathit)\\{([^{}]+)}")
    private val SCRIPT = Regex("([_^])(?:\\{([^{}]+)}|([A-Za-z0-9+\\-=()]))")

    private val COMMANDS = linkedMapOf(
        "alpha" to "α", "beta" to "β", "gamma" to "γ", "delta" to "δ",
        "epsilon" to "ε", "zeta" to "ζ", "eta" to "η", "theta" to "θ",
        "iota" to "ι", "kappa" to "κ", "lambda" to "λ", "mu" to "μ",
        "nu" to "ν", "xi" to "ξ", "pi" to "π", "rho" to "ρ",
        "sigma" to "σ", "tau" to "τ", "upsilon" to "υ", "phi" to "φ",
        "chi" to "χ", "psi" to "ψ", "omega" to "ω",
        "Gamma" to "Γ", "Delta" to "Δ", "Theta" to "Θ", "Lambda" to "Λ",
        "Xi" to "Ξ", "Pi" to "Π", "Sigma" to "Σ", "Phi" to "Φ",
        "Psi" to "Ψ", "Omega" to "Ω", "times" to "×", "cdot" to "·",
        "pm" to "±", "leq" to "≤", "le" to "≤", "geq" to "≥", "ge" to "≥",
        "neq" to "≠", "approx" to "≈", "infty" to "∞", "sum" to "∑",
        "prod" to "∏", "int" to "∫", "partial" to "∂", "nabla" to "∇",
        "rightarrow" to "→", "leftarrow" to "←", "Rightarrow" to "⇒",
        "Leftarrow" to "⇐", "in" to "∈", "notin" to "∉", "subset" to "⊂",
        "subseteq" to "⊆", "cup" to "∪", "cap" to "∩",
    )

    private val SUPERSCRIPT = mapOf(
        '0' to '⁰', '1' to '¹', '2' to '²', '3' to '³', '4' to '⁴',
        '5' to '⁵', '6' to '⁶', '7' to '⁷', '8' to '⁸', '9' to '⁹',
        '+' to '⁺', '-' to '⁻', '=' to '⁼', '(' to '⁽', ')' to '⁾',
        'n' to 'ⁿ', 'i' to 'ⁱ',
    )
    private val SUBSCRIPT = mapOf(
        '0' to '₀', '1' to '₁', '2' to '₂', '3' to '₃', '4' to '₄',
        '5' to '₅', '6' to '₆', '7' to '₇', '8' to '₈', '9' to '₉',
        '+' to '₊', '-' to '₋', '=' to '₌', '(' to '₍', ')' to '₎',
        'a' to 'ₐ', 'e' to 'ₑ', 'h' to 'ₕ', 'i' to 'ᵢ', 'j' to 'ⱼ',
        'k' to 'ₖ', 'l' to 'ₗ', 'm' to 'ₘ', 'n' to 'ₙ', 'o' to 'ₒ',
        'p' to 'ₚ', 'r' to 'ᵣ', 's' to 'ₛ', 't' to 'ₜ', 'u' to 'ᵤ',
        'v' to 'ᵥ', 'x' to 'ₓ',
    )
}
