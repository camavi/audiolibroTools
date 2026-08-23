<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email:rfc', 'max:255', 'unique:users,email'],
            'password' => ['required', 'confirmed', Password::min(8)],
        ]);
        $user = User::query()->create(['name' => $data['name'], 'email' => strtolower($data['email']), 'password' => Hash::make($data['password'])]);
        Auth::login($user);
        $request->session()->regenerate();

        return response()->json(['data' => ['user' => $user->only('id', 'name', 'email'), 'redirect' => '/dashboard']], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email'], 'password' => ['required', 'string'], 'remember' => ['nullable', 'boolean']]);
        if (! Auth::attempt(['email' => strtolower($data['email']), 'password' => $data['password']], (bool) ($data['remember'] ?? false))) {
            return response()->json(['message' => 'The email or password is incorrect.', 'errors' => ['email' => ['The email or password is incorrect.']]], 422);
        }
        /** @var User $user */
        $user = Auth::user();
        if ($user->isBlocked()) {
            Auth::logout();

            return response()->json(['message' => 'This account is currently restricted. Please contact support.'], 403);
        }
        $request->session()->regenerate();
        return response()->json(['data' => ['redirect' => '/dashboard']]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['data' => ['redirect' => '/']]);
    }
}
