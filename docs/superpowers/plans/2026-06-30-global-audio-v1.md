> **Archive historique :** ce plan documente une etape de construction. Pour la source actuelle, utiliser `docs/product-next-plan.md` et `docs/hybrid-architecture.md`.

# StreamVolume Guard Desktop Global Audio V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Windows desktop MVP around global Windows audio session discovery, balanced per-session normalization, manual controls, exclusions, Panic, local config, and readable local logs.

**Architecture:** The product must not contain app-specific patches. The core engine treats every sound source as a Windows audio session exposed by WASAPI/Core Audio, then groups and labels sessions when Windows provides process metadata. NAudio is isolated in a Windows adapter so normalization, manual override, Panic, config, and UI state stay testable without real audio devices.

**Tech Stack:** C# .NET 8, WPF for the small Windows interface, NAudio for Windows Core Audio session access, JSON files for local settings, JSONL/text logs for local debugging, a dependency-free console test runner for early TDD.

---

## Locked Decisions

- Product root: `D:\Codex\App StreamVolume Guard`.
- Implementation root: `D:\Codex\App StreamVolume Guard\desktop`.
- No targeted application rules such as `if Chrome`, `if Spotify`, or `if Discord` in the engine.
- Global coverage means enumerating Windows render endpoints and audio sessions dynamically.
- Without driver or virtual audio device, sessions that Windows does not expose or control must be shown as unknown/non-controllable instead of silently pretending coverage.
- Default automatic behavior: balanced normalization, not aggressive alignment.
- Current blocker: this machine has .NET runtime 8, but no .NET SDK.

## File Structure

- `desktop/StreamVolumeGuard.Desktop.sln`: solution.
- `desktop/src/StreamVolumeGuard.Core`: platform-neutral engine.
- `desktop/src/StreamVolumeGuard.WindowsAudio`: NAudio/WASAPI adapter.
- `desktop/src/StreamVolumeGuard.App`: WPF mixeur UI.
- `desktop/tests/StreamVolumeGuard.Tests`: dependency-free console tests.
- `desktop/README.md`: commands and limitations.

## Task 0: Toolchain Gate

**Files:**
- Create: `desktop/README.md`

- [ ] **Step 1: Confirm SDK state**

Run:

```powershell
dotnet --info
```

Expected before install on this machine: output contains `No SDKs were found.`

- [ ] **Step 2: Install .NET SDK 8 if missing**

Run:

```powershell
winget install Microsoft.DotNet.SDK.8 --accept-package-agreements --accept-source-agreements
```

Expected: winget installs a .NET 8 SDK.

- [ ] **Step 3: Verify SDK is available**

Run:

```powershell
dotnet --list-sdks
```

Expected: at least one `8.0.x` SDK entry.

- [ ] **Step 4: Create README**

Create `desktop/README.md` with:

```markdown
# StreamVolume Guard Desktop

Windows desktop MVP for global audio-session monitoring and balanced per-session volume normalization.

## Local Commands

```powershell
dotnet build desktop/StreamVolumeGuard.Desktop.sln
dotnet run --project desktop/tests/StreamVolumeGuard.Tests/StreamVolumeGuard.Tests.csproj
dotnet run --project desktop/src/StreamVolumeGuard.App/StreamVolumeGuard.App.csproj
```

## Product Guardrails

- No app-specific patches in the engine.
- Enumerate Windows render endpoints and sessions dynamically.
- Keep settings and logs local.
- Show unknown or non-controllable sessions honestly.
```

## Task 1: Solution And Project Skeleton

**Files:**
- Create: `desktop/StreamVolumeGuard.Desktop.sln`
- Create: `desktop/src/StreamVolumeGuard.Core/StreamVolumeGuard.Core.csproj`
- Create: `desktop/src/StreamVolumeGuard.WindowsAudio/StreamVolumeGuard.WindowsAudio.csproj`
- Create: `desktop/src/StreamVolumeGuard.App/StreamVolumeGuard.App.csproj`
- Create: `desktop/tests/StreamVolumeGuard.Tests/StreamVolumeGuard.Tests.csproj`

