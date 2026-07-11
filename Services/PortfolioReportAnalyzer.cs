using System.Text.RegularExpressions;
using System.Globalization;

public static partial class PortfolioReportAnalyzer
{
    public static ReportAnalysis Analyze(string fileName, byte[] bytes)
    {
        var workbookStream = OleCompoundFile.ReadStream(bytes, "Workbook")
                             ?? OleCompoundFile.ReadStream(bytes, "Book")
                             ?? throw new InvalidDataException("Не найден поток Workbook внутри .xls.");

        var workbook = BiffWorkbook.Parse(workbookStream);
        var sheet = workbook.Worksheets
            .OrderByDescending(x => x.NonEmptyCellCount)
            .FirstOrDefault()
            ?? throw new InvalidDataException("В книге не найден лист с данными.");

        return BuildReport(fileName, sheet);
    }

    public static DashboardResponse BuildDashboard(IReadOnlyList<ReportAnalysis> reports)
    {
        var normalizedReports = NormalizeReportSeries(reports);
        return new DashboardResponse(normalizedReports, Combine(normalizedReports));
    }

    public static PortfolioSummary Combine(IReadOnlyList<ReportAnalysis> reports)
    {
        var ordered = reports
            .Where(x => x.IncludedInSummary)
            .OrderBy(GetPeriodStart)
            .ThenBy(GetPeriodEnd)
            .ThenBy(x => x.FileName, StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (ordered.Count == 0)
        {
            ordered = reports.OrderBy(GetPeriodStart).ThenBy(GetPeriodEnd).ToList();
        }

        var latest = ordered.OrderBy(GetPeriodEnd).LastOrDefault();
        var portfolioValue = latest?.PortfolioValue ?? 0m;
        var portfolioChange = ordered.Sum(x => x.PortfolioChange);
        var coupons = ordered.Sum(x => x.CouponsAndDividends);
        var commissions = ordered.Sum(x => x.CommissionsAndTaxes);
        var deposits = ordered.Sum(x => x.DepositsAndWithdrawals);
        var weightedDeposits = ordered.Sum(x => x.Metrics.WeightedCashFlow);
        var assetChange = portfolioChange - coupons - commissions - deposits;
        var metrics = BuildMetrics(portfolioValue, portfolioChange, deposits, weightedDeposits);
        var advancedMetrics = BuildAdvancedMetrics(ordered, metrics, portfolioChange, coupons, commissions, reports.Count - ordered.Count);

        var timeline = ordered.Select(x => new ChartPoint(ShortPeriod(x.Period, x.FileName), x.PortfolioChange)).ToList();
        var topAssets = (latest?.Assets ?? []).OrderByDescending(x => Math.Abs(x.Value)).Take(12).ToList();

        return new PortfolioSummary(
            portfolioValue,
            portfolioChange,
            coupons,
            commissions,
            deposits,
            assetChange,
            metrics,
            advancedMetrics,
            timeline,
            BuildBreakdown(assetChange, coupons, commissions, deposits),
            topAssets,
            ordered.SelectMany(x => x.Trades).Take(40).ToList(),
            ordered.SelectMany(x => x.IncomeRows).Take(40).ToList(),
            ordered.SelectMany(x => x.ExpectedIncomeRows).Take(40).ToList(),
            ordered.SelectMany(x => x.CommissionRows).Take(40).ToList());
    }

    private static IReadOnlyList<ReportAnalysis> NormalizeReportSeries(IReadOnlyList<ReportAnalysis> reports)
    {
        var ordered = reports
            .OrderBy(GetPeriodEnd)
            .ThenBy(GetPeriodStart)
            .ThenBy(x => x.FileName, StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (ordered.Count == 0)
        {
            return [];
        }

        var selected = SelectNonOverlappingReports(ordered);
        return ordered
            .OrderBy(GetPeriodStart)
            .ThenBy(GetPeriodEnd)
            .Select(report =>
            {
                var included = selected.Contains(report);
                var overlappingIncluded = selected.FirstOrDefault(item => !ReferenceEquals(item, report) && PeriodsOverlap(item, report));
                var status = included
                    ? "Включен в итоговую цепочку"
                    : overlappingIncluded is not null
                        ? $"Исключен из итогов: пересекается с {overlappingIncluded.Period}"
                        : "Исключен из итогов: уступает цепочке с большим покрытием дат";
                return report with
                {
                    IncludedInSummary = included,
                    PeriodStatus = status
                };
            })
            .ToList();
    }

    private static HashSet<ReportAnalysis> SelectNonOverlappingReports(IReadOnlyList<ReportAnalysis> orderedByEnd)
    {
        var count = orderedByEnd.Count;
        var previous = new int[count];
        for (var i = 0; i < count; i++)
        {
            previous[i] = -1;
            for (var j = i - 1; j >= 0; j--)
            {
                if (GetPeriodEnd(orderedByEnd[j]) < GetPeriodStart(orderedByEnd[i]))
                {
                    previous[i] = j;
                    break;
                }
            }
        }

        var scores = new long[count + 1];
        for (var i = 1; i <= count; i++)
        {
            var report = orderedByEnd[i - 1];
            var reportScore = (long)Math.Max(1, report.PeriodDays) * 1000L + 1L;
            var includeScore = reportScore + scores[previous[i - 1] + 1];
            var excludeScore = scores[i - 1];
            scores[i] = Math.Max(includeScore, excludeScore);
        }

        var selected = new HashSet<ReportAnalysis>();
        for (var i = count; i > 0;)
        {
            var report = orderedByEnd[i - 1];
            var reportScore = (long)Math.Max(1, report.PeriodDays) * 1000L + 1L;
            var includeScore = reportScore + scores[previous[i - 1] + 1];
            if (includeScore >= scores[i - 1])
            {
                selected.Add(report);
                i = previous[i - 1] + 1;
            }
            else
            {
                i--;
            }
        }

        return selected;
    }

    private static bool PeriodsOverlap(ReportAnalysis left, ReportAnalysis right)
    {
        return GetPeriodStart(left) <= GetPeriodEnd(right) && GetPeriodStart(right) <= GetPeriodEnd(left);
    }

    private static AdvancedMetrics BuildAdvancedMetrics(
        IReadOnlyList<ReportAnalysis> ordered,
        InvestmentMetrics summary,
        decimal pnl,
        decimal income,
        decimal commissions,
        int excludedReportCount)
    {
        var reports = ordered.Count == 0
            ? []
            : ordered.OrderBy(GetPeriodStart).ThenBy(GetPeriodEnd).ThenBy(x => x.FileName, StringComparer.OrdinalIgnoreCase).ToList();

        var periodReturns = reports
            .Select(report => new ChartPoint(ShortPeriod(report.Period, report.FileName), SafePercent(report.Metrics.PnL, report.Metrics.StartValue)))
            .ToList();
        var twr = periodReturns.Count == 0
            ? 0m
            : (periodReturns.Aggregate(1m, (acc, point) => acc * (1m + point.Value / 100m)) - 1m) * 100m;

        var drawdownSeries = BuildDrawdownSeries(periodReturns);
        var maxDrawdown = drawdownSeries.Count == 0 ? 0m : drawdownSeries.Min(x => x.Value);
        var volatility = StandardDeviation(periodReturns.Select(x => x.Value).ToList());
        var averageReturn = periodReturns.Count == 0 ? 0m : periodReturns.Average(x => x.Value);
        var downside = DownsideDeviation(periodReturns.Select(x => x.Value).ToList());
        var sharpe = volatility == 0m ? 0m : averageReturn / volatility;
        var sortino = downside == 0m ? 0m : averageReturn / downside;

        var absCommissions = Math.Abs(commissions);
        var feeToPnl = SafePercent(absCommissions, Math.Abs(pnl));
        var feeToPortfolio = SafePercent(absCommissions, summary.EndValue);
        var incomeYield = SafePercent(income, summary.StartValue);
        var incomeShare = SafePercent(income, Math.Abs(pnl));

        var latest = reports.LastOrDefault();
        var latestAssets = latest?.Assets ?? [];
        var assetBase = latestAssets.Sum(x => Math.Abs(x.Value));
        var topValues = latestAssets.Select(x => Math.Abs(x.Value)).OrderByDescending(x => x).ToList();
        var top1 = SafePercent(topValues.Take(1).Sum(), assetBase);
        var top3 = SafePercent(topValues.Take(3).Sum(), assetBase);
        var top5 = SafePercent(topValues.Take(5).Sum(), assetBase);

        var rubExposure = SafePercent(latestAssets.Where(IsRubAsset).Sum(x => Math.Abs(x.Value)), assetBase);
        var usdExposure = SafePercent(latestAssets.Where(IsUsdAsset).Sum(x => Math.Abs(x.Value)), assetBase);
        var otherExposure = Math.Max(0m, 100m - rubExposure - usdExposure);

        var fxImpact = EstimateFxImpact(reports);
        var turnover = SafePercent(reports.SelectMany(x => x.Trades).Sum(x => Math.Abs(x.Value)), summary.EndValue);
        var realizedPnl = reports.SelectMany(x => x.Trades).Sum(x => x.Value) + income + commissions;
        var unrealizedPnl = pnl - realizedPnl;

        return new AdvancedMetrics(
            Round(twr),
            Round(maxDrawdown),
            Round(volatility),
            Round(sharpe),
            Round(sortino),
            Round(feeToPnl),
            Round(feeToPortfolio),
            Round(incomeYield),
            Round(incomeShare),
            Round(top1),
            Round(top3),
            Round(top5),
            Round(rubExposure),
            Round(usdExposure),
            Round(otherExposure),
            Round(fxImpact),
            Round(turnover),
            Round(realizedPnl),
            Round(unrealizedPnl),
            periodReturns.Select(x => new ChartPoint(x.Label, Round(x.Value))).ToList(),
            drawdownSeries,
            [
                new("Volatility", Round(volatility)),
                new("Sharpe", Round(sharpe)),
                new("Sortino", Round(sortino)),
                new("Max drawdown", Round(maxDrawdown))
            ],
            [
                new("RUB", Round(rubExposure)),
                new("USD", Round(usdExposure)),
                new("Other", Round(otherExposure))
            ],
            BuildAdvancedNotes(reports.Count, excludedReportCount));
    }

    private static IReadOnlyList<MetricNote> BuildAdvancedNotes(int reportCount, int excludedReportCount)
    {
        var notes = new List<MetricNote>
        {
            new("TWR", "Считается по цепочке загруженных отчетов как произведение периодных доходностей."),
            new("Sharpe/Sortino", "Risk-free rate пока принят равным 0%; можно вынести в настройку."),
            new("Realized/Unrealized PnL", "Оценка приближенная: отчет не всегда содержит цену входа по каждой позиции.")
        };

        if (reportCount < 3)
        {
            notes.Add(new MetricNote("Series quality", "Для volatility, drawdown и Sharpe желательно загрузить больше отчетов без пересечения периодов."));
        }

        if (excludedReportCount > 0)
        {
            notes.Add(new MetricNote("Overlaps", $"{excludedReportCount} отчет(а) исключены из итоговых расчетов, чтобы не задваивать пересекающиеся периоды."));
        }

        return notes;
    }

    private static IReadOnlyList<ChartPoint> BuildDrawdownSeries(IReadOnlyList<ChartPoint> periodReturns)
    {
        var result = new List<ChartPoint>();
        var cumulative = 1m;
        var peak = 1m;
        foreach (var point in periodReturns)
        {
            cumulative *= 1m + point.Value / 100m;
            peak = Math.Max(peak, cumulative);
            var drawdown = peak == 0m ? 0m : (cumulative - peak) / peak * 100m;
            result.Add(new ChartPoint(point.Label, Round(drawdown)));
        }

        return result;
    }

    private static DateTime GetPeriodStart(ReportAnalysis report)
    {
        return DateTime.TryParseExact(report.PeriodStart, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
            ? date
            : DateTime.MinValue;
    }

    private static DateTime GetPeriodEnd(ReportAnalysis report)
    {
        return DateTime.TryParseExact(report.PeriodEnd, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
            ? date
            : DateTime.MinValue;
    }

    private static decimal EstimateFxImpact(IReadOnlyList<ReportAnalysis> reports)
    {
        return reports.Sum(report =>
        {
            var usdRows = report.PreviewRows.Where(row => row.Any(cell => cell.Contains("USD", StringComparison.OrdinalIgnoreCase))).ToList();
            var values = usdRows.SelectMany(row => row.Select(ParseRussianDecimal).OfType<decimal>()).ToList();
            return values.Count >= 2 ? values[^1] - values[0] : 0m;
        });
    }

    private static decimal? ParseRussianDecimal(string value)
    {
        var normalized = value.Replace("\u00A0", "").Replace(" ", "").Replace(",", ".");
        return decimal.TryParse(normalized, System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var result)
            ? result
            : null;
    }

    private static bool IsRubAsset(DetailRow row)
    {
        if (IsUsdAsset(row))
        {
            return false;
        }

        return row.Title.StartsWith("RU", StringComparison.OrdinalIgnoreCase)
               || row.Title.Contains("Рубль", StringComparison.OrdinalIgnoreCase)
               || row.Subtitle.Contains("Рубль", StringComparison.OrdinalIgnoreCase)
               || row.Columns.Values.Any(x => x.Contains("Рубль", StringComparison.OrdinalIgnoreCase)
                                              || x.Contains("ММВБ", StringComparison.OrdinalIgnoreCase)
                                              || x.Contains("МосБирж", StringComparison.OrdinalIgnoreCase)
                                              || x.Contains("НРД", StringComparison.OrdinalIgnoreCase)
                                              || x.Contains("НКЦ", StringComparison.OrdinalIgnoreCase));
    }

    private static bool IsUsdAsset(DetailRow row)
    {
        return row.Title.Contains("USD", StringComparison.OrdinalIgnoreCase)
               || row.Title.Contains("_US", StringComparison.OrdinalIgnoreCase)
               || row.Subtitle.Contains("USD", StringComparison.OrdinalIgnoreCase)
               || row.Columns.Values.Any(x => x.Contains("USD", StringComparison.OrdinalIgnoreCase) || x.Contains("USMarkets", StringComparison.OrdinalIgnoreCase));
    }

    private static decimal SafePercent(decimal numerator, decimal denominator)
    {
        return denominator == 0m ? 0m : numerator / denominator * 100m;
    }

    private static decimal StandardDeviation(IReadOnlyList<decimal> values)
    {
        if (values.Count < 2)
        {
            return 0m;
        }

        var average = values.Average();
        var variance = values.Sum(value => (value - average) * (value - average)) / (values.Count - 1);
        return (decimal)Math.Sqrt((double)variance);
    }

    private static decimal DownsideDeviation(IReadOnlyList<decimal> values)
    {
        var downside = values.Where(x => x < 0m).ToList();
        if (downside.Count == 0)
        {
            return 0m;
        }

        var variance = downside.Sum(value => value * value) / downside.Count;
        return (decimal)Math.Sqrt((double)variance);
    }

    private static decimal Round(decimal value) => Math.Round(value, 2);

    private static ReportAnalysis BuildReport(string fileName, WorksheetData sheet)
    {
        var rows = sheet.ToRows();
        var period = ExtractPeriod(rows) ?? fileName;
        var periodInfo = BuildPeriodInfo(period);
        var portfolioTotal = ExtractPortfolioTotal(rows);

        var incomeRows = ExtractRows(rows, static text => text.Contains("купон", StringComparison.OrdinalIgnoreCase), 30)
            .Where(x => DateRegex().IsMatch(x.Subtitle))
            .GroupBy(OperationAggregationKey, StringComparer.OrdinalIgnoreCase)
            .Select(MergeDetailRows)
            .ToList();
        var expectedIncomeRows = ExtractExpectedIncomeRows(rows)
            .GroupBy(OperationAggregationKey, StringComparer.OrdinalIgnoreCase)
            .Select(MergeDetailRows)
            .ToList();
        var commissionRows = ExtractRows(rows, static text => text.Contains("комисси", StringComparison.OrdinalIgnoreCase)
                                                             || text.Contains("налог", StringComparison.OrdinalIgnoreCase), 30)
            .Where(x => DateRegex().IsMatch(x.Subtitle)
                        || x.Title.Contains("Комиссия", StringComparison.OrdinalIgnoreCase)
                        || x.Subtitle.Contains("Комиссия", StringComparison.OrdinalIgnoreCase))
            .Where(x => !x.Title.Contains("Итого", StringComparison.OrdinalIgnoreCase))
            .Select(ApplyCommissionSign)
            .GroupBy(CommissionAggregationKey, StringComparer.OrdinalIgnoreCase)
            .Select(MergeDetailRows)
            .ToList();
        var trades = ExtractSectionRows(rows, "2.1. Сделки", "Займы", 40)
            .Concat(ExtractRows(rows, static text => text.Contains("Покупка/Продажа", StringComparison.OrdinalIgnoreCase), 20))
            .GroupBy(x => $"{x.Title}:{x.Subtitle}:{Math.Abs(x.Value)}", StringComparer.OrdinalIgnoreCase)
            .Select(x => x.First())
            .GroupBy(OperationAggregationKey, StringComparer.OrdinalIgnoreCase)
            .Select(MergeDetailRows)
            .ToList();
        var assets = ExtractAssetRows(rows);
        var diagnostics = BuildDiagnostics(fileName, rows, assets, trades, incomeRows, expectedIncomeRows, commissionRows);

        var coupons = SumPositive(incomeRows);
        var commissions = -Math.Abs(SumAbsolute(commissionRows));
        var cashFlow = BuildCashFlowSummary(rows, periodInfo);
        var deposits = cashFlow.Total;
        var portfolioChange = portfolioTotal.Change;
        var assetChange = portfolioChange - coupons - commissions - deposits;
        var metrics = BuildMetrics(portfolioTotal.EndValue, portfolioChange, deposits, cashFlow.Weighted);

        return new ReportAnalysis(
            fileName,
            sheet.Name,
            period,
            periodInfo.StartIso,
            periodInfo.EndIso,
            periodInfo.Days,
            true,
            "Включен в итоговую цепочку",
            portfolioTotal.EndValue,
            portfolioChange,
            coupons,
            commissions,
            deposits,
            assetChange,
            metrics,
            BuildBreakdown(assetChange, coupons, commissions, deposits),
            assets,
            trades,
            incomeRows,
            expectedIncomeRows,
            commissionRows,
            rows.Take(80).Select(x => (IReadOnlyList<string>)x.Cells.Select(c => c.Display).ToList()).ToList(),
            diagnostics);
    }

    private static ReportDiagnostics BuildDiagnostics(
        string fileName,
        IReadOnlyList<RowData> rows,
        params IReadOnlyList<DetailRow>[] recognizedGroups)
    {
        var recognizedRows = recognizedGroups.Sum(x => x.Count);
        var recognizedTitles = recognizedGroups
            .SelectMany(x => x)
            .Select(x => x.Title)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var candidateRows = rows
            .Where(row => IsDiagnosticCandidateRow(row, rows))
            .ToList();
        var skippedRows = candidateRows
            .Where(row => !recognizedTitles.Any(title => row.Text.Contains(title, StringComparison.OrdinalIgnoreCase)))
            .Take(12)
            .Select(row => new ProcessingIssue(
                "warning",
                "row",
                fileName,
                row.Index + 1,
                $"Строка похожа на табличные данные, но не попала в активы, сделки, доходы или комиссии: {TrimForIssue(row.Text)}"))
            .ToList();

        var issues = new List<ProcessingIssue>();
        if (recognizedRows == 0)
        {
            issues.Add(new ProcessingIssue(
                "warning",
                "file",
                fileName,
                null,
                "В файле не удалось уверенно распознать активы, сделки, доходы или комиссии."));
        }

        issues.AddRange(skippedRows);
        return new ReportDiagnostics(
            rows.Count,
            recognizedRows,
            Math.Max(0, candidateRows.Count - recognizedRows),
            issues);
    }

    private static string TrimForIssue(string text)
    {
        var normalized = Regex.Replace(text, "\\s+", " ").Trim();
        return normalized.Length <= 180 ? normalized : $"{normalized[..180]}…";
    }

    private static bool IsDiagnosticCandidateRow(RowData row, IReadOnlyList<RowData> rows)
    {
        if (row.Cells.Count(cell => !string.IsNullOrWhiteSpace(cell.Display)) < 4 || !row.Cells.Any(cell => cell.Number.HasValue))
        {
            return false;
        }

        var text = row.Text.Trim();
        if (IsAggregateOrUnsupportedDiagnosticRow(text))
        {
            return false;
        }

        if (HasNearbySectionMarker(rows, row.Index, "Займы")
            || HasNearbySectionMarker(rows, row.Index, "Овернайт")
            || HasNearbySectionMarker(rows, row.Index, "Портфель по ценным бумагам")
            || HasNearbySectionMarker(rows, row.Index, "Предполагаемый к зачислению доход")
            || HasNearbySectionMarker(rows, row.Index, "Движение Ценных бумаг"))
        {
            return false;
        }

        return true;
    }

    private static bool IsAggregateOrUnsupportedDiagnosticRow(string text)
    {
        return text.Contains("Итого", StringComparison.OrdinalIgnoreCase)
               || text.Contains("Портфель по ценным бумагам", StringComparison.OrdinalIgnoreCase)
               || text.Contains("Стоимость портфеля", StringComparison.OrdinalIgnoreCase)
               || text.Contains("Обязательства клиента", StringComparison.OrdinalIgnoreCase)
               || text.Contains("Дата составления отчета", StringComparison.OrdinalIgnoreCase)
               || text.Contains("Курсы валют", StringComparison.OrdinalIgnoreCase)
               || text.Contains("Вид актива", StringComparison.OrdinalIgnoreCase)
               || text.Contains("Торговый раздел", StringComparison.OrdinalIgnoreCase)
               || text.Contains("Блокированный раздел", StringComparison.OrdinalIgnoreCase)
               || text.Contains("Основной раздел", StringComparison.OrdinalIgnoreCase);
    }

    private static bool HasNearbySectionMarker(IReadOnlyList<RowData> rows, int rowIndex, string marker)
    {
        return rows
            .Where(row => row.Index < rowIndex && row.Index >= rowIndex - 60)
            .Any(row => row.Text.Contains(marker, StringComparison.OrdinalIgnoreCase));
    }

    private static IReadOnlyList<DetailRow> ExtractExpectedIncomeRows(IReadOnlyList<RowData> rows)
    {
        var extracted = ExtractSectionRows(rows, "1.4. Предполагаемый к зачислению доход", "2.1. Сделки", 30);
        if (extracted.Count == 0)
        {
            extracted = ExtractSectionRows(rows, "Предполагаемый к зачислению доход", "Курсы валют", 30);
        }

        return extracted
            .Where(x => !x.Title.Contains("Итого", StringComparison.OrdinalIgnoreCase))
            .Select(x => x with
            {
                Value = PickColumnValue(x.Columns,
                    "Предполагаемая сумма зачисления в валюте выплаты",
                    "Начисленная сумма")
            })
            .Where(x => x.Value != 0m)
            .ToList();
    }

    private static InvestmentMetrics BuildMetrics(decimal endValue, decimal totalValueChange, decimal netCashFlow, decimal weightedCashFlow)
    {
        var startValue = endValue - totalValueChange;
        var pnl = totalValueChange - netCashFlow;
        var roiBase = startValue == 0m ? endValue : startValue;
        var roi = roiBase == 0m ? 0m : pnl / roiBase * 100m;

        var dietzBase = startValue + weightedCashFlow;
        var mwr = dietzBase == 0m ? 0m : pnl / dietzBase * 100m;

        return new InvestmentMetrics(
            Math.Round(pnl, 2),
            Math.Round(roi, 2),
            Math.Round(mwr, 2),
            Math.Round(startValue, 2),
            Math.Round(endValue, 2),
            Math.Round(netCashFlow, 2),
            Math.Round(weightedCashFlow, 2));
    }

    private static (decimal EndValue, decimal Change) ExtractPortfolioTotal(IReadOnlyList<RowData> rows)
    {
        var portfolioRow = rows.LastOrDefault(x => x.Text.Contains("Стоимость портфеля (руб", StringComparison.OrdinalIgnoreCase));
        if (portfolioRow is not null)
        {
            var values = portfolioRow.Cells.Select(x => x.Number).OfType<decimal>().ToList();
            if (values.Count >= 3)
            {
                return (values[^2], values[^1]);
            }

            if (values.Count >= 2)
            {
                return (values[^1], values[^1] - values[0]);
            }
        }

        var rubRow = rows.LastOrDefault(x => x.Text.Contains("Итого (Рубль", StringComparison.OrdinalIgnoreCase)
                                             && x.Cells.Select(c => c.Number).OfType<decimal>().Count() >= 5);
        if (rubRow is not null)
        {
            var values = rubRow.Cells.Select(x => x.Number).OfType<decimal>().ToList();
            return (values[^2], values[^1]);
        }

        return (
            FindNumberNear(rows, "Стоимость портфеля (руб", preferLast: true),
            FindNumberNear(rows, "Изменение стоимости портфеля", preferLast: true));
    }

    private static IReadOnlyList<ChartPoint> BuildBreakdown(decimal assetChange, decimal coupons, decimal commissions, decimal deposits)
    {
        return
        [
            new("Изменение активов", assetChange),
            new("Купоны и дивиденды", coupons),
            new("Комиссии и налоги", commissions),
            new("Пополнения и выводы", deposits)
        ];
    }

    private static string ShortPeriod(string period, string fallback)
    {
        var dates = DateRegex().Matches(period).Select(x => x.Value).ToList();
        if (dates.Count >= 2)
        {
            return $"{dates[0]}-{dates[^1]}";
        }

        return dates.FirstOrDefault() ?? Path.GetFileNameWithoutExtension(fallback);
    }

    private static string? ExtractPeriod(IReadOnlyList<RowData> rows)
    {
        foreach (var row in rows)
        {
            var text = row.Text;
            if (!text.Contains("Период", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var dates = DateRegex().Matches(text).Select(x => x.Value).ToList();
            if (dates.Count >= 2)
            {
                return $"{dates[0]} - {dates[^1]}";
            }

            var after = row.Cells.SkipWhile(x => !x.Display.Contains("Период", StringComparison.OrdinalIgnoreCase))
                .Skip(1)
                .Select(x => x.Display)
                .Where(x => !string.IsNullOrWhiteSpace(x));
            var value = string.Join(" ", after);
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        var allDates = rows.SelectMany(x => DateRegex().Matches(x.Text).Select(m => m.Value)).Distinct().Take(2).ToList();
        return allDates.Count switch
        {
            >= 2 => $"{allDates[0]} - {allDates[^1]}",
            1 => allDates[0],
            _ => null
        };
    }

    private static PeriodInfo BuildPeriodInfo(string period)
    {
        var dates = DateRegex().Matches(period)
            .Select(match => ParseReportDate(match.Value))
            .OfType<DateTime>()
            .OrderBy(x => x)
            .ToList();

        var start = dates.FirstOrDefault();
        var end = dates.LastOrDefault();
        if (start == default && end == default)
        {
            start = DateTime.MinValue;
            end = DateTime.MinValue;
        }
        else if (end == default)
        {
            end = start;
        }

        var days = start == DateTime.MinValue || end == DateTime.MinValue
            ? 1
            : Math.Max(1, (end.Date - start.Date).Days + 1);
        return new PeriodInfo(
            start == DateTime.MinValue ? "" : start.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            end == DateTime.MinValue ? "" : end.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            days);
    }

    private static DateTime? ParseReportDate(string value)
    {
        return DateTime.TryParseExact(value, ["dd.MM.yyyy", "dd.MM.yy"], CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
            ? date
            : null;
    }

    private static decimal FindNumberNear(IReadOnlyList<RowData> rows, string label, bool preferLast)
    {
        var matches = new List<decimal>();
        foreach (var row in rows)
        {
            if (!row.Text.Contains(label, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            matches.AddRange(row.Cells.Select(x => x.Number).OfType<decimal>());
            var rowIndex = rows.FindIndex(x => ReferenceEquals(x, row) || x.Index == row.Index);
            for (var i = rowIndex + 1; i < Math.Min(rows.Count, rowIndex + 3); i++)
            {
                matches.AddRange(rows[i].Cells.Select(x => x.Number).OfType<decimal>());
            }
        }

        if (matches.Count == 0)
        {
            return 0m;
        }

        return preferLast ? matches[^1] : matches[0];
    }

    private static CashFlowSummary BuildCashFlowSummary(IReadOnlyList<RowData> rows, PeriodInfo period)
    {
        var candidates = ExtractRows(rows, static text => text.Contains("пополн", StringComparison.OrdinalIgnoreCase)
                                                        || text.Contains("вывод", StringComparison.OrdinalIgnoreCase), 100);
        var signedCandidates = candidates.Select(ApplyCashFlowSign).ToList();
        var total = signedCandidates.Sum(x => x.Value);
        var weighted = signedCandidates.Sum(x => x.Value * CashFlowWeight(x, period));
        return new CashFlowSummary(total, weighted);
    }

    private static DetailRow ApplyCommissionSign(DetailRow row)
    {
        var value = Math.Abs(row.Value);
        var text = DetailSearchText(row);
        var isRefund = text.Contains("возврат", StringComparison.OrdinalIgnoreCase)
                       || text.Contains("refund", StringComparison.OrdinalIgnoreCase)
                       || text.Contains("сторно", StringComparison.OrdinalIgnoreCase);
        return row with { Value = isRefund ? value : -value };
    }

    private static string CommissionAggregationKey(DetailRow row)
    {
        return OperationAggregationKey(row);
    }

    private static string OperationAggregationKey(DetailRow row)
    {
        var title = row.Title;
        if (title.StartsWith("Начислено:", StringComparison.OrdinalIgnoreCase))
        {
            title = title["Начислено:".Length..];
        }

        title = Regex.Replace(title, "\\([^)]*\\)", " ");
        title = Regex.Replace(title, "\\s+", " ").Trim();
        return title.Length == 0 ? row.Title : title;
    }

    private static DetailRow MergeDetailRows(IGrouping<string, DetailRow> group)
    {
        var rows = group.ToList();
        var first = rows[0];
        var columns = new Dictionary<string, string>(first.Columns, StringComparer.OrdinalIgnoreCase)
        {
            ["Количество строк"] = rows.Count.ToString(CultureInfo.InvariantCulture)
        };
        var dates = rows
            .Select(ExtractDetailDate)
            .OfType<DateTime>()
            .Select(x => x.ToString("dd.MM.yy", CultureInfo.InvariantCulture))
            .Distinct()
            .Take(6)
            .ToList();

        if (dates.Count > 0)
        {
            columns["Даты операций"] = string.Join(", ", dates);
        }

        return first with
        {
            Title = group.Key,
            Subtitle = rows.Count == 1 ? first.Subtitle : $"{rows.Count} операций · {first.Subtitle}",
            Value = rows.Sum(x => x.Value),
            Columns = columns
        };
    }

    private static DetailRow ApplyCashFlowSign(DetailRow row)
    {
        var value = Math.Abs(row.Value);
        var text = DetailSearchText(row);
        var isOutflow = text.Contains("вывод", StringComparison.OrdinalIgnoreCase)
                        || text.Contains("списан", StringComparison.OrdinalIgnoreCase)
                        || text.Contains("расход", StringComparison.OrdinalIgnoreCase)
                        || text.Contains("pay out", StringComparison.OrdinalIgnoreCase)
                        || text.Contains("payout", StringComparison.OrdinalIgnoreCase);
        var isInflow = text.Contains("пополн", StringComparison.OrdinalIgnoreCase)
                       || text.Contains("зачисл", StringComparison.OrdinalIgnoreCase)
                       || text.Contains("приход", StringComparison.OrdinalIgnoreCase)
                       || text.Contains("pay in", StringComparison.OrdinalIgnoreCase)
                       || text.Contains("payin", StringComparison.OrdinalIgnoreCase);

        if (isOutflow && !isInflow)
        {
            return row with { Value = -value };
        }

        if (isInflow && !isOutflow)
        {
            return row with { Value = value };
        }

        return row;
    }

    private static string DetailSearchText(DetailRow row)
    {
        return string.Join(" ", new[]
        {
            row.Title,
            row.Subtitle,
            string.Join(" ", row.Columns.SelectMany(x => new[] { x.Key, x.Value }))
        });
    }

    private static decimal CashFlowWeight(DetailRow row, PeriodInfo period)
    {
        var start = ParseIsoDate(period.StartIso);
        var end = ParseIsoDate(period.EndIso);
        if (start is null || end is null || end < start)
        {
            return 0.5m;
        }

        var flowDate = ExtractDetailDate(row);
        if (flowDate is null)
        {
            return 0.5m;
        }

        var date = flowDate.Value.Date;
        if (date < start.Value.Date)
        {
            date = start.Value.Date;
        }
        else if (date > end.Value.Date)
        {
            date = end.Value.Date;
        }

        var periodDays = Math.Max(1, (end.Value.Date - start.Value.Date).Days + 1);
        var remainingDays = Math.Clamp((end.Value.Date - date).Days, 0, periodDays);
        return remainingDays / (decimal)periodDays;
    }

    private static DateTime? ExtractDetailDate(DetailRow row)
    {
        var text = string.Join(" ", new[]
        {
            row.Title,
            row.Subtitle,
            string.Join(" ", row.Columns.Values)
        });

        return DateRegex()
            .Matches(text)
            .Select(match => ParseReportDate(match.Value))
            .OfType<DateTime>()
            .OrderBy(x => x)
            .FirstOrDefault();
    }

    private static DateTime? ParseIsoDate(string value)
    {
        return DateTime.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
            ? date
            : null;
    }

    private static IReadOnlyList<DetailRow> ExtractAssetRows(IReadOnlyList<RowData> rows)
    {
        var result = new List<DetailRow>();
        var starts = rows
            .Select((row, index) => new { row, index })
            .Where(x => x.row.Text.Contains("Вид актива", StringComparison.OrdinalIgnoreCase))
            .Select(x => x.index)
            .ToList();

        foreach (var start in starts)
        {
            var headers = BuildAssetHeaderMap(rows, start);
            for (var i = start + 1; i < rows.Count && result.Count < 80; i++)
            {
                var row = rows[i];
                if (row.Text.Contains("Портфель по ценным бумагам", StringComparison.OrdinalIgnoreCase)
                    || row.Text.Contains("Обязательства клиента", StringComparison.OrdinalIgnoreCase)
                    || row.Text.Contains("Дата составления отчета", StringComparison.OrdinalIgnoreCase))
                {
                    break;
                }

                if (row.Cells.Count(x => !string.IsNullOrWhiteSpace(x.Display)) < 5
                    || row.Text.Contains("Итого", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var value = PickMeaningfulValue(row);
                if (value == 0m)
                {
                    continue;
                }

                var title = PickTitle(row);
                if (string.IsNullOrWhiteSpace(title) || !IsReadableTitle(title))
                {
                    continue;
                }

                result.Add(new DetailRow(title, PickSubtitle(row, title), value, ToColumns(row, headers)));
            }
        }

        return result
            .GroupBy(OperationAggregationKey, StringComparer.OrdinalIgnoreCase)
            .Select(MergeDetailRows)
            .OrderByDescending(x => Math.Abs(x.Value))
            .ToList();
    }

    private static IReadOnlyList<DetailRow> ExtractRows(IReadOnlyList<RowData> rows, Func<string, bool> predicate, int take)
    {
        var result = new List<DetailRow>();
        for (var index = 0; index < rows.Count; index++)
        {
            var row = rows[index];
            if (!predicate(row.Text))
            {
                continue;
            }

            var value = PickMeaningfulValue(row);
            if (value == 0m && !row.Cells.Any(x => x.Number.HasValue))
            {
                continue;
            }

            var title = PickTitle(row);
            result.Add(new DetailRow(title, PickSubtitle(row, title), value, ToColumns(row, FindNearestHeaderMap(rows, index))));
            if (result.Count >= take)
            {
                break;
            }
        }

        return result;
    }

    private static IReadOnlyList<DetailRow> ExtractSectionRows(IReadOnlyList<RowData> rows, string startMarker, string endMarker, int take)
    {
        var start = rows.FindIndex(x => x.Text.Contains(startMarker, StringComparison.OrdinalIgnoreCase));
        if (start < 0)
        {
            return [];
        }

        var result = new List<DetailRow>();
        var sectionHeaders = BuildSectionHeaderMap(rows, start);
        for (var i = start + 1; i < rows.Count && result.Count < take; i++)
        {
            var row = rows[i];
            if (row.Text.Contains(endMarker, StringComparison.OrdinalIgnoreCase))
            {
                break;
            }

            if (!row.Cells.Any(x => x.Number.HasValue) || row.Cells.Count(x => !string.IsNullOrWhiteSpace(x.Display)) < 4)
            {
                continue;
            }

            var title = PickTitle(row);
            if (string.IsNullOrWhiteSpace(title))
            {
                continue;
            }

            result.Add(new DetailRow(title, PickSubtitle(row, title), PickMeaningfulValue(row), ToColumns(row, sectionHeaders)));
        }

        return result;
    }

    private static decimal SumPositive(IEnumerable<DetailRow> rows) => rows.Sum(x => x.Value > 0 ? x.Value : Math.Abs(x.Value));

    private static decimal SumAbsolute(IEnumerable<DetailRow> rows)
    {
        var values = rows.Select(x => Math.Abs(x.Value)).Where(x => x > 0 && x < 1_000_000_000m).ToList();
        return values.Sum();
    }

    private static decimal PickMeaningfulValue(RowData row)
    {
        var values = row.Cells.Select(x => x.Number).OfType<decimal>().Where(x => Math.Abs(x) < 1_000_000_000_000m).ToList();
        if (values.Count == 0)
        {
            return 0m;
        }

        return values.OrderByDescending(Math.Abs).First();
    }

    private static string PickTitle(RowData row)
    {
        return row.Cells
            .Where(x => !string.IsNullOrWhiteSpace(x.Display) && !x.Number.HasValue)
            .Select(x => x.Display.Trim())
            .Where(x => x.Length > 1 && !DateRegex().IsMatch(x))
            .OrderByDescending(x => x.Length)
            .FirstOrDefault() ?? row.Text;
    }

    private static bool IsReadableTitle(string title)
    {
        if (title.Length > 120)
        {
            return false;
        }

        var controlCount = title.Count(char.IsControl);
        return controlCount == 0;
    }

    private static string PickSubtitle(RowData row, string title)
    {
        var parts = row.Cells
            .Where(x => !string.IsNullOrWhiteSpace(x.Display) && x.Display != title)
            .Select(x => x.Display.Trim())
            .Where(x => x.Length > 1)
            .Take(4);
        return string.Join(" · ", parts);
    }

    private static IReadOnlyDictionary<string, string> ToColumns(RowData row, IReadOnlyDictionary<int, string>? headers = null)
    {
        var result = new Dictionary<string, string>();
        foreach (var cell in row.Cells.Where(x => !string.IsNullOrWhiteSpace(x.Display)).Take(18))
        {
            var key = headers is not null && headers.TryGetValue(cell.Column, out var header)
                ? header
                : $"Поле {cell.Column + 1}";

            key = NormalizeColumnName(key);
            if (result.ContainsKey(key))
            {
                key = $"{key} #{cell.Column + 1}";
            }

            result[key] = cell.Display;
        }

        return result;
    }

    private static IReadOnlyDictionary<int, string> FindNearestHeaderMap(IReadOnlyList<RowData> rows, int rowIndex)
    {
        for (var i = rowIndex - 1; i >= Math.Max(0, rowIndex - 8); i--)
        {
            var row = rows[i];
            var headers = BuildHeaderMap(row);
            if (headers.Count >= 2 && LooksLikeHeader(row))
            {
                return headers;
            }
        }

        return new Dictionary<int, string>();
    }

    private static IReadOnlyDictionary<int, string> BuildSectionHeaderMap(IReadOnlyList<RowData> rows, int sectionStart)
    {
        var headers = new Dictionary<int, string>();
        var headerSeen = false;
        for (var i = sectionStart + 1; i < Math.Min(rows.Count, sectionStart + 8); i++)
        {
            var row = rows[i];
            if (row.Text.Contains("Валюта цены =", StringComparison.OrdinalIgnoreCase)
                || row.Text.Contains("валюта платежа =", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var looksLikeHeader = LooksLikeHeader(row);
            if (row.Cells.Any(x => x.Number.HasValue) && !looksLikeHeader)
            {
                break;
            }

            if (!looksLikeHeader)
            {
                if (headerSeen)
                {
                    break;
                }

                continue;
            }

            foreach (var (column, name) in BuildHeaderMap(row))
            {
                headers[column] = headers.TryGetValue(column, out var current)
                    ? NormalizeColumnName($"{current} / {name}")
                    : name;
            }

            headerSeen = true;
        }

        return headers;
    }

    private static IReadOnlyDictionary<int, string> BuildAssetHeaderMap(IReadOnlyList<RowData> rows, int headerIndex)
    {
        var headers = BuildHeaderMap(rows[headerIndex]);
        var periodMarkers = headerIndex > 0
            ? BuildHeaderMap(rows[headerIndex - 1])
                .Where(x => x.Value.Contains("начало периода", StringComparison.OrdinalIgnoreCase)
                            || x.Value.Contains("конец периода", StringComparison.OrdinalIgnoreCase))
                .OrderBy(x => x.Key)
                .ToList()
            : [];

        if (periodMarkers.Count == 0)
        {
            return headers;
        }

        return headers.ToDictionary(
            x => x.Key,
            x =>
            {
                var marker = periodMarkers.LastOrDefault(period => period.Key <= x.Key);
                return string.IsNullOrWhiteSpace(marker.Value)
                    ? x.Value
                    : NormalizeColumnName($"{marker.Value} / {x.Value}");
            });
    }

    private static Dictionary<int, string> BuildHeaderMap(RowData row)
    {
        return row.Cells
            .Where(x => !string.IsNullOrWhiteSpace(x.Display) && !x.Number.HasValue)
            .GroupBy(x => x.Column)
            .ToDictionary(x => x.Key, x => NormalizeColumnName(string.Join(" / ", x.Select(c => c.Display))));
    }

    private static decimal PickColumnValue(IReadOnlyDictionary<string, string> columns, params string[] names)
    {
        foreach (var name in names)
        {
            var match = columns.FirstOrDefault(x => x.Key.Contains(name, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(match.Value))
            {
                return ParseRussianDecimal(match.Value) ?? 0m;
            }
        }

        return 0m;
    }

    private static bool LooksLikeHeader(RowData row)
    {
        var text = row.Text;
        return text.Contains("Дата", StringComparison.OrdinalIgnoreCase)
               || text.Contains("Сумма", StringComparison.OrdinalIgnoreCase)
               || text.Contains("Цена", StringComparison.OrdinalIgnoreCase)
               || text.Contains("Вид актива", StringComparison.OrdinalIgnoreCase)
               || text.Contains("Тип", StringComparison.OrdinalIgnoreCase)
               || text.Contains("Место хранения", StringComparison.OrdinalIgnoreCase)
               || text.Contains("Организатор", StringComparison.OrdinalIgnoreCase)
               || text.Contains("Валюта", StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizeColumnName(string value)
    {
        var normalized = Regex.Replace(value.Replace('\n', ' '), @"\s+", " ").Trim();
        normalized = normalized
            .Replace("Кол-во ЦБ / Масса ДМ (шт/г)", "Количество")
            .Replace("Цена закрытия/ котировка вторич.(5*)", "Цена")
            .Replace("Сумма, в т.ч. НКД", "Сумма")
            .Replace("Номер гос. регистрации ЦБ/ ISIN", "ISIN")
            .Replace("Тип актива (для ЦБ - № вып.)", "Тип актива");
        return normalized.Length > 64 ? $"{normalized[..61]}..." : normalized;
    }

    [GeneratedRegex(@"\d{2}\.\d{2}\.\d{2,4}")]
    private static partial Regex DateRegex();

    private sealed record PeriodInfo(string StartIso, string EndIso, int Days);
    private sealed record CashFlowSummary(decimal Total, decimal Weighted);
}

public static class ListExtensions
{
    public static int FindIndex<T>(this IReadOnlyList<T> source, Predicate<T> predicate)
    {
        for (var i = 0; i < source.Count; i++)
        {
            if (predicate(source[i]))
            {
                return i;
            }
        }

        return -1;
    }
}
