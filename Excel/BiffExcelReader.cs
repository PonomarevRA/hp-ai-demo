using System.Buffers.Binary;
using System.Globalization;
using System.Text;

public sealed record RowData(int Index, IReadOnlyList<CellValue> Cells)
{
    public string Text => string.Join(" ", Cells.Select(x => x.Display).Where(x => !string.IsNullOrWhiteSpace(x)));
}

public sealed record CellValue(int Column, string Display, decimal? Number);

public sealed class WorksheetData
{
    private readonly SortedDictionary<int, SortedDictionary<int, CellValue>> _cells = [];

    public WorksheetData(string name) => Name = name;

    public string Name { get; }

    public int NonEmptyCellCount => _cells.Values.Sum(x => x.Count);

    public void Set(int row, int column, string display, decimal? number = null)
    {
        if (string.IsNullOrWhiteSpace(display) && number is null)
        {
            return;
        }

        if (!_cells.TryGetValue(row, out var rowCells))
        {
            rowCells = [];
            _cells[row] = rowCells;
        }

        rowCells[column] = new CellValue(column, display.Trim(), number);
    }

    public IReadOnlyList<RowData> ToRows()
    {
        return _cells
            .Select(x => new RowData(x.Key, x.Value.Values.ToList()))
            .Where(x => x.Cells.Count > 0)
            .ToList();
    }
}

public sealed class BiffWorkbook
{
    private BiffWorkbook(IReadOnlyList<WorksheetData> worksheets) => Worksheets = worksheets;

    public IReadOnlyList<WorksheetData> Worksheets { get; }

    public static BiffWorkbook Parse(byte[] stream)
    {
        var sheets = new List<SheetRef>();
        var sharedStrings = new List<string>();
        var position = 0;

        while (position + 4 <= stream.Length)
        {
            var recordStart = position;
            var id = BinaryPrimitives.ReadUInt16LittleEndian(stream.AsSpan(position));
            var length = BinaryPrimitives.ReadUInt16LittleEndian(stream.AsSpan(position + 2));
            position += 4;
            if (position + length > stream.Length)
            {
                break;
            }

            var data = stream.AsSpan(position, length).ToArray();
            position += length;

            if (id == 0x0085 && data.Length >= 8)
            {
                sheets.Add(ReadBoundSheet(data));
            }
            else if (id == 0x00FC)
            {
                var segments = new List<byte[]> { data };
                var continuePosition = position;
                while (continuePosition + 4 <= stream.Length)
                {
                    var nextId = BinaryPrimitives.ReadUInt16LittleEndian(stream.AsSpan(continuePosition));
                    var nextLength = BinaryPrimitives.ReadUInt16LittleEndian(stream.AsSpan(continuePosition + 2));
                    if (nextId != 0x003C || continuePosition + 4 + nextLength > stream.Length)
                    {
                        break;
                    }

                    continuePosition += 4;
                    segments.Add(stream.AsSpan(continuePosition, nextLength).ToArray());
                    continuePosition += nextLength;
                }

                sharedStrings = SstReader.Read(segments);
                position = continuePosition;
            }

            if (recordStart == position)
            {
                break;
            }
        }

        if (sheets.Count == 0)
        {
            sheets.Add(new SheetRef(0, "Лист 1"));
        }

        var worksheets = new List<WorksheetData>();
        foreach (var sheet in sheets)
        {
            if (sheet.Offset < 0 || sheet.Offset >= stream.Length)
            {
                continue;
            }

            worksheets.Add(ParseWorksheet(stream, sheet, sharedStrings));
        }

        return new BiffWorkbook(worksheets);
    }