- [ ] **Step 1: Create directories**

```powershell
New-Item -ItemType Directory -Force -Path `
  'D:\Codex\App StreamVolume Guard\desktop\src\StreamVolumeGuard.Core', `
  'D:\Codex\App StreamVolume Guard\desktop\src\StreamVolumeGuard.WindowsAudio', `
  'D:\Codex\App StreamVolume Guard\desktop\src\StreamVolumeGuard.App', `
  'D:\Codex\App StreamVolume Guard\desktop\tests\StreamVolumeGuard.Tests'
```

- [ ] **Step 2: Create solution**

```powershell
Set-Location 'D:\Codex\App StreamVolume Guard\desktop'
dotnet new sln -n StreamVolumeGuard.Desktop
```

- [ ] **Step 3: Create Core project file**

Create `desktop/src/StreamVolumeGuard.Core/StreamVolumeGuard.Core.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>
```

- [ ] **Step 4: Create WindowsAudio project file**

Create `desktop/src/StreamVolumeGuard.WindowsAudio/StreamVolumeGuard.WindowsAudio.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0-windows</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="NAudio" Version="2.2.1" />
    <ProjectReference Include="..\StreamVolumeGuard.Core\StreamVolumeGuard.Core.csproj" />
  </ItemGroup>
</Project>
```

- [ ] **Step 5: Create WPF app project file**

Create `desktop/src/StreamVolumeGuard.App/StreamVolumeGuard.App.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>net8.0-windows</TargetFramework>
    <UseWPF>true</UseWPF>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="..\StreamVolumeGuard.Core\StreamVolumeGuard.Core.csproj" />
    <ProjectReference Include="..\StreamVolumeGuard.WindowsAudio\StreamVolumeGuard.WindowsAudio.csproj" />
  </ItemGroup>
</Project>
```

- [ ] **Step 6: Create test project file**

Create `desktop/tests/StreamVolumeGuard.Tests/StreamVolumeGuard.Tests.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="..\..\src\StreamVolumeGuard.Core\StreamVolumeGuard.Core.csproj" />
  </ItemGroup>
</Project>
```

- [ ] **Step 7: Add projects to solution**

```powershell
Set-Location 'D:\Codex\App StreamVolume Guard\desktop'
dotnet sln add `
  'src\StreamVolumeGuard.Core\StreamVolumeGuard.Core.csproj' `
  'src\StreamVolumeGuard.WindowsAudio\StreamVolumeGuard.WindowsAudio.csproj' `
  'src\StreamVolumeGuard.App\StreamVolumeGuard.App.csproj' `
  'tests\StreamVolumeGuard.Tests\StreamVolumeGuard.Tests.csproj'
```

## Task 2: Core Session Model And Balanced Normalizer

**Files:**
- Create: `desktop/tests/StreamVolumeGuard.Tests/Program.cs`
- Create: `desktop/src/StreamVolumeGuard.Core/Audio/AudioSessionSnapshot.cs`
- Create: `desktop/src/StreamVolumeGuard.Core/Audio/AudioSessionStatus.cs`
- Create: `desktop/src/StreamVolumeGuard.Core/Normalization/NormalizerSettings.cs`
- Create: `desktop/src/StreamVolumeGuard.Core/Normalization/VolumeDecision.cs`
- Create: `desktop/src/StreamVolumeGuard.Core/Normalization/VolumeNormalizer.cs`

- [ ] **Step 1: Write failing tests first**

The tests must prove the engine does not depend on application names:

