using System.Text.Json;
using Microsoft.ML.Tokenizers;

public sealed class QwenTokenizer
{
    private readonly CodeGenTokenizer _tokenizer;
    private readonly IReadOnlyDictionary<string, int> _specialTokens;
    private readonly string[] _specialTokenStrings;

    private QwenTokenizer(CodeGenTokenizer tokenizer, IReadOnlyDictionary<string, int> specialTokens)
    {
        _tokenizer = tokenizer;
        _specialTokens = specialTokens;
        _specialTokenStrings = specialTokens.Keys.OrderByDescending(x => x.Length).ToArray();
    }

    public static QwenTokenizer Load(string modelDir)
    {
        var vocab = JsonSerializer.Deserialize<Dictionary<string, int>>(File.ReadAllText(Path.Combine(modelDir, "vocab.json")))
            ?? throw new InvalidDataException("Не удалось прочитать vocab.json.");
        var added = JsonSerializer.Deserialize<Dictionary<string, int>>(File.ReadAllText(Path.Combine(modelDir, "added_tokens.json")))
            ?? throw new InvalidDataException("Не удалось прочитать added_tokens.json.");

        foreach (var (token, id) in added)
        {
            vocab[token] = id;
        }

        using var vocabStream = new MemoryStream();
        JsonSerializer.Serialize(vocabStream, vocab);
        vocabStream.Position = 0;
        using var mergesStream = File.OpenRead(Path.Combine(modelDir, "merges.txt"));
        var tokenizer = CodeGenTokenizer.Create(vocabStream, mergesStream, addPrefixSpace: false, addBeginOfSentence: false, addEndOfSentence: false);
        return new QwenTokenizer(tokenizer, added);
    }

    public IReadOnlyList<int> Encode(string text)
    {
        var ids = new List<int>();
        var rest = text;

        while (rest.Length > 0)
        {
            string? matched = null;
            foreach (var special in _specialTokenStrings)
            {
                if (rest.StartsWith(special, StringComparison.Ordinal))
                {
                    matched = special;
                    break;
                }
            }

            if (matched is not null)
            {
                ids.Add(_specialTokens[matched]);
                rest = rest[matched.Length..];
                continue;
            }

            var nextSpecial = -1;
            foreach (var special in _specialTokenStrings)
            {
                var index = rest.IndexOf(special, StringComparison.Ordinal);
                if (index > 0 && (nextSpecial < 0 || index < nextSpecial))
                {
                    nextSpecial = index;
                }
            }

            var chunk = nextSpecial > 0 ? rest[..nextSpecial] : rest;
            ids.AddRange(_tokenizer.EncodeToIds(chunk));
            rest = nextSpecial > 0 ? rest[nextSpecial..] : string.Empty;
        }

        return ids;
    }

    public string Decode(IReadOnlyList<int> ids) => _tokenizer.Decode(ids);
}
