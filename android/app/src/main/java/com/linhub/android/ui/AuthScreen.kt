package com.linhub.android.ui

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.linhub.android.R
import com.linhub.android.ui.design.LinHubActionButton
import com.linhub.android.ui.design.LinHubAmbientBackground
import com.linhub.android.ui.design.LinHubPanel
import com.linhub.android.ui.design.LinHubTextField

/**
 * 登录与注册页直接复刻 Web AuthShell：同样的 384px 最大宽度、48px 品牌标、
 * 36px 输入框和底部文字链接。移动端不再额外加入分段控件或箭头按钮。
 */
@Composable
fun AuthScreen(
    mode: AuthMode,
    submitting: Boolean,
    onModeChange: (AuthMode) -> Unit,
    onSubmit: (name: String, email: String, password: String) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val focusManager = LocalFocusManager.current
    val signIn = mode == AuthMode.SignIn

    LinHubAmbientBackground(Modifier.fillMaxSize()) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp),
            contentAlignment = Alignment.Center,
        ) {
            LinHubPanel(
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 384.dp),
                cornerRadius = 28.dp,
                padding = PaddingValues(horizontal = 24.dp, vertical = 26.dp),
                shadow = 18.dp,
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .animateContentSize(spring(stiffness = 500f)),
                ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                BrandMark()
                Spacer(Modifier.height(16.dp))
                Text(
                    text = if (signIn) "欢迎回来" else "创建账户",
                    color = MaterialTheme.colorScheme.onBackground,
                    fontFamily = FontFamily.Serif,
                    fontSize = 24.sp,
                    lineHeight = 32.sp,
                    fontWeight = FontWeight.Normal,
                )
                Text(
                    text = if (signIn) {
                        "登录你的 LinHub 账户"
                    } else {
                        "第一个注册的用户将自动成为管理员"
                    },
                    modifier = Modifier.padding(top = 4.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    textAlign = TextAlign.Center,
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (!signIn) {
                    WebAuthField(
                        value = name,
                        onValueChange = { name = it },
                        placeholder = "昵称",
                        enabled = !submitting,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                        keyboardActions = KeyboardActions(
                            onNext = { focusManager.moveFocus(FocusDirection.Down) },
                        ),
                    )
                }
                WebAuthField(
                    value = email,
                    onValueChange = { email = it },
                    placeholder = "邮箱",
                    enabled = !submitting,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Email,
                        imeAction = ImeAction.Next,
                    ),
                    keyboardActions = KeyboardActions(
                        onNext = { focusManager.moveFocus(FocusDirection.Down) },
                    ),
                )
                WebAuthField(
                    value = password,
                    onValueChange = { password = it },
                    placeholder = if (signIn) "密码" else "密码（至少 8 位）",
                    enabled = !submitting,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Done,
                    ),
                    keyboardActions = KeyboardActions(
                        onDone = {
                            focusManager.clearFocus()
                            if (!submitting) onSubmit(name, email, password)
                        },
                    ),
                )
                LinHubActionButton(
                    text = if (signIn) "登录" else "注册",
                    onClick = { onSubmit(name, email, password) },
                    enabled = !submitting,
                    loading = submitting,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                )
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 16.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = if (signIn) "还没有账户？ " else "已有账户？ ",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                )
                Text(
                    text = if (signIn) "注册" else "登录",
                    modifier = Modifier.clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                    ) {
                        onModeChange(if (signIn) AuthMode.SignUp else AuthMode.SignIn)
                    },
                    color = MaterialTheme.colorScheme.primary,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
                }
            }
        }
    }
}

@Composable
private fun WebAuthField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    enabled: Boolean,
    keyboardOptions: KeyboardOptions,
    keyboardActions: KeyboardActions,
    visualTransformation: VisualTransformation = VisualTransformation.None,
) {
    LinHubTextField(
        value = value,
        onValueChange = onValueChange,
        placeholder = placeholder,
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp),
        enabled = enabled,
        singleLine = true,
        textStyle = TextStyle(
            fontSize = 15.sp,
            lineHeight = 22.sp,
        ),
        visualTransformation = visualTransformation,
        keyboardOptions = keyboardOptions,
        keyboardActions = keyboardActions,
    )
}

@Composable
fun BrandMark() {
    Image(
        painter = painterResource(R.drawable.linhub_logo),
        contentDescription = null,
        modifier = Modifier.size(48.dp),
    )
}