```csharp
using StreamVolumeGuard.Core.Audio;
using StreamVolumeGuard.Core.Normalization;

var tests = new List<(string Name, Action Test)>
{
    ("risky session is reduced without process name", RiskySessionIsReducedWithoutProcessName),
    ("low session is raised gently without process name", LowSessionIsRaisedGentlyWithoutProcessName),
    ("excluded session is never changed", ExcludedSessionIsNeverChanged),
    ("muted session is reported but not unmuted", MutedSessionIsReportedButNotUnmuted),
    ("manual cooldown prevents immediate correction", ManualCooldownPreventsImmediateCorrection)
};

var failed = 0;
foreach (var (name, test) in tests)
{
    try { test(); Console.WriteLine($"PASS {name}"); }
    catch (Exception ex) { failed++; Console.WriteLine($"FAIL {name}: {ex.Message}"); }
}
if (failed > 0) Environment.Exit(1);

static void RiskySessionIsReducedWithoutProcessName()
{
    var normalizer = new VolumeNormalizer(NormalizerSettings.StreamDefault);
    var snapshot = TestSession(peak: 0.92f, volume: 0.80f, processName: null);
    var decision = normalizer.Evaluate(snapshot, DateTimeOffset.UtcNow);
    AssertEqual(AudioSessionStatus.Risky, decision.Status, "status");
    AssertTrue(decision.ShouldApplyVolume, "volume should change");
    AssertTrue(decision.TargetVolumeScalar < snapshot.VolumeScalar, "target should go down");
}

static void LowSessionIsRaisedGentlyWithoutProcessName()
{
    var normalizer = new VolumeNormalizer(NormalizerSettings.StreamDefault);
    var snapshot = TestSession(peak: 0.05f, volume: 0.40f, processName: null);
    var decision = normalizer.Evaluate(snapshot, DateTimeOffset.UtcNow);
    AssertEqual(AudioSessionStatus.Low, decision.Status, "status");
    AssertTrue(decision.ShouldApplyVolume, "volume should change");
    AssertTrue(decision.TargetVolumeScalar > snapshot.VolumeScalar, "target should go up");
    AssertTrue(decision.TargetVolumeScalar - snapshot.VolumeScalar <= NormalizerSettings.StreamDefault.MaxStepUp, "raise should be gentle");
}

static void ExcludedSessionIsNeverChanged()
{
    var normalizer = new VolumeNormalizer(NormalizerSettings.StreamDefault);
    var snapshot = TestSession(peak: 1.0f, volume: 0.9f, isExcluded: true);
    var decision = normalizer.Evaluate(snapshot, DateTimeOffset.UtcNow);
    AssertEqual(AudioSessionStatus.Excluded, decision.Status, "status");
    AssertFalse(decision.ShouldApplyVolume, "excluded should not change");
}

static void MutedSessionIsReportedButNotUnmuted()
{
    var normalizer = new VolumeNormalizer(NormalizerSettings.StreamDefault);
    var snapshot = TestSession(peak: 0.01f, volume: 0.0f, isMuted: true);
    var decision = normalizer.Evaluate(snapshot, DateTimeOffset.UtcNow);
    AssertEqual(AudioSessionStatus.Muted, decision.Status, "status");
    AssertFalse(decision.ShouldApplyVolume, "muted source should not be unmuted");
}

static void ManualCooldownPreventsImmediateCorrection()
{
    var now = DateTimeOffset.UtcNow;
    var normalizer = new VolumeNormalizer(NormalizerSettings.StreamDefault);
    var snapshot = TestSession(peak: 1.0f, volume: 0.9f, lastManualChangeUtc: now.AddSeconds(-2));
    var decision = normalizer.Evaluate(snapshot, now);
    AssertEqual(AudioSessionStatus.Safe, decision.Status, "status during manual cooldown");
    AssertFalse(decision.ShouldApplyVolume, "manual cooldown should block auto correction");
}

static AudioSessionSnapshot TestSession(float peak, float volume, string? processName = "not-used", bool isExcluded = false, bool isMuted = false, DateTimeOffset? lastManualChangeUtc = null)
{
    return new AudioSessionSnapshot("device-a/session", "device-a", "Test source", processName, 1234, peak, volume, isMuted, false, true, lastManualChangeUtc, isExcluded, DateTimeOffset.UtcNow);
}

static void AssertTrue(bool value, string label) { if (!value) throw new Exception(label); }
static void AssertFalse(bool value, string label) { if (value) throw new Exception(label); }
static void AssertEqual<T>(T expected, T actual, string label) { if (!EqualityComparer<T>.Default.Equals(expected, actual)) throw new Exception($"{label}: expected {expected}, got {actual}"); }
```

