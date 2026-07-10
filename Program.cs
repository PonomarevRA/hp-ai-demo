using Microsoft.AspNetCore.Http.Features;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHttpClient<MoexIssClient>(client =>
{
    client.BaseAddress = new Uri("https://iss.moex.com/iss/");
    client.Timeout = TimeSpan.FromSeconds(5);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("historic-portfolio-ai/1.0");
});

builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 80 * 1024 * 1024;
    options.ValueLengthLimit = int.MaxValue;
});

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapPost("/api/analyze", async (HttpRequest request, MoexIssClient moex, CancellationToken cancellationToken) =>
{
    if (!request.HasFormContentType)
    {
        return Results.BadRequest(new { error = "Загрузите один или несколько Excel-файлов через multipart/form-data." });
    }

    var form = await request.ReadFormAsync();
    if (form.Files.Count == 0)
    {
        return Results.BadRequest(new { error = "Файлы не выбраны." });
    }

    var reports = new List<ReportAnalysis>();
    foreach (var file in form.Files)
    {
        if (file.Length == 0)
        {
            continue;
        }

        await using var stream = file.OpenReadStream();
        using var memory = new MemoryStream();
        await stream.CopyToAsync(memory);
        reports.Add(PortfolioReportAnalyzer.Analyze(file.FileName, memory.ToArray()));
    }

    var dashboard = PortfolioReportAnalyzer.BuildDashboard(reports);
    var marketData = await moex.TryEnrichAsync(dashboard, cancellationToken);
    return Results.Json(dashboard with { MarketData = marketData });
});

app.MapFallbackToFile("index.html");

app.Run();
