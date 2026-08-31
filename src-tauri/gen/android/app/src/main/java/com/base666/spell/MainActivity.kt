package com.base666.spell

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import java.io.File

class MainActivity : TauriActivity() {
  private var webView: WebView? = null
  private val imeBridge = SpellImeBridge()
  private val updateBridge = SpellUpdateBridge(this)
  private var lastImePx = -1
  private var lastSafeTop = -1
  private var lastSafeBottom = -1
  private var lastSafeLeft = -1
  private var lastSafeRight = -1
  private var statusBarHeightPx = 0

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    WindowCompat.setDecorFitsSystemWindows(window, false)
    window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING)
    configureSystemBars()
    listenForInsets(window.decorView)
    window.decorView.viewTreeObserver.addOnGlobalLayoutListener {
      ViewCompat.getRootWindowInsets(window.decorView)?.let(::pushInsets)
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    resetInsetCache()
    webView.addJavascriptInterface(imeBridge, "SpellIme")
    webView.addJavascriptInterface(updateBridge, "SpellUpdate")
    webView.addJavascriptInterface(SpellLinksBridge(this), "SpellLinks")
    listenForInsets(webView)
    ViewCompat.getRootWindowInsets(window.decorView)?.let(::pushInsets)
    webView.addOnAttachStateChangeListener(
      object : View.OnAttachStateChangeListener {
        override fun onViewAttachedToWindow(v: View) {
          listenForInsets(window.decorView)
          findViewById<View>(android.R.id.content)?.let(::listenForInsets)
          ViewCompat.requestApplyInsets(window.decorView)
          ViewCompat.requestApplyInsets(v)
          ViewCompat.getRootWindowInsets(window.decorView)?.let(::pushInsets)
        }

        override fun onViewDetachedFromWindow(v: View) {}
      },
    )
  }

  override fun onResume() {
    super.onResume()
    configureSystemBars()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    val imeVisible =
      ViewCompat.getRootWindowInsets(window.decorView)
        ?.isVisible(WindowInsetsCompat.Type.ime()) == true
    if (hasFocus && !imeVisible) configureSystemBars()
  }

  private fun listenForInsets(target: View) {
    ViewCompat.setOnApplyWindowInsetsListener(target) { _, insets ->
      pushInsets(insets)
      insets
    }
    ViewCompat.setWindowInsetsAnimationCallback(
      target,
      object : WindowInsetsAnimationCompat.Callback(
        WindowInsetsAnimationCompat.Callback.DISPATCH_MODE_CONTINUE_ON_SUBTREE,
      ) {
        override fun onProgress(
          insets: WindowInsetsCompat,
          runningAnimations: MutableList<WindowInsetsAnimationCompat>,
        ): WindowInsetsCompat {
          pushInsets(insets)
          return insets
        }
      },
    )
    ViewCompat.requestApplyInsets(target)
  }

  private fun pushInsets(insets: WindowInsetsCompat) {
    val imePx = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
    val status =
      insets.getInsetsIgnoringVisibility(
        WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.displayCutout(),
      )
    val navigation = insets.getInsets(WindowInsetsCompat.Type.navigationBars())
    val cutoutTop = insets.displayCutout?.safeInsetTop ?: 0
    val resourceTop = statusBarResourceHeight()
    if (status.top > 0) statusBarHeightPx = status.top
    else if (cutoutTop > 0) statusBarHeightPx = cutoutTop
    else if (statusBarHeightPx == 0 && resourceTop > 0) statusBarHeightPx = resourceTop
    val safeTop = maxOf(status.top, cutoutTop, statusBarHeightPx, resourceTop)
    val safeBottom = navigation.bottom
    val safeLeft = maxOf(status.left, navigation.left)
    val safeRight = maxOf(status.right, navigation.right)
    if (
      imePx == lastImePx &&
        safeTop == lastSafeTop &&
        safeBottom == lastSafeBottom &&
        safeLeft == lastSafeLeft &&
        safeRight == lastSafeRight
    ) {
      return
    }
    lastImePx = imePx
    lastSafeTop = safeTop
    lastSafeBottom = safeBottom
    lastSafeLeft = safeLeft
    lastSafeRight = safeRight

    val density = resources.displayMetrics.density
    val imeCss = imePx / density
    val topCss = safeTop / density
    val bottomCss = safeBottom / density
    val leftCss = safeLeft / density
    val rightCss = safeRight / density
    imeBridge.cssPx = imeCss
    val js =
      "window.__SPELL_IME__=$imeCss;" +
        "document.documentElement.style.setProperty('--keyboard-inset','${imeCss}px');" +
        "document.documentElement.style.setProperty('--safe-area-top','${topCss}px');" +
        "document.documentElement.style.setProperty('--safe-area-bottom','${bottomCss}px');" +
        "document.documentElement.style.setProperty('--safe-area-left','${leftCss}px');" +
        "document.documentElement.style.setProperty('--safe-area-right','${rightCss}px');" +
        "window.dispatchEvent(new Event('spell-keyboard'));"
    webView?.post { webView?.evaluateJavascript(js, null) }
  }

  private fun resetInsetCache() {
    lastImePx = -1
    lastSafeTop = -1
    lastSafeBottom = -1
    lastSafeLeft = -1
    lastSafeRight = -1
  }

  private fun statusBarResourceHeight(): Int {
    val resId = resources.getIdentifier("status_bar_height", "dimen", "android")
    return if (resId > 0) resources.getDimensionPixelSize(resId) else 0
  }

  private fun configureSystemBars() {
    WindowCompat.getInsetsController(window, window.decorView).apply {
      isAppearanceLightStatusBars = false
      isAppearanceLightNavigationBars = false
      systemBarsBehavior =
        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      hide(WindowInsetsCompat.Type.statusBars())
      show(WindowInsetsCompat.Type.navigationBars())
    }
  }
}

class SpellImeBridge {
  @Volatile
  var cssPx = 0f

  @JavascriptInterface
  fun getInset(): Float = cssPx
}

class SpellUpdateBridge(private val activity: MainActivity) {
  @JavascriptInterface
  fun canInstall(): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      activity.packageManager.canRequestPackageInstalls()
    } else {
      true
    }
  }

  @JavascriptInterface
  fun requestInstallPermission() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      activity.startActivity(
        Intent(
          Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
          Uri.parse("package:${activity.packageName}"),
        ),
      )
    }
  }

  @JavascriptInterface
  fun installApk(path: String) {
    activity.runOnUiThread {
      val file = File(path)
      if (!file.isFile) return@runOnUiThread
      val uri =
        FileProvider.getUriForFile(
          activity,
          "${activity.packageName}.fileprovider",
          file,
        )
      val intent =
        Intent(Intent.ACTION_VIEW).apply {
          setDataAndType(uri, "application/vnd.android.package-archive")
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
      activity.startActivity(intent)
    }
  }
}

class SpellLinksBridge(private val activity: MainActivity) {
  @JavascriptInterface
  fun open(url: String) {
    activity.runOnUiThread {
      try {
        activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
      } catch (_: Exception) {
      }
    }
  }
}
