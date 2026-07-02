using System.Text.Json;

namespace StreamVolumeGuard.Core.Config;

public sealed class JsonAppConfigStore
{
    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true
    };

    public JsonAppConfigStore(string configFilePath)
    {
        if (string.IsNullOrWhiteSpace(configFilePath))
        {
            throw new ArgumentException("Config file path is required.", nameof(configFilePath));
        }

        ConfigFilePath = configFilePath;
    }

    public string ConfigFilePath { get; }

    public static JsonAppConfigStore CreateDefault()
    {
        var directory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "StreamVolumeGuard");
        return new JsonAppConfigStore(Path.Combine(directory, "config.json"));
    }

    public AppConfig Load()
    {
        if (!File.Exists(ConfigFilePath))
        {
            return AppConfig.Default;
        }

        var json = File.ReadAllText(ConfigFilePath);
        var config = JsonSerializer.Deserialize<AppConfig>(json, Options);
        return (config ?? AppConfig.Default).Normalize();
    }

    public void Save(AppConfig config)
    {
        ArgumentNullException.ThrowIfNull(config);

        var directory = Path.GetDirectoryName(ConfigFilePath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var json = JsonSerializer.Serialize(config.Normalize(), Options);
        File.WriteAllText(ConfigFilePath, json);
    }
}