package com.linhub.android.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.rounded.AccountBalanceWallet
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.ConfirmationNumber
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.linhub.android.core.model.LedgerEntry
import com.linhub.android.core.model.Plan
import com.linhub.android.core.model.UsageRecord
import com.linhub.android.core.model.User
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.abs

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BillingScreen(
    user: User?,
    plans: List<Plan>,
    usageRecords: List<UsageRecord>,
    ledgerEntries: List<LedgerEntry>,
    selectedSection: BillingSection,
    loadedResources: Set<BillingResource>,
    loadingResources: Set<BillingResource>,
    loading: Boolean,
    redeemSuccessEvent: Long,
    onOpenMenu: () -> Unit,
    onRefresh: () -> Unit,
    onSelectSection: (BillingSection) -> Unit,
    onSubscribe: (Plan) -> Unit,
    onRecharge: (Int) -> Unit,
    onRedeem: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val sectionLoaded = isBillingSectionLoaded(
        selectedSection,
        loadedResources,
        userAvailable = user != null,
    )
    val sectionLoading = loading || isBillingSectionLoading(selectedSection, loadingResources)
    Scaffold(
        modifier = modifier,
        contentWindowInsets = WindowInsets(0),
        topBar = {
            WebPageHeader(
                title = "用量与订阅",
                description = "余额、套餐、消费明细",
                onOpenMenu = onOpenMenu,
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            BillingOverview(user)
            WebTabRow(
                labels = BillingSection.entries.map(BillingSection::label),
                selectedIndex = selectedSection.ordinal,
                onSelect = { onSelectSection(BillingSection.entries[it]) },
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
            )
            if (sectionLoading && !sectionLoaded) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(strokeWidth = 2.dp)
                }
            } else if (!sectionLoaded) {
                BillingSectionLoadFailure(onRefresh)
            } else {
                AnimatedContent(
                    targetState = selectedSection,
                    modifier = Modifier.weight(1f),
                    transitionSpec = {
                        fadeIn(spring(stiffness = 520f)) togetherWith
                            fadeOut(spring(stiffness = 620f))
                    },
                    label = "billing-section",
                ) { selected ->
                    when (selected) {
                        BillingSection.Plans -> PlansContent(
                            plans = plans,
                            currentPlanId = user?.subscription?.planId,
                            loading = sectionLoading,
                            onSubscribe = onSubscribe,
                        )
                        BillingSection.Recharge -> RechargeContent(
                            loading = sectionLoading,
                            redeemSuccessEvent = redeemSuccessEvent,
                            onRecharge = onRecharge,
                            onRedeem = onRedeem,
                        )
                        BillingSection.Usage -> UsageContent(usageRecords)
                        BillingSection.Ledger -> LedgerContent(ledgerEntries)
                    }
                }
            }
        }
    }
}

@Composable
private fun BillingSectionLoadFailure(onRetry: () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text("当前标签加载失败", fontWeight = FontWeight.SemiBold)
            Text(
                "请检查网络后重试，已加载的计费数据仍会保留。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedButton(onClick = onRetry) { Text("重试") }
        }
    }
}

@Composable
private fun BillingOverview(user: User?) {
    val subscription = user?.subscription
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        BillingMetricCard(Icons.Rounded.AccountBalanceWallet, "账户余额", money(user?.balance ?: 0))
        BillingMetricCard(Icons.Rounded.AutoAwesome, "当前套餐", subscription?.planName ?: "免费版")
        val quota = billingQuotaPresentation(
            monthlyQuotaCents = subscription?.monthlyQuotaCents,
            usedQuotaCents = subscription?.usedQuotaCents ?: 0,
            formatMoney = ::money,
        )
        BillingMetricCard(
            Icons.AutoMirrored.Rounded.ReceiptLong,
            "本月订阅额度",
            quota.value,
            supportingText = quota.supportingText,
            progress = quota.progress,
        )
    }
}

@Composable
private fun BillingMetricCard(
    icon: ImageVector,
    label: String,
    value: String,
    supportingText: String? = null,
    progress: Float? = null,
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 92.dp),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shadowElevation = 1.dp,
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    icon,
                    contentDescription = null,
                    modifier = Modifier.size(14.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    label,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
            supportingText?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            progress?.let {
                val animatedProgress by animateFloatAsState(
                    targetValue = it,
                    animationSpec = spring(stiffness = 500f, dampingRatio = 0.9f),
                    label = "billing-quota-progress",
                )
                LinearProgressIndicator(
                    progress = { animatedProgress },
                    modifier = Modifier.fillMaxWidth(),
                    strokeCap = StrokeCap.Round,
                    gapSize = 0.dp,
                    drawStopIndicator = {},
                )
            }
        }
    }
}

