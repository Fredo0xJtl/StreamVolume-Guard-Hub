using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;
using StreamVolumeGuard.Core.Audio;
using StreamVolumeGuard.Core.Browser;
using StreamVolumeGuard.Core.Bridge;
using StreamVolumeGuard.Core.Config;
using StreamVolumeGuard.Core.Control;
using StreamVolumeGuard.Core.Coverage;
using StreamVolumeGuard.Core.GlobalOutput;
using StreamVolumeGuard.Core.Localization;
using StreamVolumeGuard.Core.Logging;
using StreamVolumeGuard.Core.Normalization;
using StreamVolumeGuard.WindowsAudio;
using StreamVolumeGuard.App.Bridge;

namespace StreamVolumeGuard.App;

public partial class MainWindow : Window, INotifyPropertyChanged
{
    private readonly AudioEndpointMonitor endpointMonitor = new();
    private readonly AudioSessionMonitor sessionMonitor = new();
    private readonly GlobalOutputMonitor globalOutputMonitor = new();
    private VolumeNormalizer normalizer = new(NormalizerSettings.StreamDefault);
    private readonly AutoApplyPolicy autoApplyPolicy = new();
    private readonly AutoCalibrationGate autoCalibrationGate = new(AutoCalibrationGateSettings.StreamDefault);
    private readonly SessionReferenceVolumeStore referenceVolumes = new();
    private readonly TargetVolumeProfilePolicy targetVolumeProfilePolicy = new();
    private readonly WindowsManualVolumeOverrideDetector manualVolumeOverrideDetector = new();
    private readonly BrowserSessionConflictPolicy browserConflictPolicy = new(TimeSpan.FromSeconds(15));
    private readonly PanicService panic = new(panicTargetVolume: 0.15f);
    private readonly LocalActivityLog activityLog = LocalActivityLog.CreateDefault();
    private readonly JsonAppConfigStore configStore = JsonAppConfigStore.CreateDefault();
    private readonly BrowserSubSourceStore browserSourceStore = new();
    private readonly DesktopTextCatalog textCatalog = DesktopTextCatalog.ForCurrentSystem();
    private readonly LocalBrowserBridgeServer browserBridgeServer;
    private static readonly TimeSpan GlobalOutputLevelLogInterval = TimeSpan.FromSeconds(5);
    private static readonly string[] GuidedTestSteps =
    {
        "YouTube navigateur",
        "TikTok navigateur",
        "Spotify Web ou Deezer Web",
        "Discord",
        "VLC ou lecteur local",
        "Jeu ou application forte",
        "OBS meters visibles"
    };

    private readonly DispatcherTimer timer = new() { Interval = TimeSpan.FromMilliseconds(750) };
    private readonly DispatcherTimer targetSliderDebounceTimer = new() { Interval = TimeSpan.FromMilliseconds(150) };
    private static readonly TimeSpan GlobalOutputUnknownHoldDelay = TimeSpan.FromSeconds(4);
    private readonly Dictionary<string, DateTimeOffset> manualChanges = new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> excludedSessions = new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> visibleSessionIds = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string> sessionNamesById = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string> observedDecisionFingerprints = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string> coverageFingerprints = new(StringComparer.OrdinalIgnoreCase);
    private IReadOnlyList<AudioSessionSnapshot> latestWindowsSessionSnapshots = Array.Empty<AudioSessionSnapshot>();
    private string lastCoverageSummaryFingerprint = string.Empty;
    private bool isAutoEnabled;
    private bool isDarkTheme;
    private bool isStreamSafeEnabled;
    private bool isGlobalOutputUnknownActiveLogged;
    private DateTimeOffset? globalOutputUnknownStartedAtUtc;
    private bool uiReady;
    private bool suppressTargetSliderChange;
    private GlobalTargetSettings? pendingTargetSettings;
    private string bridgeToken = string.Empty;
    private string targetProfile = GlobalTargetSettings.StandardProfile;
    private float targetDecibels = GlobalTargetSettings.StandardDecibels;
    private DateTimeOffset targetUpdatedAtUtc = DateTimeOffset.UtcNow;
    private string themeButtonText = "Mode sombre";
    private string themeStatusText = "Theme clair";
    private string targetDisplayText = "Standard (-18 dB)";
    private string targetBridgeText = "Cible partagee avec l'extension via le bridge local.";
    private string windowSourceCountText = "0 source";
    private string browserSourceCountText = "0 source";
    private string coverageScoreText = "Couverture : 0/0 sources securisables";
    private string coverageDetailText = "Direct 0 | Fallback 0 | Action 0 | Limite 0 | Inconnu 0";
    private string watchCountText = "0 a surveiller";
    private string modeSummaryText = "Observation";
    private string extensionLinkText = "App seule : extension non connectee.";
    private string globalOutputStateText = "Unknown";
    private string globalOutputLevelText = "RMS inconnu";
    private string globalOutputPeakText = "Pic inconnu";
    private string globalOutputDeviceText = "Sortie inconnue";
    private string globalOutputInfoText = "Lecture seule : en attente de capture loopback.";
    private string guidedTestStatusText = "Mode test guide pret : commence par YouTube.";
    private DateTimeOffset? extensionLastSeenUtc;
    private DateTimeOffset lastGlobalOutputLevelLogUtc = DateTimeOffset.MinValue;
    private GlobalOutputState? lastGlobalOutputStateLogged;
    private int markCounter;
    private int guidedTestStepIndex = -1;
    private int simulatedBrowserSourceCounter;

    public ObservableCollection<SessionRow> Sessions { get; } = new();
    public ObservableCollection<BrowserSourceRow> BrowserSources { get; } = new();

    public event PropertyChangedEventHandler? PropertyChanged;

    public string ThemeButtonText
    {
        get => themeButtonText;
        private set => SetProperty(ref themeButtonText, value);
    }

    public string ThemeStatusText
    {
        get => themeStatusText;
        private set => SetProperty(ref themeStatusText, value);
    }

    public string TargetDisplayText
    {
        get => targetDisplayText;
        private set => SetProperty(ref targetDisplayText, value);
    }

    public string TargetBridgeText
    {
        get => targetBridgeText;
        private set => SetProperty(ref targetBridgeText, value);
    }

    public string WindowSourceCountText
    {
        get => windowSourceCountText;
        private set => SetProperty(ref windowSourceCountText, value);
    }

    public string BrowserSourceCountText
    {
        get => browserSourceCountText;
        private set => SetProperty(ref browserSourceCountText, value);
    }

    public string CoverageScoreText
    {
        get => coverageScoreText;
        private set => SetProperty(ref coverageScoreText, value);
    }

    public string CoverageDetailText
    {
        get => coverageDetailText;
        private set => SetProperty(ref coverageDetailText, value);
    }

    public string ExtensionLinkText
    {
        get => extensionLinkText;
        private set => SetProperty(ref extensionLinkText, value);
    }

    public string WatchCountText
    {
        get => watchCountText;
        private set => SetProperty(ref watchCountText, value);
    }

    public string ModeSummaryText
    {
        get => modeSummaryText;
        private set => SetProperty(ref modeSummaryText, value);
    }

    public string GlobalOutputStateText
    {
        get => globalOutputStateText;
        private set => SetProperty(ref globalOutputStateText, value);
    }

    public string GlobalOutputLevelText
    {
        get => globalOutputLevelText;
        private set => SetProperty(ref globalOutputLevelText, value);
    }

    public string GlobalOutputPeakText
    {
        get => globalOutputPeakText;
        private set => SetProperty(ref globalOutputPeakText, value);
    }

    public string GlobalOutputDeviceText
    {
        get => globalOutputDeviceText;
        private set => SetProperty(ref globalOutputDeviceText, value);
    }

    public string GlobalOutputInfoText
    {
        get => globalOutputInfoText;
        private set => SetProperty(ref globalOutputInfoText, value);
    }

    public string GuidedTestStatusText
    {
        get => guidedTestStatusText;
        private set => SetProperty(ref guidedTestStatusText, value);
    }

    public MainWindow()
    {
        ApplyTextCatalog(Application.Current.Resources, textCatalog);
        InitializeComponent();
        ApplyTextCatalog(textCatalog);
        DataContext = this;
        ApplyLocalizedInitialText();
        ApplyTheme(isDark: false);
        GuidedTestStatusText = textCatalog.GuidedTestReady;
        LoadLocalConfig();
        browserBridgeServer = new LocalBrowserBridgeServer(requiredToken: bridgeToken, globalTargetProvider: BuildGlobalTargetState);
        uiReady = true;
        SynchronizeStartupTargetWithWindows();

        activityLog.Write("app.start", "StreamVolume Guard Hub Desktop started", new Dictionary<string, string?>
        {
            ["logDirectory"] = activityLog.LogDirectory,
            ["configFile"] = configStore.ConfigFilePath,
            ["autoEnabled"] = isAutoEnabled.ToString(CultureInfo.InvariantCulture),
            ["streamSafeEnabled"] = isStreamSafeEnabled.ToString(CultureInfo.InvariantCulture),
            ["targetProfile"] = targetProfile,
            ["targetDecibels"] = FormatDecibels(targetDecibels),
            ["bridgeTokenRequired"] = browserBridgeServer.RequiresToken.ToString(CultureInfo.InvariantCulture)
        });
        UpdateLogStatus(textCatalog.LanguageCode == "fr"
            ? $"Mode observation actif. Logs locaux : {activityLog.LogDirectory}"
            : $"Observation mode active. Local logs: {activityLog.LogDirectory}");
        StartGlobalOutputMonitor();

        timer.Tick += (_, _) => SafeRefreshSessions(applyAuto: true);
        timer.Start();
        targetSliderDebounceTimer.Tick += (_, _) => CommitPendingTargetSliderChange();
        SafeRefreshSessions(applyAuto: false);
        RenderBrowserRows();
        StartBrowserBridge();
    }

    private void StartBrowserBridge()
    {
        browserBridgeServer.SourceReceived += BrowserBridge_SourceReceived;
        browserBridgeServer.ExtensionLogReceived += BrowserBridge_ExtensionLogReceived;
        browserBridgeServer.InvalidMessageReceived += BrowserBridge_InvalidMessageReceived;
        browserBridgeServer.BridgeError += BrowserBridge_Error;

        try
        {
            browserBridgeServer.Start();
            BridgeStatusText.Text = $"Bridge local actif : {browserBridgeServer.Url}";
            activityLog.Write("bridge.start", "Local browser bridge started", new Dictionary<string, string?>
            {
                ["url"] = browserBridgeServer.Url,
                ["globalTargetUrl"] = $"{browserBridgeServer.Url}{LocalBrowserBridgeServer.GlobalTargetPath}",
                ["tokenRequired"] = browserBridgeServer.RequiresToken.ToString(CultureInfo.InvariantCulture)
            });
        }
        catch (Exception ex)
        {
            BridgeStatusText.Text = $"Bridge local indisponible : {ex.Message}";
            LogError("bridge.start.error", "Local browser bridge failed to start", ex);
        }
    }

    private void BrowserBridge_SourceReceived(object? sender, BrowserSubSourceSnapshot source)
    {
        Dispatcher.Invoke(() =>
        {
            browserSourceStore.Upsert(source);
            browserSourceStore.RemoveStale(DateTimeOffset.UtcNow.AddMinutes(-5));
            MarkExtensionSeen(DateTimeOffset.UtcNow);
            RenderBrowserRows();
            activityLog.Write("browser.source.received", "Browser sub-source received from local bridge", BuildBrowserSourceFields(source));
            BridgeStatusText.Text = $"Bridge local actif : derniere source {source.SiteName} ({source.ControlSurface}).";
            UpdateLogStatus($"Source navigateur recue : {source.SiteName}. Controle : {source.ControlSurface}.");
        });
    }

    private void BrowserBridge_InvalidMessageReceived(object? sender, string error)
    {
        Dispatcher.Invoke(() =>
        {
            activityLog.Write("bridge.message.invalid", "Invalid browser bridge message", new Dictionary<string, string?>
            {
                ["error"] = error
            });
            BridgeStatusText.Text = "Bridge local actif : message navigateur refuse.";
        });
    }