    private static WorksheetData ParseWorksheet(byte[] stream, SheetRef sheet, IReadOnlyList<string> sharedStrings)
    {
        var worksheet = new WorksheetData(sheet.Name);
        var position = sheet.Offset;

        while (position + 4 <= stream.Length)
        {
            var id = BinaryPrimitives.ReadUInt16LittleEndian(stream.AsSpan(position));
            var length = BinaryPrimitives.ReadUInt16LittleEndian(stream.AsSpan(position + 2));
            position += 4;
            if (position + length > stream.Length)
            {
                break;
            }

            var data = stream.AsSpan(position, length);
            position += length;

            switch (id)
            {
                case 0x000A:
                    return worksheet;
                case 0x00FD:
                    ReadLabelSst(worksheet, data, sharedStrings);
                    break;
                case 0x0204:
                    ReadLabel(worksheet, data);
                    break;
                case 0x0203:
                    ReadNumber(worksheet, data);
                    break;
                case 0x027E:
                    ReadRk(worksheet, data);
                    break;
                case 0x00BD:
                    ReadMulRk(worksheet, data);
                    break;
                case 0x0006:
                    ReadFormulaNumber(worksheet, data);
                    break;
            }
        }

        return worksheet;
    }

    private static SheetRef ReadBoundSheet(ReadOnlySpan<byte> data)
    {
        var offset = (int)BinaryPrimitives.ReadUInt32LittleEndian(data);
        var nameLength = data[6];
        var flags = data[7];
        var isUtf16 = (flags & 0x01) != 0;
        var nameBytes = data[8..];
        var bytesNeeded = Math.Min(nameBytes.Length, nameLength * (isUtf16 ? 2 : 1));
        var name = isUtf16
            ? Encoding.Unicode.GetString(nameBytes[..bytesNeeded])
            : Encoding.Latin1.GetString(nameBytes[..bytesNeeded]);
        return new SheetRef(offset, string.IsNullOrWhiteSpace(name) ? "Лист" : name);
    }

    private static void ReadLabelSst(WorksheetData worksheet, ReadOnlySpan<byte> data, IReadOnlyList<string> sharedStrings)
    {
        if (data.Length < 10)
        {
            return;
        }

        var row = BinaryPrimitives.ReadUInt16LittleEndian(data);
        var column = BinaryPrimitives.ReadUInt16LittleEndian(data[2..]);
        var index = (int)BinaryPrimitives.ReadUInt32LittleEndian(data[6..]);
        if (index >= 0 && index < sharedStrings.Count)
        {
            worksheet.Set(row, column, sharedStrings[index]);
        }
    }

    private static void ReadLabel(WorksheetData worksheet, ReadOnlySpan<byte> data)
    {
        if (data.Length < 8)
        {
            return;
        }

        var row = BinaryPrimitives.ReadUInt16LittleEndian(data);
        var column = BinaryPrimitives.ReadUInt16LittleEndian(data[2..]);
        var textLength = BinaryPrimitives.ReadUInt16LittleEndian(data[6..]);
        if (data.Length < 8 + textLength)
        {
            return;
        }

        worksheet.Set(row, column, Encoding.Latin1.GetString(data.Slice(8, textLength)));
    }

    private static void ReadNumber(WorksheetData worksheet, ReadOnlySpan<byte> data)
    {
        if (data.Length < 14)
        {
            return;
        }

        var row = BinaryPrimitives.ReadUInt16LittleEndian(data);
        var column = BinaryPrimitives.ReadUInt16LittleEndian(data[2..]);
        var value = BitConverter.ToDouble(data.Slice(6, 8));
        worksheet.Set(row, column, FormatNumber(value), ToDecimal(value));
    }

    private static void ReadRk(WorksheetData worksheet, ReadOnlySpan<byte> data)
    {
        if (data.Length < 10)
        {
            return;
        }

        var row = BinaryPrimitives.ReadUInt16LittleEndian(data);
        var column = BinaryPrimitives.ReadUInt16LittleEndian(data[2..]);
        var rk = BinaryPrimitives.ReadUInt32LittleEndian(data[6..]);
        var value = DecodeRk(rk);
        worksheet.Set(row, column, FormatNumber(value), ToDecimal(value));
    }

