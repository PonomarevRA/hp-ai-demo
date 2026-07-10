using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

public sealed partial class MoexIssClient(HttpClient httpClient, ILogger<MoexIssClient> logger)
{
    private static readonly string[] Markets = ["shares", "bonds"];
    private static readonly HashSet<string> ExcludedSymbols = new(StringComparer.OrdinalIgnoreCase)
    {
        "RUB", "USD", "EUR", "CNY", "GBP", "CHF", "JPY", "HKD", "ETF", "BOND", "OFZ", "MOEX", "ISS"
    };

    public async Task<MarketDataStatus> TryEnrichAsync(DashboardResponse dashboard, CancellationToken cancellationToken)
    {
        var symbols = ExtractSymbols(dashboard).Take(20).ToList();
        if (symbols.Count == 0)
        {
            return new MarketDataStatus(
                false,
                false,
                false,
                "MOEX ISS",
                "В отчетах не найдены похожие на MOEX SECID тикеры.",
                null,
                [],
                []);
        }

        var asOf = dashboard.Reports
            .Select(x => x.PeriodEnd)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Order(StringComparer.Ordinal)
            .LastOrDefault();

        var quotes = new List<SecurityQuote>();
        var failed = new List<string>();
        foreach (var symbol in symbols)
        {
            try
            {
                var quote = string.IsNullOrWhiteSpace(asOf)
                    ? await FetchLatestQuoteAsync(symbol, cancellationToken)
                    : await FetchHistoricalQuoteAsync(symbol, asOf, cancellationToken);

                if (quote is null)
                {
                    failed.Add(symbol);
                }
                else
                {
                    quotes.Add(quote);
                }
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
            {
                logger.LogWarning(ex, "MOEX ISS quote request failed for {SecId}", symbol);
                failed.Add(symbol);
            }
        }

        var available = quotes.Count > 0;
        var partial = failed.Count > 0;
        var message = available
            ? partial
                ? $"MOEX ISS: получено {quotes.Count} из {symbols.Count} котировок."
                : $"MOEX ISS: получено {quotes.Count} котировок."
            : "MOEX ISS: котировки получить не удалось.";

        return new MarketDataStatus(
            true,
            available,
            partial,
            "MOEX ISS",
            message,
            asOf,
            quotes,
            failed);
    }

    private async Task<SecurityQuote?> FetchLatestQuoteAsync(string secId, CancellationToken cancellationToken)
    {
        foreach (var market in Markets)
        {
            var url = $"engines/stock/markets/{market}/securities/{Uri.EscapeDataString(secId)}.json" +
                      "?iss.meta=off&iss.only=securities,marketdata" +
                      "&securities.columns=SECID,SHORTNAME,SECNAME" +
                      "&marketdata.columns=SECID,BOARDID,LAST,MARKETPRICE,LCURRENTPRICE,CLOSEPRICE,SYSTIME";
            using var document = await GetJsonAsync(url, cancellationToken);
            var rows = ReadRows(document.RootElement, "marketdata");
            var securities = ReadRows(document.RootElement, "securities");
            var quoteRow = rows.FirstOrDefault(row => HasAnyDecimal(row, "LAST", "MARKETPRICE", "LCURRENTPRICE", "CLOSEPRICE"));
            if (quoteRow is null)
            {
                continue;
            }

            var securityRow = securities.FirstOrDefault();
            return new SecurityQuote(
                secId,
                ReadString(quoteRow, "BOARDID") ?? "",
                ReadString(securityRow, "SHORTNAME") ?? ReadString(securityRow, "SECNAME") ?? secId,
                ReadString(quoteRow, "SYSTIME"),
                ReadDecimal(quoteRow, "LAST") ?? ReadDecimal(quoteRow, "LCURRENTPRICE"),
                ReadDecimal(quoteRow, "CLOSEPRICE"),
                ReadDecimal(quoteRow, "MARKETPRICE"),
                "MOEX ISS latest");
        }

        return null;
    }

    private async Task<SecurityQuote?> FetchHistoricalQuoteAsync(string secId, string asOf, CancellationToken cancellationToken)
    {
        var date = DateOnly.TryParseExact(asOf, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed)
            ? parsed
            : DateOnly.FromDateTime(DateTime.UtcNow);
        var from = date.AddDays(-14).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var till = date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

        foreach (var market in Markets)
        {
            var url = $"history/engines/stock/markets/{market}/securities/{Uri.EscapeDataString(secId)}.json" +
                      $"?from={from}&till={till}&iss.meta=off&iss.only=history" +
                      "&history.columns=SECID,BOARDID,SHORTNAME,TRADEDATE,CLOSE,LEGALCLOSEPRICE,WAPRICE";
            using var document = await GetJsonAsync(url, cancellationToken);
            var row = ReadRows(document.RootElement, "history")
                .Where(item => string.CompareOrdinal(ReadString(item, "TRADEDATE"), till) <= 0)
                .LastOrDefault(item => HasAnyDecimal(item, "CLOSE", "LEGALCLOSEPRICE", "WAPRICE"));
            if (row is null)
            {
                continue;
            }

            return new SecurityQuote(
                secId,
                ReadString(row, "BOARDID") ?? "",
                ReadString(row, "SHORTNAME") ?? secId,
                ReadString(row, "TRADEDATE"),
                null,
                ReadDecimal(row, "CLOSE") ?? ReadDecimal(row, "LEGALCLOSEPRICE"),
                ReadDecimal(row, "WAPRICE"),
                "MOEX ISS history");
        }

        return null;
    }

    private async Task<JsonDocument> GetJsonAsync(string relativeUrl, CancellationToken cancellationToken)
    {
        using var response = await httpClient.GetAsync(relativeUrl, cancellationToken);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        return await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
    }

    private static IReadOnlyList<IReadOnlyDictionary<string, JsonElement>> ReadRows(JsonElement root, string section)
    {
        if (!root.TryGetProperty(section, out var block)
            || !block.TryGetProperty("columns", out var columnsElement)
            || !block.TryGetProperty("data", out var dataElement)
            || columnsElement.ValueKind != JsonValueKind.Array
            || dataElement.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var columns = columnsElement.EnumerateArray().Select(x => x.GetString() ?? "").ToList();
        var rows = new List<IReadOnlyDictionary<string, JsonElement>>();
        foreach (var dataRow in dataElement.EnumerateArray())
        {
            var values = dataRow.EnumerateArray().ToList();
            var row = new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
            for (var index = 0; index < Math.Min(columns.Count, values.Count); index++)
            {
                row[columns[index]] = values[index];
            }
            rows.Add(row);
        }

        return rows;
    }

    private static bool HasAnyDecimal(IReadOnlyDictionary<string, JsonElement> row, params string[] keys)
    {
        return keys.Any(key => ReadDecimal(row, key).HasValue);
    }

    private static string? ReadString(IReadOnlyDictionary<string, JsonElement>? row, string key)
    {
        if (row is null || !row.TryGetValue(key, out var value) || value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return null;
        }

        return value.ValueKind == JsonValueKind.String ? value.GetString() : value.ToString();
    }

    private static decimal? ReadDecimal(IReadOnlyDictionary<string, JsonElement> row, string key)
    {
        if (!row.TryGetValue(key, out var value) || value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return null;
        }

        if (value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number))
        {
            return number;
        }

        return value.ValueKind == JsonValueKind.String
            && decimal.TryParse(value.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed)
                ? parsed
                : null;
    }

    private static IEnumerable<string> ExtractSymbols(DashboardResponse dashboard)
    {
        return dashboard.Reports
            .SelectMany(report => report.Assets)
            .SelectMany(ExtractSymbols)
            .Where(symbol => !ExcludedSymbols.Contains(symbol))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Order(StringComparer.OrdinalIgnoreCase);
    }

    private static IEnumerable<string> ExtractSymbols(DetailRow row)
    {
        var text = string.Join(" ", [row.Title, row.Subtitle, .. row.Columns.Values]);
        foreach (Match match in MoexSecIdRegex().Matches(text))
        {
            yield return match.Value.ToUpperInvariant();
        }
    }

    [GeneratedRegex(@"\b(?:[A-Z]{4,6}P?|RU[0-9A-Z]{10,}|SU[0-9A-Z]{10,})\b", RegexOptions.Compiled)]
    private static partial Regex MoexSecIdRegex();
}