    private void BrowserBridge_ExtensionLogReceived(object? sender, ExtensionLogEntry entry)
    {
        Dispatcher.Invoke(() =>
        {
            MarkExtensionSeen(DateTimeOffset.UtcNow);
            activityLog.Write($"extension.{entry.EventName}", entry.Message, BuildExtensionLogFields(entry));
            BridgeStatusText.Text = $"Bridge local actif : log extension {entry.EventName}.";
            UpdateLogStatus($"Log extension : {entry.EventName} ({entry.SiteName}).");
        });
    }

    private void BrowserBridge_Error(object? sender, Exception ex)
    {
        Dispatcher.Invoke(() =>
        {
            LogError("bridge.error", "Local browser bridge error", ex);
            BridgeStatusText.Text = $"Bridge local erreur : {ex.Message}";
        });
    }

    private void StartGlobalOutputMonitor()
    {
        if (IsGlobalOutputMonitorDisabled())
        {
            var snapshot = GlobalOutputLevelSnapshot.Unknown(
                DateTimeOffset.UtcNow,
                errorMessage: "Disabled by STREAMVOLUME_GUARD_DISABLE_GLOBAL_OUTPUT.");
            ApplyGlobalOutputSnapshot(snapshot);
            activityLog.Write("global_output.monitor.stopped", "Global output monitor disabled", BuildGlobalOutputFields(snapshot, new Dictionary<string, string?>
            {
                ["reason"] = "disabled"
            }));
            return;
        }

        globalOutputMonitor.LevelAvailable += GlobalOutputMonitor_LevelAvailable;
        globalOutputMonitor.MonitorError += GlobalOutputMonitor_Error;

        try
        {
            globalOutputMonitor.Start();
            activityLog.Write("global_output.monitor.started", "Global output monitor started", new Dictionary<string, string?>
            {
                ["device"] = globalOutputMonitor.CurrentDeviceName ?? "unknown",
                ["mode"] = "read-only"
            });
        }
        catch (Exception ex)
        {
            var snapshot = GlobalOutputLevelSnapshot.Unknown(DateTimeOffset.UtcNow, globalOutputMonitor.CurrentDeviceName, ex.Message);
            ApplyGlobalOutputSnapshot(snapshot);
            activityLog.Write("global_output.error", "Global output monitor failed to start", BuildGlobalOutputFields(snapshot, new Dictionary<string, string?>
            {
                ["errorType"] = ex.GetType().Name
            }));
        }
    }

    private void StopGlobalOutputMonitor()
    {
        globalOutputMonitor.LevelAvailable -= GlobalOutputMonitor_LevelAvailable;
        globalOutputMonitor.MonitorError -= GlobalOutputMonitor_Error;
        globalOutputMonitor.Stop();
        activityLog.Write("global_output.monitor.stopped", "Global output monitor stopped", new Dictionary<string, string?>
        {
            ["device"] = globalOutputMonitor.CurrentDeviceName ?? "unknown"
        });
        globalOutputMonitor.Dispose();
    }

    private void GlobalOutputMonitor_LevelAvailable(object? sender, GlobalOutputLevelSnapshot snapshot)
    {
        Dispatcher.Invoke(() =>
        {
            ApplyGlobalOutputSnapshot(snapshot);
            LogGlobalOutputSnapshot(snapshot);
        });
    }

    private void GlobalOutputMonitor_Error(object? sender, Exception ex)
    {
        Dispatcher.Invoke(() =>
        {
            var snapshot = GlobalOutputLevelSnapshot.Unknown(DateTimeOffset.UtcNow, globalOutputMonitor.CurrentDeviceName, ex.Message);
            ApplyGlobalOutputSnapshot(snapshot);
            activityLog.Write("global_output.error", "Global output monitor error", BuildGlobalOutputFields(snapshot, new Dictionary<string, string?>
            {
                ["errorType"] = ex.GetType().Name
            }));
        });
    }

    private void ApplyGlobalOutputSnapshot(GlobalOutputLevelSnapshot snapshot)
    {
        var unknownActivity = GlobalOutputUnknownActivityDetector.Evaluate(
            snapshot,
            latestWindowsSessionSnapshots,
            browserSourceStore.GetAll());
        var isConfirmedUnknownActivity = ShouldReportGlobalOutputUnknown(snapshot.ObservedAtUtc, unknownActivity);

        GlobalOutputStateText = snapshot.State.ToString();
        GlobalOutputLevelText = snapshot.IsAvailable ? $"RMS {FormatDecibels(snapshot.RmsDb)}" : textCatalog.GlobalOutputRmsUnknown;
        GlobalOutputPeakText = snapshot.IsAvailable
            ? (textCatalog.LanguageCode == "fr" ? $"Pic recent {FormatDecibels(snapshot.RecentPeakDb)}" : $"Recent peak {FormatDecibels(snapshot.RecentPeakDb)}")
            : textCatalog.GlobalOutputPeakUnknown;
        GlobalOutputDeviceText = snapshot.DeviceName;
        GlobalOutputInfoText = isConfirmedUnknownActivity
            ? (textCatalog.LanguageCode == "fr"
                ? "Son global actif sans source connue active. Verifie le melangeur Windows, OBS ou une application non detectee."
                : "Global audio is active without a known active source. Check the Windows mixer, OBS, or an undetected app.")
            : unknownActivity.IsUnknownActive
                ? (textCatalog.LanguageCode == "fr"
                    ? "Son global detecte, verification du suivi en cours..."
                    : "Global audio detected, verifying source coverage...")
            : BuildGlobalOutputInfo(snapshot);

        LogGlobalOutputUnknownActivity(snapshot, unknownActivity, isConfirmedUnknownActivity);
    }

    private void LogGlobalOutputSnapshot(GlobalOutputLevelSnapshot snapshot)
    {
        if (snapshot.ObservedAtUtc - lastGlobalOutputLevelLogUtc >= GlobalOutputLevelLogInterval)
        {
            activityLog.Write("global_output.level", "Global output level observed", BuildGlobalOutputFields(snapshot));
            lastGlobalOutputLevelLogUtc = snapshot.ObservedAtUtc;
        }

        if (lastGlobalOutputStateLogged == snapshot.State)
        {
            return;
        }

        lastGlobalOutputStateLogged = snapshot.State;
        if (snapshot.State is GlobalOutputState.Risky)
        {
            activityLog.Write("global_output.risky", "Global output level is risky", BuildGlobalOutputFields(snapshot));
        }
        else if (snapshot.State is GlobalOutputState.Silent)
        {
            activityLog.Write("global_output.silent", "Global output is silent", BuildGlobalOutputFields(snapshot));
        }
    }

    private bool ShouldReportGlobalOutputUnknown(DateTimeOffset observedAt, GlobalOutputUnknownActivityDecision decision)
    {
        if (!decision.IsUnknownActive)
        {
            globalOutputUnknownStartedAtUtc = null;
            return false;
        }

        globalOutputUnknownStartedAtUtc ??= observedAt;
        return (observedAt - globalOutputUnknownStartedAtUtc.Value) >= GlobalOutputUnknownHoldDelay;
    }

    private void LogGlobalOutputUnknownActivity(
        GlobalOutputLevelSnapshot snapshot,
        GlobalOutputUnknownActivityDecision decision,
        bool isConfirmedUnknownActive)
    {
        if (!isConfirmedUnknownActive)
        {
            if (!decision.IsUnknownActive || !isGlobalOutputUnknownActiveLogged)
            {
                return;
            }

            isGlobalOutputUnknownActiveLogged = false;
            activityLog.Write("global_output.unknown_active.resolved", "Global output is explained by known sources or is no longer active", BuildGlobalOutputFields(snapshot, BuildGlobalOutputUnknownActivityFields(decision)));
            return;
        }

        if (isGlobalOutputUnknownActiveLogged)
        {
            return;
        }

        isGlobalOutputUnknownActiveLogged = true;
        activityLog.Write("global_output.unknown_active", "Global output active without known active source", BuildGlobalOutputFields(snapshot, BuildGlobalOutputUnknownActivityFields(decision)));
    }

    private string BuildGlobalOutputInfo(GlobalOutputLevelSnapshot snapshot)
    {
        if (!snapshot.IsAvailable)
        {
            return string.IsNullOrWhiteSpace(snapshot.ErrorMessage)
                ? (textCatalog.LanguageCode == "fr"
                    ? "Capture loopback indisponible. L'app continue sans mesure globale."
                    : "Loopback capture unavailable. The app continues without global metering.")
                : (textCatalog.LanguageCode == "fr"
                    ? $"Capture loopback indisponible : {snapshot.ErrorMessage}"
                    : $"Loopback capture unavailable: {snapshot.ErrorMessage}");
        }

        return snapshot.State switch
        {
            GlobalOutputState.Risky when snapshot.IsClippingPossible => textCatalog.LanguageCode == "fr" ? "Risque de clipping possible sur la sortie globale. Lecture seule." : "Possible clipping risk on global output. Read only.",
            GlobalOutputState.Risky => textCatalog.LanguageCode == "fr" ? "Mix final potentiellement trop fort. Lecture seule." : "Final mix may be too loud. Read only.",
            GlobalOutputState.Silent => textCatalog.LanguageCode == "fr" ? "Aucun signal global detecte. Lecture seule." : "No global signal detected. Read only.",
            GlobalOutputState.Safe => textCatalog.LanguageCode == "fr" ? "Mix final dans une zone stable. Lecture seule." : "Final mix is in a stable range. Read only.",
            _ => textCatalog.LanguageCode == "fr" ? "Etat global inconnu. Lecture seule." : "Unknown global state. Read only."
        };
    }

