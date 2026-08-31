plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "work.patternflow.audio"
    compileSdk = 34

    defaultConfig {
        applicationId = "work.patternflow.audio"
        // 29 = Android 10, the floor for AudioPlaybackCapture - the whole
        // reason this app exists.
        minSdk = 29
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // The one dependency: the WebSocket to the panel. Everything else is
    // platform - org.json for the config, AudioRecord for the capture.
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
