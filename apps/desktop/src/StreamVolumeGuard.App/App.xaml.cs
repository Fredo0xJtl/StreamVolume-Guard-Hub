using System.Windows;

namespace StreamVolumeGuard.App;

public partial class App : Application
{
    private const string SingleInstanceMutexName = "Local\\StreamVolumeGuardHubDesktop";
    private System.Threading.Mutex? singleInstanceMutex;
    private bool ownsSingleInstanceMutex;

    protected override void OnStartup(StartupEventArgs e)
    {
        singleInstanceMutex = new System.Threading.Mutex(initiallyOwned: true, SingleInstanceMutexName, out ownsSingleInstanceMutex);
        if (!ownsSingleInstanceMutex)
        {
            singleInstanceMutex.Dispose();
            singleInstanceMutex = null;
            Shutdown(0);
            return;
        }

        base.OnStartup(e);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        if (ownsSingleInstanceMutex)
        {
            singleInstanceMutex?.ReleaseMutex();
            ownsSingleInstanceMutex = false;
        }

        singleInstanceMutex?.Dispose();
        singleInstanceMutex = null;

        base.OnExit(e);
    }
}