@Composable
private fun PlansContent(
    plans: List<Plan>,
    currentPlanId: String?,
    loading: Boolean,
    onSubscribe: (Plan) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(plans, key = Plan::id) { plan ->
            val current = plan.id == currentPlanId
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .animateItem(),
                shape = RoundedCornerShape(16.dp),
                border = BorderStroke(
                    1.dp,
                    if (plan.id == "plan-standard") {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.outlineVariant
                    },
                ),
            ) {
                Column(Modifier.padding(24.dp)) {
                    Text(plan.name, style = MaterialTheme.typography.titleMedium)
                    Text(
                        plan.description,
                        modifier = Modifier.padding(top = 4.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        if (plan.priceCentsPerMonth == 0) "免费" else money(plan.priceCentsPerMonth),
                        modifier = Modifier.padding(top = 16.dp),
                        style = MaterialTheme.typography.headlineLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (plan.priceCentsPerMonth > 0) {
                        Text(
                            "/月",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text(
                        if (plan.monthlyQuotaCents < 0) "无限额度" else "${money(plan.monthlyQuotaCents)}额度",
                        modifier = Modifier.padding(top = 12.dp),
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Column(
                        modifier = Modifier.padding(top = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        plan.features.forEach { feature ->
                        Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                            Icon(
                                Icons.Rounded.Check,
                                contentDescription = null,
                                modifier = Modifier.size(17.dp),
                                tint = Color(0xFF2F9E6E),
                            )
                            Text(feature, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    }
                    if (current || plan.id == "plan-standard") {
                        Button(
                            onClick = { onSubscribe(plan) },
                            enabled = !current && !loading,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 20.dp),
                        ) {
                            Text(if (current) "当前套餐" else "选择")
                        }
                    } else {
                        OutlinedButton(
                            onClick = { onSubscribe(plan) },
                            enabled = !loading,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 20.dp),
                        ) {
                            Text("选择")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RechargeContent(
    loading: Boolean,
    redeemSuccessEvent: Long,
    onRecharge: (Int) -> Unit,
    onRedeem: (String) -> Unit,
) {
    val amounts = remember { listOf(1_000, 3_000, 5_000, 10_000, 20_000, 50_000) }
    var selectedAmount by rememberSaveable { mutableIntStateOf(5_000) }
    var code by rememberSaveable { mutableStateOf("") }
    var handledRedeemSuccessEvent by rememberSaveable {
        mutableLongStateOf(redeemSuccessEvent)
    }
    LaunchedEffect(redeemSuccessEvent) {
        if (redeemSuccessEvent != handledRedeemSuccessEvent) {
            code = ""
            handledRedeemSuccessEvent = redeemSuccessEvent
        }
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                color = MaterialTheme.colorScheme.surface,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                shadowElevation = 1.dp,
            ) {
                Column(Modifier.padding(24.dp)) {
                    BillingSectionTitle(
                        icon = Icons.Rounded.AccountBalanceWallet,
                        title = "余额充值",
                    )
                    Column(
                        modifier = Modifier.padding(top = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        billingAmountRows(amounts).forEach { rowAmounts ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                rowAmounts.forEach { amount ->
                                    val selected = selectedAmount == amount
                                    val borderColor by animateColorAsState(
                                        targetValue = if (selected) {
                                            MaterialTheme.colorScheme.primary
                                        } else {
                                            MaterialTheme.colorScheme.outlineVariant
                                        },
                                        label = "billing-amount-border",
                                    )
                                    val containerColor by animateColorAsState(
                                        targetValue = if (selected) {
                                            MaterialTheme.colorScheme.primary.copy(alpha = 0.1f)
                                        } else {
                                            MaterialTheme.colorScheme.surface
                                        },
                                        label = "billing-amount-container",
                                    )
                                    OutlinedButton(
                                        onClick = { selectedAmount = amount },
                                        modifier = Modifier
                                            .weight(1f)
                                            .height(46.dp)
                                            .semantics { this.selected = selected },
                                        shape = RoundedCornerShape(12.dp),
                                        border = BorderStroke(1.dp, borderColor),
                                        colors = ButtonDefaults.outlinedButtonColors(
                                            containerColor = containerColor,
                                            contentColor = if (selected) {
                                                MaterialTheme.colorScheme.primary
                                            } else {
                                                MaterialTheme.colorScheme.onSurface
                                            },
                                        ),
                                        contentPadding = PaddingValues(horizontal = 4.dp),
                                    ) {
                                        Text(money(amount), maxLines = 1)
                                    }
                                }
                            }
                        }
                    }
                    Button(
                        onClick = { onRecharge(selectedAmount) },
                        enabled = !loading,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 16.dp),
                    ) {
                        Text(if (loading) "创建订单中…" else "去支付 ${money(selectedAmount)}")
                    }
                    Text(
                        "未开通支付渠道时，请使用兑换码或联系管理员。",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .align(Alignment.CenterHorizontally)
                            .padding(top = 8.dp),
                    )
                }
            }
        }
        item {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                color = MaterialTheme.colorScheme.surface,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                shadowElevation = 1.dp,
            ) {
                Column(Modifier.padding(24.dp)) {
                    BillingSectionTitle(
                        icon = Icons.Rounded.ConfirmationNumber,
                        title = "兑换码",
                    )
                    Row(
                        modifier = Modifier.padding(top = 16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedTextField(
                            value = code,
                            onValueChange = { code = it },
                            placeholder = { Text("输入兑换码") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                            keyboardActions = KeyboardActions(
                                onDone = {
                                    if (code.isNotBlank() && !loading) onRedeem(code.trim())
                                },
                            ),
                            modifier = Modifier.weight(1f),
                        )
                        Button(
                            onClick = { onRedeem(code.trim()) },
                            enabled = code.isNotBlank() && !loading,
                            modifier = Modifier.height(56.dp),
                        ) {
                            Text(if (loading) "兑换中…" else "兑换")
                        }
                    }
                    Text(
                        "兑换码由管理员在后台生成，可用于活动赠送或线下售卖。",
                        modifier = Modifier.padding(top = 12.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun BillingSectionTitle(icon: ImageVector, title: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            icon,
            contentDescription = null,
            modifier = Modifier.size(16.dp),
            tint = MaterialTheme.colorScheme.primary,
        )
        Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun UsageContent(records: List<UsageRecord>) {
    val total = records.sumOf(UsageRecord::costCents)
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                color = MaterialTheme.colorScheme.surface,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                shadowElevation = 1.dp,
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "最近用量",
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Medium,
                    )
                    Text(
                        "合计 ${money(total)}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        if (records.isEmpty()) {
            item {
                WebEmptyState(
                    icon = Icons.AutoMirrored.Rounded.ReceiptLong,
                    title = "还没有用量记录",
                    description = "开始对话后，模型用量会显示在这里。",
                )
            }
        }
        items(records, key = UsageRecord::id) { record ->
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = MaterialTheme.colorScheme.surface,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                shadowElevation = 1.dp,
                modifier = Modifier
                    .fillMaxWidth()
                    .animateItem(),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            record.modelName,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            fontWeight = FontWeight.Medium,
                        )
                        Text(
                            "${formatDate(record.createdAt)} · 输入 ${tokens(record.inputTokens)} · " +
                                if ((record.imageCount ?: 0) > 0) {
                                    "${record.imageCount} 张图"
                                } else {
                                    "输出 ${tokens(record.outputTokens)}"
                                },
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text(money(record.costCents), fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
private fun LedgerContent(entries: List<LedgerEntry>) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        if (entries.isEmpty()) {
            item {
                WebEmptyState(
                    icon = Icons.AutoMirrored.Rounded.ReceiptLong,
                    title = "还没有余额流水",
                    description = "充值、兑换和消费记录会显示在这里。",
                )
            }
        }
        itemsIndexed(entries, key = { _, entry -> entry.id }) { index, entry ->
            val position = billingListPosition(index, entries.size)
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .animateItem(),
                shape = ledgerSegmentShape(position),
                color = MaterialTheme.colorScheme.surface,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 13.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(entry.description, style = MaterialTheme.typography.bodyMedium)
                        Text(
                            formatDate(entry.createdAt),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            (if (entry.amountCents > 0) "+" else "") + money(entry.amountCents),
                            color = if (entry.amountCents > 0) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurface
                            },
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            "余额 ${money(entry.balanceAfterCents)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

private fun ledgerSegmentShape(position: BillingListPosition): RoundedCornerShape = when (position) {
    BillingListPosition.Single -> RoundedCornerShape(16.dp)
    BillingListPosition.First -> RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
    BillingListPosition.Middle -> RoundedCornerShape(0.dp)
    BillingListPosition.Last -> RoundedCornerShape(bottomStart = 16.dp, bottomEnd = 16.dp)
}

private fun money(cents: Int): String {
    val value = cents.toLong()
    val sign = if (value < 0) "-" else ""
    val absolute = abs(value)
    return "$sign¥${absolute / 100}.${(absolute % 100).toString().padStart(2, '0')}"
}

private fun tokens(value: Int): String = when {
    value >= 1_000_000 -> "${value / 1_000_000}.${value % 1_000_000 / 100_000}M"
    value >= 1_000 -> "${value / 1_000}.${value % 1_000 / 100}K"
    else -> value.toString()
}

private val BILLING_DATE_FORMATTER = DateTimeFormatter.ofPattern("M月d日 HH:mm")

private fun formatDate(value: String): String = runCatching {
    BILLING_DATE_FORMATTER.format(Instant.parse(value).atZone(ZoneId.systemDefault()))
}.getOrDefault(value)
