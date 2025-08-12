package com.kixx

import android.app.Activity
import android.view.WindowManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SecurityModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    override fun getName(): String {
        return "SecurityModule"
    }

    @ReactMethod
    fun enableSecureMode() {
        val activity: Activity? = currentActivity
        activity?.runOnUiThread {
            activity.window.setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE
            )
        }
    }

    @ReactMethod
    fun disableSecureMode() {
        val activity: Activity? = currentActivity
        activity?.runOnUiThread {
            activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }

    @ReactMethod
    fun removeFromRecents() {
        val activity: Activity? = currentActivity
        activity?.let {
            it.finishAndRemoveTask()
        }
    }
}