    private static bool IsGlobalOutputMonitorDisabled()
    {
        var value = Environment.GetEnvironmentVariable("STREAMVOLUME_GUARD_DISABLE_GLOBAL_OUTPUT");
        return string.Equals(value, "1", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(value, "true", StringComparison.OrdinalIgnoreCase);
    }

    protected override void OnClosed(EventArgs e)
    {
        targetSliderDebounceTimer.Stop();
        timer.Stop();
        SaveLocalConfig();
        StopGlobalOutputMonitor();
        browserBridgeServer.SourceReceived -= BrowserBridge_SourceReceived;
        browserBridgeServer.ExtensionLogReceived -= BrowserBridge_ExtensionLogReceived;
        browserBridgeServer.InvalidMessageReceived -= BrowserBridge_InvalidMessageReceived;
        browserBridgeServer.BridgeError -= BrowserBridge_Error;
        browserBridgeServer.Stop();
        browserBridgeServer.Dispose();
        activityLog.Write("bridge.stop", "Local browser bridge stopped");
        base.OnClosed(e);
        Application.Current.Shutdown();
    }
    private void LoadLocalConfig()
    {
        try
        {
            var config = configStore.Load();
            excludedSessions.Clear();
            foreach (var sessionId in config.ExcludedSessionIds)
            {
                excludedSessions.Add(sessionId);
            }

            isAutoEnabled = config.AutoEnabled;
            isStreamSafeEnabled = config.StreamSafeEnabled;
            bridgeToken = config.BridgeToken;
            AutoEnabledCheckBox.IsChecked = isAutoEnabled;
            StreamSafeCheckBox.IsChecked = isStreamSafeEnabled;
            ApplyTheme(config.DarkThemeEnabled);
            ApplyGlobalTarget(new GlobalTargetSettings(config.TargetProfile, config.TargetDecibels), save: false, refresh: false);
            activityLog.Write("config.load", "Local config loaded", new Dictionary<string, string?>
            {
                ["configFile"] = configStore.ConfigFilePath,
                ["autoEnabled"] = isAutoEnabled.ToString(CultureInfo.InvariantCulture),
                ["streamSafeEnabled"] = isStreamSafeEnabled.ToString(CultureInfo.InvariantCulture),
                ["theme"] = isDarkTheme ? "dark" : "light",
                ["targetProfile"] = targetProfile,
                ["targetDecibels"] = FormatDecibels(targetDecibels),
                ["bridgeTokenRequired"] = (!string.IsNullOrWhiteSpace(bridgeToken)).ToString(CultureInfo.InvariantCulture),
                ["excludedSessions"] = excludedSessions.Count.ToString(CultureInfo.InvariantCulture)
            });
        }
        catch (Exception ex)
        {
            isAutoEnabled = AutoEnabledCheckBox.IsChecked == true;
            bridgeToken = string.Empty;
            LogError("config.load.error", "Local config failed to load", ex);
        }
    }

    private void SaveLocalConfig()
    {
        try
        {
            configStore.Save(new AppConfig
            {
                AutoEnabled = isAutoEnabled,
                DarkThemeEnabled = isDarkTheme,
                StreamSafeEnabled = isStreamSafeEnabled,
                TargetProfile = targetProfile,
                TargetDecibels = targetDecibels,
                BridgeToken = bridgeToken,
                ExcludedSessionIds = excludedSessions.ToList()
            });
            activityLog.Write("config.save", "Local config saved", new Dictionary<string, string?>
            {
                ["configFile"] = configStore.ConfigFilePath,
                ["autoEnabled"] = isAutoEnabled.ToString(CultureInfo.InvariantCulture),
                ["streamSafeEnabled"] = isStreamSafeEnabled.ToString(CultureInfo.InvariantCulture),
                ["theme"] = isDarkTheme ? "dark" : "light",
                ["targetProfile"] = targetProfile,
                ["targetDecibels"] = FormatDecibels(targetDecibels),
                ["bridgeTokenRequired"] = (!string.IsNullOrWhiteSpace(bridgeToken)).ToString(CultureInfo.InvariantCulture),
                ["excludedSessions"] = excludedSessions.Count.ToString(CultureInfo.InvariantCulture)
            });
        }
        catch (Exception ex)
        {
            LogError("config.save.error", "Local config failed to save", ex);
            UpdateLogStatus($"Impossible d'enregistrer la config locale : {ex.Message}");
        }
    }

    private void Refresh_Click(object sender, RoutedEventArgs e)
    {
        SafeRefreshSessions(applyAuto: true);
    }

    private void AutoEnabled_Changed(object sender, RoutedEventArgs e)
    {
        if (!uiReady)
        {
            return;
        }

        isAutoEnabled = AutoEnabledCheckBox.IsChecked == true;
        observedDecisionFingerprints.Clear();
        autoCalibrationGate.Clear();
        activityLog.Write(isAutoEnabled ? "auto.enabled" : "auto.disabled", isAutoEnabled ? "Automatic correction enabled" : "Observation mode enabled", new Dictionary<string, string?>
        {
            ["autoEnabled"] = isAutoEnabled.ToString(CultureInfo.InvariantCulture)
        });
        SaveLocalConfig();
        UpdateSummaryCards();
        UpdateLogStatus(isAutoEnabled
            ? (textCatalog.LanguageCode == "fr" ? "Auto actif : calibration ponctuelle par source active." : "Auto on: one-shot calibration per active source.")
            : (textCatalog.LanguageCode == "fr" ? "Mode observation : les corrections sont loggees sans modifier les volumes." : "Observation mode: corrections are logged without changing volumes."));
        SafeRefreshSessions(applyAuto: true);
    }

    private void StreamSafe_Changed(object sender, RoutedEventArgs e)
    {
        if (!uiReady)
        {
            return;
        }

        isStreamSafeEnabled = StreamSafeCheckBox.IsChecked == true;
        if (isStreamSafeEnabled)
        {
            if (AutoEnabledCheckBox.IsChecked != true)
            {
                AutoEnabledCheckBox.IsChecked = true;
            }

            var standardTarget = new GlobalTargetSettings(GlobalTargetSettings.StandardProfile, GlobalTargetSettings.StandardDecibels);
            if (!IsCurrentTarget(standardTarget))
            {
                ApplyGlobalTarget(standardTarget, save: false, refresh: true);
            }
        }

        activityLog.Write(isStreamSafeEnabled ? "stream_safe.enabled" : "stream_safe.disabled", isStreamSafeEnabled ? "Stream Safe enabled" : "Stream Safe disabled", new Dictionary<string, string?>
        {
            ["autoEnabled"] = isAutoEnabled.ToString(CultureInfo.InvariantCulture),
            ["streamSafeEnabled"] = isStreamSafeEnabled.ToString(CultureInfo.InvariantCulture),
            ["targetProfile"] = targetProfile,
            ["targetDecibels"] = FormatDecibels(targetDecibels)
        });
        SaveLocalConfig();
        UpdateSummaryCards();
        UpdateLogStatus(isStreamSafeEnabled
            ? (textCatalog.LanguageCode == "fr" ? "Stream Safe actif : Auto + cible Standard, sans boost dangereux." : "Stream Safe on: Auto + Standard target, without dangerous boosts.")
            : (textCatalog.LanguageCode == "fr" ? "Stream Safe inactif : les reglages manuels restent disponibles." : "Stream Safe off: manual controls remain available."));
    }

    private void Theme_Click(object sender, RoutedEventArgs e)
    {
        ApplyTheme(!isDarkTheme);
        activityLog.Write("ui.theme.changed", "Desktop theme changed", new Dictionary<string, string?>
        {
            ["theme"] = isDarkTheme ? "dark" : "light"
        });
        SaveLocalConfig();
        UpdateLogStatus(isDarkTheme ? "Theme sombre actif." : "Theme clair actif.");
    }

    private void TargetQuiet_Click(object sender, RoutedEventArgs e)
    {
        SetTargetPreset(GlobalTargetSettings.QuietProfile, GlobalTargetSettings.QuietDecibels);
    }

    private void TargetStandard_Click(object sender, RoutedEventArgs e)
    {
        SetTargetPreset(GlobalTargetSettings.StandardProfile, GlobalTargetSettings.StandardDecibels);
    }

    private void TargetLoud_Click(object sender, RoutedEventArgs e)
    {
        SetTargetPreset(GlobalTargetSettings.LoudProfile, GlobalTargetSettings.LoudDecibels);
    }

    private void TargetSlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (!uiReady || suppressTargetSliderChange)
        {
            return;
        }

        var nextTarget = (float)e.NewValue;
        var nextProfile = GlobalTargetSettings.NormalizeProfile(null, nextTarget);
        ScheduleTargetSliderCommit(new GlobalTargetSettings(nextProfile, nextTarget));
    }

    private void SetTargetPreset(string profile, float decibels)
    {
        pendingTargetSettings = null;
        targetSliderDebounceTimer.Stop();
        var nextTarget = new GlobalTargetSettings(profile, decibels).Normalize();
        if (IsCurrentTarget(nextTarget))
        {
            UpdateLogStatus($"Cible globale deja active : {TargetDisplayText}.");
            return;
        }

        ApplyGlobalTarget(nextTarget, save: true, refresh: true);
        activityLog.Write("target.changed", "Global target preset changed", BuildGlobalTargetFields());
        UpdateLogStatus($"Cible globale : {TargetDisplayText}. L'extension la lira via le bridge local.");
    }

    private void ScheduleTargetSliderCommit(GlobalTargetSettings settings)
    {
        if (IsCurrentTarget(settings))
        {
            return;
        }

        pendingTargetSettings = settings.Normalize();
        targetSliderDebounceTimer.Stop();
        targetSliderDebounceTimer.Start();
        UpdateLogStatus($"Cible en attente : {pendingTargetSettings.Profile} ({FormatDecibels(pendingTargetSettings.TargetDecibels)}).");
    }

    private void CommitPendingTargetSliderChange()
    {
        targetSliderDebounceTimer.Stop();
        var pending = pendingTargetSettings;
        pendingTargetSettings = null;
        if (pending is null)
        {
            return;
        }

        if (IsCurrentTarget(pending))
        {
            UpdateLogStatus($"Cible globale deja active : {TargetDisplayText}.");
            return;
        }

        ApplyGlobalTarget(pending, save: true, refresh: true);
        activityLog.Write("target.changed", "Global target changed from slider", BuildGlobalTargetFields());
        UpdateLogStatus($"Cible globale : {TargetDisplayText}. L'extension la lira via le bridge local.");
    }

    private bool IsCurrentTarget(GlobalTargetSettings settings)
    {
        var normalized = settings.Normalize();
        return string.Equals(targetProfile, normalized.Profile, StringComparison.OrdinalIgnoreCase)
            && Math.Abs(targetDecibels - normalized.TargetDecibels) <= 0.01f;
    }

    private void ApplyGlobalTarget(GlobalTargetSettings settings, bool save, bool refresh)
    {
        var normalized = settings.Normalize();
        if (IsCurrentTarget(normalized))
        {
            return;
        }

        targetProfile = normalized.Profile;
        targetDecibels = normalized.TargetDecibels;
        targetUpdatedAtUtc = DateTimeOffset.UtcNow;
        normalizer = new VolumeNormalizer(NormalizerSettings.FromTargetDecibels(targetDecibels));
        TargetDisplayText = $"{targetProfile} ({FormatDecibels(targetDecibels)})";
        TargetBridgeText = textCatalog.LanguageCode == "fr"
            ? $"Cible partagee : {FormatDecibels(targetDecibels)} pour Windows et navigateur quand le bridge est connecte."
            : $"Shared target: {FormatDecibels(targetDecibels)} for Windows and browser when the bridge is connected.";
        UpdateTargetPresetButtons();

        if (TargetSlider is not null && Math.Abs((float)TargetSlider.Value - targetDecibels) > 0.01f)
        {
            try
            {
                suppressTargetSliderChange = true;
                TargetSlider.Value = targetDecibels;
            }
            finally
            {
                suppressTargetSliderChange = false;
            }
        }

        UpdateSummaryCards();

        if (save)
        {
            SaveLocalConfig();
        }

        if (refresh)
        {
            observedDecisionFingerprints.Clear();
            autoCalibrationGate.Clear();
            manualChanges.Clear();
            SafeRefreshSessions(applyAuto: true);
        }
    }

    private void UpdateTargetPresetButtons()
    {
        if (TargetQuietButton is null || TargetStandardButton is null || TargetLoudButton is null)
        {
            return;
        }

        TargetQuietButton.Tag = string.Equals(targetProfile, GlobalTargetSettings.QuietProfile, StringComparison.OrdinalIgnoreCase) ? "Active" : null;
        TargetStandardButton.Tag = string.Equals(targetProfile, GlobalTargetSettings.StandardProfile, StringComparison.OrdinalIgnoreCase) ? "Active" : null;
        TargetLoudButton.Tag = string.Equals(targetProfile, GlobalTargetSettings.LoudProfile, StringComparison.OrdinalIgnoreCase) ? "Active" : null;
    }

    private GlobalTargetState BuildGlobalTargetState()
    {
        return GlobalTargetState.FromSettings(new GlobalTargetSettings(targetProfile, targetDecibels), targetUpdatedAtUtc);
    }

    private void NewTestSession_Click(object sender, RoutedEventArgs e)
    {
        markCounter = 0;
        guidedTestStepIndex = -1;
        GuidedTestStatusText = textCatalog.GuidedTestReady;
        observedDecisionFingerprints.Clear();
        var testSessionId = activityLog.StartNewTestSession();
        activityLog.Write("tester.session.start", "Manual test session started", new Dictionary<string, string?>
        {
            ["visibleWindowsSessions"] = Sessions.Count.ToString(CultureInfo.InvariantCulture),
            ["visibleBrowserSources"] = BrowserSources.Count.ToString(CultureInfo.InvariantCulture),
            ["autoEnabled"] = isAutoEnabled.ToString(CultureInfo.InvariantCulture),
            ["targetProfile"] = targetProfile,
            ["targetDecibels"] = FormatDecibels(targetDecibels)
        });

        var capturedReferences = CaptureCurrentReferenceVolumes(promoteHighVolumeToLoud: true);
        activityLog.Write("tester.references.captured", "Current Windows mixer volumes captured for diagnostics", BuildReferenceCaptureFields(capturedReferences));
        UpdateLogStatus($"Nouvelle session de test : {testSessionId}. Snapshot melangeur : {capturedReferences.TotalSessions} source(s).");
    }

