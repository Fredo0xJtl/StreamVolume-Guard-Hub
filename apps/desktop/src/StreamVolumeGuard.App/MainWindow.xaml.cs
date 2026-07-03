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
using StreamVolumeGuard.Core.Logging;
using StreamVolumeGuard.Core.Normalization;
using StreamVolumeGuard.WindowsAudio;
using StreamVolumeGuard.App.Bridge;

namespace StreamVolumeGuard.App;

public partial class MainWindow : Window, INotifyPropertyChanged
{
    private readonly AudioEndpointMonitor endpointMonitor = new();
    private readonly AudioSessionMonitor sessionMonitor = new();
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
    private readonly LocalBrowserBridgeServer browserBridgeServer;
    private readonly DispatcherTimer timer = new() { Interval = TimeSpan.FromMilliseconds(750) };
    private readonly DispatcherTimer targetSliderDebounceTimer = new() { Interval = TimeSpan.FromMilliseconds(150) };
    private readonly Dictionary<string, DateTimeOffset> manualChanges = new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> excludedSessions = new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> visibleSessionIds = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string> sessionNamesById = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string> observedDecisionFingerprints = new(StringComparer.OrdinalIgnoreCase);
    private bool isAutoEnabled;
    private bool isDarkTheme;
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
    private string watchCountText = "0 a surveiller";
    private string modeSummaryText = "Observation";
    private string extensionLinkText = "App seule : extension non connectee.";
    private DateTimeOffset? extensionLastSeenUtc;
    private int markCounter;
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

    public MainWindow()
    {
        InitializeComponent();
        DataContext = this;
        ApplyTheme(isDark: false);
        LoadLocalConfig();
        browserBridgeServer = new LocalBrowserBridgeServer(requiredToken: bridgeToken, globalTargetProvider: BuildGlobalTargetState);
        uiReady = true;
        SynchronizeStartupTargetWithWindows();

        activityLog.Write("app.start", "StreamVolume Guard Hub Desktop started", new Dictionary<string, string?>
        {
            ["logDirectory"] = activityLog.LogDirectory,
            ["configFile"] = configStore.ConfigFilePath,
            ["autoEnabled"] = isAutoEnabled.ToString(CultureInfo.InvariantCulture),
            ["targetProfile"] = targetProfile,
            ["targetDecibels"] = FormatDecibels(targetDecibels),
            ["bridgeTokenRequired"] = browserBridgeServer.RequiresToken.ToString(CultureInfo.InvariantCulture)
        });
        UpdateLogStatus($"Mode observation actif. Logs locaux : {activityLog.LogDirectory}");

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

    protected override void OnClosed(EventArgs e)
    {
        SaveLocalConfig();
        browserBridgeServer.Stop();
        activityLog.Write("bridge.stop", "Local browser bridge stopped");
        base.OnClosed(e);
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
            bridgeToken = config.BridgeToken;
            AutoEnabledCheckBox.IsChecked = isAutoEnabled;
            ApplyTheme(config.DarkThemeEnabled);
            ApplyGlobalTarget(new GlobalTargetSettings(config.TargetProfile, config.TargetDecibels), save: false, refresh: false);
            activityLog.Write("config.load", "Local config loaded", new Dictionary<string, string?>
            {
                ["configFile"] = configStore.ConfigFilePath,
                ["autoEnabled"] = isAutoEnabled.ToString(CultureInfo.InvariantCulture),
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
                TargetProfile = targetProfile,
                TargetDecibels = targetDecibels,
                BridgeToken = bridgeToken,
                ExcludedSessionIds = excludedSessions.ToList()
            });
            activityLog.Write("config.save", "Local config saved", new Dictionary<string, string?>
            {
                ["configFile"] = configStore.ConfigFilePath,
                ["autoEnabled"] = isAutoEnabled.ToString(CultureInfo.InvariantCulture),
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
            ? "Auto actif : calibration ponctuelle par source active."
            : "Mode observation : les corrections sont loggees sans modifier les volumes.");
        SafeRefreshSessions(applyAuto: true);
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
        targetProfile = normalized.Profile;
        targetDecibels = normalized.TargetDecibels;
        targetUpdatedAtUtc = DateTimeOffset.UtcNow;
        normalizer = new VolumeNormalizer(NormalizerSettings.FromTargetDecibels(targetDecibels));
        TargetDisplayText = $"{targetProfile} ({FormatDecibels(targetDecibels)})";
        TargetBridgeText = $"Cible partagee : {FormatDecibels(targetDecibels)} pour Windows et navigateur quand le bridge est connecte.";
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

        for (var i = 0; i < windowsSessions.Count; i++)
        {
            if (WindowsSystemSessionClassifier.IsSystemSounds(windowsSessions[i].Snapshot))
            {
                systemSounds.Add((windowsSessions[i], decisions[i]));
                continue;
            }

            AddSessionRow(windowsSessions[i], decisions[i], annotateObservation);
        }

        if (systemSounds.Count > 0)
        {
            AddSystemSoundsRow(systemSounds, annotateObservation);
        }

        UpdateSummaryCards();
    }

    private void AddSessionRow(WindowsAudioSession session, VolumeDecision decision, bool annotateObservation)
    {
        Sessions.Add(SessionRow.From(
            session.Snapshot,
            BuildDisplayDecision(decision, annotateObservation),
            session.SetVolume,
            RecordManualChange,
            SetExcluded));
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
            (_, _, isExcluded) => SetSystemSoundsExcluded(systemSounds, snapshot.DisplayName, isExcluded)));
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
        foreach (var source in browserSourceStore.GetAll())
        {
            BrowserSources.Add(BrowserSourceRow.From(source));
        }

        UpdateSummaryCards();
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
            ? "Extension connectee : detail navigateur disponible."
            : "App seule : controle Windows global, extension non connectee.";
    }

