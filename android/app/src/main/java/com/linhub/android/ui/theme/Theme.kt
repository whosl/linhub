package com.linhub.android.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.Density
import androidx.core.view.WindowCompat
import com.linhub.android.core.model.FontSizePreset
import com.linhub.android.core.model.ThemeMode

private val LightColors = lightColorScheme(
    primary = Color(0xFFC96442),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFF7E5DE),
    onPrimaryContainer = Color(0xFFC96442),
    secondary = Color(0xFFF0EEE6),
    onSecondary = Color(0xFF535146),
    secondaryContainer = Color(0xFFF0EEE6),
    onSecondaryContainer = Color(0xFF535146),
    tertiary = Color(0xFFEBE9E0),
    onTertiary = Color(0xFF3D3929),
    background = Color(0xFFFAF9F5),
    onBackground = Color(0xFF3D3929),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF3D3929),
    surfaceVariant = Color(0xFFF0EEE6),
    onSurfaceVariant = Color(0xFF83827D),
    outline = Color(0xFFE3E1D9),
    outlineVariant = Color(0xFFE3E1D9),
    surfaceTint = Color.Transparent,
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFFAF9F5),
    surfaceContainer = Color(0xFFFFFFFF),
    surfaceContainerHigh = Color(0xFFF0EEE6),
    surfaceContainerHighest = Color(0xFFEBE9E0),
    error = Color(0xFFC2410C),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFD97757),
    onPrimary = Color.White,
    primaryContainer = Color(0xFF573126),
    onPrimaryContainer = Color(0xFFD97757),
    secondary = Color(0xFF3A3A37),
    onSecondary = Color(0xFFC2C0B6),
    secondaryContainer = Color(0xFF3A3A37),
    onSecondaryContainer = Color(0xFFC2C0B6),
    tertiary = Color(0xFF3E3E3A),
    onTertiary = Color(0xFFECEAE2),
    background = Color(0xFF262624),
    onBackground = Color(0xFFECEAE2),
    surface = Color(0xFF30302E),
    onSurface = Color(0xFFECEAE2),
    surfaceVariant = Color(0xFF33332F),
    onSurfaceVariant = Color(0xFF9C9A90),
    outline = Color(0xFF3E3D38),
    outlineVariant = Color(0xFF3E3D38),
    surfaceTint = Color.Transparent,
    surfaceContainerLowest = Color(0xFF1F1E1D),
    surfaceContainerLow = Color(0xFF262624),
    surfaceContainer = Color(0xFF30302E),
    surfaceContainerHigh = Color(0xFF33332F),
    surfaceContainerHighest = Color(0xFF3E3E3A),
    error = Color(0xFFE5674A),
)

@Composable
fun LinHubTheme(
    themeMode: ThemeMode = ThemeMode.SYSTEM,
    fontSizePreset: FontSizePreset = FontSizePreset.MEDIUM,
    content: @Composable () -> Unit,
) {
    val darkTheme = when (themeMode) {
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
    }
    val colors = if (darkTheme) DarkColors else LightColors
    val view = LocalView.current
    val systemDensity = LocalDensity.current
    val scaledDensity = remember(
        systemDensity.density,
        systemDensity.fontScale,
        fontSizePreset,
    ) {
        Density(
            // 同步缩放 dp 与 sp：字号变大时，行距、内边距和触控区域也保持相同比例。
            // fontScale 不再重复乘 preset，避免文字被二次放大。
            density = systemDensity.density * fontSizePreset.scale,
            fontScale = systemDensity.fontScale,
        )
    }
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
            WindowCompat.getInsetsController(window, view).isAppearanceLightNavigationBars = !darkTheme
        }
    }
    CompositionLocalProvider(LocalDensity provides scaledDensity) {
        MaterialTheme(colorScheme = colors, typography = LinHubTypography, content = content)
    }
}
