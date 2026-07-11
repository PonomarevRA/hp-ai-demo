using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;

public sealed class OnnxReportChatService : IDisposable
{
    public const string ModelId = "Qwen2.5-0.5B-Instruct";

    private const int NumLayers = 24;
    private const int NumKvHeads = 2;
    private const int HeadDim = 64;
    private const int EosTokenId = 151645;
    private const int PadTokenId = 151643;
    private const long ExpectedOnnxBytes = 786_156_820;
    private const double MinValidOnnxSizeRatio = 0.98;

    private static readonly string SystemPrompt = string.Join(
        " ",
        "Ты помощник по брокерскому отчету инвестора.",
        "Отвечай только на основе JSON-данных, которые передал пользователь.",
        "Не придумывай цифры и не пересчитывай метрики — они уже посчитаны backend-ом.",
        "Если в данных нет ответа, честно скажи, что информации недостаточно.",
        "Отвечай кратко, по делу, на русском языке.",
        "Не давай инвестиционных рекомендаций.");

    private readonly string _modelDir;
    private readonly string _onnxPath;
    private readonly ILogger<OnnxReportChatService> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);

    private InferenceSession? _session;
    private QwenTokenizer? _tokenizer;

    public OnnxReportChatService(IHostEnvironment environment, ILogger<OnnxReportChatService> logger)
    {
        _modelDir = Path.Combine(environment.ContentRootPath, "ai-models", ModelId);
        _onnxPath = Path.Combine(_modelDir, "onnx", "model_q4.onnx");
        _logger = logger;
    }

    public AiModelStatus GetStatus()
    {
        if (!Directory.Exists(_modelDir))
        {
            return new AiModelStatus(false, "missing", "Папка локальной ONNX-модели не найдена.", ModelId);
        }

        if (!HasTokenizerFiles())
        {
            return new AiModelStatus(false, "missing", "Не найдены tokenizer-файлы локальной модели.", ModelId);
        }

        if (!File.Exists(_onnxPath))
        {
            return new AiModelStatus(false, "missing", "Не найден файл ONNX-весов model_q4.onnx.", ModelId, 0, ExpectedOnnxBytes);
        }

        var bytes = new FileInfo(_onnxPath).Length;
        if (bytes < ExpectedOnnxBytes * MinValidOnnxSizeRatio)
        {
            return new AiModelStatus(
                false,
                "incomplete",
                $"Файл ONNX-весов неполный ({bytes / 1024d / 1024d:0.#} MB из {ExpectedOnnxBytes / 1024d / 1024d:0.#} MB).",
                ModelId,
                bytes,
                ExpectedOnnxBytes);
        }

        return new AiModelStatus(true, "ready", "Локальная ONNX-модель доступна на сервере.", ModelId, bytes, ExpectedOnnxBytes);
    }

    public async Task<ReportChatResponse> AskAsync(ReportChatRequest request, CancellationToken cancellationToken = default)
    {
        var status = GetStatus();
        if (!status.Ready)
        {
            throw new InvalidOperationException(status.Message);
        }

        await EnsureLoadedAsync(cancellationToken);

        var prompt = BuildPrompt(request.Question, request.Context, request.Screen);
        var promptIds = _tokenizer!.Encode(prompt);
        if (promptIds.Count == 0)
        {
            throw new InvalidOperationException("Не удалось подготовить prompt для ONNX-модели.");
        }

        _logger.LogInformation(
            "Running ONNX report chat for screen {Screen}. Prompt tokens: {PromptTokens}.",
            request.Screen,
            promptIds.Count);

        var answer = await Task.Run(() => Generate(promptIds, maxNewTokens: 220, cancellationToken), cancellationToken);
        return new ReportChatResponse(answer, ModelId, "server-onnx");
    }

    private async Task EnsureLoadedAsync(CancellationToken cancellationToken)
    {
        if (_session is not null && _tokenizer is not null)
        {
            return;
        }

        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (_session is not null && _tokenizer is not null)
            {
                return;
            }

            _logger.LogInformation("Loading local ONNX model from {Path}.", _onnxPath);
            _tokenizer = QwenTokenizer.Load(_modelDir);
            _session = new InferenceSession(_onnxPath);
            _logger.LogInformation("Local ONNX model loaded.");
        }
        finally
        {
            _gate.Release();
        }
    }

    private string Generate(IReadOnlyList<int> promptIds, int maxNewTokens, CancellationToken cancellationToken)
    {
        var session = _session ?? throw new InvalidOperationException("ONNX session is not loaded.");
        var seqLen = promptIds.Count;

        using var prefillResults = session.Run(BuildInputs(
            CreateInputIdsTensor(promptIds),
            CreateAttentionMaskTensor(seqLen),
            CreatePositionIdsTensor(seqLen, start: 0),
            CreateEmptyPastFeed()));

        var logits = prefillResults.First(x => x.Name == "logits").AsTensor<float>().ToDenseTensor();
        var pastFeed = MapPresentToPast(prefillResults.Where(x => x.Name.StartsWith("present.", StringComparison.Ordinal)).ToList());

        var generated = new List<int>();
        var pastLen = seqLen;
        var nextId = ArgMax(logits, logits.Dimensions[1] - 1);

        for (var step = 0; step < maxNewTokens; step++)
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (nextId is EosTokenId or PadTokenId)
            {
                break;
            }

            generated.Add(nextId);

            using var decodeResults = session.Run(BuildInputs(
                CreateInputIdsTensor([nextId]),
                CreateAttentionMaskTensor(pastLen + 1),
                CreatePositionIdsTensor(1, start: pastLen),
                pastFeed));

            logits = decodeResults.First(x => x.Name == "logits").AsTensor<float>().ToDenseTensor();
            pastFeed = MapPresentToPast(decodeResults.Where(x => x.Name.StartsWith("present.", StringComparison.Ordinal)).ToList());
            pastLen++;
            nextId = ArgMax(logits, 0);
        }

        return generated.Count == 0
            ? string.Empty
            : _tokenizer!.Decode(generated).Trim();
    }

    private static string BuildPrompt(string question, string context, string screen)
        => $"<|im_start|>system\n{SystemPrompt}\n<|im_start|>user\nЭкран: {screen}\nДанные отчета (JSON):\n{context}\n\nВопрос пользователя: {question}\n<|im_start|>assistant\n";

    private static DenseTensor<long> CreateInputIdsTensor(IReadOnlyList<int> ids)
    {
        var tensor = new DenseTensor<long>(new[] { 1, ids.Count });
        for (var i = 0; i < ids.Count; i++)
        {
            tensor[0, i] = ids[i];
        }

        return tensor;
    }

    private static DenseTensor<long> CreateAttentionMaskTensor(int length)
    {
        var tensor = new DenseTensor<long>(new[] { 1, length });
        for (var i = 0; i < length; i++)
        {
            tensor[0, i] = 1;
        }

        return tensor;
    }

    private static DenseTensor<long> CreatePositionIdsTensor(int length, int start)
    {
        var tensor = new DenseTensor<long>(new[] { 1, length });
        for (var i = 0; i < length; i++)
        {
            tensor[0, i] = start + i;
        }

        return tensor;
    }

    private static DenseTensor<float> CreateEmptyPastTensor() => new([1, NumKvHeads, 0, HeadDim]);

    private static List<NamedOnnxValue> BuildInputs(
        DenseTensor<long> inputIds,
        DenseTensor<long> attentionMask,
        DenseTensor<long> positionIds,
        IReadOnlyDictionary<string, DenseTensor<float>> pastTensors)
    {
        var inputs = new List<NamedOnnxValue>
        {
            NamedOnnxValue.CreateFromTensor("input_ids", inputIds),
            NamedOnnxValue.CreateFromTensor("attention_mask", attentionMask),
            NamedOnnxValue.CreateFromTensor("position_ids", positionIds),
        };

        for (var layer = 0; layer < NumLayers; layer++)
        {
            inputs.Add(NamedOnnxValue.CreateFromTensor($"past_key_values.{layer}.key", pastTensors[$"past_key_values.{layer}.key"]));
            inputs.Add(NamedOnnxValue.CreateFromTensor($"past_key_values.{layer}.value", pastTensors[$"past_key_values.{layer}.value"]));
        }

        return inputs;
    }

    private static Dictionary<string, DenseTensor<float>> CreateEmptyPastFeed()
    {
        var feed = new Dictionary<string, DenseTensor<float>>(NumLayers * 2, StringComparer.Ordinal);
        for (var layer = 0; layer < NumLayers; layer++)
        {
            feed[$"past_key_values.{layer}.key"] = CreateEmptyPastTensor();
            feed[$"past_key_values.{layer}.value"] = CreateEmptyPastTensor();
        }

        return feed;
    }

    private static Dictionary<string, DenseTensor<float>> MapPresentToPast(IReadOnlyList<DisposableNamedOnnxValue> presents)
    {
        var feed = new Dictionary<string, DenseTensor<float>>(presents.Count, StringComparer.Ordinal);
        foreach (var item in presents)
        {
            var pastName = item.Name.Replace("present.", "past_key_values.", StringComparison.Ordinal);
            feed[pastName] = item.AsTensor<float>().ToDenseTensor();
        }

        return feed;
    }

    private static int ArgMax(Tensor<float> logits, int position)
    {
        var vocabSize = logits.Dimensions[2];
        var bestId = 0;
        var bestValue = float.NegativeInfinity;

        for (var id = 0; id < vocabSize; id++)
        {
            var value = logits[0, position, id];
            if (value > bestValue)
            {
                bestValue = value;
                bestId = id;
            }
        }

        return bestId;
    }

    private bool HasTokenizerFiles()
        => File.Exists(Path.Combine(_modelDir, "vocab.json"))
           && File.Exists(Path.Combine(_modelDir, "merges.txt"))
           && File.Exists(Path.Combine(_modelDir, "added_tokens.json"));

    public void Dispose()
    {
        _session?.Dispose();
        _gate.Dispose();
    }
}
