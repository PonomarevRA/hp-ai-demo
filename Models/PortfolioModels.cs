using System.Text.Json.Serialization;

public sealed record DashboardResponse(
    IReadOnlyList<ReportAnalysis> Reports,
    PortfolioSummary Summary);

public sealed record PortfolioSummary(
    decimal PortfolioValue,
    decimal PortfolioChange,
    decimal CouponsAndDividends,
    decimal CommissionsAndTaxes,
    decimal DepositsAndWithdrawals,
    decimal AssetChange,
    InvestmentMetrics Metrics,
    AdvancedMetrics AdvancedMetrics,
    IReadOnlyList<ChartPoint> Timeline,
    IReadOnlyList<ChartPoint> Breakdown,
    IReadOnlyList<DetailRow> TopAssets,
    IReadOnlyList<DetailRow> Trades,
    IReadOnlyList<DetailRow> IncomeRows,
    IReadOnlyList<DetailRow> ExpectedIncomeRows,
    IReadOnlyList<DetailRow> CommissionRows);

public sealed record ReportAnalysis(
    string FileName,
    string SheetName,
    string Period,
    string PeriodStart,
    string PeriodEnd,
    int PeriodDays,
    bool IncludedInSummary,
    string PeriodStatus,
    decimal PortfolioValue,
    decimal PortfolioChange,
    decimal CouponsAndDividends,
    decimal CommissionsAndTaxes,
    decimal DepositsAndWithdrawals,
    decimal AssetChange,
    InvestmentMetrics Metrics,
    IReadOnlyList<ChartPoint> Breakdown,
    IReadOnlyList<DetailRow> Assets,
    IReadOnlyList<DetailRow> Trades,
    IReadOnlyList<DetailRow> IncomeRows,
    IReadOnlyList<DetailRow> ExpectedIncomeRows,
    IReadOnlyList<DetailRow> CommissionRows,
    IReadOnlyList<IReadOnlyList<string>> PreviewRows);

public sealed record ChartPoint(string Label, decimal Value);

public sealed record InvestmentMetrics(
    [property: JsonPropertyName("pnl")] decimal PnL,
    [property: JsonPropertyName("roi")] decimal ROI,
    [property: JsonPropertyName("mwr")] decimal MWR,
    decimal StartValue,
    decimal EndValue,
    decimal NetCashFlow,
    decimal WeightedCashFlow);

public sealed record AdvancedMetrics(
    [property: JsonPropertyName("twr")] decimal TWR,
    decimal MaxDrawdown,
    decimal Volatility,
    decimal Sharpe,
    decimal Sortino,
    decimal FeeToPnl,
    decimal FeeToPortfolio,
    decimal IncomeYield,
    decimal IncomeShareOfReturn,
    decimal Top1Concentration,
    decimal Top3Concentration,
    decimal Top5Concentration,
    decimal RubExposure,
    decimal UsdExposure,
    decimal OtherCurrencyExposure,
    decimal FxImpact,
    decimal Turnover,
    decimal RealizedPnl,
    decimal UnrealizedPnl,
    IReadOnlyList<ChartPoint> ReturnSeries,
    IReadOnlyList<ChartPoint> DrawdownSeries,
    IReadOnlyList<ChartPoint> RiskSeries,
    IReadOnlyList<ChartPoint> ExposureSeries,
    IReadOnlyList<MetricNote> Notes);

public sealed record MetricNote(string Metric, string Text);

public sealed record DetailRow(
    string Title,
    string Subtitle,
    decimal Value,
    IReadOnlyDictionary<string, string> Columns);
