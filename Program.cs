using Microsoft.AspNetCore.Http.Features;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 80 * 1024 * 1024;
    options.ValueLengthLimit = int.MaxValue;
});

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapPost("/api/analyze", async (HttpRequest request) =>
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

    return Results.Json(PortfolioReportAnalyzer.BuildDashboard(reports));
});

app.MapFallbackToFile("index.html");

app.Run();