    private void StartGuidedTest_Click(object sender, RoutedEventArgs e)
    {
        markCounter = 0;
        guidedTestStepIndex = -1;
        observedDecisionFingerprints.Clear();
        var testSessionId = activityLog.StartNewTestSession();
        activityLog.Write("guided_test.started", "Guided test session started", BuildGuidedTestFields(new Dictionary<string, string?>
        {
            ["testSessionId"] = testSessionId
        }));
        CaptureCurrentReferenceVolumes(promoteHighVolumeToLoud: true);
        AdvanceGuidedTestStep();
    }

    private void NextGuidedTestStep_Click(object sender, RoutedEventArgs e)
    {
        AdvanceGuidedTestStep();
    }

    private void AdvanceGuidedTestStep()
    {
        guidedTestStepIndex++;
        observedDecisionFingerprints.Clear();

        if (guidedTestStepIndex >= GuidedTestSteps.Length)
        {
            guidedTestStepIndex = GuidedTestSteps.Length;
            GuidedTestStatusText = textCatalog.LanguageCode == "fr"
                ? "Mode test guide termine : copie le rapport et verifie les alertes."
                : "Guided test complete: copy the report and check alerts.";
            activityLog.Write("guided_test.completed", "Guided test completed", BuildGuidedTestFields());
            UpdateLogStatus(textCatalog.LanguageCode == "fr"
                ? "Mode test guide termine. Clique Copier logs pour partager le rapport."
                : "Guided test complete. Click Copy logs to share the report.");
            return;
        }

        var stepName = GuidedTestSteps[guidedTestStepIndex];
        GuidedTestStatusText = textCatalog.LanguageCode == "fr"
            ? $"Etape {guidedTestStepIndex + 1}/{GuidedTestSteps.Length} : {stepName}"
            : $"Step {guidedTestStepIndex + 1}/{GuidedTestSteps.Length}: {stepName}";
        activityLog.Write("guided_test.step", $"Guided test step {guidedTestStepIndex + 1}: {stepName}", BuildGuidedTestFields());
        UpdateLogStatus(textCatalog.LanguageCode == "fr"
            ? $"{GuidedTestStatusText}. Lance une seule source, attends la stabilisation, puis passe a l'etape suivante."
            : $"{GuidedTestStatusText}. Play one source, wait for stabilization, then move to the next step.");
    }

    private void OpenObsGuide_Click(object sender, RoutedEventArgs e)
    {
        const string message =
            "OBS Stream Safety Setup\n\n" +
            "1. Capture les apps separement avec Application Audio Capture quand OBS le permet.\n" +
            "2. Evite les doublons avec Desktop Audio si les apps sont deja capturees.\n" +
            "3. Ajoute Compressor sur les sources a risque.\n" +
            "4. Mets Limiter en dernier filtre du mix ou de la source.\n\n" +
            "Le Hub ne lit pas encore les meters OBS : OBS reste la securite finale visuelle.";

        activityLog.Write("obs.guide.opened", "OBS Stream Safety guide opened", new Dictionary<string, string?>
        {
            ["targetProfile"] = targetProfile,
            ["streamSafeEnabled"] = isStreamSafeEnabled.ToString(CultureInfo.InvariantCulture)
        });
        MessageBox.Show(this, message, "Guide OBS", MessageBoxButton.OK, MessageBoxImage.Information);
    }

    private void SynchronizeStartupTargetWithWindows()
    {
        var capturedReferences = CaptureCurrentReferenceVolumes(promoteHighVolumeToLoud: false);
        if (capturedReferences.ControlledSessions <= 0)
        {
            activityLog.Write("startup.references.captured", "Startup Windows mixer snapshot captured without target promotion", BuildReferenceCaptureFields(capturedReferences));
            return;
        }

        var loud = new GlobalTargetSettings(GlobalTargetSettings.LoudProfile, GlobalTargetSettings.LoudDecibels);
        if (!IsCurrentTarget(loud))
        {
            ApplyGlobalTarget(loud, save: true, refresh: false);
            activityLog.Write("target.changed", "Global target aligned to startup Windows volume", BuildGlobalTargetFields(new Dictionary<string, string?>
            {
                ["trigger"] = "startup-windows-volume",
                ["capturedReferences"] = capturedReferences.TotalSessions.ToString(CultureInfo.InvariantCulture),
                ["controlledReferences"] = capturedReferences.ControlledSessions.ToString(CultureInfo.InvariantCulture)
            }));
        }

        activityLog.Write("startup.references.captured", "Startup Windows mixer snapshot captured", BuildReferenceCaptureFields(capturedReferences));
        UpdateLogStatus($"Demarrage cale sur le melangeur Windows : {capturedReferences.ControlledSessions} source(s) observee(s), cible {TargetDisplayText}.");
    }

    private ReferenceCaptureResult CaptureCurrentReferenceVolumes(bool promoteHighVolumeToLoud)
    {
        var windowsSessions = ReadWindowsSessions();
        LogSessionChanges(windowsSessions);
        var controlledSessions = 0;

        foreach (var item in windowsSessions)
        {
            referenceVolumes.Update(item.Snapshot.SessionId, item.Snapshot.VolumeScalar);
            manualVolumeOverrideDetector.RecordVolume(item.Snapshot.SessionId, item.Snapshot.VolumeScalar);
            if (IsManualReferenceCandidate(item.Snapshot))
            {
                controlledSessions++;
            }
        }

        var highVolumeSource = promoteHighVolumeToLoud
            ? windowsSessions.FirstOrDefault(item => IsManualHighVolumeReferenceCandidate(item.Snapshot))
            : null;
        if (highVolumeSource is not null)
        {
            PromoteTargetToLoudForManualWindowsVolume(new WindowsManualVolumeOverride(
                highVolumeSource.Snapshot.SessionId,
                highVolumeSource.Snapshot.DisplayName,
                highVolumeSource.Snapshot.VolumeScalar,
                highVolumeSource.Snapshot.VolumeScalar));
        }

        return new ReferenceCaptureResult(windowsSessions.Count, controlledSessions);
    }

    private static Dictionary<string, string?> BuildReferenceCaptureFields(ReferenceCaptureResult result)
    {
        return new Dictionary<string, string?>
        {
            ["capturedReferences"] = result.TotalSessions.ToString(CultureInfo.InvariantCulture),
            ["controlledReferences"] = result.ControlledSessions.ToString(CultureInfo.InvariantCulture)
        };
    }

    private Dictionary<string, string?> BuildGuidedTestFields(Dictionary<string, string?>? extraFields = null)
    {
        var currentStepName = guidedTestStepIndex >= 0 && guidedTestStepIndex < GuidedTestSteps.Length
            ? GuidedTestSteps[guidedTestStepIndex]
            : string.Empty;

        var fields = new Dictionary<string, string?>
        {
            ["guidedStepIndex"] = guidedTestStepIndex.ToString(CultureInfo.InvariantCulture),
            ["guidedStepTotal"] = GuidedTestSteps.Length.ToString(CultureInfo.InvariantCulture),
            ["guidedStepName"] = currentStepName,
            ["visibleWindowsSessions"] = Sessions.Count.ToString(CultureInfo.InvariantCulture),
            ["visibleBrowserSources"] = BrowserSources.Count.ToString(CultureInfo.InvariantCulture),
            ["autoEnabled"] = isAutoEnabled.ToString(CultureInfo.InvariantCulture),
            ["streamSafeEnabled"] = isStreamSafeEnabled.ToString(CultureInfo.InvariantCulture),
            ["targetProfile"] = targetProfile,
            ["targetDecibels"] = FormatDecibels(targetDecibels)
        };

        if (extraFields is null)
        {
            return fields;
        }

        foreach (var (key, value) in extraFields)
        {
            fields[key] = value;
        }

        return fields;
    }

    private void MarkStep_Click(object sender, RoutedEventArgs e)
    {
        markCounter++;
        observedDecisionFingerprints.Clear();
        activityLog.Write("tester.mark", $"Manual test mark {markCounter}", new Dictionary<string, string?>
        {
            ["visibleWindowsSessions"] = Sessions.Count.ToString(CultureInfo.InvariantCulture),
            ["visibleBrowserSources"] = BrowserSources.Count.ToString(CultureInfo.InvariantCulture),
            ["autoEnabled"] = isAutoEnabled.ToString(CultureInfo.InvariantCulture),
            ["targetProfile"] = targetProfile,
            ["targetDecibels"] = FormatDecibels(targetDecibels)
        });
        UpdateLogStatus($"Etape {markCounter} marquee. Tu peux lancer ou changer de page puis copier les logs recents.");
    }

    private void CopyRecentLogs_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var report = activityLog.ReadRecentReport(maxLines: 300, testSessionId: activityLog.TestSessionId);
            if (string.IsNullOrWhiteSpace(report))
            {
                report = "Aucun log recent pour StreamVolume Guard Hub.";
            }

