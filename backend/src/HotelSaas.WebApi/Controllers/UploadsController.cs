using System.Buffers.Binary;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UploadsController(IWebHostEnvironment environment) : ControllerBase
{
    private const long MaxBytes = 5 * 1024 * 1024;

    [HttpPost("image")]
    [RequestSizeLimit(MaxBytes)]
    public async Task<ActionResult<ImageUploadDto>> UploadImage(IFormFile file)
    {
        if (file == null || file.Length is <= 0 or > MaxBytes)
            return BadRequest(new { message = "Ảnh phải có dung lượng từ 1 byte đến 5 MB." });
        await using var input = file.OpenReadStream();
        using var memory = new MemoryStream((int)file.Length);
        await input.CopyToAsync(memory);
        var bytes = memory.ToArray();
        if (!ImageHeader.TryRead(bytes, out var image))
            return BadRequest(new { message = "Tệp không phải ảnh JPEG, PNG hoặc WebP hợp lệ." });
        if (!string.Equals(file.ContentType, image.ContentType, StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "Định dạng khai báo không khớp nội dung tệp." });
        if (image.Width is < 1 or > 8000 || image.Height is < 1 or > 8000 || (long)image.Width * image.Height > 40_000_000)
            return BadRequest(new { message = "Kích thước ảnh vượt giới hạn an toàn." });

        var now = DateTime.UtcNow;
        var relativeDirectory = Path.Combine("uploads", "images", now.ToString("yyyy"), now.ToString("MM"));
        var webRoot = environment.WebRootPath ?? Path.Combine(environment.ContentRootPath, "wwwroot");
        var directory = Path.Combine(webRoot, relativeDirectory);
        Directory.CreateDirectory(directory);
        var fileName = $"{Guid.NewGuid():N}{image.Extension}";
        var destination = Path.Combine(directory, fileName);
        await System.IO.File.WriteAllBytesAsync(destination, bytes);
        var url = "/" + Path.Combine(relativeDirectory, fileName).Replace('\\', '/');
        return Ok(new ImageUploadDto(url, image.ContentType, image.Width, image.Height));
    }
}

internal static class ImageHeader
{
    public static bool TryRead(ReadOnlySpan<byte> data, out ImageMetadata image)
    {
        if (TryPng(data, out image) || TryJpeg(data, out image) || TryWebP(data, out image)) return true;
        image = default;
        return false;
    }

    private static bool TryPng(ReadOnlySpan<byte> data, out ImageMetadata image)
    {
        image = default;
        ReadOnlySpan<byte> signature = [137, 80, 78, 71, 13, 10, 26, 10];
        if (data.Length < 24 || !data[..8].SequenceEqual(signature) || !data.Slice(12, 4).SequenceEqual("IHDR"u8)) return false;
        image = new("image/png", ".png", BinaryPrimitives.ReadInt32BigEndian(data.Slice(16, 4)),
            BinaryPrimitives.ReadInt32BigEndian(data.Slice(20, 4)));
        return true;
    }

    private static bool TryJpeg(ReadOnlySpan<byte> data, out ImageMetadata image)
    {
        image = default;
        if (data.Length < 4 || data[0] != 0xff || data[1] != 0xd8) return false;
        var offset = 2;
        while (offset + 8 < data.Length)
        {
            if (data[offset] != 0xff) { offset++; continue; }
            var marker = data[offset + 1];
            offset += 2;
            if (marker is 0xd8 or 0xd9 || marker is >= 0xd0 and <= 0xd7) continue;
            if (offset + 2 > data.Length) return false;
            var length = BinaryPrimitives.ReadUInt16BigEndian(data.Slice(offset, 2));
            if (length < 2 || offset + length > data.Length) return false;
            if (marker is >= 0xc0 and <= 0xc3 or >= 0xc5 and <= 0xc7 or >= 0xc9 and <= 0xcb or >= 0xcd and <= 0xcf)
            {
                if (length < 7) return false;
                image = new("image/jpeg", ".jpg", BinaryPrimitives.ReadUInt16BigEndian(data.Slice(offset + 5, 2)),
                    BinaryPrimitives.ReadUInt16BigEndian(data.Slice(offset + 3, 2)));
                return true;
            }
            offset += length;
        }
        return false;
    }

    private static bool TryWebP(ReadOnlySpan<byte> data, out ImageMetadata image)
    {
        image = default;
        if (data.Length < 30 || !data[..4].SequenceEqual("RIFF"u8) || !data.Slice(8, 4).SequenceEqual("WEBP"u8)) return false;
        var chunk = data.Slice(12, 4);
        int width;
        int height;
        if (chunk.SequenceEqual("VP8X"u8))
        {
            width = 1 + data[24] + (data[25] << 8) + (data[26] << 16);
            height = 1 + data[27] + (data[28] << 8) + (data[29] << 16);
        }
        else if (chunk.SequenceEqual("VP8 "u8) && data.Length >= 30 && data.Slice(23, 3).SequenceEqual(new byte[] { 0x9d, 0x01, 0x2a }))
        {
            width = BinaryPrimitives.ReadUInt16LittleEndian(data.Slice(26, 2)) & 0x3fff;
            height = BinaryPrimitives.ReadUInt16LittleEndian(data.Slice(28, 2)) & 0x3fff;
        }
        else if (chunk.SequenceEqual("VP8L"u8) && data.Length >= 25 && data[20] == 0x2f)
        {
            var bits = BinaryPrimitives.ReadUInt32LittleEndian(data.Slice(21, 4));
            width = (int)(bits & 0x3fff) + 1;
            height = (int)((bits >> 14) & 0x3fff) + 1;
        }
        else return false;
        image = new("image/webp", ".webp", width, height);
        return true;
    }
}

internal readonly record struct ImageMetadata(string ContentType, string Extension, int Width, int Height);
public sealed record ImageUploadDto(string Url, string ContentType, int Width, int Height);
