using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using StreamVolumeGuard.Core.Bridge;
using StreamVolumeGuard.Core.Browser;
using StreamVolumeGuard.Core.Config;

namespace StreamVolumeGuard.App.Bridge;

public sealed class LocalBrowserBridgeServer : IDisposable
{
    public const int DefaultPort = 47841;
    public const string BrowserSourcePath = "/browser-source";
    public const string ExtensionLogPath = "/extension-log";
    public const string GlobalTargetPath = "/global-target";
    public const string HealthPath = "/health";

    private const int MaxHeaderBytes = 16 * 1024;
    private const int MaxBodyBytes = 64 * 1024;
    private static readonly byte[] HeaderTerminator = "\r\n\r\n"u8.ToArray();
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly int port;
    private readonly string requiredToken;
    private readonly Func<GlobalTargetState>? globalTargetProvider;
    private TcpListener? listener;
    private CancellationTokenSource? cancellation;
    private Task? acceptLoop;

    public LocalBrowserBridgeServer(int port = DefaultPort, string? requiredToken = null, Func<GlobalTargetState>? globalTargetProvider = null)
    {
        this.port = port;
        this.requiredToken = (requiredToken ?? string.Empty).Trim();
        this.globalTargetProvider = globalTargetProvider;
    }

    public string Url => $"http://127.0.0.1:{port}";
    public bool IsRunning { get; private set; }
    public bool RequiresToken => !string.IsNullOrWhiteSpace(requiredToken);

    public event EventHandler<BrowserSubSourceSnapshot>? SourceReceived;
    public event EventHandler<ExtensionLogEntry>? ExtensionLogReceived;
    public event EventHandler<string>? InvalidMessageReceived;
    public event EventHandler<Exception>? BridgeError;

    public void Start()
    {
        if (IsRunning)
        {
            return;
        }

        cancellation = new CancellationTokenSource();
        listener = new TcpListener(IPAddress.Loopback, port);
        listener.Start();
        IsRunning = true;
        acceptLoop = Task.Run(() => AcceptLoopAsync(cancellation.Token));
    }

    public void Stop()
    {
        if (!IsRunning && listener is null)
        {
            return;
        }

        IsRunning = false;
        cancellation?.Cancel();
        listener?.Stop();
        listener = null;
        cancellation?.Dispose();
        cancellation = null;
    }

    public void Dispose()
    {
        Stop();
    }

