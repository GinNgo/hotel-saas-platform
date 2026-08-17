namespace HotelSaas.Application.Common.Models;

public class Result<T>
{
    public bool Succeeded { get; set; }
    public T? Data { get; set; }
    public string? Message { get; set; }
    public List<string> Errors { get; set; } = new();

    public static Result<T> Success(T data, string message = "Thành công") =>
        new() { Succeeded = true, Data = data, Message = message };

    public static Result<T> Failure(string message, List<string>? errors = null) =>
        new() { Succeeded = false, Message = message, Errors = errors ?? new List<string>() };
}

public class Result
{
    public bool Succeeded { get; set; }
    public string? Message { get; set; }
    public List<string> Errors { get; set; } = new();

    public static Result Success(string message = "Thành công") =>
        new() { Succeeded = true, Message = message };

    public static Result Failure(string message, List<string>? errors = null) =>
        new() { Succeeded = false, Message = message, Errors = errors ?? new List<string>() };
}
