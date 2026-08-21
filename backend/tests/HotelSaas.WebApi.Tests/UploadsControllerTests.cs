using HotelSaas.WebApi.Controllers;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.FileProviders;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public class UploadsControllerTests
{
    [Fact]
    public async Task Upload_uses_detected_image_metadata_and_randomized_storage_name()
    {
        var root = Path.Combine(Path.GetTempPath(), $"hotel-upload-{Guid.NewGuid():N}");
        try
        {
            var controller = new UploadsController(Environment(root));
            var bytes = PngHeader(320, 180);
            var file = FormFile(bytes, "avatar.png", "image/png");

            var result = await controller.UploadImage(file);

            var response = Assert.IsType<ImageUploadDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
            Assert.Equal(320, response.Width);
            Assert.Equal(180, response.Height);
            Assert.Equal("image/png", response.ContentType);
            Assert.StartsWith("/uploads/images/", response.Url);
            Assert.True(File.Exists(Path.Combine(root, "wwwroot", response.Url.TrimStart('/').Replace('/', Path.DirectorySeparatorChar))));
            Assert.DoesNotContain("avatar", response.Url, StringComparison.OrdinalIgnoreCase);
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, true);
        }
    }

    [Fact]
    public async Task Upload_rejects_mime_spoofing_and_non_image_content()
    {
        var root = Path.Combine(Path.GetTempPath(), $"hotel-upload-{Guid.NewGuid():N}");
        try
        {
            var controller = new UploadsController(Environment(root));

            var spoofed = await controller.UploadImage(FormFile(PngHeader(10, 10), "avatar.jpg", "image/jpeg"));
            var text = await controller.UploadImage(FormFile("not-an-image"u8.ToArray(), "avatar.png", "image/png"));

            Assert.IsType<BadRequestObjectResult>(spoofed.Result);
            Assert.IsType<BadRequestObjectResult>(text.Result);
            Assert.False(Directory.Exists(Path.Combine(root, "wwwroot", "uploads")));
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, true);
        }
    }

    [Fact]
    public async Task Upload_rejects_decompression_bomb_dimensions()
    {
        var root = Path.Combine(Path.GetTempPath(), $"hotel-upload-{Guid.NewGuid():N}");
        try
        {
            var controller = new UploadsController(Environment(root));
            var result = await controller.UploadImage(FormFile(PngHeader(8000, 8000), "huge.png", "image/png"));
            Assert.IsType<BadRequestObjectResult>(result.Result);
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, true);
        }
    }

    private static IFormFile FormFile(byte[] bytes, string name, string contentType)
    {
        var stream = new MemoryStream(bytes);
        return new FormFile(stream, 0, bytes.Length, "file", name) { Headers = new HeaderDictionary(), ContentType = contentType };
    }

    private static byte[] PngHeader(int width, int height)
    {
        var bytes = new byte[24];
        new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }.CopyTo(bytes, 0);
        "IHDR"u8.CopyTo(bytes.AsSpan(12, 4));
        System.Buffers.Binary.BinaryPrimitives.WriteInt32BigEndian(bytes.AsSpan(16, 4), width);
        System.Buffers.Binary.BinaryPrimitives.WriteInt32BigEndian(bytes.AsSpan(20, 4), height);
        return bytes;
    }

    private static IWebHostEnvironment Environment(string root) => new TestEnvironment
    {
        ApplicationName = "HotelSaas.Tests", EnvironmentName = "Testing", ContentRootPath = root,
        ContentRootFileProvider = new NullFileProvider(), WebRootPath = Path.Combine(root, "wwwroot"),
        WebRootFileProvider = new NullFileProvider()
    };

    private sealed class TestEnvironment : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = string.Empty;
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string WebRootPath { get; set; } = string.Empty;
        public string EnvironmentName { get; set; } = string.Empty;
        public string ContentRootPath { get; set; } = string.Empty;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
