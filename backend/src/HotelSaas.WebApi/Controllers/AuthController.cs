using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Application.Common.Models;
using HotelSaas.Application.DTOs.Auth;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IApplicationDbContext _context;
    private readonly IPasswordHasher _passwordHasher;
    private readonly IJwtTokenGenerator _jwtTokenGenerator;

    public AuthController(IApplicationDbContext context, IPasswordHasher passwordHasher, IJwtTokenGenerator jwtTokenGenerator)
    {
        _context = context;
        _passwordHasher = passwordHasher;
        _jwtTokenGenerator = jwtTokenGenerator;
    }

    [HttpPost("register-customer")]
    public async Task<ActionResult<Result<AuthResponseDto>>> RegisterCustomer([FromBody] RegisterCustomerRequestDto request)
    {
        var exists = await _context.Users.AnyAsync(u => u.Username == request.Username || u.Email == request.Email);
        if (exists) return BadRequest(Result<AuthResponseDto>.Failure("Tài khoản hoặc email đã tồn tại."));

        var user = new User
        {
            Username = request.Username.Trim(),
            Email = request.Email.Trim().ToLower(),
            FullName = request.FullName,
            PhoneNumber = request.PhoneNumber,
            PasswordHash = _passwordHasher.HashPassword(request.Password),
            GlobalRole = GlobalUserRole.Customer,
            IsActive = true
        };

        _context.Users.Add(user);
        var rt = _jwtTokenGenerator.GenerateRefreshToken(user.Id);
        _context.RefreshTokens.Add(rt);
        await _context.SaveChangesAsync();

        var token = _jwtTokenGenerator.GenerateAccessToken(user);
        var resp = new AuthResponseDto(user.Id, user.Username, user.Email, user.FullName, user.GlobalRole, null, null, token, rt.Token);
        return Ok(Result<AuthResponseDto>.Success(resp, "Đăng ký tài khoản khách hàng thành công."));
    }

    [HttpPost("login")]
    public async Task<ActionResult<Result<AuthResponseDto>>> Login([FromBody] LoginRequestDto request)
    {
        var user = await _context.Users
            .Include(u => u.TenantStaffProfiles)
            .FirstOrDefaultAsync(u => u.Username == request.UsernameOrEmail || u.Email == request.UsernameOrEmail);

        if (user == null || !_passwordHasher.VerifyPassword(request.Password, user.PasswordHash))
        {
            return Unauthorized(Result<AuthResponseDto>.Failure("Tài khoản hoặc mật khẩu không chính xác."));
        }

        var staffProfile = user.TenantStaffProfiles.FirstOrDefault(s => s.IsActive);
        var token = _jwtTokenGenerator.GenerateAccessToken(user, user.TenantId, staffProfile?.Role);
        var rt = _jwtTokenGenerator.GenerateRefreshToken(user.Id);
        _context.RefreshTokens.Add(rt);
        await _context.SaveChangesAsync();

        var resp = new AuthResponseDto(user.Id, user.Username, user.Email, user.FullName, user.GlobalRole, user.TenantId, staffProfile?.Role, token, rt.Token);
        return Ok(Result<AuthResponseDto>.Success(resp, "Đăng nhập thành công."));
    }
}