    private static void ReadMulRk(WorksheetData worksheet, ReadOnlySpan<byte> data)
    {
        if (data.Length < 10)
        {
            return;
        }

        var row = BinaryPrimitives.ReadUInt16LittleEndian(data);
        var firstColumn = BinaryPrimitives.ReadUInt16LittleEndian(data[2..]);
        var lastColumn = BinaryPrimitives.ReadUInt16LittleEndian(data[^2..]);
        var count = lastColumn - firstColumn + 1;
        var offset = 4;
        for (var i = 0; i < count && offset + 6 <= data.Length - 2; i++, offset += 6)
        {
            var rk = BinaryPrimitives.ReadUInt32LittleEndian(data[(offset + 2)..]);
            var value = DecodeRk(rk);
            worksheet.Set(row, firstColumn + i, FormatNumber(value), ToDecimal(value));
        }
    }

    private static void ReadFormulaNumber(WorksheetData worksheet, ReadOnlySpan<byte> data)
    {
        if (data.Length < 14)
        {
            return;
        }

        var row = BinaryPrimitives.ReadUInt16LittleEndian(data);
        var column = BinaryPrimitives.ReadUInt16LittleEndian(data[2..]);
        var valueBytes = data.Slice(6, 8);
        if (valueBytes[6] == 0xFF && valueBytes[7] == 0xFF)
        {
            return;
        }

        var value = BitConverter.ToDouble(valueBytes);
        if (!double.IsNaN(value) && !double.IsInfinity(value))
        {
            worksheet.Set(row, column, FormatNumber(value), ToDecimal(value));
        }
    }

    private static double DecodeRk(uint rk)
    {
        double value;
        if ((rk & 0x02) != 0)
        {
            value = (int)rk >> 2;
        }
        else
        {
            var raw = ((long)(rk & 0xFFFFFFFC)) << 32;
            value = BitConverter.Int64BitsToDouble(raw);
        }

        if ((rk & 0x01) != 0)
        {
            value /= 100d;
        }

        return value;
    }

    private static decimal ToDecimal(double value)
    {
        if (double.IsNaN(value) || double.IsInfinity(value))
        {
            return 0m;
        }

        return Math.Round((decimal)value, 6);
    }

    private static string FormatNumber(double value)
    {
        return Math.Abs(value % 1) < 0.0000001
            ? value.ToString("N0", CultureInfo.GetCultureInfo("ru-RU"))
            : value.ToString("N2", CultureInfo.GetCultureInfo("ru-RU"));
    }

    private sealed record SheetRef(int Offset, string Name);
}

public sealed class SstReader
{
    private readonly IReadOnlyList<byte[]> _segments;
    private int _segmentIndex;
    private int _position;
    private bool _wideChars;

    private SstReader(IReadOnlyList<byte[]> segments) => _segments = segments;

    public static List<string> Read(IReadOnlyList<byte[]> segments)
    {
        if (segments.Count == 0 || segments[0].Length < 8)
        {
            return [];
        }

        var reader = new SstReader(segments) { _position = 8 };
        var uniqueCount = (int)BinaryPrimitives.ReadUInt32LittleEndian(segments[0].AsSpan(4));
        var strings = new List<string>(Math.Max(uniqueCount, 0));

        for (var i = 0; i < uniqueCount && !reader.End; i++)
        {
            strings.Add(reader.ReadString());
        }

        return strings;
    }

    private bool End => _segmentIndex >= _segments.Count;

    private string ReadString()
    {
        var charCount = ReadUInt16();
        var flags = ReadByte();
        _wideChars = (flags & 0x01) != 0;
        var hasExt = (flags & 0x04) != 0;
        var hasRich = (flags & 0x08) != 0;
        var richRuns = hasRich ? ReadUInt16() : 0;
        var extSize = hasExt ? ReadUInt32() : 0u;

        var builder = new StringBuilder(charCount);
        for (var i = 0; i < charCount; i++)
        {
            builder.Append(ReadChar());
        }

        Skip(richRuns * 4);
        Skip((int)extSize);
        return builder.ToString().Replace('\0', ' ').Trim();
    }

