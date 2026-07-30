package com.linhub.android.ui.design

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * LinHub 的非 Material 视觉组件层。
 *
 * 这些组件只依赖 Compose Foundation 绘制外观：没有系统水波纹、默认控件形状或
 * Material elevation。MaterialTheme 在这里仅作为颜色和排版令牌容器，便于现有页面渐进迁移。
 */
object LinHubMotion {
    const val Quick = 150
    const val Standard = 240
    const val Deliberate = 420
}

@Composable
fun Modifier.linHubPressable(
    enabled: Boolean = true,
    role: Role? = null,
    onClick: () -> Unit,
): Modifier {
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed && enabled) 0.965f else 1f,
        animationSpec = spring(dampingRatio = 0.72f, stiffness = 720f),
        label = "linhub-press-scale",
    )
    return this
        .graphicsLayer {
            scaleX = scale
            scaleY = scale
        }
        .clickable(
            interactionSource = interactionSource,
            indication = null,
            enabled = enabled,
            role = role,
            onClick = onClick,
        )
}

@Composable
fun LinHubAmbientBackground(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    Box(
        modifier = modifier
            .background(colors.background)
            .drawWithCache {
                val shortSide = size.minDimension
                val warmGlow = Brush.radialGradient(
                    colors = listOf(colors.primary.copy(alpha = 0.085f), Color.Transparent),
                    center = Offset(size.width * 0.12f, size.height * 0.08f),
                    radius = shortSide * 0.82f,
                )
                val coolGlow = Brush.radialGradient(
                    colors = listOf(colors.tertiary.copy(alpha = 0.075f), Color.Transparent),
                    center = Offset(size.width * 0.92f, size.height * 0.34f),
                    radius = shortSide * 0.92f,
                )
                onDrawBehind {
                    drawRect(warmGlow)
                    drawRect(coolGlow)
                }
            },
        content = content,
    )
}

@Composable
fun LinHubPanel(
    modifier: Modifier = Modifier,
    cornerRadius: Dp = 22.dp,
    padding: PaddingValues = PaddingValues(0.dp),
    shadow: Dp = 12.dp,
    content: @Composable BoxScope.() -> Unit,
) {
    val shape = RoundedCornerShape(cornerRadius)
    val colors = MaterialTheme.colorScheme
    Box(
        modifier = modifier
            .shadow(shadow, shape, ambientColor = Color.Black.copy(alpha = 0.08f), spotColor = Color.Black.copy(alpha = 0.10f))
            .clip(shape)
            .background(colors.surface.copy(alpha = 0.965f))
            .border(1.dp, colors.outlineVariant.copy(alpha = 0.72f), shape)
            .padding(padding),
        content = content,
    )
}

@Composable
fun LinHubIconButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 38.dp,
    enabled: Boolean = true,
    selected: Boolean = false,
    contentDescription: String,
    content: @Composable BoxScope.() -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    val fill by animateColorAsState(
        targetValue = when {
            selected -> colors.primary.copy(alpha = 0.13f)
            else -> Color.Transparent
        },
        animationSpec = tween(LinHubMotion.Quick),
        label = "linhub-icon-fill",
    )
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(fill)
            .semantics { this.contentDescription = contentDescription }
            .linHubPressable(enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
        content = content,
    )
}

