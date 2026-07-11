using Microsoft.AspNetCore.Http.Features;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHttpClient<MoexIssClient>(client =>
{
    client.BaseAddress = new Uri("https://iss.moex.com/iss/");
    client.Timeout = TimeSpan.FromSeconds(5);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("historic-portfolio-ai/1.0");
});
builder.Services.AddSingleton<OnnxReportChatService>();

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
    var fileStatuses = new List<FileProcessingStatus>();
    var issues = new List<ProcessingIssue>();
    foreach (var file in form.Files)
    {
        if (file.Length == 0)
        {
            var issue = new ProcessingIssue("error", "file", file.FileName, null, "Файл пустой и не был обработан.");
            issues.Add(issue);
            fileStatuses.Add(new FileProcessingStatus(file.FileName, file.Length, false, "failed", issue.Message, 0, 0, 0));
            continue;
        }

        try
        {
            await using var stream = file.OpenReadStream();
            using var memory = new MemoryStream();
            await stream.CopyToAsync(memory, cancellationToken);
            var report = PortfolioReportAnalyzer.Analyze(file.FileName, memory.ToArray());
            reports.Add(report);
            issues.AddRange(report.Diagnostics.Issues);
            fileStatuses.Add(new FileProcessingStatus(
                file.FileName,
                file.Length,
                true,
                report.Diagnostics.Issues.Count == 0 ? "processed" : "processed_with_warnings",
                report.Diagnostics.Issues.Count == 0
                    ? "Файл обработан."
                    : $"Файл обработан, есть предупреждения: {report.Diagnostics.Issues.Count}.",
                report.Diagnostics.RowsRead,
                report.Diagnostics.RowsRecognized,
                report.Diagnostics.RowsSkipped));
        }
        catch (Exception ex) when (ex is InvalidDataException or FormatException or IOException or ArgumentException)
        {
            var issue = new ProcessingIssue("error", "file", file.FileName, null, $"Файл не удалось разобрать: {ex.Message}");
            issues.Add(issue);
            fileStatuses.Add(new FileProcessingStatus(file.FileName, file.Length, false, "failed", issue.Message, 0, 0, 0));
        }
    }

    var processing = new ProcessingStatus(
        form.Files.Count,
        fileStatuses.Count(x => x.Success),
        fileStatuses.Count(x => !x.Success),
        fileStatuses,
        issues);

    if (reports.Count == 0)
    {
        return Results.BadRequest(new { error = "Не удалось обработать ни один файл.", processing });
    }

    var dashboard = PortfolioReportAnalyzer.BuildDashboard(reports);
    var marketData = await moex.TryEnrichAsync(dashboard, cancellationToken);
    return Results.Json(dashboard with { MarketData = marketData, Processing = processing });
});

app.MapGet("/api/ai-model/status", (OnnxReportChatService chat) => Results.Json(chat.GetStatus()));

app.MapPost("/api/report-chat", async (ReportChatRequest request, OnnxReportChatService chat, CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Question))
    {
        return Results.BadRequest(new { error = "Вопрос не может быть пустым." });
    }

    if (string.IsNullOrWhiteSpace(request.Context))
    {
        return Results.BadRequest(new { error = "Контекст отчета не передан." });
    }

    try
    {
        var response = await chat.AskAsync(request, cancellationToken);
        return Results.Json(response);
    }
    catch (InvalidOperationException ex)
    {
        return Results.Json(new { error = ex.Message }, statusCode: StatusCodes.Status503ServiceUnavailable);
    }
    catch (OperationCanceledException)
    {
        return Results.Json(new { error = "Запрос к ONNX-модели был отменен." }, statusCode: StatusCodes.Status499ClientClosedRequest);
    }
    catch (Exception ex)
    {
        return Results.Json(new { error = $"Не удалось получить ответ от ONNX-модели: {ex.Message}" }, statusCode: StatusCodes.Status500InternalServerError);
    }
});

app.MapFallbackToFile("index.html");

app.Run();
