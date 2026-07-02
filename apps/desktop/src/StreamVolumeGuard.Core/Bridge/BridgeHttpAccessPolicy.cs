namespace StreamVolumeGuard.Core.Bridge;

public static class BridgeHttpAccessPolicy
{
    public const string TokenHeaderName = "X-StreamVolume-Guard-Token";

    public static bool IsOriginAllowed(string? origin)
    {
        if (string.IsNullOrWhiteSpace(origin))
        {
            return true;
        }

        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri))
        {
            return false;
        }

        if (string.Equals(uri.Scheme, "chrome-extension", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(uri.Scheme, "moz-extension", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if ((string.Equals(uri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase) ||
             string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)) &&
            (string.Equals(uri.Host, "127.0.0.1", StringComparison.OrdinalIgnoreCase) ||
             string.Equals(uri.Host, "localhost", StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        return false;
    }

    public static bool HasValidToken(IReadOnlyDictionary<string, string> headers, string? requiredToken)
    {
        if (string.IsNullOrWhiteSpace(requiredToken))
        {
            return true;
        }

        return headers.TryGetValue(TokenHeaderName, out var providedToken) &&
            string.Equals(providedToken, requiredToken, StringComparison.Ordinal);
    }

    public static bool RequiresTokenForRequest(string? method, string? path)
    {
        if (string.Equals(method, "OPTIONS", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return (string.Equals(method, "POST", StringComparison.OrdinalIgnoreCase) &&
                string.Equals(path, "/browser-source", StringComparison.Ordinal)) ||
               (string.Equals(method, "POST", StringComparison.OrdinalIgnoreCase) &&
                string.Equals(path, "/extension-log", StringComparison.Ordinal)) ||
               (string.Equals(method, "GET", StringComparison.OrdinalIgnoreCase) &&
                string.Equals(path, "/global-target", StringComparison.Ordinal));
    }

    public static string CorsOriginValue(string? origin)
    {
        return string.IsNullOrWhiteSpace(origin) ? "*" : origin;
    }
}