    private void UpdateSummaryCards()
    {
        WindowSourceCountText = FormatCount(Sessions.Count, "source");
        BrowserSourceCountText = FormatCount(BrowserSources.Count, "source");
        var watchCount = Sessions.Count(IsWatchRow) + BrowserSources.Count(IsWatchRow);
        WatchCountText = $"{watchCount} à surveiller";
        ModeSummaryText = isAutoEnabled ? $"Auto {FormatDecibels(targetDecibels)}" : $"Obs {FormatDecibels(targetDecibels)}";
    }

    private static bool IsWatchRow(SessionRow row)
    {
        return IsWatchStatus(row.Status)
            || IsWatchControl(row.ControlSurface)
            || string.Equals(row.IsControllable, "Non", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsWatchRow(BrowserSourceRow row)
    {
        return IsWatchStatus(row.Status)
            || IsWatchControl(row.ControlSurface)
            || string.Equals(row.IsControllable, "Non", StringComparison.OrdinalIgnoreCase);
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

    private static Dictionary<string, string?> BuildBrowserSourceFields(BrowserSubSourceSnapshot source)
    {
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
        ThemeButtonText = isDark ? "Mode clair" : "Mode sombre";
        ThemeStatusText = isDark ? "Theme sombre" : "Theme clair";

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
}

public sealed record ReferenceCaptureResult(int TotalSessions, int ControlledSessions);

public sealed class BrowserSourceRow
{
    private BrowserSourceRow(BrowserSubSourceSnapshot source)
    {
        BrowserProcess = source.BrowserProcess;
        SiteName = source.SiteName;
        Title = source.Title;
        Status = source.Status.ToString();
        CurrentLevelPercent = $"{source.CurrentLevel:P0}";
        AppliedGainPercent = $"{source.AppliedGain:P0}";
        Calibration = FormatCalibration(source);
        Origin = source.Origin.ToString();
        ControlSurface = source.ControlSurface.ToString();
        IsControllable = source.IsControllable ? "Oui" : "Non";
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

    public static BrowserSourceRow From(BrowserSubSourceSnapshot source)
    {
        return new BrowserSourceRow(source);
    }

    private static string FormatCalibration(BrowserSubSourceSnapshot source)
    {
        if (string.IsNullOrWhiteSpace(source.CalibrationState))
        {
            return source.ControlSurface is AudioControlSurface.BrowserGain ? "mesure" : "fallback Windows";
        }

        var detail = source.AppliedGainDb.HasValue
            ? $" {source.AppliedGainDb.Value:+0.##;-0.##;0} dB"
            : string.Empty;
        return $"{source.CalibrationState}{detail}";
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
        Action<string, string, bool> setExcluded)
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
        IsControllable = snapshot.IsControllable ? "Oui" : "Non";
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
        Action<string, string, bool> setExcluded)
    {
        return new SessionRow(snapshot, decision, setVolume, recordManualChange, setExcluded);
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
}