    private char ReadChar()
    {
        EnsureAvailable();
        if (_wideChars)
        {
            var first = ReadByteForChars();
            var second = ReadByteForChars();
            return (char)(first | (second << 8));
        }

        return (char)ReadByteForChars();
    }

    private byte ReadByteForChars()
    {
        if (_segmentIndex >= _segments.Count)
        {
            return 0;
        }

        if (_position >= _segments[_segmentIndex].Length)
        {
            _segmentIndex++;
            _position = 0;
            if (_segmentIndex >= _segments.Count)
            {
                return 0;
            }

            var flags = _segments[_segmentIndex][_position++];
            _wideChars = (flags & 0x01) != 0;
        }

        return _segments[_segmentIndex][_position++];
    }

    private byte ReadByte()
    {
        EnsureAvailable();
        if (_segmentIndex >= _segments.Count)
        {
            return 0;
        }

        return _segments[_segmentIndex][_position++];
    }

    private ushort ReadUInt16()
    {
        var b0 = ReadByte();
        var b1 = ReadByte();
        return (ushort)(b0 | (b1 << 8));
    }

    private uint ReadUInt32()
    {
        var b0 = ReadByte();
        var b1 = ReadByte();
        var b2 = ReadByte();
        var b3 = ReadByte();
        return (uint)(b0 | (b1 << 8) | (b2 << 16) | (b3 << 24));
    }

    private void Skip(int count)
    {
        for (var i = 0; i < count; i++)
        {
            _ = ReadByte();
        }
    }

    private void EnsureAvailable()
    {
        while (_segmentIndex < _segments.Count && _position >= _segments[_segmentIndex].Length)
        {
            _segmentIndex++;
            _position = 0;
        }
    }
}

public static class OleCompoundFile
{
    private const int EndOfChain = unchecked((int)0xFFFFFFFE);
    private const int FreeSector = unchecked((int)0xFFFFFFFF);

    public static byte[]? ReadStream(byte[] file, string streamName)
    {
        if (file.Length < 512 || !HasOleSignature(file))
        {
            return null;
        }

        var sectorSize = 1 << BinaryPrimitives.ReadUInt16LittleEndian(file.AsSpan(30));
        var firstDirectorySector = BinaryPrimitives.ReadInt32LittleEndian(file.AsSpan(48));
        var miniCutoff = BinaryPrimitives.ReadUInt32LittleEndian(file.AsSpan(56));
        var fatSectorCount = BinaryPrimitives.ReadInt32LittleEndian(file.AsSpan(44));
        var difat = ReadDifat(file, sectorSize, fatSectorCount);
        var fat = ReadFat(file, sectorSize, difat);
        var directoryBytes = ReadSectorChain(file, sectorSize, fat, firstDirectorySector);
        var entries = ReadDirectoryEntries(directoryBytes);
        var root = entries.FirstOrDefault(x => x.Type == 5);
        var entry = entries.FirstOrDefault(x => string.Equals(x.Name, streamName, StringComparison.OrdinalIgnoreCase));

        if (entry is null)
        {
            return null;
        }

        if (entry.Size < miniCutoff && root is not null && root.StartSector >= 0)
        {
            var miniFatStart = BinaryPrimitives.ReadInt32LittleEndian(file.AsSpan(60));
            var miniFat = ReadFat(file, sectorSize, ReadSectorChain(file, sectorSize, fat, miniFatStart));
            var miniStream = ReadSectorChain(file, sectorSize, fat, root.StartSector);
            return ReadMiniSectorChain(miniStream, miniFat, entry.StartSector, (int)entry.Size);
        }

        var data = ReadSectorChain(file, sectorSize, fat, entry.StartSector);
        return data.Length > (int)entry.Size ? data[..(int)entry.Size] : data;
    }

