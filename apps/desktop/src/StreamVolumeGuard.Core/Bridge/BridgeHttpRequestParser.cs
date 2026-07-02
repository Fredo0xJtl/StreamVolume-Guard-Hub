using System.Globalization;
using System.Text;

namespace StreamVolumeGuard.Core.Bridge;

public static class BridgeHttpRequestParser
{
    private static readonly byte[] HeaderTerminator = "\r\n\r\n"u8.ToArray();

    public static BridgeHttpRequest Parse(byte[] requestBytes, int maxBodyBytes)
    {
        ArgumentNullException.ThrowIfNull(requestBytes);
        if (maxBodyBytes < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(maxBodyBytes));
        }

        var headerEnd = IndexOf(requestBytes, HeaderTerminator);
        if (headerEnd < 0)
        {
            throw new InvalidDataException("request headers are incomplete");
        }

        var headerText = Encoding.ASCII.GetString(requestBytes, 0, headerEnd);
        var lines = headerText.Split("\r\n", StringSplitOptions.None);
        if (lines.Length == 0 || string.IsNullOrWhiteSpace(lines[0]))
        {
            throw new InvalidDataException("request line is required");
        }

        var requestParts = lines[0].Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (requestParts.Length < 2)
        {
            throw new InvalidDataException("request line is invalid");
        }

        var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (var i = 1; i < lines.Length; i++)
        {
            var separator = lines[i].IndexOf(':');
            if (separator <= 0)
            {
                continue;
            }

            var name = lines[i][..separator].Trim();
            var value = lines[i][(separator + 1)..].Trim();
            if (!string.IsNullOrWhiteSpace(name))
            {
                headers[name] = value;
            }
        }

        var contentLength = 0;
        if (headers.TryGetValue("Content-Length", out var rawLength) &&
            !int.TryParse(rawLength, NumberStyles.Integer, CultureInfo.InvariantCulture, out contentLength))
        {
            throw new InvalidDataException("content length is invalid");
        }

        if (contentLength < 0 || contentLength > maxBodyBytes)
        {
            throw new InvalidDataException("invalid content length");
        }

        var bodyStart = headerEnd + HeaderTerminator.Length;
        if (requestBytes.Length - bodyStart < contentLength)
        {
            throw new InvalidDataException("request body is incomplete");
        }

        var body = new byte[contentLength];
        Array.Copy(requestBytes, bodyStart, body, 0, contentLength);
        var path = requestParts[1].Split('?', 2)[0];

        return new BridgeHttpRequest(
            Method: requestParts[0],
            Path: path,
            Headers: headers,
            Body: body);
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
}