package com.linhub.android

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.linhub.android.ui.LinHubApp
import com.linhub.android.ui.LinHubViewModel
import com.linhub.android.ui.LinHubViewModelFactory
import com.linhub.android.ui.theme.LinHubTheme

class MainActivity : ComponentActivity() {
    private var deepLinkRequest by mutableStateOf<DeepLinkRequest?>(null)
    private var deepLinkNonce = 0L
    private lateinit var linHubViewModel: LinHubViewModel

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        acceptDeepLink(intent)
        enableEdgeToEdge()
        val app = application as LinHubApplication
        linHubViewModel = ViewModelProvider(
            this,
            LinHubViewModelFactory(
                container = app.container,
                benchmarkScenario = if (BuildConfig.BENCHMARK_ENABLED) {
                    intent.getStringExtra(BENCHMARK_SCENARIO_EXTRA)
                } else {
                    null
                },
            ),
        )[LinHubViewModel::class.java]
        setContent {
            val appearance by linHubViewModel.appearance.collectAsStateWithLifecycle()
            LinHubTheme(
                themeMode = appearance.themeMode,
                fontSizePreset = appearance.fontSizePreset,
            ) {
                val request = deepLinkRequest
                LaunchedEffect(request) {
                    request?.let {
                        linHubViewModel.openDeepLink(it.uri)
                        if (deepLinkRequest == it) deepLinkRequest = null
                    }
                }
                LinHubApp(linHubViewModel)
            }
        }
        acceptBenchmarkTrigger(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        acceptBenchmarkTrigger(intent)
        acceptDeepLink(intent)
    }

    private fun acceptBenchmarkTrigger(intent: Intent?) {
        if (
            BuildConfig.BENCHMARK_ENABLED &&
            intent?.getBooleanExtra(BENCHMARK_STREAMING_TRIGGER_EXTRA, false) == true &&
            ::linHubViewModel.isInitialized
        ) {
            linHubViewModel.runStreamingBenchmark()
        }
    }

    private fun acceptDeepLink(intent: Intent?) {
        val uri = intent?.data ?: return
        deepLinkRequest = DeepLinkRequest(uri, ++deepLinkNonce)
    }
}

internal const val BENCHMARK_SCENARIO_EXTRA =
    "com.linhub.android.extra.BENCHMARK_SCENARIO"
internal const val BENCHMARK_STREAMING_TRIGGER_EXTRA =
    "com.linhub.android.extra.BENCHMARK_STREAMING_TRIGGER"

private data class DeepLinkRequest(val uri: Uri, val nonce: Long)