    private static List<int> ReadDifat(byte[] file, int sectorSize, int fatSectorCount)
    {
        var sectors = new List<int>(fatSectorCount);
        for (var offset = 76; offset < 512 && sectors.Count < fatSectorCount; offset += 4)
        {
            var sector = BinaryPrimitives.ReadInt32LittleEndian(file.AsSpan(offset));
            if (sector >= 0)
            {
                sectors.Add(sector);
            }
        }

        return sectors;
    }

    private static int[] ReadFat(byte[] file, int sectorSize, IReadOnlyList<int> fatSectors)
    {
        using var memory = new MemoryStream();
        foreach (var sector in fatSectors)
        {
            var offset = SectorOffset(sector, sectorSize);
            if (offset >= 0 && offset + sectorSize <= file.Length)
            {
                memory.Write(file, offset, sectorSize);
            }
        }

        return ReadFatEntries(memory.ToArray());
    }

    private static int[] ReadFat(byte[] file, int sectorSize, byte[] fatBytes)
    {
        return ReadFatEntries(fatBytes);
    }

    private static int[] ReadFatEntries(byte[] fatBytes)
    {
        var entries = new int[fatBytes.Length / 4];
        for (var i = 0; i < entries.Length; i++)
        {
            entries[i] = BinaryPrimitives.ReadInt32LittleEndian(fatBytes.AsSpan(i * 4));
        }

        return entries;
    }

    private static byte[] ReadSectorChain(byte[] file, int sectorSize, IReadOnlyList<int> fat, int startSector)
    {
        using var memory = new MemoryStream();
        var sector = startSector;
        var guard = 0;
        while (sector >= 0 && sector != EndOfChain && sector != FreeSector && sector < fat.Count && guard++ < fat.Count + 4)
        {
            var offset = SectorOffset(sector, sectorSize);
            if (offset < 0 || offset + sectorSize > file.Length)
            {
                break;
            }

            memory.Write(file, offset, sectorSize);
            sector = fat[sector];
        }

        return memory.ToArray();
    }

    private static byte[] ReadMiniSectorChain(byte[] miniStream, IReadOnlyList<int> miniFat, int startSector, int size)
    {
        const int miniSectorSize = 64;
        using var memory = new MemoryStream();
        var sector = startSector;
        var guard = 0;
        while (sector >= 0 && sector != EndOfChain && sector < miniFat.Count && guard++ < miniFat.Count + 4)
        {
            var offset = sector * miniSectorSize;
            if (offset < 0 || offset + miniSectorSize > miniStream.Length)
            {
                break;
            }

            memory.Write(miniStream, offset, miniSectorSize);
            sector = miniFat[sector];
        }

        var data = memory.ToArray();
        return data.Length > size ? data[..size] : data;
    }

    private static List<DirectoryEntry> ReadDirectoryEntries(byte[] directoryBytes)
    {
        var entries = new List<DirectoryEntry>();
        for (var offset = 0; offset + 128 <= directoryBytes.Length; offset += 128)
        {
            var entry = directoryBytes.AsSpan(offset, 128);
            var nameLength = BinaryPrimitives.ReadUInt16LittleEndian(entry[64..]);
            if (nameLength < 2 || nameLength > 64)
            {
                continue;
            }

            var name = Encoding.Unicode.GetString(entry[..(nameLength - 2)]).TrimEnd('\0');
            var type = entry[66];
            var startSector = BinaryPrimitives.ReadInt32LittleEndian(entry[116..]);
            var size = BinaryPrimitives.ReadUInt64LittleEndian(entry[120..]);
            entries.Add(new DirectoryEntry(name, type, startSector, size));
        }

        return entries;
    }

    private static int SectorOffset(int sector, int sectorSize) => (sector + 1) * sectorSize;

    private static bool HasOleSignature(byte[] file)
    {
        ReadOnlySpan<byte> signature = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
        return file.AsSpan(0, 8).SequenceEqual(signature);
    }

    private sealed record DirectoryEntry(string Name, byte Type, int StartSector, ulong Size);
}