- [ ] **Step 2: Verify RED**

```powershell
dotnet run --project 'D:\Codex\App StreamVolume Guard\desktop\tests\StreamVolumeGuard.Tests\StreamVolumeGuard.Tests.csproj'
```

Expected: build fails because core classes do not exist.

- [ ] **Step 3: Implement minimal core classes**

Create `AudioSessionStatus`, `AudioSessionSnapshot`, `NormalizerSettings`, `VolumeDecision`, and `VolumeNormalizer` exactly as needed by tests. Keep no app-name logic in `VolumeNormalizer`.

- [ ] **Step 4: Verify GREEN**

```powershell
dotnet run --project 'D:\Codex\App StreamVolume Guard\desktop\tests\StreamVolumeGuard.Tests\StreamVolumeGuard.Tests.csproj'
```

Expected: every test prints `PASS`.

## Task 3: Panic And Manual Override Core

**Files:**
- Modify: `desktop/tests/StreamVolumeGuard.Tests/Program.cs`
- Create: `desktop/src/StreamVolumeGuard.Core/Control/ManualOverrideTracker.cs`
- Create: `desktop/src/StreamVolumeGuard.Core/Control/PanicService.cs`

- [ ] **Step 1: Add failing tests**

Add tests for two behaviors:

```csharp
("manual tracker stores latest change per session", ManualTrackerStoresLatestChange),
("panic lowers controllable non-excluded sessions only", PanicLowersControllableNonExcludedSessionsOnly)
```

The tests must prove excluded, muted, and uncontrollable sessions are not changed.

- [ ] **Step 2: Verify RED**

```powershell
dotnet run --project 'D:\Codex\App StreamVolume Guard\desktop\tests\StreamVolumeGuard.Tests\StreamVolumeGuard.Tests.csproj'
```

Expected: build fails because `ManualOverrideTracker` and `PanicService` do not exist.

- [ ] **Step 3: Implement `ManualOverrideTracker`**

```csharp
namespace StreamVolumeGuard.Core.Control;

public sealed class ManualOverrideTracker
{
    private readonly Dictionary<string, DateTimeOffset> changes = new(StringComparer.OrdinalIgnoreCase);

    public void RecordManualChange(string sessionId, DateTimeOffset changedAtUtc)
    {
        changes[sessionId] = changedAtUtc;
    }

    public DateTimeOffset? GetLastManualChangeUtc(string sessionId)
    {
        return changes.TryGetValue(sessionId, out var changedAtUtc) ? changedAtUtc : null;
    }
}
```

- [ ] **Step 4: Implement `PanicService`**

`PanicService` accepts `IEnumerable<AudioSessionSnapshot>` and returns `IEnumerable<VolumeDecision>`. It lowers only sessions where `IsControllable == true`, `IsExcluded == false`, and `IsMuted == false`.

- [ ] **Step 5: Verify GREEN**

```powershell
dotnet run --project 'D:\Codex\App StreamVolume Guard\desktop\tests\StreamVolumeGuard.Tests\StreamVolumeGuard.Tests.csproj'
```

Expected: all tests pass.

## Task 4: NAudio Windows Session Adapter

**Files:**
- Create: `desktop/src/StreamVolumeGuard.WindowsAudio/AudioEndpointMonitor.cs`
- Create: `desktop/src/StreamVolumeGuard.WindowsAudio/AudioSessionMonitor.cs`
- Create: `desktop/src/StreamVolumeGuard.WindowsAudio/WindowsAudioSession.cs`

- [ ] **Step 1: Implement endpoint enumeration**

`AudioEndpointMonitor` must enumerate active render endpoints through NAudio `MMDeviceEnumerator` and return the default multimedia render endpoint first.

- [ ] **Step 2: Implement session wrapper**

Create a wrapper with `AudioSessionSnapshot Snapshot` and `Action<float> SetVolume` so the UI can apply decisions without exposing NAudio types to the core engine.

- [ ] **Step 3: Implement dynamic session enumeration**