    private async Task AcceptLoopAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            try
            {
                var currentListener = listener;
                if (currentListener is null)
                {
                    return;
                }

                var client = await currentListener.AcceptTcpClientAsync(token).ConfigureAwait(false);
                _ = Task.Run(() => HandleClientAsync(client, token), token);
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (ObjectDisposedException)
            {
                return;
            }
            catch (Exception ex)
            {
                BridgeError?.Invoke(this, ex);
            }
        }
    }

    private async Task HandleClientAsync(TcpClient client, CancellationToken token)
    {
        using var _ = client;
        try
        {
            client.ReceiveTimeout = 2500;
            client.SendTimeout = 2500;
            await using var stream = client.GetStream();

            BridgeHttpRequest request;
            try
            {
                var rawRequest = await ReadRawRequestAsync(stream, token).ConfigureAwait(false);
                request = BridgeHttpRequestParser.Parse(rawRequest, MaxBodyBytes);
            }
            catch (Exception ex) when (ex is InvalidDataException or FormatException)
            {
                InvalidMessageReceived?.Invoke(this, ex.Message);
                await WriteResponseAsync(stream, 400, "Bad Request", "{\"ok\":false,\"error\":\"invalid-request\"}\r\n", allowedOrigin: null, includeCors: true, token).ConfigureAwait(false);
                return;
            }

            var origin = GetHeader(request, "Origin");
            if (!BridgeHttpAccessPolicy.IsOriginAllowed(origin))
            {
                InvalidMessageReceived?.Invoke(this, "origin not allowed");
                await WriteResponseAsync(stream, 403, "Forbidden", "{\"ok\":false,\"error\":\"origin-not-allowed\"}\r\n", allowedOrigin: null, includeCors: false, token).ConfigureAwait(false);
                return;
            }

            if (string.Equals(request.Method, "GET", StringComparison.OrdinalIgnoreCase) && string.Equals(request.Path, HealthPath, StringComparison.Ordinal))
            {
                await WriteResponseAsync(stream, 200, "OK", "{\"ok\":true,\"service\":\"StreamVolumeGuardBridge\"}\r\n", origin, includeCors: true, token).ConfigureAwait(false);
                return;
            }

            if (string.Equals(request.Method, "GET", StringComparison.OrdinalIgnoreCase) && string.Equals(request.Path, GlobalTargetPath, StringComparison.Ordinal))
            {
                if (BridgeHttpAccessPolicy.RequiresTokenForRequest(request.Method, request.Path) &&
                    !BridgeHttpAccessPolicy.HasValidToken(request.Headers, requiredToken))
                {
                    InvalidMessageReceived?.Invoke(this, "bridge token rejected");
                    await WriteResponseAsync(stream, 401, "Unauthorized", "{\"ok\":false,\"error\":\"invalid-token\"}\r\n", origin, includeCors: true, token).ConfigureAwait(false);
                    return;
                }

                var targetState = globalTargetProvider?.Invoke() ?? GlobalTargetState.FromSettings(GlobalTargetSettings.Standard, DateTimeOffset.UtcNow);
                var targetBody = JsonSerializer.Serialize(targetState, JsonOptions) + "\r\n";
                await WriteResponseAsync(stream, 200, "OK", targetBody, origin, includeCors: true, token).ConfigureAwait(false);
                return;
            }

            if (string.Equals(request.Method, "OPTIONS", StringComparison.OrdinalIgnoreCase) &&
                (string.Equals(request.Path, BrowserSourcePath, StringComparison.Ordinal) ||
                 string.Equals(request.Path, ExtensionLogPath, StringComparison.Ordinal) ||
                 string.Equals(request.Path, GlobalTargetPath, StringComparison.Ordinal) ||
                 string.Equals(request.Path, HealthPath, StringComparison.Ordinal)))
            {
                await WriteResponseAsync(stream, 204, "No Content", string.Empty, origin, includeCors: true, token).ConfigureAwait(false);
                return;
            }

            if (!string.Equals(request.Path, BrowserSourcePath, StringComparison.Ordinal) &&
                !string.Equals(request.Path, ExtensionLogPath, StringComparison.Ordinal))
            {
                await WriteResponseAsync(stream, 404, "Not Found", "{\"ok\":false,\"error\":\"not-found\"}\r\n", origin, includeCors: true, token).ConfigureAwait(false);
                return;
            }

            if (!string.Equals(request.Method, "POST", StringComparison.OrdinalIgnoreCase))
            {
                await WriteResponseAsync(stream, 405, "Method Not Allowed", "{\"ok\":false,\"error\":\"method-not-allowed\"}\r\n", origin, includeCors: true, token).ConfigureAwait(false);
                return;
            }

            if (BridgeHttpAccessPolicy.RequiresTokenForRequest(request.Method, request.Path) &&
                !BridgeHttpAccessPolicy.HasValidToken(request.Headers, requiredToken))
            {
                InvalidMessageReceived?.Invoke(this, "bridge token rejected");
                await WriteResponseAsync(stream, 401, "Unauthorized", "{\"ok\":false,\"error\":\"invalid-token\"}\r\n", origin, includeCors: true, token).ConfigureAwait(false);
                return;
            }

            if (request.Body.Length <= 0)
            {
                InvalidMessageReceived?.Invoke(this, "invalid content length");
                await WriteResponseAsync(stream, 400, "Bad Request", "{\"ok\":false,\"error\":\"invalid-content-length\"}\r\n", origin, includeCors: true, token).ConfigureAwait(false);
                return;
            }

            var body = Encoding.UTF8.GetString(request.Body);
            try
            {
                if (string.Equals(request.Path, ExtensionLogPath, StringComparison.Ordinal))
                {
                    var logEntry = BrowserBridgeMessageParser.ParseExtensionLog(body);
                    ExtensionLogReceived?.Invoke(this, logEntry);
                }
                else
                {
                    var source = BrowserBridgeMessageParser.ParseBrowserSource(body);
                    SourceReceived?.Invoke(this, source);
                }

                await WriteResponseAsync(stream, 200, "OK", "{\"ok\":true}\r\n", origin, includeCors: true, token).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                InvalidMessageReceived?.Invoke(this, ex.Message);
                await WriteResponseAsync(stream, 400, "Bad Request", "{\"ok\":false,\"error\":\"invalid-message\"}\r\n", origin, includeCors: true, token).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception ex)
        {
            BridgeError?.Invoke(this, ex);
        }
    }

    private static async Task<byte[]> ReadRawRequestAsync(Stream stream, CancellationToken token)
    {
        using var memory = new MemoryStream();
        var buffer = new byte[4096];

        while (true)
        {
            var count = await stream.ReadAsync(buffer.AsMemory(0, buffer.Length), token).ConfigureAwait(false);
            if (count == 0)
            {
                break;
            }

            memory.Write(buffer, 0, count);
            if (memory.Length > MaxHeaderBytes + MaxBodyBytes + HeaderTerminator.Length)
            {
                throw new InvalidDataException("request is too large");
            }

            var snapshot = memory.ToArray();
            if (TryGetTotalRequestLength(snapshot, out var totalLength))
            {
                if (snapshot.Length >= totalLength)
                {
                    if (snapshot.Length == totalLength)
                    {
                        return snapshot;
                    }

                    var trimmed = new byte[totalLength];
                    Array.Copy(snapshot, trimmed, totalLength);
                    return trimmed;
                }
            }
        }

        throw new InvalidDataException("request body is incomplete");
    }

    private static bool TryGetTotalRequestLength(byte[] requestBytes, out int totalLength)
    {
        totalLength = 0;
        var headerEnd = IndexOf(requestBytes, HeaderTerminator);
        if (headerEnd < 0)
        {
            if (requestBytes.Length > MaxHeaderBytes)
            {
                throw new InvalidDataException("request headers are too large");
            }

            return false;
        }

        if (headerEnd > MaxHeaderBytes)
        {
            throw new InvalidDataException("request headers are too large");
        }

        var contentLength = 0;
        var headerText = Encoding.ASCII.GetString(requestBytes, 0, headerEnd);
        foreach (var line in headerText.Split("\r\n", StringSplitOptions.None).Skip(1))
        {
            var separator = line.IndexOf(':');
            if (separator <= 0)
            {
                continue;
            }

            var name = line[..separator].Trim();
            var value = line[(separator + 1)..].Trim();
            if (string.Equals(name, "Content-Length", StringComparison.OrdinalIgnoreCase) &&
                !int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out contentLength))
            {
                throw new InvalidDataException("content length is invalid");
            }
        }

        if (contentLength < 0 || contentLength > MaxBodyBytes)
        {
            throw new InvalidDataException("invalid content length");
        }

        totalLength = headerEnd + HeaderTerminator.Length + contentLength;
        return true;
    }

    private static int IndexOf(byte[] data, byte[] pattern)
    {
        if (pattern.Length == 0 || data.Length < pattern.Length)
        {
            return -1;
        }

        for (var i = 0; i <= data.Length - pattern.Length; i++)
        {
            var found = true;
            for (var j = 0; j < pattern.Length; j++)
            {
                if (data[i + j] != pattern[j])
                {
                    found = false;
                    break;
                }
            }

            if (found)
            {
                return i;
            }
        }

        return -1;
    }

    private static string? GetHeader(BridgeHttpRequest request, string name)
    {
        return request.Headers.TryGetValue(name, out var value) ? value : null;
    }

    private static async Task WriteResponseAsync(Stream stream, int statusCode, string statusText, string body, string? allowedOrigin, bool includeCors, CancellationToken token)
    {
        var bodyBytes = Encoding.UTF8.GetBytes(body);
        var headers = new StringBuilder()
            .Append(CultureInfo.InvariantCulture, $"HTTP/1.1 {statusCode} {statusText}\r\n")
            .Append("Content-Type: application/json; charset=utf-8\r\n")
            .Append("Connection: close\r\n")
            .Append(CultureInfo.InvariantCulture, $"Content-Length: {bodyBytes.Length}\r\n");

        if (includeCors)
        {
            headers
                .Append(CultureInfo.InvariantCulture, $"Access-Control-Allow-Origin: {BridgeHttpAccessPolicy.CorsOriginValue(allowedOrigin)}\r\n")
                .Append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n")
                .Append(CultureInfo.InvariantCulture, $"Access-Control-Allow-Headers: Content-Type, {BridgeHttpAccessPolicy.TokenHeaderName}\r\n");
        }

        headers.Append("\r\n");

        await stream.WriteAsync(Encoding.ASCII.GetBytes(headers.ToString()), token).ConfigureAwait(false);
        await stream.WriteAsync(bodyBytes, token).ConfigureAwait(false);
        await stream.FlushAsync(token).ConfigureAwait(false);
    }
}
