<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

class ProfileController extends Controller
{
    /* ================= UPDATE PROFILE ================= */
    public function update(Request $request)
    {
        $user = auth()->user();

        $request->validate([
            'name'   => 'required|string|max:255',
            'email'  => 'required|email|unique:users,email,' . $user->id,
            'avatar' => 'nullable|image|max:2048',
        ]);

        /* ----- AVATAR ----- */
        if ($request->hasFile('avatar')) {

            // XÓA ẢNH CŨ NẾU CÓ
            if ($user->avatar && Storage::disk('public')->exists($user->avatar)) {
                Storage::disk('public')->delete($user->avatar);
            }

            // Lưu ảnh mới
            $path = $request->file('avatar')->store('avatars', 'public');
            $user->avatar = $path;
        }

        /* ----- UPDATE INFO ----- */
        $user->name  = $request->name;
        $user->email = $request->email;
        $user->save();

        return response()->json([
            'message' => 'Cập nhật thông tin thành công',
            'user' => [
                'name' => $user->name,
                'email' => $user->email,
                'avatar_url' => $user->avatar
                    ? asset('storage/' . $user->avatar)
                    : null,
            ]
        ],200);
    }

    /* ================= CHANGE PASSWORD ================= */
    public function changePassword(Request $request)
    {
        $user = auth()->user();

        $request->validate([
            'current' => 'required',
            'new'     => 'required|min:6|confirmed',
        ]);

        if (!Hash::check($request->current, $user->password)) {
            return response()->json([
                'message' => 'Mật khẩu hiện tại không đúng',
            ], 422);
        }

        $user->password = Hash::make($request->new);
        $user->save();

        return response()->json([
            'message' => 'Đổi mật khẩu thành công',
        ],200);
    }
}