@Composable
fun LinHubActionButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    quiet: Boolean = false,
    leading: (@Composable RowScope.() -> Unit)? = null,
) {
    val colors = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(18.dp)
    val foreground = when {
        !enabled -> colors.onSurfaceVariant.copy(alpha = 0.55f)
        quiet -> colors.onSurface
        else -> colors.onPrimary
    }
    val background = when {
        !enabled -> Brush.linearGradient(listOf(colors.surfaceVariant, colors.surfaceVariant))
        quiet -> Brush.linearGradient(listOf(colors.surface, colors.surfaceContainerHigh))
        else -> Brush.linearGradient(
            listOf(
                colors.primary,
                colors.primary.copy(red = (colors.primary.red + 0.08f).coerceAtMost(1f)),
            ),
        )
    }
    Row(
        modifier = modifier
            .heightIn(min = 50.dp)
            .shadow(if (quiet) 0.dp else 8.dp, shape, spotColor = colors.primary.copy(alpha = 0.22f))
            .clip(shape)
            .background(background)
            .then(
                if (quiet) Modifier.border(1.dp, colors.outlineVariant, shape) else Modifier,
            )
            .linHubPressable(enabled = enabled && !loading, role = Role.Button, onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 13.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (loading) {
            LinHubSpinner(size = 18.dp, color = foreground)
        } else {
            leading?.invoke(this)
            Text(text = text, color = foreground, style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
fun LinHubTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    singleLine: Boolean = true,
    minLines: Int = 1,
    maxLines: Int = if (singleLine) 1 else Int.MAX_VALUE,
    textStyle: TextStyle = MaterialTheme.typography.bodyLarge,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    leading: (@Composable () -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val focused by interactionSource.collectIsFocusedAsState()
    val colors = MaterialTheme.colorScheme
    val borderColor by animateColorAsState(
        targetValue = if (focused) colors.primary.copy(alpha = 0.68f) else colors.outlineVariant,
        animationSpec = tween(LinHubMotion.Standard),
        label = "linhub-field-border",
    )
    val shape = RoundedCornerShape(18.dp)
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .clip(shape)
            .background(colors.surface.copy(alpha = 0.94f))
            .border(if (focused) 1.5.dp else 1.dp, borderColor, shape)
            .semantics { contentDescription = placeholder },
        enabled = enabled,
        singleLine = singleLine,
        minLines = minLines,
        maxLines = maxLines,
        interactionSource = interactionSource,
        textStyle = textStyle.copy(color = if (enabled) colors.onSurface else colors.onSurface.copy(alpha = 0.5f)),
        cursorBrush = SolidColor(colors.primary),
        keyboardOptions = keyboardOptions,
        keyboardActions = keyboardActions,
        visualTransformation = visualTransformation,
        decorationBox = { inner ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 13.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                leading?.invoke()
                Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                    if (value.isEmpty()) {
                        Text(
                            text = placeholder,
                            color = colors.onSurfaceVariant.copy(alpha = 0.76f),
                            style = textStyle,
                        )
                    }
                    inner()
                }
                trailing?.invoke()
            }
        },
    )
}

@Composable
fun LinHubSuggestion(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(16.dp)
    Row(
        modifier = modifier
            .heightIn(min = 46.dp)
            .clip(shape)
            .background(colors.surface.copy(alpha = 0.78f))
            .border(1.dp, colors.outlineVariant.copy(alpha = 0.7f), shape)
            .linHubPressable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = text,
            modifier = Modifier.weight(1f),
            maxLines = 1,
            color = colors.onSurface,
            style = MaterialTheme.typography.labelLarge,
        )
    }
}

@Composable
fun LinHubSwitch(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = MaterialTheme.colorScheme
    val track by animateColorAsState(
        targetValue = when {
            !enabled -> colors.surfaceVariant.copy(alpha = 0.55f)
            checked -> colors.primary
            else -> colors.surfaceVariant
        },
        animationSpec = tween(LinHubMotion.Standard),
        label = "linhub-switch-track",
    )
    val thumbOffset by animateDpAsState(
        targetValue = if (checked) 20.dp else 2.dp,
        animationSpec = spring(dampingRatio = 0.72f, stiffness = 620f),
        label = "linhub-switch-thumb",
    )
    Box(
        modifier = modifier
            .width(44.dp)
            .height(26.dp)
            .clip(CircleShape)
            .background(track)
            .linHubPressable(enabled = enabled, role = Role.Switch) {
                onCheckedChange(!checked)
            },
        contentAlignment = Alignment.CenterStart,
    ) {
        Box(
            Modifier
                .offset(x = thumbOffset)
                .size(22.dp)
                .shadow(3.dp, CircleShape)
                .background(
                    if (checked) colors.onPrimary else colors.surface,
                    CircleShape,
                ),
        )
    }
}

@Composable
fun LinHubSpinner(
    modifier: Modifier = Modifier,
    size: Dp = 20.dp,
    color: Color = MaterialTheme.colorScheme.primary,
) {
    val transition = rememberInfiniteTransition(label = "linhub-spinner")
    val rotation by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(760, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "linhub-spinner-rotation",
    )
    Canvas(modifier = modifier.size(size).rotate(rotation)) {
        drawArc(
            color = color.copy(alpha = 0.22f),
            startAngle = 0f,
            sweepAngle = 360f,
            useCenter = false,
            style = androidx.compose.ui.graphics.drawscope.Stroke(width = 2.dp.toPx()),
        )
        drawArc(
            color = color,
            startAngle = -90f,
            sweepAngle = 105f,
            useCenter = false,
            style = androidx.compose.ui.graphics.drawscope.Stroke(
                width = 2.dp.toPx(),
                cap = androidx.compose.ui.graphics.StrokeCap.Round,
            ),
        )
    }
}

@Composable
fun LinHubOrb(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "linhub-orb")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(3600, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "linhub-orb-phase",
    )
    val colors = MaterialTheme.colorScheme
    Canvas(modifier = modifier.size(52.dp)) {
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(
                    colors.primary.copy(alpha = 0.9f),
                    colors.tertiary.copy(alpha = 0.68f),
                    colors.primary.copy(alpha = 0.08f),
                ),
                center = Offset(size.width * (0.38f + phase * 0.18f), size.height * (0.32f + phase * 0.16f)),
                radius = size.minDimension * 0.58f,
            ),
        )
        drawCircle(
            color = Color.White.copy(alpha = 0.42f),
            radius = size.minDimension * 0.08f,
            center = Offset(size.width * 0.36f, size.height * 0.30f),
        )
    }
}
