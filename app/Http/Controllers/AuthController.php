<?php

namespace App\Http\Controllers;

use Illuminate\Auth\Events\PasswordReset;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password as PasswordBroker;
use Illuminate\Validation\Rules\Password;
use Illuminate\Support\Str;

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
        $user->sendEmailVerificationNotification();

        return response()->json(['data' => ['user' => $user->only('id', 'name', 'email'), 'redirect' => '/dashboard', 'email_verification_sent' => true]], 201);
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

    public function sendPasswordResetLink(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email']]);
        PasswordBroker::sendResetLink(['email' => strtolower($data['email'])]);

        return response()->json(['data' => ['message' => 'If an account matches this email address, we have sent instructions to reset its password.']]);
    }

    public function showResetPasswordForm(Request $request, string $token)
    {
        return view('auth-reset-password', ['token' => $token, 'email' => (string) $request->query('email')]);
    }

    public function resetPassword(Request $request)
    {
        $data = $request->validate([
            'token' => ['required'],
            'email' => ['required', 'email'],
            'password' => ['required', 'confirmed', Password::min(8)],
        ]);

        $status = PasswordBroker::reset([
            'email' => strtolower($data['email']),
            'password' => $data['password'],
            'token' => $data['token'],
        ], function (User $user, string $password): void {
            $user->forceFill(['password' => Hash::make($password), 'remember_token' => Str::random(60)])->save();
            event(new PasswordReset($user));
        });

        if ($status === PasswordBroker::PASSWORD_RESET) {
            return redirect('/en')->with('auth_message', 'Your password has been reset. You can now sign in.');
        }

        return back()->withInput($request->only('email'))->withErrors(['email' => __($status)]);
    }
}
