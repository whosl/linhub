package com.linhub.android.core.network

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.core.content.edit
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

class SessionStore(context: Context) {
    private val preferences = context.getSharedPreferences("linhub_session", Context.MODE_PRIVATE)
    private val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
    private val secretKey: SecretKey by lazy { loadOrCreateKey() }
    private val _token = MutableStateFlow(decryptStoredValue(KEY_TOKEN, KEY_TOKEN_IV))
    private val _accountId = MutableStateFlow(decryptStoredValue(KEY_ACCOUNT_ID, KEY_ACCOUNT_ID_IV))
    val token = _token.asStateFlow()

    fun currentToken(): String? = _token.value

    fun currentAccountId(): String? = _accountId.value

    fun saveToken(token: String) {
        encryptAndStore(token, KEY_TOKEN, KEY_TOKEN_IV)
        _token.value = token
    }

    fun saveAccountId(accountId: String) {
        require(accountId.isNotBlank())
        encryptAndStore(accountId, KEY_ACCOUNT_ID, KEY_ACCOUNT_ID_IV)
        _accountId.value = accountId
    }

    private fun encryptAndStore(value: String, valueKey: String, ivKey: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION).apply {
            init(Cipher.ENCRYPT_MODE, secretKey)
        }
        val ciphertext = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        preferences.edit {
            putString(valueKey, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
            putString(ivKey, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
        }
    }

    fun clear() {
        preferences.edit {
            remove(KEY_TOKEN)
            remove(KEY_TOKEN_IV)
            remove(KEY_ACCOUNT_ID)
            remove(KEY_ACCOUNT_ID_IV)
        }
        _token.value = null
        _accountId.value = null
    }

    private fun decryptStoredValue(valueKey: String, ivKey: String): String? {
        val ciphertext = preferences.getString(valueKey, null) ?: return null
        val iv = preferences.getString(ivKey, null) ?: return null
        return runCatching {
            val cipher = Cipher.getInstance(TRANSFORMATION).apply {
                init(
                    Cipher.DECRYPT_MODE,
                    secretKey,
                    GCMParameterSpec(GCM_TAG_BITS, Base64.decode(iv, Base64.NO_WRAP)),
                )
            }
            String(
                cipher.doFinal(Base64.decode(ciphertext, Base64.NO_WRAP)),
                Charsets.UTF_8,
            )
        }.getOrElse {
            preferences.edit {
                remove(valueKey)
                remove(ivKey)
            }
            null
        }
    }

    private fun loadOrCreateKey(): SecretKey {
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE).run {
            init(
                KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build(),
            )
            generateKey()
        }
    }

    private companion object {
        const val KEY_TOKEN = "auth_token"
        const val KEY_TOKEN_IV = "auth_token_iv"
        const val KEY_ACCOUNT_ID = "account_id"
        const val KEY_ACCOUNT_ID_IV = "account_id_iv"
        const val KEY_ALIAS = "linhub_session_key"
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val GCM_TAG_BITS = 128
    }
}
