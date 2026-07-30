package com.linhub.android.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
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
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import com.linhub.android.core.model.FontSizePreset
import com.linhub.android.core.model.ThemeMode

private val LightColors = lightColorScheme(
    primary = Color(0xFFD06443),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFE9DF),
    onPrimaryContainer = Color(0xFF833C27),
    secondary = Color(0xFF6558D9),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFECE9FF),
    onSecondaryContainer = Color(0xFF39306F),
    tertiary = Color(0xFF6C63E8),
    onTertiary = Color.White,
    background = Color(0xFFFAF9F6),
    onBackground = Color(0xFF282724),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF282724),
    surfaceVariant = Color(0xFFF0EEE8),
    onSurfaceVariant = Color(0xFF74716A),
    outline = Color(0xFFDFDCD4),
    outlineVariant = Color(0xFFE8E5DE),
    surfaceTint = Color.Transparent,
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFFAF9F6),
    surfaceContainer = Color(0xFFFFFFFF),
    surfaceContainerHigh = Color(0xFFF2F0EB),
    surfaceContainerHighest = Color(0xFFEAE7E0),
    error = Color(0xFFC2410C),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFE07A59),
    onPrimary = Color.White,
    primaryContainer = Color(0xFF512E24),
    onPrimaryContainer = Color(0xFFFFC4B0),
    secondary = Color(0xFFAFA8FF),
    onSecondary = Color(0xFF252044),
    secondaryContainer = Color(0xFF353052),
    onSecondaryContainer = Color(0xFFE3DFFF),
    tertiary = Color(0xFFA8A1FF),
    onTertiary = Color(0xFF252044),
    background = Color(0xFF171715),
    onBackground = Color(0xFFF0EEE8),
    surface = Color(0xFF211F1D),
    onSurface = Color(0xFFF0EEE8),
    surfaceVariant = Color(0xFF2B2926),
    onSurfaceVariant = Color(0xFFA9A59D),
    outline = Color(0xFF3B3834),
    outlineVariant = Color(0xFF34312E),
    surfaceTint = Color.Transparent,
    surfaceContainerLowest = Color(0xFF11110F),
    surfaceContainerLow = Color(0xFF1A1917),
    surfaceContainer = Color(0xFF211F1D),
    surfaceContainerHigh = Color(0xFF292724),
    surfaceContainerHighest = Color(0xFF312F2B),
    error = Color(0xFFE5674A),
)

private val LinHubShapes = Shapes(
    extraSmall = androidx.compose.foundation.shape.RoundedCornerShape(10.dp),
    small = androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
    medium = androidx.compose.foundation.shape.RoundedCornerShape(18.dp),
    large = androidx.compose.foundation.shape.RoundedCornerShape(24.dp),
    extraLarge = androidx.compose.foundation.shape.RoundedCornerShape(30.dp),
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
        MaterialTheme(
            colorScheme = colors,
            typography = LinHubTypography,
            shapes = LinHubShapes,
            content = content,
        )
    }
}