`AudioSessionMonitor` must loop every endpoint session in `endpoint.AudioSessionManager.Sessions`, read process id/name when available, read `AudioMeterInformation.MasterPeakValue`, read `SimpleAudioVolume.Volume`, and mark sessions without `SimpleAudioVolume` as non-controllable.

- [ ] **Step 4: Guard all Windows audio reads**

Every NAudio read that can fail must return a safe fallback:

```text
process id unavailable -> null
process name unavailable -> null
peak unavailable -> 0.0
volume unavailable -> 0.0
controllability unavailable -> false
```

- [ ] **Step 5: Build adapter**

```powershell
dotnet build 'D:\Codex\App StreamVolume Guard\desktop\src\StreamVolumeGuard.WindowsAudio\StreamVolumeGuard.WindowsAudio.csproj'
```

Expected: build succeeds after NuGet restore.

## Task 5: Minimal WPF Smart Mixer

**Files:**
- Create: `desktop/src/StreamVolumeGuard.App/App.xaml`
- Create: `desktop/src/StreamVolumeGuard.App/App.xaml.cs`
- Create: `desktop/src/StreamVolumeGuard.App/MainWindow.xaml`
- Create: `desktop/src/StreamVolumeGuard.App/MainWindow.xaml.cs`

- [ ] **Step 1: Create a WPF shell**

The first screen must be the usable mixer, not a landing page.

- [ ] **Step 2: Build mixer rows**

Rows must display:

```text
Application | Status | Peak | Volume | Auto action | Excluded
```

- [ ] **Step 3: Poll global sessions**

Use a `DispatcherTimer` around 750 ms to read sessions from the default render endpoint, evaluate decisions, and update rows.

- [ ] **Step 4: Apply balanced auto decisions**

If a decision says `ShouldApplyVolume == true`, call the session wrapper `SetVolume(decision.TargetVolumeScalar)`.

- [ ] **Step 5: Add Panic button**

The Panic button uses `PanicService` and applies returned volume decisions to controllable, non-excluded sessions.

- [ ] **Step 6: Build app**

```powershell
dotnet build 'D:\Codex\App StreamVolume Guard\desktop\src\StreamVolumeGuard.App\StreamVolumeGuard.App.csproj'
```

Expected: build succeeds.

## Task 6: Real Windows Audio Smoke Test

**Files:**
- Modify: `desktop/README.md`

- [ ] **Step 1: Run core tests**

```powershell
dotnet run --project 'D:\Codex\App StreamVolume Guard\desktop\tests\StreamVolumeGuard.Tests\StreamVolumeGuard.Tests.csproj'
```

Expected: all tests pass.

- [ ] **Step 2: Build solution**

```powershell
dotnet build 'D:\Codex\App StreamVolume Guard\desktop\StreamVolumeGuard.Desktop.sln'
```

Expected: build succeeds.

- [ ] **Step 3: Run app**

```powershell
dotnet run --project 'D:\Codex\App StreamVolume Guard\desktop\src\StreamVolumeGuard.App\StreamVolumeGuard.App.csproj'
```

Expected: a Windows window opens and lists currently exposed sessions.

- [ ] **Step 4: Validate global behavior manually**

```text
1. Play any browser audio.
2. Play audio in another desktop app.
3. Confirm both appear without hardcoded app rules.
4. Compare with Windows volume mixer.
5. Trigger Panic and confirm only controllable, non-excluded sessions drop.
6. Stop one source and confirm the list refreshes.
```

- [ ] **Step 5: Document V1 coverage limit**

Append to `desktop/README.md`:

```markdown
## V1 Audio Coverage

The app is global at the Windows session layer. It enumerates render endpoints and sessions dynamically instead of targeting specific apps.

Some audio can still be outside V1 control if Windows does not expose it as a controllable shared audio session, for example exclusive-mode audio or protected/system behavior. Those cases must be shown honestly as unknown or non-controllable instead of hidden.
```

## Execution Note

The next action is to install the .NET 8 SDK. After that, execute tasks in order with TDD: red test, green implementation, build, then real Windows audio smoke test.

