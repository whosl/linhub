package com.linhub.android.core.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged

class NetworkMonitor(context: Context) {
    private val connectivityManager = context.applicationContext
        .getSystemService(ConnectivityManager::class.java)

    val isOnline: Flow<Boolean> = callbackFlow {
        val lock = Any()
        val internetNetworks = mutableSetOf<Network>()

        fun hasInternetCapability(capabilities: NetworkCapabilities?): Boolean =
            capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true

        fun update(network: Network, capabilities: NetworkCapabilities?) {
            val online = synchronized(lock) {
                if (hasInternetCapability(capabilities)) internetNetworks += network
                else internetNetworks -= network
                internetNetworks.isNotEmpty()
            }
            trySend(online)
        }

        fun remove(network: Network) {
            val online = synchronized(lock) {
                internetNetworks -= network
                internetNetworks.isNotEmpty()
            }
            trySend(online)
        }

        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                update(network, connectivityManager.getNetworkCapabilities(network))
            }

            override fun onLost(network: Network) = remove(network)

            override fun onCapabilitiesChanged(
                network: Network,
                networkCapabilities: NetworkCapabilities,
            ) = update(network, networkCapabilities)
        }

        connectivityManager.registerDefaultNetworkCallback(callback)
        val activeNetwork = connectivityManager.activeNetwork
        if (activeNetwork == null) trySend(false)
        else update(activeNetwork, connectivityManager.getNetworkCapabilities(activeNetwork))
        awaitClose { connectivityManager.unregisterNetworkCallback(callback) }
    }.distinctUntilChanged()
}
