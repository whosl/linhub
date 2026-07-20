package com.linhub.android

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import com.linhub.android.core.network.hasSameOrigin
import okhttp3.OkHttpClient
import okhttp3.HttpUrl.Companion.toHttpUrl

class LinHubApplication : Application(), ImageLoaderFactory {
    val container: AppContainer by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
        AppContainer(applicationContext)
    }

    override fun newImageLoader(): ImageLoader {
        val serverOrigin = BuildConfig.API_BASE_URL.toHttpUrl()
        return ImageLoader.Builder(this)
            .okHttpClient {
                OkHttpClient.Builder()
                    .addInterceptor { chain ->
                        val request = chain.request().newBuilder().apply {
                            val url = chain.request().url
                            if (url.hasSameOrigin(serverOrigin)) {
                                container.sessionStore.currentToken()?.let {
                                    header("Authorization", "Bearer $it")
                                }
                            }
                        }.build()
                        chain.proceed(request)
                    }
                    .build()
            }
            .crossfade(true)
            .build()
    }
}