            Clipboard.SetText(report);
            activityLog.Write("logs.copy", "Readable test report copied to clipboard", new Dictionary<string, string?>
            {
                ["format"] = "readable-report",
                ["maxLines"] = "300",
                ["scope"] = "current-test-session"
            });
            UpdateLogStatus($"Rapport lisible de la session {activityLog.TestSessionId} copie dans le presse-papiers.");
        }
        catch (Exception ex)
        {
            LogError("logs.copy.error", "Failed to copy recent logs", ex);
            UpdateLogStatus($"Impossible de copier les logs : {ex.Message}");
        }
    }

    private void OpenLogs_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            Directory.CreateDirectory(activityLog.LogDirectory);
            Process.Start(new ProcessStartInfo
            {
                FileName = activityLog.LogDirectory,
                UseShellExecute = true
            });
            activityLog.Write("logs.open", "Log folder opened", new Dictionary<string, string?>
            {
                ["logDirectory"] = activityLog.LogDirectory
            });
            UpdateLogStatus($"Dossier logs ouvert : {activityLog.LogDirectory}");
        }
        catch (Exception ex)
        {
            LogError("logs.open.error", "Failed to open log folder", ex);
            UpdateLogStatus($"Impossible d'ouvrir les logs : {ex.Message}");
        }
    }

    private void SimulateBrowserSource_Click(object sender, RoutedEventArgs e)
    {
        simulatedBrowserSourceCounter++;
        var now = DateTimeOffset.UtcNow;
        var scenario = simulatedBrowserSourceCounter % 3;
        var source = scenario switch
        {
            1 => CreateSimulatedBrowserSource("sim:chrome:youtube", "YouTube", "Chrome", 42, "Source navigateur simulee - YouTube", 0.82f, 0.74f, AudioSessionStatus.Risky, now),
            2 => CreateSimulatedBrowserSource("sim:chrome:tiktok", "TikTok", "Chrome", 43, "Source navigateur simulee - TikTok", 0.68f, 0.80f, AudioSessionStatus.Risky, now),
            _ => CreateSimulatedBrowserSource("sim:chrome:spotify-web", "Spotify Web", "Chrome", 44, "Source navigateur simulee - Spotify Web", 0.34f, 0.95f, AudioSessionStatus.Safe, now)
        };

        browserSourceStore.Upsert(source);
        browserSourceStore.RemoveStale(now.AddMinutes(-5));
        RenderBrowserRows();
        activityLog.Write("browser.source.simulated", "Browser sub-source simulated", BuildBrowserSourceFields(source));
        UpdateLogStatus($"Sous-source navigateur simulee : {source.SiteName}. Controle prevu : {source.ControlSurface}.");
    }

    private void Panic_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var windowsSessions = ReadWindowsSessions();
            LogSessionChanges(windowsSessions);
            var decisions = panic.Apply(windowsSessions.Select(item => item.Snapshot)).ToList();

            activityLog.Write("panic.start", "Panic requested", new Dictionary<string, string?>
            {
                ["sessions"] = windowsSessions.Count.ToString(CultureInfo.InvariantCulture),
                ["autoEnabled"] = isAutoEnabled.ToString(CultureInfo.InvariantCulture)
            });

            for (var i = 0; i < windowsSessions.Count; i++)
            {
                if (decisions[i].ShouldApplyVolume)
                {
                    windowsSessions[i].SetVolume(decisions[i].TargetVolumeScalar);
                    LogVolumeDecision("volume.panic", "Panic lowered session", windowsSessions[i].Snapshot, decisions[i]);
                }
            }

            RenderRows(windowsSessions, decisions, annotateObservation: false);
            UpdateLogStatus("Panic applique. Les actions sont enregistrees dans les logs locaux.");
        }
        catch (Exception ex)
        {
            LogError("panic.error", "Panic failed", ex);
            UpdateLogStatus($"Erreur Panic : {ex.Message}");
        }
    }

    private void SafeRefreshSessions(bool applyAuto)
    {
        try
        {
            UpdateExtensionLinkText(DateTimeOffset.UtcNow);
            RefreshSessions(applyAuto);
        }
        catch (Exception ex)
        {
            LogError("refresh.error", "Audio refresh failed", ex);
            UpdateLogStatus($"Erreur de rafraichissement audio : {ex.Message}");
        }
    }

    private void RefreshSessions(bool applyAuto)
    {
        var windowsSessions = ReadWindowsSessions();
        LogSessionChanges(windowsSessions);

        var now = DateTimeOffset.UtcNow;
        var browserSources = browserSourceStore.GetAll();
        var manualOverride = manualVolumeOverrideDetector.Detect(windowsSessions.Select(item => item.Snapshot));
        if (applyAuto && isAutoEnabled && manualOverride is not null)
        {
            PromoteTargetToLoudForManualWindowsVolume(manualOverride);
        }

        var targetSettings = new GlobalTargetSettings(targetProfile, targetDecibels);
        var decisions = windowsSessions
            .Select(item =>
            {
                var baseDecision = normalizer.Evaluate(item.Snapshot, now);
                referenceVolumes.GetOrAdd(item.Snapshot);
                var profileDecision = targetVolumeProfilePolicy.Apply(item.Snapshot, baseDecision, targetSettings);
                return browserConflictPolicy.Apply(item.Snapshot, profileDecision, browserSources, now);
            })
            .ToList();

        if (applyAuto)
        {
            for (var i = 0; i < windowsSessions.Count; i++)
            {
                var decision = decisions[i];
                if (isAutoEnabled)
                {
                    decision = autoCalibrationGate.Evaluate(windowsSessions[i].Snapshot, decision, now);
                    decisions[i] = decision;
                }

                var plan = autoApplyPolicy.Evaluate(decision, isAutoEnabled);
                if (plan.ShouldSetVolume)
                {
                    windowsSessions[i].SetVolume(plan.TargetVolumeScalar);
                    manualVolumeOverrideDetector.RecordVolume(windowsSessions[i].Snapshot.SessionId, plan.TargetVolumeScalar);
                    autoCalibrationGate.RecordApplied(
                        windowsSessions[i].Snapshot,
                        now,
                        decision.Reason == AutoCalibrationGate.SafetySpikeReason);
                    LogVolumeDecision("volume.auto", "Automatic volume correction applied", windowsSessions[i].Snapshot, decision);
                }
                else if (decision.Reason == BrowserSessionConflictPolicy.ConflictReason)
                {
                    LogBrowserConflictDecision(windowsSessions[i].Snapshot, decision);
                }
                else if (isAutoEnabled && (decision.Reason == AutoCalibrationGate.LockedReason || decision.Reason == AutoCalibrationGate.SilentReason))
                {
                    LogAutoCalibrationGateDecision(windowsSessions[i].Snapshot, decision);
                }
                else if (plan.ShouldLogWouldApply)
                {
                    LogWouldApplyDecision(windowsSessions[i].Snapshot, decision);
                }
            }
        }

        RenderRows(windowsSessions, decisions);
    }

    private void PromoteTargetToLoudForManualWindowsVolume(WindowsManualVolumeOverride manualOverride)
    {
        var loud = new GlobalTargetSettings(GlobalTargetSettings.LoudProfile, GlobalTargetSettings.LoudDecibels);
        referenceVolumes.Update(manualOverride.SessionId, manualOverride.CurrentVolumeScalar);
        manualVolumeOverrideDetector.RecordVolume(manualOverride.SessionId, manualOverride.CurrentVolumeScalar);

        if (IsCurrentTarget(loud))
        {
            return;
        }

        ApplyGlobalTarget(loud, save: true, refresh: false);
        activityLog.Write("target.changed", "Global target changed from Windows manual volume", BuildGlobalTargetFields(new Dictionary<string, string?>
        {
            ["trigger"] = "windows-manual-volume",
            ["sessionId"] = manualOverride.SessionId,
            ["display"] = manualOverride.DisplayName,
            ["previousVolume"] = FormatPercent(manualOverride.PreviousVolumeScalar),
            ["currentVolume"] = FormatPercent(manualOverride.CurrentVolumeScalar)
        }));
        UpdateLogStatus($"Volume manuel Windows detecte sur {manualOverride.DisplayName}. Cible globale : {TargetDisplayText}.");
    }

    private static bool IsManualHighVolumeReferenceCandidate(AudioSessionSnapshot snapshot)
    {
        return IsManualReferenceCandidate(snapshot)
            && snapshot.VolumeScalar >= WindowsManualVolumeOverrideSettings.StreamDefault.HighVolumeThreshold;
    }

    private static bool IsManualReferenceCandidate(AudioSessionSnapshot snapshot)
    {
        return snapshot.IsControllable
            && !snapshot.IsExcluded
            && !snapshot.IsMuted
            && !snapshot.IsSystemSession;
    }

    private List<WindowsAudioSession> ReadWindowsSessions()
    {
        var endpoints = endpointMonitor.GetActiveRenderEndpoints();
        var sessions = sessionMonitor.ReadSessions(endpoints, DateTimeOffset.UtcNow);
        return sessions
            .Select(item => item with
            {
                Snapshot = item.Snapshot with
                {
                    IsExcluded = excludedSessions.Contains(item.Snapshot.SessionId),
                    LastManualChangeUtc = manualChanges.TryGetValue(item.Snapshot.SessionId, out var changedAt) ? changedAt : null
                }
            })
            .ToList();
    }

    private void RenderRows(IReadOnlyList<WindowsAudioSession> windowsSessions, IReadOnlyList<VolumeDecision> decisions, bool annotateObservation = true)
    {
        Sessions.Clear();
        var systemSounds = new List<(WindowsAudioSession Session, VolumeDecision Decision)>();
        latestWindowsSessionSnapshots = windowsSessions.Select(item => item.Snapshot).ToList();
        var coverageSummary = CoverageClassifier.BuildSummary(latestWindowsSessionSnapshots, browserSourceStore.GetAll());
        ApplyCoverageSummary(coverageSummary);
        var coverageById = coverageSummary.Sources.ToDictionary(source => source.SourceId, StringComparer.OrdinalIgnoreCase);

        for (var i = 0; i < windowsSessions.Count; i++)
        {
            if (WindowsSystemSessionClassifier.IsSystemSounds(windowsSessions[i].Snapshot))
            {
                systemSounds.Add((windowsSessions[i], decisions[i]));
                continue;
            }

            AddSessionRow(windowsSessions[i], decisions[i], annotateObservation, coverageById);
        }

        if (systemSounds.Count > 0)
        {
            AddSystemSoundsRow(systemSounds, annotateObservation);
        }

        UpdateSummaryCards();
    }

    private void AddSessionRow(
        WindowsAudioSession session,
        VolumeDecision decision,
        bool annotateObservation,
        IReadOnlyDictionary<string, CoverageSourceState> coverageById)
    {
        coverageById.TryGetValue(session.Snapshot.SessionId, out var coverage);
        Sessions.Add(SessionRow.From(
            session.Snapshot,
            BuildDisplayDecision(decision, annotateObservation),
            session.SetVolume,
            RecordManualChange,
            SetExcluded,
            coverage,
            textCatalog));
    }

    private void AddSystemSoundsRow(IReadOnlyList<(WindowsAudioSession Session, VolumeDecision Decision)> systemSounds, bool annotateObservation)
    {
        var snapshot = WindowsSystemSessionClassifier.BuildGroupSnapshot(systemSounds.Select(item => item.Session.Snapshot).ToList());
        var decision = WindowsSystemSessionClassifier.BuildGroupDecision(systemSounds.Select(item => item.Decision).ToList());

        Sessions.Add(SessionRow.From(
            snapshot,
            BuildDisplayDecision(decision, annotateObservation),
            volume => SetSystemSoundsVolume(systemSounds, volume),
            (_, _, volume) => RecordSystemSoundsManualChange(systemSounds, snapshot.DisplayName, volume),
            (_, _, isExcluded) => SetSystemSoundsExcluded(systemSounds, snapshot.DisplayName, isExcluded),
            null,
            textCatalog));
    }

    private VolumeDecision BuildDisplayDecision(VolumeDecision decision, bool annotateObservation)
    {
        return annotateObservation && !isAutoEnabled && decision.ShouldApplyVolume
            ? decision with { Reason = $"Observation: {decision.Reason}" }
            : decision;
    }

    private static void SetSystemSoundsVolume(IReadOnlyList<(WindowsAudioSession Session, VolumeDecision Decision)> systemSounds, float volume)
    {
        foreach (var item in systemSounds)
        {
            if (item.Session.Snapshot.IsControllable)
            {
                item.Session.SetVolume(volume);
            }
        }
    }

    private void RecordSystemSoundsManualChange(IReadOnlyList<(WindowsAudioSession Session, VolumeDecision Decision)> systemSounds, string displayName, float volume)
    {
        foreach (var item in systemSounds)
        {
            if (item.Session.Snapshot.IsControllable)
            {
                RecordManualChange(item.Session.Snapshot.SessionId, displayName, volume);
            }
        }
    }

    private void SetSystemSoundsExcluded(IReadOnlyList<(WindowsAudioSession Session, VolumeDecision Decision)> systemSounds, string displayName, bool isExcluded)
    {
        foreach (var item in systemSounds)
        {
            SetExcluded(item.Session.Snapshot.SessionId, displayName, isExcluded);
        }
    }

    private void RenderBrowserRows()
    {
        BrowserSources.Clear();
        var browserSources = browserSourceStore.GetAll();
        var coverageSummary = CoverageClassifier.BuildSummary(latestWindowsSessionSnapshots, browserSources);
        ApplyCoverageSummary(coverageSummary);
        var coverageById = coverageSummary.Sources.ToDictionary(source => source.SourceId, StringComparer.OrdinalIgnoreCase);
        foreach (var source in browserSources)
        {
            coverageById.TryGetValue(source.SourceId, out var coverage);
            BrowserSources.Add(BrowserSourceRow.From(source, coverage, textCatalog));
        }

        UpdateSummaryCards();
    }

    private void ApplyCoverageSummary(CoverageSummary summary)
    {
        CoverageScoreText = textCatalog.LanguageCode == "fr"
            ? $"Couverture : {summary.SecurableCount}/{summary.TotalCount} sources securisables"
            : $"Coverage: {summary.SecurableCount}/{summary.TotalCount} securable sources";
        CoverageDetailText =
            $"{textCatalog.DirectControl} {summary.DirectCount} | {textCatalog.WindowsFallback} {summary.FallbackCount} | {textCatalog.ActionRequired} {summary.NeedsActionCount} | {textCatalog.Limited} {summary.LimitedCount} | {textCatalog.Unknown} {summary.UnknownCount}";
        LogCoverageSummary(summary);
    }

    private void LogCoverageSummary(CoverageSummary summary)
    {
        var summaryFingerprint = string.Join(
            "|",
            summary.TotalCount,
            summary.SecurableCount,
            summary.DirectCount,
            summary.FallbackCount,
            summary.NeedsActionCount,
            summary.LimitedCount,
            summary.UnknownCount);

        if (!string.Equals(lastCoverageSummaryFingerprint, summaryFingerprint, StringComparison.Ordinal))
        {
            lastCoverageSummaryFingerprint = summaryFingerprint;
            activityLog.Write("coverage.summary.updated", "Coverage summary updated", new Dictionary<string, string?>
            {
                ["total"] = summary.TotalCount.ToString(CultureInfo.InvariantCulture),
                ["securable"] = summary.SecurableCount.ToString(CultureInfo.InvariantCulture),
                ["direct"] = summary.DirectCount.ToString(CultureInfo.InvariantCulture),
                ["fallback"] = summary.FallbackCount.ToString(CultureInfo.InvariantCulture),
                ["needsAction"] = summary.NeedsActionCount.ToString(CultureInfo.InvariantCulture),
                ["limited"] = summary.LimitedCount.ToString(CultureInfo.InvariantCulture),
                ["unknown"] = summary.UnknownCount.ToString(CultureInfo.InvariantCulture)
            });
        }

        foreach (var source in summary.Sources)
        {
            LogCoverageSourceIfChanged(source);
        }
    }

    private void LogCoverageSourceIfChanged(CoverageSourceState source)
    {
        var fingerprint = string.Join(
            "|",
            source.Bucket,
            source.ControlSurface,
            source.IsControllable,
            source.HasWindowsFallback,
            source.RecommendedAction);

        if (coverageFingerprints.TryGetValue(source.SourceId, out var previous) && previous == fingerprint)
        {
            return;
        }

        coverageFingerprints[source.SourceId] = fingerprint;
        var fields = BuildCoverageSourceFields(source);
        activityLog.Write("coverage.source.classified", "Coverage source classified", fields);

        if (source.Bucket is CoverageBucket.NeedsUserAction)
        {
            activityLog.Write("coverage.source.action_required", "Coverage source requires user action", fields);
        }
        else if (source.Bucket is CoverageBucket.WindowsFallback)
        {
            activityLog.Write("coverage.source.fallback_available", "Coverage source can use Windows fallback", fields);
        }
        else if (source.Bucket is CoverageBucket.Limited)
        {
            activityLog.Write("coverage.source.limited", "Coverage source is limited", fields);
        }
    }

    private static Dictionary<string, string?> BuildCoverageSourceFields(CoverageSourceState source)
    {
        return new Dictionary<string, string?>
        {
            ["sourceId"] = source.SourceId,
            ["display"] = source.DisplayName,
            ["origin"] = source.Origin.ToString(),
            ["controlSurface"] = source.ControlSurface.ToString(),
            ["status"] = source.Status.ToString(),
            ["controllable"] = source.IsControllable.ToString(CultureInfo.InvariantCulture),
            ["coverageBucket"] = source.Bucket.ToString(),
            ["coverageStatus"] = FormatCoverageBucket(source.Bucket),
            ["coverageAction"] = source.RecommendedAction,
            ["hasWindowsFallback"] = source.HasWindowsFallback.ToString(CultureInfo.InvariantCulture)
        };
    }

    private void RecordManualChange(string sessionId, string displayName, float volumeScalar)
    {
        manualChanges[sessionId] = DateTimeOffset.UtcNow;
        referenceVolumes.Update(sessionId, volumeScalar);
        manualVolumeOverrideDetector.RecordVolume(sessionId, volumeScalar);
        activityLog.Write("volume.manual", "Manual volume changed", new Dictionary<string, string?>
        {
            ["sessionId"] = sessionId,
            ["display"] = displayName,
            ["volume"] = FormatPercent(volumeScalar),
            ["mixerVolume"] = FormatPercent(volumeScalar)
        });
        UpdateLogStatus($"Volume manuel enregistre pour {displayName}.");
    }

    private void SetExcluded(string sessionId, string displayName, bool isExcluded)
    {
        if (isExcluded)
        {
            excludedSessions.Add(sessionId);
        }
        else
        {
            excludedSessions.Remove(sessionId);
        }

        SaveLocalConfig();

        activityLog.Write("session.exclude", isExcluded ? "Session excluded" : "Session included", new Dictionary<string, string?>
        {
            ["sessionId"] = sessionId,
            ["display"] = displayName,
            ["excluded"] = isExcluded.ToString(CultureInfo.InvariantCulture)
        });
        UpdateLogStatus(isExcluded ? $"Source exclue : {displayName}." : $"Source reintegree : {displayName}.");
    }

    private void MarkExtensionSeen(DateTimeOffset seenAtUtc)
    {
        extensionLastSeenUtc = seenAtUtc;
        UpdateExtensionLinkText(seenAtUtc);
    }

    private void UpdateExtensionLinkText(DateTimeOffset nowUtc)
    {
        var isRecent = extensionLastSeenUtc.HasValue && nowUtc - extensionLastSeenUtc.Value <= TimeSpan.FromSeconds(30);
        ExtensionLinkText = isRecent
            ? textCatalog.ExtensionConnected
            : textCatalog.ExtensionStandaloneGlobal;
    }

    private void UpdateSummaryCards()
    {
        WindowSourceCountText = FormatCount(Sessions.Count, textCatalog.SourceSingular);
        BrowserSourceCountText = FormatCount(BrowserSources.Count, textCatalog.SourceSingular);
        var watchCount = Sessions.Count(IsWatchRow) + BrowserSources.Count(IsWatchRow);
        WatchCountText = $"{watchCount} {textCatalog.WatchSuffix}";
        ModeSummaryText = isStreamSafeEnabled
            ? $"Stream Safe {FormatDecibels(targetDecibels)}"
            : isAutoEnabled ? $"Auto {FormatDecibels(targetDecibels)}" : $"{textCatalog.ObserveAbbreviation} {FormatDecibels(targetDecibels)}";
    }

    private bool IsWatchRow(SessionRow row)
    {
        return IsWatchStatus(row.Status)
            || IsWatchControl(row.ControlSurface)
            || string.Equals(row.IsControllable, textCatalog.No, StringComparison.OrdinalIgnoreCase);
    }

    private bool IsWatchRow(BrowserSourceRow row)
    {
        return IsWatchStatus(row.Status)
            || IsWatchControl(row.ControlSurface)
            || string.Equals(row.IsControllable, textCatalog.No, StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsWatchStatus(string status)
    {
        return string.Equals(status, AudioSessionStatus.Risky.ToString(), StringComparison.OrdinalIgnoreCase)
            || string.Equals(status, AudioSessionStatus.Unknown.ToString(), StringComparison.OrdinalIgnoreCase)
            || string.Equals(status, AudioSessionStatus.Uncontrollable.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsWatchControl(string controlSurface)
    {
        return string.Equals(controlSurface, AudioControlSurface.ObserveOnly.ToString(), StringComparison.OrdinalIgnoreCase)
            || string.Equals(controlSurface, AudioControlSurface.Unknown.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    private static string FormatCount(int count, string label)
    {
        return count <= 1 ? $"{count} {label}" : $"{count} {label}s";
    }

    private static string FormatCoverageBucket(CoverageBucket bucket)
    {
        return bucket switch
        {
            CoverageBucket.DirectControl => "Direct",
            CoverageBucket.WindowsFallback => "Fallback Windows",
            CoverageBucket.NeedsUserAction => "Action requise",
            CoverageBucket.Limited => "Limite",
            CoverageBucket.Unknown => "Inconnu",
            _ => "Inconnu"
        };
    }

    private void LogSessionChanges(IReadOnlyList<WindowsAudioSession> windowsSessions)
    {
        var currentIds = windowsSessions.Select(item => item.Snapshot.SessionId).ToHashSet(StringComparer.OrdinalIgnoreCase);
        autoCalibrationGate.RemoveMissing(currentIds);
        referenceVolumes.RemoveMissing(currentIds);

        foreach (var session in windowsSessions)
        {
            sessionNamesById[session.Snapshot.SessionId] = session.Snapshot.DisplayName;
            if (!visibleSessionIds.Contains(session.Snapshot.SessionId))
            {
                activityLog.Write("session.detected", "Audio session detected", BuildSessionFields(session.Snapshot));
            }
        }

        foreach (var previousId in visibleSessionIds.ToArray())
        {
            if (!currentIds.Contains(previousId))
            {
                observedDecisionFingerprints.Remove(previousId);
                sessionNamesById.TryGetValue(previousId, out var displayName);
                activityLog.Write("session.disappeared", "Audio session disappeared", new Dictionary<string, string?>
                {
                    ["sessionId"] = previousId,
                    ["display"] = displayName ?? "unknown"
                });
            }
        }

        visibleSessionIds.Clear();
        foreach (var currentId in currentIds)
        {
            visibleSessionIds.Add(currentId);
        }
    }

    private void LogVolumeDecision(string eventName, string message, AudioSessionSnapshot snapshot, VolumeDecision decision)
    {
        var fields = BuildSessionFields(snapshot);
        fields["status"] = decision.Status.ToString();
        fields["reason"] = decision.Reason;
        fields["target"] = FormatPercent(decision.TargetVolumeScalar);
        activityLog.Write(eventName, message, fields);
    }

    private void LogWouldApplyDecision(AudioSessionSnapshot snapshot, VolumeDecision decision)
    {
        var fingerprint = string.Join("|", decision.Status, decision.Reason, FormatPercent(snapshot.VolumeScalar), FormatPercent(decision.TargetVolumeScalar));
        if (observedDecisionFingerprints.TryGetValue(snapshot.SessionId, out var previous) && previous == fingerprint)
        {
            return;
        }

        observedDecisionFingerprints[snapshot.SessionId] = fingerprint;
        var fields = BuildSessionFields(snapshot);
        fields["status"] = decision.Status.ToString();
        fields["reason"] = decision.Reason;
        fields["target"] = FormatPercent(decision.TargetVolumeScalar);
        fields["autoEnabled"] = isAutoEnabled.ToString(CultureInfo.InvariantCulture);
        activityLog.Write("volume.would_apply", "Observation mode would apply correction", fields);
    }

    private void LogBrowserConflictDecision(AudioSessionSnapshot snapshot, VolumeDecision decision)
    {
        var fingerprint = string.Join("|", "browser-conflict", decision.Status, decision.Reason, FormatPercent(snapshot.VolumeScalar));
        if (observedDecisionFingerprints.TryGetValue(snapshot.SessionId, out var previous) && previous == fingerprint)
        {
            return;
        }

        observedDecisionFingerprints[snapshot.SessionId] = fingerprint;
        var fields = BuildSessionFields(snapshot);
        fields["status"] = decision.Status.ToString();
        fields["reason"] = decision.Reason;
        fields["target"] = FormatPercent(decision.TargetVolumeScalar);
        fields["autoEnabled"] = isAutoEnabled.ToString(CultureInfo.InvariantCulture);
        activityLog.Write("volume.browser_conflict_skip", "Windows session correction skipped because BrowserGain is already active", fields);
    }

    private void LogAutoCalibrationGateDecision(AudioSessionSnapshot snapshot, VolumeDecision decision)
    {
        var fingerprint = string.Join("|", "auto-calibration-gate", decision.Status, decision.Reason, FormatPercent(snapshot.VolumeScalar));
        if (observedDecisionFingerprints.TryGetValue(snapshot.SessionId, out var previous) && previous == fingerprint)
        {
            return;
        }

        observedDecisionFingerprints[snapshot.SessionId] = fingerprint;
        var fields = BuildSessionFields(snapshot);
        fields["status"] = decision.Status.ToString();
        fields["reason"] = decision.Reason;
        fields["target"] = FormatPercent(decision.TargetVolumeScalar);
        fields["autoEnabled"] = isAutoEnabled.ToString(CultureInfo.InvariantCulture);
        activityLog.Write("volume.auto_locked", "Automatic correction skipped by one-shot calibration gate", fields);
    }

    private static BrowserSubSourceSnapshot CreateSimulatedBrowserSource(
        string sourceId,
        string siteName,
        string browserProcess,
        int tabId,
        string title,
        float currentLevel,
        float appliedGain,
        AudioSessionStatus status,
        DateTimeOffset now)
    {
        return new BrowserSubSourceSnapshot(
            SourceId: sourceId,
            BrowserProcess: browserProcess,
            TabId: tabId,
            SiteName: siteName,
            Title: title,
            CurrentLevel: currentLevel,
            AppliedGain: appliedGain,
            Status: status,
            Origin: AudioSourceOrigin.BrowserExtension,
            ControlSurface: AudioControlSurface.BrowserGain,
            LastSeenUtc: now);
    }

    private static Dictionary<string, string?> BuildSessionFields(AudioSessionSnapshot snapshot)
    {
        return new Dictionary<string, string?>
        {
            ["sessionId"] = snapshot.SessionId,
            ["deviceId"] = snapshot.DeviceId,
            ["display"] = snapshot.DisplayName,
            ["process"] = snapshot.ProcessName ?? "unknown",
            ["peak"] = FormatPercent(snapshot.PeakLevel),
            ["volume"] = FormatPercent(snapshot.VolumeScalar),
            ["muted"] = snapshot.IsMuted.ToString(CultureInfo.InvariantCulture),
            ["system"] = snapshot.IsSystemSession.ToString(CultureInfo.InvariantCulture),
            ["controllable"] = snapshot.IsControllable.ToString(CultureInfo.InvariantCulture),
            ["excluded"] = snapshot.IsExcluded.ToString(CultureInfo.InvariantCulture),
            ["origin"] = AudioSourceOrigin.WindowsSession.ToString(),
            ["controlSurface"] = snapshot.IsControllable ? AudioControlSurface.WindowsSessionVolume.ToString() : AudioControlSurface.ObserveOnly.ToString()
        };
    }

    private Dictionary<string, string?> BuildBrowserSourceFields(BrowserSubSourceSnapshot source)
    {
        var row = BrowserSourceRow.From(source, textCatalog: textCatalog);
        return new Dictionary<string, string?>
        {
            ["sourceId"] = source.SourceId,
            ["browserProcess"] = source.BrowserProcess,
            ["tabId"] = source.TabId?.ToString(CultureInfo.InvariantCulture) ?? string.Empty,
            ["siteName"] = source.SiteName,
            ["title"] = source.Title,
            ["level"] = FormatPercent(source.CurrentLevel),
            ["gain"] = FormatPercent(source.AppliedGain),
            ["calibrationState"] = source.CalibrationState,
            ["measuredRmsDb"] = source.MeasuredRmsDb.HasValue ? FormatDecibels(source.MeasuredRmsDb.Value) : string.Empty,
            ["appliedGainDb"] = source.AppliedGainDb.HasValue ? FormatDecibels(source.AppliedGainDb.Value) : string.Empty,
            ["calibrationReason"] = source.CalibrationReason,
            ["captureSignalState"] = source.CaptureSignalState,
            ["issueReason"] = row.BrowserIssueReason,
            ["recoveryAction"] = row.RecoveryAction,
            ["targetRmsDb"] = source.TargetRmsDb.HasValue ? FormatDecibels(source.TargetRmsDb.Value) : string.Empty,
            ["targetProfile"] = source.TargetProfile,
            ["status"] = source.Status.ToString(),
            ["origin"] = source.Origin.ToString(),
            ["controlSurface"] = source.ControlSurface.ToString(),
            ["controllable"] = source.IsControllable.ToString(CultureInfo.InvariantCulture),
            ["lastSeen"] = source.LastSeenUtc.ToString("O", CultureInfo.InvariantCulture)
        };
    }

    private static Dictionary<string, string?> BuildExtensionLogFields(ExtensionLogEntry entry)
    {
        return new Dictionary<string, string?>
        {
            ["extensionEvent"] = entry.EventName,
            ["severity"] = entry.Severity,
            ["sourceId"] = entry.SourceId,
            ["browserProcess"] = entry.BrowserProcess,
            ["tabId"] = entry.TabId?.ToString(CultureInfo.InvariantCulture) ?? string.Empty,
            ["siteName"] = entry.SiteName,
            ["status"] = entry.Status.ToString(),
            ["origin"] = entry.Origin.ToString(),
            ["controlSurface"] = entry.ControlSurface.ToString(),
            ["captureSignalState"] = entry.CaptureSignalState,
            ["calibrationState"] = entry.CalibrationState,
            ["measuredRmsDb"] = entry.MeasuredRmsDb.HasValue ? FormatDecibels(entry.MeasuredRmsDb.Value) : string.Empty,
            ["appliedGainDb"] = entry.AppliedGainDb.HasValue ? FormatDecibels(entry.AppliedGainDb.Value) : string.Empty,
            ["calibrationReason"] = entry.CalibrationReason,
            ["targetRmsDb"] = entry.TargetRmsDb.HasValue ? FormatDecibels(entry.TargetRmsDb.Value) : string.Empty,
            ["targetProfile"] = entry.TargetProfile,
            ["lastSeen"] = entry.LastSeenUtc.ToString("O", CultureInfo.InvariantCulture)
        };
    }

    private Dictionary<string, string?> BuildGlobalTargetFields()
    {
        return new Dictionary<string, string?>
        {
            ["type"] = "global_target_state",
            ["source"] = "Desktop",
            ["targetProfile"] = targetProfile,
            ["targetDecibels"] = FormatDecibels(targetDecibels),
            ["targetRmsDb"] = FormatDecibels(targetDecibels),
            ["updatedAt"] = targetUpdatedAtUtc.ToString("O", CultureInfo.InvariantCulture)
        };
    }

    private Dictionary<string, string?> BuildGlobalTargetFields(Dictionary<string, string?> extraFields)
    {
        var fields = BuildGlobalTargetFields();
        foreach (var (key, value) in extraFields)
        {
            fields[key] = value;
        }

        return fields;
    }

    private static Dictionary<string, string?> BuildGlobalOutputFields(
        GlobalOutputLevelSnapshot snapshot,
        Dictionary<string, string?>? extraFields = null)
    {
        var fields = GlobalOutputLogFields.FromSnapshot(snapshot);
        if (extraFields is null)
        {
            return fields;
        }

        foreach (var (key, value) in extraFields)
        {
            fields[key] = value;
        }

        return fields;
    }

    private static Dictionary<string, string?> BuildGlobalOutputUnknownActivityFields(GlobalOutputUnknownActivityDecision decision)
    {
        return new Dictionary<string, string?>
        {
            ["reason"] = decision.Reason,
            ["knownSources"] = decision.KnownSources.ToString(CultureInfo.InvariantCulture),
            ["knownWindowsSources"] = decision.KnownWindowsSources.ToString(CultureInfo.InvariantCulture),
            ["knownBrowserSources"] = decision.KnownBrowserSources.ToString(CultureInfo.InvariantCulture),
            ["activeKnownSources"] = decision.ActiveKnownSources.ToString(CultureInfo.InvariantCulture),
            ["highestKnownLevel"] = FormatPercent(decision.HighestKnownLevel)
        };
    }

    private void LogError(string eventName, string message, Exception ex)
    {
        activityLog.Write(eventName, message, new Dictionary<string, string?>
        {
            ["errorType"] = ex.GetType().Name,
            ["error"] = ex.Message
        });
    }

    private void UpdateLogStatus(string message)
    {
        LogStatusText.Text = message;
    }

    private void ApplyTheme(bool isDark)
    {
        isDarkTheme = isDark;
        ThemeButtonText = isDark ? textCatalog.ThemeLightButton : textCatalog.ThemeDarkButton;
        ThemeStatusText = isDark ? textCatalog.ThemeDarkStatus : textCatalog.ThemeLightStatus;

        SetBrush("AppBackgroundBrush", isDark ? "#11161C" : "#F7F8FA");
        SetBrush("PanelBrush", isDark ? "#18212B" : "#FFFFFF");
        SetBrush("PanelSoftBrush", isDark ? "#141C25" : "#F5F8FA");
        SetBrush("HeaderBrush", "#10202C");
        SetBrush("BorderBrushSoft", isDark ? "#2B3846" : "#D7E1E8");
        SetBrush("TextBrush", isDark ? "#ECF1F5" : "#17202A");
        SetBrush("MutedTextBrush", isDark ? "#A8B3BF" : "#60707D");
        SetBrush("AccentBrush", isDark ? "#9DDCE3" : "#1F6F78");
        SetBrush("TableAltBrush", isDark ? "#141C25" : "#F5F8FA");
        SetBrush("SafeBrush", isDark ? "#7DF0AA" : "#188A4D");
        SetBrush("WarnBrush", isDark ? "#F3C46D" : "#D88211");
        SetBrush("DangerBrush", isDark ? "#FFB4B4" : "#C73333");
    }

    private void ApplyTextCatalog(DesktopTextCatalog catalog)
    {
        ApplyTextCatalog(Resources, catalog);
    }

    private static void ApplyTextCatalog(ResourceDictionary resources, DesktopTextCatalog catalog)
    {
        foreach (var item in catalog.ToResourceMap())
        {
            resources[item.Key] = item.Value;
        }
    }

    private void ApplyLocalizedInitialText()
    {
        TargetBridgeText = textCatalog.TargetBridgeDefault;
        WindowSourceCountText = FormatCount(0, textCatalog.SourceSingular);
        BrowserSourceCountText = FormatCount(0, textCatalog.SourceSingular);
        CoverageScoreText = textCatalog.LanguageCode == "fr"
            ? "Couverture : 0/0 sources securisables"
            : "Coverage: 0/0 securable sources";
        CoverageDetailText =
            $"{textCatalog.DirectControl} 0 | {textCatalog.WindowsFallback} 0 | {textCatalog.ActionRequired} 0 | {textCatalog.Limited} 0 | {textCatalog.Unknown} 0";
        WatchCountText = $"0 {textCatalog.WatchSuffix}";
        ModeSummaryText = textCatalog.ObservationMode;
        ExtensionLinkText = textCatalog.ExtensionStandalone;
        GlobalOutputStateText = textCatalog.GlobalOutputUnknownState;
        GlobalOutputLevelText = textCatalog.GlobalOutputRmsUnknown;
        GlobalOutputPeakText = textCatalog.GlobalOutputPeakUnknown;
        GlobalOutputDeviceText = textCatalog.GlobalOutputDeviceUnknown;
        GlobalOutputInfoText = textCatalog.GlobalOutputWaiting;
        GuidedTestStatusText = textCatalog.GuidedTestReady;
    }

    private void SetBrush(string key, string color)
    {
        Resources[key] = new SolidColorBrush((Color)ColorConverter.ConvertFromString(color));
    }

    private void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }

    private void SetProperty<T>(ref T field, T value, [CallerMemberName] string? propertyName = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value))
        {
            return;
        }

        field = value;
        OnPropertyChanged(propertyName);
    }

    private static string FormatPercent(float value)
    {
        return (value * 100.0f).ToString("0", CultureInfo.InvariantCulture) + "%";
    }

    private static string FormatDecibels(float value)
    {
        return value.ToString("0.#", CultureInfo.InvariantCulture) + " dB";
    }

    private static string FormatDecibels(double value)
    {
        return double.IsFinite(value)
            ? value.ToString("0.#", CultureInfo.InvariantCulture) + " dB"
            : "inconnu";
    }
}

public sealed record ReferenceCaptureResult(int TotalSessions, int ControlledSessions);

public sealed class BrowserSourceRow
{
    private BrowserSourceRow(BrowserSubSourceSnapshot source, CoverageSourceState? coverage, DesktopTextCatalog textCatalog)
    {
        BrowserProcess = source.BrowserProcess;
        SiteName = source.SiteName;
        Title = source.Title;
        Status = source.Status.ToString();
        CurrentLevelPercent = $"{source.CurrentLevel:P0}";
        AppliedGainPercent = $"{source.AppliedGain:P0}";
        Calibration = FormatCalibration(source, textCatalog);
        Origin = source.Origin.ToString();
        ControlSurface = source.ControlSurface.ToString();
        IsControllable = source.IsControllable ? textCatalog.Yes : textCatalog.No;
        BrowserIssueReason = FormatIssueReason(source, textCatalog);
        RecoveryAction = FormatRecoveryAction(source, textCatalog);
        CoverageStatus = FormatCoverageStatus(coverage, textCatalog);
        CoverageAction = FormatCoverageAction(coverage, RecoveryAction, textCatalog);
    }

    public string BrowserProcess { get; }
    public string SiteName { get; }
    public string Title { get; }
    public string Status { get; }
    public string CurrentLevelPercent { get; }
    public string AppliedGainPercent { get; }
    public string Calibration { get; }
    public string Origin { get; }
    public string ControlSurface { get; }
    public string IsControllable { get; }
    public string CoverageStatus { get; }
    public string CoverageAction { get; }
    public string BrowserIssueReason { get; }
    public string RecoveryAction { get; }

    public static BrowserSourceRow From(
        BrowserSubSourceSnapshot source,
        CoverageSourceState? coverage = null,
        DesktopTextCatalog? textCatalog = null)
    {
        return new BrowserSourceRow(source, coverage, textCatalog ?? DesktopTextCatalog.ForCurrentSystem());
    }


    private static string FormatIssueReason(BrowserSubSourceSnapshot source, DesktopTextCatalog textCatalog)
    {
        if (source.ControlSurface is AudioControlSurface.BrowserGain && source.IsControllable)
        {
            return string.Equals(source.CalibrationState, "locked", StringComparison.OrdinalIgnoreCase)
                ? textCatalog.BrowserGainActive
                : textCatalog.BrowserCalibrationInProgress;
        }

        var browserReason = (source.Reason ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(browserReason))
        {
            return browserReason;
        }

        var browserState = (source.BrowserState ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(browserState))
        {
            return browserState;
        }

        var captureSignalState = (source.CaptureSignalState ?? string.Empty).Trim();
        var calibrationReason = (source.CalibrationReason ?? string.Empty).Trim();
        if (string.Equals(source.CalibrationState, "skipped", StringComparison.OrdinalIgnoreCase))
        {
            return string.IsNullOrWhiteSpace(calibrationReason) ? textCatalog.BrowserInsufficientSignal : calibrationReason;
        }

        if (!string.IsNullOrWhiteSpace(captureSignalState) && !string.Equals(captureSignalState, "signal", StringComparison.OrdinalIgnoreCase))
        {
            var diagnosticText = $"{captureSignalState} {calibrationReason}";
            if (diagnosticText.Contains("needs-user-action", StringComparison.OrdinalIgnoreCase))
            {
                return textCatalog.TabActivationRequired;
            }

            if (diagnosticText.Contains("restricted", StringComparison.OrdinalIgnoreCase))
            {
                return textCatalog.BrowserRestrictedPage;
            }

            if (diagnosticText.Contains("unsupported", StringComparison.OrdinalIgnoreCase))
            {
                return textCatalog.BrowserCaptureUnavailable;
            }

            return $"Capture {captureSignalState}";
        }

        if (!string.IsNullOrWhiteSpace(calibrationReason))
        {
            return calibrationReason;
        }

        return source.ControlSurface switch
        {
            AudioControlSurface.ObserveOnly => textCatalog.ObserveOnlySource,
            AudioControlSurface.Unknown => textCatalog.BrowserControlUnknown,
            _ => source.IsControllable ? textCatalog.BrowserControlAvailable : textCatalog.BrowserDirectControlUnavailable
        };
    }

    private static string FormatRecoveryAction(BrowserSubSourceSnapshot source, DesktopTextCatalog textCatalog)
    {
        if (source.ControlSurface is AudioControlSurface.BrowserGain && source.IsControllable)
        {
            return string.Equals(source.CalibrationState, "locked", StringComparison.OrdinalIgnoreCase)
                ? textCatalog.KeepBrowserGain
                : textCatalog.WaitForMeasurement;
        }

        var explicitAction = (source.RecommendedAction ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(explicitAction))
        {
            return explicitAction;
        }

        var reason = $"{source.CaptureSignalState ?? string.Empty} {source.CalibrationReason ?? string.Empty} {source.Reason ?? string.Empty} {source.BrowserState ?? string.Empty}";
        if (reason.Contains("needs-user-action", StringComparison.OrdinalIgnoreCase))
        {
            return textCatalog.ClickProtectActiveTab;
        }

        if (reason.Contains("restricted", StringComparison.OrdinalIgnoreCase))
        {
            return textCatalog.UseObsSeparateCapture;
        }

        if (reason.Contains("unsupported", StringComparison.OrdinalIgnoreCase))
        {
            return textCatalog.UseChromeOrFallback;
        }

        if (reason.Contains("no-signal", StringComparison.OrdinalIgnoreCase) || reason.Contains("insufficient-signal", StringComparison.OrdinalIgnoreCase))
        {
            return textCatalog.ReloadReprotectFallback;
        }

        if (reason.Contains("waiting-for-audio", StringComparison.OrdinalIgnoreCase))
        {
            return textCatalog.PlayTab;
        }

        if (source.ControlSurface is AudioControlSurface.ObserveOnly or AudioControlSurface.Unknown)
        {
            return textCatalog.UseObsSeparateCapture;
        }

        return textCatalog.VerifyLogsThenObs;
    }

    private static string FormatCalibration(BrowserSubSourceSnapshot source, DesktopTextCatalog textCatalog)
    {
        if (string.IsNullOrWhiteSpace(source.CalibrationState))
        {
            return source.ControlSurface is AudioControlSurface.BrowserGain ? textCatalog.BrowserMeasuring : textCatalog.BrowserFallbackWindows;
        }

        var detail = source.AppliedGainDb.HasValue
            ? $" {source.AppliedGainDb.Value:+0.##;-0.##;0} dB"
            : string.Empty;
        return $"{source.CalibrationState}{detail}";
    }

    private static string FormatCoverageStatus(CoverageSourceState? coverage, DesktopTextCatalog textCatalog)
    {
        return coverage?.Bucket switch
        {
            CoverageBucket.DirectControl => textCatalog.DirectControl,
            CoverageBucket.WindowsFallback => textCatalog.WindowsFallback,
            CoverageBucket.NeedsUserAction => textCatalog.ActionRequired,
            CoverageBucket.Limited => textCatalog.Limited,
            CoverageBucket.Unknown => textCatalog.Unknown,
            _ => textCatalog.Unknown
        };
    }

    private static string FormatCoverageAction(CoverageSourceState? coverage, string fallback, DesktopTextCatalog textCatalog)
    {
        return coverage?.Bucket switch
        {
            CoverageBucket.DirectControl => textCatalog.OkDirect,
            CoverageBucket.WindowsFallback => textCatalog.WindowsFallback,
            CoverageBucket.NeedsUserAction => textCatalog.ActionRequired,
            CoverageBucket.Limited => textCatalog.UseObsSeparateCapture,
            CoverageBucket.Unknown => textCatalog.UseObsSeparateCapture,
            _ => fallback
        };
    }
}

public sealed class SessionRow : INotifyPropertyChanged
{
    private readonly Action<float> setVolume;
    private readonly Action<string, string, float> recordManualChange;
    private readonly Action<string, string, bool> setExcluded;
    private float volumeScalar;
    private bool isExcluded;
    private bool ready;

    private SessionRow(
        AudioSessionSnapshot snapshot,
        VolumeDecision decision,
        Action<float> setVolume,
        Action<string, string, float> recordManualChange,
        Action<string, string, bool> setExcluded,
        CoverageSourceState? coverage,
        DesktopTextCatalog textCatalog)
    {
        this.setVolume = setVolume;
        this.recordManualChange = recordManualChange;
        this.setExcluded = setExcluded;
        SessionId = snapshot.SessionId;
        DisplayName = snapshot.DisplayName;
        Status = decision.Status.ToString();
        PeakPercent = $"{snapshot.PeakLevel:P0}";
        volumeScalar = snapshot.VolumeScalar;
        isExcluded = snapshot.IsExcluded;
        LastAction = decision.Reason;
        Origin = AudioSourceOrigin.WindowsSession.ToString();
        ControlSurface = snapshot.IsControllable ? AudioControlSurface.WindowsSessionVolume.ToString() : AudioControlSurface.ObserveOnly.ToString();
        IsControllable = snapshot.IsControllable ? textCatalog.Yes : textCatalog.No;
        CoverageStatus = FormatCoverageStatus(coverage, textCatalog);
        CoverageAction = FormatCoverageAction(
            coverage,
            snapshot.IsControllable ? textCatalog.OkDirect : textCatalog.UseObsSeparateCapture,
            textCatalog);
        ready = true;
    }

    public string SessionId { get; }
    public string DisplayName { get; }
    public string Status { get; }
    public string PeakPercent { get; }
    public string LastAction { get; }
    public string Origin { get; }
    public string ControlSurface { get; }
    public string IsControllable { get; }
    public string CoverageStatus { get; }
    public string CoverageAction { get; }

    public float VolumeScalar
    {
        get => volumeScalar;
        set
        {
            var next = Clamp(value);
            if (Math.Abs(volumeScalar - next) < 0.001f) return;
            volumeScalar = next;
            OnPropertyChanged();
            OnPropertyChanged(nameof(VolumePercent));

            if (ready)
            {
                setVolume(next);
                recordManualChange(SessionId, DisplayName, next);
            }
        }
    }

    public string VolumePercent => $"{VolumeScalar:P0}";

    public bool IsExcluded
    {
        get => isExcluded;
        set
        {
            if (isExcluded == value) return;
            isExcluded = value;
            OnPropertyChanged();
            if (ready)
            {
                setExcluded(SessionId, DisplayName, value);
            }
        }
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public static SessionRow From(
        AudioSessionSnapshot snapshot,
        VolumeDecision decision,
        Action<float> setVolume,
        Action<string, string, float> recordManualChange,
        Action<string, string, bool> setExcluded,
        CoverageSourceState? coverage = null,
        DesktopTextCatalog? textCatalog = null)
    {
        return new SessionRow(snapshot, decision, setVolume, recordManualChange, setExcluded, coverage, textCatalog ?? DesktopTextCatalog.ForCurrentSystem());
    }

    private void OnPropertyChanged([CallerMemberName] string? name = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }

    private static float Clamp(float value)
    {
        if (float.IsNaN(value) || float.IsInfinity(value)) return 0.0f;
        if (value < 0.0f) return 0.0f;
        if (value > 1.0f) return 1.0f;
        return value;
    }

    private static string FormatCoverageStatus(CoverageSourceState? coverage, DesktopTextCatalog textCatalog)
    {
        return coverage?.Bucket switch
        {
            CoverageBucket.DirectControl => textCatalog.DirectControl,
            CoverageBucket.WindowsFallback => textCatalog.WindowsFallback,
            CoverageBucket.NeedsUserAction => textCatalog.ActionRequired,
            CoverageBucket.Limited => textCatalog.Limited,
            CoverageBucket.Unknown => textCatalog.Unknown,
            _ => textCatalog.Unknown
        };
    }

    private static string FormatCoverageAction(CoverageSourceState? coverage, string fallback, DesktopTextCatalog textCatalog)
    {
        return coverage?.Bucket switch
        {
            CoverageBucket.DirectControl => textCatalog.OkDirect,
            CoverageBucket.WindowsFallback => textCatalog.WindowsFallback,
            CoverageBucket.NeedsUserAction => textCatalog.ActionRequired,
            CoverageBucket.Limited => textCatalog.UseObsSeparateCapture,
            CoverageBucket.Unknown => textCatalog.UseObsSeparateCapture,
            _ => fallback
        };
    }
}



